// Pass 1 of the Lichess puzzle mining pipeline.
//
// Streams lichess_db_puzzle.csv.zst (CC0, https://database.lichess.org/#puzzles)
// and keeps only the rows that could make a good lesson exercise: approachable
// rating, high popularity, played a lot, short forced line, and a theme we teach.
// Output: a compact JSONL pool in the scratchpad that later passes can chew on
// without touching the 300 MB archive again.
//
//   node tools/mine_lichess.cjs [out.jsonl]
//
// Note: the archive starts with a zstd *skippable* frame that node:zlib refuses,
// hence the 12-byte offset.
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const path = require('path');

const SRC = path.join(__dirname, '..', 'lichess_db_puzzle.csv.zst');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', 'pool.jsonl');

const KEEP = new Set([
  // tactical motifs of the catalog
  'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'deflection',
  'attraction', 'capturingDefender', 'interference', 'xRayAttack', 'intermezzo',
  'clearance', 'quietMove', 'advancedPawn', 'promotion', 'zugzwang', 'trappedPiece',
  'hangingPiece', 'sacrifice',
  // mate patterns
  'backRankMate', 'smotheredMate', 'arabianMate', 'bodenMate', 'hookMate',
  'anastasiaMate', 'dovetailMate', 'doubleBishopMate', 'killBoxMate', 'vukovicMate',
  'mateIn1', 'mateIn2', 'mateIn3',
]);

const MIN_RATING = 600, MAX_RATING = 1750, MIN_POP = 90, MIN_PLAYS = 800, MAX_PLIES = 6;

let seen = 0, kept = 0;
const out = fs.createWriteStream(OUT);
const rl = readline.createInterface({
  input: fs.createReadStream(SRC, { start: 12 }).pipe(zlib.createZstdDecompress()),
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  if (seen++ === 0) return; // header
  const f = line.split(',');
  if (f.length < 9) return;
  const rating = +f[3], pop = +f[5], plays = +f[6];
  if (!(rating >= MIN_RATING && rating <= MAX_RATING)) return;
  if (pop < MIN_POP || plays < MIN_PLAYS) return;
  const moves = f[2].split(' ');
  if (moves.length > MAX_PLIES || moves.length < 2) return;
  const themes = f[7].split(' ');
  if (!themes.some(t => KEEP.has(t))) return;
  kept++;
  out.write(JSON.stringify({ id: f[0], fen: f[1], moves, rating, pop, plays, themes, url: f[8] }) + '\n');
});
rl.on('close', () => {
  out.end();
  console.log(`${seen - 1} puzzles lus, ${kept} retenus -> ${OUT}`);
});
