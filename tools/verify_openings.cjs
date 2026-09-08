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

const only = process.argv[2];
for (const line of Object.keys(Courses.COURSES)) {
  if (only && line !== only) continue;
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
      if (!pre) bad(`lines[${i}] ${L.name || ''}`, 'ne commence pas par la ligne de base du cours');
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
