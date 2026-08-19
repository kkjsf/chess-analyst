// Pass 2 of the Lichess puzzle mining pipeline: choisit, motif par motif, les
// exercices qui iront dans les catalogues (js/tactics.js et js/mates.js).
//
// Entrée  : le pool JSONL produit par tools/mine_lichess.cjs.
// Sortie  : un JSON { motifs: { <nom> : [puzzle, ...] }, mates: { <id> : [...] } }
//           où chaque puzzle est déjà au format du catalogue (fen, sol, hint,
//           real, game, lvl).
//
//   node tools/pick_lichess.cjs <pool.jsonl> <out.json>
//
// Trois filtres se cumulent :
//   1. le thème Lichess (fork, pin, backRankMate…) ou, pour les figures de mat
//      sans thème dédié (Lolli, Damiano, h7, g7, baiser), une reconnaissance
//      géométrique de la position finale ;
//   2. le motif doit être VISIBLE : Tactics.threats() doit retrouver la figure
//      (deux cibles pour une fourchette, une pièce derrière pour un clouage…) ;
//   3. la tactique doit RAPPORTER : gain matériel de la ligne + Tactics.netGain()
//      de la position finale >= 2 pions, ou mat. C'est ce test qui élimine les
//      fausses fourchettes, reprises au coup suivant.
//
// Le calcul des menaces coûte cher, donc il est paresseux : on trie les
// candidats par popularité et on n'évalue que jusqu'à remplir chaque tranche
// de difficulté.
const fs = require('fs');
const path = require('path');
const C = require('../js/chess.min.js');
const Chess = C.Chess || C;

global.document = { querySelector: () => null, createElement: () => ({ style: {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } } };
const Tactics = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'tactics.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'document', 'Chess', src + '\nmodule.exports = Tactics;')(mod, global.document, Chess);
  return mod.exports;
})();

const IN = process.argv[2];
const OUT = process.argv[3] || 'picked.json';
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const N_TACTIC = +(process.env.N_TACTIC || 4);
const N_MATE = +(process.env.N_MATE || 3);
const MAX_EVAL = +(process.env.MAX_EVAL || 60); // candidats évalués par tranche

// ───────────────────────── helpers plateau ─────────────────────────
const material = (fen, color) => {
  let m = 0;
  for (const ch of fen.split(' ')[0]) {
    const low = ch.toLowerCase();
    if (!VAL[low]) continue;
    if ((ch === ch.toUpperCase() ? 'w' : 'b') === color) m += VAL[low];
  }
  return m;
};
const pieceCount = (fen) => fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;

// Retourne le plateau pour que le camp qui mate soit toujours « les Blancs »
// (rangées inversées, couleurs échangées) : les figures se décrivent alors une
// seule fois. Les colonnes ne bougent pas : h7 est le miroir de h2.
function mirrorFen(fen) {
  const [board, turn] = fen.split(' ');
  const rows = board.split('/').reverse()
    .map(r => r.replace(/[a-zA-Z]/g, c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())));
  return rows.join('/') + ' ' + (turn === 'w' ? 'b' : 'w') + ' - - 0 1';
}

// Figures de mat reconnues à la géométrie de la position finale (celles que
// Lichess n'étiquette pas) : dame en h7/g7 soutenue par un fou ou un pion,
// dame collée au roi et défendue par son roi.
function mateShapes(finalFen, lastTo) {
  const black = finalFen.split(' ')[1] === 'w'; // le camp maté est aux Blancs => on retourne
  const fen = black ? mirrorFen(finalFen) : finalFen;
  const to = black ? lastTo[0] + (9 - +lastTo[1]) : lastTo;
  const b = Tactics.boardOf(fen);
  const get = (sq) => {
    const r = 8 - +sq[1], c = 'abcdefgh'.indexOf(sq[0]);
    return (r >= 0 && r < 8 && c >= 0 && c < 8) ? b[r][c] : null;
  };
  let king = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (p && p.t === 'k' && p.c === 'b') king = 'abcdefgh'[c] + (8 - r);
  }
  const mover = get(to);
  if (!king || !mover || mover.c !== 'w' || mover.t !== 'q') return [];
  const guards = Tactics.attackersOf(b, to, 'w');
  const guardedBy = (t) => guards.some(g => g.t === t);
  const has = (t, sq) => { const p = get(sq); return !!p && p.c === 'w' && p.t === t; };
  const out = [];
  if (to === 'h7' && (king === 'h8' || king === 'g8')) {
    if (has('p', 'g6')) out.push('damiano');
    else if (guardedBy('b')) out.push('h7');
  }
  if (to === 'g7' && (king === 'g8' || king === 'h8')) {
    if (has('p', 'f6')) out.push('lolli');
    else if (guardedBy('b')) out.push('g7');
  }
  if (guardedBy('k') && pieceCount(fen) <= 8) {
    const dr = Math.abs(+to[1] - +king[1]), dc = Math.abs('abcdefgh'.indexOf(to[0]) - 'abcdefgh'.indexOf(king[0]));
    if (dr <= 1 && dc <= 1) out.push('baiser');
  }
  return out;
}

