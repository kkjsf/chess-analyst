// Endgame trainer — learn to convert winning endings into a checkmate.
// You play White (the winning side); Stockfish defends with the lone king
// (random legal move if the engine isn't available). Beginner-focused: the
// goal is to deliver basic mates without stalemating.
const Endgame = (() => {
  const $ = (s) => document.querySelector(s);

  const SCENARIOS = [
    { id: '2r', icon: '🪜', name: 'Deux tours (le plus simple)', fen: '4k3/8/8/8/8/8/8/R3K2R w - - 0 1',
      tip: "L'escalier : une tour barre une rangée, l'autre repousse le roi noir d'un cran. Garde tes tours loin du roi ennemi." },
    { id: 'q', icon: '👑', name: 'Dame + Roi', fen: '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1',
      tip: "Approche ton roi. Garde la dame à un saut de cavalier du roi noir (jamais juste à côté) pour éviter le PAT, puis mate au bord." },
    { id: 'r', icon: '🏰', name: 'Tour + Roi', fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
      tip: "Roi et tour ensemble : prends l'opposition avec ton roi face au roi noir, la tour donne l'échec qui le repousse vers le bord." },
    { id: 'p', icon: '♙', name: 'Pousser un pion', fen: '4k3/8/8/8/8/4P3/8/4K3 w - - 0 1',
      tip: "Mets ton ROI devant le pion (l'opposition), fais la dame, puis mate. Attention au pat quand le roi noir est coincé !" },
  ];

  let chess = null, sc = null, busy = false, selected = null, plies = 0;

  function show() {
    ensureDom();
    $('#eg-overlay').hidden = false;
    document.body.classList.add('guess-open');
    renderMenu();
  }
  function close() {
    const o = $('#eg-overlay');
    if (o) o.hidden = true;
    document.body.classList.remove('guess-open');
  }
  function ensureDom() {
    if ($('#eg-overlay')) return;
    const o = document.createElement('div');
    o.id = 'eg-overlay';
    o.className = 'guess-overlay';
    o.hidden = true;
    o.innerHTML = `<div class="guess-panel">
      <div class="guess-head"><button class="back-btn" id="eg-close">←</button>
      <span class="guess-title">🏰 Finales</span><span class="guess-score" id="eg-head-extra"></span></div>
      <div id="eg-stage"></div></div>`;
    document.body.appendChild(o);
    $('#eg-close').onclick = onClose;
  }
  function onClose() {
    if (sc) { sc = null; renderMenu(); } else close();
  }

  function renderMenu() {
    sc = null;
    $('#eg-head-extra').textContent = '';
    $('#eg-stage').innerHTML = `
      <p class="eg-intro">Transforme un avantage gagnant en victoire. Tu joues les Blancs ; l'ordinateur défend avec son roi. Objectif : mater (sans faire pat !).</p>
      <div class="eg-menu">${SCENARIOS.map(s => `
        <button class="eg-card" data-id="${s.id}">
          <span class="eg-card-icon">${s.icon}</span>
          <span class="eg-card-name">${s.name}</span>
        </button>`).join('')}</div>`;
    document.querySelectorAll('#eg-stage .eg-card').forEach(b =>
      b.onclick = () => start(SCENARIOS.find(x => x.id === b.dataset.id)));
  }

  function start(scenario) {
    sc = scenario;
    chess = new Chess(scenario.fen);
    plies = 0; selected = null; busy = false;
    renderBoard('À toi de jouer — les Blancs matent.');
  }

  function renderBoard(status, statusCls) {
    $('#eg-head-extra').textContent = sc.icon + ' ' + sc.name.split(' (')[0];
    $('#eg-stage').innerHTML = `
      <div class="eg-tip">🎯 ${sc.tip}</div>
      <div class="guess-board-wrap">
        <svg viewBox="0 0 360 360" id="eg-board"></svg>
        <svg viewBox="0 0 360 360" id="eg-arrows" class="arrow-overlay"></svg>
      </div>
      <div class="guess-feedback ${statusCls || ''}" id="eg-status">${status}</div>
      <div class="guess-nav">
        <button class="train-btn ghost" id="eg-restart">↻ Recommencer</button>
        <button class="train-btn ghost" id="eg-other">Autre finale</button>
      </div>`;
    BoardRenderer.setFlipped(false);
    BoardRenderer.render($('#eg-board'), chess.fen());
    BoardRenderer.clearArrows($('#eg-arrows'));
    attachClicks();
    $('#eg-restart').onclick = () => start(sc);
    $('#eg-other').onclick = () => { sc = null; renderMenu(); };
  }

  function setStatus(msg, cls) {
    const el = $('#eg-status');
    if (!el) return;
    el.className = 'guess-feedback ' + (cls || '');
    el.innerHTML = msg;
  }

  function attachClicks() {
    const b = $('#eg-board');
    b.onclick = (e) => {
      if (busy || chess.game_over()) return;
      const sq = BoardRenderer.coordToSquare(b, e.clientX, e.clientY);
      if (!sq) return;
      const arrows = $('#eg-arrows');
      if (!selected) {
        const pc = chess.get(sq);
        if (!pc || pc.color !== 'w') return; // pick your own piece first
        selected = sq;
        BoardRenderer.highlightSquares(arrows, [sq], '#e2b857');
      } else if (sq === selected) {
        selected = null;
        BoardRenderer.clearArrows(arrows);
      } else {
        const from = selected; selected = null;
        BoardRenderer.clearArrows(arrows);
        userMove(from, sq);
      }
    };
  }

  async function userMove(from, to) {
    const prevFen = chess.fen();
    let m = null;
    try { m = chess.move({ from, to, promotion: 'q' }); } catch (_) {}
    if (!m) { setStatus('⚠️ Coup illégal — clique ta pièce puis sa case d\'arrivée.', 'wrong'); return; }
    plies++;
    BoardRenderer.renderAnimated($('#eg-board'), prevFen, chess.fen(), m, 200);
    if (finish(false)) return;
    busy = true;
    setStatus('L\'adversaire réfléchit…');
    await defenderMove();
    busy = false;
    finish(true);
  }

  async function defenderMove() {
    let uci = null;
    try {
      await StockfishEngine.init();
      const r = await StockfishEngine.evaluate(chess.fen(), 'movetime 300');
      uci = r && r.bestMove;
    } catch (_) {}
    const prevFen = chess.fen();
    let m = null;
    if (uci && uci.length >= 4) {
      try { m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); } catch (_) {}
    }
    if (!m) {
      const ms = chess.moves({ verbose: true });
      if (ms.length) m = chess.move(ms[Math.floor(Math.random() * ms.length)]);
    }
    if (m && $('#eg-board')) BoardRenderer.renderAnimated($('#eg-board'), prevFen, chess.fen(), m, 200);
  }

  // Returns true if the game has ended.
  function finish(afterDefender) {
    if (chess.in_checkmate()) {
      if (chess.turn() === 'w') setStatus('Échec et mat contre toi… recommence !', 'wrong');
      else setStatus(`🎉 Échec et mat en ${plies} coups ! Bravo, finale gagnée.`, 'right');
      lockBoard(); return true;
    }
    if (chess.in_stalemate()) {
      setStatus('😬 PAT ! Le roi noir n\'a aucun coup légal mais n\'est pas en échec → partie nulle. Laisse-lui toujours une case, ou rapproche ton roi avant de l\'enfermer.', 'wrong');
      lockBoard(); return true;
    }
    if (chess.insufficient_material() || chess.in_draw()) {
      setStatus('Finale nulle (plus assez de matériel, ou règle des 50 coups). Garde bien ta pièce !', 'wrong');
      lockBoard(); return true;
    }
    setStatus(afterDefender ? 'À toi.' : 'Bon coup — continue.');
    return false;
  }

  function lockBoard() {
    const b = $('#eg-board');
    if (b) b.onclick = null;
  }

  return { show, close };
})();
