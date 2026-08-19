// Tactics — explorable catalog of tactical/strategic motifs + interactive
// "solve it on the board" practice. The catalog (Tactics.CATALOG) is the single
// source of truth for the "Tactiques" section of the Apprendre hub; app.js
// renders it and opens the zoom modal. Practice puzzles are launched with
// Tactics.start(puzzles, name).
//
// Puzzle format: { fen, sol: [SAN, ...], hint }
//   - sol is a forced line in ENGLISH SAN (matches chess.js).
//   - even indices (0, 2, …) = the move the learner must find;
//   - odd indices (1, 3, …) = the opponent's forced reply, played automatically.
const Tactics = (() => {
  const $ = (s) => document.querySelector(s);
  const G = '#56b886', B = '#5b8fb9', R = '#d36b6b';

  // ───────────────────────── catalog ─────────────────────────
  const CATALOG = [
    // ════════ ⚔️ Tactiques — gagner du matériel ════════
    { cat: '⚔️ Tactiques', name: 'Fourchette', en: 'Fork',
      desc: `Une seule pièce <b>attaque deux cibles à la fois</b>. Le cavalier est le roi de la fourchette : en d6 il menace simultanément le roi e8 et la dame f7. L'adversaire ne peut en sauver qu'une.`,
      fen: '4k3/5q2/3N4/8/8/8/8/4K3', arrows: [{ from: 'd6', to: 'e8', color: G }, { from: 'd6', to: 'f7', color: G }],
      puzzles: [
        { fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', sol: ['Nc7+'], demo: true, hint: `Un échec de cavalier qui attaque aussi la tour du coin.` },
        { fen: 'q6r/2p3p1/3Bkp2/3p3p/3Pn2P/P4Q2/1P3PP1/R4K1R b - - 0 22', sol: ['Nd2+', 'Ke2', 'Nxf3'], real: `Lichess · niveau 949`, game: 'https://lichess.org/1B9LhCpj', lvl: 'facile', hint: `Un échec de cavalier, qui met la dame dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
        { fen: '8/3N1p1p/2p5/4pp2/rbk5/5P2/2P1R1PP/6K1 w - - 0 31', sol: ['Nb6+', 'Kb5', 'Nxa4'], real: `Lichess · niveau 1162`, game: 'https://lichess.org/Y0EaMBdY/black', lvl: 'moyenne', hint: `Un échec de cavalier, qui met la tour dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
        { fen: 'rn2k2r/1b1p1pbp/pp2p3/1N1n4/4q3/1Q6/PP2NPPP/R3KB1R w KQkq - 0 13', sol: ['Nd6+', 'Kd8', 'Nxe4'], real: `Lichess · niveau 1203`, game: 'https://lichess.org/h5QScRIm/black', lvl: 'moyenne', hint: `Un échec de cavalier, qui met le fou et la dame dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
        { fen: '3r1rk1/pp3pp1/5q2/6Qp/3nPB2/2N5/PP3P1P/R3K2R b KQ - 1 18', sol: ['Nf3+', 'Ke2', 'Nxg5'], real: `Lichess · niveau 1404`, game: 'https://lichess.org/MgNWABW5', lvl: 'soutenue', hint: `Un échec de cavalier, qui met la dame dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
        { fen: 'rn1qkb1r/pp3ppp/2p1p3/3p1b2/3Pn2N/2NQB1PP/PPP1PP2/R3KB1R b KQkq - 1 8', sol: ['Nxf2'], mine: `contre Nhn_nh · par correspondance · 24 mai 2026`, game: 'https://www.chess.com/game/daily/974234961', hint: `Une capture au cavalier, qui met la dame et la tour dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Clouage', en: 'Pin',
      desc: `Une pièce est <b>clouée</b> quand elle ne peut pas bouger sans exposer une pièce plus précieuse derrière elle. Clouage <b>absolu</b> si la pièce protégée est le roi (bouger devient illégal), <b>relatif</b> sinon. Ici le fou b5 cloue le cavalier c6 contre le roi e8.`,
      fen: '4k3/8/2n5/1B6/8/8/8/4K3', arrows: [{ from: 'b5', to: 'e8', color: G }],
      puzzles: [
        { fen: '4k3/8/4n3/3P4/8/8/4R3/4K3 w - - 0 1', sol: ['dxe6'], hint: `Le cavalier est cloué sur le roi : il ne peut pas fuir. Prends-le.` },
        { fen: 'r1b1kb1r/pp3pp1/2q2n2/4p2p/4p2P/3B1PP1/PPP1Q3/RNB1K2R w KQkq - 0 11', sol: ['Bb5', 'Bd7', 'Bxc6'], real: `Lichess · niveau 964`, game: 'https://lichess.org/xoJJsBO5/black', lvl: 'facile', hint: `Un coup de fou, sans échec ni capture, qui met la dame dans le collimateur. Le motif : une pièce clouée ne peut pas fuir.` },
        { fen: '2r2r2/5pk1/p1p5/1p1p2qp/3P4/P3P2P/1PQ1NP2/2KR4 w - - 0 23', sol: ['Rg1', 'Qxg1+', 'Nxg1'], real: `Lichess · niveau 1145`, game: 'https://lichess.org/mVVHyTQS/black', lvl: 'moyenne', hint: `Un coup de tour, sans échec ni capture, qui met la dame dans le collimateur. Le motif : une pièce clouée ne peut pas fuir.` },
        { fen: 'r2q2k1/5pbp/p1p3p1/1p1p4/4PQn1/P2P3P/BPP2PP1/2KR3R b - - 2 20', sol: ['Bh6', 'Qxh6', 'Nxh6'], real: `Lichess · niveau 1319`, game: 'https://lichess.org/UoJJjFSs', lvl: 'moyenne', hint: `Un coup de fou, sans échec ni capture, qui met la dame dans le collimateur. Le motif : une pièce clouée ne peut pas fuir.` },
        { fen: 'r6k/ppp2p2/2np2rp/2bNp3/2B1P3/3P1NPp/PPP2P2/R4RK1 b - - 0 19', sol: ['Rxg3+', 'Kh1', 'Rxf3'], real: `Lichess · niveau 1421`, game: 'https://lichess.org/65LhWEDA', lvl: 'soutenue', hint: `Un échec de tour, qui met le cavalier dans le collimateur. Le motif : une pièce clouée ne peut pas fuir.` },
        { fen: 'r3k2r/pppqnpp1/8/4n1Bp/2B4P/2P2P2/PP3KP1/1R1QR3 w kq - 1 17', sol: ['Rxe5'], mine: `contre AeaadAl21 · rapide · 30 juillet 2026`, game: 'https://www.chess.com/game/live/172263716136', hint: `Une capture à la tour, qui met le cavalier dans le collimateur. Le motif : une pièce clouée ne peut pas fuir.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Enfilade', en: 'Skewer',
      desc: `L'inverse du clouage : on <b>attaque le roi (ou une pièce de valeur) sur une ligne</b> ; il est forcé de s'écarter, et la pièce <b>moins précieuse placée derrière lui</b> tombe. Ici la tour fait échec sur la 8ᵉ rangée — le roi s'écarte, la dame derrière est perdue.`,
      fen: 'q3k2R/8/8/8/8/8/8/4K3', arrows: [{ from: 'h8', to: 'a8', color: G }],
      puzzles: [
        { fen: 'q3k3/8/8/8/8/8/8/4K2R w - - 0 1', sol: ['Rh8+', 'Ke7', 'Rxa8'], hint: `Donne échec au roi sur la dernière rangée : il s'écarte, et la dame derrière lui ne peut plus s'échapper.` },
        { fen: '2r2k2/7R/p7/5p2/8/KPBb4/P4PPP/1r6 w - - 3 37', sol: ['Rh8+', 'Kf7', 'Rxc8'], real: `Lichess · niveau 945`, game: 'https://lichess.org/sVR2FWeE/black', lvl: 'facile', hint: `Un échec de tour, qui met la tour dans le collimateur. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
        { fen: '3r4/1p1r3p/pRp1pkp1/5p2/2PP1B1P/P3P3/4KPP1/8 w - - 1 39', sol: ['Bg5+', 'Kf7', 'Bxd8'], real: `Lichess · niveau 1198`, game: 'https://lichess.org/vcdhx0GM/black', lvl: 'moyenne', hint: `Un échec de fou, qui met la tour dans le collimateur. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
        { fen: '2k5/p2p2p1/3B4/4N2p/6nP/2PP4/r7/3K2R1 b - - 0 32', sol: ['Ra1+', 'Ke2', 'Rxg1'], real: `Lichess · niveau 1341`, game: 'https://lichess.org/M8VNU6Jq', lvl: 'moyenne', hint: `Un échec de tour, qui met la tour dans le collimateur. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
        { fen: '7r/R4pp1/1p2k3/1B2p3/1P2n1n1/2r2N1p/P4PP1/5RK1 w - - 0 32', sol: ['Bd7+', 'Kf6', 'Bxg4'], real: `Lichess · niveau 1400`, game: 'https://lichess.org/XmuyxF6c/black', lvl: 'soutenue', hint: `Un échec de fou, qui met le cavalier dans le collimateur. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
        { fen: 'r1bqk2r/ppp1p2p/2n2npb/3p1p2/3P3Q/2P1P3/PP3PPP/RNB1KBNR w KQkq - 1 7', sol: ['Qxh6'], mine: `contre kantorbarna · par correspondance · 24 mai 2026`, game: 'https://www.chess.com/game/daily/971721259', hint: `Une capture à la dame. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
        { fen: 'rnbqk1nr/pppp2pp/5p2/2b5/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5', sol: ['Qh5+'], mine: `contre Bclow30 · par correspondance · 8 août 2026`, game: 'https://www.chess.com/game/daily/1002318968', hint: `Un échec de dame, qui met le fou dans le collimateur. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attaque double', en: 'Double attack',
      desc: `Terme général : un coup crée <b>deux menaces simultanées</b> impossibles à parer en un seul temps. Ici la dame e4 attaque à la fois le cavalier b7 et le fou e7.`,
      fen: '6k1/1n2b3/8/8/4Q3/8/8/4K3', arrows: [{ from: 'e4', to: 'b7', color: G }, { from: 'e4', to: 'e7', color: G }],
      puzzles: [
        { fen: '6k1/1r6/8/8/8/8/8/3Q2K1 w - - 0 1', sol: ['Qd5+', 'Kf8', 'Qxb7'], hint: `Un échec en diagonale qui vise aussi la tour à l'autre bout.` },
        { fen: 'rnb1k2r/ppp1qNpp/1b1p3n/4p2Q/2B1P3/8/PPPP2PP/RNBK1R2 b kq - 0 8', sol: ['Bg4+', 'Qxg4', 'Nxg4'], real: `Lichess · niveau 983`, game: 'https://lichess.org/EX8Pl0ew', lvl: 'facile', hint: `Un échec de fou, qui met la dame dans le collimateur. Le motif : deux menaces d'un coup, impossible de parer les deux.` },
        { fen: '6rk/Rpb3rp/6pQ/4N3/2Pp2P1/1q1P3P/4RP2/6K1 b - - 0 30', sol: ['Qd1+', 'Kg2', 'Qxe2'], real: `Lichess · niveau 1137`, game: 'https://lichess.org/kWxG4yV0', lvl: 'moyenne', hint: `Un échec de dame, qui met la tour dans le collimateur. Le motif : deux menaces d'un coup, impossible de parer les deux.` },
        { fen: '1k3r2/pp4p1/2pp2r1/4P3/7b/1BP5/P3K2B/RN3R2 b - - 8 30', sol: ['Rg2+', 'Kd3', 'Rxf1'], real: `Lichess · niveau 1275`, game: 'https://lichess.org/W0GBLuOc', lvl: 'moyenne', hint: `Un échec de tour, qui met le fou et le pion dans le collimateur. Le motif : deux menaces d'un coup, impossible de parer les deux.` },
        { fen: '3k4/pb3Q1N/1pq1p1p1/8/2Pr4/P4P2/1P4PP/6K1 w - - 1 29', sol: ['Qf6+', 'Kc8', 'Qxd4'], real: `Lichess · niveau 1467`, game: 'https://lichess.org/E4p3SkST/black', lvl: 'soutenue', hint: `Un échec de dame, qui met la tour et le pion dans le collimateur. Le motif : deux menaces d'un coup, impossible de parer les deux.` },
        { fen: 'r2k1r2/1pp3qp/p3p3/b3N2Q/2pn4/P1N5/1P3PPP/2R2RK1 w - - 0 19', sol: ['Qh4+'], mine: `contre lyssy96 · par correspondance · 12 juillet 2026`, game: 'https://www.chess.com/game/daily/996475536', hint: `Un échec de dame, qui met le cavalier dans le collimateur. Le motif : deux menaces d'un coup, impossible de parer les deux.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attaque à la découverte', en: 'Discovered attack',
      desc: `On déplace une pièce qui <b>démasque l'attaque d'une autre</b> derrière elle. Le cavalier e5 quitte la diagonale (flèche bleue) et le fou b2 attaque alors le roi h8. Si la pièce qui s'écarte capture ou menace en partant, l'effet est double.`,
      fen: '7k/8/8/4N3/8/8/1B6/4K3', arrows: [{ from: 'b2', to: 'h8', color: G }, { from: 'e5', to: 'f7', color: B }],
      puzzles: [
        { fen: '7k/4q3/8/4N3/8/8/1B6/6K1 w - - 0 1', sol: ['Nc6+', 'Kg8', 'Nxe7+'], demo: true, hint: `En s'écartant, le cavalier ouvre l'échec du fou — et atterrit sur la dame.` },
        { fen: '1k1r4/ppp2ppp/2n5/4p3/4q3/4BN2/PPP1QPPP/2K5 w - - 3 17', sol: ['Bxa7+', 'Kxa7', 'Qxe4'], real: `Lichess · niveau 977`, game: 'https://lichess.org/8GPHFCmV/black', lvl: 'facile', hint: `Un échec de fou, qui met la dame dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
        { fen: 'r4rk1/ppp2ppp/3p4/3q4/1P3P1n/3BB1RP/P4P1K/b2Q4 w - - 0 22', sol: ['Bxh7+', 'Kxh7', 'Qxd5'], real: `Lichess · niveau 1150`, game: 'https://lichess.org/2237ZlNf/black', lvl: 'moyenne', hint: `Un échec de fou, qui met la dame dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
        { fen: '2r3k1/1b3pp1/1p2pn1p/1B2N3/Pq2p3/2b3QP/4R1PB/2R3K1 b - - 2 29', sol: ['Bd4+', 'Kf1', 'Rxc1+'], real: `Lichess · niveau 1262`, game: 'https://lichess.org/xXFgwkwc', lvl: 'moyenne', hint: `Un échec de fou, qui met la tour dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
        { fen: '2kr1bnr/pp3ppp/1np5/4P3/3QB2q/8/PPP2PPP/R1B2RK1 w - - 4 12', sol: ['Bf5+', 'Kb8', 'Qxh4'], real: `Lichess · niveau 1417`, game: 'https://lichess.org/7r0s4cP2/black', lvl: 'soutenue', hint: `Un échec de fou, qui met la dame dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
        { fen: 'r1b1kb1r/p2nqppp/2p5/1p6/3PnB2/1B6/PPP2PPP/RN1QK2R b KQkq - 1 10', sol: ['Nc3+'], mine: `contre IntotheWildd88 · rapide · 29 juillet 2026`, game: 'https://www.chess.com/game/live/172262532148', hint: `Un échec de cavalier, qui met la dame et le cavalier dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
        { fen: 'r2qkb1r/ppp2ppp/2n1b3/3np3/2B5/2N2N2/PPPP1PPP/R1BQR1K1 b kq - 3 7', sol: ['Nxc3'], mine: `contre nishKan99 · rapide · 30 juillet 2026`, game: 'https://www.chess.com/game/live/172307285588', hint: `Une capture au cavalier, qui met la dame dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Double échec', en: 'Double check',
      desc: `Cas extrême de la découverte : <b>deux pièces donnent échec en même temps</b>. Impossible de capturer ou d'interposer (cela n'arrête qu'un seul échec) — <b>le roi doit bouger</b>. Souvent dévastateur, voire matant.`,
      fen: '7k/5N2/8/8/8/8/1B6/6K1', arrows: [{ from: 'f7', to: 'h8', color: R }, { from: 'b2', to: 'h8', color: R }],
      puzzles: [
        { fen: '6rk/6pp/8/4N3/8/8/1B6/6K1 w - - 0 1', sol: ['Nf7#'], hint: `Un saut qui donne deux échecs d'un coup : le roi est étouffé, aucune fuite.` },
        { fen: 'r7/pp4pk/2p1q1Np/5Q2/4r3/8/6PP/R6K w - - 4 29', sol: ['Nf8+', 'Kg8', 'Nxe6'], real: `Lichess · niveau 1161`, game: 'https://lichess.org/OKHzYzz6/black', lvl: 'moyenne', hint: `Un échec de cavalier, qui met la dame dans le collimateur. Le motif : deux échecs simultanés : le roi doit bouger, rien d'autre.` },
        { fen: '4r1k1/1r3p2/6P1/2pPq2p/4p3/2N3QP/1P4PK/1R6 w - - 1 36', sol: ['gxf7+', 'Kxf7', 'Rf1+'], real: `Lichess · niveau 1310`, game: 'https://lichess.org/tTO6Mcbg/black', lvl: 'moyenne', hint: `Un échec de pion, qui met la tour dans le collimateur. Le motif : deux échecs simultanés : le roi doit bouger, rien d'autre.` },
        { fen: 'r4bnr/ppp4p/2np1k2/8/3PPB2/8/PPP3PP/RN3RK1 w - - 1 12', sol: ['Be5+', 'Kg6', 'Bxh8'], real: `Lichess · niveau 1538`, game: 'https://lichess.org/MP9Yp4Im/black', lvl: 'soutenue', hint: `Un échec de fou, qui met la tour dans le collimateur. Le motif : deux échecs simultanés : le roi doit bouger, rien d'autre.` },
        { fen: '8/p2rk2p/1p3pp1/4P3/2r5/6P1/P2R3P/4R1K1 w - - 0 30', sol: ['exf6+', 'Kxf6', 'Rxd7'], real: `Lichess · niveau 1604`, game: 'https://lichess.org/dHPwM3YG/black', lvl: 'soutenue', hint: `Un échec de pion. Le motif : deux échecs simultanés : le roi doit bouger, rien d'autre.` },
        { fen: '1k1r2nr/ppp2ppp/8/1N2pB2/1BP3q1/5n2/PP2KP1P/R2Q3R b - - 3 16', sol: ['Ng1+'], mine: `contre Affan_003 · rapide · 29 juillet 2026`, game: 'https://www.chess.com/game/live/172248197198', hint: `Un échec de cavalier. Le motif : deux échecs simultanés : le roi doit bouger, rien d'autre.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Déviation', en: 'Deflection',
      desc: `On <b>force une pièce à quitter une tâche défensive</b> — souvent par une capture ou un sacrifice. Ici la tour g8 est attirée loin de la défense par un sacrifice de dame, et le mat suit.`,
      fen: '5r1k/6pp/7N/8/8/8/Q7/6K1', arrows: [{ from: 'a2', to: 'g8', color: R }],
      puzzles: [
        { fen: '5r1k/6pp/7N/8/8/8/Q7/6K1 w - - 0 1', sol: ['Qg8+', 'Rxg8', 'Nf7#'], hint: `Sacrifie la dame pour attirer la tour : la case f7 devient mortelle.` },
        { fen: '8/5Q2/p3p1pk/8/1P1P4/P6p/5K2/6Bq b - - 2 48', sol: ['Qg2+', 'Ke3', 'Qxg1+'], real: `Lichess · niveau 984`, game: 'https://lichess.org/4VQhBJ3m', lvl: 'facile', hint: `Un échec de dame. Le motif : on force le défenseur à quitter son poste.` },
        { fen: '8/p5k1/4K3/r3R2p/2P2rp1/8/P1R3PP/8 b - - 12 41', sol: ['Rf6+', 'Kd7', 'Rxe5'], real: `Lichess · niveau 1152`, game: 'https://lichess.org/40sY3EXC', lvl: 'moyenne', hint: `Un échec de tour. Le motif : on force le défenseur à quitter son poste.` },
        { fen: 'rn1qkbnr/1b2pppp/p7/1P6/2B5/2p1PN2/1P3PPP/R1BQK2R w KQkq - 0 9', sol: ['Bxf7+', 'Kxf7', 'Qxd8'], real: `Lichess · niveau 1355`, game: 'https://lichess.org/TcQNJEGn/black', lvl: 'soutenue', hint: `Un échec de fou. Le motif : on force le défenseur à quitter son poste.` },
        { fen: '2k2r1r/pppq2p1/1b2p3/4p1Bp/Q2n4/3P2P1/PP2PPBP/2R2RK1 w - - 6 17', sol: ['Bxb7+', 'Kxb7', 'Qxd7'], real: `Lichess · niveau 1412`, game: 'https://lichess.org/Fxp9fbmG/black', lvl: 'soutenue', hint: `Un échec de fou. Le motif : on force le défenseur à quitter son poste.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attraction', en: 'Decoy',
      desc: `À l'inverse de la déviation, on <b>attire une pièce (souvent le roi) sur une case piégée</b>, généralement par un sacrifice, pour enchaîner avec une fourchette, un clouage ou un mat. Sur le diagramme, <b>Dxg7+</b> (rouge) attire le roi sur g7 — case piégée : le cavalier saute alors en e6 (bleu) et fourche le roi et la dame c5.`,
      fen: 'r5k1/pp1Q1p1p/8/2q3N1/8/7P/5PP1/R5K1',
      arrows: [{ from: 'd7', to: 'g7', color: R }, { from: 'g5', to: 'e6', color: B }],
      puzzles: [
        { fen: 'rnbqkb1r/7p/p1p1pnp1/1p6/4P3/1P6/PBP2PPP/RN1QK1NR w KQkq - 0 9', sol: ['Qxd8+', 'Kxd8', 'Bxf6+'], real: `Lichess · niveau 980`, game: 'https://lichess.org/bqdFwqq1/black', lvl: 'facile', hint: `Un échec de dame, qui met le cavalier et le fou dans le collimateur. Le motif : on attire le roi sur une case piégée.` },
        { fen: '8/p4k2/1p3p2/4nP1p/1Pr2N2/P3R1KP/8/8 b - - 2 37', sol: ['h4+', 'Kxh4', 'Rxf4+'], real: `Lichess · niveau 1137`, game: 'https://lichess.org/Q7QxsFJM', lvl: 'moyenne', hint: `Un échec de pion. Le motif : on attire le roi sur une case piégée.` },
        { fen: '8/p1p1B1pp/1b6/3Q4/2p4P/2k5/P2q2PK/8 w - - 0 42', sol: ['Bb4+', 'Kxb4', 'Qxd2+'], real: `Lichess · niveau 1377`, game: 'https://lichess.org/DseXchGD/black', lvl: 'soutenue', hint: `Un échec de fou, qui met la dame dans le collimateur. Le motif : on attire le roi sur une case piégée.` },
        { fen: '5r1k/pp4bp/3qp2p/3p4/b2n4/3BQP2/PP3P1P/2R3RK w - - 4 22', sol: ['Rxg7', 'Kxg7', 'Qxd4+'], real: `Lichess · niveau 1689`, game: 'https://lichess.org/Nii9BXT9/black', lvl: 'soutenue', hint: `Une capture à la tour, qui met le pion dans le collimateur. Le motif : on attire le roi sur une case piégée.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Surcharge', en: 'Overloading',
      desc: `Une pièce a <b>trop de tâches défensives</b> : elle garde deux choses à la fois. On capture l'une — la pièce doit reprendre — et l'autre tombe. Ici la dame e7 défend à la fois la tour d8 et le fou a3 : une de trop.`,
      fen: '3r2k1/4qppp/8/8/8/b7/5PPP/2BR2K1', arrows: [{ from: 'e7', to: 'd8', color: B }, { from: 'e7', to: 'a3', color: B }],
      puzzles: [
        { fen: 'rn2k1r1/ppb2pqp/2p1p3/2P3Bb/3PB3/5N1P/PP3PP1/R2QR1K1 b q - 4 15', sol: ['Bxf3', 'Qxf3', 'Qxg5'], real: `Lichess · niveau 986`, game: 'https://lichess.org/NMGGalgv', lvl: 'facile', hint: `Une capture au fou, qui met la dame dans le collimateur. Le motif : supprime la pièce qui garde tout, le reste s'écroule.` },
        { fen: '8/1p3p1k/p4npp/2qn4/8/2N2QBP/PP4PK/8 w - - 0 36', sol: ['Nxd5', 'Qxd5', 'Qxf6'], real: `Lichess · niveau 1196`, game: 'https://lichess.org/inoAKL4h/black', lvl: 'moyenne', hint: `Une capture au cavalier, qui met le cavalier dans le collimateur. Le motif : supprime la pièce qui garde tout, le reste s'écroule.` },
        { fen: 'r1bqk2r/pp2nppp/8/8/1b1Q1B2/2N5/2P1NPPP/R3KB1R b KQkq - 0 13', sol: ['Qxd4', 'Nxd4', 'Bxc3+'], real: `Lichess · niveau 1301`, game: 'https://lichess.org/B5KSI328', lvl: 'moyenne', hint: `Une capture à la dame, qui met le cavalier et la tour dans le collimateur. Le motif : supprime la pièce qui garde tout, le reste s'écroule.` },
        { fen: '3rr1k1/3bRp2/p2p1pp1/1p1P4/8/3B3P/P1P2KP1/4R3 w - - 6 26', sol: ['Rxd7', 'Rxd7', 'Rxe8+'], real: `Lichess · niveau 1400`, game: 'https://lichess.org/1TZCGpZ8/black', lvl: 'soutenue', hint: `Une capture à la tour. Le motif : supprime la pièce qui garde tout, le reste s'écroule.` },
        { fen: 'rnbqk2r/ppp2ppp/3p1n2/2b1N3/2B1P3/2N5/PPPP1PPP/R1BQK2R b KQkq - 1 5', sol: ['dxe5'], mine: `contre Fvskippy · par correspondance · 15 juillet 2026`, game: 'https://www.chess.com/game/daily/997035532', hint: `Une capture au pion. Le motif : supprime la pièce qui garde tout, le reste s'écroule.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Interférence', en: 'Interference',
      desc: `On <b>coupe la ligne entre une pièce défensive et ce qu'elle protège</b>, en interposant une pièce (parfois en la sacrifiant). La communication est rompue le temps d'un coup décisif.`,
      fen: '3r2k1/5ppp/8/8/8/8/b7/3R2K1', arrows: [{ from: 'a2', to: 'd5', color: B }, { from: 'd8', to: 'd1', color: B }],
      puzzles: [
        { fen: 'r4k1r/p2Bpp1p/6p1/q1N1b3/1p6/1P2P3/P1Q3PP/2R1K2R b K - 0 20', sol: ['Bc3+', 'Kf2', 'Qxc5'], real: `Lichess · niveau 957`, game: 'https://lichess.org/Kuzyr2Ov', lvl: 'facile', hint: `Un échec de fou. Le motif : on coupe la ligne entre le défenseur et ce qu'il protège.` },
        { fen: 'r2qkb1r/1p1b1ppp/pNpp4/8/3QP3/4B3/PPP2PPP/R3K2R b KQkq - 1 11', sol: ['c5', 'Qc3', 'Qxb6'], real: `Lichess · niveau 1029`, game: 'https://lichess.org/qU4lmztJ', lvl: 'moyenne', hint: `Un coup de pion, sans échec ni capture, qui met la dame dans le collimateur. Le motif : on coupe la ligne entre le défenseur et ce qu'il protège.` },
        { fen: '4r1k1/1p3p2/1b2q2p/p5p1/8/2P1pPB1/PP2Q1PP/3R3K w - - 1 26', sol: ['Rd6', 'Qxa2', 'Rxb6'], real: `Lichess · niveau 1385`, game: 'https://lichess.org/VHIwldwX/black', lvl: 'soutenue', hint: `Un coup de tour, sans échec ni capture, qui met la dame dans le collimateur. Le motif : on coupe la ligne entre le défenseur et ce qu'il protège.` },
        { fen: 'rnbqk1nr/ppppbpQp/8/8/8/1P6/P1P1PPPP/RNB1KBNR b KQkq - 0 4', sol: ['Bf6', 'Qg3', 'Bxa1'], real: `Lichess · niveau 1445`, game: 'https://lichess.org/biONqWPh', lvl: 'soutenue', hint: `Un coup de fou, sans échec ni capture, qui met la dame et la tour dans le collimateur. Le motif : on coupe la ligne entre le défenseur et ce qu'il protège.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Rayon X', en: 'X-ray',
      desc: `Une pièce longue exerce une pression <b>à travers</b> une pièce adverse, comme si celle-ci était transparente — soit pour attaquer une cible au-delà, soit pour défendre une case derrière l'écran.`,
      fen: '3r2k1/8/8/8/8/8/3R4/3RK3', arrows: [{ from: 'd1', to: 'd8', color: G }],
      puzzles: [
        { fen: 'q7/8/8/8/k7/8/8/3Q2K1 w - - 0 1', sol: ['Qa1+', 'Kb4', 'Qxa8'], hint: `Donne échec sur la colonne a : le roi et la dame noire sont alignés. Le roi doit s'écarter et laisse tomber la dame derrière lui (embrochade).` },
        { fen: '2r4k/6b1/7p/p1PQ1q2/8/3R2P1/P1KB4/8 b - - 4 38', sol: ['Rxc5+', 'Qxc5', 'Qxc5+'], real: `Lichess · niveau 990`, game: 'https://lichess.org/KXEwAX47', lvl: 'facile', hint: `Un échec de tour, qui met la dame dans le collimateur. Le motif : une pièce longue agit à travers une autre.` },
        { fen: 'r7/2k3pp/2pq4/p1Q5/1r1n1P2/6P1/P6P/3RR2K w - - 1 32', sol: ['Re7+', 'Qxe7', 'Qxe7+'], real: `Lichess · niveau 1187`, game: 'https://lichess.org/LtMEGOaK/black', lvl: 'moyenne', hint: `Un échec de tour, qui met le pion dans le collimateur. Le motif : une pièce longue agit à travers une autre.` },
        { fen: '8/2p1Q2p/p5pk/1p4q1/2nP3b/P7/1PP5/1K5R w - - 7 37', sol: ['Rxh4+', 'Qxh4', 'Qxh4+'], real: `Lichess · niveau 1204`, game: 'https://lichess.org/2KybDZ5F/black', lvl: 'moyenne', hint: `Un échec de tour, qui met le pion dans le collimateur. Le motif : une pièce longue agit à travers une autre.` },
        { fen: '2r2rk1/4ppbp/3p2p1/1bqR2B1/1p2PP2/1B5P/1PP1Q1PK/5R2 w - - 1 21', sol: ['Qxb5', 'Qxb5', 'Rxb5'], real: `Lichess · niveau 1634`, game: 'https://lichess.org/JiS2FeFX/black', lvl: 'soutenue', hint: `Une capture à la dame, qui met la dame dans le collimateur. Le motif : une pièce longue agit à travers une autre.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Coup intermédiaire', en: 'Zwischenzug',
      desc: `Le <b>zwischenzug</b> (« coup intermédiaire ») : au lieu de jouer le coup attendu — typiquement une reprise — on <b>intercale d'abord un coup plus fort</b> (souvent un échec ou une menace), puis on revient à l'idée initiale avec un temps gagné. Sur le diagramme, la capture Dxd3 (bleu) ne va pas s'envoler : on intercale <b>Txg7+</b> (rouge), l'adversaire doit reprendre, et la dame tombe ensuite avec un temps de plus. Toujours chercher : « ai-je un coup encore plus fort avant de reprendre ? »`,
      fen: '6k1/pp3prp/8/8/8/3q4/PP2QP1P/4K1R1',
      arrows: [{ from: 'g1', to: 'g7', color: R }, { from: 'e2', to: 'd3', color: B }],
      puzzles: [
        { fen: '6k1/6r1/8/8/8/3q4/4Q3/4K1R1 w - - 0 1', sol: ['Rxg7+', 'Kxg7', 'Qxd3'], demo: true, hint: `Tu peux prendre la dame en d3, mais joue d'abord l'échec qui s'impose : capture en g7 avec échec, puis encaisse la dame avec un temps gagné.` },
        { fen: 'r1bq1k1r/pp3p1p/6p1/1B1Qb3/8/2N1P1P1/PP3PP1/R3K2R b KQ - 0 14', sol: ['Bxc3+', 'bxc3', 'Qxd5'], real: `Lichess · niveau 951`, game: 'https://lichess.org/OtyyseLm', lvl: 'facile', hint: `Un échec de fou, qui met le pion et la tour dans le collimateur. Le motif : avant de reprendre, intercale un coup encore plus fort.` },
        { fen: 'rn1qr1k1/pppb1ppp/3p4/8/3P1b2/2N5/PPPQ2PP/2K1RBNR w - - 0 12', sol: ['Rxe8+', 'Qxe8', 'Qxf4'], real: `Lichess · niveau 1155`, game: 'https://lichess.org/79kGxCS1/black', lvl: 'moyenne', hint: `Un échec de tour, qui met la dame dans le collimateur. Le motif : avant de reprendre, intercale un coup encore plus fort.` },
        { fen: 'r7/1ppnk3/p3p2p/4r1p1/4R3/6N1/PPP3PP/3R2K1 w - - 0 23', sol: ['Rxd7+', 'Kxd7', 'Rxe5'], real: `Lichess · niveau 1326`, game: 'https://lichess.org/VjjsEMzZ/black', lvl: 'moyenne', hint: `Un échec de tour, qui met le pion dans le collimateur. Le motif : avant de reprendre, intercale un coup encore plus fort.` },
        { fen: 'r4rk1/pp2bppp/3pbn2/3Np1B1/2PpP3/3P4/PP1qBPPP/RR4K1 w - - 0 13', sol: ['Nxe7+', 'Kh8', 'Bxd2'], real: `Lichess · niveau 1461`, game: 'https://lichess.org/5or4MCwk/black', lvl: 'soutenue', hint: `Un échec de cavalier. Le motif : avant de reprendre, intercale un coup encore plus fort.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Desperado', en: 'Desperado',
      desc: `Une pièce <b>condamnée de toute façon</b> se « suicide » utilement : avant d'être perdue, elle capture le plus possible, ou se sacrifie pour un pat / une combinaison. « Tant qu'à mourir, faisons-le cher. »`,
      fen: '6k1/5ppp/8/8/8/2n5/5PPP/3N2K1', arrows: [{ from: 'c3', to: 'd1', color: R }],
      puzzles: [
        { fen: '4k3/3q4/3p4/4N3/8/8/8/4K3 w - - 0 1', sol: ['Nxd7'], hint: `Le pion d6 attaque ton cavalier : il est perdu de toute façon. Avant de tomber, fais-lui capturer la dame.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Moulin', en: 'Windmill',
      desc: `Le <b>moulin</b> : une série d'<b>échecs à la découverte</b> alternés qui raflent le matériel adverse coup après coup. La pièce qui découvre l'échec revient se placer, redonne échec, et rafle encore — la machine tourne tant qu'il reste à prendre.`,
      fen: '6k1/5ppp/8/8/8/8/1B6/4R1K1', arrows: [{ from: 'b2', to: 'g7', color: G }, { from: 'e1', to: 'e7', color: R }],
      puzzles: [
        { fen: '7k/1p3pRp/5B2/8/8/Q7/8/6K1 w - - 0 1', sol: ['Rxf7+', 'Kg8', 'Rg7+', 'Kh8', 'Rxb7+'], demo: true, hint: `Le fou f6 cloue le roi en h8. La tour découvre l'échec en quittant g7, revient redonner échec, repart… et rafle un pion à chaque tour de moulin.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Dégagement', en: 'Clearance',
      desc: `On <b>libère une case ou une ligne</b> pour une autre pièce, souvent en y sacrifiant la pièce qui gênait. Le tempo et la case dégagée valent plus que le matériel cédé.`,
      fen: '6k1/5ppp/8/3B4/8/8/8/3Q2K1', arrows: [{ from: 'd5', to: 'a8', color: B }, { from: 'd1', to: 'd8', color: G }],
      puzzles: [
        { fen: '4k3/3R4/8/8/8/8/1B6/3QK3 w - - 0 1', sol: ['Rd8+', 'Ke7', 'Qd7#'], demo: true, hint: `La tour occupe d7, la case dont la dame a besoin. Joue Rd8+ : la tour dégage d7 en donnant échec, puis la dame s'y installe pour mater (le fou b2 coupe la fuite en f6).` },
        { fen: '6k1/7p/1P4p1/1r6/8/4B1P1/5P1P/1rR3K1 b - - 0 41', sol: ['Rxc1+', 'Bxc1', 'Rb1'], real: `Lichess · niveau 869`, game: 'https://lichess.org/f16TqUPI', lvl: 'facile', hint: `Un échec de tour. Le motif : on libère la case (ou la ligne) dont une autre pièce a besoin.` },
        { fen: 'r1q2rk1/pp2ppbp/3p2p1/2p5/4P1b1/1PPP1N2/PB1N1P2/R3QRK1 b - - 1 14', sol: ['Bxf3', 'Nxf3', 'Qg4+'], real: `Lichess · niveau 1119`, game: 'https://lichess.org/BvOGq31x', lvl: 'moyenne', hint: `Une capture au fou. Le motif : on libère la case (ou la ligne) dont une autre pièce a besoin.` },
        { fen: '1r3rk1/2p5/6p1/p2P1P1P/Pq2p3/2N5/2Q5/2KR1R2 b - - 0 28', sol: ['Qa3+', 'Kd2', 'Rb2'], real: `Lichess · niveau 1394`, game: 'https://lichess.org/6anV3XUa', lvl: 'soutenue', hint: `Un échec de dame. Le motif : on libère la case (ou la ligne) dont une autre pièce a besoin.` },
        { fen: 'r4rk1/p3pp1p/2p1b1p1/2Pp3P/1q1b4/2N4P/PP1Q1P1B/R3KB1R b KQ - 0 15', sol: ['Bxc3', 'Qxc3', 'Qe4+'], real: `Lichess · niveau 1561`, game: 'https://lichess.org/iWrGnmcj', lvl: 'soutenue', hint: `Une capture au fou, qui met le pion et la dame dans le collimateur. Le motif : on libère la case (ou la ligne) dont une autre pièce a besoin.` },
      ] },

    // Les mats classiques ont leur propre cours dédié (js/mates.js, onglet « Mats »).

    // ════════ 🧠 Méthode & calcul ════════
    { cat: '🧠 Méthode & calcul', name: 'Méthode CCT (É-C-M)', en: 'Checks, Captures, Threats',
      desc: `Avant chaque coup, passe en revue les coups <b>forçants</b> dans cet ordre : <b>Échecs</b>, <b>Captures</b>, <b>Menaces</b> (en anglais <i>Checks, Captures, Threats</i>). Ce sont les coups qui limitent le plus les réponses adverses — donc ceux qui cachent les tactiques. Sur le diagramme, la revue donne trois coups à calculer : l'échec <b>Fxf7+</b> (rouge), la capture <b>Cxf7</b> (bleu), la menace <b>Dh5</b> (vert). C'est le premier réflexe pour ne rien rater.`,
      fen: 'r1bq1rk1/ppp2ppp/2n2n2/2b1N3/2BP4/2N5/1PP2PPP/R1BQ1RK1',
      arrows: [{ from: 'c4', to: 'f7', color: R }, { from: 'e5', to: 'f7', color: B }, { from: 'd1', to: 'h5', color: G }],
      puzzles: [
        { fen: '7r/6Rp/1pPk1p2/1Pb1p3/8/8/3r1PPP/4R1K1 w - - 1 33', sol: ['Rd7+', 'Ke6', 'Rxd2'], real: `Lichess · niveau 963`, game: 'https://lichess.org/TAe4EmGi/black', lvl: 'facile', hint: `Un échec de tour, qui met la tour dans le collimateur. Le motif : échecs, captures, menaces : les coups forçants d'abord.` },
        { fen: 'r2r2k1/1R3pp1/p6p/3p4/1P1P2bn/PB2PNq1/5QP1/5RK1 b - - 4 26', sol: ['Nxf3+', 'Qxf3', 'Bxf3'], real: `Lichess · niveau 1165`, game: 'https://lichess.org/XYGMz2H5', lvl: 'moyenne', hint: `Un échec de cavalier. Le motif : échecs, captures, menaces : les coups forçants d'abord.` },
        { fen: 'rnb1r1k1/pp2Pp1p/6p1/q3b1B1/2P5/2N5/PPQ2PPP/R3KB1R b KQ - 2 12', sol: ['Bxc3+', 'Qxc3', 'Qxg5'], real: `Lichess · niveau 1399`, game: 'https://lichess.org/WOWEdUv5', lvl: 'soutenue', hint: `Un échec de fou, qui met le fou et la tour dans le collimateur. Le motif : échecs, captures, menaces : les coups forçants d'abord.` },
        { fen: 'r7/p5k1/3Q3p/6p1/2pP2P1/4r1nP/PP3K2/R7 b - - 3 28', sol: ['Ne4+', 'Kxe3', 'Nxd6'], real: `Lichess · niveau 1480`, game: 'https://lichess.org/DwwnzhoJ', lvl: 'soutenue', hint: `Un échec de cavalier, qui met la dame et le pion dans le collimateur. Le motif : échecs, captures, menaces : les coups forçants d'abord.` },
      ] },
    { cat: '🧠 Méthode & calcul', name: 'Coups forçants', en: 'Forcing moves',
      desc: `Un coup <b>forçant</b> ne laisse qu'une poignée de réponses (échec, capture, menace directe). On calcule d'abord les lignes forçantes : elles sont courtes, nettes, et c'est là que vivent les combinaisons. Sur le diagramme (une de tes parties), <b>Dxd8+</b> (rouge) est le forçant absolu : les Noirs n'ont <b>qu'un seul coup légal</b>, …Rxd8 (vert). Une ligne comme celle-là se calcule jusqu'au bout sans se tromper.`,
      fen: 'rnbqkbnr/ppp2ppp/8/4P3/4p3/5N2/PPP2PPP/RNBQKB1R',
      arrows: [{ from: 'd1', to: 'd8', color: R }, { from: 'e8', to: 'd8', color: G }],
      puzzles: [
        { fen: '6k1/pp3pp1/2p4p/8/5NQ1/2P1r3/P6P/3n2K1 b - - 5 31', sol: ['Re1+', 'Kg2', 'Ne3+', 'Kf2', 'Nxg4+'], real: `Lichess · niveau 966`, game: 'https://lichess.org/fhtJy3ko', lvl: 'facile', hint: `Un échec de tour. Le motif : une ligne d'échecs se calcule jusqu'au bout.` },
        { fen: 'r6r/ppp1k3/2n1p1Q1/8/8/2P2q2/P4P1P/1K1R3R w - - 1 18', sol: ['Qg7+', 'Qf7', 'Rd7+', 'Kxd7', 'Qxf7+'], real: `Lichess · niveau 1190`, game: 'https://lichess.org/QGlT2cYV/black', lvl: 'moyenne', hint: `Un échec de dame, qui met le pion dans le collimateur. Le motif : une ligne d'échecs se calcule jusqu'au bout.` },
        { fen: '4R2r/2p2pk1/pp1q1np1/3P4/8/P2B1Q2/1PP2PPP/4R1K1 b - - 0 24', sol: ['Qxh2+', 'Kf1', 'Qh1+', 'Ke2', 'Rxe8+'], real: `Lichess · niveau 1363`, game: 'https://lichess.org/Yc1zWYu0', lvl: 'soutenue', hint: `Un échec de dame. Le motif : une ligne d'échecs se calcule jusqu'au bout.` },
        { fen: '4Q3/pp3rqk/8/2B1b3/6r1/2P2P2/PP3K2/3R4 w - - 0 41', sol: ['Rh1+', 'Kg6', 'Qe6+', 'Qf6', 'Qxg4+'], real: `Lichess · niveau 1555`, game: 'https://lichess.org/aOgrDcVL/black', lvl: 'soutenue', hint: `Un échec de tour. Le motif : une ligne d'échecs se calcule jusqu'au bout.` },
      ] },
    { cat: '🧠 Méthode & calcul', name: 'Coups candidats', en: 'Candidate moves',
      desc: `Avant de calculer, dresse la <b>liste des 2-4 coups les plus prometteurs</b> (les « candidats »), puis examine-les un par un. Évite de tomber amoureux du premier coup vu : compare-les avant de te décider. Le diagramme vient d'une de tes parties : trois coups s'y valent presque (flèches bleues) - …h6, …Cxd5 et …Fe6. Aucun ne gagne quoi que ce soit : c'est exactement le genre de position où il faut lister ses candidats, puis les comparer un par un.`,
      fen: 'r1bq1rk1/1pp2ppp/p1np1n2/2bNp3/P1B1P3/3P1N2/1PP2PPP/R1BQ1RK1',
      arrows: [{ from: 'h7', to: 'h6', color: B }, { from: 'f6', to: 'd5', color: B }, { from: 'c8', to: 'e6', color: B }] },
    { cat: '🧠 Méthode & calcul', name: 'Coup tranquille', en: 'Quiet move',
      desc: `Toutes les combinaisons ne sont pas faites d'échecs. Un <b>coup tranquille</b> — sans échec ni capture — au milieu d'une séquence (création d'une menace imparable, amélioration décisive d'une pièce) est souvent le plus dur à voir… et le plus fort. Sur le diagramme, tiré d'une de tes parties, <b>Cd5</b> (rouge) ne prend rien et ne donne pas échec : il attaque la dame f6 et la case c7 en même temps, et vaut déjà une pièce.`,
      fen: 'rnb1k2r/pppp1ppp/5q1n/2b1p3/4P3/2NP1N2/PPP2PPP/R1BQKB1R',
      arrows: [{ from: 'c3', to: 'd5', color: R }, { from: 'd5', to: 'f6', color: G }],
      puzzles: [
        { fen: '5Qnk/1pq3p1/2p3pp/r3p3/4Pn2/2P2N1P/5PPK/3R4 w - - 2 31', sol: ['Rd8', 'Qxd8', 'Qxd8'], real: `Lichess · niveau 1160`, game: 'https://lichess.org/FCp1Fv5U/black', lvl: 'moyenne', hint: `Un coup de tour, sans échec ni capture. Le motif : ni échec ni capture, mais une menace imparable.` },
        { fen: '4k1r1/1p3p2/3Rpp2/p7/8/2P1PP2/Pr5P/5R1K w - - 0 31', sol: ['Rfd1', 'f5', 'Rd8+'], real: `Lichess · niveau 1281`, game: 'https://lichess.org/7QaODgRC/black', lvl: 'moyenne', hint: `Un coup de tour, sans échec ni capture. Le motif : ni échec ni capture, mais une menace imparable.` },
        { fen: '6k1/5p1p/2p1bBp1/1p6/2p5/3r3P/5PP1/4R1K1 w - b6 0 30', sol: ['Ra1', 'Rd8', 'Bxd8'], real: `Lichess · niveau 1472`, game: 'https://lichess.org/4BdDDo2k/black', lvl: 'soutenue', hint: `Un coup de tour, sans échec ni capture. Le motif : ni échec ni capture, mais une menace imparable.` },
        { fen: 'r1b1k2r/pppp1ppp/7n/4P3/8/2Q5/P1P1KPPP/RNq2B1R w kq - 4 12', sol: ['Nd2', 'Qxa1', 'Qxa1'], real: `Lichess · niveau 1606`, game: 'https://lichess.org/XnoQlz24/black', lvl: 'soutenue', hint: `Un coup de cavalier, sans échec ni capture, qui met la dame dans le collimateur. Le motif : ni échec ni capture, mais une menace imparable.` },
      ] },

    // ════════ ♟ Concepts stratégiques ════════
    { cat: '♟ Concepts stratégiques', name: 'Pion passé', en: 'Passed pawn',
      desc: `Un pion qui n'a <b>plus aucun pion adverse</b> sur sa colonne ni les colonnes voisines. Le pion e5 file vers la promotion sans opposition — un atout majeur, surtout en finale. « Un pion passé doit être poussé. »`,
      fen: '6k1/pp5p/8/4P3/8/8/8/6K1', arrows: [{ from: 'e5', to: 'e8', color: G }],
      puzzles: [
        { fen: 'r1b2r2/3q1pkp/p5p1/1p1pP3/3Q4/5N2/PP3PPP/3R1RK1 w - - 0 20', sol: ['e6+', 'Kg8', 'exd7'], real: `Lichess · niveau 913`, game: 'https://lichess.org/j9RH0MDK/black', lvl: 'facile', hint: `Un échec de pion, qui met la dame dans le collimateur. Le motif : un pion qui file vers la promotion vaut une pièce.` },
        { fen: '8/8/p5p1/1pk5/3R4/2pRn1P1/P6P/6K1 b - - 8 35', sol: ['c2', 'Kf2', 'c1=Q'], real: `Lichess · niveau 1128`, game: 'https://lichess.org/WFZljc31', lvl: 'moyenne', hint: `Un coup de pion, sans échec ni capture. Le motif : un pion qui file vers la promotion vaut une pièce.` },
        { fen: '8/8/1Qnk4/2pp1n2/3q3p/6pP/1P3PP1/3R1RK1 b - - 7 43', sol: ['gxf2+', 'Rxf2', 'Qxd1+'], real: `Lichess · niveau 1284`, game: 'https://lichess.org/KWeLpXeu', lvl: 'moyenne', hint: `Un échec de pion. Le motif : un pion qui file vers la promotion vaut une pièce.` },
        { fen: '8/R7/3k4/3p3p/2p5/7r/1K1R4/8 b - - 1 52', sol: ['c3+', 'Kc2', 'cxd2'], real: `Lichess · niveau 1481`, game: 'https://lichess.org/EnRUg8Hp', lvl: 'soutenue', hint: `Un échec de pion, qui met la tour dans le collimateur. Le motif : un pion qui file vers la promotion vaut une pièce.` },
        { fen: '2r1k2r/1p1n1p2/p3Rq1Q/1p6/8/P1PP3P/2P2PP1/5RK1 b - - 0 23', sol: ['fxe6'], mine: `contre P_krazy · rapide · 29 juillet 2026`, game: 'https://www.chess.com/game/live/172248806458', hint: `Une capture au pion. Le motif : un pion qui file vers la promotion vaut une pièce.` },
        { fen: '1rbq1rk1/2p2p1p/3p1p2/1pbBp3/1nP1P3/1P1P1N2/5PPP/R1BQ1RK1 b - c3 0 13', sol: ['c6'], positional: true, mine: `contre Balddarkhorse · par correspondance · 10 août 2026`, game: 'https://www.chess.com/game/daily/1010656384', hint: `Un coup de pion, sans échec ni capture, qui met le fou dans le collimateur. Le motif : un pion qui file vers la promotion vaut une pièce.` },
      ] },
    { cat: '♟ Concepts stratégiques', name: 'Pion isolé', en: 'Isolated pawn',
      desc: `Un pion sans pion ami sur les colonnes adjacentes (ici d4, sans pion en c ni e). Il ne peut être défendu par un pion : faiblesse à long terme, mais il offre souvent des cases actives et de l'initiative à court terme.`,
      fen: '6k1/8/2p1p3/8/3P4/8/8/6K1', arrows: [] },
    { cat: '♟ Concepts stratégiques', name: 'Colonne ouverte & avant-poste', en: 'Open file & outpost',
      desc: `Une <b>colonne ouverte</b> (sans pion) est l'autoroute des tours : la tour d1 contrôle toute la colonne d. Un <b>avant-poste</b> est une case avancée protégée par un pion et inattaquable par un pion adverse — idéale pour un cavalier (d5, soutenu par e4).`,
      fen: '3r2k1/1p3p2/8/3N4/4P3/8/8/3R2K1', arrows: [{ from: 'd1', to: 'd8', color: G }, { from: 'e4', to: 'd5', color: B }] },
    { cat: '♟ Concepts stratégiques', name: 'Rupture de pions', en: 'Pawn break',
      desc: `Une <b>rupture</b> est une poussée de pion qui attaque la chaîne adverse pour <b>ouvrir des lignes</b> ou libérer ses pièces. Dans les positions fermées, c'est la rupture (…d5, …f5, c4-c5…) qui crée le jeu : sans elle, on étouffe.`,
      fen: '6k1/pp3ppp/2p5/3p4/3P4/2P5/PP3PPP/6K1', arrows: [{ from: 'c3', to: 'c4', color: G }] },
    { cat: '♟ Concepts stratégiques', name: 'Cases faibles & trou', en: 'Weak squares',
      desc: `Une <b>case faible</b> ne peut plus être défendue par un pion (les pions qui la couvraient ont avancé ou disparu). Un <b>trou</b> dans le camp adverse est une invitation : installes-y une pièce, idéalement un cavalier, durablement.`,
      fen: '6k1/pp3ppp/8/3N4/8/8/PP3PPP/6K1', arrows: [{ from: 'd5', to: 'd5', color: B }] },
    { cat: '♟ Concepts stratégiques', name: 'Paire de fous', en: 'Bishop pair',
      desc: `Posséder ses <b>deux fous</b> quand l'adversaire n'en a qu'un (ou aucun) : un avantage durable dans les positions ouvertes, où les fous balaient tout l'échiquier de loin. Sur le diagramme, les fous b2 et d3 visent chacun une diagonale vers le roque noir (g7 et h7) : les cavaliers, eux, ne couvrent rien à distance.`,
      fen: 'r2q1rk1/pp3ppp/2n2n2/8/8/3B4/PB3PPP/R2Q1RK1',
      arrows: [{ from: 'b2', to: 'g7', color: G }, { from: 'd3', to: 'h7', color: G }] },
    { cat: '♟ Concepts stratégiques', name: 'Zugzwang', en: 'Zugzwang',
      desc: `Situation où <b>tout coup dégrade sa propre position</b> — mais on est obligé de jouer. Trait aux Noirs ici : le roi e8 doit céder le passage, et le roi blanc escorte son pion vers la promotion. C'est l'obligation de bouger qui perd.`,
      fen: '4k3/8/4K3/4P3/8/8/8/8', arrows: [],
      puzzles: [
        { fen: '8/8/p1p5/Pp1p3p/1P1Pk1P1/2P3P1/4K3/8 b - - 0 50', sol: ['hxg4', 'Kd2', 'Kf3'], real: `Lichess · niveau 794`, game: 'https://lichess.org/kD3HOQhu', lvl: 'facile', hint: `Une capture au pion. Le motif : l'obligation de jouer dégrade la position.` },
        { fen: '8/8/1p2k3/pP4pp/P2Kp3/6PP/8/8 w - - 0 49', sol: ['Kxe4', 'Kd6', 'Kf5'], real: `Lichess · niveau 1078`, game: 'https://lichess.org/wA2zRLQ4/black', lvl: 'moyenne', hint: `Une capture au roi. Le motif : l'obligation de jouer dégrade la position.` },
        { fen: '8/8/3p1p2/3P1P1k/p1p1P1p1/P1P3K1/8/8 b - - 1 61', sol: ['Kg5', 'e5', 'fxe5'], real: `Lichess · niveau 1302`, game: 'https://lichess.org/rWAfK4UE', lvl: 'moyenne', hint: `Un coup de roi, sans échec ni capture. Le motif : l'obligation de jouer dégrade la position.` },
        { fen: '8/8/5k2/4p1pK/4r2p/5P1P/8/8 w - - 0 47', sol: ['fxe4', 'g4', 'Kxg4'], real: `Lichess · niveau 1613`, game: 'https://lichess.org/sJUdeAvc/black', lvl: 'soutenue', hint: `Une capture au pion. Le motif : l'obligation de jouer dégrade la position.` },
      ] },
    { cat: '♟ Concepts stratégiques', name: 'Initiative & tempo', en: 'Initiative & tempo',
      desc: `L'<b>initiative</b>, c'est dicter le jeu en enchaînant les menaces ; l'adversaire ne fait que réagir. Un <b>tempo</b> est une unité de temps (un coup) : gagner un tempo, c'est avancer son jeu <i>en menaçant</i>. Sur le diagramme, la poussée <b>d5</b> (bleu) gagne un temps : elle attaque le cavalier c6 (vert), qui doit reculer — les Blancs continuent de mener la danse.`,
      fen: 'r1bq1rk1/ppp2ppp/2n2n2/8/3P4/2N2N2/PP3PPP/R1BQ1RK1',
      arrows: [{ from: 'd4', to: 'd5', color: B }, { from: 'd5', to: 'c6', color: G }] },
    { cat: '♟ Concepts stratégiques', name: 'Prophylaxie', en: 'Prophylaxis',
      desc: `Jouer un coup qui <b>empêche le plan adverse</b> avant même qu'il ne se déclenche. L'art de « penser pour l'adversaire » : repérer son idée, puis l'étouffer (Kmoch, Nimzowitsch). Sur le diagramme, les Noirs rêvent de …Fg4 pour clouer le cavalier f3 (bleu) ; le petit <b>h3</b> (rouge) interdit la case et le plan meurt avant de naître.`,
      fen: 'r1bq1rk1/ppp2ppp/2n2n2/8/8/2N2N2/PPP2PPP/R1BQ1RK1',
      arrows: [{ from: 'c8', to: 'g4', color: B }, { from: 'h2', to: 'h3', color: R }] },
  ];

  // ───────────────────────── notation helpers ─────────────────────────
  // Solutions are stored in English SAN; display them in French notation.
  function sanToFr(san) {
    return (san || '').replace(/[KQRBN]/g, c => ({ K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' }[c]));
  }

  // Resolve an English SAN to {from, to, promotion} on a given fen. On cherche
  // d'abord la correspondance EXACTE dans la liste des coups légaux : le parseur
  // « sloppy » de chess.js lit « bxc3 » comme un coup de fou et rate les prises
  // de pion sur la colonne b.
  function sanToMove(fen, san) {
    try {
      const g = new Chess(fen);
      const exact = g.moves({ verbose: true }).filter(m => m.san === san)[0];
      const m = exact ? g.move({ from: exact.from, to: exact.to, promotion: exact.promotion })
        : g.move(san, { sloppy: true });
      return m ? { from: m.from, to: m.to, promotion: m.promotion } : null;
    } catch (_) { return null; }
  }

  // ──────────── lecture du plateau : attaques, reprises, menaces ────────────
  // Calculé à la main sur le plateau (indépendant de chess.js) pour répondre à
  // deux questions : « que menace ce coup ? » et « la menace rapporte-t-elle
  // vraiment quelque chose ? ». Une fourchette royale qui se fait reprendre au
  // coup suivant n'est pas une fourchette : c'est l'échange statique (SEE) plus
  // le bilan à 3 demi-coups (netGain) qui tranchent, et ce sont eux qui filtrent
  // les flèches de menace affichées.
  const FILES = 'abcdefgh';
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const FR_PIECE = { k: 'le roi', q: 'la dame', r: 'la tour', b: 'le fou', n: 'le cavalier', p: 'le pion' };
  const FR_DU = { k: 'du roi', q: 'de la dame', r: 'de la tour', b: 'du fou', n: 'du cavalier', p: 'du pion' };
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function boardOf(fen) {
    const b = [];
    for (const row of (fen || '').split(' ')[0].split('/')) {
      const line = [];
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') { for (let i = 0; i < +ch; i++) line.push(null); }
        else line.push({ c: ch === ch.toUpperCase() ? 'w' : 'b', t: ch.toLowerCase() });
      }
      b.push(line);
    }
    return b;
  }
  const sq2rc = (sq) => ({ r: 8 - +sq[1], c: FILES.indexOf(sq[0]) });
  const rc2sq = (r, c) => FILES[c] + (8 - r);
  const at = (b, r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8) ? b[r][c] : undefined;
  const slideDirs = (t) => (t === 'b' ? DIAG : t === 'r' ? ORTH : t === 'q' ? DIAG.concat(ORTH) : null);

  // Cases sur lesquelles la pièce posée en `sq` porte (pseudo-légal : les
  // clouages ne comptent pas, c'est bien ce qu'on veut pour juger une menace).
  function attacksFrom(b, sq) {
    const { r, c } = sq2rc(sq);
    const p = at(b, r, c);
    if (!p) return [];
    const out = [];
    const push = (rr, cc) => { if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) out.push(rc2sq(rr, cc)); };
    if (p.t === 'n') for (const [dr, dc] of KN) push(r + dr, c + dc);
    else if (p.t === 'k') for (const [dr, dc] of DIAG.concat(ORTH)) push(r + dr, c + dc);
    else if (p.t === 'p') { const dr = p.c === 'w' ? -1 : 1; push(r + dr, c - 1); push(r + dr, c + 1); }
    else for (const [dr, dc] of slideDirs(p.t)) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { out.push(rc2sq(rr, cc)); if (b[rr][cc]) break; rr += dr; cc += dc; }
    }
    return out;
  }

  // Pièces de la couleur `color` qui portent sur `sq`. Les rayons X sont pris en
  // compte dès que l'écran a quitté le plateau, ce qui rend l'échange correct.
  function attackersOf(b, sq, color) {
    const { r: tr, c: tc } = sq2rc(sq);
    if (tc < 0 || tr < 0 || tr > 7) return [];
    const out = [];
    const add = (r, c) => out.push({ sq: rc2sq(r, c), t: b[r][c].t });
    for (const [dr, dc] of KN) { const p = at(b, tr + dr, tc + dc); if (p && p.t === 'n' && p.c === color) add(tr + dr, tc + dc); }
    for (const [dr, dc] of DIAG.concat(ORTH)) { const p = at(b, tr + dr, tc + dc); if (p && p.t === 'k' && p.c === color) add(tr + dr, tc + dc); }
    for (const dc of [-1, 1]) {
      const w = at(b, tr + 1, tc + dc); if (color === 'w' && w && w.c === 'w' && w.t === 'p') add(tr + 1, tc + dc);
      const k = at(b, tr - 1, tc + dc); if (color === 'b' && k && k.c === 'b' && k.t === 'p') add(tr - 1, tc + dc);
    }
    const scan = (dirs, types) => {
      for (const [dr, dc] of dirs) {
        let r = tr + dr, c = tc + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
          const p = b[r][c];
          if (p) { if (p.c === color && types.indexOf(p.t) >= 0) add(r, c); break; }
          r += dr; c += dc;
        }
      }
    };
    scan(DIAG, ['b', 'q']);
    scan(ORTH, ['r', 'q']);
    return out;
  }

  // Échange statique (SEE) : ce que `color` gagne, en pions, en déclenchant les
  // captures sur `sq` (l'adversaire reprend au mieux, et ainsi de suite).
  function seeOn(b, sq, color) {
    const { r, c } = sq2rc(sq);
    const target = at(b, r, c);
    if (!target || target.c === color) return 0;
    // On ne « gagne » pas un roi : sans ce zéro, une reprise du roi empoisonne
    // la récursion (l'adversaire « reprendrait » le roi pour 100).
    if (target.t === 'k') return 0;
    const guarded = attackersOf(b, sq, other(color)).length > 0;
    const atk = attackersOf(b, sq, color).filter(a => a.t !== 'k' || !guarded);
    if (!atk.length) return 0;
    atk.sort((x, y) => VAL[x.t] - VAL[y.t]);
    const f = sq2rc(atk[0].sq);
    const moved = b[f.r][f.c];
    b[f.r][f.c] = null; b[r][c] = moved;
    const val = VAL[target.t] - Math.max(0, seeOn(b, sq, other(color)));
    b[f.r][f.c] = moved; b[r][c] = target;
    return val;
  }

  // Bilan matériel réel du coup, en pions : l'adversaire choisit sa MEILLEURE
  // défense (y compris reprendre la pièce qui menace), puis on encaisse au mieux.
  // C'est ce chiffre qui dit si une « fourchette » en est vraiment une : si la
  // reprise annule tout, il tombe à zéro. 1000 = mat.
  function netGain(fenAfter) {
    let g;
    try { g = new Chess(fenAfter); } catch (_) { return 0; }
    if (g.in_checkmate()) return 1000;
    const replies = g.moves({ verbose: true });
    if (!replies.length) return 0; // pat
    let worst = Infinity;
    for (const r of replies) {
      let bal = r.captured ? -VAL[r.captured] : 0;
      let g2, played = null;
      try { g2 = new Chess(fenAfter); played = g2.move({ from: r.from, to: r.to, promotion: r.promotion || 'q' }); } catch (_) { played = null; }
      if (!played) continue; // défense injouable : elle ne compte pas dans le pire cas
      if (g2.in_checkmate()) return -1000; // sa défense me mate : le « coup gagnant » perd
      const b2 = boardOf(g2.fen());
      const me = g2.turn();
      let best = 0;
      for (const my of g2.moves({ verbose: true })) {
        if (my.san.indexOf('#') >= 0) { best = 1000; break; } // mat au coup suivant
        if (!my.captured) continue;
        const gain = seeOn(b2, my.to, me);
        if (gain > best) best = gain;
      }
      bal += best;
      if (bal < worst) worst = bal;
    }
    return worst === Infinity ? 0 : worst;
  }

  // Menaces créées par le coup { from, to } : ce que la pièce qui vient de jouer
  // attaque désormais pour de bon (échec, ou capture qui gagne du matériel), les
  // lignes qu'elle a démasquées en partant, la pièce alignée DERRIÈRE sa cible
  // (clouage / enfilade), et ce que tout cela rapporte vraiment.
  function threats(fenBefore, fenAfter, move) {
    if (!fenBefore || !fenAfter || !move) return null;
    const bA = boardOf(fenAfter), bB = boardOf(fenBefore);
    const rc = sq2rc(move.to);
    const mover = at(bA, rc.r, rc.c);
    if (!mover) return null;
    const me = mover.c, foe = other(me);
    const checks = [], direct = [], discovered = [], behind = [];
    const target = (sq, via) => {
      const p = at(bA, sq2rc(sq).r, sq2rc(sq).c);
      if (!p || p.c !== foe) return null;
      const by = at(bA, sq2rc(via).r, sq2rc(via).c);
      if (p.t === 'k') return { sq, t: 'k', gain: 0, from: via, byT: by ? by.t : 'q' };
      const gain = seeOn(bA, sq, me);
      return gain > 0 ? { sq, t: p.t, gain, from: via, byT: by ? by.t : 'q' } : null;
    };
    for (const sq of attacksFrom(bA, move.to)) {
      const w = target(sq, move.to);
      if (w) (w.t === 'k' ? checks : direct).push(w);
    }
    // Découverte : une pièce ennemie attaquée maintenant par une AUTRE de nos
    // pièces, qui ne l'était pas avant que celle-ci ne dégage la ligne.
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = bA[r][c];
      if (!p || p.c !== foe) continue;
      const sq = rc2sq(r, c);
      const now = attackersOf(bA, sq, me).filter(a => a.sq !== move.to);
      if (!now.length) continue;
      const was = attackersOf(bB, sq, me).filter(a => a.sq !== move.from).map(a => a.sq);
      const fresh = now.filter(a => was.indexOf(a.sq) < 0);
      if (!fresh.length) continue;
      const w = target(sq, fresh[0].sq);
      if (w) (w.t === 'k' ? checks : discovered).push(w);
    }
    // Clouage / enfilade : sur chaque rayon de la pièce qui vient de jouer, la
    // pièce ennemie coincée DERRIÈRE la première (celle qui ne peut pas fuir, ou
    // celle qui tombera quand la première s'écartera).
    const dirs = slideDirs(mover.t);
    if (dirs) for (const [dr, dc] of dirs) {
      let r = rc.r + dr, c = rc.c + dc, first = null;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = bA[r][c];
        if (p) {
          if (!first) { if (p.c !== foe) break; first = { sq: rc2sq(r, c), t: p.t }; }
          else {
            if (p.c === foe && (VAL[p.t] > VAL[first.t] || first.t === 'k')) {
              behind.push({ from: first.sq, sq: rc2sq(r, c), t: p.t, front: first.t });
            }
            break;
          }
        }
        r += dr; c += dc;
      }
    }
    let recapture = null, mate = false, legal = [];
    try {
      const g = new Chess(fenAfter);
      mate = g.in_checkmate();
      legal = g.moves({ verbose: true }).filter(m => m.to === move.to);
    } catch (_) { legal = []; }
    if (legal.length) {
      const swap = seeOn(bA, move.to, foe);
      if (swap > 0) {
        const cheapest = legal.map(m => ({ sq: m.from, t: m.piece })).sort((x, y) => VAL[x.t] - VAL[y.t])[0];
        recapture = { sq: cheapest.sq, t: cheapest.t, gain: swap };
      }
    }
    // Matériel adverse déjà encaissé par le coup lui-même, à ajouter à la suite.
    let taken = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const was = bB[r][c], now = bA[r][c];
      if (was && was.c === foe && !(now && now.c === foe && now.t === was.t)) taken += VAL[was.t];
      if (now && now.c === foe && !(was && was.c === foe && was.t === now.t)) taken -= VAL[now.t];
    }
    return {
      mover: { sq: move.to, t: mover.t, color: me },
      checks, direct, discovered, behind, recapture, mate,
      net: mate ? 1000 : Math.max(taken, 0) + netGain(fenAfter),
      count: checks.length + direct.length + discovered.length + behind.length,
    };
  }

  // Phrase française qui décrit les menaces trouvées (affichée sous l'échiquier).
  // `final` = le coup termine la solution : on ose alors conclure sur le gain.
  function threatSentence(t, final) {
    if (!t || (!t.count && !t.mate)) return '';
    if (t.mate) return '♚ <b>Échec et mat</b> : ni fuite, ni parade, ni capture.';
    const named = (x) => FR_PIECE[x.t] + ' <b>' + x.sq + '</b>';
    const own = t.checks.filter(c => c.from === t.mover.sq);
    const disco = t.checks.filter(c => c.from !== t.mover.sq);
    const bits = [];
    if (own.length && disco.length) bits.push('donne un <b>double échec</b> au roi ' + own[0].sq);
    else if (own.length) bits.push('fait <b>échec</b> au roi ' + own[0].sq);
    else if (disco.length) bits.push('démasque l\'<b>échec</b> ' + FR_DU[disco[0].byT] + ' ' + disco[0].from);
    if (t.direct.length) bits.push('attaque ' + t.direct.map(named).join(' et '));
    if (t.discovered.length) bits.push('démasque l\'attaque ' + FR_DU[t.discovered[0].byT] + ' '
      + t.discovered[0].from + ' sur ' + t.discovered.map(named).join(' et '));
    if (t.behind.length) {
      const b = t.behind[0];
      bits.push(b.front === 'k'
        ? 'et le roi ' + b.from + ' devra s\'écarter en laissant tomber ' + FR_PIECE[b.t] + ' <b>' + b.sq + '</b> derrière lui'
        : 'cloue ' + FR_PIECE[b.front] + ' ' + b.from + ' contre ' + FR_PIECE[b.t] + ' <b>' + b.sq + '</b>');
    }
    if (!bits.length) return '';
    const head = cap1(FR_PIECE[t.mover.t]) + ' <b>' + t.mover.sq + '</b> ' + bits.join(', ') + '.';
    let verdict = '';
    if (t.net >= 1.5) {
      verdict = '<span class="tac-th-ok">🛡️ L\'adversaire ne peut pas tout sauver'
        + (t.recapture ? ', même en reprenant en ' + t.mover.sq : '')
        + ' : le coup gagne <b>' + (t.net >= 9 ? 'la dame' : '+' + t.net) + '</b> au bas mot.</span>';
    } else if (t.recapture && final) {
      verdict = '<span class="tac-th-warn">⚠️ Mais ' + FR_PIECE[t.recapture.t] + ' ' + t.recapture.sq
        + ' peut le reprendre : la menace ne rapporte rien telle quelle.</span>';
    }
    return head + (verdict ? ' ' + verdict : '');
  }

  // ───────────────────────── practice overlay ─────────────────────────
  let list = [], idx = 0, ply = 0, selected = null, locked = false, game = null, motifName = '';
  // Bumped on every position change / close so a queued reply or solve timer
  // from the previous puzzle can't mutate the next one after it fires.
  let token = 0;
  // Menaces du dernier coup joué (pour le bouton bascule « 👁 Menaces »).
  let lastThreats = null, threatsOn = false;
  // Mode « continuer à jouer » : on rejoue les deux camps depuis la position.
  let free = false, freeHist = [], freeToken = 0, freeBest = null;

  function ensureDom() {
    if ($('#tactics-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'tactics-overlay';
    ov.className = 'guess-overlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="guess-panel">
        <div class="guess-head">
          <button class="back-btn" id="tac-close">←</button>
          <span class="guess-title" id="tac-title">Entraînement</span>
          <span class="guess-score" id="tac-score"></span>
        </div>
        <div id="tac-stage"></div>
      </div>`;
    document.body.appendChild(ov);
    $('#tac-close').onclick = close;
  }

  function start(puzzles, name) {
    list = (puzzles || []).filter(p => p && p.fen && p.sol && p.sol.length);
    motifName = name || 'Entraînement';
    idx = 0;
    ensureDom();
    $('#tactics-overlay').hidden = false;
    document.body.classList.add('guess-open');
    render();
  }

  function close() {
    token++; freeToken++; free = false;
    const ov = $('#tactics-overlay');
    if (ov) ov.hidden = true;
    document.body.classList.remove('guess-open');
  }

  function render() {
    token++; freeToken++;
    free = false; lastThreats = null; threatsOn = false; freeBest = null;
    const stage = $('#tac-stage');
    $('#tac-title').textContent = '🎯 ' + motifName;
    $('#tac-score').textContent = list.length ? `${idx + 1} / ${list.length}` : '';
    if (!list.length) {
      stage.innerHTML = `<div class="guess-empty">Pas encore d'exercice pour ce motif.<br><span>Explore le diagramme — la pratique arrive bientôt.</span></div>`;
      return;
    }
    if (idx >= list.length) {
      stage.innerHTML = `<div class="guess-empty">Série terminée ! 🎉<br><span>Tu as parcouru les ${list.length} position${list.length > 1 ? 's' : ''} de ce motif.</span>
        <div class="guess-actions"><button class="train-btn good" id="tac-restart">↺ Recommencer</button></div></div>`;
      $('#tac-restart').onclick = () => { idx = 0; render(); };
      return;
    }

    const p = list[idx];
    game = new Chess(p.fen);
    ply = 0; selected = null; locked = false;
    const sideToMove = p.fen.split(' ')[1] === 'b' ? 'Noirs' : 'Blancs';
    const toFind = Math.ceil(p.sol.length / 2);
    stage.innerHTML = `
      <div class="guess-prompt">Trait aux <b>${sideToMove}</b> — trouve le coup. <span class="tac-motif">${motifName}</span></div>
      <div class="tac-context">${contextChips(p, toFind)}</div>
      <div class="guess-board-wrap">
        <svg viewBox="0 0 360 360" id="tac-board"></svg>
        <svg viewBox="0 0 360 360" id="tac-arrows" class="arrow-overlay"></svg>
      </div>
      <div class="guess-feedback" id="tac-feedback">Clique ta pièce, puis sa case d'arrivée.</div>
      <div class="tac-threats" id="tac-threats" hidden></div>
      <div class="guess-nav" id="tac-nav">
        <button class="train-btn ghost" id="tac-hint">💡 Indice</button>
        <button class="train-btn ghost" id="tac-solve">Voir la solution</button>
      </div>`;
    BoardRenderer.setFlipped(p.fen.split(' ')[1] === 'b');
    BoardRenderer.render($('#tac-board'), p.fen);
    BoardRenderer.clearArrows($('#tac-arrows'));
    attachClicks();
    BoardRenderer.enableDrag($('#tac-board'), {
      getFen: () => game.fen(),
      arrows: $('#tac-arrows'),
      canMove: () => !locked,
      onMove: (from, to) => tryMove(from, to),
    });
    $('#tac-hint').onclick = showHint;
    $('#tac-solve').onclick = solve;
  }

  // Small chips above the board: where the position comes from, how hard it is,
  // how many moves the learner has to find.
  function contextChips(p, toFind) {
    const chips = [];
    const href = p.game ? (/^https?:/.test(p.game) ? p.game : 'https://lichess.org/' + p.game) : '';
    const link = href ? ` <a href="${href}" target="_blank" rel="noopener">↗</a>` : '';
    if (p.mine) {
      chips.push(`<span class="tac-chip real">🎮 ta partie — ${p.mine}${link}</span>`);
    } else if (p.real) {
      chips.push(`<span class="tac-chip real">🌍 vraie partie — ${p.real}${link}</span>`);
    } else if (p.ctx) {
      chips.push(`<span class="tac-chip">🧩 ${p.ctx}</span>`);
    } else {
      chips.push(`<span class="tac-chip">✏️ schéma épuré${p.demo ? ' (figure pure)' : ''}</span>`);
    }
    if (p.lvl) chips.push(`<span class="tac-chip">difficulté ${p.lvl}</span>`);
    chips.push(`<span class="tac-chip">${toFind} coup${toFind > 1 ? 's' : ''} à trouver</span>`);
    return chips.join('');
  }

  function expectedMove() {
    return sanToMove(game.fen(), list[idx].sol[ply]);
  }

  function legalTargets(from) {
    try {
      return game.moves({ square: from, verbose: true }).map(m => ({ to: m.to, capture: !!m.captured }));
    } catch (_) { return []; }
  }

  function attachClicks() {
    const b = $('#tac-board');
    b.onclick = (e) => {
      if (locked) return;
      const sq = BoardRenderer.coordToSquare(b, e.clientX, e.clientY);
      if (!sq) return;
      const arrows = $('#tac-arrows');
      if (!selected) {
        if (!legalTargets(sq).length) return;
        selected = sq;
        BoardRenderer.showMoveHints(arrows, sq, legalTargets(sq));
      } else if (sq === selected) {
        selected = null;
        BoardRenderer.clearArrows(arrows);
        if (free) drawFreeArrows();
      } else {
        const from = selected;
        selected = null;
        BoardRenderer.clearArrows(arrows);
        tryMove(from, sq);
      }
    };
  }

  function tryMove(from, to) {
    if (free) { freeMove(from, to); return; }
    const exp = expectedMove();
    const fb = $('#tac-feedback');
    if (!exp || from !== exp.from || to !== exp.to) {
      // illegal or simply not the solution
      let legal = false;
      try { const g = new Chess(game.fen()); legal = !!g.move({ from, to, promotion: 'q' }); } catch (_) {}
      fb.className = 'guess-feedback wrong';
      if (!legal) fb.innerHTML = "⚠️ Coup illégal. Clique la pièce, puis sa case d'arrivée.";
      else if (list[idx].demo) fb.innerHTML = "↩️ Ce n'est pas le coup <b>du motif</b> — sur un schéma épuré, d'autres coups gagnent aussi : cherche la figure elle-même.";
      else fb.innerHTML = "❌ Ce n'est pas le coup. Réessaie — pense É-C-M (échecs, captures, menaces).";
      return;
    }
    advance(exp);
  }

  function advance(move) {
    const before = game.fen();
    game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    BoardRenderer.render($('#tac-board'), game.fen(), { from: move.from, to: move.to });
    // Ce que le coup vient de créer : flèches + phrase, tout de suite, pendant
    // que la figure est encore sur le plateau.
    lastThreats = threats(before, game.fen(), move);
    if (lastThreats) lastThreats.final = ply + 1 >= list[idx].sol.length;
    const shown = paintThreats();
    ply++;
    if (ply >= list[idx].sol.length) { finishSolved(); return; }
    // opponent's forced reply
    locked = true;
    const reply = expectedMove();
    const myToken = token;
    setTimeout(() => {
      if (myToken !== token) return; // moved on to another puzzle meanwhile
      if (reply) {
        game.move({ from: reply.from, to: reply.to, promotion: reply.promotion || 'q' });
        BoardRenderer.render($('#tac-board'), game.fen(), { from: reply.from, to: reply.to });
        ply++;
      }
      hideThreats();
      locked = false;
      const fb = $('#tac-feedback');
      fb.className = 'guess-feedback';
      fb.innerHTML = '✅ Bien vu ! Continue la séquence.';
    }, shown ? 1500 : 420);
  }

  // ─────────────────────── menaces : flèches + phrase ───────────────────────
  // Vert = ce que la pièce attaque, bleu = ce qu'elle démasque, rouge = échec.
  function paintThreats() {
    const t = lastThreats;
    const box = $('#tac-threats');
    if (!t || (!t.count && !t.mate)) { if (box) box.hidden = true; return false; }
    const arrows = [];
    for (const c of t.checks) arrows.push({ from: c.from, to: c.sq, color: R, opacity: 0.95, width: 7 });
    for (const d of t.direct) arrows.push({ from: d.from, to: d.sq, color: G, opacity: 0.9, width: 6 });
    for (const d of t.discovered) arrows.push({ from: d.from, to: d.sq, color: B, opacity: 0.9, width: 6 });
    // Ambre : la pièce coincée derrière la cible (clouage / enfilade), pour que
    // la ligne se voie sans avoir à l'imaginer.
    for (const b of t.behind) arrows.push({ from: b.from, to: b.sq, color: '#e2b857', opacity: 0.85, width: 5 });
    if (arrows.length) BoardRenderer.drawArrows($('#tac-arrows'), arrows);
    const html = threatSentence(t, t.final !== false);
    if (box && html) {
      box.innerHTML = '<span class="tac-th-title">🎯 Menaces créées</span> ' + html;
      box.hidden = false;
    }
    threatsOn = true;
    return arrows.length > 0;
  }
  function hideThreats() {
    threatsOn = false;
    const box = $('#tac-threats');
    if (box) box.hidden = true;
    BoardRenderer.clearArrows($('#tac-arrows'));
  }
  function toggleThreats() {
    if (threatsOn) hideThreats(); else paintThreats();
    const b = $('#tac-threats-btn');
    if (b) b.classList.toggle('active', threatsOn);
  }

  function finishSolved() {
    locked = true;
    const fb = $('#tac-feedback');
    fb.className = 'guess-feedback right';
    fb.innerHTML = `✅ Résolu — <b>${list[idx].sol.map(sanToFr).join(' ')}</b>`;
    endButtons();
  }

  function showHint() {
    const exp = expectedMove();
    const fb = $('#tac-feedback');
    fb.className = 'guess-feedback';
    fb.innerHTML = '💡 ' + (list[idx].hint || 'Cherche le coup le plus forçant.');
    if (exp) BoardRenderer.highlightSquares($('#tac-arrows'), [exp.from], '#e2b857');
  }

  function solve() {
    if (locked) return;
    locked = true;
    // play out the whole remaining line, arrow on the key move
    const exp = expectedMove();
    if (exp) BoardRenderer.drawArrows($('#tac-arrows'), [{ from: exp.from, to: exp.to, color: G, opacity: 0.9, width: 6 }]);
    const myToken = token;
    const playRest = () => {
      if (myToken !== token) return; // moved on to another puzzle meanwhile
      if (ply >= list[idx].sol.length) {
        const fb = $('#tac-feedback');
        fb.className = 'guess-feedback shown';
        fb.innerHTML = `Solution : <b>${list[idx].sol.map(sanToFr).join(' ')}</b>`;
        endButtons();
        return;
      }
      const mine = ply % 2 === 0;
      const m = expectedMove();
      let shown = false;
      if (m) {
        const before = game.fen();
        game.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
        BoardRenderer.render($('#tac-board'), game.fen(), { from: m.from, to: m.to });
        if (mine) {
          lastThreats = threats(before, game.fen(), m);
          if (lastThreats) lastThreats.final = ply + 1 >= list[idx].sol.length;
          shown = paintThreats();
        }
        else hideThreats();
      }
      ply++;
      setTimeout(playRest, shown ? 1300 : 480);
    };
    setTimeout(playRest, 360);
  }

  // Fin d'exercice : voir/masquer les menaces, continuer à jouer, ou avancer.
  function endButtons() {
    const nav = $('#tac-nav');
    const hasThreats = !!(lastThreats && lastThreats.count);
    nav.innerHTML =
      (hasThreats ? `<button class="train-btn ghost${threatsOn ? ' active' : ''}" id="tac-threats-btn">👁 Menaces</button>` : '') +
      `<button class="train-btn ghost" id="tac-free">🔍 Continuer à jouer</button>` +
      `<button class="train-btn good" id="tac-next">${idx < list.length - 1 ? 'Position suivante ▶' : 'Terminer'}</button>`;
    const tb = $('#tac-threats-btn'); if (tb) tb.onclick = toggleThreats;
    $('#tac-free').onclick = enterFree;
    $('#tac-next').onclick = () => { idx++; render(); };
  }

  // ──────────── « Continuer à jouer » (comme dans les ouvertures) ────────────
  // On reprend la main sur la position atteinte et on joue les DEUX camps ;
  // Stockfish indique son meilleur coup (flèche bleue), l'éval et la suite.
  function enterFree() {
    free = true; locked = false; hideThreats();
    freeHist = [game.fen()];
    renderFree(null);
  }
  function quitFree() {
    free = false; freeToken++; freeBest = null;
    game = new Chess(freeHist[0]);
    BoardRenderer.render($('#tac-board'), game.fen());
    BoardRenderer.clearArrows($('#tac-arrows'));
    locked = true;
    const fb = $('#tac-feedback');
    fb.className = 'guess-feedback shown';
    fb.innerHTML = `Solution : <b>${list[idx].sol.map(sanToFr).join(' ')}</b>`;
    endButtons();
  }
  function freeMove(from, to) {
    const fen = freeHist[freeHist.length - 1];
    let g, m = null;
    try { g = new Chess(fen); m = g.move({ from, to, promotion: 'q' }); } catch (_) { m = null; }
    if (!m) return;
    freeHist.push(g.fen());
    renderFree(m);
  }
  function renderFree(lastMove) {
    const fen = freeHist[freeHist.length - 1];
    game = new Chess(fen);
    BoardRenderer.render($('#tac-board'), fen, lastMove ? { from: lastMove.from, to: lastMove.to } : undefined);
    BoardRenderer.clearArrows($('#tac-arrows'));
    // Sur un coup libre aussi : ce que le coup vient de menacer.
    const box = $('#tac-threats');
    if (box) {
      const t = lastMove ? threats(freeHist[freeHist.length - 2], fen, lastMove) : null;
      const html = t ? threatSentence(t, true) : '';
      if (html) { box.innerHTML = '<span class="tac-th-title">🎯 Menaces créées</span> ' + html; box.hidden = false; }
      else box.hidden = true;
    }
    const fb = $('#tac-feedback');
    fb.className = 'guess-feedback';
    fb.innerHTML = `<div class="oe-explore-status" id="tac-free-status">⏳ Analyse…</div>`;
    const canUndo = freeHist.length > 1;
    const nav = $('#tac-nav');
    nav.innerHTML =
      `<button class="train-btn ghost" id="tac-free-undo"${canUndo ? '' : ' disabled'}>↶ Annuler</button>` +
      `<button class="train-btn ghost" id="tac-free-reset"${canUndo ? '' : ' disabled'}>⟳ Départ</button>` +
      `<button class="train-btn ghost" id="tac-free-quit">✕ Revenir à l'exercice</button>` +
      `<button class="train-btn good" id="tac-next">${idx < list.length - 1 ? 'Suivante ▶' : 'Terminer'}</button>`;
    const u = $('#tac-free-undo'); if (u) u.onclick = () => { if (freeHist.length > 1) { freeHist.pop(); renderFree(null); } };
    const r = $('#tac-free-reset'); if (r) r.onclick = () => { if (freeHist.length > 1) { freeHist = [freeHist[0]]; renderFree(null); } };
    $('#tac-free-quit').onclick = quitFree;
    $('#tac-next').onclick = () => { idx++; render(); };
    analyzeFree(fen, ++freeToken);
  }
  function drawFreeArrows() {
    if (!free) return;
    BoardRenderer.drawArrows($('#tac-arrows'), freeBest
      ? [{ from: freeBest.slice(0, 2), to: freeBest.slice(2, 4), color: B, opacity: 0.9, width: 7 }] : []);
  }
  function pvToFr(fen, pvStr, max) {
    if (!pvStr) return [];
    const g = new Chess(fen); const out = [];
    for (const uci of pvStr.trim().split(/\s+/)) {
      if (out.length >= (max || 5)) break;
      let m; try { m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }); } catch (_) { m = null; }
      if (!m) break;
      out.push(sanToFr(m.san));
    }
    return out;
  }
  function freeStatusHtml(fen, res) {
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    try {
      const g = new Chess(fen);
      if (g.in_checkmate()) return `♚ <b>Échec et mat.</b> Annule pour essayer une autre suite.`;
      if (g.in_stalemate()) return `<b>Pat</b> - nulle. Annule pour essayer une autre suite.`;
      if (g.in_draw()) return `<b>Nulle</b> (matériel / répétition). Annule pour essayer une autre suite.`;
    } catch (_) {}
    const head = `Trait aux <b>${stm === 'w' ? 'Blancs' : 'Noirs'}</b>.`;
    if (!res) return head + ` Moteur indisponible - joue librement, sans suggestion.`;
    let ev;
    if (res.mate != null) {
      const mw = stm === 'w' ? res.mate : -res.mate;
      ev = 'Mat en ' + Math.abs(mw) + (mw > 0 ? ' (Blancs)' : ' (Noirs)');
    } else {
      const w = (stm === 'w' ? res.score : -res.score) / 100;
      ev = (w >= 0 ? '+' : '') + w.toFixed(1);
    }
    const pv = pvToFr(fen, res.pv, 5);
    return `${head} Éval <b>${ev}</b>.` + (pv[0] ? ` Meilleur : <b>${pv[0]}</b> <span class="oe-sugg">(flèche bleue)</span>.` : '')
      + (pv.length > 1 ? `<div class="oe-explore-pv">Suite : ${pv.join(' ')}</div>` : '');
  }
  async function analyzeFree(fen, myToken) {
    freeBest = null;
    const setHtml = (h) => { const e = document.getElementById('tac-free-status'); if (e) e.innerHTML = h; };
    let over = false; try { over = new Chess(fen).game_over(); } catch (_) {}
    if (over || typeof StockfishEngine === 'undefined') { setHtml(freeStatusHtml(fen, null)); return; }
    if (!StockfishEngine.isReady()) {
      try { await StockfishEngine.init(); } catch (_) { setHtml(freeStatusHtml(fen, null)); return; }
    }
    if (myToken !== freeToken || !free) return;
    let res; try { res = await StockfishEngine.evaluate(fen, 'movetime 600'); } catch (_) { res = null; }
    if (myToken !== freeToken || !free) return;
    freeBest = res && res.bestMove ? res.bestMove : null;
    drawFreeArrows();
    setHtml(freeStatusHtml(fen, res));
  }

  return { CATALOG, start, sanToFr, threats, threatSentence, netGain, seeOn, boardOf, attackersOf, attacksFrom };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Tactics;
