// Calibration du mode Coach : compare la qualite des coups du coach a celle des
// vrais coups du user (~350 rapide) sur LES MEMES positions, tirees de ses parties.
// Usage : node tools/calibrate_coach.cjs [nPositions] [elo,elo,...]
// Mesures par coup (perte vue par le camp au trait, eval de reference depth 12) :
//   acpl (perte plafonnee a 1000), % gaffes (perte >= 300), % fautes (100-299),
//   et le taux de PIECE RAMASSEE : quand le meilleur coup devance le 2e d'au
//   moins 200 cp (une piece gratuite, un mat), combien de fois on le joue.
const path = require('path');
const C = require('../js/chess.min.js');
const Chess = C.Chess || C;
const CG = require('../js/coachgame.js');

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
function search(fen, { go, multipv = 1, skill = 20 }) {
  boot();
  return new Promise((resolve) => {
    const lines = new Map();
    const fn = (l) => {
      const m = /^info depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+).*? pv (\S+)/.exec(l);
      if (m) {
        const v = m[3] === 'mate' ? (+m[4] > 0 ? 30000 - +m[4] : -30000 - +m[4]) : +m[4];
        lines.set(+m[2], { move: m[5], score: v, mate: m[3] === 'mate' ? +m[4] : null });
      }
      if (l.startsWith('bestmove')) {
        listeners.splice(listeners.indexOf(fn), 1);
        resolve({ lines: [...lines.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]), bestMove: l.split(' ')[1] });
      }
    };
    listeners.push(fn);
    send('setoption name Skill Level value ' + skill);
    send('setoption name MultiPV value ' + multipv);
    send('position fen ' + fen);
    send('go ' + go);
  });
}
const REF = 'depth 12';
async function bestScore(fen) { return (await search(fen, { go: REF })).lines[0]?.score ?? 0; }
async function lossOf(fen, uci, best) {
  const g = new Chess(fen);
  const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  if (!mv) return null;
  let after;
  if (g.in_checkmate()) after = 30000;
  else if (g.game_over()) after = 0;
  else after = -((await search(g.fen(), { go: REF })).lines[0]?.score ?? 0);
  const clamp = (x) => Math.max(-1000, Math.min(1000, x));
  return Math.max(0, clamp(best) - clamp(after));
}

// Reproduction fidele de coachReply() (hors livre). Le build asm.js de Node est
// ~8x plus lent que le WASM du navigateur : movetime x8 pour voir les memes lignes.
async function coachPick(fen, prm) {
  const res = await search(fen, { go: 'movetime ' + prm.mt * 8, multipv: 5 });
  const lines = res.lines.filter(l => l.move);
  const g = new Chess(fen);
  if (prm.blunder > 0 && !g.in_check() && Math.random() < prm.blunder) {
    const ms = g.moves({ verbose: true });
    const m = ms[Math.floor(Math.random() * ms.length)];
    return m.from + m.to + (m.promotion || '');
  }
  return lines.length ? lines[CG.pickWeighted(CG.choiceWeights(lines, prm))].move : res.bestMove;
}

function samplePositions(n) {
  const d = require('../coach-data.json');
  const out = [];
  for (const gm of d.games.filter(x => x.timeClass === 'rapid')) {
    const g = new Chess();
    g.load_pgn(gm.pgn);
    const hist = g.history({ verbose: true });
    const r = new Chess();
    hist.forEach((m, i) => {
      const meToMove = (i % 2 === 0) === (gm.userColor === 'w');
      if (meToMove && i >= 8 && i % 6 === (gm.uuid.charCodeAt(0) % 6))
        out.push({ fen: r.fen(), uci: m.from + m.to + (m.promotion || '') });
      r.move(m);
    });
  }
  // tirage deterministe reparti sur toute l'archive
  const step = Math.max(1, Math.floor(out.length / n));
  return out.filter((_, i) => i % step === 0).slice(0, n);
}

function stats(losses, chances) {
  const L = losses.filter(x => x != null);
  const pct = (f) => (100 * L.filter(f).length / L.length).toFixed(1);
  const taken = chances.filter(Boolean).length;
  return `acpl ${(L.reduce((s, x) => s + x, 0) / L.length).toFixed(0).padStart(4)}  gaffes ${pct(x => x >= 300).padStart(5)} %  fautes ${pct(x => x >= 100 && x < 300).padStart(5)} %  piece ramassee ${taken}/${chances.length} (${chances.length ? Math.round(100 * taken / chances.length) : '-'} %)`;
}

(async () => {
  const n = +process.argv[2] || 120;
  const elos = (process.argv[3] || '250,400,600').split(',').map(Number);
  const pos = samplePositions(n);
  const variants = elos.map(e => ({ name: 'coach ~' + e, prm: CG.paramsFor(e), losses: [], chances: [] }));
  const user = { losses: [], chances: [] };
  for (const [i, p] of pos.entries()) {
    const ref = await search(p.fen, { go: REF, multipv: 2 });
    const best = ref.lines[0]?.score ?? 0;
    const chance = ref.lines.length > 1 && ref.lines[0].score - ref.lines[1].score >= 200 && ref.lines[0].score > -200;
    const ul = await lossOf(p.fen, p.uci, best);
    user.losses.push(ul);
    if (chance) user.chances.push(p.uci === ref.lines[0].move || ul < 100);
    for (const v of variants) {
      const uci = await coachPick(p.fen, v.prm);
      const l = await lossOf(p.fen, uci, best);
      v.losses.push(l);
      if (chance) v.chances.push(uci === ref.lines[0].move || l < 100);
    }
    if ((i + 1) % 20 === 0) process.stderr.write(`${i + 1}/${pos.length}\n`);
  }
  console.log(`${pos.length} positions de ses parties rapides (ref ${REF})`);
  console.log('toi (reel)   ' + stats(user.losses, user.chances));
  for (const v of variants) console.log(v.name.padEnd(13) + stats(v.losses, v.chances));
  process.exit(0);
})();
