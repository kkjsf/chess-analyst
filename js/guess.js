// Guess the move — replay one of YOUR analysed games move by move and try to
// find each of your own moves before it's revealed. Scored against the engine
// line already computed for the game (no extra engine work).
const GuessMove = (() => {
  const $ = (s) => document.querySelector(s);

  let plies = [];
  let gi = 0, score = 0, answered = false, selected = null;
  let userColor = 'w';
  let title = '🎯 Devine le coup';
  let focused = false;

  // opts.indices: restrict the drill to these analysis indices (focused mode).
  // opts.title: override the overlay title.
  function start(analysis, header, color, opts) {
    opts = opts || {};
    userColor = color || 'w';
    title = opts.title || '🎯 Devine le coup';
    const only = opts.indices ? new Set(opts.indices) : null;
    focused = !!only;
    plies = [];
    for (let i = 0; i < (analysis || []).length; i++) {
      const r = analysis[i];
      if (!r || !r.move || r.move.color !== userColor || !r.fenBefore) continue;
      if (only && !only.has(i)) continue;
      plies.push({
        moveNo: Math.floor(i / 2) + 1,
        fenBefore: r.fenBefore,
        playedFrom: r.move.from, playedTo: r.move.to,
        playedSan: r.sanFr || r.move.san || '?',
        bestUci: r.bestUci || '', bestSan: r.bestSan || '',
        type: r.type || '',
      });
    }
    gi = 0; score = 0;
    ensureDom();
    $('#guess-overlay').hidden = false;
    document.body.classList.add('guess-open');
    render();
  }

  function close() {
    const ov = $('#guess-overlay');
    if (ov) ov.hidden = true;
    document.body.classList.remove('guess-open');
  }

  function ensureDom() {
    if ($('#guess-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'guess-overlay';
    ov.className = 'guess-overlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="guess-panel">
        <div class="guess-head">
          <button class="back-btn" id="guess-close">←</button>
          <span class="guess-title" id="guess-title">🎯 Devine le coup</span>
          <span class="guess-score" id="guess-score"></span>
        </div>
        <div id="guess-stage"></div>
      </div>`;
    document.body.appendChild(ov);
    $('#guess-close').onclick = close;
  }

  function render() {
    const stage = $('#guess-stage');
    const titleEl = $('#guess-title');
    if (titleEl) titleEl.textContent = title;
    $('#guess-score').textContent = plies.length ? `${score} / ${gi}` : '';
    if (!plies.length) {
      stage.innerHTML = `<div class="guess-empty">Aucun coup à deviner.<br><span>Analyse une partie où tu as joués des coups, puis relance.</span></div>`;
      return;
    }
    if (gi >= plies.length) {
      const pct = Math.round(score / plies.length * 100);
      const verdict = pct >= 70 ? 'Superbe vision !' : pct >= 40 ? 'Pas mal — continue à t\'entraîner.' : 'Rejoue et analyse : tu vas vite progresser.';
      stage.innerHTML = `<div class="guess-empty">Partie terminée !<br><b class="guess-final">${score} / ${plies.length}</b> bons coups (${pct}%)<br><span>${verdict}</span>
        <div class="guess-actions"><button class="train-btn good" id="guess-restart">↺ Recommencer</button></div></div>`;
      $('#guess-restart').onclick = () => { gi = 0; score = 0; render(); };
      return;
    }
    const p = plies[gi];
    answered = false; selected = null;
    stage.innerHTML = `
      <div class="guess-prompt">Coup ${p.moveNo} — trait aux <b>${userColor === 'w' ? 'Blancs' : 'Noirs'}</b>. Quel coup joues-tu ?</div>
      <div class="guess-board-wrap">
        <svg viewBox="0 0 360 360" id="guess-board"></svg>
        <svg viewBox="0 0 360 360" id="guess-arrows" class="arrow-overlay"></svg>
      </div>
      <div class="guess-feedback" id="guess-feedback">Clique ta pièce, puis sa case d'arrivée.</div>
      <div class="guess-nav" id="guess-nav">
        <button class="train-btn ghost" id="guess-skip">Je donne ma langue au chat</button>
      </div>`;
    BoardRenderer.setFlipped(userColor === 'b');
    BoardRenderer.render($('#guess-board'), p.fenBefore);
    BoardRenderer.clearArrows($('#guess-arrows'));
    attachClicks();
    $('#guess-skip').onclick = () => reveal(null);
  }

  function legalTargets(fen, from) {
    try {
      return new Chess(fen).moves({ square: from, verbose: true }).map(m => ({ to: m.to, capture: !!m.captured }));
    } catch (_) { return []; }
  }

  function attachClicks() {
    const b = $('#guess-board');
    b.onclick = (e) => {
      if (answered) return;
      const sq = BoardRenderer.coordToSquare(b, e.clientX, e.clientY);
      if (!sq) return;
      const arrows = $('#guess-arrows');
      if (!selected) {
        selected = sq;
        BoardRenderer.showMoveHints(arrows, sq, legalTargets(plies[gi].fenBefore, sq));
      } else if (sq === selected) {
        selected = null;
        BoardRenderer.clearArrows(arrows);
      } else {
        const from = selected;
        selected = null;
        BoardRenderer.clearArrows(arrows);
        submit(from, sq);
      }
    };
  }

  function submit(from, to) {
    const p = plies[gi];
    let ok = false;
    try {
      const g = new Chess(p.fenBefore);
      ok = !!g.move({ from, to, promotion: 'q' });
    } catch (_) {}
    if (!ok) {
      const fb = $('#guess-feedback');
      fb.className = 'guess-feedback wrong';
      fb.textContent = '⚠️ Coup illégal — clique la pièce puis sa case d\'arrivée.';
      return;
    }
    reveal({ from, to });
  }

  function reveal(guess) {
    answered = true;
    const p = plies[gi];
    const bu = p.bestUci;
    const hasBest = bu && bu.length >= 4;
    const isBest = guess && hasBest && (guess.from + guess.to) === bu.slice(0, 4);
    const isPlayed = guess && guess.from === p.playedFrom && guess.to === p.playedTo;
    const playedWasError = p.type === 'blunder' || p.type === 'mistake' || p.type === 'inaccuracy';

    let good = false, cls = 'shown', msg;
    if (isBest) {
      good = true; cls = 'right';
      msg = `✅ Coup parfait — <b>${p.bestSan || 'le meilleur coup'}</b> !`;
    } else if (isPlayed && !playedWasError) {
      good = true; cls = 'right';
      msg = `✅ Bon coup — c'est exactement ce que tu avais joué.`;
    } else if (isPlayed && playedWasError) {
      cls = 'wrong';
      msg = `❌ C'est le coup que tu avais joué… et c'était une erreur. Le moteur préférait <b>${p.bestSan || '—'}</b>.`;
    } else if (guess) {
      msg = `Le moteur jouait <b>${p.bestSan || '—'}</b>. En partie, tu avais joué ${p.playedSan}.`;
    } else {
      msg = `Solution : <b>${p.bestSan || p.playedSan}</b>. En partie, tu avais joué ${p.playedSan}.`;
    }
    if (good) score++;

    if (hasBest) {
      BoardRenderer.drawArrows($('#guess-arrows'), [{ from: bu.slice(0, 2), to: bu.slice(2, 4), color: '#56b886', opacity: 0.9, width: 6 }]);
    }
    const fb = $('#guess-feedback');
    fb.className = 'guess-feedback ' + cls;
    fb.innerHTML = msg;
    $('#guess-score').textContent = `${score} / ${gi + 1}`;
    $('#guess-nav').innerHTML = `<button class="train-btn good" id="guess-next">${gi < plies.length - 1 ? 'Coup suivant ▶' : 'Voir le résultat'}</button>`;
    $('#guess-next').onclick = () => { gi++; render(); };
  }

  return { start, close };
})();
