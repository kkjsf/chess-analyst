const App = (() => {
  const STORAGE_KEY = 'chess-analyst-games';
  const CACHE_KEY = 'chess-analyst-cache';
  const MAX_CACHED = 5;
  let currentAnalysis = null;
  let currentIndex = 0;
  let currentHeader = null;
  let currentUser = null;
  let currentPgn = null;
  let gameHistory = [];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function init() {
    bindEvents();
    loadRecent();
    handleShareTarget();
    initGlossary();
    initPanels();
  }

  function bindEvents() {
    $('#btn-analyze').addEventListener('click', onAnalyze);
    $('#btn-back').addEventListener('click', showImport);
    $('#btn-first').addEventListener('click', () => goTo(0));
    $('#btn-prev').addEventListener('click', () => goTo(currentIndex - 1));
    $('#btn-next').addEventListener('click', () => goTo(currentIndex + 1));
    $('#btn-last').addEventListener('click', () => goTo(currentAnalysis.length));
    $('#move-slider').addEventListener('input', (e) => goTo(+e.target.value));

    document.addEventListener('keydown', (e) => {
      if (!$('#screen-analysis').classList.contains('active')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex - 1); scrollToBoard(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex + 1); scrollToBoard(); }
      if (e.key === 'Home') { e.preventDefault(); goTo(0); scrollToBoard(); }
      if (e.key === 'End') { e.preventDefault(); goTo(currentAnalysis.length); scrollToBoard(); }
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
        if (dx > 0) goTo(currentIndex - 1);
        else goTo(currentIndex + 1);
        scrollToBoard();
      }
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

  function sanitizePgn(pgn) {
    let cleaned = pgn.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    cleaned = cleaned.replace(/\\'/g, "'");
    cleaned = cleaned.replace(/\\\\/g, '\\');
    cleaned = cleaned.replace(/\[Date\s+"([^"]*)"\]/g, (_, d) => {
      const m = d.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      return m ? `[Date "${m[1]}.${m[2].padStart(2,'0')}.${m[3].padStart(2,'0')}"]` : `[Date "${d}"]`;
    });
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

  function saveCachedAnalysis(key, analysis, summary) {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      const existing = cache.findIndex(c => c.key === key);
      if (existing >= 0) cache.splice(existing, 1);
      cache.unshift({ key, analysis, summary, savedAt: Date.now() });
      if (cache.length > MAX_CACHED) cache.length = MAX_CACHED;
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  function isGameCached(header, moveCount) {
    return !!getCachedAnalysis(cacheKey(header, moveCount));
  }

  async function fetchChessComPgn(url) {
    const gameMatch = url.match(/chess\.com\/(?:game\/)?(?:live|daily)\/(\d+)/);
    if (!gameMatch) return null;
    const gameId = gameMatch[1];
    showProgressBar('Récupération de la partie Chess.com...');
    try {
      const callbackUrl = `https://www.chess.com/callback/live/game/${gameId}`;
      const resp = await fetch(callbackUrl);
      if (!resp.ok) throw new Error('API error');
      const data = await resp.json();
      if (data.pgn) return data.pgn;
      if (data.pgnHeaders && data.moveList) {
        let pgn = '';
        for (const [k, v] of Object.entries(data.pgnHeaders)) pgn += `[${k} "${v}"]\n`;
        pgn += '\n' + data.moveList;
        return pgn;
      }
      throw new Error('No PGN in response');
    } catch (_) {
      try {
        const resp2 = await fetch(`https://api.chess.com/pub/game/live/${gameId}`);
        if (resp2.ok) {
          const data2 = await resp2.json();
          if (data2.pgn) return data2.pgn;
        }
      } catch (_2) {}
      return null;
    }
  }

  async function onAnalyze() {
    let pgnText = $('#pgn-input').value.trim();
    if (!pgnText) {
      showError('Collez un PGN pour commencer.');
      return;
    }

    const chessComMatch = pgnText.match(/^https?:\/\/(www\.)?chess\.com\//);
    if (chessComMatch) {
      const fetched = await fetchChessComPgn(pgnText);
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

    saveCachedAnalysis(ck, analysis, summary);
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

  function showAnalysis(header, moves, analysis, summary) {
    currentAnalysis = analysis;
    currentIndex = 0;
    currentHeader = header;
    currentUser = detectUser(header);

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
      const secs = parseInt(tc);
      if (secs <= 180) tcLabel = 'Bullet';
      else if (secs <= 600) tcLabel = 'Blitz';
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
    buildWinGraph(analysis);
    buildHighlights(header, analysis);
    buildMoveList(analysis);
    buildTimeChart(analysis);
    buildSummary(summary, analysis);
    probeEndgameTablebase(analysis);

    $('#screen-import').classList.remove('active');
    $('#screen-analysis').classList.add('active');

    goTo(0);
  }

  function goTo(index) {
    if (!currentAnalysis) return;
    index = Math.max(0, Math.min(index, currentAnalysis.length));
    currentIndex = index;
    altPreview = false;
    const backBtn = $('#alt-back');
    if (backBtn) backBtn.hidden = true;

    let fen, lastMove = null;
    if (index === 0) {
      fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    } else {
      const r = currentAnalysis[index - 1];
      fen = r.fen;
      lastMove = r.move;
    }

    BoardRenderer.render($('#board-svg'), fen, lastMove);

    const captured = BoardRenderer.getCapturedPieces(fen);
    const isFlipped = BoardRenderer.isFlipped();
    $('#top-captured').textContent = isFlipped ? captured.black : captured.white;
    $('#bottom-captured').textContent = isFlipped ? captured.white : captured.black;

    let evalPct;
    if (index > 0 && currentAnalysis[index - 1].eval !== undefined && currentAnalysis[index - 1].eval !== 0) {
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
      if (r.type === 'brilliant') { badge.textContent = 'Brillant !'; badge.classList.add('brilliant'); }
      else if (r.type === 'best') { badge.textContent = 'Meilleur'; badge.classList.add('best'); }
      else if (r.type === 'great') { badge.textContent = 'Excellent'; badge.classList.add('great'); }
      else if (r.type === 'blunder') { badge.textContent = 'Gaffe !'; badge.classList.add('blunder'); }
      else if (r.type === 'mistake') { badge.textContent = 'Erreur'; badge.classList.add('mistake'); }
      else if (r.type === 'inaccuracy') { badge.textContent = 'Imprécision'; badge.classList.add('inaccuracy'); }
      else if (r.type === 'good') { badge.textContent = 'Bon coup'; badge.classList.add('good'); }
      else { badge.textContent = ''; }
    }

    $('#move-slider').value = index;
    const total = currentAnalysis.length;
    $('#move-counter').textContent = `Coup ${index}/${total}`;

    updateWinGraphCursor(index);

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

  function scrollToBoard() {
    const board = $('#board-container');
    const boardRect = board.getBoundingClientRect();
    const viewH = window.innerHeight;
    if (boardRect.top >= -boardRect.height * 0.5 && boardRect.bottom <= viewH + boardRect.height * 0.5) return;
    board.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function detectUser(header) {
    const name = 'nimokaji';
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
      const secs = parseInt(tc);
      if (secs <= 180) tcLabel = 'en Bullet';
      else if (secs <= 600) tcLabel = 'en Blitz';
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

    const narrative = buildNarrative(analysis, user, userIsWhite, userWon, userLost, isDraw, s, userStats, oppStats, termLower, header, summary.opening);

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
    if (opening) openingLine = `<span class="intro-opening">${opening.name}</span> <span class="intro-eco">${opening.eco}</span>`;

    let accuracyHtml = '';
    if (summary.engineUsed) {
      const wPct = s.w.accuracy;
      const bPct = s.b.accuracy;
      accuracyHtml = `
        <div class="intro-accuracy">
          <div class="accuracy-row"><span class="accuracy-label">⚪ Précision</span><div class="accuracy-bar-bg"><div class="accuracy-bar" style="width:${wPct}%"></div></div><span class="accuracy-val">${wPct}%</span></div>
          <div class="accuracy-row"><span class="accuracy-label">⚫ Précision</span><div class="accuracy-bar-bg"><div class="accuracy-bar black" style="width:${bPct}%"></div></div><span class="accuracy-val">${bPct}%</span></div>
        </div>`;

      const phaseRanges = [
        { label: 'Ouverture', from: 0, to: Math.min(20, analysis.length) },
        { label: 'Milieu', from: 20, to: Math.min(50, analysis.length) },
        { label: 'Finale', from: 50, to: analysis.length }
      ];
      const showSide = user ? (userIsWhite ? 'w' : 'b') : null;
      const phaseAccs = phaseRanges.filter(p => p.from < analysis.length).map(p => {
        const sides = showSide ? [showSide] : ['w', 'b'];
        let totalWinLoss = 0, count = 0;
        for (let i = p.from; i < p.to; i++) {
          const r = analysis[i];
          if (!r.move) continue;
          if (sides.includes(r.move.color)) {
            totalWinLoss += r.winPctLoss || 0;
            count++;
          }
        }
        const avg = count > 0 ? totalWinLoss / count : 0;
        const acc = Math.max(0, Math.min(100, Math.round((1 - avg * 2) * 100)));
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
    card.hidden = false;
  }

  function buildNarrative(analysis, user, userIsWhite, userWon, userLost, isDraw, s, userStats, oppStats, termLower, header, opening) {
    const byTime = termLower.includes('time');
    const byMate = termLower.includes('checkmate') || termLower.includes('mat');
    const byResign = termLower.includes('resign') || termLower.includes('abandon');

    const phases = [
      { name: 'opening', from: 0, to: Math.min(20, analysis.length) },
      { name: 'middle', from: 20, to: Math.min(50, analysis.length) },
      { name: 'end', from: 50, to: analysis.length }
    ];

    const phaseErrors = phases.map(p => {
      let userBlunders = 0, userMistakes = 0, userInaccuracies = 0, oppBlunders = 0, oppMistakes = 0;
      for (let i = p.from; i < p.to; i++) {
        const r = analysis[i];
        if (!r.move) continue;
        const isUserMove = user && ((user === 'w' && r.move.color === 'w') || (user === 'b' && r.move.color === 'b'));
        if (r.type === 'blunder') { if (isUserMove) userBlunders++; else oppBlunders++; }
        if (r.type === 'mistake') { if (isUserMove) userMistakes++; else oppMistakes++; }
        if (r.type === 'inaccuracy') { if (isUserMove) userInaccuracies++; }
      }
      return { ...p, userBlunders, userMistakes, userInaccuracies, oppBlunders, oppMistakes };
    });

    let turningPoint = null;
    let biggestSwing = 0;
    for (let i = 1; i < analysis.length; i++) {
      const r = analysis[i];
      if (!r.move || (r.type !== 'blunder' && r.type !== 'mistake')) continue;
      const prevEval = analysis[i - 1]?.eval || 0;
      const swing = Math.abs((r.eval || 0) - prevEval);
      if (swing > biggestSwing) {
        biggestSwing = swing;
        const moveNum = Math.floor(i / 2) + 1;
        const dot = i % 2 === 0 ? '.' : '...';
        turningPoint = { moveNum, dot, san: r.sanFr, index: i, move: r.move, type: r.type };
      }
    }

    const tc = header ? (header.TimeControl || '') : '';
    let isFastTc = false;
    if (tc.includes('+')) {
      const secs = parseInt(tc);
      if (secs <= 180) isFastTc = true;
    }

    const lines = [];
    const [op, mid, end] = phaseErrors;

    if (user) {
      if (opening) {
        if (op.userBlunders === 0 && op.userMistakes === 0) {
          lines.push(`Vous jouez la ${opening.name} de façon solide, sans erreur dans les premiers coups.`);
        } else if (op.userBlunders > 0) {
          lines.push(`Dans la ${opening.name}, vous trébuchez rapidement — votre adversaire prend l'avantage dès les premiers échanges.`);
        } else {
          lines.push(`La ${opening.name} se passe correctement malgré quelques imprécisions de votre part.`);
        }
      } else {
        if (op.userBlunders === 0 && op.userMistakes === 0 && op.oppBlunders === 0) {
          lines.push('Les premiers coups se déroulent sans accroc des deux côtés.');
        } else if (op.userBlunders > 0) {
          lines.push('Vous trébuchez dès l\'ouverture, offrant un avantage précoce à votre adversaire.');
        } else if (op.oppBlunders > 0) {
          lines.push('Votre adversaire fait une erreur en ouverture et vous prenez un avantage rapide.');
        } else if (op.userMistakes > 0) {
          lines.push('Quelques imprécisions en ouverture vous placent dans une position légèrement inconfortable.');
        }
      }

      if (turningPoint) {
        const isUserTP = (user === 'w' && turningPoint.move.color === 'w') || (user === 'b' && turningPoint.move.color === 'b');
        if (isUserTP) {
          lines.push(`Votre ${turningPoint.moveNum}${turningPoint.dot} ${turningPoint.san} est le tournant de la partie — une ${turningPoint.type === 'blunder' ? 'gaffe' : 'erreur'} qui change l'évaluation.`);
        } else {
          lines.push(`Au coup ${turningPoint.moveNum}, votre adversaire gaffe avec ${turningPoint.san} — un tournant que vous exploitez bien.`);
        }
      } else if (mid.from < analysis.length) {
        if (mid.userMistakes === 0 && mid.userBlunders === 0 && mid.oppMistakes === 0 && mid.oppBlunders === 0) {
          lines.push('Le milieu de partie est tendu mais propre, sans erreur des deux côtés.');
        } else if (mid.userBlunders >= 2) {
          lines.push('Le milieu de partie est chaotique avec plusieurs gaffes de votre part.');
        } else if (mid.oppBlunders >= 2) {
          lines.push('Votre adversaire multiplie les erreurs en milieu de partie.');
        }
      }

      if (end.to > end.from && analysis.length > 50) {
        if (end.userBlunders > 0 && userLost) {
          const lastBlunder = [...analysis].reverse().find(r => r.type === 'blunder' && r.move && ((user === 'w' && r.move.color === 'w') || (user === 'b' && r.move.color === 'b')));
          if (lastBlunder) {
            const idx = analysis.indexOf(lastBlunder);
            const mn = Math.floor(idx / 2) + 1;
            lines.push(`La finale vous échappe avec ${mn}${idx % 2 === 0 ? '.' : '...'} ${lastBlunder.sanFr} qui scelle la partie.`);
          } else {
            lines.push('Une erreur tardive en finale scelle l\'issue.');
          }
        } else if (end.oppBlunders > 0 && userWon) {
          lines.push('En finale, votre adversaire craque et vous convertissez.');
        } else if (end.userMistakes === 0 && end.oppMistakes === 0) {
          lines.push('Finale bien maîtrisée avec un jeu précis jusqu\'au bout.');
        }
      }

      if (userWon) {
        if (byMate) {
          lines.push('Mat conclusif — la meilleure façon de finir !');
        } else if (byTime) {
          if (isFastTc && oppStats.blunders >= 1) {
            lines.push('Sous la pression de la pendule, votre adversaire craque. Bien géré.');
          } else if (userStats.blunders >= 2) {
            lines.push('Victoire au temps, mais la position était fragile — à retravailler.');
          } else {
            lines.push('Victoire au temps grâce à une bonne gestion de la pendule.');
          }
        } else if (byResign) {
          if (userStats.blunders === 0 && userStats.mistakes === 0) {
            lines.push('Abandon adverse face à un jeu irréprochable — victoire nette.');
          } else {
            lines.push('Votre adversaire préfère abandonner dans une position sans espoir.');
          }
        } else {
          if (userStats.blunders === 0 && userStats.mistakes === 0) {
            lines.push('Partie sans faute de votre côté — victoire méritée.');
          } else if (oppStats.blunders > userStats.blunders) {
            lines.push('Vous profitez des erreurs adverses pour l\'emporter.');
          } else {
            lines.push('Victoire acquise, mais des gaffes auraient pu la compromettre.');
          }
        }
      } else if (userLost) {
        if (byTime && isFastTc) {
          if (userStats.blunders === 0) {
            lines.push('Défaite au temps dans une position jouable — la pendule fait la différence en Bullet.');
          } else {
            lines.push('Le temps et les erreurs s\'accumulent — difficile de s\'en sortir en cadence rapide.');
          }
        } else if (byMate) {
          lines.push('Mat adverse — revoyez les derniers coups pour repérer la menace plus tôt.');
        } else if (byTime) {
          lines.push('Défaite au temps. Pensez à jouer plus vite dans les positions simples.');
        } else if (userStats.blunders === 1 && !turningPoint) {
          lines.push('La défaite tient à une seule gaffe — un point précis à corriger.');
        } else if (userStats.blunders >= 2) {
          lines.push('Plusieurs gaffes ont conduit à cette défaite — revoyez les moments clés.');
        } else if (oppStats.blunders === 0 && oppStats.mistakes <= 1) {
          lines.push('Votre adversaire a joué très solidement — la marge de manœuvre était faible.');
        } else {
          lines.push('Défaite serrée où quelques imprécisions ont fait la différence.');
        }
      } else if (isDraw) {
        if (userStats.blunders === 0 && oppStats.blunders === 0) {
          lines.push('Partie nulle logique — jeu précis des deux côtés.');
        } else {
          lines.push('Les erreurs se compensent, menant au partage des points.');
        }
      }
    } else {
      const wLabel = 'les Blancs';
      const bLabel = 'les Noirs';
      if (opening) {
        lines.push(`${opening.name} — ouverture ${(op.userBlunders + op.oppBlunders === 0) ? 'correcte des deux côtés' : 'avec des erreurs précoces'}.`);
      } else if (op.userBlunders === 0 && op.oppBlunders === 0) {
        lines.push('Ouverture correcte des deux côtés.');
      }

      if (turningPoint) {
        const side = turningPoint.move.color === 'w' ? wLabel : bLabel;
        lines.push(`Le tournant : ${turningPoint.moveNum}${turningPoint.dot} ${turningPoint.san} — ${side} gaffent.`);
      }

      const totalBlunders = s.w.blunders + s.b.blunders;
      if (totalBlunders >= 4) {
        lines.push('Partie chaotique, riche en erreurs des deux côtés.');
      } else if (totalBlunders === 0 && s.w.mistakes + s.b.mistakes <= 2) {
        lines.push('Partie de bonne qualité avec très peu d\'imprécisions.');
      }
    }

    return lines.length > 0 ? lines.slice(0, 5).join(' ') : 'Consultez les moments clés ci-dessous pour le détail de la partie.';
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
        let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
        if (isUserMove) desc += ' À retenir pour la prochaine fois.';
        else if (user) desc += ' Une erreur adverse à exploiter !';
        candidates.push({ index: i, label, score: 10 + swing, desc, badge: 'Gaffe' + badgeSuffix, badgeClass: 'gaffe', isUserMove, user, isWhite });
      }

      if (r.type === 'inaccuracy') {
        let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
        candidates.push({ index: i, label, score: 4, desc, badge: 'Imprécision' + badgeSuffix, badgeClass: 'imprecision', isUserMove, user, isWhite });
      }

      if (r.type === 'mistake') {
        let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
        if (isUserMove) desc += ' Un point à travailler.';
        candidates.push({ index: i, label, score: 6, desc, badge: 'Erreur' + badgeSuffix, badgeClass: 'erreur', isUserMove, user, isWhite });
      }

      if (r.type === 'brilliant') {
        let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
        if (isUserMove) desc += ' Impressionnant !';
        candidates.push({ index: i, label, score: 15, desc, badge: 'Brillant !' + badgeSuffix, badgeClass: 'brillant', isUserMove, user, isWhite });
      }

      if ((r.type === 'good' || r.type === 'great' || r.type === 'best') && r.move.captured) {
        const capturedVal = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[r.move.captured] || 0;
        if (capturedVal >= 5) {
          let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
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
      const item = document.createElement('div');
      item.className = 'highlight-item';
      const sideLabel = p.user
        ? (p.isUserMove ? 'Vous' : 'Adversaire')
        : (p.isWhite ? 'Blancs' : 'Noirs');
      const sideClass = p.user
        ? (p.isUserMove ? 'tip-side-you' : 'tip-side-opp')
        : '';
      item.innerHTML = `
        <span class="highlight-move">${p.label}</span>
        <span class="tip-side-tag ${sideClass}">${sideLabel}</span>
        <span class="highlight-desc">${p.desc}</span>
        <span class="highlight-badge ${p.badgeClass}">${p.badge}</span>`;
      item.addEventListener('click', () => {
        goTo(p.index + 1);
        $('#board-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      list.appendChild(item);
    }
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
    cell.textContent = result.sanFr;
    if (result.type === 'brilliant') cell.classList.add('brilliant-move');
    if (result.type === 'best') cell.classList.add('best-move');
    if (result.type === 'great') cell.classList.add('great-move');
    if (result.type === 'blunder') cell.classList.add('blunder-move');
    if (result.type === 'mistake') cell.classList.add('mistake-move');
    if (result.type === 'inaccuracy') cell.classList.add('inaccuracy-move');
    if (result.type === 'good') cell.classList.add('good-move');
    cell.addEventListener('click', () => goTo(index + 1));
    return cell;
  }

  function buildSummary(summary, analysis) {
    const s = summary.stats;
    const pillsHtml = (side) => {
      let pills = '';
      if (side.brilliants) pills += `<span class="stat-pill brilliants">${side.brilliants} brillant${side.brilliants !== 1 ? 's' : ''}</span>`;
      if (side.best) pills += `<span class="stat-pill best-moves">${side.best} meilleur${side.best !== 1 ? 's' : ''}</span>`;
      if (side.great) pills += `<span class="stat-pill great-moves">${side.great} excellent${side.great !== 1 ? 's' : ''}</span>`;
      if (side.good) pills += `<span class="stat-pill good-moves">${side.good} bon${side.good !== 1 ? 's' : ''}</span>`;
      if (side.inaccuracies) pills += `<span class="stat-pill inaccuracies">${side.inaccuracies} imprécision${side.inaccuracies !== 1 ? 's' : ''}</span>`;
      pills += `<span class="stat-pill mistakes">${side.mistakes} erreur${side.mistakes !== 1 ? 's' : ''}</span>`;
      pills += `<span class="stat-pill blunders">${side.blunders} gaffe${side.blunders !== 1 ? 's' : ''}</span>`;
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
      html += `<div class="engine-badge">Analyse Stockfish · profondeur 18 · 3 variantes</div>`;
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
      el.addEventListener('click', () => goTo(+el.dataset.goto));
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
    for (const p of areaTop) areaBPath += ` L${p.x},${PAD_T + graphH - (p.y - PAD_T)}`;
    areaBPath = `M${PAD_L},${midY}`;
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
      el.addEventListener('click', () => {
        goTo(+el.dataset.move);
        $('#board-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
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

  function buildTimeChart(analysis) {
    const card = $('#time-chart-card');
    const container = $('#time-chart-container');
    if (!currentPgn) { card.hidden = true; return; }

    const clocks = Analyzer.parseClocks(currentPgn);
    if (clocks.length < 4) { card.hidden = true; return; }

    const times = Analyzer.clocksToTimePerMove(clocks);
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
      tbResults.push({ index: i, moveNum, dot, san: r.sanFr, category: tb.category, dtm: tb.dtm, dtz: tb.dtz, bestmove: tb.moves?.[0] });

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

    content.innerHTML = html;
    card.hidden = false;

    content.querySelectorAll('.tb-result').forEach(el => {
      el.addEventListener('click', () => {
        goTo(+el.dataset.goto);
        $('#board-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  function pieces7(tbResult) {
    return `${tbResult.san ? 'Position à ≤7 pièces' : ''}`;
  }

  function showImport() {
    $('#screen-analysis').classList.remove('active');
    $('#screen-import').classList.add('active');
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

    if (games.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    list.innerHTML = '';

    games.slice(0, 5).forEach((g, i) => {
      const item = document.createElement('div');
      item.className = 'recent-item';

      let resultClass = 'draw', resultLabel = 'Nulle';
      if (g.result === '1-0') { resultClass = 'win'; resultLabel = 'Victoire'; }
      else if (g.result === '0-1') { resultClass = 'loss'; resultLabel = 'Défaite'; }

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

    buildPatterns();
  }

  function buildPatterns() {
    const section = $('#patterns-section');
    if (!section) return;
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      if (cache.length < 2) { section.hidden = true; return; }

      const phases = ['opening', 'middle', 'endgame'];
      const phaseLabels = { opening: 'en ouverture', middle: 'en milieu de partie', endgame: 'en finale' };
      const counts = { opening: { blunders: 0, mistakes: 0, inaccuracies: 0, captures: 0 }, middle: { blunders: 0, mistakes: 0, inaccuracies: 0, captures: 0 }, endgame: { blunders: 0, mistakes: 0, inaccuracies: 0, captures: 0 } };

      for (const entry of cache) {
        if (!entry.analysis) continue;
        const a = entry.analysis;
        for (let i = 0; i < a.length; i++) {
          const r = a[i];
          if (!r.move) continue;
          const isUser = (r.move.color === 'w' && (entry.summary?.stats?.w)) || (r.move.color === 'b');
          const phase = i < 20 ? 'opening' : i < 50 ? 'middle' : 'endgame';
          if (r.type === 'blunder') counts[phase].blunders++;
          if (r.type === 'mistake') counts[phase].mistakes++;
          if (r.type === 'inaccuracy') counts[phase].inaccuracies++;
          if (r.type === 'blunder' && r.move.captured) counts[phase].captures++;
        }
      }

      const patterns = [];
      const totalBlunders = counts.opening.blunders + counts.middle.blunders + counts.endgame.blunders;
      const totalInaccuracies = counts.opening.inaccuracies + counts.middle.inaccuracies + counts.endgame.inaccuracies;

      for (const phase of phases) {
        if (totalBlunders > 0 && counts[phase].blunders / totalBlunders > 0.5 && counts[phase].blunders >= 2) {
          patterns.push(`Vous faites souvent des gaffes ${phaseLabels[phase]}.`);
        }
        if (totalInaccuracies > 0 && counts[phase].inaccuracies / totalInaccuracies > 0.5 && counts[phase].inaccuracies >= 3) {
          patterns.push(`Vos imprécisions arrivent surtout ${phaseLabels[phase]}.`);
        }
      }

      const totalCapBlunders = counts.opening.captures + counts.middle.captures + counts.endgame.captures;
      if (totalCapBlunders >= 2 && totalBlunders > 0 && totalCapBlunders / totalBlunders > 0.4) {
        patterns.push('Vous perdez souvent du matériel sur des échanges.');
      }

      if (patterns.length === 0) { section.hidden = true; return; }

      section.hidden = false;
      const list = $('#patterns-list');
      list.innerHTML = patterns.slice(0, 2).map(p => `<div class="pattern-item">${p}</div>`).join('');
    } catch (_) { section.hidden = true; }
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

  function initPanels() {
    const overlay = $('#panel-overlay');
    const panels = { guide: $('#panel-guide'), notation: $('#panel-notation'), technical: $('#panel-technical') };
    const btns = { guide: $('#btn-guide'), notation: $('#btn-notation'), technical: $('#btn-technical') };

    function openPanel(name) {
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

    Object.entries(btns).forEach(([name, btn]) => {
      if (btn) btn.addEventListener('click', () => openPanel(name));
    });
    overlay.addEventListener('click', closeAll);
    $$('.panel-close').forEach(btn => btn.addEventListener('click', closeAll));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });
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
  return { goTo };
})();
