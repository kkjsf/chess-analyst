const { Chess } = require('./node_modules/chess.js/chess.js');

function test(label, fen, moves) {
  const chess = new Chess(fen);
  process.stdout.write('\n--- ' + label + ' ---\n');
  const v = chess.validate_fen(fen);
  if (!v.valid) { process.stdout.write('INVALID FEN: ' + v.error + '\n'); return; }
  process.stdout.write('Turn: ' + chess.turn() + ' | InCheck: ' + chess.in_check() + '\n');
  if (chess.in_check()) {
    process.stdout.write('WARNING: side to move is already in check at start\n');
  }
  for (let i = 0; i < moves.length; i++) {
    const r = chess.move(moves[i], { sloppy: true });
    if (!r) {
      process.stdout.write('ILLEGAL at [' + i + ']: ' + moves[i] + '\nLegal: ' + chess.moves().join(', ') + '\n');
      return;
    }
    process.stdout.write('[' + i + '] ' + moves[i] + (chess.in_checkmate() ? ' CHECKMATE' : chess.in_check() ? ' check' : '') + '\n');
  }
  process.stdout.write('END: checkmate=' + chess.in_checkmate() + ' stalemate=' + chess.in_stalemate() + '\n');
}

// ===== ATTRACTION (Decoy) =====
// Rh1 to h8 illegal because h8 is occupied by... let's check: 6k1/7p = rank8: 6k1 (a-f empty, g=K, h=1 piece? no 6k1 = 6 empty, k, 1 empty = h8 empty)
// Actually rank 8 = "6k1" means: a8-f8 empty, g8=black king, h8=empty
// Rank 2 = "7p" means: a2-g2 empty, h2=pawn (NOT h7!)
// Wait - FEN ranks go 8 down to 1 left to right
// "6k1/7p" = rank8: 6k1, rank7: 7p (a7-g7 empty, h7=pawn)
// So h7=Black pawn, h8=empty, g8=Black king. Rh1->h8 should be legal if h8 is empty!
// Legal moves showed Rxh7+ (captures h7 pawn) but not Rh8+.
// That means h8 is NOT empty. Let me re-read: "6k1" = 6,k,1 = 6 empty squares (a8-f8), k on g8, 1 empty (h8). So h8 IS empty.
// But Rh1->h8 was illegal. Why? Maybe White king is in check? No, turn=w, incheck=false.
// Ah - Rh8 would PUT WHITE KING IN CHECK? No, there's no Black pieces threatening White king...
// White has no king in this FEN! That's why it's invalid? But chess.js accepted it.
// In chess.js, you can have positions without kings (it won't validate that). But moves might fail.
// Actually chess.js 0.12 might require kings. Let me add a White king.

test('Attraction v2',
  // White: Kg1, Qg6, Rg1(no, let's put rook on a1); Black: Kg8, ph7
  // White Ra1 can't reach h8 in one move (different file and rank)
  // White: Kg1, Qg6, Rh5; Black: Kg8, ph7
  // Rh5-h8+? h8 is empty, so Rh8+? But Rh8 checks g8 king!
  // Then Kxh8 (king takes on h8? But h8 is where rook went)... King can't capture the rook if it's protected.
  // If Qg6 protects h7 but not h8... let me try Rh5-h8+ if h8 empty, King g8 must move.
  // King can go to f8, f7, g7(if not attacked by Qg6), h7(if not attacked).
  // Qg6 attacks h7 (diagonal g6-h7). King can't go h7.
  // g7: is g7 attacked by Qg6? g6->g7 is one up, queen attacks g7. King can't go g7.
  // f7: is f7 attacked by Qg6? f7 is on the diagonal f7... Qg6 attacks f7? g6->f7 diagonal yes. Illegal.
  // f8: attacked by Qg6? g6->f7->... no. Qg6 attacks f6 not f8 directly. f8: not on queen's lines from g6.
  // So King must go to f8 after Rh8+.
  // Then: Qg6-f7# ? Queen goes f7, checks f8 king? f7 is adjacent to f8, queen covers f8 from f7.
  // Is f7# checkmate? King on f8, Qf7. King can go e8, g8(Rh8 there), e7?
  // e8: attacked by Qf7 (f7->e8 diagonal). Illegal.
  // g8: Rh8 is there, can king capture? Rh8 protected by... queen? Qf7 attacks g8? f7->g8 diagonal yes.
  // So king can't take Rh8 (protected by queen). g8 illegal.
  // g7: attacked by Qf7? f7->g7 one right on rank 7. Yes. Illegal.
  // e7: attacked by Qf7? f7->e7 one left on rank 7. Yes. Illegal.
  // So after Rh8+ Kf8, Qf7# is checkmate!
  // But wait: Rh8+ is the ATTRACTION - it LURES the king away? No. The king goes to f8, not h8.
  // Attraction means we sacrifice to LURE the king ONTO a specific square.
  // Classic: Rxh7+! Kxh7 (king is LURED to h7), then attack continues.
  // Let me redesign: White sacrifices rook on h7, king is FORCED to take (lured to h7), then mate.
  // White: Qg5, Rh1; Black: Kg8, ph7, Rf8(blocks some escape)
  // White Rxh7+! Kxh7 (lured!), Qg5-h5# or Qg5-g7#?
  // King on h7. Qg5-h5+? h5 is not adjacent to h7... Qh5 checks h7? h5 to h7 = same file, queen covers. YES.
  // After Qh5+, king on h7 can go to g6, g7, g8, h6, h8.
  // g8: White Rh1 there? No, rook went to h7 and was captured.
  // h6: queen on h5 attacks h6. Illegal.
  // g6: attacked by Qh5? h5->g6 diagonal. YES. Illegal.
  // g7: attacked by Qh5? h5->g6->... h5 doesn't directly attack g7. g7 is not on queen's lines from h5. Legal? Queen attacks on file (h), rank (5), diagonals (g6,f7,e8 and g4,f3...). g7 not attacked. Hmm.
  // Maybe Qg5->h6# after Kxh7? Qg5 is on g5, goes to h6. Qh6 checks h7? h6 is one square from h7 diagonally. Yes.
  // Is Qh6# checkmate? King on h7. Qh6. King moves: g7(attacked by Qh6? h6->g7 diagonal yes), g8, h8(attacked by Qh6 on h-file yes).
  // g8: attacked by Qh6? h6->g7->... no, Qh6 attacks the h-file and 6th rank and diagonals. g8 not on those. So king can go g8. Not checkmate.
  // Let me try with more White pieces.
  // White: Qd3, Rh1, Bg5(no bishop); Black: Kg8, Rf8, ph7.
  // Rxh7+! Kxh7(lured), Qd3-h3+ Kg8(or Kg7), Qh8#?
  // After Kxh7, Qh3+: king on h7 is checked from h3 (same file). King must move.
  // King goes to g6, g7, g8, h6, h8. (not h7 anymore)
  // After Kg8: White Qh8#? Queen goes to h8 = Black Rook on f8 still there. Not checkmate if Rf8 not captured.
  // This is getting complicated. Let me just try this known mating pattern:
  // White: Qd1, Rh7(already there - will sacrifice); Black: Kg8, Rf8, pg7(White needs g7 protected)
  // Qxg7+!! Rxg7 (rook lured from f8 to g7, opening f-file or back rank), Rd8#?
  // White Rd1->d8#? After Rxg7, is d8 clear? And is it checkmate?
  // King on g8, Rg7 just moved there. Qd1 was captured (Qxg7+ means Q goes to g7, R takes Q).
  // White: Kg1, Qd1, Rd8... White Qxg7+ Rxg7(lured), then White plays...? White queen is gone.
  // This pattern needs a rook already on h7 or similar.
  '4k3/7p/6Q1/8/8/8/8/6KR w - - 0 1',
  ['Rh8+', 'Kxh8', 'Qh7#']);
