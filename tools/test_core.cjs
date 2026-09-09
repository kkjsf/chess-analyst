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
// coachgame.js ne touche au DOM que dans ses fonctions : requerable tel quel.
// Il lit Analyzer.cpToWinPct au travers du global, comme dans le navigateur.
global.Analyzer = Analyzer;
const CoachGame = require(path.join(ROOT, 'js/coachgame.js'));
// board.js : seule sa fonction pure `diffPositions` est testee (aucun DOM).
const BoardRenderer = require(path.join(ROOT, 'js/board.js'));

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

// ────────────── force de jeu du mode entraineur (js/coachgame.js) ──────────
// Le moteur embarque n'a pas d'option d'Elo (ni UCI_Elo ni UCI_LimitStrength),
// donc le niveau est FABRIQUE : Skill Level + movetime + tirage pondere dans le
// top 5 + gaffe volontaire. Ces quatre etages n'ont de sens que s'ils varient
// dans le bon sens, et c'est exactement le genre de table qu'on casse en la
// retouchant a la main.
{
  const G = 'NIVEAU';
  const P = CoachGame.paramsFor;

  // Monotonie : plus l'Elo vise est haut, plus le moteur est fort et regulier.
  const elos = [400, 500, 600, 760, 900, 1100, 1200, 1400];
  const params = elos.map(P);
  const nonDecr = (k) => params.every((p, i) => i === 0 || p[k] >= params[i - 1][k]);
  const nonIncr = (k) => params.every((p, i) => i === 0 || p[k] <= params[i - 1][k]);
  check(G, 'skill croit avec l\'Elo', nonDecr('skill'), true);
  check(G, 'movetime croit avec l\'Elo', nonDecr('mt'), true);
  check(G, 'le tirage se resserre quand l\'Elo monte', nonIncr('spread'), true);
  check(G, 'la gaffe volontaire diminue quand l\'Elo monte', nonIncr('blunder'), true);

  // Bornes : un curseur hors echelle ne doit pas produire de reglage absurde.
  check(G, 'sous le plancher on retombe sur le 1er barreau', P(100).elo, CoachGame.LADDER[0].elo);
  check(G, 'au-dessus du plafond on retombe sur le dernier', P(3000).elo,
    CoachGame.LADDER[CoachGame.LADDER.length - 1].elo);
  check(G, 'skill reste dans 0-20',
    params.filter(p => p.skill < 0 || p.skill > 20).length, 0);
  check(G, 'la proba de gaffe reste une proba',
    params.filter(p => p.blunder < 0 || p.blunder > 1).length, 0);
  // Son niveau (760 rapide) doit rester un adversaire faible mais pas nul.
  check(G, 'a ~760 le moteur est bride sans etre absurde',
    P(760).skill <= 5 && P(760).skill >= 1, true);
  // Au plafond, plus de coup lache au hasard : le mode doit pouvoir servir
  // d'adversaire propre quand il aura progresse.
  check(G, 'au plafond, aucune gaffe volontaire', P(1400).blunder, 0);

  // Tirage dans les lignes MultiPV. `rnd` est injecte, donc deterministe.
  const pick = CoachGame.pickIndex;
  check(G, 'rnd=0 prend toujours le meilleur coup', pick(5, 2, 0), 0);
  check(G, 'spread nul = toujours le meilleur coup', pick(5, 0, 0.99), 0);
  check(G, 'une seule ligne : index 0', pick(1, 4, 0.99), 0);
  check(G, 'jamais hors bornes',
    [0, .2, .4, .6, .8, .999].map(r => pick(5, 4, r)).filter(i => i < 0 || i > 4).length, 0);
  // Un tirage large doit reellement descendre dans la liste, sinon les niveaux
  // bas ne sont qu'un Stockfish un peu lent.
  const deep = [.5, .7, .9, .99].map(r => pick(5, 4, r));
  check(G, 'un tirage large atteint le 3e coup ou plus loin', Math.max(...deep) >= 2, true);
  const tight = [.5, .7, .9].map(r => pick(5, 0.7, r));
  check(G, 'un tirage etroit reste sur les 2 premiers', Math.max(...tight) <= 1, true);

  // Le coup EVIDENT. Mesure en jouant : sans ce resserrement, le coach laissait
  // passer une dame gratuite deux fois sur trois - un adversaire faible doit
  // rester faible dans les positions floues, pas aveugle devant une piece.
  const eff = CoachGame.effSpread;
  const L2 = (a, b) => [{ move: 'a', score: a, mate: null }, { move: 'b', score: b, mate: null }];
  check(G, 'coups equivalents : etalement inchange', eff(L2(20, 15), 4), 4);
  check(G, 'ecart net : etalement reduit', eff(L2(140, 20), 4) < 4, true);
  check(G, 'une piece a ramasser : etalement fortement reduit', eff(L2(920, 20), 4) <= 1, true);
  check(G, 'mat en vue : etalement quasi nul', eff([{ move: 'a', score: 3000, mate: 3 }, { move: 'b', score: 90, mate: null }], 4) < 1, true);
  check(G, 'une seule ligne : rien a resserrer', eff([{ move: 'a', score: 0, mate: null }], 4), 4);
  // Et le resserrement doit vraiment changer le coup joue, pas juste le chiffre.
  const obvious = [.3, .5, .7, .9].map(r => pick(5, eff(L2(920, 20), 4), r));
  check(G, 'devant une piece gratuite, le coach prend', Math.max(...obvious) <= 1, true);

  // La note de MES coups se lit en chances de gain, pas en centiemes bruts.
  // Mesure en jouant : juge en centiemes, 1.e4 sortait « erreur (-63 cp) ».
  const wl = CoachGame.winLoss;
  const pts = (a, b) => Math.round(wl(a, b) * 100);
  check(G, '1.e4 a -63 cp = une imprecision, pas une erreur', pts(0, -63) < 10, true);
  check(G, 'une dame lachee = une gaffe', pts(0, -800) >= 20, true);
  check(G, 'les memes 63 cp dans une position perdue ne comptent plus', pts(-1200, -1263) < 2, true);
  check(G, 'un coup qui ameliore ne perd rien', wl(0, 50), 0);
  check(G, 'eval manquante : pas de note', wl(null, -800), null);
}

