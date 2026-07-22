// Cours d'ouverture — contenu pédagogique enrichi, en surcouche du catalogue
// OPENINGS (app.js). Une entrée est indexée sur la LIGNE de base de l'ouverture
// (le champ `line` du catalogue) et ajoute : variantes principales rejouables
// avec notes par coup, pièges jouables (fen+sol, validés chess.js), quiz et
// transpositions. La prose idea/plans/structure/mistakes reste dans OPENINGS.
//
// Chaque `sans` et chaque piège (fen+sol) est vérifié hors-ligne
// (node + chess.min.js) avant d'être ajouté ici.
const Courses = (() => {
  const COURSES = {

    // ─────────────────────────── Partie Italienne ───────────────────────────
    'e4 e5 Nf3 Nc6 Bc4': {
      intro: `L'Italienne est l'ouverture idéale pour apprendre les trois principes de base : sortir vite le cavalier en f3 et le fou en c4 (qui vise f7), roquer, puis seulement pousser au centre. Peu de théorie à retenir, des idées tactiques limpides et un plan simple pour les deux camps.`,
      lines: [
        {
          name: 'Giuoco Piano (calme)', eco: 'C50',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O'],
          notes: [
            `On prend le centre et on libère le fou-roi et la dame.`,
            `Réponse symétrique : les Noirs contestent aussitôt le centre.`,
            `Développe en attaquant e5. C'est presque toujours le meilleur 2ᵉ coup.`,
            `Défend e5 tout en développant une pièce.`,
            `<b>Le coup-signature de l'Italienne</b> : le fou vise f7, la case la plus fragile du roque noir.`,
            `Les Noirs copient et visent f2, la case miroir.`,
            `Prépare d4 : les Blancs veulent le duo de pions e4 + d4.`,
            `Développe en attaquant e4 ; les Blancs doivent maintenant le défendre.`,
            `Le <b>Pianissimo</b> : d3 soutient e4 sans ouvrir le centre. Jeu lent et sain plutôt que le d4 tranchant.`,
            `Miroir : soutient e5 et libère le fou c8.`,
            `Roque : le roi à l'abri avant toute opération.`,
            `Position type atteinte. Place tes pièces (Cbd2-f1-g3, Fb3, Te1, h3) avant d'attaquer.`
          ]
        },
        {
          name: 'Deux Cavaliers', eco: 'C55',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bc5', 'O-O', 'd6', 'c3', 'O-O'],
          notes: [
            '', '', '', '',
            `Toujours l'Italienne : le fou vise f7.`,
            `<b>La Partie des Deux Cavaliers</b> : au lieu de 3…Fc5, les Noirs attaquent tout de suite e4.`,
            `L'approche calme : on défend e4 sans se lancer dans 4.Cg5 (l'attaque sur f7, plus risquée à retenir).`,
            `Les Noirs ressortent le fou en c5 : on retombe sur une position d'Italienne classique.`,
            `Roque.`,
            `Soutient e5.`,
            `Prépare d4.`,
            `Même position type que le Giuoco Piano : les deux ordres de coups transposent.`
          ]
        },
        {
          name: 'Gambit Evans', eco: 'C51',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5', 'd4'],
          notes: [
            '', '', '', '', '', '',
            `<b>Le Gambit Evans</b> : les Blancs offrent le pion b pour gagner des temps contre le fou c5 et bâtir un gros centre.`,
            `Les Noirs acceptent le pion. Le refuser par …Fb6 est aussi jouable.`,
            `Chasse le fou avec gain de temps.`,
            `Le fou reste sur la diagonale et cloue potentiellement c3.`,
            `Les Blancs déploient le centre e4 + d4 gratuitement : forte initiative pour un pion. La ligne d'attaque par excellence.`
          ]
        }
      ],
      traps: [
        {
          title: '🍖 Le Fried Liver (Cxf7)',
          hint: `Dans les Deux Cavaliers, après 4.Cg5 d5 5.exd5, si les Noirs reprennent 5…Cxd5?? le sacrifice 6.Cxf7! attire le roi au centre : après 6…Rxf7 7.Df3+ le roi noir est en grand danger. Joue Cxf7.`,
          fen: 'r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6',
          sol: ['Nxf7']
        },
        {
          title: '🛡️ La bonne défense : …Ca5',
          hint: `Toujours après 4.Cg5 d5 5.exd5 : ne reprends PAS en d5. Joue 5…Ca5 ! qui attaque le fou c4 et évite tout le Fried Liver. Tu rendras le pion d5 plus tard, sans danger.`,
          fen: 'r1bqkb1r/ppp2ppp/2n2n2/3Pp1N1/2B5/8/PPPP1PPP/RNBQK2R b KQkq - 0 5',
          sol: ['Na5']
        },
        {
          title: `🪤 S'il tarde à roquer : fourchette en f7`,
          hint: `Si l'adversaire laisse traîner son roi et que ton cavalier atteint g5, Cxf7 ! gagne : le roi ne peut pas reprendre (ton fou c4 tient f7) et tu fourches la dame et la tour.`,
          fen: 'r1bqk2r/1pp2ppp/p1np1n2/2b1p1N1/2B1P3/2PP4/PP3PPP/RNBQK2R w KQkq - 0 7',
          sol: ['Nxf7']
        }
      ],
      transpositions: [
        { label: '3…Fc5', note: `Le Giuoco Piano, la ligne principale de l'Italienne.` },
        { label: '3…Cf6', note: `La Partie des Deux Cavaliers : plus combative, elle autorise 4.Cg5 (attaque sur f7).` },
        { label: '3…Fe7', note: `La Défense hongroise : passive mais parfaitement solide.` },
        { label: `Ordre des coups`, note: `Le Giuoco Piano (3…Fc5 puis …Cf6) et les Deux Cavaliers calmes (3…Cf6 puis …Fc5) transposent souvent vers la même position type.` }
      ],
      quiz: [
        {
          q: `Dès 3.Fc4, quelle case le fou blanc prend-il pour cible ?`,
          opts: ['f7', 'd5', 'h7', 'a7'], answer: 0,
          explain: `f7 n'est défendue que par le roi : c'est la cible classique de l'Italienne.`
        },
        {
          q: `Dans l'Italienne calme (Pianissimo), pourquoi jouer d3 plutôt que d4 ?`,
          opts: [`Pour un jeu lent et solide en soutenant e4`, `Parce que d4 serait illégal`, `Pour préparer le grand roque`, `Pour attaquer f7 immédiatement`], answer: 0,
          explain: `d3 garde le centre fermé : on manœuvre tranquillement avant d'attaquer.`
        },
        {
          q: `Deux Cavaliers, après 4.Cg5 d5 5.exd5 : quel coup tombe dans le Fried Liver ?`,
          opts: ['5…Cxd5', '5…Ca5', '5…Cb8', '5…b5'], answer: 0,
          explain: `5…Cxd5?? permet 6.Cxf7 ! On joue 5…Ca5 pour chasser le fou c4.`
        }
      ]
    },

    // ────────────────────────── Giuoco Pianissimo ──────────────────────────
    'e4 e5 Nf3 Nc6 Bc4 Bc5 d3': {
      intro: `« Le jeu très tranquille » : d3 soutient e4 sans ouvrir le centre. On ne cherche pas d'avantage immédiat mais une position saine où la meilleure compréhension finit par payer. C'est une longue partie de manœuvre, très en vogue jusqu'au plus haut niveau.`,
      lines: [
        {
          name: 'Manœuvre type', eco: 'C50',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6', 'O-O', 'O-O', 'c3', 'd6', 'Re1', 'a6', 'Nbd2'],
          notes: [
            '', '', '', '',
            `Le fou vise f7, mais ici pas de précipitation : on place les pièces d'abord.`,
            '',
            `<b>Le « très tranquille »</b> : d3 ferme le centre. On renonce à l'avantage immédiat pour un jeu de manœuvre sain.`,
            '',
            `Roque avant tout.`,
            '',
            `Prépare une poussée d4 plus tard et donne la case c2 au fou.`,
            '',
            `Libère f1 pour le cavalier : début du regroupement Cb1-d2-f1-g3.`,
            `Les Noirs empêchent Fb5 et préparent …Fa7.`,
            `<b>La manœuvre-clé</b> : le cavalier ira en f1 puis g3, vers l'aile roi, sans ouvrir le jeu.`
          ]
        },
        {
          name: 'La rupture …d5', eco: 'C50',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6', 'c3', 'O-O', 'O-O', 'd5'],
          notes: [
            '', '', '', '', '', '', '', '',
            `Prépare d4 et prive le cavalier noir de la case b4.`,
            '', '',
            `<b>La rupture libératrice</b> : bien préparée (roque fait), …d5 conteste le centre et donne de l'air aux pièces noires. C'est le plan d'égalisation type.`
          ]
        }
      ],
      traps: [
        {
          title: '💡 Le coup libérateur …d5 / d4',
          hint: `Dans les positions fermées du Pianissimo, la rupture …d5 (Noirs) ou d4 (Blancs) est le grand plan. Joue-la seulement une fois roqué et bien développé : ouvrir le centre trop tôt profite au camp le mieux placé.`
        },
        {
          title: '🪤 Cg5 ne marche plus une fois roqué',
          hint: `Contrairement aux Deux Cavaliers, d3 est déjà joué et l'attaque Cg5 sur f7 est lente. Une fois le roi noir roqué (la tour f8 garde f7), un Cg5 spéculatif ne donne rien : on manœuvre au lieu d'attaquer à la hâte.`
        }
      ],
      quiz: [
        { q: `À quoi sert le coup d3 dans le Pianissimo ?`, opts: [`Fermer le centre pour un jeu de manœuvre`, `Attaquer f7 tout de suite`, `Préparer le grand roque`, `Empêcher le roque noir`], answer: 0, explain: `d3 soutient e4 sans ouvrir le jeu : on joue lentement, sur la compréhension.` },
        { q: `Quelle est la manœuvre de cavalier typique des Blancs ?`, opts: [`Cb1-d2-f1-g3`, `Cf3-h4-f5`, `Cb1-c3-d5`, `Cf3-d2-b3`], answer: 0, explain: `Le cavalier dame rejoint l'aile roi par d2-f1-g3, après avoir joué Te1.` },
        { q: `Quel est le grand plan d'égalisation des Noirs ?`, opts: [`La rupture …d5`, `Le fianchetto …g6`, `L'attaque …h5-h4`, `Le grand roque`], answer: 0, explain: `Bien préparée, …d5 conteste le centre et libère les pièces noires.` }
      ]
    },

    // ─────────────────────── Partie Espagnole (Ruy Lopez) ───────────────────
    'e4 e5 Nf3 Nc6 Bb5': {
      intro: `Fb5 attaque le cavalier c6, défenseur naturel du pion e5 : on installe une pression durable sur le centre noir, sans rien forcer. C'est la grande ouverture stratégique de référence, riche en plans des deux côtés.`,
      lines: [
        {
          name: 'Espagnole fermée', eco: 'C88',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O'],
          notes: [
            '', '', '', '',
            `<b>Le coup-signature</b> : le fou attaque le cavalier c6, défenseur de e5. Pression durable, sans rien forcer.`,
            `La « question au fou » : les Noirs lui demandent de se décider (variante Morphy).`,
            `Le fou reste sur la diagonale a4-e8 et garde la pression.`,
            `Développe et attaque e4.`,
            `Les Blancs roquent : e4 n'est pas vraiment en prise (voir les Pièges).`,
            `Développement solide, prépare le roque.`,
            `Renforce e4 et occupe la colonne e.`,
            `Chasse enfin le fou pour de bon.`,
            `Le fou se replie en b3, toujours actif vers f7.`,
            `Soutient e5 : le centre tendu typique de l'Espagnole fermée.`,
            `Prépare d4, le grand plan blanc.`,
            `Position type de l'Espagnole fermée : jeu stratégique riche des deux côtés.`
          ]
        },
        {
          name: 'Défense berlinoise', eco: 'C67',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Nxe4', 'd4', 'Nd6', 'Bxc6', 'dxc6', 'dxe5', 'Nf5'],
          notes: [
            '', '', '', '', '',
            `<b>La Défense berlinoise</b> : au lieu de …a6, les Noirs frappent tout de suite e4. Très solide, popularisée par Kramnik.`,
            `Les Blancs offrent e4.`,
            `Les Noirs prennent : jouable ici, car ils rendront la pièce proprement.`,
            `Ouvre le centre pour récupérer le pion.`,
            `Le cavalier recule et attaque le fou b5.`,
            `Les Blancs échangent avant de reprendre e5.`,
            `Structure noire doublée en c, mais solide.`,
            `Récupère le pion.`,
            `On arrive à la fameuse finale berlinoise (après l'échange des dames) : très tenace pour les Noirs.`
          ]
        },
        {
          name: `Variante d'échange`, eco: 'C68',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6'],
          notes: [
            '', '', '', '', '', '',
            `<b>La variante d'échange</b> : les Blancs cèdent la paire de fous pour abîmer la structure noire (pions doublés en c).`,
            `On reprend vers le centre : deux fous et un jeu actif compensent les pions doublés.`
          ]
        }
      ],
      traps: [
        {
          title: '💰 Le pion e5 est empoisonné',
          hint: `Beaucoup croient que 4.Fxc6 dxc6 5.Cxe5 « gagne » le pion e5. C'est faux : 5…Dd4 ! fourche le cavalier e5 et le pion e4, et les Noirs récupèrent tout. Joue Dd4.`,
          fen: 'r1bqkbnr/1pp2ppp/p1p5/4N3/4P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 5',
          sol: ['Qd4']
        },
        {
          title: `🚢 Le piège de l'Arche de Noé`,
          hint: `Un fou blanc trop gourmand peut se faire piéger à l'aile dame : après …b5 puis …c5-c4, les pions a6/b5/c4 emprisonnent le fou en b3 s'il n'a plus la case c2. C'est le plus vieux piège de l'Espagnole : garde toujours une sortie à ton fou.`
        }
      ],
      quiz: [
        { q: `Pourquoi jouer 3.Fb5 ?`, opts: [`Pour attaquer le défenseur du pion e5`, `Pour donner échec`, `Pour préparer f4`, `Pour clouer la dame`], answer: 0, explain: `Le fou attaque le cavalier c6, qui défend e5 : une pression durable sur le centre.` },
        { q: `Après 4.Fxc6 dxc6 5.Cxe5, les Blancs gagnent-ils le pion ?`, opts: [`Non, 5…Dd4 le récupère`, `Oui, c'est gratuit`, `Oui, mais c'est risqué`, `Non, c'est illégal`], answer: 0, explain: `5…Dd4 fourche le Ce5 et le pion e4 : les Noirs reprennent tout.` },
        { q: `Quel est le grand plan des Blancs dans l'Espagnole fermée ?`, opts: [`c3 puis d4`, `Fxc6 immédiat`, `L'attaque h4-h5`, `Le grand roque`], answer: 0, explain: `c3 + d4 bâtit le centre ; le cavalier b1 rejoint souvent l'aile roi par d2-f1-g3.` }
      ]
    },

    // ────────────────────────────── Écossaise ──────────────────────────────
    'e4 e5 Nf3 Nc6 d4 exd4 Nxd4': {
      intro: `Ouvrir le centre dès le 3ᵉ coup par d4 : on échange un pion central et on obtient un jeu clair et actif, sans la théorie tentaculaire de l'Espagnole. Un excellent choix pour jouer concrètement dès le début.`,
      lines: [
        {
          name: 'Variante classique (4…Fc5)', eco: 'C45',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5', 'Be3', 'Qf6', 'c3', 'Nge7'],
          notes: [
            '', '', '', '',
            `<b>L'idée de l'Écossaise</b> : ouvrir le centre dès le 3ᵉ coup, sans théorie tentaculaire.`,
            `Les Noirs prennent au centre.`,
            `Le cavalier récupère le pion et se centralise.`,
            `Attaque le cavalier d4 : la variante classique.`,
            `Soutient d4 et propose l'échange des fous.`,
            `Défend le fou c5 et pointe vers f2 et d4.`,
            `Consolide d4 et ouvre une case de repli.`,
            `Développe vers g6 sans boucher la dame f6. Jeu sain et équilibré.`
          ]
        },
        {
          name: 'Variante Mieses (4…Cf6)', eco: 'C45',
          sans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6', 'Nxc6', 'dxc6', 'e5', 'Qe7'],
          notes: [
            '', '', '', '', '', '', '',
            `Frappe e4 au lieu de …Fc5 : la variante Mieses, la plus jouée aujourd'hui.`,
            `Les Blancs échangent avant que le cavalier ne soit chassé.`,
            `On reprend vers le centre, en ouvrant le fou c8.`,
            `<b>Le coup critique</b> : le pion chasse le cavalier f6 et gagne de l'espace.`,
            `Attaque le pion e5 et prépare …Cd5. Position déséquilibrée mais saine.`
          ]
        }
      ],
      traps: [
        {
          title: `⚡ Ne prends pas trop vite : 5.Cxc6 ? Df6 !`,
          hint: `Après 4…Fc5, si les Blancs jouent 5.Cxc6 ?, 5…Df6 ! attaque à la fois f2 et le cavalier c6. Les Noirs récupèrent la pièce avec un excellent jeu. Joue Df6.`,
          fen: 'r1bqk1nr/pppp1ppp/2N5/2b5/4P3/8/PPP2PPP/RNBQKB1R b KQkq - 0 5',
          sol: ['Qf6']
        }
      ],
      quiz: [
        { q: `Quelle est l'idée de 3.d4 dans l'Écossaise ?`, opts: [`Ouvrir le centre sans grande théorie`, `Sacrifier un pion`, `Préparer le roque long`, `Clouer le cavalier c6`], answer: 0, explain: `On échange un pion central pour un jeu clair et actif.` },
        { q: `Après 4…Fc5, pourquoi 5.Cxc6 est-il imprécis ?`, opts: [`5…Df6 ! reprend la pièce et attaque f2`, `Cela perd le roque`, `C'est illégal`, `Cela donne la dame`], answer: 0, explain: `Df6 vise f2 et le cavalier c6 : les Noirs récupèrent tout.` },
        { q: `Variante Mieses : le coup critique blanc après 5.Cxc6 dxc6 ?`, opts: [`6.e5 chasse le cavalier f6`, `6.Fg5`, `6.Dd8+`, `6.f4`], answer: 0, explain: `6.e5 gagne de l'espace et chasse le Cf6 ; les Noirs répondent …De7.` }
      ]
    },

    // ───────────────────────────── Gambit du Roi ────────────────────────────
    'e4 e5 f4': {
      intro: `Sacrifier le pion f pour ouvrir la colonne f et déloger le pion e5 : on échange du matériel contre une initiative immédiate et une attaque sur f7. L'ouverture romantique par excellence, tranchante mais risquée.`,
      lines: [
        {
          name: 'Accepté, défense moderne', eco: 'C36',
          sans: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'd5', 'exd5', 'Nf6', 'Bb5+', 'c6', 'dxc6', 'Nxc6'],
          notes: [
            '', '',
            `<b>Le Gambit du Roi</b> : les Blancs offrent le pion f pour ouvrir la colonne f et attaquer f7.`,
            `Le gambit accepté : les Noirs prennent le pion.`,
            `Développe et empêche …Dh4+ (qui priverait les Blancs du roque).`,
            `<b>La défense moderne</b> : au lieu de garder le pion par …g5, les Noirs contre-attaquent au centre. Sain et fiable.`,
            `Les Blancs prennent.`,
            `Les Noirs reprendront d5 en développant.`,
            `Un échec gênant avant de récupérer le pion.`,
            `Bloque l'échec.`,
            `Ouvre les lignes.`,
            `Développement rapide : les Noirs ont un jeu confortable, partie équilibrée.`
          ]
        },
        {
          name: 'Gambit refusé (2…Fc5)', eco: 'C30',
          sans: ['e4', 'e5', 'f4', 'Bc5', 'Nf3', 'd6', 'Nc3', 'Nf6'],
          notes: [
            '', '',
            `Le pion f est offert…`,
            `<b>Le gambit refusé</b> : le fou file en c5 et vise f2 (que les Blancs ne peuvent plus garder par un roque facile). Solide, sans complications.`,
            '',
            `Soutient e5 et ouvre le fou c8.`,
            `Développe ; les Blancs renoncent à l'attaque immédiate.`,
            `Développement naturel : jeu calme, très différent du gambit accepté.`
          ]
        },
        {
          name: 'Contre-gambit Falkbeer', eco: 'C31',
          sans: ['e4', 'e5', 'f4', 'd5', 'exd5', 'e4'],
          notes: [
            '', '', '',
            `<b>Le contre-gambit Falkbeer</b> : les Noirs répondent au gambit par un gambit ! Ils rendent un pion pour l'initiative.`,
            `Les Blancs acceptent.`,
            `Le pion avance et gêne le développement blanc (plus de Cf3). Contre-jeu actif pour les Noirs.`
          ]
        }
      ],
      traps: [
        {
          title: '🛑 Pourquoi 3.Cf3 avant tout',
          hint: `Après 2…exf4, les Blancs jouent 3.Cf3 en priorité pour empêcher 3…Dh4+. Sans ce coup (par ex. 3.Fc4 ?!), 3…Dh4+ 4.Rf1 prive les Blancs du roque et gêne durablement leur roi. L'ordre des coups compte.`
        },
        {
          title: '⚔️ Le danger des lignes …g5',
          hint: `Si les Noirs gardent le pion par 3…g5, les Blancs disposent d'attaques violentes (gambits Muzio/Kieseritzky) où ils sacrifient encore du matériel pour foncer sur f7. À ton niveau, la défense moderne 3…d5 est bien plus sûre.`
        }
      ],
      quiz: [
        { q: `Que sacrifient les Blancs avec 2.f4 ?`, opts: [`Le pion f, pour ouvrir la colonne f et attaquer`, `Un cavalier`, `Rien, c'est un piège`, `La qualité`], answer: 0, explain: `On donne un pion contre l'initiative et une attaque sur f7.` },
        { q: `Pourquoi jouer 3.Cf3 dans le gambit accepté ?`, opts: [`Pour empêcher 3…Dh4+`, `Pour attaquer d5`, `Pour préparer le grand roque`, `Pour reprendre le pion f4`], answer: 0, explain: `Cf3 contrôle h4 : sans lui, …Dh4+ priverait les Blancs du roque.` },
        { q: `La défense la plus sûre pour les Noirs après 2…exf4 3.Cf3 ?`, opts: [`3…d5, la défense moderne`, `3…g5, tout garder`, `3…Dh4+`, `3…f3`], answer: 0, explain: `…d5 rend le pion pour un développement sain et évite les attaques sauvages des lignes …g5.` }
      ]
    },

    // ────────────────────────── Défense Petrov (Russe) ─────────────────────
    'e4 e5 Nf3 Nf6': {
      intro: `Plutôt que de défendre e5, frapper aussitôt e4 par …Cf6 : la symétrie neutralise l'initiative blanche. Une défense de sang-froid, réputée très solide, qui vise une égalité propre.`,
      lines: [
        {
          name: 'Variante classique', eco: 'C42',
          sans: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6', 'Nf3', 'Nxe4', 'd4', 'd5', 'Bd3', 'Be7'],
          notes: [
            '', '', '',
            `<b>La Défense Petrov</b> : au lieu de défendre e5, les Noirs contre-attaquent aussitôt e4.`,
            `Les Blancs prennent e5.`,
            `<b>Le coup essentiel</b> : on chasse d'abord le cavalier, AVANT de reprendre e4 (voir les Pièges).`,
            `Le cavalier recule.`,
            `Maintenant les Noirs prennent e4 en sécurité.`,
            `Les Blancs ouvrent le centre.`,
            `Les Noirs soutiennent leur cavalier e4.`,
            `Développe en visant le cavalier e4.`,
            `Développement solide : position symétrique et équilibrée.`
          ]
        },
        {
          name: 'Variante moderne (3.d4)', eco: 'C43',
          sans: ['e4', 'e5', 'Nf3', 'Nf6', 'd4', 'exd4', 'e5', 'Ne4', 'Qxd4'],
          notes: [
            '', '', '', '',
            `<b>La variante moderne</b> : au lieu de 3.Cxe5, les Blancs ouvrent le centre pour éviter la symétrie.`,
            `Les Noirs prennent.`,
            `Le pion avance et chasse le cavalier f6.`,
            `Le cavalier trouve refuge en e4.`,
            `Les Blancs récupèrent le pion, dame centralisée : léger espace, jeu jouable des deux côtés.`
          ]
        }
      ],
      traps: [
        {
          title: '💥 Le piège classique : 3…Cxe4 ?',
          hint: `Ne reprends JAMAIS e4 avant d'avoir chassé le cavalier ! Après 3.Cxe5 Cxe4 ?? 4.De2 ! (menace le cavalier et cloue la colonne e), si 4…Cf6 ?? alors 5.Cc6+ ! est un échec à la découverte de la dame e2 qui gagne la dame noire. Joue Cc6+.`,
          fen: 'rnbqkb1r/pppp1ppp/5n2/4N3/8/8/PPPPQPPP/RNB1KB1R w KQkq - 2 5',
          sol: ['Nc6+']
        },
        {
          title: `✅ Le bon ordre : …d6 d'abord`,
          hint: `Après 3.Cxe5, la clé est de jouer 3…d6 pour chasser le cavalier, PUIS 4…Cxe4 en sécurité. Ne prends pas e4 tout de suite. Joue d6.`,
          fen: 'rnbqkb1r/pppp1ppp/5n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3',
          sol: ['d6']
        }
      ],
      quiz: [
        { q: `Quelle est l'idée de la Petrov (2…Cf6) ?`, opts: [`Contre-attaquer e4 au lieu de défendre e5`, `Préparer le grand roque`, `Attaquer f2`, `Gagner un pion`], answer: 0, explain: `La symétrie neutralise l'initiative blanche : une défense de sang-froid visant l'égalité.` },
        { q: `Après 3.Cxe5, quel est le bon coup ?`, opts: [`3…d6 pour chasser le cavalier d'abord`, `3…Cxe4 tout de suite`, `3…De7`, `3…Fc5`], answer: 0, explain: `3…Cxe4 ?? tombe sur 4.De2 ! On joue d'abord 3…d6, puis …Cxe4 en sécurité.` },
        { q: `Après 3.Cxe5 Cxe4 ?? 4.De2 Cf6 ??, que jouent les Blancs ?`, opts: [`5.Cc6+ gagne la dame`, `5.Dxe4`, `5.Cf3`, `5.d4`], answer: 0, explain: `5.Cc6+ est un échec à la découverte (dame e2) qui gagne la dame noire en d8.` }
      ]
    }

  };

  function get(line) { return (line && COURSES[line]) || null; }
  function has(line) { return !!(line && COURSES[line]); }

  // Find the course whose key is the LONGEST token-prefix of `line`. Lets a
  // deep played line (from the Coach) map back to its course — e.g. a game that
  // reached `…Bc4 Bc5 d3 Nf6` matches the Pianissimo course over the Italienne.
  function match(line) {
    if (!line) return null;
    const toks = line.split(' ');
    let best = null;
    for (const key in COURSES) {
      const kt = key.split(' ');
      if (kt.length > toks.length) continue;
      let ok = true;
      for (let i = 0; i < kt.length; i++) { if (kt[i] !== toks[i]) { ok = false; break; } }
      if (ok && (!best || kt.length > best.key.split(' ').length)) best = { key, course: COURSES[key] };
    }
    return best;
  }

  return { get, has, match, COURSES };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Courses;
