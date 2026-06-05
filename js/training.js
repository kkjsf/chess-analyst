const Training = (() => {
  const KEY = 'chess-analyst-training';
  const MAX_ITEMS = 150;
  const DAY = 86400000;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const MOTIF_LABELS = {
    mat: 'Mat / mat forcé',
    fourchette: 'Fourchette',
    gain: 'Gain de matériel',
    attaque: 'Attaque / échec',
    manoeuvre: 'Coup positionnel',
  };
  const MOTIF_ORDER = ['mat', 'fourchette', 'gain', 'attaque', 'manoeuvre'];

  // ───────────────────────── storage ─────────────────────────
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
  }
  function save(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) {}
  }

  // ───────────────────────── motif detection ─────────────────────────
  function movesFrom(fen, square, color) {
    // Force side-to-move to `color` so we can ask "what can this piece do".
    const parts = fen.split(' ');
    parts[1] = color;
    parts[3] = '-'; // clear en-passant to avoid illegal-fen edge cases
    try {
      const g = new Chess(parts.join(' '));
      return g.moves({ square, verbose: true }) || [];
    } catch (_) { return []; }
  }

  function detectMotif(fenBefore, bestUci, side) {
    if (!bestUci || bestUci.length < 4) return 'manoeuvre';
    let move, after;
    try {
      const g = new Chess(fenBefore);
      move = g.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] || 'q' });
      if (!move) return 'manoeuvre';
      after = g.fen();
    } catch (_) { return 'manoeuvre'; }

    if (move.san.includes('#')) return 'mat';

    // Fork: the moved piece now attacks 2+ valuable targets (or a target + the king).
    const opp = side === 'w' ? 'b' : 'w';
    const targets = movesFrom(after, bestUci.slice(2, 4), side)
      .filter(m => m.captured && PIECE_VALUES[m.captured] >= 3);
    const givesCheck = move.san.includes('+');
    if (targets.length >= 2) return 'fourchette';
    if (targets.length >= 1 && givesCheck) return 'fourchette';

    // Material gain: capturing a piece worth a knight or more.
    if (move.captured && PIECE_VALUES[move.captured] >= 3) return 'gain';

    if (givesCheck) return 'attaque';
    if (move.captured) return 'gain';
    return 'manoeuvre';
  }

  // ───────────────────────── capture from a game ─────────────────────────
  function capture(gameKey, analysis, header, user) {
    if (!analysis || !user) return;
    const items = load();
    const byId = new Map(items.map(it => [it.id, it]));
    const white = header.White || '?';
    const black = header.Black || '?';
    const date = header.Date || '';

    for (let i = 0; i < analysis.length; i++) {
      const r = analysis[i];
      if (!r || !r.move || r.move.color !== user) continue;
      if (r.type !== 'blunder' && r.type !== 'mistake') continue;
      if (!r.bestUci || r.bestUci.length < 4 || !r.fenBefore) continue;

      const id = gameKey + '#' + i;
      const existing = byId.get(id);
      const motif = detectMotif(r.fenBefore, r.bestUci, user);
      const base = {
        id, fen: r.fenBefore, side: user,
        bestUci: r.bestUci, bestSan: r.bestSan || '',
        playedSan: r.sanFr || r.san, type: r.type, cpLoss: r.cpLoss || 0,
        motif, moveNo: Math.floor(i / 2) + 1,
        white, black, date,
      };
      if (existing) {
        Object.assign(existing, base); // refresh content, keep SRS fields
      } else {
        byId.set(id, Object.assign(base, { reps: 0, interval: 0, ease: 2.4, due: 0, savedAt: Date.now() }));
      }
    }

    let merged = [...byId.values()];
    // Keep most relevant: due/new first, then biggest blunders, cap the list.
    merged.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    if (merged.length > MAX_ITEMS) merged = merged.slice(0, MAX_ITEMS);
    save(merged);
  }

  function dueCount() {
    const now = Date.now();
    return load().filter(it => (it.due || 0) <= now).length;
  }

  // ───────────────────────── SRS scheduling ─────────────────────────
  function schedule(item, grade) {
    // grade: 'again' | 'good' | 'easy'
    const now = Date.now();
    if (grade === 'again') {
      item.reps = 0;
      item.interval = 0;
      item.ease = Math.max(1.7, item.ease - 0.2);
      item.due = now + 10 * 60 * 1000; // 10 min
    } else {
      if (item.reps === 0) item.interval = grade === 'easy' ? 3 : 1;
      else if (item.reps === 1) item.interval = grade === 'easy' ? 6 : 3;
      else item.interval = Math.round(item.interval * item.ease * (grade === 'easy' ? 1.4 : 1));
      if (grade === 'easy') item.ease = Math.min(3.0, item.ease + 0.15);
      item.reps += 1;
      item.due = now + item.interval * DAY;
    }
    const items = load();
    const idx = items.findIndex(it => it.id === item.id);
    if (idx >= 0) { items[idx] = item; save(items); }
  }

  // ───────────────────────── shared board click ─────────────────────────
  let board, arrows, selected = null, onMove = null;

  function attachBoardClicks() {
    board.onclick = (e) => {
      if (!onMove) return;
      const sq = BoardRenderer.coordToSquare(board, e.clientX, e.clientY);
      if (!sq) return;
      if (!selected) {
        selected = sq;
        BoardRenderer.highlightSquares(arrows, [sq], '#e2b857');
      } else if (sq === selected) {
        selected = null;
        BoardRenderer.clearArrows(arrows);
      } else {
        const from = selected;
        selected = null;
        BoardRenderer.clearArrows(arrows);
        onMove(from, sq);
      }
    };
  }

  // ───────────────────────── PUZZLES tab ─────────────────────────
  let queue = [], qi = 0, current = null, solved = false;

  function startPuzzles() {
    const now = Date.now();
    const all = load();
    queue = all.filter(it => (it.due || 0) <= now);
    queue.sort((a, b) => (b.cpLoss || 0) - (a.cpLoss || 0));
    qi = 0;
    renderPuzzle();
  }

  function renderPuzzle() {
    const host = $('#train-puzzles');
    if (!queue.length) {
      const total = load().length;
      host.innerHTML = total
        ? `<div class="train-empty">🎉 Rien à réviser pour l'instant !<br><span>Reviens plus tard — tes prochaines révisions sont programmées.</span></div>`
        : `<div class="train-empty">Aucun puzzle pour le moment.<br><span>Analyse quelques parties : tes erreurs deviendront automatiquement des puzzles à rejouer.</span></div>`;
      return;
    }
    if (qi >= queue.length) {
      host.innerHTML = `<div class="train-empty">✅ Session terminée — ${queue.length} puzzle${queue.length > 1 ? 's' : ''} révisé${queue.length > 1 ? 's' : ''} !<br><span>Reviens demain pour la prochaine fournée.</span></div>`;
      return;
    }
    current = queue[qi];
    solved = false;
    const flip = current.side === 'b';
    host.innerHTML = `
      <div class="train-progress">Puzzle ${qi + 1} / ${queue.length}</div>
      <div class="train-prompt">Trait aux <b>${current.side === 'w' ? 'Blancs' : 'Noirs'}</b> — trouve le meilleur coup.</div>
      <div class="train-board-wrap">
        <svg class="train-board" viewBox="0 0 360 360" id="train-board"></svg>
        <svg class="train-board" viewBox="0 0 360 360" id="train-arrows"></svg>
      </div>
      <div class="train-feedback" id="train-feedback"></div>
      <div class="train-actions" id="train-actions">
        <button class="train-btn ghost" id="puz-hint">💡 Indice</button>
        <button class="train-btn ghost" id="puz-reveal">Voir la solution</button>
      </div>
      <div class="train-context">Ta partie : ${current.white} vs ${current.black} · coup ${current.moveNo} · tu avais joué <b>${current.playedSan}</b></div>`;

    board = $('#train-board'); arrows = $('#train-arrows'); selected = null;
    BoardRenderer.setFlipped(flip);
    BoardRenderer.render(board, current.fen);
    onMove = attemptMove;
    attachBoardClicks();

    $('#puz-hint').onclick = () => {
      BoardRenderer.highlightSquares(arrows, [current.bestUci.slice(0, 2)], '#5b8fb9');
    };
    $('#puz-reveal').onclick = () => revealSolution(false);
  }

  function attemptMove(from, to) {
    if (solved) return;
    const want = current.bestUci;
    if (from === want.slice(0, 2) && to === want.slice(2, 4)) {
      revealSolution(true);
    } else {
      // legal but not best
      let legal = false;
      try {
        const g = new Chess(current.fen);
        legal = !!g.move({ from, to, promotion: 'q' });
      } catch (_) {}
      const fb = $('#train-feedback');
      fb.className = 'train-feedback wrong';
      fb.innerHTML = legal
        ? `❌ Pas le meilleur coup. Réessaie, ou demande un indice.`
        : `⚠️ Coup illégal — clique la pièce puis sa case d'arrivée.`;
    }
  }

  function revealSolution(correct) {
    solved = true;
    onMove = null;
    let move;
    try {
      const g = new Chess(current.fen);
      move = g.move({ from: current.bestUci.slice(0, 2), to: current.bestUci.slice(2, 4), promotion: current.bestUci[4] || 'q' });
      BoardRenderer.render(board, g.fen(), move);
    } catch (_) {}
    BoardRenderer.drawArrows(arrows, [{ from: current.bestUci.slice(0, 2), to: current.bestUci.slice(2, 4), color: '#56b886', opacity: 0.9, width: 7 }]);

    const fb = $('#train-feedback');
    fb.className = 'train-feedback ' + (correct ? 'right' : 'shown');
    const motif = MOTIF_LABELS[current.motif] || 'Tactique';
    fb.innerHTML = correct
      ? `✅ Bravo ! <b>${current.bestSan || move?.san || ''}</b> — motif : ${motif}.`
      : `Solution : <b>${current.bestSan || move?.san || ''}</b> — motif : ${motif}.`;

    $('#train-actions').innerHTML = `
      <button class="train-btn again" data-g="again">À revoir</button>
      <button class="train-btn good" data-g="good">Bon</button>
      <button class="train-btn easy" data-g="easy">Facile</button>`;
    $$('#train-actions .train-btn').forEach(b => {
      b.onclick = () => { schedule(current, b.dataset.g); qi++; renderPuzzle(); };
    });
  }

  // ───────────────────────── MENACES (recognition) tab ─────────────────────────
  let mQueue = [], mi = 0, mScore = 0;

  function startThreats() {
    const all = load().slice();
    // shuffle (Fisher–Yates) for variety
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    mQueue = all.slice(0, 10);
    mi = 0; mScore = 0;
    renderThreat();
  }

  function renderThreat() {
    const host = $('#train-threats');
    if (!mQueue.length) {
      host.innerHTML = `<div class="train-empty">Aucune position disponible.<br><span>Analyse quelques parties d'abord.</span></div>`;
      return;
    }
    if (mi >= mQueue.length) {
      host.innerHTML = `<div class="train-empty">Score : <b>${mScore} / ${mQueue.length}</b><br><span>${mScore >= 8 ? 'Excellent œil tactique !' : mScore >= 5 ? 'Pas mal — continue à t\'entraîner.' : 'L\'entraînement paie : recommence une série.'}</span></div>
        <div class="train-actions"><button class="train-btn good" id="thr-again">Nouvelle série</button></div>`;
      $('#thr-again').onclick = startThreats;
      return;
    }
    const it = mQueue[mi];
    const correct = it.motif;
    const opts = buildOptions(correct);
    host.innerHTML = `
      <div class="train-progress">Question ${mi + 1} / ${mQueue.length} · Score ${mScore}</div>
      <div class="train-prompt">Trait aux <b>${it.side === 'w' ? 'Blancs' : 'Noirs'}</b> — quelle est la meilleure idée tactique ici ?</div>
      <div class="train-board-wrap">
        <svg class="train-board" viewBox="0 0 360 360" id="thr-board"></svg>
      </div>
      <div class="train-options" id="thr-options"></div>
      <div class="train-feedback" id="thr-feedback"></div>`;
    BoardRenderer.setFlipped(it.side === 'b');
    BoardRenderer.render($('#thr-board'), it.fen);
    const optHost = $('#thr-options');
    opts.forEach(opt => {
      const b = document.createElement('button');
      b.className = 'train-opt';
      b.textContent = MOTIF_LABELS[opt];
      b.onclick = () => answerThreat(b, opt, correct, it);
      optHost.appendChild(b);
    });
  }

  function buildOptions(correct) {
    const pool = MOTIF_ORDER.filter(m => m !== correct);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const opts = [correct, ...pool.slice(0, 3)];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
  }

  function answerThreat(btn, chosen, correct, it) {
    if ($('#thr-options').classList.contains('done')) return;
    $('#thr-options').classList.add('done');
    const right = chosen === correct;
    if (right) mScore++;
    $$('#thr-options .train-opt').forEach(b => {
      if (b.textContent === MOTIF_LABELS[correct]) b.classList.add('correct');
      else if (b === btn) b.classList.add('incorrect');
      b.disabled = true;
    });
    const fb = $('#thr-feedback');
    fb.className = 'train-feedback ' + (right ? 'right' : 'wrong');
    fb.innerHTML = `${right ? '✅ Oui !' : '❌ C\'était : ' + MOTIF_LABELS[correct] + '.'} La solution était <b>${it.bestSan || ''}</b>. <button class="train-btn good" id="thr-next">Suivant ▶</button>`;
    $('#thr-next').onclick = () => { mi++; renderThreat(); };
  }

  // ───────────────────────── MOTIFS dashboard tab ─────────────────────────
  function renderMotifs() {
    const host = $('#train-motifs');
    const items = load();
    if (!items.length) {
      host.innerHTML = `<div class="train-empty">Pas encore de données.<br><span>Analyse des parties : tes erreurs tactiques seront classées ici par motif.</span></div>`;
      return;
    }
    const counts = {};
    MOTIF_ORDER.forEach(m => counts[m] = 0);
    items.forEach(it => { counts[it.motif] = (counts[it.motif] || 0) + 1; });
    const total = items.length;
    const max = Math.max(...Object.values(counts), 1);
    const sorted = MOTIF_ORDER.filter(m => counts[m] > 0).sort((a, b) => counts[b] - counts[a]);
    const worst = sorted[0];

    const now = Date.now();
    const due = items.filter(it => (it.due || 0) <= now).length;
    const learned = items.filter(it => (it.reps || 0) >= 2).length;

    let rows = '';
    for (const m of sorted) {
      const pct = Math.round((counts[m] / max) * 100);
      rows += `
        <div class="motif-row">
          <span class="motif-name">${MOTIF_LABELS[m]}</span>
          <div class="motif-bar"><div class="motif-bar-fill" style="width:${pct}%"></div></div>
          <span class="motif-count">${counts[m]}</span>
        </div>`;
    }

    host.innerHTML = `
      <div class="train-stats">
        <div class="train-stat"><b>${total}</b><span>erreurs collectées</span></div>
        <div class="train-stat"><b>${due}</b><span>à réviser</span></div>
        <div class="train-stat"><b>${learned}</b><span>maîtrisées</span></div>
      </div>
      <p class="train-advice">⚠️ Ton motif le plus fréquent : <b>${MOTIF_LABELS[worst]}</b>. Concentre tes révisions dessus.</p>
      <div class="motif-list">${rows}</div>
      <p class="train-note">Chaque barre = nombre de fois où tu as raté ce type de coup. Les puzzles te les font rejouer en répétition espacée.</p>`;
  }

  // ───────────────────────── screen + tabs ─────────────────────────
  let bound = false;
  function show() {
    $('#screen-import').classList.remove('active');
    $('#screen-analysis').classList.remove('active');
    $('#screen-training').classList.add('active');
    if (!bound) {
      $('#btn-train-back').onclick = hide;
      $$('.train-tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));
      bound = true;
    }
    switchTab('puzzles');
  }

  function hide() {
    onMove = null;
    $('#screen-training').classList.remove('active');
    $('#screen-import').classList.add('active');
    if (typeof App !== 'undefined' && App.refreshHome) App.refreshHome();
  }

  function switchTab(tab) {
    onMove = null;
    $$('.train-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.train-panel').forEach(p => p.classList.toggle('active', p.id === 'train-' + tab));
    if (tab === 'puzzles') startPuzzles();
    else if (tab === 'threats') startThreats();
    else renderMotifs();
  }

  return { capture, dueCount, show };
})();
