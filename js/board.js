const BoardRenderer = (() => {
  const SQ = 45;
  const PIECES_UNI = {
    p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
    P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔'
  };
  const FILES = 'abcdefgh';
  const LIGHT = '#ebd7b2';
  const DARK = '#ae8a68';
  const HL_FROM = '#cdd26a';
  const HL_TO = '#aaa23a';
  const BORDER_COLOR = '#6b5339';

  let flipped = false;

  function setFlipped(val) { flipped = !!val; }
  function isFlipped() { return flipped; }

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
    if (flipped) return { row: 7 - row, col: 7 - col };
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

    html += `<defs>
      <filter id="piece-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.45"/>
      </filter>
    </defs>`;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const boardRow = flipped ? 7 - row : row;
        const boardCol = flipped ? 7 - col : col;
        const isLight = (boardRow + boardCol) % 2 === 0;
        const x = col * SQ;
        const y = row * SQ;

        const isHlFrom = hlFrom && hlFrom.row === row && hlFrom.col === col;
        const isHlTo = hlTo && hlTo.row === row && hlTo.col === col;

        let fill;
        if (isHlTo) fill = HL_TO;
        else if (isHlFrom) fill = HL_FROM;
        else fill = isLight ? LIGHT : DARK;

        html += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="${fill}"/>`;

        if (col === 0) {
          const clr = isLight ? DARK : LIGHT;
          html += `<text x="${x + 3}" y="${y + 12}" fill="${clr}" font-size="10" font-weight="700" font-family="Inter,system-ui,sans-serif" opacity="0.8">${8 - boardRow}</text>`;
        }
        if (row === 7) {
          const clr = isLight ? DARK : LIGHT;
          html += `<text x="${x + SQ - 8}" y="${y + SQ - 3}" fill="${clr}" font-size="10" font-weight="700" font-family="Inter,system-ui,sans-serif" opacity="0.8">${FILES[boardCol]}</text>`;
        }

        const piece = board[boardRow][boardCol];
        if (piece) {
          const isWhitePiece = piece === piece.toUpperCase() && piece !== piece.toLowerCase();
          const stroke = isWhitePiece ? 'rgba(0,0,0,0.3)' : 'none';
          const strokeW = isWhitePiece ? 0.5 : 0;
          html += `<text x="${x + SQ / 2}" y="${y + SQ / 2 + 14}" text-anchor="middle" font-size="36" filter="url(#piece-shadow)" stroke="${stroke}" stroke-width="${strokeW}" style="pointer-events:none">${PIECES_UNI[piece]}</text>`;
        }
      }
    }
    svgEl.innerHTML = html;
  }

  function drawArrow(overlaySvg, fromSq, toSq) {
    drawArrows(overlaySvg, [{ from: fromSq, to: toSq, color: '#56b886', opacity: 0.85, width: 6 }]);
  }

  function drawArrows(overlaySvg, arrows) {
    if (!arrows || arrows.length === 0) { clearArrows(overlaySvg); return; }

    const colors = [...new Set(arrows.map(a => a.color || '#56b886'))];
    let defsHtml = '<defs>';
    for (const c of colors) {
      const id = 'ah-' + c.replace('#', '');
      defsHtml += `<marker id="${id}" markerWidth="4" markerHeight="4" refX="2.5" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0.5,0.3 L3.5,2 L0.5,3.7 Z" fill="${c}"/></marker>`;
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
      const sx = x1 + ux * 10, sy = y1 + uy * 10;
      const ex = x2 - ux * 12, ey = y2 - uy * 12;
      const color = a.color || '#56b886';
      const markerId = 'ah-' + color.replace('#', '');
      const w = a.width || 6;
      const op = a.opacity || 0.85;
      html += `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="${w}" opacity="${op}" marker-end="url(#${markerId})" stroke-linecap="round"/>`;
    }
    overlaySvg.innerHTML = html;
  }

  function clearArrows(overlaySvg) {
    overlaySvg.innerHTML = '';
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

  return { render, drawArrow, drawArrows, clearArrows, getCapturedPieces, setFlipped, isFlipped };
})();
