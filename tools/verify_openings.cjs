// Verifie hors-ligne le contenu ajoute aux cours d'ouverture : chaque FEN est
// legale, chaque `sol` se joue reellement dans la position, et chaque ligne de
// `lines[].sans` est jouable du premier au dernier coup.
//
//   node tools/verify_openings.cjs            # tout le catalogue Courses
//   node tools/verify_openings.cjs "e4 e5"    # une seule entree
//
// Aucun moteur : on ne juge pas la QUALITE d'un coup ici (c'est le role de
// tools/verify_lessons.cjs), seulement sa legalite et la coherence des FEN.
const path = require('path');
const Chess = require(path.join(__dirname, '..', 'js', 'chess.min.js')).Chess
  || require(path.join(__dirname, '..', 'js', 'chess.min.js'));
const Courses = require(path.join(__dirname, '..', 'js', 'courses.js'));

let fail = 0, checks = 0;
const bad = (where, msg) => { fail++; console.log('  ✗ ' + where + ' — ' + msg); };
const ok = () => { checks++; };

function playLine(sans, from) {
  const g = from ? new Chess(from) : new Chess();
  for (const san of sans) {
    const m = g.move(san, { sloppy: true });
    if (!m) return { g, err: 'coup illégal : ' + san };
  }
  return { g };
}

function checkFenSol(where, fen, sol) {
  let g;
  try { g = new Chess(fen); } catch (e) { return bad(where, 'FEN rejetée'); }
  if (g.fen().split(' ')[0] !== fen.split(' ')[0]) return bad(where, 'FEN non canonique');
  const r = playLine(sol, fen);
  if (r.err) return bad(where, r.err + ' (dans sol)');
  ok();
}

const ALIASES = Courses.ALIASES || {};
const only = process.argv[2];
for (const line of Object.keys(Courses.COURSES)) {
  if (only && line !== only) continue;
  // Cle alias (autre ordre de coups) : meme objet que la cle canonique, deja verifie.
  if (ALIASES[line] && !only) continue;
  const c = Courses.COURSES[line];
  console.log('── ' + line);

  // La ligne de base du cours doit etre jouable, et etre le prefixe des lignes.
  const baseSans = line.split(' ');
  const rb = playLine(baseSans);
  if (rb.err) bad('ligne de base', rb.err); else ok();

  (c.lines || []).forEach((L, i) => {
    const r = playLine(L.sans || []);
    if (r.err) bad(`lines[${i}] ${L.name || ''}`, r.err);
    else {
      ok();
      const pre = baseSans.every((s, k) => L.sans[k] === s);
      // `altOrder: j` = la ligne joue le MEME plan dans un autre ordre de coups
      // (le Londres classique 2.Cf3 3.Ff4 face a l'accelere 2.Ff4). On n'exige
      // alors pas le prefixe, mais deux choses plus fortes : les coups de la
      // ligne de base sont bien joues dans le meme ORDRE RELATIF, et la position
      // finale est identique a celle de la ligne `j` (sinon ce n'est pas une
      // transposition, c'est une autre variante).
      if (typeof L.altOrder === 'number') {
        let k = 0;
        for (const san of L.sans) { if (san === baseSans[k]) k++; }
        if (k < baseSans.length) bad(`lines[${i}] ${L.name || ''}`, 'altOrder : les coups de la ligne de base ne sont pas tous joues dans le meme ordre');
        else ok();
        const ref = (c.lines || [])[L.altOrder];
        const rr = ref ? playLine(ref.sans || []) : null;
        if (!rr || rr.err) bad(`lines[${i}] ${L.name || ''}`, 'altOrder pointe sur une ligne absente ou illegale');
        else if (rr.g.fen().split(' ')[0] !== r.g.fen().split(' ')[0])
          bad(`lines[${i}] ${L.name || ''}`, `altOrder : ne transpose pas sur lines[${L.altOrder}] (positions finales differentes)`);
        else ok();
      } else if (!pre) bad(`lines[${i}] ${L.name || ''}`, 'ne commence pas par la ligne de base du cours');
      if (L.notes && L.notes.length > L.sans.length)
        bad(`lines[${i}] ${L.name || ''}`, `${L.notes.length} notes pour ${L.sans.length} coups`);
    }
  });

  (c.traps || []).forEach((t, i) => { if (t.fen && t.sol) checkFenSol(`traps[${i}] ${t.title || ''}`, t.fen, t.sol); });
  (c.punish || []).forEach((d, i) => {
    if (!d.fen || !d.sol) return bad(`punish[${i}] ${d.label || ''}`, 'fen ou sol manquant');
    checkFenSol(`punish[${i}] ${d.label || ''}`, d.fen, d.sol);
  });
  (c.quiz || []).forEach((q, i) => {
    if (q.fen && q.sol) checkFenSol(`quiz[${i}]`, q.fen, q.sol);
    else if (!Array.isArray(q.opts) || typeof q.answer !== 'number' || !q.opts[q.answer])
      bad(`quiz[${i}]`, 'QCM incomplet');
    else ok();
  });
  if (c.target) {
    if (!c.target.fen) bad('target', 'fen manquant');
    else {
      try { new Chess(c.target.fen); ok(); } catch (e) { bad('target', 'FEN rejetée'); }
      for (const sq of c.target.goals || [])
        if (!/^[a-h][1-8]$/.test(sq)) bad('target.goals', 'case invalide : ' + sq);
    }
  }
  if (c.keep && c.keep.length !== 3) bad('keep', `${c.keep.length} phrases au lieu de 3`);
}

console.log(`\n${checks} contrôles OK, ${fail} échec(s).`);
process.exit(fail ? 1 : 0);
