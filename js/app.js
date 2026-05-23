const App = (() => {
  const STORAGE_KEY = 'chess-analyst-games';
  let currentAnalysis = null;
  let currentIndex = 0;
  let gameHistory = [];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function init() {
    bindEvents();
    loadRecent();
    handleShareTarget();
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

  async function onAnalyze() {
    const pgnText = $('#pgn-input').value.trim();
    if (!pgnText) {
      showError('Collez un PGN pour commencer.');
      return;
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

    const summary = Analyzer.generateSummary(analysis);
    summary.engineUsed = engineUsed;

    saveGame(pgnText, header, moves.length);
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

    $('#top-name').textContent = black;
    $('#top-elo').textContent = blackElo;
    $('#bottom-name').textContent = white;
    $('#bottom-elo').textContent = whiteElo;

    $('#move-slider').max = analysis.length;
    $('#move-slider').value = 0;

    buildIntro(header, analysis, summary);
    buildHighlights(header, analysis);
    buildMoveList(analysis);
    buildSummary(summary, analysis);

    $('#screen-import').classList.remove('active');
    $('#screen-analysis').classList.add('active');

    goTo(0);
  }

  function goTo(index) {
    if (!currentAnalysis) return;
    index = Math.max(0, Math.min(index, currentAnalysis.length));
    currentIndex = index;

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
    $('#top-captured').textContent = captured.white;
    $('#bottom-captured').textContent = captured.black;

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
    if (index > 0 && currentAnalysis[index - 1].arrow) {
      const a = currentAnalysis[index - 1].arrow;
      if (a.from && a.to) BoardRenderer.drawArrow(arrowSvg, a.from, a.to);
    }

    if (index === 0) {
      $('#tip-badge').textContent = '';
      $('#tip-badge').className = 'eval-badge';
      $('#tip-text').innerHTML = 'Position de départ. Utilisez les boutons ou le curseur pour naviguer dans la partie.';
    } else {
      const r = currentAnalysis[index - 1];
      const moveNum = Math.floor((index - 1) / 2) + 1;
      const dot = (index - 1) % 2 === 0 ? '.' : '...';
      $('#tip-text').innerHTML = `<b>${moveNum}${dot} ${r.sanFr}</b> — ${r.tipFr}`;

      const badge = $('#tip-badge');
      badge.className = 'eval-badge';
      if (r.type === 'brilliant') { badge.textContent = 'Brillant !'; badge.classList.add('brilliant'); }
      else if (r.type === 'blunder') { badge.textContent = 'Gaffe !'; badge.classList.add('blunder'); }
      else if (r.type === 'mistake') { badge.textContent = 'Erreur'; badge.classList.add('mistake'); }
      else if (r.type === 'inaccuracy') { badge.textContent = 'Imprécision'; badge.classList.add('inaccuracy'); }
      else if (r.type === 'good') { badge.textContent = 'Bon coup'; badge.classList.add('good'); }
      else { badge.textContent = ''; }
    }

    $('#move-slider').value = index;
    const total = currentAnalysis.length;
    $('#move-counter').textContent = `Coup ${index}/${total}`;

    $$('.move-cell').forEach(cell => cell.classList.remove('active'));
    if (index > 0) {
      const cell = $(`.move-cell[data-index="${index - 1}"]`);
      if (cell) {
        cell.classList.add('active');
        cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function scrollToBoard() {
    $('#board-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const totalBlunders = s.w.blunders + s.b.blunders;
    const totalMistakes = s.w.mistakes + s.b.mistakes + (s.w.inaccuracies || 0) + (s.b.inaccuracies || 0);
    const totalGood = s.w.good + s.b.good;

    let line3 = '';
    if (user) {
      if (userStats.blunders === 0 && userStats.mistakes === 0) {
        line3 = 'Aucune gaffe ni imprécision de votre part — partie solide !';
      } else if (userStats.blunders === 0 && userStats.mistakes <= 2) {
        line3 = 'Très peu d\'imprécisions de votre côté, c\'est du bon travail.';
      } else if (userStats.blunders >= 2 && userWon) {
        line3 = 'Vous avez gagné malgré quelques gaffes — votre adversaire n\'a pas su en profiter.';
      } else if (userStats.blunders >= 2 && userLost) {
        line3 = 'Plusieurs gaffes vous ont coûté la partie. Regardez les moments clés pour comprendre.';
      } else if (userStats.blunders === 1 && userLost) {
        line3 = 'Une seule gaffe, mais elle a été décisive. Voyons laquelle.';
      } else if (userStats.good >= 5) {
        line3 = 'Vous avez trouvé de nombreux bons coups — continuez comme ça !';
      } else if (userLost && oppStats.blunders === 0) {
        line3 = 'Votre adversaire a joué solidement. Voyons où vous pouviez faire mieux.';
      } else {
        line3 = 'Voyons les moments clés pour identifier les axes de progression.';
      }
    } else {
      if (totalBlunders >= 4) {
        line3 = 'Une partie mouvementée avec beaucoup d\'erreurs des deux côtés.';
      } else if (totalBlunders === 0 && totalMistakes <= 2) {
        line3 = 'Une partie propre et bien jouée, avec très peu d\'imprécisions.';
      } else if (s.w.blunders >= 2 && s.b.blunders === 0 && result === '0-1') {
        line3 = 'Les Blancs ont commis plusieurs gaffes, permettant aux Noirs de prendre le contrôle.';
      } else if (s.b.blunders >= 2 && s.w.blunders === 0 && result === '1-0') {
        line3 = 'Les Noirs ont commis plusieurs gaffes, donnant l\'avantage aux Blancs.';
      } else if (s.w.blunders >= 2 || s.b.blunders >= 2) {
        line3 = 'Une partie marquée par des erreurs qui ont fait basculer l\'avantage.';
      } else if (analysis.length <= 30) {
        line3 = 'Une partie courte, décidée rapidement.';
      } else if (analysis.length >= 80) {
        line3 = 'Une longue bataille qui s\'est prolongée jusqu\'en finale.';
      } else if (totalGood >= 10) {
        line3 = 'Les deux joueurs ont trouvé de nombreux bons coups au fil de la partie.';
      } else {
        line3 = 'Une partie avec quelques moments décisifs qui ont fait basculer l\'avantage.';
      }
    }

    const card = $('#intro-card');
    $('#intro-text').innerHTML = `${line1} ${line2} ${line3}`;
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
        candidates.push({ index: i, label, score: 3, desc, badge: 'Bon coup' + badgeSuffix, badgeClass: 'bon-coup' });
      }

      if (i === analysis.length - 1 && (header.Result === '1-0' || header.Result === '0-1')) {
        const termLower = (header.Termination || '').toLowerCase();
        if (termLower.includes('checkmate') || termLower.includes('mat') || r.san.includes('#')) {
          const desc = isUserMove
            ? 'Échec et mat ! Belle conclusion.'
            : user
              ? 'Échec et mat par votre adversaire.'
              : `Échec et mat ! ${sideCapital} concluent la partie.`;
          candidates.push({ index: i, label, score: 20, desc, badge: 'Moment clé', badgeClass: 'moment-cle' });
        }
      }

      if (r.move.promotion) {
        const desc = isUserMove
          ? 'Vous promouvez un pion en dame — moment décisif, bien amené !'
          : user
            ? 'Promotion adverse en dame — danger !'
            : 'Promotion du pion en dame — un moment décisif.';
        candidates.push({ index: i, label, score: 12, desc, badge: 'Moment clé', badgeClass: 'moment-cle' });
      }

      if (r.type === 'blunder') {
        const prevDiff = i > 0 ? analysis[i - 1].materialDiff : 0;
        const swing = Math.abs(r.materialDiff - prevDiff);
        let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
        if (isUserMove) desc += ' À retenir pour la prochaine fois.';
        else if (user) desc += ' Une erreur adverse à exploiter !';
        candidates.push({ index: i, label, score: 10 + swing, desc, badge: 'Gaffe' + badgeSuffix, badgeClass: 'gaffe' });
      }

      if (r.type === 'inaccuracy') {
        let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
        candidates.push({ index: i, label, score: 4, desc, badge: 'Imprécision' + badgeSuffix, badgeClass: 'imprecision' });
      }

      if (r.type === 'mistake') {
        let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
        if (isUserMove) desc += ' Un point à travailler.';
        candidates.push({ index: i, label, score: 6, desc, badge: 'Erreur' + badgeSuffix, badgeClass: 'erreur' });
      }

      if (r.type === 'brilliant') {
        let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
        if (isUserMove) desc += ' Impressionnant !';
        candidates.push({ index: i, label, score: 15, desc, badge: 'Brillant !' + badgeSuffix, badgeClass: 'brillant' });
      }

      if (r.type === 'good' && r.move.captured) {
        const capturedVal = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[r.move.captured] || 0;
        if (capturedVal >= 5) {
          let desc = r.tipFr.replace(/<[^>]*>/g, '').substring(0, 120);
          if (isUserMove) desc += ' Bien vu !';
          else if (user) desc += ' Aïe, un coup douloureux pour vous.';
          candidates.push({ index: i, label, score: 8 + capturedVal, desc, badge: 'Bon coup' + badgeSuffix, badgeClass: isUserMove ? 'bon-coup' : 'gaffe' });
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
      item.innerHTML = `
        <span class="highlight-move">${p.label}</span>
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
      pills += `<span class="stat-pill good-moves">${side.good} bon${side.good !== 1 ? 's' : ''} coup${side.good !== 1 ? 's' : ''}</span>`;
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
      html += `<div class="engine-badge">Analyse Stockfish · profondeur 14</div>`;
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

      item.innerHTML = `
        <span class="result ${resultClass}">${resultLabel}</span>
        <span class="players">${g.white} vs ${g.black}</span>
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

  document.addEventListener('DOMContentLoaded', init);
  return { goTo };
})();
