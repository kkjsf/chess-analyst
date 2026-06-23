// Server-side bulk analyzer for Chess Analyst Coach.
// Pulls all Chess.com games for a user, analyzes new ones with Stockfish,
// and writes a compact coach-data.json that the PWA fetches.
//
// Reuses the SAME classification logic as the browser (js/analysis.js,
// js/openings.js) so server and client never diverge.
//
// Usage:
//   node tools/analyze.mjs --user nimokaji [--depth 20] [--max N] [--mock] [--out ../coach-data.json]
// Env:
//   STOCKFISH_PATH  path to stockfish binary (default: "stockfish")

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── args ──
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : (args.includes('--' + name) ? true : def);
};
const USER = getArg('user', process.env.CHESSCOM_USER || 'nimokaji');
const DEPTH = parseInt(getArg('depth', '20'), 10);
const MAX = getArg('max', null) ? parseInt(getArg('max'), 10) : null;
const MOCK = !!getArg('mock', false);
const OUT = resolve(__dirname, getArg('out', '../coach-data.json'));
const STOCKFISH_PATH = process.env.STOCKFISH_PATH || 'stockfish';
const UA = 'chess-analyst-coach/1.0 (+https://github.com/kkjsf/chess-analyst)';

// ── reuse browser logic ──
const { Chess } = require('chess.js');
globalThis.Chess = Chess;
globalThis.Openings = require('../js/openings.js');
// StockfishEngine global is set after the engine is built (below), before analysis.
const Analyzer = require('../js/analysis.js');

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

// ─────────────── Engine: native Stockfish over UCI/stdio ───────────────
function createEngine() {
  const proc = spawn(STOCKFISH_PATH, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  let onLine = null;
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line && onLine) onLine(line);
    }
  });
  const send = (cmd) => proc.stdin.write(cmd + '\n');
  const waitFor = (token) => new Promise((res) => {
    const prev = onLine;
    onLine = (line) => { if (prev) prev(line); if (line.includes(token)) { onLine = prev; res(); } };
  });

  async function init() {
    send('uci'); await waitFor('uciok');
    send('setoption name MultiPV value 3');
    send('isready'); await waitFor('readyok');
  }

  // arg: "depth N" or "movetime N" (mirrors browser StockfishEngine)
  function evaluate(fen, arg) {
    return new Promise((res) => {
      const lines = [];
      onLine = (line) => {
        if (line.startsWith('info') && line.includes(' score ')) {
          const mpv = line.match(/\bmultipv (\d+)/);
          const idx = mpv ? parseInt(mpv[1]) - 1 : 0;
          const cp = line.match(/\bscore cp (-?\d+)/);
          const mate = line.match(/\bscore mate (-?\d+)/);
          const pv = line.match(/\bpv\s+(.+)/);
          if (!lines[idx]) lines[idx] = { score: 0, move: null, pv: '', mate: null };
          if (cp) lines[idx].score = parseInt(cp[1]);
          else if (mate) { const m = parseInt(mate[1]); lines[idx].score = m > 0 ? 30000 - m : -30000 - m; lines[idx].mate = m; }
          if (pv) { const s = pv[1].trim(); lines[idx].pv = s; lines[idx].move = s.split(/\s+/)[0]; }
        } else if (line.startsWith('bestmove')) {
          const clean = lines.filter(Boolean);
          const best = clean[0] || { score: 0, move: null, pv: '', mate: null };
          res({ score: best.score, bestMove: best.move, pv: best.pv, mate: best.mate, lines: clean });
        }
      };
      send('position fen ' + fen);
      send('go ' + (arg && arg.startsWith('movetime') ? arg : 'depth ' + (parseInt((arg || '').replace('depth ', '')) || DEPTH)));
    });
  }
  function destroy() { try { send('quit'); proc.kill(); } catch (_) {} }
  return { init, evaluate, destroy, isReady: () => true };
}

// Deterministic mock engine for local pipeline/shape testing (no Stockfish needed).
function createMockEngine() {
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  return {
    init: async () => {},
    evaluate: async (fen) => {
      const g = new Chess(fen);
      const moves = g.moves({ verbose: true });
      const score = (hash(fen) % 600) - 300; // ±300cp deterministic jitter
      const lines = moves.slice(0, 3).map((m, i) => ({ score: score - i * 40, move: m.from + m.to + (m.promotion || ''), pv: '', mate: null }));
      const best = lines[0] || { score, move: null, pv: '', mate: null };
      return { score, bestMove: best.move, pv: '', mate: null, lines };
    },
    destroy: () => {},
    isReady: () => true
  };
}

// ─────────────── Chess.com fetch ───────────────
async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

