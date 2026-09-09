const App = (() => {
  const STORAGE_KEY = 'chess-analyst-games';
  const CACHE_KEY = 'chess-analyst-cache';
  const MAX_CACHED = 15;
  let currentAnalysis = null;
  let currentIndex = 0;
  let currentHeader = null;
  let currentUser = null;
  let currentPgn = null;
  let currentClocks = [];
  let currentIncrement = 0;
  // Les moments retenus par le rapport (voir buildMoments) : le CTA de fin les
  // rejoue, et la timeline les marque.
  let currentMoments = [];
  // La precision par phase, calculee dans buildIntro et affichee par
  // buildVerdicts (elle etait noyee en fin de paragraphe du resume).
  let currentPhaseAccs = null;
  let gameHistory = [];
  let inspectSq = null;
  let lastRenderIndex = -1;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Focus trap for modal dialogs: keeps Tab/Shift+Tab within `dialog`, focuses
  // its first control on open, and restores focus to the opener on release.
  // Returns a release function (call it when the dialog closes).
  function trapFocus(dialog) {
    if (!dialog) return () => {};
    const prev = document.activeElement;
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(dialog.querySelectorAll(sel))
      .filter(el => !el.disabled && !el.hidden && el.offsetParent !== null);
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', onKey);
    const f = focusables();
    if (f.length) f[0].focus();
    return () => {
      dialog.removeEventListener('keydown', onKey);
      try { if (prev && prev.focus) prev.focus(); } catch (_) {}
    };
  }

  // Canonical move-classification taxonomy, mirroring Chess.com's Game Review.
  // label = French name shown to the user, cls = CSS modifier (badge + move cell
  // share the same suffix), mark = the classical annotation glyph.
  // Glyphe + libellé + classe CSS de chaque type de coup. Source unique dans
  // js/analysis.js (Analyzer.MOVE_TYPES), qui alimente aussi les deux légendes
  // de l'écran d'aide et la répartition du Coach — elles avaient divergé.
  const MOVE_CLASS = Analyzer.MOVE_CLASS;
  const markSpan = (type) => {
    const m = MOVE_CLASS[type];
    return m && m.mark ? ` <span class="mv-mark mv-${m.cls}">${m.mark}</span>` : '';
  };

  // Les deux légendes de l'écran d'aide, écrites depuis Analyzer.MOVE_TYPES.
  // Tenues à la main, elles avaient fini par appeler « Excellent » deux glyphes
  // différents et par oublier « □ Forcé », pourtant produit par l'analyseur.
  function fillMoveLegends() {
    const types = Analyzer.MOVE_TYPES || [];
    const badge = (t) => `<span class="info-badge ${t.k}"><i class="mv-mark mv-${t.k}">${t.mark}</i> ${t.label}</span>`;
    const ul = $('#legend-badges');
    if (ul) ul.innerHTML = types.map(t => `<li>${badge(t)} ${t.desc}</li>`).join('');
    const tb = $('#legend-table');
    if (tb) tb.innerHTML = types.map(t =>
      `<tr><td>${badge(t)}</td><td>${t.crit}</td><td>${t.desc}</td></tr>`).join('');
  }

  function init() {
    fillMoveLegends();
    bindEvents();
    wireTabSync();
    loadRecent();
    handleShareTarget();
    initGlossary();
    initPanels();
    initConcepts();
    initOpenings();
    refreshHome();
  }

  function bindEvents() {
    $('#btn-analyze').addEventListener('click', onAnalyze);
    const trainBtn = $('#btn-open-training');
    if (trainBtn) trainBtn.addEventListener('click', () => Training.show());
    // Le CTA de fin de rapport rejoue LES MOMENTS de la partie (les coups que
    // le rapport vient de lister) plutot que la partie entiere : l'action suit
    // la lecture. Sans moment identifie, il retombe sur la partie complete.
    const guessBtn = $('#btn-guess');
    if (guessBtn) guessBtn.addEventListener('click', () => {
      if (!currentAnalysis || typeof GuessMove === 'undefined') return;
      const idx = currentMoments.filter(m => m.isUserMove).map(m => m.index);
      if (idx.length) GuessMove.start(currentAnalysis, currentHeader, currentUser, { indices: idx, title: '🎯 Les moments' });
      else GuessMove.start(currentAnalysis, currentHeader, currentUser);
    });
    const coachBtn = $('#btn-open-coach');
    if (coachBtn) coachBtn.addEventListener('click', () => Coach.show());
    const coachBack = $('#btn-coach-back');
    if (coachBack) coachBack.addEventListener('click', () => Coach.hide());
    $('#btn-back').addEventListener('click', showImport);
    $('#btn-prev').addEventListener('click', () => userNav(currentIndex - 1));
    $('#btn-next').addEventListener('click', () => userNav(currentIndex + 1));

    $$('.tabbar .tab').forEach(t => t.addEventListener('click', () => navTo(t.dataset.tab)));

    bindTimeline();

    $('#board-svg').addEventListener('click', (e) => {
      const sq = BoardRenderer.coordToSquare($('#board-svg'), e.clientX, e.clientY);
      if (sq) toggleInspect(sq);
    });

    document.addEventListener('keydown', (e) => {
      if (!$('#screen-analysis').classList.contains('active')) return;
      // Don't let arrow keys leak through to the analysis board when a
      // practice overlay (guess/tactics/endgame → body.guess-open) or a modal
      // with its own key handling (opening explorer, concept zoom) sits on top.
      if (document.body.classList.contains('guess-open')) return;
      const om = $('#opening-modal'), cm = $('#concept-modal');
      if ((om && om.classList.contains('visible')) || (cm && cm.classList.contains('visible'))) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); userNav(currentIndex - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); userNav(currentIndex + 1); }
      if (e.key === 'Home') { e.preventDefault(); userNav(0); }
      if (e.key === 'End') { e.preventDefault(); userNav(currentAnalysis.length); }
    });

    const dropZone = $('#drop-zone');
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          $('#pgn-input').value = ev.target.result;
          onAnalyze();
        };
        reader.readAsText(file);
      }
    });

    let touchStartX = 0;
    const boardEl = $('#board-container');
    boardEl.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    boardEl.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) {
        if (dx > 0) userNav(currentIndex - 1);
        else userNav(currentIndex + 1);
      }
    }, { passive: true });

    // Release the board pin on the first real scroll gesture (a vertical drag
    // or wheel) — that's the signal the user has stopped stepping and wants to
    // read. A horizontal swipe on the board (move nav) is ignored.
    const body = $('.analysis-body');
    body.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > 0) unpinBoard(); }, { passive: true });
    let scrollY = 0, scrollX = 0;
    body.addEventListener('touchstart', (e) => { scrollY = e.touches[0].clientY; scrollX = e.touches[0].clientX; }, { passive: true });
    body.addEventListener('touchmove', (e) => {
      if (!boardPinned) return;
      const dy = e.touches[0].clientY - scrollY, dx = e.touches[0].clientX - scrollX;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) unpinBoard();
    }, { passive: true });
  }

  function handleShareTarget() {
    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get('text') || params.get('pgn');
    if (sharedText) {
      $('#pgn-input').value = sharedText;
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(onAnalyze, 300);
    }
  }

  function extractClocks(pgn) {
    const clocks = [];
    const re = /\{[^}]*\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\][^}]*\}/g;
    let m;
    while ((m = re.exec(pgn)) !== null) {
      clocks.push(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]));
    }
    return clocks;
  }

  function sanitizePgn(pgn) {
    let cleaned = pgn.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    cleaned = cleaned.replace(/\\'/g, "'");
    cleaned = cleaned.replace(/\\\\/g, '\\');
    cleaned = cleaned.replace(/\[Date\s+"([^"]*)"\]/g, (_, d) => {
      const m = d.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      return m ? `[Date "${m[1]}.${m[2].padStart(2,'0')}.${m[3].padStart(2,'0')}"]` : `[Date "${d}"]`;
    });
    cleaned = cleaned.replace(/\{[^}]*\[%[^\]]*\][^}]*\}/g, '');
    cleaned = cleaned.replace(/(\])\n(\d)/, '$1\n\n$2');
    cleaned = cleaned.replace(/\]\s*\[/g, ']\n[');
    cleaned = cleaned.replace(/(\])\n(\[)/g, '$1\n$2');
    const lastBracket = cleaned.lastIndexOf(']');
    if (lastBracket > -1) {
      const headers = cleaned.substring(0, lastBracket + 1);
      let movesText = cleaned.substring(lastBracket + 1).trim();
      movesText = movesText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
      cleaned = headers + '\n\n' + movesText;
    }
    return cleaned;
  }

  function cacheKey(header, moveCount) {
    // Chess.com PGNs carry a unique game URL (Link/Site) — use it when present so
    // two games can never collide. Otherwise fall back to a richer composite that
    // adds the exact start time, cadence and result, since White|Black|Date alone
    // collides for a same-day rematch of identical length.
    const link = header.Link || (/\/game\/\d+/.test(header.Site || '') ? header.Site : '');
    if (link) return `L:${link}`;
    return [
      header.White || '?', header.Black || '?',
      header.Date || '', header.UTCTime || header.Time || '',
      header.TimeControl || '', header.Result || '', moveCount
    ].join('|');
  }

  function getCachedAnalysis(key) {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return cache.find(c => c.key === key) || null;
    } catch (_) { return null; }
  }

  function saveCachedAnalysis(key, analysis, summary, header, user) {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      const existing = cache.findIndex(c => c.key === key);
      if (existing >= 0) cache.splice(existing, 1);
      cache.unshift({ key, analysis, summary, header, user, savedAt: Date.now() });
      if (cache.length > MAX_CACHED) cache.length = MAX_CACHED;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  function isGameCached(header, moveCount) {
    return !!getCachedAnalysis(cacheKey(header, moveCount));
  }

  function extractChessComUrl(text) {
    const m = text.match(/https?:\/\/(www\.)?chess\.com\/[^\s]+/i);
    return m ? m[0] : null;
  }

  function parseChessComUrl(url) {
    const m = url.match(/chess\.com\/(?:game\/)?(live|daily|computer|coach|bot)(?:\/game)?\/(\d+)/i);
    if (!m) return null;
    const type = m[1].toLowerCase();
    const id = m[2];
    // Only live & daily games expose a public game record; coach/computer/bot
    // games are tied to a private account and can't be fetched without login.
    const supported = type === 'live' || type === 'daily';
    return { type, id, supported };
  }

  async function fetchChessComPgn(url) {
    const parsed = parseChessComUrl(url);
    if (!parsed) return null;
    const { type, id } = parsed;
    showProgressBar('Récupération de la partie Chess.com...');

    const endpoints = [
      `https://www.chess.com/callback/${type}/game/${id}`,
      `https://www.chess.com/callback/live/game/${id}`,
    ];
    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.pgn) return data.pgn;
        if (data.pgnHeaders && data.moveList) {
          let pgn = '';
          for (const [k, v] of Object.entries(data.pgnHeaders)) pgn += `[${k} "${v}"]\n`;
          pgn += '\n' + data.moveList;
          return pgn;
        }
      } catch (_) {}
    }

    const pgn = await fetchFromArchive(analyzerUser(), id);
    if (pgn) return pgn;

    return null;
  }

  async function fetchFromArchive(username, gameId) {
    try {
      updateProgressBar(0, 'Recherche dans l\'historique Chess.com...');
      const archResp = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
      if (!archResp.ok) return null;
      const archData = await archResp.json();
      const archives = archData.archives || [];
      const recent = archives.slice(-3).reverse();
      for (const archiveUrl of recent) {
        try {
          const resp = await fetch(archiveUrl);
          if (!resp.ok) continue;
          const data = await resp.json();
          const match = (data.games || []).find(g => g.url && g.url.includes(gameId));
          if (match && match.pgn) return match.pgn;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  // Parse a single-game PGN into its header + verbose move list, replaying the
  // raw move text when chess.js's own parser drops moves. Returns null when the
  // PGN yields no moves. Shared by onAnalyze and openStoredReport.
  function deriveHeaderMoves(pgnText) {
    const chess = new Chess();
    const cleaned = sanitizePgn(pgnText);
    chess.load_pgn(cleaned, { sloppy: true });
    if (chess.history().length === 0) chess.load_pgn(pgnText, { sloppy: true });
    if (chess.history().length === 0) return null;

    const header = chess.header();
    let moves = chess.history({ verbose: true });

    const movesText = (cleaned.substring(cleaned.lastIndexOf(']') + 1)
      || pgnText.replace(/\[[^\]]*\]/g, '')).trim();
    const moveTokens = movesText.split(/\s+/)
      .filter(t => !t.match(/^\d+\.+$/) && !t.match(/^(1-0|0-1|1\/2-1\/2|\*)$/));

    if (moveTokens.length > moves.length) {
      const replay = new Chess();
      for (const tok of moveTokens) {
        let r = replay.move(tok, { sloppy: true });
        if (!r) {
          const legal = replay.moves({ verbose: true });
          const sanMatch = legal.find(m => m.san.replace(/[+#]/, '') === tok.replace(/[+#]/, ''));
          if (sanMatch) r = replay.move({ from: sanMatch.from, to: sanMatch.to, promotion: sanMatch.promotion });
        }
        if (!r) break;
      }
      if (replay.history().length > moves.length) moves = replay.history({ verbose: true });
    }
    return { header, moves };
  }

  // Only one analysis may run at a time: Stockfish lives in a single shared
  // worker with one result resolver, so a second run started mid-analysis (a
  // fast second paste, or a drag-drop) would clobber the first's resolver and
  // corrupt both. Guard the whole flow with a mutex.
  let analyzing = false;
  async function onAnalyze() {
    if (analyzing) {
      showError('Analyse déjà en cours — patientez la fin avant d\'en lancer une autre.');
      return;
    }
    analyzing = true;
    try {
      await runAnalyze();
    } finally {
      analyzing = false;
      // Let a service-worker update that arrived mid-run reload now (deferred).
      window.dispatchEvent(new Event('analysis-idle'));
    }
  }

  async function runAnalyze() {
    let pgnText = $('#pgn-input').value.trim();
    if (!pgnText) {
      showError('Collez un PGN pour commencer.');
      return;
    }

    const looksLikePgn = /^\s*\[/.test(pgnText) || /\d+\.\s*[A-Za-z]/.test(pgnText);
    const chessComUrl = !looksLikePgn ? extractChessComUrl(pgnText) : null;
    if (chessComUrl) {
      const parsed = parseChessComUrl(chessComUrl);
      if (parsed && !parsed.supported) {
        showError('Ce type de partie Chess.com (« ' + parsed.type + ' », ex. contre un bot/coach) est privé et ne peut pas être importé via son lien. Sur la page de la partie (connecté à votre compte), sélectionnez la liste des coups telle qu\'affichée (ex. « 1. e4 e5 2. Nf3 … ») et collez-la directement ici — son PGN, s\'il est proposé, fonctionne aussi.');
        return;
      }
      let fetched;
      try {
        fetched = await fetchChessComPgn(chessComUrl);
      } catch (_) {
        fetched = null;
      }
      if (fetched) {
        pgnText = fetched;
        $('#pgn-input').value = pgnText;
        hideProgressBar();
      } else {
        hideProgressBar();
        showError('Impossible de récupérer la partie. Collez le PGN manuellement.');
        return;
      }
    }

    // A multi-game PGN would be silently mangled (sanitizePgn keys off the last
    // ']', so only the final game's moves survive under all games' headers).
    // Detect it and ask for a single game instead of analyzing garbage.
    if ((pgnText.match(/\[Event\s/gi) || []).length > 1) {
      showError('Une seule partie à la fois : ce PGN en contient plusieurs. Collez une seule partie (de ses en-têtes [Event …] jusqu\'au résultat).');
      return;
    }

    currentClocks = extractClocks(pgnText);

    const parsed = deriveHeaderMoves(pgnText);
    if (!parsed) {
      showError('PGN invalide. Vérifiez le format et réessayez.');
      return;
    }
    const { header, moves } = parsed;

    hideError();

    if (moves.length === 0) {
      showError('Aucun coup trouvé dans ce PGN.');
      return;
    }

    const ck = cacheKey(header, moves.length);
    const cached = getCachedAnalysis(ck);
    if (cached) {
      saveGame(pgnText, header, moves.length);
      currentPgn = pgnText;
      showAnalysis(header, moves, cached.analysis, cached.summary);
      return;
    }

    let analysis;
    let engineUsed = false;

    showProgressBar('Chargement du moteur Stockfish...');

    // Analyzer.analyzeGame(Async) rebuild their own board from `moves`; the first
    // arg is vestigial but positional, so pass a Chess instance to fill the slot.
    const chess = new Chess();
    try {
      await StockfishEngine.init();
      analysis = await Analyzer.analyzeGameAsync(chess, moves, (done, total) => {
        const pct = Math.round(100 * done / total);
        updateProgressBar(pct, `Analyse en cours... ${done}/${total} positions`);
      });
      engineUsed = true;
    } catch (_) {
      analysis = Analyzer.analyzeGame(chess, moves);
    }

    hideProgressBar();

    const summary = Analyzer.generateSummary(analysis, moves);
    summary.engineUsed = engineUsed;

    // Only persist a full engine analysis. A transient engine failure produces
    // a heuristic fallback; caching it under this key would pin the weaker
    // result forever, so leave the key empty and let a later run replace it.
    if (engineUsed) {
      saveCachedAnalysis(ck, analysis, summary, header, detectUser(header));
      if (typeof Training !== 'undefined') Training.capture(ck, analysis, header, detectUser(header));
    }
    saveGame(pgnText, header, moves.length);
    currentPgn = pgnText;
    showAnalysis(header, moves, analysis, summary);
  }

  function showProgressBar(text) {
    $('#btn-analyze').hidden = true;
    $('#progress-container').hidden = false;
    $('#progress-fill').style.width = '0%';
    $('#progress-fill').classList.add('indeterminate');
    $('#progress-text').textContent = text;
  }

  function updateProgressBar(pct, text) {
    $('#progress-fill').classList.remove('indeterminate');
    $('#progress-fill').style.width = pct + '%';
    $('#progress-text').textContent = text;
  }

  function hideProgressBar() {
    $('#btn-analyze').hidden = false;
    $('#progress-container').hidden = true;
    $('#progress-fill').classList.remove('indeterminate');
  }

  // Chess.com's estimated game duration for cadence labelling: base + 40·increment.
  // 10-min (600+0) → 600 → Rapide, matching chess.com's time_class.
  function tcSeconds(tc) {
    const m = /(\d+)(?:\+(\d+))?/.exec(tc || '');
    if (!m) return 0;
    return parseInt(m[1], 10) + 40 * (parseInt(m[2], 10) || 0);
  }

  function showAnalysis(header, moves, analysis, summary) {
    currentAnalysis = analysis;
    currentIndex = 0;
    currentHeader = header;
    currentUser = detectUser(header);
    currentIncrement = Analyzer.tcIncrement(header.TimeControl || '');

    BoardRenderer.setFlipped(currentUser === 'b');

    const white = header.White || 'Blancs';
    const black = header.Black || 'Noirs';
    const whiteElo = header.WhiteElo || '?';
    const blackElo = header.BlackElo || '?';
    const result = header.Result || '*';
    const tc = header.TimeControl || '';

    let tcLabel = '';
    if (tc.includes('86400') || tc.includes('172800')) tcLabel = 'Journalier';
    else if (tc.includes('+')) {
      const est = tcSeconds(tc);
      if (est < 180) tcLabel = 'Bullet';
      else if (est < 600) tcLabel = 'Blitz';
      else tcLabel = 'Rapide';
    }

    $('#players-line').textContent = `${white} vs ${black}`;
    $('#elo-line').textContent = `Élo ${whiteElo} · Élo ${blackElo}${tcLabel ? ' · ' + tcLabel : ''}`;

    const badge = $('#result-badge');
    badge.textContent = result;
    badge.className = 'result-badge';
    if (result === '1-0') badge.classList.add('win');
    else if (result === '0-1') badge.classList.add('loss');
    else badge.classList.add('draw');

    const isFlipped = BoardRenderer.isFlipped();
    $('#top-name').textContent = isFlipped ? white : black;
    $('#top-elo').textContent = isFlipped ? whiteElo : blackElo;
    $('#bottom-name').textContent = isFlipped ? black : white;
    $('#bottom-elo').textContent = isFlipped ? blackElo : whiteElo;
    $('#top-player .piece-icon').textContent = isFlipped ? '⚪' : '⚫';
    $('#bottom-player .piece-icon').textContent = isFlipped ? '⚫' : '⚪';

    // L'ordre de lecture : le verdict, l'echiquier et sa timeline, puis le
    // rapport (histoire, moments, verdicts) et le detail replie.
    buildTimeline(analysis);
    buildAccuracyHero(header, summary);
    buildIntro(header, analysis, summary);
    buildMoments(header, analysis);
    buildVerdicts(header, analysis, summary);
    buildPlanRecognition(header, analysis);
    buildSummary(summary, analysis);
    probeEndgameTablebase(analysis);

    $('#screen-import').classList.remove('active');
    $('#screen-analysis').classList.add('active');
    setTab('analyser');
    const fold = $('#detail-fold');
    if (fold) fold.open = false;

    lastRenderIndex = -1;
    unpinBoard();
    goTo(0);
  }

  // Open a coach game's server-computed report directly in the detailed analyzer
  // — no Stockfish run. rec.report holds the full per-ply analysis + summary
  // embedded by tools/analyze.mjs for the most recent games.
  function openStoredReport(rec) {
    if (!rec || !rec.report || !rec.report.analysis || !rec.pgn) return false;
    const parsed = deriveHeaderMoves(rec.pgn);
    if (!parsed) return false;
    const { header, moves } = parsed;
    const { analysis, summary } = rec.report;
    currentClocks = extractClocks(rec.pgn);
    currentPgn = rec.pgn;
    const ck = cacheKey(header, moves.length);
    const user = detectUser(header);
    saveCachedAnalysis(ck, analysis, summary, header, user);
    if (typeof Training !== 'undefined') Training.capture(ck, analysis, header, user);
    saveGame(rec.pgn, header, moves.length);
    hideError();
    showAnalysis(header, moves, analysis, summary);
    return true;
  }

  // Load a PGN into the analyzer and run the engine (the normal flow), used for
  // coach games that don't embed a server report.
  function loadPgnAndAnalyze(pgn) {
    const input = $('#pgn-input');
    if (input) input.value = pgn;
    $('#screen-coach').classList.remove('active');
    $('#screen-import').classList.add('active');
    onAnalyze();
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ─────────────────────────── La timeline ───────────────────────────
  // Un seul objet temporel sous l'echiquier. Il remplace quatre elements qui
  // partageaient le meme axe des x sans jamais etre d'accord : le ruban de
  // pastilles de coups (navigation), « Chances de gain », « Balance materielle »
  // et « Temps par coup ». Trois series commutables, un curseur commun, et on
  // navigue en glissant le doigt dessus.
  const TL_W = 320, TL_H = 64;
  let tlSeries = 'win';          // 'win' | 'mat' | 'time'
  let tlData = null;             // { win:[], mat:[], time:[]|null, marks:{ply:type} }

  function bindTimeline() {
    const segs = $('#tl-segs');
    if (segs) segs.addEventListener('click', (e) => {
      const b = e.target.closest('.tl-seg');
      if (!b || b.hidden) return;
      setTlSeries(b.dataset.series);
    });

    const svg = $('#tl-svg');
    if (!svg) return;
    // Glisser = naviguer. On appelle goTo (et pas userNav) pendant le geste :
    // userNav epingle l'echiquier et le ramene dans le champ, ce qui ferait
    // sauter la page a chaque pixel de deplacement.
    let dragging = false;
    const plyAt = (clientX) => {
      if (!currentAnalysis || !currentAnalysis.length) return null;
      const r = svg.getBoundingClientRect();
      if (!r.width) return null;
      const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return Math.round(t * (currentAnalysis.length - 1)) + 1;
    };
    const go = (e) => {
      const ply = plyAt(e.clientX);
      if (ply !== null && ply !== currentIndex) goTo(ply);
    };
    svg.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      go(e);
    });
    svg.addEventListener('pointermove', (e) => { if (dragging) go(e); });
    const end = () => { if (dragging) { dragging = false; pinBoard(); } };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  function setTlSeries(kind) {
    if (kind === 'time' && (!tlData || !tlData.time)) return;
    tlSeries = kind;
    $$('#tl-segs .tl-seg').forEach(b => b.classList.toggle('active', b.dataset.series === kind));
    drawTimeline();
    updateTimelineCursor(currentIndex);
  }

  // Les trois series, calculees une fois par partie.
  function buildTimeline(analysis) {
    const card = $('#tl-card');
    if (!card) return;
    tlData = null;
    if (!analysis || !analysis.length) { card.hidden = true; return; }

    const win = analysis.map(r => Analyzer.cpToWinPct(r.eval || 0));   // vue Blancs, 0..1
    const mat = analysis.map(r => r.materialDiff || 0);
    const hasEval = analysis[0].eval !== undefined && analysis[0].eval !== null;

    let time = null;
    if (currentClocks.length >= 4) {
      const t = Analyzer.clocksToTimePerMove(currentClocks, currentIncrement);
      if (t && t.length >= 4) time = analysis.map((_, i) => t[i] || 0);
    }

    // Les marqueurs : les erreurs, et les captures pour la serie materielle.
    const marks = {};
    analysis.forEach((r, i) => {
      if (r.type === 'blunder' || r.type === 'mistake' || r.type === 'miss') marks[i] = r.type;
    });
    const caps = {};
    analysis.forEach((r, i) => {
      if (!r.move || !r.move.captured) return;
      const prev = i > 0 ? (analysis[i - 1].materialDiff || 0) : 0;
      if ((r.materialDiff || 0) === prev) return;
      const key = r.move.color === 'w' ? r.move.captured : r.move.captured.toUpperCase();
      caps[i] = PIECE_SYMBOLS[key] || '';
    });

    tlData = { win: hasEval ? win : null, mat, time, marks, caps };

    const timeBtn = $('#tl-segs .tl-seg[data-series="time"]');
    if (timeBtn) timeBtn.hidden = !time;
    const winBtn = $('#tl-segs .tl-seg[data-series="win"]');
    if (winBtn) winBtn.hidden = !tlData.win;

    card.hidden = false;
    setTlSeries(tlData.win ? 'win' : 'mat');
  }

  function drawTimeline() {
    const svg = $('#tl-svg');
    if (!svg || !tlData) return;
    const data = tlData[tlSeries];
    if (!data) return;
    const n = data.length;
    const x = i => n <= 1 ? 0 : (i / (n - 1)) * TL_W;

    let lo, hi;
    if (tlSeries === 'win') { lo = 0; hi = 1; }
    else if (tlSeries === 'mat') { const m = Math.max(3, ...data.map(Math.abs)); lo = -m; hi = m; }
    else { lo = 0; hi = Math.max(10, ...data); }
    const y = v => TL_H - 5 - ((v - lo) / (hi - lo || 1)) * (TL_H - 11);

    let s = '';
    if (tlSeries === 'time') {
      // 15 s : le seuil de la regle « Echecs, Captures, Menaces avant de jouer ».
      s += line(0, y(15), TL_W, y(15), 'rgba(226,184,87,.45)', '3 3');
      const bw = Math.max(1.6, Math.min(6, TL_W / n - 0.8));
      s += data.map((v, i) => {
        const bad = tlData.marks[i] && v < 15;
        const mine = isUserPly(i);
        const fill = bad ? 'var(--danger)' : mine ? 'rgba(226,184,87,.75)' : 'rgba(91,143,185,.55)';
        return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(TL_H - 5 - y(v)).toFixed(1)}" rx="1" fill="${fill}"/>`;
      }).join('');
    } else {
      const mid = tlSeries === 'win' ? y(0.5) : y(0);
      const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      // « Gain » se lit comme la barre d'eval : la part claire est celle des
      // Blancs, on remplit donc jusqu'en bas. « Matiere » se lit par rapport a
      // zero, on remplit depuis la ligne mediane.
      s += tlSeries === 'win'
        ? `<polygon points="0,${TL_H} ${pts} ${TL_W},${TL_H}" fill="rgba(255,255,255,.10)"/>`
        : `<polygon points="0,${mid} ${pts} ${TL_W},${mid}" fill="rgba(226,184,87,.10)"/>`;
      s += line(0, mid, TL_W, mid, 'rgba(255,255,255,.14)', '3 3');
      s += `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round"/>`;
      if (tlSeries === 'mat') {
        // Les glyphes de capture : c'etait le seul apport propre de l'ancienne
        // carte « Balance materielle », on le garde ici.
        s += Object.keys(tlData.caps).map(i => {
          const sym = tlData.caps[i];
          if (!sym) return '';
          const yy = y(data[i]);
          return `<text x="${x(+i).toFixed(1)}" y="${(yy < TL_H / 2 ? yy + 8 : yy - 3).toFixed(1)}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,.55)">${sym}</text>`;
        }).join('');
      }
    }

    // Les erreurs, sur la courbe. Les tiennes en plein, celles de l'adversaire
    // en creux : le rapport parle de TON jeu.
    s += Object.keys(tlData.marks).map(i => {
      const t = tlData.marks[i];
      const yy = tlSeries === 'time' ? y(data[i]) : y(data[i]);
      const col = t === 'blunder' ? 'var(--danger)' : t === 'mistake' ? 'var(--warning)' : 'var(--blue)';
      const mine = isUserPly(+i);
      return `<circle cx="${x(+i).toFixed(1)}" cy="${yy.toFixed(1)}" r="${t === 'blunder' ? 3.2 : 2.5}" ` +
             `fill="${mine ? col : 'var(--bg)'}" stroke="${col}" stroke-width="1.2"/>`;
    }).join('');

    s += `<line id="tl-cursor" x1="0" y1="0" x2="0" y2="${TL_H}" stroke="var(--text)" stroke-opacity=".45" stroke-width="1" opacity="0"/>`;
    s += `<circle id="tl-dot" r="3.6" fill="var(--text)" stroke="var(--bg)" stroke-width="1.4" opacity="0"/>`;
    svg.innerHTML = s;

    const leg = $('#tl-legend');
    if (leg) leg.textContent = tlSeries === 'win' ? 'chances de gain, vue Blancs'
      : tlSeries === 'mat' ? 'matériel, en pions (vue Blancs)' : 'secondes par coup, seuil 15 s';

    function line(x1, y1, x2, y2, col, dash) {
      return `<line x1="${x1}" y1="${y1.toFixed(1)}" x2="${x2}" y2="${y2.toFixed(1)}" stroke="${col}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    }
  }

  function isUserPly(i) {
    if (!currentUser || !currentAnalysis || !currentAnalysis[i] || !currentAnalysis[i].move) return true;
    return currentAnalysis[i].move.color === currentUser;
  }

  function updateTimelineCursor(index) {
    const cur = $('#tl-cursor'), dot = $('#tl-dot');
    if (!cur || !dot || !tlData || !currentAnalysis) return;
    const data = tlData[tlSeries];
    if (!data) return;
    const i = index - 1;
    if (i < 0 || i >= data.length) { cur.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); return; }
    const n = data.length;
    const x = n <= 1 ? 0 : (i / (n - 1)) * TL_W;
    let lo, hi;
    if (tlSeries === 'win') { lo = 0; hi = 1; }
    else if (tlSeries === 'mat') { const m = Math.max(3, ...data.map(Math.abs)); lo = -m; hi = m; }
    else { lo = 0; hi = Math.max(10, ...data); }
    const y = TL_H - 5 - ((data[i] - lo) / (hi - lo || 1)) * (TL_H - 11);
    cur.setAttribute('x1', x.toFixed(1)); cur.setAttribute('x2', x.toFixed(1));
    cur.setAttribute('opacity', '1');
    dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1));
    dot.setAttribute('opacity', '1');
  }

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  function currentFen() {
    if (!currentAnalysis || currentIndex === 0) return START_FEN;
    return currentAnalysis[currentIndex - 1].fen;
  }

  const INSPECT_GLYPH = {
    w: { p:'♙', n:'♘', b:'♗', r:'♖', q:'♕', k:'♔' },
    b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚' }
  };

  function toggleInspect(sq) {
    if (inspectSq === sq) { clearInspect(); return; }
    const info = BoardRenderer.squareControl(currentFen(), sq);
    const occ = info.occupant;
    const attackers = [], defenders = [];
    for (const c of info.controllers) {
      const friendly = occ ? c.color === occ.color : c.color === 'w';
      (friendly ? defenders : attackers).push(c);
    }
    BoardRenderer.drawControl($('#inspect-overlay'), sq, attackers.map(c => c.sq), defenders.map(c => c.sq));

    const pop = $('#inspect-popup');
    if (occ) {
      const g = INSPECT_GLYPH[occ.color][occ.type];
      let html = `<span class="sq">${g} ${sq}</span> <span class="def">🛡 ${defenders.length}</span> <span class="atk">⚔ ${attackers.length}</span>`;
      if (attackers.length > defenders.length) html += ` <span class="pc">en prise&nbsp;?</span>`;
      pop.innerHTML = html;
    } else {
      pop.innerHTML = `<span class="sq">${sq}</span> <span class="def">⚪ ${defenders.length}</span> <span class="atk">⚫ ${attackers.length}</span>`;
    }
    pop.hidden = false;
    inspectSq = sq;
  }

  function clearInspect() {
    if (inspectSq === null) return;
    inspectSq = null;
    const ov = $('#inspect-overlay'); if (ov) ov.innerHTML = '';
    const pop = $('#inspect-popup'); if (pop) { pop.hidden = true; pop.innerHTML = ''; }
  }

  function goTo(index) {
    if (!currentAnalysis) return;
    index = Math.max(0, Math.min(index, currentAnalysis.length));
    currentIndex = index;
    altPreview = false;
    const backBtn = $('#alt-back');
    if (backBtn) backBtn.hidden = true;

    clearInspect();

    let fen, lastMove = null;
    if (index === 0) {
      fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    } else {
      const r = currentAnalysis[index - 1];
      fen = r.fen;
      lastMove = r.move;
    }

    // Slide the piece only on a single-step forward move; jumps render instantly.
    if (!prefersReducedMotion() && index === lastRenderIndex + 1 && index > 0 && lastMove) {
      const prevFen = index >= 2 ? currentAnalysis[index - 2].fen
        : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      BoardRenderer.renderAnimated($('#board-svg'), prevFen, fen, lastMove, 240);
    } else {
      BoardRenderer.render($('#board-svg'), fen, lastMove);
    }
    lastRenderIndex = index;

    const captured = BoardRenderer.getCapturedPieces(fen);
    const isFlipped = BoardRenderer.isFlipped();
    $('#top-captured').textContent = isFlipped ? captured.black : captured.white;
    $('#bottom-captured').textContent = isFlipped ? captured.white : captured.black;

    let evalPct;
    if (index > 0 && currentAnalysis[index - 1].eval !== undefined && currentAnalysis[index - 1].eval !== null) {
      const cp = currentAnalysis[index - 1].eval;
      evalPct = Math.max(5, Math.min(95, 50 + 50 * (2 / (1 + Math.exp(-0.004 * cp)) - 1)));
    } else {
      const matDiff = Analyzer.materialCount(fen);
      evalPct = Math.max(5, Math.min(95, 50 + matDiff.diff * 5));
    }
    const evalFill = $('#eval-bar');
    evalFill.style.height = evalPct + '%';
    // The light fill = White's share, anchored to White's side of the board.
    // When the board is flipped (user plays Black, White is on top), anchor it
    // to the top so the bar's orientation matches the board.
    if (BoardRenderer.isFlipped()) { evalFill.style.top = '0'; evalFill.style.bottom = 'auto'; }
    else { evalFill.style.bottom = '0'; evalFill.style.top = 'auto'; }

    const arrowSvg = $('#arrow-overlay');
    BoardRenderer.clearArrows(arrowSvg);
    if (index > 0) {
      const r = currentAnalysis[index - 1];
      if (r.arrows && r.arrows.length > 0) {
        BoardRenderer.drawArrows(arrowSvg, r.arrows);
      } else if (r.arrow && r.arrow.from && r.arrow.to) {
        BoardRenderer.drawArrow(arrowSvg, r.arrow.from, r.arrow.to);
      }
    }

    // Le coup courant et son commentaire, SOUS l'echiquier (la bulle du coach
    // etait au-dessus : elle disait la meme chose que le label du coup et
    // poussait le plateau vers le bas avant qu'on ait vu la position).
    const label = $('#tl-move-label');
    const badge = $('#tl-move-eval');
    const cmt = $('#tl-cmt');
    const card = $('#tl-card');

    if (index === 0) {
      card.className = 'tl-card';
      label.innerHTML = 'Position de départ';
      cmt.innerHTML = 'Glisse sur la courbe, ou avance coup par coup avec ‹ ›. Les points rouges sont les coups à revoir.';
      badge.textContent = ''; badge.hidden = true;
    } else {
      const r = currentAnalysis[index - 1];
      const moveNum = Math.floor((index - 1) / 2) + 1;
      const dot = (index - 1) % 2 === 0 ? '.' : '...';
      const meta = MOVE_CLASS[r.type];
      const isUserMove = currentUser && r.move &&
        ((currentUser === 'w' && r.move.color === 'w') || (currentUser === 'b' && r.move.color === 'b'));

      card.className = 'tl-card' + (meta ? ' tl-' + meta.cls : '');
      label.innerHTML = `<b>${moveNum}${dot} ${r.sanFr}</b>${markSpan(r.type)}` +
        (meta ? ` <span class="tl-class">${meta.label}</span>` : '') +
        (currentUser && r.move ? ` <span class="tl-side ${isUserMove ? 'tl-you' : 'tl-opp'}">${isUserMove ? 'toi' : 'lui'}</span>` : '');
      cmt.innerHTML = r.tipFr;
      bindAltMoves();

      const evalTxt = formatEval(r);
      if (evalTxt) { badge.textContent = evalTxt; badge.hidden = false; }
      else { badge.textContent = ''; badge.hidden = true; }
    }

    updateReplayCta(index);
    updateTimelineCursor(index);
  }

  // « Rejoue cette position » : quand le coup affiché est une de TES erreurs
  // (gaffe / erreur / coup manqué) et qu'on a la position + le meilleur coup,
  // proposer de reprendre la main juste avant et de rejouer contre Stockfish.
  function updateReplayCta(index) {
    const bubble = $('#tl-cmt');
    if (!bubble) return;
    let cta = $('#rp-cta');
    const r = index > 0 ? currentAnalysis[index - 1] : null;
    const isMine = r && r.move && currentUser && r.move.color === currentUser;
    const isError = r && (r.type === 'blunder' || r.type === 'mistake' || r.type === 'miss');
    const ok = typeof Replay !== 'undefined' && isMine && isError && r.fenBefore && r.bestUci;
    if (!ok) { if (cta) cta.hidden = true; return; }
    if (!cta) {
      cta = document.createElement('button');
      cta.id = 'rp-cta';
      cta.className = 'pill pill-gold rp-cta';
      bubble.appendChild(cta);
    }
    cta.hidden = false;
    cta.textContent = '▶ Rejoue cette position';
    cta.onclick = () => Replay.start({
      fenBefore: r.fenBefore, bestUci: r.bestUci, bestSan: r.bestSan,
      playedSan: r.sanFr || r.san, tip: r.tipFr || '', ply: index - 1,
    });
  }

  let altPreview = false;

  function bindAltMoves() {
    $$('.alt-move').forEach(el => {
      el.addEventListener('click', () => {
        const fen = el.dataset.fen;
        const uci = el.dataset.uci;
        if (!fen || !uci || uci.length < 4) return;
        try {
          const g = new Chess(fen);
          const m = g.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] });
          if (!m) return;
          altPreview = true;
          BoardRenderer.render($('#board-svg'), g.fen(), m);
          BoardRenderer.clearArrows($('#arrow-overlay'));
          $$('.alt-move').forEach(a => a.classList.remove('active'));
          el.classList.add('active');
          let back = $('#alt-back');
          if (!back) {
            back = document.createElement('button');
            back.id = 'alt-back';
            back.className = 'alt-back-btn';
            back.textContent = '↩ Retour au coup joué';
            back.addEventListener('click', () => {
              altPreview = false;
              goTo(currentIndex);
            });
            $('#tl-cmt').appendChild(back);
          }
          back.hidden = false;
        } catch(_) {}
      });
    });
  }

  // Single entry point for every user-initiated move navigation.
  function userNav(index) {
    goTo(index);
    pinBoard();
  }

  // The board is only fixed while you go move-to-move. pinBoard() engages the
  // sticky pin (and brings the board into view if it had scrolled off); the
  // first scroll gesture calls unpinBoard() to release it so the cards read
  // freely underneath.
  let boardPinned = false;
  function pinBoard() {
    const body = $('.analysis-body');
    const board = $('.board-sticky');
    if (!body || !board) return;
    if (!boardPinned) { body.classList.add('board-pinned'); boardPinned = true; }
    // 'nearest' is a no-op when the board is already visible, so stepping
    // through moves never jolts the view.
    board.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
  function unpinBoard() {
    if (!boardPinned) return;
    const body = $('.analysis-body');
    const board = $('.board-sticky');
    // Keep the board visually still while it switches sticky → static, so
    // releasing it doesn't jump the page.
    const before = board.getBoundingClientRect().top;
    body.classList.remove('board-pinned');
    boardPinned = false;
    const after = board.getBoundingClientRect().top;
    body.scrollTop += (after - before);
  }

  // The Chess.com account being analysed. Sourced from the Coach settings
  // (localStorage `chess-coach-user`, editable in the Coach tab) so changing the
  // username there also fixes Vous/Adversaire, board flip and archive lookups
  // here — instead of the old hardcoded 'nimokaji'.
  function analyzerUser() {
    try {
      if (typeof Coach !== 'undefined' && Coach.getUser) return Coach.getUser();
      return (localStorage.getItem('chess-coach-user') || 'nimokaji').trim();
    } catch (_) { return 'nimokaji'; }
  }

  function detectUser(header) {
    const name = analyzerUser().toLowerCase();
    const w = (header.White || '').toLowerCase();
    const b = (header.Black || '').toLowerCase();
    if (w === name) return 'w';
    if (b === name) return 'b';
    return null;
  }

  // ─────────────── Repetition espacee des lignes d'ouverture ───────────────
  // Avant : la progression d'un cours etait un simple ensemble « fait / pas
  // fait » (`ca_lessons_done`), donc une ligne lue une fois etait une ligne
  // consideree comme acquise - et oubliee. Chaque BRANCHE a maintenant sa
  // boite (1 / 3 / 7 / 21 jours) ; la routine du jour expose ce qui est du.
  const SRS_KEY = 'ca_lessons_srs';
  const SRS_BOXES = [1, 3, 7, 21];
  const DAY = 864e5;
  function srsAll() { try { return JSON.parse(localStorage.getItem(SRS_KEY) || '{}'); } catch (_) { return {}; } }
  function srsWrite(o) { try { localStorage.setItem(SRS_KEY, JSON.stringify(o)); } catch (_) {} }
  function srsGet(line, i) { return srsAll()[line + '#' + i] || null; }
  // Une branche revue monte d'une boite ; une branche ratee (2 fautes au rejeu
  // en aveugle) redescend a la premiere.
  function srsTouch(line, i, ok) {
    const all = srsAll(), k = line + '#' + i;
    const e = all[k] || { box: -1, seen: 0 };
    e.box = ok === false ? 0 : Math.min(SRS_BOXES.length - 1, e.box + 1);
    e.seen = (e.seen || 0) + 1;
    e.due = Date.now() + SRS_BOXES[e.box] * DAY;
    all[k] = e; srsWrite(all);
    return e;
  }
  function srsDue() {
    const all = srsAll(), now = Date.now();
    return Object.keys(all).filter(k => (all[k].due || 0) <= now)
      .map(k => ({ line: k.split('#')[0], i: +k.split('#')[1], e: all[k] }));
  }
  function srsLabel(e) {
    if (!e) return '';
    const days = Math.round((e.due - Date.now()) / DAY);
    if (days <= 0) return 'à revoir maintenant';
    if (days === 1) return 'à revoir demain';
    return `à revoir dans ${days} jours`;
  }

  function buildIntro(header, analysis, summary) {
    const white = header.White || 'Blancs';
    const black = header.Black || 'Noirs';
    const whiteElo = header.WhiteElo;
    const blackElo = header.BlackElo;
    const result = header.Result || '*';
    const termination = header.Termination || '';
    const tc = header.TimeControl || '';
    const user = detectUser(header);
    const userIsWhite = user === 'w';
    const opponent = user ? (userIsWhite ? black : white) : null;
    const opponentElo = user ? (userIsWhite ? blackElo : whiteElo) : null;

    let tcLabel = '';
    if (tc.includes('86400') || tc.includes('172800')) tcLabel = 'en partie journalière';
    else if (tc.includes('+')) {
      const est = tcSeconds(tc);
      if (est < 180) tcLabel = 'en Bullet';
      else if (est < 600) tcLabel = 'en Blitz';
      else tcLabel = 'en Rapide';
    }

    let line1 = '';
    if (user) {
      line1 = `Vous jouez les ${userIsWhite ? 'Blancs' : 'Noirs'} contre ${opponent}`;
      if (opponentElo) line1 += ` (${opponentElo})`;
      if (tcLabel) line1 += ` ${tcLabel}`;
      line1 += '.';
    } else {
      line1 = `${white}`;
      if (whiteElo) line1 += ` (${whiteElo})`;
      line1 += ` contre ${black}`;
      if (blackElo) line1 += ` (${blackElo})`;
      if (tcLabel) line1 += ` ${tcLabel}`;
      line1 += '.';
    }

    let line2 = '';
    const termLower = termination.toLowerCase();
    const userWon = user && ((userIsWhite && result === '1-0') || (!userIsWhite && result === '0-1'));
    const userLost = user && ((userIsWhite && result === '0-1') || (!userIsWhite && result === '1-0'));
    const isDraw = result === '1/2-1/2';

    if (user) {
      if (userWon) {
        if (termLower.includes('checkmate') || termLower.includes('mat')) {
          line2 = `Vous gagnez par échec et mat en ${analysis.length} coups — bien joué !`;
        } else if (termLower.includes('resign') || termLower.includes('abandon')) {
          line2 = `Votre adversaire abandonne après ${analysis.length} coups.`;
        } else if (termLower.includes('time')) {
          line2 = `Vous gagnez au temps après ${analysis.length} coups.`;
        } else {
          line2 = `Victoire en ${analysis.length} coups, bravo !`;
        }
      } else if (userLost) {
        if (termLower.includes('checkmate') || termLower.includes('mat')) {
          line2 = `Défaite par mat en ${analysis.length} coups — voyons ce qui s'est passé.`;
        } else if (termLower.includes('resign') || termLower.includes('abandon')) {
          line2 = `Vous abandonnez après ${analysis.length} coups.`;
        } else if (termLower.includes('time')) {
          line2 = `Défaite au temps après ${analysis.length} coups.`;
        } else {
          line2 = `Défaite en ${analysis.length} coups — analysons pour progresser.`;
        }
      } else if (isDraw) {
        line2 = `Partie nulle en ${analysis.length} coups.`;
      } else {
        line2 = `Partie de ${analysis.length} coups.`;
      }
    } else {
      if (result === '1-0') {
        if (termLower.includes('checkmate') || termLower.includes('mat')) {
          line2 = `Victoire des Blancs par échec et mat en ${analysis.length} coups.`;
        } else if (termLower.includes('resign') || termLower.includes('abandon')) {
          line2 = `Les Noirs ont abandonné après ${analysis.length} coups.`;
        } else if (termLower.includes('time')) {
          line2 = `Les Blancs gagnent au temps après ${analysis.length} coups.`;
        } else {
          line2 = `Victoire des Blancs en ${analysis.length} coups.`;
        }
      } else if (result === '0-1') {
        if (termLower.includes('checkmate') || termLower.includes('mat')) {
          line2 = `Victoire des Noirs par échec et mat en ${analysis.length} coups.`;
        } else if (termLower.includes('resign') || termLower.includes('abandon')) {
          line2 = `Les Blancs ont abandonné après ${analysis.length} coups.`;
        } else if (termLower.includes('time')) {
          line2 = `Les Noirs gagnent au temps après ${analysis.length} coups.`;
        } else {
          line2 = `Victoire des Noirs en ${analysis.length} coups.`;
        }
      } else if (isDraw) {
        if (termLower.includes('stalemate') || termLower.includes('pat')) {
          line2 = `Partie nulle par pat après ${analysis.length} coups.`;
        } else if (termLower.includes('repetition') || termLower.includes('répétition')) {
          line2 = `Partie nulle par répétition après ${analysis.length} coups.`;
        } else if (termLower.includes('agreement') || termLower.includes('accord')) {
          line2 = `Partie nulle par accord mutuel après ${analysis.length} coups.`;
        } else {
          line2 = `Partie nulle en ${analysis.length} coups.`;
        }
      } else {
        line2 = `Partie de ${analysis.length} coups.`;
      }
    }

    const s = summary.stats;
    const userStats = user ? (userIsWhite ? s.w : s.b) : null;
    const oppStats = user ? (userIsWhite ? s.b : s.w) : null;

    const narrative = buildNarrative(analysis, user, userIsWhite, userWon, userLost, isDraw, s, userStats, oppStats, termLower, header, summary.opening, summary.engineUsed);

    const dateStr = header.Date || '';
    let dateLine = '';
    if (dateStr) {
      const parts = dateStr.replace(/\./g, '-').split('-');
      if (parts.length >= 3) {
        const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
        const y = parseInt(parts[0]), m = parseInt(parts[1]) - 1, d = parseInt(parts[2]);
        if (m >= 0 && m < 12 && d > 0) dateLine = `${d} ${months[m]} ${y}`;
      }
    }

    const opening = summary.opening;
    let openingLine = '';
    if (opening) {
      openingLine = `<span class="intro-opening opening-toggle" tabindex="0" role="button" title="Cliquez pour explorer l'ouverture">${opening.name}</span> <span class="intro-eco">${opening.eco}</span>`;
    }

    // La precision par phase ne s'affiche plus ICI : elle etait noyee en fin de
    // paragraphe alors qu'elle repond a « qu'est-ce que je dois travailler ? ».
    // Elle devient un verdict a part entiere (voir buildPhaseVerdict), calcule
    // depuis les memes tranches.
    currentPhaseAccs = null;
    if (summary.engineUsed) {
      const phaseRanges = [
        { label: 'Ouverture', from: 0, to: Math.min(20, analysis.length) },
        { label: 'Milieu', from: 20, to: Math.min(50, analysis.length) },
        { label: 'Finale', from: 50, to: analysis.length }
      ];
      const showSide = user ? (userIsWhite ? 'w' : 'b') : null;
      const phaseAccs = phaseRanges.filter(p => p.from < analysis.length).map(p => {
        const sides = showSide ? [showSide] : ['w', 'b'];
        let accSum = 0, count = 0;
        for (let i = p.from; i < p.to; i++) {
          const r = analysis[i];
          if (!r.move) continue;
          if (sides.includes(r.move.color)) {
            accSum += Analyzer.winLossToAccuracy(r.winPctLoss);
            count++;
          }
        }
        const acc = count > 0 ? Math.round(accSum / count) : 0;
        return { label: p.label, acc, count };
      }).filter(p => p.count > 0);
      if (phaseAccs.length > 1) currentPhaseAccs = phaseAccs;
    }

    const card = $('#story-card');
    let html = `<p>${line1} ${line2}</p>`;
    if (dateLine || openingLine) {
      html += '<div class="intro-meta">';
      if (dateLine) html += `<span class="intro-date">📅 ${dateLine}</span>`;
      if (openingLine) html += `<span class="intro-opening-line">📖 ${openingLine}</span>`;
      html += '</div>';
    }
    html += `<p class="intro-narrative">${narrative}</p>`;
    $('#intro-text').innerHTML = html;
    const toggle = $('#intro-text .opening-toggle');
    if (toggle) {
      const openModal = () => openOpeningExplorer(opening, analysis);
      toggle.addEventListener('click', openModal);
      toggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); } });
    }
    addLessonLink(card, analysis);
    card.hidden = false;
  }

  // La boucle analyse → cours. Avant, le nom de l'ouverture ouvrait le cours à
  // sa RACINE : il fallait retrouver soi-même la branche où l'on venait de
  // sortir du livre. Ici on la nomme, et le lien y va directement.
  function addLessonLink(card, analysis) {
    const old = card.querySelector('.story-lesson');
    if (old) old.remove();
    if (typeof Courses === 'undefined' || !Courses.match) return;
    const played = analysis.map(r => r.move && r.move.san).filter(Boolean).slice(0, 24);
    if (played.length < 4) return;
    const hit = Courses.match(played.join(' '));
    if (!hit || !hit.course) { lessonLinkOutOfBook(card, played); return; }
    const branches = Courses.buildBranches(hit.course);
    // La branche la plus profonde que la partie a REELLEMENT suivie.
    let best = -1, bestPly = -1;
    branches.forEach((b, i) => {
      if (b.sans.length <= played.length && b.sans.every((s, k) => played[k] === s) && b.plyEnd > bestPly) {
        bestPly = b.plyEnd; best = i;
      }
    });
    if (best < 0) return;
    const o = OPENINGS.find(x => x.line === hit.key);
    if (!o) return;
    const b = branches[best];
    const label = b.name || (o.name || 'cette ligne');
    const moveNo = Math.ceil((bestPly + 1) / 2);
    const wrap = document.createElement('div');
    wrap.className = 'story-lesson';
    wrap.innerHTML = `<span>Tu as suivi le livre jusqu'au coup <b>${moveNo}</b>.</span>`;
    const btn = document.createElement('button');
    btn.className = 'pill pill-ghost';
    btn.textContent = `📖 Revoir « ${label} »`;
    btn.addEventListener('click', () => openOpeningByLine(hit.key, { branch: best }));
    wrap.appendChild(btn);
    card.appendChild(wrap);
  }

  // Le cas le plus fréquent chez lui : la partie quitte la théorie avant le
  // coup 3, donc AUCUN cours ne correspond à la ligne jouée. Plutôt que de ne
  // rien afficher, on nomme le coup qui sort du livre et on ouvre le cours de
  // l'ouverture qu'on était en train de jouer.
  function lessonLinkOutOfBook(card, played) {
    let bestKey = null, bestLen = 0;
    for (const k of Object.keys(Courses.COURSES)) {
      const kt = k.split(' ');
      let n = 0;
      while (n < kt.length && played[n] === kt[n]) n++;
      if (n >= 2 && n < kt.length && n > bestLen) { bestLen = n; bestKey = k; }
    }
    if (!bestKey) return;
    const o = OPENINGS.find(x => x.line === bestKey);
    if (!o) return;
    const frSan = (san) => (typeof Analyzer !== 'undefined' && Analyzer.toFrench) ? Analyzer.toFrench(san) : san;
    const ply = bestLen + 1;                       // le premier demi-coup hors livre
    const moveNo = Math.ceil(ply / 2);
    const dot = ply % 2 ? '.' : '…';
    const who = (ply % 2 ? 'w' : 'b') === currentUser ? 'Tu sors' : 'Il sort';
    const wrap = document.createElement('div');
    wrap.className = 'story-lesson';
    wrap.innerHTML = `<span>${who} du livre dès <b>${moveNo}${dot}${frSan(played[bestLen])}</b>.</span>`;
    const btn = document.createElement('button');
    btn.className = 'pill pill-ghost';
    btn.textContent = `📖 Le cours : ${o.name}`;
    btn.addEventListener('click', () => openOpeningByLine(bestKey));
    wrap.appendChild(btn);
    card.appendChild(wrap);
  }

  function explainMove(san, color, moveNum, fen) {
    const side = color === 'w' ? 'Les Blancs' : 'Les Noirs';
    const piece = san[0];
    if (san === 'O-O') return `${side} roquent côté roi — mettre le roi en sécurité et activer la tour.`;
    if (san === 'O-O-O') return `${side} roquent côté dame — roi en sécurité, tour centralisée.`;
    if (piece === 'N') {
      if (san.includes('f3') || san.includes('c3') || san.includes('f6') || san.includes('c6'))
        return `${side} développent un cavalier vers une case naturelle — contrôle du centre.`;
      return `${side} développent le cavalier.`;
    }
    if (piece === 'B') {
      if (san.includes('b5')) return `${side} placent le fou en b5 — pression sur le cavalier et le centre adverse.`;
      if (san.includes('c4') || san.includes('c5')) return `${side} développent le fou vers une diagonale active — visant f7/f2.`;
      if (san.includes('e7') || san.includes('e2')) return `${side} développent le fou prudemment — préparant le roque.`;
      if (san.includes('g7') || san.includes('g2')) return `${side} fianchettent le fou — contrôle de la grande diagonale.`;
      if (san.includes('b4')) return `${side} clouent le cavalier adverse — pression positionnelle.`;
      if (san.includes('a4')) return `${side} retirent le fou pour le garder actif tout en maintenant la pression.`;
      if (san.includes('b3') || san.includes('b6')) return `${side} retirent le fou sur la diagonale — visant le centre de loin.`;
      if (san.includes('g5') || san.includes('g4')) return `${side} développent le fou en épingle — menaçant de clouer une pièce adverse.`;
      if (san.includes('f4') || san.includes('f5')) return `${side} placent le fou activement — soutien du centre et contrôle de cases.`;
      return `${side} développent le fou.`;
    }
    if (piece === 'R') return `${side} activent la tour.`;
    if (piece === 'Q') return `${side} développent la dame — attention, tôt en partie cela peut être risqué.`;
    if (piece === 'K') return `${side} déplacent le roi.`;
    // Pawn moves
    const dest = san.replace(/[+#x=].*/, '').slice(-2);
    if (dest === 'e4' || dest === 'd4' || dest === 'e5' || dest === 'd5')
      return `${side} poussent un pion central — lutte pour le contrôle du centre.`;
    if (dest === 'c4' || dest === 'c5')
      return `${side} jouent c4/c5 — cherchant à contester le centre ou ouvrir le jeu.`;
    if (dest === 'a6') return `${side} jouent a6 — prévenir Fb5 ou préparer b5 pour gagner de l'espace.`;
    if (dest === 'a3') return `${side} jouent a3 — prévenir Fb4 ou préparer une expansion à l'aile dame.`;
    if (dest === 'h3' || dest === 'h6') return `${side} créent une case de fuite pour le roi et empêchent les pièces adverses d'utiliser g4/g5.`;
    if (dest === 'b5' || dest === 'b4') return `${side} gagnent de l'espace à l'aile dame.`;
    if (dest === 'c3') return `${side} jouent c3 — soutenir le centre avec d4 ou empêcher l'utilisation de cette case.`;
    if (dest === 'c6') return `${side} jouent c6 — renforcer le centre et préparer d5.`;
    if (dest === 'd6' || dest === 'd3') return `${side} poussent le pion d — soutien flexible du centre.`;
    if (dest === 'e6' || dest === 'e3') return `${side} jouent e6/e3 — solidifier le centre, libérer le fou.`;
    if (dest === 'f4' || dest === 'f5') return `${side} poussent le pion f — jeu agressif visant le centre ou une attaque.`;
    if (dest === 'g3' || dest === 'g6') return `${side} préparent un fianchetto — le fou ira en g2/g7.`;
    if (san.includes('x')) return `${side} capturent — échange de pièces ou de pions.`;
    return `${side} avancent un pion.`;
  }

  // Open the internal opening explorer for an exact OPENINGS line (as used by the
  // openings tree). Falls back to the "Ouvertures" browse panel when the line has
  // no dedicated catalog entry (structural / family-head nodes).
  function openOpeningByLine(line, opts) {
    const o = line ? OPENINGS.find(x => x.line === line) : null;
    if (!o) { if (_openPanel) _openPanel('openings'); return; }
    const flip = o.side === 'b';
    const moves = o.line.split(' ').length;
    const title = o.en && o.en !== o.name ? `${o.name} · ${o.en}` : o.name;
    const course = (typeof Courses !== 'undefined') ? Courses.get(o.line) : null;
    openOpeningExplorer({
      name: title, eco: o.eco, line: o.line, moves,
      // `side` manquait : le rejeu en aveugle et le bloc « tes parties » en ont
      // besoin pour savoir de quel cote se place le cours.
      side: o.side,
      idea: o.idea, plans: o.plans, structure: o.structure,
      mistakes: o.mistakes, deviations: o.deviations, course
    }, [], o.level || '', flip, opts);
  }

  // `opts.branch` = index de branche a ouvrir directement (deep-link depuis
  // l'analyse ou depuis la routine de revision : on veut LA branche, pas la
  // racine du cours).
  function openOpeningExplorer(opening, analysis, footerOverride, flip, opts) {
    if (!opening || !opening.line) return;

    // Self-enrich: if opened without a course (e.g. from the Coach, which passes
    // the deepest played line), find the matching course by prefix and pull the
    // catalog prose so the full lesson is available from anywhere.
    if (!opening.course && typeof Courses !== 'undefined' && Courses.match) {
      const m = Courses.match(opening.line);
      if (m) {
        opening.course = m.course;
        opening.courseLine = m.key;
        const cat = OPENINGS.find(o => o.line === m.key);
        if (cat) {
          if (opening.idea === undefined) opening.idea = cat.idea;
          if (opening.plans === undefined) opening.plans = cat.plans;
          if (opening.structure === undefined) opening.structure = cat.structure;
          if (opening.mistakes === undefined) opening.mistakes = cat.mistakes;
          if (opening.deviations === undefined) opening.deviations = cat.deviations;
        }
      }
    }

    const prevFlip = BoardRenderer.isFlipped();
    if (flip !== undefined) BoardRenderer.setFlipped(flip);

    const modal = $('#opening-modal');
    const svg = $('#opening-modal-svg');
    const arrowsEl = $('#opening-modal-arrows');
    const titleEl = $('#opening-modal-title');
    const ecoEl = $('#opening-modal-eco');
    const labelEl = $('#opening-modal-move-label');
    const explEl = $('#opening-modal-explanation');
    const evalEl = $('#opening-modal-eval');
    const detailsEl = $('#opening-modal-details');
    const footerEl = $('#opening-modal-footer');
    const prevBtn = $('#opening-modal-prev');
    const nextBtn = $('#opening-modal-next');

    function buildPositions(lineStr) {
      const tokens = lineStr.split(' ');
      const g = new Chess();
      const pos = [{ fen: g.fen(), move: null, san: null, color: null, num: 0 }];
      for (let i = 0; i < tokens.length; i++) {
        const made = g.move(tokens[i], { sloppy: true });
        if (!made) break;
        pos.push({ fen: g.fen(), move: made, san: tokens[i], color: made.color, num: i + 1 });
      }
      return pos;
    }
    let positions = buildPositions(opening.line);
    // In lesson mode, the active line's per-move notes (parallel to its SANs);
    // used by renderStep for opening-specific explanations instead of the
    // generic heuristic. null = legacy / no course.
    let activeNotes = null;

    const halfMoves = opening.moves || 0;
    let deviationSan = '';
    if (halfMoves < analysis.length && analysis[halfMoves] && analysis[halfMoves].move) {
      deviationSan = analysis[halfMoves].move.san;
    }

    titleEl.textContent = opening.name;
    ecoEl.textContent = opening.eco;

    let footerText;
    if (footerOverride !== undefined) {
      footerText = footerOverride;
    } else {
      footerText = `Vous avez suivi cette ouverture jusqu'au coup ${Math.ceil(halfMoves / 2)}`;
      if (deviationSan) {
        const devNum = Math.floor(halfMoves / 2) + 1;
        const devPrefix = halfMoves % 2 === 0 ? `${devNum}.` : `${devNum}...`;
        footerText += ` · Premier écart : ${devPrefix} ${deviationSan}`;
      }
    }
    footerEl.textContent = footerText;

    // ── Rich detail panel (catalog openings only) ──
    const rich = !!opening.idea;
    if (rich) {
      const section = (t, b) => `<div class="od-section"><h5>${t}</h5><p>${b}</p></div>`;
      let dh = '';
      dh += section('💡 Idée maîtresse', opening.idea);
      if (opening.plans) {
        dh += `<div class="od-section"><h5>🎯 Plans typiques</h5><p><b>Blancs :</b> ${opening.plans.w}</p><p><b>Noirs :</b> ${opening.plans.b}</p></div>`;
      }
      if (opening.structure) dh += section('🧱 Structure de pions', opening.structure);
      if (opening.mistakes) dh += section('⚠️ Erreur fréquente', opening.mistakes);
      if (opening.deviations && opening.deviations.length) {
        dh += `<div class="od-section"><h5>🔀 Si l'adversaire ne suit pas la ligne</h5>` +
          opening.deviations.map(d => `<p><b>${d.label} :</b> ${d.note}</p>`).join('') + `</div>`;
      }
      detailsEl.innerHTML = dh;
      detailsEl.hidden = false;
    } else {
      detailsEl.innerHTML = '';
      detailsEl.hidden = true;
    }

    // ── Live engine verdict (catalog openings only) ──
    let engineOk = false;
    let evalSeq = 0;
    let evalBusy = false;
    let pendingFen = null;

    function uciToFr(fen, uci) {
      if (!uci) return null;
      try {
        const g = new Chess(fen);
        const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
        return m ? Analyzer.toFrench(m.san) : null;
      } catch (_) { return null; }
    }

    function showEval(fen, res) {
      if (!modal.classList.contains('visible')) return;
      const whiteToMove = fen.split(' ')[1] === 'w';
      const whiteScore = whiteToMove ? res.score : -res.score;
      let valTxt, cls;
      if (Math.abs(whiteScore) >= 29000) {
        valTxt = whiteScore > 0 ? '#' : '-#';
        cls = whiteScore > 0 ? 'white-adv' : 'black-adv';
      } else {
        const pawns = (whiteScore / 100).toFixed(1);
        valTxt = whiteScore > 0 ? `+${pawns}` : pawns;
        cls = Math.abs(whiteScore) <= 30 ? 'equal' : (whiteScore > 0 ? 'white-adv' : 'black-adv');
      }
      const suggs = (res.lines || []).slice(0, 3).map(l => uciToFr(fen, l.move)).filter(Boolean);
      const suggTxt = suggs.length ? ` <span class="oe-sugg">· Le moteur joue : ${suggs.join(', ')}</span>` : '';
      evalEl.innerHTML = `<span class="oe-val ${cls}">${valTxt}</span> <span class="oe-text">${Analyzer.describeEval(whiteScore)}</span>${suggTxt}`;
    }

    async function pumpEval() {
      if (evalBusy) return;
      evalBusy = true;
      while (pendingFen) {
        const fen = pendingFen; pendingFen = null;
        const seq = evalSeq;
        try {
          const res = await StockfishEngine.evaluate(fen, 12);
          if (seq === evalSeq && fen === positions[idx].fen) showEval(fen, res);
        } catch (_) {
          evalEl.hidden = true;
          break;
        }
      }
      evalBusy = false;
    }

    function requestEval() {
      if (!engineOk) return;
      evalSeq++;
      pendingFen = positions[idx].fen;
      pumpEval();
    }

    let evalEnabled = false;
    if ((rich || opening.showEval) && typeof StockfishEngine !== 'undefined') {
      evalEnabled = true;
      evalEl.hidden = false;
      evalEl.innerHTML = `<span class="oe-text">⏳ Le moteur analyse la position…</span>`;
      (StockfishEngine.isReady() ? Promise.resolve() : StockfishEngine.init())
        .then(() => { engineOk = true; requestEval(); })
        .catch(() => { evalEl.hidden = true; });
    } else {
      evalEl.hidden = true;
    }

    let idx = 0;
    let boardActive = true; // false in lesson sections that hide the board (keyboard nav off)
    const ANIM_MS = 250;

    function renderStep(animate) {
      const pos = positions[idx];
      const prevFen = idx > 0 ? positions[idx - 1].fen : null;
      if (animate && prevFen && pos.move) {
        BoardRenderer.renderAnimated(svg, prevFen, pos.fen, pos.move, ANIM_MS);
      } else {
        BoardRenderer.render(svg, pos.fen, pos.move);
      }
      prevBtn.disabled = idx === 0;
      nextBtn.disabled = idx === positions.length - 1;

      if (idx === 0) {
        labelEl.textContent = 'Position initiale';
        explEl.textContent = 'Utilisez les flèches pour parcourir les coups de l\'ouverture.';
      } else {
        const moveNum = Math.ceil(idx / 2);
        const prefix = idx % 2 === 1 ? `${moveNum}.` : `${moveNum}...`;
        const sanFr = (typeof Analyzer !== 'undefined' && Analyzer.toFrench) ? Analyzer.toFrench(pos.san) : pos.san;
        labelEl.textContent = `${prefix} ${sanFr}`;
        const note = activeNotes && activeNotes[idx - 1];
        if (note) explEl.innerHTML = note;
        else explEl.textContent = explainMove(pos.san, pos.color, moveNum, pos.fen);
      }
      // À tout moment de la ligne : proposer de reprendre la main et d'explorer
      // les variations à partir d'ici (le coup théorique reste indiqué).
      if (!exploring && boardActive) {
        const atEnd = idx === positions.length - 1;
        const html = explEl.innerHTML;
        explEl.innerHTML = html +
          `<div class="oe-explore-cta"><button class="train-btn good" id="oe-explore">🔍 Continuer à jouer d'ici</button>` +
          `<span class="oe-explore-hint">${atEnd ? 'Fin de la ligne — ' : ''}reprends la main à partir de ce coup : joue les deux camps (ou glisse une pièce), le coup théorique reste indiqué (flèche verte).</span></div>`;
        const b = $('#oe-explore'); if (b) b.onclick = enterExplore;
      }
      requestEval();
    }

    // ───────────────────── Analyse libre (« Continuer à jouer ») ──────────────
    // À la fin de l'ouverture, on rejoue librement pour les deux camps : Stockfish
    // dessine son meilleur coup (flèche bleue) + éval relative aux Blancs et suite.
    let exploring = false, exHist = [], exToken = 0, exStartIdx = 0, exBookArrow = null;

    // Ligne d'état sous l'échiquier : logique partagée dans js/freeplay.js
    // (elle existait à l'identique ici, dans training.js et dans tactics.js).
    const exStatusHtml = (fen, res) => FreePlay.statusHtml(fen, res);

    // ── Suivi de la théorie pendant l'exploration ──
    // exStartIdx = le coup de la ligne d'où l'on a repris la main. On compare la
    // suite jouée (exHist) à la ligne d'ouverture pour dire, à chaque instant, si
    // l'on est encore « dans la théorie » et quel était le coup attendu.
    function moveLabelOf(pos) {
      const fr = (typeof Analyzer !== 'undefined' && Analyzer.toFrench) ? Analyzer.toFrench(pos.san) : pos.san;
      const moveNum = Math.ceil(pos.num / 2);
      const pfx = pos.num % 2 === 1 ? `${moveNum}.` : `${moveNum}...`;
      return `${pfx} ${fr}`;
    }
    function bookInfo() {
      let matched = 0;
      for (let k = 1; k < exHist.length; k++) {
        const bp = positions[exStartIdx + k];
        if (bp && bp.fen === exHist[k]) matched = k; else break;
      }
      const tipOnBook = matched === exHist.length - 1;
      const nextBook = positions[exStartIdx + matched + 1] || null;
      return { tipOnBook, nextBook };
    }
    function bookLineHtml() {
      const bi = bookInfo();
      if (bi.tipOnBook) {
        if (bi.nextBook) return `<div class="oe-book-move">📖 Coup théorique : <b>${moveLabelOf(bi.nextBook)}</b> <span class="oe-sugg">(flèche verte)</span></div>`;
        return `<div class="oe-book-move">📖 Fin de la théorie répertoriée — à toi de trouver la suite.</div>`;
      }
      if (bi.nextBook) return `<div class="oe-book-move oe-book-dev">📖 Hors théorie. La ligne d'ouverture jouait <b>${moveLabelOf(bi.nextBook)}</b> ici.</div>`;
      return `<div class="oe-book-move oe-book-dev">📖 Hors de la théorie répertoriée.</div>`;
    }
    function drawExploreArrows(bestUci) {
      const arr = [];
      // Blue = engine best; green = book/theory move, drawn last so it stays on top.
      if (bestUci) arr.push({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), color: '#5b8fb9', opacity: 0.9, width: 7 });
      if (exBookArrow) arr.push(exBookArrow);
      BoardRenderer.drawArrows(arrowsEl, arr);
    }

    function enterExplore() {
      exStartIdx = idx;
      exploring = true;
      exHist = [positions[idx].fen];
      renderExplore(null);
    }
    function renderExplore(lastMove) {
      const fen = exHist[exHist.length - 1];
      BoardRenderer.render(svg, fen, lastMove);
      // Compute the theory move for this position (if still on book) and draw it
      // in green straight away, before the engine (blue) even answers.
      const bi = bookInfo();
      exBookArrow = (bi.tipOnBook && bi.nextBook && bi.nextBook.move)
        ? { from: bi.nextBook.move.from, to: bi.nextBook.move.to, color: '#56b886', opacity: 0.95, width: 7 }
        : null;
      drawExploreArrows(null);
      labelEl.textContent = '🔍 Exploration libre';
      prevBtn.disabled = true; nextBtn.disabled = true;
      evalEl.hidden = true;
      const canUndo = exHist.length > 1;
      explEl.innerHTML =
        bookLineHtml() +
        `<div class="oe-explore-status" id="oe-ex-status">⏳ Analyse…</div>` +
        `<div class="oe-explore-actions">` +
        `<button class="train-btn ghost" id="oe-ex-undo"${canUndo ? '' : ' disabled'}>↶ Annuler</button>` +
        `<button class="train-btn ghost" id="oe-ex-reset"${canUndo ? '' : ' disabled'}>⟳ Départ</button>` +
        `<button class="train-btn ghost" id="oe-ex-quit">✕ Revenir à l'ouverture</button></div>`;
      const u = $('#oe-ex-undo'); if (u) u.onclick = () => { if (exHist.length > 1) { exHist.pop(); renderExplore(null); } };
      const r = $('#oe-ex-reset'); if (r) r.onclick = () => { if (exHist.length > 1) { exHist = [exHist[0]]; renderExplore(null); } };
      const q = $('#oe-ex-quit'); if (q) q.onclick = () => { exploring = false; exToken++; BoardRenderer.clearArrows(arrowsEl); if (evalEnabled) evalEl.hidden = false; renderStep(false); };
      analyzeExplore(fen, ++exToken);
    }
    function exploreMove(from, to) {
      if (!exploring) return;
      const fen = exHist[exHist.length - 1];
      let g, m = null;
      try { g = new Chess(fen); m = g.move({ from, to, promotion: 'q' }); } catch (_) { m = null; }
      if (!m) return;
      exHist.push(g.fen());
      renderExplore(m);
    }
    async function analyzeExplore(fen, token) {
      const statusEl = () => document.getElementById('oe-ex-status');
      let over = false; try { over = new Chess(fen).game_over(); } catch (_) {}
      if (over) { const s = statusEl(); if (s) s.innerHTML = exStatusHtml(fen, null); return; }
      if (typeof StockfishEngine === 'undefined') { const s = statusEl(); if (s) s.innerHTML = exStatusHtml(fen, null); return; }
      if (!StockfishEngine.isReady()) {
        try { await StockfishEngine.init(); } catch (_) { const s = statusEl(); if (s) s.innerHTML = exStatusHtml(fen, null); return; }
      }
      if (token !== exToken || !exploring) return;
      let res; try { res = await StockfishEngine.evaluate(fen, 'movetime 600'); } catch (_) { res = null; }
      if (token !== exToken || !exploring) return;
      drawExploreArrows(res && res.bestMove ? res.bestMove : null);
      const s = statusEl(); if (s) s.innerHTML = exStatusHtml(fen, res);
    }

    // Entrée de coups à la souris/doigt pour le mode exploration. Lié une seule
    // fois à l'élément (réutilisé entre ouvertures via des refs mutables).
    if (!svg._exploreBound) {
      svg._exploreBound = true;
      BoardRenderer.enableDrag(svg, {
        getFen: () => (svg._exGetFen ? svg._exGetFen() : ''),
        arrows: arrowsEl,
        canMove: () => !!(svg._exCanMove && svg._exCanMove()),
        onMove: (f, t) => { if (svg._onExploreMove) svg._onExploreMove(f, t); },
      });
    }
    svg._exGetFen = () => (exploring && exHist.length ? exHist[exHist.length - 1] : positions[idx].fen);
    // Dragging a piece works in free-play AND on any book position (auto-branch).
    svg._exCanMove = () => exploring || boardActive;
    svg._onExploreMove = (from, to) => {
      if (!exploring) { exStartIdx = idx; exploring = true; exHist = [positions[idx].fen]; }
      exploreMove(from, to);
    };

    // Swap the board's active line (lesson mode): rebuild positions from a new
    // SAN string, attach its notes, and rewind to the start.
    function loadLine(lineStr, notes) {
      exploring = false; exToken++;
      if (arrowsEl) BoardRenderer.clearArrows(arrowsEl);
      positions = buildPositions(lineStr);
      activeNotes = notes || null;
      idx = 0;
      renderStep(false);
    }

    function cleanup() {
      modal.classList.remove('visible');
      document.removeEventListener('keydown', onKey);
      exploring = false; exToken++;
      if (arrowsEl) BoardRenderer.clearArrows(arrowsEl);
      if (modal._release) { modal._release(); modal._release = null; }
      if (flip !== undefined) BoardRenderer.setFlipped(prevFlip);
    }

    function onKey(e) {
      if (e.key === 'Escape') { cleanup(); return; }
      if (!boardActive || exploring) return;
      if (e.key === 'ArrowLeft' && idx > 0) { idx--; renderStep(false); }
      if (e.key === 'ArrowRight' && idx < positions.length - 1) { idx++; renderStep(true); }
    }

    prevBtn.onclick = () => { if (idx > 0) { idx--; renderStep(false); } };
    nextBtn.onclick = () => { if (idx < positions.length - 1) { idx++; renderStep(true); } };
    $('#opening-modal-close').onclick = cleanup;
    modal.onclick = e => { if (e.target === modal) cleanup(); };
    document.addEventListener('keydown', onKey);

    // ───────────────────── Lesson mode (catalog courses) ─────────────────────
    // Le cours est l'ARBRE des variantes, pas six onglets.
    //
    // Avant : Présentation / Lignes / Plans / Pièges / Transpositions / Quiz.
    // Le découpage se faisait par TYPE de contenu, avec trois conséquences :
    //  - l'embranchement disparaissait. Après 3.Fc4 les Noirs ont trois réponses ;
    //    « Lignes » les donnait à plat et « Transpositions » redonnait LES MÊMES
    //    en prose. Nulle part on ne voyait que c'était UN choix ;
    //  - les pièges flottaient loin du coup qui les déclenche (le Fried Liver
    //    arrive après 4.Cg5 dans les Deux Cavaliers, il vivait dans un onglet à part) ;
    //  - la colonne droite était remplie à 32-42 % sur Plans / Transpositions / Quiz.
    //
    // Maintenant : un rail à gauche montre l'arbre (dérivé des `lines[].sans` par
    // Courses.buildBranches, rien n'a été ressaisi), et chaque noeud porte TOUT ce
    // qui le concerne — l'idée, le plan, ses pièges, sa question.
    function setupLesson(course, lessonOpts) {
      const railEl = $('#opening-branch-rail');
      const progEl = $('#opening-lesson-progress');
      const bodyEl = $('#opening-lesson-body');
      const boardEl = modal.querySelector('.opening-modal-board');
      const controlsEl = modal.querySelector('.opening-modal-controls');
      const doneKey = 'ca_lessons_done';

      detailsEl.hidden = true; detailsEl.innerHTML = '';

      const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const has = (a) => Array.isArray(a) && a.length;

      const branches = Courses.buildBranches(course);
      // Un cours sans `lines` n'a pas d'arbre à montrer : on retombe sur la vue
      // plate, qui reste correcte pour ces entrées.
      if (!branches.length) { railEl.hidden = true; return; }

      const traps = Courses.spread(course.traps, branches);
      const quizzes = Courses.spread(course.quiz, branches);
      const punish = Courses.spread(course.punish, branches);
      const visited = new Set();
      let cur = 0;

      // Numérotation française : ply 5 → « 3.Fc4 », ply 6 → « 3…Fc5 ».
      const num = (ply) => Math.ceil(ply / 2) + (ply % 2 ? '.' : '…');
      const frSan = (san) => (typeof Analyzer !== 'undefined' && Analyzer.toFrench) ? Analyzer.toFrench(san) : san;
      const mv = (ply, sans) => num(ply) + frSan(sans[ply - 1]);
      function labelOf(b) {
        if (b.depth === 0) return mv(b.plyEnd, b.sans);          // la tabiya
        if (b.plyStart === b.plyEnd) return mv(b.plyEnd, b.sans); // un seul coup
        return mv(b.plyStart, b.sans) + ' → ' + mv(b.plyEnd, b.sans);
      }

      railEl.hidden = false;
      progEl.hidden = false;
      // Le budget temps : la barre de progression ne promettait rien. Compter
      // ~40 s par branche (lecture de la fiche + pas-a-pas de la ligne).
      const mins = Math.max(2, Math.round(branches.length * 40 / 60));
      progEl.dataset.budget = `${branches.length} branche${branches.length > 1 ? 's' : ''} · ~${mins} min`;

      // ── Mobile : deux écrans ────────────────────────────────────────────────
      // Sur 390 px on ne peut pas loger l'arbre, l'échiquier et le contenu
      // ensemble. `m-map` donne l'écran à l'arbre, `m-branch` à la fiche. Sur
      // desktop les trois colonnes cohabitent et ces classes ne servent à rien.
      const modalEl = modal.querySelector('.opening-modal');
      const sibsEl = $('#opening-sibs');
      const backEl = $('#opening-modal-back');
      const searchEl = $('#opening-modal-search');
      const narrow = () => window.matchMedia('(max-width: 899px)').matches;

      // parent = le noeud précédent le plus proche de profondeur n-1. La liste
      // est en profondeur d'abord, donc la règle suffit.
      const parentOf = (i) => {
        for (let j = i - 1; j >= 0; j--) if (branches[j].depth === branches[i].depth - 1) return j;
        return -1;
      };
      const sibsOf = (i) => branches
        .map((_, j) => j)
        .filter(j => branches[j].depth === branches[i].depth && parentOf(j) === parentOf(i));

      function setScreen(mode) {
        if (!modalEl) return;
        modalEl.classList.toggle('m-map', mode === 'map');
        modalEl.classList.toggle('m-branch', mode === 'branch');
        modalEl.classList.remove('m-compact');
        if (backEl) backEl.hidden = mode !== 'branch';
        if (searchEl) searchEl.hidden = mode !== 'map';
        modalEl.scrollTop = 0;
      }

      function goMap() {
        setScreen('map');
        renderRail();
        const on = railEl.querySelector('.obr-node.on');
        if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
      }

      // La recherche d'ouvertures (avec autocomplétion) vit sur l'écran d'arbre,
      // derrière la modale. Depuis la carte, un seul geste doit y ramener : sans
      // ça, chercher une AUTRE ouverture demanderait de fermer, retrouver le
      // champ et le toucher.
      if (searchEl) searchEl.onclick = () => {
        cleanup();
        const inp = document.getElementById('ot-search');
        if (!inp) return;
        if (inp.scrollIntoView) inp.scrollIntoView({ block: 'center' });
        setTimeout(() => { try { inp.focus(); inp.select(); } catch (_) {} }, 60);
      };
      if (backEl) backEl.onclick = goMap;

      // L'en-tête se replie dès qu'on lit : l'échiquier passe à 104 px et le
      // commentaire du coup vient à côté, au lieu de sortir du champ.
      if (modalEl && !modalEl._obScroll) {
        modalEl._obScroll = true;
        modalEl.addEventListener('scroll', () => {
          if (!modalEl.classList.contains('m-branch')) return;
          modalEl.classList.toggle('m-compact', modalEl.scrollTop > 26);
        }, { passive: true });
      }

      function renderSibs() {
        if (!sibsEl) return;
        const sib = sibsOf(cur), k = sib.indexOf(cur);
        const prev = sib[k - 1], next = sib[k + 1];
        const cell = (j, dir) => {
          if (j === undefined) return `<button class="osib" disabled><span class="k">—</span>` +
            `<span class="w">aucune sœur ${dir < 0 ? 'avant' : 'après'}</span></button>`;
          const b = branches[j];
          return `<button class="osib" data-i="${j}">` +
            `<span class="k">${dir < 0 ? '‹ ' : ''}${esc(labelOf(b))}${dir > 0 ? ' ›' : ''}</span>` +
            `<span class="w">${esc(b.name || 'variante sœur')}</span></button>`;
        };
        sibsEl.hidden = false;
        sibsEl.innerHTML = cell(prev, -1) +
          `<button class="osib mid" data-map="1"><span class="k">⤺ variantes</span>` +
          `<span class="w">${visited.size}/${branches.length} vues</span></button>` +
          cell(next, 1);
        sibsEl.querySelectorAll('[data-i]').forEach(btn =>
          btn.addEventListener('click', () => show(+btn.dataset.i)));
        const mid = sibsEl.querySelector('[data-map]');
        if (mid) mid.addEventListener('click', goMap);
      }

      function renderRail() {
        railEl.innerHTML =
          `<div class="obr-head">Les variantes</div>` +
          branches.map((b, i) => {
            const tags = [];
            if (b.depth === 0) tags.push('<span class="obr-tag t-base">départ</span>');
            if (traps[i].length) tags.push(`<span class="obr-tag t-trap">${traps[i].length} piège${traps[i].length > 1 ? 's' : ''}</span>`);
            return `<button class="obr-node d${Math.min(b.depth, 3)}${i === cur ? ' on' : ''}${visited.has(i) ? ' seen' : ''}"
              data-i="${i}" aria-current="${i === cur ? 'true' : 'false'}">
              <span class="obr-san">${esc(labelOf(b))}</span>
              <span class="obr-name">${esc(b.name || (b.depth === 0 ? (opening.name || '') : ''))}</span>
              ${tags.join('')}<span class="obr-tick">✓</span></button>`;
          }).join('');
        railEl.querySelectorAll('.obr-node').forEach(btn =>
          btn.addEventListener('click', () => show(+btn.dataset.i)));
      }

      function markDone() {
        let set = [];
        try { set = JSON.parse(localStorage.getItem(doneKey) || '[]'); } catch (_) {}
        if (!set.includes(opening.line)) { set.push(opening.line); try { localStorage.setItem(doneKey, JSON.stringify(set)); } catch (_) {} }
      }
      function updateProgress() {
        const pct = Math.round((visited.size / branches.length) * 100);
        progEl.querySelector('span').style.width = pct + '%';
        progEl.classList.toggle('ol-complete', visited.size >= branches.length);
        progEl.title = `${visited.size} branche${visited.size > 1 ? 's' : ''} sur ${branches.length}`;
        if (visited.size >= branches.length) markDone();
      }

      // ── Le rejeu en aveugle ────────────────────────────────────────────────
      // Le format `sol` de Tactics alterne deja « ton coup / reponse forcée » :
      // une ligne d'ouverture y entre telle quelle. L'app joue les coups de
      // l'adversaire, on doit retrouver les siens. C'est ce qui fait passer de
      // « j'ai lu la ligne » a « je la joue ».
      function blindSide(b) {
        // Le camp du cours d'abord (la Française est cataloguée côté Noirs alors
        // que le cours est écrit pour les Blancs), puis celui du catalogue, puis
        // celui qui joue le coup ouvrant la branche.
        if (course.side === 'w' || course.side === 'b') return course.side;
        if (opening.side === 'w' || opening.side === 'b') return opening.side;
        return b.plyStart % 2 ? 'w' : 'b';
      }
      function blindable(b) {
        if (typeof Tactics === 'undefined' || !Tactics.start) return false;
        const side = blindSide(b);
        // Il faut au moins deux coups A NOUS a retrouver dans la branche.
        let n = 0;
        for (let ply = b.plyStart; ply <= b.plyEnd; ply++)
          if ((ply % 2 === 1 ? 'w' : 'b') === side) n++;
        return n >= 2;
      }
      function blindReplay(b) {
        const side = blindSide(b);
        // On part du dernier coup de l'adversaire AVANT notre premier coup a
        // retrouver, pour que `sol` commence bien par un coup a nous.
        let from = b.plyStart;
        while (from <= b.plyEnd && (from % 2 === 1 ? 'w' : 'b') !== side) from++;
        if (from > b.plyEnd) return;
        const g = new Chess();
        for (let k = 0; k < from - 1; k++) g.move(b.sans[k], { sloppy: true });
        const sol = b.sans.slice(from - 1, b.plyEnd);
        const iBranch = branches.indexOf(b);
        Tactics.start(
          [{ fen: g.fen(), sol, hint: `Rejoue ${sol.length > 2 ? 'la ligne' : 'le coup'} de mémoire : ${b.name || labelOf(b)}.` }],
          // Pas de prefixe d'emoji : Tactics ajoute deja le sien au titre.
          'En aveugle · ' + (b.name || labelOf(b)),
          // Une ligne ratee redescend en premiere boite (voir srsTouch).
          { onDone: (okAll) => { if (iBranch >= 0) srsTouch(opening.line, iBranch, okAll !== false); } }
        );
      }

      // ── Tes parties sur ce noeud ───────────────────────────────────────────
      async function fillMine(i) {
        const host = $('#ob-mine');
        if (!host || typeof Coach === 'undefined' || !Coach.lineStats) return;
        const b = branches[i];
        // Sur la tabiya on compte a partir de la ligne de l'ouverture (« apres
        // 2.Dh5 » = 8 parties) et non sur les 8 demi-coups de la tabiya, qui
        // n'en retiendraient qu'une : la question est « est-ce que je joue cette
        // ouverture », pas « ai-je deja atteint cette position exacte ».
        const baseSans = (b.depth === 0 && opening.line) ? opening.line.split(' ') : b.sans;
        const after = mv(baseSans.length, baseSans);
        try { await Coach.ensureData(); } catch (_) { return; }
        const st = Coach.lineStats(baseSans);
        // Le noeud n'est peut-etre plus affiche (on a change de branche pendant
        // le chargement de l'archive).
        if (host !== $('#ob-mine') || branches[cur] !== b) return;
        if (!st) {
          host.hidden = false;
          host.innerHTML = `<p class="ob-h">Tes parties après ${after}</p>` +
            `<p class="ob-mine-none">Aucune de tes parties analysées ne passe par cette position. C'est de la théorie neuve pour toi.</p>`;
          return;
        }
        const pct = Math.round(st.score * 100);
        const depth = baseSans.length;
        const book = new Set(branches.filter(x => x.plyStart === depth + 1)
          .map(x => x.sans[depth]).filter(Boolean));
        // Sur la tabiya, le coup « du livre » est aussi celui de la tabiya
        // elle-meme (le cours continue tout droit avant de bifurquer).
        if (b.depth === 0 && b.sans[depth]) book.add(b.sans[depth]);
        // Le coup du livre, ici, c'est celui que l'arbre du cours propose.
        const rows = st.nextList.slice(0, 4).map(nx => {
          const inBook = book.has(nx.san);
          const w = Math.round(nx.n / st.n * 100);
          return `<div class="om-row ${nx.mine ? (inBook ? 'in' : 'out') : 'opp'}">` +
            `<span class="om-mv">${frSan(nx.san)}</span>` +
            `<span class="om-bt"><i style="width:${Math.max(6, w)}%"></i></span>` +
            `<span class="om-n">${nx.n} partie${nx.n > 1 ? 's' : ''}${nx.mine && inBook ? ' · au livre' : ''}</span></div>`;
        }).join('');
        const leaks = st.nextList.filter(nx => nx.mine && !book.has(nx.san));
        host.hidden = false;
        host.innerHTML = `<p class="ob-h">Tes parties après ${after}</p>` +
          `<div class="om-stats">` +
            `<div><span class="v">${st.n}</span><span class="l">partie${st.n > 1 ? 's' : ''}</span></div>` +
            `<div><span class="v ${pct < 45 ? 'bad' : pct > 55 ? 'ok' : ''}">${pct} %</span><span class="l">des points</span></div>` +
            `<div><span class="v">${st.w}/${st.d}/${st.l}</span><span class="l">V/N/D</span></div>` +
          `</div>` +
          (leaks.length
            ? `<p class="om-leak">Tu quittes le livre ici : <b>${leaks.slice(0, 2).map(l => frSan(l.san)).join(', ')}</b>` +
              ` (${leaks.reduce((a, l) => a + l.n, 0)} partie${leaks.reduce((a, l) => a + l.n, 0) > 1 ? 's' : ''}).</p>`
            : '') +
          `<div class="om-next">${rows}</div>`;
      }

      // Le corps du noeud : tout ce qui concerne CETTE position, empilé.
      function renderBody(i) {
        const b = branches[i];
        const root = b.depth === 0;
        let h = '';

        const heading = b.name || (root ? (opening.name || 'Le départ') : labelOf(b));
        h += `<div class="ob-title">${esc(heading)}${b.eco ? ` <span class="ob-eco">${esc(b.eco)}</span>` : ''}</div>`;

        // L'idée : l'intro du cours sur la tabiya, sinon la note du coup qui
        // ouvre la branche — elle est déjà écrite, ligne par ligne.
        const opener = b.notes.find(n => n);
        const idea = root ? (course.intro || opening.idea) : opener;
        if (idea) h += `<div class="ob-blk"><p class="ob-h">${root ? 'Idée maîtresse' : 'L\'idée du coup'}</p><p>${idea}</p></div>`;

        // Tes parties ici : le cours devient personnel. Combien de fois tu es
        // passé par cette position, ton score, et le coup par lequel tu quittes
        // le livre. Rempli en asynchrone (l'archive peut ne pas être chargée),
        // d'où le conteneur vide posé maintenant et garni par fillMine().
        h += `<div class="ob-blk ob-mine" id="ob-mine" hidden></div>`;

        // Les plans restent sur la tabiya : ils valent pour toute l'ouverture.
        // Repliés par défaut — la tabiya porte déjà l'idée, la fourche, ses
        // pièges et sa question ; tout déplier d'un coup en fait un mur.
        if (root && (opening.plans || opening.structure)) {
          let inner = '';
          if (opening.plans) inner += `<p><b>Blancs :</b> ${opening.plans.w}</p><p><b>Noirs :</b> ${opening.plans.b}</p>`;
          if (opening.structure) inner += `<p><b>Structure :</b> ${opening.structure}</p>`;
          h += `<details class="ob-blk ob-fold"><summary><span class="ob-h">Plans typiques</span></summary>${inner}</details>`;
        }
        if (root && opening.mistakes) {
          h += `<div class="ob-blk"><p class="ob-h">Erreur fréquente</p><div class="ob-callout warn">${opening.mistakes}</div></div>`;
        }

        // L'embranchement, nommé pour ce qu'il est. Remplace l'onglet
        // « Transpositions », qui redisait en prose ce que l'arbre montre.
        const kids = branches.filter(x => x.depth === b.depth + 1 &&
          x.lines.some(l => b.lines.indexOf(l) >= 0));
        if (kids.length > 1) {
          h += `<div class="ob-blk"><p class="ob-h">L'embranchement</p>` +
            `<p>${kids.length} suites possibles. Chacune mène à une partie différente :</p>` +
            `<div class="ob-forks">` + kids.map(k =>
              `<button class="ob-fork" data-i="${branches.indexOf(k)}">
                 <b>${esc(labelOf(k))}</b>${k.name ? `<span>${esc(k.name)}</span>` : ''}</button>`).join('') +
            `</div></div>`;
        }

        // Les coups de la branche ne sont PAS relistés ici : leurs notes
        // s'affichent sous l'échiquier pendant le pas-à-pas (◀ ▶), ce qui rend
        // l'échiquier utile au lieu de le laisser figé sur une position morte,
        // et évite de raconter en texte ce qu'on peut montrer.
        if (b.plyEnd > b.plyStart) {
          h += `<div class="ob-blk"><p class="ob-h">Les coups</p>` +
            `<p>Utilise <b>◀ ▶</b> sous l'échiquier : le commentaire de chaque coup s'affiche au fur et à mesure.</p>` +
            // Lire une ligne n'est pas la savoir. En aveugle, l'app joue les
            // coups de l'adversaire et c'est à toi de retrouver les tiens.
            (blindable(b) ? `<button class="train-btn good ob-blind" data-i="${i}">🙈 Rejouer la ligne en aveugle</button>` : '') +
            `</div>`;
        }

        // Les pièges, sur le coup qui les déclenche.
        traps[i].forEach((t, k) => {
          const drill = has(t.sol) && t.fen
            ? `<button class="train-btn good ob-drill" data-i="${i}" data-k="${k}">🎯 Essayer ce coup</button>` : '';
          h += `<div class="ob-blk"><p class="ob-h">Piège</p>` +
            `<div class="ob-callout trap"><b>${esc(t.title)}</b><br>${t.hint}</div>${drill}</div>`;
        });

        // Quand l'adversaire sort du livre : un exercice d'UNE position par
        // deviation, au lieu d'un paragraphe replie en bas de page. A son
        // niveau, 124 parties sur 150 quittent le catalogue avant le coup 3 :
        // c'est le cas le plus frequent, il ne peut pas rester en prose.
        if (punish[i].length) {
          h += `<div class="ob-blk"><p class="ob-h">S'il sort du livre</p>`;
          punish[i].forEach((d, k) => {
            const playable = has(d.sol) && d.fen;
            h += `<div class="ob-punish">` +
              `<div class="op-tx"><b>${esc(d.label)}</b><span>${d.hint}</span>` +
              (d.seen ? `<em class="op-seen">vu ${d.seen} fois dans tes parties</em>` : '') + `</div>` +
              (playable ? `<button class="train-btn good ob-pdrill" data-i="${i}" data-k="${k}">Jouer</button>` : '') +
              `</div>`;
          });
          h += `</div>`;
        }

        // La position a atteindre : le plan, montre au lieu d'etre raconte.
        // L'echiquier du cours restait fige sur la fin de la ligne, et les
        // cases a occuper etaient decrites en prose dans « Plans typiques ».
        if (root && course.target && course.target.fen) {
          h += `<div class="ob-blk"><p class="ob-h">La position à atteindre</p>` +
            `<div class="ob-target"><div class="ob-target-bd">` +
            `<svg id="ob-target-svg" viewBox="0 0 360 360"></svg>` +
            `<svg id="ob-target-ov" viewBox="0 0 360 360" class="arrow-overlay"></svg></div>` +
            `<p>${course.target.note || ''}</p></div></div>`;
        }

        // Une question par branche, posée juste après l'avoir lue.
        if (quizzes[i].length) h += `<div class="ob-blk"><p class="ob-h">Vérifie</p><div class="ob-quiz" id="ob-quiz"></div></div>`;

        // Les trois phrases a retenir. Un cours d'Italienne, c'est 12 notes de
        // coups, 3 pieges et 3 questions : rien ne disait ce qu'il faut en
        // garder. Epinglable sur l'accueil.
        if (root && has(course.keep)) {
          h += `<div class="ob-blk"><p class="ob-h">À retenir</p><ol class="ob-keep">` +
            course.keep.map(k => `<li>${k}</li>`).join('') + `</ol></div>`;
        }

        // Les transpositions que l'arbre ne montre PAS. Celles dont le libellé est
        // un coup déjà présent dans la fourche sont retirées : c'était le doublon
        // le plus visible (l'ancien onglet « Transpositions » redonnait en prose
        // « 3…Fc5 » et « 3…Cf6 », que l'embranchement affiche maintenant juste
        // au-dessus). Restent les vraies déviations hors arbre.
        if (root) {
          const shown = new Set(branches.filter(x => x.depth > 0)
            .map(x => mv(x.plyStart, x.sans).replace(/\s+/g, '')));
          const items = (has(course.transpositions) ? course.transpositions : opening.deviations || [])
            .filter(d => !shown.has(String(d.label).replace(/\s+/g, '')));
          if (has(items)) h += `<details class="ob-blk ob-fold"><summary><span class="ob-h">Les autres suites</span></summary>` +
            items.map(d => `<p><b>${esc(d.label)} :</b> ${d.note}</p>`).join('') + `</details>`;
        }

        // L'etat de revision de CETTE branche.
        const srs = srsGet(opening.line, i);
        if (srs) h += `<div class="ob-srs"><span class="dot"></span>` +
          `<span>branche revue ${srs.seen} fois &middot; <b>${srsLabel(srs)}</b></span></div>`;

        bodyEl.innerHTML = h;
        bodyEl.hidden = false;

        // Le diagramme de la position type (dessine apres l'injection du HTML).
        if (root && course.target && course.target.fen) {
          const tsvg = $('#ob-target-svg'), tov = $('#ob-target-ov');
          if (tsvg && typeof BoardRenderer !== 'undefined') {
            BoardRenderer.render(tsvg, course.target.fen);
            if (tov && has(course.target.goals))
              BoardRenderer.highlightSquares(tov, course.target.goals, 'var(--success)');
          }
        }

        bodyEl.querySelectorAll('.ob-fork').forEach(btn =>
          btn.addEventListener('click', () => show(+btn.dataset.i)));
        bodyEl.querySelectorAll('.ob-pdrill').forEach(btn => btn.addEventListener('click', () => {
          const d = punish[+btn.dataset.i][+btn.dataset.k];
          if (d && d.fen && has(d.sol) && typeof Tactics !== 'undefined' && Tactics.start)
            Tactics.start([{ fen: d.fen, sol: d.sol, hint: d.hint }], d.label);
        }));
        bodyEl.querySelectorAll('.ob-blind').forEach(btn =>
          btn.addEventListener('click', () => blindReplay(branches[+btn.dataset.i])));
        fillMine(i);
        bodyEl.querySelectorAll('.ob-drill').forEach(btn => btn.addEventListener('click', () => {
          const t = traps[+btn.dataset.i][+btn.dataset.k];
          if (t && t.fen && has(t.sol) && typeof Tactics !== 'undefined' && Tactics.start) {
            Tactics.start([{ fen: t.fen, sol: t.sol, hint: t.hint }], t.title.replace(/^[^\wÀ-ÿ]+\s*/, ''));
          }
        }));
        if (quizzes[i].length) renderQuiz(quizzes[i]);
      }

      function renderQuiz(qs) {
        const host = $('#ob-quiz');
        let k = 0, score = 0;
        function draw() {
          if (k >= qs.length) {
            host.innerHTML = `<div class="ol-quiz-result"><span class="ol-quiz-icon">${score === qs.length ? '🎉' : '📖'}</span><p><b>${score} / ${qs.length}</b></p><button class="train-btn good ob-retry">Recommencer</button></div>`;
            host.querySelector('.ob-retry').addEventListener('click', () => { k = 0; score = 0; draw(); });
            return;
          }
          const q = qs[k];
          // Une question qui porte une position se joue SUR L'ECHIQUIER : un QCM
          // teste la lecture, pas la memoire des coups.
          if (q.fen && has(q.sol) && typeof Tactics !== 'undefined' && Tactics.start) {
            host.innerHTML = `<p class="ol-quiz-q">${q.q}</p>` +
              `<button class="train-btn good ob-qplay">Jouer sur l'échiquier</button>` +
              `<div class="ol-quiz-fb" hidden></div>`;
            host.querySelector('.ob-qplay').addEventListener('click', () => {
              Tactics.start([{ fen: q.fen, sol: q.sol, hint: q.explain }], q.q);
              score++; k++; draw();
            });
            return;
          }
          host.innerHTML = `<p class="ol-quiz-q">${q.q}</p><div class="ol-quiz-opts">` +
            q.opts.map((o, j) => `<button class="quiz-opt" data-j="${j}">${esc(o)}</button>`).join('') +
            `</div><div class="ol-quiz-fb" hidden></div>`;
          host.querySelectorAll('.quiz-opt').forEach(b => b.addEventListener('click', () => answer(+b.dataset.j)));
        }
        function answer(j) {
          const q = qs[k], ok = j === q.answer;
          if (ok) score++;
          const fb = host.querySelector('.ol-quiz-fb');
          fb.hidden = false;
          fb.className = 'ol-quiz-fb ' + (ok ? 'correct' : 'wrong');
          fb.innerHTML = `<b>${ok ? 'Correct !' : 'Raté !'}</b> ${q.explain}`;
          host.querySelectorAll('.quiz-opt').forEach(b => {
            b.disabled = true;
            if (+b.dataset.j === q.answer) b.classList.add('correct');
            if (+b.dataset.j === j && !ok) b.classList.add('wrong');
          });
          // Plus d'enchainement automatique : les 2 s effacaient l'explication
          // avant qu'on ait fini de la lire. On avance quand on a lu.
          const nx = document.createElement('button');
          nx.className = 'train-btn good';
          nx.textContent = k + 1 >= qs.length ? 'Voir le score' : 'Question suivante';
          nx.addEventListener('click', () => { k++; draw(); });
          fb.appendChild(nx);
        }
        draw();
      }

      function show(i) {
        cur = i;
        // Premiere visite de la branche dans cette session : elle entre (ou
        // monte) dans la boite de revision - une ligne lue une fois est une
        // ligne oubliee.
        if (!visited.has(i)) { visited.add(i); srsTouch(opening.line, i, true); }
        const b = branches[i];
        // L'échiquier suit l'arbre : on charge le chemin complet du noeud et on
        // s'arrête sur sa position, les flèches ◀ ▶ rejouant la branche.
        boardEl.hidden = false; controlsEl.hidden = false; boardActive = true;
        evalEl.hidden = !(rich || opening.showEval);
        explEl.hidden = false;
        loadLine(b.sans.join(' '), b.allNotes);
        // On se pose sur le PREMIER coup de la branche (celui qui la définit),
        // pas sur sa fin : c'est de là qu'on veut avancer. La tabiya, elle, se
        // montre entière.
        idx = b.depth === 0 ? positions.length - 1 : b.plyStart;
        renderStep(false);
        renderBody(i);
        renderRail();
        renderSibs();
        updateProgress();
        setScreen('branch');
      }

      // On arrive sur la CARTE en mobile (choisir sa branche avant de lire), et
      // directement sur la tabiya en desktop, où l'arbre reste visible à gauche.
      // Deep-link : on atterrit directement sur la branche demandee, meme sur
      // mobile (ou l'on arrive normalement sur la carte de l'arbre).
      const want = lessonOpts && typeof lessonOpts.branch === 'number' &&
        lessonOpts.branch >= 0 && lessonOpts.branch < branches.length ? lessonOpts.branch : null;
      if (want !== null) { renderRail(); renderSibs(); show(want); }
      // Sur mobile on arrive sur la CARTE de l'arbre : rien n'a encore ete lu,
      // donc la branche 0 n'est pas comptee comme visitee (c'est show() qui
      // marque, et c'est lui qui fait monter la boite de revision).
      else if (narrow()) { cur = 0; renderRail(); renderSibs(); updateProgress(); goMap(); }
      else { show(0); }
    }

    idx = 0;
    modal.classList.add('visible');
    modal._release = trapFocus(modal.querySelector('.opening-modal'));
    // Reset lesson chrome (hidden for flat/legacy openings).
    $('#opening-branch-rail').hidden = true;
    $('#opening-lesson-progress').hidden = true;
    $('#opening-lesson-body').hidden = true;
    // Chrome mobile du cours : une ouverture SANS cours n'a pas d'arbre, donc
    // pas de deuxième écran ni de branches sœurs.
    $('#opening-sibs').hidden = true;
    $('#opening-modal-back').hidden = true;
    $('#opening-modal-search').hidden = true;
    modal.querySelector('.opening-modal').classList.remove('m-map', 'm-branch', 'm-compact');
    modal.querySelector('.opening-modal-board').hidden = false;
    modal.querySelector('.opening-modal-controls').hidden = false;
    explEl.hidden = false;
    renderStep(false);
    if (opening.course) setupLesson(opening.course, opts);
  }

  function buildNarrative(analysis, user, userIsWhite, userWon, userLost, isDraw, s, userStats, oppStats, termLower, header, opening, engineUsed) {
    const byTime = termLower.includes('time');
    const byMate = termLower.includes('checkmate') || termLower.includes('mat');
    const byResign = termLower.includes('resign') || termLower.includes('abandon');

    const N = analysis.length;
    const isUserMove = r => user && r.move && ((user === 'w' && r.move.color === 'w') || (user === 'b' && r.move.color === 'b'));
    const userEvalOf = r => (typeof r.eval === 'number') ? (userIsWhite ? r.eval : -r.eval) : null;
    const fmtEval = cp => { const v = cp / 100; return (v > 0 ? '+' : '') + v.toFixed(1); };

    // Deterministic per-game seed: phrasing stays stable for a given game but
    // varies across games, so two similar games don't read identically.
    let seed = N * 13;
    if (analysis[0] && analysis[0].san) for (const ch of analysis[0].san) seed += ch.charCodeAt(0);
    if (userStats) seed += userStats.blunders * 5 + userStats.mistakes * 3 + (userStats.inaccuracies || 0);
    const pick = (arr, salt) => arr[Math.abs(seed + salt) % arr.length];

    const tc = header ? (header.TimeControl || '') : '';
    let isFastTc = false;
    if (tc.includes('+')) { const secs = parseInt(tc); if (secs < 180) isFastTc = true; }

    const phases = [
      { name: 'opening', label: 'l\'ouverture', from: 0, to: Math.min(20, N) },
      { name: 'middle', label: 'le milieu de partie', from: 20, to: Math.min(50, N) },
      { name: 'end', label: 'la finale', from: 50, to: N }
    ];
    const phaseData = phases.map(p => {
      let ub = 0, um = 0, ui = 0, ob = 0, om = 0, uAcc = 0, uCount = 0;
      for (let i = p.from; i < p.to; i++) {
        const r = analysis[i]; if (!r.move) continue;
        const mine = isUserMove(r);
        if (mine) { uAcc += Analyzer.winLossToAccuracy(r.winPctLoss); uCount++; }
        if (r.type === 'blunder') { mine ? ub++ : ob++; }
        else if (r.type === 'mistake') { mine ? um++ : om++; }
        else if (r.type === 'inaccuracy' && mine) ui++;
      }
      const acc = uCount ? Math.round(uAcc / uCount) : null;
      return { ...p, ub, um, ui, ob, om, acc, uCount };
    });
    const [op, mid, end] = phaseData;

    // Swings and the single most damaging move for each side (by win% lost).
    let maxUserEval = null, minUserEval = null;
    let userCrit = null, oppCrit = null;
    for (let i = 0; i < N; i++) {
      const r = analysis[i]; if (!r.move) continue;
      const ue = userEvalOf(r);
      if (ue !== null) {
        if (maxUserEval === null || ue > maxUserEval) maxUserEval = ue;
        if (minUserEval === null || ue < minUserEval) minUserEval = ue;
      }
      if ((r.type === 'blunder' || r.type === 'mistake') && (r.winPctLoss || 0) > 0) {
        const rec = { wl: r.winPctLoss, san: r.sanFr || r.san, moveNum: Math.floor(i / 2) + 1, dot: i % 2 === 0 ? '.' : '...', type: r.type };
        if (isUserMove(r)) { if (!userCrit || rec.wl > userCrit.wl) userCrit = rec; }
        else if (!oppCrit || rec.wl > oppCrit.wl) oppCrit = rec;
      }
    }

    const lines = [];

    // ---- Spectator view (no user perspective) ----
    if (!user) {
      if (opening) {
        lines.push(pick([
          `${opening.name} — ouverture ${(op.ub + op.ob === 0) ? 'saine des deux côtés' : 'déjà agitée'}.`,
          `Les deux camps passent par la ${opening.name}${(op.ub + op.ob === 0) ? ', sans heurt' : ', mais les erreurs arrivent vite'}.`
        ], 1));
      }
      const bigCrit = [userCrit, oppCrit].filter(Boolean).sort((a, b) => b.wl - a.wl)[0];
      if (bigCrit && bigCrit.wl >= 0.2) {
        lines.push(`Le tournant : ${bigCrit.moveNum}${bigCrit.dot} ${bigCrit.san} fait basculer l'évaluation.`);
      }
      const totalBlunders = s.w.blunders + s.b.blunders;
      if (totalBlunders >= 4) lines.push('Partie mouvementée, riche en erreurs de part et d\'autre.');
      else if (totalBlunders === 0 && s.w.mistakes + s.b.mistakes <= 2) lines.push('Partie de bonne facture, avec très peu d\'imprécisions.');
      return lines.length ? lines.slice(0, 4).join(' ') : 'Consultez les moments clés ci-dessous pour le détail de la partie.';
    }

    // ---- Slot A: opening ----
    if (opening) {
      if (op.ub === 0 && op.um === 0) {
        lines.push(pick([
          `Vous déroulez la ${opening.name} proprement, sans fausse note dans les premiers coups.`,
          `La ${opening.name} est menée avec assurance : rien à redire sur la sortie d'ouverture.`,
          `Bon départ dans la ${opening.name}, la position sort saine de l'ouverture.`
        ], 1));
      } else if (op.ub > 0) {
        let openLow = null;
        for (let i = 0; i < Math.min(20, N); i++) { const ue = userEvalOf(analysis[i]); if (ue !== null && (openLow === null || ue < openLow)) openLow = ue; }
        if (openLow !== null && openLow <= -200) {
          lines.push(pick([
            `L'ouverture tourne court : une bourde dans la ${opening.name} vous met tout de suite sous pression (${fmtEval(openLow)}).`,
            `Mauvaise entame — la ${opening.name} déraille sur une gaffe précoce et l'avantage passe à l'adversaire.`
          ], 2));
        } else {
          lines.push(pick([
            `Un accroc dans la ${opening.name}, mais la position tient malgré cette erreur de sortie.`,
            `La ${opening.name} n'est pas parfaite : une gaffe précoce, sans conséquence immédiate toutefois.`
          ], 3));
        }
      } else {
        lines.push(pick([
          `La ${opening.name} se déroule correctement, à quelques imprécisions près.`,
          `Sortie d'ouverture honnête dans la ${opening.name}, sans erreur grave.`
        ], 4));
      }
    } else if (op.ub === 0 && op.um === 0 && op.ob === 0) {
      lines.push(pick(['Les premiers coups se déroulent sans accroc des deux côtés.', 'Ouverture calme, aucune erreur de part et d\'autre.'], 5));
    } else if (op.ub > 0) {
      lines.push(pick(['Vous concédez un avantage dès l\'ouverture.', 'L\'ouverture est difficile : une gaffe précoce vous met en retard.'], 6));
    } else if (op.ob > 0) {
      lines.push(pick(['Votre adversaire se trompe dès l\'ouverture et vous prenez les devants.', 'Cadeau adverse en ouverture : l\'avantage est pour vous d\'entrée.'], 7));
    }

    // ---- Slot B: the decisive moment ----
    let usedCrit = false;
    if (engineUsed && userLost && maxUserEval !== null && maxUserEval >= 300) {
      lines.push(pick([
        `Vous aviez pourtant la partie en main (jusqu'à ${fmtEval(maxUserEval)}) avant de laisser filer l'avantage.`,
        `Le plus frustrant : une position gagnante (${fmtEval(maxUserEval)}) qui vous échappe en cours de route.`
      ], 8));
      usedCrit = true;
    } else if (engineUsed && isDraw && maxUserEval !== null && maxUserEval >= 300) {
      lines.push(pick([
        `Une position nettement supérieure (${fmtEval(maxUserEval)}) que vous ne convertissez pas — la nulle laisse un goût d'inachevé.`,
        `Vous teniez le gain (${fmtEval(maxUserEval)}), mais la partie se dilue vers le partage.`
      ], 9));
      usedCrit = true;
    } else if (engineUsed && userWon && minUserEval !== null && minUserEval <= -300) {
      lines.push(pick([
        `Belle résilience : donné perdant (${fmtEval(minUserEval)}), vous renversez la partie.`,
        `Remontée remarquable depuis une position compromise (${fmtEval(minUserEval)}) jusqu'à la victoire.`
      ], 10));
      usedCrit = true;
    } else if (userCrit && userCrit.wl >= 0.25) {
      lines.push(pick([
        `Le tournant vient de votre ${userCrit.moveNum}${userCrit.dot} ${userCrit.san} — la ${userCrit.type === 'blunder' ? 'gaffe' : 'erreur'} qui fait basculer la partie.`,
        `Tout se joue sur votre ${userCrit.moveNum}${userCrit.dot} ${userCrit.san}, le coup qui coûte le plus cher.`
      ], 11));
      usedCrit = true;
    } else if (oppCrit && oppCrit.wl >= 0.25 && userWon) {
      lines.push(pick([
        `Le tournant : l'adversaire craque sur ${oppCrit.moveNum}${oppCrit.dot} ${oppCrit.san}, et vous en profitez.`,
        `Votre adversaire lâche prise avec ${oppCrit.moveNum}${oppCrit.dot} ${oppCrit.san} — une ouverture que vous saisissez.`
      ], 12));
      usedCrit = true;
    }

    // ---- Slot C: the actionable insight ----
    let usedInsight = false;
    if (engineUsed) {
      const withAcc = phaseData.filter(p => p.acc !== null && p.uCount >= 4);
      if (withAcc.length >= 2) {
        const weak = withAcc.reduce((a, b) => b.acc < a.acc ? b : a);
        const strong = withAcc.reduce((a, b) => b.acc > a.acc ? b : a);
        if (strong.acc - weak.acc >= 15) {
          lines.push(pick([
            `À retenir : votre précision décroche dans ${weak.label} (${weak.acc}%) alors que ${strong.label} tient bien (${strong.acc}%). C'est là qu'il faut travailler.`,
            `Votre point faible ici est ${weak.label} (${weak.acc}% contre ${strong.acc}% ailleurs) — la phase à cibler à l'entraînement.`
          ], 13));
          usedInsight = true;
        }
      }
    }
    if (!usedInsight && !usedCrit && userStats.blunders === 1 && userLost) {
      lines.push(pick([
        'La défaite tient à une seule gaffe : corrigez ce type de coup et le résultat change.',
        'Un unique faux pas décide de la partie — le reste de votre jeu tenait la route.'
      ], 14));
      usedInsight = true;
    } else if (!usedInsight && engineUsed && userLost && (userStats.accuracy - oppStats.accuracy) >= 8) {
      lines.push(pick([
        `Frustrant : vous jouez globalement plus juste (${userStats.accuracy}% contre ${oppStats.accuracy}%), mais un moment clé vous coûte le point.`,
        `Votre précision d'ensemble (${userStats.accuracy}%) dépasse celle de l'adversaire (${oppStats.accuracy}%) — c'est un détail décisif qui a manqué.`
      ], 15));
      usedInsight = true;
    } else if (!usedInsight && (userStats.brilliants + userStats.great) >= 1) {
      lines.push(pick([
        `À souligner : vous trouvez ${userStats.brilliants ? 'une ressource brillante' : 'un coup fort'} dans la partie.`,
        `Point positif : au moins un coup de grande qualité (${userStats.brilliants ? 'brillant' : 'très fort'}) dans votre jeu.`
      ], 16));
      usedInsight = true;
    } else if (!usedInsight && engineUsed && userStats.accuracy >= 90 && userStats.blunders === 0) {
      lines.push(pick([
        `Partie très propre de votre part (${userStats.accuracy}% de précision, aucune gaffe).`,
        `Jeu solide et régulier : ${userStats.accuracy}% de précision sans la moindre bourde.`
      ], 17));
      usedInsight = true;
    } else if (!usedInsight && mid.ub >= 2) {
      lines.push(pick([
        'Le milieu de partie part dans tous les sens, avec plusieurs gaffes à enchaîner.',
        'Trop d\'erreurs en milieu de partie : c\'est la zone à stabiliser.'
      ], 18));
      usedInsight = true;
    }

    // ---- Slot D: outcome framing ----
    if (userWon) {
      if (byMate) lines.push(pick(['Et la conclusion idéale : échec et mat.', 'Le point final au bout de l\'échiquier : mat.'], 19));
      else if (byResign) lines.push(pick(['L\'adversaire rend les armes.', 'Abandon adverse : la victoire est nette.'], 20));
      else if (byTime) lines.push(pick(['La pendule fait le reste : victoire au temps.', 'Vous gérez mieux le temps et l\'emportez à la pendule.'], 21));
      else lines.push(pick(['Victoire au bout de l\'effort.', 'Le point est pour vous.'], 22));
    } else if (userLost) {
      if (byMate) lines.push(pick(['Sanction finale : échec et mat — repérez la menace plus tôt.', 'Mat au bout : anticipez ce motif la prochaine fois.'], 23));
      else if (byTime && isFastTc) lines.push(pick(['Le drapeau tombe — fréquent en cadence rapide.', 'Défaite au temps, typique du jeu rapide : jouez plus vite les coups simples.'], 24));
      else if (byTime) lines.push(pick(['Défaite au temps : accélérez dans les positions claires.', 'La pendule finit par vous rattraper.'], 25));
      else if (byResign) lines.push(pick(['Position devenue intenable, l\'abandon s\'imposait.', 'Plus rien à sauver : l\'abandon était logique.'], 26));
      else lines.push(pick(['Défaite serrée — les détails ont fait la différence.', 'Le point vous échappe de peu.'], 27));
    } else if (isDraw && !usedCrit) {
      lines.push(pick(['Partage des points au terme d\'une partie équilibrée.', 'Match nul : les chances se sont neutralisées.'], 28));
    }

    return lines.length > 0 ? lines.slice(0, 4).join(' ') : 'Consultez les moments clés ci-dessous pour le détail de la partie.';
  }

  function truncateText(text, max) {
    if (text.length <= max) return text;
    const cut = text.lastIndexOf(' ', max);
    return text.substring(0, cut > 0 ? cut : max) + '…';
  }

  // Turning-point banner: one focused card highlighting the single most decisive
  // moment (your biggest swing), with a primary "Rejouer ce coup" drill and a
  // secondary "Voir l'échiquier". Consolidates the old stacked tip/blunder cards.
  function gradeWord(a) {
    return a >= 90 ? 'Excellent' : a >= 80 ? 'Très bon' : a >= 70 ? 'Bon' : a >= 55 ? 'Correct' : a >= 40 ? 'Fragile' : 'Difficile';
  }

  // Chess.com's timeClass keys, derived from a PGN TimeControl header, so we can
  // compare a game against the right slice of your history (daily accuracy is
  // inflated by the long thinking time and shouldn't be mixed with rapid).
  function gameTimeClass(header) {
    const tc = header.TimeControl || '';
    if (tc.includes('/') || tc.includes('86400') || tc.includes('172800')) return 'daily';
    const secs = tcSeconds(tc);
    if (!secs) return 'autre';
    if (secs < 180) return 'bullet';
    if (secs < 600) return 'blitz';
    return 'rapid';
  }
  const TC_FR = { daily: 'journalières', rapid: 'rapides', blitz: 'blitz', bullet: 'bullet', autre: '' };

  // "vs your usual level": where this game's accuracy sits in YOUR own accuracy
  // distribution for the same format. Calibrated on your games (Coach data),
  // not a fabricated Elo — accuracy doesn't reliably map to a rating.
  function buildLevelIndicator(header, myAcc, isUserGame) {
    const el = $('#acc-hero-elo');
    if (!el) return;
    el.textContent = '';
    el.className = 'acc-elo';
    if (!isUserGame || typeof Coach === 'undefined' || !Coach.accuracyBaseline) return;
    const fmt = gameTimeClass(header);
    Coach.accuracyBaseline().then(byFmt => {
      const samples = (byFmt && byFmt[fmt]) || [];
      if (samples.length < 5) return; // not enough of your history in this format
      const below = samples.filter(a => a < myAcc).length;
      const pct = Math.round(below / samples.length * 100);
      const mean = samples.reduce((s, a) => s + a, 0) / samples.length;
      let tag, cls;
      if (myAcc >= mean + 3) { tag = 'Au-dessus de ta moyenne'; cls = 'rel-up'; }
      else if (myAcc <= mean - 3) { tag = 'Sous ta moyenne'; cls = 'rel-down'; }
      else { tag = 'Dans ta moyenne'; cls = 'rel-mid'; }
      el.className = 'acc-elo ' + cls;
      el.textContent = `${tag} · mieux que ${pct}% de tes parties ${TC_FR[fmt] || fmt}`;
    }).catch(() => {});
  }

  function buildAccuracyHero(header, summary) {
    const hero = $('#verdict-strip');
    if (!summary || !summary.engineUsed) { hero.hidden = true; return; }
    const s = summary.stats;
    const user = detectUser(header);
    const uw = user === 'w';
    let myAcc, oppAcc, myLabel, oppLabel;
    if (user) {
      myAcc = (uw ? s.w : s.b).accuracy; oppAcc = (uw ? s.b : s.w).accuracy;
      myLabel = 'Ta précision'; oppLabel = 'Adversaire';
    } else {
      myAcc = s.w.accuracy; oppAcc = s.b.accuracy;
      myLabel = 'Blancs'; oppLabel = 'Noirs';
    }
    buildLevelIndicator(header, myAcc, !!user);

    const C = 2 * Math.PI * 25; // ring circumference (r=25)
    const ring = $('#acc-fill-ring');
    ring.setAttribute('stroke-dasharray', `${(myAcc / 100 * C).toFixed(1)} ${C.toFixed(1)}`);
    const col = myAcc >= 75 ? 'var(--success)' : myAcc >= 55 ? 'var(--accent)' : 'var(--danger)';
    ring.style.stroke = col;
    $('#acc-hero-num').textContent = myAcc;
    $('#acc-hero-label').textContent = myLabel;
    const grade = $('#acc-hero-grade');
    grade.textContent = gradeWord(myAcc);
    grade.style.color = col;
    $('#acc-opp-label').textContent = oppLabel;
    $('#acc-opp-num').textContent = oppAcc;
    // Dire à quel effort moteur ce chiffre a été obtenu. L'analyse serveur
    // cherche à depth 20, celle du navigateur à ~1,5 s par position : les deux
    // précisions ne sont pas comparables, et rien ne le disait.
    const eff = $('#acc-hero-effort');
    if (eff) {
      const e = summary.engineEffort || '';
      const quick = /movetime/.test(e);
      eff.textContent = quick ? 'analyse rapide' : e ? 'analyse complète' : '';
      eff.hidden = !e;
    }

    // Les pastilles de comptage remontent ici : elles etaient le contenu de la
    // carte « Resume de la partie », en bas du deuxieme onglet, alors qu'elles
    // repondent a la meme question que la jauge (« ca s'est bien passe ? »).
    // On ne garde que ce qui compte cote user, le detail par camp reste en bas.
    const marks = $('#vst-marks');
    if (marks) {
      const mine = user ? (uw ? s.w : s.b) : s.w;
      const bits = [];
      if (mine.blunders) bits.push(`<span class="vm vm-blunder">${mine.blunders} gaffe${mine.blunders > 1 ? 's' : ''}</span>`);
      if (mine.mistakes) bits.push(`<span class="vm vm-mistake">${mine.mistakes} erreur${mine.mistakes > 1 ? 's' : ''}</span>`);
      if (mine.misses) bits.push(`<span class="vm vm-miss">${mine.misses} manqué${mine.misses > 1 ? 's' : ''}</span>`);
      if (mine.inaccuracies) bits.push(`<span class="vm">${mine.inaccuracies} imprécision${mine.inaccuracies > 1 ? 's' : ''}</span>`);
      if (mine.brilliants) bits.unshift(`<span class="vm vm-good">${mine.brilliants} brillant${mine.brilliants > 1 ? 's' : ''}</span>`);
      if (!bits.length) bits.push('<span class="vm vm-good">aucune erreur</span>');
      marks.innerHTML = bits.join('');
    }
    hero.hidden = false;
  }


  // Les trois verdicts : phase, rythme, type d'erreur. Une ligne chacun, le
  // detail au clic. Ils remplacent quatre cartes toujours depliees (« Profil
  // d'erreurs », « Ton rythme », « Pression du temps », et la precision par
  // phase noyee dans le resume), soit environ deux ecrans de defilement.
  function buildVerdicts(header, analysis, summary) {
    const sec = $('#verdicts-sec');
    const list = $('#verdicts-list');
    if (!sec || !list) return;
    list.innerHTML = '';
    const rows = [];

    // 1. La phase. Le chiffre affiche est la phase la plus faible.
    if (currentPhaseAccs && currentPhaseAccs.length > 1) {
      const user = detectUser(header);
      const side = user || 'w';
      const ranges = { 'Ouverture': [0, 20], 'Milieu': [20, 50], 'Finale': [50, analysis.length] };
      const acplOf = (label) => {
        const [a, b] = ranges[label] || [0, analysis.length];
        let sum = 0, n = 0;
        for (let i = a; i < Math.min(b, analysis.length); i++) {
          const r = analysis[i];
          if (!r.move || r.move.color !== side) continue;
          sum += (r.cpLoss || 0); n++;
        }
        return n ? Math.round(sum / n) : null;
      };
      const sorted = currentPhaseAccs.slice().sort((a, b) => a.acc - b.acc);
      const worst = sorted[0], top = sorted[sorted.length - 1];
      const spread = top.acc - worst.acc;

      // La perte moyenne par coup est donnee PHASE PAR PHASE, sans en deduire de
      // direction : elle ne suit pas toujours la precision (l'une compte des
      // centiemes de pion, l'autre des chances de gain, qui saturent des que la
      // position est perdue). Une premiere version affirmait « ta perte passe de
      // 338 a 161 dans ta phase faible », soit l'inverse du chiffre montre.
      const acpls = currentPhaseAccs.map(p => ({ label: p.label, v: acplOf(p.label) })).filter(a => a.v !== null);
      let body = 'Ta précision par phase, sur tes coups uniquement.';
      if (acpls.length)
        body += ` Perte moyenne par coup : ${acpls.map(a => `${a.label.toLowerCase()} <b>${a.v}</b>`).join(', ')} centièmes.`;
      body += '<div class="bars">' + currentPhaseAccs.map(p => {
        const col = p.acc >= 75 ? 'var(--success)' : p.acc >= 55 ? 'var(--accent)' : 'var(--danger)';
        return `<div class="brow"><span class="bl">${p.label}</span><span class="bt"><i style="width:${p.acc}%;background:${col}"></i></span><span class="bv">${p.acc}</span></div>`;
      }).join('') + '</div>';

      const detail = currentPhaseAccs.map(p => `${p.label.toLowerCase()} ${p.acc}%`).join(', ') + '.';
      const PH_FR = { 'Ouverture': "l'ouverture", 'Milieu': 'le milieu de jeu', 'Finale': 'la finale' };
      rows.push({
        icon: '🎯',
        head: spread < 8
          ? `<b>Précision homogène</b> d'un bout à l'autre : ${detail}`
          : `<b>Ça se joue dans ${PH_FR[worst.label] || worst.label.toLowerCase()}.</b> ${detail}`,
        num: worst.acc,
        tone: worst.acc >= 75 ? 'ok' : worst.acc >= 60 ? 'warn' : 'bad',
        body, open: true,
      });
    }

    // 2. Le rythme = « Ton rythme » + « Pression du temps » en un seul bloc.
    const pace = paceStats(header, analysis);
    const tt = timeTroubleStats(header, analysis);
    if (pace || tt) {
      let body = (pace ? pace.html : '');
      if (tt) body += tt.html;
      if (pace && tt && tt.errorRate30 > tt.comfortErrorRate + 15)
        body += `<div class="tt-insight">Tu fais <b>${tt.errorRate30}%</b> d'erreurs en zeitnot contre <b>${tt.comfortErrorRate}%</b> en temps confortable : c'est la pendule, pas le niveau.</div>`;
      rows.push({
        icon: '⏱',
        head: pace ? pace.head : `<b>${tt.movesUnder30} coups joués sous 30 s</b>, dont ${tt.movesUnder10} sous 10 s.`,
        num: pace ? pace.num : tt.movesUnder30,
        tone: pace ? pace.tone : 'bad', body,
      });
    }

    // 3. Le type d'erreur, avec la sortie vers l'exercice qui le corrige.
    const mist = mistakeStats(header, analysis);
    if (mist) rows.push({
      icon: '♞', head: mist.head, num: mist.num, tone: mist.tone,
      body: mist.html, drill: mist.drill,
    });

    if (!rows.length) { sec.hidden = true; return; }

    for (const v of rows) {
      const d = document.createElement('details');
      d.className = 'verdict';
      if (v.open) d.open = true;
      d.innerHTML =
        `<summary>
           <span class="vd-ico">${v.icon}</span>
           <span class="vd-txt">${v.head}</span>
           <span class="vd-num ${v.tone || ''}">${v.num}</span>
           <span class="vd-chev">▸</span>
         </summary>
         <div class="vd-body">${v.body}</div>`;
      if (v.drill === 'vigilance' && typeof Training !== 'undefined') {
        const b = document.createElement('button');
        b.className = 'pill pill-gold';
        b.textContent = '🎯 Entraîner la vigilance';
        b.addEventListener('click', () => Training.show('vigilance'));
        d.querySelector('.vd-body').appendChild(b);
      }
      d.querySelectorAll('.pace-chip, .tt-move-row').forEach(el =>
        el.addEventListener('click', () => userNav(+el.dataset.goto)));
      list.appendChild(d);
    }
    const cnt = $('#verdicts-count');
    if (cnt) cnt.textContent = rows.length + (rows.length > 1 ? ' verdicts' : ' verdict');
    sec.hidden = false;
  }

  // Recolte les moments candidats de la partie (roque, mat, promotion, gaffes,
  // coups manques, brillants, grosses captures) avec leur libelle et leur
  // description deja redigee. Le rendu est dans buildMoments.
  function collectMoments(header, analysis) {
    const candidates = [];
    const user = detectUser(header);

    for (let i = 0; i < analysis.length; i++) {
      const r = analysis[i];
      if (!r.move) continue;
      const moveNum = Math.floor(i / 2) + 1;
      const dot = i % 2 === 0 ? '.' : '...';
      const label = `${moveNum}${dot} ${r.sanFr}`;
      const isWhite = r.move.color === 'w';
      const isUserMove = user && ((user === 'w' && isWhite) || (user === 'b' && !isWhite));
      const side = isUserMove ? 'vous' : (isWhite ? 'les Blancs' : 'les Noirs');
      const sideCapital = isUserMove ? 'Vous' : (isWhite ? 'Les Blancs' : 'Les Noirs');

      const badgeSuffix = user ? (isUserMove ? '' : ' adverse') : '';

      if (r.move.san === 'O-O' || r.move.san === 'O-O-O') {
        const sideRoque = r.move.san === 'O-O' ? 'côté roi' : 'côté dame';
        const desc = isUserMove
          ? `Vous roquez ${sideRoque} — bon réflexe pour mettre votre roi en sécurité.`
          : user
            ? `Votre adversaire roque ${sideRoque}.`
            : `${sideCapital} roquent ${sideRoque}, mettant le roi en sécurité.`;
        candidates.push({ index: i, label, score: 3, desc, badge: 'Bon coup' + badgeSuffix, badgeClass: 'bon-coup', isUserMove, user, isWhite });
      }

      if (i === analysis.length - 1 && (header.Result === '1-0' || header.Result === '0-1')) {
        const termLower = (header.Termination || '').toLowerCase();
        if (termLower.includes('checkmate') || termLower.includes('mat') || r.san.includes('#')) {
          const desc = isUserMove
            ? 'Échec et mat ! Belle conclusion.'
            : user
              ? 'Échec et mat par votre adversaire.'
              : `Échec et mat ! ${sideCapital} concluent la partie.`;
          candidates.push({ index: i, label, score: 20, desc, badge: 'Moment clé', badgeClass: 'moment-cle', isUserMove, user, isWhite });
        }
      }

      if (r.move.promotion) {
        const desc = isUserMove
          ? 'Vous promouvez un pion en dame — moment décisif, bien amené !'
          : user
            ? 'Promotion adverse en dame — danger !'
            : 'Promotion du pion en dame — un moment décisif.';
        candidates.push({ index: i, label, score: 12, desc, badge: 'Moment clé', badgeClass: 'moment-cle', isUserMove, user, isWhite });
      }

      if (r.type === 'blunder') {
        const prevDiff = i > 0 ? analysis[i - 1].materialDiff : 0;
        const swing = Math.abs(r.materialDiff - prevDiff);
        let desc = truncateText(r.tipFr.replace(/<[^>]*>/g, ''), 200);
        if (isUserMove) desc += ' À retenir pour la prochaine fois.';
        else if (user) desc += ' Une erreur adverse à exploiter !';
        candidates.push({ index: i, label, score: 10 + swing, desc, badge: 'Gaffe' + badgeSuffix, badgeClass: 'gaffe', isUserMove, user, isWhite });
      }

      if (r.type === 'miss') {
        let desc = truncateText(r.tipFr.replace(/<[^>]*>/g, ''), 200);
        if (isUserMove) desc += ' Un gain à ne pas laisser passer.';
        candidates.push({ index: i, label, score: 11, desc, badge: 'Coup manqué' + badgeSuffix, badgeClass: 'miss', isUserMove, user, isWhite });
      }

      if (r.type === 'inaccuracy') {
        let desc = truncateText(r.tipFr.replace(/<[^>]*>/g, ''), 200);
        candidates.push({ index: i, label, score: 4, desc, badge: 'Imprécision' + badgeSuffix, badgeClass: 'imprecision', isUserMove, user, isWhite });
      }

      if (r.type === 'mistake') {
        let desc = truncateText(r.tipFr.replace(/<[^>]*>/g, ''), 200);
        if (isUserMove) desc += ' Un point à travailler.';
        candidates.push({ index: i, label, score: 6, desc, badge: 'Erreur' + badgeSuffix, badgeClass: 'erreur', isUserMove, user, isWhite });
      }

      if (r.type === 'brilliant') {
        let desc = truncateText(r.tipFr.replace(/<[^>]*>/g, ''), 200);
        if (isUserMove) desc += ' Impressionnant !';
        candidates.push({ index: i, label, score: 15, desc, badge: 'Brillant !' + badgeSuffix, badgeClass: 'brillant', isUserMove, user, isWhite });
      }

      if ((r.type === 'good' || r.type === 'great' || r.type === 'best') && r.move.captured) {
        const capturedVal = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[r.move.captured] || 0;
        if (capturedVal >= 5) {
          let desc = truncateText(r.tipFr.replace(/<[^>]*>/g, ''), 200);
          if (isUserMove) desc += ' Bien vu !';
          else if (user) desc += ' Aïe, un coup douloureux pour vous.';
          candidates.push({ index: i, label, score: 8 + capturedVal, desc, badge: 'Bon coup' + badgeSuffix, badgeClass: isUserMove ? 'bon-coup' : 'gaffe', isUserMove, user, isWhite });
        }
      }
    }

    // Le rapport parle de TON jeu : a score voisin, tes coups passent devant
    // ceux de l'adversaire. Sans ce biais, deux gains manques par l'adversaire
    // (score 11 chacun) sortaient avant ta propre gaffe decisive.
    candidates.forEach(c => { if (c.isUserMove) c.score += 5; });
    candidates.sort((a, b) => b.score - a.score);

    const seen = new Set();
    const picks = [];
    for (const c of candidates) {
      if (seen.has(c.index)) continue;
      seen.add(c.index);
      picks.push(c);
      if (picks.length >= 4) break;
    }
    return picks;
  }

  // Les moments de la partie. Remplace TROIS blocs qui racontaient le meme
  // evenement : la carte « Le tournant » (onglet Conseil), la carte « Moments
  // cles » (onglet Analyse) et le bloc « Moment cle » de la carte resume. Le
  // tournant n'est plus une carte a part : c'est le premier moment, badge.
  function buildMoments(header, analysis) {
    const sec = $('#moments-sec');
    const list = $('#moments-list');
    if (!sec || !list) return;
    const picks = collectMoments(header, analysis);
    currentMoments = picks;
    if (!picks.length) { sec.hidden = true; return; }

    // Le tournant = la pire erreur DU JOUEUR, au sens de l'ancien
    // buildTurningPoint (gravite, puis perte de chances de gain).
    let turning = null, best = -1;
    for (const p of picks) {
      const r = analysis[p.index];
      if (!p.isUserMove && p.user) continue;
      if (r.type !== 'blunder' && r.type !== 'mistake' && r.type !== 'inaccuracy' && r.type !== 'miss') continue;
      const w = r.type === 'blunder' ? 3 : r.type === 'mistake' ? 2 : 1;
      const sc = w * 1000 + (r.winPctLoss || 0) * 100 + (r.cpLoss || 0) / 100;
      if (sc > best) { best = sc; turning = p; }
    }

    // Le tournant d'abord (c'est la reponse a « pourquoi j'ai perdu »), puis
    // les autres dans l'ordre de la partie : on relit l'histoire.
    const ordered = picks.slice().sort((a, b) =>
      (a === turning ? -1 : b === turning ? 1 : a.index - b.index));

    list.innerHTML = '';
    for (const p of ordered) {
      const r = analysis[p.index];
      const meta = MOVE_CLASS[r.type];
      const item = document.createElement('div');
      item.className = 'moment ' + p.badgeClass + (p === turning ? ' moment-turning' : '');

      const loss = r.cpLoss ? (r.cpLoss / 100) : 0;
      const lossTxt = loss >= 0.5 ? `<span class="mo-loss">−${loss.toFixed(1)}</span>` : '';
      const tag = p === turning ? '<span class="mo-tag">LE TOURNANT</span>' : '';

      item.innerHTML =
        `<span class="mo-dot"></span>
         <div class="mo-body">
           <div class="mo-head"><b>${p.label}</b>${markSpan(r.type)} ${lossTxt} ${tag}
             <span class="mo-badge">${p.badge.toLowerCase()}</span></div>
           <p class="mo-desc">${truncateText(p.desc, 145)}</p>
           <div class="mo-acts"></div>
         </div>`;

      const acts = item.querySelector('.mo-acts');
      const add = (txt, cls, fn) => {
        const b = document.createElement('button');
        b.className = 'pill ' + cls;
        b.textContent = txt;
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        acts.appendChild(b);
      };
      // Pas de bouton « Voir la position » : toute la carte y mene (le titre de
      // section le dit). Chaque pastille en trop, c'est une ligne de plus par
      // carte sur un telephone.
      if (p.isUserMove && typeof GuessMove !== 'undefined')
        add('Rejouer ce coup', p === turning ? 'pill-gold' : 'pill-ghost',
          () => GuessMove.start(analysis, header, currentUser, { indices: [p.index], title: '🎯 ' + p.label }));
      if (p === turning && p.isUserMove && typeof Replay !== 'undefined' && r.fenBefore && r.bestUci)
        add('▶ vs Stockfish', 'pill-ghost', () => Replay.start({
          fenBefore: r.fenBefore, bestUci: r.bestUci, bestSan: r.bestSan,
          playedSan: r.sanFr || r.san, tip: r.tipFr || '', ply: p.index,
        }));

      item.addEventListener('click', () => userNav(p.index + 1));
      list.appendChild(item);
    }
    sec.hidden = false;
  }

  function classifyMistake(r, analysis, idx) {
    if (!r.move) return null;
    const m = r.move;
    const tags = [];

    if (m.captured) {
      const attackerVal = PIECE_VALUES[m.piece] || 0;
      const capturedVal = PIECE_VALUES[m.captured] || 0;
      if (attackerVal > capturedVal + 1) tags.push('bad-exchange');
      else tags.push('capture-error');
    } else {
      const fenBefore = r.fenBefore || (idx > 0 ? analysis[idx - 1]?.fen : null);
      if (fenBefore) {
        try {
          const g = new Chess(fenBefore);
          g.move(m.san, { sloppy: true });
          const oppMoves = g.moves({ verbose: true });
          const forks = oppMoves.filter(om => om.captured);
          const bigCaptures = forks.filter(om => (PIECE_VALUES[om.captured] || 0) >= 3);
          if (bigCaptures.length > 0) {
            tags.push('hanging-piece');
          }
        } catch (_) {}
      }
      if (tags.length === 0) {
        if (r.cpLoss && r.cpLoss > 150 && !m.captured) tags.push('positional');
        else tags.push('tactical');
      }
    }

    if (idx < 20) tags.push('opening');
    else if (idx >= 50) tags.push('endgame');
    else tags.push('middlegame');

    return tags;
  }

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // Le profil d'erreurs : renvoie une phrase de tete + le diagnostic complet.
  // Avant, la carte empilait jusqu'a six blocs de diagnostic de meme poids, et
  // aucun ne debouchait sur un exercice.
  function mistakeStats(header, analysis) {
    const user = detectUser(header);
    if (!user) return null;

    const errors = [];
    for (let i = 0; i < analysis.length; i++) {
      const r = analysis[i];
      if (!r.move) continue;
      const isUser = (user === 'w' && r.move.color === 'w') || (user === 'b' && r.move.color === 'b');
      if (!isUser) continue;
      if (r.type !== 'blunder' && r.type !== 'mistake' && r.type !== 'inaccuracy') continue;
      const tags = classifyMistake(r, analysis, i);
      if (!tags) continue;
      const moveNum = Math.floor(i / 2) + 1;
      const dot = i % 2 === 0 ? '.' : '...';
      errors.push({ index: i, moveNum, dot, r, tags, severity: r.type });
    }

    if (errors.length === 0) return null;

    const tactical = errors.filter(e => e.tags.includes('hanging-piece') || e.tags.includes('bad-exchange') || e.tags.includes('capture-error') || e.tags.includes('tactical'));
    const positional = errors.filter(e => e.tags.includes('positional'));
    const byPhase = { opening: 0, middlegame: 0, endgame: 0 };
    for (const e of errors) {
      if (e.tags.includes('opening')) byPhase.opening++;
      else if (e.tags.includes('endgame')) byPhase.endgame++;
      else byPhase.middlegame++;
    }

    const hanging = errors.filter(e => e.tags.includes('hanging-piece'));
    const badExch = errors.filter(e => e.tags.includes('bad-exchange'));

    let html = '';

    const weakestPhase = byPhase.opening >= byPhase.middlegame && byPhase.opening >= byPhase.endgame ? 'opening'
      : byPhase.endgame >= byPhase.middlegame ? 'endgame' : 'middlegame';
    const phaseNames = { opening: 'l\'ouverture', middlegame: 'le milieu de partie', endgame: 'la finale' };
    const blunders = errors.filter(e => e.severity === 'blunder');

    html += `<div class="mistake-diagnosis">`;

    if (errors.length <= 2) {
      html += `<div class="diagnosis-card positive"><div class="diagnosis-icon">✓</div><div class="diagnosis-text"><b>Partie solide</b> — seulement ${errors.length} imprécision${errors.length > 1 ? 's' : ''}. Continuez comme ça !</div></div>`;
    } else {
      const phasePct = Math.round(100 * Math.max(byPhase.opening, byPhase.middlegame, byPhase.endgame) / errors.length);
      html += `<div class="diagnosis-card weakness"><div class="diagnosis-icon">📍</div><div class="diagnosis-text"><b>Phase la plus fragile : ${phaseNames[weakestPhase]}</b> — ${phasePct}% de vos erreurs y sont concentrées (${Math.max(byPhase.opening, byPhase.middlegame, byPhase.endgame)}/${errors.length}).</div></div>`;
    }

    if (hanging.length >= 2) {
      html += `<div class="diagnosis-card pattern"><div class="diagnosis-icon">👁</div><div class="diagnosis-text"><b>Pièces laissées en prise</b> (${hanging.length}×) — Avant chaque coup, demandez-vous : « est-ce que ma pièce est défendue ? Mon adversaire peut-il la capturer ? » Entraînez-vous avec des exercices de visualisation.</div></div>`;
    } else if (badExch.length >= 2) {
      html += `<div class="diagnosis-card pattern"><div class="diagnosis-icon">⚖️</div><div class="diagnosis-text"><b>Échanges défavorables</b> (${badExch.length}×) — Vous donnez plus de valeur que vous n'en recevez. Avant de capturer, comptez : Cavalier/Fou = 3, Tour = 5, Dame = 9.</div></div>`;
    }

    if (tactical.length > positional.length && errors.length >= 3) {
      html += `<div class="diagnosis-card training"><div class="diagnosis-icon">🎯</div><div class="diagnosis-text"><b>Profil tactique</b> — La majorité de vos erreurs sont des ratés tactiques (fourchettes, clouages, enfilades). Conseil : faites 10-15 puzzles tactiques par jour sur Lichess ou Chess.com.</div></div>`;
    } else if (positional.length > tactical.length && errors.length >= 3) {
      html += `<div class="diagnosis-card training"><div class="diagnosis-icon">🧭</div><div class="diagnosis-text"><b>Profil positionnel</b> — Vos erreurs viennent surtout de mauvais plans ou d'une structure de pions affaiblie. Conseil : étudiez les parties de joueurs positionnels (Karpov, Carlsen) et les principes de structure.</div></div>`;
    }

    if (blunders.length >= 2) {
      const blunderMoves = blunders.slice(0, 3).map(e => `${e.moveNum}${e.dot} ${e.r.move.san}`);
      html += `<div class="diagnosis-card blunder"><div class="diagnosis-icon">⚡</div><div class="diagnosis-text"><b>${blunders.length} gaffe${blunders.length > 1 ? 's' : ''}</b> (${blunderMoves.join(', ')}) — Ce sont des erreurs graves. Adoptez un « check mental » avant chaque coup : menaces adverses, pièces non défendues, échecs possibles.</div></div>`;
    }

    if (weakestPhase === 'opening' && byPhase.opening >= 3) {
      html += `<div class="diagnosis-card training"><div class="diagnosis-icon">📖</div><div class="diagnosis-text"><b>À travailler : les ouvertures</b> — ${byPhase.opening} erreurs dans les 10 premiers coups. Apprenez 1-2 ouvertures en profondeur plutôt que beaucoup en surface. Jouez-les en bullet pour les mémoriser.</div></div>`;
    } else if (weakestPhase === 'endgame' && byPhase.endgame >= 2) {
      html += `<div class="diagnosis-card training"><div class="diagnosis-icon">📖</div><div class="diagnosis-text"><b>À travailler : les finales</b> — ${byPhase.endgame} erreurs en fin de partie. Commencez par les finales de base : Roi+Tour vs Roi, Roi+Pion vs Roi, puis les finales de Tours.</div></div>`;
    }

    if (currentPgn) {
      const clocks = currentClocks;
      const times = Analyzer.clocksToTimePerMove(clocks, currentIncrement);
      if (times.length >= analysis.length * 0.5) {
        const errorTimes = errors.map(e => times[e.index] || 0).filter(t => t > 0);
        const allUserTimes = [];
        for (let i = 0; i < Math.min(times.length, analysis.length); i++) {
          const r = analysis[i];
          if (r.move && ((user === 'w' && r.move.color === 'w') || (user === 'b' && r.move.color === 'b'))) {
            if (times[i] > 0) allUserTimes.push(times[i]);
          }
        }
        if (errorTimes.length > 0 && allUserTimes.length > 0) {
          const avgErrorTime = Math.round(errorTimes.reduce((a, b) => a + b, 0) / errorTimes.length);
          const avgAllTime = Math.round(allUserTimes.reduce((a, b) => a + b, 0) / allUserTimes.length);
          const lateErrors = errors.filter(e => e.index >= analysis.length * 0.7).length;
          if (avgErrorTime < avgAllTime * 0.6) {
            html += `<div class="diagnosis-card tempo"><div class="diagnosis-icon">⏱</div><div class="diagnosis-text"><b>Erreurs de vitesse</b> — Vos gaffes arrivent sur des coups joués vite (${avgErrorTime}s vs ${avgAllTime}s en moyenne). Quand la position se complique, forcez-vous à ralentir.</div></div>`;
          } else if (avgErrorTime > avgAllTime * 1.5) {
            html += `<div class="diagnosis-card tempo"><div class="diagnosis-icon">⏱</div><div class="diagnosis-text"><b>Paralysie d'analyse</b> — Vos erreurs arrivent quand vous réfléchissez longtemps (${avgErrorTime}s vs ${avgAllTime}s). Trop de calcul nuit — faites confiance à vos premiers instincts plus souvent.</div></div>`;
          } else if (lateErrors >= errors.length * 0.6 && errors.length >= 2) {
            html += `<div class="diagnosis-card tempo"><div class="diagnosis-icon">⏱</div><div class="diagnosis-text"><b>Fatigue de fin de partie</b> — ${Math.round(100 * lateErrors / errors.length)}% de vos erreurs arrivent dans le dernier tiers. Gérez mieux votre temps et restez concentré en finale.</div></div>`;
          }
        }
      }
    }

    html += `</div>`;

    // La phrase de tete : le motif dominant, pas la liste.
    let head, num;
    if (hanging.length >= 2) {
      head = `<b>${hanging.length} pièces laissées en prise</b> sur ${errors.length} erreurs : c'est du matériel, pas des plans.`;
      num = `${hanging.length}/${errors.length}`;
    } else if (badExch.length >= 2) {
      head = `<b>${badExch.length} échanges défavorables</b> : tu donnes plus que tu ne reçois.`;
      num = `${badExch.length}/${errors.length}`;
    } else if (blunders.length) {
      head = `<b>${blunders.length} gaffe${blunders.length > 1 ? 's' : ''}</b>, surtout dans ${phaseNames[weakestPhase]}.`;
      num = blunders.length;
    } else if (errors.length <= 2) {
      head = `<b>Partie solide</b> : ${errors.length} imprécision${errors.length > 1 ? 's' : ''} et rien de grave.`;
      num = errors.length;
    } else {
      head = `<b>${errors.length} erreurs</b>, concentrées dans ${phaseNames[weakestPhase]}.`;
      num = errors.length;
    }
    const drill = hanging.length >= 2 || blunders.length >= 2 ? 'vigilance' : null;
    return { head, num, html, tone: errors.length <= 2 ? 'ok' : 'bad', drill };
  }

  // Engine eval from White's perspective, shown as a compact signed pill.
  function formatEval(r) {
    if (r.mate !== undefined && r.mate !== null) return 'M' + Math.abs(r.mate);
    if (r.eval === undefined || r.eval === null) return '';
    const p = r.eval / 100;
    return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(1);
  }



  function buildSummary(summary, analysis) {
    const s = summary.stats;
    const pillsHtml = (side) => {
      let pills = '';
      if (side.brilliants) pills += `<span class="stat-pill brilliant">${side.brilliants} brillant${side.brilliants !== 1 ? 's' : ''}</span>`;
      if (side.great) pills += `<span class="stat-pill great">${side.great} excellent${side.great !== 1 ? 's' : ''}</span>`;
      if (side.best) pills += `<span class="stat-pill best">${side.best} meilleur${side.best !== 1 ? 's' : ''}</span>`;
      if (side.excellent) pills += `<span class="stat-pill excellent">${side.excellent} très bien</span>`;
      if (side.good) pills += `<span class="stat-pill good">${side.good} bon${side.good !== 1 ? 's' : ''}</span>`;
      if (side.book) pills += `<span class="stat-pill book">${side.book} théorique${side.book !== 1 ? 's' : ''}</span>`;
      if (side.inaccuracies) pills += `<span class="stat-pill inaccuracy">${side.inaccuracies} imprécision${side.inaccuracies !== 1 ? 's' : ''}</span>`;
      if (side.misses) pills += `<span class="stat-pill miss">${side.misses} coup${side.misses !== 1 ? 's' : ''} manqué${side.misses !== 1 ? 's' : ''}</span>`;
      // Les zeros ne s'affichent plus : « 0 erreurs 0 gaffes » occupait deux
      // pastilles pour ne rien dire.
      if (side.mistakes) pills += `<span class="stat-pill mistake">${side.mistakes} erreur${side.mistakes !== 1 ? 's' : ''}</span>`;
      if (side.blunders) pills += `<span class="stat-pill blunder">${side.blunders} gaffe${side.blunders !== 1 ? 's' : ''}</span>`;
      if (!side.mistakes && !side.blunders) pills += `<span class="stat-pill good">aucune erreur</span>`;
      return pills;
    };
    let html = `
      <div class="summary-row">
        <span class="side-label">⚪</span>
        <div class="stat-pills">${pillsHtml(s.w)}</div>
      </div>
      <div class="summary-row">
        <span class="side-label">⚫</span>
        <div class="stat-pills">${pillsHtml(s.b)}</div>
      </div>`;
    if (summary.engineUsed) {
      html += `<div class="engine-badge">Analyse Stockfish${summary.engineEffort ? ' · ' + summary.engineEffort : ''} · 3 variantes</div>`;
    }

    // Le bloc « Moment cle » a ete retire d'ici : c'etait la TROISIEME fois que
    // la meme position etait racontee dans l'ecran (avec « Le tournant » et
    // « Moments cles »). Elle vit maintenant une seule fois, dans les moments.

    $('#summary-content').innerHTML = html;

    $$('.km-move[data-goto]').forEach(el => {
      el.addEventListener('click', () => userNav(+el.dataset.goto));
    });
  }



  // The opposite of time trouble: playing a 10-min game at blitz speed. Most
  // beginner blunders here are played in seconds with a nearly-full clock —
  // this card makes that visible and hammers the one rule that fixes it.
  // Le rythme : renvoie le materiau du verdict au lieu de remplir une carte.
  // « Ton rythme » (onglet Conseil) et « Pression du temps » (onglet Analyse)
  // etaient deux cartes distinctes, dans deux onglets differents, et la premiere
  // renvoyait a la seconde par ecrit (« regarde la carte plus bas »).
  function paceStats(header, analysis) {
    if (currentClocks.length < 4) return null;
    const user = detectUser(header);
    if (!user) return null;

    const clocks = currentClocks;
    const times = Analyzer.clocksToTimePerMove(clocks, currentIncrement);
    const tc = header.TimeControl || '';
    if (tc.includes('/')) return null; // journalier : pas de rythme a gerer
    const base = parseInt(tc) || 0;
    if (!base || base > 3600) return null;

    let userMoves = 0, spentTotal = 0, lastClock = base;
    const fastErrors = [];
    for (let i = 0; i < Math.min(clocks.length, analysis.length); i++) {
      const r = analysis[i];
      if (!r.move || r.move.color !== user) continue;
      userMoves++;
      const remaining = clocks[i];
      const spent = i >= 2 ? (times[i] || 0) : 0;
      spentTotal += spent;
      if (typeof remaining === 'number') lastClock = remaining;
      const isError = r.type === 'blunder' || r.type === 'mistake';
      if (isError && spent < 15 && remaining > base / 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const dot = i % 2 === 0 ? '.' : '...';
        fastErrors.push({ index: i, label: `${moveNum}${dot} ${r.sanFr}`, spent: Math.round(spent), remaining, type: r.type });
      }
    }
    if (userMoves < 4) return null;

    const mmss = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
    const avgSpent = Math.round(spentTotal / Math.max(1, userMoves - 1));

    // Le titre du verdict : une phrase, le chiffre qui la porte a droite.
    let head, num, tone;
    if (fastErrors.length) {
      const worst = fastErrors[0];
      head = `<b>Tu joues vite quand il faut réfléchir.</b> ${fastErrors.length === 1 ? 'Une erreur jouée' : fastErrors.length + ' erreurs jouées'} en moins de 15 s avec ${mmss(worst.remaining)} au compteur.`;
      num = fastErrors.length; tone = 'bad';
    } else if (avgSpent < 12 && lastClock > base * 0.4) {
      head = `<b>${avgSpent} s par coup</b> et ${mmss(lastClock)} inutilisées à la fin : ton temps est une arme, dépense-le.`;
      num = avgSpent + 's'; tone = 'warn';
    } else if (lastClock < 30) {
      head = `<b>Tu as fini à ${Math.round(lastClock)} s.</b> La fin de partie s'est jouée à la pendule.`;
      num = Math.round(lastClock) + 's'; tone = 'bad';
    } else {
      head = `<b>Bon équilibre :</b> ${avgSpent} s par coup, ${mmss(lastClock)} de réserve à la fin.`;
      num = avgSpent + 's'; tone = 'ok';
    }

    let html = `<div class="pace-stats">
      <div class="pace-stat"><span class="pace-val">${mmss(Math.min(spentTotal, base))}</span><span class="pace-lbl">utilisé sur ${mmss(base)}</span></div>
      <div class="pace-stat"><span class="pace-val">${avgSpent}s</span><span class="pace-lbl">par coup</span></div>
      <div class="pace-stat"><span class="pace-val">${mmss(lastClock)}</span><span class="pace-lbl">restant à la fin</span></div>
    </div>`;

    if (fastErrors.length) {
      html += `<div class="pace-chips">` + fastErrors.slice(0, 4).map(f =>
        `<button class="pace-chip" data-goto="${f.index + 1}">${f.label} · ${f.spent}s <span class="pace-chip-clk">(${mmss(f.remaining)} restants)</span></button>`
      ).join('') + `</div>`;
    }
    html += `<div class="pace-rule">📏 <b>Règle d'or :</b> après le coup 4, jamais moins de 15 secondes par coup. Échecs, Captures, Menaces — puis joue.</div>`;

    return { head, num, tone, html };
  }

  // La pression du temps : meme principe, on renvoie le HTML au verdict.
  function timeTroubleStats(header, analysis) {
    if (currentClocks.length < 4) return null;

    const clocks = currentClocks;

    const times = Analyzer.clocksToTimePerMove(clocks, currentIncrement);
    const user = detectUser(header);
    if (!user) return null;

    const tc = header.TimeControl || '';
    let initialTime = 0;
    if (tc.includes('+')) initialTime = parseInt(tc);
    else if (tc.includes('/')) initialTime = parseInt(tc.split('/')[1] || tc);

    const troubleMoves = [];
    let movesUnder30 = 0, movesUnder10 = 0, errorsUnder30 = 0;
    let totalUserMoves = 0;

    for (let i = 0; i < Math.min(clocks.length, analysis.length); i++) {
      const r = analysis[i];
      if (!r.move) continue;
      const isUser = (user === 'w' && r.move.color === 'w') || (user === 'b' && r.move.color === 'b');
      if (!isUser) continue;
      totalUserMoves++;

      const remaining = clocks[i];
      const timeSpent = times[i] || 0;
      const isError = r.type === 'blunder' || r.type === 'mistake' || r.type === 'inaccuracy';

      if (remaining <= 30) {
        movesUnder30++;
        if (isError) errorsUnder30++;
        if (remaining <= 10) movesUnder10++;

        if (isError) {
          const moveNum = Math.floor(i / 2) + 1;
          const dot = i % 2 === 0 ? '.' : '...';
          troubleMoves.push({
            index: i,
            label: `${moveNum}${dot} ${r.sanFr}`,
            remaining: Math.round(remaining),
            timeSpent: Math.round(timeSpent),
            type: r.type
          });
        }
      }
    }

    if (movesUnder30 === 0) return null;

    const errorRate30 = movesUnder30 > 0 ? Math.round(100 * errorsUnder30 / movesUnder30) : 0;

    let html = '<div class="tt-summary">';
    html += `<div class="tt-stat warn"><span class="tt-val">${movesUnder30}</span><span class="tt-label">coups < 30s</span></div>`;
    html += `<div class="tt-stat"><span class="tt-val">${movesUnder10}</span><span class="tt-label">coups < 10s</span></div>`;
    html += `<div class="tt-stat"><span class="tt-val">${errorRate30}%</span><span class="tt-label">erreurs en zeitnot</span></div>`;
    html += '</div>';

    const comfortMoves = totalUserMoves - movesUnder30;
    const comfortErrors = (analysis.filter((r, i) => {
      if (!r.move) return false;
      const isUser = (user === 'w' && r.move.color === 'w') || (user === 'b' && r.move.color === 'b');
      if (!isUser) return false;
      if (i >= clocks.length) return false;
      return clocks[i] > 30 && (r.type === 'blunder' || r.type === 'mistake' || r.type === 'inaccuracy');
    })).length;
    const comfortErrorRate = comfortMoves > 0 ? Math.round(100 * comfortErrors / comfortMoves) : 0;

    const zones = [
      { label: 'Confortable (>30s)', count: comfortMoves, color: 'var(--success)' },
      { label: 'Zeitnot (10-30s)', count: movesUnder30 - movesUnder10, color: 'var(--warning)' },
      { label: 'Critique (<10s)', count: movesUnder10, color: 'var(--danger)' }
    ].filter(z => z.count > 0);

    if (zones.length > 0) {
      html += '<div class="tt-zone-bar">';
      for (const z of zones) {
        const pct = Math.round(100 * z.count / totalUserMoves);
        if (pct > 0) html += `<div class="tt-zone-seg" style="width:${pct}%;background:${z.color}" title="${z.label}: ${z.count}"></div>`;
      }
      html += '</div>';
      html += '<div class="tt-zone-legend">';
      for (const z of zones) html += `<span><span class="leg-dot" style="background:${z.color}"></span>${z.label} (${z.count})</span>`;
      html += '</div>';
    }

    if (troubleMoves.length > 0) {
      html += '<div class="tt-moves">';
      for (const tm of troubleMoves.slice(0, 5)) {
        const badgeClass = tm.type === 'blunder' ? '' : 'mistake';
        const badgeLabel = tm.type === 'blunder' ? 'Gaffe' : tm.type === 'mistake' ? 'Erreur' : 'Imprécision';
        html += `<div class="tt-move-row" data-goto="${tm.index + 1}">`;
        html += `<span class="tt-move-label">${tm.label}</span>`;
        html += `<span class="tt-move-time">${tm.remaining}s restantes</span>`;
        html += `<span class="tt-move-badge ${badgeClass}">${badgeLabel}</span>`;
        html += '</div>';
      }
      html += '</div>';
    }

    if (errorRate30 > comfortErrorRate + 15) {
      html += `<div class="tt-insight">Vous faites <b>${errorRate30}%</b> d'erreurs en zeitnot contre <b>${comfortErrorRate}%</b> en temps confortable. La pression du temps dégrade nettement votre jeu — essayez de garder une réserve de temps pour les moments critiques.</div>`;
    } else if (movesUnder10 >= 3) {
      html += `<div class="tt-insight">Vous avez joué <b>${movesUnder10} coups avec moins de 10 secondes</b>. En cadence rapide, anticipez davantage pour éviter la panique en fin de partie.</div>`;
    } else if (movesUnder30 >= 5) {
      html += `<div class="tt-insight">Vous passez beaucoup de temps en zeitnot (<b>${movesUnder30} coups sous 30s</b>). Travaillez la gestion du temps dès le milieu de partie.</div>`;
    }

    return { html, movesUnder30, movesUnder10, errorRate30, comfortErrorRate };
  }

  const PIECE_SYMBOLS = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕' };




  function buildPlanRecognition(header, analysis) {
    const card = $('#plan-card');
    const content = $('#plan-content');
    card.hidden = true;
    if (analysis.length < 6) return;

    const user = detectUser(header);
    const rawPhases = [
      { name: 'Ouverture', icon: '📖', from: 0, to: Math.min(20, analysis.length) },
      { name: 'Milieu de partie', icon: '⚔️', from: 20, to: Math.min(50, analysis.length) },
      { name: 'Finale', icon: '🏁', from: 50, to: analysis.length }
    ].filter(p => p.from < analysis.length);

    const phases = [];
    for (const p of rawPhases) {
      let userMoves = 0;
      for (let i = p.from; i < p.to; i++) {
        const r = analysis[i];
        if (r.move && ((user === 'w' && r.move.color === 'w') || (user === 'b' && r.move.color === 'b') || !user)) userMoves++;
      }
      if (userMoves < 3 && phases.length > 0) {
        phases[phases.length - 1].to = p.to;
      } else {
        phases.push({ ...p });
      }
    }

    let html = '';
    let hasContent = false;

    for (const phase of phases) {
      const wActions = { kingsideAttack: 0, queensideAttack: 0, centralControl: 0, development: 0, kingSafety: 0, pawnPush: 0, pieceActivity: 0, exchanges: 0, pawnBreaks: [], doubledRooks: 0, bishopPair: 0, kingSafetyErosion: 0, spaceAdvantage: 0 };
      const bActions = { kingsideAttack: 0, queensideAttack: 0, centralControl: 0, development: 0, kingSafety: 0, pawnPush: 0, pieceActivity: 0, exchanges: 0, pawnBreaks: [], doubledRooks: 0, bishopPair: 0, kingSafetyErosion: 0, spaceAdvantage: 0 };
      let wMoveCount = 0, bMoveCount = 0;

      for (let i = phase.from; i < phase.to; i++) {
        const r = analysis[i];
        if (!r.move) continue;
        const m = r.move;
        const a = m.color === 'w' ? wActions : bActions;
        if (m.color === 'w') wMoveCount++; else bMoveCount++;
        const toFile = m.to.charCodeAt(0) - 97;
        const toRank = parseInt(m.to[1]);
        const advancedRank = m.color === 'w' ? toRank >= 5 : toRank <= 4;

        if (m.san === 'O-O' || m.san === 'O-O-O') {
          a.kingSafety += 3;
        }
        if (m.captured) {
          a.exchanges++;
        }
        if ((m.piece === 'n' || m.piece === 'b') && i < 20) {
          a.development += 2;
        }
        if (m.piece === 'p' && (toFile >= 0 && toFile <= 2)) {
          a.queensideAttack += (advancedRank ? 2 : 1);
        }
        if (m.piece === 'p' && (toFile >= 5 && toFile <= 7)) {
          a.kingsideAttack += (advancedRank ? 2 : 1);
        }
        if (m.piece === 'p' && toFile >= 3 && toFile <= 4) {
          a.centralControl += 2;
        }
        if ((m.piece === 'q' || m.piece === 'r' || m.piece === 'b') && toFile >= 5 && advancedRank) {
          a.kingsideAttack += 2;
        }
        if ((m.piece === 'q' || m.piece === 'r' || m.piece === 'b') && toFile <= 2 && advancedRank) {
          a.queensideAttack += 2;
        }
        if ((m.piece === 'n' || m.piece === 'b' || m.piece === 'q') && toFile >= 2 && toFile <= 5 && advancedRank) {
          a.pieceActivity += 2;
        }
        if (m.piece === 'r') {
          a.pieceActivity++;
        }
        if (m.piece === 'k' && phase.name === 'Finale') {
          a.centralControl++;
          a.pieceActivity++;
        }
        if (m.piece === 'p' && advancedRank) {
          a.pawnPush++;
        }

        if (m.piece === 'p' && m.captured && advancedRank) {
          const breakFile = String.fromCharCode(97 + toFile);
          if (toFile >= 3 && toFile <= 4) {
            a.pawnBreaks.push({ file: breakFile, type: 'central', label: `rupture centrale ${breakFile}${toRank}` });
          } else if (toFile <= 2) {
            a.pawnBreaks.push({ file: breakFile, type: 'queenside', label: `attaque de minorité ${breakFile}${toRank}` });
          } else {
            a.pawnBreaks.push({ file: breakFile, type: 'kingside', label: `percée ${breakFile}${toRank}` });
          }
        }

        if (r.fen) {
          const fenBoard = r.fen.split(' ')[0];
          const rookFiles = { w: [], b: [] };
          const rows = fenBoard.split('/');
          for (let rank = 0; rank < 8; rank++) {
            let file = 0;
            for (const ch of rows[rank]) {
              if (ch >= '1' && ch <= '8') { file += +ch; continue; }
              if (ch === 'R') rookFiles.w.push(file);
              if (ch === 'r') rookFiles.b.push(file);
              file++;
            }
          }
          const side = m.color === 'w' ? rookFiles.w : rookFiles.b;
          if (side.length === 2 && side[0] === side[1]) a.doubledRooks++;

          if (m.color === 'w') {
            let space = 0;
            for (let rank = 0; rank < 4; rank++) {
              let file = 0;
              for (const ch of rows[rank]) {
                if (ch >= '1' && ch <= '8') { file += +ch; continue; }
                if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) space++;
                file++;
              }
            }
            a.spaceAdvantage = Math.max(a.spaceAdvantage, space);
          } else {
            let space = 0;
            for (let rank = 4; rank < 8; rank++) {
              let file = 0;
              for (const ch of rows[rank]) {
                if (ch >= '1' && ch <= '8') { file += +ch; continue; }
                if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) space++;
                file++;
              }
            }
            a.spaceAdvantage = Math.max(a.spaceAdvantage, space);
          }

          if (m.piece === 'p') {
            const isKingsidePawn = toFile >= 5;
            const isShieldPush = m.color === 'w' ? (toRank >= 3 && toRank <= 4 && isKingsidePawn) : (toRank <= 6 && toRank >= 5 && isKingsidePawn);
            if (isShieldPush) {
              const opp = m.color === 'w' ? bActions : wActions;
              opp.kingSafetyErosion++;
            }
          }
        }
      }

      const phaseFen = phase.to > 0 && analysis[phase.from] ? analysis[phase.from].fen : null;
      const wPlan = describePlan(wActions, wMoveCount, phase.name, 'w', user, phaseFen);
      const bPlan = describePlan(bActions, bMoveCount, phase.name, 'b', user, phaseFen);

      if (!wPlan.text && !bPlan.text) continue;
      hasContent = true;

      const moveRange = `coups ${Math.floor(phase.from / 2) + 1}–${Math.floor((phase.to - 1) / 2) + 1}`;
      html += `<div class="plan-phase">`;
      html += `<div class="plan-phase-header"><span class="plan-phase-icon">${phase.icon}</span><span class="plan-phase-title">${phase.name}</span><span class="plan-phase-moves">${moveRange}</span></div>`;
      if (wPlan.text) {
        const label = user === 'w' ? 'Vous' : (user === 'b' ? 'Adversaire' : 'Blancs');
        html += `<div class="plan-side"><span class="plan-side-icon">⚪</span><span class="plan-side-text"><b>${label}</b> — ${wPlan.text}`;
        if (wPlan.coaching) html += `<br><span class="plan-coaching">💡 ${wPlan.coaching}</span>`;
        html += `</span></div>`;
      }
      if (bPlan.text) {
        const label = user === 'b' ? 'Vous' : (user === 'w' ? 'Adversaire' : 'Noirs');
        html += `<div class="plan-side"><span class="plan-side-icon">⚫</span><span class="plan-side-text"><b>${label}</b> — ${bPlan.text}`;
        if (bPlan.coaching) html += `<br><span class="plan-coaching">💡 ${bPlan.coaching}</span>`;
        html += `</span></div>`;
      }
      html += '</div>';
    }

    if (!hasContent) return;
    content.innerHTML = html;
    card.hidden = false;
  }

  function analyzeStructure(fen) {
    if (!fen) return {};
    const board = fen.split(' ')[0];
    const rows = board.split('/');
    const pawns = { w: [], b: [] };
    const pieces = { w: { n: 0, b: 0, r: 0, q: 0 }, b: { n: 0, b: 0, r: 0, q: 0 } };
    let wKingFile = -1, bKingFile = -1, wKingRank = -1, bKingRank = -1;

    for (let rank = 0; rank < 8; rank++) {
      let file = 0;
      for (const ch of rows[rank]) {
        if (ch >= '1' && ch <= '8') { file += +ch; continue; }
        const actualRank = 8 - rank;
        if (ch === 'P') pawns.w.push({ file, rank: actualRank });
        else if (ch === 'p') pawns.b.push({ file, rank: actualRank });
        else if (ch === 'K') { wKingFile = file; wKingRank = actualRank; }
        else if (ch === 'k') { bKingFile = file; bKingRank = actualRank; }
        else if (ch === ch.toUpperCase() && 'NBRQ'.includes(ch)) pieces.w[ch.toLowerCase()]++;
        else if (ch === ch.toLowerCase() && 'nbrq'.includes(ch)) pieces.b[ch]++;
        file++;
      }
    }

    const result = {};
    for (const side of ['w', 'b']) {
      const sp = pawns[side];
      const fileCounts = {};
      for (const p of sp) { fileCounts[p.file] = (fileCounts[p.file] || 0) + 1; }

      const doubled = Object.values(fileCounts).filter(c => c > 1).length;
      const files = sp.map(p => p.file);
      let isolated = 0;
      for (const f of Object.keys(fileCounts).map(Number)) {
        if (!files.includes(f - 1) && !files.includes(f + 1)) isolated++;
      }
      const passed = sp.filter(p => {
        const opp = pawns[side === 'w' ? 'b' : 'w'];
        return !opp.some(op => Math.abs(op.file - p.file) <= 1 && (side === 'w' ? op.rank > p.rank : op.rank < p.rank));
      }).length;

      const hasBishopPair = pieces[side].b >= 2;
      const kf = side === 'w' ? wKingFile : bKingFile;
      const kr = side === 'w' ? wKingRank : bKingRank;
      const castled = side === 'w' ? (kf >= 5 && kr === 1) || (kf <= 2 && kr === 1) : (kf >= 5 && kr === 8) || (kf <= 2 && kr === 8);
      const kingCentral = kf >= 2 && kf <= 5 && (side === 'w' ? kr >= 3 : kr <= 6);

      result[side] = { doubled, isolated, passed, hasBishopPair, castled, kingCentral, pieces: pieces[side] };
    }

    const centerPawns = { w: pawns.w.filter(p => p.file >= 3 && p.file <= 4).length, b: pawns.b.filter(p => p.file >= 3 && p.file <= 4).length };
    const lockedCenter = pawns.w.some(p => p.file >= 3 && p.file <= 4 && pawns.b.some(bp => bp.file === p.file && Math.abs(bp.rank - p.rank) === 1));
    result.centerType = lockedCenter ? 'closed' : (centerPawns.w + centerPawns.b <= 1) ? 'open' : 'semi-open';

    return result;
  }

  function getStructureCoaching(structure, color, phaseName) {
    const s = structure[color];
    const opp = structure[color === 'w' ? 'b' : 'w'];
    if (!s) return null;
    const tips = [];

    if (structure.centerType === 'closed' && phaseName !== 'Ouverture') {
      tips.push('Centre fermé → manœuvrez sur les ailes, les cavaliers sont rois');
    }
    if (structure.centerType === 'open' && phaseName !== 'Ouverture') {
      tips.push('Centre ouvert → les fous et les tours dominent, contrôlez les colonnes');
    }
    if (s.isolated > 0 && phaseName !== 'Ouverture') {
      tips.push(`Pion${s.isolated > 1 ? 's' : ''} isolé${s.isolated > 1 ? 's' : ''} → compensez par l'activité des pièces`);
    }
    if (s.doubled > 0 && phaseName !== 'Ouverture') {
      tips.push('Pions doublés → évitez les finales de pions pures');
    }
    if (s.passed > 0 && phaseName === 'Finale') {
      tips.push(`Pion passé → poussez-le ! Soutenez avec le roi`);
    }
    if (s.hasBishopPair && phaseName !== 'Ouverture') {
      tips.push('Paire de fous → ouvrez la position pour maximiser leur portée');
    }
    if (s.kingCentral && phaseName === 'Finale') {
      tips.push('Roi actif au centre — excellent en finale');
    }
    if (!opp.castled && phaseName === 'Milieu de partie') {
      tips.push('Roi adverse non roqué → ouvrez le centre pour l\'attaquer');
    }

    return tips.length > 0 ? tips[0] : null;
  }

  function describePlan(actions, moveCount, phaseName, color, user, phaseFen) {
    const parts = [];
    const density = (key) => moveCount > 0 ? actions[key] / moveCount : 0;
    const sorted = Object.entries(actions)
      .filter(([k, v]) => typeof v === 'number' && v > 0)
      .sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0 && actions.pawnBreaks.length === 0) return { text: '', coaching: null };

    const top = sorted.slice(0, 3).map(([k]) => k);

    if (phaseName === 'Ouverture') {
      if (top.includes('development')) parts.push('développement des pièces');
      if (top.includes('kingSafety')) parts.push('mise en sécurité du roi');
      if (top.includes('centralControl')) parts.push('contrôle du centre');
      if (parts.length === 0 && top.includes('kingsideAttack')) parts.push('poussée sur l\'aile roi');
      if (parts.length === 0 && top.includes('queensideAttack')) parts.push('expansion à l\'aile dame');
      if (parts.length === 0) parts.push('mise en place');
    } else if (phaseName === 'Finale') {
      if (density('pawnPush') > 0.2) parts.push('course à la promotion');
      if (top.includes('centralControl') || top.includes('pieceActivity')) parts.push('activation du roi');
      if (density('exchanges') > 0.25) parts.push('simplification');
      if (parts.length === 0) parts.push('technique de finale');
    } else {
      if (density('kingsideAttack') > 0.3 && actions.kingsideAttack > actions.queensideAttack) {
        parts.push('attaque sur l\'aile roi');
      } else if (density('queensideAttack') > 0.3 && actions.queensideAttack > actions.kingsideAttack) {
        parts.push('attaque sur l\'aile dame');
      } else if (density('kingsideAttack') > 0.2 && density('queensideAttack') > 0.2) {
        parts.push('jeu sur les deux ailes');
      }
      if (density('centralControl') > 0.3) parts.push('domination du centre');
      if (density('pieceActivity') > 0.3) parts.push('activité des pièces');
      if (density('exchanges') > 0.25 && parts.length < 2) parts.push('échanges systématiques');
      if (density('pawnPush') > 0.2 && parts.length < 2) parts.push('poussée de pions');
    }

    if (actions.pawnBreaks.length > 0 && parts.length < 3) {
      const uniqueBreaks = [...new Map(actions.pawnBreaks.map(b => [b.label, b])).values()];
      parts.push(uniqueBreaks.slice(0, 2).map(b => b.label).join(', '));
    }

    if (actions.doubledRooks >= 2 && parts.length < 3) {
      parts.push('tours doublées sur colonne ouverte');
    }

    if (actions.kingSafetyErosion >= 2 && parts.length < 3) {
      parts.push('affaiblissement du roque adverse');
    }

    if (actions.spaceAdvantage >= 8 && parts.length < 3) {
      parts.push('avantage d\'espace');
    }

    if (parts.length === 0) return { text: '', coaching: null };

    const structure = phaseFen ? analyzeStructure(phaseFen) : null;
    const coaching = structure ? getStructureCoaching(structure, color, phaseName) : null;

    return { text: parts.join(', ') + '.', coaching };
  }


  async function probeEndgameTablebase(analysis) {
    const card = $('#tablebase-card');
    const content = $('#tablebase-content');
    card.hidden = true;

    const tbResults = [];
    for (let i = analysis.length - 1; i >= 0 && i >= analysis.length - 20; i--) {
      const r = analysis[i];
      if (!r.fen) continue;
      const pieces = r.fen.split(' ')[0].replace(/[0-9/]/g, '');
      if (pieces.length > 7 || pieces.length < 3) continue;

      const tb = await Analyzer.probeTablebase(r.fen);
      if (!tb || tb.category === undefined) continue;

      const moveNum = Math.floor(i / 2) + 1;
      const dot = i % 2 === 0 ? '.' : '...';
      tbResults.push({ index: i, moveNum, dot, san: r.sanFr, fen: r.fen, category: tb.category, dtm: tb.dtm, dtz: tb.dtz, bestmove: tb.moves?.[0] });

      if (tbResults.length >= 3) break;
    }

    if (tbResults.length === 0) return;

    const catLabels = { 'win': 'Gain forcé', 'cursed-win': 'Gain théorique', 'draw': 'Nulle théorique', 'blessed-loss': 'Perte théorique', 'loss': 'Perte forcée', 'unknown': '?' };

    let html = '';
    for (const r of tbResults.reverse()) {
      const label = catLabels[r.category] || r.category;
      const badgeClass = r.category === 'win' || r.category === 'cursed-win' ? 'bon-coup' : r.category === 'draw' ? 'neutre' : 'gaffe';
      const dtzInfo = r.dtz != null ? ` (DTZ: ${Math.abs(r.dtz)})` : '';
      html += `<div class="tb-result" data-goto="${r.index + 1}">
        <span class="highlight-move">${r.moveNum}${r.dot} ${r.san}</span>
        <span class="highlight-desc">${pieces7(r)} — ${label}${dtzInfo}</span>
        <span class="highlight-badge ${badgeClass}">${label}</span>
      </div>`;
    }

    const firstFen = tbResults[0]?.fen;
    if (firstFen) {
      const tip = endgameTip(firstFen);
      if (tip) html += `<div class="tb-tip">📖 ${tip}</div>`;
    }

    content.innerHTML = html;
    card.hidden = false;

    content.querySelectorAll('.tb-result').forEach(el => {
      el.addEventListener('click', () => userNav(+el.dataset.goto));
    });
  }

  function pieces7(tbResult) {
    if (!tbResult.fen) return 'Position à ≤7 pièces';
    const board = tbResult.fen.split(' ')[0];
    const counts = { w: '', b: '' };
    const order = ['K','Q','R','B','N','P'];
    for (const p of order) {
      const wCount = (board.match(new RegExp(p, 'g')) || []).length;
      for (let i = 0; i < wCount; i++) counts.w += p;
      const lp = p.toLowerCase();
      const bCount = (board.match(new RegExp(lp, 'g')) || []).length;
      for (let i = 0; i < bCount; i++) counts.b += lp;
    }
    return `${counts.w} vs ${counts.b}`;
  }

  function endgameTip(fen) {
    const board = fen.split(' ')[0];
    const pieces = { K: 0, Q: 0, R: 0, B: 0, N: 0, P: 0, k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 };
    for (const ch of board) { if (pieces[ch] !== undefined) pieces[ch]++; }
    const w = { k: pieces.K, q: pieces.Q, r: pieces.R, b: pieces.B, n: pieces.N, p: pieces.P };
    const b = { k: pieces.k, q: pieces.q, r: pieces.r, b: pieces.b, n: pieces.n, p: pieces.p };
    const wTotal = w.q + w.r + w.b + w.n + w.p;
    const bTotal = b.q + b.r + b.b + b.n + b.p;

    if (wTotal === 0 && bTotal === 0) return 'Roi contre Roi — nulle théorique. Aucun camp ne peut mater.';
    if ((wTotal === 1 && w.r === 1 && bTotal === 0) || (bTotal === 1 && b.r === 1 && wTotal === 0))
      return 'Roi + Tour vs Roi — gain forcé. Poussez le roi adverse au bord de l\'échiquier en formant une « barrière » avec la tour.';
    if ((wTotal === 1 && w.q === 1 && bTotal === 0) || (bTotal === 1 && b.q === 1 && wTotal === 0))
      return 'Roi + Dame vs Roi — gain forcé. Attention au pat ! Approchez votre roi et forcez le mat au bord.';
    if ((wTotal === 1 && w.p === 1 && bTotal === 0) || (bTotal === 1 && b.p === 1 && wTotal === 0))
      return 'Roi + Pion vs Roi — la « règle du carré » et l\'opposition sont les clés. Si le roi défenseur est dans le carré du pion, c\'est nulle.';
    if ((wTotal === 2 && w.b === 2 && bTotal === 0) || (bTotal === 2 && b.b === 2 && wTotal === 0))
      return 'Roi + 2 Fous vs Roi — gain forcé. Poussez le roi adverse dans un coin en coordonnant les deux fous.';
    if ((wTotal === 2 && w.b === 1 && w.n === 1 && bTotal === 0) || (bTotal === 2 && b.b === 1 && b.n === 1 && wTotal === 0))
      return 'Roi + Fou + Cavalier vs Roi — gain forcé mais difficile. Forcez le roi dans le coin de la couleur du fou (technique connue, demande de la pratique).';
    if ((wTotal === 1 && w.b === 1 && bTotal === 0) || (bTotal === 1 && b.b === 1 && wTotal === 0))
      return 'Roi + Fou vs Roi — nulle théorique. Un fou seul ne suffit pas pour mater.';
    if ((wTotal === 1 && w.n === 1 && bTotal === 0) || (bTotal === 1 && b.n === 1 && wTotal === 0))
      return 'Roi + Cavalier vs Roi — nulle théorique. Un cavalier seul ne suffit pas pour mater.';
    if ((wTotal === 2 && w.n === 2 && bTotal === 0) || (bTotal === 2 && b.n === 2 && wTotal === 0))
      return 'Roi + 2 Cavaliers vs Roi — nulle théorique (le mat ne peut être forcé, même si c\'est possible si l\'adversaire coopère).';
    if ((wTotal === 1 && w.r === 1 && bTotal === 1 && b.r === 1) || (bTotal === 1 && b.r === 1 && wTotal === 1 && w.r === 1)) {
      if (w.p === 0 && b.p === 0) return 'Tour contre Tour — généralement nulle. La position de Lucena (« construire un pont ») et la défense de Philidor sont les deux techniques essentielles à connaître.';
    }
    if ((w.r === 1 && w.p >= 1 && bTotal === 1 && b.r === 1) || (b.r === 1 && b.p >= 1 && wTotal === 1 && w.r === 1))
      return 'Tour + Pion(s) vs Tour — finale la plus fréquente. Connaissez la position de Lucena (gain) et la défense de Philidor (nulle). Activez votre tour derrière le pion passé.';
    if ((w.q === 1 && wTotal === 1 && b.r === 1 && bTotal === 1) || (b.q === 1 && bTotal === 1 && w.r === 1 && wTotal === 1))
      return 'Dame vs Tour — la dame gagne en général, mais c\'est technique. Attention aux forts perpétuels de la tour et aux possibilités de pat.';

    if (w.p + b.p > 0 && w.q + w.r + b.q + b.r === 0 && w.b + w.n <= 1 && b.b + b.n <= 1)
      return 'Finale de pions avec pièces mineures — l\'activité du roi et la structure de pions sont décisives. Cherchez à créer un pion passé.';
    if (w.q + w.r + b.q + b.r === 0 && w.b + w.n + b.b + b.n === 0)
      return 'Finale de pions pure — le roi doit être actif ! L\'opposition (directe et à distance) est le concept clé. Cherchez à créer et pousser un pion passé.';

    return null;
  }

  function setTab(name) {
    $$('.tabbar .tab').forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      // L'onglet actif ne doit pas exister qu'en couleur : sans aria-selected,
      // un lecteur d'écran annonce quatre boutons identiques.
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function syncTabbar() {
    if ($('#screen-coach').classList.contains('active')) setTab('coach');
    else if ($('#screen-learn').classList.contains('active')) setTab('apprendre');
    else if ($('#screen-training').classList.contains('active')) setTab('entrainer');
    else setTab('analyser');
  }

  function navTo(tab) {
    if (tab === 'coach') { if (typeof Coach !== 'undefined') Coach.show(); return; }
    if (tab === 'apprendre') { showLearn(); return; }
    if (tab === 'entrainer') { if (typeof Training !== 'undefined') Training.show(); return; }
    // analyser: leave any sub-screen, show the loaded game or the import home
    $('#screen-training').classList.remove('active');
    $('#screen-coach').classList.remove('active');
    $('#screen-learn').classList.remove('active');
    if (currentAnalysis) {
      $('#screen-import').classList.remove('active');
      $('#screen-analysis').classList.add('active');
      setTab('analyser');
    } else {
      showImport();
    }
  }

  // Keep the bottom-tab highlight in sync when screens change via their own buttons.
  function wireTabSync() {
    const patch = (obj, method, after) => {
      if (!obj || typeof obj[method] !== 'function') return;
      const orig = obj[method];
      obj[method] = function () { const ret = orig.apply(obj, arguments); after(); return ret; };
    };
    if (typeof Coach !== 'undefined') { patch(Coach, 'show', () => setTab('coach')); patch(Coach, 'hide', syncTabbar); }
    if (typeof Training !== 'undefined') { patch(Training, 'show', () => setTab('entrainer')); patch(Training, 'hide', syncTabbar); }
    if (typeof Mates !== 'undefined') { patch(Mates, 'show', () => setTab('apprendre')); patch(Mates, 'close', syncTabbar); }
    // Mates/GuessMove are overlays toggling body.guess-open; re-sync the tab when one closes.
    new MutationObserver(() => { if (!document.body.classList.contains('guess-open')) syncTabbar(); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function showImport() {
    $('#screen-analysis').classList.remove('active');
    $('#screen-import').classList.add('active');
    setTab('analyser');
    loadRecent();
  }

  function showError(msg) {
    const el = $('#import-error');
    el.textContent = msg;
    el.hidden = false;
  }
  function hideError() { $('#import-error').hidden = true; }

  function saveGame(pgn, header, moveCount) {
    // Recording the game in the recents list must never throw (a full quota
    // would otherwise bubble up and abort showAnalysis, losing the analysis
    // the user just waited for).
    try {
      const games = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const entry = {
        pgn,
        white: header.White || '?',
        black: header.Black || '?',
        result: header.Result || '*',
        date: header.Date || new Date().toISOString().slice(0, 10),
        savedAt: Date.now(),
        moveCount
      };
      const dupeIdx = games.findIndex(g => g.white === entry.white && g.black === entry.black && g.date === entry.date);
      if (dupeIdx >= 0) games.splice(dupeIdx, 1);
      games.unshift(entry);
      if (games.length > 20) games.length = 20;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    } catch (_) {}
  }

  let homeBound = false;
  function bindHome() {
    if (homeBound) return;
    homeBound = true;
    const resume = $('#resume-card');
    if (resume) resume.addEventListener('click', () => {
      const games = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!games.length) return;
      $('#pgn-input').value = games[0].pgn;
      onAnalyze();
    });
    $$('.home-quick .qtile').forEach(t => t.addEventListener('click', () => {
      const nav = t.dataset.nav;
      if (nav === 'tree') { showLearn(); if (_openPanel) _openPanel('tree'); return; }
      navTo(nav);
    }));
  }

  function renderResume(g) {
    const sec = $('#resume-section');
    if (!sec) return;
    if (!g) { sec.hidden = true; return; }
    sec.hidden = false;
    const user = detectUser({ White: g.white, Black: g.black });
    const userWon = user ? ((user === 'w' && g.result === '1-0') || (user === 'b' && g.result === '0-1')) : g.result === '1-0';
    const userLost = user ? ((user === 'w' && g.result === '0-1') || (user === 'b' && g.result === '1-0')) : g.result === '0-1';
    let cls = 'draw', lbl = 'Nulle';
    if (userWon) { cls = 'win'; lbl = 'Victoire'; }
    else if (userLost) { cls = 'loss'; lbl = 'Défaite'; }
    const title = $('#resume-title'); if (title) title.textContent = `${g.white} vs ${g.black}`;
    const cached = isGameCached({ White: g.white, Black: g.black, Date: g.date }, g.moveCount);
    const meta = $('#resume-meta');
    if (meta) meta.innerHTML = `<span class="chip ${cls}">${lbl}</span><span>${formatDate(g.date)}</span>` +
      (cached ? '<span class="cached-badge">Analysé</span>' : '');
    const svg = $('#resume-board-svg');
    if (svg && typeof BoardRenderer !== 'undefined') {
      const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      let fen = START;
      try { if (typeof Chess !== 'undefined') { const c = new Chess(); if (c.load_pgn(g.pgn, { sloppy: true })) fen = c.fen(); } } catch (_) {}
      try { BoardRenderer.render(svg, fen); } catch (_) {}
    }
  }

  function loadRecent() {
    bindHome();
    const games = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const section = $('#recent-section');
    const list = $('#recent-list');
    const hint = $('#home-hint');
    if (hint) hint.hidden = games.length > 0;
    renderResume(games[0]);

    if (games.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    list.innerHTML = '';

    games.slice(0, 5).forEach((g, i) => {
      const item = document.createElement('div');
      item.className = 'recent-item';

      const user = detectUser({ White: g.white, Black: g.black });
      const userWon = user ? ((user === 'w' && g.result === '1-0') || (user === 'b' && g.result === '0-1')) : g.result === '1-0';
      const userLost = user ? ((user === 'w' && g.result === '0-1') || (user === 'b' && g.result === '1-0')) : g.result === '0-1';
      let resultClass = 'draw', resultLabel = 'Nulle';
      if (userWon) { resultClass = 'win'; resultLabel = 'Victoire'; }
      else if (userLost) { resultClass = 'loss'; resultLabel = 'Défaite'; }

      const dateStr = formatDate(g.date);
      const cached = isGameCached({ White: g.white, Black: g.black, Date: g.date }, g.moveCount);
      const cachedBadge = cached ? '<span class="cached-badge">Analysé</span>' : '';

      item.innerHTML = `
        <span class="result ${resultClass}">${resultLabel}</span>
        <span class="players">${g.white} vs ${g.black}</span>
        ${cachedBadge}
        <span class="date">${dateStr}</span>
        <button class="delete-btn" data-index="${i}" title="Supprimer">×</button>`;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) return;
        $('#pgn-input').value = g.pgn;
        onAnalyze();
      });

      list.appendChild(item);
    });

    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = +btn.dataset.index;
        const games = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        games.splice(idx, 1);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
        loadRecent();
      });
    });

    refreshHome();
  }

  function refreshHome() {
    renderRoutine();
    if (typeof Training === 'undefined') return;
    const due = Training.dueCount();
    const qb = $('#quick-train-badge');
    if (qb) { qb.hidden = !(due > 0); qb.textContent = due > 99 ? '99+' : String(due); }
    const badge = $('#tab-train-badge');
    if (!badge) return;
    badge.hidden = !(due > 0);
    badge.textContent = due > 99 ? '99+' : String(due);
  }

  // ── "Ma routine du jour" — a daily checklist that materialises the coaching
  // plan (tactics > review your games > SRS > play slow). State is per-day in
  // localStorage; completing every item feeds a day streak. ──
  const ROUTINE_ITEMS = [
    { key: 'vigilance', icon: '🛡️', label: 'Vigilance - pièces en prise',   action: 'vigilance' },
    { key: 'puzzles',   icon: '🧩', label: 'Puzzles tactiques (tes erreurs)', action: 'train', due: true },
    { key: 'convert',   icon: '🏁', label: 'Reconvertir une partie gagnée',  action: 'convert' },
    { key: 'review',    icon: '🔎', label: 'Revoir une partie',              action: 'review' },
    // Une ligne d'ouverture a reviser : sans ce rappel, une ligne lue une fois
    // etait une ligne perdue (voir la repetition espacee, srsTouch).
    { key: 'ligne',     icon: '📖', label: "Réviser une ligne d'ouverture",   action: 'ligne', dueLines: true },
    // La règle d'arrêt EST un item de la routine, pas un conseil en pied de
    // carte : ses journées à deux défaites d'affilée tombent à 44-52 % de
    // précision contre 76-81 % les bons jours. Ce n'est pas le niveau qui
    // baisse, c'est l'attention.
    { key: 'rapide',    icon: '♟️', label: 'Une partie en Rapide - <b>2 défaites d\'affilée = stop</b>', action: null },
  ];
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function routineTodayKey() { return 'chess-routine-' + isoDay(new Date()); }
  function routineState() { try { return JSON.parse(localStorage.getItem(routineTodayKey()) || '{}'); } catch (_) { return {}; } }

  function renderRoutine() {
    const list = $('#routine-list');
    if (!list) return;
    const state = routineState();
    const due = (typeof Training !== 'undefined' && Training.dueCount) ? Training.dueCount() : 0;
    list.innerHTML = '';
    ROUTINE_ITEMS.forEach(item => {
      const row = document.createElement('label');
      row.className = 'routine-item' + (state[item.key] ? ' done' : '');
      const nDue = item.dueLines ? srsDue().length : due;
      const dueTag = ((item.due || item.dueLines) && nDue > 0) ? ` <span class="routine-due">${nDue}</span>` : '';
      const launch = item.action ? '<button type="button" class="routine-go" aria-label="Ouvrir">→</button>' : '';
      row.innerHTML = `<input type="checkbox" ${state[item.key] ? 'checked' : ''}>` +
        `<span class="routine-ico">${item.icon}</span>` +
        `<span class="routine-label">${item.label}${dueTag}</span>${launch}`;
      row.querySelector('input').addEventListener('change', (e) => toggleRoutine(item.key, e.target.checked));
      const go = row.querySelector('.routine-go');
      if (go) go.addEventListener('click', (e) => { e.preventDefault(); runRoutineAction(item.action); });
      list.appendChild(row);
    });
    // Progress ring in the routine header
    const doneCount = ROUTINE_ITEMS.filter(it => state[it.key]).length;
    const total = ROUTINE_ITEMS.length;
    const num = $('#rr-num'); if (num) num.textContent = `${doneCount}/${total}`;
    const fill = $('#rr-fill');
    if (fill) {
      const C = 2 * Math.PI * 24;
      fill.style.strokeDasharray = C.toFixed(1);
      fill.style.strokeDashoffset = (C * (1 - doneCount / total)).toFixed(1);
    }
    renderStreak();
  }

  function toggleRoutine(key, checked) {
    const state = routineState();
    state[key] = checked;
    try { localStorage.setItem(routineTodayKey(), JSON.stringify(state)); } catch (_) {}
    if (ROUTINE_ITEMS.every(it => state[it.key])) bumpStreak();
    renderRoutine();
  }

  function bumpStreak() {
    const today = isoDay(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yesterday = isoDay(y);
    let s; try { s = JSON.parse(localStorage.getItem('chess-routine-streak') || '{}'); } catch (_) { s = {}; }
    if (s.date === today) return; // already counted today
    s.count = (s.date === yesterday ? (s.count || 0) : 0) + 1;
    s.date = today;
    try { localStorage.setItem('chess-routine-streak', JSON.stringify(s)); } catch (_) {}
  }

  function renderStreak() {
    const el = $('#routine-streak');
    if (!el) return;
    let s; try { s = JSON.parse(localStorage.getItem('chess-routine-streak') || '{}'); } catch (_) { s = {}; }
    const today = isoDay(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    const valid = s.date === today || s.date === isoDay(y); // streak still alive
    if (s.count > 0 && valid) { el.hidden = false; el.textContent = `🔥 ${s.count} j`; }
    else { el.hidden = true; }
  }

  function runRoutineAction(action) {
    if (action === 'train') { if (typeof Training !== 'undefined') Training.show(); return; }
    if (action === 'ligne') {
      // La branche la plus en retard d'abord ; si rien n'est du, la premiere
      // ouverture jamais ouverte, sinon le panneau des ouvertures.
      const due = srsDue().sort((a, b) => (a.e.due || 0) - (b.e.due || 0));
      if (due.length) { openOpeningByLine(due[0].line, { branch: due[0].i }); return; }
      const seen = srsAll();
      const fresh = OPENINGS.find(o => !Object.keys(seen).some(k => k.split('#')[0] === o.line));
      if (fresh) { openOpeningByLine(fresh.line); return; }
      if (_openPanel) _openPanel('openings');
      return;
    }
    if (action === 'vigilance') { if (typeof Training !== 'undefined') Training.show('vigilance'); return; }
    if (action === 'convert') { if (typeof Training !== 'undefined') Training.show('convert'); return; }
    if (action === 'review') {
      const ta = $('#pgn-input');
      if (ta) { ta.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); ta.focus(); }
    }
  }

  function formatDate(dateStr) {
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    try {
      const parts = dateStr.replace(/\./g, '-').split('-');
      if (parts.length >= 3) {
        const m = parseInt(parts[1]) - 1;
        const d = parseInt(parts[2]);
        if (m >= 0 && m < 12 && d > 0) return `${d} ${months[m]}`;
      }
    } catch (_) {}
    return dateStr;
  }

  function initGlossary() {
    const quizBtn = $('#quiz-start');
    if (quizBtn) quizBtn.addEventListener('click', startQuiz);
  }

  // ───────────────────── Check-list « Ouvertures à connaître » ─────────────────
  // Remplace l'ancien « Mon répertoire » : l'essentiel à retenir au niveau
  // débutant/intermédiaire (≈300-900), cochable et persistant, avec un lien
  // « Explorer » vers la fiche du catalogue quand elle existe.
  const CHECKLIST = [
    { group: '🧭 Les réflexes de base', items: [
      { t: `Occuper le centre dès le 1<sup>er</sup> coup (<b>1.e4</b> ou <b>1.d4</b>).` },
      { t: `Sortir les <b>cavaliers avant les fous</b>, et les diriger vers le centre (Cf3, Cc3).` },
      { t: `<b>Roquer tôt</b> (dans les 10 premiers coups) pour mettre le roi à l'abri.` },
      { t: `Ne pas sortir la <b>dame trop tôt</b> : elle se fait chasser en perdant des tempo.` },
      { t: `Ne pas bouger deux fois la même pièce en ouverture sans bonne raison.` },
    ]},
    { group: '♙ Avec les Blancs : 1.e4', items: [
      { t: `<b>Partie Italienne</b> — le plan modèle : Cf3, Fc4 (vise f7), roque, puis c3 + d4.`, line: 'e4 e5 Nf3 Nc6 Bc4' },
      { t: `Envie d'ouvrir vite le centre ? La <b>Partie Écossaise</b> (3.d4) : claire et peu théorique.`, line: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4' },
    ]},
    { group: '♟ Contre 1.e4 (avec les Noirs)', items: [
      { t: `Répondre <b>1…e5</b> et jouer en miroir (…Cc6, …Fc5/…Cf6, roque) — simple et sain.`, line: 'e4 e5 Nf3 Nc6 Bc4' },
      { t: `Option très solide, sans théorie : <b>Caro-Kann</b> (1…c6, 2…d5, sortir le fou en f5).`, line: 'e4 c6 d4 d5' },
      { t: `Option facile et répétable : <b>Scandinave</b> (1…d5).`, line: 'e4 d5 exd5 Qxd5' },
    ]},
    { group: '♛ Contre 1.d4 (avec les Noirs)', items: [
      { t: `Répondre <b>1…d5</b>, puis <b>Gambit dame refusé</b> : …e6, …Cf6, …Fe7, roque.`, line: 'd4 d5 c4 e6' },
      { t: `Reconnaître le <b>Système Londres</b> adverse (Ff4) et jouer …c5 + …Db6 sur d4/b2.`, line: 'd4 d5 Bf4' },
    ]},
    { group: '🪤 Les pièges à connaître', items: [
      { t: `<b>Mat du berger</b> (Dh5 + Fc4 sur f7) : défends par …g6 ou …De7, ne panique pas.` },
      { t: `<b>Piège de Légal</b> (Philidor) : gare au sacrifice de dame si ton fou cloue en g4.` },
      { t: `<b>Foie frit</b> / Deux Cavaliers (4.Cg5) : joue …d5 puis …Ca5, <b>pas</b> …Cxd5.`, line: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5' },
    ]},
  ];
  const CHK_KEY = 'ca_checklist_v1';
  function chkLoad() { try { return JSON.parse(localStorage.getItem(CHK_KEY) || '{}'); } catch (_) { return {}; } }
  function chkSave(s) { try { localStorage.setItem(CHK_KEY, JSON.stringify(s)); } catch (_) {} }

  function renderChecklist() {
    const host = $('#checklist-content');
    if (!host) return;
    const state = chkLoad();
    const total = CHECKLIST.reduce((n, g) => n + g.items.length, 0);
    const done = Object.values(state).filter(Boolean).length;

    let html = `<p class="chk-intro">À ton niveau, pas besoin de mémoriser des variantes : retiens <b>un plan simple par situation</b>. Coche ce que tu maîtrises, et clique sur <span class="chk-explore-inline">Explorer ↗</span> pour t'amuser à parcourir le catalogue.</p>`;
    html += `<div class="chk-progress"><div class="chk-progress-bar"><span style="width:${total ? Math.round(done / total * 100) : 0}%"></span></div><span class="chk-progress-txt">${done}/${total} maîtrisées</span><button class="chk-reset" id="chk-reset">Réinitialiser</button></div>`;

    CHECKLIST.forEach((g, gi) => {
      html += `<div class="chk-group"><h3>${g.group}</h3>`;
      g.items.forEach((it, ii) => {
        const id = `${gi}.${ii}`;
        const checked = state[id] ? 'checked' : '';
        const explore = it.line ? `<button class="chk-explore" data-line="${it.line}">Explorer ↗</button>` : '';
        html += `<label class="chk-item${checked ? ' chk-checked' : ''}"><input type="checkbox" data-id="${id}" ${checked}><span class="chk-box" aria-hidden="true"></span><span class="chk-txt">${it.t}</span>${explore}</label>`;
      });
      html += `</div>`;
    });
    host.innerHTML = html;

    host.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const s = chkLoad();
        s[cb.dataset.id] = cb.checked;
        chkSave(s);
        cb.closest('.chk-item').classList.toggle('chk-checked', cb.checked);
        const d = Object.values(s).filter(Boolean).length;
        const bar = host.querySelector('.chk-progress-bar span');
        const txt = host.querySelector('.chk-progress-txt');
        if (bar) bar.style.width = `${total ? Math.round(d / total * 100) : 0}%`;
        if (txt) txt.textContent = `${d}/${total} maîtrisées`;
      });
    });
    host.querySelectorAll('.chk-explore').forEach(btn => {
      btn.addEventListener('click', e => { e.preventDefault(); openOpeningByLine(btn.dataset.line); });
    });
    const reset = $('#chk-reset');
    if (reset) reset.addEventListener('click', () => { chkSave({}); renderChecklist(); });
  }

  let _openPanel = null;

  function initPanels() {
    const overlay = $('#panel-overlay');
    const panels = { guide: $('#panel-guide'), notation: $('#panel-notation'), concepts: $('#panel-concepts'), openings: $('#panel-openings'), tree: $('#panel-tree'), checklist: $('#panel-checklist'), technical: $('#panel-technical') };
    const btns = { guide: $('#btn-guide'), notation: $('#btn-notation'), concepts: $('#btn-concepts'), openings: $('#btn-openings'), technical: $('#btn-technical') };

    function openPanel(name) {
      if (name === 'checklist') renderChecklist();
      Object.values(panels).forEach(p => { p.hidden = true; p.classList.remove('open'); });
      overlay.hidden = false;
      requestAnimationFrame(() => {
        overlay.classList.add('visible');
        panels[name].hidden = false;
        requestAnimationFrame(() => {
          panels[name].classList.add('open');
          if (name === 'tree' && typeof OpeningTree !== 'undefined') OpeningTree.render();
        });
      });
    }

    function closeAll() {
      Object.values(panels).forEach(p => p.classList.remove('open'));
      overlay.classList.remove('visible');
      setTimeout(() => {
        Object.values(panels).forEach(p => p.hidden = true);
        overlay.hidden = true;
      }, 300);
    }

    _openPanel = openPanel;
    Object.entries(btns).forEach(([name, btn]) => {
      if (btn) btn.addEventListener('click', () => openPanel(name));
    });
    overlay.addEventListener('click', closeAll);
    $$('.panel-close').forEach(btn => btn.addEventListener('click', closeAll));
    document.addEventListener('keydown', (e) => {
      // A concept-zoom modal can layer on top of a panel; when it's open let it
      // own Escape so a single press doesn't cascade-close both at once.
      const cm = $('#concept-modal');
      if (e.key === 'Escape' && !(cm && cm.classList.contains('visible'))) closeAll();
    });
  }

  // ───────────────────────── Apprendre hub ─────────────────────────
  let learnBound = false;
  function showLearn() {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-learn').classList.add('active');
    setTab('apprendre');
    window.scrollTo(0, 0);
    if (!learnBound) {
      $('#btn-learn-back').addEventListener('click', () => { $('#screen-learn').classList.remove('active'); showImport(); });
      $$('#screen-learn .learn-tile').forEach(tile => {
        tile.addEventListener('click', () => {
          if (tile.dataset.panel === 'mats') { if (typeof Mates !== 'undefined') Mates.show(); return; }
          if (_openPanel) _openPanel(tile.dataset.panel);
        });
      });
      learnBound = true;
    }
  }

  // Tactics catalog lives in js/tactics.js (single source of truth).
  const CONCEPTS = (typeof Tactics !== 'undefined' && Tactics.CATALOG) ? Tactics.CATALOG : [];

  function initConcepts() {
    const host = $('#concepts-list');
    if (!host || typeof BoardRenderer === 'undefined') return;

    let lastCat = null, html = '', catIdx = -1;
    for (const c of CONCEPTS) {
      if (c.cat !== lastCat) { catIdx++; html += `<h4 class="concept-cat" data-cat="${catIdx}">${c.cat}</h4>`; lastCat = c.cat; }
      const diagram = c.fen
        ? `<div class="concept-diagram"><svg class="cd-board" viewBox="0 0 360 360"></svg><svg class="cd-arrows" viewBox="0 0 360 360"></svg></div>`
        : '';
      const en = c.en ? ` <span class="concept-en">${c.en}</span>` : '';
      const n = (c.puzzles && c.puzzles.length) || 0;
      // Les concepts stratégiques n'ont pas de position « à trouver » : le dire
      // dans la liste, sinon on ouvre 8 fiches sur 28 pour découvrir qu'elles
      // n'ont pas de bouton d'entraînement.
      const train = n
        ? ` <span class="concept-train" title="${n} exercice${n > 1 ? 's' : ''}">🎯 ${n}</span>`
        : (c.study ? ` <span class="concept-study" title="Concept à comprendre, sans exercice">📖 à lire</span>` : '');
      html += `<div class="concept" data-cat="${catIdx}">${diagram}<div class="concept-body"><span class="concept-name">${c.name}${en}${train}</span><p>${c.desc}</p></div></div>`;
    }
    html += `<div class="lx-empty" id="concept-empty" hidden>Aucun motif ne correspond.<br><span>Essaie « fourchette », « mat », « pion »…</span></div>`;
    host.innerHTML = html;

    const prevFlip = BoardRenderer.isFlipped();
    BoardRenderer.setFlipped(false);
    const cards = host.querySelectorAll('.concept');
    CONCEPTS.forEach((c, i) => {
      if (c.fen) {
        BoardRenderer.render(cards[i].querySelector('.cd-board'), c.fen);
        BoardRenderer.drawArrows(cards[i].querySelector('.cd-arrows'), c.arrows || []);
      }
      cards[i].addEventListener('click', () => openConceptModal(c));
    });
    BoardRenderer.setFlipped(prevFlip);

    initConceptSearch(host, cards);
    initConceptModal();
  }

  // Live filter over the motif catalog (name, English name, category, description).
  function initConceptSearch(host, cards) {
    const input = $('#concept-search'), clear = $('#concept-search-clear'), count = $('#concept-count');
    if (!input) return;
    const fold = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hay = CONCEPTS.map(c => fold([c.name, c.en, c.cat, c.desc].join(' ')).replace(/<[^>]+>/g, ''));
    const total = CONCEPTS.length;
    const heads = [...host.querySelectorAll('.concept-cat')];
    const empty = $('#concept-empty');

    const apply = () => {
      const q = fold(input.value.trim());
      clear.hidden = !q;
      const shown = new Set();
      CONCEPTS.forEach((c, i) => {
        const ok = !q || hay[i].includes(q);
        cards[i].hidden = !ok;
        if (ok) shown.add(cards[i].dataset.cat);
      });
      heads.forEach(h => { h.hidden = !!q && !shown.has(h.dataset.cat); });
      const n = CONCEPTS.filter((_, i) => !cards[i].hidden).length;
      if (empty) empty.hidden = n > 0;
      const exos = CONCEPTS.reduce((a, c) => a + ((c.puzzles && c.puzzles.length) || 0), 0);
      const study = CONCEPTS.filter(c => c.study).length;
      count.innerHTML = q
        ? `<b>${n}</b> motif${n > 1 ? 's' : ''} sur ${total}`
        : `${total} motifs — ${exos} exercices jouables${study ? ` · ${study} concepts à lire` : ''}`;
    };
    input.addEventListener('input', apply);
    clear.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; apply(); } });
    apply();
  }

  function openConceptModal(c) {
    const overlay = $('#concept-modal');
    const boardWrap = $('#concept-modal-board');
    $('#concept-modal-title').innerHTML = c.en ? `${c.name} <span class="concept-en">${c.en}</span>` : c.name;
    $('#concept-modal-text').innerHTML = c.desc;
    if (c.fen) {
      boardWrap.hidden = false;
      const prevFlip = BoardRenderer.isFlipped();
      BoardRenderer.setFlipped(false);
      BoardRenderer.render($('#cm-board'), c.fen);
      BoardRenderer.drawArrows($('#cm-arrows'), c.arrows || []);
      BoardRenderer.setFlipped(prevFlip);
    } else {
      boardWrap.hidden = true;
    }
    const actions = $('#concept-modal-actions');
    if (actions) {
      if (c.puzzles && c.puzzles.length && typeof Tactics !== 'undefined') {
        actions.hidden = false;
        const n = c.puzzles.length;
        actions.innerHTML = `<button class="concept-train-btn" id="concept-train-btn">🎯 S'entraîner — ${n} position${n > 1 ? 's' : ''}</button>`;
        $('#concept-train-btn').onclick = () => {
          overlay.classList.remove('visible'); // close the zoom modal so practice isn't behind it
          if (overlay._release) { overlay._release(); overlay._release = null; }
          Tactics.start(c.puzzles, c.name);
        };
      } else if (c.study) {
        // Pas un oubli du pipeline : ces motifs sont STRATÉGIQUES, et la base de
        // puzzles Lichess n'étiquette que des tactiques. Autant l'assumer.
        actions.hidden = false;
        actions.innerHTML = `<p class="concept-study-note">📖 Concept à comprendre, pas de position à trouver : il n'y a pas ici un coup gagnant unique, mais un plan à reconnaître. Repère-le dans tes propres parties, onglet Coach.</p>`;
      } else {
        actions.hidden = true;
        actions.innerHTML = '';
      }
    }
    overlay.classList.add('visible');
    overlay._release = trapFocus(overlay.querySelector('.concept-modal'));
  }

  function initConceptModal() {
    const overlay = $('#concept-modal');
    const close = () => {
      overlay.classList.remove('visible');
      if (overlay._release) { overlay._release(); overlay._release = null; }
    };
    $('#concept-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('visible')) {
        e.stopImmediatePropagation();
        close();
      }
    });
  }

  const OPENINGS = [
    // ── Open games: 1.e4 e5 ── the most instructive starting point for beginners
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Partie Italienne', en: 'Italian Game', eco: 'C50', side: 'w', level: '👍 Idéale pour débuter',
      line: 'e4 e5 Nf3 Nc6 Bc4',
      desc: `Le fou file en <b>c4</b> et vise tout de suite le point faible <b>f7</b>. Développement naturel, roque rapide, idées tactiques claires : c'est l'ouverture parfaite pour apprendre les principes (centre, développement, sécurité du roi).`,
      idea: `Sortir vite le cavalier en f3 et le fou en c4 pour viser f7 (la case la plus faible avant le roque), roquer, puis seulement après pousser au centre. C'est l'ouverture qui enseigne le mieux les trois principes de base.`,
      plans: { w: `Roque rapide, puis c3 + d4 pour bâtir un centre de pions ; ou le plan lent d3, Cbd2-f1-g3 (Pianissimo) avant d'attaquer.`, b: `Imiter le développement (Cf6, Fc5 ou Fe7), tenir le centre e5 et roquer à temps ; viser la rupture …d5 pour s'égaliser.` },
      structure: `Centre symétrique e4/e5, ouvert et fluide : c'est un jeu de pièces, avec peu de pions bloqués. Les erreurs se paient vite par des coups tactiques.`,
      mistakes: `Sortir la dame trop tôt, oublier de défendre f7, ou pousser les pions de l'aile roi avant d'avoir roqué.`,
      deviations: [
        { label: `2…Cf6 (au lieu de 2…Cc6)`, note: `Les Noirs jouent le Petrov et contre-attaquent e4 au lieu de défendre e5 : ce n'est plus une Italienne, mais un jeu plus symétrique.` },
        { label: `3…Fe7 (au lieu de 3…Fc5)`, note: `Fe7 (défense hongroise) est plus passif que Fc5 mais parfaitement jouable : les Noirs renoncent à la pression sur f2 contre un peu plus de solidité.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Giuoco Pianissimo', en: 'Giuoco Pianissimo', eco: 'C50', side: 'w', level: '👍 Calme et solide',
      line: 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3',
      desc: `La version tranquille de l'Italienne : on soutient le centre avec <b>d3</b> au lieu de l'ouvrir. Jeu de manœuvre lent où l'on construit patiemment son attaque. Très populaire aujourd'hui, même au plus haut niveau.`,
      idea: `« Le jeu très tranquille » : d3 soutient e4 sans ouvrir le centre. On ne cherche pas un avantage immédiat mais une position saine où la meilleure compréhension finit par payer.`,
      plans: { w: `Réarranger les pièces (c3, Cbd2-f1-g3, Fb3, Te1, h3) avant de pousser d4 ou de lancer un jeu à l'aile roi.`, b: `Plan symétrique : …d6, …a6, …Fa7, …Cf6, regrouper et préparer la rupture libératrice …d5.` },
      structure: `Centre semi-fermé e4-d3 contre e5-d6 : longue préparation avant le premier contact. C'est une partie de manœuvre, pas de tactique immédiate.`,
      mistakes: `Vouloir tout casser trop tôt : la position récompense la patience et le bon placement des pièces, pas la précipitation.`,
      deviations: [
        { label: `…d5 prématuré`, note: `Si un camp force …d5 sans l'avoir préparé, l'ouverture du centre profite presque toujours au camp le mieux développé.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Giuoco Piano', en: 'Giuoco Piano', eco: 'C53', side: 'w', level: '👍 L\'Italienne classique',
      line: 'e4 e5 Nf3 Nc6 Bc4 Bc5',
      desc: `« Le jeu tranquille » : les deux fous se font face en <b>c4</b> et <b>c5</b>, visant f7 et f2. Position symétrique et saine où l'on choisit son tempo — jeu lent (d3) ou poussée centrale (c3 + d4).`,
      idea: `Développer harmonieusement et fixer la diagonale a2-g8 sur f7. On prépare c3 pour jouer d4 et bâtir un centre de pions, ou on manœuvre lentement à la Pianissimo.`,
      plans: { w: `Choisir son tempo : c3 + d4 pour ouvrir le centre au bon moment, ou d3 et une longue manœuvre (Cbd2-f1-g3) avant de frapper.`, b: `Copier le développement (…Cf6, …d6, …O-O), contrôler d4 et viser la rupture libératrice …d5.` },
      structure: `Centre symétrique e4/e5 : jeu de pièces ouvert. Le premier à réussir sa rupture (d4 pour les Blancs, …d5 pour les Noirs) prend l'initiative.`,
      mistakes: `Jouer d4 sans préparation (…exd4 et le pion c c'est pour rien), ou négliger f2/f7 : la diagonale du fou peut devenir mortelle après un roque.`,
      deviations: [
        { label: `4.b4 (Gambit Evans)`, note: `Au lieu du calme 4.c3/4.d3, les Blancs sacrifient un pion par b4 pour chasser le fou et bâtir un centre écrasant : l'arme romantique par excellence.` },
        { label: `4.d3 (Giuoco Pianissimo)`, note: `La version très tranquille et moderne : d3 soutient e4 et l'on manœuvre longtemps avant tout contact — une partie positionnelle, pas tactique.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Gambit Evans', en: 'Evans Gambit', eco: 'C51', side: 'w', level: '⚔️ Agressif et romantique',
      line: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4',
      desc: `Un pion offert par <b>b4</b> pour gagner des tempo : après …Fxb4 c3 le fou est chassé et les Blancs jouent <b>d4</b> avec un centre écrasant et une attaque directe sur f7. L'ouverture d'attaque par excellence.`,
      idea: `Sacrifier le pion b pour gagner les tempo c3 + d4 : on construit un gros centre et on ouvre les lignes vers le roi noir avant qu'il ne se coordonne.`,
      plans: { w: `Après …Fxb4 c3, jouer d4 tout de suite, roquer et lancer l'attaque sur f7 et la colonne d ; viser Db3/Fa3 sur les points faibles.`, b: `Accepter puis rendre le pion au bon moment (…Fa5/…Fb6, …d6, …Ca5 pour échanger le Fc4), neutraliser l'attaque et garder le pion en finale.` },
      structure: `Centre de pions blanc mobile (e4-d4) contre un pion de plus noir : course entre l'attaque blanche et la consolidation noire.`,
      mistakes: `Côté noir : s'accrocher au pion et laisser filer le développement ; côté blanc : attaquer sans avoir joué d4 et roqué, l'initiative retombe alors.`,
      deviations: [
        { label: `4…Fb6 (Evans décliné)`, note: `Refuser le cadeau et garder la structure : sûr, mais les Blancs gagnent de l'espace par a4-a5 et gardent l'initiative sans avoir rien sacrifié.` },
        { label: `4…Fxb4 5.c3 Fa5 (Evans accepté)`, note: `La ligne principale : les Noirs prennent et reculent en a5 ; les Blancs jouent d4 avec un développement et un centre en compensation du pion.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Défense des deux cavaliers', en: 'Two Knights Defence', eco: 'C55', side: 'b', level: '⚔️ Combative pour les Noirs',
      line: 'e4 e5 Nf3 Nc6 Bc4 Nf6',
      desc: `Plus ambitieuse que 3…Fc5 : au lieu d'imiter, les Noirs attaquent <b>e4</b> et invitent les complications. Après <b>4.Cg5</b> le fou et le cavalier fondent sur f7 (le fameux « foie frit »), d'où des lignes très tranchantes.`,
      idea: `Contre-attaquer e4 tout de suite et accepter le jeu concret : soit rendre un pion pour un développement supérieur (…d5, …Ca5), soit contre-attaquer f2 (Traxler).`,
      plans: { w: `Choisir : 4.Cg5 pour viser f7 (mais bien calculer !), ou le sain 4.d3/4.d4 vers un jeu positionnel de type Italienne moderne.`, b: `Après 4.Cg5 d5 5.exd5, jouer …Ca5 pour chasser le fou c4 et sacrifier un pion contre une longue avance de développement et l'initiative.` },
      structure: `Souvent déséquilibrée : les Noirs donnent un pion (variante Polerio) contre du temps et l'activité — un pari concret qui exige de connaître les idées.`,
      mistakes: `Côté noir : jouer 4…Cxd5?! après 4.Cg5 d5 5.exd5 (le « foie frit » 6.Cxf7! est très dangereux) au lieu du solide 5…Ca5. Côté blanc : s'emballer avec 5.Cxf7 contre le Traxler sans calcul.`,
      deviations: [
        { label: `4.Cg5 (attaque sur f7)`, note: `Le coup tranchant : le cavalier saute en g5 pour prendre f7 avec le fou. La parade est …d5, puis …Ca5 (Polerio) — pas …Cxd5, qui invite le foie frit.` },
        { label: `4.d4 (attaque Max Lange)`, note: `Ouvrir le centre immédiatement mène à des lignes très tactiques (l'attaque Max Lange proprement dite naît de 5.O-O) : à connaître des deux côtés.` },
        { label: `4…Fc5 (contre-attaque Traxler)`, note: `Ignorer la menace sur f7 et contre-attaquer f2 ! Une ligne romantique et sauvage où les deux rois s'exposent — pleine de pièges des deux côtés.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Partie Espagnole (Ruy Lopez)', en: 'Ruy Lopez', eco: 'C60', side: 'w', level: '⭐ La référence',
      line: 'e4 e5 Nf3 Nc6 Bb5',
      desc: `Le fou cloue le cavalier <b>c6</b> qui défend le pion e5. L'une des ouvertures les plus étudiées de l'histoire : pression durable et plans stratégiques riches. Exigeante mais formatrice une fois les bases acquises.`,
      idea: `Fb5 attaque le cavalier c6, défenseur naturel de e5 : on crée une pression durable sur le centre noir, sans rien forcer. C'est la grande ouverture stratégique de référence.`,
      plans: { w: `c3 + d4 pour bâtir le centre, manœuvre Cb1-d2-f1-g3, et pression à long terme sur e5 et l'aile roi.`, b: `…a6/…b5 pour gagner de l'espace et chasser le fou, …d6, puis la rupture …d5 ou un contre-jeu sur la colonne c.` },
      structure: `Centre tendu e4 contre e5, qui reste longtemps en place : riche en plans des deux côtés, c'est l'ouverture la plus profonde théoriquement.`,
      mistakes: `Croire que 4.Fxc6 « gagne » le pion e5 : après …dxc6 5.Cxe5 Dd4 ! les Noirs récupèrent le pion et gardent la paire de fous.`,
      deviations: [
        { label: `3…Cf6 (défense berlinoise)`, note: `Mène à une finale réputée très solide pour les Noirs : un test sérieux du Ruy Lopez, popularisé par Kramnik contre Kasparov.` },
        { label: `3…a6 4.Fxc6 (variante d'échange)`, note: `Si les Blancs échangent en c6, ils acceptent de donner la paire de fous en échange d'une structure de pions noire affaiblie côté dame.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Partie Écossaise', en: 'Scotch Game', eco: 'C45', side: 'w', level: '👍 Directe',
      line: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4',
      desc: `On ouvre le centre immédiatement avec <b>d4</b>. Le jeu devient clair et tactique, sans longue théorie à mémoriser — un excellent choix pour jouer activement dès le début.`,
      idea: `Ouvrir le centre dès le 3ᵉ coup par d4 : on échange un pion central et on obtient un jeu clair et actif, sans la théorie tentaculaire du Ruy Lopez.`,
      plans: { w: `Centraliser, développer activement (Fe3/Fc4, Cc3, roque) et exploiter un léger avantage d'espace.`, b: `…Fc5 pour attaquer le cavalier d4, ou …Cf6 pour frapper e4 : un développement actif égalise sans mal.` },
      structure: `Centre ouvert dès le coup 3 : pièces actives, lignes ouvertes, parties souvent tactiques et nettes.`,
      mistakes: `Laisser le cavalier d4 se faire chasser par …Cf6/…Fc5 sans plan, ou reprendre en d4 avec la dame et l'exposer.`,
      deviations: [
        { label: `4…Fc5 contre 4…Cf6`, note: `Fc5 attaque directement le cavalier d4 ; Cf6 frappe e4. Deux égalisations correctes mais avec des plans très différents — sachez quelle position vous visez.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Gambit du Roi', en: "King's Gambit", eco: 'C30', side: 'w', level: '⚔️ Agressif',
      line: 'e4 e5 f4',
      desc: `Les Blancs <b>sacrifient un pion</b> (f4) pour ouvrir des lignes et lancer une attaque fulgurante. Romantique et tranchant, mais risqué : à essayer pour le plaisir de l'attaque, pas pour la sécurité.`,
      idea: `Sacrifier le pion f pour ouvrir la colonne f et déloger le pion e5 : on échange du matériel contre une initiative immédiate et une attaque sur f7. L'ouverture romantique par excellence.`,
      plans: { w: `Reprendre l'initiative : Cf3, Fc4, roque, et exploiter la colonne f ouverte contre f7.`, b: `Garder le pion gagné ou le rendre au bon moment pour neutraliser l'attaque, puis exploiter le roi blanc resté exposé.` },
      structure: `Aile roi blanche ouverte et durablement affaiblie : jeu très dynamique et déséquilibré, où chaque tempo compte.`,
      mistakes: `Côté noir, s'accrocher au pion à tout prix ; côté blanc, attaquer avant d'avoir développé ses pièces — l'attaque s'effondre alors faute de troupes.`,
      deviations: [
        { label: `2…Fc5 (gambit refusé)`, note: `Les Noirs déclinent : 2…Fc5 vise f2 (qui ne peut plus roquer facilement) et garde la structure intacte, en évitant toutes les complications.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Ouverture Viennoise', en: 'Vienna Game', eco: 'C25–C29', side: 'w', level: '👍 Simple et piégeuse',
      line: 'e4 e5 Nc3',
      desc: `Les Blancs développent d'abord le <b>cavalier en c3</b> pour soutenir e4, puis enchaînent souvent par <b>f4</b> (un Gambit du Roi « différé », mieux préparé). Peu de théorie, des plans clairs et quelques pièges bien connus : une excellente première ouverture d'attaque.`,
      idea: `Soutenir e4 par Cc3 avant de lancer f4 : on garde l'idée d'attaque du Gambit du Roi mais en ayant d'abord développé une pièce. Jeu sain et agressif, facile à jouer.`,
      plans: { w: `Développer (Cc3, Fc4 ou g3+Fg2), puis frapper par f4 pour ouvrir la colonne f et attaquer f7/l'aile roi.`, b: `Contester le centre par …Cf6 puis …d5 (la contre-attaque saine), ou copier avec …Cc6/…Fc5 et viser un jeu solide.` },
      structure: `Centre e4 soutenu par le cavalier c3 ; après f4, le jeu s'ouvre sur l'aile roi. Dynamique mais moins risqué que le Gambit du Roi immédiat.`,
      mistakes: `Contre 2…Cf6, jouer 3.f4 sans préparation permet 3…d5! qui égalise net. Côté noir, l'erreur classique est de laisser filer …d5 et de rester passif, ou de tomber dans le piège 3.Fc4 Cxe4?? 4.Dh5!`,
      deviations: [
        { label: `2…Cf6 (la réponse principale)`, note: `Les Noirs frappent e4 tout de suite ; ils visent la libératrice …d5. C'est la façon la plus sûre de neutraliser la Viennoise.` },
        { label: `2…Cc6 puis 3.Fc4`, note: `Jeu symétrique qui peut transposer vers une Italienne ; attention au piège 3…Cxe4?? 4.Dh5! qui regagne la pièce avec avantage.` }
      ] },
    // Deux entrees ajoutees en sept. 2026 parce qu'elles sont dans SES parties
    // et nulle part dans le catalogue : 2.Fc4 (11 parties, 38 % des points cote
    // Noirs) et 2.Dh5 (8 parties, dont un mat en 5 encaisse).
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Ouverture de l\'Évêque', en: "Bishop's Opening", eco: 'C23', side: 'b', level: '👍 À savoir recevoir',
      line: 'e4 e5 Bc4',
      desc: `Le fou sort en <b>c4</b> avant le cavalier. Rien de terrible, mais deux détails changent tout : <b>e4 n'est pas encore défendu</b>, et la dame blanche garde f3 et h5 libres pour tenter un mat du berger. La réponse est <b>2…Cf6</b>.`,
      idea: `Sortir le fou en c4 sans engager le cavalier, en gardant la dame libre pour f3 ou h5. Côté noir : …Cf6 attaque e4 (non défendu) et bloque d'avance la colonne f, ce qui tue les tentatives de mat.`,
      plans: { w: `d3 ou Cc3 pour tenir e4, puis Cf3, roque, et un jeu de type Italienne ou Viennoise.`, b: `…Cf6 tout de suite, puis …c6 et …d5 pour chasser le fou c4 et prendre le centre.` },
      structure: `Centre symétrique e4/e5 mais un développement blanc atypique : c'est un jeu de pièces où le camp le mieux développé prend le dessus rapidement.`,
      mistakes: `Répondre 2…Cc6 puis oublier la dame : après 3.Dh5, <b>Dxf7 est mat</b> et la seule parade est …g6.`,
      deviations: [
        { label: `3.Df3`, note: `Sans objet si tu as joué 2…Cf6 : le cavalier bloque la colonne f, la dame ne peut plus atteindre f7. Développe normalement.` },
        { label: `3.d3 / 3.Cc3`, note: `Les coups sains : les Blancs défendent e4 et on retombe sur un jeu d'Italienne ou de Viennoise.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Attaque Parham (2.Dh5)', en: 'Parham Attack', eco: 'C20', side: 'b', level: '🪤 Le piège à connaître',
      line: 'e4 e5 Qh5',
      desc: `La dame au 2ᵉ coup : ce n'est pas une ouverture, c'est un pari sur le <b>mat du berger</b>. Bien reçu, c'est un cadeau - la dame se fait chasser et les Blancs perdent trois temps. Trois coups à retenir : <b>…Cc6</b>, <b>…g6</b>, <b>…Cf6</b>.`,
      idea: `Attaquer e5 et f7 avec la dame dès le 2ᵉ coup en espérant Dxf7#. La réfutation ne demande aucune théorie : défendre e5 en développant, chasser la dame quand le fou arrive en c4, et bloquer la colonne f avec le cavalier.`,
      plans: { w: `Fc4 puis Df3/Db3 pour insister sur f7 ; sans mat rapide, il faut ramener la dame et jouer avec un développement en retard.`, b: `…Cc6, …g6 (seulement après Fc4), …Cf6, …Fg7, roque : quatre pièces sorties contre une dame qui a joué trois fois.` },
      structure: `Centre symétrique e4/e5. Le déséquilibre n'est pas dans les pions mais dans le <b>temps</b> : chaque coup de la dame blanche est un coup de développement noir.`,
      mistakes: `2…Cf6? abandonne e5 (3.Dxe5+ gagne un pion avec échec) et 2…g6? affaiblit f7 avant que le fou n'arrive. Et surtout : après 4.Df3, tout coup qui ne bloque pas la colonne f perd (4…Cd4?? 5.Dxf7#).`,
      deviations: [
        { label: `3.Df3 (au lieu de 3.Fc4)`, note: `La dame double sur f7 sans le fou : …Cf6 bloque la colonne et tu es déjà mieux développé.` },
        { label: `3.Fc4 g6 4.Db3`, note: `La dame garde la diagonale de f7 depuis b3. Réponds …Cf6 puis …Cd4 ! qui attaque la dame et c2.` }
      ] },
    { cat: '♙ Jeux ouverts (1.e4 e5)', name: 'Défense Petrov (Russe)', en: "Petrov's Defence", eco: 'C42', side: 'b', level: '🛡️ Solide pour les Noirs',
      line: 'e4 e5 Nf3 Nf6',
      desc: `Au lieu de défendre e5, les Noirs <b>contre-attaquent</b> aussitôt e4. Réputation de solidité et de symétrie : une défense fiable, parfois aride, qui vise l'égalité tranquille.`,
      idea: `Plutôt que de défendre e5, frapper aussitôt e4 par …Cf6 : la symétrie neutralise l'initiative blanche. Une défense de sang-froid qui vise une égalité propre.`,
      plans: { w: `Chercher un petit avantage durable par un développement précis (d4, Fd3, c4, roque).`, b: `Égaliser proprement, ne pas se précipiter à reprendre e4, et viser les échanges qui simplifient.` },
      structure: `Souvent symétrique : réputation de solidité, parfois au prix d'un jeu un peu aride.`,
      mistakes: `Le piège classique 3.Cxe5 Cxe4?? : il faut d'abord chasser le cavalier par …d6, sinon 4.De2 gagne du matériel.`,
      deviations: [
        { label: `3.Cxe5 d6 (et non 3…Cxe4)`, note: `Si les Blancs prennent e5, ne reprenez pas tout de suite : jouez d'abord …d6 pour chasser le cavalier, puis …Cxe4 en toute sécurité.` }
      ] },

    // ── Semi-open games: 1.e4 and Black replies asymmetrically ──
    { cat: '♟ Défenses semi-ouvertes (1.e4 …)', name: 'Défense Sicilienne', en: 'Sicilian Defence', eco: 'B20', side: 'b', level: '⚔️ La plus combative',
      line: 'e4 c5',
      desc: `La réponse la plus populaire à 1.e4. Les Noirs refusent la symétrie et jouent <b>c5</b> pour un jeu déséquilibré et plein d'ambition. Théorie immense : passionnante, mais elle demande du travail.`,
      idea: `Répondre 1…c5 attaque d4 sans rendre la pareille au centre : les Noirs refusent la symétrie et jouent pour gagner, pas pour annuler. La réponse n°1 à 1.e4 au plus haut niveau.`,
      plans: { w: `Ouvrir par d4, développer agressivement, souvent roque long et ruée de pions à l'aile roi (h4-g4).`, b: `Pression sur la colonne c semi-ouverte, structure …a6/…e6 ou …g6, et contre-attaque à l'aile dame.` },
      structure: `Asymétrique : le pion c noir s'échange contre le pion d blanc. Cela mène souvent à des attaques sur des ailes opposées — des courses de vitesse.`,
      mistakes: `Jouer les coups d'une variante à la mode (Najdorf, Dragon) sans en comprendre les idées : la Sicilienne punit sévèrement le jeu approximatif.`,
      deviations: [
        { label: `2.Cc3 (fermée) ou 2.c3 (Alapin)`, note: `Si les Blancs évitent 2.Cf3 + d4, le jeu devient plus fermé (Sicilienne fermée) ou très centralisé (Alapin) : moins théorique, mais sans avantage particulier pour eux.` },
        { label: `2.Cf3 puis 3.Fb5 (Rossolimo/Moscou)`, note: `Les Blancs évitent les grandes lignes théoriques en échangeant un fou contre un cavalier : un choix sain et pratique, très en vogue.` }
      ] },
    { cat: '♟ Défenses semi-ouvertes (1.e4 …)', name: 'Défense Française', en: 'French Defence', eco: 'C00', side: 'b', level: '👍 Solide et structurée',
      line: 'e4 e6 d4 d5',
      desc: `Les Noirs préparent <b>d5</b> pour défier le centre blanc. Positions fermées avec un plan clair (attaque à l'aile dame). Seul bémol : le fou de cases blanches reste souvent enfermé.`,
      idea: `…e6 prépare …d5 pour défier d'emblée le centre blanc. On accepte des positions fermées avec un plan clair, au prix d'un fou de cases blanches souvent enfermé derrière ses pions.`,
      plans: { w: `Selon la variante : e5 pour gagner de l'espace et attaquer à l'aile roi, ou soutenir e4 par Cc3/Cd2.`, b: `Contre-attaquer la base de la chaîne par …c5, faire pression sur d4, et trouver une vie au « mauvais » fou de cases blanches.` },
      structure: `Chaîne de pions e6-d5 contre e4(-e5) : chaque camp attaque la base de la chaîne adverse — les Noirs à l'aile dame, les Blancs à l'aile roi.`,
      mistakes: `Laisser le fou de cases blanches enfermé sans plan pour l'activer (…b6/…Fa6) ou l'échanger : c'est la pièce-problème de toute la Française.`,
      deviations: [
        { label: `3.e5 / 3.Cc3 / 3.Cd2`, note: `L'avance (3.e5) ferme le centre ; 3.Cc3 invite la Winawer (…Fb4) ; 3.Cd2 (Tarrasch) évite le clouage. Trois écoles très différentes — la réponse blanche oriente toute la partie.` },
        { label: `3.exd5 exd5 (variante d'échange)`, note: `Si les Blancs échangent en d5, la position devient symétrique et terne : c'est souvent un aveu de jeu sans ambition, et les Noirs égalisent sans peine.` }
      ] },
    { cat: '♟ Défenses semi-ouvertes (1.e4 …)', name: 'Défense Caro-Kann', en: 'Caro-Kann Defence', eco: 'B10', side: 'b', level: '👍 Sûre et saine',
      line: 'e4 c6 d4 d5',
      desc: `Comme la Française, on attaque le centre par <b>d5</b> — mais en gardant le fou de cases blanches actif (c6 au lieu de e6). Réputée très solide : un excellent choix pour qui aime les positions sans risque.`,
      idea: `Comme la Française, on conteste le centre par …d5 — mais en préparant par …c6 au lieu de …e6, ce qui laisse le fou de cases blanches sortir librement. Le meilleur des deux mondes : solidité sans fou enfermé.`,
      plans: { w: `Gagner de l'espace par e5 (variante d'avance) ou jouer sur les pièces après l'échange en e4 ; viser un léger avantage durable.`, b: `Sortir le fou en f5 ou g4 AVANT de jouer …e6, obtenir une structure saine et viser des finales confortables.` },
      structure: `Très solide et peu compromise : la pièce-problème de la Française est ici développée activement, ce qui fait la réputation de sûreté du Caro-Kann.`,
      mistakes: `Jouer …e6 trop tôt et enfermer le fou de cases blanches — exactement le défaut qu'on cherchait à éviter en choisissant le Caro plutôt que la Française.`,
      deviations: [
        { label: `2.d4 d5 3.e5 (variante d'avance)`, note: `Sortez impérativement le fou en f5 AVANT de jouer …e6 : c'est tout l'intérêt du Caro-Kann par rapport à la Française.` },
        { label: `3.exd5 cxd5 (variante d'échange)`, note: `Échange tranquille menant à une position saine et symétrique : peu de risque pour les deux camps, partie de manœuvre.` }
      ] },
    { cat: '♟ Défenses semi-ouvertes (1.e4 …)', name: 'Défense Scandinave', en: 'Scandinavian Defence', eco: 'B01', side: 'b', level: '👍 Facile à apprendre',
      line: 'e4 d5 exd5 Qxd5',
      desc: `Les Noirs prennent <b>d5</b> dès le 1<sup>er</sup> coup. Très peu de théorie, un plan simple et répétable : idéale pour débuter avec les Noirs sans rien mémoriser.`,
      idea: `Frapper e4 dès le 1ᵉʳ coup par …d5 : on clarifie tout de suite le centre. Peu de théorie et un plan répétable, au prix d'un petit retard de développement (la dame doit bouger plusieurs fois).`,
      plans: { w: `Gagner des tempi en attaquant la dame noire (Cc3), développer vite et occuper le centre par d4.`, b: `Replacer la dame en sécurité (…Da5, …Dd6 ou …Dd8), puis …c6, …Ff5, …e6 : un développement solide et sans surprise.` },
      structure: `Centre clarifié très tôt : les Noirs acceptent un léger retard de développement en échange d'une grande simplicité de plan.`,
      mistakes: `Laisser la dame se faire chasser plusieurs fois en perdant des tempi, ou la placer sur une case exposée (gare aux fourchettes et aux Cb5/Cd5).`,
      deviations: [
        { label: `2…Cf6 (variante moderne)`, note: `Au lieu de reprendre tout de suite en d5, les Noirs jouent …Cf6 pour récupérer le pion sans exposer la dame : un style plus dynamique.` }
      ] },
    { cat: '♟ Défenses semi-ouvertes (1.e4 …)', name: 'Défense Pirc / Moderne', en: 'Pirc / Modern Defence', eco: 'B07', side: 'b', level: '🛡️ Hypermoderne',
      line: 'e4 d6 d4 Nf6 Nc3 g6',
      desc: `Les Noirs <b>cèdent le centre</b> volontairement, fianchettent leur fou en g7 et attaqueront ce centre plus tard. Souple et combative, mais demande de bien comprendre les plans.`,
      idea: `Laisser les Blancs occuper le centre, fianchetto en g7, puis le frapper plus tard par …e5 ou …c5 : l'idée hypermoderne de provoquer un grand centre pour mieux l'attaquer.`,
      plans: { w: `Construire un grand centre (e4-d4, parfois f4) et attaquer à l'aile roi (variante autrichienne).`, b: `Frapper le centre par …e5 ou …c5 au bon moment ; le fou g7 prend vie le long de la grande diagonale.` },
      structure: `Centre blanc avancé contre fianchetto noir : tendu et flexible, mais exige de bien comprendre les plans plutôt que de mémoriser des coups.`,
      mistakes: `Rester passif et laisser les Blancs étouffer la position : sans contre-attaque rapide du centre, les Noirs se font écraser par l'espace.`,
      deviations: [
        { label: `4.f4 (attaque autrichienne)`, note: `Si les Blancs ajoutent f4, ils visent une attaque directe sur le roi : les Noirs doivent réagir vite au centre par …c5 ou …e5 sous peine d'être submergés.` }
      ] },

    // ── Closed games: 1.d4 d5 ──
    { cat: '♛ Jeux fermés (1.d4 d5)', name: 'Gambit Dame refusé', en: "Queen's Gambit Declined", eco: 'D30', side: 'w', level: '⭐ Classique et fiable',
      line: 'd4 d5 c4 e6',
      desc: `Les Blancs proposent le pion c4 ; les Noirs le déclinent en soutenant leur centre par <b>e6</b>. L'une des ouvertures les plus solides du répertoire classique, base de la stratégie positionnelle.`,
      idea: `Les Blancs offrent c4 pour dévier le pion d5 ; les Noirs déclinent et soutiennent leur centre par …e6. C'est le socle de la stratégie positionnelle classique.`,
      plans: { w: `Pression sur d5, développement harmonieux (Cc3, Fg5, e3, Fd3), et l'« attaque de minorité » b4-b5 à l'aile dame.`, b: `Tenir le centre, échanger pour respirer, puis se libérer par …c5 ou …e5 au bon moment.` },
      structure: `Centre solide d5/e6 contre d4/c4 : positionnel et durable, c'est l'archétype du jeu de plans à long terme.`,
      mistakes: `Développer le fou de cases blanches après …e6 sans plan : comme à la Française, il reste enfermé derrière ses propres pions.`,
      deviations: [
        { label: `3…c6 (vers la Slave)`, note: `Si les Noirs soutiennent d5 par …c6 plutôt que …e6, on glisse vers la Défense Slave, qui garde le fou de cases blanches libre.` }
      ] },
    { cat: '♛ Jeux fermés (1.d4 d5)', name: 'Gambit Dame accepté', en: "Queen's Gambit Accepted", eco: 'D20', side: 'w', level: '👍 Actif',
      line: 'd4 d5 c4 dxc4',
      desc: `Les Noirs <b>prennent</b> le pion c4 — sans chercher à le garder, mais pour libérer leur jeu et viser une contre-attaque au centre. Le pion sera généralement récupéré par les Blancs.`,
      idea: `Les Noirs prennent …dxc4 non pour garder le pion, mais pour abandonner le centre et le contester ensuite avec des pièces actives. Les Blancs récupèrent presque toujours le pion.`,
      plans: { w: `Jouer e3 puis Fxc4 pour reprendre le pion, occuper le centre (e4 possible) et exploiter un léger avantage d'espace.`, b: `Rendre le pion proprement, jouer …c5 et …e6, contester d4 et viser une égalité active.` },
      structure: `Centre semi-ouvert : les Blancs ont un peu plus d'espace, les Noirs un développement fluide et des pièces libres.`,
      mistakes: `Tenter de garder le pion c4 par …b5 : après a4, l'aile dame noire s'effondre — le pion ne se conserve pas.`,
      deviations: [
        { label: `…b5 pour garder le pion`, note: `Erreur classique : a4 ! ouvre l'aile dame et gagne du matériel ou une position écrasante. Le pion c4 n'est jamais à garder durablement.` }
      ] },
    { cat: '♛ Jeux fermés (1.d4 d5)', name: 'Défense Slave', en: 'Slav Defence', eco: 'D10', side: 'b', level: '👍 Très solide',
      line: 'd4 d5 c4 c6',
      desc: `On soutient d5 par <b>c6</b> (plutôt qu'e6), ce qui garde le fou de cases blanches libre. Robuste et populaire à tous les niveaux : une valeur sûre face à 1.d4.`,
      idea: `Soutenir d5 par …c6 plutôt que …e6 : la structure reste très solide ET le fou de cases blanches peut sortir avant d'être enfermé. La réponse de référence pour qui veut de la robustesse.`,
      plans: { w: `Pression sur d5 (Cc3, Cf3, e3), récupérer c4 si les Noirs le prennent, et jouer sur un léger avantage d'espace.`, b: `Sortir le fou en f5 ou g4 avant …e6, puis tenir solidement ; ou …dxc4 suivi de …b5 (Slave élargie).` },
      structure: `Triangle de pions c6-d5(-e6) extrêmement robuste : difficile à percer, idéal pour qui aime les positions sûres.`,
      mistakes: `Sortir le fou de cases blanches APRÈS …e6 et l'enfermer : on perd alors tout l'intérêt de la Slave par rapport au Gambit Dame refusé.`,
      deviations: [
        { label: `…dxc4 (Slave acceptée)`, note: `Les Noirs peuvent prendre en c4 et tenter de le tenir par …b5 (soutenu par …a6), au prix de complications tactiques — une ligne plus ambitieuse.` }
      ] },
    { cat: '♛ Jeux fermés (1.d4 d5)', name: 'Système de Londres', en: 'London System', eco: 'D00', side: 'w', level: '👍 Facile à jouer',
      line: 'd4 d5 Bf4',
      desc: `Une configuration <b>passe-partout</b> : le fou sort en f4 et les Blancs jouent presque toujours les mêmes coups, quelle que soit la réponse noire. Deux ordres possibles - <b>2.Cf3 Cf6 3.Ff4</b> (classique) ou <b>2.Ff4</b> tout de suite (accéléré) : ils transposent. Peu de théorie, idéal pour gagner du temps et jouer sur plan.`,
      idea: `Un système « passe-partout » : on sort le fou en f4 (avant de jouer e3, pour ne pas l'enfermer), puis e3 qui soutient d4 ET défend le fou, et on répète presque les mêmes coups quelle que soit la réponse noire. L'ordre de référence sort le cavalier d'abord (2.Cf3 Cf6 3.Ff4) ; 2.Ff4 immédiat est la version accélérée. Peu de théorie, beaucoup de temps gagné.`,
      plans: { w: `Pyramide Ff4, e3, Fd3, c3, Cbd2, roque ; puis Ce5 et un assaut à l'aile roi si l'occasion se présente.`, b: `…c5 et …Db6 pour harceler b2 et d4, ou …Ff5 pour neutraliser le fou f4 par un échange ou …Cf6-h5.` },
      structure: `Structure fixe et symétrique d4-e3-c3 : sûre, mais peu ambitieuse si on la joue passivement, sur pilote automatique.`,
      mistakes: `Jouer en pilote automatique sans réagir quand les Noirs frappent par …c5 et …Db6 : b2 et d4 deviennent alors des cibles concrètes.`,
      deviations: [
        { label: `…c5 + …Db6`, note: `La réponse qui pique : elle attaque b2 et d4 à la fois, et elle arrive un temps plus tôt contre l'ordre accéléré. Les Blancs doivent défendre précisément (Dc1, Dc2 ou b3 - pas Db3, qui brade les dames), sinon ils perdent l'initiative dès l'ouverture.` },
        { label: `Ordre classique ou accéléré`, note: `<b>2.Cf3 Cf6 3.Ff4</b> (classique, l'ordre de référence) et <b>2.Ff4</b> (accéléré) mènent à la même position. Seule règle intangible : le fou sort AVANT e3, sinon il reste enfermé en c1.` }
      ] },

    // ── Indian defenses: 1.d4 Nf6 ──
    { cat: '♞ Défenses indiennes (1.d4 Cf6)', name: 'Défense Est-Indienne', en: "King's Indian Defence", eco: 'E60', side: 'b', level: '⚔️ Contre-attaque',
      line: 'd4 Nf6 c4 g6 Nc3 Bg7',
      desc: `Les Noirs laissent les Blancs occuper le centre, fianchettent en <b>g7</b>, puis frappent par e5 ou c5 avec une attaque sur le roi. Dynamique et tranchante — un grand favori des joueurs d'attaque.`,
      idea: `Laisser les Blancs bâtir un grand centre, fianchetto en g7, puis frapper par …e5 — et, une fois le centre fermé, lancer une ruée de pions (…f5-f4-g5) contre le roi blanc.`,
      plans: { w: `Avancer au centre et à l'aile dame (c4-d5, puis b4-c5) pour percer là où les Noirs sont moins présents.`, b: `Fermer le centre par …e5/d5, puis …f5-f4-g5-g4 : une attaque directe sur le roque blanc.` },
      structure: `Centre bloqué (pion d5 blanc contre e5 noir) : chaque camp attaque sur son aile — course d'attaque très tranchante où la vitesse décide.`,
      mistakes: `Côté blanc, traîner à l'aile dame et se faire mater ; côté noir, oublier la ruée de pions et rester passif après avoir cédé le centre.`,
      deviations: [
        { label: `Système Sämisch (f3)`, note: `Si les Blancs jouent f3 pour bétonner e4, ils préparent leur propre attaque à l'aile roi (Fe3, Dd2, roque long) : la course d'attaque peut alors changer de camp.` }
      ] },
    { cat: '♞ Défenses indiennes (1.d4 Cf6)', name: 'Défense Nimzo-Indienne', en: 'Nimzo-Indian Defence', eco: 'E20', side: 'b', level: '⭐ Stratégique',
      line: 'd4 Nf6 c4 e6 Nc3 Bb4',
      desc: `Le fou cloue le cavalier <b>c3</b> pour gêner e4 et infliger des pions doublés. Mélange rare de solidité et d'idées subtiles : l'une des défenses les plus respectées contre 1.d4.`,
      idea: `…Fb4 cloue le cavalier c3 pour empêcher e4 et menacer d'infliger des pions doublés en c3. Un rare mélange de solidité et de finesse stratégique.`,
      plans: { w: `Récupérer la paire de fous, jouer e4 et exploiter le centre ; parfois accepter des pions doublés contre une initiative dynamique.`, b: `Échanger en c3 au bon moment, bloquer le jeu et faire des pions doublés c3-c4 une faiblesse durable.` },
      structure: `Souvent des pions doublés c3-c4 chez les Blancs : statique et exploitable, mais compensé par la paire de fous et un centre potentiel.`,
      mistakes: `Échanger Fxc3 sans raison et offrir la paire de fous trop tôt, sans contrepartie structurelle concrète.`,
      deviations: [
        { label: `4.Dc2 (classique) contre 4.e3 (Rubinstein)`, note: `Dc2 reprend de la dame en c3 pour éviter les pions doublés ; 4.e3 les accepte en misant sur un développement rapide. Deux philosophies opposées — la vôtre doit suivre celle du 4ᵉ coup blanc.` }
      ] },
    { cat: '♞ Défenses indiennes (1.d4 Cf6)', name: 'Défense Grünfeld', en: 'Grünfeld Defence', eco: 'D80', side: 'b', level: '⚔️ Hypermoderne',
      line: 'd4 Nf6 c4 g6 Nc3 d5',
      desc: `Les Noirs laissent les Blancs bâtir un grand centre… pour le <b>démolir</b> ensuite à coups de pièces. Très combative et théorique : spectaculaire mais exigeante.`,
      idea: `…d5 invite l'échange en d5 puis laisse les Blancs construire un grand centre de pions — pour le prendre pour cible à coups de pièces (…c5, …Cc6, fou g7). Provoquer pour mieux détruire.`,
      plans: { w: `Bâtir et soutenir le centre e4-d4, viser une attaque si le centre tient et roule en avant.`, b: `Pression maximale sur d4 par …c5, …Cc6, le fou g7 et la dame : transformer le « beau » centre blanc en faiblesse.` },
      structure: `Grand centre blanc mobile contre pression de pièces noire : très dynamique et théorique, l'équilibre tient à un fil.`,
      mistakes: `Côté blanc, croire le centre invincible et le laisser devenir une cible ; côté noir, tarder à frapper par …c5 et laisser le centre se consolider.`,
      deviations: [
        { label: `7.Fc4 contre 7.Cf3 (variante d'échange)`, note: `Le coup blanc choisi pour soutenir le centre fixe le timing de …c5 et la cible de la pression noire : adaptez votre contre-jeu à la façon dont les Blancs défendent d4.` }
      ] },
    { cat: '♞ Défenses indiennes (1.d4 Cf6)', name: 'Catalane', en: 'Catalan Opening', eco: 'E01', side: 'w', level: '⭐ Élégante',
      line: 'd4 Nf6 c4 e6 g3',
      desc: `Les Blancs combinent le gambit Dame et un <b>fianchetto en g2</b>. Le fou exerce une longue pression sur l'aile dame ; jeu positionnel précis, apprécié des joueurs de fond.`,
      idea: `Combiner le gambit Dame et un fianchetto en g2 : le fou exerce une pression à distance, sur toute la diagonale, contre d5 et l'aile dame noire. Élégant et patient.`,
      plans: { w: `Pression le long de la diagonale a8-h1 (d5/c6), récupérer le pion c4 s'il est pris, et manœuvrer positionnellement.`, b: `Tenir un moment le pion c4 (…dxc4, …a6, …b5) ou le rendre proprement et se libérer par …c5 ou …e5.` },
      structure: `Pression à distance plus que centre fixe : très positionnel, c'est l'ouverture de prédilection des joueurs de fond patients.`,
      mistakes: `Sous-estimer le fou g2 : les Noirs doivent résoudre activement leur développement à l'aile dame, sinon la pression devient étouffante.`,
      deviations: [
        { label: `Catalane ouverte (…dxc4) contre fermée (…Fe7)`, note: `Si les Noirs prennent et gardent c4, les Blancs misent sur l'initiative et la diagonale ; si les Noirs jouent …Fe7 (fermée), la partie est plus tranquille et manœuvrière.` }
      ] },
    { cat: '♞ Défenses indiennes (1.d4 Cf6)', name: 'Défense Benoni', en: 'Benoni Defence', eco: 'A60', side: 'b', level: '⚔️ Déséquilibrée',
      line: 'd4 Nf6 c4 c5 d5 e6',
      desc: `Les Noirs cèdent de l'espace mais obtiennent une <b>majorité de pions à l'aile dame</b> et des colonnes ouvertes pour contre-attaquer. Jeu vif et risqué, à l'opposé des défenses prudentes.`,
      idea: `Provoquer d4-d5 par …c5, puis …e6/exd5 : on cède de l'espace au centre en échange d'une majorité de pions à l'aile dame, d'un fou g7 actif et de colonnes pour contre-attaquer.`,
      plans: { w: `Exploiter l'avantage d'espace (poussée e4-e5 éventuelle), attaquer à l'aile roi et garder le coin d5 sous contrôle.`, b: `Poussée …b5 à l'aile dame, fou g7 sur la grande diagonale, et contre-jeu sur les colonnes c et e semi-ouvertes.` },
      structure: `Coin de pions blancs d5-e4 avancé contre majorité noire à l'aile dame : déséquilibré, vif et risqué — l'opposé des défenses prudentes.`,
      mistakes: `Rester passif : sans la poussée …b5 et le contre-jeu actif, les Noirs sont simplement étouffés par l'espace blanc.`,
      deviations: [
        { label: `Avec f4 (attaque des quatre pions)`, note: `Si les Blancs ajoutent f4, ils visent une énorme attaque centrale (e4-d5-c4-f4) : les Noirs doivent réagir immédiatement par …e6 et …b5, sinon le centre les balaie.` }
      ] },

    // ── Flank openings ──
    { cat: '🌐 Ouvertures de flanc', name: 'Ouverture Anglaise', en: 'English Opening', eco: 'A10', side: 'w', level: '👍 Flexible',
      line: 'c4',
      desc: `Les Blancs contrôlent le centre <b>depuis le flanc</b> avec c4, sans s'engager tout de suite. Très souple : la partie peut se transposer dans de nombreuses autres ouvertures.`,
      idea: `Contrôler le centre depuis le flanc par c4, sans engager ses pions centraux tout de suite. Extrêmement souple : l'Anglaise peut transposer dans presque toutes les ouvertures fermées.`,
      plans: { w: `Fianchetto en g2, pression sur d5 et le centre, jeu positionnel ; transposer dans la structure qui vous arrange.`, b: `Choisir sa structure : symétrie par …c5, « Sicilienne inversée » par …e5, ou setup indien (…Cf6, …g6).` },
      structure: `Très flexible : souvent des fianchettos et un jeu de pièces plutôt qu'un centre de pions fixe. La forme finale dépend des deux camps.`,
      mistakes: `Jouer sans plan en espérant que « ça transpose » : l'Anglaise récompense une idée claire, pas l'attentisme.`,
      deviations: [
        { label: `1…e5 (Sicilienne inversée)`, note: `Les Noirs prennent l'espace au centre ; les Blancs jouent alors une Sicilienne avec un tempo de plus — un avantage subtil mais réel.` }
      ] },
    { cat: '🌐 Ouvertures de flanc', name: 'Ouverture Réti', en: 'Réti Opening', eco: 'A09', side: 'w', level: '⭐ Positionnelle',
      line: 'Nf3 d5 c4',
      desc: `On développe d'abord le cavalier en <b>f3</b>, puis on attaque le centre noir avec c4, souvent combiné à un fianchetto. Approche hypermoderne : contrôler le centre à distance avant de l'occuper.`,
      idea: `Développer d'abord Cf3, puis attaquer le centre noir par c4 et un fianchetto en g2 : contrôler le centre à distance avant — éventuellement — de l'occuper. Hypermoderne et souple.`,
      plans: { w: `Fianchetto g2, pression à distance sur d5, expansion à l'aile dame (b3-b4) et jeu positionnel patient.`, b: `Soutenir d5 (…c6, …e6) ou rendre le centre et développer activement ses pièces.` },
      structure: `Peu de pions au centre au début : jeu de pièces et de diagonales, avec des transpositions fréquentes vers l'Anglaise ou la Catalane.`,
      mistakes: `Vouloir « réfuter » le système par des poussées centrales hâtives : il se neutralise par un développement sain, pas par l'agressivité.`,
      deviations: [
        { label: `…d4 (avance)`, note: `Si les Noirs avancent …d4 pour gagner de l'espace, les Blancs jouent autour du pion avancé (e3, b4) pour le saper plutôt que de l'attaquer de front.` }
      ] },
    { cat: '🌐 Ouvertures de flanc', name: 'Ouverture Bird', en: "Bird's Opening", eco: 'A02', side: 'w', level: '⚔️ Originale',
      line: 'f4',
      desc: `Le pendant « inversé » de la Hollandaise : <b>f4</b> contrôle e5 et prépare un jeu à l'aile roi. Peu jouée, donc déstabilisante, mais elle affaiblit légèrement le roi blanc.`,
      idea: `1.f4 contrôle e5 et prépare un jeu à l'aile roi : c'est la Défense Hollandaise jouée avec un tempo de plus. Peu courante, donc déstabilisante.`,
      plans: { w: `Setup Leningrad ou Stonewall inversé, fianchetto ou Fd3, et attaque à l'aile roi.`, b: `Exploiter l'affaiblissement du roi blanc : …d5/…g6 pour un jeu sain, ou le gambit From (1…e5) pour ouvrir vite.` },
      structure: `Aile roi blanche légèrement affaiblie par f4 (diagonale e1-h4 ouverte) : original, mais à manier avec un minimum de prudence côté roi.`,
      mistakes: `Négliger la sécurité du roi : après une faute, …Dh4+ peut être très désagréable du fait du coup f4.`,
      deviations: [
        { label: `1…e5 (gambit From)`, note: `Les Noirs sacrifient e5 pour une attaque rapide. Attention au piège 2.fxe5 d6 3.exd6 Fxd6 visant …Dh4+ : il faut connaître la parade (4.Cf3).` }
      ] },
    { cat: '🌐 Ouvertures de flanc', name: 'Ouverture Larsen', en: 'Nimzo-Larsen Attack', eco: 'A01', side: 'w', level: '⚔️ Originale',
      line: 'b3',
      desc: `Les Blancs fianchettent immédiatement en <b>b2</b> pour viser la grande diagonale et la case e5. Système simple et dépaysant, qui sort vite l'adversaire de sa théorie.`,
      idea: `Fianchetto immédiat en b2 (1.b3) pour viser la grande diagonale a1-h8 et la case e5 : un système simple et dépaysant qui sort vite l'adversaire de sa théorie.`,
      plans: { w: `Fb2, e3, Fd3 ou Fe2, pression sur e5 et le centre depuis les flancs ; jouer sur la compréhension plutôt que la mémoire.`, b: `Occuper le centre classiquement (…e5, …d5, …Cf6, …Cc6) et neutraliser le fou b2 par …d6 ou …Cbd7.` },
      structure: `Jeu de fous fianchettés et de diagonales : peu théorique, il repose entièrement sur la compréhension des plans.`,
      mistakes: `Jouer le système mécaniquement : sans pression réelle sur e5, le fou b2 reste un simple figurant et les Blancs n'ont rien.`,
      deviations: [
        { label: `…e5 solide`, note: `Si les Noirs plantent un gros centre par …e5/…d5, les Blancs doivent le contester activement (c4, e3, parfois f4) au lieu de rester passifs derrière leur fianchetto.` }
      ] },
  ];

  function initOpenings() {
    const host = $('#openings-list');
    if (!host || typeof BoardRenderer === 'undefined' || typeof Chess === 'undefined') return;

    let lastCat = null, html = '';
    for (const o of OPENINGS) {
      if (o.cat !== lastCat) { html += `<h4 class="concept-cat">${o.cat}</h4>`; lastCat = o.cat; }
      const en = o.en ? ` <span class="concept-en">${o.en}</span>` : '';
      const eco = o.eco ? ` <span class="concept-en">${o.eco}</span>` : '';
      const sideLabel = o.side === 'b' ? 'Noirs' : 'Blancs';
      const sideTag = `<span class="opening-side opening-side-${o.side}">${sideLabel}</span>`;
      const hasCourse = (typeof Courses !== 'undefined') && Courses.has(o.line);
      const courseBadge = hasCourse ? ` <span class="opening-course-badge">🎓 Cours</span>` : '';
      const level = o.level ? `<p class="opening-level">${sideTag}${o.level}${courseBadge}</p>` : (hasCourse ? `<p class="opening-level">${courseBadge}</p>` : '');
      html += `<div class="concept${hasCourse ? ' has-course' : ''}"><div class="concept-diagram"><svg class="cd-board" viewBox="0 0 360 360"></svg></div><div class="concept-body"><span class="concept-name">${o.name}${en}${eco}</span>${level}<p>${o.desc}</p></div></div>`;
    }
    host.innerHTML = html;

    const prevFlip = BoardRenderer.isFlipped();
    const cards = host.querySelectorAll('.concept');
    OPENINGS.forEach((o, i) => {
      const flip = o.side === 'b';
      const game = new Chess();
      o.line.split(' ').forEach(t => game.move(t, { sloppy: true }));
      BoardRenderer.setFlipped(flip);
      BoardRenderer.render(cards[i].querySelector('.cd-board'), game.fen());
      const moves = o.line.split(' ').length;
      const title = o.en && o.en !== o.name ? `${o.name} · ${o.en}` : o.name;
      const course = (typeof Courses !== 'undefined') ? Courses.get(o.line) : null;
      cards[i].addEventListener('click', () =>
        openOpeningExplorer({
          name: title, eco: o.eco, line: o.line, moves,
          idea: o.idea, plans: o.plans, structure: o.structure,
          mistakes: o.mistakes, deviations: o.deviations, course
        }, [], o.level || '', flip));
    });
    BoardRenderer.setFlipped(prevFlip);
  }

  const QUIZ_QUESTIONS = [
    { q: 'Comment note-t-on un cavalier en notation algébrique ?', opts: ['C', 'N', 'K', 'Cv'], answer: 1, explain: 'En anglais, le cavalier se note N (Knight). En français, on utilise C.' },
    { q: 'Que signifie le symbole "x" dans un coup ?', opts: ['Échec', 'Capture', 'Roque', 'Promotion'], answer: 1, explain: 'Le "x" indique une capture : la pièce prend une pièce adverse.' },
    { q: 'Que signifie "O-O" ?', opts: ['Partie nulle', 'Petit roque', 'Grand roque', 'Échec'], answer: 1, explain: 'O-O = petit roque (côté roi). O-O-O = grand roque (côté dame).' },
    { q: 'Que signifie le symbole "#" après un coup ?', opts: ['Échec', 'Échec et mat', 'Promotion', 'Prise en passant'], answer: 1, explain: '# indique l\'échec et mat. + indique un simple échec.' },
    { q: 'Comment note-t-on la promotion d\'un pion en dame ?', opts: ['e8D', 'e8=Q', 'e8+Q', 'Pe8'], answer: 1, explain: 'On écrit la case d\'arrivée suivie de =Q (=D en français) pour indiquer la promotion.' },
    { q: 'Que signifie "Fxe5" en notation française ?', opts: ['Le fou capture en e5', 'La dame va en e5', 'Le roi capture en e5', 'Le cavalier va en e5'], answer: 0, explain: 'F = Fou, x = capture. Le fou prend la pièce en e5.' },
    { q: 'En notation anglaise, quelle lettre désigne la Tour ?', opts: ['T', 'R', 'B', 'K'], answer: 1, explain: 'R = Rook (Tour en anglais). T est la notation française.' },
    { q: 'Comment désambiguë-t-on deux cavaliers pouvant aller sur la même case ?', opts: ['On ajoute la colonne d\'origine', 'On met le coup en majuscules', 'On ajoute un point', 'On utilise une flèche'], answer: 0, explain: 'Ex: Cbd2 ou Cfd2 — on précise la colonne (ou la rangée) de départ pour distinguer les deux cavaliers.' },
    { q: 'Que signifie "+" après un coup ?', opts: ['Bon coup', 'Échec', 'Promotion', 'Capture'], answer: 1, explain: '+ signifie que le coup met le roi adverse en échec.' },
    { q: 'Comment note-t-on la Dame en anglais ?', opts: ['D', 'K', 'Q', 'L'], answer: 2, explain: 'Q = Queen (Dame). K = King (Roi).' },
  ];

  let quizState = { current: 0, score: 0, questions: [] };

  function startQuiz() {
    const pool = [...QUIZ_QUESTIONS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    quizState = { current: 0, score: 0, questions: pool.slice(0, 5) };
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const container = $('#quiz-area');
    if (!container) return;
    const qs = quizState;
    if (qs.current >= qs.questions.length) {
      container.innerHTML = `
        <div class="quiz-result">
          <span class="quiz-score-icon">${qs.score >= 4 ? '🎉' : qs.score >= 2 ? '👍' : '📖'}</span>
          <p><b>${qs.score} / ${qs.questions.length}</b></p>
          <p>${qs.score >= 4 ? 'Excellent ! Vous maîtrisez la notation.' : qs.score >= 2 ? 'Pas mal ! Relisez le glossaire pour les points manqués.' : 'Continuez à pratiquer, la notation deviendra naturelle !'}</p>
          <button class="btn-quiz-retry" id="quiz-retry">Recommencer</button>
        </div>`;
      $('#quiz-retry').addEventListener('click', startQuiz);
      return;
    }
    const q = qs.questions[qs.current];
    container.innerHTML = `
      <div class="quiz-progress">${qs.current + 1} / ${qs.questions.length}</div>
      <p class="quiz-question">${q.q}</p>
      <div class="quiz-opts">
        ${q.opts.map((o, i) => `<button class="quiz-opt" data-idx="${i}">${o}</button>`).join('')}
      </div>
      <div class="quiz-feedback" id="quiz-feedback" hidden></div>`;
    container.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.addEventListener('click', () => onQuizAnswer(+btn.dataset.idx));
    });
  }

  function onQuizAnswer(idx) {
    const q = quizState.questions[quizState.current];
    const correct = idx === q.answer;
    if (correct) quizState.score++;
    const feedback = $('#quiz-feedback');
    feedback.hidden = false;
    feedback.className = 'quiz-feedback ' + (correct ? 'correct' : 'wrong');
    feedback.innerHTML = `<b>${correct ? 'Correct !' : 'Raté !'}</b> ${q.explain}`;
    $$('#quiz-area .quiz-opt').forEach(btn => {
      btn.disabled = true;
      if (+btn.dataset.idx === q.answer) btn.classList.add('correct');
      if (+btn.dataset.idx === idx && !correct) btn.classList.add('wrong');
    });
    setTimeout(() => {
      quizState.current++;
      renderQuizQuestion();
    }, 2200);
  }

  document.addEventListener('DOMContentLoaded', init);
  return { goTo, refreshHome, openOpeningExplorer, openOpeningByLine, openingExists: (line) => !!(line && OPENINGS.find(o => o.line === line)), openPanel: (name) => { if (_openPanel) _openPanel(name); }, isAnalyzing: () => analyzing, openStoredReport, loadPgnAndAnalyze };
})();
