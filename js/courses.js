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
    }

  };

  function get(line) { return (line && COURSES[line]) || null; }
  function has(line) { return !!(line && COURSES[line]); }
  return { get, has, COURSES };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Courses;
