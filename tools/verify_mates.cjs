// One-off verifier for the Mats course positions.
// Checks: (a) each diagram FEN loads and the side to move is checkmated
//         (b) each puzzle solution is fully legal and ends on checkmate.
const C = require('../js/chess.min.js');
const Chess = C.Chess || C;

// Diagrams that should already be checkmate (side-to-move is mated).
const DIAGRAMS = {
  imbecile:  'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 3',
  berger:    'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
  couloir:   '4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1',
  escalier:  '1R2k3/R7/8/8/8/8/8/6K1 b - - 0 1',
  epaulette: '3rkr2/8/4Q3/8/8/8/8/6K1 b - - 0 1',
  etouffe:   '6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1',
  arabe:     '7k/7R/5N2/8/8/8/8/6K1 b - - 0 1',
  boden:     '2kr4/3p4/B7/8/5B2/8/8/6K1 b - - 0 1',
  baiser:    '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1',
  h7:        '7k/6pQ/8/8/8/3B4/8/6K1 b - - 0 1',
  lolli:     '6k1/6Q1/5P2/8/8/8/8/6K1 b - - 0 1',
  g7:        '6k1/6Q1/8/8/8/8/1B6/6K1 b - - 0 1',
  damiano:   '7k/7Q/6P1/8/8/8/8/6K1 b - - 0 1',
};

// Puzzles: fen + solution in English SAN (even idx = solver, odd idx = forced reply).
const PUZZLES = {
  imbecile:  [{ fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', sol: ['Qh4#'] }],
  berger:    [{ fen: 'rnbqk2r/pppp1ppp/5n2/2b1p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', sol: ['Qxf7#'] }],
  legal:     [{ fen: 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5', sol: ['Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#'] }],
  couloir:   [
    { fen: '6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1', sol: ['Rd8#'] },
    { fen: '2r3k1/5ppp/8/8/8/8/3R4/3R2K1 w - - 0 1', sol: ['Rd8+', 'Rxd8', 'Rxd8#'] },
  ],
  escalier:  [{ fen: '4k3/R7/1R6/8/8/8/8/6K1 w - - 0 1', sol: ['Rb8#'] }],
  epaulette: [{ fen: '3rkr2/8/8/4Q3/8/8/8/6K1 w - - 0 1', sol: ['Qe6#'] }],
  etouffe:   [
    { fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', sol: ['Nf7#'] },
    { fen: '5r1k/6pp/7N/8/8/8/Q7/6K1 w - - 0 1', sol: ['Qg8+', 'Rxg8', 'Nf7#'] },
  ],
  arabe:     [{ fen: '7k/8/5N2/8/8/8/8/6KR w - - 0 1', sol: ['Rh7#'] }],
  boden:     [{ fen: '2kr4/3p4/8/1B6/5B2/8/8/6K1 w - - 0 1', sol: ['Ba6#'] }],
  baiser:    [{ fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', sol: ['Qg7#'] }],
  h7:        [{ fen: '7k/6p1/8/7Q/8/3B4/8/6K1 w - - 0 1', sol: ['Qh7#'] }],
  lolli:     [{ fen: '6k1/8/5P2/6Q1/8/8/8/6K1 w - - 0 1', sol: ['Qg7#'] }],
  g7:        [{ fen: '6k1/8/6Q1/8/8/8/1B6/6K1 w - - 0 1', sol: ['Qg7#'] }],
  damiano:   [{ fen: '7k/8/6P1/7Q/8/8/8/6K1 w - - 0 1', sol: ['Qh7#'] }],
};

let fail = 0;
console.log('=== DIAGRAMS (expect checkmate) ===');
for (const [k, fen] of Object.entries(DIAGRAMS)) {
  let ok = false, err = '';
  try { const g = new Chess(fen); ok = g.in_checkmate(); if (!ok) err = 'not checkmate (moves: ' + g.moves().join(',') + ')'; }
  catch (e) { err = 'LOAD ERROR ' + e.message; }
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + k + (ok ? '' : '  -> ' + err));
  if (!ok) fail++;
}

console.log('\n=== PUZZLES (solution must be legal + end on #) ===');
for (const [k, arr] of Object.entries(PUZZLES)) {
  arr.forEach((p, i) => {
    let ok = true, err = '';
    try {
      const g = new Chess(p.fen);
      for (const san of p.sol) {
        const m = g.move(san, { sloppy: true });
        if (!m) { ok = false; err = 'illegal move: ' + san; break; }
      }
      if (ok && !g.in_checkmate()) { ok = false; err = 'line does not end in checkmate'; }
      const last = p.sol[p.sol.length - 1];
      if (ok && !/#$/.test(last)) { ok = false; err = 'last SAN not marked # : ' + last; }
    } catch (e) { ok = false; err = 'ERROR ' + e.message; }
    console.log((ok ? 'OK  ' : 'FAIL') + ' ' + k + '[' + i + ']' + (ok ? '' : '  -> ' + err));
    if (!ok) fail++;
  });
}

console.log('\n' + (fail ? ('❌ ' + fail + ' FAILURES') : '✅ ALL GREEN'));
process.exit(fail ? 1 : 0);