// FEN: rank8=4k3 (a-d empty, e=k, f-h empty), rank7=7p (h7=pawn), rank6=6Q1 (g6=Q, h6 empty? 6Q1 = 6 empty, Q, 1 = g6=Q, h6 empty). rank1=6KR (g1=K, h1=R).
// Black Ke8 (not g8!). White Qg6, Rh1, Kg1.
// Black king on e8. White Rh8+? h8 is adjacent to... rook on h1 goes to h8. Black king e8 not in check from Rh8 (different file). Hmm.
// Need Black king on g8 again. Let me fix:

test('Attraction v3',
  // Black Kg8, ph7. White Qg6, Rh1, Kg1.
  // Rh1->h8+? But h7 has pawn and h8 is beyond. Let me check if rook can jump: NO.
  // Rook on h1 going to h8 must pass through h7 which has Black pawn. BLOCKED.
  // So Rh8+ is impossible when there's a pawn on h7.
  // That's why the original test failed! The h7 pawn blocks the rook.
  // Solution: remove h7 pawn or put rook elsewhere, or use a different attraction.
  // CORRECT ATTRACTION: White Rxh7+! (CAPTURES h7 pawn = rook takes pawn), king lured.
  // But then Black Kxh7 (lured to h7), and White Qg6-h6# or Qg6-g7#?
  // White Qg6->h6+: queen goes from g6 to h6, one square diagonally... wait h6 is adjacent to h7 (one up from h6 to h7)? No: h6 is one BELOW h7. Queen on h6 attacks h7 (same file)? Yes, adjacent. And h5,h4.. So Qh6+ checks king on h7.
  // But is it mate? King on h7, checked by Qh6. King can go: g7, g8, h8.
  // g8: attacked by Qh6? h6->g7->... Queen on h6 attacks along rank 6 and h-file and diagonals (g5,f4,e3,d2,c1 and g7,f8). Queen attacks g7 diagonal from h6. So g7 is attacked. But g8? Not directly from h6. Can king go g8? Not attacked by Qh6.
  // Need another White piece guarding g8. Or choose a different queen square.
  // After Rxh7+ Kxh7: White Qg5-h5+? q on g5 goes to h5 (one right on rank 5). Check on h7? h5 doesn't attack h7 (different file+rank: h5 to h7 = same file, 2 ranks apart). YES same h-file! Qh5 attacks h7. Check!
  // After Qh5+: king on h7 can go to g6, g7, g8, h8, h6.
  // h6: attacked by Qh5 (h-file, adjacent). Illegal.
  // g6: attacked by Qh5? h5->g6 diagonal. YES. Illegal.
  // g7: attacked by Qh5? h5 diagonal goes to g6 (one diagonal), not g7. g7 from h5: not on h-file, not rank 5, not diagonal. LEGAL - king can go g7.
  // So not checkmate. Hmm.
  // What if there's a White bishop on f5?
  // White: Qd3, Rh1, Bf5; Black: Kg8, ph7.
  // Rxh7+! Kxh7 (attracted to h7), Qd3-h3+ (queen comes to h3, same h-file, checks h7 king), Kg8, Qh8#?
  // After Kxh7, Qh3+: king on h7 in check. Goes to g6, g7, g8, h6, h8.
  // h8: Qh3 on h-file attacks h8? No, h3 to h8 = 5 ranks up, queen attacks the whole h-file. YES, attacked.
  // h6: Qh3 attacks h6 (h-file). Attacked. Illegal.
  // g6: Qh3->g4->... Not on h-file or rank 3 or diagonals going to g6. g6 from h3? diagonal h3->g4->f5... going up-left. g6 not on that line. But Bf5! Bf5 attacks g6? f5->g6 diagonal YES! So g6 is covered by Bf5.
  // g7: attacked by Qh3? Not directly. Bf5 attacks g6 not g7. g7 legal?
  // g8: attacked by Bf5? f5->g6->h7... no. f5->e6->d7... no. f5->g4... wrong direction. Bf5 attacks along f5->g6->h7 (blocked now by king) and f5->e6->d7->c8 and f5->g4->h3 and f5->e4->d3. Bf5 doesn't attack g8.
  // After Kxh7, Qh3+, Kg7: White Qh7#? Queen on h3 goes to h7 where king just left... king is on g7. Qh7 doesn't check g7.
  // This needs more pieces. Let me use the SIMPLEST known attraction checkmate:
  // White: Qf6, Bh6(on h6), Rg1; Black: Kg8, Rf8 (or g7 blocked)
  // White Qg7+!! Rxg7 (lured), Bh6->? wait that's queen sac not rook.
  // OK: known pattern - White Qxh7+! Kxh7, Rh1+ Kg8, Rh8#
  // White: Qe4, Rh1; Black: Kg8, ph7, other black pieces
  // Qe4xh7+! Kxh7 (attracted), Rh1+ Kg8... Rh8#? King on g8 after Kg8. Rh1->h8? h8 adjacent to g8, rook on h-file gives check. Is it mate? King on g8, Rh8 on h8 checking. King can go f7, f8, g7, h7 (rook just left h1, h7 is empty now).
  // h7: king can go h7. Not checkmate unless we cover h7.
  // After Qxh7+ Kxh7, White queen is gone (captured). So White Rh1+ checks on h-file: Kg8, Rh8+?
  // If king goes g7: Rh7#? Rook on h8 can't get to h7 in same move.
  // If king goes f8: Not checkmate.
  // Hmm. Need queen alive after attraction.
  // SIMPLEST WORKING: sacrifice a different piece to attract king, then queen mates.
  // White Rxh7+! (rook sac on h7, capturing pawn), Kxh7 (attracted), Qf5-h5# -- queen goes to h5, mates on h7?
  // Qh5: attacks h7 (same file). Is it checkmate? King on h7, Qh5 below it on h5.
  // King moves: g7, g6, g8, h6, h8.
  // h6: Qh5 attacks h6 (h-file). Illegal.
  // g6: attacked by Qh5? h5->g6 diagonal. YES. Illegal.
  // g8: attacked by Qh5? No. Legal.
  // So king can go g8, not checkmate.
  // What if we cover g8 with something? White Rg1 covers g8!
  // White: Kd1, Qf5, Rg1, Rh2(will go to h7 to sac); Black: Kg8, ph7.
  // But "White Rh2-h7+" captures pawn (Rxh7+), Kxh7, Qf5-h5+:
  //   king moves: g8(Rg1 covers? Rg1 on g-file covers g8), g6(Qh5 covers), h6(Qh5 covers), h8?
  //   h8: attacked by Qh5 (h-file). Illegal.
  //   g7: attacked by Qh5? h5->g6 diagonal YES covers g6 but g7? No.
  //   Wait: does White Rg1 cover g7? Rg1 covers g-file: g2,g3,g4,g5,g6,g7,g8. YES g7 covered.
  // So after Rxh7+ Kxh7, Qh5+: king can't go h8(Qh5), h6(Qh5), g8(Rg1), g7(Rg1), g6(Qh5). CHECKMATE!
  // VERIFY: does queen on h5 cover g6? h5 diagonal to g6: h5->g6 YES (one square diagonal). Covered.
  // Does Rg1 cover g7? Yes (g-file, Rg1 to g7 with no blockers if g2-g6 clear).
  // Black has no pieces to block.
  // White: Kd1, Qf5, Rg1, Rh2; Black: Kg8, ph7. FEN?
  // Board: rank 8: 6k1. rank 7: 7p (h7=pawn). rank1: 3K2RR? wait Rg1 and Rh2 and Kd1.
  // rank1: 3K2RR -- d=K, g=R, h=R? That's "3K2RR" for rank 1? d1=K, e1-f1 empty, g1=R, h1=R? That's 3K2RR but h is last so g1=R, h1=R means "...2RR". But I want Rh2 (rank 2, h-file) not Rh1.
  // Let me rethink positions: White Kd1, Qf5, Rg1, Rh2. Black Kg8, ph7.
  // FEN by rank: r8=6k1, r7=7p, r6=8, r5=5Q2 (f5=Q), r4=8, r3=8, r2=7R (h2=R), r1=3K2R1 (d1=K, g1=R)
  // Full FEN: "6k1/7p/8/5Q2/8/8/7R/3K2R1 w - - 0 1"
  // But wait, this has TWO rooks for White. The attacking rook Rxh7+ uses Rh2, Rg1 stays.
  // Verify: Rh2->h7, captures pawn = Rxh7+. Legal? h3,h4,h5,h6 must be clear (they are). YES.
  // After Rxh7+ Kxh7: position has White Kd1, Qf5, Rg1; Black Kh7, (pawn gone).
  // Then Qf5->h5+: f5 to h5, moving along rank 5. Any blockers? g5 must be clear (it is). Legal. Check!
  // Kh7 escapes: g8(Rg1 on g-file, g8 attacked - BUT is Rg1's path to g8 clear? g2,g3,g4,g5,g6,g7,g8 - all should be clear). g7(Rg1 covers). g6(Qh5 diagonal). h8(Qh5 h-file). h6(Qh5 h-file).
  // All escape squares blocked. CHECKMATE!
  '6k1/7p/8/5Q2/8/8/7R/3K2R1 w - - 0 1',
  ['Rxh7+', 'Kxh7', 'Qh5#']);

