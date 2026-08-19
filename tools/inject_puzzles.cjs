// Reconstruit les listes d'exercices des deux catalogues (js/tactics.js et
// js/mates.js) à partir de trois sources :
//   - les figures pures existantes (`demo: true`) : la géométrie du motif ;
//   - les positions tirées des parties de Simon (`mine:`), gardées seulement si
//     elles passent le test de gain (une « fourchette » reprise au coup suivant
//     n'en est pas une) ;
//   - les nouvelles positions Lichess choisies par tools/pick_lichess.cjs.
// Les exercices « habillés » (`ctx:`, schéma épuré + décor artificiel) sont
// supprimés : les vraies parties les remplacent.
//
//   node tools/inject_puzzles.cjs <picked.json>          # écrit les catalogues
//   node tools/inject_puzzles.cjs <picked.json> --dry    # audit seul
const fs = require('fs');
const path = require('path');
const C = require('../js/chess.min.js');
const Chess = C.Chess || C;

const ROOT = path.join(__dirname, '..');
global.document = { querySelector: () => null, createElement: () => ({ style: {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } } };
const load = (rel, name) => {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const mod = { exports: {} };
  new Function('module', 'document', 'Chess', src + `\nmodule.exports = ${name};`)(mod, global.document, Chess);
  return mod.exports;
};
const Tactics = load('js/tactics.js', 'Tactics');
const Mates = load('js/mates.js', 'Mates');

const PICKED = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const DRY = process.argv.includes('--dry');
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const material = (fen, color) => {
  let m = 0;
  for (const ch of fen.split(' ')[0]) {
    const low = ch.toLowerCase();
    if (VAL[low] && (ch === ch.toUpperCase() ? 'w' : 'b') === color) m += VAL[low];
  }
  return m;
};

// Gain réel d'un exercice : matériel encaissé par la ligne + ce qui reste à
// prendre après la meilleure défense adverse. 1000 = mat.
function audit(p) {
  let g;
  try { g = new Chess(p.fen); } catch (_) { return { ok: false, why: 'FEN illisible' }; }
  const solver = g.turn(), foe = solver === 'w' ? 'b' : 'w';
  const start = material(p.fen, solver) - material(p.fen, foe);
  for (const san of p.sol) {
    if (!playSan(g, san)) return { ok: false, why: `coup illégal ${san}` };
  }
  const mate = g.in_checkmate();
  const end = material(g.fen(), solver) - material(g.fen(), foe);
  const net = mate ? 1000 : (end - start) + Tactics.netGain(g.fen());
  return { ok: true, net, mate };
}

// chess.js « sloppy » lit « bxc3 » comme un coup de fou : on résout d'abord le
// SAN sur la liste exacte des coups légaux.
function playSan(g, san) {
  const exact = g.moves({ verbose: true }).filter(m => m.san === san)[0];
  if (exact) return g.move({ from: exact.from, to: exact.to, promotion: exact.promotion });
  try { return g.move(san, { sloppy: true }); } catch (_) { return null; }
}

const kind = (p) => (p.demo ? 'demo' : p.mine ? 'mine' : p.ctx ? 'ctx' : p.real ? 'real' : 'nu');

// ───────────────────────── audit de l'existant ─────────────────────────
const drop = new Set();
const netOf = new Map(); // clé exercice -> gain mesuré
console.log('════════ audit des exercices existants ════════');
for (const c of Tactics.CATALOG) {
  for (const p of (c.puzzles || [])) {
    const a = audit(p);
    const tag = `${c.name} · ${p.sol.join(' ')} (${kind(p)})`;
    if (!a.ok) { console.log(`  SUPPR ${tag} : ${a.why}`); drop.add(p.fen + p.sol.join()); continue; }
    if (p.ctx) { console.log(`  SUPPR ${tag} : décor artificiel, remplacé par de vraies parties`); drop.add(p.fen + p.sol.join()); continue; }
    // Les positions Lichess sont régénérées à chaque passe : on les retire pour
    // que le script reste rejouable sans dupliquer.
    if (/lichess\.org/.test(p.game || '')) { drop.add(p.fen + p.sol.join()); continue; }
    if (a.net < 2 && !a.mate) { console.log(`  SUPPR ${tag} : ne gagne rien (net ${a.net})`); drop.add(p.fen + p.sol.join()); continue; }
    netOf.set(p.fen + p.sol.join(), a.net);
    console.log(`  garde ${tag} : net ${a.net === 1000 ? 'mat' : '+' + a.net}`);
  }
}
for (const m of Mates.MATES) {
  for (const p of (m.puzzles || [])) {
    const a = audit(p);
    const tag = `mat ${m.id} · ${p.sol.join(' ')} (${kind(p)})`;
    if (!a.ok) { console.log(`  SUPPR ${tag} : ${a.why}`); drop.add(p.fen + p.sol.join()); continue; }
    if (!a.mate) { console.log(`  SUPPR ${tag} : la ligne ne mate pas`); drop.add(p.fen + p.sol.join()); continue; }
    if (/lichess\.org/.test(p.game || '')) { drop.add(p.fen + p.sol.join()); continue; }
    if (p.ctx) { console.log(`  SUPPR ${tag} : décor artificiel, remplacé par de vraies parties`); drop.add(p.fen + p.sol.join()); continue; }
    console.log(`  garde ${tag}`);
  }
}

// ───────────────────────── génération du code ─────────────────────────
const q = (s) => `'${String(s).replace(/'/g, "\\'")}'`;
function literal(p, indent) {
  const parts = [`fen: ${q(p.fen)}`, `sol: [${p.sol.map(q).join(', ')}]`];
  if (p.demo) parts.push('demo: true');
  if (p.trap) parts.push('trap: true');
  if (p.positional) parts.push('positional: true');
  if (p.mine) parts.push('mine: `' + p.mine + '`');
  if (p.real) parts.push('real: `' + p.real + '`');
  if (p.game) parts.push(`game: ${q(p.game)}`);
  if (p.lvl) parts.push(`lvl: ${q(p.lvl)}`);
  if (p.ctx) parts.push('ctx: `' + p.ctx + '`');
  parts.push('hint: `' + p.hint + '`');
  return `${indent}{ ${parts.join(', ')} },`;
}

// Trouve la fin de la valeur tableau qui commence à `open` (index du '[').
function matchBracket(src, open) {
  let depth = 0, i = open, str = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (str) {
      if (ch === '\\') { i++; continue; }
      if (ch === str) str = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (!depth) return i; }
  }
  throw new Error('crochet non fermé');
}

