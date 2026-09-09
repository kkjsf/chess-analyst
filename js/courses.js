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
        { at: 1,
          title: '🍖 Le Fried Liver (Cxf7)',
          hint: `Dans les Deux Cavaliers, après 4.Cg5 d5 5.exd5, si les Noirs reprennent 5…Cxd5?? le sacrifice 6.Cxf7! attire le roi au centre : après 6…Rxf7 7.Df3+ le roi noir est en grand danger. Joue Cxf7.`,
          fen: 'r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6',
          sol: ['Nxf7']
        },
        { at: 1,
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
        { at: 0,
          q: `Dans l'Italienne calme (Pianissimo), pourquoi jouer d3 plutôt que d4 ?`,
          opts: [`Pour un jeu lent et solide en soutenant e4`, `Parce que d4 serait illégal`, `Pour préparer le grand roque`, `Pour attaquer f7 immédiatement`], answer: 0,
          explain: `d3 garde le centre fermé : on manœuvre tranquillement avant d'attaquer.`
        },
        { at: 1,
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
        { at: 1,
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
        { at: 0, q: `Quelle est la manœuvre de cavalier typique des Blancs ?`, opts: [`Cb1-d2-f1-g3`, `Cf3-h4-f5`, `Cb1-c3-d5`, `Cf3-d2-b3`], answer: 0, explain: `Le cavalier dame rejoint l'aile roi par d2-f1-g3, après avoir joué Te1.` },
        { at: 1, q: `Quel est le grand plan d'égalisation des Noirs ?`, opts: [`La rupture …d5`, `Le fianchetto …g6`, `L'attaque …h5-h4`, `Le grand roque`], answer: 0, explain: `Bien préparée, …d5 conteste le centre et libère les pièces noires.` }
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
        { at: 2,
          title: '💰 Le pion e5 est empoisonné',
          hint: `Beaucoup croient que 4.Fxc6 dxc6 5.Cxe5 « gagne » le pion e5. C'est faux : 5…Dd4 ! fourche le cavalier e5 et le pion e4, et les Noirs récupèrent tout. Joue Dd4.`,
          fen: 'r1bqkbnr/1pp2ppp/p1p5/4N3/4P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 5',
          sol: ['Qd4']
        },
        { at: 0,
          title: `🚢 Le piège de l'Arche de Noé`,
          hint: `Un fou blanc trop gourmand peut se faire piéger à l'aile dame : après …b5 puis …c5-c4, les pions a6/b5/c4 emprisonnent le fou en b3 s'il n'a plus la case c2. C'est le plus vieux piège de l'Espagnole : garde toujours une sortie à ton fou.`
        }
      ],
      quiz: [
        { q: `Pourquoi jouer 3.Fb5 ?`, opts: [`Pour attaquer le défenseur du pion e5`, `Pour donner échec`, `Pour préparer f4`, `Pour clouer la dame`], answer: 0, explain: `Le fou attaque le cavalier c6, qui défend e5 : une pression durable sur le centre.` },
        { at: 2, q: `Après 4.Fxc6 dxc6 5.Cxe5, les Blancs gagnent-ils le pion ?`, opts: [`Non, 5…Dd4 le récupère`, `Oui, c'est gratuit`, `Oui, mais c'est risqué`, `Non, c'est illégal`], answer: 0, explain: `5…Dd4 fourche le Ce5 et le pion e4 : les Noirs reprennent tout.` },
        { at: 0, q: `Quel est le grand plan des Blancs dans l'Espagnole fermée ?`, opts: [`c3 puis d4`, `Fxc6 immédiat`, `L'attaque h4-h5`, `Le grand roque`], answer: 0, explain: `c3 + d4 bâtit le centre ; le cavalier b1 rejoint souvent l'aile roi par d2-f1-g3.` }
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
        { at: 0,
          title: `⚡ Ne prends pas trop vite : 5.Cxc6 ? Df6 !`,
          hint: `Après 4…Fc5, si les Blancs jouent 5.Cxc6 ?, 5…Df6 ! attaque à la fois f2 et le cavalier c6. Les Noirs récupèrent la pièce avec un excellent jeu. Joue Df6.`,
          fen: 'r1bqk1nr/pppp1ppp/2N5/2b5/4P3/8/PPP2PPP/RNBQKB1R b KQkq - 0 5',
          sol: ['Qf6']
        }
      ],
      quiz: [
        { q: `Quelle est l'idée de 3.d4 dans l'Écossaise ?`, opts: [`Ouvrir le centre sans grande théorie`, `Sacrifier un pion`, `Préparer le roque long`, `Clouer le cavalier c6`], answer: 0, explain: `On échange un pion central pour un jeu clair et actif.` },
        { at: 0, q: `Après 4…Fc5, pourquoi 5.Cxc6 est-il imprécis ?`, opts: [`5…Df6 ! reprend la pièce et attaque f2`, `Cela perd le roque`, `C'est illégal`, `Cela donne la dame`], answer: 0, explain: `Df6 vise f2 et le cavalier c6 : les Noirs récupèrent tout.` },
        { at: 1, q: `Variante Mieses : le coup critique blanc après 5.Cxc6 dxc6 ?`, opts: [`6.e5 chasse le cavalier f6`, `6.Fg5`, `6.Dd8+`, `6.f4`], answer: 0, explain: `6.e5 gagne de l'espace et chasse le Cf6 ; les Noirs répondent …De7.` }
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
        { at: 0,
          title: '🛑 Pourquoi 3.Cf3 avant tout',
          hint: `Après 2…exf4, les Blancs jouent 3.Cf3 en priorité pour empêcher 3…Dh4+. Sans ce coup (par ex. 3.Fc4 ?!), 3…Dh4+ 4.Rf1 prive les Blancs du roque et gêne durablement leur roi. L'ordre des coups compte.`
        },
        { at: 0,
          title: '⚔️ Le danger des lignes …g5',
          hint: `Si les Noirs gardent le pion par 3…g5, les Blancs disposent d'attaques violentes (gambits Muzio/Kieseritzky) où ils sacrifient encore du matériel pour foncer sur f7. À ton niveau, la défense moderne 3…d5 est bien plus sûre.`
        }
      ],
      quiz: [
        { q: `Que sacrifient les Blancs avec 2.f4 ?`, opts: [`Le pion f, pour ouvrir la colonne f et attaquer`, `Un cavalier`, `Rien, c'est un piège`, `La qualité`], answer: 0, explain: `On donne un pion contre l'initiative et une attaque sur f7.` },
        { at: 0, q: `Pourquoi jouer 3.Cf3 dans le gambit accepté ?`, opts: [`Pour empêcher 3…Dh4+`, `Pour attaquer d5`, `Pour préparer le grand roque`, `Pour reprendre le pion f4`], answer: 0, explain: `Cf3 contrôle h4 : sans lui, …Dh4+ priverait les Blancs du roque.` },
        { at: 0, q: `La défense la plus sûre pour les Noirs après 2…exf4 3.Cf3 ?`, opts: [`3…d5, la défense moderne`, `3…g5, tout garder`, `3…Dh4+`, `3…f3`], answer: 0, explain: `…d5 rend le pion pour un développement sain et évite les attaques sauvages des lignes …g5.` }
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
        { at: 0,
          title: '💥 Le piège classique : 3…Cxe4 ?',
          hint: `Ne reprends JAMAIS e4 avant d'avoir chassé le cavalier ! Après 3.Cxe5 Cxe4 ?? 4.De2 ! (menace le cavalier et cloue la colonne e), si 4…Cf6 ?? alors 5.Cc6+ ! est un échec à la découverte de la dame e2 qui gagne la dame noire. Joue Cc6+.`,
          fen: 'rnbqkb1r/pppp1ppp/5n2/4N3/8/8/PPPPQPPP/RNB1KB1R w KQkq - 2 5',
          sol: ['Nc6+']
        },
        { at: 0,
          title: `✅ Le bon ordre : …d6 d'abord`,
          hint: `Après 3.Cxe5, la clé est de jouer 3…d6 pour chasser le cavalier, PUIS 4…Cxe4 en sécurité. Ne prends pas e4 tout de suite. Joue d6.`,
          fen: 'rnbqkb1r/pppp1ppp/5n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3',
          sol: ['d6']
        }
      ],
      quiz: [
        { q: `Quelle est l'idée de la Petrov (2…Cf6) ?`, opts: [`Contre-attaquer e4 au lieu de défendre e5`, `Préparer le grand roque`, `Attaquer f2`, `Gagner un pion`], answer: 0, explain: `La symétrie neutralise l'initiative blanche : une défense de sang-froid visant l'égalité.` },
        { at: 0, q: `Après 3.Cxe5, quel est le bon coup ?`, opts: [`3…d6 pour chasser le cavalier d'abord`, `3…Cxe4 tout de suite`, `3…De7`, `3…Fc5`], answer: 0, explain: `3…Cxe4 ?? tombe sur 4.De2 ! On joue d'abord 3…d6, puis …Cxe4 en sécurité.` },
        { at: 0, q: `Après 3.Cxe5 Cxe4 ?? 4.De2 Cf6 ??, que jouent les Blancs ?`, opts: [`5.Cc6+ gagne la dame`, `5.Dxe4`, `5.Cf3`, `5.d4`], answer: 0, explain: `5.Cc6+ est un échec à la découverte (dame e2) qui gagne la dame noire en d8.` }
      ]
    },

    // ─────────────────────────── Ouverture Viennoise ───────────────────────────
    'e4 e5 Nc3': {
      intro: `La Viennoise (2.Cc3) est le Gambit du Roi « bien élevé » : on développe d'abord le cavalier et on surprotège e4, PUIS on lance f4 avec une pièce déjà sortie. Peu de théorie, des plans d'attaque limpides et quelques pièges bien connus. Trois familles : le Gambit tranchant (3.f4), le développement à l'italienne (3.Fc4) et le fianchetto positionnel (3.g3).`,
      lines: [
        {
          name: 'Gambit Viennois (3.f4)', eco: 'C29',
          sans: ['e4', 'e5', 'Nc3', 'Nf6', 'f4', 'd5', 'fxe5', 'Nxe4', 'Nf3', 'Be7', 'd4', 'O-O', 'Bd3'],
          notes: [
            `On prend le centre.`,
            `Réponse symétrique : jeux ouverts.`,
            `<b>Le coup-signature de la Viennoise</b> : on développe le cavalier et on surprotège e4 avant de lancer f4.`,
            `La meilleure réponse : les Noirs frappent e4 tout de suite et préparent la libératrice …d5.`,
            `<b>Le Gambit Viennois</b> : e4 est soutenu, on ouvre l'aile roi comme au Gambit du Roi, mais mieux préparé.`,
            `<b>LA parade</b>. Surtout pas 4…exf4 : la contre-frappe centrale …d5 est la réfutation théorique du gambit.`,
            `On prend au passage ; 6.exd5 exf4 est l'autre grande ligne.`,
            `Les Noirs récupèrent leur pion en se centralisant.`,
            `Développe et prépare d4 : la position est ouverte et à peu près équilibrée.`,
            `Développe et prépare le roque (5…Fc5 est aussi jouable).`,
            `Les Blancs prennent tout le centre.`,
            `Les deux rois sont à l'abri : jeu dynamique et sain des deux côtés.`,
            `Le fou vise h7 et l'aile roi. Position type du Gambit Viennois moderne.`
          ]
        },
        {
          name: 'Classique (3.Fc4)', eco: 'C26',
          sans: ['e4', 'e5', 'Nc3', 'Nf6', 'Bc4', 'Nc6', 'd3', 'Bb4', 'Nge2', 'd5'],
          notes: [
            '', '', '', '',
            `L'autre grand plan : le fou file en c4 contre f7 (comme à l'Italienne), en gardant f4 en réserve.`,
            `Développement symétrique et solide.`,
            `Soutient e4 et ouvre le fou c1 : jeu calme et positionnel.`,
            `Cloue le cavalier c3, le défenseur de e4, pour préparer …d5.`,
            `<b>Le bon développement</b> : le cavalier va en e2 (pas f3) pour renforcer c3, défaire le clouage et garder f4 possible.`,
            `<b>La rupture libératrice</b> : les Noirs contestent le centre et égalisent confortablement.`
          ]
        },
        {
          name: 'Fianchetto (3.g3)', eco: 'C25',
          sans: ['e4', 'e5', 'Nc3', 'Nc6', 'g3', 'Nf6', 'Bg2', 'Bc5', 'Nge2', 'd6', 'O-O', 'O-O'],
          notes: [
            '', '', '', '',
            `<b>Le plan positionnel de Botvinnik</b> : on fianchette en g2 pour presser d5/e4 sur la grande diagonale, sans hâte.`,
            `Développe et attaque e4.`,
            `Le fou fianchetto surveille le centre et l'aile dame adverse.`,
            `Développe activement en visant f2.`,
            `Cavalier en e2 pour ne pas gêner le fou g2 et garder f4/d4 en réserve.`,
            `Soutient e5.`,
            `Petit roque.`,
            `Position type : manœuvre lente, les Blancs enchaînent d3, h3, puis f4 ou Cd5 selon les cas.`
          ]
        }
      ],
      traps: [
        { at: 0,
          title: '🎯 Gambit accepté ? La poussée e5 !',
          hint: `Si les Noirs prennent le pion par 3…exf4 au lieu de contester par …d5, ne reprends pas f4 : joue 4.e5 ! Le pion chasse le cavalier f6 et te donne un centre écrasant avec une longueur d'avance. Joue e5.`,
          fen: 'rnbqkb1r/pppp1ppp/5n2/8/4Pp2/2N5/PPPP2PP/R1BQKBNR w KQkq - 0 4',
          sol: ['e5']
        },
        { at: 1,
          title: '⚡ Si 3…Cxe4 : la double menace Dh5 !',
          hint: `Après 3.Fc4, si les Noirs grignotent le pion par 3…Cxe4 ?, joue 4.Dh5 ! : la dame menace le mat en f7 (épaulée par le fou c4) ET, après …g6 5.Dxe5+, de fourcher le roi et le cavalier e4. Les Noirs n'ont que l'unique 4…Cd6. Joue Dh5.`,
          fen: 'rnbqkb1r/pppp1ppp/8/4p3/2B1n3/2N5/PPPP1PPP/R1BQK1NR w KQkq - 0 4',
          sol: ['Qh5']
        },
        { at: 0,
          title: `🛡️ La règle d'or : …d5 contre le gambit`,
          hint: `Face au Gambit Viennois (3.f4), la réponse saine des Noirs n'est pas de garder le pion (3…exf4) mais de frapper au centre par 3…d5 ! : ça ouvre les lignes pour les pièces noires et neutralise l'attaque avant qu'elle ne démarre. Le plan d'égalisation à retenir.`
        }
      ],
      transpositions: [
        { label: '3.Fc4 Fc5', note: `Sans …Cxe4, un jeu à l'italienne peut se produire, mais les Blancs gardent l'idée f4 en réserve.` },
        { label: '2…Cc6 puis 3.f4', note: `Le gambit est aussi jouable contre 2…Cc6 ; les thèmes (f4, …d5) restent les mêmes.` },
        { label: 'Vers le Gambit du Roi', note: `La Viennoise est souvent décrite comme « un Gambit du Roi avec Cc3 joué d'abord » : mêmes idées d'attaque, mais mieux préparées.` }
      ],
      quiz: [
        { q: `Quel coup définit l'Ouverture Viennoise ?`, opts: ['2.Cc3', '2.Cf3', '2.Fc4', '2.f4'], answer: 0, explain: `2.Cc3 développe le cavalier dame et surprotège e4 avant de lancer f4.` },
        { at: 0, q: `Contre le Gambit Viennois (3.f4), la meilleure réponse des Noirs ?`, opts: ['3…d5', '3…exf4', '3…Cc6', '3…d6'], answer: 0, explain: `3…d5 ! contre-frappe au centre ; garder le pion par 3…exf4 laisse 4.e5 avec un fort avantage blanc.` },
        { at: 0, q: `Pourquoi développer le cavalier roi en e2 plutôt qu'en f3 ?`, opts: [`Pour garder f4 disponible et ne pas gêner le fou g2`, `Parce que Cf3 est illégal`, `Pour attaquer la dame`, `Pour préparer le grand roque`], answer: 0, explain: `Cge2 renforce c3 et laisse la colonne f + le fou fianchetto libres ; Cf3 bloquerait le pion f.` }
      ]
    },

    // ── Défense Scandinave (1.e4 d5) ──
    'e4 d5 exd5 Qxd5': {
      intro: `La Scandinave est l'une des rares défenses où les Noirs imposent leur jeu dès le 1ᵉʳ coup : on échange en d5 et on reprend de la dame. Oui, la dame sort tôt et se fait attaquer par 3.Cc3 - mais elle se recase proprement (a5, d6 ou d8) en gagnant du temps de développement, et la structure noire reste saine. Peu de théorie, un plan limpide (…c6, …Ff5/…Fg4, …e6, …Cbd7, roque) et de vrais pièges à connaître. Trois grandes retraites : 3…Da5 (la principale), 3…Dd6 (moderne et souple), 3…Dd8 (solide).`,
      lines: [
        {
          name: 'Principale (3…Da5)', eco: 'B01',
          sans: ['e4','d5','exd5','Qxd5','Nc3','Qa5','d4','Nf6','Nf3','c6','Bc4','Bf5','Bd2','e6','Qe2','Nbd7'],
          notes: [
            '',
            `<b>La Scandinave</b> : on conteste e4 dès le premier coup.`,
            `Les Blancs prennent au centre.`,
            `On reprend de la dame. C'est le pari de la Scandinave : un peu de temps perdu avec la dame contre une structure saine et un plan clair.`,
            `Le coup thématique : les Blancs développent EN attaquant la dame - mais ce tempo aide aussi les Noirs à la placer sur une bonne case.`,
            `<b>La retraite principale</b> : la dame reste active sur la diagonale a5-e1 et gêne le cavalier c3.`,
            `Les Blancs prennent tout le centre.`,
            `Développe et surveille e4/d5.`,
            `Développement naturel.`,
            `<b>La case-clé</b> : …c6 donne une porte de sortie à la dame et prépare …Ff5 sans craindre Cb5.`,
            `Le fou vise f7.`,
            `<b>Le bon fou d'abord</b> : on sort le fou de cases claires HORS de la chaîne de pions avant de jouer …e6.`,
            `Prépare le grand roque et casse le clouage sur c3.`,
            `Maintenant …e6 : le fou c8 est déjà dehors.`,
            `La dame dégage d1 pour préparer O-O-O : la partie devient double-tranchante.`,
            `Développe le dernier cavalier. Position type : les Noirs enchaîneront …Fd6/…Fe7 et le roque, avec une position saine.`
          ]
        },
        {
          name: 'Moderne (3…Dd6)', eco: 'B01',
          sans: ['e4','d5','exd5','Qxd5','Nc3','Qd6','d4','Nf6','Nf3','a6','g3','b5','Bg2','Bb7'],
          notes: [
            '', `On conteste e4.`, `Prise au centre.`, `Reprise de la dame.`, `Cc3 attaque la dame.`,
            `<b>La Scandinave moderne</b> : la dame se pose en d6, à l'abri, en gardant l'œil sur e5 et la colonne d. Très en vogue.`,
            `Centre blanc.`, `Développe.`, `Développe.`,
            `<b>Le plan …a6/…b5</b> : les Noirs préparent une expansion à l'aile dame et interdisent Cb5.`,
            `Les Blancs fianchettent pour presser d5 et la grande diagonale.`,
            `Gain d'espace à l'aile dame.`,
            `Le fou g2 vise le centre.`,
            `Le fou b7 répond sur la même diagonale : jeu positionnel équilibré, plan clair des deux côtés.`
          ]
        },
        {
          name: 'Solide (3…Dd8)', eco: 'B01',
          sans: ['e4','d5','exd5','Qxd5','Nc3','Qd8','d4','Nf6','Nf3','g6','Bc4','Bg7','O-O','O-O'],
          notes: [
            '', `On conteste e4.`, `Prise au centre.`, `Reprise de la dame.`, `Cc3 attaque la dame.`,
            `<b>La retraite solide</b> : la dame rentre à la maison. Un peu passif, mais aucune faiblesse - souvent suivi d'un fianchetto …g6/…Fg7.`,
            `Centre blanc.`, `Développe.`, `Développe.`,
            `Plan de fianchetto façon est-indienne.`,
            `Le fou vise f7.`,
            `Le fou g7 surveille le grand centre.`,
            `Les Blancs roquent.`,
            `Les Noirs roquent : position solide, ils viseront …c6 puis …Ff5 ou …b6.`
          ]
        }
      ],
      traps: [
        { at: 1,
          title: `⚡ Contre 3…Dd6 : le saut Cb5 !`,
          hint: `Après 3…Dd6, joue 4.Cb5 ! : le cavalier attaque la dame et menace surtout la fourchette Cxc7+ (roi + tour a8). Les Noirs doivent défendre précisément (4…Ca6 ou 4…Dd8). Un temps gagné et un piège posé. Joue Cb5.`,
          fen: 'rnb1kbnr/ppp1pppp/3q4/8/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 4',
          sol: ['Nb5']
        },
        {
          title: `🛡️ Les trois bonnes retraites de la dame`,
          hint: `Après 3.Cc3, la dame n'a que trois bonnes cases : <b>a5</b> (active), <b>d6</b> (souple) ou <b>d8</b> (solide). Évite celles où elle se fait encore chasser en perdant du temps (…De5+, …De6+, …Dd4) : chaque tempo adverse t'éloigne de l'égalité.`
        },
        {
          title: `♗ Toujours …Ff5 (ou …Fg4) AVANT …e6`,
          hint: `Le réflexe qui fait la différence : sors le fou de cases claires (…Ff5 ou …Fg4) AVANT de jouer …e6. Sinon ce fou reste enfermé toute la partie - le fameux "mauvais fou" de la Française, qu'on veut justement éviter à la Scandinave.`
        }
      ],
      transpositions: [
        { label: `2…Cf6 (au lieu de 2…Dxd5)`, note: `Les Noirs recapturent avec le cavalier (voire un gambit à l'islandaise/portugaise) : jeu plus dynamique, tout un autre univers.` },
        { label: `2.e5 (Scandinave avancée)`, note: `Si les Blancs poussent 2.e5 au lieu de prendre, on obtient une structure type Française/Caro avancée : …Ff5 ou …c5 et jeu de blocage.` },
        { label: `3.Cf3 au lieu de 3.Cc3`, note: `Sans l'attaque immédiate sur la dame, les Noirs se développent tranquillement (…Cf6, …Ff5, …c6, …e6) sans le moindre problème.` }
      ],
      quiz: [
        { q: `Pourquoi 1…d5 puis 2…Dxd5 est-il jouable malgré la sortie précoce de la dame ?`, opts: [`La dame se recase en gagnant du temps de développement et la structure reste saine`, `La dame ne peut jamais être attaquée`, `Parce que les Blancs ne peuvent pas jouer Cc3`, `Parce qu'on gagne un pion`], answer: 0, explain: `Après 3.Cc3 la dame va en a5/d6/d8 et les Noirs développent avec des coups utiles ; aucune faiblesse de structure.` },
        { q: `Quelle retraite de dame est la plus active après 3.Cc3 ?`, opts: ['3…Da5', '3…Dd8', '3…De5+', '3…Dh5'], answer: 0, explain: `3…Da5 garde la dame active sur la diagonale a5-e1 ; 3…Dd8 est solide mais passif, 3…De5+ l'expose.` },
        { q: `Quel est le bon ordre pour le fou de cases claires ?`, opts: [`…Ff5 ou …Fg4 AVANT …e6`, `…e6 puis …Fd7`, `…b6 puis …Fb7 systématiquement`, `Le garder en c8`], answer: 0, explain: `On sort le fou hors de la chaîne de pions avant …e6, sinon il reste mauvais toute la partie.` }
      ]
    },

    // ── Système de Londres : les deux ordres de coups ──
    // Sa question : « d4 d5 Ff4, ce n'est pas la version accélérée ? Il n'y a pas
    // un Cf3 avant le fou ? » — si. L'ordre de référence est 2.Cf3 Cf6 3.Ff4
    // (classique) ; 2.Ff4 tout de suite est la version accélérée. Les deux
    // convergent : vérifié moteur, les lignes 0 et 1 arrivent sur la MÊME
    // position au 8e coup (r1bq1rk1/pp3ppp/2nbpn2/2pp4/3P4/2PBPNB1/PP1N1PPP/R2QK2R b KQ),
    // et aucun n'est objectivement meilleur (Stockfish d18 : égalité après 2.Ff4
    // comme après 3.Ff4 ; sa réponse préférée à l'accéléré est …Ff5).
    'd4 d5 Bf4': {
      intro: `Le Système de Londres, c'est le même dispositif quoi que fasse l'adversaire : <b>Ff4, e3, Fd3, c3, Cf3, Cbd2, roque</b>. Deux ordres de coups y mènent, et ils portent des noms différents. L'<b>ordre classique</b> sort le cavalier d'abord — <b>1.d4 d5 2.Cf3 Cf6 3.Ff4</b> : c'est la version de référence, celle des grands maîtres. La <b>version accélérée</b> pose le fou tout de suite — <b>1.d4 d5 2.Ff4</b> : le fou est dehors avant que l'adversaire ait pu s'y opposer, mais d4 devient attaquable par …c5 alors que tu n'as développé aucune pièce. Les deux transposent presque toujours sur la même position, et aucun des deux n'est réfuté. La vraie règle, elle, ne change pas : <b>le fou sort AVANT e3</b>, puis <b>e3 verrouille le tout</b> — ce petit pion soutient d4 <b>et</b> défend le fou f4. Ensuite Fd3 (braqué sur h7), c3, Cbd2, roque, et Ce5 dès que l'occasion vient.`,
      lines: [
        {
          name: 'Ordre classique (2.Cf3 puis 3.Ff4)', eco: 'D02', altOrder: 1,
          sans: ['d4','d5','Nf3','Nf6','Bf4','e6','e3','c5','c3','Nc6','Nbd2','Bd6','Bg3','O-O','Bd3'],
          notes: [
            '',
            `Réponse classique et symétrique.`,
            `<b>L'ordre classique</b> : le cavalier d'abord. Il développe, prépare le roque et n'engage à rien — le fou sortira au coup suivant, rien ne peut l'en empêcher.`,
            `Les Noirs développent en miroir.`,
            `<b>Le coup-signature du Londres</b>, ici au 3ᵉ coup : le fou sort AVANT e3, sinon il resterait enfermé derrière ses propres pions.`,
            `Structure solide, type Gambit Dame refusé.`,
            `<b>Le verrou</b> : e3 soutient d4 ET défend le fou f4 (un pion en e3 couvre les deux cases). C'est exactement pour ça qu'on le joue APRÈS avoir sorti le fou.`,
            `La contestation classique du centre d4.`,
            `<b>Le pilier</b> : c3 soutient d4 et ouvre la case c2 à la dame.`,
            `Développe et presse d4.`,
            `Le cavalier va en d2 (pas c3) : il ne bloque pas le pion c et prépare le bond Ce5.`,
            `Les Noirs proposent l'échange du fou f4.`,
            `<b>On garde le bon fou</b> : il recule en g3, où le pion h2 le protège et d'où il tient toujours e5.`,
            `Les Noirs roquent… et deviennent une cible.`,
            `<b>Position modèle du Londres</b> : le fou vise h7, et c'est exactement la position atteinte par l'ordre accéléré. Les deux chemins se rejoignent ici.`
          ]
        },
        {
          name: 'Version accélérée (2.Ff4 tout de suite)', eco: 'D02',
          sans: ['d4','d5','Bf4','Nf6','e3','e6','Nf3','c5','c3','Nc6','Nbd2','Bd6','Bg3','O-O','Bd3'],
          notes: [
            '',
            `Réponse classique et symétrique.`,
            `<b>La version accélérée</b> : le fou d'abord, dès le 2ᵉ coup. Plus rien ne pourra l'enfermer — en échange, d4 est attaquable tout de suite par …c5.`,
            `Développe.`,
            `<b>Le verrou</b> : e3 soutient d4 et défend le fou f4.`,
            `Les Noirs adoptent une structure solide type Gambit Dame refusé.`,
            `Le cavalier arrive maintenant : à ce stade, l'ordre n'a plus d'importance.`,
            `La contestation classique du centre d4.`,
            `<b>Le pilier du Londres</b> : c3 soutient d4 et ouvre la case c2 à la dame.`,
            `Développe et presse d4.`,
            `Le cavalier va en d2 (pas c3) : il ne bloque pas le pion c et prépare le bond Ce5.`,
            `Les Noirs proposent l'échange du fou f4.`,
            `<b>On garde le bon fou</b> : au lieu d'échanger, il recule en g3, où il reste actif et protégé par h2.`,
            `Les Noirs roquent… et deviennent une cible.`,
            `<b>Le fou vise h7</b> : début du plan d'attaque type (Ce5, Dc1-h6, sacrifice grec Fxh7+ en embuscade). Même position que par l'ordre classique.`
          ]
        },
        {
          name: 'Contre …Ff5 (le clone)', eco: 'D02',
          sans: ['d4','d5','Bf4','Nf6','e3','Bf5','Nf3','e6','c4','c6','Nc3','Bd6','Bg3'],
          notes: [
            '', `Réponse symétrique.`, `Le fou sort en premier.`, `Développe.`, `Solidifie d4 et défend le fou.`,
            `<b>Le clone</b> : les Noirs sortent LEUR fou avant …e6, en miroir. C'est la réponse préférée du moteur à l'ordre accéléré — contre ça, on change de plan.`,
            `Développe.`, `Ouvre au fou.`,
            `<b>Changement de plan</b> : puisque le jeu est confortable en miroir, on ouvre par c4 pour créer un déséquilibre et presser d5.`,
            `Soutient d5.`, `Développe en pressant d5.`, `Échange proposé…`,
            `…décliné : le fou reste actif en g3. Jeu positionnel autour de d5 et de la colonne c.`
          ]
        },
        {
          name: 'Le prix de l’accélération : …c5 + …Db6', eco: 'D02',
          sans: ['d4','d5','Bf4','c5','e3','Nc6','c3','Qb6','Qc1','Bf5','Nf3','e6','Nbd2'],
          notes: [
            '', `Symétrie.`, `Le fou d'abord.`,
            `<b>Le contre de l'ordre accéléré</b> : les Noirs frappent d4 dès le 2ᵉ coup, avant que tu aies sorti une pièce. Par l'ordre classique, ce coup arrive un temps plus tard, quand ton Cf3 est déjà là.`,
            `On reste calme : e3 soutient d4 (et défend le fou).`, `Pression sur d4.`, `Le pilier : d4 tient.`,
            `<b>Le coup critique</b> : la dame attaque b2. Il faut connaître la parade.`,
            `<b>La bonne défense</b> : Dc1 protège b2 SANS lâcher le fou f4. <b>Dc2</b> fait exactement le même travail, et le moteur préfère même le modeste <b>b3</b> : trois coups équivalents, retiens-en un seul. Le coup à éviter, c'est <b>Db3</b>, qui propose l'échange des dames et casse ton attaque.`,
            `Développement.`, `Développe.`, `Ouvre au fou.`,
            `On termine le schéma : Cbd2, puis Fd3/Fe2 et roque. Le Londres a tenu bon.`
          ]
        }
      ],
      traps: [
        { at: 1,
          title: `⚡ Ce5 puis dxe5 : la fourchette de pion !`,
          hint: `Ton fou est en g3 (plus en f4) et ton cavalier saute en e5. Si l'adversaire prend le cavalier (…Cxe5 ?), reprends avec le pion : <b>dxe5 !</b> Le pion attaque À LA FOIS le fou d6 et le cavalier f6, et il est défendu par le fou g3 : tu gagnes une pièce. Joue dxe5.`,
          fen: 'r1bq1rk1/ppp2ppp/3bpn2/3pn3/3P4/4P1B1/PPPN1PPP/R2QKB1R w KQ - 0 8',
          sol: ['dxe5']
        },
        { at: 1,
          title: `🎯 Le schéma d'attaque : Ce5, Fd3, Dc1-h6`,
          hint: `Dès que l'adversaire roque du côté roi, le Londres a une attaque toute prête : cavalier en e5, fou en d3 (visant h7), dame en c1 puis h6, et parfois le sacrifice grec Fxh7+ suivi de Cg5+ et Dh5. Mémorise ce schéma : c'est là que le système devient tranchant.`
        },
        { 
          title: `♗ Il attaque ton fou par …Ch5 : glisse-le, ne l'échange pas`,
          hint: `Contre l'ordre accéléré (1.d4 Cf6 2.Ff4), un adversaire averti joue …Ch5 pour taper sur ton fou. Ne le rends pas et ne le renvoie pas à la maison : <b>Fg5 !</b> Il reste dehors, hors de la chaîne de pions, et si …h6 tu continues Fh4. Le cavalier en h5, lui, est mal placé : tu as gagné du temps.`,
          fen: 'rnbqkb1r/pppppppp/8/7n/3P1B2/8/PPP1PPPP/RN1QKBNR w KQkq - 3 3',
          sol: ['Bg5']
        },
        {
          title: `♗ L'ordre des coups : le fou AVANT e3, le cavalier quand tu veux`,
          hint: `Le seul ordre qui compte, c'est <b>le fou puis e3</b>. L'erreur classique : jouer Cf3 <b>et e3</b>, puis vouloir sortir le fou… trop tard, il est prisonnier en c1. En revanche <b>Cf3 avant le fou (ordre classique) ou après (ordre accéléré), c'est au choix</b> : les deux arrivent à la même position. Retiens la séquence sûre : Ff4 → e3 (qui défend d4 ET le fou) → Fd3 → c3 → Cf3 → Cbd2 → roque.`
        }
      ],
      transpositions: [
        { label: `Ordre classique : 1.d4 d5 2.Cf3 Cf6 3.Ff4`, note: `L'ordre de référence, le plus joué : le cavalier sort d'abord, le fou au 3ᵉ coup, et on retombe sur la position type du Londres. C'est l'ordre le plus prudent — le développement commence avant de s'engager.` },
        { label: `Ordre accéléré : 1.d4 d5 2.Ff4 (ou 1.d4 Cf6 2.Ff4)`, note: `Le fou est posé immédiatement, avant tout développement. Aucun problème théorique, mais l'adversaire gagne un temps pour frapper d4 par …c5 (avec …Db6 sur b2) ou pour copier avec …Ff5 : ce sont les deux réponses à connaître.` },
        { label: `…Cf6 puis …g6 (setup est-indien)`, note: `Si les Noirs fianchettent (…g6, …Fg7), on garde le même plan (e3, Fd3, c3, Cbd2) ; l'attaque h4-h5 devient une option de plus contre leur roque.` },
        { label: `Jobava-Londres (2.Cc3 + Ff4)`, note: `Variante plus agressive : cavalier en c3 et attaque rapide (e4, Cb5). Un autre univers, plus tranchant que le Londres classique.` }
      ],
      quiz: [
        { q: `Pourquoi joue-t-on Ff4 AVANT e3 au Système de Londres ?`, opts: [`Pour ne pas enfermer le fou derrière la chaîne de pions`, `Pour attaquer la dame`, `Parce que e3 serait illégal avant`, `Pour préparer le grand roque`], answer: 0, explain: `Le fou de cases sombres doit sortir hors de la chaîne e3-d4 ; joué après e3, il resterait mauvais en c1.` },
        { q: `Lequel est l'ordre CLASSIQUE du Londres ?`, opts: [`1.d4 d5 2.Cf3 Cf6 3.Ff4`, `1.d4 d5 2.Ff4`, `1.d4 d5 2.Cc3 Cf6 3.Ff4`, `1.d4 d5 2.e3 Cf6 3.Ff4`], answer: 0, explain: `Le cavalier d'abord, le fou au 3ᵉ coup : c'est l'ordre de référence. 2.Ff4 tout de suite est la version <b>accélérée</b> ; 2.Cc3 est le Jobava ; et 2.e3 est l'erreur qui enferme le fou.` },
        { q: `Une fois le fou sorti en f4, que fait le pion e3 ?`, opts: [`Il soutient d4 ET défend le fou f4`, `Rien, c'est un coup d'attente`, `Il ouvre la diagonale du fou c1`, `Il attaque le pion d5`], answer: 0, explain: `Un pion blanc en e3 couvre d4 et f4 : c'est le coup qui verrouille le dispositif. D'où l'ordre fou → e3, jamais l'inverse.` },
        { at: 3, q: `Après 4…Db6 (qui attaque b2), quelle défense garde le fou f4 ET les dames pour jouer le gain ?`, opts: ['5.Dc1 (ou 5.Dc2)', '5.Db3 (propose l\'échange)', '5.Fxb8 (on rend le bon fou)', '5.dxc5'], answer: 0, explain: `Dc1 et Dc2 protègent b2 sans rien lâcher ; Db3 mène souvent à l'échange des dames et à l'égalité, et Fxb8 brûle le fou sur lequel tout le système repose.` },
        { at: 1, q: `Quel est le schéma d'attaque typique du Londres contre un roque adverse ?`, opts: [`Ce5, Fd3, Dc1-h6 et parfois Fxh7+`, `Roque long et pion h`, `Échanger toutes les pièces`, `Pousser a4-a5`], answer: 0, explain: `Le fou d3 vise h7, le cavalier e5 renforce, la dame vient en h6 : schéma standard, avec le sacrifice grec Fxh7+ en embuscade.` }
      ]
    },

    // ─────────────── Attaque Parham (2.Dh5) — la sortie de dame ───────────────
    // 8 de ses parties, aucune ligne de contenu dans l'app jusqu'ici, et un mat
    // en 5 encaisse (e4 e5 Dh5 Cc6 Fc4 g6 Df3 Cd4?? Dxf7#). Le cours d'ouverture
    // le plus rentable de tout le catalogue a son niveau.
    'e4 e5 Qh5': {
      side: 'b',
      intro: `Sortir la dame au 2ᵉ coup n'est pas une ouverture, c'est un piège : les Blancs espèrent le mat du berger sur <b>f7</b>. Bien joué, c'est un cadeau - la dame est la pièce la plus chère et elle est en plein courant d'air. Trois règles suffisent : <b>défends e5 sans bouger les pions du roque</b>, <b>chasse la dame en gagnant du temps</b>, et souviens-toi que <b>…Cf6 bloque la colonne f</b>. Ne réponds jamais …g6 avant que le fou n'arrive en c4 : tu affaiblirais f7 pour rien.`,
      lines: [
        {
          name: 'La bonne parade', eco: 'C20',
          sans: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'Ne2', 'Bg7'],
          notes: [
            `Partie de pion roi, tout va bien.`,
            `Tu occupes le centre à égalité.`,
            `<b>La dame sort au 2ᵉ coup.</b> Elle attaque e5 (simple échec après capture) et lorgne f7.`,
            `<b>Le bon coup :</b> Cc6 défend e5 <i>en développant</i>. Pas …Dd6 ni …d6, qui enferment : une pièce, une case utile.`,
            `Maintenant les deux pièces visent f7 : <b>Dxf7 serait mat</b>. Il faut réagir tout de suite.`,
            `<b>…g6 !</b> Le pion chasse la dame et coupe la diagonale h5-f7. C'est le seul moment où …g6 est bon : le fou f8 va s'installer en g7 derrière.`,
            `La dame se recase et remet la pression sur f7.`,
            `<b>…Cf6 !</b> Le cavalier <b>bloque la colonne f</b> : la dame ne peut plus atteindre f7, la partie est finie pour son attaque. Retiens ce coup, il neutralise aussi le mat du berger.`,
            `Les Blancs doivent enfin développer - avec deux temps de retard.`,
            `Tu roques bientôt, tu as deux cavaliers, un fou en fianchetto et le centre. La dame blanche a joué trois fois pour rien : <b>tu es déjà mieux</b>.`
          ]
        },
        {
          name: 'Il insiste avec 5.Db3', eco: 'C20',
          sans: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6', 'Qf3', 'Nf6', 'Qb3'],
          notes: [
            '', '', '', '', '', '', '', '',
            `La dame reste sur la diagonale de f7 depuis b3. Ne panique pas : <b>Cd4 !</b> attaque la dame ET c2, et f7 est déjà couvert par le cavalier f6. Le contre-jeu est à toi.`
          ]
        }
      ],
      punish: [
        {
          label: '2.Dh5 — le premier coup à trouver',
          hint: `Le pion e5 est attaqué et f7 est dans le viseur. Joue le coup qui défend e5 <b>en développant</b> une pièce.`,
          fen: 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2',
          sol: ['Nc6']
        },
        {
          label: '3.Fc4 — Dxf7 est mat au coup suivant',
          hint: `Les deux pièces visent f7 et le roi ne pourra pas reprendre. Chasse la dame avec un pion, en coupant la diagonale.`,
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
          sol: ['g6']
        },
        {
          label: '4.Df3 — la position exacte où tu t\'es fait mater',
          hint: `Elle remet la pression sur f7. Un seul coup ferme la porte définitivement : <b>bloque la colonne f</b> avec un cavalier. (Dans ta partie du 31 juillet, 4…Cd4 a permis 5.Dxf7#.)`,
          fen: 'r1bqkbnr/pppp1p1p/2n3p1/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 1 4',
          sol: ['Nf6']
        }
      ],
      target: {
        fen: 'r1bqk2r/ppppppbp/2n2np1/8/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 0 1',
        goals: ['c6', 'f6', 'g7'],
        note: `Ta position type : <b>Cc6</b>, <b>Cf6</b>, <b>Fg7</b>. Trois pièces sorties, f7 verrouillé par le cavalier, et la dame blanche toujours sans travail. Tu roques et tu joues …d6 puis …Cd4 ou …d5.`
      },
      keep: [
        `Contre 2.Dh5, on défend e5 <b>en développant</b> : 2…Cc6, jamais 2…Dd6 ni 2…Cf6 (qui perd e5 avec échec).`,
        `<b>…g6 seulement quand le fou est en c4</b> - avant, on affaiblit f7 pour rien ; après, on gagne un temps sur la dame.`,
        `<b>…Cf6 bloque la colonne f</b> : ce seul coup tue le mat du berger et toutes ses variantes.`
      ],
      quiz: [
        {
          q: `4.Df3 remet la pression sur f7. Joue le coup qui ferme la porte.`,
          fen: 'r1bqkbnr/pppp1p1p/2n3p1/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 1 4',
          sol: ['Nf6'],
          explain: `Le cavalier en f6 bloque la colonne f : la dame ne peut plus aller en f7.`
        },
        {
          q: `Pourquoi 2…Cf6 est-il un mauvais deuxième coup ?`,
          opts: [`Parce qu'il abandonne e5 : 3.Dxe5+ gagne un pion avec échec`, `Parce qu'il est illégal`, `Parce qu'il enferme le fou f8`, `Parce que le cavalier sera chassé par e5`],
          answer: 0,
          explain: `Le cavalier f6 est utile plus tard (il bloque la colonne f), mais au 2ᵉ coup il faut d'abord défendre e5 : 2…Cc6.`
        },
        {
          q: `Après 2…Cc6, quelle case la dame et le fou blancs visent-ils ensemble ?`,
          opts: ['f7', 'e5', 'h7', 'd5'], answer: 0,
          explain: `f7 n'est défendue que par le roi, et le roi ne peut pas prendre une dame protégée par le fou c4 : c'est un mat.`
        }
      ]
    },

    // ──────────────────── Ouverture de l'Évêque (2.Fc4) ────────────────────
    // 8 parties cote Noirs, 38 % des points, et rien dans le catalogue.
    'e4 e5 Bc4': {
      side: 'b',
      intro: `Les Blancs sortent le fou en <b>c4</b> avant le cavalier : l'Ouverture de l'Évêque. Il n'y a rien de terrible là-dedans, mais deux choses changent par rapport à l'Italienne : le pion e4 n'est <b>pas encore défendu</b> par un cavalier, et la dame blanche garde la case <b>f3</b> ou <b>h5</b> libre pour tenter un mat du berger. D'où la réponse la plus simple et la plus solide : <b>2…Cf6</b>, qui attaque e4 et bloque d'avance la colonne f.`,
      lines: [
        {
          name: '2…Cf6, la réponse universelle', eco: 'C23',
          sans: ['e4', 'e5', 'Bc4', 'Nf6', 'd3', 'c6', 'Nf3', 'd5'],
          notes: [
            '', '',
            `<b>Le fou avant le cavalier.</b> e4 n'est défendu par rien.`,
            `<b>…Cf6 !</b> On attaque e4 tout de suite, et le cavalier bloque la colonne f : plus aucun mat du berger possible.`,
            `Les Blancs doivent défendre e4. d3 est le coup naturel (Cc3 est l'autre).`,
            `On prépare …d5 : quand le centre s'ouvrira, le fou c4 sera la pièce chassée, pas la nôtre.`,
            `Développement normal.`,
            `<b>…d5 !</b> Le pion frappe le fou et le centre. Après l'échange tu as un centre libre et un développement facile : l'ouverture est réussie.`
          ]
        },
        {
          name: '2…Cc6 : retour à l\'Italienne', eco: 'C50',
          sans: ['e4', 'e5', 'Bc4', 'Nc6', 'Nf3', 'Nf6'],
          notes: [
            '', '', '',
            `Jouable aussi - mais <b>attention</b> : tant que ton cavalier n'est pas en f6, la dame blanche peut venir en h5 avec une menace de mat (voir le piège).`,
            `Si les Blancs sortent enfin le cavalier, on est revenu dans une Italienne classique.`,
            `Position des Deux Cavaliers : tu connais la suite par le cours de l'Italienne.`
          ]
        }
      ],
      punish: [
        {
          label: '3.Dh5 (après 2…Cc6) — Dxf7 est MAT',
          hint: `La dame et le fou visent f7, le roi ne peut pas prendre : c'est mat au coup suivant. Chasse la dame avec un pion.`,
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
          sol: ['g6']
        },
        {
          label: '3.Df3 (après 2…Cf6) — sans objet',
          hint: `Ici, rien à faire : ton cavalier en f6 <b>bloque déjà la colonne f</b>, la dame ne peut pas atteindre f7. Développe tranquillement - par exemple …Cc6 en attaquant encore le centre.`,
          fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
          sol: ['Nc6']
        }
      ],
      target: {
        fen: 'rnbqkb1r/pp3ppp/2p2n2/3pp3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5',
        goals: ['d5', 'c6', 'f6'],
        note: `Ta position type : <b>…Cf6</b>, <b>…c6</b>, <b>…d5</b>. Le pion d5 frappe le fou c4 et le centre en même temps ; à toi le grand centre, à lui le fou à recaser.`
      },
      keep: [
        `Contre 2.Fc4, réponds <b>2…Cf6</b> : ça attaque e4 (non défendu) et ça bloque la colonne f.`,
        `Si tu joues 2…Cc6, la dame en h5 <b>menace un mat</b> - la parade est …g6, à jouer immédiatement.`,
        `Le plan est toujours le même : <b>…c6 puis …d5</b>, pour chasser le fou et prendre le centre.`
      ],
      quiz: [
        {
          q: `Les Blancs viennent de jouer 3.Dh5 et menacent Dxf7 mat. Joue la parade.`,
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
          sol: ['g6'],
          explain: `…g6 chasse la dame et coupe la diagonale h5-f7. Le fou ira en g7 derrière le pion.`
        },
        {
          q: `Qu'est-ce que 2.Fc4 a de différent de l'Italienne (2.Cf3 puis 3.Fc4) ?`,
          opts: [`e4 n'est pas encore défendu, donc …Cf6 l'attaque avec un temps`, `Le fou est plus fort en c4`, `Les Blancs ne peuvent plus roquer`, `Le centre est fermé`],
          answer: 0,
          explain: `C'est tout l'intérêt de 2…Cf6 : les Blancs doivent s'occuper de e4 au lieu d'attaquer.`
        }
      ]
    },

    // ─────────── Défense Française, du côté des BLANCS (7 parties, 43 %) ───────────
    'e4 e6 d4 d5': {
      side: 'w',
      intro: `Contre la Française, tu as les Blancs et un vrai avantage d'espace - à condition de choisir ton système et de t'y tenir. Trois routes : <b>3.Cc3</b> (la principale, la plus riche), <b>3.e5</b> (l'avance : tu fermes le centre et tu joues à l'aile roi) et <b>3.exd5</b> (l'échange : simple, un peu terne). Le fait à retenir : le fou c8 des Noirs est <b>enfermé derrière …e6</b>. Toute ta stratégie consiste à garder le centre fermé assez longtemps pour que ce fou reste mauvais.`,
      lines: [
        {
          name: '3.Cc3, la principale', eco: 'C10',
          sans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5', 'Nfd7', 'f4'],
          notes: [
            `Ton coup.`,
            `La Française : les Noirs préparent …d5.`,
            `Tu prends le grand centre.`,
            `Le coup annoncé. Le centre est tendu.`,
            `<b>3.Cc3</b> défend e4 en développant : c'est le coup le plus naturel et le plus fort.`,
            `Les Noirs attaquent e4 une deuxième fois.`,
            `<b>4.e5 !</b> Tu pousses au lieu de défendre : le cavalier f6 est chassé et le centre se ferme à ton avantage d'espace.`,
            `Le cavalier recule en d7 (il retournera en f8 ou c5).`,
            `<b>5.f4</b> soutient e5 et prépare l'attaque à l'aile roi. C'est le plan complet : pions e5+f4, Cf3, Fd3, roque, puis f5 ou Dh5.`
          ]
        },
        {
          name: '3.e5, l\'avance', eco: 'C02',
          sans: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3'],
          notes: [
            '', '', '', '',
            `<b>3.e5</b> ferme le centre tout de suite. Peu de théorie, un plan clair : tu as l'espace, il a le fou enfermé.`,
            `La contre-attaque obligatoire des Noirs : ils frappent la base de ta chaîne, d4.`,
            `<b>4.c3</b> soutient d4. La règle de la chaîne de pions : on défend la <b>base</b>, on n'échange pas.`,
            `Ils ajoutent un attaquant sur d4.`,
            `Tu développes en défendant d4 une troisième fois. Ensuite Fe2/Fd3, roque, puis un jeu à l'aile roi pendant qu'il s'agite à l'aile dame.`
          ]
        },
        {
          name: '3.exd5, l\'échange', eco: 'C01',
          sans: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5', 'Nf3', 'Nf6', 'Bd3'],
          notes: [
            '', '', '', '',
            `<b>3.exd5</b> : la solution simple. Tu renonces à l'avantage d'espace mais il n'y a rien à retenir et son fou c8 se libère.`,
            `Reprise forcée.`,
            `Développement naturel, structure symétrique.`,
            `Idem.`,
            `Fd3 face au fou d6 : la position est égale et propre. Un bon choix les jours où tu ne veux pas de théorie.`
          ]
        }
      ],
      punish: [
        {
          label: '3…Fb4 (Winawer) après 3.Cc3',
          hint: `Le fou cloue ton cavalier c3. Ne le défends pas : <b>pousse e5</b>. Tu gagnes de l'espace et le fou devra prendre en c3 (ce qui te donne la paire de fous) ou reculer.`,
          fen: 'rnbqk2r/ppp2ppp/4p3/3p4/1b1PP3/2N5/PPP2PPP/R1BQKBNR w KQkq - 2 4',
          sol: ['e5']
        },
        {
          label: '3…dxe4 (Rubinstein) après 3.Cc3',
          hint: `Il te rend le centre sans rien demander. Reprends avec la pièce, pas avec un pion : tu gardes un centre de pions intact et un développement d'avance.`,
          fen: 'rnbqkbnr/ppp2ppp/4p3/8/3Pp3/2N5/PPP2PPP/R1BQKBNR w KQkq - 0 4',
          sol: ['Nxe4']
        },
        {
          label: '3…c5 tout de suite après 3.e5',
          hint: `C'est le coup normal, et la réponse est un réflexe à avoir : <b>soutiens la base de ta chaîne</b> par c3. Ne prends pas en c5, tu lui rendrais le centre.`,
          fen: 'rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4',
          sol: ['c3']
        }
      ],
      target: {
        fen: 'r1bqkb1r/pp1n1ppp/2n1p3/2ppP3/3P1P2/2P2N2/PP4PP/RNBQKB1R b KQkq - 0 7',
        goals: ['e5', 'f4', 'd4', 'c3'],
        note: `La position type de l'avance : ta chaîne <b>c3-d4-e5</b> soutenue par <b>f4</b>. Tant qu'elle tient, son fou c8 ne joue pas. Tu attaques à l'aile roi (f5, Dh5, Ce5) pendant qu'il pousse à l'aile dame.`
      },
      keep: [
        `Son fou c8 est <b>enfermé derrière …e6</b> : garde le centre fermé et il ne jouera jamais.`,
        `Dans une chaîne de pions, on défend la <b>base</b> (c3 pour d4), on ne l'échange pas.`,
        `Choisis UN système et tiens-t'y : <b>3.Cc3</b> si tu veux jouer, <b>3.e5</b> si tu veux un plan simple, <b>3.exd5</b> les jours sans.`
      ],
      quiz: [
        {
          q: `Après 3.e5 c5, quel coup soutient la base de ta chaîne de pions ?`,
          opts: ['4.c3', '4.dxc5', '4.f4', '4.Cf3'], answer: 0,
          explain: `On défend la base (d4) par c3. Prendre en c5 rend le centre et libère son fou.`
        },
        {
          q: `Pourquoi la Française laisse-t-elle un problème durable aux Noirs ?`,
          opts: [`Le fou c8 est enfermé derrière le pion e6`, `Le roi noir ne peut pas roquer`, `Les Noirs perdent un pion`, `La dame noire est mal placée`],
          answer: 0,
          explain: `C'est LE thème de l'ouverture : tout le jeu noir consiste à libérer ce fou (…b6/…Fb7, ou …f6 pour ouvrir le centre).`
        }
      ]
    }

  };


  // ─────────────────── Compléments sept. 2026 ───────────────────
  // Trois choses manquaient à chaque cours existant :
  //  - la POSITION À ATTEINDRE (le plan était raconté en prose alors que
  //    l'échiquier du cours restait figé sur la fin de la ligne) ;
  //  - les TROIS PHRASES à retenir (un cours = 12 notes de coups, 3 pièges et
  //    3 questions, et rien ne disait ce qu'il faut en garder) ;
  //  - les exercices « S'IL SORT DU LIVRE » : à son niveau, 124 parties sur 150
  //    quittent le catalogue avant le coup 3, donc c'est le cas le plus
  //    fréquent, et il vivait en prose repliée en bas de page.
  // Posés en surcouche pour ne pas reformater les entrées d'origine.
  // Chaque FEN et chaque solution est vérifiée par tools/verify_openings.cjs.
  //
  // ⚠ Piège chess.js : en mode `sloppy`, « bxc6 » est lu comme un coup de FOU.
  // Éviter les prises de pion de la colonne b dans les lignes et les solutions.
  const EXTRA = {

    'e4 e5 Nf3 Nc6 Bc4': {
      target: {
        fen: 'r1bq1rk1/bpp2ppp/p2p1nn1/4p3/4P3/1BPP1N1P/PP3PP1/R1BQRNK1 b - - 2 11',
        goals: ['b3', 'e1', 'f1', 'h3'],
        note: `La position type de l'Italienne lente : <b>Fb3</b> (le fou sort de la ligne de mire de …Ca5), <b>Te1</b>, <b>h3</b> et le cavalier en route par <b>d2-f1-g3</b>. Tant que ces quatre pièces ne sont pas placées, on n'attaque pas.`
      },
      keep: [
        `Le fou en c4 vise <b>f7</b>, la case que seul le roi défend : c'est toute l'idée de l'ouverture.`,
        `On roque <b>avant</b> de pousser au centre. c3 + d4, ou d3 et la manœuvre Cbd2-f1-g3.`,
        `Ne sors pas la dame tôt et ne pousse pas les pions du roque : la moindre imprécision se paie tactiquement.`
      ],
      punish: [
        {
          label: '3…Cd4 — le saut au centre',
          hint: `Le cavalier s'installe au centre en attaquant ton cavalier f3. Ne recule pas et ne t'affole pas : <b>prends-le simplement</b>. Après la reprise du pion, tu joues c3 et tu chasses tout.`,
          fen: 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
          sol: ['Nxd4']
        },
        {
          label: '3…Ch6 — le cavalier au bord',
          hint: `Un cavalier en h6 ne défend rien et ne contrôle pas le centre. La punition n'est pas une tactique, c'est un coup de principe : <b>ouvre le centre</b> pendant qu'il est mal développé.`,
          fen: 'r1bqkb1r/pppp1ppp/2n4n/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
          sol: ['d4']
        }
      ]
    },

    'e4 e5 Nf3 Nc6 Bc4 Bc5 d3': {
      target: {
        fen: 'r1bq1rk1/bpp2ppp/p2p1nn1/4p3/4P3/1BPP1N1P/PP3PP1/R1BQRNK1 b - - 2 11',
        goals: ['b3', 'e1', 'f1', 'h3'],
        note: `Le Pianissimo au complet : <b>Fb3</b>, <b>Te1</b>, <b>h3</b>, cavalier <b>d2-f1-g3</b>. C'est un jeu de manœuvre : la partie commence quand le dernier de ces coups est joué.`
      },
      keep: [
        `d3 soutient e4 <b>sans ouvrir le centre</b> : on cherche une position saine, pas un avantage immédiat.`,
        `Le plan est un ordre de placement : <b>c3, Cbd2-f1-g3, Fb3, Te1, h3</b>. Ensuite seulement d4 ou l'attaque à l'aile roi.`,
        `La position récompense la patience : celui qui casse trop tôt donne l'initiative à l'autre.`
      ]
    },

    'e4 e5 Nf3 Nc6 Bb5': {
      target: {
        fen: 'r1bq1rk1/4bppp/p2p1n2/npp1p3/3PP3/2P2N1P/PPB2PP1/RNBQR1K1 b - d3 0 11',
        goals: ['c2', 'd4', 'e1', 'h3'],
        note: `La tabiya de l'Espagnole fermée : <b>Fc2</b>, <b>Te1</b>, <b>h3</b>, puis <b>d4</b>. Le fou revenu en c2 et le centre d4+e4 : c'est la position que toute la théorie cherche à atteindre.`
      },
      keep: [
        `Fb5 attaque le <b>défenseur</b> de e5, pas e5 : la pression est durable, rien n'est forcé.`,
        `4.Fxc6 ne gagne pas le pion : après …dxc6 5.Cxe5 Dd4 ! les Noirs reprennent tout.`,
        `Ton plan blanc tient en quatre coups : <b>c3, Te1, h3, d4</b>, et le fou se replie en c2.`
      ],
      punish: [
        {
          label: '3…Cd4 — la défense Bird',
          hint: `Le cavalier saute au centre en attaquant ton cavalier f3 et en dégageant la pression sur c6. <b>Prends-le</b> : après la reprise du pion, ton fou b5 n'a plus de cible mais tu as le centre et un temps d'avance.`,
          fen: 'r1bqkbnr/pppp1ppp/8/1B2p3/3nP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
          sol: ['Nxd4']
        }
      ]
    },

    'e4 e5 Nf3 Nc6 d4 exd4 Nxd4': {
      target: {
        fen: 'r1bqr1k1/ppp2ppp/2pb1n2/8/4P3/2NB4/PPP2PPP/R1BQ1RK1 w - - 6 9',
        goals: ['d3', 'c3', 'e4'],
        note: `Après l'échange des cavaliers : ton pion <b>e4</b> tient le centre, le <b>Fd3</b> et le <b>Cc3</b> sont sortis, tu es roqué. Position saine et sans théorie, exactement ce qu'on cherchait en jouant 3.d4.`
      },
      keep: [
        `Ouvrir le centre au 3ᵉ coup te donne un jeu clair, <b>sans la théorie de l'Espagnole</b>.`,
        `Après 3…exd4 4.Cxd4, ne t'attarde pas : <b>développe et roque</b>, le centre ouvert punit les retards.`,
        `Le cavalier d4 est bien placé mais ne l'y laisse pas s'échanger contre rien : Fd3, Cc3, roque, puis le milieu de jeu.`
      ],
      punish: [
        {
          label: '3…Df6 — il défend e5 avec la dame',
          hint: `La dame en f6 défend le pion mais <b>bloque son propre cavalier g8</b>. Pousse : le pion attaque son cavalier c6 et gagne l'espace pendant qu'il est mal développé.`,
          fen: 'r1b1kbnr/pppp1ppp/2n2q2/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 1 4',
          sol: ['d5']
        }
      ]
    },

    'e4 e5 f4': {
      target: {
        fen: 'rnbqk2r/ppp1bppp/8/3n4/2BP1p2/5N2/PPP3PP/RNBQ1RK1 b kq d3 0 7',
        goals: ['c4', 'd4', 'f1'],
        note: `Ce que le gambit achète : le <b>Fc4</b> braqué sur f7, le centre <b>d4</b>, la <b>colonne f</b> ouverte pour la tour. Un pion contre trois atouts - à condition d'attaquer tout de suite.`
      },
      keep: [
        `Tu donnes un pion pour <b>la colonne f, le centre et le temps</b> : si tu ne les utilises pas, tu es juste en moins.`,
        `Roque tôt (la tour vient sur f1 gratuitement) et braque le fou sur <b>f7</b>.`,
        `Contre une défense solide, accepte de rendre le pion : garde l'initiative, pas le matériel.`
      ]
    },

    'e4 e5 Nf3 Nf6': {
      target: {
        fen: 'rnbq1rk1/ppp1bppp/8/3p4/2PPn3/3B1N2/PP3PPP/RNBQ1RK1 b - c3 0 8',
        goals: ['c4', 'd4', 'd3'],
        note: `La position type de la Petrov : structure symétrique, cavalier noir avancé en e4, et ta poussée <b>c4</b> qui attaque le soutien d5. C'est là que la partie commence vraiment.`
      },
      keep: [
        `…Cf6 <b>contre-attaque e4</b> au lieu de défendre e5 : c'est une défense de sang-froid qui vise l'égalité propre.`,
        `Après 3.Cxe5, ne reprends <b>jamais</b> tout de suite en e4 : joue d'abord <b>…d6</b> pour chasser le cavalier.`,
        `La symétrie ne veut pas dire la nulle : celui qui place son cavalier et sa poussée c4/…c5 le premier prend l'initiative.`
      ],
      punish: [
        {
          label: '3…Cxe4 — la gaffe classique de la Petrov',
          hint: `Il reprend le pion tout de suite, sans avoir chassé ton cavalier. Il y a un coup qui gagne une pièce : <b>cherche la colonne e</b>, ton cavalier e5 et son roi e8 sont sur la même ligne.`,
          fen: 'rnbqkb1r/pppp1ppp/8/4N3/4n3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 4',
          sol: ['Qe2']
        }
      ]
    },

    'e4 e5 Nc3': {
      target: {
        fen: 'rnbq1rk1/ppp1bppp/8/3pP3/3Pn3/2NB1N2/PPP3PP/R1BQK2R b KQ - 2 7',
        goals: ['e5', 'd4', 'd3'],
        note: `La Viennoise du gambit : pions <b>d4+e5</b>, <b>Fd3</b> braqué sur h7, cavaliers sortis. Tu as l'espace et l'attaque à l'aile roi ; son cavalier e4 est joli mais seul.`
      },
      keep: [
        `2.Cc3 est le Gambit du Roi <b>bien élevé</b> : on développe et on surprotège e4 AVANT de jouer f4.`,
        `Trois familles à choisir une fois pour toutes : <b>3.f4</b> (tranchant), <b>3.Fc4</b> (à l'italienne), <b>3.g3</b> (positionnel).`,
        `Le fou en d3 et le pion e5 : le schéma d'attaque vise <b>h7</b>, comme au Système de Londres.`
      ]
    },

    'e4 d5 exd5 Qxd5': {
      target: {
        fen: 'rn2k2r/pp3ppp/2p1pn2/q4b2/1bBP4/2N2N2/PPPBQPPP/2KR3R b kq - 3 9',
        goals: ['c4', 'd4', 'd2'],
        note: `La position type côté Blancs : <b>d4</b>, <b>Fc4</b>, <b>Fd2</b> et le grand roque. La dame noire en a5 a l'air active mais c'est elle qui devra bouger encore.`
      },
      keep: [
        `La dame noire sort tôt : chaque coup qui l'<b>attaque en développant</b> (Cc3, d4, Fd2) est un temps gagné.`,
        `Ne cours pas après la dame avec des coups qui affaiblissent : Cc3 puis d4, et c'est tout.`,
        `Sa structure reste saine - ne compte pas sur un gain rapide, compte sur ton <b>avance de développement</b>.`
      ],
      punish: [
        {
          label: 'Après 2…Dxd5, le coup qui gagne un temps',
          hint: `La dame noire est au centre. Développe une pièce <b>en l'attaquant</b> : c'est le coup qui donne aux Blancs leur avance dans toute la Scandinave.`,
          fen: 'rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3',
          sol: ['Nc3']
        }
      ]
    },

    'd4 d5 Bf4': {
      target: {
        fen: 'r2q1rk1/pb3ppp/1pnbpn2/2ppN3/3P4/2PBP1B1/PP1N1PPP/R2Q1RK1 b - - 3 10',
        goals: ['e5', 'd3', 'g3'],
        note: `Le Londres au complet : <b>Ce5</b> au centre, <b>Fd3</b> braqué sur h7, <b>Fg3</b> hors de la chaîne de pions. Les trois pièces de l'attaque sont en place ; la dame vient ensuite en c1-h6.`
      },
      keep: [
        `Ff4 se joue <b>avant</b> e3, sinon le fou reste enfermé derrière ses propres pions.`,
        `Le schéma est toujours le même : <b>Ff4, e3, Fd3, c3, Cf3, Cbd2, roque</b> - quoi que fasse l'adversaire.`,
        `L'attaque type vise <b>h7</b> : Ce5, Fd3, Dc1-h6, avec le sacrifice grec Fxh7+ en embuscade.`
      ],
      punish: [
        {
          label: '2…Ff5 — il copie ton fou',
          hint: `Il sort son fou hors de la chaîne, comme toi. Ne l'échange pas tout de suite : joue le coup qui prépare <b>Fd3</b> pour lui proposer l'échange à TES conditions (tu ouvriras la colonne pour ta dame).`,
          fen: 'rn1qkbnr/ppp1pppp/8/3p1b2/3P1B2/8/PPP1PPPP/RN1QKBNR w KQkq - 2 3',
          sol: ['e3']
        }
      ]
    }

  };
  Object.keys(EXTRA).forEach(k => { if (COURSES[k]) Object.assign(COURSES[k], EXTRA[k]); });

  // Un même cours peut être atteint par deux ordres de coups : le Londres se
  // joue 2.Ff4 (accéléré) ou 2.Cf3 Cf6 3.Ff4 (classique), et une partie jouée
  // dans le second ordre ne commence PAS par la clé `d4 d5 Bf4` — match() ne
  // retrouvait donc pas le cours. L'alias fait pointer l'autre clé sur le MÊME
  // objet ; le vérificateur les saute (déjà contrôlées sous la clé canonique).
  const ALIASES = {
    'd4 d5 Nf3 Nf6 Bf4': 'd4 d5 Bf4',
    'd4 Nf6 Bf4': 'd4 d5 Bf4',
    'd4 Nf6 Nf3 d5 Bf4': 'd4 d5 Bf4'
  };
  Object.keys(ALIASES).forEach(k => { if (!COURSES[k] && COURSES[ALIASES[k]]) COURSES[k] = COURSES[ALIASES[k]]; });

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

  // ─────────────────── L'arbre des variantes, dérivé ───────────────────
  // Les six onglets (Présentation / Lignes / Plans / Pièges / Transpositions /
  // Quiz) découpaient la matière par TYPE de contenu. Résultat : l'embranchement
  // disparaissait (« Lignes » donnait les branches à plat, « Transpositions »
  // redonnait LES MÊMES en prose), et les pièges flottaient loin du coup qui les
  // déclenche.
  //
  // On dérive l'arbre des `lines[].sans` par un trie : là où deux lignes
  // divergent, il y a une fourche. Les suites forcées (un seul enfant) sont
  // repliées en un seul noeud, sinon un cours ferait 25 à 35 entrées.
  // Rien à ressaisir : la structure était déjà dans les données.
  function buildBranches(course) {
    const lines = (course && course.lines) || [];
    if (!lines.length) return [];

    const root = { san: null, ply: 0, kids: [], lines: [] };
    lines.forEach((L, li) => {
      let cur = root;
      (L.sans || []).forEach((san, i) => {
        let k = cur.kids.find(x => x.san === san);
        if (!k) { k = { san, ply: i + 1, kids: [], lines: [] }; cur.kids.push(k); }
        if (k.lines.indexOf(li) < 0) k.lines.push(li);
        cur = k;
      });
    });

    // Note d'un demi-coup : la première non vide parmi les lignes qui y passent
    // (une même position peut être commentée dans une ligne et pas dans l'autre).
    const noteAt = (lineIdxs, ply) => {
      for (const li of lineIdxs) {
        const n = lines[li].notes && lines[li].notes[ply - 1];
        if (n) return n;
      }
      return '';
    };

    const out = [];
    (function emit(node, depth) {
      const chain = [];
      let n = node;
      if (n.san) chain.push(n);
      while (n.kids.length === 1) { n = n.kids[0]; chain.push(n); }
      const li = n.lines;
      out.push({
        depth,
        // Chemin complet depuis le coup 1, pour poser la position.
        sans: lines[li[0]].sans.slice(0, n.ply),
        plyStart: chain.length ? chain[0].ply : 1,
        plyEnd: n.ply,
        lines: li.slice(),
        // Un nom propre seulement si le noeud appartient à UNE seule ligne :
        // « 3…Fc5 » est partagé par le Giuoco Piano et l'Evans, le nommer
        // d'après l'un des deux serait faux.
        name: li.length === 1 ? lines[li[0]].name : '',
        eco: li.length === 1 ? lines[li[0]].eco : '',
        notes: chain.map(c => noteAt(li, c.ply)),
        // Notes de TOUT le chemin, pour que l'échiquier les affiche coup par
        // coup pendant le pas-à-pas (loadLine les indexe par ply - 1).
        allNotes: lines[li[0]].sans.slice(0, n.ply).map((_, k) => noteAt(li, k + 1)),
        leaf: n.kids.length === 0
      });
      n.kids.forEach(k => emit(k, depth + 1));
    })(root, 0);

    return out;
  }

  // Répartit pièges et questions sur les noeuds de l'arbre. `at` est un index de
  // ligne ; sans `at`, l'élément vaut pour toute l'ouverture et reste sur la
  // tabiya.
  //
  // La décision est GLOBALE, pas noeud par noeud : une ligne traverse plusieurs
  // noeuds (« 3…a6 » puis « 4.Fa4 → 8…O-O » appartiennent tous deux à la ligne 0),
  // et filtrer localement ferait apparaître le même piège deux fois. On prend
  // donc, pour chaque élément, le noeud le PLUS PROFOND qui porte sa ligne :
  // c'est là que le piège se produit vraiment.
  //
  // Rend un tableau parallèle à `branches` : items[i] = ce qui revient au noeud i.
  function spread(items, branches) {
    const out = branches.map(() => []);
    for (const it of items || []) {
      if (typeof it.at !== 'number') { if (out.length) out[0].push(it); continue; }
      let best = -1;
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        if (b.lines.indexOf(it.at) < 0) continue;
        if (best < 0 || b.depth > branches[best].depth) best = i;
      }
      out[best < 0 ? 0 : best].push(it);
    }
    return out;
  }

  return { get, has, match, COURSES, ALIASES, buildBranches, spread };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Courses;