// ===== INTERFERENCE =====
// White Rd6! cuts Black Qa6 from Black Rd8 along the d-file... no, Qa6 is on a-file.
// Classic: White Rd6 cuts Black Qe6 from Black Rd8 - they're connected along d-file? No Qe6 is on e-file.
// Correct approach: Rd5! cuts the rank-5 connection between Black Ra5 and Black Ke5?
// Simpler: White piece goes to a square between two Black pieces that share a rank/file/diagonal.
// USE: White Bg5! (interfering on g5) cuts Black Qh6 from Black Rg8 - they share the diagonal h6-g7-f8 or rank? Qh6 and Rg8 are NOT on same line from each other.
// DIRECT: Black Qd8 and Black Ra8 are on the same rank (rank 8). White plays Re8+! (interference, landing between them). But Re8+ might be check not interference.
// TEXTBOOK INTERFERENCE: White has a crushing threat. Two Black pieces defend. White sacrifices a piece between them.
// White threatens Qa7#. Black Ra8 and Black Qa1 both defend a7 (Ra8 via a-file going to a7, Qa1 via a-file going to a7). White Ba7!! (interference) - White bishop goes to a7, blocking both defenders!
// But then White threatens... Qx? The bishop blocks a7 permanently. But what's the mating threat?
// If White queen threatens Qb8# or Qa8#...
// Position: Black Ka8, Qa1, Ra2. White: Qh1, Ba7(sacrificed); White Qh1-a8#?
// After Ba7+!! Ka8 can't go to a7. Kxa7? Then Qa8# mate? Queen on a8, King on a7 - not checkmate unless b6, b7, b8 covered.
// This is VERY position specific. Let me just use a simple verified line:
// White Nd5! interferes between Black Qd7 and Black Rd8 on the d-file.
// Then White wins because Qd7 can no longer protect against threat, and Rd8 can no longer protect Qd7.
// The actual THREAT being unblocked: White queen delivers mate.
// Position: White Qh3 threatens Qh7#. Black Rf7 defends h7. Black Qd7 defends Rf7.
// White Nd5! (interference) - knight goes to d5, between Qd7(on d7) and Rd8? No, Rd8 doesn't defend Rf7.
// Nd5 puts knight on d5. Does d5 interfere with Qd7-Rf7 connection? Qd7 and Rf7 aren't on the same line.
// Qd7 protects Rf7 because Qd7 would capture White Qh3 if it goes to h7? No, Qd7->h3 isn't one move.
// Let me try: White threatens Qxf7+ (capturing). Black Qd7 is the ONLY defender of f7.
// Wait, White needs Qxf7 to be mate, not just a capture.
// WHITE THREATENS QXF7# (checkmate). Black Qd5 defends f7. Black Rd7 also defends f7.
// White Bd6! (interference) - bishop goes to d6, between Black Qd5 and Black Rd7 on the d-file (d6 is between d5 and d7). NOW Qd5 cannot go to d7 (blocked by Bd6), and Rd7 cannot retreat to d5/d6 (blocked). But Bd6 doesn't stop Qd5 from DEFENDING f7 via diagonal or rank.
// Qd5 defends f7 how? d5->e6->f7 diagonal. Bd6 is on d6, not e6. Doesn't block that diagonal.
// Rd7 defends f7 how? Rd7->f7 along rank 7. Bd6 is on d6 (rank 6), doesn't block rank 7.
// So Bd6 doesn't actually interfere with the defenders of f7. Fail.
// We need to put a piece ON THE LINE between defender and what it defends.
// Rd7 defends f7 via rank 7: any piece on e7 would interfere.
// Qd5 defends f7 via diagonal d5-e6-f7: any piece on e6 would interfere.
// White Ne6!! (interference on e6) - cuts Qd5's diagonal AND is adjacent to Rd7's rank.
// Does Ne6 block the diagonal d5-e6-f7? YES (e6 is on the diagonal, so Qd5 can no longer x-ray through to f7).
// But Ne6 is a knight and doesn't physically block lines (pieces don't pass through knights the same way) - WAIT. Knights aren't line pieces. For LINE INTERFERENCE, we need a piece that OCCUPIES a square on the line. Even a knight on e6 physically occupies e6, which DOES break the diagonal d5-e6-f7 for the queen (queen can't slide through a piece on e6). YES this works!
// After Ne6! (interference), White's original threat Qxf7# is now unstoppable (Qd5 blocked by Ne6, Rd7 can still defend f7...).
// Hmm Rd7 still defends f7 along rank 7. Ne6 only blocked the queen's diagonal.
// We need to interfere with BOTH defenders or the whole defence collapses when one is cut.
// OR: just need to cut ONE decisive defender.
// Simplify: ONE defender of f7. That defender is cut by interference. Mate follows.
// White threatens Qxf7#. ONLY Black Rd7 defends f7. White Re7!! (interference) - White rook goes to e7, cutting Rd7 from f7 along rank 7! Now Rd7 can't slide to f7 (Re7 blocks).
// White then plays Qxf7#.
// But can Black Rxe7 (capture the interfering rook)? Yes! Then f7 is defended again by Rxe7... wait Rxe7 removes the rook from d7, now d7 is empty, and e7 has the Black rook. f7 is still defended by rook on e7? Rook on e7 attacks f7 (same rank). So yes, f7 still defended.
// BUT White went Re7!! as a SACRIFICE. After Rxe7, White Qxf7+? Rxf7 (Black rook recaptures), then White plays Qxf7#... wait queen is being captured.
// I need to think about this differently. Interference as a SACRIFICE means Black TAKES the interfering piece, but the act of taking it moves the other defender off its defensive duty.
// Classic example: Rook interposes on the rank between queen and rook. When queen captures the interfering piece, it leaves its diagonal. When rook captures, it leaves its rank. NEITHER capture is possible while maintaining defence.
// Final CLEAN EXAMPLE:
// White threatens Qb8#. Black Ra8 defends b8 (along rank 8). Black Qb4 defends b8 (along b-file).
// White Rb7!! (interference) - occupies b7, between Qb4 and b8 (b-file, b7 between b4 and b8).
// Now if Qxb7: queen leaves b-file, no longer defends b8. White Qb8# follows.
// If Rxb7: rook leaves rank 8, no longer defends b8 (from a8 along rank 8). White Qb8# follows.
// So regardless of how Black takes Rb7, White plays Qb8#!
// EXCEPT: can Black decline (play something else)? Rb7 doesn't give check, so Black can play anything.
// If Black ignores Rb7, White plays Qb8# (still defended by Ra8! because Rb7 blocks b7 not rank 8).
// Wait - after Rb7, is Qb8 still defended by Ra8? Ra8 defends b8 via rank 8, and the path from a8 to b8 is clear (Rb7 is on b7, not b8). So Ra8 STILL defends b8. Hmm, Rb7 doesn't block Ra8's defense of b8 along rank 8.
// Oh I see - Rb7 is on the b-FILE between Qb4 and the b8 square. But Ra8 defends b8 along RANK 8 (a8->b8, adjacent). Rb7 doesn't block that.
// So after Rb7, if Black ignores: White Qb8+, Black Rxb8 (Ra8 takes). Not checkmate.
// INTERFERENCE ONLY WORKS when the interfering piece physically sits between TWO enemy pieces and the TARGET square, cutting BOTH lines simultaneously. OR when it sits on a square that one piece needs to pass through to defend.
// FINAL DEFINITIVE: I'll look at this from the answer backward.
// Position where Re5! works as interference:
// White threatens Qxe8# (queen takes on e8 = checkmate).
// Black Re6 defends e8 via e-file (Re6->e7->e8). Wait, e7 must be empty for this.
// Black Qc5 defends e8 via diagonal c5-d6-e7... wait that goes to e7 not e8.
// Qc5 defends e8 via... c5-d6-e7-f8? No. c5 to e8: is there a diagonal? c5->d6->e7->f8 no. c5->d7... no. Queen on c5 can go to e7 (diagonal c5->d6->e7) but e7 isn't e8.
// Hmm. If Black has Qb5 and Black Re8 is the king's rook at back rank, white threatens Qd8# (not Qxe8).
// White threatens Qd8#. Black Rd5 defends d8 via d-file. Black Qb5 defends d8 via diagonal b5-c6-d7-... b5 to d7 diagonal, d7 defends? No, d7 is not d8.
// Maybe Qb6 defends d8 via diagonal b6-c7-d8. Yes! b6->c7->d8 is a diagonal.
// White Rc7!! (interference on c7) - cuts Qb6's diagonal to d8 (c7 is between b6 and d8 on that diagonal). And also: Rc7 on the c-file... doesn't affect Rd5's d-file defense of d8.
// Hmm, only cuts Qb6's diagonal. Rd5 still defends d8.
// White Rd7!! (interference on d7, between Rd5 and d8 on d-file) - cuts Rd5's defense of d8. And: does Rd7 cut Qb6's diagonal (b6-c7-d8)? Rd7 is on d7, not on b6-c7-d8 diagonal. So only cuts Rd5.
// After Rd7! (sacrifice): If Rxd7 (Black Rd5 takes White Rd7): Rd5 leaves d-file, no longer defends d8. Qb6 still defends via b6-c7-d8. White plays Qd8+? Black Qxd8 or King moves. Not straightforward.
// If Qxd7? Black queen captures on d7: leaves b6, no longer on b6-c7-d8 diagonal. Rd5 still on d-file. Rd5 defends d8. White Qd8+ Rxd8 not mate.
// Hmm, neither capture cuts BOTH defenders.
// For interference to work as puzzle: we need the interfering piece to cut BOTH defenders with ONE move, OR cut the only defender.
// Only one defender scenario: White Rd6! cuts the ONLY defender.
// White threatens Qd8#. Black Qd4 is the ONLY defender (guards d8 via d-file: d4->d5->d6->d7->d8).
// White Rd6!! (interference) - physically on d6 between Qd4 and d8.
// Now Qd4 cannot slide through d6 to defend d8 (Rd6 blocks the d-file between d4 and d8).
// Black MUST take Rd6 or find another defense.
// If Qxd6 (queen takes): queen no longer on d4 or d-file near d8. White Qd8# (queen delivers checkmate with no d-file defender)! But is Qd8 actually checkmate? King must be somewhere where Qd8 = checkmate.
// POSITION: White Kg1, Qg5, Rd1; Black Ke8, Qd4 (only defender of d8).
// White Rd6!! (Rd1->d6, passing through d2,d3,d4? d4 has Black queen - BLOCKED. Can't get to d6.)
// Rook on d1 can't reach d6 because d4 has the Black queen. FAIL.
// Rook needs to come from ANOTHER direction: White Rf6->d6 (along rank 6, if f6 is clear, e6 and d6 clear).
// Or White Rh6->d6.
// POSITION: White Kg1, Qg5, Rh6; Black Ke8, Qd4, no pieces between h6 and d6.
// White Rd6!! (Rh6->d6 along rank 6). Path: g6, f6, e6, d6 must be clear. They are!
// Now Qd4 can't reach d8 (d6 blocked).
// If Qxd6: queen goes from d4 to d6 (2 squares up d-file, legal). After Qd6, White Qg5-d8+?
// King on e8, White queen goes to d8 (from g5, that's... g5 to d8 diagonal? g5->f6->e7->d8 YES!).
// Qd8+ with King on e8: check! King must move. d8 is adjacent, king can't go to d8 (queen there), can go to f7, f8, d7, d8(no), e7(Qd8 attacks e7 diagonally? d8->e7 diagonal yes).
// King goes to f8 or d7. This isn't checkmate, just check.
// REVISED: make Qd8 be checkmate. King needs to be trapped.
// Add Black pawn on f7 (blocks king escape to f7). Add Black piece on d7 (or White piece attacks d7).
// White Qg5 attacks f6 and h6 (and along g-file, rank 5). Qg5 also attacks d8? g5->f6->e7->d8 diagonal YES.
// After Qxd6 (Black queen takes): White Qg5->d8+. King on e8.
// d7: attacked by Qd8? d8 adjacent to d7 along d-file. YES. So d7 is covered.
// f7: if there's a Black pawn on f7, king can't go there because pawn is own piece, and also Qd8 attacks e7. Wait Qd8 attacks f6 diagonal? d8->e7->f6->... d8->e7 (diagonal), d8->c7->b6->a5 (other diagonal). So Qd8 attacks e7, not f6 or f7.
// King on e8 after Qd8+: can go to f8, f7(pawn there if we add it)...
// f8: attacked by Qd8? d8->e7->f6 no. d8 is on rank 8. Queen on d8 attacks f8 (same rank, e8 blocked by king). So Qd8 attacks f8 (along rank 8 east: d8->e8(king)->f8 - BLOCKED by king? Actually king is moving, from e8, so after king moves, the rank is clear... but queen attacks f8 through the now-empty e8? In chess, the queen attacks through empty squares. After king leaves e8, f8 would be attacked by Qd8 along rank 8.
// Hmm, let me think about this differently. After Qxd6 by Black, it's White's turn. White plays Qd8+.
// King on e8 is checked. King's options: d7 (attacked by Qd8, adjacent), f7 (need to check), f8 (need to check), e7 (attacked by Qd8? d8->e7 diagonal YES).
// f7: attacked by Qd8? Not directly. Qd8 attacks diagonals d8->e7->f6(not f7), and d8->c7->b6. Rank 8: a8,b8,c8,d8,e8(blocked),f8,g8,h8. File d: d7,d6(White rook now? No rook moved to d6 and Black Qxd6 took it, so d6 now has Black queen).
// So Qd8 does NOT directly attack f7. King CAN go to f7 (if no other White piece covers it).
// NOT CHECKMATE. This puzzle needs more pieces.
// I'll just find something that works empirically. Using Rh6->d6 position:
'r5k1/5ppp/7R/3q2Q1/8/8/8/6K1 w - - 0 1',
['Rd6', 'Qxd6', 'Qd8#']);
// FEN: rank8=r5k1 (a8=R(black),b-f empty,g8=k,h8=1empty? no: "r5k1" = r,5 empty,k,1 empty = a8=r,b-f empty,g8=k,h8 empty)
// rank7=5ppp (a-e empty, f7=p,g7=p,h7=p)
// rank6=7R (h6=R white)
// rank5=3q2Q1 (a-c empty, d5=q black, e-f empty, g5=Q white, h5 empty)
// Black: Ka8? No g8=k. King is on g8.
// White Rh6, Qg5; Black Kg8, Qd5, Ra8, pawns f7,g7,h7.
// White Rd6!! (Rh6->d6 along rank 6, must cross g6,f6,e6 - all empty).
// After Rd6: Black Qd5 can't reach d8 (Rd6 blocks). White threatens Qg5->d8+?
// g5->d8: diagonal? g5->f6->e7->d8 YES. So Qd8+ is a threat (if King on g8 -> Qd8 doesn't directly attack g8... Qd8 attacks the 8th rank: a8,b8,c8,d8,e8,f8,g8,h8 - YES g8!). So Qg5->d8+ checks Black king on g8 AND would be mate if we get there.
// Actually Qd8+ with king on g8: queen on d8 attacks g8 via rank 8 (d8-e8-f8-g8, with e8 and f8 empty). CHECK.
// After Qd8+: king can go h7(blocked by Black pawn), f8, h8.
// f8: attacked by Qd8 (rank 8). Illegal.
// h8: attacked by Qd8 (rank 8)? d8 to h8 along rank 8 = yes, if path clear. d8-e8-f8-g8(king moved to?)-h8. If king goes to h7 blocked... king goes to h8? d8 attacks h8 (rank 8 with e8,f8,g8 empty after king moves... king was on g8 before). Wait king is MOVING from g8. After Qd8+, king on g8 must move. h8: Qd8 attacks h8 (rank 8 clear). Illegal.
// So after Rd6! Qxd6? Then Qd8+ checks and has no escape... wait, is Qd8 checkmate?
// After Black Qxd6 (takes White Rd6), board: White Kg1,Qg5; Black Kg8,Qd6,Ra8, pawns.
// White Qd8+: Qg5->d8. g5 to d8 diagonal (g5->f6->e7->d8, must be clear: f6 clear, e7 clear YES).
// King on g8 checked. h7 pawn there. f8? Qd8 rank 8 covers f8. h8? Qd8 rank 8 covers h8. g8 king there. What about f7? Not adjacent to g8... wait king moves one square: f7 adjacent? g8->f7 diagonal one square. f7 has Black pawn. King can't move to friendly piece. g7: Black pawn. h7: Black pawn.
// King can't go to f7, g7, h7 (own pawns). Can't go to f8, h8 (Qd8 attacks). Can it go to h7? h7 has pawn. NO.
// IS IT CHECKMATE? King on g8 with Qd8. Escape: f8(attacked), h8(attacked), f7(pawn), g7(pawn), h7(pawn). All blocked. CHECKMATE if Black queen can't block or capture.
// Black Qd6 can it block? To block Qd8+ checking on g8 via rank 8, we'd need a piece on e8,f8 (between d8 and g8). Qd6 can go to... d6 to f8: diagonal d6->e7->f8. YES! Black Qf8 would block the check. So not forced mate unless Qf8 is also covered.
// White Qg5 attacks f6 (diagonal) and... does Qg5 attack f8? g5->f6->... no. g5->h6->... diagonal other direction. g5->f4->... g5->h4... Hmm Qg5 attacks along g-file, rank 5, diagonals: (h6,f6,e7,d8) and (h4,f4,e3,d2,c1). So Qg5 attacks e7 and d8 (already going there) and f6. It does NOT attack f8.
// So Black Qd6->f8 blocks. Not forced mate.
// I need either: (a) White Qg5 to cover f8, or (b) no blocking possible, or (c) different final threat.
// Let me move queen to cover f8 too: Queen on b4 attacks f8 (diagonal b4->c5->d6->e7->f8). But b4 doesn't threaten d8 easily.
// Alternative: What if instead of Qd8, the mate comes differently?
// After Rd6! Qxd6, White plays... Qg5-g7#? g7 has Black pawn. Qxg7#? Queen captures g7 pawn = check on g8? Queen on g7 checks g8? g7 adjacent to g8, queen on g7 attacks g8 (g-file). Is it checkmate?
// King on g8 with Qg7 (White queen on g7). Escape: f8, h8, f7, h7(pawn), and g8 (can't stay).
// f8: attacked by Qg7? g7->f8 diagonal YES.
// h8: attacked by Qg7? g7->h8 diagonal YES.
// f7: Black pawn there, king can't go.
// h7: Black pawn, can't go.
// ALL SQUARES COVERED. CHECKMATE! Qg5xg7# is checkmate!
// But wait: is Qxg7 a capture of Black's g7 pawn? Yes. Does Black have any blocker?
// After Rd6! Qxd6 (forced? or can Black play something else?): Black might not take Rd6.
// If Black doesn't take Rd6, White plays Qxg7# immediately (if that's checkmate without Rd6).
// Qxg7# without Rd6: Black Qd5 can interpose on g5? Qd5->g5? Not one move along any line... d5->g5 is along rank 5, queen can go there in one move. After Qd5->g2 (to interpose on g-file)?
// Wait, Qxg7 is a checkmate threat along the g-file or g7-g8? Queen captures on g7, king is on g8.
// HOLD ON: Is Black king on g8 in check from White Qg5 right now? Qg5 attacks g8 (g-file, g5->g6->g7->g8, with g6 and g7 being Black pawns - BLOCKED). g7 pawn blocks. So Qg5 does NOT currently threaten g8.
// So White Rd6! first: this sets up the threat. After Rd6, what's the threat?
// Rd6 itself doesn't threaten checkmate immediately. We need to establish WHAT the threat after Rd6 is.
// Hmm, let me think about it differently. After Rd6! the threat is Qxg7# (Qg5 takes g7 pawn = check on g8 king, and we showed it's checkmate). But Rd6 doesn't enable Qxg7# - that threat exists independently!
// Why is Rd6 the interference move? What does it interfere with?
// Black Qd5: if White plays Qxg7+, can Black Qd5 block? Qd5 could go to g8 (to interpose between Qg7 and King... but queen IS on g7 checking g8, blocking g8 would require a piece on g8 which is the king). Actually interposing on the g-file between g7 and g8 means putting a piece on g8 - impossible (king is there).
// Can Black Qd5 CAPTURE White Qg7? d5 to g7: is d5->g7 one queen move? d5 to g7: deltaX=3, deltaY=2 - NOT a valid queen move (not same rank/file/diagonal). So Black queen can't take White queen on g7.
// So Qxg7# IS checkmate already! Without needing Rd6!
// Wait, but then Rd6 is unnecessary. The puzzle would just be Qxg7# in 1 move. Let me verify that Qxg7# is legal from the starting FEN.
// FEN: r5k1/5ppp/7R/3q2Q1/8/8/8/6K1 w - - 0 1
// White Qg5 can take g7: g5->g7 means going up 2 ranks on g-file: g5->g6->g7. g6 must be empty. In FEN rank 6 = "7R" (h6=White Rook, a-g empty). So g6 IS empty! White Qxg7 is legal. And we showed it's checkmate. So the puzzle is a 1-move mate, not a 3-move interference puzzle.
// The starting FEN is wrong for interference. I need Black pawn on g6 (blocking Qg5 from going to g7 directly), and Rd6 would then interfere to enable an attack around it.
// Let me just move on and test different positions empirically.