// La pièce posée en `sq` est-elle clouée sur son roi par une de MES pièces
// longues ? Vrai si sq est aligné avec le roi adverse, que rien ne les sépare,
// et qu'en prolongeant la ligne de l'autre côté on tombe sur ma tour/fou/dame.
function pinnedAgainstKing(b, sq, byColor) {
  const foe = byColor === 'w' ? 'b' : 'w';
  const files = 'abcdefgh';
  const rc = (s) => ({ r: 8 - +s[1], c: files.indexOf(s[0]) });
  const get = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8) ? b[r][c] : undefined;
  let king = null;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c];
    if (p && p.t === 'k' && p.c === foe) king = { r, c };
  }
  const t = rc(sq);
  const target = get(t.r, t.c);
  if (!king || !target || target.c !== foe || target.t === 'k') return false;
  const dr = Math.sign(king.r - t.r), dc = Math.sign(king.c - t.c);
  const straight = (dr === 0 || dc === 0), diago = (Math.abs(king.r - t.r) === Math.abs(king.c - t.c));
  if (!straight && !diago) return false;
  if (dr === 0 && dc === 0) return false;
  // rien entre la cible et son roi
  for (let r = t.r + dr, c = t.c + dc; !(r === king.r && c === king.c); r += dr, c += dc) {
    if (get(r, c)) return false;
  }
  // de l'autre côté : ma pièce longue qui tient la ligne
  const want = straight ? ['r', 'q'] : ['b', 'q'];
  for (let r = t.r - dr, c = t.c - dc; r >= 0 && r < 8 && c >= 0 && c < 8; r -= dr, c -= dc) {
    const p = get(r, c);
    if (!p) continue;
    return p.c === byColor && want.indexOf(p.t) >= 0;
  }
  return false;
}

// ───────────────────────── ce qu'on cherche ─────────────────────────
const TAG = {
  fourchette: `une seule pièce attaque deux cibles à la fois`,
  clouage: `une pièce clouée ne peut pas fuir`,
  enfilade: `échec sur une ligne, et la pièce restée derrière tombe`,
  double: `deux menaces d'un coup, impossible de parer les deux`,
  decouverte: `une pièce s'écarte et démasque l'attaque de celle qui est derrière`,
  doubleEchec: `deux échecs simultanés : le roi doit bouger, rien d'autre`,
  deviation: `on force le défenseur à quitter son poste`,
  attraction: `on attire le roi sur une case piégée`,
  surcharge: `supprime la pièce qui garde tout, le reste s'écroule`,
  interference: `on coupe la ligne entre le défenseur et ce qu'il protège`,
  xray: `une pièce longue agit à travers une autre`,
  intermezzo: `avant de reprendre, intercale un coup encore plus fort`,
  degagement: `on libère la case (ou la ligne) dont une autre pièce a besoin`,
  tranquille: `ni échec ni capture, mais une menace imparable`,
  passe: `un pion qui file vers la promotion vaut une pièce`,
  zugzwang: `l'obligation de jouer dégrade la position`,
  cct: `échecs, captures, menaces : les coups forçants d'abord`,
  forcant: `une ligne d'échecs se calcule jusqu'au bout`,
};

