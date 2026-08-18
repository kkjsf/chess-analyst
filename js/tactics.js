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
        { fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', sol: ['Nc7+'], demo: true, hint: 'Un échec de cavalier qui attaque aussi la tour du coin.' },
        { fen: 'r3k3/5ppp/8/3N4/8/8/5PPP/4K3 w - - 0 1', sol: ['Nc7+'], demo: true, ctx: `même motif, avec le décor autour`, hint: `Un échec de cavalier qui attaque aussi la tour du coin.` },
        { fen: 'rn1qkb1r/pp3ppp/2p1p3/3p1b2/3Pn2N/2NQB1PP/PPP1PP2/R3KB1R b KQkq - 1 8', sol: ['Nxf2'], mine: `contre Nhn_nh · par correspondance · 24 mai 2026`, game: 'https://www.chess.com/game/daily/974234961', hint: `Une capture au cavalier, qui met la dame et la tour dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
        { fen: '2k1r2r/1pp1qpb1/p2pbn1p/4p1p1/PRBnP3/2NPQNB1/1PP2PPP/5RK1 b - - 7 17', sol: ['Nxc2'], mine: `contre berraresi · rapide · 9 juin 2026`, game: 'https://www.chess.com/game/live/169961967644', hint: `Une capture au cavalier, qui met la dame et la tour dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
        { fen: 'rn1qk1nr/ppp2pp1/8/b3Pb1p/2B1N3/2P2P2/PP4PP/RNBQK2R w KQkq - 1 10', sol: ['Bxf7+'], mine: `contre AeaadAl21 · rapide · 30 juillet 2026`, game: 'https://www.chess.com/game/live/172263716136', hint: `Une capture au fou, avec échec, qui met le cavalier dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
        { fen: 'rn1qk1nr/ppp2pp1/1b6/4P2p/2B5/2P2P2/PP3NPP/RbBQ1RK1 w kq - 0 12', sol: ['Bxf7+'], mine: `contre AeaadAl21 · rapide · 30 juillet 2026`, game: 'https://www.chess.com/game/live/172263716136', hint: `Une capture au fou, avec échec, qui met le cavalier dans le collimateur. Le motif : une seule pièce attaque deux cibles à la fois.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Clouage', en: 'Pin',
      desc: `Une pièce est <b>clouée</b> quand elle ne peut pas bouger sans exposer une pièce plus précieuse derrière elle. Clouage <b>absolu</b> si la pièce protégée est le roi (bouger devient illégal), <b>relatif</b> sinon. Ici le fou b5 cloue le cavalier c6 contre le roi e8.`,
      fen: '4k3/8/2n5/1B6/8/8/8/4K3', arrows: [{ from: 'b5', to: 'e8', color: G }],
      puzzles: [
        { fen: '4k3/8/4n3/3P4/8/8/4R3/4K3 w - - 0 1', sol: ['dxe6'], hint: 'Le cavalier est cloué sur le roi : il ne peut pas fuir. Prends-le.' },
        { fen: 'r3k3/ppp5/4n3/3P4/8/8/PPP1R3/R3K3 w - - 0 1', sol: ['dxe6'], ctx: `même motif, avec le décor autour`, hint: `Le cavalier est cloué sur le roi : il ne peut pas fuir. Prends-le.` },
        { fen: 'r1bqkb1r/pppp1p1p/5np1/4p3/2BnP3/2Q5/PPP2PPP/RNB1K1NR b KQkq - 1 6', sol: ['Bb4'], mine: `contre nemathkhan · rapide · 31 juillet 2026`, game: 'https://www.chess.com/game/live/172355432564', hint: `Un coup de fou, sans échec ni capture, qui met la dame dans le collimateur. Le motif : une pièce clouée ne peut pas fuir.` },
        { fen: 'r1bqkb1r/pppp1p1p/2n2np1/4p3/2B1P3/2Q2N2/PPP2PPP/RNB1K2R b KQkq - 3 7', sol: ['Bb4'], mine: `contre nemathkhan · rapide · 31 juillet 2026`, game: 'https://www.chess.com/game/live/172355432564', hint: `Un coup de fou, sans échec ni capture, qui met la dame dans le collimateur. Le motif : une pièce clouée ne peut pas fuir.` },
        { fen: 'r3k2r/pppqnpp1/8/4n1Bp/2B4P/2P2P2/PP3KP1/1R1QR3 w kq - 1 17', sol: ['Rxe5'], mine: `contre AeaadAl21 · rapide · 30 juillet 2026`, game: 'https://www.chess.com/game/live/172263716136', hint: `Une capture à la tour, qui met le cavalier dans le collimateur. Le motif : une pièce clouée ne peut pas fuir.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Enfilade', en: 'Skewer',
      desc: `L'inverse du clouage : on <b>attaque le roi (ou une pièce de valeur) sur une ligne</b> ; il est forcé de s'écarter, et la pièce <b>moins précieuse placée derrière lui</b> tombe. Ici la tour fait échec sur la 8ᵉ rangée — le roi s'écarte, la dame derrière est perdue.`,
      fen: 'q3k2R/8/8/8/8/8/8/4K3', arrows: [{ from: 'h8', to: 'a8', color: G }],
      puzzles: [
        { fen: 'q3k3/8/8/8/8/8/8/4K2R w - - 0 1', sol: ['Rh8+', 'Ke7', 'Rxa8'], hint: 'Donne échec au roi sur la dernière rangée : il s\'écarte, et la dame derrière lui ne peut plus s\'échapper.' },
        { fen: 'q3k3/pp3pp1/8/8/8/8/PP3PP1/4K2R w - - 0 1', sol: ['Rh8+', 'Ke7', 'Rxa8'], ctx: `même motif, avec le décor autour`, hint: `Donne échec au roi sur la dernière rangée : il s'écarte, et la dame derrière lui ne peut plus s'échapper.` },
        { fen: 'rnbqkbnr/p4p1p/2pp2p1/1p2p1N1/4P3/1B6/PPPP1PPP/RNBQK2R b KQkq - 1 6', sol: ['Qxg5'], mine: `contre D3kA05 · par correspondance · 13 mai 2026`, game: 'https://www.chess.com/game/daily/970822485', hint: `Une capture à la dame. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
        { fen: 'r1bqk2r/ppp1p2p/2n2npb/3p1p2/3P3Q/2P1P3/PP3PPP/RNB1KBNR w KQkq - 1 7', sol: ['Qxh6'], mine: `contre kantorbarna · par correspondance · 24 mai 2026`, game: 'https://www.chess.com/game/daily/971721259', hint: `Une capture à la dame. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
        { fen: 'rnbqk2r/pppp1ppp/8/2b1N3/2B1n3/5P2/PPPP2PP/RNBQK2R b KQkq - 0 5', sol: ['Qh4+'], mine: `contre alfielikesplayingchess · par correspondance · 25 juillet 2026`, game: 'https://www.chess.com/game/daily/1002471850', hint: `Un échec de dame. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
        { fen: 'rnbqk1nr/pppp2pp/5p2/2b5/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5', sol: ['Qh5+'], mine: `contre Bclow30 · par correspondance · 8 août 2026`, game: 'https://www.chess.com/game/daily/1002318968', hint: `Un échec de dame, qui met le fou dans le collimateur. Le motif : échec sur une ligne, et la pièce restée derrière tombe.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attaque double', en: 'Double attack',
      desc: `Terme général : un coup crée <b>deux menaces simultanées</b> impossibles à parer en un seul temps. Ici la dame e4 attaque à la fois le cavalier b7 et le fou e7.`,
      fen: '6k1/1n2b3/8/8/4Q3/8/8/4K3', arrows: [{ from: 'e4', to: 'b7', color: G }, { from: 'e4', to: 'e7', color: G }],
      puzzles: [
        { fen: '6k1/1r6/8/8/8/8/8/3Q2K1 w - - 0 1', sol: ['Qd5+', 'Kf8', 'Qxb7'], hint: 'Un échec en diagonale qui vise aussi la tour à l\'autre bout.' },
        { fen: 'rn2kb1r/pppbqppp/3p4/1Q6/8/3B1N2/PPPP1KPP/RNB4R w kq - 2 8', sol: ['Qxb7'], mine: `contre Nhn_nh · par correspondance · 20 juin 2026`, game: 'https://www.chess.com/game/daily/984858214', hint: `Une capture à la dame, qui met la tour et le cavalier dans le collimateur. Le motif : deux menaces d'un coup, impossible de parer les deux.` },
        { fen: 'r2k1r2/1pp3qp/p3p3/b3N2Q/2pn4/P1N5/1P3PPP/2R2RK1 w - - 0 19', sol: ['Qh4+'], mine: `contre lyssy96 · par correspondance · 12 juillet 2026`, game: 'https://www.chess.com/game/daily/996475536', hint: `Un échec de dame, qui met le cavalier dans le collimateur. Le motif : deux menaces d'un coup, impossible de parer les deux.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attaque à la découverte', en: 'Discovered attack',
      desc: `On déplace une pièce qui <b>démasque l'attaque d'une autre</b> derrière elle. Le cavalier e5 quitte la diagonale (flèche bleue) et le fou b2 attaque alors le roi h8. Si la pièce qui s'écarte capture ou menace en partant, l'effet est double.`,
      fen: '7k/8/8/4N3/8/8/1B6/4K3', arrows: [{ from: 'b2', to: 'h8', color: G }, { from: 'e5', to: 'f7', color: B }],
      puzzles: [
        { fen: '7k/4q3/8/4N3/8/8/1B6/6K1 w - - 0 1', sol: ['Nc6+', 'Kg8', 'Nxe7+'], demo: true, hint: 'En s\'écartant, le cavalier ouvre l\'échec du fou — et atterrit sur la dame.' },
        { fen: '2k1r2r/1pp1qpb1/p2p1n1p/4p1p1/PRB1P1b1/2NPQ1B1/1PP2PPP/5RK1 b - - 2 19', sol: ['d5'], mine: `contre berraresi · rapide · 9 juin 2026`, game: 'https://www.chess.com/game/live/169961967644', hint: `Un coup de pion, sans échec ni capture, qui met le fou dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
        { fen: 'r2qkb1r/ppp2ppp/2n1b3/3np3/2B5/2N2N2/PPPP1PPP/R1BQR1K1 b kq - 3 7', sol: ['Nxc3'], mine: `contre nishKan99 · rapide · 30 juillet 2026`, game: 'https://www.chess.com/game/live/172307285588', hint: `Une capture au cavalier, qui met la dame dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
        { fen: 'rnb1k2r/ppp1qppp/3p1n2/4b1B1/2BP4/8/PPP2PPP/RN2QRK1 b kq - 2 9', sol: ['Bxd4'], mine: `contre Jyun1210 · rapide · 2 juin 2026`, game: 'https://www.chess.com/game/live/169598836284', hint: `Une capture au fou. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
        { fen: 'r1b1kb1r/p2nqppp/2p5/1p6/3PnB2/1B6/PPP2PPP/RN1QK2R b KQkq - 1 10', sol: ['Nc3+'], mine: `contre IntotheWildd88 · rapide · 29 juillet 2026`, game: 'https://www.chess.com/game/live/172262532148', hint: `Un échec de cavalier, qui met la dame et le cavalier dans le collimateur. Le motif : une pièce s'écarte et démasque l'attaque de celle qui est derrière.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Double échec', en: 'Double check',
      desc: `Cas extrême de la découverte : <b>deux pièces donnent échec en même temps</b>. Impossible de capturer ou d'interposer (cela n'arrête qu'un seul échec) — <b>le roi doit bouger</b>. Souvent dévastateur, voire matant.`,
      fen: '7k/5N2/8/8/8/8/1B6/6K1', arrows: [{ from: 'f7', to: 'h8', color: R }, { from: 'b2', to: 'h8', color: R }],
      puzzles: [
        { fen: '6rk/6pp/8/4N3/8/8/1B6/6K1 w - - 0 1', sol: ['Nf7#'], hint: 'Un saut qui donne deux échecs d\'un coup : le roi est étouffé, aucune fuite.' },
        { fen: '2b3rk/p1p3pp/1p6/4N3/8/1P6/PBP5/2B3K1 w - - 0 1', sol: ['Nf7#'], ctx: `même motif, avec le décor autour`, hint: `Un saut qui donne deux échecs d'un coup : le roi est étouffé, aucune fuite.` },
        { fen: '1k1r2nr/ppp2ppp/8/1N2pB2/1BP3q1/5n2/PP2KP1P/R2Q3R b - - 3 16', sol: ['Ng1+'], mine: `contre Affan_003 · rapide · 29 juillet 2026`, game: 'https://www.chess.com/game/live/172248197198', hint: `Un échec de cavalier. Le motif : deux échecs simultanés : le roi doit bouger, rien d'autre.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Déviation', en: 'Deflection',
      desc: `On <b>force une pièce à quitter une tâche défensive</b> — souvent par une capture ou un sacrifice. Ici la tour g8 est attirée loin de la défense par un sacrifice de dame, et le mat suit.`,
      fen: '5r1k/6pp/7N/8/8/8/Q7/6K1', arrows: [{ from: 'a2', to: 'g8', color: R }],
      puzzles: [
        { fen: '5r1k/6pp/7N/8/8/8/Q7/6K1 w - - 0 1', sol: ['Qg8+', 'Rxg8', 'Nf7#'], hint: 'Sacrifie la dame pour attirer la tour : la case f7 devient mortelle.' },
        { fen: 'r4r1k/1p1p2pp/2p4N/8/8/2P5/QP1P4/R5K1 w - - 0 1', sol: ['Qg8+', 'Rxg8', 'Nf7#'], ctx: `même motif, avec le décor autour`, hint: `Sacrifie la dame pour attirer la tour : la case f7 devient mortelle.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attraction', en: 'Decoy',
      desc: `À l'inverse de la déviation, on <b>attire une pièce (souvent le roi) sur une case piégée</b>, généralement par un sacrifice, pour enchaîner avec une fourchette, un clouage ou un mat. Sur le diagramme, <b>Dxg7+</b> (rouge) attire le roi sur g7 — case piégée : le cavalier saute alors en e6 (bleu) et fourche le roi et la dame c5.`,
      fen: 'r5k1/pp1Q1p1p/8/2q3N1/8/7P/5PP1/R5K1',
      arrows: [{ from: 'd7', to: 'g7', color: R }, { from: 'g5', to: 'e6', color: B }],
      puzzles: [
        { fen: '6k1/3Q4/8/2q3N1/8/8/7K/8 w - - 0 1', sol: ['Qg7+', 'Kxg7', 'Ne6+', 'Kg8', 'Nxc5'], demo: true, hint: 'Sacrifie la dame en g7 : le roi est forcé de la prendre… et tombe dans une fourchette de cavalier qui rafle la dame noire.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Surcharge', en: 'Overloading',
      desc: `Une pièce a <b>trop de tâches défensives</b> : elle garde deux choses à la fois. On capture l'une — la pièce doit reprendre — et l'autre tombe. Ici la dame e7 défend à la fois la tour d8 et le fou a3 : une de trop.`,
      fen: '3r2k1/4qppp/8/8/8/b7/5PPP/2BR2K1', arrows: [{ from: 'e7', to: 'd8', color: B }, { from: 'e7', to: 'a3', color: B }],
      puzzles: [
        { fen: 'rnbqk2r/ppp2ppp/3p1n2/2b1N3/2B1P3/2N5/PPPP1PPP/R1BQK2R b KQkq - 1 5', sol: ['dxe5'], mine: `contre Fvskippy · par correspondance · 15 juillet 2026`, game: 'https://www.chess.com/game/daily/997035532', hint: `Une capture au pion. Le motif : supprime la pièce qui garde tout, le reste s'écroule.` },
        { fen: 'rnbq1rk1/p1p2Bpp/1p1p1n2/2b1p1N1/4P3/3P4/PPP1QPPP/RNB1K2R b KQ - 0 7', sol: ['Rxf7'], mine: `contre neivel55 · par correspondance · 7 juillet 2026`, game: 'https://www.chess.com/game/daily/995137992', hint: `Une capture à la tour. Le motif : supprime la pièce qui garde tout, le reste s'écroule.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Interférence', en: 'Interference',
      desc: `On <b>coupe la ligne entre une pièce défensive et ce qu'elle protège</b>, en interposant une pièce (parfois en la sacrifiant). La communication est rompue le temps d'un coup décisif.`,
      fen: '3r2k1/5ppp/8/8/8/8/b7/3R2K1', arrows: [{ from: 'a2', to: 'd5', color: B }, { from: 'd8', to: 'd1', color: B }] },
    { cat: '⚔️ Tactiques', name: 'Rayon X', en: 'X-ray',
      desc: `Une pièce longue exerce une pression <b>à travers</b> une pièce adverse, comme si celle-ci était transparente — soit pour attaquer une cible au-delà, soit pour défendre une case derrière l'écran.`,
      fen: '3r2k1/8/8/8/8/8/3R4/3RK3', arrows: [{ from: 'd1', to: 'd8', color: G }],
      puzzles: [
        { fen: 'q7/8/8/8/k7/8/8/3Q2K1 w - - 0 1', sol: ['Qa1+', 'Kb4', 'Qxa8'], hint: 'Donne échec sur la colonne a : le roi et la dame noire sont alignés. Le roi doit s\'écarter et laisse tomber la dame derrière lui (embrochade).' },
        { fen: 'q7/5ppp/8/8/k7/8/5PPP/3Q2K1 w - - 0 1', sol: ['Qa1+', 'Kb4', 'Qxa8'], ctx: `même motif, avec le décor autour`, hint: `Donne échec sur la colonne a : le roi et la dame noire sont alignés. Le roi doit s'écarter et laisse tomber la dame derrière lui (embrochade).` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Coup intermédiaire', en: 'Zwischenzug',
      desc: `Le <b>zwischenzug</b> (« coup intermédiaire ») : au lieu de jouer le coup attendu — typiquement une reprise — on <b>intercale d'abord un coup plus fort</b> (souvent un échec ou une menace), puis on revient à l'idée initiale avec un temps gagné. Sur le diagramme, la capture Dxd3 (bleu) ne va pas s'envoler : on intercale <b>Txg7+</b> (rouge), l'adversaire doit reprendre, et la dame tombe ensuite avec un temps de plus. Toujours chercher : « ai-je un coup encore plus fort avant de reprendre ? »`,
      fen: '6k1/pp3prp/8/8/8/3q4/PP2QP1P/4K1R1',
      arrows: [{ from: 'g1', to: 'g7', color: R }, { from: 'e2', to: 'd3', color: B }],
      puzzles: [
        { fen: '6k1/6r1/8/8/8/3q4/4Q3/4K1R1 w - - 0 1', sol: ['Rxg7+', 'Kxg7', 'Qxd3'], demo: true, hint: 'Tu peux prendre la dame en d3, mais joue d\'abord l\'échec qui s\'impose : capture en g7 avec échec, puis encaisse la dame avec un temps gagné.' },
        { fen: 'r5k1/1p4r1/p7/2p5/2P5/P2q4/1P2Q3/R3K1R1 w - - 0 1', sol: ['Rxg7+', 'Kxg7', 'Qxd3'], ctx: `même motif, avec le décor autour`, hint: `Tu peux prendre la dame en d3, mais joue d'abord l'échec qui s'impose : capture en g7 avec échec, puis encaisse la dame avec un temps gagné.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Desperado', en: 'Desperado',
      desc: `Une pièce <b>condamnée de toute façon</b> se « suicide » utilement : avant d'être perdue, elle capture le plus possible, ou se sacrifie pour un pat / une combinaison. « Tant qu'à mourir, faisons-le cher. »`,
      fen: '6k1/5ppp/8/8/8/2n5/5PPP/3N2K1', arrows: [{ from: 'c3', to: 'd1', color: R }],
      puzzles: [
        { fen: '4k3/3q4/3p4/4N3/8/8/8/4K3 w - - 0 1', sol: ['Nxd7'], hint: 'Le pion d6 attaque ton cavalier : il est perdu de toute façon. Avant de tomber, fais-lui capturer la dame.' },
        { fen: 'r3k3/pppq4/3p4/4N3/8/8/PPP5/R3K3 w - - 0 1', sol: ['Nxd7'], ctx: `même motif, avec le décor autour`, hint: `Le pion d6 attaque ton cavalier : il est perdu de toute façon. Avant de tomber, fais-lui capturer la dame.` },
      ] },
    { cat: '⚔️ Tactiques', name: 'Moulin', en: 'Windmill',
      desc: `Le <b>moulin</b> : une série d'<b>échecs à la découverte</b> alternés qui raflent le matériel adverse coup après coup. La pièce qui découvre l'échec revient se placer, redonne échec, et rafle encore — la machine tourne tant qu'il reste à prendre.`,
      fen: '6k1/5ppp/8/8/8/8/1B6/4R1K1', arrows: [{ from: 'b2', to: 'g7', color: G }, { from: 'e1', to: 'e7', color: R }],
      puzzles: [
        { fen: '7k/1p3pRp/5B2/8/8/Q7/8/6K1 w - - 0 1', sol: ['Rxf7+', 'Kg8', 'Rg7+', 'Kh8', 'Rxb7+'], demo: true, hint: 'Le fou f6 cloue le roi en h8. La tour découvre l\'échec en quittant g7, revient redonner échec, repart… et rafle un pion à chaque tour de moulin.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Dégagement', en: 'Clearance',
      desc: `On <b>libère une case ou une ligne</b> pour une autre pièce, souvent en y sacrifiant la pièce qui gênait. Le tempo et la case dégagée valent plus que le matériel cédé.`,
      fen: '6k1/5ppp/8/3B4/8/8/8/3Q2K1', arrows: [{ from: 'd5', to: 'a8', color: B }, { from: 'd1', to: 'd8', color: G }],
      puzzles: [
        { fen: '4k3/3R4/8/8/8/8/1B6/3QK3 w - - 0 1', sol: ['Rd8+', 'Ke7', 'Qd7#'], demo: true, hint: 'La tour occupe d7, la case dont la dame a besoin. Joue Rd8+ : la tour dégage d7 en donnant échec, puis la dame s\'y installe pour mater (le fou b2 coupe la fuite en f6).' },
        { fen: '4k3/3R1ppp/8/8/8/8/1B3PPP/3QK3 w - - 0 1', sol: ['Rd8+', 'Ke7', 'Qd7#'], ctx: `même motif, avec le décor autour`, hint: `La tour occupe d7, la case dont la dame a besoin. Joue Rd8+ : la tour dégage d7 en donnant échec, puis la dame s'y installe pour mater (le fou b2 coupe la fuite en f6).` },
      ] },

    // Les mats classiques ont leur propre cours dédié (js/mates.js, onglet « Mats »).

    // ════════ 🧠 Méthode & calcul ════════
    { cat: '🧠 Méthode & calcul', name: 'Méthode CCT (É-C-M)', en: 'Checks, Captures, Threats',
      desc: `Avant chaque coup, passe en revue les coups <b>forçants</b> dans cet ordre : <b>Échecs</b>, <b>Captures</b>, <b>Menaces</b> (en anglais <i>Checks, Captures, Threats</i>). Ce sont les coups qui limitent le plus les réponses adverses — donc ceux qui cachent les tactiques. Sur le diagramme, la revue donne trois coups à calculer : l'échec <b>Fxf7+</b> (rouge), la capture <b>Cxf7</b> (bleu), la menace <b>Dh5</b> (vert). C'est le premier réflexe pour ne rien rater.`,
      fen: 'r1bq1rk1/ppp2ppp/2n2n2/2b1N3/2BP4/2N5/1PP2PPP/R1BQ1RK1',
      arrows: [{ from: 'c4', to: 'f7', color: R }, { from: 'e5', to: 'f7', color: B }, { from: 'd1', to: 'h5', color: G }] },
    { cat: '🧠 Méthode & calcul', name: 'Coups forçants', en: 'Forcing moves',
      desc: `Un coup <b>forçant</b> ne laisse qu'une poignée de réponses (échec, capture, menace directe). On calcule d'abord les lignes forçantes : elles sont courtes, nettes, et c'est là que vivent les combinaisons. Sur le diagramme (une de tes parties), <b>Dxd8+</b> (rouge) est le forçant absolu : les Noirs n'ont <b>qu'un seul coup légal</b>, …Rxd8 (vert). Une ligne comme celle-là se calcule jusqu'au bout sans se tromper.`,
      fen: 'rnbqkbnr/ppp2ppp/8/4P3/4p3/5N2/PPP2PPP/RNBQKB1R',
      arrows: [{ from: 'd1', to: 'd8', color: R }, { from: 'e8', to: 'd8', color: G }] },
    { cat: '🧠 Méthode & calcul', name: 'Coups candidats', en: 'Candidate moves',
      desc: `Avant de calculer, dresse la <b>liste des 2-4 coups les plus prometteurs</b> (les « candidats »), puis examine-les un par un. Évite de tomber amoureux du premier coup vu : compare-les avant de te décider. Le diagramme vient d'une de tes parties : trois coups s'y valent presque (flèches bleues) - …h6, …Cxd5 et …Fe6. Aucun ne gagne quoi que ce soit : c'est exactement le genre de position où il faut lister ses candidats, puis les comparer un par un.`,
      fen: 'r1bq1rk1/1pp2ppp/p1np1n2/2bNp3/P1B1P3/3P1N2/1PP2PPP/R1BQ1RK1',
      arrows: [{ from: 'h7', to: 'h6', color: B }, { from: 'f6', to: 'd5', color: B }, { from: 'c8', to: 'e6', color: B }] },
    { cat: '🧠 Méthode & calcul', name: 'Coup tranquille', en: 'Quiet move',
      desc: `Toutes les combinaisons ne sont pas faites d'échecs. Un <b>coup tranquille</b> — sans échec ni capture — au milieu d'une séquence (création d'une menace imparable, amélioration décisive d'une pièce) est souvent le plus dur à voir… et le plus fort. Sur le diagramme, tiré d'une de tes parties, <b>Cd5</b> (rouge) ne prend rien et ne donne pas échec : il attaque la dame f6 et la case c7 en même temps, et vaut déjà une pièce.`,
      fen: 'rnb1k2r/pppp1ppp/5q1n/2b1p3/4P3/2NP1N2/PPP2PPP/R1BQKB1R',
      arrows: [{ from: 'c3', to: 'd5', color: R }, { from: 'd5', to: 'f6', color: G }],
      puzzles: [
        { fen: 'r3kb1r/ppp1pppp/2nqbn2/3N4/2BpP3/1P1P4/P1P2PPP/R1BQK1NR w KQkq - 1 7', sol: ['Bf4'], mine: `contre okekam · rapide · 6 juin 2026`, game: 'https://www.chess.com/game/live/169800227490', hint: `Un coup de fou, sans échec ni capture, qui met la dame dans le collimateur. Le motif : ni échec ni capture, mais une menace imparable.` },
        { fen: 'r1bqkbnr/ppp2ppp/2np4/3N4/2BNPB2/6P1/PPP2P1P/R2Q1RK1 w kq - 1 11', sol: ['Nb5'], mine: `contre Loseafer · rapide · 10 août 2026`, game: 'https://www.chess.com/game/live/172784117908', hint: `Un coup de cavalier, sans échec ni capture. Le motif : ni échec ni capture, mais une menace imparable.` },
      ] },

    // ════════ ♟ Concepts stratégiques ════════
    { cat: '♟ Concepts stratégiques', name: 'Pion passé', en: 'Passed pawn',
      desc: `Un pion qui n'a <b>plus aucun pion adverse</b> sur sa colonne ni les colonnes voisines. Le pion e5 file vers la promotion sans opposition — un atout majeur, surtout en finale. « Un pion passé doit être poussé. »`,
      fen: '6k1/pp5p/8/4P3/8/8/8/6K1', arrows: [{ from: 'e5', to: 'e8', color: G }],
      puzzles: [
        { fen: '1rbq1rk1/2p2p1p/3p1p2/1pbBp3/1nP1P3/1P1P1N2/5PPP/R1BQ1RK1 b - c3 0 13', sol: ['c6'], positional: true, mine: `contre Balddarkhorse · par correspondance · 10 août 2026`, game: 'https://www.chess.com/game/daily/1010656384', hint: `Un coup de pion, sans échec ni capture, qui met le fou dans le collimateur. Le motif : un pion qui file vers la promotion vaut une pièce.` },
        { fen: '2r1k2r/1p1n1p2/p3Rq1Q/1p6/8/P1PP3P/2P2PP1/5RK1 b - - 0 23', sol: ['fxe6'], mine: `contre P_krazy · rapide · 29 juillet 2026`, game: 'https://www.chess.com/game/live/172248806458', hint: `Une capture au pion. Le motif : un pion qui file vers la promotion vaut une pièce.` },
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
      fen: '4k3/8/4K3/4P3/8/8/8/8', arrows: [] },
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

  // Resolve an English SAN to {from, to, promotion} on a given fen.
  function sanToMove(fen, san) {
    try {
      const g = new Chess(fen);
      const m = g.move(san, { sloppy: true });
      return m ? { from: m.from, to: m.to, promotion: m.promotion } : null;
    } catch (_) { return null; }
  }

  // ───────────────────────── practice overlay ─────────────────────────
  let list = [], idx = 0, ply = 0, selected = null, locked = false, game = null, motifName = '';
  // Bumped on every position change / close so a queued reply or solve timer
  // from the previous puzzle can't mutate the next one after it fires.
  let token = 0;

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
    token++;
    const ov = $('#tactics-overlay');
    if (ov) ov.hidden = true;
    document.body.classList.remove('guess-open');
  }

  function render() {
    token++;
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
      chips.push(`<span class="tac-chip real">🎮 vraie partie — ${p.real}${link}</span>`);
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
      } else {
        const from = selected;
        selected = null;
        BoardRenderer.clearArrows(arrows);
        tryMove(from, sq);
      }
    };
  }

  function tryMove(from, to) {
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
    game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    BoardRenderer.render($('#tac-board'), game.fen(), { from: move.from, to: move.to });
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
      locked = false;
      const fb = $('#tac-feedback');
      fb.className = 'guess-feedback';
      fb.innerHTML = '✅ Bien vu ! Continue la séquence.';
    }, 420);
  }

  function finishSolved() {
    locked = true;
    const fb = $('#tac-feedback');
    fb.className = 'guess-feedback right';
    fb.innerHTML = `✅ Résolu — <b>${list[idx].sol.map(sanToFr).join(' ')}</b>`;
    nextButton();
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
    if (exp) BoardRenderer.drawArrows($('#tac-arrows'), [{ from: exp.from, to: exp.to, color: '#56b886', opacity: 0.9, width: 6 }]);
    const myToken = token;
    const playRest = () => {
      if (myToken !== token) return; // moved on to another puzzle meanwhile
      if (ply >= list[idx].sol.length) {
        const fb = $('#tac-feedback');
        fb.className = 'guess-feedback shown';
        fb.innerHTML = `Solution : <b>${list[idx].sol.map(sanToFr).join(' ')}</b>`;
        nextButton();
        return;
      }
      const m = expectedMove();
      if (m) { game.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' }); BoardRenderer.render($('#tac-board'), game.fen(), { from: m.from, to: m.to }); }
      ply++;
      setTimeout(playRest, 480);
    };
    setTimeout(playRest, 360);
  }

  function nextButton() {
    const nav = $('#tac-nav');
    nav.innerHTML = `<button class="train-btn good" id="tac-next">${idx < list.length - 1 ? 'Position suivante ▶' : 'Terminer'}</button>`;
    $('#tac-next').onclick = () => { idx++; render(); };
  }

  return { CATALOG, start, sanToFr };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Tactics;