// QUICK EMPIRICAL APPROACH: I'll test a bunch of positions
// For interference, use: White Rd5!! cuts Black Qa5 from Black Re5.
// Position: Qa5 and Re5 are on the same rank (rank 5). White Rd5 goes between a5 and e5.
// But White rook going to d5 would need to come from d-file or rank 5 (from east or west of d5).
// Black pieces: Qa5, Re5. White threatens Qxa5? or something on f5.
// If White Rd5! lands between them, Qa5 can't connect to Re5 along rank 5.
// Result: Qa5 can't retreat to defend via rank 5, and Re5 can't get to a5 via rank 5.
// But what does this enable? Need a mating/winning threat.
// White Qh5: threatens Qxa5 (captures Black queen). Black Ra5 normally defends Qa5 (via a-file)? No, Qa5 and Ra5 can't coexist.
// Let me try yet another approach. I'll use a known textbook puzzle position.
// Morphy's classic: White Rd6!! (actually this is from Morphy vs Duke of Brunswick, 1858)
// The famous interference: White plays Rd1-d8+! Rxd8 (forced), Rxd8# (back rank mate). Wait, that's not interference, that's deflection/back rank.
// OK I found a simple one:
// White threatens mate with Qxf7#. Black Re8 defends f7... no Re8 doesn't defend f7.
// Black Rf7 defends f7 (sits on it). White's queen threatens Qxf7 because Rf7 is undefended.
// If Black Qd7 defends Rf7, White plays Re7!! (interference) - interposes between Qd7 and Rf7 on rank 7. Qd7 can't reach f7 anymore (Re7 blocks). White Qxf7# is now unstoppable.
// POSITION: White Kh1, Qg6, Re1; Black Kg8, Rf7 (on f7), Qd7.
// White Qg6 threatens... Qxf7+ (takes rook). If Qxf7 is checkmate (king on g8, queen on f7):
// King escapes: f8, h8, h7, g7, h6? Qf7 attacks g8 (diagonal f7->g8), f8 (f-file f7->f8), g6(diagonal), e8(rank 7? no f7->e8 diagonal YES f7->e8 diagonal). h7? Queen on f7 doesn't attack h7 directly. h8? f7->g8->h9? No.
// King on g8, Queen on f7: g7(attacked? f7->g7 rank 7 wait no, f7 to g7 is same rank. YES attacked), f8(f-file), g8(diagonal f7->g8... actually f7 checks g8? f7->g8 is one square diagonally, YES). Already in check. King goes h8: f7 doesn't cover h8 (would need h7 or g8 intermediate). h7: f7->g6->... no. f7->h5? No. Qf7 attacks: rank 7 (a7-h7), f-file (f1-f8), diagonals (e6,d5,c4,b3,a2 and e8,d9...) wait e8 from f7: diagonal f7->e8. And the other diagonal: g8, h9(off board). So Qf7 attacks g8 (diagonal), e8 (diagonal), h7 (rank 7), f8 (f-file), f1-f6 (f-file). h8 is NOT attacked by Qf7. So king can escape to h8. Not checkmate.
// Unless White Rg1 covers g8 and Rh1 covers h8? Too many pieces.
// I'll just brute force test a known interference puzzle:
// After a LOT of analysis, let me just use this classic setup I'm fairly confident about:
// White: Kh1, Qd1, Rd8(sacrifice); Black: Ke8, Rh8, Qf6
// White Rd6!! interference between Qf6 and Rh8... they're not on a common line.
// Qf6 on f6, Rh8 on h8: is there a line connecting them? Diagonal? f6->g7->h8 YES diagonal!
// White Rg7!! (interference on g7, between Qf6 and Rh8 on the diagonal f6-g7-h8).
// After Rg7! If Qxg7: queen leaves f6, no longer has access to h8 (and White plays Rxh8#?).
// Wait, after Qxg7, what's White's mating move? White Qd1->d8? Rd8 is now... we said White Rg7 (Rd8 moved to g7). Hmm no, if White has Rg7 (moved there as the interference piece) then Rd8 no longer exists.
// Let me set up properly: White Kh1, Qd1, Rg8 (already on g8); Black Ke8, Qf6, Rh8... wait g8 and h8 both on rank 8.
// SIMPLER: I'll just use a position where the interference is a 3-move line I can test.
// White: Ka1, Rd1, Qh5; Black: Ke8, Qd5, Rd8
// White Rd6! (interference between Qd5 and Rd8 on d-file):
//   path from Rd1 to Rd6: d2,d3,d4,d5(Black queen!). BLOCKED. Can't reach d6.
// White Rf6! from f1 (to f6, staying on f-file: f2,f3,f4,f5 must be clear).
//   But what does Rf6 interfere with? Qd5 and Rd8 are on the d-file, not f-file. Rf6 doesn't cut them.
// White Qh5->d5!! sacrifices queen on d5 (takes Black queen). Then Rd1->d8+? Ka8? Rxd8#? No king is on e8.
// Rd1->d8+ checks Ke8. Kf7? Rd7+ Kg6, Rg7# ... that's a rook chase not interference.
// After Qxd5, White Rd8+ Kf7, Rd7+ Ke6, Re7#... 5-move line: Qxd5, Rxd5(Black rook takes), Rd8+ Kf7, Rd7#? Let me check: after Qxd5 Rxd5 (Black rook retakes), White Rd1->d8+? Rd1 path: d2,d3,d4 clear (queen left d5... wait Qxd5 means White queen went to d5 and was captured by Rxd5 meaning Black Rd8->d5, so now d8 is empty and Black Rook is on d5). White Rd1->d8+! (d8 now empty). Check on Ke8. Kf7 (only move if d7 attacked), then White Rd8->d7+ (wait, rook went to d8 last move). Actually from d8, Rd8->f8#? Ke8 king went to f7. Rd8->f8? Not valid (rook can't go diagonally). Rd8->d7+, king on f7 not checked.
// OK I'm spending way too much time on interference. Let me write a test script that tries many concrete positions and finds one that works.
'8/8/8/8/8/8/8/8 w - - 0 1', []); // placeholder

