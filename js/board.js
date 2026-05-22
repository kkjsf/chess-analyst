const BoardRenderer = (() => {
  const SQ = 45;
  const PIECES_UNI = {
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
    P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔'
  };
  const FILES = 'abcdefgh';
  const LIGHT = '#b7c0d8';
  const DARK = '#4a6fa1';
  const HL_FROM = 'rgba(226,184,87,0.35)';
  const HL_TO = 'rgba(226,184,87,0.55)';

  function fenToBoard(fen) {
    const rows = fen.split(' ')[0].split('/');
    const board = [];
    for (const row of rows) {
      const r = [];
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') {
          for (let i = 0; i < +ch; i++) r.push(null);
        } else {
          r.push(ch);
        }
      }
      board.push(r);
    }
    return board;
  }

  function squareToCoords(sq) {
    const col = FILES.indexOf(sq[0]);
    const row = 8 - parseInt(sq[1]);
    return { row, col };
  }

  function render(svgEl, fen, lastMove) {
    const board = fenToBoard(fen);
    let html = '';
    let hlFrom = null, hlTo = null;

    if (lastMove) {
      hlFrom = squareToCoords(lastMove.from);
      hlTo = squareToCoords(lastMove.to);
    }

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const isLight = (row + col) % 2 === 0;
        const x = col * SQ;
        const y = row * SQ;

        let fill = isLight ? LIGHT : DARK;
        if (hlFrom && hlFrom.row === row && hlFrom.col === col) fill = HL_FROM;
        if (hlTo && hlTo.row === row && hlTo.col === col) fill = HL_TO;

        html += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="${fill}"/>`;

        if (col === 0) {
          const clr = isLight ? DARK : LIGHT;
          html += `<text x="${x + 3}" y="${y + 13}" fill="${clr}" font-size="10" font-weight="600" font-family="Inter,sans-serif">${8 - row}</text>`;
        }
        if (row === 7) {
          const clr = isLight ? DARK : LIGHT;
          html += `<text x="${x + SQ - 9}" y="${y + SQ - 3}" fill="${clr}" font-size="10" font-weight="600" font-family="Inter,sans-serif">${FILES[col]}</text>`;
        }

        const piece = board[row][col];
        if (piece) {
          html += `<text x="${x + SQ / 2}" y="${y + SQ / 2 + 13}" text-anchor="middle" font-size="34" style="pointer-events:none">${PIECES_UNI[piece]}</text>`;
        }
      }
    }
    svgEl.innerHTML = html;
  }

  function drawArrow(overlaySvg, fromSq, toSq) {
    const from = squareToCoords(fromSq);
    const to = squareToCoords(toSq);
    const x1 = from.col * SQ + SQ / 2;
    const y1 = from.row * SQ + SQ / 2;
    const x2 = to.col * SQ + SQ / 2;
    const y2 = to.row * SQ + SQ / 2;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    const sx = x1 + ux * 8;
    const sy = y1 + uy * 8;
    const ex = x2 - ux * 8;
    const ey = y2 - uy * 8;

    const existing = overlaySvg.querySelector('defs');
    const defs = existing ? existing.outerHTML : '';
    overlaySvg.innerHTML = defs +
      `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#e2b857" stroke-width="5" opacity="0.6" marker-end="url(#arrowhead)" stroke-linecap="round"/>`;
  }

  function clearArrows(overlaySvg) {
    const existing = overlaySvg.querySelector('defs');
    overlaySvg.innerHTML = existing ? existing.outerHTML : '';
  }

  function getCapturedPieces(fen) {
    const initial = { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1, p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
    const boardPart = fen.split(' ')[0];
    const current = {};
    for (const ch of boardPart) {
      if (PIECES_UNI[ch]) current[ch] = (current[ch] || 0) + 1;
    }
    const whiteCaptures = [];
    const blackCaptures = [];
    for (const p of ['q', 'r', 'b', 'n', 'p']) {
      const missing = (initial[p] || 0) - (current[p] || 0);
      for (let i = 0; i < missing; i++) whiteCaptures.push(PIECES_UNI[p]);
    }
    for (const p of ['Q', 'R', 'B', 'N', 'P']) {
      const missing = (initial[p] || 0) - (current[p] || 0);
      for (let i = 0; i < missing; i++) blackCaptures.push(PIECES_UNI[p]);
    }
    return { white: whiteCaptures.join(''), black: blackCaptures.join('') };
  }

  return { render, drawArrow, clearArrows, getCapturedPieces };
})();