// need(threats, ctx) : la figure est-elle vraiment visible sur le premier coup ?
const MOTIFS = [
  { name: 'Fourchette', themes: ['fork'], tag: TAG.fourchette,
    need: (t) => (t.checks.length + t.direct.length) >= 2 && t.mover.t === 'n' },
  { name: 'Attaque double', themes: ['fork'], tag: TAG.double,
    need: (t) => (t.checks.length + t.direct.length) >= 2 && t.mover.t !== 'n' },
  { name: 'Clouage', themes: ['pin'], tag: TAG.clouage,
    // soit le coup POSE le clouage (une pièce coincée devant une plus précieuse),
    // soit il PUNIT une pièce déjà clouée sur son roi, qui ne peut pas fuir.
    need: (t, x) => t.behind.some(b => b.front !== 'k')
      || pinnedAgainstKing(Tactics.boardOf(x.first.fenBefore), x.first.to, x.solver) },
  { name: 'Enfilade', themes: ['skewer'], tag: TAG.enfilade,
    need: (t) => t.behind.length > 0 },
  { name: 'Attaque à la découverte', themes: ['discoveredAttack'], tag: TAG.decouverte,
    need: (t) => t.discovered.length > 0 || t.checks.some(c => c.from !== t.mover.sq) },
  { name: 'Double échec', themes: ['doubleCheck'], tag: TAG.doubleEchec,
    need: (t) => t.checks.length >= 2 },
  { name: 'Déviation', themes: ['deflection'], tag: TAG.deviation, need: () => true },
  { name: 'Attraction', themes: ['attraction'], tag: TAG.attraction, need: () => true },
  { name: 'Surcharge', themes: ['capturingDefender'], tag: TAG.surcharge, need: () => true },
  { name: 'Interférence', themes: ['interference'], tag: TAG.interference,
    // la vraie interférence : un coup tranquille qui vient se planter SUR la
    // ligne d'un défenseur adverse et coupe la protection.
    need: (t, x) => !x.first.captured && cutsDefence(x) },
  { name: 'Rayon X', themes: ['xRayAttack'], tag: TAG.xray, need: () => true },
  { name: 'Coup intermédiaire', themes: ['intermezzo'], tag: TAG.intermezzo, need: () => true },
  { name: 'Dégagement', themes: ['clearance'], tag: TAG.degagement, need: () => true },
  { name: 'Coup tranquille', themes: ['quietMove'], tag: TAG.tranquille,
    need: (t, x) => !x.first.check && !x.first.captured },
  { name: 'Pion passé', themes: ['advancedPawn', 'promotion'], tag: TAG.passe, minPieces: 6,
    need: (t, x) => x.first.piece === 'p' },
  { name: 'Zugzwang', themes: ['zugzwang'], tag: TAG.zugzwang, minPieces: 4, need: () => true },
  // Entrées « méthode » : choisies sur la FORME de la ligne, pas sur un thème.
  { name: 'Méthode CCT (É-C-M)', themes: null, tag: TAG.cct, maxPly: 3, minPly: 3,
    need: (t, x) => x.first.check && x.solverMoves.every(m => m.check || m.captured) },
  { name: 'Coups forçants', themes: null, tag: TAG.forcant, maxPly: 5, minPly: 5,
    need: (t, x) => x.solverMoves.length >= 2 && x.solverMoves.every(m => m.check) },
];

const MATES = [
  { id: 'couloir', themes: ['backRankMate'], hint: `La dernière rangée est un couloir sans issue : les pions bloquent leur propre roi.` },
  { id: 'epaulette', themes: ['epauletteMate'], hint: `Le roi est emmuré par ses propres pièces de chaque côté. Plante la dame juste en face.` },
  { id: 'etouffe', themes: ['smotheredMate'], hint: `Le roi est étouffé par ses propres pièces : seul un saut de cavalier peut le mater.` },
  { id: 'arabe', themes: ['arabianMate'], hint: `Tour + cavalier dans le coin : le cavalier garde la case de fuite et protège la tour.` },
  { id: 'boden', themes: ['bodenMate'], hint: `Deux fous en diagonales croisées, et les pièces du roi bouchent le reste.` },
  { id: 'h7', shape: 'h7', hint: `La dame vient sur h7, protégée par le fou de cases claires : le roi est coincé dans le coin.` },
  { id: 'g7', shape: 'g7', hint: `La dame se pose en g7, soutenue par le fou de la grande diagonale.` },
  { id: 'lolli', shape: 'lolli', hint: `Le pion f6 tient la case g7 : amène la dame au contact du roi.` },
  { id: 'damiano', shape: 'damiano', hint: `Le pion g6 verrouille h7 : amène la dame sur la colonne h.` },
  { id: 'baiser', shape: 'baiser', hint: `Colle la dame au roi, protégée par ton propre roi : plus aucune case libre.` },
];

