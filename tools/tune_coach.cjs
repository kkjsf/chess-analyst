// Reglage de l'echelle du coach SANS relancer Stockfish a chaque essai.
//   node tools/tune_coach.cjs build [n]   -> tools/.coach_tune.json (lent, une fois)
//   node tools/tune_coach.cjs             -> stats attendues de chaque barreau de LADDER
// Pour chaque position tiree de ses parties rapides, on stocke : la perte de SON
// coup, les 5 lignes que voit le coach (recherche courte) avec la perte REELLE de
// chacune (depth 12), et la perte moyenne d'un coup legal tire au hasard.
// Les statistiques d'un reglage se calculent alors en esperance, exactement.
const fs = require('fs');
const path = require('path');
const C = require('../js/chess.min.js');
const Chess = C.Chess || C;
const CG = require('../js/coachgame.js');
const CACHE = path.join(__dirname, '.coach_tune.json');

let send = null;
const listeners = [];
function boot() {
  if (send) return;
  global.postMessage = (l) => { const s = String(l); for (const f of listeners.slice()) f(s); };
  require(path.join(__dirname, '..', 'js', 'vendor', 'stockfish.js'));
  send = (c) => global.onmessage({ data: c });
  send('uci');
  send('setoption name Hash value 32');
}
function search(fen, go, multipv = 1) {
  boot();
  return new Promise((resolve) => {
    const lines = new Map();
    const fn = (l) => {
      const m = /^info depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+).*? pv (\S+)/.exec(l);
      if (m) lines.set(+m[2], { move: m[5], score: m[3] === 'mate' ? (+m[4] > 0 ? 30000 - +m[4] : -30000 - +m[4]) : +m[4], mate: m[3] === 'mate' ? +m[4] : null });
      if (l.startsWith('bestmove')) {
        listeners.splice(listeners.indexOf(fn), 1);
        resolve([...lines.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]));
      }
    };
    listeners.push(fn);
    send('setoption name MultiPV value ' + multipv);
    send('position fen ' + fen);
    send('go ' + go);
  });
}
const clamp = (x) => Math.max(-1000, Math.min(1000, x));
async function lossOf(fen, uci, best) {
  const g = new Chess(fen);
  const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  if (!mv) return null;
  const after = g.in_checkmate() ? 30000 : g.game_over() ? 0 : -((await search(g.fen(), 'depth 12'))[0]?.score ?? 0);
  return Math.max(0, clamp(best) - clamp(after));
}

function samplePositions(n) {
  const d = require('../coach-data.json');
  const out = [];
  for (const gm of d.games.filter(x => x.timeClass === 'rapid')) {
    const g = new Chess();
    g.load_pgn(gm.pgn);
    const r = new Chess();
    g.history({ verbose: true }).forEach((m, i) => {
      const meToMove = (i % 2 === 0) === (gm.userColor === 'w');
      if (meToMove && i >= 8 && i % 4 === (gm.uuid.charCodeAt(1) % 4))
        out.push({ fen: r.fen(), uci: m.from + m.to + (m.promotion || '') });
      r.move(m);
    });
  }
  const step = Math.max(1, Math.floor(out.length / n));
  return out.filter((_, i) => i % step === 0).slice(0, n);
}

async function build(n) {
  const rows = [];
  for (const [i, p] of samplePositions(n).entries()) {
    const ref = await search(p.fen, 'depth 12', 2);
    const best = ref[0]?.score ?? 0;
    const chance = ref.length > 1 && ref[0].score - ref[1].score >= 200 && ref[0].score > -200;
    const user = await lossOf(p.fen, p.uci, best);
    // Ce que voit le coach : une recherche courte. Le build asm.js de Node est ~8x plus
    // lent que le WASM du navigateur, d'ou 300 ms ici pour ~40 ms en jeu.
    const seen = (await search(p.fen, 'movetime 300', 5)).filter(l => l.move);
    for (const l of seen) l.loss = await lossOf(p.fen, l.move, best);
    const g = new Chess(p.fen);
    const ms = g.moves({ verbose: true }).sort(() => Math.random() - 0.5).slice(0, 4);
    const rl = [];
    for (const m of ms) rl.push(await lossOf(p.fen, m.from + m.to + (m.promotion || ''), best));
    rows.push({ fen: p.fen, inCheck: g.in_check(), chance, user, seen, rand: rl.reduce((s, x) => s + x, 0) / rl.length, randBl: rl.filter(x => x >= 300).length / rl.length });
    if ((i + 1) % 10 === 0) process.stderr.write(`${i + 1}\n`);
  }
  fs.writeFileSync(CACHE, JSON.stringify(rows));
}

