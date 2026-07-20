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
  let gameHistory = [];
  let inspectSq = null;
  let lastRenderIndex = -1;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Canonical move-classification taxonomy, mirroring Chess.com's Game Review.
  // label = French name shown to the user, cls = CSS modifier (badge + move cell
  // share the same suffix), mark = the classical annotation glyph.
  // mark = the glyph shown on the move, matching Chess.com's Game Review icons:
  // !! Brilliant · ! Great · ★ Best · ✔ Excellent · ✓ Good · 📖 Book ·
  // ?! Inaccuracy · ✗ Miss · ? Mistake · ?? Blunder.
  const MOVE_CLASS = {
    brilliant:  { label: 'Brillant',          cls: 'brilliant',  mark: '!!' },
    great:      { label: 'Formidable',        cls: 'great',      mark: '!' },
    best:       { label: 'Meilleur',          cls: 'best',       mark: '★' },
    excellent:  { label: 'Excellent',         cls: 'excellent',  mark: '✔' },
    good:       { label: 'Bon',               cls: 'good',       mark: '✓' },
    book:       { label: 'Théorique',         cls: 'book',       mark: '📖' },
    inaccuracy: { label: 'Imprécision',       cls: 'inaccuracy', mark: '?!' },
    miss:       { label: 'Occasion manquée',  cls: 'miss',       mark: '✗' },
    mistake:    { label: 'Erreur',            cls: 'mistake',    mark: '?' },
    blunder:    { label: 'Gaffe',             cls: 'blunder',    mark: '??' }
  };
  const markSpan = (type) => {
    const m = MOVE_CLASS[type];
    return m && m.mark ? ` <span class="mv-mark mv-${m.cls}">${m.mark}</span>` : '';
  };

  function init() {
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
    const guessBtn = $('#btn-guess');
    if (guessBtn) guessBtn.addEventListener('click', () => {
      if (currentAnalysis && typeof GuessMove !== 'undefined') GuessMove.start(currentAnalysis, currentHeader, currentUser);
    });
    const coachBtn = $('#btn-open-coach');
    if (coachBtn) coachBtn.addEventListener('click', () => Coach.show());
    const endgameBtn = $('#btn-open-endgame');
    if (endgameBtn) endgameBtn.addEventListener('click', () => { if (typeof Endgame !== 'undefined') Endgame.show(); });
    const coachBack = $('#btn-coach-back');
    if (coachBack) coachBack.addEventListener('click', () => Coach.hide());
    $('#btn-back').addEventListener('click', showImport);
    $('#btn-first').addEventListener('click', () => userNav(0));
    $('#btn-prev').addEventListener('click', () => userNav(currentIndex - 1));
    $('#btn-next').addEventListener('click', () => userNav(currentIndex + 1));
    $('#btn-last').addEventListener('click', () => userNav(currentAnalysis.length));
    $('#move-slider').addEventListener('input', (e) => userNav(+e.target.value));

    $$('.tabbar .tab').forEach(t => t.addEventListener('click', () => navTo(t.dataset.tab)));

    $$('#analysis-segmented .seg-btn').forEach(b => b.addEventListener('click', () => setSegment(b.dataset.seg)));

    $('#board-svg').addEventListener('click', (e) => {
      const sq = BoardRenderer.coordToSquare($('#board-svg'), e.clientX, e.clientY);
      if (sq) toggleInspect(sq);
    });

    document.addEventListener('keydown', (e) => {
      if (!$('#screen-analysis').classList.contains('active')) return;
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

    // Release the pin as soon as the reader scrolls to read the cards below.
    // A horizontal swipe on the board is navigation, not reading — keep it pinned.
    const abody = $('#screen-analysis .analysis-body');
    if (abody) {
      abody.addEventListener('wheel', unpinBoard, { passive: true });
      abody.addEventListener('touchmove', (e) => {
        if (!boardEl.contains(e.target)) unpinBoard();
      }, { passive: true });
    }
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
    return `${(header.White||'?')}|${(header.Black||'?')}|${(header.Date||'')}|${moveCount}`;
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

    currentClocks = extractClocks(pgnText);

    const chess = new Chess();
    const cleaned = sanitizePgn(pgnText);
    chess.load_pgn(cleaned, { sloppy: true });
    if (chess.history().length === 0) {
      chess.load_pgn(pgnText, { sloppy: true });
    }
    if (chess.history().length === 0) {
      showError('PGN invalide. Vérifiez le format et réessayez.');
      return;
    }

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
      if (replay.history().length > moves.length) {
        moves = replay.history({ verbose: true });
      }
    }

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

    try {
      await StockfishEngine.init();
      engineUsed = true;
      analysis = await Analyzer.analyzeGameAsync(chess, moves, (done, total) => {
        const pct = Math.round(100 * done / total);
        updateProgressBar(pct, `Analyse en cours... ${done}/${total} positions`);
      });
    } catch (_) {
      analysis = Analyzer.analyzeGame(chess, moves);
    }

    hideProgressBar();

    const summary = Analyzer.generateSummary(analysis, moves);
    summary.engineUsed = engineUsed;

    saveCachedAnalysis(ck, analysis, summary, header, detectUser(header));
    if (typeof Training !== 'undefined') Training.capture(ck, analysis, header, detectUser(header));
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

    $('#move-slider').max = analysis.length;
    $('#move-slider').value = 0;

    buildIntro(header, analysis, summary);
    buildAccuracyHero(header, summary);
    buildTurningPoint(header, analysis);
    buildPace(header, analysis);
    buildWinGraph(analysis);
    buildHighlights(header, analysis);
    buildMistakeProfile(header, analysis);
    buildMoveList(analysis);
    buildTimeTrouble(header, analysis);
    buildMaterialGraph(analysis);
    buildPlanRecognition(header, analysis);
    buildTimeChart(analysis);
    buildSummary(summary, analysis);
    probeEndgameTablebase(analysis);

    $('#screen-import').classList.remove('active');
    $('#screen-analysis').classList.add('active');
    setTab('analyser');
    setSegment('conseil');

    lastRenderIndex = -1;
    unpinBoard();
    goTo(0);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function setSegment(seg) {
    $$('#analysis-segmented .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.seg === seg));
    $$('#screen-analysis .seg-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === seg));
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
    $('#eval-bar').style.height = evalPct + '%';

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

    if (index === 0) {
      $('#tip-badge').textContent = '';
      $('#tip-badge').className = 'eval-badge';
      $('#tip-text').innerHTML = 'Position de départ. Utilisez les boutons ou le curseur pour naviguer dans la partie.';
      const sideTag = $('#tip-side');
      if (sideTag) sideTag.hidden = true;
    } else {
      const r = currentAnalysis[index - 1];
      const moveNum = Math.floor((index - 1) / 2) + 1;
      const dot = (index - 1) % 2 === 0 ? '.' : '...';
      $('#tip-text').innerHTML = `<b>${moveNum}${dot} ${r.sanFr}</b> — ${r.tipFr}`;
      bindAltMoves();

      const sideTag = $('#tip-side');
      if (sideTag && currentUser && r.move) {
        const isUserMove = (currentUser === 'w' && r.move.color === 'w') || (currentUser === 'b' && r.move.color === 'b');
        sideTag.hidden = false;
        sideTag.textContent = isUserMove ? 'Vous' : 'Adversaire';
        sideTag.className = 'tip-side-tag ' + (isUserMove ? 'tip-side-you' : 'tip-side-opp');
      } else if (sideTag) {
        sideTag.hidden = true;
      }

      const badge = $('#tip-badge');
      badge.className = 'eval-badge';
      const meta = MOVE_CLASS[r.type];
      if (meta) { badge.textContent = (meta.mark ? meta.mark + ' ' : '') + meta.label; badge.classList.add(meta.cls); }
      else { badge.textContent = ''; }
    }

    $('#move-slider').value = index;
    const total = currentAnalysis.length;
    $('#move-counter').textContent = `Coup ${index}/${total}`;

    updateWinGraphCursor(index);
    updateMatGraphCursor(index);

    $$('.move-cell').forEach(cell => cell.classList.remove('active'));
    if (index > 0) {
      const cell = $(`.move-cell[data-index="${index - 1}"]`);
      if (cell) {
        cell.classList.add('active');
        const grid = $('#moves-grid');
        const cellTop = cell.offsetTop - grid.offsetTop;
        if (cellTop < grid.scrollTop) grid.scrollTop = cellTop;
        else if (cellTop + cell.offsetHeight > grid.scrollTop + grid.clientHeight) grid.scrollTop = cellTop + cell.offsetHeight - grid.clientHeight;
      }
    }
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
            $('#tip-card').appendChild(back);
          }
          back.hidden = false;
        } catch(_) {}
      });
    });
  }

  function pinBoard() {
    const bs = document.querySelector('#screen-analysis .board-sticky');
    if (bs) bs.classList.add('pinned');
  }
  function unpinBoard() {
    const bs = document.querySelector('#screen-analysis .board-sticky');
    if (bs) bs.classList.remove('pinned');
  }

  // Single entry point for every user-initiated move navigation: pin the board
  // so it stays in view while stepping, jump to the move, and bring the board
  // on screen if it had scrolled out of view.
  function userNav(index) {
    pinBoard();
    goTo(index);
    scrollToBoard();
  }

  function scrollToBoard() {
    const board = $('#board-container');
    const boardRect = board.getBoundingClientRect();
    const viewH = window.innerHeight;
    if (boardRect.top >= -boardRect.height * 0.5 && boardRect.bottom <= viewH + boardRect.height * 0.5) return;
    board.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    let accuracyHtml = '';
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

      if (phaseAccs.length > 1) {
        accuracyHtml += `<div class="phase-accuracy">`;
        accuracyHtml += `<div class="phase-accuracy-title">${user ? 'Votre précision par phase' : 'Précision par phase'}</div>`;
        for (const p of phaseAccs) {
          const barClass = !showSide ? '' : (showSide === 'b' ? ' black' : '');
          accuracyHtml += `<div class="accuracy-row phase-row"><span class="accuracy-label">${p.label}</span><div class="accuracy-bar-bg"><div class="accuracy-bar${barClass}" style="width:${p.acc}%"></div></div><span class="accuracy-val">${p.acc}%</span></div>`;
        }
        accuracyHtml += `</div>`;
      }
    }

    const card = $('#intro-card');
    let html = `<p>${line1} ${line2}</p>`;
    if (dateLine || openingLine) {
      html += '<div class="intro-meta">';
      if (dateLine) html += `<span class="intro-date">📅 ${dateLine}</span>`;
      if (openingLine) html += `<span class="intro-opening-line">📖 ${openingLine}</span>`;
      html += '</div>';
    }
    html += `<p class="intro-narrative">${narrative}</p>`;
    html += accuracyHtml;
    $('#intro-text').innerHTML = html;
    const toggle = $('#intro-text .opening-toggle');
    if (toggle) {
      const openModal = () => openOpeningExplorer(opening, analysis);
      toggle.addEventListener('click', openModal);
      toggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); } });
    }
    card.hidden = false;
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

  function openOpeningExplorer(opening, analysis, footerOverride, flip) {
    if (!opening || !opening.line) return;

    const prevFlip = BoardRenderer.isFlipped();
    if (flip !== undefined) BoardRenderer.setFlipped(flip);

    const modal = $('#opening-modal');
    const svg = $('#opening-modal-svg');
    const titleEl = $('#opening-modal-title');
    const ecoEl = $('#opening-modal-eco');
    const labelEl = $('#opening-modal-move-label');
    const explEl = $('#opening-modal-explanation');
    const evalEl = $('#opening-modal-eval');
    const detailsEl = $('#opening-modal-details');
    const footerEl = $('#opening-modal-footer');
    const prevBtn = $('#opening-modal-prev');
    const nextBtn = $('#opening-modal-next');

    const tokens = opening.line.split(' ');
    const game = new Chess();
    const positions = [{ fen: game.fen(), move: null, san: null, color: null, num: 0 }];
    for (let i = 0; i < tokens.length; i++) {
      const made = game.move(tokens[i], { sloppy: true });
      if (!made) break;
      positions.push({ fen: game.fen(), move: made, san: tokens[i], color: made.color, num: i + 1 });
    }

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

    if ((rich || opening.showEval) && typeof StockfishEngine !== 'undefined') {
      evalEl.hidden = false;
      evalEl.innerHTML = `<span class="oe-text">⏳ Le moteur analyse la position…</span>`;
      (StockfishEngine.isReady() ? Promise.resolve() : StockfishEngine.init())
        .then(() => { engineOk = true; requestEval(); })
        .catch(() => { evalEl.hidden = true; });
    } else {
      evalEl.hidden = true;
    }

    let idx = 0;
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
        labelEl.textContent = `${prefix} ${pos.san}`;
        explEl.textContent = explainMove(pos.san, pos.color, moveNum, pos.fen);
      }
      requestEval();
    }

    function cleanup() {
      modal.classList.remove('visible');
      document.removeEventListener('keydown', onKey);
      if (flip !== undefined) BoardRenderer.setFlipped(prevFlip);
    }

    function onKey(e) {
      if (e.key === 'Escape') cleanup();
      if (e.key === 'ArrowLeft' && idx > 0) { idx--; renderStep(false); }
      if (e.key === 'ArrowRight' && idx < positions.length - 1) { idx++; renderStep(true); }
    }

    prevBtn.onclick = () => { if (idx > 0) { idx--; renderStep(false); } };
    nextBtn.onclick = () => { if (idx < positions.length - 1) { idx++; renderStep(true); } };
    $('#opening-modal-close').onclick = cleanup;
    modal.onclick = e => { if (e.target === modal) cleanup(); };
    document.addEventListener('keydown', onKey);

    idx = 0;
    modal.classList.add('visible');
    renderStep(false);
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

  function buildAccuracyHero(header, summary) {
    const hero = $('#accuracy-hero');
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
    hero.hidden = false;
  }

  function buildTurningPoint(header, analysis) {
    const card = $('#turning-card');
    const user = detectUser(header);

    const errs = [];
    let best = null;
    for (let i = 0; i < analysis.length; i++) {
      const r = analysis[i];
      if (!r || !r.move) continue;
      if (user && r.move.color !== user) continue;
      if (r.type !== 'blunder' && r.type !== 'mistake' && r.type !== 'inaccuracy') continue;
      errs.push(i);
      const weight = r.type === 'blunder' ? 3 : r.type === 'mistake' ? 2 : 1;
      const score = weight * 1000 + (r.winPctLoss || 0) * 100 + (r.cpLoss || 0) / 100;
      if (!best || score > best.score) best = { i, r, score };
    }

    if (!best) { card.hidden = true; return; }

    const i = best.i, r = best.r;
    const moveNo = Math.floor(i / 2) + 1;
    const dot = i % 2 === 0 ? '.' : '...';
    const isUser = user && r.move.color === user;
    const who = user ? (isUser ? '' : ' (adversaire)') : (r.move.color === 'w' ? ' (Blancs)' : ' (Noirs)');

    $('#turning-title').textContent = `Le tournant — coup ${moveNo}${who}`;
    const tip = (r.tipFr || '').replace(/<[^>]*>/g, '').trim();
    $('#turning-text').innerHTML = `<b>${moveNo}${dot} ${r.sanFr}</b> — ${tip}`;

    const actions = $('#turning-actions');
    actions.innerHTML = '';

    if (isUser && typeof GuessMove !== 'undefined') {
      const replay = document.createElement('button');
      replay.className = 'pill pill-gold';
      replay.textContent = 'Rejouer ce coup';
      replay.onclick = () => GuessMove.start(currentAnalysis, currentHeader, currentUser, { indices: [i], title: '🎯 Le tournant' });
      actions.appendChild(replay);
    }

    const view = document.createElement('button');
    view.className = 'pill pill-ghost';
    view.textContent = "Voir l'échiquier";
    view.onclick = () => userNav(i + 1);
    actions.appendChild(view);

    if (user && errs.length > 1 && typeof GuessMove !== 'undefined') {
      const all = document.createElement('button');
      all.className = 'pill pill-ghost';
      all.textContent = `Revoir mes ${errs.length} erreurs`;
      all.onclick = () => GuessMove.start(currentAnalysis, currentHeader, currentUser, { indices: errs, title: '🎯 Tes coups à revoir' });
      actions.appendChild(all);
    }

    card.hidden = false;
  }

  function buildHighlights(header, analysis) {
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
        candidates.push({ index: i, label, score: 11, desc, badge: 'Occasion manquée' + badgeSuffix, badgeClass: 'miss', isUserMove, user, isWhite });
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

    candidates.sort((a, b) => b.score - a.score);

    const seen = new Set();
    const picks = [];
    for (const c of candidates) {
      if (seen.has(c.index)) continue;
      seen.add(c.index);
      picks.push(c);
      if (picks.length >= 5) break;
    }

    picks.sort((a, b) => a.index - b.index);

    const card = $('#highlights-card');
    const list = $('#highlights-list');

    if (picks.length === 0) {
      card.hidden = true;
      return;
    }

    list.innerHTML = '';
    for (const p of picks) {
      const r = analysis[p.index];
      let evalStr = '';
      if (r && typeof r.eval === 'number') {
        const v = Math.max(-99, Math.min(99, r.eval / 100));
        evalStr = (v >= 0 ? '+' : '') + v.toFixed(1);
      }
      const item = document.createElement('button');
      item.className = 'gm-chip ' + p.badgeClass;
      item.innerHTML = `
        <span class="gm-dot"></span>
        <span class="gm-move">${p.label}${markSpan(r.type)}</span>
        <span class="gm-label">${p.badge.toLowerCase()}</span>
        <span class="gm-eval">${evalStr}</span>`;
      item.addEventListener('click', () => userNav(p.index + 1));
      list.appendChild(item);
    }
    card.hidden = false;
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

  function buildMistakeProfile(header, analysis) {
    const card = $('#mistakes-card');
    const content = $('#mistakes-content');
    const user = detectUser(header);
    if (!user) { card.hidden = true; return; }

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

    if (errors.length === 0) { card.hidden = true; return; }

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

    content.innerHTML = html;
    card.hidden = false;
  }

  function buildMoveList(analysis) {
    const grid = $('#moves-grid');
    grid.innerHTML = '';

    for (let i = 0; i < analysis.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const numEl = document.createElement('span');
      numEl.className = 'move-num';
      numEl.textContent = moveNum + '.';
      grid.appendChild(numEl);

      const whiteCell = createMoveCell(analysis[i], i);
      grid.appendChild(whiteCell);

      if (i + 1 < analysis.length) {
        const blackCell = createMoveCell(analysis[i + 1], i + 1);
        grid.appendChild(blackCell);
      } else {
        grid.appendChild(document.createElement('span'));
      }
    }
  }

  function createMoveCell(result, index) {
    const cell = document.createElement('span');
    cell.className = 'move-cell';
    cell.dataset.index = index;
    const meta = MOVE_CLASS[result.type];
    cell.innerHTML = result.sanFr + markSpan(result.type);
    if (meta) cell.classList.add(meta.cls + '-move');
    cell.addEventListener('click', () => userNav(index + 1));
    return cell;
  }

  function buildSummary(summary, analysis) {
    const s = summary.stats;
    const pillsHtml = (side) => {
      let pills = '';
      if (side.brilliants) pills += `<span class="stat-pill brilliant">${side.brilliants} brillant${side.brilliants !== 1 ? 's' : ''}</span>`;
      if (side.great) pills += `<span class="stat-pill great">${side.great} formidable${side.great !== 1 ? 's' : ''}</span>`;
      if (side.best) pills += `<span class="stat-pill best">${side.best} meilleur${side.best !== 1 ? 's' : ''}</span>`;
      if (side.excellent) pills += `<span class="stat-pill excellent">${side.excellent} excellent${side.excellent !== 1 ? 's' : ''}</span>`;
      if (side.good) pills += `<span class="stat-pill good">${side.good} bon${side.good !== 1 ? 's' : ''}</span>`;
      if (side.book) pills += `<span class="stat-pill book">${side.book} théorique${side.book !== 1 ? 's' : ''}</span>`;
      if (side.inaccuracies) pills += `<span class="stat-pill inaccuracy">${side.inaccuracies} imprécision${side.inaccuracies !== 1 ? 's' : ''}</span>`;
      if (side.misses) pills += `<span class="stat-pill miss">${side.misses} occasion${side.misses !== 1 ? 's' : ''} manquée${side.misses !== 1 ? 's' : ''}</span>`;
      pills += `<span class="stat-pill mistake">${side.mistakes} erreur${side.mistakes !== 1 ? 's' : ''}</span>`;
      pills += `<span class="stat-pill blunder">${side.blunders} gaffe${side.blunders !== 1 ? 's' : ''}</span>`;
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
      html += `<div class="engine-badge">Analyse Stockfish · ~1,5 s/coup · 3 variantes</div>`;
    }

    if (summary.keyMoment) {
      const km = summary.keyMoment;
      const dot = km.index % 2 === 0 ? '.' : '...';
      html += `
        <div class="key-moment">
          <span class="km-icon">⚡</span>
          <div class="km-text">
            <b>Moment clé :</b> <span class="km-move" data-goto="${km.index + 1}">Coup ${km.moveNum} (${km.result.sanFr})</span><br>
            ${km.result.tipFr}
          </div>
        </div>`;
    }

    $('#summary-content').innerHTML = html;

    $$('.km-move[data-goto]').forEach(el => {
      el.addEventListener('click', () => userNav(+el.dataset.goto));
    });
  }

  function buildWinGraph(analysis) {
    const card = $('#win-graph-card');
    const container = $('#win-graph-container');
    if (!analysis.length || analysis[0].eval === undefined) { card.hidden = true; return; }

    const W = 480, H = 140, PAD_L = 0, PAD_R = 0, PAD_T = 4, PAD_B = 20;
    const graphW = W - PAD_L - PAD_R;
    const graphH = H - PAD_T - PAD_B;
    const n = analysis.length;

    const winPcts = analysis.map(r => {
      const cp = r.eval || 0;
      return Analyzer.cpToWinPct(r.move && r.move.color === 'b' ? -cp : cp);
    });
    const whiteWin = analysis.map(r => {
      const cp = r.eval || 0;
      return Analyzer.cpToWinPct(cp);
    });

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="win-graph-svg">`;
    svg += `<rect x="${PAD_L}" y="${PAD_T}" width="${graphW}" height="${graphH}" fill="var(--bg)" rx="4"/>`;
    svg += `<line x1="${PAD_L}" y1="${PAD_T + graphH/2}" x2="${PAD_L + graphW}" y2="${PAD_T + graphH/2}" stroke="rgba(255,255,255,0.15)" stroke-dasharray="4,4"/>`;

    const whitePoints = [];
    const areaTop = [];
    for (let i = 0; i < n; i++) {
      const x = PAD_L + (i / Math.max(1, n - 1)) * graphW;
      const y = PAD_T + (1 - whiteWin[i]) * graphH;
      whitePoints.push(`${x},${y}`);
      areaTop.push({ x, y });
    }

    const midY = PAD_T + graphH / 2;
    let areaPath = `M${PAD_L},${midY}`;
    for (const p of areaTop) areaPath += ` L${p.x},${p.y}`;
    areaPath += ` L${PAD_L + graphW},${midY} Z`;
    svg += `<path d="${areaPath}" fill="rgba(255,255,255,0.12)"/>`;

    let areaBPath = `M${PAD_L},${midY}`;
    for (const p of areaTop) areaBPath += ` L${p.x},${p.y}`;
    areaBPath += ` L${PAD_L + graphW},${PAD_T + graphH} L${PAD_L},${PAD_T + graphH} Z`;
    svg += `<path d="${areaBPath}" fill="rgba(100,100,100,0.12)"/>`;

    svg += `<polyline points="${whitePoints.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;

    for (let i = 0; i < n; i++) {
      const r = analysis[i];
      if (r.type === 'blunder' || r.type === 'mistake') {
        const x = PAD_L + (i / Math.max(1, n - 1)) * graphW;
        const y = PAD_T + (1 - whiteWin[i]) * graphH;
        const color = r.type === 'blunder' ? 'var(--danger)' : 'var(--warning)';
        svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}" stroke="var(--bg)" stroke-width="1"/>`;
      }
    }

    for (let i = 0; i < n; i++) {
      const x = PAD_L + (i / Math.max(1, n - 1)) * graphW;
      svg += `<rect x="${x - graphW/(2*n)}" y="${PAD_T}" width="${graphW/n}" height="${graphH}" fill="transparent" class="win-graph-hit" data-move="${i + 1}" style="cursor:pointer"/>`;
    }

    const labelInterval = n <= 30 ? 5 : n <= 60 ? 10 : 20;
    for (let i = 0; i < n; i += labelInterval) {
      const x = PAD_L + (i / Math.max(1, n - 1)) * graphW;
      const moveNum = Math.floor(i / 2) + 1;
      svg += `<text x="${x}" y="${H - 4}" fill="var(--text-dim)" font-size="9" text-anchor="middle">${moveNum}</text>`;
    }

    svg += `<line id="win-graph-cursor" x1="0" y1="${PAD_T}" x2="0" y2="${PAD_T + graphH}" stroke="var(--accent)" stroke-width="1" opacity="0" pointer-events="none"/>`;
    svg += '</svg>';

    container.innerHTML = svg;
    card.hidden = false;

    container.querySelectorAll('.win-graph-hit').forEach(el => {
      el.addEventListener('click', () => userNav(+el.dataset.move));
    });
  }

  function updateWinGraphCursor(index) {
    const cursor = $('#win-graph-cursor');
    if (!cursor || !currentAnalysis) return;
    const n = currentAnalysis.length;
    const svg = cursor.closest('svg');
    if (!svg) return;
    const W = 480, PAD_L = 0, PAD_R = 0;
    const graphW = W - PAD_L - PAD_R;
    const x = PAD_L + ((index - 1) / Math.max(1, n - 1)) * graphW;
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.setAttribute('opacity', index > 0 ? '0.7' : '0');
  }

  // The opposite of time trouble: playing a 10-min game at blitz speed. Most
  // beginner blunders here are played in seconds with a nearly-full clock —
  // this card makes that visible and hammers the one rule that fixes it.
  function buildPace(header, analysis) {
    const card = $('#pace-card');
    if (!card) return;
    card.hidden = true;
    if (currentClocks.length < 4) return;
    const user = detectUser(header);
    if (!user) return;

    const clocks = currentClocks;
    const times = Analyzer.clocksToTimePerMove(clocks, currentIncrement);
    const tc = header.TimeControl || '';
    if (tc.includes('/')) return; // daily — no pace to manage
    const base = parseInt(tc) || 0;
    if (!base || base > 3600) return;

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
    if (userMoves < 4) return;

    const mmss = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
    const avgSpent = Math.round(spentTotal / Math.max(1, userMoves - 1));

    let verdict, cls;
    if (fastErrors.length) {
      const worst = fastErrors[0];
      verdict = `⚡ <b>Tu joues trop vite.</b> ${fastErrors.length === 1 ? 'Une erreur jouée' : fastErrors.length + ' erreurs jouées'} en moins de 15 secondes alors qu'il te restait plus de ${mmss(base / 2)} au compteur. Ce ne sont pas des fautes de niveau — ce sont des fautes de rythme : tu avais ${mmss(worst.remaining)} pour vérifier ce coup.`;
      cls = 'pace-fast';
    } else if (avgSpent < 12 && lastClock > base * 0.4) {
      verdict = `⚡ <b>${avgSpent}s par coup</b> et tu finis avec ${mmss(lastClock)} inutilisées : ton temps est ta meilleure arme, dépense-le.`;
      cls = 'pace-fast';
    } else if (lastClock < 30) {
      verdict = `🐢 Tu as fini à <b>${Math.round(lastClock)}s</b> — regarde la carte « Pression du temps » plus bas.`;
      cls = 'pace-slow';
    } else {
      verdict = `✅ Bon équilibre : ${avgSpent}s par coup, ${mmss(lastClock)} de réserve à la fin.`;
      cls = 'pace-ok';
    }

    let html = `<div class="pace-stats">
      <div class="pace-stat"><span class="pace-val">${mmss(Math.min(spentTotal, base))}</span><span class="pace-lbl">utilisé sur ${mmss(base)}</span></div>
      <div class="pace-stat"><span class="pace-val">${avgSpent}s</span><span class="pace-lbl">par coup</span></div>
      <div class="pace-stat"><span class="pace-val">${mmss(lastClock)}</span><span class="pace-lbl">restant à la fin</span></div>
    </div>
    <div class="pace-verdict">${verdict}</div>`;

    if (fastErrors.length) {
      html += `<div class="pace-chips">` + fastErrors.slice(0, 4).map(f =>
        `<button class="pace-chip" data-goto="${f.index + 1}">${f.label} · ${f.spent}s <span class="pace-chip-clk">(${mmss(f.remaining)} restants)</span></button>`
      ).join('') + `</div>`;
    }
    html += `<div class="pace-rule">📏 <b>Règle d'or :</b> après le coup 4, jamais moins de 15 secondes par coup. Échecs, Captures, Menaces — puis joue.</div>`;

    $('#pace-content').innerHTML = html;
    card.hidden = false;
    card.querySelectorAll('.pace-chip').forEach(el => el.addEventListener('click', () => userNav(+el.dataset.goto)));
  }

  function buildTimeTrouble(header, analysis) {
    const card = $('#time-trouble-card');
    const content = $('#time-trouble-content');
    card.hidden = true;
    if (currentClocks.length < 4) return;

    const clocks = currentClocks;

    const times = Analyzer.clocksToTimePerMove(clocks, currentIncrement);
    const user = detectUser(header);
    if (!user) return;

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

    if (movesUnder30 === 0) return;

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

    content.innerHTML = html;
    card.hidden = false;

    content.querySelectorAll('.tt-move-row').forEach(el => {
      el.addEventListener('click', () => userNav(+el.dataset.goto));
    });
  }

  const PIECE_SYMBOLS = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕' };

  function buildMaterialGraph(analysis) {
    const card = $('#material-graph-card');
    const container = $('#material-graph-container');
    if (!analysis.length) { card.hidden = true; return; }

    const n = analysis.length;
    const diffs = analysis.map(r => r.materialDiff || 0);
    const maxAbs = Math.max(1, ...diffs.map(d => Math.abs(d)));

    const W = 480, H = 140, PAD_L = 28, PAD_R = 4, PAD_T = 8, PAD_B = 20;
    const graphW = W - PAD_L - PAD_R;
    const graphH = H - PAD_T - PAD_B;
    const midY = PAD_T + graphH / 2;

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="material-graph-svg">`;
    svg += `<rect x="${PAD_L}" y="${PAD_T}" width="${graphW}" height="${graphH}" fill="var(--bg)" rx="4"/>`;
    svg += `<line x1="${PAD_L}" y1="${midY}" x2="${PAD_L + graphW}" y2="${midY}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;

    const yScale = (graphH / 2) / Math.max(maxAbs, 5);
    const points = [];

    for (let i = 0; i < n; i++) {
      const x = PAD_L + (i / Math.max(1, n - 1)) * graphW;
      const y = midY - diffs[i] * yScale;
      const clamped = Math.max(PAD_T, Math.min(PAD_T + graphH, y));
      points.push({ x, y: clamped, diff: diffs[i] });
    }

    let abovePath = `M${PAD_L},${midY}`;
    let belowPath = `M${PAD_L},${midY}`;
    for (const p of points) {
      abovePath += ` L${p.x},${Math.min(midY, p.y)}`;
      belowPath += ` L${p.x},${Math.max(midY, p.y)}`;
    }
    abovePath += ` L${PAD_L + graphW},${midY} Z`;
    belowPath += ` L${PAD_L + graphW},${midY} Z`;

    svg += `<path d="${abovePath}" fill="rgba(255,255,255,0.15)"/>`;
    svg += `<path d="${belowPath}" fill="rgba(140,140,140,0.15)"/>`;

    svg += `<polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;

    for (let i = 0; i < n; i++) {
      const r = analysis[i];
      if (r.type === 'blunder' || r.type === 'mistake') {
        const p = points[i];
        const color = r.type === 'blunder' ? 'var(--danger)' : 'var(--warning)';
        svg += `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}" stroke="var(--bg)" stroke-width="1"/>`;
      }
    }

    for (let i = 0; i < n; i++) {
      const r = analysis[i];
      if (!r.move || !r.move.captured) continue;
      const prevDiff = i > 0 ? (analysis[i - 1].materialDiff || 0) : 0;
      if (diffs[i] === prevDiff) continue;
      const p = points[i];
      const capturedKey = r.move.color === 'w' ? r.move.captured : r.move.captured.toUpperCase();
      const sym = PIECE_SYMBOLS[capturedKey] || '';
      if (sym) {
        const ty = p.y < midY ? p.y + 7 : p.y - 3;
        svg += `<text x="${p.x}" y="${ty}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.6)" style="pointer-events:none">${sym}</text>`;
      }
    }

    const ticks = [];
    for (let v = -Math.floor(maxAbs); v <= Math.floor(maxAbs); v++) {
      if (v === 0 || Math.abs(v) > maxAbs) continue;
      if (maxAbs > 5 && Math.abs(v) % 2 !== 0) continue;
      ticks.push(v);
    }
    for (const v of ticks) {
      const y = midY - v * yScale;
      if (y < PAD_T + 8 || y > PAD_T + graphH - 8) continue;
      svg += `<text x="${PAD_L - 4}" y="${y + 3}" fill="var(--text-dim)" font-size="9" text-anchor="end">${v > 0 ? '+' : ''}${v}</text>`;
    }
    svg += `<text x="${PAD_L - 4}" y="${midY + 3}" fill="rgba(255,255,255,0.4)" font-size="9" text-anchor="end">0</text>`;

    svg += `<line id="mat-graph-cursor" x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + graphH}" stroke="var(--accent)" stroke-width="1.5" opacity="0" stroke-dasharray="3,2"/>`;

    for (let i = 0; i < n; i++) {
      const x = PAD_L + (i / Math.max(1, n - 1)) * graphW;
      const wMat = analysis[i].fen ? materialFromFen(analysis[i].fen) : null;
      const tooltip = wMat ? `⚪ ${wMat.white} · ⚫ ${wMat.black} · Δ${diffs[i] >= 0 ? '+' : ''}${diffs[i]}` : '';
      svg += `<rect x="${x - graphW/(2*n)}" y="${PAD_T}" width="${graphW/n}" height="${graphH}" fill="transparent" class="mat-graph-hit" data-move="${i + 1}" style="cursor:pointer">`;
      if (tooltip) svg += `<title>${tooltip}</title>`;
      svg += `</rect>`;
    }

    const labelInterval = n <= 30 ? 5 : n <= 60 ? 10 : 20;
    for (let i = 0; i < n; i += labelInterval) {
      const x = PAD_L + (i / Math.max(1, n - 1)) * graphW;
      const moveNum = Math.floor(i / 2) + 1;
      svg += `<text x="${x}" y="${H - 4}" fill="var(--text-dim)" font-size="9" text-anchor="middle">${moveNum}</text>`;
    }

    svg += `<text x="${PAD_L + 4}" y="${PAD_T + 10}" fill="rgba(255,255,255,0.3)" font-size="8">⚪</text>`;
    svg += `<text x="${PAD_L + 4}" y="${PAD_T + graphH - 4}" fill="rgba(255,255,255,0.3)" font-size="8">⚫</text>`;

    svg += '</svg>';
    container.innerHTML = svg;
    card.hidden = false;

    container.querySelectorAll('.mat-graph-hit').forEach(el => {
      el.addEventListener('click', () => userNav(+el.dataset.move));
    });
  }

  function materialFromFen(fen) {
    const board = fen.split(' ')[0];
    const vals = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    let white = 0, black = 0;
    for (const ch of board) {
      const lower = ch.toLowerCase();
      if (vals[lower] !== undefined) {
        if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) white += vals[lower];
        else if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) black += vals[lower];
      }
    }
    return { white, black };
  }

  function updateMatGraphCursor(index) {
    const cursor = $('#mat-graph-cursor');
    if (!cursor || !currentAnalysis) return;
    const n = currentAnalysis.length;
    const svg = cursor.closest('svg');
    if (!svg) return;
    const W = 480, PAD_L = 28, PAD_R = 4;
    const graphW = W - PAD_L - PAD_R;
    const x = PAD_L + ((index - 1) / Math.max(1, n - 1)) * graphW;
    cursor.setAttribute('x1', x);
    cursor.setAttribute('x2', x);
    cursor.setAttribute('opacity', index > 0 ? '0.7' : '0');
  }

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

  function buildTimeChart(analysis) {
    const card = $('#time-chart-card');
    const container = $('#time-chart-container');
    if (currentClocks.length < 4) { card.hidden = true; return; }

    const clocks = currentClocks;

    const times = Analyzer.clocksToTimePerMove(clocks, currentIncrement);
    if (times.length === 0) { card.hidden = true; return; }

    const n = Math.min(times.length, analysis.length);
    const maxTime = Math.max(...times.slice(0, n), 1);

    const W = 480, H = 120, PAD_T = 4, PAD_B = 20;
    const graphH = H - PAD_T - PAD_B;
    const barW = Math.max(2, Math.min(12, (W / n) - 1));
    const gap = (W - barW * n) / (n + 1);

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="time-chart-svg">`;

    for (let i = 0; i < n; i++) {
      const x = gap + i * (barW + gap);
      const h = (times[i] / maxTime) * graphH;
      const y = PAD_T + graphH - h;
      const color = i % 2 === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(140,140,140,0.7)';
      const secs = Math.round(times[i]);
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" rx="1">`;
      svg += `<title>Coup ${Math.floor(i/2)+1}${i%2===0?'.':'...'}: ${secs}s</title>`;
      svg += `</rect>`;
    }

    const labelInterval = n <= 30 ? 5 : n <= 60 ? 10 : 20;
    for (let i = 0; i < n; i += labelInterval) {
      const x = gap + i * (barW + gap) + barW / 2;
      const moveNum = Math.floor(i / 2) + 1;
      svg += `<text x="${x}" y="${H - 4}" fill="var(--text-dim)" font-size="9" text-anchor="middle">${moveNum}</text>`;
    }

    svg += '</svg>';
    container.innerHTML = svg;
    card.hidden = false;
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
    $$('.tabbar .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
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
    if (tab === 'finales') { if (typeof Endgame !== 'undefined') Endgame.show(); return; }
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
    if (typeof Endgame !== 'undefined') { patch(Endgame, 'show', () => setTab('finales')); patch(Endgame, 'close', syncTabbar); }
    // Endgame/GuessMove are overlays toggling body.guess-open; re-sync the tab when one closes.
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
  }

  function loadRecent() {
    const games = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const section = $('#recent-section');
    const list = $('#recent-list');
    const hint = $('#home-hint');
    if (hint) hint.hidden = games.length > 0;

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
    if (typeof Training === 'undefined') return;
    const due = Training.dueCount();
    const badge = $('#tab-train-badge');
    if (!badge) return;
    badge.hidden = !(due > 0);
    badge.textContent = due > 99 ? '99+' : String(due);
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

  let _openPanel = null;

  function initPanels() {
    const overlay = $('#panel-overlay');
    const panels = { guide: $('#panel-guide'), notation: $('#panel-notation'), concepts: $('#panel-concepts'), openings: $('#panel-openings'), repertoire: $('#panel-repertoire'), technical: $('#panel-technical') };
    const btns = { guide: $('#btn-guide'), notation: $('#btn-notation'), concepts: $('#btn-concepts'), openings: $('#btn-openings'), technical: $('#btn-technical') };

    function openPanel(name) {
      if (name === 'repertoire' && typeof Repertoire !== 'undefined') Repertoire.renderPanel();
      Object.values(panels).forEach(p => { p.hidden = true; p.classList.remove('open'); });
      overlay.hidden = false;
      requestAnimationFrame(() => {
        overlay.classList.add('visible');
        panels[name].hidden = false;
        requestAnimationFrame(() => panels[name].classList.add('open'));
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
      if (e.key === 'Escape') closeAll();
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
        tile.addEventListener('click', () => { if (_openPanel) _openPanel(tile.dataset.panel); });
      });
      learnBound = true;
    }
  }

  // Tactics catalog lives in js/tactics.js (single source of truth).
  const CONCEPTS = (typeof Tactics !== 'undefined' && Tactics.CATALOG) ? Tactics.CATALOG : [];

  function initConcepts() {
    const host = $('#concepts-list');
    if (!host || typeof BoardRenderer === 'undefined') return;

    let lastCat = null, html = '';
    for (const c of CONCEPTS) {
      if (c.cat !== lastCat) { html += `<h4 class="concept-cat">${c.cat}</h4>`; lastCat = c.cat; }
      const diagram = c.fen
        ? `<div class="concept-diagram"><svg class="cd-board" viewBox="0 0 360 360"></svg><svg class="cd-arrows" viewBox="0 0 360 360"></svg></div>`
        : '';
      const en = c.en ? ` <span class="concept-en">${c.en}</span>` : '';
      const train = (c.puzzles && c.puzzles.length) ? ` <span class="concept-train" title="Entraînement disponible">🎯</span>` : '';
      html += `<div class="concept">${diagram}<div class="concept-body"><span class="concept-name">${c.name}${en}${train}</span><p>${c.desc}</p></div></div>`;
    }
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

    initConceptModal();
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
          Tactics.start(c.puzzles, c.name);
        };
      } else {
        actions.hidden = true;
        actions.innerHTML = '';
      }
    }
    overlay.classList.add('visible');
  }

  function initConceptModal() {
    const overlay = $('#concept-modal');
    const close = () => overlay.classList.remove('visible');
    $('#concept-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('visible')) {
        e.stopPropagation();
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
      desc: `Une configuration <b>passe-partout</b> : le fou sort en f4 et les Blancs jouent presque toujours les mêmes coups, quelle que soit la réponse noire. Peu de théorie, idéal pour gagner du temps et jouer sur plan.`,
      idea: `Un système « passe-partout » : on sort le fou en f4 (avant de jouer e3, pour ne pas l'enfermer) et on répète presque les mêmes coups quelle que soit la réponse noire. Peu de théorie, beaucoup de temps gagné.`,
      plans: { w: `Pyramide Ff4, e3, Fd3, c3, Cbd2, roque ; puis Ce5 et un assaut à l'aile roi si l'occasion se présente.`, b: `…c5 et …Db6 pour harceler b2 et d4, ou …Ff5 pour neutraliser le fou f4 par un échange ou …Cf6-h5.` },
      structure: `Structure fixe et symétrique d4-e3-c3 : sûre, mais peu ambitieuse si on la joue passivement, sur pilote automatique.`,
      mistakes: `Jouer en pilote automatique sans réagir quand les Noirs frappent par …c5 et …Db6 : b2 et d4 deviennent alors des cibles concrètes.`,
      deviations: [
        { label: `…c5 + …Db6`, note: `La meilleure réponse noire : elle attaque b2 et d4 à la fois. Les Blancs doivent défendre précisément (Db3 ou Cc3), sinon ils perdent l'initiative dès l'ouverture.` }
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
      const level = o.level ? `<p class="opening-level">${sideTag}${o.level}</p>` : '';
      html += `<div class="concept"><div class="concept-diagram"><svg class="cd-board" viewBox="0 0 360 360"></svg></div><div class="concept-body"><span class="concept-name">${o.name}${en}${eco}</span>${level}<p>${o.desc}</p></div></div>`;
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
      cards[i].addEventListener('click', () =>
        openOpeningExplorer({
          name: title, eco: o.eco, line: o.line, moves,
          idea: o.idea, plans: o.plans, structure: o.structure,
          mistakes: o.mistakes, deviations: o.deviations
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
  return { goTo, refreshHome, openOpeningExplorer, openPanel: (name) => { if (_openPanel) _openPanel(name); } };
})();
