// Tests unitaires du coeur logique : lecture du plateau (js/tactics.js) et
// classification / agrégats (js/analysis.js).
//
// Pourquoi ce fichier existe : les scripts verify_*/validate_* valident le
// CONTENU (les FEN sont légales, les lignes se jouent), jamais le CODE. Or les
// bugs qui ont fait le plus de dégâts étaient tous des bugs de fonction pure sur
// entrée connue : le roi « repris pour 100 » dans seeOn, netGain qui sortait de
// sa boucle trop tôt, la promotion invisible, le pat confondu avec « rien ».
// Chacun se voit ici en une seconde.
//
//   node tools/test_core.cjs
//
// Aucune dépendance hors chess.js (déjà dans tools/node_modules). Pas de moteur :
// c'est volontaire, ces tests doivent tourner en une seconde avant chaque push.

const path = require('path');
const ROOT = path.join(__dirname, '..');

global.Chess = require('./node_modules/chess.js/chess.js').Chess;
const Tactics = require(path.join(ROOT, 'js/tactics.js'));
global.Tactics = Tactics;
global.Openings = require(path.join(ROOT, 'js/openings.js'));
const Analyzer = require(path.join(ROOT, 'js/analysis.js'));

let pass = 0, fail = 0;
const fails = [];

function check(group, label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; fails.push(`${group} / ${label}\n      attendu ${JSON.stringify(want)}, obtenu ${JSON.stringify(got)}`); }
}

// Joue un coup et rend { fenBefore, fenAfter, move }. Rend null si illégal —
// une position de test fausse doit se voir, pas passer inaperçue.
function play(fen, from, to, promotion) {
  const g = new Chess(fen);
  const m = g.move({ from, to, promotion: promotion || 'q' });
  return m ? { before: fen, after: g.fen(), move: m } : null;
}

function T(group, label, fen, from, to, fn, want, promotion) {
  const p = play(fen, from, to, promotion);
  if (!p) { fail++; fails.push(`${group} / ${label}\n      COUP ILLÉGAL (${from}${to}) — position de test à corriger`); return; }
  check(group, label, fn(p), want);
}

// ─────────────────────────── seeOn (échange statique) ───────────────────────
{
  const G = 'seeOn';
  const see = (fen, sq, color) => Tactics.seeOn(Tactics.boardOf(fen), sq, color);

  // Le piège nº1 : on ne « gagne » pas un roi. Sans le retour 0, une reprise du
  // roi empoisonnait la récursion et le gain explosait.
  check(G, 'un roi ne se capture pas', see('4k3/8/8/8/8/8/8/4K2R w - - 0 1', 'e8', 'w'), 0);

  check(G, 'pièce libre : on encaisse tout',
    see('3q4/8/8/8/8/8/8/3R4 w - - 0 1', 'd8', 'w'), 9);
  // Fou défendu par la tour d8 : prendre coûte une tour (5) pour un fou (3).
  check(G, 'pièce défendue : tour contre fou = mauvais échange',
    see('2br4/8/8/8/8/8/8/2R5 w - - 0 1', 'c8', 'w'), -2);
  check(G, 'échange équilibré rend 0 ou mieux, jamais négatif à tort',
    see('8/8/8/3p4/8/8/8/8 w - - 0 1', 'd5', 'w'), 0); // aucun attaquant blanc
}

// ─────────────────────────── netGain (le juge de paix) ──────────────────────
{
  const G = 'netGain';
  const ng = (p) => Tactics.netGain(p.after);

  T(G, 'mat = 1000', '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1', 'a8', ng, 1000);

  // Le bug corrigé en v184 : une fourchette reprise au coup suivant ne rapporte
  // rien. Elle doit tomber à 0 ou en négatif, pas rester positive.
  T(G, 'dame qui pend : gain franchement négatif',
    'r6r/ppp1kppp/2n5/7q/3Q4/8/PPP2PPP/R3K2R w - - 0 1', 'd4', 'd5', ng, -9);

  // F6 — la promotion compte des deux côtés.
  T(G, 'promotion imparable au coup suivant',
    '7k/P7/1K6/8/8/8/8/8 w - - 0 1', 'b6', 'b7', ng, 8);
  T(G, "l'adversaire fait dame en défense : ça coûte",
    '7k/8/8/8/8/8/1p6/R6K w - - 0 1', 'a1', 'a5', ng, -8);

  // F6 — le pat n'est pas « rien ne se passe », c'est la nulle.
  T(G, 'pat repéré comme tel',
    '7k/5Q2/8/8/8/8/8/K7 w - - 0 1', 'f7', 'g6',
    (p) => Tactics.isStalemate(p.after), true);
  T(G, "échec normal n'est pas un pat",
    '7k/5Q2/8/8/8/8/8/K7 w - - 0 1', 'f7', 'f6',
    (p) => Tactics.isStalemate(p.after), false);
}