// Distribution du coup choisi par le coach sur une position, en esperance.
function dist(row, prm) {
  const lines = row.seen;
  if (!lines.length) return { rand: 1, w: [] };
  const w = CG.choiceWeights(lines, prm);
  const pr = row.inCheck ? 0 : prm.blunder;
  return { rand: pr, w: w.map(x => x * (1 - pr)) };
}
function evalPrm(rows, prm) {
  let acpl = 0, bl = 0, mi = 0, n = 0, ch = 0, take = 0;
  for (const r of rows) {
    if (r.user == null) continue;
    const d = dist(r, prm);
    let el = d.rand * r.rand, eb = d.rand * r.randBl, em = 0, et = 0;
    d.w.forEach((p, i) => {
      const L = r.seen[i].loss ?? 0;
      el += p * L; if (L >= 300) eb += p; else if (L >= 100) em += p;
      if (L < 100) et += p;
    });
    acpl += el; bl += eb; mi += em; n++;
    if (r.chance) { ch++; take += et; }
  }
  return { acpl: acpl / n, bl: 100 * bl / n, mi: 100 * mi / n, take: 100 * take / ch, ch };
}
function userStats(rows) {
  const R = rows.filter(r => r.user != null), C2 = R.filter(r => r.chance);
  return { acpl: R.reduce((s, r) => s + r.user, 0) / R.length, bl: 100 * R.filter(r => r.user >= 300).length / R.length,
    mi: 100 * R.filter(r => r.user >= 100 && r.user < 300).length / R.length, take: 100 * C2.filter(r => r.user < 100).length / C2.length, ch: C2.length };
}
const fmt = (s) => `acpl ${s.acpl.toFixed(0).padStart(4)}  gaffes ${s.bl.toFixed(1).padStart(5)} %  fautes ${s.mi.toFixed(1).padStart(5)} %  piece ramassee ${s.take.toFixed(0).padStart(3)} % (sur ${s.ch})`;

// Cibles par barreau. Le barreau ~350 = LUI, mesure par `userStats` ; les autres
// sont des ordres de grandeur (moins de gaffes, plus de pieces ramassees quand
// l'Elo monte), a reajuster si on dispose un jour de parties d'autres niveaux.
const TARGETS = [
  { elo: 250, acpl: 155, bl: 21, take: 45 },
  { elo: 400, acpl: 128, bl: 16, take: 55 },
  { elo: 600, acpl: 108, bl: 11, take: 65 },
  { elo: 760, acpl: 95, bl: 8, take: 70 },
  { elo: 900, acpl: 82, bl: 6, take: 74 },
  { elo: 1200, acpl: 62, bl: 3, take: 77 },
  { elo: 1400, acpl: 48, bl: 1.5, take: 79 },
];
function fit(rows) {
  for (const t of TARGETS) {
    let best = null;
    for (let temp = 10; temp <= 800; temp += 10) {
      for (let b = 0; b <= 0.4001; b += 0.005) {
        const s = evalPrm(rows, { temp, blunder: b });
        const err = ((s.acpl - t.acpl) / 15) ** 2 + ((s.bl - t.bl) / 2) ** 2 + ((s.take - t.take) / 15) ** 2;
        if (!best || err < best.err) best = { err, temp, b: +b.toFixed(3), s };
      }
    }
    console.log(`~${t.elo}`.padEnd(6) + `temp ${String(best.temp).padStart(3)}  blunder ${best.b.toFixed(3)}   -> ` + fmt(best.s));
  }
}

(async () => {
  if (process.argv[2] === 'build') { await build(+process.argv[3] || 200); }
  if (process.argv[2] === 'fit') { fit(JSON.parse(fs.readFileSync(CACHE, 'utf8'))); process.exit(0); }
  const rows = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  console.log(`${rows.length} positions`);
  console.log('toi (reel)    ' + fmt(userStats(rows)));
  for (const e of [250, 350, 400, 500, 600, 760, 900, 1200, 1400]) console.log(('coach ~' + e).padEnd(14) + fmt(evalPrm(rows, CG.paramsFor(e))));
  process.exit(0);
})();
