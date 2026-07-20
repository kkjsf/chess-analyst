const { Chess } = require('./node_modules/chess.js/chess.js');

// Validate a puzzle: legal FEN, moves play out, last ply is learner's (even index)
function validate(id, fen, sol) {
  const errors = [];
  let g;
  try { g = new Chess(fen); } catch(e) { return [`INVALID FEN: ${e}`]; }
  if (!g.fen()) return ['Bad FEN'];

  // Check opponent not in check at start (side-to-move's opponent must not be in check)
  // chess.js: if position is illegal (opponent in check), moves() returns []
  const moves = g.moves();
  if (!moves.length && !g.in_checkmate() && !g.in_stalemate()) {
    errors.push('No legal moves in starting position (possibly illegal - opponent in check?)');
  }

  // Check turn: FEN side-to-move
  const stm = fen.split(' ')[1];

  // Validate solution
  const g2 = new Chess(fen);
  for (let i = 0; i < sol.length; i++) {
    const m = g2.move(sol[i], { sloppy: true });
    if (!m) {
      errors.push(`Move ${i} "${sol[i]}" illegal in position: ${g2.fen()}`);
      break;
    }
  }

  // Last ply must be learner's (even index = 0,2,4...)
  if (sol.length % 2 === 0) errors.push(`sol.length=${sol.length} is even — last ply is opponent's, must be odd length`);

  return errors;
}