// ─────────────────────────── threats ────────────────────────────────────────
{
  const G = 'threats';
  const th = (p) => Tactics.threats(p.before, p.after, { from: p.move.from, to: p.move.to });

  T(G, 'promotion créditée par le coup lui-même',
    '7k/P7/1K6/8/8/8/8/8 w - - 0 1', 'a7', 'a8', (p) => th(p).net, 8);
  T(G, 'pat : net ramené à 0, drapeau posé',
    '7k/5Q2/8/8/8/8/8/K7 w - - 0 1', 'f7', 'g6',
    (p) => { const t = th(p); return [t.net, t.stalemate]; }, [0, true]);
  T(G, 'la phrase nomme le pat avant tout le reste',
    '7k/5Q2/8/8/8/8/8/K7 w - - 0 1', 'f7', 'g6',
    (p) => /Pat/.test(Tactics.threatSentence(th(p), true)), true);
}

// ─────────────────────────── detectFork (F5) ────────────────────────────────
{
  const G = 'detectFork';
  const fk = (p) => !!Analyzer.detectFork(p.before, p.after, p.move);

  // Le faux positif que l'ancien détecteur géométrique produisait : deux pièces
  // sur les lignes de la dame, mais la dame pend.
  T(G, 'dame qui pend : PAS une fourchette',
    'r6r/ppp1kppp/2n5/7q/3Q4/8/PPP2PPP/R3K2R w - - 0 1', 'd4', 'd5', fk, false);
  T(G, 'fourchette royale roi+tour : oui',
    'k3r3/8/8/3N4/8/8/8/6K1 w - - 0 1', 'd5', 'c7', fk, true);
  T(G, 'même fourchette mais reprise par la tour : non',
    'k2r4/8/8/3N4/8/8/8/6K1 w - - 0 1', 'd5', 'c7', fk, false);
  T(G, 'les victimes sont nommées',
    'k3r3/8/8/3N4/8/8/8/6K1 w - - 0 1', 'd5', 'c7',
    (p) => Analyzer.detectFork(p.before, p.after, p.move).names.sort(), ['roi', 'tour']);
}

