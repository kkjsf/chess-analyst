// « Jouer avec le coach » — une partie COMPLETE contre Stockfish, a un niveau
// choisi, avec deux regimes d'aide et une ouverture imposable.
//
// Maquette validee : _mockups/coach-mode-2026-09.html (6 ecrans).
//
// Ce module est l'HOTE de partie qui manquait : js/replay.js sait deja juger un
// coup, expliquer une gaffe et faire repondre l'ordi, mais il part d'une FEN au
// milieu d'une partie et n'a pas de notion de resultat. Ici : position de
// depart, choix du camp, force reglable, resultat, PGN, et un magasin SEPARE.
//
// Deux points de conception a ne pas defaire :
//
//  1. LES PARTIES DU COACH NE VONT PAS DANS L'ARCHIVE. Elles vivent dans
//     localStorage sous `ca_coachgames`, jamais dans l'IndexedDB des parties
//     Chess.com. Deux raisons techniques en plus de la mesure : `Coach.clearStore()`
//     vide ce magasin des que le pseudo configure change (garde-fou deux-comptes),
//     et une partie du coach n'est rechargeable depuis AUCUN serveur ; et le
//     pipeline d'analyse appelle `Training.capture()` a la fin, donc « analyser
//     cette partie » remplirait le paquet d'exercices tout seul. D'ou le
//     `{ ingest: false }` passe a App.loadPgnAndAnalyze et l'interrupteur explicite
//     du bilan.
//
//  2. LE NIVEAU N'EST PAS UN ELO GARANTI. Le moteur embarque n'a pas d'option
//     d'Elo (voir js/engine.js), donc un niveau = Skill Level + movetime court +
//     tirage pondere dans les lignes MultiPV + taux de gaffe volontaire. L'UI
//     affiche « ~760 », jamais « 760 ».
const CoachGame = (() => {
  const $ = (s) => document.querySelector(s);

  const KEY = 'ca_coachgames';       // magasin separe (parties + bilans)
  const CFG_KEY = 'ca_coachgame_cfg';
  const DEPTH_ME = 12;               // profondeur d'analyse de MES coups (pleine force)
  // Duree unique, definie dans board.js. Le garde `typeof` sert aux tests
  // hors navigateur (tools/test_core.cjs requiert ce module sans BoardRenderer).
  const ANIM_MS = (typeof BoardRenderer !== 'undefined' && BoardRenderer.ANIM_MS) || 340;

  // ── L'echelle de force ────────────────────────────────────────────────────
  // Point de depart a calibrer en jouant : `skill` = Skill Level UCI, `mt` =
  // movetime en ms, `spread` = etalement du tirage dans le top 5 (plus grand =
  // joue plus souvent le 2e/3e coup), `blunder` = probabilite de lacher un coup
  // au hasard. C'est ce dernier etage qui rend un adversaire de 500 credible :
  // un moteur bride joue mal mais ne donne jamais une piece, ce qui est faux.
  // Le plancher est a 250 et pas a 400 : son Elo rapide mesure est de ~350, donc
  // une echelle qui commence a 400 mettrait « mon niveau » hors de l'echelle.
  const LADDER = [
    { elo: 250,  skill: 0, mt: 30,  spread: 5.0, blunder: 0.18 },
    { elo: 400,  skill: 0, mt: 50,  spread: 4.0, blunder: 0.12 },
    { elo: 600,  skill: 1, mt: 80,  spread: 3.0, blunder: 0.08 },
    { elo: 760,  skill: 3, mt: 120, spread: 2.0, blunder: 0.05 },
    { elo: 900,  skill: 5, mt: 200, spread: 1.6, blunder: 0.03 },
    { elo: 1200, skill: 9, mt: 400, spread: 1.0, blunder: 0.00 },
    { elo: 1400, skill: 12, mt: 600, spread: 0.7, blunder: 0.00 },
  ];

  // Interpolation lineaire entre les deux barreaux qui encadrent `elo`.
  function paramsFor(elo) {
    const e = Math.max(LADDER[0].elo, Math.min(LADDER[LADDER.length - 1].elo, Math.round(elo) || 400));
    let lo = LADDER[0], hi = LADDER[LADDER.length - 1];
    for (let i = 0; i < LADDER.length - 1; i++) {
      if (e >= LADDER[i].elo && e <= LADDER[i + 1].elo) { lo = LADDER[i]; hi = LADDER[i + 1]; break; }
    }
    const span = hi.elo - lo.elo;
    const t = span ? (e - lo.elo) / span : 0;
    const mix = (a, b) => a + (b - a) * t;
    return {
      elo: e,
      skill: Math.round(mix(lo.skill, hi.skill)),
      mt: Math.round(mix(lo.mt, hi.mt)),
      spread: +mix(lo.spread, hi.spread).toFixed(2),
      blunder: +mix(lo.blunder, hi.blunder).toFixed(3),
    };
  }

  // Un coup EVIDENT se trouve meme a 350. Mesure en jouant : avec le seul
  // tirage pondere, le coach laissait passer une dame gratuite deux fois sur
  // trois - et un adversaire qui ne punit jamais rien n'entraine personne.
  // Quand la meilleure ligne devance la suivante d'au moins une piece, on
  // resserre donc fortement le tirage. L'etalement ne joue alors que dans les
  // positions ou plusieurs coups se valent, c'est-a-dire la ou un joueur faible
  // se trompe vraiment.
  const OBVIOUS_CP = 200;   // ~une piece d'ecart avec le 2e coup
  const CLEAR_CP = 100;     // un ecart net, sans etre criant
  function effSpread(lines, spread) {
    if (!(spread > 0) || !lines || lines.length < 2) return spread;
    const a = lines[0], b = lines[1];
    if (a && a.mate != null && a.mate > 0) return +(spread * 0.15).toFixed(3);   // mat en vue
    if (!a || !b || typeof a.score !== 'number' || typeof b.score !== 'number') return spread;
    const gap = a.score - b.score;                                              // vu du trait
    if (gap >= OBVIOUS_CP) return +(spread * 0.15).toFixed(3);   // ~3 % de chances de rater quand meme
    if (gap >= CLEAR_CP) return +(spread * 0.6).toFixed(3);
    return spread;
  }

  // Tirage pondere dans les `n` lignes rendues par MultiPV. Poids
  // exp(-i/spread) : a spread 0 seul le meilleur coup sort, a spread 4 le 4e
  // coup a encore une chance reelle. `rnd` est injectable pour les tests.
  function pickIndex(n, spread, rnd) {
    const k = Math.max(1, n | 0);
    if (!(spread > 0)) return 0;
    const w = [];
    let sum = 0;
    for (let i = 0; i < k; i++) { const x = Math.exp(-i / spread); w.push(x); sum += x; }
    let r = (typeof rnd === 'number' ? rnd : Math.random()) * sum;
    for (let i = 0; i < k; i++) { r -= w[i]; if (r <= 0) return i; }
    return k - 1;
  }

  // ── Etat de la partie en cours ────────────────────────────────────────────
  let game = null;          // Chess() depuis le depart
  let cfg = null;           // { side, elo, aide, hint, book, bookMode }
  let prm = null;           // paramsFor(cfg.elo)
  let mySide = 'w';
  let busy = false, token = 0;
  let curEvalMe = null;     // eval a mon trait, vue de mon camp (centipions)
  let myBestUci = null, myBestPv = '', myLines = null;
  let stats = null;         // { moves, best, slips, hints, mistakes: [] }
  let track = [];           // eval vue de mon camp, coup par coup (courbe du bilan)
  let hintLevel = 0, hintArrow = false;
  let book = null;          // { sans: [], name, leaveAt } ou null
  let bookPly = 0, bookOut = null;  // bookOut = 'me' | 'coach' | null
  let lastWasBook = false;          // mon dernier coup etait de la theorie
  let threatArrows = false;         // des fleches de menace sont affichees : ne pas les effacer
  // Journal des coups pour le suivi lateral : { n, san, mine, k } ou `k` est une
  // cle de Analyzer.MOVE_TYPES (best, excellent, good, book, inaccuracy,
  // mistake, blunder, miss...). Le coup du coach est note lui aussi : son eval
  // « avant » est celle qu'on mesure apres MON coup, son eval « apres » celle du
  // tour suivant - deux recherches qu'on fait de toute facon.
  let moveLog = [];
  // Mode revue : nombre de demi-coups affiches depuis le depart, ou null quand
  // on regarde la position courante. La PARTIE (`game`) n'est jamais touchee.
  let reviewPly = null;
  // Feuille « tous les coups » ouverte (telephone uniquement).
  let sheetOpen = false;
  let pendingOpp = null;            // { idx, evalBefore, inBook } : coup du coach en attente de note
  let saved = false;
  // La partie est TERMINEE et enregistree, mais on reste sur l'echiquier :
  // { rec, out, reason, an, lastMove, level, seen }. Tant que `endInfo` existe,
  // l'ecran de partie est en mode « fin de partie » - navigation libre, aucun
  // coup jouable, et le bilan seulement sur demande.
  let endInfo = null;
  let tailTimer = null;             // relecture au ralenti des derniers coups
  let tailBusy = false;             // c'est la relecture qui navigue, pas l'utilisateur

  // ── Utilitaires ──────────────────────────────────────────────────────────
  function fr(san) { return (typeof Analyzer !== 'undefined' && Analyzer.toFrench) ? Analyzer.toFrench(san) : san; }
  function curFen() { return game ? game.fen() : 'startpos'; }
  function sideToMove() { return curFen().split(' ')[1] === 'w' ? 'w' : 'b'; }
  function gameOver() { try { return game.game_over(); } catch (_) { return false; } }
  function myTurn() { return !gameOver() && sideToMove() === mySide; }

  function meScore(res, fen) {
    if (!res || typeof res.score !== 'number') return null;
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    return (stm === mySide ? 1 : -1) * res.score;
  }
  function fmtMe(cp) {
    if (cp == null) return '?';
    if (Math.abs(cp) > 20000) return cp > 0 ? 'mat pour toi' : 'mat contre toi';
    const v = cp / 100;
    return (v >= 0 ? '+' : '') + v.toFixed(1);
  }
  function uciToFr(fen, uci) {
    if (!uci) return null;
    try {
      const g = new Chess(fen);
      const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
      return m ? fr(m.san) : null;
    } catch (_) { return null; }
  }

  // Etiquette d'appareil : les parties se jouent en local, sans serveur pour
  // les rassembler, donc chaque partie dit d'ou elle vient (PC / telephone).
  function deviceLabel() {
    const ua = (navigator.userAgent || '');
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'inconnu';
  }

  // ── Magasin separe ────────────────────────────────────────────────────────
  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || '{}');
      return Array.isArray(o.games) ? o : { v: 1, games: [] };
    } catch (_) { return { v: 1, games: [] }; }
  }
  function save(st) {
    try {
      const games = st.games.slice(-200);
      // Le journal coup par coup (~6 ko par partie) ne sert qu'au bilan
      // detaille : on ne le garde que pour les 30 dernieres parties. Les
      // agregats qui servent a se comparer (`acc`, `acpl`, resultat, erreurs)
      // sont ranges A PLAT sur la partie, donc ils survivent a l'elagage.
      const cut = games.length - 30;
      const slim = games.map((g, i) => (i < cut && g && g.log) ? Object.assign({}, g, { log: null }) : g);
      localStorage.setItem(KEY, JSON.stringify({ v: 1, games: slim }));
    } catch (_) {}
  }
  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (_) {} }

  // ── Son niveau, lu dans ses vraies parties ───────────────────────────────
  async function myElo() {
    try {
      if (typeof Coach === 'undefined' || !Coach.myRatings) return null;
      await Coach.ensureData();
      const r = Coach.myRatings() || {};
      // `latest` d'abord : « mon niveau » = celui de ma partie la plus recente,
      // quelle que soit la cadence.
      return r.latest || r.rapid || r.blitz || r.daily || r.bullet || null;
    } catch (_) { return null; }
  }

  // ── Le livre : les lignes des cours de l'app ─────────────────────────────
  // Rien a ressaisir : chaque cours porte des `sans` deja verifies par
  // tools/verify_openings.cjs, et Openings.detect() sait nommer la ligne.
  function bookCatalog() {
    if (typeof Courses === 'undefined' || !Courses.COURSES) return [];
    const aliases = Courses.ALIASES || {};
    const out = [];
    for (const key in Courses.COURSES) {
      if (aliases[key]) continue;                 // meme cours sous un autre ordre
      const c = Courses.COURSES[key];
      const det = (typeof Openings !== 'undefined' && Openings.detect) ? Openings.detect(key.split(' ')) : null;
      const label = (det && det.name) || key;
      (c.lines || []).forEach((L, i) => {
        if (!L.sans || L.sans.length < 4) return;
        out.push({ id: key + '|' + i, group: label, name: L.name || 'ligne ' + (i + 1), sans: L.sans });
      });
    }
    return out;
  }
  function bookById(id) { return bookCatalog().find(b => b.id === id) || null; }

  // ═════════════════════════ DOM ═════════════════════════
  let boardSvg = null, arrowsSvg = null, dragBound = false;

  function ensureDom() {
    if ($('#cg-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'cg-overlay';
    ov.className = 'guess-overlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="guess-panel">
        <div class="guess-head">
          <button class="back-btn" id="cg-close">←</button>
          <span class="guess-title" id="cg-title">Jouer avec le coach</span>
          <span class="guess-score" id="cg-turn"></span>
        </div>

        <!-- 1. reglages -->
        <div id="cg-setup" class="cg-setup">
          <div class="cg-fld">
            <label>Ton camp</label>
            <div class="cg-segs" id="cg-side">
              <button data-v="w" class="on">♔ Blancs</button><button data-v="b">♚ Noirs</button><button data-v="r">🎲 Au hasard</button>
            </div>
          </div>

          <div class="cg-fld">
            <label>Niveau de l'adversaire</label>
            <div class="cg-lvl">
              <div class="cg-lvl-row">
                <span class="v" id="cg-elo-v">~760</span>
                <span class="t">Elo visé</span>
                <button class="cg-me" id="cg-elo-me" type="button">mon niveau</button>
              </div>
              <input type="range" id="cg-elo" min="250" max="1400" step="50" value="400">
              <p class="cg-hint" id="cg-elo-hint"></p>
            </div>
          </div>

          <div class="cg-fld">
            <label>Aide pendant la partie</label>
            <div class="cg-opts" id="cg-aide">
              <button class="cg-opt on" data-v="libre" type="button">
                <span class="rd"></span>
                <span class="bd"><b>Libre — rien pendant, tout après</b>
                  <small>Aucune éval, aucune flèche. Le coach parle APRÈS ton coup et montre alors ce que tu n'as pas vu.</small></span>
              </button>
              <button class="cg-opt" data-v="assiste" type="button">
                <span class="rd"></span>
                <span class="bd"><b>Assisté — menaces + meilleur coup</b>
                  <small>Flèche bleue sur le meilleur coup, flèches sur ce qu'il attaque, et le pourquoi en une phrase.</small></span>
              </button>
            </div>
            <button class="cg-sw on" id="cg-hinton" type="button">
              <span class="bd"><b>💡 Indice à la demande</b> — 3 temps : le thème, la pièce, puis le coup</span>
              <span class="tg"></span>
            </button>
          </div>

          <div class="cg-fld">
            <label>Ouverture imposée</label>
            <select id="cg-book" class="cg-select"></select>
            <div class="cg-opts" id="cg-bookmode" hidden>
              <button class="cg-opt on" data-v="follow" type="button">
                <span class="rd"></span>
                <span class="bd"><b>Il joue le jeu</b><small>Le coach suit ta ligne tant que tu la suis, puis joue normalement.</small></span>
              </button>
              <button class="cg-opt" data-v="leave" type="button">
                <span class="rd"></span>
                <span class="bd"><b>Il sort du livre exprès</b><small>À un coup tiré au hasard, il joue une déviation jouable. C'est ce qui t'arrive dans 2 parties sur 3.</small></span>
              </button>
            </div>
          </div>

          <button class="cg-go" id="cg-play" type="button">Jouer ▸</button>
          <button class="train-btn ghost cg-histbtn" id="cg-hist-open" type="button">🗄 Tes parties avec le coach</button>
        </div>

        <!-- 2. partie : plateau a gauche, suivi des coups a droite (desktop) -->
        <div id="cg-game" hidden>
          <div class="cg-main">
            <div class="cg-bookbar" id="cg-bookbar" hidden></div>
            <div class="cg-pbar" id="cg-pbar-top">
              <span class="cg-who" id="cg-top-name"></span>
              <span class="cg-capt" id="cg-top-capt"></span>
              <span class="cg-mat" id="cg-top-mat"></span>
            </div>
            <!-- La barre d'avantage du telephone : horizontale, avec le
                 chiffre. La barre verticale de 12 px (a gauche du plateau)
                 reste, mais seulement en desktop - sans chiffre et collee au
                 bord, elle se lisait comme une barre de defilement. -->
            <div class="cg-evalh" id="cg-evalh">
              <span class="cg-track"><i class="w" id="cg-evalh-w"></i><i class="b" id="cg-evalh-b"></i></span>
              <span class="cg-num" id="cg-evalh-num" title="Avantage du point de vue des Blancs">=</span>
            </div>
            <div class="guess-board-wrap cg-boardwrap">
              <div class="eval-bar-container cg-evalbar" title="Avantage vu par le moteur">
                <div class="eval-bar-fill" id="cg-eval-fill"></div>
              </div>
              <svg viewBox="0 0 360 360" id="cg-board"></svg>
              <svg viewBox="0 0 360 360" id="cg-arrows" class="arrow-overlay"></svg>
            </div>
            <div class="cg-pbar" id="cg-pbar-bottom">
              <span class="cg-who" id="cg-bot-name"></span>
              <span class="cg-capt" id="cg-bot-capt"></span>
              <span class="cg-mat" id="cg-bot-mat"></span>
            </div>
            <div class="cg-review" id="cg-review" hidden></div>
            <!-- La fin de partie : elle se lit SUR l'echiquier, pas sur un
                 ecran de statistiques. Le bilan n'arrive que sur le bouton. -->
            <div class="cg-over" id="cg-over" hidden></div>
            <!-- Le ruban des coups : le meme journal que la colonne desktop,
                 mais qui defile a l'horizontale. ⤢ ouvre la feuille complete. -->
            <div class="cg-strip" id="cg-strip">
              <button type="button" class="cg-nav" data-rev="prev" title="Coup précédent">◀</button>
              <div class="cg-rail" id="cg-rail"></div>
              <button type="button" class="cg-nav" data-rev="next" title="Coup suivant">▶</button>
              <button type="button" class="cg-more" id="cg-sheet-open" title="Tous les coups">⤢</button>
            </div>
            <div class="guess-feedback rp-comment">
              <div class="rp-verdict" id="cg-verdict"></div>
              <div class="rp-status" id="cg-status"></div>
              <div class="rp-hintbox" id="cg-hintout" hidden></div>
            </div>
            <div class="rp-actions">
              <button class="train-btn ghost" id="cg-hint" hidden>💡 Indice</button>
              <button class="train-btn ghost" id="cg-undo">↶ Annuler</button>
              <button class="train-btn ghost" id="cg-swap" hidden>👁 Aide</button>
              <button class="train-btn ghost" id="cg-resign">🏳 Abandonner</button>
            </div>
          </div>
          <div class="cg-backdrop" id="cg-backdrop" hidden></div>
          <aside class="cg-side" id="cg-sidepane">
            <div class="cg-grab"></div>
            <div class="cg-side-head">
              <span id="cg-side-title">Suivi des coups</span>
              <button type="button" class="cg-sheet-close" id="cg-sheet-close">Fermer</button>
            </div>
            <div class="cg-tally" id="cg-tally"></div>
            <div class="cg-mvlist" id="cg-moves"></div>
            <div class="cg-legend" id="cg-legend"></div>
          </aside>
        </div>

        <!-- 3. bilan -->
        <div id="cg-end" hidden class="cg-end"></div>

        <!-- 4. historique separe -->
        <div id="cg-hist" hidden class="cg-end"></div>
      </div>`;
    document.body.appendChild(ov);
    boardSvg = $('#cg-board');
    arrowsSvg = $('#cg-arrows');

    $('#cg-close').onclick = close;
    $('#cg-play').onclick = startGame;
    $('#cg-hist-open').onclick = () => showHistory();
    $('#cg-undo').onclick = () => { if (!busy) undo(); };
    $('#cg-hint').onclick = () => useHint();
    $('#cg-resign').onclick = () => { if (!busy) finish('resign'); };
    $('#cg-swap').onclick = () => {
      cfg.aide = cfg.aide === 'libre' ? 'assiste' : 'libre';
      saveCfg(cfg);
      syncSwapBtn();
      view('game');                  // le titre porte le regime d'aide : il doit suivre
      if (myTurn() && !busy) onMyTurn();
      else BoardRenderer.clearArrows(arrowsSvg);
    };
    $('#cg-elo').oninput = (e) => setElo(+e.target.value);
    $('#cg-elo-me').onclick = async () => {
      const e = await myElo();
      if (e) setElo(Math.round(e / 50) * 50);
      else $('#cg-elo-hint').innerHTML = `Ton Elo n'est pas encore charge (lance le Coach une fois). Regle le niveau a la main.`;
    };
    $('#cg-side').onclick = (e) => pickSeg('#cg-side', e);
    $('#cg-aide').onclick = (e) => pickSeg('#cg-aide', e);
    $('#cg-bookmode').onclick = (e) => pickSeg('#cg-bookmode', e);
    $('#cg-hinton').onclick = () => $('#cg-hinton').classList.toggle('on');
    $('#cg-book').onchange = () => { $('#cg-bookmode').hidden = !$('#cg-book').value; };
    // « Reprendre ce coup » est injecte dans le verdict : delegation.
    $('#cg-review').addEventListener('click', (e) => navRev(e));
    $('#cg-over').addEventListener('click', onOverClick);
    // Le ruban : les fleches naviguent, une case va a la position, ⤢ deroule
    // la feuille complete.
    $('#cg-strip').addEventListener('click', (e) => {
      const c = e.target.closest('button[data-ply]');
      if (c) { gotoPly(+c.dataset.ply); return; }
      navRev(e);
    });
    $('#cg-sheet-open').onclick = () => setSheet(!sheetOpen);
    $('#cg-sheet-close').onclick = () => setSheet(false);
    $('#cg-backdrop').onclick = () => setSheet(false);
    $('#cg-verdict').addEventListener('click', (e) => {
      if (!e.target) return;
      if (e.target.id === 'cg-retry' && !busy) undo();
      // « Continuer » ne fait que retirer la proposition de reprise : la partie
      // n'a jamais ete interrompue, c'est l'affichage qui laissait croire qu'il
      // fallait choisir.
      if (e.target.id === 'cg-keepgoing') {
        const row = e.target.closest('.rp-retry-row');
        if (row) row.remove();
      }
    });

    if (!dragBound) {
      dragBound = true;
      BoardRenderer.enableDrag(boardSvg, {
        getFen: () => curFen(),
        arrows: arrowsSvg,
        canMove: () => !busy && myTurn() && reviewPly === null,
        onMove: (from, to) => playMyMove(from, to),
      });
    }
  }

  function pickSeg(sel, e) {
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.v) return;
    $$(sel + ' button').forEach(b => b.classList.toggle('on', b === btn));
  }
  function $$(s) { return Array.from(document.querySelectorAll(s)); }
  function segVal(sel) {
    const on = document.querySelector(sel + ' button.on');
    return on ? on.dataset.v : null;
  }

  function setElo(v) {
    const p = paramsFor(v);
    $('#cg-elo').value = p.elo;
    $('#cg-elo-v').textContent = '~' + p.elo;
    $('#cg-elo-hint').innerHTML = `Skill ${p.skill}/20, ${p.mt} ms de réflexion, `
      + (p.blunder > 0 ? `<b>${Math.round(p.blunder * 100)} %</b> de coups lâchés` : `aucun coup lâché`)
      + `. Le moteur embarqué n'a pas d'option d'Elo : ce niveau est une <b>approximation</b>, à ajuster au ressenti.`;
  }

  // ═════════════════════════ Ouverture / fermeture ═════════════════════════
  // Une partie est en cours ? On la REPREND. Sinon on quitterait sa partie en
  // allant voir ses statistiques, ce qui est le genre de detail qui fait
  // abandonner un mode de jeu.
  function inProgress() {
    try { return !!(game && !saved && cfg && game.history().length > 0 && !game.game_over()); }
    catch (_) { return false; }
  }

  function open() {
    ensureDom();
    $('#cg-overlay').hidden = false;
    document.body.classList.add('guess-open');
    if (inProgress()) {
      view('game');
      BoardRenderer.setFlipped(mySide === 'b');
      syncSwapBtn();
      renderBoard(null);
      renderBookBar();
      renderMoves();
      if (myTurn() && !busy) onMyTurn();
      return;
    }
    // Partie finie mais pas encore rangee : on revient exactement ou on etait,
    // sur l'echiquier de fin ou sur le bilan. Fermer l'ecran par megarde ne doit
    // pas effacer la position finale.
    if (endInfo) {
      renderBookBar();
      if (endInfo.seen) { renderEnd(endInfo.rec, endInfo.out); view('end'); }
      else enterEndBoard();
      return;
    }
    const c = loadCfg();
    cfg = null;
    view('setup');

    // Livre : catalogue des lignes des cours.
    const sel = $('#cg-book');
    if (!sel.options.length) {
      const cat = bookCatalog();
      let html = '<option value="">Aucune — il joue ce qu\'il veut</option>';
      let group = null;
      for (const b of cat) {
        if (b.group !== group) { if (group) html += '</optgroup>'; html += `<optgroup label="${b.group}">`; group = b.group; }
        html += `<option value="${b.id}">${b.name}</option>`;
      }
      if (group) html += '</optgroup>';
      sel.innerHTML = html;
    }
    if (c.book) sel.value = c.book;
    $('#cg-bookmode').hidden = !sel.value;
    if (c.side) $$('#cg-side button').forEach(b => b.classList.toggle('on', b.dataset.v === c.side));
    if (c.aide) $$('#cg-aide button').forEach(b => b.classList.toggle('on', b.dataset.v === c.aide));
    if (c.bookMode) $$('#cg-bookmode button').forEach(b => b.classList.toggle('on', b.dataset.v === c.bookMode));
    $('#cg-hinton').classList.toggle('on', c.hint !== false);

    setElo(c.elo || 400);
    // Son Elo reel arrive de facon asynchrone (archive Chess.com) : on ne le
    // pousse que si l'utilisateur n'a pas deja choisi un niveau.
    if (!c.elo) myElo().then(e => { if (e && !cfg) setElo(Math.round(e / 50) * 50); });
  }

  function close() {
    token++;
    busy = false;
    stopTail();
    const ov = $('#cg-overlay');
    if (ov) ov.hidden = true;
    document.body.classList.remove('guess-open');
    if (arrowsSvg) BoardRenderer.clearArrows(arrowsSvg);
  }

  function view(v) {
    ['setup', 'game', 'end', 'hist'].forEach(k => { const el = $('#cg-' + k); if (el) el.hidden = k !== v; });
    const t = $('#cg-title');
    if (t) t.textContent = v === 'setup' ? 'Jouer avec le coach'
      : v === 'game' ? `Coach ~${prm ? prm.elo : ''} · ${cfg && cfg.aide === 'libre' ? 'libre' : 'assisté'}`
      : v === 'end' ? 'Partie terminée' : 'Tes parties avec le coach';
  }

  // ═════════════════════════ La partie ═════════════════════════
  function startGame() {
    let side = segVal('#cg-side') || 'w';
    if (side === 'r') side = Math.random() < 0.5 ? 'w' : 'b';
    const bookId = $('#cg-book').value || '';
    cfg = {
      side, elo: +$('#cg-elo').value, aide: segVal('#cg-aide') || 'libre',
      hint: $('#cg-hinton').classList.contains('on'),
      book: bookId, bookMode: segVal('#cg-bookmode') || 'follow',
    };
    saveCfg(cfg);
    prm = paramsFor(cfg.elo);
    mySide = side;

    const b = bookId ? bookById(bookId) : null;
    book = b ? { sans: b.sans.slice(), name: b.group + ' — ' + b.name, leaveAt: null } : null;
    if (book && cfg.bookMode === 'leave') {
      // Deviation tiree au sort, jamais avant le 3e demi-coup (sinon ce n'est
      // pas une ouverture, c'est un coup au hasard) et toujours sur un coup DU
      // COACH, sans quoi « il sort du livre » ne veut rien dire.
      const cand = [];
      for (let i = 2; i < book.sans.length; i++) if ((i % 2 === 0 ? 'w' : 'b') !== mySide) cand.push(i);
      book.leaveAt = cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
    }
    bookPly = 0; bookOut = null;

    game = new Chess();
    stats = { moves: 0, best: 0, slips: 0, hints: 0, mistakes: [] };
    moveLog = []; pendingOpp = null; myLines = null; reviewPly = null;
    endInfo = null; stopTail();
    setSheet(false);
    track = []; saved = false; curEvalMe = null; myBestUci = null; hintLevel = 0; hintArrow = false;
    busy = false; token++; threatArrows = false;

    view('game');
    BoardRenderer.setFlipped(mySide === 'b');
    syncSwapBtn();
    setVerdict('');
    renderBoard(null);
    renderBookBar();
    renderMoves();          // l'etat vide + la legende, des le premier ecran
    if (myTurn()) onMyTurn(); else coachMove();
  }

  function renderBoard(lastMove, animateFrom) {
    // Un coup joue (ou la reponse du coach) ramene forcement au present.
    if (reviewPly !== null) { reviewPly = null; renderReviewBar(); }
    if (animateFrom) BoardRenderer.renderAnimated(boardSvg, animateFrom, curFen(), lastMove, ANIM_MS);
    else BoardRenderer.render(boardSvg, curFen(), lastMove);
    syncControls();
  }

  // ── Barre d'avantage + materiel pris, en direct ──────────────────────────
  // La barre reprend le composant de l'ecran d'analyse : la part claire est
  // celle des Blancs, ancree du cote des Blancs (donc en haut si tu joues les
  // Noirs). Faute d'eval moteur (au tout debut), on retombe sur le materiel,
  // comme l'ecran d'analyse.
  function syncEvalBar() {
    const fill = $('#cg-eval-fill');
    if (!fill) return;
    const fen = curShownFen();
    // curEvalMe est vue de MON camp : la barre se lit du cote des Blancs. En
    // revue, c'est l'eval MEMORISEE du demi-coup regarde, pas celle de la
    // partie en cours - sinon le chiffre contredit l'echiquier.
    const revEntry = reviewPly === null ? null : moveLog[reviewPly - 1];
    const cpWhite = reviewPly !== null
      ? (revEntry && typeof revEntry.ev === 'number' ? revEntry.ev : null)
      : (curEvalMe == null ? null : (mySide === 'w' ? curEvalMe : -curEvalMe));
    let pct;
    if (cpWhite != null) {
      pct = Math.max(5, Math.min(95, 50 + 50 * (2 / (1 + Math.exp(-0.004 * cpWhite)) - 1)));
    } else {
      const mat = (typeof Analyzer !== 'undefined' && Analyzer.materialCount) ? Analyzer.materialCount(fen) : { diff: 0 };
      pct = Math.max(5, Math.min(95, 50 + (mat.diff || 0) * 5));
    }
    fill.style.height = pct + '%';
    if (BoardRenderer.isFlipped()) { fill.style.top = '0'; fill.style.bottom = 'auto'; }
    else { fill.style.bottom = '0'; fill.style.top = 'auto'; }
    // La version telephone : meme part de blanc, mais a l'horizontale et avec
    // le chiffre - c'est le chiffre qui manquait le plus.
    const hw = $('#cg-evalh-w'), hb = $('#cg-evalh-b'), num = $('#cg-evalh-num');
    if (hw) hw.style.width = pct + '%';
    if (hb) hb.style.width = (100 - pct) + '%';
    if (num) {
      num.textContent = cpWhite == null ? '·' : fmtWhite(cpWhite);
      num.classList.toggle('neg', cpWhite != null && cpWhite < 0);
    }
  }

  // Le chiffre de la barre se lit du point de vue des BLANCS, comme la barre
  // elle-meme (et comme partout ailleurs aux echecs).
  function fmtWhite(cp) {
    if (cp == null) return '·';
    if (Math.abs(cp) > 20000) return cp > 0 ? 'M+' : 'M-';
    const v = cp / 100;
    if (Math.abs(v) < 0.05) return '0.0';
    return (v > 0 ? '+' : '') + v.toFixed(1);
  }

  // Le materiel : les pieces prises par chaque camp + l'ecart en points, sous
  // le nom du camp qui est de ce cote de l'echiquier.
  function syncMaterial() {
    const fen = curShownFen();
    let capt = { white: '', black: '' }, diff = 0;
    try { capt = BoardRenderer.getCapturedPieces(fen); } catch (_) {}
    try {
      const m = (typeof Analyzer !== 'undefined' && Analyzer.materialCount) ? Analyzer.materialCount(fen) : null;
      diff = m ? (m.diff || 0) : 0;   // > 0 = les Blancs devant
    } catch (_) {}
    const meIsWhite = mySide === 'w';
    const myDiff = meIsWhite ? diff : -diff;
    const set = (nameEl, captEl, matEl, label, captured, d) => {
      const n = $(nameEl), c = $(captEl), mt = $(matEl);
      if (n) n.textContent = label;
      if (c) c.textContent = captured;
      // Toujours visible : une info qui n'apparait que parfois passe pour
      // absente (c'est exactement ce qui s'est passe - « pas d'acces au gain de
      // materiel » alors que le calcul etait deja la).
      if (mt) {
        mt.hidden = false;
        mt.textContent = d > 0 ? '+' + d : (d < 0 ? '-' + (-d) : '=');
        mt.classList.toggle('zero', d <= 0);
      }
    };
    // En haut : l'adversaire (le plateau est retourne quand je joue les Noirs).
    set('#cg-top-name', '#cg-top-capt', '#cg-top-mat',
      'Coach ~' + (prm ? prm.elo : ''), meIsWhite ? capt.black : capt.white, -myDiff);
    set('#cg-bot-name', '#cg-bot-capt', '#cg-bot-mat',
      'Toi', meIsWhite ? capt.white : capt.black, myDiff);
  }

  // Les controles seuls, SANS toucher au plateau : appele quand la position n'a
  // pas change (a mon trait, juste apres l'animation de la reponse). Un rendu
  // sec a ce moment-la effacait le glissement de l'ordi dans la meme frame.
  function syncControls() {
    syncMaterial();
    syncEvalBar();
    const u = $('#cg-undo'); if (u) u.disabled = busy || !game || game.history().length < 1;
    // Les fleches du ruban se grisent aux bornes : on voit tout de suite qu'on
    // est au premier ou au dernier coup.
    const total = game ? game.history().length : 0;
    const at = reviewPly == null ? total : reviewPly;
    // Le ruban ET le panneau de fin portent la meme navigation : les deux se
    // grisent aux bornes, sinon l'un des deux ment sur ce qui reste a voir.
    $$('#cg-strip [data-rev="prev"], #cg-over [data-rev="prev"]').forEach(b => { b.disabled = at <= 1; });
    $$('#cg-strip [data-rev="next"], #cg-over [data-rev="next"]').forEach(b => { b.disabled = at >= total; });
    const turn = $('#cg-turn');
    if (turn) turn.textContent = gameOver() ? '' : (myTurn() ? 'À toi' : 'Coach…');
    syncHintBtn();
    // Fin de partie : les boutons de jeu n'ont plus de sens (on ne peut ni
    // annuler ni abandonner une partie deja enregistree), mais la navigation
    // dans les coups, elle, reste entiere - c'est tout l'interet de l'ecran.
    if (endInfo) {
      for (const id of ['#cg-undo', '#cg-resign', '#cg-swap', '#cg-hint']) {
        const b = $(id);
        if (b) b.hidden = true;
      }
    }
  }

  function setVerdict(html, cls) {
    const el = $('#cg-verdict');
    if (!el) return;
    el.className = 'rp-verdict' + (cls ? ' ' + cls : '');
    el.innerHTML = html || '';
  }
  function setStatus(html) { const el = $('#cg-status'); if (el) el.innerHTML = html || ''; }

  function syncSwapBtn() {
    const b = $('#cg-swap');
    if (!b) return;
    b.hidden = false;
    b.textContent = cfg && cfg.aide === 'libre' ? '👁 Passer en assisté' : '🙈 Passer en libre';
  }
  function syncHintBtn() {
    const b = $('#cg-hint');
    if (!b) return;
    b.hidden = !(cfg && cfg.hint && cfg.aide === 'libre' && myTurn() && !gameOver());
    b.disabled = busy || hintLevel >= 3;
    b.textContent = hintLevel >= 3 ? '💡 Indice donné'
      : hintLevel === 2 ? '💡 Donne-moi le coup'
      : hintLevel === 1 ? '💡 Encore un indice' : '💡 Indice';
  }

  // ── Le suivi des coups (colonne de droite, desktop) ─────────────────────
  // Meme lecture que l'ecran d'analyse : un glyphe et une couleur par coup,
  // tires de Analyzer.MOVE_CLASS. Masque sous 1000 px (voir le CSS) : sur
  // telephone il n'y a pas la place, et le bilan de fin fait le meme travail.
  function logMove(san, mine, k) {
    const n = Math.ceil(game.history().length / 2);
    moveLog.push({ n, san: fr(san), mine, k: k || null });
    renderMoves();
    return moveLog.length - 1;
  }
  function gradeLogged(idx, k) {
    if (idx == null || !moveLog[idx]) return;
    moveLog[idx].k = k;
    renderMoves();
  }

  function mvCell(e, idx) {
    if (!e) return '<span class="cg-mv empty"></span>';
    const T = e.k ? typeOf(e.k) : null;
    const live = reviewPly == null ? moveLog.length : reviewPly;
    const cur = (idx + 1) === live;
    const cls = 'cg-mv' + (e.k ? ' ' + e.k : '') + (e.mine ? ' mine' : '') + (cur ? ' cur' : '');
    const mark = T && T.mark ? `<i>${T.mark}</i>` : '';
    const title = (T ? T.label + ' — ' : '') + 'cliquer pour revoir cette position';
    return `<button type="button" class="${cls}" data-ply="${idx + 1}" title="${title}">${e.san}${mark}</button>`;
  }

  // La meme case, en pastille pour le ruban : le numero de coup est porte par
  // la pastille des Blancs, sinon on ne sait plus ou on en est en defilant.
  function mvChip(e, idx) {
    const T = e.k ? typeOf(e.k) : null;
    const live = reviewPly == null ? moveLog.length : reviewPly;
    const cls = 'cg-mv' + (e.k ? ' ' + e.k : '') + (e.mine ? ' mine' : '')
      + ((idx + 1) === live ? ' cur' : '');
    const no = idx % 2 === 0 ? `<span class="cg-no">${e.n}.</span>` : '';
    const mark = T && T.mark ? `<i>${T.mark}</i>` : '';
    const title = (T ? T.label + ' - ' : '') + 'revoir cette position';
    return `<button type="button" class="${cls}" data-ply="${idx + 1}" title="${title}">${no}${e.san}${mark}</button>`;
  }

  function renderMoves() {
    const host = $('#cg-moves');
    if (!host) return;
    // Une ligne par coup complet : le camp qui a commence tient la 1re colonne.
    const rows = [];
    for (let i = 0; i < moveLog.length; i += 2) {
      const a = moveLog[i], b = moveLog[i + 1];
      rows.push(`<div class="cg-mvrow"><span class="cg-no">${a.n}.</span>${mvCell(a, i)}${mvCell(b, i + 1)}</div>`);
    }
    host.innerHTML = rows.join('') || `<p class="cg-mv-empty">Les coups s'afficheront ici, notés au fur et à mesure. Clique sur un coup pour revoir la position.</p>`;
    if (reviewPly == null) host.scrollTop = host.scrollHeight;
    if (!host.dataset.bound) {
      host.dataset.bound = '1';
      host.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-ply]');
        if (!b) return;
        gotoPly(+b.dataset.ply);
        setSheet(false);   // sur telephone : la feuille se referme sur la position
      });
    }

    // Le ruban du telephone : le meme journal, en une seule ligne qui defile.
    const rail = $('#cg-rail');
    if (rail) {
      rail.innerHTML = moveLog.length
        ? moveLog.map((e, i) => mvChip(e, i)).join('')
        : `<span class="cg-rail-empty">Les coups s'afficheront ici.</span>`;
      // On centre la case courante sans passer par scrollIntoView, qui ferait
      // aussi defiler la page verticalement.
      const cur = rail.querySelector('.cg-mv.cur');
      if (cur) rail.scrollLeft = cur.offsetLeft - (rail.clientWidth - cur.offsetWidth) / 2;
      else rail.scrollLeft = rail.scrollWidth;
    }
    const title = $('#cg-side-title');
    if (title) title.textContent = 'Suivi des coups' + (moveLog.length ? ` · ${moveLog.length} coups` : '');

    // Le decompte de MES coups, dans l'ordre du dictionnaire de l'app.
    const tally = $('#cg-tally');
    if (tally) {
      const order = ['best', 'excellent', 'good', 'book', 'inaccuracy', 'miss', 'mistake', 'blunder'];
      const cnt = {};
      for (const e of moveLog) if (e.mine && e.k) cnt[e.k] = (cnt[e.k] || 0) + 1;
      const cells = order.filter(k => cnt[k]).map(k => {
        const T = typeOf(k);
        return `<span class="eval-badge ${k}" title="${T.label}">${T.mark} ${cnt[k]}</span>`;
      });
      tally.innerHTML = cells.length ? cells.join('') : '';
    }
    const leg = $('#cg-legend');
    if (leg && !leg.dataset.done) {
      leg.dataset.done = '1';
      leg.innerHTML = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'].map(k => {
        const T = typeOf(k);
        return `<span class="cg-leg"><i class="eval-badge ${k}">${T.mark}</i>${T.label}</span>`;
      }).join('');
    }
  }

  // ── Mode revue : regarder un coup passe ─────────────────────────────────
  // La position est rejouee depuis le depart d'apres l'historique de la partie ;
  // `game` n'est jamais modifie, donc revenir a la partie ne coute rien et il
  // n'y a aucun risque de perdre le fil.
  function fenAtPly(ply) {
    try {
      const g = new Chess();
      const h = game.history();
      const n = Math.max(0, Math.min(ply, h.length));
      let last = null;
      for (let i = 0; i < n; i++) last = g.move(h[i], { sloppy: true });
      return { fen: g.fen(), last };
    } catch (_) { return null; }
  }

  function gotoPly(ply) {
    if (!game) return;
    // Une navigation VOULUE arrete la relecture au ralenti ; celle que la
    // relecture declenche elle-meme, non (sinon elle se couperait au 1er pas).
    if (!tailBusy) stopTail();
    const total = game.history().length;
    const p = Math.max(1, Math.min(ply, total));
    const from = curShownFen();
    reviewPly = (p === total) ? null : p;
    const at = fenAtPly(p);
    if (!at) return;
    threatArrows = false;
    BoardRenderer.clearArrows(arrowsSvg);
    BoardRenderer.renderAnimated(boardSvg, from, at.fen,
      at.last ? { from: at.last.from, to: at.last.to } : null, ANIM_MS);
    renderReviewBar();
    renderMoves();
    syncControls();
    // De retour sur la position finale : l'anatomie du mat se rallume.
    if (endInfo) paintEndMarks();
    // De retour au coup courant : on rend la main (fleches d'aide comprises).
    if (reviewPly == null && myTurn() && !busy) onMyTurn();
  }

  // La FEN actuellement AFFICHEE (live ou revue) : c'est elle qui sert de point
  // de depart a l'animation, sinon le glissement part de la mauvaise position.
  function curShownFen() {
    if (reviewPly == null) return curFen();
    const at = fenAtPly(reviewPly);
    return at ? at.fen : curFen();
  }

  // Les fleches du bandeau de revue ET celles du ruban : meme code, memes
  // bornes, pour ne pas avoir deux comportements de navigation dans l'ecran.
  function navRev(e) {
    const b = e.target.closest('button[data-rev]');
    if (!b || !game) return;
    const total = game.history().length;
    if (b.dataset.rev === 'live') gotoPly(total);
    else if (b.dataset.rev === 'prev') gotoPly((reviewPly == null ? total : reviewPly) - 1);
    else if (b.dataset.rev === 'next') gotoPly((reviewPly == null ? total : reviewPly) + 1);
  }

  // La feuille « tous les coups » : sur telephone, la colonne de droite du
  // desktop remonte en panneau bas par-dessus l'echiquier. Un seul DOM, une
  // seule fonction de rendu - c'est le CSS qui change de presentation.
  function setSheet(on) {
    const g = $('#cg-game'), bd = $('#cg-backdrop');
    if (!g) return;
    sheetOpen = !!on;
    g.classList.toggle('cg-sheeton', sheetOpen);
    if (bd) bd.hidden = !sheetOpen;
    if (sheetOpen) {
      const host = $('#cg-moves');
      if (host && reviewPly == null) host.scrollTop = host.scrollHeight;
    }
  }

  function renderReviewBar() {
    const el = $('#cg-review');
    if (!el) return;
    if (reviewPly == null) { el.hidden = true; el.innerHTML = ''; return; }
    const n = Math.ceil(reviewPly / 2);
    const dots = reviewPly % 2 === 1 ? '.' : '…';
    const e = moveLog[reviewPly - 1];
    el.hidden = false;
    el.innerHTML = `<span class="t">👁 Tu regardes le coup <b>${n}${dots}${e ? ' ' + e.san : ''}</b></span>`
      + `<button type="button" class="train-btn ghost" data-rev="prev">◀</button>`
      + `<button type="button" class="train-btn ghost" data-rev="next">▶</button>`
      + `<button type="button" class="train-btn" data-rev="live">${endInfo ? '▶▶ Revenir à la position finale' : '▶▶ Revenir à la partie'}</button>`;
  }

  // ── Le bandeau du livre ──────────────────────────────────────────────────
  function renderBookBar() {
    const el = $('#cg-bookbar');
    if (!el) return;
    if (!book) { el.hidden = true; return; }
    el.hidden = false;
    const n = book.sans.length;
    if (bookOut === 'coach') {
      const played = game.history().slice(-1)[0] || '';
      el.className = 'cg-bookbar out';
      el.innerHTML = `<div class="t"><span class="ic">⚡</span><span>Il vient de sortir du livre</span>`
        + `<span class="n">coup ${Math.ceil(game.history().length / 2)}</span></div>`
        + `<p class="sub"><b>${fr(played)}</b> — hors de ta ligne. À toi de trouver la suite : c'est exactement ce qui`
        + ` t'arrive dans tes vraies parties.</p>`;
      return;
    }
    if (bookOut === 'me') {
      el.className = 'cg-bookbar out';
      el.innerHTML = `<div class="t"><span class="ic">📖</span><span>Tu quittes le livre ici</span></div>`
        + `<p class="sub">Ta ligne disait <b>${fr(book.sans[bookPly] || '?')}</b>. Le coach joue maintenant librement.</p>`;
      return;
    }
    const done = bookPly, dots = [];
    for (let i = 0; i < Math.min(n, 12); i++) dots.push(`<i class="${i < done ? 'on' : i === done ? 'cur' : ''}"></i>`);
    const next = book.sans[bookPly] ? `Prochain coup de la ligne : <b>${fr(book.sans[bookPly])}</b>.` : `Fin de la ligne : le coach joue librement.`;
    el.className = 'cg-bookbar';
    el.innerHTML = `<div class="t"><span class="ic">📖</span><span>${book.name}</span>`
      + `<span class="n">${Math.min(done, n)}/${n}</span></div>`
      + `<div class="dots">${dots.join('')}</div><p class="sub">${next}</p>`;
  }

  // Le coup du livre attendu a ce ply, ou null (hors livre / fin de ligne /
  // deviation programmee).
  function bookMoveNow() {
    if (!book || bookOut) return null;
    const ply = game.history().length;
    if (ply !== bookPly || ply >= book.sans.length) return null;
    if (book.leaveAt != null && ply === book.leaveAt) return null;
    return book.sans[ply];
  }

  // ═════════════════════════ Mon trait ═════════════════════════
  async function onMyTurn() {
    // On NE vide pas le calque quand des fleches de menace viennent d'etre
    // peintes : elles decrivent la position courante, c'est-a-dire ce qui me
    // menace pendant que je cherche mon coup.
    if (!threatArrows) BoardRenderer.clearArrows(arrowsSvg);
    if (gameOver()) return finish('board');
    hintLevel = 0; hintArrow = false;
    const box = $('#cg-hintout'); if (box) { box.hidden = true; box.innerHTML = ''; }

    busy = true;
    syncControls();
    setStatus('⏳ Le moteur regarde la position…');
    const my = ++token;
    const fen = curFen();

    // MES coups sont juges a PLEINE force (pas de `skill`), sinon la note
    // n'aurait aucun sens : c'est l'adversaire qui est bride, pas l'arbitre.
    let res = null;
    try {
      if (typeof StockfishEngine !== 'undefined') {
        if (!StockfishEngine.isReady()) await StockfishEngine.init();
        if (my !== token) return;
        res = await StockfishEngine.evaluate(fen, DEPTH_ME);
      }
    } catch (_) { res = null; }
    if (my !== token) return;

    curEvalMe = meScore(res, fen);
    // Cette eval est celle de la position APRES la reponse du coach : on la
    // range sur le demi-coup correspondant (point de vue des Blancs) pour que
    // le mode revue affiche la bonne valeur. Aucune recherche en plus.
    const lastLog = moveLog[game.history().length - 1];
    if (lastLog && curEvalMe != null) lastLog.ev = mySide === 'w' ? curEvalMe : -curEvalMe;
    myBestUci = res && res.bestMove ? res.bestMove : null;
    myBestPv = res && res.pv ? res.pv : '';
    myLines = (res && res.lines) ? res.lines : null;   // mes coups candidats, notes dans LA MEME recherche
    // Le coup que le coach vient de jouer se note maintenant : son eval avant
    // (mesuree juste apres mon coup) contre son eval apres (celle-ci, vue de son
    // cote). Zero recherche supplementaire.
    if (pendingOpp && curEvalMe != null && pendingOpp.evalBefore != null) {
      // Tout est vu de SON cote : son eval « avant » a ete mesuree juste apres
      // mon coup, son eval « apres » est l'inverse de la mienne maintenant.
      const oppAfter = -curEvalMe;
      const w = winLoss(pendingOpp.evalBefore, oppAfter);
      const winB = (typeof Analyzer !== 'undefined' && Analyzer.cpToWinPct)
        ? Analyzer.cpToWinPct(pendingOpp.evalBefore) : 0.5;
      gradeLogged(pendingOpp.idx, classify(false, w, !!pendingOpp.inBook, winB, oppAfter > -150, false, false));
      pendingOpp = null;
    }
    busy = false;
    syncControls();

    if (cfg.aide === 'assiste') {
      drawAssist(fen);
      const best = uciToFr(fen, myBestUci);
      setStatus(`Trait à <b>toi</b>. Éval <b>${fmtMe(curEvalMe)}</b> (ton point de vue).`
        + (best ? ` Meilleur : <b>${best}</b> <span class="rp-hint">(flèche bleue)</span>.` : ''));
      $('#cg-hintout').hidden = true;
      const why = whyBest(fen, myBestUci);
      if (why) { $('#cg-hintout').hidden = false; $('#cg-hintout').innerHTML = `<b>Pourquoi ${best} ?</b> ${why}`; }
    } else {
      // Mode libre : l'ecran est MUET. Pas d'eval, pas de fleche, pas de suite.
      setStatus(`Trait à <b>toi</b>. <span class="rp-hint">À toi de trouver — aucune aide affichée.</span>`);
    }
    syncHintBtn();
  }

  // Assiste : fleche bleue sur le meilleur coup + ce qu'il menacerait.
  function drawAssist(fen) {
    threatArrows = false;
    const arr = [];
    if (myBestUci) arr.push({ from: myBestUci.slice(0, 2), to: myBestUci.slice(2, 4), color: '#5b8fb9', opacity: 0.9, width: 7 });
    const t = threatsOfBest(fen, myBestUci);
    if (t) {
      for (const c of (t.checks || [])) arr.push({ from: c.from, to: c.sq, color: '#e05252', opacity: 0.9, width: 6 });
      for (const d of (t.direct || [])) arr.push({ from: d.from, to: d.sq, color: '#4ade80', opacity: 0.85, width: 5 });
    }
    BoardRenderer.drawArrows(arrowsSvg, arr);
  }

  function threatsOfBest(fen, uci) {
    if (!uci || typeof Tactics === 'undefined' || !Tactics.threats) return null;
    try {
      const g = new Chess(fen);
      const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
      if (!m) return null;
      return Tactics.threats(fen, g.fen(), { from: m.from, to: m.to });
    } catch (_) { return null; }
  }
  function whyBest(fen, uci, pvStr) {
    const t = threatsOfBest(fen, uci);
    let head = '';
    if (t && (t.count || t.mate) && Tactics.threatSentence) head = Tactics.threatSentence(t, t.final !== false) || '';
    const pv = FreePlay.pvToFr(fen, pvStr == null ? myBestPv : pvStr, 4);
    const line = pv.length > 1 ? ` <span class="rp-hint">(suite : ${pv.join(' ')})</span>` : '';
    if (head) return head + line;
    return pv.length > 1 ? `la suite du moteur est <b>${pv.join(' ')}</b>.` : '';
  }

  // ── Indice en trois temps (mode libre) ───────────────────────────────────
  function useHint() {
    if (busy || !myTurn() || hintLevel >= 3) return;
    hintLevel++;
    if (stats) stats.hints++;
    const fen = curFen();
    const box = $('#cg-hintout');
    box.hidden = false;
    if (hintLevel === 1) {
      const t = threatsOfBest(fen, myBestUci);
      const theme = t && t.mate ? 'il y a un <b>mat</b>'
        : t && (t.checks || []).length ? 'ça commence par un <b>échec</b>'
        : t && (t.direct || []).length ? 'un coup <b>attaque une pièce</b>'
        : 'c\'est un coup <b>calme</b> (développement, sécurité du roi)';
      box.innerHTML = `💡 <b>Le thème</b> : ${theme}.`;
    } else if (hintLevel === 2) {
      const from = myBestUci ? myBestUci.slice(0, 2) : null;
      let pc = null;
      try { pc = from ? new Chess(fen).get(from) : null; } catch (_) {}
      const FRP = { p: 'un pion', n: 'un cavalier', b: 'un fou', r: 'une tour', q: 'la dame', k: 'le roi' };
      box.innerHTML = `💡 <b>La pièce</b> : ${pc ? FRP[pc.type] : 'une pièce'} en <b>${from || '?'}</b>.`;
    } else {
      hintArrow = true;
      const best = uciToFr(fen, myBestUci);
      box.innerHTML = `💡 <b>Le coup</b> : ${best || '?'} <span class="rp-hint">(flèche bleue)</span>.`;
      if (myBestUci) { BoardRenderer.drawArrows(arrowsSvg, [{ from: myBestUci.slice(0, 2), to: myBestUci.slice(2, 4), color: '#5b8fb9', opacity: 0.9, width: 7 }]); threatArrows = false; }
    }
    syncHintBtn();
  }

  // ═════════════════════════ Je joue ═════════════════════════
  // Le DERNIER coup joue est-il de la theorie ? Deux sources : la ligne imposee
  // (priorite) et le catalogue des ouvertures - meme regle que l'analyseur, qui
  // fait primer « Theorique » sur « Imprecision » dans une ligne reconnue.
  // Vaut pour les deux camps : la theorie ne depend pas de qui joue.
  function lastMoveWasBook(onLine) {
    if (onLine) return true;
    try {
      if (typeof Openings === 'undefined') return false;
      const h = game.history();
      // « Encore dans le livre » = la sequence jouee est le debut d'une ligne du
      // catalogue (Openings.inBook), OU une ligne nommee couvre exactement ce
      // qui a ete joue (Openings.detect). Le premier test est celui qui repond
      // pour 1.e4 e5 ; le second pour une ligne longue deja nommee.
      if (Openings.inBook && Openings.inBook(h)) return true;
      const det = Openings.detect ? Openings.detect(h) : null;
      return !!(det && det.moves >= 3 && h.length <= det.moves);
    } catch (_) { return false; }
  }

  function playMyMove(from, to) {
    if (busy || !myTurn() || reviewPly !== null) return;
    const fen = curFen();
    let mv = null;
    try { mv = game.move({ from, to, promotion: 'q' }); } catch (_) { mv = null; }
    if (!mv) { setStatus('⚠️ Coup illégal. Glisse une pièce sur une case légale.'); return; }

    // Sortie de livre de MON cote : le bandeau le dit, comme dans les cours.
    let onLine = false;
    if (book && !bookOut) {
      const expected = book.sans[game.history().length - 1];
      if (expected && mv.san !== expected) bookOut = 'me';
      else { bookPly = game.history().length; onLine = !!expected; }
    }
    lastWasBook = lastMoveWasBook(onLine);

    BoardRenderer.clearArrows(arrowsSvg);
    threatArrows = false;
    renderBoard(mv, fen);
    renderBookBar();
    busy = true;
    setVerdict('');
    setStatus('⏳ Le coach réfléchit…');
    judgeThenReply(fen, mv, from + to + (mv.promotion || ''), ++token);
  }

  const RETRY = `<div class="rp-retry-row">`
    + `<button type="button" class="train-btn rp-retry" id="cg-retry">↶ Reprendre ce coup</button>`
    + `<button type="button" class="train-btn ghost" id="cg-keepgoing">▶ Continuer quand même</button>`
    + `<span class="rp-retry-note">La partie n'est pas arrêtée : tu peux jouer la suite et voir ce que ça donne.</span>`
    + `</div>`;

  async function judgeThenReply(fenBefore, myMove, myUci, my) {
    const fenAfter = curFen();
    let res = null;
    try {
      if (typeof StockfishEngine !== 'undefined') {
        if (!StockfishEngine.isReady()) await StockfishEngine.init();
        if (my !== token) return;
        res = await StockfishEngine.evaluate(fenAfter, DEPTH_ME);   // pleine force : c'est la note
      }
    } catch (_) { res = null; }
    if (my !== token) return;

    const after = meScore(res, fenAfter);
    stats.moves++;
    track.push(after == null ? null : Math.max(-1500, Math.min(1500, after)));

    const isBest = myUci === myBestUci;
    if (isBest) stats.best++;
    // Priorite a la lecture dans la recherche d'AVANT le coup ; a defaut (mon
    // coup n'est pas dans les 5 lignes), on retombe sur la difference des deux
    // recherches, moins fine mais toujours mieux que rien.
    const exact = lineLoss(myLines, myUci);
    const cpLoss = exact ? exact.cp : ((curEvalMe != null && after != null) ? Math.max(0, curEvalMe - after) : null);
    const wpl = exact ? exact.wpl : winLoss(curEvalMe, after);
    const v = gradeMove(isBest, cpLoss, fenBefore, myMove, fenAfter, lastWasBook, wpl, {
      fenBefore, fenAfter, myMove, evalBefore: curEvalMe, evalAfter: after,
      res, bestUci: myBestUci, bestPv: myBestPv,
    });
    const myIdx = logMove(myMove.san, true, v.k);
    if (moveLog[myIdx] && after != null) moveLog[myIdx].ev = mySide === 'w' ? after : -after;
    // Ce que le BILAN lira. Tout est deja calcule ici : le noter coute zero
    // recherche, et sans ces quatre champs le bilan ne peut dire ni la
    // precision, ni la phase qui casse, ni le coup qui a fait basculer.
    if (moveLog[myIdx]) {
      const e = moveLog[myIdx];
      e.wpl = (typeof wpl === 'number') ? wpl : null;
      e.cp = (cpLoss == null) ? null : cpLoss;
      e.eb = curEvalMe; e.ea = after;
      e.bs = myBestUci ? uciToFr(fenBefore, myBestUci) : null;
      try {
        e.ph = (typeof Analyzer !== 'undefined' && Analyzer.phaseOf)
          ? Analyzer.phaseOf(fenBefore, game.history().length - 1) : 'middle';
      } catch (_) { e.ph = 'middle'; }
    }
    // L'eval de reference du coach : son point de vue, c'est l'oppose du mien.
    const oppBefore = after == null ? null : -after;
    if (v.slip) {
      stats.slips++;
      // Forme attendue par Training.ingestGame() : ply 0-base, type, cpLoss.
      stats.mistakes.push({
        ply: game.history().length - 1,
        moveNo: Math.ceil(game.history().length / 2),
        fenBefore, bestUci: myBestUci || null, bestSan: uciToFr(fenBefore, myBestUci) || '',
        playedSan: fr(myMove.san), type: v.blunder ? 'blunder' : 'mistake',
        cpLoss: cpLoss == null ? 0 : Math.round(cpLoss), winPctLoss: wpl || 0, pv: myBestPv || '',
      });
    }

    if (gameOver()) { busy = false; syncControls(); setVerdict(v.html, v.cls); setStatus(''); return finish('board'); }

    // Le coach repond, a SON niveau.
    const reply = await coachReply(fenAfter, my);
    if (my !== token) return;

    let replyHtml = '';
    let threatHtml = '';
    if (reply) {
      renderBoard(reply.mv, fenAfter);
      renderBookBar();
      // Meme regle que pour moi : la theorie ne depend pas du camp qui joue,
      // mais de la position atteinte (c'est ce qui manquait - en Petrov, ses
      // …e5 et …Cf6 sortaient « imprecision » et « erreur »).
      const oppBook = lastMoveWasBook(reply.tag === 'coup du livre');
      const oppIdx = logMove(reply.mv.san, false, null);
      const oppUciPlayed = reply.mv.from + reply.mv.to + (reply.mv.promotion || '');
      // La recherche faite apres MON coup portait sur SES options : si son coup
      // y figure, on le note immediatement et sans bruit.
      const oppExact = lineLoss(res && res.lines, oppUciPlayed);
      if (oppExact) {
        const winB = (typeof Analyzer !== 'undefined' && Analyzer.cpToWinPct && res && res.lines && res.lines[0])
          ? Analyzer.cpToWinPct(res.lines[0].score) : 0.5;
        gradeLogged(oppIdx, classify(oppUciPlayed === (res && res.bestMove), oppExact.wpl, oppBook, winB, true, false, false));
        pendingOpp = null;
      } else {
        pendingOpp = { idx: oppIdx, evalBefore: oppBefore, inBook: oppBook };
      }
      replyHtml = `<div class="cg-reply">Il joue <b>${fr(reply.mv.san)}</b>${reply.tag ? ` <span class="rp-hint">${reply.tag}</span>` : ''}.</div>`;
      // C'est ICI que le mode libre montre ce qui a ete rate : les fleches
      // n'apparaissent qu'apres, sur le coup qui punit.
      if (typeof Tactics !== 'undefined' && Tactics.threats) {
        const t = Tactics.threats(fenAfter, curFen(), { from: reply.mv.from, to: reply.mv.to });
        if (t && (t.count || t.mate)) {
          const arr = [];
          for (const c of (t.checks || [])) arr.push({ from: c.from, to: c.sq, color: '#e05252', opacity: 0.95, width: 7 });
          for (const d of (t.direct || [])) arr.push({ from: d.from, to: d.sq, color: '#e05252', opacity: 0.85, width: 6 });
          for (const d of (t.discovered || [])) arr.push({ from: d.from, to: d.sq, color: '#5b8fb9', opacity: 0.85, width: 6 });
          if (arr.length) { BoardRenderer.drawArrows(arrowsSvg, arr); threatArrows = true; }
          const s = Tactics.threatSentence ? Tactics.threatSentence(t, t.final !== false) : '';
          if (s) threatHtml = `<div class="cg-threat">${s}</div>`;
        }
      }
    }

    setVerdict(v.html + replyHtml + threatHtml + (v.slip ? RETRY : ''), v.cls);
    busy = false;
    if (gameOver()) { syncControls(); setStatus(''); return finish('board'); }
    onMyTurn();
  }

  // Note de MON coup. Les seuils suivent ceux de l'app (analysis.js) ; le
  // commentaire vient de Analyzer.explainBadMove, comme dans « Rejoue ta
  // defaite ». Volontairement pas partage avec replay.js : ici le texte doit
  // pouvoir etre MUET avant le coup et bavard apres, et la version de replay.js
  // porte les specificites du mode conversion.
  // Perte lue DANS une seule recherche : les scores des lignes MultiPV sont
  // comparables entre eux (meme profondeur, meme instant), et le meilleur coup
  // perd exactement 0. Soustraire deux recherches differentes - ce que je
  // faisais - ajoute le bruit de profondeur au vrai changement, et c'est ce qui
  // faisait sortir « ?! » sur un coup de developpement tranquille.
  // `lines[i].score` est vu du camp au trait dans la position analysee.
  function lineLoss(lines, uci) {
    if (!lines || !lines.length || !uci) return null;
    const top = lines[0];
    const mine = lines.find(l => l && l.move === uci);
    if (!mine || typeof top.score !== 'number' || typeof mine.score !== 'number') return null;
    if (typeof Analyzer === 'undefined' || !Analyzer.cpToWinPct) return null;
    return {
      cp: Math.max(0, top.score - mine.score),
      wpl: Math.max(0, Analyzer.cpToWinPct(top.score) - Analyzer.cpToWinPct(mine.score)),
    };
  }

  // Perte en CHANCES DE GAIN, comme tout le reste de l'app. Juger en centiemes
  // de pion bruts donnait « 1.e4 = erreur (-63 cp) » : 63 centiemes valent 6
  // points de chances de gain a l'egalite (une imprecision) mais presque rien
  // dans une position deja perdue. Seuils et vocabulaire = ceux de analysis.js.
  function winLoss(before, after) {
    if (before == null || after == null || typeof Analyzer === 'undefined' || !Analyzer.cpToWinPct) return null;
    return Math.max(0, Analyzer.cpToWinPct(before) - Analyzer.cpToWinPct(after));
  }

  // Le dictionnaire des coups de l'app : un seul vocabulaire pour le verdict, le
  // suivi lateral et l'ecran d'analyse (l'app s'est deja fait avoir par deux
  // definitions concurrentes du mot « Excellent »).
  function typeOf(k) {
    const T = (typeof Analyzer !== 'undefined' && Analyzer.MOVE_CLASS) ? Analyzer.MOVE_CLASS[k] : null;
    return T || { label: k, mark: '', cls: k };
  }

  // La CLASSE du coup, aux seuils de analysis.js (en chances de gain).
  function classify(isBest, wpl, inBook, winBefore, stillOk, mated, onlyMove) {
    if (mated) return 'best';
    if (onlyMove) return 'forced';
    if (wpl == null) return isBest ? 'best' : 'good';
    if (wpl >= 0.20) return (winBefore >= 0.70 && stillOk) ? 'miss' : 'blunder';
    if (wpl >= 0.10) return (winBefore >= 0.70 && stillOk) ? 'miss' : 'mistake';
    if (inBook) return 'book';
    if (wpl >= 0.05) return 'inaccuracy';
    if (wpl >= 0.02) return 'good';
    if (isBest) return 'best';
    return 'excellent';
  }

  // Le commentaire long. Le user : « sois un peu plus verbeux quand tu expliques
  // pourquoi c'est une erreur / mauvais coup / gaffe / pourquoi il faudrait
  // faire autrement ». Quatre lignes maximum, toutes concretes : ce que ca
  // coute, ce que l'adversaire en fait, ce qu'il fallait jouer et pourquoi, et
  // le reflexe a retenir. Aucune morale, aucun « sois vigilant ».
  function explainSlip(ctx) {
    const bits = [];
    const { fenBefore, fenAfter, myMove, evalBefore, evalAfter, res, bestUci, bestPv } = ctx;

    // 1. Ce que ca coute, en clair.
    if (evalBefore != null && evalAfter != null) {
      bits.push(`<b>Ce que ça coûte</b> : tu passes de <b>${fmtMe(evalBefore)}</b> à <b>${fmtMe(evalAfter)}</b> (ton point de vue).`);
    }

    // 2. Ce que l'adversaire peut en faire : sa meilleure reponse, nommee, avec
    //    ce qu'elle menace. `res` est la recherche faite APRES mon coup, donc
    //    ses lignes sont les siennes.
    let punish = '';
    try {
      if (typeof Analyzer !== 'undefined' && Analyzer.explainBadMove) {
        punish = Analyzer.explainBadMove(fenBefore, fenAfter, { from: myMove.from, to: myMove.to, san: myMove.san }) || '';
      }
    } catch (_) { punish = ''; }
    const oppUci = res && res.bestMove ? res.bestMove : null;
    const oppSan = oppUci ? uciToFr(fenAfter, oppUci) : null;
    let oppWhy = '';
    if (oppUci) {
      const t = threatsAfter(fenAfter, oppUci);
      if (t && (t.count || t.mate) && typeof Tactics !== 'undefined' && Tactics.threatSentence) {
        oppWhy = Tactics.threatSentence(t, t.final !== false) || '';
        // La phrase de menace est ecrite du point de vue de celui qui joue le
        // coup : ici c'est LUI, donc son « adversaire » c'est moi. On le dit
        // avec mes mots, sinon on lit « l'adversaire ne peut pas tout sauver »
        // en parlant de soi.
        oppWhy = oppWhy.replace(/L'adversaire/g, 'Tu').replace(/l'adversaire/g, 'tu')
          .replace(/Tu ne peut/g, 'Tu ne peux').replace(/tu ne peut/g, 'tu ne peux')
          .replace(/Tu doit/g, 'Tu dois').replace(/tu doit/g, 'tu dois')
          .replace(/Tu n'a/g, "Tu n'as").replace(/tu n'a/g, "tu n'as")
          .replace(/Tu fait/g, 'Tu fais').replace(/tu fait/g, 'tu fais')
          .replace(/Tu ne fait/g, 'Tu ne fais').replace(/tu ne fait/g, 'tu ne fais')
          .replace(/Tu choisit/g, 'Tu choisis').replace(/tu choisit/g, 'tu choisis')
          .replace(/Tu reprend/g, 'Tu reprends').replace(/tu reprend/g, 'tu reprends')
          .replace(/Tu peut/g, 'Tu peux').replace(/tu peut/g, 'tu peux');
      }
    }
    const oppLine = res && res.pv ? FreePlay.pvToFr(fenAfter, res.pv, 4) : [];
    if (oppSan) {
      const head = oppWhy ? `<b>Ce que ça lui donne</b>` : `<b>Sa meilleure réponse</b>`;
      bits.push(`${head} : <b>${oppSan}</b>${oppWhy ? ' — ' + oppWhy : ''}`
        + (oppLine.length > 1 ? ` <span class="rp-hint">(suite : ${oppLine.join(' ')})</span>` : ''));
    } else if (punish) {
      bits.push(`<b>Ce qu'il peut faire</b> : ${punish}`);
    }

    // 3. Ce qu'il fallait jouer, et POURQUOI - c'est la demande explicite.
    const bestSan = bestUci ? uciToFr(fenBefore, bestUci) : null;
    if (bestSan) {
      const why = whyBest(fenBefore, bestUci, bestPv);
      bits.push(`<b>Il fallait jouer</b> : <b>${bestSan}</b>${why ? ' — ' + why : ''}`);
    }

    // 4. Le reflexe, tire de ce qui vient de se passer (pas un slogan).
    if (punish && (!oppWhy || oppWhy.indexOf('prise') < 0)) bits.push(`<b>Le réflexe</b> : ${punish}`);
    else if (oppSan && /x/.test(oppUci ? (uciToFr(fenAfter, oppUci) || '') : '')) {
      bits.push(`<b>Le réflexe</b> : avant de lâcher ton coup, regarde les <b>captures</b> que tu laisses à l'adversaire - c'est celle-là que tu n'as pas vue.`);
    }
    return bits.length ? `<div class="cg-why">${bits.map(b => '<p>' + b + '</p>').join('')}</div>` : '';
  }

  // Les menaces creees par un coup joue dans `fen` (sans le jouer pour de bon).
  function threatsAfter(fen, uci) {
    if (!uci || typeof Tactics === 'undefined' || !Tactics.threats) return null;
    try {
      const g = new Chess(fen);
      const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
      if (!m) return null;
      return Tactics.threats(fen, g.fen(), { from: m.from, to: m.to });
    } catch (_) { return null; }
  }

  function gradeMove(isBest, cpLoss, fenBefore, myMove, fenAfter, inBook, wpl, ctx) {
    let mated = false, onlyMove = false;
    try { mated = game.in_checkmate(); } catch (_) {}
    try { onlyMove = (new Chess(fenBefore)).moves().length === 1; } catch (_) {}
    const winBefore = (ctx && ctx.evalBefore != null && typeof Analyzer !== 'undefined' && Analyzer.cpToWinPct)
      ? Analyzer.cpToWinPct(ctx.evalBefore) : 0.5;
    const stillOk = (ctx && ctx.evalAfter != null) ? ctx.evalAfter > -150 : false;
    const k = classify(isBest, wpl, inBook, winBefore, stillOk, mated, onlyMove);
    const T = typeOf(k);
    const pts = wpl == null ? null : Math.round(wpl * 100);
    const slip = (k === 'mistake' || k === 'blunder' || k === 'miss');

    if (mated) return { k, html: '🏆 <b>Échec et mat !</b> Bien joué.', cls: 'right' };

    const badge = `<span class="eval-badge ${k}">${T.mark} ${T.label}</span>`;
    const cost = pts != null && pts >= 5 ? ` <span class="rp-hint">-${pts} pts de chances de gain</span>` : '';
    if (!slip) {
      const tail = k === 'book' ? ' Tu es encore dans le livre.'
        : k === 'best' ? ' C\'est le coup du moteur.'
        : k === 'forced' ? ' Il n\'y avait rien d\'autre.'
        : k === 'inaccuracy' ? ' Rien de grave, mais il y avait mieux.'
        : '';
      return { k, html: badge + cost + tail, cls: (k === 'inaccuracy' ? '' : 'right') };
    }
    return { k, html: badge + cost + explainSlip(ctx), cls: 'wrong', slip: true, blunder: k === 'blunder' };
  }

  // ═════════════════════════ Le coach joue ═════════════════════════
  // Trois sources, dans cet ordre : le livre, la gaffe volontaire, le tirage
  // pondere dans les lignes MultiPV.
  async function coachReply(fen, my) {
    // 1. Le livre passe avant tout : c'est l'ouverture imposee.
    const bm = bookMoveNow();
    if (bm) {
      try {
        const mv = game.move(bm, { sloppy: true });
        if (mv) { bookPly = game.history().length; return { mv, tag: 'coup du livre' }; }
      } catch (_) {}
    }
    if (book && !bookOut && book.leaveAt != null && game.history().length === book.leaveAt) bookOut = 'coach';

    // 2. Une seule recherche par coup, a SON niveau (Skill Level bride +
    //    movetime court). Les 5 lignes servent aux deux tirages qui suivent.
    let res = null;
    try {
      if (typeof StockfishEngine !== 'undefined') {
        if (!StockfishEngine.isReady()) await StockfishEngine.init();
        if (my !== token) return null;
        res = await StockfishEngine.evaluate(fen, 'movetime ' + prm.mt, { skill: prm.skill });
      }
    } catch (_) { res = null; }
    if (my !== token) return null;

    const lines = (res && res.lines) ? res.lines.filter(l => l && l.move) : [];
    const sp = effSpread(lines, prm.spread);
    const obvious = sp < prm.spread;         // piece a ramasser, ou mat en vue

    // 3. Gaffe volontaire : un coup legal au hasard. Jamais en echec (meme un
    //    debutant sort son roi), jamais quand il y a une piece a ramasser.
    let inCheck = false;
    try { inCheck = game.in_check(); } catch (_) {}
    if (prm.blunder > 0 && !inCheck && !obvious && Math.random() < prm.blunder) {
      const ms = game.moves({ verbose: true });
      if (ms.length) {
        const m = ms[Math.floor(Math.random() * ms.length)];
        const mv = game.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
        if (mv) return { mv, tag: null };
      }
    }

    // 4. Sinon : tirage pondere dans les lignes du moteur.
    let uci = null;
    if (lines.length) uci = lines[pickIndex(lines.length, sp)].move;
    else if (res && res.bestMove) uci = res.bestMove;

    if (!uci) {
      const ms = game.moves({ verbose: true });
      if (!ms.length) return null;
      uci = ms[0].from + ms[0].to + (ms[0].promotion || '');
    }
    let mv = null;
    try { mv = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); } catch (_) { mv = null; }
    if (!mv) {
      const ms = game.moves({ verbose: true });
      mv = ms.length ? game.move({ from: ms[0].from, to: ms[0].to, promotion: ms[0].promotion || 'q' }) : null;
    }
    return mv ? { mv, tag: null } : null;
  }

  // Le coach ouvre la partie (je joue les Noirs).
  async function coachMove() {
    busy = true;
    syncControls();
    setStatus('⏳ Le coach ouvre…');
    const my = ++token;
    const r = await coachReply(curFen(), my);
    if (my !== token) return;
    if (r) {
      renderBoard(r.mv, null); renderBookBar();
      // Son 1er coup : pas d'eval de reference (aucune recherche avant lui), on
      // le journalise donc sans note, mais deja marque theorique s'il l'est.
      const idx = logMove(r.mv.san, false, null);
      if (lastMoveWasBook(r.tag === 'coup du livre')) gradeLogged(idx, 'book');
    }
    busy = false;
    onMyTurn();
  }

  // ── Annuler : retirer sa reponse puis mon coup ───────────────────────────
  function undo() {
    if (!game || busy) return;
    token++;
    const h = game.history().length;
    if (!h) return;
    if (sideToMove() === mySide && h >= 2) { game.undo(); game.undo(); }
    else game.undo();
    if (track.length) track.pop();
    if (stats && stats.moves > 0) stats.moves--;
    // On retire du journal ce qu'on vient de defaire (mon coup + la reponse).
    while (moveLog.length > game.history().length) moveLog.pop();
    pendingOpp = null;
    renderMoves();
    curEvalMe = null; myBestUci = null; myLines = null; threatArrows = false;
    bookOut = null;
    bookPly = Math.min(bookPly, game.history().length);
    setVerdict('');
    renderBoard(null);
    renderBookBar();
    if (myTurn()) onMyTurn(); else coachMove();
  }


  // ═══════════════════ L'anatomie de la position finale ═══════════════════
  // Une partie ne se termine pas sur un tableau de chiffres : elle se termine
  // sur un ECHIQUIER. Avant, `finish()` basculait DROIT sur le bilan - le mat se
  // lisait donc comme un verdict tombe du ciel, sans qu'on ait seulement vu le
  // dernier coup se poser. Ces fonctions decrivent la position finale case par
  // case : qui donne l'echec, qui tient chacune des cases de fuite, pourquoi la
  // piece qui mate ne se prend pas, et pourquoi la ligne ne se coupe pas.
  //
  // Tout se calcule sur le PLATEAU (js/tactics.js), jamais sur une liste de
  // coups legaux : « le roi n'a pas de case » n'apprend rien, « ton propre pion
  // occupe g7 et la dame h7 tient f7 » s'explique ET se montre sur l'echiquier.
  //
  // UN POINT A NE PAS DEFAIRE : les cases de fuite se jugent sur un plateau ou
  // le ROI MATE A ETE RETIRE. Sinon le roi fait lui-meme ecran a la piece qui le
  // met en echec, et la case DERRIERE lui passe pour libre - c'est exactement le
  // mat du couloir, le plus frequent de tous.
  const FQ = 'abcdefgh';
  const rcOf = (sq) => ({ r: 8 - +sq[1], c: FQ.indexOf(sq[0]) });
  const sqOf = (r, c) => FQ[c] + (8 - r);
  const AROUND = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const PC_FR = { k: 'le roi', q: 'la dame', r: 'la tour', b: 'le fou', n: 'le cavalier', p: 'le pion' };
  const PC_MY = { k: 'ton roi', q: 'ta dame', r: 'ta tour', b: 'ton fou', n: 'ton cavalier', p: 'ton pion' };
  const PC_HIS = { k: 'son roi', q: 'sa dame', r: 'sa tour', b: 'son fou', n: 'son cavalier', p: 'son pion' };
  // Notation courte pour les pastilles. Le pion n'a pas de lettre dans un coup
  // ecrit, mais « a3 » tout seul dans une liste de defenseurs ne veut rien dire :
  // il est nomme.
  const PC_SHORT = { k: 'R', q: 'D', r: 'T', b: 'F', n: 'C', p: 'pion ' };
  // Le genre : seules la dame et la tour sont feminines. Sans ca, « son fou c2 »
  // etait suivi de « elle est protegee », ce qui saute aux yeux.
  const PC_FEM = { q: 1, r: 1 };
  function gnd(t) {
    const f = !!PC_FEM[t];
    return { il: f ? 'Elle' : 'Il', la: f ? 'la' : 'le', e: f ? 'e' : '', lui: f ? "d'elle" : 'de lui' };
  }
  function pcFr(t) { return PC_FR[t] || 'la pièce'; }
  function pcPoss(t, isMine) { return (isMine ? PC_MY : PC_HIS)[t] || (isMine ? 'ta pièce' : 'sa pièce'); }

  function boardCopy(b) { return b.map(row => row.slice()); }
  function findKingSq(b, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p && p.t === 'k' && p.c === color) return sqOf(r, c);
    }
    return null;
  }
  function boardNoKing(b, color) {
    const k = findKingSq(b, color);
    if (!k) return b;
    const n = boardCopy(b), { r, c } = rcOf(k);
    n[r][c] = null;
    return n;
  }
  // Les cases STRICTEMENT entre deux cases alignees ; [] si elles ne le sont pas.
  function betweenSqs(a, z) {
    const A = rcOf(a), Z = rcOf(z);
    const dR = Z.r - A.r, dC = Z.c - A.c;
    if (dR !== 0 && dC !== 0 && Math.abs(dR) !== Math.abs(dC)) return [];
    const sr = Math.sign(dR), sc = Math.sign(dC);
    const out = [];
    let r = A.r + sr, c = A.c + sc;
    while (r !== Z.r || c !== Z.c) { out.push(sqOf(r, c)); r += sr; c += sc; }
    return out;
  }
  // Deplacer une piece sur un plateau de travail, puis regarder si le roi
  // `color` est ENCORE attaque. C'est la reponse exacte a « pourquoi je ne peux
  // pas prendre / m'interposer » : soit la piece etait clouee, soit l'echec
  // venait aussi d'ailleurs (echec double).
  function stillCheckAfter(b, from, to, color) {
    const n = boardCopy(b);
    const a = rcOf(from), z = rcOf(to);
    n[z.r][z.c] = n[a.r][a.c];
    n[a.r][a.c] = null;
    const k = findKingSq(n, color);
    if (!k) return [];
    return Tactics.attackersOf(n, k, color === 'w' ? 'b' : 'w');
  }
  // Le pion du camp `color` qui pourrait venir sur `sq` par une poussee, ou
  // null. `attackersOf` ne le trouve pas : un pion ne prend pas devant lui.
  function pawnPushTo(b, sq, color) {
    const { r: tr, c: tc } = rcOf(sq);
    if (tr < 0 || tr > 7 || tc < 0 || tc > 7 || b[tr][tc]) return null;
    const back = color === 'w' ? 1 : -1;           // la ligne d'ou vient le pion
    const one = (tr + back >= 0 && tr + back < 8) ? b[tr + back][tc] : null;
    if (one && one.c === color && one.t === 'p') return sqOf(tr + back, tc);
    const home = color === 'w' ? 6 : 1;
    if (!one && tr + 2 * back === home) {
      const two = b[home][tc];
      if (two && two.c === color && two.t === 'p') return sqOf(home, tc);
    }
    return null;
  }

  // La description complete de la position finale. Pure : aucun DOM, aucun etat
  // de module - elle est testee dans tools/test_core.cjs sur des mats reels.
  function endAnatomy(fen, reason, drawKind) {
    const out = { kind: 'other', king: null, checkers: [], support: [], flight: [], takers: [], cut: null };
    if (reason === 'resign') { out.kind = 'resign'; return out; }
    let g = null;
    try { g = new Chess(fen); } catch (_) { return out; }
    const loser = (fen.split(' ')[1] === 'w') ? 'w' : 'b';
    const winner = loser === 'w' ? 'b' : 'w';
    out.loser = loser; out.winner = winner;
    let mate = false, noMove = false;
    try { mate = g.in_checkmate(); } catch (_) {}
    try { noMove = g.moves().length === 0; } catch (_) {}
    if (mate) out.kind = 'mate';
    else if (noMove) out.kind = 'stalemate';
    else if (drawKind) { out.kind = drawKind; return out; }
    else {
      // Sans historique, on ne peut reconnaitre que le materiel insuffisant.
      try { if (g.insufficient_material()) out.kind = 'material'; } catch (_) {}
      return out;
    }

    const b = Tactics.boardOf(fen);
    const bk = boardNoKing(b, loser);
    const k = findKingSq(b, loser);
    out.king = k;
    if (!k) return out;

    out.checkers = Tactics.attackersOf(b, k, winner).map(p => ({ sq: p.sq, t: p.t }));
    // Qui SOUTIENT la piece qui mate : sans ce soutien, le roi la croquerait et
    // il n'y aurait pas de mat du tout. C'est la moitie de l'explication.
    for (const ch of out.checkers) {
      for (const s of Tactics.attackersOf(bk, ch.sq, winner)) {
        if (s.sq !== ch.sq) out.support.push({ sq: s.sq, t: s.t, on: ch.sq });
      }
    }
    // Les 8 cases autour du roi, jugees sur le plateau SANS le roi.
    const { r, c } = rcOf(k);
    for (const [dr, dc] of AROUND) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const sq = sqOf(rr, cc);
      const occ = b[rr][cc];
      if (occ && occ.c === loser) { out.flight.push({ sq, state: 'own', t: occ.t, by: [] }); continue; }
      const by = Tactics.attackersOf(bk, sq, winner).map(p => ({ sq: p.sq, t: p.t }));
      out.flight.push({ sq, state: by.length ? 'held' : 'free', t: occ ? occ.t : null, cap: !!occ, by });
    }

    if (out.kind !== 'mate') return out;
    // Prendre la piece qui mate ? On JOUE chaque prise sur un plateau de travail.
    if (out.checkers.length === 1) {
      const ch = out.checkers[0];
      for (const p of Tactics.attackersOf(b, ch.sq, loser)) {
        if (p.t === 'k') continue;               // le roi : c'est une case de fuite, traitee plus haut
        const still = stillCheckAfter(b, p.sq, ch.sq, loser);
        out.takers.push({ sq: p.sq, t: p.t, still: still.length ? still.map(x => ({ sq: x.sq, t: x.t })) : null });
      }
      // Couper la ligne : seulement pour une piece a longue portee.
      if ('qrb'.indexOf(ch.t) >= 0) {
        const path = betweenSqs(ch.sq, k);
        if (path.length) {
          const tries = [];
          for (const s of path) {
            for (const p of Tactics.attackersOf(b, s, loser)) {
              if (p.t === 'k') continue;
              const still = stillCheckAfter(b, p.sq, s, loser);
              tries.push({ from: p.sq, t: p.t, to: s, still: still.length ? still.map(x => ({ sq: x.sq, t: x.t })) : null });
            }
            const pp = pawnPushTo(b, s, loser);
            if (pp) {
              const still = stillCheckAfter(b, pp, s, loser);
              tries.push({ from: pp, t: 'p', to: s, still: still.length ? still.map(x => ({ sq: x.sq, t: x.t })) : null });
            }
          }
          out.cut = { path, tries };
        }
      }
    }
    return out;
  }

  // Les fleches et les anneaux qui MONTRENT l'anatomie sur l'echiquier. Meme
  // code couleur que partout dans l'app : rouge = ce qui tue, bleu = ce qui
  // soutient, ambre = ta propre piece qui bouche la sortie, vert = une case
  // reellement libre.
  //   niveau 0 = l'echec et les cases ; niveau 1 = + qui tient chaque case.
  function endArrows(an, level) {
    if (!an || !an.king) return [];
    const A = [];
    for (const ch of an.checkers) A.push({ from: ch.sq, to: an.king, color: '#e05252', opacity: .95, width: 8 });
    for (const f of an.flight) {
      if (f.state === 'own') A.push({ from: f.sq, to: f.sq, color: '#e2b857', opacity: .8, width: 5 });
      else if (f.state === 'held') A.push({ from: f.sq, to: f.sq, color: '#e05252', opacity: .7, width: 5 });
      else A.push({ from: f.sq, to: f.sq, color: '#56b886', opacity: .9, width: 5 });
    }
    if (level >= 1) {
      for (const s of an.support) A.push({ from: s.sq, to: s.on, color: '#5b8fb9', opacity: .85, width: 5 });
      for (const f of an.flight) {
        if (f.state !== 'held') continue;
        for (const p of f.by) A.push({ from: p.sq, to: f.sq, color: '#e05252', opacity: .45, width: 4 });
      }
    }
    return A;
  }

  // ── Le recit de la fin, en phrases ───────────────────────────────────────
  // Chaque case citee est CLIQUABLE : elle s'allume sur l'echiquier. C'est tout
  // l'interet de rester sur le plateau au lieu de sauter au bilan - on lit
  // « la dame h7 tient f7 » ET on le voit.
  function sqChip(s) { return `<b class="cg-sq" data-sq="${s}">${s}</b>`; }
  function pcChip(p, isMine) { return pcPoss(p.t, isMine) + ' ' + sqChip(p.sq); }
  function andList(arr) {
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' et ' + arr[arr.length - 1];
  }

  function endStory(an, ctx) {
    const pts = [];
    const lastSan = ctx.lastSan ? `<b>${ctx.lastSan}</b>` : 'le dernier coup';
    const iLose = an.loser === ctx.mySide;          // c'est MON roi qui subit
    const mineWins = !iLose;
    const K = iLose ? 'ton roi' : 'son roi';
    let lead = '';

    if (an.kind === 'mate') {
      lead = `Le dernier coup est ${lastSan}. Avant de regarder les chiffres, regarde la position : `
        + `voici exactement pourquoi ${K} n'a plus de coup.`;
      // 1. L'echec.
      if (an.checkers.length >= 2) {
        pts.push({ ic: '⚔️', h: `<b>Échec double</b> — ${andList(an.checkers.map(c => pcChip(c, mineWins)))} attaquent ${K} en même temps. `
          + `Contre un échec double il n'y a qu'une seule réponse possible aux échecs : <b>bouger le roi</b>. Ni prise ni interposition ne peuvent parer deux pièces d'un coup.` });
      } else if (an.checkers.length === 1) {
        const ch = an.checkers[0];
        const sup = an.support.filter(s => s.on === ch.sq);
        const g = gnd(ch.t);
        let h = `<b>L'échec vient de ${pcChip(ch, mineWins)}.</b>`;
        if (sup.length) h += ` ${g.il} est protégé${g.e} par ${andList(sup.map(s => pcChip(s, mineWins)))} : ${K} ne peut donc pas ${g.la} croquer.`;
        else h += ` Rien ne ${g.la} protège, mais ${K} n'est pas à côté ${g.lui} — il ne peut pas ${g.la} prendre.`;
        pts.push({ ic: '⚔️', h, arrows: 'check' });
      }
      // 2. Les cases.
      pts.push(flightPoint(an, iLose, K));
      // 3. La prise.
      const ch = an.checkers.length === 1 ? an.checkers[0] : null;
      if (ch) {
        const real = an.takers.filter(t => t.still);
        const adj = an.flight.some(f => f.sq === ch.sq);   // le roi y porte deja
        if (real.length) {
          const bits = real.slice(0, 3).map(t => `${pcChip(t, iLose)} y porte, mais après la prise ${K} serait <b>encore en échec</b> par ${andList(t.still.map(x => pcChip(x, mineWins)))} : ${gnd(t.t).il.toLowerCase()} est <b>cloué${gnd(t.t).e}</b>`);
          pts.push({ ic: '🗡', h: `<b>Prendre ${pcFr(ch.t)} ${sqChip(ch.sq)} ?</b> ${andList(bits)}.` });
        } else if (!an.takers.length && !adj) {
          pts.push({ ic: '🗡', h: `<b>Prendre ${pcFr(ch.t)} ${sqChip(ch.sq)} ?</b> Aucune ${iLose ? 'de tes pièces' : 'de ses pièces'} ne porte sur cette case : ${gnd(ch.t).il.toLowerCase()} frappe de <b>loin</b>, bien à l'abri.` });
        }
      }
      // 4. Couper la ligne.
      if (an.cut && an.cut.path.length) {
        const path = an.cut.path.map(sqChip).join(' ou ');
        const tried = an.cut.tries.filter(t => t.still);
        pts.push({
          ic: '⛓', h: `<b>Couper la ligne ?</b> Il faudrait boucher ${path}. `
            + (tried.length
              ? `${andList(tried.slice(0, 2).map(t => `${pcChip(t, iLose)} pourrait y aller, mais ${gnd(t.t).il.toLowerCase()} est cloué${gnd(t.t).e}`))}.`
              : `${iLose ? 'Aucune de tes pièces' : 'Aucune de ses pièces'} ne peut y venir.`),
          arrows: 'cut',
        });
      }
    } else if (an.kind === 'stalemate') {
      lead = `Le dernier coup est ${lastSan}. <b>${cap(K)} n'est PAS en échec</b> — il n'a simplement plus aucun coup légal. C'est un pat : la partie est nulle, quel que soit le matériel sur l'échiquier.`;
      pts.push(flightPoint(an, iLose, K));
      pts.push({ ic: '🔒', h: `Et ${iLose ? 'aucune de tes autres pièces' : 'aucune de ses autres pièces'} ne peut bouger non plus : pions bloqués, pièces clouées, ou plus rien sur le plateau. Un seul coup légal aurait suffi à éviter le pat.` });
    } else if (an.kind === 'material') {
      lead = `${lastSan} laisse un matériel avec lequel <b>personne ne peut mater</b>, même en jouant les pires coups possibles. La règle arrête la partie immédiatement : nulle.`;
    } else if (an.kind === 'repetition') {
      lead = `La même position vient d'apparaître pour la <b>troisième fois</b>, avec le même camp au trait et les mêmes droits de roque. Nulle par répétition.`;
    } else if (an.kind === 'fifty') {
      lead = `<b>Cinquante coups</b> viennent de passer sans la moindre prise ni le moindre coup de pion. La partie est déclarée nulle : c'est la règle qui empêche de jouer une finale à l'infini.`;
    } else if (an.kind === 'resign') {
      lead = `Tu as rendu la partie. La position est restée telle quelle — remonte les coups tant que tu veux, elle ne va nulle part.`;
    }
    return { lead, pts: pts.filter(Boolean) };
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Les cases autour du roi, une par une : c'est le point que personne ne prend
  // le temps de regarder, et c'est TOUJOURS la reponse a « mais pourquoi il ne
  // bouge pas ? ».
  // Les cases autour du roi, une par une. En PHRASE, huit cases donnaient une
  // tirade de six lignes que personne ne lit ; en GRILLE de pastilles, chacune
  // se lit d'un coup d'oeil et s'allume sur l'echiquier quand on la touche.
  // C'est le point que personne ne prend le temps de regarder, et c'est
  // toujours la reponse a « mais pourquoi il ne bouge pas ? ».
  function flightPoint(an, iLose, K) {
    if (!an.flight.length) return null;
    const mineWins = !iLose;
    const own = an.flight.filter(f => f.state === 'own').length;
    const free = an.flight.filter(f => f.state === 'free').length;
    const short = (p) => (PC_SHORT[p.t] || '') + p.sq;
    const cell = (f) => {
      if (f.state === 'own') {
        return `<button type="button" class="cg-fsq own" data-sq="${f.sq}"><b>${f.sq}</b>`
          + `<small>${pcPoss(f.t, iLose)}</small></button>`;
      }
      if (f.state === 'free') {
        return `<button type="button" class="cg-fsq free" data-sq="${f.sq}"><b>${f.sq}</b><small>libre</small></button>`;
      }
      const who = f.by.slice(0, 2).map(short).join(' ') + (f.by.length > 2 ? ' +' + (f.by.length - 2) : '');
      return `<button type="button" class="cg-fsq held" data-sq="${f.sq}"><b>${f.sq}</b>`
        + `<small>${f.cap ? 'défendue · ' : ''}${who}</small></button>`;
    };
    let h = `<b>Les ${an.flight.length} cases autour de ${K}</b>`;
    if (!free) h += an.kind === 'stalemate' ? ' — aucune où aller.' : " — aucune n'est libre.";
    else h += ' :';
    if (own && own === an.flight.length) h += ` Ce sont ${iLose ? 'tes propres pièces' : 'ses propres pièces'} qui l'étouffent.`;
    h += `<span class="cg-fgrid">${an.flight.map(cell).join('')}</span>`;
    if (free) h += `<small class="nb">Une case marquée « libre » reste interdite : y aller laisserait le roi en échec sur la même ligne.</small>`;
    return { ic: '🚪', h, arrows: 'flight' };
  }

  // ═════════════════════════ Fin de partie ═════════════════════════
  function outcome(reason) {
    if (reason === 'resign') return { r: 'loss', ic: '🏳', short: 'Abandon', txt: '🏳 Abandon', sub: 'Tu as rendu la partie.', pgn: mySide === 'w' ? '0-1' : '1-0' };
    let inMate = false, drawn = false;
    try { inMate = game.in_checkmate(); drawn = game.in_draw() || game.in_stalemate(); } catch (_) {}
    if (inMate) {
      const loser = sideToMove();           // le camp au trait est mate
      return loser === mySide
        ? { r: 'loss', ic: '💀', short: 'Échec et mat contre toi', txt: '💀 Échec et mat contre toi', sub: 'La position finale est disséquée case par case sur l\'échiquier — reviens-y autant que tu veux.', pgn: mySide === 'w' ? '0-1' : '1-0' }
        : { r: 'win', ic: '🏆', short: 'Victoire — échec et mat', txt: '🏆 Victoire — échec et mat', sub: 'Partie menée au bout.', pgn: mySide === 'w' ? '1-0' : '0-1' };
    }
    if (drawn) {
      let why = 'Pat, répétition ou matériel insuffisant.';
      try {
        if (game.in_stalemate()) why = 'Pat : le camp au trait n\'a plus aucun coup légal, sans être en échec.';
        else if (game.insufficient_material()) why = 'Matériel insuffisant : plus personne ne peut mater.';
        else if (game.in_threefold_repetition()) why = 'Triple répétition de la position.';
        else why = 'Règle des cinquante coups : ni prise ni coup de pion depuis 50 coups.';
      } catch (_) {}
      return { r: 'draw', ic: '🤝', short: 'Partie nulle', txt: '🤝 Partie nulle', sub: why, pgn: '1/2-1/2' };
    }
    return { r: 'draw', ic: '🏁', short: 'Partie arrêtée', txt: '🏁 Partie arrêtée', sub: '', pgn: '*' };
  }

  // Le genre de nulle, lu sur la PARTIE (pas sur la FEN) : la triple repetition
  // et les cinquante coups demandent l'historique.
  function drawKind() {
    try {
      if (game.in_checkmate() || !game.in_draw()) return null;
      if (game.in_stalemate()) return 'stalemate';
      if (game.insufficient_material()) return 'material';
      if (game.in_threefold_repetition()) return 'repetition';
      return 'fifty';
    } catch (_) { return null; }
  }

  // La partie est finie : on ENREGISTRE, et on RESTE sur l'echiquier.
  //
  // C'est le changement de fond de cette version. Avant, `finish()` enchainait
  // `renderEnd()` puis `view('end')` : le mat effacait l'echiquier avant meme
  // qu'on l'ait vu. Desormais la fin se vit en deux temps, et le second ne part
  // JAMAIS tout seul :
  //   1. l'echiquier de fin - position finale, anatomie du mat, navigation
  //      libre dans toute la partie, aucun compte a rebours ;
  //   2. le bilan, sur un bouton, et on peut revenir a l'echiquier depuis le
  //      bilan (chaque moment cite y renvoie).
  function finish(reason) {
    if (saved) { enterEndBoard(); return; }
    saved = true;
    token++;
    busy = false;
    const out = outcome(reason);
    let an = null;
    try { an = endAnatomy(curFen(), reason, drawKind()); } catch (_) { an = null; }
    let lastMove = null;
    try {
      const h = game.history({ verbose: true });
      const m = h[h.length - 1];
      if (m) lastMove = { from: m.from, to: m.to };
    } catch (_) {}
    const rep = gameReport(moveLog);
    const rec = {
      id: 'cg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: Date.now(), device: deviceLabel(),
      elo: prm.elo, aide: cfg.aide, side: mySide,
      book: book ? book.name : null, bookMode: book ? cfg.bookMode : null,
      bookDepth: book ? bookPly : 0, bookLeft: bookOut || null,
      result: out.r, moves: stats.moves, best: stats.best, slips: stats.slips, hints: stats.hints,
      // Les deux agregats qui servent a se comparer d'une partie a l'autre sont
      // ranges A PLAT : le journal detaille, lui, finit par etre elague.
      acc: rep.accuracy, acpl: rep.acpl,
      end: an ? an.kind : null, reason: reason || null,
      pgn: buildPgn(out.pgn), track: track.slice(), mistakes: stats.mistakes.slice(0, 12),
      log: moveLog.map(e => ({
        n: e.n, san: e.san, mine: !!e.mine, k: e.k || null,
        ev: e.ev == null ? null : Math.round(e.ev),
        wpl: e.wpl == null ? null : +e.wpl.toFixed(3),
        cp: e.cp == null ? null : Math.round(e.cp),
        ph: e.ph || null, bs: e.bs || null,
        eb: e.eb == null ? null : Math.round(e.eb), ea: e.ea == null ? null : Math.round(e.ea),
      })),
    };
    const st = load();
    st.games.push(rec);
    save(st);
    endInfo = { rec, out, reason: reason || 'board', an, lastMove, level: 0, seen: false };
    enterEndBoard();
  }

  // ── L'echiquier de fin ───────────────────────────────────────────────────
  function enterEndBoard() {
    if (!endInfo) { view('end'); return; }
    stopTail();
    endInfo.seen = false;
    view('game');
    reviewPly = null;
    BoardRenderer.setFlipped(mySide === 'b');
    const shown = boardSvg && boardSvg.__bd ? boardSvg.__bd.fen : null;
    if (shown !== curFen().split(' ')[0] || (boardSvg.__bd && boardSvg.__bd.flip !== BoardRenderer.isFlipped())) {
      BoardRenderer.render(boardSvg, curFen(), endInfo.lastMove || null);
    }
    renderReviewBar();
    renderMoves();
    setStatus('');
    renderOver();
    // Les fleches attendent la fin du glissement : peintes tout de suite, elles
    // pointent une case ou la piece n'est pas encore arrivee.
    setTimeout(() => { if (endInfo) paintEndMarks(); }, ANIM_MS);
    syncControls();
  }

  function renderOver() {
    const el = $('#cg-over');
    if (!el || !endInfo) return;
    const rec = endInfo.rec, out = endInfo.out;
    const cls = rec.result === 'win' ? 'win' : rec.result === 'loss' ? 'loss' : 'draw';
    const an = endInfo.an || { kind: 'other', flight: [], checkers: [], support: [], takers: [], cut: null };
    const lastSan = moveLog.length ? moveLog[moveLog.length - 1].san : null;
    const story = endStory(an, { lastSan, mySide });
    const sideTxt = mySide === 'w' ? 'tu jouais les Blancs' : 'tu jouais les Noirs';
    const marks = endInfo.level >= 1 ? '🎯 Masquer les gardiens' : '🎯 Qui tient quoi';
    el.className = 'cg-over ' + cls;
    el.hidden = false;
    el.innerHTML = `
      <div class="hd"><span class="ic">${out.ic || '🏁'}</span>
        <div class="tt"><b>${out.short || out.txt}</b>
          <small>Coach ~${rec.elo} · ${rec.moves} coup${rec.moves > 1 ? 's joués' : ' joué'} · ${sideTxt}</small></div></div>
      ${story.lead ? `<p class="lead">${story.lead}</p>` : ''}
      ${story.pts.length ? `<ul class="cg-anat">${story.pts.map(p =>
        `<li><span class="ic">${p.ic}</span><span class="tx">${p.h}</span></li>`).join('')}</ul>` : ''}
      <div class="acts">
        <span class="nav">
          <button type="button" class="train-btn ghost" data-rev="prev" title="Coup précédent">◀</button>
          <button type="button" class="train-btn ghost" data-rev="next" title="Coup suivant">▶</button>
        </span>
        <button type="button" class="train-btn ghost" data-act="tail">⏪ Revoir la fin au ralenti</button>
        ${an.flight && an.flight.length ? `<button type="button" class="train-btn ghost" data-act="marks">${marks}</button>` : ''}
        <button type="button" class="train-btn" data-act="bilan">📊 Voir le bilan ▸</button>
      </div>
      <p class="foot">Rien ne presse : remonte la partie coup par coup avec ◀ ▶, ou clique n'importe quel coup
        dans la liste. Le bilan t'attend, il ne partira pas.</p>`;
  }

  // Ce que l'echiquier MONTRE de l'anatomie. `level` 0 = l'echec et les cases,
  // 1 = en plus, une fleche depuis chaque piece qui tient une case.
  function paintEndMarks() {
    if (!endInfo || !arrowsSvg) return;
    if (reviewPly !== null) { BoardRenderer.clearArrows(arrowsSvg); threatArrows = false; return; }
    const A = endArrows(endInfo.an, endInfo.level || 0);
    if (A.length) { BoardRenderer.drawArrows(arrowsSvg, A); threatArrows = true; }
    else { BoardRenderer.clearArrows(arrowsSvg); threatArrows = false; }
  }

  function onOverClick(e) {
    const s = e.target.closest('[data-sq]');
    if (s) { flashSquare(s.dataset.sq); return; }
    if (e.target.closest('button[data-rev]')) { navRev(e); return; }
    const b = e.target.closest('button[data-act]');
    if (!b || !endInfo) return;
    if (b.dataset.act === 'bilan') return showBilan();
    if (b.dataset.act === 'tail') return replayTail(6);
    if (b.dataset.act === 'marks') {
      endInfo.level = endInfo.level >= 1 ? 0 : 1;
      if (reviewPly !== null) gotoPly(game.history().length);
      paintEndMarks();
      const btn = $('#cg-over [data-act="marks"]');
      if (btn) btn.textContent = endInfo.level >= 1 ? '🎯 Masquer les gardiens' : '🎯 Qui tient quoi';
    }
  }

  // Une case citee dans le texte, allumee sur l'echiquier. On revient d'abord a
  // la position finale : montrer f7 sur une position d'il y a dix coups ne veut
  // rien dire.
  function flashSquare(sq) {
    if (!endInfo || !arrowsSvg) return;
    stopTail();
    if (reviewPly !== null) gotoPly(game.history().length);
    const A = endArrows(endInfo.an, endInfo.level || 0);
    A.push({ from: sq, to: sq, color: '#ffffff', opacity: .95, width: 8 });
    BoardRenderer.drawArrows(arrowsSvg, A);
    threatArrows = true;
  }

  // Rejouer les derniers demi-coups AU RALENTI : c'est la demande de fond -
  // voir le coup arriver, pas le trouver deja pose.
  function replayTail(n) {
    if (!game) return;
    stopTail();
    const total = game.history().length;
    if (total < 2) return;
    let at = Math.max(1, total - (n || 6));
    tailBusy = true; gotoPly(at); tailBusy = false;
    const step = () => {
      at++;
      tailBusy = true; gotoPly(at); tailBusy = false;
      if (at >= total) { tailTimer = null; return; }
      tailTimer = setTimeout(step, 950);
    };
    tailTimer = setTimeout(step, 950);
  }
  function stopTail() { if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; } }

  function showBilan() {
    stopTail();
    if (!endInfo) { view('end'); return; }
    endInfo.seen = true;
    const el = $('#cg-over'); if (el) el.hidden = true;
    renderEnd(endInfo.rec, endInfo.out);
    view('end');
  }

  // Le chemin du retour : chaque moment cite dans le bilan renvoie ICI, sur
  // l'echiquier, a la position exacte. Un bilan dont on ne peut pas sortir
  // n'est qu'un releve de plus.
  function backToBoard(ply) {
    if (!endInfo) return;
    endInfo.seen = false;
    view('game');
    const el = $('#cg-over'); if (el) el.hidden = false;
    if (ply) { gotoPly(ply); }
    else { reviewPly = null; BoardRenderer.render(boardSvg, curFen(), endInfo.lastMove || null); renderReviewBar(); renderMoves(); paintEndMarks(); syncControls(); }
  }

  function buildPgn(result) {
    const me = (typeof Coach !== 'undefined' && Coach.getUser) ? Coach.getUser() : 'moi';
    const coach = 'Coach ~' + prm.elo;
    const d = new Date();
    const date = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    try {
      game.header('Event', 'Partie avec le coach', 'Site', 'Chess Analyst',
        'Date', date, 'Round', '-',
        'White', mySide === 'w' ? me : coach, 'Black', mySide === 'b' ? me : coach,
        'Result', result, 'TimeControl', '-');
      return game.pgn({ maxWidth: 80, newline_char: '\n' });
    } catch (_) {
      return '[Result "' + result + '"]\n\n' + game.history().join(' ') + ' ' + result;
    }
  }

  // ═══════════════ Le bilan : ce que disent VRAIMENT tes coups ═══════════
  // L'ancien bilan tenait en quatre chiffres (coups, meilleurs, erreurs,
  // indices) et une courbe. C'est un releve de caisse, pas un bilan : il ne dit
  // ni a quel point on a joue juste, ni QUAND la partie a bascule, ni si on
  // progresse. `gameReport` relit le journal des coups - qui porte desormais,
  // pour chacun de MES coups, la perte en chances de gain, la perte en
  // centiemes de pion, la phase de jeu et le coup du moteur - et en tire les
  // agregats. Pure (aucun DOM, aucun etat de module) : testee dans
  // tools/test_core.cjs.
  const PHASE_FR = { opening: 'Ouverture', middle: 'Milieu de partie', endgame: 'Finale' };
  const CPLOSS_CAP = 1000;
  const CONTESTED_CP = 250;   // au-dela, la position est deja pliee : rien a saluer
  // Le vocabulaire du decompte, au pluriel quand il le faut. Les libelles de
  // `MOVE_CLASS` sont ecrits pour UN coup (« Erreur », « Très bien ») : colles
  // derriere un nombre ils donnaient « 3 erreur ».
  const MIX_FR = {
    brilliant: ['coup brillant', 'coups brillants'],
    great: ['coup excellent', 'coups excellents'],
    best: ['meilleur coup', 'meilleurs coups'],
    excellent: ['coup presque parfait', 'coups presque parfaits'],
    good: ['bon coup', 'bons coups'],
    book: ['coup de théorie', 'coups de théorie'],
    forced: ['coup forcé', 'coups forcés'],
    inaccuracy: ['imprécision', 'imprécisions'],
    miss: ['occasion manquée', 'occasions manquées'],
    mistake: ['erreur', 'erreurs'],
    blunder: ['gaffe', 'gaffes'],
  };
  function mixWord(k, n) {
    const a = MIX_FR[k];
    if (!a) return typeOf(k).label.toLowerCase();
    return n > 1 ? a[1] : a[0];
  }

  function gameReport(log) {
    const L = Array.isArray(log) ? log : [];
    const A = (typeof Analyzer !== 'undefined') ? Analyzer : null;
    const out = { n: 0, accuracy: null, acpl: null, counts: {}, phases: [], turning: null, gems: [] };
    const mine = [];
    for (let i = 0; i < L.length; i++) if (L[i] && L[i].mine) mine.push({ i, mi: mine.length, e: L[i] });
    out.n = mine.length;
    if (!mine.length) return out;
    for (const m of mine) if (m.e.k) out.counts[m.e.k] = (out.counts[m.e.k] || 0) + 1;

    const accs = [], plies = [];
    const ph = { opening: [], middle: [], endgame: [] };
    let cpSum = 0, cpN = 0;
    for (const m of mine) {
      const e = m.e;
      const slip = e.k === 'mistake' || e.k === 'blunder' || e.k === 'miss';
      if (typeof e.wpl === 'number' && A && A.winLossToAccuracy) {
        const a = A.winLossToAccuracy(e.wpl);
        accs.push(a); plies.push(m.i);
        (ph[e.ph] || ph.middle).push({ a, slip });
      }
      if (typeof e.cp === 'number') { cpSum += Math.min(e.cp, CPLOSS_CAP); cpN++; }
    }
    // Ponderation par la volatilite locale, exactement comme l'ecran d'analyse :
    // rater le seul coup qui tenait la position doit peser plus lourd qu'une
    // imprecision dans une position deja decidee. Une precision calculee ici
    // autrement que la-bas serait pire qu'aucune precision du tout.
    if (accs.length && A && A.blendedAccuracy) {
      const winSeries = L.map(e => (e && typeof e.ev === 'number' && A.cpToWinPct) ? A.cpToWinPct(e.ev) : 0.5);
      const w = A.volatilityWeights ? A.volatilityWeights(winSeries, plies) : null;
      out.accuracy = Math.round(A.blendedAccuracy(accs, w));
    }
    if (cpN) out.acpl = Math.round(cpSum / cpN);

    for (const key of ['opening', 'middle', 'endgame']) {
      const a = ph[key];
      if (!a.length) continue;
      out.phases.push({
        key, label: PHASE_FR[key], n: a.length,
        accuracy: Math.round(a.reduce((s, x) => s + x.a, 0) / a.length),
        errs: a.filter(x => x.slip).length,
      });
    }

    // Le moment qui fait basculer : la plus grosse perte en chances de gain.
    let worst = null;
    for (const m of mine) {
      if (typeof m.e.wpl !== 'number' || m.e.wpl < 0.10) continue;
      if (!worst || m.e.wpl > worst.e.wpl) worst = m;
    }
    if (worst) out.turning = {
      ply: worst.i + 1, mi: worst.mi, n: worst.e.n, san: worst.e.san, best: worst.e.bs || null,
      wpl: worst.e.wpl, eb: worst.e.eb == null ? null : worst.e.eb, ea: worst.e.ea == null ? null : worst.e.ea, k: worst.e.k,
    };

    // Ce qu'on a bien fait. On ne retient PAS les coups du debut (theorie
    // apprise) ni ceux d'une position deja pliee : un « meilleur coup » dans une
    // position a +9 n'apprend rien. Les plus disputes d'abord.
    out.gems = mine
      .filter(m => (m.e.k === 'best' || m.e.k === 'excellent') && m.i >= 8
        && typeof m.e.ea === 'number' && Math.abs(m.e.ea) <= CONTESTED_CP)
      .map(m => ({ ply: m.i + 1, mi: m.mi, n: m.e.n, san: m.e.san, d: Math.abs(m.e.ea) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    return out;
  }

  // Comment se lit une precision, en une phrase. Les paliers viennent de ses
  // vraies parties (voir la carte « ton vrai niveau » du Coach), pas d'une
  // echelle abstraite.
  function accWord(a) {
    if (a == null) return '';
    if (a >= 90) return 'partie quasi sans faute';
    if (a >= 80) return 'très propre';
    if (a >= 70) return 'correct, avec des trous';
    if (a >= 55) return 'des cadeaux réguliers';
    return 'la partie t\'a échappé';
  }

  function renderEnd(rec, out) {
    const el = $('#cg-end');
    if (!el) return;
    const cls = rec.result === 'win' ? 'win' : rec.result === 'loss' ? 'loss' : 'draw';
    const rep = gameReport(rec.log);
    const an = (endInfo && endInfo.rec && endInfo.rec.id === rec.id) ? endInfo.an : null;
    const sug = suggestNext();
    el.innerHTML = [
      `<div class="cg-res ${cls}"><div class="t">${out.txt}</div><p class="s">${out.sub}</p>
        ${endInfo && endInfo.rec.id === rec.id
          ? `<button type="button" class="train-btn ghost cg-back" data-goto="0">♟ Retourner à la position finale</button>` : ''}</div>`,
      kpiBlock(rec, rep),
      mixBlock(rep),
      phaseBlock(rep),
      turningBlock(rep),
      gemsBlock(rep),
      sparkHtml(rec.track, rep),
      bookBlock(rec),
      trendBlock(rec, rep),
      takeawayBlock(rec, rep, an),
      `<div class="cg-sep"><span class="t">🗄 Rangée à part</span>
        Cette partie va dans <b>Tes parties avec le coach</b>. Elle n'entre <b>pas</b> dans ton archive Chess.com :
        ni dans ta courbe Elo, ni dans « ton vrai niveau », ni dans « tes parties après 2.Ff4 ».</div>`,
      rec.mistakes.length ? `<button class="cg-sw" id="cg-tosrs" type="button">
        <span class="bd"><b>Envoyer ${rec.mistakes.length > 1 ? 'ces ' + rec.mistakes.length + ' erreurs' : 'cette erreur'} dans mes exercices</b>
        — ${rec.mistakes.map(m => 'coup ' + m.moveNo).join(', ')}</span><span class="tg"></span></button>` : '',
      sug ? `<div class="cg-next"><b>Niveau conseillé : ~${sug.elo}</b> ${sug.why}</div>` : '',
      `<div class="rp-actions">
        <button class="train-btn ghost" id="cg-analyse">🔍 Analyser cette partie</button>
        <button class="train-btn ghost" id="cg-again">↻ Rejouer</button>
        <button class="train-btn ghost" id="cg-tohist">🗄 L'historique</button>
      </div>`,
    ].join('');

    $('#cg-analyse').onclick = () => {
      close();
      if (typeof App !== 'undefined' && App.loadPgnAndAnalyze) App.loadPgnAndAnalyze(rec.pgn, { ingest: false });
    };
    $('#cg-again').onclick = () => { endInfo = null; view('setup'); };
    $('#cg-tohist').onclick = () => { endInfo = null; showHistory(); };
    const srs = $('#cg-tosrs');
    if (srs) srs.onclick = () => {
      srs.classList.add('on');
      srs.querySelector('.bd').innerHTML = '<b>Envoyé dans tes exercices</b> — tu les retrouveras dans Entraîner.';
      pushMistakesToTraining(rec);
    };
    if (!el.dataset.bound) {
      el.dataset.bound = '1';
      // Tout ce qui porte `data-goto` repart vers l'ECHIQUIER : un bilan sans
      // chemin de retour vers la position n'est qu'un releve de plus.
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-goto]');
        if (!b) return;
        backToBoard(+b.dataset.goto || 0);
      });
    }
  }

  function kpiBlock(rec, rep) {
    const a = rep.accuracy;
    const accCell = a == null
      ? `<div class="cg-kpi"><span class="v">—</span><span class="l">précision</span></div>`
      : `<div class="cg-kpi ${a >= 80 ? 'ok' : a < 60 ? 'bad' : ''}" title="Moyenne pondérée de tes coups, en chances de gain perdues — le même calcul que l'écran d'analyse.">
           <span class="v">${a} %</span><span class="l">précision</span></div>`;
    const short = rep.n < 6;   // trop peu de coups pour qualifier quoi que ce soit
    return `<div class="cg-kpis">
        ${accCell}
        <div class="cg-kpi ok"><span class="v">${rec.best}</span><span class="l">meilleurs coups</span></div>
        <div class="cg-kpi bad"><span class="v">${rec.slips}</span><span class="l">erreurs / gaffes</span></div>
        <div class="cg-kpi"><span class="v">${rec.hints}</span><span class="l">indices</span></div>
      </div>
      <p class="cg-lede">${rec.moves} coup${rec.moves > 1 ? 's joués' : ' joué'}${!short && a != null ? ` · <b>${accWord(a)}</b>` : ''}${!short && rep.acpl ? ` · tu lâches <b>${rep.acpl}</b> centièmes de pion par coup en moyenne` : ''}.${short ? ` <span class="rp-hint">Trop peu de coups pour en tirer une tendance.</span>` : ''}</p>`;
  }

  // La repartition de MES coups : une barre + le detail. La colonne de droite le
  // faisait deja pendant la partie, mais elle est masquee sur telephone - et
  // c'est justement apres coup qu'on la regarde.
  function mixBlock(rep) {
    const order = ['best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'miss', 'mistake', 'blunder'];
    const keys = order.filter(k => rep.counts[k]);
    const tot = keys.reduce((s, k) => s + rep.counts[k], 0);
    if (!tot) return '';
    const bar = keys.map(k => `<i class="${k}" style="width:${(rep.counts[k] / tot * 100).toFixed(1)}%" title="${typeOf(k).label}"></i>`).join('');
    const badges = keys.map(k => `<span class="eval-badge ${k}">${typeOf(k).mark} ${rep.counts[k]} ${mixWord(k, rep.counts[k])}</span>`).join('');
    return `<div class="cg-card"><div class="h">${tot > 1 ? `Tes ${tot} coups, notés un par un` : 'Ton seul coup'}</div>
      <div class="cg-bar">${bar}</div><div class="cg-tally2">${badges}</div></div>`;
  }

  function phaseBlock(rep) {
    if (rep.phases.length < 2) return '';
    const rows = rep.phases.map(p => `<div class="cg-phrow">
        <span class="n">${p.label}</span>
        <span class="tr"><i style="width:${Math.max(2, p.accuracy)}%"></i></span>
        <span class="v">${p.accuracy} %</span>
        <span class="e${p.errs ? ' bad' : ''}">${p.errs ? p.errs + ' err.' : '—'}</span>
      </div>`).join('');
    const worst = rep.phases.slice().sort((a, b) => a.accuracy - b.accuracy)[0];
    const best = rep.phases.slice().sort((a, b) => b.accuracy - a.accuracy)[0];
    return `<div class="cg-card"><div class="h">Où ça tient, où ça casse</div>${rows}
      <p class="sub">Dans cette partie, ton point fort est <b>${best.label.toLowerCase()}</b> (${best.accuracy} %)
        et ça lâche <b>${worst.label === 'Ouverture' ? 'dès l\'ouverture' : worst.label === 'Finale' ? 'en finale' : 'au milieu de partie'}</b>
        (${worst.accuracy} % sur ${worst.n} coup${worst.n > 1 ? 's' : ''}).</p></div>`;
  }

  function turningBlock(rep) {
    const t = rep.turning;
    if (!t) return '';
    const pts = Math.round(t.wpl * 100);
    const T = typeOf(t.k || 'mistake');
    return `<div class="cg-card turn"><div class="h">⚡ Le moment où la partie a basculé</div>
      <p class="l">Coup <b>${t.n}</b>, tu joues <b>${t.san}</b> <span class="eval-badge ${t.k}">${T.mark} ${T.label}</span> :
        <b>${pts} points</b> de chances de gain partent d'un seul coup${t.eb != null && t.ea != null ? ` (de <b>${fmtMe(t.eb)}</b> à <b>${fmtMe(t.ea)}</b>, ton point de vue)` : ''}.</p>
      ${t.best ? `<p class="l">Le moteur voulait <b>${t.best}</b>.</p>` : ''}
      <button type="button" class="train-btn ghost" data-goto="${Math.max(1, t.ply - 1)}">⟲ Revoir la position juste avant ce coup</button></div>`;
  }

  function gemsBlock(rep) {
    if (!rep.gems.length) return '';
    const chips = rep.gems.map(g => `<button type="button" class="cg-gem" data-goto="${g.ply}">coup ${g.n} · <b>${g.san}</b></button>`).join('');
    return `<div class="cg-card gems"><div class="h">✅ Ce que tu as bien fait</div>
      <p class="sub">Dans ces positions-là, la partie était encore disputée et tu as trouvé le coup du moteur. C'est ça qui se reproduit.</p>
      <div class="row">${chips}</div></div>`;
  }

  function bookBlock(rec) {
    if (!rec.book) return '';
    const n = rec.bookDepth || 0;
    const who = rec.bookLeft === 'me' ? `c'est <b>toi</b> qui es sorti de la ligne`
      : rec.bookLeft === 'coach' ? `c'est <b>le coach</b> qui a dévié (tu l'avais demandé)`
      : `la ligne est allée jusqu'au bout`;
    return `<div class="cg-card"><div class="h">📖 L'ouverture que tu travaillais</div>
      <p class="l"><b>${rec.book}</b> — ${Math.floor(n / 2)} coup${n >= 4 ? 's' : ''} de théorie tenus, puis ${who}.</p>
      <p class="sub">Ce qui compte n'est pas d'aller loin dans le livre, mais de savoir quoi faire <b>au coup d'après</b>.</p></div>`;
  }

  function trendBlock(rec, rep) {
    const prev = load().games.filter(g => g && g.id !== rec.id && g.elo === rec.elo);
    if (prev.length < 2) return '';
    const withAcc = prev.filter(g => typeof g.acc === 'number').slice(-5);
    const n = prev.length;
    const w = prev.filter(g => g.result === 'win').length;
    const d = prev.filter(g => g.result === 'draw').length;
    const avgSlip = prev.reduce((s, g) => s + (g.slips || 0), 0) / n;
    const bits = [];
    if (withAcc.length >= 2 && rep.accuracy != null) {
      const m = Math.round(withAcc.reduce((s, g) => s + g.acc, 0) / withAcc.length);
      const dlt = rep.accuracy - m;
      bits.push(`Précision : <b>${rep.accuracy} %</b> contre <b>${m} %</b> de moyenne sur tes ${withAcc.length} dernières parties à ce niveau `
        + `<span class="${dlt >= 0 ? 'up' : 'down'}">${dlt >= 0 ? '▲ +' : '▼ '}${Math.abs(dlt)}</span>.`);
    }
    const ds = rec.slips - avgSlip;
    bits.push(`Erreurs et gaffes : <b>${rec.slips}</b> contre <b>${avgSlip.toFixed(1)}</b> de moyenne `
      + `<span class="${ds <= 0 ? 'up' : 'down'}">${ds <= 0 ? '▲' : '▼'} ${Math.abs(ds).toFixed(1)}</span>.`);
    bits.push(`Ton bilan à ~${rec.elo} avant celle-ci : <b>${w}V / ${d}N / ${n - w - d}D</b>.`);
    return `<div class="cg-card"><div class="h">Par rapport à tes autres parties à ~${rec.elo}</div>
      ${bits.map(b => `<p class="l">${b}</p>`).join('')}</div>`;
  }

  // Deux ou trois phrases, toutes tirees des chiffres de CETTE partie. Aucune
  // morale, aucun « sois vigilant » : ce qui s'est passe, et le reflexe qui
  // l'evite la prochaine fois.
  function takeawayBlock(rec, rep, an) {
    const t = [];
    if (an && an.kind === 'mate' && an.loser === rec.side) {
      const own = an.flight.filter(f => f.state === 'own').length;
      t.push(own >= 2
        ? `Tu t'es fait mater avec <b>${own} de tes propres pièces</b> collées à ton roi. Quand le roi est étouffé, ouvrir une case d'air (un pion qui avance) vaut souvent mieux qu'un coup d'attaque.`
        : `Quand une pièce adverse se pose <b>à côté de ton roi</b>, le premier réflexe n'est pas de chercher une parade : c'est de compter les cases qui restent au roi. S'il en reste zéro, il faut agir un coup <b>plus tôt</b>.`);
    } else if (an && an.kind === 'mate') {
      t.push(`Tu as conclu par un mat : c'est la partie du jeu que la plupart des joueurs de ce niveau ratent. Le schéma de ce mat est à reconnaître, il reviendra.`);
    }
    if (an && an.kind === 'stalemate') {
      t.push(`Le pat n'arrive jamais par hasard : avant de donner un échec ou de bloquer une case, vérifie qu'il reste <b>un coup légal</b> à l'adversaire.`);
    }
    if (rep.phases.length > 1) {
      const worst = rep.phases.slice().sort((a, b) => a.accuracy - b.accuracy)[0];
      if (worst.accuracy < 70) {
        t.push(worst.key === 'opening'
          ? `Ça casse <b>dès l'ouverture</b> (${worst.accuracy} %). Rejouer la même ligne avec « ouverture imposée » deux ou trois fois coûte dix minutes et se voit tout de suite.`
          : worst.key === 'endgame'
            ? `Ça casse <b>en finale</b> (${worst.accuracy} %). C'est la phase où le coup suivant se calcule vraiment, et où le mode « mats et finales » est le plus rentable.`
            : `Ça casse <b>au milieu de partie</b> (${worst.accuracy} %), là où il y a le plus de pièces qui se touchent. C'est un problème de captures non vues, pas de plan.`);
      }
    }
    if ((rep.counts.blunder || 0) >= 2) {
      t.push(`<b>${rep.counts.blunder} gaffes</b> dans la même partie : le coût moyen d'une gaffe est plus élevé que tout ce que rapporte un bon plan. Les envoyer dans tes exercices (bouton ci-dessous) est ce qui rapporte le plus.`);
    }
    if (rec.hints >= 3) {
      t.push(`Tu as pris <b>${rec.hints} indices</b>. À garder tant que la position te bloque, mais la partie suivante mérite un essai <b>sans</b> : c'est le seul moyen de savoir ce que tu trouves tout seul.`);
    }
    if (!t.length && rep.n >= 8 && rep.accuracy != null && rep.accuracy >= 80) {
      t.push(`Rien à corriger de gros : <b>${rep.accuracy} %</b> de précision, les erreurs restent des imprécisions. C'est le moment de monter d'un cran de niveau.`);
    }
    if (!t.length) return '';
    return `<div class="cg-card keep"><div class="h">🎯 Ce qu'il faut retenir</div>
      ${t.slice(0, 3).map(x => `<p class="l">${x}</p>`).join('')}</div>`;
  }

  // La seule passerelle vers l'entrainement, et elle est EXPLICITE (un bouton).
  // On reutilise `Training.ingestGame()`, l'API que le Coach emploie pour les
  // parties analysees en masse : meme forme de carte, meme fusion, meme
  // repetition espacee. Rien de specifique au mode entraineur cote paquet - la
  // seule difference est la cle de partie, prefixee `coach:`, qui rend ces
  // cartes reconnaissables.
  function pushMistakesToTraining(rec) {
    try {
      if (typeof Training === 'undefined' || !Training.ingestGame) return 0;
      const me = (typeof Coach !== 'undefined' && Coach.getUser) ? Coach.getUser() : 'moi';
      const coach = 'Coach ~' + rec.elo;
      return Training.ingestGame('coach:' + rec.id, rec.mistakes, {
        side: rec.side,
        white: rec.side === 'w' ? me : coach,
        black: rec.side === 'b' ? me : coach,
        date: new Date(rec.at).toISOString().slice(0, 10),
        result: rec.result, timeClass: 'coach',
      });
    } catch (_) { return 0; }
  }

  // Conseil de niveau : deux victoires de suite au meme niveau -> +50. Jamais
  // automatique (voir la maquette) : le mode propose, l'utilisateur accepte.
  function suggestNext() {
    const g = load().games.filter(x => x.elo === prm.elo).slice(-3);
    const last2 = g.slice(-2);
    if (last2.length === 2 && last2.every(x => x.result === 'win')) {
      return { elo: Math.min(1400, prm.elo + 50), why: '(+50) — deux victoires de suite à ce niveau. On monte d\'un cran, pas de trois : le but est de rester là où tu dois vraiment réfléchir.' };
    }
    const last3 = g.slice(-3);
    if (last3.length === 3 && last3.every(x => x.result === 'loss')) {
      return { elo: Math.max(400, prm.elo - 50), why: '(-50) — trois défaites de suite : un adversaire trop fort n\'apprend rien, il punit trop tôt.' };
    }
    return null;
  }

  // La courbe de la partie. Deux ajouts par rapport a la version d'avant : la
  // zone au-dessus de zero est REMPLIE (on voit d'un coup d'oeil combien de
  // temps on a ete devant), et le coup qui a fait basculer la partie porte un
  // point rouge - une courbe qui descend sans dire OU ne sert a rien.
  function sparkHtml(tr, rep) {
    const pts = (tr || []).filter(v => typeof v === 'number');
    if (pts.length < 3) return '';
    const W = 320, H = 54;
    const hi = Math.max(...pts, 100), lo = Math.min(...pts, -100);
    const x = (i) => (i / (pts.length - 1)) * W;
    const y = (v) => H - 3 - ((v - lo) / ((hi - lo) || 1)) * (H - 8);
    const y0 = y(0);
    const poly = pts.map((v, i) => x(i) + ',' + y(v)).join(' ');
    const area = `M0,${y0} L` + pts.map((v, i) => x(i) + ',' + y(v)).join(' L') + ` L${W},${y0} Z`;
    const ahead = pts.filter(v => v > 30).length;
    const mi = rep && rep.turning && typeof rep.turning.mi === 'number' ? rep.turning.mi : -1;
    const dot = (mi >= 0 && mi < pts.length)
      ? `<circle cx="${x(mi).toFixed(1)}" cy="${y(pts[mi]).toFixed(1)}" r="3.4" fill="#e05252" stroke="#1a1a2e" stroke-width="1.2"/>` : '';
    return `<div class="cg-spark"><div class="h">Ton avantage, coup par coup (ton point de vue)`
      + `${mi >= 0 ? ` · <span class="dotlab">le coup ${rep.turning.n}</span>` : ''}</div>`
      + `<svg viewBox="0 0 ${W} ${H}">`
      + `<defs><clipPath id="cg-spk-up"><rect x="0" y="0" width="${W}" height="${y0.toFixed(1)}"/></clipPath>`
      + `<clipPath id="cg-spk-dn"><rect x="0" y="${y0.toFixed(1)}" width="${W}" height="${(H - y0).toFixed(1)}"/></clipPath></defs>`
      + `<path d="${area}" fill="rgba(74,222,128,.22)" clip-path="url(#cg-spk-up)"/>`
      + `<path d="${area}" fill="rgba(248,113,113,.20)" clip-path="url(#cg-spk-dn)"/>`
      + `<line x1="0" y1="${y0}" x2="${W}" y2="${y0}" stroke="rgba(255,255,255,.22)" stroke-dasharray="3 3"/>`
      + `<polyline points="${poly}" fill="none" stroke="#e2b857" stroke-width="1.8"/>`
      + dot
      + `</svg>`
      + `<p class="sub">Tu as été devant sur <b>${ahead}</b> de tes ${pts.length} coups.</p></div>`;
  }

  // ═════════════════════════ Historique separe ═════════════════════════
  function showHistory() {
    ensureDom();
    $('#cg-overlay').hidden = false;
    document.body.classList.add('guess-open');
    const st = load();
    const gs = st.games.slice().reverse();
    const n = gs.length;
    const w = gs.filter(g => g.result === 'win').length;
    const d = gs.filter(g => g.result === 'draw').length;
    const l = gs.filter(g => g.result === 'loss').length;
    const avg = n ? Math.round(gs.reduce((a, g) => a + (g.elo || 0), 0) / n) : 0;
    const slips = n ? (gs.reduce((a, g) => a + (g.slips || 0), 0) / n).toFixed(1) : '0';
    const byDev = {};
    for (const g of gs) byDev[g.device || 'inconnu'] = (byDev[g.device || 'inconnu'] || 0) + 1;
    const here = deviceLabel();
    const devRows = Object.keys(byDev).sort((a, b) => byDev[b] - byDev[a]).map(k =>
      `<div class="cg-devrow"><span class="ic">${k === 'Android' || k === 'iOS' ? '📱' : '💻'}</span>`
      + `<span class="n">${k}${k === here ? ' <span class="rp-hint">(cet appareil)</span>' : ''}</span>`
      + `<span class="c">${byDev[k]} partie${byDev[k] > 1 ? 's' : ''}</span></div>`).join('');

    const rows = gs.slice(0, 40).map(g => {
      const dt = new Date(g.at);
      const day = dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const R = g.result === 'win' ? 'ok' : g.result === 'loss' ? 'bad' : '';
      const RL = g.result === 'win' ? 'V' : g.result === 'loss' ? 'D' : 'N';
      const tags = [g.book ? '📖 ' + g.book : null, g.aide === 'libre' ? 'libre' : 'assisté', 'niv. ~' + g.elo,
        (g.device === 'Android' || g.device === 'iOS') ? '📱' : null].filter(Boolean).join(' · ');
      const acc = typeof g.acc === 'number' ? `${g.acc} % · ` : '';
      return `<div class="cg-hrow" data-id="${g.id}"><span class="d">${day}</span><span class="r ${R}">${RL}</span>`
        + `<span class="m">${tags}</span><span class="g">${acc}${g.slips} err.</span>`
        + `<button type="button" class="cg-del" data-act="ask" data-id="${g.id}" title="Retirer cette partie de l'historique">🗑</button></div>`;
    }).join('');

    $('#cg-hist').innerHTML = `
      ${n ? `<div class="cg-kpis">
        <div class="cg-kpi"><span class="v">${n}</span><span class="l">parties</span></div>
        <div class="cg-kpi ok"><span class="v">${w}/${d}/${l}</span><span class="l">V/N/D</span></div>
        <div class="cg-kpi"><span class="v">~${avg}</span><span class="l">niveau moyen</span></div>
        <div class="cg-kpi bad"><span class="v">${slips}</span><span class="l">err. / partie</span></div>
      </div>` : `<p class="cg-empty">Aucune partie avec le coach pour l'instant. Elles resteront ici, à part de tes parties Chess.com.</p>`}
      <div class="cg-dev">
        <div class="t">📱 Sur quel appareil ?</div>
        ${devRows || '<p class="sub">Rien encore.</p>'}
        <p class="sub">Les parties contre le coach se jouent <b>sur l'appareil</b>, sans serveur pour les rassembler
          (tes vraies parties, elles, se rechargent depuis Chess.com et se retrouvent partout). Chaque partie est donc
          <b>étiquetée</b>, et l'export/import les réunit. <b>Rien ne se mélange, rien ne s'écrase.</b></p>
        <div class="rp-actions">
          <button class="train-btn ghost" id="cg-export">⤓ Exporter</button>
          <button class="train-btn ghost" id="cg-import">⤒ Importer</button>
          <input type="file" id="cg-file" accept="application/json,.json" hidden>
        </div>
        <p class="sub" id="cg-io"></p>
      </div>
      ${rows ? `<div class="cg-hist-list">${rows}</div>` : ''}
      <div class="rp-actions">
        <button class="train-btn" id="cg-newgame">♟ Nouvelle partie</button>
      </div>`;

    $('#cg-newgame').onclick = () => view('setup');
    $('#cg-export').onclick = exportGames;
    $('#cg-import').onclick = () => $('#cg-file').click();
    $('#cg-file').onchange = (e) => importGames(e.target.files && e.target.files[0]);
    bindDelete();
    view('hist');
  }

  // Suppression d'une partie : en deux temps, DANS la ligne. Une partie
  // abandonnee parce qu'il fallait partir n'a rien a faire dans le bilan (elle
  // compte comme une defaite et pese sur les erreurs/partie).
  function bindDelete() {
    const list = document.querySelector('#cg-hist .cg-hist-list');
    if (!list || list.dataset.bound) return;
    list.dataset.bound = '1';
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const row = btn.closest('.cg-hrow');
      const id = btn.dataset.id;
      if (btn.dataset.act === 'ask') {
        row.classList.add('asking');
        row.dataset.keep = row.innerHTML;
        row.innerHTML = `<span class="m">Retirer cette partie de l'historique ?</span>`
          + `<button type="button" class="cg-del yes" data-act="del" data-id="${id}">Supprimer</button>`
          + `<button type="button" class="cg-del no" data-act="cancel" data-id="${id}">Annuler</button>`;
        return;
      }
      if (btn.dataset.act === 'cancel') {
        row.classList.remove('asking');
        if (row.dataset.keep) row.innerHTML = row.dataset.keep;
        return;
      }
      if (btn.dataset.act === 'del') {
        const st = load();
        const before = st.games.length;
        st.games = st.games.filter(g => g.id !== id);
        save(st);
        showHistory();
        const io2 = $('#cg-io');
        if (io2) io2.innerHTML = before === st.games.length
          ? `Rien n'a été supprimé (partie introuvable).`
          : `<b>Partie retirée de l'historique.</b> Le bilan et le niveau conseillé sont recalculés sans elle.`;
      }
    });
  }

  function exportGames() {
    const st = load();
    // Le journal de seances part avec : c'est la seule donnee du bilan qui vivait
    // uniquement dans le localStorage de l'appareil (voir Training.mergeLog).
    let log = [];
    try { if (typeof Training !== 'undefined' && Training.loadLog) log = Training.loadLog(); } catch (_) {}
    const blob = new Blob([JSON.stringify({ v: 2, exportedAt: Date.now(), device: deviceLabel(), games: st.games, sessions: log }, null, 1)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'coach-parties-' + deviceLabel().toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    const io = $('#cg-io');
    if (io) io.innerHTML = `<b>${st.games.length} partie(s) exportée(s)</b>${log.length ? ` et <b>${log.length} séance(s) d'entraînement</b>` : ''}. Ouvre ce fichier depuis l'autre appareil avec « Importer ».`;
  }

  function importGames(file) {
    if (!file) return;
    const fr2 = new FileReader();
    fr2.onload = () => {
      let inc = [], sess = [];
      try {
        const o = JSON.parse(String(fr2.result || '{}'));
        inc = Array.isArray(o.games) ? o.games : [];
        sess = Array.isArray(o.sessions) ? o.sessions : [];
      } catch (_) { inc = []; }
      let addedLog = 0;
      try { if (typeof Training !== 'undefined' && Training.mergeLog) addedLog = Training.mergeLog(sess); } catch (_) {}
      const st = load();
      const seen = new Set(st.games.map(g => g.id));
      let added = 0;
      for (const g of inc) {
        if (!g || !g.id || seen.has(g.id)) continue;   // fusion par id : rien ne s'ecrase
        st.games.push(g); seen.add(g.id); added++;
      }
      st.games.sort((a, b) => (a.at || 0) - (b.at || 0));
      save(st);
      showHistory();
      const io = $('#cg-io');
      const logTxt = addedLog ? ` Plus <b>${addedLog} séance(s) d'entraînement</b> : la carte « Est-ce que ça marche ? » des Statistiques en tient compte.` : '';
      if (io) io.innerHTML = (added
        ? `<b>${added} partie(s) importée(s)</b> sur ${inc.length} du fichier (les autres étaient déjà là).`
        : `Rien à importer : ces ${inc.length} partie(s) sont déjà dans l'historique.`) + logTxt;
    };
    fr2.readAsText(file);
  }

  return { open, showHistory, close, inProgress, paramsFor, pickIndex, effSpread, winLoss, lineLoss,
    endAnatomy, endArrows, gameReport, betweenSqs, LADDER };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CoachGame;