// Réécrit (ou crée) le tableau `puzzles` de l'entrée repérée par `anchor`.
function rewrite(src, anchor, nextRe, puzzles) {
  const start = src.indexOf(anchor);
  if (start < 0) throw new Error('entrée introuvable : ' + anchor);
  nextRe.lastIndex = start + anchor.length;
  const m = nextRe.exec(src);
  const end = m ? m.index : src.length;
  const win = src.slice(start, end);
  const body = puzzles.map(p => literal(p, '        ')).join('\n');
  const pi = win.indexOf('puzzles: [');
  if (pi >= 0) {
    const open = start + pi + 'puzzles: '.length;
    const close = matchBracket(src, open);
    return src.slice(0, open) + '[\n' + body + '\n      ]' + src.slice(close + 1);
  }
  // pas encore d'exercices : on les ajoute après le tableau de flèches
  const ai = win.indexOf('arrows: [');
  if (ai < 0) throw new Error('ni puzzles ni arrows dans ' + anchor);
  const open = start + ai + 'arrows: '.length;
  const close = matchBracket(src, open);
  return src.slice(0, close + 1) + ',\n      puzzles: [\n' + body + '\n      ]' + src.slice(close + 1);
}

console.log('\n════════ nouvelles listes ════════');
let tacSrc = fs.readFileSync(path.join(ROOT, 'js/tactics.js'), 'utf8');
let nTac = 0;
for (const c of Tactics.CATALOG) {
  const fresh = PICKED.motifs[c.name] || [];
  const kept = (c.puzzles || []).filter(p => !drop.has(p.fen + p.sol.join()));
  if (!fresh.length && !kept.length) continue;
  // Deux positions de ses parties suffisent par motif, et jamais deux fois le
  // même coup dans la même partie (le minage de v183 en avait produit).
  const seen = new Set();
  const own = kept.filter(p => p.mine)
    .filter(p => { const k = (p.game || '') + p.sol[0]; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (netOf.get(b.fen + b.sol.join()) || 0) - (netOf.get(a.fen + a.sol.join()) || 0))
    .slice(0, 2);
  // figure pure d'abord, puis les vraies parties (facile -> soutenue), puis les siennes
  const list = [
    ...kept.filter(p => p.demo),
    ...kept.filter(p => !p.demo && !p.mine),
    ...fresh,
    ...own,
  ];
  tacSrc = rewrite(tacSrc, `name: '${c.name}'`, /\n    \{ cat:|\n  \];/g, list);
  nTac += list.length;
  console.log(`  ${c.name}: ${list.length} exercices (${kept.length} gardés + ${fresh.length} Lichess)`);
}

let mateSrc = fs.readFileSync(path.join(ROOT, 'js/mates.js'), 'utf8');
let nMate = 0;
for (const m of Mates.MATES) {
  const fresh = PICKED.mates[m.id] || [];
  const kept = (m.puzzles || []).filter(p => !drop.has(p.fen + p.sol.join()));
  const list = [...kept, ...fresh];
  if (!list.length) continue;
  mateSrc = rewrite(mateSrc, `id: '${m.id}'`, /\n    \{ id:|\n  \];/g, list);
  nMate += list.length;
  console.log(`  mat ${m.id}: ${list.length} exercices (${kept.length} gardés + ${fresh.length} Lichess)`);
}

if (DRY) { console.log('\n(dry run, rien écrit)'); process.exit(0); }
fs.writeFileSync(path.join(ROOT, 'js/tactics.js'), tacSrc);
fs.writeFileSync(path.join(ROOT, 'js/mates.js'), mateSrc);
console.log(`\nécrit : ${nTac} exercices de tactique, ${nMate} exercices de mat`);