// Test all candidate puzzles
const candidates = [
  // ── ATTRACTION ──────────────────────────────────────────────
  // Queen sacrifice lures king to h7 where Ng5# mates (smothered variant)
  // White: Ke1 Qh5 Ng5  Black: Kh8 Rg8 pg7 ph6
  // Qxh6+! gxh6, Nf7# (double check and mate)
  { id:'attraction-a', fen:'6rk/8/7p/6NQ/8/8/8/4K3 w - - 0 1',
    sol:['Qxh6+','Kxh6','Nf7'],  // wrong - Nf7 from g5: legal? and is it mate?
    hint:'Attire le roi loin du coin avec un sacrifice, puis mate au cavalier.' },

  // Better: Rh8+! Kxh8 (attracted), Qh5+ Kg8, Qh7#
  // White: Ke1 Qh3 Rh1   Black: Kg8 ph7
  // But Qh3 on h-file might check Kg8 via h-file? No, h3 != h8 and pawns block
  // Actually: Qh3 to h8 is blocked by... nothing. h3 to h8 = h4,h5,h6,h7(pawn),h8. BLOCKED by ph7!
  { id:'attraction-b', fen:'6k1/7p/8/8/8/7Q/8/6KR w - - 0 1',
    sol:['Rh8+','Kxh8','Qh7#'],
    hint:'Attire le roi en h8 avec un sacrifice de tour — puis la dame donne mat.' },

  // ── INTERFERENCE ────────────────────────────────────────────
  // White plays Rd5! cutting Black Qd8 from Black Rd2 (same file)
  // Then threatens Qh8#. Black Qd8 can no longer rush to h-file via d-file.
  // Simpler: Bishop sacrifice interferes on e6, cutting f7-defender from e8-king
  // White Qh5, Be6 (sac)! pxe6, Qxf7#
  // White: Ke1 Qh5 Be3   Black: Ke8 pf7 pe7 other
  { id:'interference-a', fen:'4k3/4pp2/8/7Q/8/4B3/8/4K3 w - - 0 1',
    sol:['Be6','fxe6','Qf7#'],
    hint:'Sacrifie le fou pour couper la communication entre le pion f7 et sa propre case — puis dame en f7.' },

  // ── RAYON X (X-ray) ─────────────────────────────────────────
  // White Rd1 "sees through" Black Qd5 to attack Black Rd8
  // White plays Rxd5! and after Qxd5, Rxd8#  (the rook behind the queen)
  // Actually: White has TWO rooks on d-file, one at d1 another at d7
  // simpler: White plays a move that wins because of x-ray defense
  // X-ray attack: White Qd1, Black Qd5, White plays Qxd5? and then something
  // Classic X-ray: White has Rd1, Black Qd5. White plays Rxd5? No, queen takes back.
  // X-ray DEFENSE: White Re8 defends Re1 via x-ray through Black piece.
  // X-ray ATTACK: Rd1 attacks Rd8 through Qd5. White plays Qh5+, Black Qd5 must stay to defend d1, so White Rxd8.
  // Let's do: White Qd1, Black Qd5, Rd8. White plays Qxd5! and after Rxd5, Qd1 is gone...
  // Better: White Ra1 and Rd1. Black Ra8. White Ra1xa8 is X-ray: after Rxa8, the d1 rook x-rays through.
  // SIMPLEST: White Rd1, Qh5; Black Ke8, Qd5, Rd8. White Qh5-e5+! Queen fork?
  // Let me try: X-ray means a piece attacks through another piece.
  // White Rd1 attacks Rd8 through Black Qd5. White Qxd5! Rxd5, Rxd8#
  // Wait: after Qxd5, Black plays Rxd5. Then White plays Rxd8? White only has Rd1.
  //   After Qxd5 Rxd5, Rd1 to d8: path d2..d8, but d5 has Black rook now! BLOCKED.
  // X-ray win: White Ra1 covers a8 THROUGH Black Ra5 (if Ra5 moves, Ra1 takes Ra8).
  // White plays Qa4! threatening Qxa8. Black Ra5 "defends" a8 but White Ra1 x-rays through Ra5.
  // After Qxa8+! Black Rxa8, White Rxa8#
  // FEN: Ra1, Qa4; Black Ka8... wait can't put king and queen on same file
  // White Ka1(no)... let me just do:
  // White: Ke1, Ra1, Qa4   Black: Ka8 Ra5  -- Qxa8! is sacking queen, Rxa8, Rxa8#
  // But that's just a back-rank mate enabled by the queen sac, not really X-ray.
  // The X-ray element: Ra1 attacks a8 THROUGH Ra5. So Ra1 "defends" Qa8 via x-ray.
  // This IS the x-ray: White queen on a8 is "defended" by Ra1 through the Black Ra5.
  // So Black can't take Qa8 because Ra1 recaptures (x-ray through Ra5).
  // FEN check: White Ka1? No. Let me use White Ke1.
  { id:'xray-a', fen:'k7/8/8/r7/Q7/8/8/R3K3 w Q - 0 1',
    sol:['Qa8+','Rxa8','Rxa8#'],
    hint:'La tour blanche "voit" a8 à travers la tour noire sur a5 — le rayon X rend le sacrifice de dame gagnant.' },

  // ── ZWISCHENZUG ─────────────────────────────────────────────
  // After an exchange, instead of recapturing, play a check first (gain tempo)
  // Classic: White just captured on e5. Black expected Rxe5 recapture.
  // Instead: Qh5+! (check), Kg8, THEN Rxe5 with tempo gained.
  // White: Ke1 Qd1 Rxe5(rook already captured, now at e5); Black: Kh7...
  // Setup: White has just played NxBe5 and black expected Rxe5 (recapture).
  // White plays Qh5+! instead, king must move, THEN White plays Rxe5.
  // FEN: White Ke1, Qd1, Re1(will go to e5), Ne5; Black Ke8, Re8, Be5
  // This is complex. Simpler:
  // White: Ke1, Qe2, Rg1; Black: Kg8, Qd3 (hanging), Rg7
  // White could take Qxd3 but plays Rg7+!! first (zwischenzug), Kxg7, Qxd3.
  { id:'zwischenzug-a', fen:'6k1/6r1/8/8/8/3q4/4Q3/4K1R1 w - - 0 1',
    sol:['Rxg7+','Kxg7','Qxd3'],
    hint:'Avant de prendre la dame adverse, joue d\'abord l\'échec qui s\'impose — tu gagnes un temps et la dame.' },

  // ── DESPERADO ───────────────────────────────────────────────
  // White knight is trapped/lost anyway — captures the most valuable piece before dying
  // White Ne5 is attacked by Black Qd6 and will be lost.
  // But Ne5 can capture Rb8! (Nxb8... wait: e5 to b8 is not a knight move)
  // Ne5 to f7! captures Rf7 (valuable rook) before the knight dies.
  // White: Ke1, Ne5; Black: Ke8, Qd6(attacks Ne5), Rf7
  // Wait: Qd6 attacks Ne5: d6=(4,6), e5=(5,5): diagonal (-1,-1)... d6 to e5 is (+1,-1): YES diagonal.
  // So Qd6 attacks Ne5.
  // Ne5xRf7! White knight (lost anyway) takes the rook.
  // After Nxf7: Black Qxe5 (takes the knight), but White already won the rook.
  // Net: White gave knight (lost anyway) for a rook.
  // But we need the knight to be DEFINITELY lost. White has nothing defending Ne5.
  // After Nxf7+! (giving check), Kxf7 or Ke8 stays.
  // Actually: does Nxf7 give check? e5 to f7: (+1,+2): YES valid knight. f7 checks Ke8? Knight on f7 attacks d6,d8,e5,g5,h6,h8. Does Nf7 attack e8? From f7=(6,7): (6±1,7±2) and (6±2,7±1):
  // (7,9)off,(7,5)=g5,(5,9)off,(5,5)=e5,(8,8)=h8,(8,6)=h6,(4,8)=d8,(4,6)=d6.
  // Nf7 does NOT attack e8! So Nxf7 is not check.
  // But Nxf7 still wins the rook (desperado), then Black Qxe5 takes the knight.
  { id:'desperado-a', fen:'4k3/5r2/3q4/4N3/8/8/8/4K3 w - - 0 1',
    sol:['Nxf7','Qxe5','Ke2'],
    hint:'Le cavalier est condamné — sacrifie-le en capturant la pièce la plus précieuse avant de mourir.' },
  // Actually this is 3 moves where last (Ke2) is neutral. Let me rethink.
  // A cleaner desperado: knight captures queen before dying!
  // White Ne5 attacked by Black pawn d6. Knight will die. But Ne5 can take Qd7!
  // FEN: White Ke1, Ne5; Black Ke8, Qd7, pd6 (attacks Ne5)
  { id:'desperado-b', fen:'3qk3/8/3p4/4N3/8/8/8/4K3 w - - 0 1',
    sol:['Nxd7'],
    hint:'Le cavalier est attaqué par le pion et condamné — il capture la dame adverse avant de tomber.' },

  // ── MOULIN (Windmill) ────────────────────────────────────────
  // Classic windmill: Rook gives check, king moves, bishop discovers check, repeat
  // White Re7 and Bg5. Re7+, Kg8, Rxg7+(discovery from Bg5? No...)
  // True windmill: Rook on e7 gives check, king goes to f8, Re7xf7+ (discovery from bishop),
  // king goes back, Re7 check again, etc.
  // Classic Torres Quevedo windmill position:
  // White: Ke1, Re7, Bg5; Black: Kg8, Rf8, pg7, ph6
  // Re7-g7+! Kh8 (forced), Rxg8+! (not windmill)...
  // Windmill: Rf7+! Kg8, Rg7+! Kh8 (or f8), Rxg-something+! back and forth
  // Let's use: White Bf6, Rf7+! Kg8, Rg7+! Kf8, Rf7+! Kg8...
  // Classic position:
  // White: Kg1, Rf1(->f7), Bh6; Black: Kg8, Rf8, pg7, pf6...
  // Textbook windmill FEN from well-known game:
  // White: Ke2, Re7, Bg5; Black: Kh7, Re8, pg6, ph6
  // Re7xg7+! Kh8, Rg7-xh6+?? No...
  // SIMPLEST windmill (3 moves = learner, opp, learner):
  // Rf7+! Kg8(forced), Rg7+!(discovery opens line),
  // but second Rg7+ also needs to be a discovery. Bg5 discovers along g-file?
  // The bishop on g5 can't discover via g-file (it's diagonal, not same file as Rf7 moving to g7).
  // True windmill mechanism: ROOK moves to give check, BISHOP is uncovered (or vice versa)
  // Re7+! Kg8, Rg7+! (now moving rook, bishop on c3 uncovers attack on g-file? No.)
  // Actually: ROOK gives check, king moves. Then ROOK moves to another square giving ANOTHER check,
  // and each time it passes, it sweeps a piece. Not a bishop discovery.
  // Let's use the simplest true windmill (bishop on g5, rook on e7):
  // Re7-g7+! Kh8, Bg5-captures or Rg7xh7+! Kg8, Rh7-g7+! Kh8...
  // For a 3-move puzzle (learner, opp, learner), simplest windmill:
  // White: Kg1, Rf7, Bh6; Black: Kh8, pg7
  // Rf7xg7+! (captures pg7, gives check) Kh8... wait king can't go anywhere if mated
  // Rf7-g7+! Kh8, Rg7xh7#? Bh6 attacks g7? No.
  // Let's try: White Rf7, Bh6; Black Kh8, pg7, Rf8.
  // Rxg7+! Kh8(forced, g8 has own rook), Rxf8#? No: Rf8 is Black's, Rg7xf8? that's wrong direction.
  // MOULIN 5-move puzzle:
  // White: Ke1, Re7, Bg5; Black: Kg8, Qd8 pf6 pg7 ph6
  // Re7xg7+! Kh8 (forced), Rg7xh7+! Kg8 (forced - Kf8 walked into Bg5 diagonal? let me check)
  //   Bg5=(7,5), Kf8=(6,8): no. Kf8 is free. So Kg8 or Kf8.
  // If Kg8: Rh7-g7+! Kh8 (back to h8), Rg7xf7+! (snatching pf7 if it exists)...
  // This is a 5-move line which is fine (learner=0,2,4; opp=1,3).
  // Let me use the FAMOUS windmill position (Torres Quevedo vs Réti, 1925 flavor):
  { id:'moulin-a', fen:'3qk1r1/4Rppp/3p1b2/p5B1/8/8/PPP2PPP/6K1 w - - 0 1',
    sol:['Rxf7+','Ke8','Rxg7+','Kf8','Rxg8#'],
    // Rxf7+: Ke8 or Ke6. If Ke8, Rxg7+: Black must move king. Kf8, Rxg8#
    hint:'La tour et le fou travaillent ensemble : chaque case où le roi fuit est une nouvelle case prise.' },

  // ── DÉGAGEMENT (Clearance) ──────────────────────────────────
  // Sacrifice a piece to vacate a square/file for another piece
  // White Rd5! clears d-file for queen to deliver Qd8#
  // White: Ke1, Qd1, Re5(->d5 clears? no);
  // Classic clearance: White bishop on d5 blocks the queen's path to d8.
  // Bxf7+! (clears d5-d8 diagonal for queen, also gives check, forces Kxf7, then Qd5+...no)
  // Simpler: White Rd5! (clearing d-file... no, rd5 goes TO d5)
  // Clearance = piece VACATES its square so another piece can USE that square or line.
  // White Rd7 is blocking the queen on d1 from reaching d8.
  // White plays Rxe7+! (clears d-file by moving the rook away), then Qd8#.
  // White: Ke1, Qd1, Rd7; Black: Ke8, Re7
  // Rxe7+! Kxe7 (or Kd8), Qd8#... wait: after Rxe7+, is Kd8 possible?
  //   Qd1 attacks d8 (same file). So Kd8 is attacked. ILLEGAL after Rxe7+.
  //   Kxe7: king takes rook on e7. Then Qd8#? Qd1 to d8: same file d. Kd7 is on d-file? No king is on e7 now. Qd8: does it check Ke7? d8 and e7: diagonal d8-e7: YES (-1,-1) diagonal. So Qd8 checks Ke7? Qd8=(4,8), Ke7=(5,7): (+1,-1): diagonal YES. Qd8+ is check. Is it mate?
  // Ke7 moves: d7(empty?), d8(Qd8 there), d6, e6, e8, f6, f7, f8.
  // White only has Ke1 and Qd8. Can Black king escape to f6,f7,f8,e6,e8,d6,d7?
  // Qd8 attacks: d-file (d1..d7,d9off), rank 8 (a8..h8), diagonals from d8: e7,f6,g5,h4 and c7,b6,a5.
  // So Qd8 attacks: d7, d6... (d-file), e7(diagonal), f6, g5, h4, c7, b6, a5.
  // After Rxe7+ Kxe7, Qd8+ Ke7 is in check. King escape squares from e7:
  //   d7: Qd8 attacks d7 (d-file). ILLEGAL.
  //   d8: Qd8 there. ILLEGAL.
  //   d6: Qd8 attacks d6 (d-file). ILLEGAL.
  //   e6: Not attacked by Qd8. LEGAL escape. Not mate.
  // So Qd8+ is not mate since king can go to e6.
  // Let me add more coverage or use different position.
  { id:'degagement-a', fen:'4k3/3R4/8/8/8/8/8/3QK3 w - - 0 1',
    sol:['Rd8+','Ke7','Qd7#'],
    // Rd8+: checks Ke8? Rd7 to d8: same file, one step. Rd8+ checks Ke8? Rd8=(4,8), Ke8=(5,8): same rank! YES.
    // Ke7: only escape (Kf8 is rank 8 - attacked by Rd8; Kd8: same square as rook; Kf7: diagonal from Rd8? no. Actually Rd8 on rank 8 attacks: a8..h8. So Kf8 is attacked. Ke7 is the only free square? Let's check: Kd7: same file as Rd8, attacked. Kf7: Rd8 on rank 8 attacks f8 not f7. Qd1 attacks d-file so Kd7 illegal. So Ke7 or Kf7.
    // After Ke7: Qd7#? Qd1 to d7: same file. Checks Ke7? Qd7=(4,7), Ke7=(5,7): same rank! YES.  Is it mate? King on e7, Qd7 gives check. King moves: e8(Rd8 there), e6, f6, f7, f8, d8(Rd8), d6(Qd7 covers d-file).
    // e8: Rd8 blocks. ILLEGAL. d8: Rd8. ILLEGAL. d6: Qd7 on d-file. ILLEGAL.
    // f7: Not attacked by Qd7 (rank 7, same rank - YES Qd7 attacks f7). ILLEGAL.
    // f8: Not attacked by Qd7 (diagonal d7-e8-f9off or d7-e6-f5). Actually d7=(4,7) diagonal up-right: e8=(5,8). f7 is on rank 7, same as Qd7. ILLEGAL.
    // f6: Qd7 attacks f7 (rank 7), but f6=(6,6). Qd7=(4,7) to f6: (+2,-1): not valid queen direction. And Rd8: d8=(4,8) to f6=(6,6): (+2,-2): diagonal! So Rd8 attacks f6? YES diagonal. ILLEGAL!
    // e6: Qd7 attacks e8 diagonal? d7=(4,7) to e6=(5,6): (+1,-1): diagonal YES. So Qd7 attacks e6. ILLEGAL.
    // So ALL escape squares are covered. Qd7# is checkmate!
    // But wait: is this CLEARANCE? Rd7 (original) was blocking Qd1 from reaching d7 (the mating square).
    // White plays Rd8+! which CLEARS d7 (moves the rook from d7 to d8, vacating d7 for the queen).
    // Then Qd7# uses the cleared d7 square. YES, this is dégagement!
    hint:'La tour se sacrifie en d8 pour libérer la case d7 — la dame s\'y installe pour donner mat.' },
];

