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
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(currentIndex - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(currentIndex + 1); }
      if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      if (e.key === 'End') { e.preventDefault(); goTo(currentAnalysis.length); }
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
    cleaned = cleaned.replace(/\[Date\s+"[^"]*"\]/g, '[Date "2025.01.01"]');
    cleaned = cleaned.replace(/(\])\n(\d)/, '$1\n\n$2');
    return cleaned;
  }

  function onAnalyze() {
    const pgnText = $('#pgn-input').value.trim();
    if (!pgnText) {
      showError('Collez un PGN pour commencer.');
      return;
    }

    const chess = new Chess();
    let loaded = chess.load_pgn(pgnText, { sloppy: true });
    if (!loaded) loaded = chess.load_pgn(sanitizePgn(pgnText), { sloppy: true });
    if (!loaded) {
      showError('PGN invalide. Vérifiez le format et réessayez.');
      return;
    }

    hideError();
    const header = chess.header();
    const moves = chess.history({ verbose: true });

    if (moves.length === 0) {
      showError('Aucun coup trouvé dans ce PGN.');
      return;
    }

    const analysis = Analyzer.analyzeGame(chess, moves);
    const summary = Analyzer.generateSummary(analysis);

    saveGame(pgnText, header, moves.length);
    showAnalysis(header, moves, analysis, summary);
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

    const matDiff = Analyzer.materialCount(fen);
    const evalPct = Math.max(5, Math.min(95, 50 + matDiff.diff * 5));
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
      if (r.type === 'blunder') { badge.textContent = 'Gaffe !'; badge.classList.add('blunder'); }
      else if (r.type === 'mistake') { badge.textContent = 'Imprécision'; badge.classList.add('mistake'); }
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
    if (result.type === 'blunder') cell.classList.add('blunder-move');
    if (result.type === 'mistake') cell.classList.add('mistake-move');
    if (result.type === 'good') cell.classList.add('good-move');
    cell.addEventListener('click', () => goTo(index + 1));
    return cell;
  }

  function buildSummary(summary, analysis) {
    const s = summary.stats;
    let html = `
      <div class="summary-row">
        <span class="side-label">⚪</span>
        <div class="stat-pills">
          <span class="stat-pill blunders">${s.w.blunders} gaffe${s.w.blunders !== 1 ? 's' : ''}</span>
          <span class="stat-pill mistakes">${s.w.mistakes} imprécision${s.w.mistakes !== 1 ? 's' : ''}</span>
          <span class="stat-pill good-moves">${s.w.good} bon${s.w.good !== 1 ? 's' : ''} coup${s.w.good !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div class="summary-row">
        <span class="side-label">⚫</span>
        <div class="stat-pills">
          <span class="stat-pill blunders">${s.b.blunders} gaffe${s.b.blunders !== 1 ? 's' : ''}</span>
          <span class="stat-pill mistakes">${s.b.mistakes} imprécision${s.b.mistakes !== 1 ? 's' : ''}</span>
          <span class="stat-pill good-moves">${s.b.good} bon${s.b.good !== 1 ? 's' : ''} coup${s.b.good !== 1 ? 's' : ''}</span>
        </div>
      </div>`;

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
