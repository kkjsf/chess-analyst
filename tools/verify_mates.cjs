// Verificateur du cours « Mats & finales », lu dans js/mates.js lui-meme.
//
// Il verifiait une COPIE en dur de 16 exercices sur 56 : les positions
// corrigees ou ajoutees dans mates.js ne passaient jamais par lui. Et il ne
// testait pas la legalite des positions de depart - 6 mats commencaient avec le
// roi noir DEJA en echec, trait aux Blancs (2026-09-25).
//
// Controles :
//   (a) chaque FEN (diagramme et exercice) se charge et le camp qui n'a PAS le
//       trait n'est pas en echec ;
//   (b) chaque solution se rejoue en SAN STRICT ;
//   (c) une solution terminee par « # » finit sur un mat ; une finale
//       (champ `outcome`) n'a pas a mater.
const C = require('../js/chess.min.js');
const Chess = C.Chess || C;
const Mates = require('../js/mates.js');

let fail = 0, n = 0;
const bad = (tag, why) => { fail++; console.log('FAIL ' + tag + '  -> ' + why); };

function legalStart(fen) {
  const g = new Chess(fen);
  const t = fen.split(' ');
  t[1] = t[1] === 'w' ? 'b' : 'w';
  t[3] = '-';
  if (new Chess(t.join(' ')).in_check()) return 'le camp qui n\'a pas le trait est en echec';
  return g.fen() ? null : 'FEN rejetee';
}

for (const m of Mates.MATES) {
  if (m.fen) {
    n++;
    // Un diagramme sans trait (souvent la position de mat finale) est legal si
    // l'un des deux traits l'est.
    const sides = m.fen.split(' ').length >= 4 ? [m.fen] : [m.fen + ' w - - 0 1', m.fen + ' b - - 0 1'];
    try { if (sides.every(f => legalStart(f))) bad(m.id + ' (diagramme)', 'les deux rois sont en echec'); }
    catch (e) { bad(m.id + ' (diagramme)', 'FEN rejetee'); }
  }
  (m.puzzles || []).forEach((p, i) => {
    n++;
    const tag = m.id + '[' + i + ']';
    try {
      const why = legalStart(p.fen);
      if (why) return bad(tag, why);
      const g = new Chess(p.fen);
      for (const san of p.sol) {
        if (!g.move(san)) return bad(tag, 'coup illegal ou SAN non canonique : ' + san);
      }
      const last = p.sol[p.sol.length - 1];
      if (/#$/.test(last) && !g.in_checkmate()) return bad(tag, 'annonce # mais ne mate pas');
      if (!/#$/.test(last) && !p.outcome && m.group !== 'finales') return bad(tag, 'ni mat ni `outcome`');
    } catch (e) { bad(tag, 'ERREUR ' + e.message); }
  });
}

console.log('\n' + n + ' positions, ' + (fail ? ('❌ ' + fail + ' echec(s)') : '✅ tout est vert'));
process.exit(fail ? 1 : 0);
