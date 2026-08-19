// Offline verifier for the two lesson catalogs (js/tactics.js + js/mates.js).
//
// For every entry it checks the main illustration, and for every exercise it
// checks with chess.js that the line is legal, then with Stockfish that the move
// the learner must find really is THE move (best, and clearly ahead of the
// runner-up) and that the scripted reply is a sane defence.
//
//   node tools/verify_lessons.cjs            # everything
//   node tools/verify_lessons.cjs mates      # one catalog
//   node tools/verify_lessons.cjs tactics Fourchette Clouage
//
const fs = require('fs');
const path = require('path');
const C = require('../js/chess.min.js');
const Chess = C.Chess || C;
const { analyse, scoreOf } = require('./sf.cjs');

const ROOT = path.join(__dirname, '..');
global.document = { querySelector: () => null, createElement: () => ({ style: {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } } };
const Mates = require('../js/mates.js');
const Tactics = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'tactics.js'), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'document', 'Chess', src + '\nmodule.exports = Tactics;')(mod, global.document, Chess);
  return mod.exports;
})();

const DEPTH = +(process.env.DEPTH || 16);
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// material balance from the point of view of the side to move
function material(fen) {
  const g = new Chess(fen);
  let w = 0, b = 0;
  for (const row of g.board()) for (const sq of row) if (sq) (sq.color === 'w' ? w += VAL[sq.type] : b += VAL[sq.type]);
  return g.turn() === 'w' ? w - b : b - w;
}
// chess.js « sloppy » lit « bxc3 » comme un coup de fou : on résout d'abord le
// SAN sur la liste exacte des coups légaux.
function playSan(g, san) {
  const exact = g.moves({ verbose: true }).filter(m => m.san === san)[0];
  if (exact) return g.move({ from: exact.from, to: exact.to, promotion: exact.promotion });
  try { return g.move(san, { sloppy: true }); } catch (_) { return null; }
}

const args = process.argv.slice(2);
const only = args.filter(a => !['mates', 'tactics'].includes(a));
const wants = (k) => !args.includes('mates') && !args.includes('tactics') ? true : args.includes(k);
const picked = (name) => !only.length || only.some(o => name.toLowerCase().includes(o.toLowerCase()));

let fail = 0, warn = 0, checked = 0;
const log = (s) => process.stdout.write(s + '\n');

// ─── illustration ───
function checkDiagram(label, fen, arrows, mustBeMate) {
  const board = (fen || '').trim().split(' ')[0];
  if (!board) { log(`FAIL ${label} · pas d'illustration principale`); fail++; return; }
  const rows = board.split('/');
  if (rows.length !== 8) { log(`FAIL ${label} · FEN à ${rows.length} rangées`); fail++; return; }
  const hasFields = fen.trim().split(' ').length > 1;
  let g = null;
  for (const turn of (mustBeMate ? [mustBeMate] : ['w', 'b'])) {
    const full = hasFields ? fen.trim() : board + ' ' + turn + ' - - 0 1';
    try {
      const t = new Chess(full);
      if (t.fen().split(' ')[0] === board) { g = t; break; }
    } catch (_) {}
  }
  if (!g) { log(`FAIL ${label} · FEN refusée par chess.js`); fail++; return; }
  if (mustBeMate && !g.in_checkmate()) {
    log(`FAIL ${label} · le diagramme n'est pas un mat (fuites : ${g.moves().join(' ')})`); fail++; return;
  }
  for (const a of (arrows || [])) {
    for (const sq of [a.from, a.to]) {
      if (!/^[a-h][1-8]$/.test(sq)) { log(`FAIL ${label} · flèche vers "${sq}"`); fail++; }
    }
    if (a.from !== a.to && !g.get(a.from)) { log(`WARN ${label} · flèche depuis ${a.from}, case vide`); warn++; }
  }
}

