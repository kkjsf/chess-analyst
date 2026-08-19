// « Rejoue ta défaite » — reprendre la main juste avant une de tes gaffes et
// rejouer la position CONTRE Stockfish, avec un commentaire du coach à chaque
// coup. Réutilise la coquille .guess-* (comme tactics.js/mates.js), le rendu
// d'échiquier + drag + flèches (BoardRenderer), le moteur (StockfishEngine) et
// les commentaires de analysis.js (explainBadMove / detectForkAfterMove).
const Replay = (() => {
  const $ = (s) => document.querySelector(s);

  // ── état de la session courante ──
  let mySide = 'w';      // le camp que tu joues (celui qui avait gaffé)
  let seedFen = '';      // position de reprise (fenBefore de la gaffe)
  let intro = null;      // { playedSan, bestSan, bestUci, tip, moveNo, dot }
  let hist = [];         // pile de { fen, move, by } — fen APRÈS le coup
  let token = 0;         // incrémenté à chaque reset/close/undo → annule l'async périmé
  let busy = false;      // moteur en réflexion / animation → entrées bloquées
  let curEvalMe = null;  // éval (cp, point de vue de mon camp) à mon trait courant
  let myBestUci = null;  // meilleur coup du moteur pour moi (flèche bleue)

  const DEPTH_MY = 12;              // éval + flèche bleue à mon trait
  const REPLY_MT = 'movetime 700';  // force de la réplique de l'ordi
  const ANIM_MS = 260;

  // ── helpers d'affichage (calqués sur l'explorateur d'ouverture) ──
  function fr(san) { return (typeof Analyzer !== 'undefined' && Analyzer.toFrench) ? Analyzer.toFrench(san) : san; }

  function uciToFr(fen, uci) {
    if (!uci) return null;
    try {
      const g = new Chess(fen);
      const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
      return m ? fr(m.san) : null;
    } catch (_) { return null; }
  }

  // Convertisseur PV partagé (js/freeplay.js).
  const pvToFr = (fen, pvStr, max) => FreePlay.pvToFr(fen, pvStr, max || 4);

  // Éval en centipions au point de vue de mon camp (Stockfish rapporte le score
  // du trait). +100000 ≈ je mate, -100000 ≈ je me fais mater.
  function meScore(res, fen) {
    if (!res || typeof res.score !== 'number') return null;
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    const sign = stm === mySide ? 1 : -1;
    return sign * res.score;
  }
  // Mat au point de vue de mon camp (>0 = je mate en N, <0 = je suis maté en N).
  function meMate(res, fen) {
    if (!res || res.mate == null) return null;
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    return (stm === mySide ? 1 : -1) * res.mate;
  }
  // Éval formatée au point de vue des Blancs (comme la barre d'analyse).
  function evalWhite(res, fen) {
    const stm = fen.split(' ')[1] === 'w' ? 'w' : 'b';
    if (res && res.mate != null) { const mw = stm === 'w' ? res.mate : -res.mate; return 'Mat en ' + Math.abs(mw) + (mw > 0 ? ' (Blancs)' : ' (Noirs)'); }
    if (!res || typeof res.score !== 'number') return '?';
    const w = (stm === 'w' ? res.score : -res.score) / 100;
    return (w >= 0 ? '+' : '') + w.toFixed(1);
  }

  // ── DOM (créé une seule fois) ──
  let boardSvg = null, arrowsSvg = null, bound = false;
  function ensureDom() {
    if ($('#replay-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'replay-overlay';
    ov.className = 'guess-overlay';
    ov.hidden = true;
    ov.innerHTML = `
      <div class="guess-panel">
        <div class="guess-head">
          <button class="back-btn" id="rp-close">←</button>
          <span class="guess-title" id="rp-title">Rejoue ta défaite</span>
          <span class="guess-score" id="rp-turn"></span>
        </div>
        <div class="guess-prompt rp-intro" id="rp-intro"></div>
        <div class="guess-board-wrap">
          <svg viewBox="0 0 360 360" id="rp-board"></svg>
          <svg viewBox="0 0 360 360" id="rp-arrows" class="arrow-overlay"></svg>
        </div>
        <div class="guess-feedback rp-comment">
          <div class="rp-verdict" id="rp-verdict"></div>
          <div class="rp-status" id="rp-status"></div>
        </div>
        <div class="rp-actions">
          <button class="train-btn ghost" id="rp-undo">↶ Annuler</button>
          <button class="train-btn ghost" id="rp-reset">⟳ Recommencer</button>
          <button class="train-btn ghost" id="rp-quit">✕ Quitter</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    boardSvg = $('#rp-board');
    arrowsSvg = $('#rp-arrows');
    $('#rp-close').onclick = close;
    $('#rp-quit').onclick = close;
    $('#rp-reset').onclick = () => { if (busy) return; resetToSeed(); };
    $('#rp-undo').onclick = () => { if (busy) return; undo(); };
    if (!bound) {
      bound = true;
      BoardRenderer.enableDrag(boardSvg, {
        getFen: () => curFen(),
        arrows: arrowsSvg,
        canMove: () => !busy && !gameOver() && sideToMove() === mySide,
        onMove: (from, to) => playMyMove(from, to),
      });
    }
  }

  function curFen() { return hist.length ? hist[hist.length - 1].fen : seedFen; }
  function sideToMove() { return curFen().split(' ')[1] === 'w' ? 'w' : 'b'; }
  function gameOver() { try { return new Chess(curFen()).game_over(); } catch (_) { return false; } }

  // ── entrée publique ──
  function start(entry) {
    if (!entry || !entry.fenBefore) return;
    try { if (!new Chess(entry.fenBefore)) return; } catch (_) { return; }
    seedFen = entry.fenBefore;
    mySide = seedFen.split(' ')[1] === 'b' ? 'b' : 'w';
    const ply = (typeof entry.ply === 'number') ? entry.ply : null;
    const moveNo = ply != null ? Math.floor(ply / 2) + 1 : (entry.moveNo || null);
    const dot = ply != null ? (ply % 2 === 0 ? '.' : '...') : '.';
    intro = {
      playedSan: fr(entry.playedSan || ''), bestSan: fr(entry.bestSan || ''),
      bestUci: entry.bestUci || '', tip: (entry.tip || '').replace(/<[^>]*>/g, '').trim(),
      moveNo, dot,
    };
    ensureDom();
    $('#replay-overlay').hidden = false;
    document.body.classList.add('guess-open');
    BoardRenderer.setFlipped(mySide === 'b');
    resetToSeed();
  }

  function close() {
    token++;
    busy = false;
    const ov = $('#replay-overlay');
    if (ov) ov.hidden = true;
    document.body.classList.remove('guess-open');
    if (arrowsSvg) BoardRenderer.clearArrows(arrowsSvg);
  }

  function resetToSeed() {
    token++;
    hist = [{ fen: seedFen, move: null, by: null }];
    curEvalMe = null; myBestUci = null; busy = false;
    renderIntro();
    setVerdict('');
    renderBoard(null);
    onMyTurn();
  }

  // Annuler : revenir à ma position de trait précédente (retire la réplique de
  // l'ordi puis mon coup). Ne descend jamais sous la position de départ.
  function undo() {
    token++;
    if (hist.length <= 1) return;
    if (hist[hist.length - 1].by === 'opp') hist.pop();
    if (hist.length > 1 && hist[hist.length - 1].by === 'me') hist.pop();
    curEvalMe = null; myBestUci = null; busy = false;
    setVerdict('');
    renderBoard(null);
    onMyTurn();
  }

  function renderIntro() {
    const el = $('#rp-intro');
    if (!el) return;
    const head = intro.moveNo != null ? `Coup ${intro.moveNo}${intro.dot} — ` : '';
    let h = `${head}tu avais joué <b>${intro.playedSan || '?'}</b>.`;
    if (intro.tip) h += ` ${intro.tip}`;
    // N'ajoute la meilleure suite que si le tip ne la mentionne pas déjà.
    if (intro.bestSan && !(intro.tip && intro.tip.includes(intro.bestSan))) h += ` La meilleure suite était <b>${intro.bestSan}</b>.`;
    h += ` <span class="rp-goal">À toi de rejouer : trouve mieux, ou vois la punition. L'ordi te répond.</span>`;
    el.innerHTML = h;
  }

  function renderBoard(lastMove, animateFrom) {
    if (animateFrom) BoardRenderer.renderAnimated(boardSvg, animateFrom, curFen(), lastMove, ANIM_MS);
    else BoardRenderer.render(boardSvg, curFen(), lastMove);
    const undoBtn = $('#rp-undo'); if (undoBtn) undoBtn.disabled = hist.length <= 1 || busy;
    const resetBtn = $('#rp-reset'); if (resetBtn) resetBtn.disabled = hist.length <= 1 || busy;
    const turnEl = $('#rp-turn');
    if (turnEl) turnEl.textContent = gameOver() ? '' : (sideToMove() === mySide ? 'À toi' : 'Ordi…');
  }

  function drawMyArrow() {
    const arr = [];
    if (myBestUci) arr.push({ from: myBestUci.slice(0, 2), to: myBestUci.slice(2, 4), color: '#5b8fb9', opacity: 0.9, width: 7 });
    BoardRenderer.drawArrows(arrowsSvg, arr);
  }

  // Two persistent zones: the verdict of your LAST move (+ the engine's reply),
  // which must stay readable, and a status line for the CURRENT turn (eval /
  // best move) that refreshes each ply without wiping the verdict.
  function setVerdict(html, cls) {
    const el = $('#rp-verdict');
    if (!el) return;
    el.className = 'rp-verdict' + (cls ? ' ' + cls : '');
    el.innerHTML = html || '';
  }
  function setStatus(html) {
    const el = $('#rp-status');
    if (el) el.innerHTML = html || '';
  }

  // À mon trait : évaluer la position (flèche bleue + éval), mémoriser l'éval
  // pour juger mon prochain coup. Puis attendre mon glisser-déposer.
  async function onMyTurn() {
    BoardRenderer.clearArrows(arrowsSvg);
    if (gameOver()) return terminalComment();
    busy = true;
    renderBoard(null);
    setStatus('⏳ Le moteur regarde la position…');
    const my = ++token;
    const fen = curFen();
    let res = null;
    try {
      if (typeof StockfishEngine !== 'undefined') {
        if (!StockfishEngine.isReady()) await StockfishEngine.init();
        if (my !== token) return;
        res = await StockfishEngine.evaluate(fen, DEPTH_MY);
      }
    } catch (_) { res = null; }
    if (my !== token) return;
    curEvalMe = meScore(res, fen);
    myBestUci = res && res.bestMove ? res.bestMove : null;
    busy = false;
    drawMyArrow();
    renderBoard(null);
    const best = uciToFr(fen, myBestUci);
    const evalTxt = res ? `Éval <b>${evalWhite(res, fen)}</b>.` : 'Moteur indisponible — joue librement.';
    const bestTxt = best ? ` Meilleur : <b>${best}</b> <span class="rp-hint">(flèche bleue)</span>.` : '';
    setStatus(`Trait à <b>toi</b>. ${evalTxt}${bestTxt}`);
  }

  function playMyMove(from, to) {
    if (busy || gameOver() || sideToMove() !== mySide) return;
    const fen = curFen();
    let g, mv = null;
    try { g = new Chess(fen); mv = g.move({ from, to, promotion: 'q' }); } catch (_) { mv = null; }
    if (!mv) { setStatus('⚠️ Coup illégal. Glisse une pièce sur une case légale.'); return; }
    const myUci = from + to + (mv.promotion || '');
    const fenAfterMe = g.fen();
    hist.push({ fen: fenAfterMe, move: mv, by: 'me' });
    BoardRenderer.clearArrows(arrowsSvg);
    renderBoard(mv, fen);
    busy = true;
    setVerdict('');
    setStatus('⏳ L\'ordi réfléchit…');
    judgeAndReply(fenAfterMe, mv, myUci, ++token);
  }

  async function judgeAndReply(fenAfterMe, myMove, myUci, my) {
    let res = null;
    try {
      if (typeof StockfishEngine !== 'undefined') {
        if (!StockfishEngine.isReady()) await StockfishEngine.init();
        if (my !== token) return;
        res = await StockfishEngine.evaluate(fenAfterMe, REPLY_MT);
      }
    } catch (_) { res = null; }
    if (my !== token) return;

    // Verdict sur MON coup (perte de centipions vue de mon camp).
    const afterMe = meScore(res, fenAfterMe);
    const mateForMe = meMate(res, fenAfterMe);
    const cpLoss = (curEvalMe != null && afterMe != null) ? Math.max(0, curEvalMe - afterMe) : null;
    const iDeliveredMate = (() => { try { return new Chess(fenAfterMe).in_checkmate(); } catch (_) { return false; } })();
    const verdict = gradeMyMove(myUci === myBestUci, cpLoss, mateForMe, iDeliveredMate, fenAfterMe, myMove, res);

    // Partie finie sur mon coup (mat / pat) → pas de réplique.
    let over = false; try { over = new Chess(fenAfterMe).game_over(); } catch (_) {}
    if (over) { busy = false; renderBoard(null); setVerdict(verdict.html + terminalLine(fenAfterMe), verdict.cls); setStatus(''); return; }

    // L'ordi joue son meilleur coup.
    const replyUci = res && res.bestMove ? res.bestMove : firstLegal(fenAfterMe);
    let replyHtml = '';
    if (replyUci) {
      let g2, rm = null;
      try { g2 = new Chess(fenAfterMe); rm = g2.move({ from: replyUci.slice(0, 2), to: replyUci.slice(2, 4), promotion: replyUci[4] || 'q' }); } catch (_) { rm = null; }
      if (rm) {
        const before = fenAfterMe;
        hist.push({ fen: g2.fen(), move: rm, by: 'opp' });
        renderBoard(rm, before);
        replyHtml = describeReply(rm, res && res.lines ? res.lines : null);
      }
    }
    if (my !== token) return;

    let overAfter = false; try { overAfter = new Chess(curFen()).game_over(); } catch (_) {}
    if (overAfter) { busy = false; setVerdict(verdict.html + replyHtml + terminalLine(curFen()), verdict.cls); setStatus(''); renderBoard(null); return; }

    setVerdict(verdict.html + replyHtml, verdict.cls);
    busy = false;
    // Nouveau tour : réévaluer pour la flèche bleue + l'éval de référence (le
    // verdict ci-dessus reste affiché, seule la ligne de statut se rafraîchit).
    onMyTurn();
  }

  function firstLegal(fen) {
    try { const g = new Chess(fen); const ms = g.moves({ verbose: true }); if (ms.length) return ms[0].from + ms[0].to + (ms[0].promotion || ''); } catch (_) {}
    return null;
  }

  // Verdict textuel de mon coup, calqué sur la classification de l'app mais en
  // direct : coup parfait / précis / imprécision / erreur / gaffe, enrichi par
  // le commentaire de analysis.js (pièce en prise, fourchette menacée…).
  function gradeMyMove(isBest, cpLoss, mateForMe, iDeliveredMate, fenAfterMe, myMove, res) {
    if (iDeliveredMate) return { html: '🏆 <b>Échec et mat !</b> Superbe, tu punis la position.', cls: 'right' };
    if (mateForMe != null && mateForMe < 0) {
      const bad = badExplain(fenAfterMe, myMove, res);
      return { html: `🔴 <b>Attention</b> — ce coup permet un mat forcé pour l'adversaire.${bad ? ' ' + bad : ''}`, cls: 'wrong' };
    }
    if (isBest) return { html: '✅ <b>Parfait</b>, c\'est le meilleur coup.', cls: 'right' };
    if (cpLoss == null) return { html: '🔵 Coup joué.', cls: '' };
    const loss = Math.round(cpLoss);
    if (loss <= 20) return { html: '👍 <b>Précis</b>, tu gardes le fil.', cls: 'right' };
    if (loss <= 50) return { html: `🟡 <b>Petite imprécision</b> (-${loss} cp), rien de grave.`, cls: '' };
    const bad = badExplain(fenAfterMe, myMove, res);
    if (loss <= 120) return { html: `🟠 <b>Erreur</b> (-${loss} cp).${bad ? ' ' + bad : ''}`, cls: 'wrong' };
    return { html: `🔴 <b>Gaffe</b> (-${loss} cp).${bad ? ' ' + bad : ''}`, cls: 'wrong' };
  }

  // Ce que l'adversaire (le moteur) menace après mon coup, via analysis.js.
  function badExplain(fenAfterMe, myMove, res) {
    if (typeof Analyzer === 'undefined' || !Analyzer.explainBadMove) return '';
    const lines = res && res.lines && res.lines.length ? res.lines : (res && res.bestMove ? [{ move: res.bestMove }] : null);
    if (!lines) return '';
    try { return Analyzer.explainBadMove(fenAfterMe, myMove, lines) || ''; } catch (_) { return ''; }
  }

  function describeReply(rm, oppLinesAfterReply) {
    let note = '';
    if (rm.san.includes('#')) note = ' — et c\'est mat.';
    else if (rm.captured) {
      const names = { p: 'un pion', n: 'le cavalier', b: 'le fou', r: 'la tour', q: 'la dame' };
      note = ` — il prend ${names[rm.captured] || 'du matériel'}.`;
    } else if (rm.san.includes('+')) note = ' — échec.';
    return `<div class="rp-reply">L'ordi répond <b>${fr(rm.san)}</b>${note}</div>`;
  }

  function terminalLine(fen) {
    try {
      const g = new Chess(fen);
      if (g.in_checkmate()) {
        const loserIsMe = (fen.split(' ')[1] === mySide);
        return loserIsMe
          ? `<div class="rp-term">♚ Échec et mat contre toi. Annule pour tenter une autre suite.</div>`
          : `<div class="rp-term">🏆 Échec et mat, bien joué ! Annule pour explorer une variante.</div>`;
      }
      if (g.in_stalemate()) return `<div class="rp-term">Pat — nulle. Annule pour tenter autre chose.</div>`;
      if (g.in_draw()) return `<div class="rp-term">Nulle (matériel / répétition). Annule pour tenter autre chose.</div>`;
    } catch (_) {}
    return '';
  }

  function terminalComment() {
    setVerdict(terminalLine(curFen()) || 'Position terminale.', '');
    setStatus('');
    renderBoard(null);
  }

  return { start, close };
})();