// INTERFERENCE: try the classic discovered attack setup
// White: Kg1, Qb3, Rh5; Black: Ka8, Qa2, Ra3 (Qa2 and Ra3 connected on a-file)
// White Rb5+! Ka7? No - we can't put Black in check at the start. Rh5->a5?
// After Ra5+: Ka8 MUST move. But we can't have Black in check at the start.
// White Ra5 (non-check): blocking a-file between Qa2 and Ra3? Ra5 is ABOVE both (a5 > a3 > a2 going up-file). So Ra5 doesn't sit BETWEEN Qa2 and Ra3 (which would need to be between a2 and a3 = a2.5, impossible since no squares between adjacent ranks).
// What if Qa2 is on a2 and Ra8 is on a8? White Ra5! interferes between a2 and a8 on a-file (a5 is between a2 and a8). After Ra5! Qa2 can't reach a8 via a-file (blocked at a5) and Ra8 can't reach a2 via a-file.
// NOW the threat: White Qb3->b8# (goes to b8, adjacent to Ka8? if king is on a8 that's check. White Qb8 with King on a8: b8 is adjacent, queen on b8 checks. Escape: a7 (Qb8->a7? no but queen attacks a7 from b8? b8->a7 diagonal YES). So king can't go a7. b7? Qb8 attacks b7 (b-file). Can go to a7 only escape? a7 attacked.
// Hmm but if Ra5 is protecting b5 (no it's on a5)...
// After Ra5! if Black Qxa5 (takes rook), queen leaves a2, can't interpose on a8? White Qb8#:
// King on a8, queen on b8. Can Black do anything? Queen is gone. Rooks: Ra8 has Black rook. Qb8 is adjacent. Rxa8... Black Ra8 takes? No wait, Black Ra8 is on a8 where the king is... can't have rook and king on same square. Let me reconsider.
// Position: Black Ka8, Qa2, and separate Ra-something.
// Black: Ka8, Qa1, Rb8 (NOT Ra8, that's where king is). White: Kh1, Qh3, Ra5 (moving there).
// White Ra5! (Rh5->a5? or Ra1->a5 passing through a2 where Qa1 is... blocked).
// Getting complicated. Let me just test empirically and iterate quickly.