// ─── one exercise ───
async function checkPuzzle(label, p, opts) {
  checked++;
  const { mustMate } = opts;
  let g;
  try { g = new Chess(p.fen); } catch (e) { log(`FAIL ${label} · FEN illisible`); fail++; return; }
  if (g.fen().split(' ')[0] !== p.fen.split(' ')[0]) { log(`FAIL ${label} · FEN refusée`); fail++; return; }
  if (g.in_check() && g.turn() === p.fen.split(' ')[1]) { /* ok: solver may be in check */ }
  if (!p.hint) { log(`WARN ${label} · pas d'indice`); warn++; }

  const notes = [];
  const startTurn = g.turn();
  const bal0 = material(p.fen);
  for (let i = 0; i < p.sol.length; i++) {
    const fen = g.fen();
    const san = p.sol[i];
    let m;
    m = playSan(g, san);
    if (!m) { log(`FAIL ${label} · coup illégal « ${san} » (ply ${i}) — position ${fen}`); fail++; return; }
    const uci = m.from + m.to + (m.promotion || '');
    const lines = await analyse(fen, { depth: DEPTH, multipv: 3 });
    const top = lines[0];
    const mine = lines.find(l => l.move === uci);
    if (i % 2 === 0) {
      // the move the learner has to find
      if (!top) { log(`WARN ${label} · moteur muet (ply ${i})`); warn++; continue; }
      if (p.demo) { notes.push(`ply${i} démo (${scoreOf(top)})`); continue; }
      if (top.move !== uci) {
        const better = scoreOf(top) - (mine ? scoreOf(mine) : -99);
        // Deux mats ne se départagent pas : sur un schéma où tout mate, « le
        // moteur mate un demi-coup plus vite » n'est pas une erreur de contenu.
        const bothMate = mine && scoreOf(top) > 900 && scoreOf(mine) > 900;
        if (!bothMate && (!mine || better > 0.3)) {
          log(`FAIL ${label} · ply ${i}: le moteur préfère ${top.move} (${scoreOf(top)}) à ${san} (${mine ? scoreOf(mine) : '?'}) — ${fen}`);
          fail++; return;
        }
        notes.push(`ply${i} ex aequo avec ${top.move}${bothMate ? ' (les deux matent)' : ''}`);
      }
      const second = lines[1];
      if (second && top.mate === null) {
        const gap = scoreOf(top) - scoreOf(second);
        if (gap < 1.2) { notes.push(`ply${i} ambigu (2e coup ${second.move} à ${gap.toFixed(2)})`); warn++; }
      }
      if (i === 0 && mustMate && top.mate === null && !p.trap) {
        log(`FAIL ${label} · ply 0 ne mène pas au mat (score ${scoreOf(top)}) — ${fen}`); fail++; return;
      }
    } else {
      // the reply the app plays automatically: must be a top defence
      if (top && top.move !== uci && !p.trap && !p.demo) {
        const gap = scoreOf(top) - (mine ? scoreOf(mine) : -99);
        if (gap > 0.6) { notes.push(`réponse ply${i} ${san} au lieu de ${top.move} (${gap.toFixed(2)})`); warn++; }
      }
    }
  }
  // final position
  if (mustMate) {
    if (!g.in_checkmate()) { log(`FAIL ${label} · la ligne ne finit pas par un mat`); fail++; return; }
    if (!/#$/.test(p.sol[p.sol.length - 1])) { log(`FAIL ${label} · dernier coup non noté #`); fail++; return; }
  } else if (p.demo) {
    notes.push('démo de schéma');
  } else {
    const end = await analyse(g.fen(), { depth: DEPTH, multipv: 1 });
    const s = end[0] ? -scoreOf(end[0]) : 0; // from the solver's point of view
    const swing = material(g.fen()) * (g.turn() === startTurn ? 1 : -1) - bal0;
    // Le matériel encaissé ne suffit pas : il faut que le gain TIENNE une fois
    // que l'adversaire a joué sa meilleure défense (reprise comprise). Une
    // fourchette reprise au coup suivant tombe ici, et c'est le but.
    const settled = swing + Tactics.netGain(g.fen());
    const need = p.positional ? 1 : 2;
    if (settled < need) {
      log(`FAIL ${label} · la tactique ne rapporte rien (matériel ${swing.toFixed(1)}, après défense ${settled.toFixed(1)}, éval ${s.toFixed(1)}) — ${g.fen()}`); fail++; return;
    }
    if (s < 0.5 && !p.positional) { notes.push(`moteur peu convaincu (éval ${s.toFixed(1)})`); warn++; }
    notes.push(`gain ${settled > 0 ? '+' : ''}${settled.toFixed(1)} (brut ${swing.toFixed(1)}) / éval ${s.toFixed(1)}`);
  }
  log(`OK   ${label}${notes.length ? '  [' + notes.join(' ; ') + ']' : ''}`);
}

(async () => {
  if (wants('mates')) {
    log('════════ MATS ════════');
    for (const m of Mates.MATES) {
      if (!picked(m.name + ' ' + m.id)) continue;
      const mated = m.fen && m.fen.split(' ').length > 1 ? m.fen.split(' ')[1] : 'b';
      checkDiagram(`[mat ${m.id}] illustration`, m.fen, m.arrows, mated);
      for (let i = 0; i < (m.puzzles || []).length; i++) {
        await checkPuzzle(`[mat ${m.id}] ex${i + 1}`, m.puzzles[i], { mustMate: true });
      }
    }
  }
  if (wants('tactics')) {
    log('════════ TACTIQUES ════════');
    for (const c of Tactics.CATALOG) {
      if (!picked(c.name + ' ' + (c.en || ''))) continue;
      checkDiagram(`[tac ${c.name}] illustration`, c.fen, c.arrows, null);
      for (let i = 0; i < (c.puzzles || []).length; i++) {
        const p = c.puzzles[i];
        const mustMate = /#$/.test(p.sol[p.sol.length - 1]);
        await checkPuzzle(`[tac ${c.name}] ex${i + 1}`, p, { mustMate });
      }
    }
  }
  log(`\n${checked} exercices vérifiés — ${fail} FAIL, ${warn} WARN`);
  process.exit(fail ? 1 : 0);
})();