// Verify all candidates
let pass = 0, fail = 0;
for (const c of candidates) {
  const errs = validate(c.id, c.fen, c.sol);
  if (errs.length) {
    console.log(`FAIL [${c.id}]: ${errs.join('; ')}`);
    // Show position details
    try {
      const g = new Chess(c.fen);
      console.log(`  FEN: ${c.fen}`);
      console.log(`  Legal moves: ${g.moves().slice(0,8).join(', ')}...`);
    } catch(e) { console.log(`  Error loading: ${e}`); }
    fail++;
  } else {
    // Also check if last move is actually checkmate (preferred)
    const g = new Chess(c.fen);
    for (const mv of c.sol) g.move(mv, { sloppy: true });
    const isMate = g.in_checkmate();
    console.log(`PASS [${c.id}]${isMate ? ' (MATE ✓)' : ' (no mate at end)'}: ${c.sol.join(' ')}`);
    pass++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);

// Extra: test the INTERFERENCE puzzle more carefully
console.log('\n--- Testing interference Be6 fxe6 Qf7# ---');
const g = new Chess('4k3/4pp2/8/7Q/8/4B3/8/4K3 w - - 0 1');
console.log('Legal moves:', g.moves().join(', '));
const m1 = g.move('Be6'); console.log('Be6:', m1 ? 'ok' : 'ILLEGAL');
if (m1) {
  console.log('After Be6:', g.fen());
  console.log('Black moves:', g.moves().join(', '));
  const m2 = g.move('fxe6'); console.log('fxe6:', m2 ? 'ok' : 'ILLEGAL - try dxe6 or exe6');
  if (!m2) {
    g.undo();
    const m2b = g.move('dxe6'); console.log('dxe6:', m2b ? 'ok' : 'ILLEGAL');
    if (!m2b) { const m2c = g.move('exd6'); console.log('exd6:', m2c ? 'ok' : 'ILLEGAL'); }
  }
  if (g.history().length === 2) {
    console.log('After pxe6:', g.fen());
    console.log('White moves:', g.moves().join(', '));
    const m3 = g.move('Qf7#'); console.log('Qf7#:', m3 ? 'ok MATE=' + g.in_checkmate() : 'ILLEGAL');
  }
}
