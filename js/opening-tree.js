// Arbre visuel des ouvertures — panneau "Apprendre".
// Arbre horizontal dépliable, branches courbes colorées par famille, barre de
// détail avec échiquier (BoardRenderer) et deux liens : explorateur interne
// (App.openOpeningByLine) et fiche Chess.com.
const OpeningTree = (() => {
  const FAM = {
    open:       { name: 'Ouvertes',      color: '#4ade80' },
    semiopen:   { name: 'Semi-ouvertes', color: '#60a5fa' },
    closed:     { name: 'Fermées',       color: '#c084fc' },
    semiclosed: { name: 'Semi-fermées',  color: '#22d3ee' },
    flank:      { name: 'Flanc',         color: '#fb923c' },
  };
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const CC_HUB = 'https://www.chess.com/openings';

  // mv = coup affiché (FR) · line = ligne SAN anglaise (chemin complet)
  // appLine = ligne exacte de l'explorateur interne (ou null → liste Ouvertures)
  // cc = slug de la fiche Chess.com (ou null → hub Chess.com)
  const TREE = {
    icon: '🏁', lbl: 'Position de départ', fen: START, appLine: null, cc: null,
    idea: "Le premier coup des Blancs donne le ton : <span class='k'>1.e4</span> vise le jeu ouvert et rapide, <span class='k'>1.d4</span> un centre solide et stratégique, les coups de flanc (<span class='k'>1.c4</span>, <span class='k'>1.Cf3</span>) attaquent le centre à distance.",
    kids: [
      { mv: '1.e4', icon: '⚔️', lbl: 'Pion roi', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', appLine: null, cc: null,
        idea: "Libère fou-roi et dame, occupe le centre. Le pion e4 n'est pas défendu → jeu souvent vif et tactique.",
        kids: [
          { mv: '1...e5', icon: '🔓', lbl: 'Jeux ouverts', fam: 'open', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', appLine: null, cc: null,
            idea: "Réponse symétrique : les deux camps se disputent le centre frontalement → <span class='k'>jeux ouverts</span>, riches en tactique.",
            kids: [
              { mv: '2.Cf3', icon: '♞', lbl: 'Cavalier roi', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', appLine: null, cc: null,
                idea: "Menace immédiatement e5 : le coup le plus naturel.",
                kids: [
                  { mv: '2...Cc6', icon: '🛡️', lbl: 'Défense de e5', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', appLine: null, cc: null,
                    idea: "Carrefour des grandes ouvertes : les Noirs défendent e5 et développent.",
                    kids: [
                      { mv: '3.Fb5', icon: '🇪🇸', lbl: 'Espagnole (Ruy Lopez)', eco: 'C60–C99', fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
                        appLine: 'e4 e5 Nf3 Nc6 Bb5', cc: 'Ruy-Lopez-Opening',
                        idea: "Le fou attaque le défenseur de e5. L'ouverture la plus profonde du répertoire classique : pression durable, jeu positionnel.",
                        plans: { w: "Presser e5 via Fb5, roquer, puis c3-d4 pour bâtir un gros centre et étouffer les Noirs.", b: "Chasser le fou par ...a6/...b5, tenir e5 et développer ...Fe7, ...O-O, ...d6, viser une contre-poussée ...d5." },
                        kids: [
                          { mv: '3...a6', icon: '❓', lbl: 'Défense Morphy', eco: 'C70–C99', fen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
                            appLine: 'e4 e5 Nf3 Nc6 Bb5 a6', cc: 'Ruy-Lopez-Opening-Morphy-Defense',
                            idea: "Le grand coup principal : ...a6 pose la question au fou. Après <span class='k'>4.Fa4</span> les Blancs gardent la pression, <span class='k'>4.Fxc6</span> mène à la variante d'échange.",
                            plans: { w: "Reculer Fa4 pour garder la pression, ou Fxc6 pour la structure, puis c3-d4.", b: "Gagner l'espace à l'aile dame (...b5, ...Fc5/...Fe7), tenir e5, préparer ...d6/...d5." },
                            kids: [
                              { mv: '4.Fa4 Cf6 5.O-O', icon: '🏰', lbl: 'Système fermé', eco: 'C84–C99', fen: 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 3 5',
                                appLine: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O', cc: 'Ruy-Lopez-Opening-Closed-Variation',
                                idea: "Le cœur de l'espagnole : les deux camps roquent et manœuvrent longuement autour de e5 et de la case d5.",
                                plans: { w: "Te1, c3, d4 puis la manœuvre Cb1-d2-f1-g3 (Tchigorine) pour presser l'aile roi.", b: "...Fe7, ...O-O, ...d6, ...Ca5 ou ...Cb8-d7, viser la rupture ...c5." } },
                              { mv: '…c3 d5', icon: '💥', lbl: 'Attaque Marshall', eco: 'C89', fen: 'r1bq1rk1/2p1bppp/p1n2n2/1p1pp3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - d6 0 9',
                                appLine: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5', cc: 'Ruy-Lopez-Opening-Marshall-Attack',
                                idea: "Les Noirs sacrifient le pion e5 par ...d5 pour une attaque durable sur le roi blanc. Théorie dense et forcée.",
                                plans: { w: "Accepter le pion et défendre avec précision (g3, d4) pour convertir le matériel.", b: "Ouvrir les lignes (...Cxe4, ...Fd6, ...Dh4), pression permanente contre le pion en plus." } },
                              { mv: '4.Fxc6 dxc6', icon: '♻️', lbl: "Variante d'échange", eco: 'C68–C69', fen: 'r1bqkbnr/1pp2ppp/p1p5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5',
                                appLine: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6', cc: 'Ruy-Lopez-Opening-Exchange-Variation',
                                idea: "Les Blancs abîment la structure noire, misant sur une meilleure finale : majorité 4 contre 3 saine à l'aile roi.",
                                plans: { w: "Simplifier (d4), viser la finale où la majorité à l'aile roi est saine.", b: "Exploiter la paire de fous et les colonnes ouvertes avant les échanges." } },
                            ]},
                          { mv: '3...Cf6', icon: '🧱', lbl: 'Défense berlinoise', eco: 'C65–C67', fen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
                            appLine: 'e4 e5 Nf3 Nc6 Bb5 Nf6', cc: 'Ruy-Lopez-Opening-Berlin-Defense',
                            idea: "Contre-attaque e4 immédiatement. Le célèbre « mur de Berlin » : après 4.O-O Cxe4 5.d4 les dames s'échangent tôt vers une finale très solide.",
                            plans: { w: "Éviter l'échange des dames (4.d3) pour garder les pièces, ou accepter la finale Berlin et presser.", b: "Aller vers la finale sûre (...Cd6), ou tenir avec ...d6/...Fc5 façon italienne." } },
                          { mv: '3...d6', icon: '🐢', lbl: 'Défense Steinitz', eco: 'C62', fen: 'r1bqkbnr/ppp2ppp/2np4/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
                            appLine: 'e4 e5 Nf3 Nc6 Bb5 d6', cc: 'Ruy-Lopez-Opening-Steinitz-Defense',
                            idea: "Défend e5 solidement mais cède de l'espace. Robuste, peu théorique, un peu passive.",
                            plans: { w: "Prendre le centre par d4, l'espace, exploiter le manque d'activité noir.", b: "Rester compact, échanger au bon moment, viser une position tenable." } },
                          { mv: '3...f5', icon: '🎇', lbl: 'Gambit Schliemann', eco: 'C63', fen: 'r1bqkbnr/pppp2pp/2n5/1B2pp2/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq f6 0 4',
                            appLine: 'e4 e5 Nf3 Nc6 Bb5 f5', cc: 'Ruy-Lopez-Opening-Schliemann-Defense',
                            idea: "Contre-gambit tranchant : ...f5 frappe e4 tout de suite pour un jeu chaotique. Risqué mais redoutable en pratique.",
                            plans: { w: "Réfuter par la précision : 4.Cc3 (le plus sûr) ou 4.d3, ouvrir contre le roi noir exposé.", b: "Ouvrir les lignes vite (...fxe4), chercher l'initiative et l'attaque." } },
                        ]},
                      { mv: '3.Fc4', icon: '🇮🇹', lbl: 'Italienne', eco: 'C50–C54', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
                        appLine: 'e4 e5 Nf3 Nc6 Bc4', cc: 'Italian-Game',
                        idea: "Le fou vise f7, le point faible. Développement rapide, parfaite pour apprendre les principes d'ouverture. Deux grandes routes : <span class='k'>3...Fc5</span> (Giuoco Piano) et <span class='k'>3...Cf6</span> (Deux Cavaliers).",
                        plans: { w: "Développement rapide, viser f7 avec Fc4, roquer puis c3-d4 pour prendre le centre.", b: "Copier le développement (...Fc5 ou ...Cf6), contrôler d4 et garder f7 solide." },
                        kids: [
                          { mv: '3...Fc5', icon: '🤌', lbl: 'Giuoco Piano', eco: 'C50–C54', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
                            appLine: 'e4 e5 Nf3 Nc6 Bc4 Bc5', cc: 'Italian-Game-Giuoco-Piano',
                            idea: "« Le jeu tranquille » : les deux fous fixent la diagonale vers f7/f2. Position symétrique et saine, riche en plans selon que les Blancs jouent lentement (d3) ou frappent au centre (c3-d4) — ou sacrifient par le Gambit Evans (b4).",
                            plans: { w: "Choisir son tempo : d3 (pianissimo lent) ou c3+d4 (centre), viser f7 et l'aile roi.", b: "Symétrie saine (...Cf6, ...d6, ...O-O), tenir le centre et contester d4." },
                            kids: [
                              { mv: '4.c3', icon: '🎯', lbl: 'Variante centrale', eco: 'C53–C54', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq - 0 4',
                                appLine: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3', cc: 'Italian-Game-Giuoco-Piano',
                                idea: "Prépare d4 pour bâtir un grand centre. La ligne classique : après 4...Cf6 5.d4 exd4 6.cxd4 Fb4+ le jeu s'ouvre.",
                                plans: { w: "Jouer d4 pour un centre e4-d4 mobile, développer et attaquer f7.", b: "Frapper le centre (...Cf6, ...d5 au bon moment) et clouer/échanger pour égaliser." },
                                kids: [
                                  { mv: '4…Cf6 5.d4', icon: '⚡', lbl: 'Attaque centrale', eco: 'C54', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2BPP3/2P2N2/PP3PPP/RNBQK2R b KQkq d3 0 5',
                                    appLine: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4', cc: 'Italian-Game-Giuoco-Piano',
                                    idea: "Le grand centre se met en marche : le pion d4 défie Fc5 et e5, ouvrant des lignes tranchantes vers le roi noir.",
                                    plans: { w: "Ouvrir le centre, gagner du temps sur Fc5, viser une attaque directe (parfois sacrifice sur f7).", b: "Rendre la pression par ...exd4, ...Fb4+ et ...d5 pour libérer le jeu." } },
                                ]},
                              { mv: '4.d3', icon: '🐌', lbl: 'Giuoco Pianissimo', eco: 'C50', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4',
                                appLine: 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3', cc: 'Italian-Game-Giuoco-Pianissimo',
                                idea: "« Le jeu très tranquille » : les Blancs renoncent à d4 immédiat et manœuvrent lentement (c3, Cbd2, Fb3, Te1) — l'italienne moderne des tournois.",
                                plans: { w: "Construction lente c3/Cbd2/Fb3/Te1, puis Cf1-g3 et poussée d4 ou a4 au bon moment.", b: "Reproduire le plan (...d6, ...a6, ...Fa7, ...O-O) et viser ...d5 ou le contre-jeu sur l'aile dame." } },
                              { mv: '4.b4', icon: '🎁', lbl: 'Gambit Evans', eco: 'C51–C52', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/1PB1P3/5N2/P1PP1PPP/RNBQK2R b KQkq b3 0 4',
                                appLine: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', cc: 'Evans-Gambit',
                                idea: "Un pion offert pour un développement fulgurant : après ...Fxb4 c3 le fou est chassé et les Blancs jouent d4 avec un centre écrasant. L'arme romantique par excellence.",
                                plans: { w: "Récupérer du temps par c3+d4, gros centre et attaque directe sur f7 et le roi.", b: "Accepter puis rendre le pion au bon moment (...Fa5/...Fb6, ...d6, ...Ca5) pour neutraliser l'attaque." },
                                kids: [
                                  { mv: '4…Fxb4 5.c3', icon: '🤝', lbl: 'Evans accepté', eco: 'C51–C52', fen: 'r1bqk1nr/pppp1ppp/2n5/b3p3/2B1P3/2P2N2/P2P1PPP/RNBQK2R w KQkq - 1 6',
                                    appLine: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5', cc: 'Evans-Gambit',
                                    idea: "Les Noirs prennent le pion et reculent le fou en a5 ; les Blancs jouent d4 avec un centre et un développement d'avance.",
                                    plans: { w: "d4 tout de suite, ouvrir le jeu et attaquer avant que les Noirs ne se coordonnent.", b: "Rendre le pion pour se développer (...d6, ...Fb6, ...Ca5) et atteindre une position saine." } },
                                  { mv: '4…Fb6', icon: '🚫', lbl: 'Evans décliné', eco: 'C51', fen: 'r1bqk1nr/pppp1ppp/1bn5/4p3/1PB1P3/5N2/P1PP1PPP/RNBQK2R w KQkq - 1 5',
                                    appLine: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bb6', cc: 'Evans-Gambit-Declined',
                                    idea: "Refuser le cadeau : le fou recule en b6 et garde la structure. Sûr mais concède l'espace (a4-a5 gêne le fou).",
                                    plans: { w: "Gagner de l'espace par a4-a5, chasser le fou et garder l'initiative.", b: "Rester solide, ne pas se laisser étouffer, viser ...a6 et le contre-jeu central." } },
                                ]},
                            ]},
                          { mv: '3...Cf6', icon: '🐴', lbl: 'Défense des deux cavaliers', eco: 'C55–C59', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
                            appLine: 'e4 e5 Nf3 Nc6 Bc4 Nf6', cc: 'Italian-Game-Two-Knights-Defense',
                            idea: "Plus ambitieuse que 3...Fc5 : les Noirs attaquent e4 et invitent les complications. Après <span class='k'>4.Cg5</span> le fou et le cavalier fondent sur f7 (piège du Fegatello), d'où des lignes tranchantes.",
                            plans: { w: "Frapper f7 par 4.Cg5, ou tempérer par 4.d3/4.d4 pour un jeu plus positionnel.", b: "Accepter les complications (...d5, ...Ca5) ou contre-attaquer (Traxler ...Fc5) — jeu très concret." },
                            kids: [
                              { mv: '4.Cg5', icon: '🍴', lbl: 'Attaque sur f7', eco: 'C57', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4',
                                appLine: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5', cc: 'Italian-Game-Two-Knights-Defense-Knight-Attack',
                                idea: "Le cavalier saute en g5 pour prendre f7 avec le fou : brutal mais ...d5 est la parade. Mène au fameux « Fegatello » (foie frit) et à la contre-attaque Traxler.",
                                plans: { w: "Prendre f7 pour ouvrir le roi noir — mais bien calculer, les Noirs ont du contre-jeu.", b: "Répliquer ...d5 aussitôt, sacrifier un pion (Polerio ...Ca5) pour un développement supérieur." },
                                kids: [
                                  { mv: '4…d5 5.exd5 Ca5', icon: '🛡️', lbl: 'Variante Polerio', eco: 'C58', fen: 'r1bqkb1r/ppp2ppp/5n2/n2Pp1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 1 6',
                                    appLine: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5', cc: 'Italian-Game-Two-Knights-Defense',
                                    idea: "La réponse saine : ...Ca5 attaque le fou c4 et sacrifie un pion pour une longue avance de développement et l'initiative.",
                                    plans: { w: "Garder le pion en plus (Fb5+, d3) et survivre à la pression pour convertir en finale.", b: "Développer vite (...Fc5/...Fd6, ...O-O), presser sur e4 et f2 en compensation du pion." } },
                                  { mv: '4…Fc5', icon: '🔥', lbl: 'Contre-attaque Traxler', eco: 'C57', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p1N1/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 6 5',
                                    appLine: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5', cc: 'Italian-Game-Two-Knights-Defense-Traxler-Variation',
                                    idea: "Ignorer la menace sur f7 et contre-attaquer f2 ! Ligne romantique et sauvage : les deux rois s'exposent, gare aux pièges des deux côtés.",
                                    plans: { w: "Choisir la prudence (5.Fxf7+) plutôt que 5.Cxf7 (très risqué), garder la tête froide.", b: "Sacrifier pour l'attaque (...Fxf2+, ...Cxf2), viser le roi blanc resté au centre." } },
                                ]},
                              { mv: '4.d4', icon: '🌋', lbl: 'Attaque Max Lange', eco: 'C55–C56', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2BPP3/5N2/PPP2PPP/RNBQK2R b KQkq d3 0 4',
                                appLine: 'e4 e5 Nf3 Nc6 Bc4 Nf6 d4', cc: 'Italian-Game-Two-Knights-Defense',
                                idea: "Ouvrir le centre tout de suite : après 4...exd4 le jeu devient très tactique (l'attaque Max Lange proprement dite naît de 5.O-O).",
                                plans: { w: "Ouvrir vite, sacrifier des pions pour l'initiative et l'attaque sur le roi.", b: "Rendre le matériel avec précision et se développer pour émousser l'attaque." } },
                              { mv: '4.d3', icon: '🐌', lbl: 'Variante lente', eco: 'C55', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4',
                                appLine: 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3', cc: 'Italian-Game-Two-Knights-Defense',
                                idea: "L'approche moderne et positionnelle : les Blancs transposent souvent vers un Giuoco Pianissimo, sans laisser de contre-jeu tactique.",
                                plans: { w: "Manœuvrer tranquillement (c3, Cbd2, Fb3, Te1) et préparer d4 en sécurité.", b: "Développer sainement (...Fc5/...Fe7, ...d6, ...O-O) et viser ...d5 ou ...a5." } },
                            ]},
                          { mv: '3...Fe7', icon: '🕊️', lbl: 'Défense hongroise', eco: 'C50', fen: 'r1bqk1nr/ppppbppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
                            appLine: 'e4 e5 Nf3 Nc6 Bc4 Be7', cc: 'Italian-Game-Hungarian-Defense',
                            idea: "Modeste et solide : le fou va en e7 plutôt qu'en c5 pour éviter toute complication. Peu d'espace mais sans faiblesse.",
                            plans: { w: "Prendre le centre (d4) et l'espace, jouer contre le manque d'activité noir.", b: "Rester compact (...d6, ...Cf6, ...O-O) et attendre patiemment la rupture ...d5." } },
                        ]},
                      { mv: '3.d4', icon: '🏴', lbl: 'Écossaise', eco: 'C44–C45', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq d3 0 3',
                        appLine: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', cc: 'Scotch-Game',
                        idea: "Ouvre le centre tout de suite : jeu clair et actif, peu de théorie. Après <span class='k'>3...exd4</span> les Blancs reprennent (4.Cxd4, la Partie Écossaise) ou gambitent (4.Fc4 / 4.c3).",
                        plans: { w: "Ouvrir le centre par d4, développer librement et occuper l'espace.", b: "Rendre le jeu clair : ...Fc5 ou ...Cf6, développement sain, viser l'égalité." },
                        kids: [
                          { mv: '3…exd4 4.Cxd4', icon: '🏴', lbl: 'Partie Écossaise', eco: 'C45', fen: 'r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 0 4',
                            appLine: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', cc: 'Scotch-Game',
                            idea: "Les Blancs reprennent le pion avec un beau cavalier central. Deux réponses de référence : <span class='k'>4...Fc5</span> (classique) et <span class='k'>4...Cf6</span> (Schmidt).",
                            plans: { w: "Renforcer le centre (Cxc6, e5, c3), garder l'espace et viser un léger avantage durable.", b: "Frapper Cd4 par ...Fc5 ou ...Cf6, forcer des échanges et égaliser proprement." },
                            kids: [
                              { mv: '4…Fc5', icon: '⚔️', lbl: 'Variante classique', eco: 'C45', fen: 'r1bqk1nr/pppp1ppp/2n5/2b5/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5',
                                appLine: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5', cc: 'Scotch-Game-Classical-Variation',
                                idea: "Le fou attaque Cd4 et pointe vers f2 : jeu direct. Après 5.Cxc6 Df6 les Noirs récupèrent avec activité.",
                                plans: { w: "Échanger en c6 pour affaiblir la structure noire, développer et neutraliser le Fc5.", b: "Activer les pièces (...Df6, ...Cge7), viser f2 et une pression rapide." } },
                              { mv: '4…Cf6', icon: '🎯', lbl: 'Variante Schmidt', eco: 'C45', fen: 'r1bqkb1r/pppp1ppp/2n2n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5',
                                appLine: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6', cc: 'Scotch-Game-Schmidt-Variation',
                                idea: "Attaque e4 et prépare ...Fb4. La grande ligne moderne : 5.Cxc6 bxc6 6.e5 mène à des structures asymétriques bien étudiées.",
                                plans: { w: "5.Cxc6 bxc6 6.e5 pour gagner de l'espace, ou 5.Cc3 vers un jeu de développement.", b: "Contre-attaquer e5 (...Da5+/...Cd5), exploiter la paire de fous et les colonnes ouvertes." } },
                            ]},
                          { mv: '3…exd4 4.Fc4', icon: '🎁', lbl: 'Gambit Écossais', eco: 'C44', fen: 'r1bqkbnr/pppp1ppp/2n5/8/2BpP3/5N2/PPP2PPP/RNBQK2R b KQkq - 1 4',
                            appLine: 'e4 e5 Nf3 Nc6 d4 exd4 Bc4', cc: 'Scotch-Gambit',
                            idea: "Au lieu de reprendre, les Blancs développent le fou vers f7 et laissent le pion d4 : développement rapide contre matériel.",
                            plans: { w: "Développer à toute allure (O-O, c3), viser f7 et ouvrir le centre pour attaquer.", b: "Rendre le pion sereinement (...Cf6, ...d6/...Fc5) et neutraliser l'initiative." } },
                          { mv: '4.c3', icon: '💫', lbl: 'Gambit Göring', eco: 'C44', fen: 'r1bqkbnr/pppp1ppp/2n5/8/3pP3/2P2N2/PP3PPP/RNBQKB1R b KQkq - 0 4',
                            appLine: 'e4 e5 Nf3 Nc6 d4 exd4 c3', cc: 'Scotch-Game-Goring-Gambit',
                            idea: "Offrir un (ou deux) pions par c3 pour un développement fulgurant et des lignes ouvertes vers le roi. Cousin du Gambit Danois.",
                            plans: { w: "Ouvrir vite (cxd4, Fc4), sacrifier pour l'initiative et l'attaque sur f7.", b: "Accepter avec prudence ou rendre le pion (...d5, ...Cge7) pour un jeu sûr." } },
                        ]},
                    ]},
                  { mv: '2...Cf6', icon: '🪞', lbl: 'Défense russe (Petroff)', fam: 'open', eco: 'C42–C43', fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
                    appLine: 'e4 e5 Nf3 Nf6', cc: 'Petrovs-Defense',
                    idea: "Au lieu de défendre e5, les Noirs contre-attaquent e4 par symétrie. Très solide et réputée pour annuler. Piège classique : après <span class='k'>3.Cxe5</span> il faut jouer <span class='k'>3...d6</span> d'abord, pas <span class='k'>3...Cxe4?</span> (4.De2 gagne).",
                    plans: { w: "Profiter de l'initiative : d4, Fd3, roque, occuper le centre pendant que le Cf6 s'est avancé.", b: "Neutraliser par symétrie, échanger les pièces et viser une finale égale et sûre." } },
                  { mv: '2...d6', icon: '🐢', lbl: 'Philidor', fam: 'open', eco: 'C41', fen: 'rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3',
                    appLine: 'e4 e5 Nf3 d6', cc: 'Philidor-Defense',
                    idea: "Défend e5 par le pion d6 plutôt que par un cavalier. Très solide mais passive : peu d'espace. Attention au piège de Légal si les pièces sortent mal.",
                    plans: { w: "Prendre l'espace par d4, développer naturellement et exploiter le manque d'activité noire.", b: "Rester compact (...Cf6, ...Fe7, ...O-O) puis chercher ...c6/...d5 ou ...exd4 pour respirer." } },
                ]},
              { mv: '2.f4', icon: '🔥', lbl: 'Gambit du Roi', eco: 'C30–C39', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2',
                appLine: 'e4 e5 f4', cc: 'Kings-Gambit',
                idea: "Sacrifie un pion pour un développement fulgurant et l'ouverture de la colonne f. Romantique et tranchant.",
                plans: { w: "Rendre un pion contre un développement fulgurant et la colonne f ouverte pour attaquer f7.", b: "Rendre le pion au bon moment, jouer ...d5 pour libérer le jeu et sortir les pièces." },
                kids: [
                  { mv: '2…exf4', icon: '🤝', lbl: 'Gambit du Roi accepté', eco: 'C33–C39', fen: 'rnbqkbnr/pppp1ppp/8/8/4Pp2/8/PPPP2PP/RNBQKBNR w KQkq - 0 3',
                    appLine: 'e4 e5 f4 exf4', cc: 'Kings-Gambit-Accepted',
                    idea: "Prendre le pion et le tenir. Les Blancs enchaînent 3.Cf3 (pour empêcher ...Dh4+) et bâtissent leur attaque sur la colonne f.",
                    plans: { w: "3.Cf3 puis Fc4, d4, O-O, reprendre f4 et attaquer f7 sur la colonne ouverte.", b: "Tenir le pion (...g5) ou le rendre pour ...d5, développer et calmer l'attaque." },
                    kids: [
                      { mv: '3.Cf3', icon: '♞', lbl: 'Variante du cavalier', eco: 'C34–C39', fen: 'rnbqkbnr/pppp1ppp/8/8/4Pp2/5N2/PPPP2PP/RNBQKB1R b KQkq - 1 3',
                        appLine: 'e4 e5 f4 exf4 Nf3', cc: 'Kings-Gambit-Accepted',
                        idea: "Le coup le plus sain : 3.Cf3 interdit ...Dh4+ et prépare le développement. Base des grandes lignes (Kieseritzky, moderne).",
                        plans: { w: "Développer harmonieusement (Fc4/d4/O-O), reprendre f4 et exploiter la colonne f.", b: "...g5 pour tenir le pion, ou ...d5/...Cf6 pour rendre et se développer vite." } },
                    ]},
                  { mv: '2…Fc5', icon: '🛑', lbl: 'Gambit du Roi décliné', eco: 'C30', fen: 'rnbqk1nr/pppp1ppp/8/2b1p3/4PP2/8/PPPP2PP/RNBQKBNR w KQkq - 1 3',
                    appLine: 'e4 e5 f4 Bc5', cc: 'Kings-Gambit-Declined',
                    idea: "Refuser le pion et clouer f4 : ...Fc5 vise f2 et interdit le roque tant que le pion f traîne. Simple et sain.",
                    plans: { w: "Ne pas jouer fxe5 (le fou c5 mord f2) ; développer (Cf3, Cc3, c3-d4) prudemment.", b: "Garder la pression sur f2/f4, développer vite et exploiter le roi blanc gêné." } },
                  { mv: '2…d5', icon: '💣', lbl: 'Contre-gambit Falkbeer', eco: 'C31–C32', fen: 'rnbqkbnr/ppp2ppp/8/3pp3/4PP2/8/PPPP2PP/RNBQKBNR w KQkq d6 0 3',
                    appLine: 'e4 e5 f4 d5', cc: 'Falkbeer-Countergambit',
                    idea: "Contre-attaquer au centre ! Les Noirs rendent le geste : après 3.exd5 e4 le pion e4 gêne les Blancs et ouvre le jeu noir.",
                    plans: { w: "Accepter (3.exd5) puis rendre le pion e4 au bon moment (d3) pour un jeu sain.", b: "Utiliser le pion e4 avancé et l'avance de développement pour attaquer tout de suite." } },
                ]},
              { mv: '2.Cc3', icon: '🇦🇹', lbl: 'Viennoise', eco: 'C25–C29', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2',
                appLine: 'e4 e5 Nc3', cc: 'Vienna-Game',
                idea: "Développe le cavalier et soutient e4 avant de lancer <span class='k'>f4</span> : un Gambit du Roi mieux préparé. Peu de théorie, jeu d'attaque sain.",
                plans: { w: "Développer (Cc3, Fc4 ou g3-Fg2) puis frapper par f4 pour ouvrir l'aile roi et attaquer f7.", b: "Frapper le centre par ...Cf6 et ...d5 (la parade saine), ou copier ...Cc6/...Fc5 et rester solide." },
                kids: [
                  { mv: '2…Cf6', icon: '🛡️', lbl: 'Variante principale', eco: 'C26–C29', fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3',
                    appLine: 'e4 e5 Nc3 Nf6', cc: 'Vienna-Game',
                    idea: "La réponse saine : ...Cf6 vise e4 et prépare ...d5. Après 3.f4 (Gambit viennois) le jeu s'enflamme.",
                    plans: { w: "3.Fc4 pour viser f7 (gare à ...Cxe4 !), ou 3.f4 (gambit) pour ouvrir l'aile roi.", b: "Contester e4 et jouer ...d5 au bon moment pour libérer le jeu et égaliser." },
                    kids: [
                      { mv: '3.f4', icon: '🔥', lbl: 'Gambit viennois', eco: 'C29', fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4PP2/2N5/PPPP2PP/R1BQKBNR b KQkq f3 0 3',
                        appLine: 'e4 e5 Nc3 Nf6 f4', cc: 'Vienna-Game-Vienna-Gambit',
                        idea: "Le Gambit du Roi soutenu par Cc3 : après 3...d5 le centre s'ouvre dans un jeu tranchant mais mieux étayé que le vrai Gambit du Roi.",
                        plans: { w: "Ouvrir l'aile roi (fxe5), développer vite et attaquer sur la colonne f.", b: "Répliquer ...d5 ! (la parade correcte), ouvrir le centre et viser le roi blanc." } },
                    ]},
                  { mv: '2…Cc6', icon: '♟️', lbl: 'Variante classique', eco: 'C25', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3',
                    appLine: 'e4 e5 Nc3 Nc6', cc: 'Vienna-Game',
                    idea: "Symétrique et solide : après 3.Fc4 Fc5 on retrouve des motifs italiens ; les Blancs peuvent aussi préparer f4 ou le fianchetto g3.",
                    plans: { w: "3.Fc4 ou 3.g3 (fianchetto), puis f4 pour ouvrir l'aile roi.", b: "Copier le développement (...Fc5, ...Cf6) et rester solide au centre." } },
                ]},
            ]},
          { mv: '1...c5', icon: '🌋', lbl: 'Sicilienne', fam: 'semiopen', eco: 'B20–B99', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
            appLine: 'e4 c5', cc: 'Sicilian-Defense',
            idea: "La réponse la plus combative à 1.e4. Jeu asymétrique → <span class='k'>semi-ouvert</span>, contre-jeu sur l'aile dame.",
            plans: { w: "Ouvrir le centre (d4), attaquer sur l'aile roi, souvent roque long et poussée de pions.", b: "Contre-jeu sur l'aile dame via la colonne c semi-ouverte (...a6, ...b5), viser le centre." },
            kids: [
              { mv: '2.Cf3 d6 3.d4', icon: '🗡️', lbl: 'Sicilienne ouverte', eco: 'B30–B99', fen: 'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 1 5',
                appLine: 'e4 c5', cc: 'Sicilian-Defense',
                idea: "Les Blancs ouvrent le centre. Najdorf, Dragon, Scheveningen en découlent.",
                plans: { w: "Développer vite, roquer, choisir un plan d'attaque (colonne f, poussée f4-g4 sur le roi).", b: "Structure flexible (Najdorf, Dragon), pression sur e4 et jeu actif sur l'aile dame." },
                kids: [
                  { mv: '5...a6', icon: '🐍', lbl: 'Najdorf', eco: 'B90–B99', fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
                    appLine: 'e4 c5', cc: 'Sicilian-Defense-Open',
                    idea: "La variante reine : ...a6 prépare ...e5/...b5 et prive les Blancs de la case b5. Ultra-analysée, chère à Fischer et Kasparov.",
                    plans: { w: "Choisir son arme (6.Fg5, 6.Fe3 anglaise, 6.Fe2), attaquer à l'aile roi (f3-g4).", b: "...e5 ou ...e6, ...b5/...Fb7 à l'aile dame, contre-jeu tranchant sur la colonne c." } },
                  { mv: '5...g6', icon: '🐉', lbl: 'Dragon', eco: 'B70–B79', fen: 'rnbqkb1r/pp2pp1p/3p1np1/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
                    appLine: 'e4 c5', cc: 'Sicilian-Defense-Open',
                    idea: "Le fou fianchetto en g7 tire sur le centre et l'aile dame. Très tranchant : dans l'attaque yougoslave, les deux camps foncent sur le roi adverse.",
                    plans: { w: "Attaque yougoslave : Fe3, Dd2, roque long, h4-h5 et sacrifices sur h/g.", b: "Fianchetto ...Fg7, ...O-O, contre-attaque sur la colonne c (...Tc8, ...Ce5/...Cc4)." } },
                  { mv: '5...e6', icon: '🏰', lbl: 'Scheveningen', eco: 'B80–B89', fen: 'rnbqkb1r/pp3ppp/3ppn2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
                    appLine: 'e4 c5', cc: 'Sicilian-Defense-Open',
                    idea: "Structure 'petit centre' souple (...d6/...e6) : solide et flexible, les Noirs attendent leur heure pour ...b5/...d5. Gare à l'attaque Keres 6.g4.",
                    plans: { w: "Attaque Keres (g4) ou classique Fe2/f4 : espace et jeu à l'aile roi.", b: "Développement compact ...a6/...Fe7/...O-O, rupture ...b5 ou ...d5 au bon moment." } },
                  { mv: '5…Cc6', icon: '🏛️', lbl: 'Variante classique', eco: 'B56–B59', fen: 'r1bqkb1r/pp2pppp/2np1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 3 6',
                    appLine: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', cc: 'Sicilian-Defense-Classical-Variation',
                    idea: "Développement naturel des deux cavaliers. Les Blancs choisissent l'attaque Richter-Rauzer (6.Fg5) ou le système Sozin (6.Fc4).",
                    plans: { w: "6.Fg5 (Rauzer) pour clouer et roquer long, ou 6.Fc4 (Sozin) pour viser f7.", b: "...e6/...a6, roquer, contre-jeu sur la colonne c et pression sur e4." } },
                ]},
              { mv: '2.c3', icon: '🧊', lbl: 'Variante Alapin', eco: 'B22', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR b KQkq - 0 2',
                appLine: 'e4 c5 c3', cc: 'Sicilian-Defense-Alapin-Variation',
                idea: "Anti-sicilienne positionnelle : c3 prépare d4 pour bâtir un centre de pions e4-d4 classique, en évitant toute la théorie ouverte.",
                plans: { w: "Jouer d4 et tenir un centre de pions ; jeu sain, sans mémoriser des lignes tranchantes.", b: "Frapper le centre par ...d5 (2...d5) ou ...Cf6 (2...Cf6), viser une structure égale." } },
              { mv: '2.Cc3', icon: '🔒', lbl: 'Sicilienne fermée', eco: 'B23–B26', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2',
                appLine: 'e4 c5 Nc3', cc: 'Sicilian-Defense-Closed',
                idea: "Éviter d4 : les Blancs jouent g3, Fg2, f4 et une attaque de pions à l'aile roi, dans une structure fermée peu théorique.",
                plans: { w: "Fianchetto g3-Fg2, f4-f5 et attaque directe sur le roi noir à l'aile roi.", b: "Fianchetto ...g6/...Fg7, expansion à l'aile dame (...Tb8, ...b5) et jeu sur la colonne c." } },
              { mv: '2.Cf3 Cc6 3.Fb5', icon: '📍', lbl: 'Variante Rossolimo', eco: 'B30–B31', fen: 'r1bqkbnr/pp1ppppp/2n5/1Bp5/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
                appLine: 'e4 c5 Nf3 Nc6 Bb5', cc: 'Sicilian-Defense-Rossolimo-Variation',
                idea: "Le fou cloue/échange le Cc6 pour abîmer la structure noire, sans ouvrir le centre : une anti-sicilienne très en vogue au haut niveau.",
                plans: { w: "Fxc6 pour doubler les pions noirs, puis jeu positionnel sur les cases claires.", b: "Recapturer intelligemment (...dxc6/...bxc6), exploiter la paire de fous et le centre." } },
            ]},
          { mv: '1...e6', icon: '🇫🇷', lbl: 'Française', fam: 'semiopen', eco: 'C00–C19', fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            appLine: 'e4 e6 d4 d5', cc: 'French-Defense',
            idea: "Solide mais un peu passive : le fou de cases blanches reste enfermé. Prépare d5, structures fermées.",
            plans: { w: "Prendre l'espace au centre (e5), attaquer sur l'aile roi, exploiter le fou noir enfermé.", b: "Frapper le centre par ...c5 et ...f6, activer les pièces et résoudre le mauvais fou." } },
          { mv: '1...c6', icon: '🧱', lbl: 'Caro-Kann', fam: 'semiopen', eco: 'B10–B19', fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            appLine: 'e4 c6 d4 d5', cc: 'Caro-Kann-Defense',
            idea: "Comme la française mais sans enfermer le fou. Très solide, chère aux joueurs positionnels.",
            plans: { w: "Occuper le centre, développer confortablement et jouer contre la structure solide mais passive.", b: "Sortir le fou de cases blanches AVANT ...e6, garder une structure saine, viser la finale." } },
          { mv: '1...d5', icon: '❄️', lbl: 'Scandinave', fam: 'semiopen', eco: 'B01', fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
            appLine: 'e4 d5 exd5 Qxd5', cc: 'Scandinavian-Defense',
            idea: "Défie e4 tout de suite. Après 2.exd5 Dxd5, la dame sort tôt : simple, peu de théorie.",
            plans: { w: "Gagner du temps en attaquant la dame noire (Cc3), développer vite avec l'avantage d'espace.", b: "Mettre la dame en sécurité (...Da5 ou ...Dd6), structure solide ...c6, développement simple." } },
          { mv: '1...d6', icon: '🏕️', lbl: 'Pirc', fam: 'semiopen', eco: 'B07–B09', fen: 'rnbqkbnr/ppp1pppp/3p4/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            appLine: 'e4 d6 d4 Nf6 Nc3 g6', cc: 'Pirc-Defense',
            idea: "Hypermoderne : les Noirs laissent les Blancs bâtir un gros centre pour le contre-attaquer ensuite par ...g6, ...Fg7 et ...e5/...c5.",
            plans: { w: "Occuper le centre (e4-d4), développer et viser l'attaque à l'aile roi (Attaque autrichienne f4).", b: "Fianchetto ...g6/...Fg7, roquer, puis frapper le centre par ...e5 ou ...c5." } },
          { mv: '1...g6', icon: '🏔️', lbl: 'Moderne', fam: 'semiopen', eco: 'B06', fen: 'rnbqkbnr/pppppp1p/6p1/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            appLine: 'e4 g6 d4 Bg7', cc: 'Modern-Defense',
            idea: "Cousine de la Pirc : fianchetto immédiat ...g6/...Fg7 en retardant ...Cf6, très flexible pour dérouter l'adversaire.",
            plans: { w: "Prendre tout le centre (c3/Cc3, e4-d4), l'espace, et punir la lenteur noire.", b: "Pression sur le centre depuis les ailes (...Fg7, ...d6, ...c5/...e5), garder la souplesse." } },
          { mv: '1...Cf6', icon: '🪃', lbl: 'Alekhine', fam: 'semiopen', eco: 'B02–B05', fen: 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2',
            appLine: 'e4 Nf6 e5 Nd5', cc: 'Alekhines-Defense',
            idea: "Provocante : le cavalier attaque e4 et invite les pions blancs à avancer (2.e5) pour en faire des cibles ensuite.",
            plans: { w: "Accepter le gros centre (e5, d4, c4) pour étouffer — mais gare à la surextension.", b: "Harceler les pions avancés (...d6, ...c5) pour les faire tomber ou les bloquer." } },
        ]},
      { mv: '1.d4', icon: '🏛️', lbl: 'Pion dame', fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1', appLine: null, cc: null,
        idea: "Le pion d4 est défendu par la dame : centre plus stable, jeu plus lent et stratégique.",
        kids: [
          { mv: '1...d5', icon: '🔒', lbl: 'Jeux fermés', fam: 'closed', fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2', appLine: null, cc: null,
            idea: "Réponse symétrique, centre verrouillé → <span class='k'>jeux fermés</span> : la stratégie prime sur la tactique.",
            kids: [
              { mv: '2.c4', icon: '💎', lbl: 'Gambit dame', eco: 'D06–D69', fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2', appLine: null, cc: 'Queens-Gambit',
                idea: "Offre le pion c pour dévier d5 et dominer le centre. Faux sacrifice : le pion se récupère.",
                plans: { w: "Dévier d5 pour dominer le centre ; récupérer c4, viser l'attaque de minorité.", b: "Choisir sa structure : rendre le pion, ou tenir d5 par ...c6 (Slave) ou ...e6 (refusé)." },
                kids: [
                  { mv: '2...dxc4', icon: '🤝', lbl: 'GD accepté', eco: 'D20–D29', fen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
                    appLine: 'd4 d5 c4 dxc4', cc: 'Queens-Gambit-Accepted',
                    idea: "Les Noirs prennent mais rendront le pion ; les Blancs obtiennent un centre mobile.",
                    plans: { w: "Récupérer c4, bâtir un centre mobile e4-d4 et jouer avec l'espace.", b: "Rendre le pion sans problème, viser ...c5 ou ...e5 pour libérer le jeu." } },
                  { mv: '2...e6', icon: '🚫', lbl: 'GD refusé', eco: 'D30–D69', fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
                    appLine: 'd4 d5 c4 e6', cc: 'Queens-Gambit-Declined',
                    idea: "Solide et classique : structure rigide, plan clair (attaque de minorité).",
                    plans: { w: "Structure rigide mais plan clair : attaque de minorité (b4-b5) sur l'aile dame.", b: "Tenir d5, développer solidement, chercher ...c5 ou ...e5 comme rupture libératrice." },
                    kids: [
                      { mv: '3.Cc3 Cf6 4.Fg5', icon: '📌', lbl: 'Variante classique', eco: 'D50–D69', fen: 'rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq - 3 4',
                        appLine: 'd4 d5 c4 e6 Nc3 Nf6 Bg5', cc: 'Queens-Gambit-Declined',
                        idea: "Le fou cloue Cf6 pour presser d5 et e7. La grande ligne classique (Orthodoxe, Lasker, Tartakover en découlent).",
                        plans: { w: "Presser d5 (Fg5, e3, Fd3, roque), lancer l'attaque de minorité b4-b5.", b: "Défaire le clouage (...Fe7, ...O-O, ...h6), viser la libération ...c5 ou ...dxc4/...e5." } },
                      { mv: '4.cxd5 exd5', icon: '♻️', lbl: "Variante d'échange", eco: 'D35–D36', fen: 'rnbqkb1r/ppp2ppp/5n2/3p4/3P4/2N5/PP2PPPP/R1BQKBNR w KQkq - 0 5',
                        appLine: 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5', cc: 'Queens-Gambit-Declined-Exchange-Variation',
                        idea: "Fixer la structure Carlsbad : les Blancs jouent l'attaque de minorité, les Noirs l'attaque sur l'aile roi.",
                        plans: { w: "Attaque de minorité b4-b5 pour créer une faiblesse en c6 ou d5.", b: "Attaque sur l'aile roi (...Ce4, ...f5) ou pression sur la colonne e." } },
                      { mv: '3.Cc3 c5', icon: '🌶️', lbl: 'Défense Tarrasch', eco: 'D32–D34', fen: 'rnbqkbnr/pp3ppp/4p3/2pp4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq c6 0 4',
                        appLine: 'd4 d5 c4 e6 Nc3 c5', cc: 'Tarrasch-Defense',
                        idea: "Jeu actif au prix d'un pion isolé : ...c5 libère les pièces noires. Dynamique, assumant un IQP en échange d'activité.",
                        plans: { w: "Fianchetto g3-Fg2 pour presser le pion isolé d5 et viser la finale.", b: "Utiliser l'activité des pièces et les colonnes ouvertes pour compenser le pion isolé." } },
                    ]},
                  { mv: '2...c6', icon: '🐻', lbl: 'Défense slave', eco: 'D10–D19', fen: 'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
                    appLine: 'd4 d5 c4 c6', cc: 'Slav-Defense',
                    idea: "Renforce d5 sans enfermer le fou de cases blanches. Très fiable au plus haut niveau.",
                    plans: { w: "Garder la tension au centre, développer les fous activement avant de jouer e3.", b: "Renforcer d5 par ...c6 sans enfermer le fou dames, puis le sortir en ...Ff5 / ...Fg4." },
                    kids: [
                      { mv: '…Cf6 …dxc4', icon: '🤝', lbl: 'Slave accepté', eco: 'D15–D19', fen: 'rnbqkb1r/pp2pppp/2p2n2/8/2pP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 5',
                        appLine: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4', cc: 'Slav-Defense',
                        idea: "Les Noirs prennent en c4 et cherchent à sortir le fou en f5 avant ...e6. La grande ligne principale de la Slave.",
                        plans: { w: "Récupérer c4 (a4 ou e4), bâtir un gros centre e4-d4 et jouer avec l'espace.", b: "Sortir le fou en f5/g4 avant ...e6, tenir la structure et viser ...b5 / ...c5." } },
                      { mv: '…Cf6 …e6', icon: '🐻', lbl: 'Semi-Slave', eco: 'D43–D49', fen: 'rnbqkb1r/pp3ppp/2p1pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 5',
                        appLine: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6', cc: 'Semi-Slav-Defense',
                        idea: "Combine ...c6 et ...e6 pour un mur très solide. Mène aux batailles tranchantes du Méran et du Gambit anti-Méran (Botvinnik).",
                        plans: { w: "Choisir entre le calme (e3) et le tranchant (Fg5, e4 gambit) pour ouvrir le jeu.", b: "Enfermer un instant le fou c8 puis exploser par ...dxc4 et ...b5/...c5 (Méran)." } },
                    ]},
                ]},
              { mv: '2.Ff4', icon: '🏙️', lbl: 'Système Londres', eco: 'D02', fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P1B2/8/PPP1PPPP/RN1QKBNR b KQkq - 1 2',
                appLine: 'd4 d5 Bf4', cc: 'London-System',
                idea: "Système facile : les Blancs posent toujours le même dispositif (Ff4, e3, Fd3, c3, Cbd2) quel que soit le jeu noir. Solide et peu théorique — parfait pour débuter avec 1.d4.",
                plans: { w: "Poser le triangle c3-d4-e3 + Ff4/Fd3, roquer, viser Ce5 et l'attaque à l'aile roi.", b: "Contester tôt : ...c5 et ...Db6 pressent b2/d4, ou ...Ff5 pour sortir le fou avant ...e6." },
                kids: [
                  { mv: '…Cf6 …c5', icon: '⚔️', lbl: 'Contre-jeu ...c5', eco: 'D02', fen: 'rnbqkb1r/pp2pppp/5n2/2pp4/3P1B2/4P3/PPP2PPP/RN1QKBNR w KQkq c6 0 4',
                    appLine: 'd4 d5 Bf4 Nf6 e3 c5', cc: 'London-System',
                    idea: "La meilleure réponse : ...c5 (souvent avec ...Db6) frappe d4 et attaque b2, forçant les Blancs à sortir de leur pilotage automatique.",
                    plans: { w: "Tenir le centre (c3), défendre b2 (Db3/Cc3) et poursuivre le plan Ce5/Fd3.", b: "...c5 + ...Db6 sur b2/d4, ...Cc6, ...Ff5 : contester la structure avant qu'elle se fige." } },
                ]},
            ]},
          { mv: '1...Cf6', icon: '🧩', lbl: 'Jeux semi-fermés', fam: 'semiclosed', fen: 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2', appLine: null, cc: null,
            idea: "Les Noirs refusent la symétrie, laissent le centre aux Blancs pour l'attaquer ensuite (hypermoderne) → <span class='k'>semi-fermés</span>.",
            kids: [
              { mv: '2.c4 e6 3.Cc3 Fb4', icon: '📌', lbl: 'Nimzo-indienne', eco: 'E20–E59', fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
                appLine: 'd4 Nf6 c4 e6 Nc3 Bb4', cc: 'Nimzo-Indian-Defense',
                idea: "Le fou cloue Cc3 et vise à doubler les pions blancs. Équilibre solidité / jeu de pièces.",
                plans: { w: "Accepter les pions doublés contre la paire de fous et un gros centre à exploiter.", b: "Clouer Cc3, doubler les pions blancs et jouer contre les cases faibles." },
                kids: [
                  { mv: '4.Dc2', icon: '👑', lbl: 'Variante classique', eco: 'E32–E39', fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PPQ1PPPP/R1B1KBNR b KQkq - 3 4',
                    appLine: 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2', cc: 'Nimzo-Indian-Defense-Classical-Variation',
                    idea: "La dame en c2 pare le doublement des pions et prépare de reprendre en c3 avec un pion. Vise la paire de fous sans faiblesse structurelle.",
                    plans: { w: "Reprendre en c3 avec le pion c pour garder une structure saine et la paire de fous.", b: "Échanger en c3 au bon moment ou reculer (...Fe7), viser ...d5/...c5 et les cases claires." } },
                  { mv: '4.e3', icon: '🧱', lbl: 'Variante Rubinstein', eco: 'E40–E59', fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N1P3/PP3PPP/R1BQKBNR b KQkq - 0 4',
                    appLine: 'd4 Nf6 c4 e6 Nc3 Bb4 e3', cc: 'Nimzo-Indian-Defense-Rubinstein-Variation',
                    idea: "Le coup le plus souple : 4.e3 développe tranquillement (Fd3, Cf3, O-O) et attend de savoir ce que font les Noirs.",
                    plans: { w: "Développement flexible (Fd3, Cge2/Cf3, O-O, a3), viser un centre e4 ou f3-e4.", b: "Frapper le centre par ...c5 et ...d5, échanger en c3 pour créer des faiblesses." } },
                ]},
              { mv: '2.c4 g6 3.Cc3 Fg7', icon: '🏹', lbl: 'Est-indienne', eco: 'E60–E99', fen: 'rnbqk2r/ppppppbp/5np1/8/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
                appLine: 'd4 Nf6 c4 g6 Nc3 Bg7', cc: 'Kings-Indian-Defense',
                idea: "Fianchetto : on laisse un gros centre blanc… pour le bombarder par ...e5. Contre-attaque tranchante, chère aux joueurs d'attaque.",
                plans: { w: "Bâtir un gros centre (e4), gagner de l'espace et attaquer à l'aile dame (c5, b4).", b: "Roquer, jouer ...e5 puis ...f5-f4-g5 et foncer sur le roi blanc à l'aile roi." },
                kids: [
                  { mv: '4.e4 d6', icon: '🗻', lbl: 'Variante classique', eco: 'E90–E99', fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5',
                    appLine: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', cc: 'Kings-Indian-Defense',
                    idea: "Le centre est en place : après 5.Cf3 O-O 6.Fe2 e5 le jeu se cristallise autour de la case d4/d5 et de la course aux ailes opposées.",
                    plans: { w: "Fermer le centre (d5) et attaquer à l'aile dame par c5 et la colonne c.", b: "...e5, ...Cd7/...Ce8, ...f5-f4 et l'attaque de pions à l'aile roi." },
                    kids: [
                      { mv: '…O-O …e5', icon: '⚔️', lbl: 'Ligne principale', eco: 'E97–E99', fen: 'rnbq1rk1/ppp2pbp/3p1np1/4p3/2PPP3/2N2N2/PP2BPPP/R1BQK2R w KQ e6 0 7',
                        appLine: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5', cc: 'Kings-Indian-Defense-Classical-Variation',
                        idea: "La position type de l'Est-indienne : les Blancs ferment par d5 et courent à l'aile dame, les Noirs ferment aussi et lancent ...f5 sur le roi.",
                        plans: { w: "d5 puis c5/Cd3/b4 et l'assaut à l'aile dame, ignorer l'attaque adverse en course de vitesse.", b: "...Ce8/...Cd7, ...f5-f4, ...g5-g4 et le mat à l'aile roi — la course des ailes opposées." } },
                    ]},
                  { mv: '4.e4 d6 5.f3', icon: '🧱', lbl: 'Variante Sämisch', eco: 'E80–E89', fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N2P2/PP4PP/R1BQKBNR b KQkq - 0 5',
                    appLine: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3', cc: 'Kings-Indian-Defense-Samisch-Variation',
                    idea: "Étayer e4 par f3 et bâtir un centre inébranlable, souvent suivi de Fe3, Dd2 et roque long pour attaquer le fianchetto noir.",
                    plans: { w: "Fe3, Dd2, O-O-O puis h4-h5 : attaque directe façon Yougoslave contre le roi noir.", b: "Frapper vite par ...c5 ou ...e5, ou ...a6/...c6/...b5 à l'aile dame contre le roque long." } },
                ]},
              { mv: '2.c4 g6 3.Cc3 d5', icon: '🌪️', lbl: 'Défense Grünfeld', eco: 'D80–D99', fen: 'rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq d6 0 4',
                appLine: 'd4 Nf6 c4 g6 Nc3 d5', cc: 'Grunfeld-Defense',
                idea: "Contre-attaque hypermoderne : plutôt que ...Fg7 puis ...e5, les Noirs frappent d5 tout de suite. Après 4.cxd5 Cxd5 5.e4 les Blancs prennent un gros centre… à harceler.",
                plans: { w: "Bâtir un centre e4-d4 majestueux (variante d'échange), viser l'espace et l'attaque.", b: "Bombarder le centre par ...c5, ...Fg7, ...Cc6 et la pression sur d4." },
                kids: [
                  { mv: '4.cxd5 Cxd5 5.e4', icon: '💥', lbl: "Variante d'échange", eco: 'D85–D89', fen: 'rnbqkb1r/ppp1pp1p/6p1/3n4/3PP3/2N5/PP3PPP/R1BQKBNR b KQkq e3 0 5',
                    appLine: 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4', cc: 'Grunfeld-Defense-Exchange-Variation',
                    idea: "La ligne principale : les Blancs érigent un gros centre e4-d4, les Noirs l'attaquent sans relâche par ...c5, ...Fg7 et la pression sur d4.",
                    plans: { w: "Consolider le centre (Fc4/Cf3/O-O), viser l'espace et une attaque à l'aile roi.", b: "...c5, ...Fg7, ...Cc6/...Da5, harceler d4 jusqu'à le faire tomber." } },
                ]},
              { mv: '2.c4 c5 3.d5 e6', icon: '🌶️', lbl: 'Benoni moderne', eco: 'A60–A79', fen: 'rnbqkb1r/pp1p1ppp/4pn2/2pP4/2P5/8/PP2PPPP/RNBQKBNR w KQkq - 0 4',
                appLine: 'd4 Nf6 c4 c5 d5', cc: 'Benoni-Defense',
                idea: "Déséquilibre assumé : les Noirs cèdent de l'espace au centre contre une majorité de pions à l'aile dame et le fianchetto tranchant ...g6/...Fg7.",
                plans: { w: "Exploiter l'espace et le centre, pousser e4-e5 et jouer sur l'aile roi.", b: "Contre-jeu dynamique : ...g6/...Fg7, ...a6/...b5 à l'aile dame, pression sur e4." } },
              { mv: '2.c4 c5 3.d5 b5', icon: '🎁', lbl: 'Gambit Benko', eco: 'A57–A59', fen: 'rnbqkb1r/p2ppppp/5n2/1ppP4/2P5/8/PP2PPPP/RNBQKBNR w KQkq b6 0 4',
                appLine: 'd4 Nf6 c4 c5 d5 b5', cc: 'Benko-Gambit',
                idea: "Un pion offert par ...b5 pour ouvrir les colonnes a et b : la pression positionnelle à l'aile dame vaut largement le pion. Sûr et facile à jouer pour les Noirs.",
                plans: { w: "Accepter et rendre le pion au bon moment, ou décliner (a4) pour garder l'espace.", b: "Fianchetto ...g6/...Fg7, ...O-O, doubler les tours sur a/b et presser sans relâche." } },
              { mv: '2.c4 e6 3.Cf3 b6', icon: '🌊', lbl: 'Ouest-indienne', eco: 'E12–E19', fen: 'rnbqkb1r/p1pp1ppp/1p2pn2/8/2PP4/5N2/PP2PPPP/RNBQKB1R w KQkq - 0 4',
                appLine: 'd4 Nf6 c4 e6 Nf3 b6', cc: 'Queens-Indian-Defense',
                idea: "Solide et positionnelle : le fianchetto ...b6/...Fb7 dispute la case e4 à distance. Réputée très sûre, chère aux stratèges.",
                plans: { w: "Prendre l'espace, neutraliser le Fb7 (Fg2, Cc3/Cbd2) et jouer sur le centre / l'aile dame.", b: "Contrôler e4 par ...Fb7 (+ ...Fb4 ou ...d5), structure saine, viser l'égalité confortable." } },
            ]},
          { mv: '1...f5', icon: '🌷', lbl: 'Hollandaise', fam: 'semiclosed', eco: 'A80–A99', fen: 'rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq f6 0 2',
            appLine: null, cc: 'Dutch-Defense',
            idea: "Vise l'attaque sur l'aile roi (case e4). Ambitieuse, mais affaiblit un peu le roque.",
            plans: { w: "Exploiter l'affaiblissement de l'aile roi, souvent fianchetto g3 et jeu au centre.", b: "Contrôler e4, monter une attaque sur l'aile roi (Stonewall ou Leningrad)." } },
        ]},
      { mv: '1.c4', icon: '🇬🇧', lbl: 'Anglaise', fam: 'flank', eco: 'A10–A39', fen: 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1',
        appLine: 'c4', cc: 'English-Opening',
        idea: "Ouverture de <span class='k'>flanc</span> : contrôle d5 à distance sans avancer de pion central. Transpose souvent.",
        plans: { w: "Contrôler d5 à distance, jeu flexible sur l'aile dame, transposer au bon moment.", b: "Répondre au centre (...e5, Sicilienne inversée) ou ...c5/...Cf6, garder la symétrie." } },
      { mv: '1.Cf3', icon: '🐎', lbl: 'Réti', fam: 'flank', eco: 'A04–A09', fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKBNR b KQkq - 1 1',
        appLine: 'Nf3 d5 c4', cc: 'Reti-Opening',
        idea: "Flexible et hypermoderne : développe avant de fixer la structure. Peut transposer partout.",
        plans: { w: "Développer avant de fixer la structure, pression hypermoderne sur d5, fianchetto.", b: "Occuper le centre (...d5, ...e6/...c6) et le tenir, ou copier le plan de flanc." } },
    ]
  };

  let built = false, selectedCard = null, currentNode = null, landscapeLocked = false, focusMode = true;
  const active = new Set(Object.keys(FAM));
  const famColor = f => f ? FAM[f].color : '#6b7a99';

  // ── Mode Focus : comprime les branches déjà parcourues (la « colonne
  // vertébrale » du chemin) et estompe les branches hors ligne, pour se
  // concentrer sur la position en cours et ses suites. ──
  function collectDesc(node, set) { (node.kids || []).forEach(k => { set.add(k); collectDesc(k, set); }); }
  function applyFocus(node) {
    const tree = document.getElementById('ot-tree'); if (!tree) return;
    const all = tree.querySelectorAll('.ot-subtree');
    const CLS = ['ot-anc', 'ot-cur', 'ot-next', 'ot-deep', 'ot-dim'];
    if (!focusMode || !node) { all.forEach(st => st.classList.remove(...CLS)); return; }
    const path = new Set(findPath(TREE, node) || [node]);
    const desc = new Set(); collectDesc(node, desc);
    const kids = new Set(node.kids || []);           // choix immédiats = niveau courant
    all.forEach(st => {
      const n = st._node;
      st.classList.remove(...CLS);
      if (n === node) st.classList.add('ot-cur');          // la position en cours
      else if (kids.has(n)) st.classList.add('ot-next');   // ses suites directes (pleine taille)
      else if (path.has(n)) st.classList.add('ot-anc');    // le chemin parcouru (mini)
      else if (desc.has(n)) st.classList.add('ot-deep');   // suites lointaines (mini)
      else st.classList.add('ot-dim');                     // hors-ligne (mini + estompé)
    });
  }

  // ── Forçage du paysage (Android PWA installée : contourne le WebAPK figé) ──
  async function lockLandscape() {
    const so = screen.orientation;
    if (!so || !so.lock) return false;
    try { await so.lock('landscape'); return true; }
    catch (_) {
      // Certains navigateurs exigent le plein écran avant de verrouiller.
      try {
        const el = document.documentElement;
        if (el.requestFullscreen) { await el.requestFullscreen(); await so.lock('landscape'); return true; }
      } catch (_) {}
    }
    return false;
  }
  function unlockOrientation() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
    if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (_) {} }
  }
  async function toggleLandscape() {
    const btn = document.getElementById('ot-landscape');
    if (!landscapeLocked) {
      const ok = await lockLandscape();
      if (ok) { landscapeLocked = true; if (btn) btn.textContent = '⟳ Portrait'; setTimeout(draw, 350); }
      else if (btn) { btn.textContent = 'Rotation indispo'; setTimeout(() => { btn.textContent = '⟳ Paysage'; }, 1900); }
    } else {
      unlockOrientation(); landscapeLocked = false; if (btn) { btn.textContent = '⟳ Paysage'; } setTimeout(draw, 350);
    }
  }
  // Déverrouille l'orientation quand le panneau se ferme (ne pas piéger le reste de l'app en paysage).
  function observePanelClose() {
    const p = document.getElementById('panel-tree');
    if (!p || p._otObs) return;
    const obs = new MutationObserver(() => {
      if (!p.classList.contains('open') && landscapeLocked) {
        unlockOrientation(); landscapeLocked = false;
        const b = document.getElementById('ot-landscape'); if (b) b.textContent = '⟳ Paysage';
      }
    });
    obs.observe(p, { attributes: true, attributeFilter: ['class'] });
    p._otObs = true;
  }

  function findPath(node, target, acc = []) {
    const here = [...acc, node];
    if (node === target) return here;
    if (node.kids) for (const k of node.kids) { const r = findPath(k, target, here); if (r) return r; }
    return null;
  }

  function renderDetailBoard(fen) {
    const host = document.getElementById('ot-dboard');
    if (!host || typeof BoardRenderer === 'undefined') return;
    const prev = BoardRenderer.isFlipped();
    BoardRenderer.setFlipped(false);
    BoardRenderer.render(host, fen);
    BoardRenderer.setFlipped(prev);
  }

  function select(node, fam, card) {
    if (selectedCard) selectedCard.classList.remove('selected');
    if (card) { card.classList.add('selected'); selectedCard = card; }
    currentNode = node;
    applyFocus(node);
    requestAnimationFrame(draw);
    const path = findPath(TREE, node) || [node];
    const moves = path.filter(n => n.mv).map(n => n.mv).join('  ');
    const famTag = fam ? `<span class="ot-pill" style="background:${famColor(fam)}22;color:${famColor(fam)}">${FAM[fam].name}</span>` : '';
    const eco = node.eco ? `<span class="ot-eco">${node.eco}</span>` : '';
    const ccUrl = node.cc ? `${CC_HUB}/${node.cc}` : CC_HUB;
    const detail = document.getElementById('ot-detail');
    detail.innerHTML = `
      <svg class="ot-dboard" id="ot-dboard" viewBox="0 0 360 360"></svg>
      <div class="ot-txt">
        <h3>${node.icon || ''} ${node.lbl}</h3>
        <div class="ot-metarow">${famTag}${eco}<span class="ot-path">${moves ? moves.replace(/(\d+\.(?:\.\.)?)/g, '<b>$1</b>') : 'position de départ'}</span></div>
        <div class="ot-idea">${node.idea || ''}</div>
        ${node.plans ? `<div class="ot-plans">
          <div class="ot-plan ot-plan-w"><span class="ot-plan-side">♔ Plan des Blancs</span>${node.plans.w}</div>
          <div class="ot-plan ot-plan-b"><span class="ot-plan-side">♚ Plan des Noirs</span>${node.plans.b}</div>
        </div>` : ''}
        <div class="ot-actions">
          <button class="ot-link ot-link-app" id="ot-open-app">♟ Ouvrir dans Chess Analyst</button>
          <a class="ot-link ot-link-cc" id="ot-open-cc" href="${ccUrl}" target="_blank" rel="noopener">↗ Voir sur Chess.com</a>
        </div>
      </div>`;
    renderDetailBoard(node.fen);
    const appBtn = document.getElementById('ot-open-app');
    appBtn.addEventListener('click', () => {
      if (typeof App !== 'undefined' && App.openOpeningByLine) App.openOpeningByLine(node.appLine);
    });
    if (!node.appLine) appBtn.title = "Aucune fiche dédiée — ouvre la liste des ouvertures";
  }

  function buildNode(node, parentFam, depth) {
    const fam = node.fam || parentFam || null;
    const st = document.createElement('div');
    st.className = 'ot-subtree';
    if (depth >= 1 && node.kids) st.classList.add('collapsed'); // racine + niveau 1 ouverts
    const card = document.createElement('div');
    card.className = 'ot-card' + (depth === 0 ? ' root' : '');
    card.style.setProperty('--ot-fam', famColor(fam));
    card.dataset.fam = node.fam || '';
    const eco = node.eco ? `<span class="ot-card-eco">${node.eco}</span>` : '';
    const mv = node.mv ? `<span class="ot-mv">${node.mv}</span>` : '';
    card.innerHTML = `<div class="ot-ic">${node.icon || '♟️'}</div>
      <div class="ot-body-txt"><div class="ot-tt">${node.lbl}</div><div class="ot-sub">${mv}${eco}</div></div>`;
    const hasKids = node.kids && node.kids.length;
    if (hasKids) {
      const ch = document.createElement('div'); ch.className = 'ot-chev'; ch.textContent = '◀';
      ch.addEventListener('click', e => { e.stopPropagation(); st.classList.toggle('collapsed'); draw(); });
      card.appendChild(ch);
    }
    card.addEventListener('click', () => { if (hasKids) st.classList.remove('collapsed'); select(node, fam, card); draw(); });
    st.appendChild(card);
    if (hasKids) {
      const kids = document.createElement('div'); kids.className = 'ot-kids';
      node.kids.forEach(k => kids.appendChild(buildNode(k, fam, depth + 1)));
      st.appendChild(kids);
    }
    st._node = node;
    return st;
  }

  function draw() {
    const svg = document.getElementById('ot-links'), content = document.getElementById('ot-content');
    if (!svg || !content) return;
    const base = content.getBoundingClientRect();
    svg.setAttribute('width', content.scrollWidth);
    svg.setAttribute('height', content.scrollHeight);
    let d = '';
    content.querySelectorAll('.ot-subtree').forEach(st => {
      if (st.classList.contains('collapsed')) return;
      const pc = st.querySelector(':scope > .ot-card');
      if (!pc || pc.offsetParent === null) return;
      const pr = pc.getBoundingClientRect();
      const px = pr.right - base.left, py = pr.top - base.top + pr.height / 2;
      st.querySelectorAll(':scope > .ot-kids > .ot-subtree > .ot-card').forEach(kc => {
        const kr = kc.getBoundingClientRect();
        const cx = kr.left - base.left, cy = kr.top - base.top + kr.height / 2;
        const dx = Math.max(24, (cx - px) / 2);
        const col = famColor(kc.dataset.fam || null);
        const childSt = kc.closest('.ot-subtree');
        const dim = childSt && childSt.classList.contains('ot-dim');
        d += `<path d="M ${px} ${py} C ${px + dx} ${py}, ${cx - dx} ${cy}, ${cx} ${cy}" fill="none" stroke="${col}" stroke-width="2.5" stroke-opacity="${dim ? 0.13 : 0.55}"/>`;
      });
    });
    svg.innerHTML = d;
  }

  function buildLegend() {
    const el = document.getElementById('ot-legend');
    if (!el) return;
    el.innerHTML = '';
    Object.entries(FAM).forEach(([k, f]) => {
      const c = document.createElement('button'); c.className = 'ot-chip'; c.type = 'button';
      c.innerHTML = `<span class="ot-dot" style="background:${f.color}"></span>${f.name}`;
      c.addEventListener('click', () => {
        active.has(k) ? (active.delete(k), c.classList.add('off')) : (active.add(k), c.classList.remove('off'));
        applyFilter();
      });
      el.appendChild(c);
    });
  }
  function applyFilter() {
    document.querySelectorAll('.ot-card').forEach(c => {
      const f = c.dataset.fam; if (!f) return;
      c.classList.toggle('ot-hidden', !active.has(f));
    });
    draw();
  }

  function enablePan() {
    const cv = document.getElementById('ot-canvas'); if (!cv || cv._panBound) return;
    let down = false, sx, sy, sl, stp;
    cv.addEventListener('mousedown', e => {
      if (e.target.closest('.ot-card') || e.target.closest('.ot-chip')) return;
      down = true; cv.classList.add('grabbing'); sx = e.clientX; sy = e.clientY; sl = cv.scrollLeft; stp = cv.scrollTop;
    });
    window.addEventListener('mousemove', e => { if (!down) return; cv.scrollLeft = sl - (e.clientX - sx); cv.scrollTop = stp - (e.clientY - sy); });
    window.addEventListener('mouseup', () => { down = false; cv.classList.remove('grabbing'); });
    cv.addEventListener('scroll', draw);
    cv._panBound = true;
  }

  function build() {
    const tree = document.getElementById('ot-tree'); if (!tree) return;
    tree.innerHTML = '';
    tree.appendChild(buildNode(TREE, null, 0));
    tree.classList.toggle('ot-focus-on', focusMode);
    buildLegend();
    enablePan();
    const expand = document.getElementById('ot-expand'), collapse = document.getElementById('ot-collapse');
    if (expand) expand.onclick = () => { document.querySelectorAll('.ot-subtree').forEach(s => s.classList.remove('collapsed')); draw(); };
    if (collapse) collapse.onclick = () => {
      document.querySelectorAll('.ot-subtree').forEach(s => { if (s._node && s._node !== TREE && s.querySelector(':scope > .ot-kids')) s.classList.add('collapsed'); });
      draw();
    };
    const rotClose = document.getElementById('ot-rotate-close');
    if (rotClose) rotClose.onclick = () => { const h = document.getElementById('ot-rotate-hint'); if (h) h.classList.add('dismissed'); };
    const lsBtn = document.getElementById('ot-landscape');
    if (lsBtn) lsBtn.onclick = toggleLandscape;
    const focusBtn = document.getElementById('ot-focus');
    if (focusBtn) focusBtn.onclick = () => {
      focusMode = !focusMode;
      focusBtn.classList.toggle('active', focusMode);
      tree.classList.toggle('ot-focus-on', focusMode);
      applyFocus(currentNode || TREE);
      requestAnimationFrame(draw);
    };
    observePanelClose();
    window.addEventListener('resize', draw);
    // orientationchange fires before the viewport settles — redraw once it has.
    window.addEventListener('orientationchange', () => setTimeout(draw, 320));
    built = true;
  }

  // Appelé à l'ouverture du panneau (panneau déjà visible → layout disponible).
  function render() {
    if (!built) build();
    requestAnimationFrame(() => {
      draw();
      if (!selectedCard) select(TREE, null, document.querySelector('.ot-card.root'));
      draw();
      const cv = document.getElementById('ot-canvas'); // démarrer sur la racine (haut-gauche)
      if (cv) { cv.scrollTop = 0; cv.scrollLeft = 0; }
    });
  }

  return { render };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OpeningTree;
