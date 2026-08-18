// Minimal Stockfish (asm.js) driver for Node, used by the lesson verifiers.
// js/vendor/stockfish.js is a Web Worker build: it installs a global onmessage()
// to receive UCI commands and calls the global postMessage() for every line of
// engine output. We provide both, then talk plain UCI.
const path = require('path');

let sendCmd = null;
const listeners = [];

function boot() {
  if (sendCmd) return;
  global.postMessage = (line) => {
    const s = String(line);
    for (const fn of listeners.slice()) fn(s);
  };
  require(path.join(__dirname, '..', 'js', 'vendor', 'stockfish.js'));
  sendCmd = (c) => global.onmessage({ data: c });
  sendCmd('uci');
  sendCmd('setoption name Hash value 64');
}

function waitFor(match, timeout = 240000) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const to = setTimeout(() => { off(); reject(new Error('engine timeout')); }, timeout);
    const fn = (l) => {
      lines.push(l);
      if (match(l)) { clearTimeout(to); off(); resolve(lines); }
    };
    const off = () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    listeners.push(fn);
  });
}

// Returns [{ move (uci), score {cp|mate}, pv }] sorted by multipv rank.
async function analyse(fen, { depth = 14, multipv = 3 } = {}) {
  boot();
  sendCmd('setoption name MultiPV value ' + multipv);
  sendCmd('position fen ' + fen);
  const done = waitFor((l) => l.startsWith('bestmove'));
  sendCmd('go depth ' + depth);
  const lines = await done;
  const best = new Map(); // multipv rank -> last info line seen
  let maxDepth = 0;
  for (const l of lines) {
    const m = /^info depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+).*? pv ((\S+)(?:\s.*)?)$/.exec(l);
    if (!m) continue;
    const d = +m[1];
    if (d > maxDepth) maxDepth = d;
    const rank = +m[2];
    const prev = best.get(rank);
    if (!prev || d >= prev.depth) {
      best.set(rank, { depth: d, move: m[6], pv: m[5].trim().split(/\s+/), kind: m[3], value: +m[4] });
    }
  }
  const out = [...best.entries()].sort((a, b) => a[0] - b[0]).map(([rank, e]) => ({
    rank, move: e.move, pv: e.pv, depth: e.depth,
    mate: e.kind === 'mate' ? e.value : null,
    cp: e.kind === 'cp' ? e.value : null,
  }));
  return out;
}

// Score from the point of view of the side to move, in "pawns", mate = ±1000.
function scoreOf(e) {
  if (!e) return null;
  if (e.mate !== null) return e.mate > 0 ? 1000 - e.mate : -1000 - e.mate;
  return e.cp / 100;
}

module.exports = { analyse, scoreOf };