// Le coup coupe-t-il la ligne entre une pièce longue adverse et ce qu'elle
// protégeait ? On compare les défenseurs de chaque pièce adverse avant / après.
function cutsDefence(x) {
  const bB = Tactics.boardOf(x.first.fenBefore), bA = Tactics.boardOf(x.first.fenAfter);
  const foe = x.solver === 'w' ? 'b' : 'w';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = bA[r][c];
    if (!p || p.c !== foe) continue;
    const sq = 'abcdefgh'[c] + (8 - r);
    if (sq === x.first.to) continue;
    const was = Tactics.attackersOf(bB, sq, foe).filter(a => 'rbq'.indexOf(a.t) >= 0).map(a => a.sq);
    const now = Tactics.attackersOf(bA, sq, foe).map(a => a.sq);
    if (was.some(s2 => now.indexOf(s2) < 0)) return true;
  }
  return false;
}

// ───────────────────── description d'un coup en français ─────────────────────
const FR = { k: 'le roi', q: 'la dame', r: 'la tour', b: 'le fou', n: 'le cavalier', p: 'le pion' };
const FR_A = { k: 'au roi', q: 'à la dame', r: 'à la tour', b: 'au fou', n: 'au cavalier', p: 'au pion' };
const FR_DE = { k: 'de roi', q: 'de dame', r: 'de tour', b: 'de fou', n: 'de cavalier', p: 'de pion' };

function describeMove(first, t) {
  let head;
  if (first.check) head = `Un échec ${FR_DE[first.piece]}`;
  else if (first.captured) head = `Une capture ${FR_A[first.piece]}`;
  else head = `Un coup ${FR_DE[first.piece]}, sans échec ni capture`;
  const aims = [];
  for (const x of t.direct.concat(t.discovered)) if (x.t !== 'k') aims.push(FR[x.t]);
  for (const b of t.behind) if (b.t !== 'k') aims.push(FR[b.t]);
  const uniq = [...new Set(aims)].slice(0, 2);
  if (uniq.length) head += `, qui met ${uniq.join(' et ')} dans le collimateur`;
  return head + '.';
}
const level = (r) => (r < 1000 ? 'facile' : r < 1350 ? 'moyenne' : 'soutenue');