// Test known Smothered Mate related positions for simple 3-movers
test('Desperado test',
  // Desperado: doomed piece captures best target before dying
  // White Rg4 is attacked by Black Bf5. White also has Qe2.
  // White Rxg7!! (captures best available target, pawn on g7 protected by Kh8? actually Rxg7+)
  // Simple: White Rh5 is attacked (by Black pawn h6? or Black queen). White captures best thing first.
  // White: Kg1, Rh5(attacked), Qd1; Black: Kh8, Qd8, pawn h6 (attacks Rh5)
  // White Rxd8+!! (desperado - rook doomed by h6 pawn, captures queen first), Kxd8, Qxh5 (recapture - but h6 still threatens? h6 pawn still attacks h5 square. After Kxd8, Qxh5: White queen takes rook? No, White Rh5 is the doomed piece. After Rxd8+ Kxd8, now White captures the rook with what? Rh5 was the piece that did Rxd8, so it's now on d8.
  // Wait: Desperado: The piece on h5 is doomed (will be captured by h6 pawn). Instead of just losing it, it captures the Black queen on d8 (Rxd8+). After Kxd8 (king takes rook), White Qxh5? h5 is now empty (rook was there and moved). White has Qd1, King at d8 is exposed.
  // This doesn't work as described. Let me restart:
  // Desperado: White piece X is hanging (will be captured). X captures something valuable before dying.
  // White: Kg1, Qe1, Rg5; Black: Ke8, Qg7, Bg6 (Bg6 attacks Rg5, so Rg5 is hanging).
  // White Rxg7+!! (desperado: rook captures Qg7 before dying to Bg6), Kxg7 (or Bxg7 nope Bg6 can't take Rg7... wait Bg6 can take Rg5 going from g6 to g5? Bishop on g6 moves diagonally, g6->f5 or g6->h5 or g6->h7 or g6->f7. It CANNOT go to g5 (same file, non-diagonal). So Bg6 doesn't threaten Rg5!
  // Let me use a bishop that actually attacks the rook: Black Bf3 attacks White Rg4 (f3->g4 diagonal).
  // White: Kg1, Rg4(attacked), Qe2; Black: Ke8, Bf3, Qd8.
  // White Rxd8+!! (desperado), Kxd8, Qxf3 (recaptures bishop - actually bishop is on f3 taking Rg4 next move if we do nothing. After Rxd8+ Kxd8, White Qxf3 wins bishop).
  // But this is a 3-move line ending in material win, not checkmate. That's OK per spec.
  // Does Rxd8+ work? Rg4->d8: diagonal? NO. Rook moves in straight lines only. g4 to d8: not same file or rank. ILLEGAL.
  // Rook on g4 can go to g8 (g-file, g5,g6,g7 must be clear) for Rg8+. Then Kxg8, Qxf3.
  // White Rg4->g8+ (desperado on g8! captures what's there? g8 has nothing in this FEN).
  // White Rg4->d4 (just moves away from attack? not desperado).
  // For desperado, the rook must capture something valuable while being attacked.
  // Rook on g4 attacked by Bf3. Rook captures the most valuable nearby piece.
  // White Rxg7! captures Black Queen on g7! (if queen is on g7, not d8).
  // White: Kg1, Rg4(attacked by Bf3), Qe2; Black: Ke8, Bf3, Qg7.
  // White Rxg7!! (desperado: rook going to die, captures queen on g7 first), Kxg7 (or Bxg7? Bf3 can take Rg7? f3->g4->... bishop from f3 to g7 would be f3-g4-h5-... no that's diagonal going wrong way. f3->e4->d5->c6->b7->a8 or f3->g4->h5. f3->g2->h1 other diagonal. Bf3 to g7 is not one move for bishop (f3 to g7: delta x=1, delta y=4 - not a valid bishop move). So Bf3 CANNOT capture Rg7. Black Kxg7 instead? Or just Rxg7 is safe from bishop? Yes, bishop can't take the rook on g7.
  // After Rxg7+?? wait does Rxg7 give check? Black king on e8. Rg7 on g7 - does it check e8? No, g7 is not on same file, rank, or diagonal as e8. Rxg7 is not a check.
  // But Black Bf3 still threatens Rg4... wait Rg4 MOVED to g7. So Bf3 no longer threatens anything immediate.
  // This isn't a desperado properly - the rook escaped without being captured. A true DESPERADO means the piece IS going to be captured (no escape) and sacrifices itself capturing something valuable.
  // For true desperado: the piece has no square to escape to AND it's attacked. Or it's en prise.
  // Simplify: White Rc5 is pinned or trapped, will definitely be captured. So it captures the most valuable thing first.
  // White: Kg1, Rc5, Qe1; Black: Ke8, Qb5 (attacks Rc5), Rb8.
  // White Rc5 is attacked by Qb5. Can White rook escape? Rc5 can go to: c1-c8 (c-file) or a5-h5 (rank 5). But we say it's "desperado" meaning player accepts the rook is lost and plays the most valuable capture first.
  // White Rxb5!! (desperado: takes the attacking queen!), Qxb5... wait if White takes Qb5, the queen IS the attacker, and taking it removes the threat. That's just winning material, not desperado.
  // Desperado: the piece is GOING to be captured no matter what. It captures something to not die in vain.
  // True scenario: White piece is captured NEXT MOVE by MULTIPLE attackers (can't avoid capture), so it captures something valuable NOW.
  // White: Kg1, Qe1; Black: Ke8, Ra1, Rb1 (two Black rooks attack White queen on... wait queen can just move).
  // Actually desperado often involves an exchange sequence: White captures something, Black recaptures (taking the desperado piece), but White gained material.
  // Simple: White Re5 is attacked by Bd6 and Nf3. White plays Rxe8+!! (desperado - takes something on e8). Kxe8 (king takes), White's rook is gone but gained material.
  // Let's go with: White: Kg1, Re5(attacked by Bd4 and Nf7); Black: Ke8, Bd4, Nf7, Qd8.
  // White Re5xd5!! (desperado on d5? nothing there) or Rxf5? or Rxe8+!?
  // If White Rxe8+!! (rook goes to e8, takes... what's on e8? Black Queen is on d8, not e8. Hmm).
  // WHITE RXD8+! (Rook on e-file? No, Re5 can't reach d8 in one move: e5->d8 not valid).
  // White Re5->e8+!! Check. Black King on e8... wait king IS on e8, so Rxe8 = White captures king? Illegal, kings can't be captured.
  // I need Black king NOT on e8. Black: Kg8, Bd4 (attacks Re5? d4->e5 diagonal YES!), Nf7 (attacks Re5? f7->e5... knights go 2+1: f7->e5 YES! knight move from f7 to e5 is valid (delta: 1 file, 2 ranks). So both Bd4 AND Nf7 attack Re5.
  // White Re5 is lost (two attackers). White Rxf7!! (desperado: captures Nf7 before dying). Kxf7 (king recaptures since no other piece there). White Re5 is now gone (it moved to f7). But White captured the knight! Net: traded rook for knight (bad, unless we get more).
  // Better: Rxd4!! (captures bishop). Bxd4... wait Bd4 takes Re5 first? After Rxd4, the bishop is captured by the rook. Then Black Nf7 can take... nothing (rook moved from e5 to d4). Black Nxd4? Knight on f7 takes on d4 (f7->d6? no. f7->e5? delta: 1,2 from f7 to e5 yes. f7->d6 delta: 2,1 yes). Knight f7->d8 (delta: 2,1) yes. f7->d6: delta x=-2, delta y=-1 valid knight move. Knight f7 to d4? delta x=-2, delta y=-3 NOT valid. So Nf7 can't take Rd4. Knight f7 can go to: d6, d8, e5, g5, h6, h8. e5 is where rook WAS (now empty). Nd5? f7->d5... delta x=-2, delta y=-2 not valid. Nxe5? f7->e5 valid (as we said). But e5 is empty now (rook moved). Ne5 is a legal knight move to empty e5 but doesn't capture anything.
  // After Re5xd4 (desperado): White gained Black's bishop (Bd4). Black can try to get something but can't easily recapture. This is a winning desperado!
  // But: White is trading rook for bishop (losing material), even if it was "going to be captured." Let me check the original material: White Re5 attacked by Bd4 and Nf7. If White doesn't play desperado, Black Bxe5 wins a rook (gaining rook, losing bishop = rook trade? No: Black Bd4 captures White Re5 = Black gains rook. White originally had rook. If White plays Re5xd4!! Black Nf7 can't recapture on d4. So White gains bishop while losing rook? No wait: White rook TAKES bishop (Rxd4), White rook is NOW on d4. Black Nf7 can try to take on d4: Nf7->d4? delta x=-2, delta y=-3 NOT valid knight move. Black Bd4 is now gone (White rook captured it). So White rook on d4 is still attacked by... just Nf7? Nf7->d4 invalid. So White rook on d4 is SAFE after Rxd4! That means the rook escaped AND captured the bishop. That's not desperado, that's just a good move.
  // I'm overanalyzing this. For desperado the piece needs to be TRULY TRAPPED. Let me use:
  // White Rg7 is attacked by BOTH Black Kh8 (adjacent) and Black Qg4.
  // White: Kg1, Rg7(attacked), Qc3; Black: Kh8, Qg4, Rf8.
  // Wait, king can't "attack" like a piece in this context - king captures are fine.
  // After Black Kxg7 recaptures... but White's turn first. White Rg7xf7!! (desperado, captures Rf8? Rf8 is on f8 not f7. Captures pawn on f7? if there's one).
  // Let me just pick a clean 1-move desperado puzzle:
  // White Rb5 is attacked by Black Qa5. White plays Rxb8+!! (desperado, captures something on b8).
  // Black Kxb8 (king takes), White has traded rook for whatever was on b8.
  // If b8 has Black queen: White Rxb8+! Qxb8... wait Qa5 is attacking Rb5, not on b8.
  // Two attackers: if ONLY one attacker, the piece can just move away.
  // For desperado: piece is truly trapped (can't escape the capture).
  // Simplest: White rook is pinned on the queen (can't move without exposing king to check), so it captures before being taken.
  // White: Ke1, Rg1; Black: Ke8, Bg8 (pinning nothing), Rg8 (on g8). Black's rook attacks White's rook on g1 (g-file pin if king were on g-file... White king is on e1, not g-file).
  // Actually for a pin desperado: White Rd1 is pinned by Black Qd8 (same d-file, king on e1... not d1 = not pinned).
  // For rook truly unable to escape: rook surrounded. Rc3, a3=Black Rook, c8=Black Rook, h3=Black Rook, c1=Black Rook (four rooks surrounding). That's contrived.
  // FINAL DECISION FOR DESPERADO:
  // 1-move solution: White piece (about to be captured) takes the most valuable enemy piece.
  // White Rb5 is under attack. If we want it to seem "desperado," we'll set up that Black can take on Rb5 BUT White goes Rxb7+! (captures more valuable piece first).
  // This is valid as desperado even if technically White's rook had escape squares - the SPIRIT is "take the best capture with your doomed piece."
  '4k3/1r6/8/1R6/8/8/8/4K3 w - - 0 1',
  ['Rxb7', 'Rxb5', 'Ke2']); // 3-move line but doesn't end in checkmate
  // White Rb5, Black Rb7. White Rxb7 (takes rook), Black Rxb5 (retaliates), White Ke2. Not a real puzzle.
  // This test is just to see if moves are legal. Not the actual puzzle.

console.log('\nDone testing.');
