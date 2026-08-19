// Cours sur les mats — un vrai cours illustré (leçon + diagramme + séquence)
// suivi d'exercices jouables sur l'échiquier. Remplace l'ancien entraîneur de
// finales (Chess.com le fait déjà très bien).
//
// Chaque `fen` de diagramme est une position de mat (trait au camp maté) et
// chaque exercice (fen + sol en SAN anglais) est vérifié hors-ligne par
// tools/verify_mates.cjs avant d'être ajouté ici.
//   - sol : ligne forcée en SAN anglais (chess.js) ; indices pairs = coup à
//     trouver, indices impairs = réponse forcée jouée automatiquement.
const Mates = (() => {
  const $ = (s) => document.querySelector(s);
  const G = '#56b886', B = '#5b8fb9', R = '#d36b6b';

  // ───────────────────────── catalogue ─────────────────────────
  const GROUPS = [
    { id: 'debut', title: '① Les pièges du début de partie',
      intro: `Trois mats express qui punissent un développement bâclé. On les apprend d'abord pour ne <b>jamais</b> les subir.` },
    { id: 'base', title: '② Les mats de base',
      intro: `La technique pure : pousser le roi seul jusqu'au bord et le mater. À maîtriser les yeux fermés.` },
    { id: 'classiques', title: '③ Les mats classiques à reconnaître',
      intro: `Des schémas qui reviennent sans cesse en partie. Les reconnaître, c'est trouver le mat en un clin d'œil.` },
    { id: 'attaque', title: '④ Les mats sur le roque',
      intro: `Quand les deux camps ont roqué du même côté, l'attaque vise les cases <b>h7</b>, <b>g7</b> et <b>f7</b>. Voici les figures de mat qui couronnent ces attaques.` },
  ];

  const MATES = [
    // ══════════ ① pièges du début ══════════
    { id: 'imbecile', group: 'debut', icon: '🤡', name: "Mat de l'imbécile", en: "Fool's mate",
      lesson: `Le mat le plus rapide des échecs : <b>deux coups</b>. Les Blancs affaiblissent bêtement leur roi en ouvrant la diagonale e1-h4, et la dame noire s'y engouffre. On ne le voit quasiment jamais en vrai, mais il illustre la leçon d'or : <b>ne jamais bouger les pions f et g devant son roi sans raison</b>.`,
      seq: `1.f3? e5 2.g4?? Dh4#`,
      fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 3',
      arrows: [{ from: 'h4', to: 'e1', color: R }],
      puzzles: [
        { fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', sol: ['Qh4#'], hint: `La diagonale e1-h4 est grande ouverte. Amène ta dame au bout.` },
      ] },

    { id: 'berger', group: 'debut', icon: '🐑', name: 'Coup du Berger', en: "Scholar's mate",
      lesson: `Le grand classique qui piège tous les débutants : la dame et le fou c4 se liguent contre <b>f7</b>, la case la plus faible (défendue par le seul roi). En 4 coups, la dame croque f7 avec le soutien du fou. <b>La parade</b> : jouer …g6 pour repousser la dame, ou …De7/…Df6 pour défendre f7, et surtout ne pas rester passif.`,
      seq: `1.e4 e5 2.Fc4 Cc6 3.Dh5 Cf6?? 4.Dxf7#`,
      fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
      arrows: [{ from: 'c4', to: 'f7', color: B }, { from: 'f7', to: 'e8', color: R }],
      puzzles: [
        { fen: 'rnbqk2r/pppp1ppp/5n2/2b1p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', sol: ['Qxf7#'], hint: `La dame frappe f7, épaulée par le fou c4. Le roi ne peut ni reprendre ni fuir.` },
      ] },

    { id: 'legal', group: 'debut', icon: '⚡', name: 'Mat de Légal', en: "Légal's mate",
      lesson: `Le plus élégant des pièges d'ouverture : les Blancs <b>abandonnent leur dame</b> pour mater avec trois pièces mineures. Le fou g4 cloue le cavalier f3 sur la dame ; les Blancs « ignorent » le clouage par Cxe5 !, et si les Noirs prennent la dame (…Fxd1), le mat tombe : Fxf7+ Re7, Cd5#. Leçon : un clouage n'est pas sacré, calcule toujours le sacrifice.`,
      seq: `1.e4 e5 2.Cf3 d6 3.Fc4 Fg4 4.Cc3 g6?? 5.Cxe5! Fxd1 6.Fxf7+ Re7 7.Cd5#`,
      fen: 'rn1q1bnr/ppp1kB1p/3p2p1/3NN3/4P3/8/PPPP1PPP/R1BbK2R',
      arrows: [{ from: 'd5', to: 'e7', color: R }, { from: 'f7', to: 'e6', color: G }, { from: 'e5', to: 'd7', color: G }],
      puzzles: [
        { fen: 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5', sol: ['Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#'], trap: true, hint: `Le clouage est un leurre. Prends e5 ! Si l'adversaire encaisse ta dame, mate avec le fou puis le cavalier.` },
      ] },

    // ══════════ ② mats de base ══════════
    { id: 'couloir', group: 'base', icon: '🚪', name: 'Mat du couloir', en: 'Back-rank mate',
      lesson: `Le roi roqué est <b>emprisonné sur sa rangée par ses propres pions</b> (f7-g7-h7). Une tour ou une dame qui arrive sur la dernière rangée donne un mat sans appel. C'est le mat le plus fréquent en partie rapide. <b>Prévention</b> : ouvre une « lucarne » d'avance en poussant h3 (ou g3) pour donner de l'air à ton roi.`,
      seq: null,
      fen: '4R1k1/5ppp/8/8/8/8/8/6K1',
      arrows: [{ from: 'e8', to: 'g8', color: R }],
      puzzles: [
        { fen: '6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1', sol: ['Rd8#'], hint: `La dernière rangée est un couloir sans issue : les pions bloquent leur propre roi.` },
        { fen: '2r3k1/5ppp/8/8/8/8/3R4/3R2K1 w - - 0 1', sol: ['Rd8+', 'Rxd8', 'Rxd8#'], hint: `Une tour noire garde la dernière rangée. Sacrifie pour l'attirer, puis reprends : le couloir se referme.` },
        { fen: '7k/p1p3pp/8/2b1n1r1/2B1q3/5N1P/Pr2N1P1/3R1K1R w - - 0 28', sol: ['Rd8+', 'Bf8', 'Rxf8#'], real: `Lichess · niveau 974`, game: 'https://lichess.org/FnOd3dtC/black', lvl: 'facile', hint: `La dernière rangée est un couloir sans issue : les pions bloquent leur propre roi.` },
        { fen: '3rr1k1/p4ppp/1p6/5bB1/Nq1P3Q/bP6/P3RPPP/4R1K1 b - - 0 26', sol: ['Qxe1+', 'Rxe1', 'Rxe1#'], real: `Lichess · niveau 1167`, game: 'https://lichess.org/SxIBXNC2', lvl: 'moyenne', hint: `La dernière rangée est un couloir sans issue : les pions bloquent leur propre roi.` },
        { fen: '2r3k1/pppQ1ppp/2pn4/8/8/3P1N2/PqP2PPP/4R1K1 w - - 3 19', sol: ['Qxc8+', 'Nxc8', 'Re8#'], real: `Lichess · niveau 1362`, game: 'https://lichess.org/aQjYesyy/black', lvl: 'soutenue', hint: `La dernière rangée est un couloir sans issue : les pions bloquent leur propre roi.` },
      ] },

    { id: 'escalier', group: 'base', icon: '🪜', name: "Mat de l'escalier", en: 'Ladder mate',
      lesson: `La technique reine pour mater avec <b>deux tours</b> (ou dame + tour) contre le roi seul, sans même son propre roi. Une tour verrouille une rangée, l'autre donne échec sur la rangée voisine et repousse le roi d'un cran. On monte les « marches » jusqu'au bord. <b>Astuce anti-pat</b> : garde tes tours loin du roi ennemi ; si le roi s'approche d'une tour, décale-la à l'autre bout de sa rangée.`,
      seq: null,
      fen: '1R2k3/R7/8/8/8/8/8/6K1',
      arrows: [{ from: 'a7', to: 'h7', color: B }, { from: 'b8', to: 'e8', color: R }],
      puzzles: [
        { fen: '4k3/R7/1R6/8/8/8/8/6K1 w - - 0 1', sol: ['Rb8#'], hint: `Une tour coupe déjà la 7ᵉ rangée. Amène l'autre sur la 8ᵉ pour fermer l'escalier.` },
      ] },

    { id: 'epaulette', group: 'base', icon: '💂', name: 'Mat des épaulettes', en: 'Epaulette mate',
      lesson: `Le roi est <b>coincé entre ses deux tours</b> (ou deux pièces) posées comme des épaulettes de chaque côté : elles lui bouchent ses seules fuites. La dame se place droit devant lui et mate sans être capturée. On le provoque souvent en forçant le roi à s'entourer de ses pièces.`,
      seq: null,
      fen: '3rkr2/8/4Q3/8/8/8/8/6K1',
      arrows: [{ from: 'e6', to: 'e8', color: R }],
      puzzles: [
        { fen: '3rkr2/8/8/4Q3/8/8/8/6K1 w - - 0 1', sol: ['Qe6#'], hint: `Les tours d8 et f8 emmurent leur propre roi. Plante la dame juste en face.` },
        { fen: '3r1r2/p4k1p/1p3P2/4K3/PP6/6RP/3p4/8 w - - 2 40', sol: ['Rg7+', 'Ke8', 'Re7#'], real: `Lichess · niveau 948`, game: 'https://lichess.org/7S035LzP/black', lvl: 'facile', hint: `Le roi est emmuré par ses propres pièces de chaque côté. Plante la dame juste en face.` },
        { fen: '2Q5/p4ppk/4p3/3p3p/1B1Pb1q1/2P5/PP3K1P/3R1R2 b - - 0 25', sol: ['Qf3+', 'Ke1', 'Qe3#'], real: `Lichess · niveau 1123`, game: 'https://lichess.org/GcCjw72z', lvl: 'moyenne', hint: `Le roi est emmuré par ses propres pièces de chaque côté. Plante la dame juste en face.` },
        { fen: '1r4nr/3N1pkp/2B1p1p1/8/Pp3N2/3P2P1/1bPQKP1P/q7 w - - 3 24', sol: ['Nh5+', 'gxh5', 'Qg5#'], real: `Lichess · niveau 1317`, game: 'https://lichess.org/YAfjFzmW/black', lvl: 'moyenne', hint: `Le roi est emmuré par ses propres pièces de chaque côté. Plante la dame juste en face.` },
      ] },

    // ══════════ ③ mats classiques ══════════
    { id: 'etouffe', group: 'classiques', icon: '🐴', name: 'Mat à l\'étouffée', en: 'Smothered mate',
      lesson: `Le roi est <b>étouffé par ses propres pièces</b> : aucune case libre autour de lui, et un cavalier vient donner l'échec final auquel rien ne peut répondre (le cavalier saute par-dessus tout). Le combo légendaire : on sacrifie la dame en g8 pour <b>forcer</b> la tour à boucher la dernière case de fuite, puis Cf7#.`,
      seq: `Sacrifice type : Dg8+! Txg8 Cf7#`,
      fen: '6rk/5Npp/8/8/8/8/8/6K1',
      arrows: [{ from: 'f7', to: 'h8', color: R }],
      puzzles: [
        { fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', sol: ['Nf7#'], hint: `Le roi est emmuré par sa tour et ses pions. Un simple saut de cavalier suffit.` },
        { fen: '5r1k/6pp/7N/8/8/8/Q7/6K1 w - - 0 1', sol: ['Qg8+', 'Rxg8', 'Nf7#'], hint: `Sacrifie la dame en g8 pour boucher la dernière case, puis étouffe au cavalier.` },
        { fen: 'r2qkb1r/1p1nnbpp/3p1p2/1Q1Pp3/4N1P1/2P1B2P/PP3P2/R4RK1 w kq - 0 20', sol: ['Nxd6#'], real: `Lichess · niveau 823`, game: 'https://lichess.org/Dz55nMEh/black', lvl: 'facile', hint: `Le roi est étouffé par ses propres pièces : seul un saut de cavalier peut le mater.` },
        { fen: 'r1b1k2r/ppppqppp/8/3P4/1b1n4/3N2P1/PP1PPP1P/R1BQKB1R b KQkq - 2 8', sol: ['Nf3#'], real: `Lichess · niveau 1160`, game: 'https://lichess.org/QMiDhyyN', lvl: 'moyenne', hint: `Le roi est étouffé par ses propres pièces : seul un saut de cavalier peut le mater.` },
        { fen: 'r4r1k/1pp3pp/p3Q2N/8/8/7P/Pq3PPK/RN6 w - - 5 21', sol: ['Qg8+', 'Rxg8', 'Nf7#'], real: `Lichess · niveau 1343`, game: 'https://lichess.org/ZO57Ety0/black', lvl: 'moyenne', hint: `Le roi est étouffé par ses propres pièces : seul un saut de cavalier peut le mater.` },
      ] },

    { id: 'arabe', group: 'classiques', icon: '🕌', name: 'Mat de l\'arabe', en: 'Arabian mate',
      lesson: `L'un des plus vieux mats connus : le <b>tandem tour + cavalier</b> dans le coin. La tour donne échec sur la colonne (ou la rangée) du roi acculé en h8 ; le cavalier en f6 fait tout le travail défensif : il garde à la fois la case de fuite g8 <b>et</b> protège la tour en h7. Le roi ne peut ni fuir ni prendre.`,
      seq: null,
      fen: '7k/7R/5N2/8/8/8/8/6K1',
      arrows: [{ from: 'h7', to: 'h8', color: R }, { from: 'f6', to: 'g8', color: B }],
      puzzles: [
        { fen: '7k/8/5N2/8/8/8/8/6KR w - - 0 1', sol: ['Rh7#'], hint: `Le cavalier f6 tient déjà g8 et h7. Amène la tour au contact du roi.` },
        { fen: '5bk1/3R3p/4n1p1/5p2/6N1/7P/5KP1/2r5 w - - 0 43', sol: ['Nf6+', 'Kh8', 'Rxh7#'], real: `Lichess · niveau 886`, game: 'https://lichess.org/LrDzsdut/black', lvl: 'facile', hint: `Tour + cavalier dans le coin : le cavalier garde la case de fuite et protège la tour.` },
        { fen: '2r2b1k/1pq2pp1/p3pN1p/7Q/P7/2P1P3/6RP/6K1 w - - 4 28', sol: ['Qxh6+', 'gxh6', 'Rg8#'], real: `Lichess · niveau 1149`, game: 'https://lichess.org/bY548xUo/black', lvl: 'moyenne', hint: `Tour + cavalier dans le coin : le cavalier garde la case de fuite et protège la tour.` },
        { fen: '8/5kpR/1p2p1r1/5p2/8/1P2Qn2/P4PBP/3q1N1K b - - 23 40', sol: ['Qxf1+', 'Bxf1', 'Rg1#'], real: `Lichess · niveau 1268`, game: 'https://lichess.org/fkNNNkGR', lvl: 'moyenne', hint: `Tour + cavalier dans le coin : le cavalier garde la case de fuite et protège la tour.` },
      ] },

    { id: 'boden', group: 'classiques', icon: '✝️', name: 'Mat de Boden', en: "Boden's mate",
      lesson: `Deux fous en <b>diagonales croisées</b> matent un roi (souvent après un grand roque). Un fou donne l'échec sur une diagonale ; l'autre fou, de couleur opposée, couvre les cases de fuite ; les propres pièces du roi bouchent le reste. C'est le mat des deux fous par excellence, souvent introduit par un sacrifice de dame pour ouvrir les lignes.`,
      seq: `Idée type : Dxc3+! bxc3 Fa3#`,
      fen: '2kr4/3p4/B7/8/5B2/8/8/6K1',
      arrows: [{ from: 'a6', to: 'c8', color: R }, { from: 'f4', to: 'b8', color: G }],
      puzzles: [
        { fen: '2kr4/3p4/8/1B6/5B2/8/8/6K1 w - - 0 1', sol: ['Ba6#'], hint: `Le fou f4 couvre déjà b8 et c7. Amène l'autre fou sur la diagonale a6-c8.` },
        { fen: '3q2k1/1p3ppp/2rb2b1/3Q2P1/5p1P/2P2P2/PP1N4/2KR3R b - - 1 22', sol: ['Rxc3+', 'bxc3', 'Ba3#'], real: `Lichess · niveau 976`, game: 'https://lichess.org/e2HHLaZS', lvl: 'facile', hint: `Deux fous en diagonales croisées, et les pièces du roi bouchent le reste.` },
        { fen: '2kr1b1r/pp1nqp1p/2p1b3/2P5/3P1B2/3B1Q2/PP3KPP/R3R3 w - - 3 16', sol: ['Qxc6+', 'bxc6', 'Ba6#'], real: `Lichess · niveau 1190`, game: 'https://lichess.org/B6Vnvu63/black', lvl: 'moyenne', hint: `Deux fous en diagonales croisées, et les pièces du roi bouchent le reste.` },
        { fen: '2kr1b1r/p2n1ppp/1p6/1BpP4/3nN3/6B1/P4PPP/1RR3K1 w - - 0 19', sol: ['Ba6#'], real: `Lichess · niveau 1273`, game: 'https://lichess.org/wuF5ENWV/black', lvl: 'moyenne', hint: `Deux fous en diagonales croisées, et les pièces du roi bouchent le reste.` },
      ] },

    { id: 'baiser', group: 'classiques', icon: '💋', name: 'Baiser de la mort', en: 'Kiss of death',
      lesson: `La dame vient <b>se coller au roi</b>, soutenue par une pièce amie (ici le roi blanc) : le roi ennemi ne peut ni la capturer (elle est défendue) ni s'échapper (elle lui prend toutes ses cases). C'est le mat de base dame + roi contre roi, à connaître pour convertir n'importe quel avantage écrasant.`,
      seq: null,
      fen: '7k/6Q1/5K2/8/8/8/8/8',
      arrows: [{ from: 'f6', to: 'g7', color: B }, { from: 'g7', to: 'h8', color: R }],
      puzzles: [
        { fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', sol: ['Qg7#'], hint: `Ton roi défend déjà g7. Colle-y la dame : le roi noir est sans air.` },
        { fen: '8/5KPk/5P2/8/8/1p6/8/2q5 w - - 0 69', sol: ['g8=Q+', 'Kh6', 'Qg6#'], real: `Lichess · niveau 955`, game: 'https://lichess.org/qP7EyBjs/black', lvl: 'facile', hint: `Colle la dame au roi, protégée par ton propre roi : plus aucune case libre.` },
        { fen: '6R1/8/7k/8/5R2/6PK/8/3q4 b - - 5 82', sol: ['Qh1+', 'Kg4', 'Qh5#'], real: `Lichess · niveau 1183`, game: 'https://lichess.org/6HAi3HVj', lvl: 'moyenne', hint: `Colle la dame au roi, protégée par ton propre roi : plus aucune case libre.` },
        { fen: '4q1Q1/7P/5k1K/8/8/8/8/8 b - - 0 63', sol: ['Qe3+', 'Qg5+', 'Qxg5#'], real: `Lichess · niveau 1289`, game: 'https://lichess.org/VWBuDIMJ', lvl: 'moyenne', hint: `Colle la dame au roi, protégée par ton propre roi : plus aucune case libre.` },
      ] },

    // ══════════ ④ mats sur le roque ══════════
    { id: 'h7', group: 'attaque', icon: '🎁', name: 'Mat en h7 (sacrifice grec)', en: 'Greek gift / h7 mate',
      lesson: `L'attaque type contre le petit roque : on sacrifie un fou en <b>Fxh7+</b> pour arracher le pion h7, puis on amène la dame (souvent avec un cavalier en g5) donner mat sur h7. La dame y est soutenue par le fou de cases claires (diagonale b1-h7) : le roi ne peut pas la prendre. Le schéma-clé de toute attaque à l'aile roi.`,
      seq: `Sacrifice grec : Fxh7+ Rxh7, Cg5+ … Dh5-h7#`,
      fen: '7k/6pQ/8/8/8/3B4/8/6K1',
      arrows: [{ from: 'd3', to: 'h7', color: B }, { from: 'h7', to: 'h8', color: R }],
      puzzles: [
        { fen: '7k/6p1/8/7Q/8/3B4/8/6K1 w - - 0 1', sol: ['Qh7#'], hint: `Le fou d3 tient la case h7. Pose-y la dame : le roi est coincé dans le coin.` },
        { fen: '6rk/1p1P3p/p6Q/3pP3/8/P2B1q2/1P4rP/6RK w - - 0 31', sol: ['Qxh7#'], real: `Lichess · niveau 957`, game: 'https://lichess.org/QAkx9CLH/black', lvl: 'facile', hint: `La dame vient sur h7, protégée par le fou de cases claires : le roi est coincé dans le coin.` },
        { fen: 'r2qrbk1/1bp2pp1/pn1p3p/1p2P3/3PNn2/1P1Q1N1P/PBB2PP1/R3R1K1 w - - 2 19', sol: ['Nf6+', 'Qxf6', 'Qh7#'], real: `Lichess · niveau 1089`, game: 'https://lichess.org/RDd3Xx2q/black', lvl: 'moyenne', hint: `La dame vient sur h7, protégée par le fou de cases claires : le roi est coincé dans le coin.` },
        { fen: '5r1k/ppp2qpp/3b4/8/3N4/2Q1N2P/PP3P1P/4R1K1 b - - 0 24', sol: ['Qxf2+', 'Kh1', 'Qxh2#'], real: `Lichess · niveau 1280`, game: 'https://lichess.org/bTIn2jo6', lvl: 'moyenne', hint: `La dame vient sur h7, protégée par le fou de cases claires : le roi est coincé dans le coin.` },
      ] },

    { id: 'g7', group: 'attaque', icon: '⛪', name: 'Mat en g7 (grande diagonale)', en: 'Long-diagonal mate',
      lesson: `Le fou fianchetto (sur la grande diagonale a1-h8) et la dame se combinent contre <b>g7</b>. Une fois le pion g7 disparu ou détourné, la dame s'installe en g7 au contact du roi, protégée par le fou lointain : mat imparable. C'est la sanction classique quand on affaiblit son grand fianchetto.`,
      seq: null,
      fen: '6k1/6Q1/8/8/8/8/1B6/6K1',
      arrows: [{ from: 'b2', to: 'g7', color: B }, { from: 'g7', to: 'g8', color: R }],
      puzzles: [
        { fen: '6k1/8/6Q1/8/8/8/1B6/6K1 w - - 0 1', sol: ['Qg7#'], hint: `Le fou b2 balaie toute la grande diagonale et défend g7. Amènes-y la dame.` },
        { fen: '3r2k1/1b3ppp/p1q1P3/8/P1pr4/4Q3/BPP3PP/1R3RK1 b - - 0 23', sol: ['Qxg2#'], real: `Lichess · niveau 869`, game: 'https://lichess.org/gJpG4ufq', lvl: 'facile', hint: `La dame se pose en g7, soutenue par le fou de la grande diagonale.` },
        { fen: '6k1/pp3ppp/2b1p3/7q/3Q1P2/P6P/1P4P1/R4R1K b - - 0 26', sol: ['Qxh3+', 'Kg1', 'Qxg2#'], real: `Lichess · niveau 1185`, game: 'https://lichess.org/zd3hkvxa', lvl: 'moyenne', hint: `La dame se pose en g7, soutenue par le fou de la grande diagonale.` },
        { fen: 'r2q3k/pbp2n1p/1p3b1B/3p1Q2/2P5/8/PP3PPP/R3R1K1 w - - 0 21', sol: ['Re8+', 'Qxe8', 'Qxf6+', 'Kg8', 'Qg7#'], real: `Lichess · niveau 1387`, game: 'https://lichess.org/vLYUBCKb/black', lvl: 'soutenue', hint: `La dame se pose en g7, soutenue par le fou de la grande diagonale.` },
      ] },

    { id: 'lolli', group: 'attaque', icon: '♟️', name: 'Mat de Lolli', en: "Lolli's mate",
      lesson: `Un <b>pion blanc planté en f6</b> devient une épine mortelle : il défend la case g7. La dame vient alors mater en g7, soutenue par ce pion, avec le roi coincé en g8 (le pion f6 lui coupe aussi la fuite en f8… via g7). Le pion f6 (ou f3 côté noir) est l'une des pièces d'attaque les plus dangereuses de l'échiquier.`,
      seq: null,
      fen: '6k1/6Q1/5P2/8/8/8/8/6K1',
      arrows: [{ from: 'f6', to: 'g7', color: B }, { from: 'g7', to: 'g8', color: R }],
      puzzles: [
        { fen: '6k1/8/5P2/6Q1/8/8/8/6K1 w - - 0 1', sol: ['Qg7#'], hint: `Le pion f6 protège la case g7. Plante la dame au contact du roi.` },
        { fen: 'r1b2rk1/pp1p1p1p/5P2/4qpp1/1PB1P1Q1/P7/6PP/R6K w - - 0 21', sol: ['Qxg5+', 'Kh8', 'Qg7#'], real: `Lichess · niveau 906`, game: 'https://lichess.org/mHToC93l/black', lvl: 'facile', hint: `Le pion f6 tient la case g7 : amène la dame au contact du roi.` },
        { fen: '5r1k/Q2R4/4qPp1/1p2p1n1/2p1P3/2P2B2/P5K1/8 w - - 0 43', sol: ['Rh7+', 'Nxh7', 'Qg7#'], real: `Lichess · niveau 1162`, game: 'https://lichess.org/VB4gDXSf/black', lvl: 'moyenne', hint: `Le pion f6 tient la case g7 : amène la dame au contact du roi.` },
        { fen: '5r2/1q2n2k/p4Ppp/2p5/2Pp1Q2/P7/3B2PP/7K w - - 0 35', sol: ['Qxh6+', 'Kg8', 'Qg7#'], real: `Lichess · niveau 1312`, game: 'https://lichess.org/aVedPnkJ/black', lvl: 'moyenne', hint: `Le pion f6 tient la case g7 : amène la dame au contact du roi.` },
      ] },

    { id: 'damiano', group: 'attaque', icon: '👑', name: 'Mat de Damiano', en: "Damiano's mate",
      lesson: `Décrit dès <b>1512</b> par Damiano : un pion blanc en g6 tient la case h7, la dame vient mater en h7 le roi acculé en h8. On y arrive typiquement par un <b>sacrifice de tour</b> sur h7 (ou h8) qui force le roi dans le coin, avant que la dame ne rejoigne la colonne h. Le pion g6 est le clou qui empêche le roi de respirer.`,
      seq: `Idée type : Th8+! Rxh8, Dh-file … Dh7#`,
      fen: '7k/7Q/6P1/8/8/8/8/6K1',
      arrows: [{ from: 'g6', to: 'h7', color: B }, { from: 'h7', to: 'h8', color: R }],
      puzzles: [
        { fen: '7k/8/6P1/7Q/8/8/8/6K1 w - - 0 1', sol: ['Qh7#'], hint: `Le pion g6 verrouille h7. Amène la dame sur la colonne h pour mater dans le coin.` },
        { fen: '1r4k1/p4p2/4pQPp/3p2q1/3P4/2N5/5PPK/1b6 w - - 0 35', sol: ['Qxf7+', 'Kh8', 'Qh7#'], real: `Lichess · niveau 970`, game: 'https://lichess.org/i4dYZ269/black', lvl: 'facile', hint: `Le pion g6 verrouille h7 : amène la dame sur la colonne h.` },
        { fen: '1k5r/1pp2p2/p4P2/8/4B3/2P2QpP/Pr3qP1/2R1R2K b - - 1 33', sol: ['Rxh3+', 'gxh3', 'Qh2#'], real: `Lichess · niveau 1190`, game: 'https://lichess.org/D8WpGFZU', lvl: 'moyenne', hint: `Le pion g6 verrouille h7 : amène la dame sur la colonne h.` },
        { fen: '2r1brk1/6p1/4p1P1/ppbp1p1R/5B2/2PBP2P/PP3q2/2KQ4 w - - 5 25', sol: ['Rh8+', 'Kxh8', 'Qh5+', 'Kg8', 'Qh7#'], real: `Lichess · niveau 1221`, game: 'https://lichess.org/nMds3cZ9/black', lvl: 'moyenne', hint: `Le pion g6 verrouille h7 : amène la dame sur la colonne h.` },
      ] },
  ];

  // ───────────────────────── overlay ─────────────────────────
  function ensureDom() {
    if ($('#mate-overlay')) return;
    const o = document.createElement('div');
    o.id = 'mate-overlay';
    o.className = 'guess-overlay';
    o.hidden = true;
    o.innerHTML = `<div class="guess-panel">
      <div class="guess-head"><button class="back-btn" id="mate-close">←</button>
      <span class="guess-title" id="mate-title">♚ Les mats</span><span class="guess-score" id="mate-head-extra"></span></div>
      <div id="mate-stage"></div></div>`;
    document.body.appendChild(o);
    $('#mate-close').onclick = onBack;
  }

  let current = null; // null = menu, else a mate id (detail view)

  function show() {
    ensureDom();
    $('#mate-overlay').hidden = false;
    document.body.classList.add('guess-open');
    renderMenu();
  }
  function close() {
    const o = $('#mate-overlay');
    if (o) o.hidden = true;
    document.body.classList.remove('guess-open');
  }
  function onBack() {
    if (current) { current = null; renderMenu(); }
    else close();
  }

  let query = ''; // survives a round trip through a mate detail view

  function renderMenu() {
    current = null;
    $('#mate-title').textContent = '♚ Les mats';
    $('#mate-head-extra').textContent = `${MATES.length} figures`;
    const exos = MATES.reduce((a, m) => a + (m.puzzles ? m.puzzles.length : 0), 0);
    let html = `<p class="mate-intro">Un mat, c'est un roi en échec qui ne peut <b>ni fuir, ni parer, ni capturer</b>. Voici les figures de mat qui reviennent le plus souvent : apprends à les reconnaître, puis entraîne-toi à les poser sur l'échiquier.</p>
      <div class="lx-search">
        <span class="lx-search-ic">🔍</span>
        <input class="lx-search-input" id="mate-search" type="search" placeholder="Chercher un mat : couloir, étouffée, Boden…" autocomplete="off" spellcheck="false" />
        <button class="lx-search-clear" id="mate-search-clear" type="button" aria-label="Effacer" hidden>&times;</button>
      </div>
      <div class="lx-count" id="mate-count">${MATES.length} figures — ${exos} exercices jouables</div>`;
    // (the exercise provenance is explained by the chips inside the practice overlay)
    for (const grp of GROUPS) {
      html += `<div class="mate-group" data-group="${grp.id}"><h4 class="mate-group-title">${grp.title}</h4>
        <p class="mate-group-intro">${grp.intro}</p><div class="mate-grid">`;
      for (const m of MATES.filter(x => x.group === grp.id)) {
        const n = m.puzzles ? m.puzzles.length : 0;
        html += `<button class="mate-card" data-id="${m.id}">
          <span class="mate-card-icon">${m.icon}</span>
          <span class="mate-card-name">${m.name}</span>
          <span class="mate-card-en">${m.en}</span>
          <span class="mate-card-train">🎯 ${n} exercice${n > 1 ? 's' : ''}</span>
        </button>`;
      }
      html += `</div></div>`;
    }
    html += `<div class="lx-empty" id="mate-empty" hidden>Aucun mat ne correspond.<br><span>Essaie « couloir », « cavalier », « roque »…</span></div>`;
    html += `<p class="lx-credit">Chaque figure commence par un <b>schéma épuré</b> (la géométrie du mat), puis se poursuit avec des positions de <b>vraies parties</b> tirées de la <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener">base de puzzles Lichess</a> (domaine public), de la plus facile à la plus soutenue. Toutes sont vérifiées au moteur : la ligne mate vraiment.</p>`;
    $('#mate-stage').innerHTML = html;
    document.querySelectorAll('#mate-stage .mate-card').forEach(b =>
      b.onclick = () => openMate(b.dataset.id));
    initSearch(exos);
  }

  // Live filter over the mate figures (name, English name, lesson text, group).
  function initSearch(exos) {
    const input = $('#mate-search'), clear = $('#mate-search-clear'), count = $('#mate-count'), empty = $('#mate-empty');
    if (!input) return;
    const fold = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/<[^>]+>/g, '');
    const hay = new Map(MATES.map(m => {
      const grp = GROUPS.find(g => g.id === m.group);
      return [m.id, fold([m.name, m.en, m.lesson, m.seq, grp && grp.title].join(' '))];
    }));
    const cards = [...document.querySelectorAll('#mate-stage .mate-card')];
    const groups = [...document.querySelectorAll('#mate-stage .mate-group')];

    const apply = () => {
      const q = fold(input.value.trim());
      clear.hidden = !q;
      let n = 0;
      for (const card of cards) {
        const ok = !q || (hay.get(card.dataset.id) || '').includes(q);
        card.hidden = !ok;
        if (ok) n++;
      }
      for (const g of groups) g.hidden = ![...g.querySelectorAll('.mate-card')].some(c => !c.hidden);
      empty.hidden = n > 0;
      count.innerHTML = q ? `<b>${n}</b> figure${n > 1 ? 's' : ''} sur ${MATES.length}` : `${MATES.length} figures — ${exos} exercices jouables`;
      query = input.value;
    };
    input.value = query;
    input.addEventListener('input', apply);
    clear.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; apply(); } });
    apply();
  }

  function openMate(id) {
    const m = MATES.find(x => x.id === id);
    if (!m) return;
    current = id;
    $('#mate-title').textContent = m.icon + ' ' + m.name;
    $('#mate-head-extra').textContent = '';
    const n = m.puzzles ? m.puzzles.length : 0;
    const diagram = m.fen
      ? `<div class="mate-diagram"><svg viewBox="0 0 360 360" id="mate-board"></svg><svg viewBox="0 0 360 360" id="mate-arrows" class="arrow-overlay"></svg></div>`
      : '';
    const seq = m.seq ? `<div class="mate-seq">${m.seq}</div>` : '';
    $('#mate-stage').innerHTML = `
      <div class="mate-detail">
        ${diagram}
        <div class="mate-lesson">
          <span class="mate-detail-en">${m.en}</span>
          <p>${m.lesson}</p>
          ${seq}
        </div>
      </div>
      <div class="guess-nav">
        <button class="train-btn ghost" id="mate-back-btn">← Toutes les figures</button>
        ${n ? `<button class="train-btn good" id="mate-train">🎯 S'entraîner — ${n} position${n > 1 ? 's' : ''}</button>` : ''}
      </div>`;
    if (m.fen) {
      const prevFlip = BoardRenderer.isFlipped();
      BoardRenderer.setFlipped(false);
      BoardRenderer.render($('#mate-board'), m.fen);
      BoardRenderer.drawArrows($('#mate-arrows'), m.arrows || []);
      BoardRenderer.setFlipped(prevFlip);
    }
    $('#mate-back-btn').onclick = onBack;
    const t = $('#mate-train');
    if (t) t.onclick = () => {
      close(); // hide this overlay so practice isn't stacked behind it
      if (typeof Tactics !== 'undefined' && Tactics.start) Tactics.start(m.puzzles, m.name);
    };
  }

  return { show, close, MATES, GROUPS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Mates;
