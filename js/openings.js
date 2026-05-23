const Openings = (() => {
  const DB = [
    // King's Pawn
    ['e4 e5 Nf3 Nc6 Bb5', 'C60', 'Partie Espagnole (Ruy Lopez)'],
    ['e4 e5 Nf3 Nc6 Bb5 a6', 'C68', 'Ruy Lopez — variante Morphy'],
    ['e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O', 'C88', 'Ruy Lopez — système fermé'],
    ['e4 e5 Nf3 Nc6 Bc4', 'C50', 'Partie Italienne'],
    ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'C50', 'Giuoco Piano'],
    ['e4 e5 Nf3 Nc6 Bc4 Nf6', 'C55', 'Partie des Deux Cavaliers'],
    ['e4 e5 Nf3 Nc6 d4', 'C44', 'Gambit Écossais'],
    ['e4 e5 Nf3 Nc6 d4 exd4 Nxd4', 'C45', 'Partie Écossaise'],
    ['e4 e5 Nf3 Nf6', 'C42', 'Défense Petrov'],
    ['e4 e5 Nf3 d6', 'C41', 'Défense Philidor'],
    ['e4 e5 d4', 'C21', 'Gambit du Centre'],
    ['e4 e5 Bc4', 'C23', 'Ouverture de l\'Évêque'],
    ['e4 e5 f4', 'C30', 'Gambit du Roi'],
    ['e4 e5 Nc3', 'C25', 'Ouverture Viennoise'],

    // Sicilian
    ['e4 c5', 'B20', 'Défense Sicilienne'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3', 'B90', 'Sicilienne Najdorf / Classique'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'B90', 'Sicilienne Najdorf'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', 'B76', 'Sicilienne Dragon'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e5', 'B57', 'Sicilienne Sveshnikov'],
    ['e4 c5 Nf3 Nc6 d4 cxd4 Nxd4', 'B44', 'Sicilienne ouverte'],
    ['e4 c5 Nf3 e6', 'B40', 'Sicilienne — variante française'],
    ['e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nf6 Nc3 d6', 'B80', 'Sicilienne Scheveningen'],
    ['e4 c5 Nc3', 'B23', 'Sicilienne fermée'],
    ['e4 c5 c3', 'B22', 'Sicilienne Alapin'],
    ['e4 c5 d4 cxd4 c3', 'B21', 'Gambit Smith-Morra'],

    // French
    ['e4 e6', 'C00', 'Défense Française'],
    ['e4 e6 d4 d5 Nc3 Nf6', 'C10', 'Française — variante classique'],
    ['e4 e6 d4 d5 Nc3 Bb4', 'C15', 'Française — variante Winawer'],
    ['e4 e6 d4 d5 Nd2', 'C01', 'Française — variante Tarrasch'],
    ['e4 e6 d4 d5 e5', 'C02', 'Française — variante d\'avance'],
    ['e4 e6 d4 d5 exd5 exd5', 'C01', 'Française — variante d\'échange'],

    // Caro-Kann
    ['e4 c6', 'B10', 'Défense Caro-Kann'],
    ['e4 c6 d4 d5 Nc3 dxe4 Nxe4', 'B15', 'Caro-Kann — variante principale'],
    ['e4 c6 d4 d5 e5', 'B12', 'Caro-Kann — variante d\'avance'],
    ['e4 c6 d4 d5 exd5 cxd5', 'B13', 'Caro-Kann — variante d\'échange'],

    // Scandinavian
    ['e4 d5', 'B01', 'Défense Scandinave'],
    ['e4 d5 exd5 Qxd5', 'B01', 'Scandinave — reprise de Dame'],
    ['e4 d5 exd5 Nf6', 'B01', 'Scandinave — variante moderne'],

    // Pirc / Modern
    ['e4 d6', 'B07', 'Défense Pirc'],
    ['e4 d6 d4 Nf6 Nc3', 'B08', 'Pirc — système classique'],
    ['e4 g6', 'B06', 'Défense Moderne'],
    ['e4 Nf6', 'B02', 'Défense Alekhine'],

    // Queen's Pawn
    ['d4 d5 c4', 'D06', 'Gambit Dame'],
    ['d4 d5 c4 e6', 'D30', 'Gambit Dame refusé'],
    ['d4 d5 c4 dxc4', 'D20', 'Gambit Dame accepté'],
    ['d4 d5 c4 c6', 'D10', 'Défense Slave'],
    ['d4 d5 c4 c6 Nf3 Nf6 Nc3 e6', 'D46', 'Semi-Slave'],
    ['d4 d5 Nf3 Nf6 c4 e6 Nc3 c5', 'D32', 'Défense Tarrasch'],
    ['d4 d5 Bf4', 'D00', 'Système de Londres'],
    ['d4 d5 Nf3 Nf6 Bf4', 'D00', 'Système de Londres'],
    ['d4 Nf6 Bf4', 'D00', 'Système de Londres'],

    // Indian Defenses
    ['d4 Nf6 c4 g6 Nc3 Bg7', 'E60', 'Défense Est-Indienne'],
    ['d4 Nf6 c4 g6 Nc3 Bg7 e4 d6', 'E70', 'Est-Indienne — variante principale'],
    ['d4 Nf6 c4 e6 Nc3 Bb4', 'E20', 'Défense Nimzo-Indienne'],
    ['d4 Nf6 c4 e6 Nf3 b6', 'E10', 'Défense Ouest-Indienne'],
    ['d4 Nf6 c4 e6 g3', 'E01', 'Catalane'],
    ['d4 Nf6 c4 c5', 'A50', 'Défense Benoni'],
    ['d4 Nf6 c4 c5 d5 e6', 'A60', 'Benoni Moderne'],
    ['d4 Nf6 c4 e6 Nf3 d5', 'D37', 'Gambit Dame refusé (Indian move order)'],

    // Grünfeld
    ['d4 Nf6 c4 g6 Nc3 d5', 'D80', 'Défense Grünfeld'],

    // English
    ['c4', 'A10', 'Ouverture Anglaise'],
    ['c4 e5', 'A20', 'Anglaise — Sicilienne inversée'],
    ['c4 Nf6', 'A15', 'Anglaise — variante Anglo-Indienne'],
    ['c4 c5', 'A30', 'Anglaise symétrique'],

    // Réti
    ['Nf3 d5 c4', 'A09', 'Ouverture Réti'],
    ['Nf3 Nf6 c4 g6', 'A05', 'Réti — système indien'],

    // Flank / Others
    ['b3', 'A01', 'Ouverture Larsen'],
    ['g3', 'A00', 'Ouverture Hongroise'],
    ['f4', 'A02', 'Ouverture Bird'],
    ['e4 e5 Nf3 Nc6 Nc3', 'C46', 'Partie des Trois Cavaliers'],
    ['e4 e5 Nf3 Nc6 Nc3 Nf6', 'C47', 'Partie des Quatre Cavaliers'],

    // Dutch
    ['d4 f5', 'A80', 'Défense Hollandaise'],

    // King's Indian Attack
    ['Nf3 d5 g3', 'A05', 'Attaque Est-Indienne'],

    // Misc
    ['d4 d5 Nf3 Nf6 e3', 'D02', 'Système Colle'],
    ['e4 e5 Qh5', 'C20', 'Attaque du Scholar (Parham)'],
    ['d4 d6', 'A41', 'Défense Old Indian'],
  ];

  DB.sort((a, b) => b[0].split(' ').length - a[0].split(' ').length);

  function detect(moves) {
    const sans = moves.map(m => typeof m === 'string' ? m : m.san);
    for (const [line, eco, name] of DB) {
      const tokens = line.split(' ');
      if (tokens.length > sans.length) continue;
      let match = true;
      for (let i = 0; i < tokens.length; i++) {
        if (sans[i] !== tokens[i]) { match = false; break; }
      }
      if (match) return { eco, name, moves: tokens.length };
    }
    if (sans.length > 0) {
      if (sans[0] === 'e4') return { eco: 'B00', name: 'Ouverture Pion Roi', moves: 1 };
      if (sans[0] === 'd4') return { eco: 'A40', name: 'Ouverture Pion Dame', moves: 1 };
      return { eco: '???', name: 'Ouverture non répertoriée', moves: 0 };
    }
    return null;
  }

  return { detect };
})();
