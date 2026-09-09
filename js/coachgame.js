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
  let pendingOpp = null;            // { idx, evalBefore, inBook } : coup du coach en attente de note
  let saved = false;

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
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, games: st.games.slice(-200) })); } catch (_) {}
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
          <aside class="cg-side">
            <div class="cg-side-head">Suivi des coups</div>
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
    $('#cg-review').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-rev]');
      if (!b || !game) return;
      const total = game.history().length;
      if (b.dataset.rev === 'live') gotoPly(total);
      else if (b.dataset.rev === 'prev') gotoPly((reviewPly == null ? total : reviewPly) - 1);
      else if (b.dataset.rev === 'next') gotoPly((reviewPly == null ? total : reviewPly) + 1);
    });
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
    const fen = curFen();
    // curEvalMe est vue de MON camp : la barre se lit du cote des Blancs.
    const cpWhite = curEvalMe == null ? null : (mySide === 'w' ? curEvalMe : -curEvalMe);
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
  }

  // Le materiel : les pieces prises par chaque camp + l'ecart en points, sous
  // le nom du camp qui est de ce cote de l'echiquier.
  function syncMaterial() {
    const fen = curFen();
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
      if (mt) { mt.textContent = d > 0 ? '+' + d : ''; mt.hidden = !(d > 0); }
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
    const turn = $('#cg-turn');
    if (turn) turn.textContent = gameOver() ? '' : (myTurn() ? 'À toi' : 'Coach…');
    syncHintBtn();
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
        if (b) gotoPly(+b.dataset.ply);
      });
    }

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
      + `<button type="button" class="train-btn" data-rev="live">▶▶ Revenir à la partie</button>`;
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
    logMove(myMove.san, true, v.k);
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

  // ═════════════════════════ Fin de partie ═════════════════════════
  function outcome(reason) {
    if (reason === 'resign') return { r: 'loss', txt: '🏳 Abandon', sub: 'Tu as rendu la partie.', pgn: mySide === 'w' ? '0-1' : '1-0' };
    let inMate = false, drawn = false;
    try { inMate = game.in_checkmate(); drawn = game.in_draw() || game.in_stalemate(); } catch (_) {}
    if (inMate) {
      const loser = sideToMove();           // le camp au trait est mate
      return loser === mySide
        ? { r: 'loss', txt: '💀 Échec et mat contre toi', sub: 'Il reste la position à comprendre : le bilan dit où ça a basculé.', pgn: mySide === 'w' ? '0-1' : '1-0' }
        : { r: 'win', txt: '🏆 Victoire — échec et mat', sub: 'Partie menée au bout.', pgn: mySide === 'w' ? '1-0' : '0-1' };
    }
    if (drawn) return { r: 'draw', txt: '🤝 Partie nulle', sub: 'Pat, répétition ou matériel insuffisant.', pgn: '1/2-1/2' };
    return { r: 'draw', txt: 'Partie arrêtée', sub: '', pgn: '*' };
  }

  function finish(reason) {
    if (saved) { view('end'); return; }
    saved = true;
    token++;
    busy = false;
    const out = outcome(reason);
    const rec = {
      id: 'cg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: Date.now(), device: deviceLabel(),
      elo: prm.elo, aide: cfg.aide, side: mySide,
      book: book ? book.name : null, bookMode: book ? cfg.bookMode : null,
      result: out.r, moves: stats.moves, best: stats.best, slips: stats.slips, hints: stats.hints,
      pgn: buildPgn(out.pgn), track: track.slice(), mistakes: stats.mistakes.slice(0, 12),
    };
    const st = load();
    st.games.push(rec);
    save(st);
    renderEnd(rec, out);
    view('end');
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

  function renderEnd(rec, out) {
    const el = $('#cg-end');
    const cls = rec.result === 'win' ? 'win' : rec.result === 'loss' ? 'loss' : 'draw';
    const sug = suggestNext();
    el.innerHTML = `
      <div class="cg-res ${cls}"><div class="t">${out.txt}</div><p class="s">${out.sub}</p></div>
      <div class="cg-kpis">
        <div class="cg-kpi ok"><span class="v">${rec.best}</span><span class="l">meilleurs coups</span></div>
        <div class="cg-kpi"><span class="v">${rec.moves}</span><span class="l">tes coups</span></div>
        <div class="cg-kpi bad"><span class="v">${rec.slips}</span><span class="l">erreurs / gaffes</span></div>
        <div class="cg-kpi"><span class="v">${rec.hints}</span><span class="l">indices</span></div>
      </div>
      ${sparkHtml(rec.track)}
      <div class="cg-sep"><span class="t">🗄 Rangée à part</span>
        Cette partie va dans <b>Tes parties avec le coach</b>. Elle n'entre <b>pas</b> dans ton archive Chess.com :
        ni dans ta courbe Elo, ni dans « ton vrai niveau », ni dans « tes parties après 2.Ff4 ».</div>
      ${rec.mistakes.length ? `<button class="cg-sw" id="cg-tosrs" type="button">
        <span class="bd"><b>Envoyer ${rec.mistakes.length > 1 ? 'ces ' + rec.mistakes.length + ' erreurs' : 'cette erreur'} dans mes exercices</b>
        — ${rec.mistakes.map(m => 'coup ' + m.moveNo).join(', ')}</span><span class="tg"></span></button>` : ''}
      ${sug ? `<div class="cg-next"><b>Niveau conseillé : ~${sug.elo}</b> ${sug.why}</div>` : ''}
      <div class="rp-actions">
        <button class="train-btn" id="cg-analyse">🔍 Analyser cette partie</button>
        <button class="train-btn ghost" id="cg-again">↻ Rejouer</button>
        <button class="train-btn ghost" id="cg-tohist">🗄 L'historique</button>
      </div>`;
    $('#cg-analyse').onclick = () => {
      close();
      if (typeof App !== 'undefined' && App.loadPgnAndAnalyze) App.loadPgnAndAnalyze(rec.pgn, { ingest: false });
    };
    $('#cg-again').onclick = () => { view('setup'); };
    $('#cg-tohist').onclick = () => showHistory();
    const srs = $('#cg-tosrs');
    if (srs) srs.onclick = () => {
      srs.classList.add('on');
      srs.querySelector('.bd').innerHTML = '<b>Envoyé dans tes exercices</b> — tu les retrouveras dans Entraîner.';
      pushMistakesToTraining(rec);
    };
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

  function sparkHtml(tr) {
    const pts = (tr || []).filter(v => typeof v === 'number');
    if (pts.length < 3) return '';
    const W = 320, H = 46;
    const hi = Math.max(...pts, 100), lo = Math.min(...pts, -100);
    const x = (i) => (i / (pts.length - 1)) * W;
    const y = (v) => H - 3 - ((v - lo) / ((hi - lo) || 1)) * (H - 8);
    const poly = pts.map((v, i) => x(i) + ',' + y(v)).join(' ');
    return `<div class="cg-spark"><div class="h">Ton avantage, coup par coup (ton point de vue)</div>`
      + `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
      + `<line x1="0" y1="${y(0)}" x2="${W}" y2="${y(0)}" stroke="rgba(255,255,255,.14)" stroke-dasharray="3 3"/>`
      + `<polyline points="${poly}" fill="none" stroke="#e2b857" stroke-width="1.8"/>`
      + `</svg></div>`;
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
      return `<div class="cg-hrow" data-id="${g.id}"><span class="d">${day}</span><span class="r ${R}">${RL}</span>`
        + `<span class="m">${tags}</span><span class="g">${g.slips} err.</span>`
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
    const blob = new Blob([JSON.stringify({ v: 1, exportedAt: Date.now(), device: deviceLabel(), games: st.games }, null, 1)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'coach-parties-' + deviceLabel().toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    const io = $('#cg-io');
    if (io) io.innerHTML = `<b>${st.games.length} partie(s) exportée(s).</b> Ouvre ce fichier depuis l'autre appareil avec « Importer ».`;
  }

  function importGames(file) {
    if (!file) return;
    const fr2 = new FileReader();
    fr2.onload = () => {
      let inc = [];
      try {
        const o = JSON.parse(String(fr2.result || '{}'));
        inc = Array.isArray(o.games) ? o.games : [];
      } catch (_) { inc = []; }
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
      if (io) io.innerHTML = added
        ? `<b>${added} partie(s) importée(s)</b> sur ${inc.length} du fichier (les autres étaient déjà là).`
        : `Rien à importer : ces ${inc.length} partie(s) sont déjà dans l'historique.`;
    };
    fr2.readAsText(file);
  }

  return { open, showHistory, close, inProgress, paramsFor, pickIndex, effSpread, winLoss, lineLoss, LADDER };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CoachGame;
