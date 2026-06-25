const BoardRenderer = (() => {
  const SQ = 45;
  const PIECE_CHAR = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
  // Vector pieces (Cburnett set, CC-BY-SA) drawn on a native 45x45 grid — matches SQ exactly.
  const PIECE_DEFS = {
    'K': '<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.63V6M20 8h5"/><path fill="#fff" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#fff" d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g>',
    'Q': '<g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0m16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M41 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0M16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0M33 9a2 2 0 1 1-4 0 2 2 0 1 1 4 0"/><path stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14z"/><path stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"/></g>',
    'R': '<g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9zm3-3v-4h21v4zm-1-22V9h4v2h5V9h5v2h5V9h4v5"/><path d="m34 14-3 3H14l-3-3"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M31 17v12.5H14V17"/><path d="m31 29.5 1.5 2.5h-20l1.5-2.5"/><path fill="none" stroke-linejoin="miter" d="M11 14h23"/></g>',
    'B': '<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g>',
    'N': '<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#fff" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#fff" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><path fill="#000" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.433-9.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5"/></g>',
    'P': '<path fill="#fff" stroke="#000" stroke-linecap="round" stroke-width="1.5" d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/>',
    'k': '<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linejoin="miter" d="M22.5 11.6V6"/><path fill="#000" stroke-linecap="butt" stroke-linejoin="miter" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path fill="#000" d="M11.5 37a22.3 22.3 0 0 0 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10z"/><path stroke-linejoin="miter" d="M20 8h5"/><path stroke="#ececec" d="M32 29.5s8.5-4 6-9.7C34.1 14 25 18 22.5 24.6v2.1-2.1C20 18 9.9 14 7 19.9c-2.5 5.6 4.8 9 4.8 9"/><path stroke="#ececec" d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g>',
    'q': '<g fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g stroke="none"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/></g><path stroke-linecap="butt" d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5z"/><path stroke-linecap="butt" d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path fill="none" stroke-linecap="butt" d="M11 38.5a35 35 1 0 0 23 0"/><path fill="none" stroke="#ececec" d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0"/></g>',
    'r': '<g fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path stroke-linecap="butt" d="M9 39h27v-3H9zm3.5-7 1.5-2.5h17l1.5 2.5zm-.5 4v-4h21v4z"/><path stroke-linecap="butt" stroke-linejoin="miter" d="M14 29.5v-13h17v13z"/><path stroke-linecap="butt" d="M14 16.5 11 14h23l-3 2.5zM11 14V9h4v2h5V9h5v2h5V9h4v5z"/><path fill="none" stroke="#ececec" stroke-linejoin="miter" stroke-width="1" d="M12 35.5h21m-20-4h19m-18-2h17m-17-13h17M11 14h23"/></g>',
    'b': '<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g fill="#000" stroke-linecap="butt"><path d="M9 36c3.4-1 10.1.4 13.5-2 3.4 2.4 10.1 1 13.5 2 0 0 1.6.5 3 2-.7 1-1.6 1-3 .5-3.4-1-10.1.5-13.5-1-3.4 1.5-10.1 0-13.5 1-1.4.5-2.3.5-3-.5 1.4-2 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path stroke="#ececec" stroke-linejoin="miter" d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/></g>',
    'n': '<g fill="none" fill-rule="evenodd" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path fill="#000" d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path fill="#000" d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-1-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-2 2.5-3c1 0 1 3 1 3"/><path fill="#ececec" stroke="#ececec" d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0m5.43-9.75a.5 1.5 30 1 1-.86-.5.5 1.5 30 1 1 .86.5"/><path fill="#ececec" stroke="none" d="m24.55 10.4-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34s-5.79-6.64-9.19-7.16z"/></g>',
    'p': '<path stroke="#000" stroke-linecap="round" stroke-width="1.5" d="M22.5 9a4 4 0 0 0-3.22 6.38 6.48 6.48 0 0 0-.87 10.65c-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47a6.46 6.46 0 0 0-.87-10.65A4.01 4.01 0 0 0 22.5 9z"/>'
  };
  const FILES = 'abcdefgh';
  const LIGHT = '#eeeed2';
  const DARK = '#769656';
  const HL_FROM = '#f6f669';
  const HL_TO = '#baca2b';

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

  function buildBoard(fen, lastMove) {
    const board = fenToBoard(fen);
    let html = '';
    let hlFrom = null, hlTo = null;

    if (lastMove) {
      hlFrom = squareToCoords(lastMove.from);
      hlTo = squareToCoords(lastMove.to);
    }

    const pieces = [];
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
          pieces.push({ piece, x, y, sq: FILES[boardCol] + (8 - boardRow) });
        }
      }
    }
    return { boardHtml: html, pieces };
  }

  function renderPieceHtml(p) {
    return `<g transform="translate(${p.x},${p.y})" style="pointer-events:none">${PIECE_DEFS[p.piece]}</g>`;
  }

  function render(svgEl, fen, lastMove) {
    const { boardHtml, pieces } = buildBoard(fen, lastMove);
    let html = boardHtml;
    for (const p of pieces) html += renderPieceHtml(p);
    svgEl.innerHTML = html;
  }

  function renderAnimated(svgEl, prevFen, fen, lastMove, duration) {
    if (!prevFen || !lastMove || duration <= 0) { render(svgEl, fen, lastMove); return; }

    const { boardHtml, pieces: newPieces } = buildBoard(fen, lastMove);

    const fromCoords = squareToCoords(lastMove.from);
    const toCoords = squareToCoords(lastMove.to);
    const fromX = fromCoords.col * SQ;
    const fromY = fromCoords.row * SQ;
    const toX = toCoords.col * SQ;
    const toY = toCoords.row * SQ;

    let movingPiece = null;
    for (const p of newPieces) {
      if (p.sq === lastMove.to) { movingPiece = p; break; }
    }
    if (!movingPiece) { render(svgEl, fen, lastMove); return; }

    let html = boardHtml;
    for (const p of newPieces) {
      if (p === movingPiece) continue;
      html += renderPieceHtml(p);
    }

    const ms = duration;
    html += `<g transform="translate(${fromX},${fromY})" style="pointer-events:none">
      <animateTransform attributeName="transform" type="translate" from="${fromX} ${fromY}" to="${toX} ${toY}" dur="${ms}ms" fill="freeze"/>
      ${PIECE_DEFS[movingPiece.piece]}</g>`;

    svgEl.innerHTML = html;
  }

  function drawArrow(overlaySvg, fromSq, toSq) {
    drawArrows(overlaySvg, [{ from: fromSq, to: toSq, color: '#56b886', opacity: 0.85, width: 6 }]);
  }

  function drawArrows(overlaySvg, arrows) {
    if (!arrows || arrows.length === 0) { clearArrows(overlaySvg); return; }

    // Arrowhead in user-space units (constant size, not scaled by stroke width)
    // so short one-square arrows aren't swallowed by a giant head.
    const colors = [...new Set(arrows.map(a => a.color || '#56b886'))];
    let defsHtml = '<defs>';
    for (const c of colors) {
      const id = 'ah-' + c.replace('#', '');
      defsHtml += `<marker id="${id}" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M2,2 L12,7 L2,12 Z" fill="${c}"/></marker>`;
    }
    defsHtml += '</defs>';

    let html = defsHtml;
    for (const a of arrows) {
      const color = a.color || '#56b886';
      const op = a.opacity || 0.85;
      const w = a.width || 6;
      const f = squareToCoords(a.from);
      const t = squareToCoords(a.to);
      const x1 = f.col * SQ + SQ / 2, y1 = f.row * SQ + SQ / 2;
      const x2 = t.col * SQ + SQ / 2, y2 = t.row * SQ + SQ / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      // Same square (from === to): mark it with a ring — used to flag an
      // outpost / weak square where a piece should settle.
      if (len < 1) {
        html += `<circle cx="${x1}" cy="${y1}" r="${SQ / 2 - 4}" fill="none" stroke="${color}" stroke-width="${w}" opacity="${op}"/>`;
        continue;
      }
      const ux = dx / len, uy = dy / len;
      // Trim ends proportionally so short arrows keep a visible shaft.
      const startTrim = Math.min(SQ * 0.30, len * 0.20);
      const headTrim = Math.min(SQ * 0.36, len * 0.34);
      const sx = x1 + ux * startTrim, sy = y1 + uy * startTrim;
      const ex = x2 - ux * headTrim, ey = y2 - uy * headTrim;
      const markerId = 'ah-' + color.replace('#', '');
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
      if ('pnbrqkPNBRQK'.includes(ch)) current[ch] = (current[ch] || 0) + 1;
    }
    const whiteCaptures = [];
    const blackCaptures = [];
    for (const p of ['q', 'r', 'b', 'n', 'p']) {
      const missing = (initial[p] || 0) - (current[p] || 0);
      for (let i = 0; i < missing; i++) whiteCaptures.push(PIECE_CHAR[p]);
    }
    for (const p of ['Q', 'R', 'B', 'N', 'P']) {
      const missing = (initial[p] || 0) - (current[p] || 0);
      for (let i = 0; i < missing; i++) blackCaptures.push(PIECE_CHAR[p.toLowerCase()]);
    }
    return { white: whiteCaptures.join(''), black: blackCaptures.join('') };
  }

  function coordToSquare(svgEl, clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    let col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    let row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const boardRow = flipped ? 7 - row : row;
    const boardCol = flipped ? 7 - col : col;
    return FILES[boardCol] + (8 - boardRow);
  }

  function highlightSquares(overlaySvg, squares, color) {
    let html = '';
    for (const sq of squares) {
      const { row, col } = squareToCoords(sq);
      html += `<rect x="${col * SQ}" y="${row * SQ}" width="${SQ}" height="${SQ}" fill="none" stroke="${color || '#e2b857'}" stroke-width="4" rx="3"/>`;
    }
    overlaySvg.innerHTML = html;
  }

  // Highlight the selected square and show its legal destinations: a dot on
  // empty targets, a ring on capture targets (chess.com convention).
  // targets: [{ to, capture }]
  function showMoveHints(overlaySvg, fromSq, targets) {
    let html = '';
    if (fromSq) {
      const { row, col } = squareToCoords(fromSq);
      html += `<rect x="${col * SQ}" y="${row * SQ}" width="${SQ}" height="${SQ}" fill="#e2b857" opacity="0.4"/>`;
    }
    for (const t of (targets || [])) {
      const { row, col } = squareToCoords(t.to);
      const cx = col * SQ + SQ / 2, cy = row * SQ + SQ / 2;
      if (t.capture) {
        html += `<circle cx="${cx}" cy="${cy}" r="${SQ / 2 - 3}" fill="none" stroke="#1a1a2e" stroke-width="4" opacity="0.32"/>`;
      } else {
        html += `<circle cx="${cx}" cy="${cy}" r="7" fill="#1a1a2e" opacity="0.32"/>`;
      }
    }
    overlaySvg.innerHTML = html;
  }

  return { render, renderAnimated, drawArrow, drawArrows, clearArrows, getCapturedPieces, setFlipped, isFlipped, coordToSquare, highlightSquares, showMoveHints };
})();
