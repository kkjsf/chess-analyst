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

    // Italian variations
    ['e4 e5 Nf3 Nc6 Bc4 Bc5 c3', 'C54', 'Giuoco Piano — variante classique'],
    ['e4 e5 Nf3 Nc6 Bc4 Bc5 b4', 'C51', 'Gambit Evans'],
    ['e4 e5 Nf3 Nc6 Bc4 Nf6 d4', 'C55', 'Deux Cavaliers — attaque Max Lange'],
    ['e4 e5 Nf3 Nc6 Bc4 Bc5 d3', 'C50', 'Giuoco Pianissimo'],

    // Ruy Lopez extended
    ['e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3', 'C92', 'Ruy Lopez — variante Zaitsev'],
    ['e4 e5 Nf3 Nc6 Bb5 Nf6', 'C65', 'Ruy Lopez — défense de Berlin'],
    ['e4 e5 Nf3 Nc6 Bb5 f5', 'C63', 'Ruy Lopez — gambit Schliemann'],
    ['e4 e5 Nf3 Nc6 Bb5 d6', 'C62', 'Ruy Lopez — défense Steinitz'],

    // Scotch variations
    ['e4 e5 Nf3 Nc6 d4 exd4 Bc4', 'C44', 'Gambit Écossais — variante Göring'],
    ['e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5', 'C45', 'Écossaise — variante classique'],
    ['e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6', 'C45', 'Écossaise — variante Schmidt'],

    // Petrov extended
    ['e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4', 'C42', 'Petrov — variante classique'],
    ['e4 e5 Nf3 Nf6 d4', 'C43', 'Petrov — variante Steinitz'],

    // King's Gambit
    ['e4 e5 f4 exf4', 'C33', 'Gambit du Roi accepté'],
    ['e4 e5 f4 Bc5', 'C30', 'Gambit du Roi décliné'],
    ['e4 e5 f4 exf4 Nf3', 'C34', 'Gambit du Roi — variante cavalier'],

    // Vienna
    ['e4 e5 Nc3 Nf6', 'C26', 'Viennoise — variante Falkbeer'],
    ['e4 e5 Nc3 Nc6 Bc4', 'C25', 'Viennoise — gambit Hamppe-Allgaier'],

    // Sicilian extended
    ['e4 c5 Nf3 d6 Bb5+', 'B51', 'Sicilienne — variante Moscou'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3', 'B90', 'Sicilienne Najdorf — variante Anglaise'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5', 'B95', 'Sicilienne Najdorf 6.Fg5'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3', 'B76', 'Dragon — variante Yougoslave'],
    ['e4 c5 Nf3 Nc6 Bb5', 'B30', 'Sicilienne — variante Rossolimo'],
    ['e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6', 'B45', 'Sicilienne Kan'],
    ['e4 c5 f4', 'B21', 'Sicilienne — Grand Prix'],
    ['e4 c5 d3', 'B20', 'Sicilienne — variante Keres'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', 'B56', 'Sicilienne classique'],

    // French extended
    ['e4 e6 d4 d5 Nc3 Bb4 e5', 'C16', 'Française Winawer — variante d\'avance'],
    ['e4 e6 d4 d5 Nc3 Nf6 Bg5', 'C13', 'Française — variante Burn'],
    ['e4 e6 d4 d5 Nc3 dxe4 Nxe4', 'C10', 'Française — variante Rubinstein'],

    // Caro-Kann extended
    ['e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', 'B18', 'Caro-Kann — variante classique'],
    ['e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7', 'B17', 'Caro-Kann — variante Steinitz'],
    ['e4 c6 d4 d5 f3', 'B12', 'Caro-Kann — variante Fantasy'],
    ['e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Nxf6+ exf6', 'B15', 'Caro-Kann — variante Forgacs'],

    // QGD variations
    ['d4 d5 c4 e6 Nc3 Nf6 Bg5', 'D50', 'Gambit Dame refusé — variante classique'],
    ['d4 d5 c4 e6 Nc3 Nf6 Nf3 Be7 Bf4', 'D37', 'GDR — variante 5.Ff4'],
    ['d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5', 'D35', 'GDR — variante d\'échange'],

    // Slav variations
    ['d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4', 'D31', 'Slave — variante semi-Slave'],
    ['d4 d5 c4 c6 Nf3 Nf6 e3', 'D12', 'Slave — système lent'],

    // London extended
    ['d4 d5 Bf4 Nf6 e3 c5', 'D00', 'Londres — variante avec ...c5'],
    ['d4 Nf6 Bf4 d5 e3 e6 Nf3 c5', 'D00', 'Londres — variante principale'],

    // QGA variations
    ['d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4', 'D27', 'GDA — variante classique'],

    // KID extended
    ['d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2', 'E73', 'Est-Indienne — variante Averbakh'],
    ['d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3', 'E81', 'Est-Indienne — Sämisch'],
    ['d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5', 'E90', 'Est-Indienne — variante principale'],

    // Nimzo-Indian extended
    ['d4 Nf6 c4 e6 Nc3 Bb4 Qc2', 'E32', 'Nimzo-Indienne — variante classique'],
    ['d4 Nf6 c4 e6 Nc3 Bb4 e3', 'E40', 'Nimzo-Indienne — variante Rubinstein'],
    ['d4 Nf6 c4 e6 Nc3 Bb4 f3', 'E20', 'Nimzo-Indienne — variante Kmoch'],

    // Catalan extended
    ['d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O', 'E06', 'Catalane — système fermé'],
    ['d4 Nf6 c4 e6 g3 d5 Bg2 dxc4', 'E04', 'Catalane — système ouvert'],

    // Benoni / Benko
    ['d4 Nf6 c4 c5 d5 b5', 'A57', 'Gambit Benko'],
    ['d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6', 'A62', 'Benoni Moderne — variante classique'],

    // English extended
    ['c4 e5 Nc3 Nf6', 'A22', 'Anglaise — variante Carls-Bremen'],
    ['c4 e5 Nc3 Nc6 g3', 'A29', 'Anglaise — variante des Quatre Cavaliers'],
    ['c4 Nf6 Nc3 e6 e4', 'A18', 'Anglaise — variante Mikenas'],

    // Réti extended
    ['Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7', 'A07', 'Réti — variante classique'],

    // Trompowsky
    ['d4 Nf6 Bg5', 'A45', 'Attaque Trompowsky'],

    // Torre Attack
    ['d4 Nf6 Nf3 e6 Bg5', 'A46', 'Attaque Torre'],

    // Veresov
    ['d4 d5 Nc3 Nf6 Bg5', 'D01', 'Ouverture Veresov'],

    // Pirc extended
    ['e4 d6 d4 Nf6 Nc3 g6 f4', 'B09', 'Pirc — variante autrichienne'],
    ['e4 d6 d4 Nf6 Nc3 g6 Be3', 'B08', 'Pirc — système classique avec Fe3'],

    // Alekhine extended
    ['e4 Nf6 e5 Nd5 d4 d6', 'B04', 'Alekhine — variante moderne'],
    ['e4 Nf6 e5 Nd5 c4', 'B03', 'Alekhine — variante des Quatre Pions'],

    // Owen Defense
    ['e4 b6', 'B00', 'Défense Owen'],

    // Nimzowitsch Defense
    ['e4 Nc6', 'B00', 'Défense Nimzowitsch'],

    // Budapest Gambit
    ['d4 Nf6 c4 e5', 'A51', 'Gambit Budapest'],

    // Dutch extended
    ['d4 f5 c4 Nf6 g3 e6 Bg2 Be7', 'A81', 'Hollandaise — variante classique'],
    ['d4 f5 c4 Nf6 g3 g6', 'A81', 'Hollandaise — Leningrad'],
    ['d4 f5 e4', 'A82', 'Hollandaise — gambit Staunton'],

    // Grünfeld extended
    ['d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4', 'D85', 'Grünfeld — variante d\'échange'],
    ['d4 Nf6 c4 g6 Nc3 d5 Nf3', 'D90', 'Grünfeld — variante avec Cf3'],

    // Bird
    ['f4 d5 Nf3 Nf6 e3 g6', 'A03', 'Bird — système Leningrad inversé'],
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
      if (match) return { eco, name, moves: tokens.length, line };
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
