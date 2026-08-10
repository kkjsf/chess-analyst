const Training = (() => {
  const KEY = 'chess-analyst-training';
  // Bump when detectMotif's logic changes so the stored deck is re-tagged on
  // next load (see retagDeck). v2: fork-with-check is now verified past the
  // opponent's parry instead of on the in-check position. v3: pin/skewer/
  // discovered-attack detection added (clouage / enfilade / découverte).
  const CLASSIFIER_VERSION = 3;
  const MAX_ITEMS = 500;
  const NEW_PER_SESSION = 15;
  const DAY = 86400000;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const MOTIF_LABELS = {
    mat: 'Mat / mat forcé',
    prise: 'Pièce en prise',
    defense: 'Défense / parade',
    fourchette: 'Fourchette / double attaque',
    clouage: 'Clouage',
    enfilade: 'Enfilade',
    decouverte: 'Attaque à la découverte',
    gain: 'Gain de matériel',
    attaque: 'Attaque / échec',
    positionnel: 'Jeu positionnel',
    manoeuvre: 'Jeu positionnel', // legacy alias for decks built before v50
  };
  const MOTIF_ORDER = ['mat', 'prise', 'defense', 'fourchette', 'clouage', 'enfilade', 'decouverte', 'gain', 'attaque', 'positionnel'];
  const TACTICAL = ['mat', 'prise', 'defense', 'fourchette', 'clouage', 'enfilade', 'decouverte', 'gain', 'attaque'];

  // ───────────────────────── storage ─────────────────────────
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
  }
  function save(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) {}
  }

  // ───────────────────────── randomisation ─────────────────────────
  // Fisher-Yates in-place shuffle. Used to vary the puzzle order every session
  // so you don't keep replaying the same old mistakes in the same sequence.
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // Pick n items from pool, biased toward bigger mistakes (weight) but not
  // deterministic — so the important errors stay likely without the session
  // being the exact same top-cpLoss cards in the same order every time.
  function weightedSample(pool, n, weightFn) {
    const items = pool.slice();
    const picked = [];
    while (picked.length < n && items.length) {
      let total = 0;
      for (const it of items) total += Math.max(1, weightFn(it));
      let r = Math.random() * total, idx = 0;
      for (; idx < items.length - 1; idx++) {
        r -= Math.max(1, weightFn(items[idx]));
        if (r <= 0) break;
      }
      picked.push(items.splice(idx, 1)[0]);
    }
    return picked;
  }

  // ─────────────────── relevance weighting ───────────────────
  // A card matters more when (a) it cost a lot (cpLoss), (b) it's a mistake you
  // make OFTEN — a recurring leak, not a one-off — and (c) it's recent. We fold
  // all three into the sampling weight so the session leans on your real
  // weaknesses without ever going fully deterministic.
  function cardTime(it) {
    const d = it.date ? Date.parse(String(it.date).replace(/\./g, '-')) : NaN;
    return isNaN(d) ? (it.savedAt || 0) : d;
  }
  // "2024.05.12" → "12 mai 2024" for the puzzle's game context. Falls back to
  // the raw string when the date is missing or malformed.
  const CARD_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function formatCardDate(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = String(dateStr).replace(/\./g, '-').split('-');
      if (parts.length >= 3) {
        const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, d = parseInt(parts[2], 10);
        if (m >= 0 && m < 12 && d > 0) return `${d} ${CARD_MONTHS[m]}${y ? ' ' + y : ''}`;
      }
    } catch (_) {}
    return dateStr;
  }
  // The opponent's name = whichever colour the user was NOT playing.
  function opponentName(it) {
    const name = it.side === 'w' ? it.black : it.white;
    return name && name !== '?' ? name : null;
  }
  function weightContext(pool) {
    const total = pool.length || 1;
    const share = {};
    for (const it of pool) share[it.motif] = (share[it.motif] || 0) + 1;
    for (const k in share) share[k] /= total;
    let tmin = Infinity, tmax = -Infinity;
    for (const it of pool) { const t = cardTime(it); if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
    return { share, tmin, tmax };
  }
  function cardWeight(it, ctx) {
    const base = (it.cpLoss || 0) + 50;
    const motifFactor = 1 + 2 * (ctx.share[it.motif] || 0);          // recurring leak → heavier
    let recency = 1;
    if (ctx.tmax > ctx.tmin) recency = 1 + 2 * ((cardTime(it) - ctx.tmin) / (ctx.tmax - ctx.tmin)); // newest ~3×
    return base * motifFactor * recency;
  }

  // Re-tag every stored card with the current classifier, once per version bump.
  // Cards keep enough info (fen/bestUci/side/playedSan) to recompute the motif,
  // so a logic fix retroactively fixes the whole error bank — no re-analysis.
  const CV_KEY = KEY + '-cv';
  function retagDeck() {
    let stored = 0;
    try { stored = parseInt(localStorage.getItem(CV_KEY) || '0', 10) || 0; } catch (_) {}
    if (stored >= CLASSIFIER_VERSION) return 0;
    const items = load();
    let changed = 0;
    for (const it of items) {
      if (!it.fen || !it.bestUci || !it.side) continue;
      const m = detectMotif(it.fen, it.bestUci, it.side, it.playedSan || '');
      if (m && m !== it.motif) { it.motif = m; changed++; }
    }
    if (changed) save(items);
    try { localStorage.setItem(CV_KEY, String(CLASSIFIER_VERSION)); } catch (_) {}
    return changed;
  }

  // ───────────────────────── motif detection ─────────────────────────
  function movesFrom(fen, square, color) {
    // Force side-to-move to `color` so we can ask "what can this piece do".
    const parts = fen.split(' ');
    // The en-passant square is only valid for the side genuinely to move; keep it
    // when `color` already has the move (so en-passant captures are seen), but
    // clear it when we flip sides to avoid an illegal FEN throwing.
    if (parts[1] !== color) { parts[1] = color; parts[3] = '-'; }
    try {
      const g = new Chess(parts.join(' '));
      return g.moves({ square, verbose: true }) || [];
    } catch (_) { return []; }
  }

  // Parse a SAN that may be French (C/F/T/D/R) or English. The tricky case is
  // 'R': French roi vs English rook. C/F/T/D are French-only and B/N/Q/K are
  // English-only, so those disambiguate themselves; a leading 'R' (or a pieceless
  // pawn/castling move) is ambiguous, and since the deck stores French SAN we try
  // the French reading (roi) first. Returns the chess.js move object, or null.
  function playMove(g, san) {
    if (!san) return null;
    const toEnglish = s => s.replace(/[CFTDR]/g, c => ({ C: 'N', F: 'B', T: 'R', D: 'Q', R: 'K' }[c]));
    const tryMove = s => { try { return g.move(s, { sloppy: true }); } catch (_) { return null; } };
    const isFrench = /[CFTD]/.test(san);   // French-only piece letters
    const isEnglish = /[BNQK]/.test(san);  // English-only piece letters
    if (isFrench && !isEnglish) return tryMove(toEnglish(san));
    if (isEnglish && !isFrench) return tryMove(san);
    if (/^R/.test(san)) return tryMove(toEnglish(san)) || tryMove(san);
    return tryMove(san) || tryMove(toEnglish(san));
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
      // Check EVERY capture, not just the most valuable victim: a defended queen
      // (recaptured, net < 2) would otherwise mask a truly hanging rook sitting
      // right behind it. Keep the most valuable piece that is genuinely hanging.
      let best = null;
      for (const cap of caps) {
        if (cap.captured === 'k') continue; // king "capture" = flipped-turn in-check artefact
        const gain = PIECE_VALUES[cap.captured] || 0;
        if (gain < 3) continue; // only flag hanging a minor piece or more
        let recapVal = 0;
        const g2 = new Chess(g.fen());
        const c2 = g2.move(cap.san, { sloppy: true });
        if (!c2) continue;
        const recap = g2.moves({ verbose: true }).some(m => m.to === cap.to);
        recapVal = recap ? (PIECE_VALUES[c2.piece] || 0) : 0;
        if ((gain - recapVal) < 2) continue;
        if (!best || gain > best.value) best = { type: cap.captured, value: gain, square: cap.to };
      }
      return best;
    } catch (_) { return null; }
  }

  function hangsMaterial(fen, playedSan, side) {
    return !!hungPiece(fen, playedSan);
  }

  // Best capture available to whoever is to move in `fen` that wins at least
  // ~2 net material (a 1-ply static-exchange approximation). Returns the target
  // {square, piece, value, net} or null. Shared by the Vigilance drill and the
  // 'defense' motif so "en prise" is judged the same way everywhere.
  function bestHang(fen) {
    let g;
    try { g = new Chess(fen); } catch (_) { return null; }
    const caps = g.moves({ verbose: true }).filter(m => m.captured);
    let best = null;
    for (const cap of caps) {
      // Skip king captures: they only appear when the side we handed the move to
      // was actually in check (an illegal position), which otherwise reports the
      // king itself as "hanging" (king value 100). A king is never a hung piece.
      if (cap.captured === 'k') continue;
      const gain = PIECE_VALUES[cap.captured] || 0;
      if (gain < 3) continue; // only care about a minor piece or more
      let recapVal = 0;
      try {
        const g2 = new Chess(g.fen());
        const c2 = g2.move(cap.san, { sloppy: true });
        if (!c2) continue;
        const recap = g2.moves({ verbose: true }).some(m => m.to === cap.to);
        recapVal = recap ? (PIECE_VALUES[c2.piece] || 0) : 0;
      } catch (_) { continue; }
      const net = gain - recapVal;
      if (net >= 2 && (!best || net > best.net)) best = { square: cap.to, piece: cap.captured, value: gain, net };
    }
    return best;
  }

  // Does `defColor` defend `square`? (Drop an enemy pawn there and see if
  // defColor can recapture it.) Used to tell a real fork from one whose targets
  // are protected.
  function opponentDefends(afterFen, square, defColor) {
    const parts = afterFen.split(' ');
    parts[1] = defColor; parts[3] = '-';
    let g;
    try { g = new Chess(parts.join(' ')); } catch (_) { return true; }
    const enemy = defColor === 'w' ? 'b' : 'w';
    try { g.remove(square); g.put({ type: 'p', color: enemy }, square); } catch (_) { return true; }
    try { return g.moves({ verbose: true }).some(m => m.to === square && m.captured); } catch (_) { return true; }
  }

  // Can the opponent win the piece sitting on `square` for >=2 net material?
  // A "fork" whose own forking piece just gets taken isn't a fork.
  function pieceWinnable(afterFen, square, side) {
    const opp = side === 'w' ? 'b' : 'w';
    const parts = afterFen.split(' ');
    parts[1] = opp; parts[3] = '-';
    let g;
    try { g = new Chess(parts.join(' ')); } catch (_) { return false; }
    const caps = g.moves({ verbose: true }).filter(m => m.to === square && m.captured);
    for (const cap of caps) {
      const gain = PIECE_VALUES[cap.captured] || 0;
      try {
        const g2 = new Chess(g.fen());
        g2.move(cap.san, { sloppy: true });
        const recap = g2.moves({ verbose: true }).some(m => m.to === square);
        const rv = recap ? (PIECE_VALUES[cap.piece] || 0) : 0;
        if (gain - rv >= 2) return true;
      } catch (_) {}
    }
    return false;
  }

  // ── pin / skewer / discovered geometry (board-scan, chess.js .board()) ──
  const SLIDER_DIRS = {
    b: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    r: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    q: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]],
  };
  function sqToRC(sq) { return [8 - parseInt(sq[1], 10), sq.charCodeAt(0) - 97]; }
  function firstAlong(board, r, c, dr, dc) {
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      if (board[rr][cc]) return { p: board[rr][cc], r: rr, c: cc };
      rr += dr; cc += dc;
    }
    return null;
  }
  // Does the slider `side` just moved to `toSq` pin or skewer two enemy pieces
  // on the same line? Pin = the back piece is worth more (or is the king);
  // skewer = the front piece is worth more. Returns 'clouage'|'enfilade'|null.
  function pinOrSkewerByMove(afterFen, toSq, side) {
    let g; try { g = new Chess(afterFen); } catch (_) { return null; }
    const board = g.board();
    const [r, c] = sqToRC(toSq);
    const piece = board[r][c];
    if (!piece || piece.color !== side) return null;
    const dirs = SLIDER_DIRS[piece.type];
    if (!dirs) return null;
    const opp = side === 'w' ? 'b' : 'w';
    for (const [dr, dc] of dirs) {
      const first = firstAlong(board, r, c, dr, dc);
      if (!first || first.p.color !== opp) continue;
      const second = firstAlong(board, first.r, first.c, dr, dc);
      if (!second || second.p.color !== opp) continue;
      const v1 = PIECE_VALUES[first.p.type] || 0;
      const v2 = second.p.type === 'k' ? 1000 : (PIECE_VALUES[second.p.type] || 0);
      if (v2 > v1 && v1 >= 3) return 'clouage';   // front piece pinned to a bigger one / king
      if (v1 > v2 && v1 >= 5) return 'enfilade';  // front piece forced to move, loses the one behind
    }
    return null;
  }
  // Moving off `fromSq` unveils a friendly slider onto a heavy enemy piece or
  // the king sitting on the opposite side of that square — a discovered attack.
  function discoveredByMove(fromSq, afterFen, side) {
    let g; try { g = new Chess(afterFen); } catch (_) { return null; }
    const board = g.board();
    const [r, c] = sqToRC(fromSq);
    const opp = side === 'w' ? 'b' : 'w';
    const rays = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of rays) {
      const diagonal = dr !== 0 && dc !== 0;
      const slideType = diagonal ? ['b', 'q'] : ['r', 'q'];
      const a = firstAlong(board, r, c, dr, dc);
      const b = firstAlong(board, r, c, -dr, -dc);
      const chk = (s, t) => s && t && s.p.color === side && slideType.includes(s.p.type) &&
        t.p.color === opp && (t.p.type === 'k' || (PIECE_VALUES[t.p.type] || 0) >= 5);
      if (chk(a, b) || chk(b, a)) return 'decouverte';
    }
    return null;
  }

  // A CHECKING move only forks if the target survives the parry. The old test
  // judged "is the target defended?" on the position that is still IN CHECK,
  // where chess.js only yields check-parrying moves — so real defenders were
  // invisible and any queen check grazing a defended piece looked like a fork
  // (the Dh4+ false positive). This plays out EVERY legal reply to the check
  // first, then asks whether the checking piece can still win a >=3 target for
  // net >=2. If even one reply saves everything, it isn't a fork.
  function winsTargetAfterCheck(afterFen, forkSq, side) {
    let g;
    try { g = new Chess(afterFen); } catch (_) { return false; }
    const opp = side === 'w' ? 'b' : 'w';
    let replies;
    try { replies = g.moves({ verbose: true }); } catch (_) { return false; }
    if (!replies.length) return false; // mate/stalemate → not a material fork
    for (const r of replies) {
      let g2;
      try { g2 = new Chess(afterFen); if (!g2.move(r.san, { sloppy: true })) return false; } catch (_) { return false; }
      const fen2 = g2.fen();
      const caps = movesFrom(fen2, forkSq, side).filter(m => m.captured && PIECE_VALUES[m.captured] >= 3);
      let winsHere = false;
      for (const c of caps) {
        const recapVal = opponentDefends(fen2, c.to, opp) ? (PIECE_VALUES[c.piece] || 0) : 0;
        if ((PIECE_VALUES[c.captured] || 0) - recapVal >= 2) { winsHere = true; break; }
      }
      if (!winsHere) return false; // this parry rescues the target → no fork
    }
    return true;
  }

  // After you play `playedSan`, can the opponent land a DANGEROUS check — mate,
  // a check that wins material outright, or a fork-with-check? This is the
  // pattern behind most beginner collapses (the "…g6 → échec-fourchette" trap).
  // Returns {san, from, to, why:'mat'|'gain'|'fourchette', piece?} or null.
  function dangerousCheckAfter(fen, playedSan) {
    let g;
    try { g = new Chess(fen); } catch (_) { return null; }
    const me = g.turn();
    if (!playMove(g, playedSan)) return null;
    const after = g.fen();
    const opp = g.turn();
    let checks;
    try { checks = g.moves({ verbose: true }).filter(m => /[+#]/.test(m.san)); } catch (_) { return null; }
    for (const c of checks) {
      if (c.san.includes('#')) return { san: c.san, from: c.from, to: c.to, why: 'mat' };
      if (c.captured && (PIECE_VALUES[c.captured] || 0) >= 3) {
        try {
          const g2 = new Chess(after);
          g2.move(c.san, { sloppy: true });
          const recap = g2.moves({ verbose: true }).some(m => m.to === c.to && m.captured);
          const net = (PIECE_VALUES[c.captured] || 0) - (recap ? (PIECE_VALUES[c.piece] || 0) : 0);
          if (net >= 2) return { san: c.san, from: c.from, to: c.to, why: 'gain', piece: c.captured };
        } catch (_) {}
      }
      try {
        const g2 = new Chess(after);
        if (!g2.move(c.san, { sloppy: true })) continue;
        const fen2 = g2.fen();
        // king excluded: the check IS the king attack — the fork needs a second,
        // capturable target that survives our parry (verified past the check,
        // not on the in-check position — same fix as detectMotif).
        const targets = movesFrom(fen2, c.to, opp).filter(m => m.captured && m.captured !== 'k' && (PIECE_VALUES[m.captured] || 0) >= 3);
        if (targets.length && !pieceWinnable(fen2, c.to, opp) && winsTargetAfterCheck(fen2, c.to, opp)) {
          const victim = targets.slice().sort((a, b) => (PIECE_VALUES[b.captured] || 0) - (PIECE_VALUES[a.captured] || 0))[0];
          return { san: c.san, from: c.from, to: c.to, why: 'fourchette', piece: victim.captured };
        }
      } catch (_) {}
    }
    return null;
  }

  // Is one of `side`'s own pieces hanging in this position (before they move)?
  // We hand the move to the opponent and look for a winning capture. Returns the
  // threatened square {square, piece, value, net} or null.
  function myHanging(fen, side) {
    const opp = side === 'w' ? 'b' : 'w';
    const parts = fen.split(' ');
    parts[1] = opp; parts[3] = '-';
    return bestHang(parts.join(' '));
  }

  // Can `side` (to move in `fen`) win material outright right now?
  function oppHanging(fen, side) {
    const parts = fen.split(' ');
    if (parts[1] !== side) { parts[1] = side; parts[3] = '-'; }
    return bestHang(parts.join(' '));
  }

  // Classify a mistake by what's most instructive: missed mate, then YOUR
  // hung piece (the #1 beginner error), then the tactic the best move lands.
  // detectMotif runs several chess.js move-generations per call (~2.5ms). Coach
  // re-derives the same motifs on every dashboard render (Vigilance/Focus/
  // Missed/Repeated all reclassify the whole archive), so cache on the pure
  // inputs — hundreds of blunders would otherwise cost ~800ms each render.
  const _motifCache = new Map();
  function detectMotif(fenBefore, bestUci, side, playedSan) {
    const ck = fenBefore + '|' + bestUci + '|' + side + '|' + (playedSan || '');
    const hit = _motifCache.get(ck);
    if (hit !== undefined) return hit;
    const res = _detectMotif(fenBefore, bestUci, side, playedSan);
    _motifCache.set(ck, res);
    return res;
  }
  function _detectMotif(fenBefore, bestUci, side, playedSan) {
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

    // Fork: the moved piece attacks 2+ WINNABLE targets (or a target + check),
    // and isn't simply capturable itself. The loose "attacks two things" test
    // over-fired ~1/3 of the time on captures/checks that are really just
    // material grabs (audit 2026-07-02), so verify it actually wins material —
    // otherwise fall through to 'gain'/'positionnel'.
    const forkSq = bestUci.slice(2, 4);
    const forkVal = PIECE_VALUES[move.piece] || 0;
    const givesCheck = move.san.includes('+');
    const targets = movesFrom(after, forkSq, side)
      .filter(m => m.captured && PIECE_VALUES[m.captured] >= 3);
    if (targets.length && !pieceWinnable(after, forkSq, side)) {
      const opp = side === 'w' ? 'b' : 'w';
      if (givesCheck) {
        // Check-fork: the check is one "prong", but only counts if a real
        // target survives the forced reply (verified past the parry).
        if (winsTargetAfterCheck(after, forkSq, side)) return 'fourchette';
      } else {
        // Quiet fork: needs 2+ genuinely winnable targets. Safe to judge
        // defenders on `after` here — no check means chess.js sees them all.
        const winnable = targets.filter(m => PIECE_VALUES[m.captured] >= forkVal || !opponentDefends(after, m.to, opp));
        if (winnable.length >= 2) return 'fourchette';
      }
    }

    // Pin / skewer created by the moved slider (tied to the move, and only if
    // the slider isn't simply hanging — same guard as the fork test).
    if (!pieceWinnable(after, forkSq, side)) {
      const ps = pinOrSkewerByMove(after, forkSq, side);
      if (ps) return ps;
    }
    // Discovered attack: vacating move.from unveils a friendly slider onto a
    // heavy enemy piece or the king.
    if (discoveredByMove(move.from, after, side)) return 'decouverte';

    if (move.captured && PIECE_VALUES[move.captured] >= 3) return 'gain';
    if (givesCheck) return 'attaque';
    if (move.captured) return 'gain';
    // Quiet best move, but you already had a piece hanging → the lesson is
    // defending, not a positional plan. Catches many mislabelled 'positionnel'.
    if (myHanging(fenBefore, side)) return 'defense';
    return 'positionnel';
  }

  // A blunder makes a good DRILL only if its engine "solution" is clean and
  // satisfying — otherwise the trainer shows a confusing "best move" that still
  // loses. Reject two junk cases (user-reported 2026-07-03, the Qxf6 puzzle):
  //   • mate-scale cpLoss → you were mating or being mated, not a material tactic
  //   • desperado → the solution throws the piece it moves (Qxf6, Rxf6 recaptures)
  // Forcing mate that keeps the piece is always kept.
  const _cleanCache = new Map();
  function isCleanPuzzle(item) {
    if (!item || !item.fen || !item.bestUci || item.bestUci.length < 4) return false;
    const ck = item.fen + '|' + item.bestUci + '|' + item.side + '|' + (item.cpLoss || 0);
    const hit = _cleanCache.get(ck);
    if (hit !== undefined) return hit;
    const res = _isCleanPuzzle(item);
    _cleanCache.set(ck, res);
    return res;
  }
  function _isCleanPuzzle(item) {
    let g, move;
    try {
      g = new Chess(item.fen);
      move = g.move({ from: item.bestUci.slice(0, 2), to: item.bestUci.slice(2, 4), promotion: item.bestUci[4] || 'q' });
      if (!move) return false;
    } catch (_) { return false; }
    // A forced mate is always a clean, instructive puzzle — keep it before the
    // cpLoss gate, since a missed mate is stored with a mate-scale cpLoss.
    if (move.san.includes('#')) return true;
    // Otherwise a mate-scale cpLoss means you were being mated / mating, not a
    // material tactic — not a useful "find the best move" card.
    if ((item.cpLoss || 0) > 2000) return false;
    return !pieceWinnable(g.fen(), item.bestUci.slice(2, 4), item.side);
  }

  // Canonical drillable-item set for a batch of analyzed games — the SAME
  // pipeline the SRS deck is built from (classify → isCleanPuzzle → dedup by
  // position). Coach tallies its motif cards from this so what it SHOWS equals
  // what you'll DRILL — one source of truth, no divergent raw blunder counts.
  // Each game must look like a Coach game: {uuid, oppName, userColor,
  // analysis:{blunderList:[{ply,fenBefore,bestUci,bestSan,playedSan,cpLoss}]}}.
  // Coach passes the SAME analyzed-games array to Vigilance/Focus/Missed in one
  // render pass; memoize on the array identity so the deck is built once, not
  // three times. (detectMotif/isCleanPuzzle caches cover repeats across passes.)
  const _itemsMemo = new WeakMap();
  function itemsForGames(games) {
    if (games && _itemsMemo.has(games)) return _itemsMemo.get(games);
    const res = _buildItemsForGames(games);
    if (games) _itemsMemo.set(games, res);
    return res;
  }
  function _buildItemsForGames(games) {
    const base = [];
    for (const g of games || []) {
      if (!g || !g.analysis) continue;
      const side = g.userColor;
      for (const b of g.analysis.blunderList || []) {
        if (!b || !b.fenBefore || !b.bestUci || b.bestUci.length < 4) continue;
        base.push({
          uuid: g.uuid, oppName: g.oppName || '?', ply: b.ply,
          fen: b.fenBefore, side, bestUci: b.bestUci, bestSan: b.bestSan || '',
          playedSan: b.playedSan || '', cpLoss: b.cpLoss || 0,
          motif: detectMotif(b.fenBefore, b.bestUci, side, b.playedSan || ''),
        });
      }
    }
    // Same clean filter + position-dedup as mergeItems (keep the costliest per
    // position, matching the deck's cpLoss cap sort).
    const bySig = new Map();
    for (const it of base.filter(isCleanPuzzle)) {
      const sig = it.fen + '|' + it.bestUci;
      const prev = bySig.get(sig);
      if (!prev || (it.cpLoss || 0) > (prev.cpLoss || 0)) bySig.set(sig, it);
    }
    return [...bySig.values()];
  }

  function motifCountsForGames(games) {
    const counts = {};
    for (const it of itemsForGames(games)) counts[it.motif] = (counts[it.motif] || 0) + 1;
    return counts;
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
        moveNo: Math.floor(i / 2) + 1, white, black, date, pv: r.bestPv || '',
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
        white: meta.white || '?', black: meta.black || '?', date: meta.date || '', pv: b.bestPv || '',
      });
    }
    return mergeItems(base);
  }

  // Merge freshly-built items into the deck, preserving SRS progress. Dedups
  // by id and by position signature (so the same mistake seen via the single
  // analyzer and via Coach doesn't become two cards), and never evicts cards
  // already in review when capping.
  const MUTABLE = ['bestSan', 'playedSan', 'type', 'cpLoss', 'motif', 'moveNo', 'white', 'black', 'date', 'pv'];
  function mergeItems(base) {
    base = base.filter(isCleanPuzzle);
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
    const all = load().filter(isCleanPuzzle);
    const reviews = all.filter(it => (it.reps || 0) > 0 && (it.due || 0) <= now);
    const freshPool = all.filter(it => (it.reps || 0) === 0 && (it.due || 0) <= now);
    // Weighted-random draw of new cards — leaning on costly, RECURRING and
    // RECENT mistakes (see cardWeight) rather than always the same biggest
    // cpLoss cards. Both groups shuffled so the sequence differs every session;
    // reviews stay ahead of new cards, only their internal order is randomised.
    const ctx = weightContext(freshPool);
    const fresh = weightedSample(freshPool, NEW_PER_SESSION, it => cardWeight(it, ctx));
    return shuffle(reviews).concat(shuffle(fresh));
  }

  function dueCount() {
    return buildSession().length;
  }

  // ───────────────────────── SRS scheduling ─────────────────────────
  function schedule(item, grade) {
    // grade: 'again' | 'good' | 'easy'
    const now = Date.now();
    if (grade === 'again') {
      item.interval = 0;
      item.ease = Math.max(1.7, item.ease - 0.2);
      item.due = now + 10 * 60 * 1000; // 10 min
      // Don't demote a card that was already in review back to reps=0: the new
      // pool is sorted by cpLoss and capped, so a low-cpLoss lapse would starve
      // there forever. Keep it a (short-interval) review so it resurfaces.
      if ((item.reps || 0) > 0) item.reps = 1;
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
    // Drag-and-drop (chess.com-style), coexisting with click-to-move. A tap still
    // runs the click handler above; only a real drag makes the move. The board
    // SVG is rebuilt on every render, so listeners never accumulate.
    BoardRenderer.enableDrag(board, {
      getFen: () => liveFen,
      arrows,
      canMove: () => !!onMove,
      onMove: (from, to) => { if (onMove) { selected = null; onMove(from, to); } },
    });
  }

  // ───────────────────────── PUZZLES tab ─────────────────────────
  let queue = [], qi = 0, current = null, solved = false, motifFilter = null;
  // Multi-move solution state: the line to play, which step we're on, and the
  // live position after the steps already solved.
  let solLine = [], solStep = 0, liveFen = null, checking = false;
  // Bumped on every puzzle render; a late engine continuation checks it so its
  // text never lands on the next puzzle the user has already moved to.
  let explainToken = 0;

  // Turn a stored PV (UCI plies, mover to move first) into a drill line: each of
  // the mover's moves paired with the opponent's forced reply from the PV. Caps
  // at 3 mover moves so a puzzle stays a puzzle, and stops at a mate. Falls back
  // to the single best move when there's no usable PV — which is every card
  // built before PVs were stored, so those behave exactly as before.
  function buildSolutionLine(item) {
    const single = [{ moverUci: item.bestUci, replyUci: null }];
    if (!item.pv) return single;
    const plies = String(item.pv).trim().split(/\s+/).filter(Boolean);
    if (plies.length < 3) return single;
    const out = [];
    try {
      const g = new Chess(item.fen);
      let pending = null;
      for (let k = 0; k < plies.length && out.length < 3; k++) {
        const u = plies[k];
        const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
        if (!m) break;
        if (k % 2 === 0) { pending = { moverUci: u, replyUci: null }; out.push(pending); if (m.san.includes('#')) break; }
        else if (pending) pending.replyUci = u;
      }
    } catch (_) { return single; }
    if (!out.length || out[0].moverUci !== item.bestUci) return single;
    return out.length >= 2 ? out : single;
  }

  // Is `played` as good as the intended move `wantUci` in `fen`? Asks Stockfish
  // (already warm) for the top lines and accepts the played move when it's within
  // a hair of the best — so a second, equally-winning move isn't marked wrong.
  // Returns false (fall back to exact-match) when the engine isn't ready.
  async function moveIsEquivalent(fen, played, wantUci) {
    if (typeof StockfishEngine === 'undefined' || !StockfishEngine.isReady()) return false;
    let res;
    try { res = await StockfishEngine.evaluate(fen, 'movetime 300'); } catch (_) { return false; }
    if (!res || !res.lines || !res.lines.length) return false;
    const playedUci = played.from + played.to + (played.promotion || '');
    if (playedUci === wantUci) return true;
    const line = res.lines.find(l => l && l.move === playedUci);
    if (!line) return false;
    return (res.lines[0].score - line.score) <= 30; // within ~0.3 pawn of the best line
  }

  function startPuzzles() {
    queue = motifFilter ? motifQueue(motifFilter) : buildSession();
    qi = 0;
    renderPuzzle();
  }

  // Drill one motif: due cards of that motif first, then biggest mistakes.
  function motifQueue(m) {
    const now = Date.now();
    const pool = load().filter(it => it.motif === m && isCleanPuzzle(it));
    // Due cards first (shuffled), then fill up to 20 with a weighted-random draw
    // of the rest — so drilling a motif varies each time rather than always the
    // same 20 in the same cpLoss order.
    const due = shuffle(pool.filter(it => (it.due || 0) <= now));
    const rest = pool.filter(it => (it.due || 0) > now);
    const ctx = weightContext(rest);
    const fill = weightedSample(rest, Math.max(0, 20 - due.length), it => cardWeight(it, ctx));
    return due.concat(shuffle(fill)).slice(0, 20);
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

  // "Coup 21 · tu avais joué Cf3 lors de ta partie contre Bob le 12 mai 2024"
  // — anchors the puzzle to the real game it came from (opponent + date), so a
  // recurring leak is recognisable ("ah, that game against Bob again").
  function puzzleContextHtml(it) {
    const opp = opponentName(it);
    const date = formatCardDate(it.date);
    let s = `Coup ${it.moveNo} · tu avais joué <b>${it.playedSan}</b>`;
    if (opp) s += ` lors de ta partie contre <b>${opp}</b>`;
    else s += ` lors de cette partie`;
    if (date) s += ` le ${date}`;
    return s;
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
    explainToken++;
    warmEngine();
    solLine = buildSolutionLine(current);
    solStep = 0;
    liveFen = current.fen;
    checking = false;
    const multi = solLine.length >= 2;
    const flip = current.side === 'b';
    host.innerHTML = bannerHtml() + `
      <div class="train-progress">Puzzle ${qi + 1} / ${queue.length}</div>
      <div class="train-prompt">Trait aux <b>${current.side === 'w' ? 'Blancs' : 'Noirs'}</b> — trouve ${multi ? `la combinaison (${solLine.length} coups)` : 'le meilleur coup'}.</div>
      <div class="train-board-wrap">
        <svg class="train-board" viewBox="0 0 360 360" id="train-board"></svg>
        <svg class="train-board" viewBox="0 0 360 360" id="train-arrows"></svg>
      </div>
      <div class="train-feedback" id="train-feedback"></div>
      <div class="train-actions" id="train-actions">
        <button class="train-btn ghost" id="puz-hint">💡 Indice</button>
        <button class="train-btn ghost" id="puz-reveal">Voir la solution</button>
      </div>
      <div class="train-context">${puzzleContextHtml(current)}</div>`;

    board = $('#train-board'); arrows = $('#train-arrows'); selected = null;
    BoardRenderer.setFlipped(flip);
    BoardRenderer.render(board, current.fen);
    onMove = attemptMove;
    attachBoardClicks();

    $('#puz-hint').onclick = () => {
      const u = (solLine[solStep] || {}).moverUci || current.bestUci;
      BoardRenderer.highlightSquares(arrows, [u.slice(0, 2)], '#5b8fb9');
    };
    $('#puz-reveal').onclick = () => revealSolution(false);
    bindBanner();
  }

  function setFeedback(cls, html) {
    const fb = $('#train-feedback');
    if (fb) { fb.className = 'train-feedback ' + cls; fb.innerHTML = html; }
  }

  async function attemptMove(from, to) {
    if (solved || checking) return;
    const step = solLine[solStep] || { moverUci: current.bestUci, replyUci: null };
    const want = step.moverUci;
    let played = null;
    try {
      const g = new Chess(liveFen);
      played = g.move({ from, to, promotion: 'q' });
    } catch (_) {}
    const legal = !!played;
    const exact = (from === want.slice(0, 2) && to === want.slice(2, 4));
    const isLast = solStep >= solLine.length - 1;

    // Exact intended move: finish (last step) or play on down the stored line.
    if (exact) {
      if (isLast) revealSolution(true);
      else advanceStep();
      return;
    }
    // Any legal mate is objectively best — accept it whatever the stored line is.
    if (played && played.san.includes('#')) { revealSolution(true, played); return; }
    if (!legal) { setFeedback('wrong', `⚠️ Coup illégal — clique (ou glisse) la pièce puis sa case d'arrivée.`); return; }

    // Accept an equally-good alternative if the engine agrees it's within a hair
    // of the intended move. For a multi-move line we can't keep the stored
    // continuation after a divergence, so an accepted alternative just solves it.
    setFeedback('', '⏳ Vérification…');
    checking = true;
    let ok = false;
    try { ok = await moveIsEquivalent(liveFen, played, want); } finally { checking = false; }
    if (solved) return; // user revealed / moved on while the engine thought
    if (ok) revealSolution(true, played);
    else setFeedback('wrong', `❌ Pas le meilleur coup. Réessaie, ou demande un indice.`);
  }

  // Play the current step's mover move + the opponent's forced reply, advance to
  // the next step, and prompt the user to continue the combination.
  function advanceStep() {
    const step = solLine[solStep];
    try {
      const g = new Chess(liveFen);
      g.move({ from: step.moverUci.slice(0, 2), to: step.moverUci.slice(2, 4), promotion: step.moverUci[4] || 'q' });
      let replySan = null;
      if (step.replyUci) {
        const rm = g.move({ from: step.replyUci.slice(0, 2), to: step.replyUci.slice(2, 4), promotion: step.replyUci[4] || 'q' });
        replySan = rm ? enToFr(rm.san) : null;
      }
      liveFen = g.fen();
      solStep++;
      selected = null;
      BoardRenderer.render(board, liveFen);
      BoardRenderer.clearArrows(arrows);
      setFeedback('right', `✔ Bien vu !${replySan ? ` L'adversaire répond <b>${replySan}</b>.` : ''} Continue — coup ${solStep + 1} sur ${solLine.length}.`);
    } catch (_) { revealSolution(true); }
  }

  // `altMove` (optional) = an equally-good move the user played instead of the
  // stored line; shown as also-correct.
  function revealSolution(correct, altMove) {
    solved = true;
    onMove = null;
    // Play the whole solution line from the original puzzle position, collecting
    // the SANs, the first move (for the board arrow) and the position right after
    // it (what explainPuzzle reasons about — unchanged single-move behaviour).
    let firstMove = null, afterFirstFen = null;
    const lineSans = [];
    try {
      const g = new Chess(current.fen);
      for (let s = 0; s < solLine.length; s++) {
        const mu = solLine[s].moverUci;
        const m = g.move({ from: mu.slice(0, 2), to: mu.slice(2, 4), promotion: mu[4] || 'q' });
        if (!m) break;
        if (s === 0) { firstMove = m; afterFirstFen = g.fen(); }
        lineSans.push(enToFr(m.san));
        if (m.san.includes('#')) break;
        const ru = solLine[s].replyUci;
        if (ru) { const rm = g.move({ from: ru.slice(0, 2), to: ru.slice(2, 4), promotion: ru[4] || 'q' }); if (rm) lineSans.push(enToFr(rm.san)); }
      }
      if (afterFirstFen) BoardRenderer.render(board, afterFirstFen, firstMove);
    } catch (_) {}
    BoardRenderer.drawArrows(arrows, [{ from: current.bestUci.slice(0, 2), to: current.bestUci.slice(2, 4), color: '#56b886', opacity: 0.9, width: 7 }]);

    const fb = $('#train-feedback');
    fb.className = 'train-feedback ' + (correct ? 'right' : 'shown');
    const motif = MOTIF_LABELS[current.motif] || 'Tactique';
    const bestFr = current.bestSan || (firstMove ? enToFr(firstMove.san) : '');
    const multi = solLine.length >= 2;
    const altFr = altMove ? enToFr(altMove.san) : null;
    let head;
    if (correct && altFr && altFr !== bestFr) head = `✅ Bravo ! <b>${altFr}</b> marche aussi bien — motif : ${motif}.`;
    else if (correct) head = `✅ Bravo ! <b>${bestFr}</b> — motif : ${motif}.`;
    else head = `Solution : <b>${bestFr}</b> — motif : ${motif}.`;
    if (multi && lineSans.length > 1) head += `<div class="train-line">Ligne : <b>${lineSans.join(' ')}</b></div>`;
    const prose = explainPuzzle(current, firstMove, afterFirstFen);
    fb.innerHTML = head + (prose
      ? `<div class="train-explain">${prose}<span id="train-explain-line"></span></div>`
      : '');
    // The extra engine continuation only helps single-move cards; a multi-move
    // card already shows its full line.
    if (!multi && afterFirstFen) maybeContinuation(afterFirstFen, bestFr, explainToken);

    $('#train-actions').innerHTML = `
      <button class="train-btn again" data-g="again">À revoir</button>
      <button class="train-btn good" data-g="good">Bon</button>
      <button class="train-btn easy" data-g="easy">Facile</button>`;
    $$('#train-actions .train-btn').forEach(b => {
      b.onclick = () => {
        const g = b.dataset.g;
        schedule(current, g);
        if (g === 'again') {
          // Re-ask this lapsed card later in the SAME session (Anki-style)
          // rather than freezing the queue at start and never revisiting it.
          queue.splice(Math.min(queue.length, qi + 3), 0, current);
        }
        qi++;
        renderPuzzle();
      };
    });
  }

  // Build the "pourquoi" prose for a solved puzzle: what the played move gave
  // away (hung piece / punishing check) + why the engine's move is the answer.
  // Fully local (reuses the motif SEE helpers) — no engine needed.
  function explainPuzzle(item, move, afterFen) {
    const fen = item.fen, side = item.side, parts = [];

    if (item.playedSan) {
      const hp = hungPiece(fen, item.playedSan);
      if (hp) {
        const p = PIECE_FR[hp.type] || { a: 'Ta', n: 'pièce' };
        parts.push(`En jouant <b>${item.playedSan}</b>, tu laissais ${p.a.toLowerCase()} <b>${p.n}</b> en prise en <b>${hp.square}</b>.`);
      } else {
        const dc = dangerousCheckAfter(fen, item.playedSan);
        if (dc && dc.why === 'mat') parts.push(`Après <b>${item.playedSan}</b>, l'adversaire avait <b>${enToFr(dc.san)}</b> : échec et mat.`);
        else if (dc && dc.why === 'fourchette') parts.push(`Après <b>${item.playedSan}</b>, <b>${enToFr(dc.san)}</b> faisait échec ET fourchette — il gagnait ${OPP_PIECE_FR[dc.piece] || 'du matériel'}.`);
        else if (dc) parts.push(`Après <b>${item.playedSan}</b>, l'échec <b>${enToFr(dc.san)}</b> gagnait ${OPP_PIECE_FR[dc.piece] || 'du matériel'}.`);
      }
    }

    const bs = item.bestSan || (move ? enToFr(move.san) : '');
    if (move && afterFen) {
      if (move.san.includes('#')) {
        parts.push(`<b>${bs}</b> est échec et mat.`);
      } else if (item.motif === 'fourchette') {
        const forkSq = item.bestUci.slice(2, 4);
        const names = [...new Set(movesFrom(afterFen, forkSq, side)
          .filter(m => m.captured && (PIECE_VALUES[m.captured] || 0) >= 3)
          .sort((a, b) => (PIECE_VALUES[b.captured] || 0) - (PIECE_VALUES[a.captured] || 0))
          .map(t => OPP_PIECE_FR[t.captured] || 'une pièce'))].slice(0, 2);
        parts.push(names.length >= 2
          ? `<b>${bs}</b> fait une fourchette : ${names[0]} et ${names[1]} sont attaqués en même temps — le matériel tombe au coup suivant.`
          : `<b>${bs}</b> fait une fourchette et gagne du matériel au coup suivant.`);
      } else if (item.motif === 'gain') {
        parts.push(move.captured
          ? `<b>${bs}</b> gagne ${OPP_PIECE_FR[move.captured] || 'du matériel'}${(PIECE_VALUES[move.captured] || 0) >= 5 ? ' — une pièce lourde' : ''}.`
          : `<b>${bs}</b> gagne du matériel.`);
      } else if (item.motif === 'defense') {
        const mh = myHanging(fen, side);
        const p = mh ? (PIECE_FR[mh.piece] || { a: 'Ta', n: 'pièce' }) : null;
        parts.push(mh
          ? `<b>${bs}</b> met à l'abri ${p.a.toLowerCase()} <b>${p.n}</b> qui était en prise en <b>${mh.square}</b>.`
          : `<b>${bs}</b> pare la menace et garde ton matériel.`);
      } else if (item.motif === 'prise') {
        const capVal = move.captured ? (PIECE_VALUES[move.captured] || 0) : 0;
        if (capVal >= 3 && capturedIsAttackerOf(fen, move, side)) {
          const p = PIECE_FR[move.piece] || { a: 'Ta', n: 'pièce' };
          parts.push(`<b>${bs}</b> capture <b>${ADV_PIECE_FR[move.captured] || 'la pièce adverse'}</b> qui menaçait ${p.a.toLowerCase()} <b>${p.n}</b> — tu sauves ton matériel en contre-attaquant.`);
        } else if (capVal >= 3) {
          parts.push(`<b>${bs}</b> contre-attaque en capturant ${OPP_PIECE_FR[move.captured] || 'du matériel'} — tu gardes ton matériel en sécurité.`);
        } else if (move.captured) {
          parts.push(`<b>${bs}</b> met ton matériel à l'abri tout en gagnant un pion.`);
        } else {
          parts.push(`<b>${bs}</b> était le coup solide : il met ton matériel à l'abri.`);
        }
      } else if (item.motif === 'attaque') {
        parts.push(`<b>${bs}</b> donne un échec qui reprend l'initiative.`);
      } else if (item.motif === 'mat') {
        parts.push(`<b>${bs}</b> lance un mat forcé.`);
      } else if (item.motif === 'clouage') {
        parts.push(`<b>${bs}</b> cloue une pièce adverse : elle ne peut plus bouger sans exposer une pièce plus importante (ou le roi) — tu la gagnes ensuite.`);
      } else if (item.motif === 'enfilade') {
        parts.push(`<b>${bs}</b> enfile deux pièces alignées : la plus importante doit bouger et laisse tomber celle de derrière.`);
      } else if (item.motif === 'decouverte') {
        parts.push(`<b>${bs}</b> découvre l'attaque d'une pièce placée derrière — deux menaces d'un coup.`);
      } else if (move.captured) {
        parts.push(`<b>${bs}</b> gagne ${OPP_PIECE_FR[move.captured] || 'du matériel'}.`);
      } else {
        parts.push(`<b>${bs}</b> garde l'avantage et améliore ta position.`);
      }
    }

    return parts.join(' ');
  }

  // Did the piece the best move just captured (sitting on move.to in `fen`)
  // attack the square the mover came from? i.e. was this capture a counter-hit
  // on the very piece that was threatening yours. Judged on `fen` (before the
  // move), giving the opponent the move so its attacks are visible.
  function capturedIsAttackerOf(fen, move, side) {
    if (!move || !move.captured) return false;
    const opp = side === 'w' ? 'b' : 'w';
    return movesFrom(fen, move.to, opp).some(m => m.to === move.from && m.captured);
  }

  // Continuation line is a nice-to-have: only if Stockfish is ALREADY warm
  // (never force a 10s init just for this). Warm it in the background on the
  // first puzzle so later reveals can show a line.
  let engineWarmTried = false;
  function warmEngine() {
    if (engineWarmTried || typeof StockfishEngine === 'undefined') return;
    engineWarmTried = true;
    if (StockfishEngine.isReady()) return;
    try { StockfishEngine.init().catch(() => {}); } catch (_) {}
  }

  function pvLineFr(startFen, pvUci, maxPlies) {
    if (!pvUci) return [];
    const out = [];
    try {
      const g = new Chess(startFen);
      for (const u of pvUci.trim().split(/\s+/)) {
        if (out.length >= maxPlies) break;
        const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
        if (!m) break;
        out.push(enToFr(m.san));
      }
    } catch (_) {}
    return out;
  }

  async function maybeContinuation(afterFen, bestFr, token) {
    if (typeof StockfishEngine === 'undefined' || !StockfishEngine.isReady()) return;
    let res;
    try { res = await StockfishEngine.evaluate(afterFen, 'movetime 350'); } catch (_) { return; }
    if (token !== explainToken) return; // user already moved to another puzzle
    const line = pvLineFr(afterFen, res && res.pv, 3);
    const el = $('#train-explain-line');
    if (!line.length || !el) return;
    el.innerHTML = ` <span class="train-cont">Suite probable : <b>${[bestFr].concat(line).join(' ')}</b></span>`;
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

  // ───────────────────────── VIGILANCE (anti-gaffe reflex) tab ─────────────────────────
  // Before every move a beginner should scan: is one of MY pieces hanging? can I
  // win material for free? This drill trains exactly that on your real positions:
  // a yes/no question, then it reveals and highlights the piece.
  let vQueue = [], vi = 0, vScore = 0;
  const PIECE_FR = {
    p: { a: 'Ton', n: 'pion' }, n: { a: 'Ton', n: 'cavalier' }, b: { a: 'Ton', n: 'fou' },
    r: { a: 'Ta', n: 'tour' }, q: { a: 'Ta', n: 'dame' }, k: { a: 'Ton', n: 'roi' }
  };
  const OPP_PIECE_FR = { p: 'un pion', n: 'un cavalier', b: 'un fou', r: 'une tour', q: 'une dame', k: 'un roi' };
  const ADV_PIECE_FR = { p: 'le pion adverse', n: 'le cavalier adverse', b: 'le fou adverse', r: 'la tour adverse', q: 'la dame adverse', k: 'le roi adverse' };

  function enToFr(san) {
    return (san || '').replace(/[KQRBN]/g, c => ({ K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' }[c]));
  }

  // Resolve a (possibly French) SAN on a fen → {from, to, afterFen}, or null.
  function sanApply(fen, san) {
    try {
      const g = new Chess(fen);
      const m = playMove(g, san);
      return m ? { from: m.from, to: m.to, afterFen: g.fen() } : null;
    } catch (_) { return null; }
  }

  function startVigilance() {
    const all = load().slice();
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    vQueue = all.slice(0, 8).map(it => {
      const r = Math.random();
      let mode = r < 0.34 ? 'def' : r < 0.67 ? 'off' : 'chk';
      let planned = null;
      if (mode === 'chk') {
        planned = it.playedSan ? sanApply(it.fen, it.playedSan) : null;
        if (!planned) mode = r < 0.5 ? 'def' : 'off';
      }
      const hazard = mode === 'def' ? myHanging(it.fen, it.side)
        : mode === 'off' ? oppHanging(it.fen, it.side)
        : dangerousCheckAfter(it.fen, it.playedSan);
      return { fen: it.fen, side: it.side, mode, planned, played: it.playedSan || '', hazard: hazard || null };
    });
    vi = 0; vScore = 0;
    renderVigilance();
  }

  function renderVigilance() {
    const host = $('#train-vigilance');
    if (load().length < 4) {
      host.innerHTML = `<div class="train-empty">Pas encore assez de positions.<br><span>Analyse quelques parties : on te fera travailler le réflexe anti-gaffe sur tes vraies positions.</span></div>`;
      return;
    }
    if (!vQueue.length) { startVigilance(); return; }
    if (vi >= vQueue.length) {
      const msg = vScore >= 7 ? 'Œil de lynx ! Ce réflexe te fera gagner des parties.'
        : vScore >= 4 ? 'Ça vient — refais une série.'
        : 'Prends l\'habitude : à chaque coup, checke d\'abord les prises.';
      host.innerHTML = `<div class="train-empty">Score : <b>${vScore} / ${vQueue.length}</b><br><span>${msg}</span></div>
        <div class="train-actions"><button class="train-btn good" id="vig-again">Nouvelle série</button></div>`;
      $('#vig-again').onclick = startVigilance;
      return;
    }
    const q = vQueue[vi];
    const question = q.mode === 'def'
      ? 'Une de tes pièces est-elle <b>en prise</b> ?'
      : q.mode === 'off'
      ? 'Peux-tu <b>gagner du matériel</b> tout de suite ?'
      : `Tu envisages <b>${q.played}</b> (flèche). L'adversaire aura-t-il un <b>échec dangereux</b> en réponse ?`;
    host.innerHTML = `
      <div class="train-progress">Position ${vi + 1} / ${vQueue.length} · Score ${vScore}</div>
      <div class="train-prompt">Trait aux <b>${q.side === 'w' ? 'Blancs' : 'Noirs'}</b> (toi). ${question}</div>
      <div class="train-board-wrap">
        <svg class="train-board" viewBox="0 0 360 360" id="vig-board"></svg>
        <svg class="train-board" viewBox="0 0 360 360" id="vig-arrows"></svg>
      </div>
      <div class="train-options vig-yn" id="vig-options">
        <button class="train-opt" data-a="yes">Oui</button>
        <button class="train-opt" data-a="no">Non</button>
      </div>
      <div class="train-feedback" id="vig-feedback"></div>`;
    BoardRenderer.setFlipped(q.side === 'b');
    BoardRenderer.render($('#vig-board'), q.fen);
    if (q.mode === 'chk' && q.planned)
      BoardRenderer.drawArrows($('#vig-arrows'), [{ from: q.planned.from, to: q.planned.to, color: '#5b8fb9' }]);
    $$('#vig-options .train-opt').forEach(b => b.onclick = () => answerVig(b.dataset.a === 'yes'));
  }

  function answerVig(saidYes) {
    const opts = $('#vig-options');
    if (opts.classList.contains('done')) return;
    opts.classList.add('done');
    const q = vQueue[vi];
    const has = !!q.hazard;
    const correct = saidYes === has;
    if (correct) vScore++;
    $$('#vig-options .train-opt').forEach(b => {
      const isYes = b.dataset.a === 'yes';
      if (isYes === has) b.classList.add('correct');
      else if (isYes === saidYes) b.classList.add('incorrect');
      b.disabled = true;
    });
    if (has && q.mode === 'chk') {
      // Reveal the position AFTER the planned move, with the punishing check drawn.
      BoardRenderer.render($('#vig-board'), q.planned.afterFen);
      BoardRenderer.drawArrows($('#vig-arrows'), [{ from: q.hazard.from, to: q.hazard.to, color: '#d36b6b' }]);
    } else if (has) {
      BoardRenderer.highlightSquares($('#vig-arrows'), [q.hazard.square], q.mode === 'def' ? '#d36b6b' : '#56b886');
    }
    let detail;
    if (has && q.mode === 'def') {
      const p = PIECE_FR[q.hazard.piece] || { a: 'Ta', n: 'pièce' };
      detail = ` ${p.a} <b>${p.n}</b> en <b>${q.hazard.square}</b> est en prise — sauve-la ou défends-la avant de jouer autre chose.`;
    } else if (has && q.mode === 'off') {
      detail = ` Tu peux prendre <b>${OPP_PIECE_FR[q.hazard.piece] || 'du matériel'}</b> en <b>${q.hazard.square}</b>.`;
    } else if (has && q.hazard.why === 'mat') {
      detail = ` Après ${q.played}, <b>${enToFr(q.hazard.san)}</b> serait mat ! Cherche toujours les échecs adverses avant de jouer.`;
    } else if (has && q.hazard.why === 'fourchette') {
      detail = ` Après ${q.played}, <b>${enToFr(q.hazard.san)}</b> fait échec ET attaque <b>${OPP_PIECE_FR[q.hazard.piece] || 'une pièce'}</b> — une fourchette : le matériel tombe au coup suivant.`;
    } else if (has) {
      detail = ` Après ${q.played}, l'échec <b>${enToFr(q.hazard.san)}</b> gagne <b>${OPP_PIECE_FR[q.hazard.piece] || 'du matériel'}</b>.`;
    } else if (q.mode === 'def') {
      detail = ' Rien en prise ici — tu peux suivre ton plan sereinement.';
    } else if (q.mode === 'off') {
      detail = ' Rien à gagner de force ici — cherche plutôt à améliorer une pièce.';
    } else {
      detail = ` Pas d'échec dangereux en réponse — de ce côté-là, ${q.played} ne t'expose pas.`;
    }
    const fb = $('#vig-feedback');
    fb.className = 'train-feedback ' + (correct ? 'right' : 'wrong');
    fb.innerHTML = (correct ? '✅ Bien vu !' : '❌ Raté.') + detail + ` <button class="train-btn good" id="vig-next">Suivant ▶</button>`;
    $('#vig-next').onclick = () => { vi++; renderVigilance(); };
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
    else if (tab === 'vigilance') startVigilance();
    else renderMotifs();
  }

  // Open the trainer directly on one motif (used by Coach's focus card).
  function showMotif(m) {
    show();
    if (m) { motifFilter = m; switchTab('puzzles'); }
  }

  // Re-tag the stored deck once, as soon as the module loads (Chess is already
  // global — chess.min.js is included before this file).
  try { retagDeck(); } catch (_) {}

  return { capture, ingestGame, dueCount, show, showMotif, hungPiece, detectMotif, retagDeck, itemsForGames, motifCountsForGames, explainPuzzle, MOTIF_LABELS, TACTICAL };
})();
