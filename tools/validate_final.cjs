const { Chess } = require('./node_modules/chess.js/chess.js');

function validate(id, fen, sol) {
  const errors = [];
  let g;
  try { g = new Chess(fen); } catch(e) { return ['INVALID FEN: ' + e]; }
  // opponent must not be in check at start (illegal for side to move)
  const tmp = new Chess(fen);
  if (!tmp.moves().length && !tmp.in_checkmate() && !tmp.in_stalemate())
    errors.push('No legal moves at start (illegal position?)');
  const g2 = new Chess(fen);
  for (let i = 0; i < sol.length; i++) {
    const m = g2.move(sol[i], { sloppy: true });
    if (!m) { errors.push('Move ' + i + ' "' + sol[i] + '" illegal at ' + g2.fen()); return errors; }
  }
  if (sol.length % 2 === 0) errors.push('sol.length even (' + sol.length + ') - must end on learner');
  return errors;
}

const candidates = [
  { id:'attraction', fen:'6k1/3Q4/8/2q3N1/8/8/7K/8 w - - 0 1',
    sol:['Qg7+','Kxg7','Ne6+','Kg8','Nxc5'] },
  { id:'xray', fen:'q7/8/8/8/k7/8/8/3Q2K1 w - - 0 1',
    sol:['Qa1+','Kb4','Qxa8'] },
  { id:'zwischenzug', fen:'6k1/6r1/8/8/8/3q4/4Q3/4K1R1 w - - 0 1',
    sol:['Rxg7+','Kxg7','Qxd3'] },
  { id:'desperado', fen:'4k3/3q4/3p4/4N3/8/8/8/4K3 w - - 0 1',
    sol:['Nxd7'] },
  { id:'moulin', fen:'7k/1p3pRp/5B2/8/8/Q7/8/6K1 w - - 0 1',
    sol:['Rxf7+','Kg8','Rg7+','Kh8','Rxb7+'] },
  { id:'degagement', fen:'4k3/3R4/8/8/8/8/1B6/3QK3 w - - 0 1',
    sol:['Rd8+','Ke7','Qd7#'] },
];

let pass = 0, fail = 0;
for (const c of candidates) {
  const errs = validate(c.id, c.fen, c.sol);
  if (errs.length) {
    console.log('FAIL [' + c.id + ']: ' + errs.join('; '));
    try {
      const g = new Chess(c.fen);
      console.log('  legal: ' + g.moves().slice(0,12).join(', '));
    } catch(e) {}
    fail++;
  } else {
    const g = new Chess(c.fen);
    for (const mv of c.sol) g.move(mv, { sloppy: true });
    const tag = g.in_checkmate() ? 'MATE' : (g.in_check() ? 'check' : 'material');
    console.log('PASS [' + c.id + '] (' + tag + '): ' + c.sol.join(' '));
    pass++;
  }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
