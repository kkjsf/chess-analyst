const Training = (() => {
  const KEY = 'chess-analyst-training';
  const MAX_ITEMS = 500;
  const NEW_PER_SESSION = 15;
  const DAY = 86400000;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const MOTIF_LABELS = {
    mat: 'Mat / mat forcé',
    prise: 'Pièce en prise',
    fourchette: 'Fourchette / double attaque',
    gain: 'Gain de matériel',
    attaque: 'Attaque / échec',
    positionnel: 'Jeu positionnel',
    manoeuvre: 'Jeu positionnel', // legacy alias for decks built before v50
  };
  const MOTIF_ORDER = ['mat', 'prise', 'fourchette', 'gain', 'attaque', 'positionnel'];
  const TACTICAL = ['mat', 'prise', 'fourchette', 'gain', 'attaque'];

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

  // Parse a SAN that may be French (C/F/T/D/R) or English. Try as-is first
  // (works for English and for pieceless pawn moves), then a French→English
  // remap. Returns the chess.js move object, or null.
  function playMove(g, san) {
    if (!san) return null;
    let m = null;
    try { m = g.move(san, { sloppy: true }); } catch (_) {}
    if (m) return m;
    const en = san.replace(/[CFTDR]/g, c => ({ C: 'N', F: 'B', T: 'R', D: 'Q', R: 'K' }[c]));
    if (en !== san) { try { m = g.move(en, { sloppy: true }); } catch (_) {} }
    return m;
  }

  // Did your actual move drop material? Look at the opponent's best reply: if
  // they can win ~a minor piece or more net (after any immediate recapture),
  // you hung something. A 1-ply static-exchange approximation — good enough to
  // label, not to evaluate.
  // Returns {type, value, square} of the most valuable piece you left hanging
  // after `playedSan`, or null. `type` is the chess.js piece letter (n/b/r/q…).
  function hungPiece(fen, playedSan) {
    try {
      const g = new Chess(fen);
      if (!playMove(g, playedSan)) return null;
      const caps = g.moves({ verbose: true }).filter(m => m.captured);
      if (!caps.length) return null;
      caps.sort((a, b) => (PIECE_VALUES[b.captured] || 0) - (PIECE_VALUES[a.captured] || 0));
      const cap = caps[0];
      const gain = PIECE_VALUES[cap.captured] || 0;
      if (gain < 3) return null; // only flag hanging a minor piece or more
      const g2 = new Chess(g.fen());
      const c2 = g2.move(cap.san, { sloppy: true });
      if (!c2) return null;
      const recap = g2.moves({ verbose: true }).some(m => m.to === cap.to);
      const recapVal = recap ? (PIECE_VALUES[c2.piece] || 0) : 0;
      if ((gain - recapVal) < 2) return null;
      return { type: cap.captured, value: gain, square: cap.to };
    } catch (_) { return null; }
  }

  function hangsMaterial(fen, playedSan, side) {
    return !!hungPiece(fen, playedSan);
  }

  // Classify a mistake by what's most instructive: missed mate, then YOUR
  // hung piece (the #1 beginner error), then the tactic the best move lands.
  function detectMotif(fenBefore, bestUci, side, playedSan) {
    if (!bestUci || bestUci.length < 4) return 'positionnel';
    let move, after;
    try {
      const g = new Chess(fenBefore);
      move = g.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] || 'q' });
      if (!move) return 'positionnel';
      after = g.fen();
    } catch (_) { return 'positionnel'; }

    if (move.san.includes('#')) return 'mat';
    if (playedSan && hangsMaterial(fenBefore, playedSan, side)) return 'prise';

    // Fork: the moved piece now attacks 2+ valuable targets (or a target + check).
    const targets = movesFrom(after, bestUci.slice(2, 4), side)
      .filter(m => m.captured && PIECE_VALUES[m.captured] >= 3);
    const givesCheck = move.san.includes('+');
    if (targets.length >= 2 || (targets.length >= 1 && givesCheck)) return 'fourchette';

    if (move.captured && PIECE_VALUES[move.captured] >= 3) return 'gain';
    if (givesCheck) return 'attaque';
    if (move.captured) return 'gain';
    return 'positionnel';
  }

  // ───────────────────────── capture from a game ─────────────────────────
  // Build SRS-ready items from one analyzed game's blunders, then merge them
  // into the deck. Used when you open a single game in the analyzer.
  function capture(gameKey, analysis, header, user) {
    if (!analysis || !user) return;
    const white = header.White || '?';
    const black = header.Black || '?';
    const date = header.Date || '';
    const base = [];
    for (let i = 0; i < analysis.length; i++) {
      const r = analysis[i];
      if (!r || !r.move || r.move.color !== user) continue;
      if (r.type !== 'blunder' && r.type !== 'mistake') continue;
      if (!r.bestUci || r.bestUci.length < 4 || !r.fenBefore) continue;
      base.push({
        id: gameKey + '#' + i, fen: r.fenBefore, side: user,
        bestUci: r.bestUci, bestSan: r.bestSan || '',
        playedSan: r.sanFr || r.san, type: r.type, cpLoss: r.cpLoss || 0,
        motif: detectMotif(r.fenBefore, r.bestUci, user, r.sanFr || r.san),
        moveNo: Math.floor(i / 2) + 1, white, black, date,
      });
    }
    mergeItems(base);
  }

  // Ingest blunders coming from Coach mode (whole-archive analysis), so EVERY
  // analyzed game feeds the deck — not just games opened one-by-one.
  // blunders: [{ply, fenBefore, bestUci, bestSan, playedSan, type, cpLoss}]
  // meta: {side, white, black, date}
  function ingestGame(gameKey, blunders, meta) {
    if (!blunders || !blunders.length || !meta || !meta.side) return 0;
    const base = [];
    for (const b of blunders) {
      if (!b.bestUci || b.bestUci.length < 4 || !b.fenBefore) continue;
      if (b.type !== 'blunder' && b.type !== 'mistake') continue;
      base.push({
        id: gameKey + '#' + b.ply, fen: b.fenBefore, side: meta.side,
        bestUci: b.bestUci, bestSan: b.bestSan || '',
        playedSan: b.playedSan || '', type: b.type, cpLoss: b.cpLoss || 0,
        motif: detectMotif(b.fenBefore, b.bestUci, meta.side, b.playedSan),
        moveNo: Math.floor(b.ply / 2) + 1,
        white: meta.white || '?', black: meta.black || '?', date: meta.date || '',
      });
    }
    return mergeItems(base);
  }

  // Merge freshly-built items into the deck, preserving SRS progress. Dedups
  // by id and by position signature (so the same mistake seen via the single
  // analyzer and via Coach doesn't become two cards), and never evicts cards
  // already in review when capping.
  const MUTABLE = ['bestSan', 'playedSan', 'type', 'cpLoss', 'motif', 'moveNo', 'white', 'black', 'date'];
  function mergeItems(base) {
    if (!base.length) return 0;
    const items = load();
    const byId = new Map(items.map(it => [it.id, it]));
    const bySig = new Map(items.map(it => [it.fen + '|' + it.bestUci, it]));
    let added = 0;
    for (const nb of base) {
      const sig = nb.fen + '|' + nb.bestUci;
      const hit = byId.get(nb.id) || bySig.get(sig);
      if (hit) {
        MUTABLE.forEach(k => { if (nb[k] !== undefined && nb[k] !== '') hit[k] = nb[k]; });
      } else {
        const item = Object.assign(nb, { reps: 0, interval: 0, ease: 2.4, due: 0, savedAt: Date.now() });
        byId.set(item.id, item); bySig.set(sig, item); added++;
      }
    }
    let merged = [...byId.values()];
    // Protect cards already being learned; otherwise keep the biggest mistakes.
    merged.sort((a, b) => {
      const ap = ((a.reps || 0) > 0 || (a.due || 0) > 0) ? 1 : 0;
      const bp = ((b.reps || 0) > 0 || (b.due || 0) > 0) ? 1 : 0;
      return (bp - ap) || ((b.cpLoss || 0) - (a.cpLoss || 0));
    });
    if (merged.length > MAX_ITEMS) merged = merged.slice(0, MAX_ITEMS);
    save(merged);
    return added;
  }

  // A session = all due reviews + a capped batch of new cards (biggest
  // mistakes first), so a freshly-fed deck never dumps hundreds at once.
  function buildSession() {
    const now = Date.now();
    const all = load();
    const reviews = all.filter(it => (it.reps || 0) > 0 && (it.due || 0) <= now)
      .sort((a, b) => (a.due || 0) - (b.due || 0));
    const fresh = all.filter(it => (it.reps || 0) === 0 && (it.due || 0) <= now)
      .sort((a, b) => (b.cpLoss || 0) - (a.cpLoss || 0))
      .slice(0, NEW_PER_SESSION);
    return reviews.concat(fresh);
  }

  function dueCount() {
    return buildSession().length;
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
  let queue = [], qi = 0, current = null, solved = false, motifFilter = null;

  function startPuzzles() {
    queue = motifFilter ? motifQueue(motifFilter) : buildSession();
    qi = 0;
    renderPuzzle();
  }

  // Drill one motif: due cards of that motif first, then biggest mistakes.
  function motifQueue(m) {
    const now = Date.now();
    return load().filter(it => it.motif === m)
      .sort((a, b) => (((a.due || 0) <= now ? 0 : 1) - ((b.due || 0) <= now ? 0 : 1))
        || ((b.cpLoss || 0) - (a.cpLoss || 0)))
      .slice(0, 20);
  }

  function drillMotif(m) {
    if (!m) return;
    motifFilter = m;
    switchTab('puzzles');
  }

  function bannerHtml() {
    return motifFilter
      ? `<div class="train-motif-banner">Motif : <b>${MOTIF_LABELS[motifFilter] || motifFilter}</b><button class="train-link" id="puz-all">← toutes les révisions</button></div>`
      : '';
  }
  function bindBanner() {
    const pa = $('#puz-all');
    if (pa) pa.onclick = () => { motifFilter = null; startPuzzles(); };
  }

  function renderPuzzle() {
    const host = $('#train-puzzles');
    if (!queue.length) {
      const total = load().length;
      const msg = motifFilter
        ? `<div class="train-empty">Aucun puzzle pour ce motif.<br><span>Choisis-en un autre dans l'onglet Motifs.</span></div>`
        : total
          ? `<div class="train-empty">🎉 Rien à réviser pour l'instant !<br><span>Reviens plus tard — tes prochaines révisions sont programmées.</span></div>`
          : `<div class="train-empty">Aucun puzzle pour le moment.<br><span>Analyse quelques parties : tes erreurs deviendront automatiquement des puzzles à rejouer.</span></div>`;
      host.innerHTML = bannerHtml() + msg;
      bindBanner();
      return;
    }
    if (qi >= queue.length) {
      host.innerHTML = bannerHtml() + `<div class="train-empty">✅ Session terminée — ${queue.length} puzzle${queue.length > 1 ? 's' : ''} révisé${queue.length > 1 ? 's' : ''} !<br><span>${motifFilter ? 'Passe à un autre motif dans l\'onglet Motifs.' : 'Reviens demain pour la prochaine fournée.'}</span></div>`;
      bindBanner();
      return;
    }
    current = queue[qi];
    solved = false;
    const flip = current.side === 'b';
    host.innerHTML = bannerHtml() + `
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
    bindBanner();
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
    const target = sorted.filter(m => TACTICAL.includes(m))[0] || sorted[0];

    const due = buildSession().length;
    const learned = items.filter(it => (it.reps || 0) >= 2).length;

    let rows = '';
    for (const m of sorted) {
      const pct = Math.round((counts[m] / max) * 100);
      rows += `
        <button class="motif-row" data-motif="${m}">
          <span class="motif-name">${MOTIF_LABELS[m]}</span>
          <div class="motif-bar"><div class="motif-bar-fill" style="width:${pct}%"></div></div>
          <span class="motif-count">${counts[m]}</span>
        </button>`;
    }

    host.innerHTML = `
      <div class="train-stats">
        <div class="train-stat"><b>${total}</b><span>erreurs collectées</span></div>
        <div class="train-stat"><b>${due}</b><span>à réviser</span></div>
        <div class="train-stat"><b>${learned}</b><span>maîtrisées</span></div>
      </div>
      <p class="train-advice">⚠️ ${TACTICAL.includes(target) ? 'Ton point faible tactique' : 'Ton motif le plus fréquent'} : <b>${MOTIF_LABELS[target]}</b>.
        <button class="train-btn good" id="motif-drill">S'entraîner sur ce motif ▶</button></p>
      <div class="motif-list">${rows}</div>
      <p class="train-note">Touche un motif pour t'entraîner uniquement dessus. Les puzzles te font rejouer tes erreurs en répétition espacée.</p>`;
    const db = $('#motif-drill');
    if (db) db.onclick = () => drillMotif(target);
    $$('#train-motifs .motif-row').forEach(b => { b.onclick = () => drillMotif(b.dataset.motif); });
  }

  // ───────────────────────── screen + tabs ─────────────────────────
  let bound = false;
  function show() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-training').classList.add('active');
    window.scrollTo(0, 0);
    if (!bound) {
      $('#btn-train-back').onclick = hide;
      $$('.train-tab').forEach(t => t.onclick = () => { motifFilter = null; switchTab(t.dataset.tab); });
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

  return { capture, ingestGame, dueCount, show, hungPiece };
})();
