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
        { fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', sol: ['Nc7+'], hint: 'Un échec de cavalier qui attaque aussi la tour du coin.' },
        { fen: '4k3/8/2n1b3/8/3P4/8/8/4K3 w - - 0 1', sol: ['d5'], hint: 'Un pion qui pique deux pièces mineures en même temps.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Clouage', en: 'Pin',
      desc: `Une pièce est <b>clouée</b> quand elle ne peut pas bouger sans exposer une pièce plus précieuse derrière elle. Clouage <b>absolu</b> si la pièce protégée est le roi (bouger devient illégal), <b>relatif</b> sinon. Ici le fou b5 cloue le cavalier c6 contre le roi e8.`,
      fen: '4k3/8/2n5/1B6/8/8/8/4K3', arrows: [{ from: 'b5', to: 'e8', color: G }],
      puzzles: [
        { fen: '4k3/8/4n3/3P4/8/8/4R3/4K3 w - - 0 1', sol: ['dxe6'], hint: 'Le cavalier est cloué sur le roi : il ne peut pas fuir. Prends-le.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Enfilade', en: 'Skewer',
      desc: `L'inverse du clouage : on <b>attaque le roi (ou une pièce de valeur) sur une ligne</b> ; il est forcé de s'écarter, et la pièce <b>moins précieuse placée derrière lui</b> tombe. Ici la tour fait échec sur la 8ᵉ rangée — le roi s'écarte, la dame derrière est perdue.`,
      fen: 'q3k2R/8/8/8/8/8/8/4K3', arrows: [{ from: 'h8', to: 'a8', color: G }],
      puzzles: [
        { fen: 'q3k3/8/8/8/8/8/8/4K2R w - - 0 1', sol: ['Rh8+', 'Ke7', 'Rxa8'], hint: 'Donne échec au roi sur la dernière rangée : il s\'écarte, et la dame derrière lui ne peut plus s\'échapper.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attaque double', en: 'Double attack',
      desc: `Terme général : un coup crée <b>deux menaces simultanées</b> impossibles à parer en un seul temps. Ici la dame e4 attaque à la fois le cavalier b7 et le fou e7.`,
      fen: '6k1/1n2b3/8/8/4Q3/8/8/4K3', arrows: [{ from: 'e4', to: 'b7', color: G }, { from: 'e4', to: 'e7', color: G }],
      puzzles: [
        { fen: '6k1/1r6/8/8/8/8/8/3Q2K1 w - - 0 1', sol: ['Qd5+', 'Kf8', 'Qxb7'], hint: 'Un échec en diagonale qui vise aussi la tour à l\'autre bout.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attaque à la découverte', en: 'Discovered attack',
      desc: `On déplace une pièce qui <b>démasque l'attaque d'une autre</b> derrière elle. Le cavalier e5 quitte la diagonale (flèche bleue) et le fou b2 attaque alors le roi h8. Si la pièce qui s'écarte capture ou menace en partant, l'effet est double.`,
      fen: '7k/8/8/4N3/8/8/1B6/4K3', arrows: [{ from: 'b2', to: 'h8', color: G }, { from: 'e5', to: 'f7', color: B }],
      puzzles: [
        { fen: '7k/4q3/8/4N3/8/8/1B6/6K1 w - - 0 1', sol: ['Nc6+', 'Kg8', 'Nxe7+'], hint: 'En s\'écartant, le cavalier ouvre l\'échec du fou — et atterrit sur la dame.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Double échec', en: 'Double check',
      desc: `Cas extrême de la découverte : <b>deux pièces donnent échec en même temps</b>. Impossible de capturer ou d'interposer (cela n'arrête qu'un seul échec) — <b>le roi doit bouger</b>. Souvent dévastateur, voire matant.`,
      fen: '5N1k/8/8/8/8/8/1B6/6K1', arrows: [{ from: 'f7', to: 'h8', color: R }, { from: 'b2', to: 'h8', color: R }],
      puzzles: [
        { fen: '6rk/6pp/8/4N3/8/8/1B6/6K1 w - - 0 1', sol: ['Nf7#'], hint: 'Un saut qui donne deux échecs d\'un coup : le roi est étouffé, aucune fuite.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Déviation', en: 'Deflection',
      desc: `On <b>force une pièce à quitter une tâche défensive</b> — souvent par une capture ou un sacrifice. Ici la tour g8 est attirée loin de la défense par un sacrifice de dame, et le mat suit.`,
      fen: '5r1k/6pp/7N/8/8/8/Q7/6K1', arrows: [{ from: 'a2', to: 'g8', color: R }],
      puzzles: [
        { fen: '5r1k/6pp/7N/8/8/8/Q7/6K1 w - - 0 1', sol: ['Qg8+', 'Rxg8', 'Nf7#'], hint: 'Sacrifie la dame pour attirer la tour : la case f7 devient mortelle.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Attraction', en: 'Decoy',
      desc: `À l'inverse de la déviation, on <b>attire une pièce (souvent le roi) sur une case piégée</b>, généralement par un sacrifice, pour enchaîner avec une fourchette, un clouage ou un mat. Exemple classique : un échec de dame que le roi est obligé de prendre… pour tomber aussitôt dans une fourchette de cavalier.` },
    { cat: '⚔️ Tactiques', name: 'Surcharge', en: 'Overloading',
      desc: `Une pièce a <b>trop de tâches défensives</b> : elle garde deux choses à la fois. On capture l'une — la pièce doit reprendre — et l'autre tombe. Ici la dame e7 défend à la fois la tour d8 et le fou a3 : une de trop.`,
      fen: '3r2k1/4qppp/8/8/8/b7/5PPP/2BR2K1', arrows: [{ from: 'e7', to: 'd8', color: B }, { from: 'e7', to: 'a3', color: B }],
      puzzles: [
        { fen: '3r2k1/4qppp/8/8/8/b7/5PPP/2BR2K1 w - - 0 1', sol: ['Rxd8+', 'Qxd8', 'Bxa3'], hint: 'La dame garde la tour d8 ET le fou a3 — une de trop. Force-la à reprendre avec un échec, puis encaisse l\'autre.' },
      ] },
    { cat: '⚔️ Tactiques', name: 'Interférence', en: 'Interference',
      desc: `On <b>coupe la ligne entre une pièce défensive et ce qu'elle protège</b>, en interposant une pièce (parfois en la sacrifiant). La communication est rompue le temps d'un coup décisif.`,
      fen: '3r2k1/5ppp/8/8/8/8/b7/3R2K1', arrows: [{ from: 'a2', to: 'd5', color: B }, { from: 'd8', to: 'd1', color: B }] },
    { cat: '⚔️ Tactiques', name: 'Rayon X', en: 'X-ray',
      desc: `Une pièce longue exerce une pression <b>à travers</b> une pièce adverse, comme si celle-ci était transparente — soit pour attaquer une cible au-delà, soit pour défendre une case derrière l'écran.`,
      fen: '3r2k1/8/8/8/8/8/3R4/3RK3', arrows: [{ from: 'd1', to: 'd8', color: G }] },
    { cat: '⚔️ Tactiques', name: 'Coup intermédiaire', en: 'Zwischenzug',
      desc: `Le <b>zwischenzug</b> (« coup intermédiaire ») : au lieu de jouer le coup attendu — typiquement une reprise — on <b>intercale d'abord un coup plus fort</b> (souvent un échec ou une menace), puis on revient à l'idée initiale avec un temps gagné. Toujours chercher : « ai-je un coup encore plus fort avant de reprendre ? »` },
    { cat: '⚔️ Tactiques', name: 'Desperado', en: 'Desperado',
      desc: `Une pièce <b>condamnée de toute façon</b> se « suicide » utilement : avant d'être perdue, elle capture le plus possible, ou se sacrifie pour un pat / une combinaison. « Tant qu'à mourir, faisons-le cher. »`,
      fen: '6k1/5ppp/8/8/8/2n5/5PPP/3N2K1', arrows: [{ from: 'c3', to: 'd1', color: R }] },
    { cat: '⚔️ Tactiques', name: 'Moulin', en: 'Windmill',
      desc: `Le <b>moulin</b> : une série d'<b>échecs à la découverte</b> alternés qui raflent le matériel adverse coup après coup. La pièce qui découvre l'échec revient se placer, redonne échec, et rafle encore — la machine tourne tant qu'il reste à prendre.`,
      fen: '6k1/5ppp/8/8/8/8/1B6/4R1K1', arrows: [{ from: 'b2', to: 'g7', color: G }, { from: 'e1', to: 'e7', color: R }] },
    { cat: '⚔️ Tactiques', name: 'Dégagement', en: 'Clearance',
      desc: `On <b>libère une case ou une ligne</b> pour une autre pièce, souvent en y sacrifiant la pièce qui gênait. Le tempo et la case dégagée valent plus que le matériel cédé.`,
      fen: '6k1/5ppp/8/3B4/8/8/8/3Q2K1', arrows: [{ from: 'd5', to: 'a8', color: B }, { from: 'd1', to: 'd8', color: G }] },

    // ════════ ♚ Mats classiques ════════
    { cat: '♚ Mats classiques', name: 'Mat du couloir', en: 'Back-rank mate',
      desc: `Le roi est <b>coincé sur sa rangée par ses propres pions</b>, et une tour ou une dame mate sur la dernière rangée. Prévention : créer une « lucarne » en avançant un pion devant le roi (h3, g3…).`,
      fen: '4R1k1/5ppp/8/8/8/8/8/6K1', arrows: [{ from: 'e8', to: 'g8', color: R }],
      puzzles: [
        { fen: '6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1', sol: ['Rd8#'], hint: 'La dernière rangée est sans issue : les pions bloquent leur propre roi.' },
      ] },
    { cat: '♚ Mats classiques', name: "Mat de l'escalier", en: 'Ladder mate',
      desc: `Deux tours (ou dame + tour) repoussent le roi rangée après rangée. La tour a7 verrouille la 7<sup>e</sup> rangée pendant que la tour b8 mate sur la 8<sup>e</sup>. Technique de finale fondamentale.`,
      fen: '1R2k3/R7/8/8/8/8/8/6K1', arrows: [{ from: 'a7', to: 'h7', color: G }, { from: 'b8', to: 'e8', color: R }],
      puzzles: [
        { fen: '4k3/R7/1R6/8/8/8/8/6K1 w - - 0 1', sol: ['Rb8#'], hint: 'Une tour coupe la 7ᵉ rangée ; l\'autre mate sur la 8ᵉ.' },
      ] },
    { cat: '♚ Mats classiques', name: 'Mat étouffé', en: 'Smothered mate',
      desc: `Le roi est <b>entouré de ses propres pièces</b> et un cavalier mate — aucune fuite. Souvent précédé d'un sacrifice de dame pour forcer le blocage de la dernière case.`,
      fen: '6rk/5Npp/8/8/8/8/8/6K1', arrows: [{ from: 'f7', to: 'h8', color: R }],
      puzzles: [
        { fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', sol: ['Nf7#'], hint: 'Le roi est emmuré par sa tour et ses pions : un saut de cavalier suffit.' },
        { fen: '5r1k/6pp/7N/8/8/8/Q7/6K1 w - - 0 1', sol: ['Qg8+', 'Rxg8', 'Nf7#'], hint: 'Le combo classique : sacrifie la dame pour étouffer le roi, puis mate au cavalier.' },
      ] },
    { cat: '♚ Mats classiques', name: 'Coup du Berger', en: "Scholar's Mate",
      desc: `Mat en 4 coups visant le point faible <b>f7</b> : la dame, soutenue par le fou c4, prend en f7 (1.e4 e5 2.Fc4 Cc6 3.Dh5 Cf6?? 4.Dxf7#). Facile à parer une fois connu — ravageur contre les débutants.`,
      fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR', arrows: [{ from: 'c4', to: 'f7', color: G }, { from: 'f7', to: 'e8', color: R }],
      puzzles: [
        { fen: 'rnbqk2r/pppp1ppp/5n2/2b1p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', sol: ['Qxf7#'], hint: 'La dame, épaulée par le fou c4, frappe le point le plus faible.' },
      ] },
    { cat: '♚ Mats classiques', name: 'Baiser de la mort', en: 'Kiss of death',
      desc: `La dame, <b>soutenue par une pièce</b>, se colle au roi dans un coin. En g7 elle est défendue par le roi f6 : le roi h8 ne peut ni fuir ni la capturer.`,
      fen: '7k/6Q1/5K2/8/8/8/8/8', arrows: [{ from: 'f6', to: 'g7', color: G }, { from: 'g7', to: 'h8', color: R }],
      puzzles: [
        { fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', sol: ['Qg7#'], hint: 'Colle la dame au roi : ton propre roi la défend, le sien est sans air.' },
      ] },
    { cat: '♚ Mats classiques', name: 'Mat de Légal', en: "Légal's Mate",
      desc: `Un sacrifice de dame en ouverture exploitant un cavalier cloué : on « ignore » le clouage pour mater avec les pièces mineures (1.e4 e5 2.Cf3 d6 3.Fc4 Fg4 4.Cc3 g6?? 5.Cxe5! Fxd1 6.Fxf7+ Re7 7.Cd5#). Piège célèbre de l'Italienne.` },
    { cat: '♚ Mats classiques', name: 'Sacrifice grec (fou h7)', en: 'Greek gift',
      desc: `Le <b>sacrifice grec</b> Fxh7+ : on offre le fou pour arracher le roque adverse. Après Rxh7, Cg5+ ramène la dame (Dh5) et l'attaque déferle. Schéma type quand le roi noir a roqué et que f6/h6 sont fragiles.`,
      fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b5/3PP3/5N2/PPP2PPP/RNBQ1RK1', arrows: [{ from: 'd3', to: 'h7', color: R }] },

    // ════════ 🧠 Méthode & calcul ════════
    { cat: '🧠 Méthode & calcul', name: 'Méthode CCT (É-C-M)', en: 'Checks, Captures, Threats',
      desc: `Avant chaque coup, passe en revue les coups <b>forçants</b> dans cet ordre : <b>Échecs</b>, <b>Captures</b>, <b>Menaces</b> (en anglais <i>Checks, Captures, Threats</i>). Ce sont les coups qui limitent le plus les réponses adverses — donc ceux qui cachent les tactiques. C'est le premier réflexe pour ne rien rater.` },
    { cat: '🧠 Méthode & calcul', name: 'Coups forçants', en: 'Forcing moves',
      desc: `Un coup <b>forçant</b> ne laisse qu'une poignée de réponses (échec, capture, menace directe). On calcule d'abord les lignes forçantes : elles sont courtes, nettes, et c'est là que vivent les combinaisons. « Si je le force, que peut-il faire ? »` },
    { cat: '🧠 Méthode & calcul', name: 'Coups candidats', en: 'Candidate moves',
      desc: `Avant de calculer, dresse la <b>liste des 2-4 coups les plus prometteurs</b> (les « candidats »), puis examine-les un par un. Évite de tomber amoureux du premier coup vu : compare-les avant de te décider.` },
    { cat: '🧠 Méthode & calcul', name: 'Coup tranquille', en: 'Quiet move',
      desc: `Toutes les combinaisons ne sont pas faites d'échecs. Un <b>coup tranquille</b> — sans échec ni capture — au milieu d'une séquence (création d'une menace imparable, amélioration décisive d'une pièce) est souvent le plus dur à voir… et le plus fort.` },

    // ════════ ♟ Concepts stratégiques ════════
    { cat: '♟ Concepts stratégiques', name: 'Pion passé', en: 'Passed pawn',
      desc: `Un pion qui n'a <b>plus aucun pion adverse</b> sur sa colonne ni les colonnes voisines. Le pion e5 file vers la promotion sans opposition — un atout majeur, surtout en finale. « Un pion passé doit être poussé. »`,
      fen: '6k1/pp5p/8/4P3/8/8/8/6K1', arrows: [{ from: 'e5', to: 'e8', color: G }] },
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
      desc: `Posséder ses <b>deux fous</b> quand l'adversaire n'en a qu'un (ou aucun) : un avantage durable dans les positions ouvertes, où les fous balaient tout l'échiquier de loin.` },
    { cat: '♟ Concepts stratégiques', name: 'Zugzwang', en: 'Zugzwang',
      desc: `Situation où <b>tout coup dégrade sa propre position</b> — mais on est obligé de jouer. Trait aux Noirs ici : le roi e8 doit céder le passage, et le roi blanc escorte son pion vers la promotion. C'est l'obligation de bouger qui perd.`,
      fen: '4k3/8/4K3/4P3/8/8/8/8', arrows: [] },
    { cat: '♟ Concepts stratégiques', name: 'Initiative & tempo', en: 'Initiative & tempo',
      desc: `L'<b>initiative</b>, c'est dicter le jeu en enchaînant les menaces ; l'adversaire ne fait que réagir. Un <b>tempo</b> est une unité de temps (un coup) : gagner un tempo, c'est développer en menaçant et faire perdre un coup à l'adversaire.` },
    { cat: '♟ Concepts stratégiques', name: 'Prophylaxie', en: 'Prophylaxis',
      desc: `Jouer un coup qui <b>empêche le plan adverse</b> avant même qu'il ne se déclenche. L'art de « penser pour l'adversaire » : repérer son idée, puis l'étouffer (Kmoch, Nimzowitsch).` },
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
    const ov = $('#tactics-overlay');
    if (ov) ov.hidden = true;
    document.body.classList.remove('guess-open');
  }

  function render() {
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
    stage.innerHTML = `
      <div class="guess-prompt">Trait aux <b>${sideToMove}</b> — trouve le coup. <span class="tac-motif">${motifName}</span></div>
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
    $('#tac-hint').onclick = showHint;
    $('#tac-solve').onclick = solve;
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
      fb.innerHTML = legal ? '❌ Ce n\'est pas le coup. Réessaie — pense É-C-M (échecs, captures, menaces).' : '⚠️ Coup illégal. Clique la pièce, puis sa case d\'arrivée.';
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
    setTimeout(() => {
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
    const playRest = () => {
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