// ─────────────────── une ligne du pool -> un exercice jouable ───────────────────
// Partie bon marché : la position de départ, la ligne en SAN, le détail de
// chaque coup du solveur. Pas de calcul de menaces ici.
function prepareCheap(row) {
  let g;
  try { g = new Chess(row.fen); } catch (_) { return null; }
  const open = row.moves[0];
  if (!g.move({ from: open.slice(0, 2), to: open.slice(2, 4), promotion: open[4] || undefined })) return null;
  const fen = g.fen();
  const solver = g.turn();
  const sol = [], solverMoves = [];
  for (let i = 1; i < row.moves.length; i++) {
    const u = row.moves[i];
    const fenBefore = g.fen();
    const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
    if (!m) return null;
    sol.push(m.san);
    if ((i - 1) % 2 === 0) {
      solverMoves.push({ piece: m.piece, captured: m.captured || null, check: /[+#]/.test(m.san), from: m.from, to: m.to, fenBefore, fenAfter: g.fen() });
    }
  }
  if (!solverMoves.length) return null;
  return {
    row, fen, sol, solver, solverMoves, first: solverMoves[0],
    finalFen: g.fen(), mate: g.in_checkmate(), pieces: pieceCount(fen),
  };
}
// Partie chère : les menaces du premier coup et le gain réel de la ligne.
function enrich(c) {
  if (c.t) return c;
  c.t = Tactics.threats(c.first.fenBefore, c.first.fenAfter, { from: c.first.from, to: c.first.to });
  const foe = c.solver === 'w' ? 'b' : 'w';
  const swing = (material(c.finalFen, c.solver) - material(c.finalFen, foe))
    - (material(c.fen, c.solver) - material(c.fen, foe));
  c.net = c.mate ? 1000 : swing + Tactics.netGain(c.finalFen);
  return c;
}

function emit(c, hint) {
  return {
    fen: c.fen, sol: c.sol,
    real: `Lichess · niveau ${c.row.rating}`,
    game: c.row.url.replace(/#.*$/, ''),
    lvl: level(c.row.rating),
    hint,
  };
}

// ───────────────────────── sélection ─────────────────────────
const BANDS = [[0, 1000], [1000, 1200], [1200, 1400], [1400, 9999]];

const rows = fs.readFileSync(IN, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const byTheme = new Map();
for (const r of rows) for (const t of r.themes) {
  if (!byTheme.has(t)) byTheme.set(t, []);
  byTheme.get(t).push(r);
}
console.log(`${rows.length} lignes dans le pool`);

const result = { motifs: {}, mates: {} };
// Un même puzzle Lichess peut porter plusieurs thèmes : on ne le sert qu'une
// fois, au motif le plus spécifique (les entrées « méthode » passent en dernier).
const used = new Set();

for (const m of MOTIFS) {
  const minPieces = m.minPieces || 12;
  const maxPly = m.maxPly || 3;
  let pool = m.themes ? [...new Set(m.themes.flatMap(t => byTheme.get(t) || []))] : rows.slice();
  pool = pool.filter(r => r.moves.length - 1 <= maxPly && r.moves.length - 1 >= (m.minPly || 1));
  pool.sort((a, b) => b.plays - a.plays);
  const chosen = [], seen = new Set();
  let tried = 0, rejectedNet = 0, rejectedNeed = 0;
  const consider = (row) => {
    if (used.has(row.id)) return false;
    const c = prepareCheap(row);
    if (!c || c.pieces < minPieces || (c.mate && !m.themes)) return false;
    if (c.mate) return false; // les mats ont leur propre cours
    tried++;
    enrich(c);
    if (!c.t) return false;
    if (c.net < 2) { rejectedNet++; return false; }
    if (!m.need(c.t, c)) { rejectedNeed++; return false; }
    const key = c.first.piece + c.first.to + c.sol[0];
    if (seen.has(key)) return false;
    seen.add(key);
    used.add(row.id);
    chosen.push(c);
    return true;
  };
  for (const [lo, hi] of BANDS) {
    if (chosen.length >= N_TACTIC) break;
    let n = 0;
    for (const row of pool) {
      if (row.rating < lo || row.rating >= hi) continue;
      if (n++ > MAX_EVAL) break;
      if (consider(row)) break;
    }
  }
  for (const row of pool) {
    if (chosen.length >= N_TACTIC) break;
    consider(row);
  }
  chosen.sort((a, b) => a.row.rating - b.row.rating);
  result.motifs[m.name] = chosen.map(c => emit(c, describeMove(c.first, c.t) + ` Le motif : ${m.tag}.`));
  console.log(`  ${m.name}: ${chosen.length}/${N_TACTIC} retenus sur ${tried} testés (gain KO ${rejectedNet}, motif KO ${rejectedNeed})  [${chosen.map(c => c.row.rating).join(', ')}]`);
}

// Les mats : pas de calcul de gain (le mat EST le gain), donc on peut préparer
// large et reconnaître la figure sur la position finale.
const mateRows = rows.filter(r => r.themes.includes('mate') || r.themes.some(t => /Mate$/.test(t)));
const preparedMates = [];
for (const r of mateRows) {
  if (r.moves.length - 1 > 5) continue;
  const c = prepareCheap(r);
  if (c && c.mate) preparedMates.push(c);
}
console.log(`${preparedMates.length} mats exploitables`);

for (const f of MATES) {
  const cands = preparedMates.filter(c => {
    if (c.pieces < (f.shape === 'baiser' ? 4 : 10)) return false;
    if (f.themes) return f.themes.some(t => c.row.themes.includes(t));
    const last = c.solverMoves[c.solverMoves.length - 1];
    return mateShapes(c.finalFen, last.to).includes(f.shape);
  });
  const chosen = [], seen = new Set();
  const take = (c) => {
    const key = c.sol[0] + c.sol.length;
    if (seen.has(key) || used.has(c.row.id)) return false;
    seen.add(key); used.add(c.row.id); chosen.push(c); return true;
  };
  for (const [lo, hi] of BANDS) {
    if (chosen.length >= N_MATE) break;
    const inBand = cands.filter(c => c.row.rating >= lo && c.row.rating < hi).sort((a, b) => b.row.plays - a.row.plays);
    for (const c of inBand) if (take(c)) break;
  }
  for (const c of cands.slice().sort((a, b) => b.row.plays - a.row.plays)) {
    if (chosen.length >= N_MATE) break;
    take(c);
  }
  chosen.sort((a, b) => a.row.rating - b.row.rating);
  result.mates[f.id] = chosen.map(c => emit(c, f.hint));
  console.log(`  mat ${f.id}: ${cands.length} candidats -> ${chosen.length} retenus  [${chosen.map(c => c.row.rating).join(', ')}]`);
}

fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
const total = Object.values(result.motifs).concat(Object.values(result.mates)).reduce((a, v) => a + v.length, 0);
console.log(`\n${total} exercices écrits dans ${OUT}`);