// ─────────────────────────── phaseOf (F7) ───────────────────────────────────
{
  const G = 'phaseOf';
  const P = (fen, ply) => Analyzer.phaseOf(fen, ply, 0);

  check(G, 'position de départ', P('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0), 'opening');
  check(G, 'roques faits, matériel plein', P('r4rk1/pp3ppp/2n1bn2/2bpp3/4P3/2NP1N2/PPPBBPPP/R4RK1 w - - 0 15', 30), 'middle');
  check(G, 'rois et pions seuls = finale', P('8/5pkp/6p1/8/8/6P1/5PKP/8 w - - 0 40', 60), 'endgame');
  check(G, 'tour + mineure chacun = finale', P('4r1k1/5ppp/8/8/8/5PP1/4b2P/4R1K1 w - - 0 30', 40), 'endgame');
  // Le vieux découpage disait « finale » à partir du ply 50, quel que soit le
  // matériel restant.
  check(G, 'ply 60 mais tout le matériel = milieu de jeu',
    P('r1bqkbnr/pppppppp/2n5/8/8/2N5/PPPPPPPP/R1BQKBNR w KQkq - 0 1', 60), 'middle');

  // Une phase ne recule jamais : la retraite Breyer (…Cb8) remettait la partie
  // « en ouverture » au 10e coup quand on comptait les mineures développées.
  {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. Nbd2 Bb7 12. Bc2 Re8';
    const moves = Analyzer.parsePgnMoves(pgn);
    const g = new Chess();
    const rank = { opening: 0, middle: 1, endgame: 2 };
    let worst = 0, monotone = true;
    for (let i = 0; i < moves.length; i++) {
      const r = rank[Analyzer.phaseOf(g.fen(), i, 8)];
      if (r < worst) monotone = false;
      worst = Math.max(worst, r);
      g.move(moves[i].san, { sloppy: true });
    }
    check(G, 'monotone sur une Espagnole avec retraite Breyer', monotone, true);
  }
}

// ─────────────────────────── précision agrégée (F8) ─────────────────────────
{
  const G = 'accuracy';
  const mk = (losses) => losses.map((wl, i) => ({
    move: { color: i % 2 ? 'b' : 'w' }, type: 'best', cpLoss: 0,
    winPctLoss: wl, eval: (i % 2 ? -1 : 1) * wl * 800
  }));
  const accOf = (losses) => Analyzer.generateSummary(mk(losses), null).stats.b.accuracy;

  check(G, 'partie parfaite = 100', accOf(new Array(40).fill(0)), 100);

  // Le défaut de la moyenne arithmétique : une gaffe unique se noyait dans
  // quarante coups faciles et la partie affichait 95 %.
  const one = new Array(40).fill(0); one[21] = 0.55;
  const withBlunder = accOf(one);
  check(G, 'une grosse gaffe fait vraiment chuter la note', withBlunder < 80, true);
  check(G, 'mais reste au-dessus de zéro', withBlunder > 40, true);

  // Un jeu régulièrement médiocre ne doit PAS être puni deux fois : harmonique
  // et arithmétique coïncident quand toutes les valeurs se valent.
  const flat = accOf(new Array(40).fill(0.06));
  const flatSimple = Math.round(Analyzer.winLossToAccuracy(0.06));
  check(G, 'jeu régulier : inchangé par rapport à la moyenne simple',
    Math.abs(flat - flatSimple) <= 1, true);
}

// ─────────────────────────── ouvertures (F9) ────────────────────────────────
{
  const G = 'openings';
  const d = (sans) => { const r = Openings.detect(sans) || {}; return r.eco + ' ' + r.name; };
  const sicilian = ['e4', 'c5', 'Nf3'];

  check(G, '...e5 après ...d6 = Boleslavsky, pas Sveshnikov',
    d(sicilian.concat(['d6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'])),
    'B58 Sicilienne — variante Boleslavsky');
  check(G, 'la vraie Sveshnikov part de ...Cc6',
    d(sicilian.concat(['Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'])),
    'B33 Sicilienne Sveshnikov');
  check(G, '3...a6 = défense Morphy en C70',
    d(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']), 'C70 Ruy Lopez — défense Morphy');
  check(G, 'C68 reste la variante d\'échange',
    d(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6']),
    "C68 Ruy Lopez — variante d'échange");
  // Non-régression sur les lignes que la base identifiait déjà bien.
  check(G, 'Najdorf', d(sicilian.concat(['d6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'])), 'B90 Sicilienne Najdorf');
  check(G, 'Dragon', d(sicilian.concat(['d6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'])), 'B76 Sicilienne Dragon');
}

// ─────────────────────────── dictionnaire des coups (F17) ───────────────────
{
  const G = 'MOVE_TYPES';
  const types = Analyzer.MOVE_TYPES;
  const labels = types.map(t => t.label);

  check(G, 'aucun libellé en double', labels.length, new Set(labels).size);
  check(G, 'aucun glyphe en double', types.length, new Set(types.map(t => t.mark)).size);
  check(G, '« Forcé » est documenté', labels.includes('Forcé'), true);
  // Le point qui avait dérivé : « Excellent » désignait ! dans l'app et ✔ dans
  // la légende rapide. Les libellés sont ceux du Game Review FR de Chess.com.
  check(G, '! = Excellent', types.find(t => t.k === 'great').label, 'Excellent');
  check(G, '✔ = Très bien', types.find(t => t.k === 'excellent').label, 'Très bien');
  // Chaque type produit par l'analyseur doit avoir une entrée.
  const produced = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'miss', 'mistake', 'blunder'];
  check(G, 'tous les types produits sont décrits',
    produced.filter(k => !types.some(t => t.k === k)), []);
}

// ─────────────────────────── rapport ────────────────────────────────────────
console.log('');
if (fail) {
  console.log(`  ${fail} ÉCHEC(S) :\n`);
  for (const f of fails) console.log('    ' + f + '\n');
}
console.log(`  ${pass} test(s) OK, ${fail} échec(s)\n`);
process.exit(fail ? 1 : 0);
