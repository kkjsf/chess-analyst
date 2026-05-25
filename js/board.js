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
    drawArrows(overlaySvg, [{ from: fromSq, to: toSq, color: '#e2b857', opacity: 0.6, width: 5 }]);
  }

  function drawArrows(overlaySvg, arrows) {
    if (!arrows || arrows.length === 0) { clearArrows(overlaySvg); return; }

    const colors = [...new Set(arrows.map(a => a.color || '#e2b857'))];
    let defsHtml = '<defs>';
    for (const c of colors) {
      const id = 'ah-' + c.replace('#', '');
      defsHtml += `<marker id="${id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${c}" opacity="0.8"/></marker>`;
    }
    defsHtml += '</defs>';

    let html = defsHtml;
    for (const a of arrows) {
      const f = squareToCoords(a.from);
      const t = squareToCoords(a.to);
      const x1 = f.col * SQ + SQ / 2, y1 = f.row * SQ + SQ / 2;
      const x2 = t.col * SQ + SQ / 2, y2 = t.row * SQ + SQ / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      const ux = dx / len, uy = dy / len;
      const sx = x1 + ux * 8, sy = y1 + uy * 8;
      const ex = x2 - ux * 8, ey = y2 - uy * 8;
      const color = a.color || '#e2b857';
      const markerId = 'ah-' + color.replace('#', '');
      html += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="${a.width || 5}" opacity="${a.opacity || 0.6}" marker-end="url(#${markerId})" stroke-linecap="round"/>`;
    }
    overlaySvg.innerHTML = html;
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

  return { render, drawArrow, drawArrows, clearArrows, getCapturedPieces };
})();
