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

global.Chess = require(path.join(ROOT, 'js/chess.min.js')).Chess; // le meme chess.js que l'app (correctif « strict d'abord »)
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
  // Clouages : une piece clouee sur son roi n'attaque ni ne reprend.
  check(G, 'le defenseur cloue ne reprend pas (d6 cloue par Fb4)',
    see('5k2/8/3p4/4n3/1B6/8/8/4R1K1 w - - 0 1', 'e5', 'w'), 3);
  check(G, "l'attaquant cloue ne compte pas (Cd4 cloue par Td8)",
    see('3r3k/8/8/1q6/3N4/8/8/3K4 w - - 0 1', 'b5', 'w'), 0);
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

// ─────────────── systemes : le Londres quelle que soit la reponse ───────────
// Signale par le user : 36 de ses 201 parties tombaient dans « Ouverture Pion
// Dame », dont 17 Londres. La table du catalogue est un PREFIXE sur les coups
// des DEUX camps : elle ne connaissait le Londres que contre 1...d5 et 1...Cf6.
// La passe « systeme » ne regarde que les coups des Blancs.
{
  const G = 'systemes';
  const d = (s) => { const r = Openings.detect(s.split(' ')) || {}; return r.eco + ' ' + r.name; };

  // Les ordres de coups et les reponses noires vus dans ses vraies parties.
  check(G, 'Londres vs 2...e6', d('d4 d5 Nf3 e6 Bf4 Nd7 e3'), 'D02 Système de Londres');
  check(G, 'Londres vs Tchigorine', d('d4 d5 Nf3 Nc6 Bf4 h6 e3'), 'D02 Système de Londres');
  check(G, 'Londres vs 1...Cc6', d('d4 Nc6 Nf3 b6 Bf4 Bb7 e3'), 'D02 Système de Londres');
  check(G, 'Londres vs la Moderne', d('d4 g6 Bf4 Bg7 e3 c5'), 'D02 Système de Londres');
  check(G, 'Londres vs 1...e6', d('d4 e6 Nf3 Nc6 Bf4 h6 e3'), 'D02 Système de Londres');
  check(G, 'Londres par transposition 1.Cf3', d('Nf3 d5 d4 Bf5 g3 Nc6 c3 e6 Bf4'), 'D02 Système de Londres');
  check(G, 'Londres apres 3.e3 (etiquete Colle par la table)',
    d('d4 d5 Nf3 Nf6 e3 e6 Bf4 c5'), 'D02 Système de Londres');
  check(G, 'Jobava = Cc3 avant e3', d('d4 d5 Nc3 Nf6 Bf4 e6 e3'), 'D00 Londres — attaque Jobava');
  check(G, 'Cc3 au 4e coup apres Cf3 = Londres, pas Jobava', d('d4 Nf6 Nf3 d5 Bf4 c5 Nc3'), 'D02 Système de Londres');

  // Ce qui ne DOIT pas devenir un Londres.
  check(G, 'c4 avant Ff4 = famille Gambit Dame', d('d4 d5 c4 e6 Nc3 Nf6 Bf4'), 'D30 Gambit Dame refusé');
  check(G, 'Englund : le pion d4 a quitte le centre', d('d4 e5 dxe5 Nc6 Bf4 Qe7'), 'A40 Gambit Englund — ligne principale');
  check(G, '1.d4 d5 sans systeme reste generique', d('d4 d5 a3 Nc6 Nc3 Nxd4'), 'A40 Ouverture Pion Dame');
  // Les autres setups, sur le meme principe.
  check(G, 'Colle = e3 + Fd3 sans Ff4', d('d4 d5 Nf3 e6 e3 Nf6 Bd3 c5'), 'D05 Système Colle');
  check(G, 'Colle-Zukertort = le meme avec b3', d('d4 d5 Nf3 e6 e3 Nf6 Bd3 c5 b3'), 'D05 Système Colle-Zukertort');
  check(G, 'Torre = Cf3 puis Fg5', d('d4 e6 Nf3 c5 Bg5 Qb6'), 'A46 Attaque Torre');
  check(G, 'Veresov = Cc3 puis Fg5', d('d4 d5 Nc3 c6 Bg5 h6'), 'D01 Ouverture Veresov');
  check(G, 'Trompowsky = 1...Cf6 2.Fg5', d('d4 Nf6 Bg5 e6'), 'A45 Attaque Trompowsky');
  check(G, 'Levitsky = 1...d5 2.Fg5', d('d4 d5 Bg5 h6'), 'D00 Attaque Levitsky (2.Fg5)');

  // Les premiers coups rares : nommes hors catalogue, pour ne pas les rendre
  // « dans le livre » (inBook) et donc excusables dans la notation.
  check(G, '1.g4 a un nom', d('g4 e5 d3'), 'A00 Ouverture Grob (1.g4)');
  check(G, '1.e3 a un nom', d('e3 e5 Nc3'), "A00 Ouverture Van 't Kruijs (1.e3)");
  check(G, "1.g4 n'est pas du livre pour autant", Openings.inBook(['g4']), false);
  check(G, "1.e3 non plus", Openings.inBook(['e3']), false);
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

// ────────────── « encore dans le livre » (js/openings.js) ───────────────────
// Signale par le user : en Petrov, les coups DU COACH sortaient « ?! » et « ? ».
// detect() nomme une position (une ligne du catalogue prefixe des coups joues) ;
// inBook() repond a l'autre question - les coups joues sont-ils le DEBUT d'une
// ligne connue - et c'est celle-la qui dit « c'est de la theorie ».
{
  const G = 'LIVRE';
  const B = global.Openings.inBook;
  const sp = (s) => s.split(' ');

  check(G, '1.e4 : dans le livre', B(sp('e4')), true);
  check(G, '1.e4 e5 : dans le livre (aucune ligne ne s\'appelle ainsi)', B(sp('e4 e5')), true);
  check(G, 'Petrov 1.e4 e5 2.Cf3 Cf6 : dans le livre', B(sp('e4 e5 Nf3 Nf6')), true);
  check(G, 'Londres classique : dans le livre', B(sp('d4 d5 Nf3 Nf6 Bf4')), true);
  // 3.Cxe5 EST la ligne principale de la Petrov : le test l'avait d'abord
  // classe « hors livre », c'est moi qui avais tort, pas le catalogue.
  check(G, '3.Cxe5 : la ligne principale de la Petrov, donc du livre', B(sp('e4 e5 Nf3 Nf6 Nxe5')), true);
  // Et ce qui n'est PAS de la theorie doit sortir du livre, sinon la regle
  // excuse n'importe quoi (c'est ce que faisait mon rustine « 6 demi-coups »).
  check(G, '3.Cg5 dans la Petrov : hors livre', B(sp('e4 e5 Nf3 Nf6 Ng5')), false);
  check(G, '1.e4 h5 : hors livre des le 2e demi-coup', B(sp('e4 h5')), false);
  check(G, '1.b4 : hors livre', B(sp('b4')), false);
  check(G, 'position vide : dans le livre', B([]), true);
  check(G, '2.Dh5 est bien AU catalogue (mais ca ne le rend pas bon)', B(sp('e4 e5 Qh5')), true);
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

  // La perte se lit DANS une seule recherche (lignes MultiPV), pas en
  // soustrayant deux recherches : c'est ce qui faisait sortir « ?! » sur un coup
  // de developpement tranquille (bruit de profondeur compte comme une perte).
  const LL = CoachGame.lineLoss;
  const lines = [
    { move: 'e2e4', score: 30 }, { move: 'd2d4', score: 26 },
    { move: 'g1f3', score: 20 }, { move: 'c2c4', score: 12 }, { move: 'b2b4', score: -60 },
  ];
  check(G, 'le meilleur coup perd exactement 0', LL(lines, 'e2e4').cp, 0);
  check(G, 'le 2e coup perd peu', LL(lines, 'd2d4').cp, 4);
  check(G, 'un coup faible perd beaucoup', LL(lines, 'b2b4').cp, 90);
  check(G, 'le 2e coup reste sous le seuil d\'imprecision', LL(lines, 'd2d4').wpl < 0.05, true);
  check(G, 'coup absent des lignes : pas de note exacte', LL(lines, 'h2h4'), null);
  check(G, 'pas de lignes : pas de note exacte', LL(null, 'e2e4'), null);

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

  // La duree vient du reglage de vitesse, source unique partagee par les ecrans.
  check(G, 'la duree par defaut est la vitesse « normale »',
    BoardRenderer.ANIM_MS, BoardRenderer.SPEEDS.normal);
  BoardRenderer.setSpeed('glide');
  check(G, 'changer de vitesse change la duree lue', BoardRenderer.ANIM_MS, 460);
  BoardRenderer.setSpeed('pas-une-vitesse');
  check(G, 'une vitesse inconnue est ignoree', BoardRenderer.getSpeed(), 'glide');
  BoardRenderer.setSpeed('normal');
}

// ────────── anatomie de la position finale (js/coachgame.js) ──────────────
// Ce que ces tests protegent : l'ecran de fin de partie n'affiche plus un
// verdict, il EXPLIQUE la position finale. Une phrase fausse y est pire que pas
// de phrase du tout - « le roi peut aller en g8 » sous un mat du couloir ferait
// douter de tout le reste. Le piege principal est connu et se voit ici : les
// cases de fuite doivent se juger sur un plateau ou le ROI MATE A ETE RETIRE,
// sinon le roi fait ecran a la tour qui le mate et la case derriere lui passe
// pour libre.
{
  const G = 'FIN DE PARTIE';
  const A = CoachGame.endAnatomy;
  const st = (an, sq) => { const f = an.flight.find(x => x.sq === sq); return f ? f.state : 'absente'; };

  // ── Mat du couloir : Tour a8, roi noir g8, ses trois pions devant lui. ──
  const couloir = 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1';
  {
    const an = A(couloir);
    check(G, 'couloir : c est bien un mat', an.kind, 'mate');
    check(G, 'couloir : le roi mate est trouve', an.king, 'g8');
    check(G, 'couloir : la tour a8 donne l echec', an.checkers.map(c => c.sq + c.t), ['a8r']);
    // LE test qui compte : sans le retrait du roi, g8->f8 passerait pour libre.
    check(G, 'couloir : f8 est tenue par la tour (a travers le roi)', st(an, 'f8'), 'held');
    check(G, 'couloir : f7 g7 h7 sont bouchees par ses propres pions',
      [st(an, 'f7'), st(an, 'g7'), st(an, 'h7')], ['own', 'own', 'own']);
    // h8 est DERRIERE le roi sur la meme rangee : c est elle qui passait pour libre.
    check(G, 'couloir : h8, derriere le roi, est tenue elle aussi', st(an, 'h8'), 'held');
    check(G, 'couloir : aucune piece ne peut prendre la tour', an.takers.length, 0);
    check(G, 'couloir : la ligne a8-g8 peut se decrire', an.cut && an.cut.path, ['b8', 'c8', 'd8', 'e8', 'f8']);
  }

  // ── Mat de l epaulette / soutien : la dame colle au roi, le fou la garde. ──
  // Dxh7# type coup du Berger : la dame en f7 soutenue par le fou c4.
  const berger = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
  {
    const an = A(berger);
    check(G, 'berger : mat', an.kind, 'mate');
    check(G, 'berger : la dame f7 mate', an.checkers.map(c => c.sq + c.t), ['f7q']);
    check(G, 'berger : le fou c4 la protege', an.support.map(s => s.sq + s.t), ['c4b']);
    // Le roi e8 ne peut pas prendre en f7 : la case est defendue.
    check(G, 'berger : f7 est defendue (le roi ne peut pas croquer)', st(an, 'f7'), 'held');
    check(G, 'berger : e7 est tenue par la dame', st(an, 'e7'), 'held');
    check(G, 'berger : d8 est occupee par sa propre dame', st(an, 'd8'), 'own');
    // La dame est COLLEE au roi : il n y a rien a interposer.
    check(G, 'berger : la dame est adjacente, aucune ligne a couper',
      an.cut ? an.cut.path.length : 0, 0);
  }

  // ── Mat etouffe : le roi est enferme par ses propres pieces, cavalier en f7.
  const etouffe = '6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1';
  {
    const an = A(etouffe);
    check(G, 'etouffe : mat', an.kind, 'mate');
    check(G, 'etouffe : le cavalier donne l echec', an.checkers.map(c => c.t), ['n']);
    check(G, 'etouffe : un cavalier ne se coupe pas', an.cut, null);
    check(G, 'etouffe : les trois cases sont bouchees par ses propres pieces',
      an.flight.filter(f => f.state === 'own').map(f => f.sq).sort(), ['g7', 'g8', 'h7']);
  }

  // ── Pat : roi noir h8, dame blanche g6, roi blanc f6. Pas d echec, pas de coup.
  const pat = '7k/8/5KQ1/8/8/8/8/8 b - - 0 1';
  {
    const an = A(pat);
    check(G, 'pat : reconnu comme pat, pas comme mat', an.kind, 'stalemate');
    check(G, 'pat : personne ne donne d echec', an.checkers.length, 0);
    check(G, 'pat : h7 et g8 sont tenues par la dame',
      [st(an, 'h7'), st(an, 'g8')], ['held', 'held']);
  }

  // ── Materiel insuffisant et abandon : pas de mat a disseque, mais le genre
  //    doit etre nomme - c est lui qui choisit la phrase affichee.
  check(G, 'roi contre roi : materiel insuffisant', A('8/8/4k3/8/8/4K3/8/8 w - - 0 1').kind, 'material');
  check(G, 'abandon : aucune analyse de position', A(couloir, 'resign').kind, 'resign');
  // Une FEN seule ne PEUT PAS dire « triple repetition » ni « cinquante coups » :
  // ces deux nulles demandent l historique. L appelant tient la vraie partie et
  // passe le genre ; sans lui, le panneau de fin n avait rien a dire.
  {
    const mid = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 3';
    check(G, 'repetition : le genre vient de la partie, pas de la FEN', A(mid, null, 'repetition').kind, 'repetition');
    check(G, 'cinquante coups : idem', A(mid, null, 'fifty').kind, 'fifty');
    check(G, 'sans le genre, une position jouable reste muette', A(mid).kind, 'other');
    // Un mat reste un mat : le genre passe par l appelant ne doit rien ecraser.
    check(G, 'le genre de nulle n ecrase jamais un mat', A(couloir, null, 'repetition').kind, 'mate');
  }
  check(G, 'position normale : rien a raconter', A('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').kind, 'other');

  // ── Les cases entre deux cases, base de « couper la ligne ». ──
  check(G, 'entre a1 et a4', CoachGame.betweenSqs('a1', 'a4'), ['a2', 'a3']);
  check(G, 'entre h1 et e4 (diagonale)', CoachGame.betweenSqs('h1', 'e4'), ['g2', 'f3']);
  check(G, 'entre b1 et c3 : non alignees', CoachGame.betweenSqs('b1', 'c3'), []);
  check(G, 'cases voisines : rien entre elles', CoachGame.betweenSqs('e4', 'e5'), []);

  // ── Les fleches dessinees : l echec en rouge, une marque par case de fuite. ──
  {
    const an = A(couloir);
    const a0 = CoachGame.endArrows(an, 0);
    check(G, 'fleches : une par echec + une par case autour du roi',
      a0.length, an.checkers.length + an.flight.length);
    check(G, 'fleches : l echec part de la piece vers le roi',
      a0[0].from + a0[0].to, 'a8' + an.king);
    const a1 = CoachGame.endArrows(an, 1);
    check(G, 'niveau 1 : il s ajoute des fleches, jamais moins', a1.length > a0.length, true);
  }
}

// ────────── le bilan chiffre du mode entraineur (js/coachgame.js) ──────────
// `gameReport` relit le journal des coups. Deux choses a ne pas casser : seuls
// MES coups comptent (ceux du coach sont dans le meme journal), et la precision
// se calcule avec la meme formule que l ecran d analyse - une precision maison
// serait pire que pas de precision du tout, puisqu elle ne se comparerait a
// rien dans l app.
{
  const G = 'BILAN COACH';
  const R = CoachGame.gameReport;

  const log = [
    { n: 1, san: 'e4', mine: true, k: 'book', wpl: 0.00, cp: 0, ph: 'opening', ev: 20, ea: 20, eb: 20, bs: 'e4' },
    { n: 1, san: 'e5', mine: false, k: 'book', ev: 15 },
    { n: 2, san: 'Cf3', mine: true, k: 'best', wpl: 0.01, cp: 5, ph: 'opening', ev: 25, eb: 15, ea: 25, bs: 'Cf3' },
    { n: 2, san: 'Cc6', mine: false, k: null, ev: 20 },
    { n: 3, san: 'Fc4', mine: true, k: 'good', wpl: 0.03, cp: 20, ph: 'middle', ev: 10, eb: 20, ea: 10, bs: 'Fb5' },
    { n: 3, san: 'Cf6', mine: false, k: null, ev: 5 },
    { n: 4, san: 'Cg5', mine: true, k: 'blunder', wpl: 0.34, cp: 420, ph: 'middle', ev: -400, eb: 5, ea: -400, bs: 'd3' },
    { n: 4, san: 'd5', mine: false, k: 'best', ev: -410 },
    { n: 5, san: 'exd5', mine: true, k: 'mistake', wpl: 0.12, cp: 150, ph: 'endgame', ev: -560, eb: -400, ea: -560, bs: 'Fxf7+' },
  ];
  const r = R(log);

  check(G, 'seuls MES coups sont comptes', r.n, 5);
  check(G, 'le decompte par classe suit le journal',
    [r.counts.book, r.counts.best, r.counts.good, r.counts.blunder, r.counts.mistake], [1, 1, 1, 1, 1]);
  check(G, 'la precision est calculee', typeof r.accuracy, 'number');
  check(G, 'une partie avec une grosse gaffe ne sort pas une precision de champion',
    r.accuracy < 90, true);
  check(G, 'l acpl est la moyenne des pertes en centiemes', r.acpl, Math.round((0 + 5 + 20 + 420 + 150) / 5));
  check(G, 'les trois phases sont separees', r.phases.map(p => p.key + ':' + p.n),
    ['opening:2', 'middle:2', 'endgame:1']);
  check(G, 'le moment qui bascule est la PLUS grosse perte, pas la premiere',
    r.turning && r.turning.san, 'Cg5');
  check(G, 'le moment qui bascule porte le coup du moteur', r.turning && r.turning.best, 'd3');
  check(G, 'le moment qui bascule sait ou il est dans la courbe', r.turning && r.turning.mi, 3);
  // Un coup qui laisse un mat vaut ~30 000 centiemes de pion. Sans plafond, la
  // moyenne affichait « tu laches 3 395 centiemes par coup », chiffre absurde
  // qui decredibilise tout le bilan autour. Meme plafond que analysis.js.
  {
    const mate = log.concat([{ n: 6, san: 'Rc3', mine: true, k: 'excellent', wpl: 0.01, cp: 28882, ph: 'endgame', ev: -900 }]);
    check(G, 'une perte de score de mat est plafonnee dans la moyenne', R(mate).acpl <= 1000, true);
  }
  check(G, 'un journal vide ne casse rien', R([]).n, 0);
  check(G, 'un journal absent ne casse rien', R(null).accuracy, null);

  // Une partie propre doit sortir une precision haute : sinon le chiffre ne
  // discrimine rien et n a aucune valeur pedagogique.
  const clean = [];
  for (let i = 0; i < 20; i++) clean.push({ n: i + 1, san: 'a' + i, mine: i % 2 === 0, k: 'best', wpl: 0.004, cp: 4, ph: 'middle', ev: 10 });
  check(G, 'une partie sans faute sort une precision elevee', R(clean).accuracy >= 90, true);
}

// ─────────────────────────── rapport ────────────────────────────────────────
console.log('');
if (fail) {
  console.log(`  ${fail} ÉCHEC(S) :\n`);
  for (const f of fails) console.log('    ' + f + '\n');
}
console.log(`  ${pass} test(s) OK, ${fail} échec(s)\n`);
process.exit(fail ? 1 : 0);