function prettyOpening(ecoUrl) {
  if (!ecoUrl) return null;
  const slug = ecoUrl.split('/openings/')[1] || ecoUrl.split('/').pop();
  if (!slug) return null;
  return decodeURIComponent(slug).replace(/-/g, ' ').replace(/\d+\s*\w*$/, '').trim();
}
function openingFamily(name) {
  if (!name) return 'Inconnue';
  return name.split(/\s+/).slice(0, 2).join(' ');
}

// Mirrors Coach.normalize() in js/coach.js — keep in sync.
function normalize(g, user) {
  const u = user.toLowerCase();
  const userColor = (g.white.username || '').toLowerCase() === u ? 'w' : 'b';
  const me = userColor === 'w' ? g.white : g.black;
  const opp = userColor === 'w' ? g.black : g.white;
  let result = 'loss';
  if (me.result === 'win') result = 'win';
  else if (DRAW_RESULTS.has(me.result)) result = 'draw';
  const name = prettyOpening(g.eco);
  return {
    uuid: g.uuid, url: g.url, pgn: g.pgn, userColor, result, endReason: me.result,
    myRating: me.rating || null, oppRating: opp.rating || null, oppName: opp.username || '?',
    eco: g.eco || null, opening: name, family: openingFamily(name),
    timeClass: g.time_class || null, timeControl: g.time_control || null,
    rated: !!g.rated, endTime: g.end_time || 0,
    ccAccuracy: g.accuracies ? (userColor === 'w' ? g.accuracies.white : g.accuracies.black) : null,
    analysis: null
  };
}

// Per-game stats come from the shared Analyzer.computeGameStats (js/analysis.js),
// the single source of truth used by both server and browser analyzers.
async function analyzeGame(rec) {
  const moves = Analyzer.parsePgnMoves(rec.pgn);
  if (!moves.length) return { error: 'pgn' };
  const results = await Analyzer.analyzeGameAsync(new Chess(), moves, null, 'depth ' + DEPTH);
  const summary = Analyzer.generateSummary(results, moves);
  return Analyzer.computeGameStats(results, summary, {
    side: rec.userColor, pgn: rec.pgn, timeClass: rec.timeClass, timeControl: rec.timeControl
  });
}

// ─────────────── main ───────────────
async function main() {
  console.log(`[coach] user=${USER} depth=${DEPTH} engine=${MOCK ? 'mock' : STOCKFISH_PATH}${MAX ? ` max=${MAX}` : ''}`);

  // load existing output → keep already-analyzed games
  let existing = {};
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf8'));
      for (const g of (prev.games || [])) if (g.analysis && !g.analysis.error) existing[g.uuid] = g;
      console.log(`[coach] ${Object.keys(existing).length} games already analyzed (kept)`);
    } catch (e) { console.warn('[coach] could not read existing output:', e.message); }
  }

  const arch = await fetchJson(`https://api.chess.com/pub/player/${USER}/games/archives`);
  const months = arch.archives || [];
  console.log(`[coach] ${months.length} monthly archives`);

  const all = [];
  for (const url of months) {
    try {
      const data = await fetchJson(url);
      for (const g of (data.games || [])) {
        if (g.rules && g.rules !== 'chess') continue;
        if (!g.uuid || !g.pgn) continue;
        all.push(g);
      }
    } catch (e) { console.warn(`[coach] skip ${url}: ${e.message}`); }
  }
  console.log(`[coach] ${all.length} total games on Chess.com`);

  let pending = all.filter(g => !existing[g.uuid]);
  if (MAX) pending = pending.slice(0, MAX);
  console.log(`[coach] ${pending.length} new game(s) to analyze`);

  const engine = MOCK ? createMockEngine() : createEngine();
  await engine.init();
  globalThis.StockfishEngine = engine;

  const merged = { ...existing };
  let done = 0;
  for (const g of pending) {
    const rec = normalize(g, USER);
    try {
      rec.analysis = await analyzeGame(rec);
    } catch (e) {
      rec.analysis = { error: String(e.message || e) };
    }
    merged[rec.uuid] = rec;
    done++;
    const a = rec.analysis;
    console.log(`[coach] (${done}/${pending.length}) vs ${rec.oppName} — ${a.error ? 'ERR ' + a.error : `acc ${a.accuracy}% · ${a.blunderList.length} err`}`);
  }
  engine.destroy();

  const games = Object.values(merged).sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
  const out = {
    schema: 1,
    username: USER,
    generatedAt: new Date().toISOString(),
    count: games.length,
    analyzedCount: games.filter(g => g.analysis && !g.analysis.error).length,
    games
  };
  writeFileSync(OUT, JSON.stringify(out));
  const kb = Math.round(JSON.stringify(out).length / 1024);
  console.log(`[coach] wrote ${OUT} — ${out.count} games, ${out.analyzedCount} analyzed, ${kb} KB`);
}

main().catch((e) => { console.error('[coach] FATAL', e); process.exit(1); });