// ────────────── animation des deplacements (js/board.js) ────────────────────
// Avant, seule la piece nommee par `lastMove` glissait : la tour du roque, le
// pion pris en passant, la piece capturee et TOUT retour en arriere se
// teleportaient. `diffPositions` compare les deux positions et doit retrouver
// seule ce qui a bouge - y compris quand personne ne lui dit quel coup a ete
// joue. C'est exactement le genre de fonction qu'on casse en la retouchant.
{
  const G = 'ANIMATION';
  const D = BoardRenderer.diffPositions;
  const fenAfter = (fen, mv) => { const g = new global.Chess(fen); g.move(mv); return g.fen(); };
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const key = (d) => ({
    moves: d.moves.map(m => m.from + m.to + m.piece).sort(),
    promos: (d.promos || []).map(q => q.from + q.to + q.pawn + '>' + q.piece),
    added: d.added.map(a => a.sq + a.p).sort(),
    removed: d.removed.map(r => r.sq + r.p).sort(),
  });

  // Un coup simple : une seule piece glisse.
  check(G, '1.e4 : une piece qui glisse',
    key(D(START, fenAfter(START, 'e4'), { from: 'e2', to: 'e4' })),
    { moves: ['e2e4P'], promos: [], added: [], removed: [] });

  // Le roque : DEUX pieces bougent, la tour se teleportait.
  const preCastle = 'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';
  check(G, 'petit roque : le roi ET la tour glissent',
    key(D(preCastle, fenAfter(preCastle, 'O-O'), { from: 'e1', to: 'g1' })),
    { moves: ['e1g1K', 'h1f1R'], promos: [], added: [], removed: [] });
  const preLong = 'r3kbnr/pppqpppp/2np4/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
  check(G, 'grand roque : idem cote noir',
    key(D(preLong, fenAfter(preLong, 'O-O-O'), { from: 'e8', to: 'c8' })),
    { moves: ['a8d8r', 'e8c8k'], promos: [], added: [], removed: [] });

  // La prise en passant : le pion capture n'est PAS sur la case d'arrivee.
  const preEp = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
  check(G, 'prise en passant : le pion pris s\'efface sur SA case',
    key(D(preEp, fenAfter(preEp, { from: 'e5', to: 'd6' }), { from: 'e5', to: 'd6' })),
    { moves: ['e5d6P'], promos: [], added: [], removed: ['d5p'] });

  // La promotion : le pion glisse puis se change en dame (pas deux
  // apparitions/disparitions sans lien).
  const prePromo = 'rnbqkbnr/pP4pp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
  check(G, 'promotion avec prise : le pion glisse et se transforme',
    key(D(prePromo, fenAfter(prePromo, { from: 'b7', to: 'a8', promotion: 'q' }), { from: 'b7', to: 'a8' })),
    { moves: [], promos: ['b7a8P>Q'], added: [], removed: ['a8r'] });

  // Le RETOUR EN ARRIERE : c'etait la moitie des teleportations.
  const afterE5 = fenAfter(fenAfter(START, 'e4'), 'e5');
  const afterE4 = fenAfter(START, 'e4');
  check(G, 'retour en arriere : la piece revient en glissant',
    key(D(afterE5, afterE4, { from: 'e7', to: 'e5' })),
    { moves: ['e5e7p'], promos: [], added: [], removed: [] });

  // Deux pieces identiques : l'appariement doit suivre `lastMove`, pas la
  // distance (deux tours sur la meme rangee sont interchangeables).
  const twoRooks = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';
  check(G, 'deux tours identiques : c\'est bien celle du coup qui bouge',
    key(D(twoRooks, fenAfter(twoRooks, { from: 'a1', to: 'd1' }), { from: 'a1', to: 'd1' })),
    { moves: ['a1d1R'], promos: [], added: [], removed: [] });

  // Position sans rapport (on saute d'un exercice a l'autre) : on ne doit pas
  // inventer des trajectoires absurdes, juste des apparitions/disparitions.
  const unrelated = D('8/8/8/4k3/8/8/8/4K3 w - - 0 1', '8/8/8/8/8/2K5/8/7k w - - 0 1', null);
  check(G, 'positions sans rapport : rien ne glisse plus loin que 8 cases',
    unrelated.moves.every(m => Math.abs(+m.from[1] - +m.to[1]) <= 7), true);

  // Meme position : aucune animation a jouer.
  const same = D(START, START, null);
  check(G, 'meme position : rien a animer',
    key(same), { moves: [], promos: [], added: [], removed: [] });

  // La duree par defaut est la source unique partagee par les 6 ecrans.
  check(G, 'une duree par defaut, lente et glissante',
    BoardRenderer.ANIM_MS >= 300 && BoardRenderer.ANIM_MS <= 450, true);
}

// ─────────────────────────── rapport ────────────────────────────────────────
console.log('');
if (fail) {
  console.log(`  ${fail} ÉCHEC(S) :\n`);
  for (const f of fails) console.log('    ' + f + '\n');
}
console.log(`  ${pass} test(s) OK, ${fail} échec(s)\n`);
process.exit(fail ? 1 : 0);
