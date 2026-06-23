const Analyzer = (() => {
  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const PIECE_NAMES_FR = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
  const PIECE_ARTICLE_FR = { p: 'le', n: 'le', b: 'le', r: 'la', q: 'la', k: 'le' };
  const SAN_TO_FR = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' };

  function toFrench(san) {
    return san.replace(/^([NBRQK])/, (_, p) => SAN_TO_FR[p] || p);
  }

  function altSpans(alts, fen) {
    return alts.map(a =>
      `<span class="alt-move" data-uci="${a.uci}" data-fen="${fen}">${a.san}</span>`
    ).join(', ');
  }

  function materialCount(fen) {
    const board = fen.split(' ')[0];
    let white = 0, black = 0;
    for (const ch of board) {
      const lower = ch.toLowerCase();
      if (PIECE_VALUES[lower] !== undefined) {
        if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) white += PIECE_VALUES[lower];
        else if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) black += PIECE_VALUES[lower];
      }
    }
    return { white, black, diff: white - black };
  }

  function countPieces(fen, color) {
    const board = fen.split(' ')[0];
    let count = 0;
    for (const ch of board) {
      if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
      if (color === 'w' && ch === ch.toUpperCase() && ch !== ch.toLowerCase()) count++;
      if (color === 'b' && ch === ch.toLowerCase() && ch !== ch.toUpperCase()) count++;
    }
    return count;
  }

  function isDeveloped(fen) {
    const rows = fen.split(' ')[0].split('/');
    const backRankW = rows[7];
    const backRankB = rows[0];
    let wUndeveloped = 0, bUndeveloped = 0;
    for (const ch of backRankW) {
      if (ch === 'N' || ch === 'B') wUndeveloped++;
    }
    for (const ch of backRankB) {
      if (ch === 'n' || ch === 'b') bUndeveloped++;
    }
    return { white: 4 - wUndeveloped, black: 4 - bUndeveloped };
  }

  function hasCastled(history, color) {
    for (const m of history) {
      if (m.color === color && (m.san === 'O-O' || m.san === 'O-O-O')) return true;
    }
    return false;
  }

  function bestCapture(game) {
    const captures = game.moves({ verbose: true }).filter(m => m.captured);
    let best = null, bestVal = 0;
    for (const c of captures) {
      const gain = PIECE_VALUES[c.captured] - PIECE_VALUES[c.piece];
      if (gain > bestVal || (!best && gain >= 0 && PIECE_VALUES[c.captured] >= 3)) {
        best = c;
        bestVal = gain;
      }
    }
    return best;
  }

  function parseFenBoard(fen) {
    const rows = fen.split(' ')[0].split('/');
    const board = [];
    for (const row of rows) {
      const rank = [];
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') for (let j = 0; j < +ch; j++) rank.push(null);
        else rank.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' });
      }
      board.push(rank);
    }
    return board;
  }

  function sqToRC(sq) { return [8 - +sq[1], sq.charCodeAt(0) - 97]; }

  function detectForkAfterMove(fenAfter, toSquare, moverColor) {
    const board = parseFenBoard(fenAfter);
    const [r, c] = sqToRC(toSquare);
    const piece = board[r][c];
    if (!piece) return null;
    const opp = moverColor === 'w' ? 'b' : 'w';
    const targets = [];

    function scan(dirs, maxDist) {
      for (const [dr, dc] of dirs) {
        for (let s = 1; s <= maxDist; s++) {
          const nr = r + dr * s, nc = c + dc * s;
          if (nr < 0 || nr > 7 || nc < 0 || nc > 7) break;
          const t = board[nr][nc];
          if (t) {
            if (t.color === opp && (PIECE_VALUES[t.type] >= 3 || t.type === 'k')) targets.push(t.type);
            break;
          }
        }
      }
    }

    if (piece.type === 'n') scan([[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]], 1);
    if (piece.type === 'p') {
      const dir = moverColor === 'w' ? -1 : 1;
      scan([[dir,-1],[dir,1]], 1);
    }
    if (piece.type === 'b' || piece.type === 'q') scan([[-1,-1],[-1,1],[1,-1],[1,1]], 7);
    if (piece.type === 'r' || piece.type === 'q') scan([[-1,0],[1,0],[0,-1],[0,1]], 7);

    if (targets.length >= 2) return targets.map(t => t === 'k' ? 'roi' : PIECE_NAMES_FR[t]);
    return null;
  }

  function analyzeStructure(fen) {
    const board = parseFenBoard(fen);
    const pawns = { w: Array(8).fill(0), b: Array(8).fill(0) };
    const bishops = { w: 0, b: 0 };
    const rooks = { w: [], b: [] };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        if (p.type === 'p') pawns[p.color][c]++;
        if (p.type === 'b') bishops[p.color]++;
        if (p.type === 'r') rooks[p.color].push(c);
      }
    }

    const doubled = { w: 0, b: 0 };
    const isolated = { w: 0, b: 0 };
    const openFiles = [];
    for (let c = 0; c < 8; c++) {
      for (const color of ['w', 'b']) {
        if (pawns[color][c] >= 2) doubled[color]++;
        if (pawns[color][c] > 0 && (c === 0 || pawns[color][c - 1] === 0) && (c === 7 || pawns[color][c + 1] === 0)) isolated[color]++;
      }
      if (pawns.w[c] === 0 && pawns.b[c] === 0) openFiles.push(c);
    }

    const rookOnOpen = { w: false, b: false };
    for (const color of ['w', 'b']) {
      for (const rc of rooks[color]) {
        if (openFiles.includes(rc)) rookOnOpen[color] = true;
      }
    }

    return { doubled, isolated, bishops, rookOnOpen, openFiles };
  }

  function explainBadMove(fenAfter, madeMove, evalAfterLines) {
    if (!evalAfterLines || !evalAfterLines[0] || !evalAfterLines[0].move) return '';

    const uci = evalAfterLines[0].move;
    try {
      const g = new Chess(fenAfter);
      const oppMove = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!oppMove) return '';

      if (oppMove.captured) {
        const val = PIECE_VALUES[oppMove.captured];
        const attackerVal = PIECE_VALUES[oppMove.piece];
        const pName = PIECE_NAMES_FR[oppMove.captured];
        const art = PIECE_ARTICLE_FR[oppMove.captured];
        const Art = art.charAt(0).toUpperCase() + art.slice(1);
        if (val >= 3 && val > attackerVal) return `${Art} ${pName} est en prise !`;
        if (val >= 3) return `${Art} ${pName} est attaqué${art === 'la' ? 'e' : ''}.`;
      }

      if (oppMove.san.includes('+')) {
        const oppColor = madeMove.color === 'w' ? 'b' : 'w';
        const fork = detectForkAfterMove(g.fen(), oppMove.to, oppColor);
        if (fork) return `L'adversaire menace une fourchette avec échec sur ${fork.join(' et ')}.`;
        return 'Ce coup expose le roi à un échec dangereux.';
      }

      const oppColor = madeMove.color === 'w' ? 'b' : 'w';
      const fork = detectForkAfterMove(g.fen(), oppMove.to, oppColor);
      if (fork) return `L'adversaire menace une fourchette sur ${fork.join(' et ')}.`;
    } catch (_) {}

    const struct = analyzeStructure(fenAfter);
    if (madeMove.piece === 'p' && struct.doubled[madeMove.color] > 0) return 'Ce coup crée des pions doublés, affaiblissant la structure.';
    if (madeMove.piece === 'p' && struct.isolated[madeMove.color] > 0) return 'Ce coup isole un pion, le rendant vulnérable.';

    return '';
  }

  function enrichNeutralTip(fenBefore, fenAfter, madeMove, phase, moveIdx) {
    const color = madeMove.color;
    const piece = madeMove.piece;
    const pName = PIECE_NAMES_FR[piece];

    if (phase === 'opening' || moveIdx < 16) {
      const backRank = color === 'w' ? '1' : '8';
      if ((piece === 'n' || piece === 'b') && madeMove.from[1] === backRank && madeMove.to[1] !== backRank) {
        return `Développement du ${pName}. Sortir ses pièces rapidement pour contrôler le centre.`;
      }
    }

    if (piece === 'r') {
      const struct = analyzeStructure(fenAfter);
      if (struct.rookOnOpen[color]) return 'La tour se place sur une colonne ouverte — forte pression en perspective.';
      const targetRank = color === 'w' ? '7' : '2';
      if (madeMove.to[1] === targetRank) return `La tour s'infiltre en ${targetRank === '7' ? '7ème' : '2ème'} rangée — position très active qui menace les pions adverses.`;
    }

    if (piece === 'n') {
      const central = ['c3','d3','e3','f3','c4','d4','e4','f4','c5','d5','e5','f5','c6','d6','e6','f6'];
      if (central.includes(madeMove.to)) return `Le cavalier se centralise en ${madeMove.to} — un cavalier au centre rayonne dans toutes les directions.`;
    }

    if (piece === 'b') {
      const fianch = color === 'w' ? ['g2', 'b2'] : ['g7', 'b7'];
      if (fianch.includes(madeMove.to)) return 'Fianchetto du fou — il contrôle la grande diagonale depuis une position sûre.';
      const longDiag = ['a1','b2','c3','d4','e5','f6','g7','h8','a8','b7','c6','d5','e4','f3','g2','h1'];
      if (longDiag.includes(madeMove.to)) return 'Le fou se place sur une grande diagonale — portée maximale.';
    }

    if (phase === 'endgame' && piece === 'k') {
      if ('cdef'.includes(madeMove.to[0])) return 'En finale, le roi marche vers le centre pour soutenir ses pions — un principe fondamental.';
    }

    if (piece === 'p') {
      const rank = +madeMove.to[1];
      if (phase === 'endgame' && ((color === 'w' && rank >= 5) || (color === 'b' && rank <= 4))) {
        return 'Le pion avance vers la promotion. En finale, chaque rangée gagnée compte.';
      }
      if ((madeMove.to[0] === 'd' || madeMove.to[0] === 'e') && moveIdx > 10) {
        return 'Poussée de pion central — gagne de l\'espace et ouvre des lignes.';
      }
    }

    if (piece === 'q' && phase === 'middle') {
      const central = ['c3','d3','e3','f3','c4','d4','e4','f4','c5','d5','e5','f5','c6','d6','e6','f6'];
      if (central.includes(madeMove.to)) return 'La dame se centralise — la pièce la plus puissante se rend active.';
    }

    return '';
  }

  function analyzeGame(chess, moves) {
    const results = [];
    const game = new Chess();
    let prevMaterial = materialCount(game.fen());
    const totalMoves = moves.length;

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const prevFen = game.fen();
      let madeMove = game.move(move.san, { sloppy: true });
      if (!madeMove) madeMove = game.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (!madeMove) {
        results.push({ type: 'neutral', text: '', tipFr: 'Coup non reconnu.', san: move.san, sanFr: move.san });
        continue;
      }

      const newFen = game.fen();
      const newMaterial = materialCount(newFen);
      const isWhite = madeMove.color === 'w';
      const moveNum = Math.floor(i / 2) + 1;
      const side = isWhite ? 'Blancs' : 'Noirs';
      const otherSide = isWhite ? 'Noirs' : 'Blancs';
      const sanFr = toFrench(madeMove.san);
      const phase = i < 10 ? 'opening' : (i > totalMoves - 6 ? 'endgame' : 'middle');

      let type = 'neutral';
      let tipFr = '';
      let arrow = null;

      const matSwing = isWhite
        ? (newMaterial.diff - prevMaterial.diff)
        : (prevMaterial.diff - newMaterial.diff);

      const opponentBestCap = bestCapture(game);

      if (madeMove.san === 'O-O' || madeMove.san === 'O-O-O') {
        type = 'good';
        const side2 = madeMove.san === 'O-O' ? 'côté roi' : 'côté dame';
        tipFr = `Les ${side} roquent ${side2}. Le roi est mis en sécurité — c'est un bon réflexe à avoir !`;
      } else if (game.in_checkmate()) {
        type = 'good';
        tipFr = `Échec et mat ! Les ${side} remportent la partie.`;
      } else if (game.in_check()) {
        if (madeMove.captured) {
          const pieceName = PIECE_NAMES_FR[madeMove.captured];
          const artCap = PIECE_ARTICLE_FR[madeMove.captured];
          tipFr = `Les ${side} capturent ${artCap} ${pieceName} avec échec ! Un coup très efficace qui gagne du matériel tout en menaçant le roi.`;
          type = matSwing >= 2 ? 'good' : 'neutral';
        } else {
          tipFr = `Échec au roi ! Les ${side} mettent la pression sur le roi adverse.`;
          type = 'neutral';
        }
        arrow = { from: madeMove.to, to: findKing(newFen, isWhite ? 'b' : 'w') };
      } else if (madeMove.captured) {
        const capturedName = PIECE_NAMES_FR[madeMove.captured];
        const pieceName = PIECE_NAMES_FR[madeMove.piece];
        const artPiece = PIECE_ARTICLE_FR[madeMove.piece];
        const artCap = PIECE_ARTICLE_FR[madeMove.captured];
        const ArtPiece = artPiece.charAt(0).toUpperCase() + artPiece.slice(1);

        if (matSwing >= 3) {
          type = 'good';
          tipFr = `Excellent ! ${ArtPiece} ${pieceName} capture ${artCap} ${capturedName}. Les ${side} gagnent du matériel significatif.`;
        } else if (matSwing <= -3) {
          type = 'blunder';
          tipFr = `${ArtPiece} ${pieceName} prend ${artCap} ${capturedName}, mais c'est un mauvais échange. Les ${side} perdent du matériel dans l'affaire.`;
        } else if (matSwing <= -1) {
          type = 'mistake';
          tipFr = `Échange légèrement défavorable : ${artPiece} ${pieceName} prend ${artCap} ${capturedName}, mais les ${side} y perdent un peu.`;
        } else {
          tipFr = `${ArtPiece} ${pieceName} capture ${artCap} ${capturedName}. Échange équilibré.`;
        }
        arrow = { from: madeMove.from, to: madeMove.to };
      } else {
        const nextMoves = game.moves({ verbose: true });
        const threats = nextMoves.filter(m => m.captured);
        const bigThreat = threats.find(m => PIECE_VALUES[m.captured] >= 3);

        if (phase === 'opening') {
          const dev = isDeveloped(newFen);
          const pieceName = PIECE_NAMES_FR[madeMove.piece];

          if (madeMove.piece === 'p' && (madeMove.to[0] === 'd' || madeMove.to[0] === 'e') && i < 6) {
            type = 'good';
            tipFr = `Bon début ! Un pion au centre contrôle des cases importantes et ouvre le jeu.`;
          } else if ((madeMove.piece === 'n' || madeMove.piece === 'b') && i < 12) {
            tipFr = `Développement du ${pieceName}. Sortir ses pièces rapidement au début de la partie est essentiel.`;
            type = 'good';
          } else if (madeMove.piece === 'q' && i < 8) {
            type = 'mistake';
            tipFr = `Sortir la dame trop tôt est risqué. L'adversaire peut la chasser en développant ses propres pièces, ce qui lui donne un avantage de temps.`;
          } else if (madeMove.piece === 'r' && i < 10 && !hasCastled(game.history({ verbose: true }), madeMove.color)) {
            type = 'mistake';
            tipFr = `La tour sort sans que le roi soit roqué. Il est souvent préférable de roquer d'abord pour connecter les tours.`;
          } else if (madeMove.piece === 'p' && (madeMove.to[0] === 'h' || madeMove.to[0] === 'a')) {
            if (i < 10) {
              type = 'mistake';
              tipFr = `Pousser un pion sur le bord en ouverture ne contribue pas au développement. Privilégiez le centre et la sortie des pièces.`;
            } else {
              tipFr = `Avancée de pion sur le flanc. Ce type de coup sert souvent à gagner de l'espace ou préparer une attaque.`;
            }
          } else {
            tipFr = `Les ${side} jouent ${sanFr}.`;
          }
        } else if (phase === 'endgame') {
          if (madeMove.piece === 'k') {
            tipFr = `En finale, le roi devient une pièce active ! Il se rapproche du centre pour soutenir ses pions.`;
            type = 'good';
          } else if (madeMove.piece === 'p') {
            const rank = parseInt(madeMove.to[1]);
            if ((isWhite && rank >= 6) || (!isWhite && rank <= 3)) {
              type = 'good';
              tipFr = `Le pion avance vers la promotion ! Chaque pas le rapproche de devenir une dame.`;
            } else {
              tipFr = `Avancée de pion en finale. Pousser les pions passés est souvent la clé de la victoire.`;
            }
          } else {
            tipFr = `Les ${side} jouent ${sanFr}.`;
          }
        } else {
          if (bigThreat) {
            tipFr = `Les ${side} menacent de capturer une pièce importante au prochain coup.`;
            arrow = { from: bigThreat.from, to: bigThreat.to };
          } else {
            const enriched = enrichNeutralTip(prevFen, newFen, madeMove, phase, i);
            tipFr = enriched || `Les ${side} jouent ${sanFr}.`;
          }
        }

        if (!hasCastled(game.history({ verbose: true }), madeMove.color) && i > 14 && madeMove.piece === 'k' && !(madeMove.san === 'O-O' || madeMove.san === 'O-O-O')) {
          if (type === 'neutral') {
            type = 'mistake';
            tipFr += ` Le roi n'a toujours pas roqué — il reste vulnérable au centre.`;
          }
        }
      }

      if (opponentBestCap && !madeMove.captured) {
        const capGain = PIECE_VALUES[opponentBestCap.captured] - PIECE_VALUES[opponentBestCap.piece];
        const capVal = PIECE_VALUES[opponentBestCap.captured];
        const pName = PIECE_NAMES_FR[opponentBestCap.captured];
        const attackerName = PIECE_NAMES_FR[opponentBestCap.piece];

        if (capGain >= 6) {
          type = 'blunder';
          const art = PIECE_ARTICLE_FR[opponentBestCap.captured] || 'le';
          const artA = PIECE_ARTICLE_FR[opponentBestCap.piece] || 'le';
          tipFr = `<b>${sanFr}</b> laisse ${art} ${pName} en prise ! Les ${otherSide} peuvent ${art === 'la' ? 'la' : 'le'} capturer avec ${artA} ${attackerName}. Une gaffe qui coûte la pièce.`;
          arrow = { from: opponentBestCap.from, to: opponentBestCap.to };
        } else if (capGain >= 2 && type !== 'good') {
          type = 'mistake';
          const art = PIECE_ARTICLE_FR[opponentBestCap.captured] || 'le';
          tipFr += ` Attention : ${art} ${pName} en ${opponentBestCap.to} est maintenant en prise !`;
          arrow = { from: opponentBestCap.from, to: opponentBestCap.to };
        }
      }

      prevMaterial = newMaterial;

      results.push({
        type,
        san: madeMove.san,
        sanFr,
        tipFr,
        move: madeMove,
        fen: newFen,
        materialDiff: newMaterial.diff,
        arrow
      });
    }

    return results;
  }

  function findKing(fen, color) {
    const rows = fen.split(' ')[0].split('/');
    const target = color === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { col += +ch; continue; }
        if (ch === target) return 'abcdefgh'[col] + (8 - r);
        col++;
      }
    }
    return null;
  }

  function generateSummary(results, moves) {
    const stats = {
      w: { brilliants: 0, best: 0, great: 0, good: 0, inaccuracies: 0, mistakes: 0, blunders: 0, totalCpLoss: 0, totalWinLoss: 0, moveCount: 0 },
      b: { brilliants: 0, best: 0, great: 0, good: 0, inaccuracies: 0, mistakes: 0, blunders: 0, totalCpLoss: 0, totalWinLoss: 0, moveCount: 0 }
    };
    let keyMoment = null;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.move) continue;
      const side = r.move.color;
      stats[side].moveCount++;
      stats[side].totalCpLoss += r.cpLoss || 0;
      stats[side].totalWinLoss += r.winPctLoss || 0;

      if (r.type === 'brilliant') stats[side].brilliants++;
      if (r.type === 'best') stats[side].best++;
      if (r.type === 'great') stats[side].great++;
      if (r.type === 'good') stats[side].good++;
      if (r.type === 'inaccuracy') stats[side].inaccuracies++;
      if (r.type === 'mistake') stats[side].mistakes++;
      if (r.type === 'blunder') {
        stats[side].blunders++;
        if (!keyMoment) {
          keyMoment = { index: i, result: r, moveNum: Math.floor(i / 2) + 1 };
        }
      }
    }

    if (!keyMoment) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].type === 'mistake' || results[i].type === 'inaccuracy') {
          keyMoment = { index: i, result: results[i], moveNum: Math.floor(i / 2) + 1 };
          break;
        }
      }
    }

    for (const side of ['w', 'b']) {
      const s = stats[side];
      s.acpl = s.moveCount > 0 ? Math.round(s.totalCpLoss / s.moveCount) : 0;
      const avgWinLoss = s.moveCount > 0 ? s.totalWinLoss / s.moveCount : 0;
      s.accuracy = Math.max(0, Math.min(100, Math.round((1 - avgWinLoss * 2) * 100)));
    }

    const opening = moves ? Openings.detect(moves.map(m => m.san || m)) : null;

    return { stats, keyMoment, opening };
  }

  function phaseOfPly(i) { return i < 20 ? 'opening' : i < 50 ? 'middle' : 'endgame'; }

  function parseBaseSeconds(tc) {
    if (!tc) return 0;
    const s = String(tc);
    if (s.includes('/')) return 0; // daily / correspondence
    const base = parseInt(s.split('+')[0], 10);
    return isNaN(base) ? 0 : base;
  }

  // Per-game time usage from the PGN's [%clk] tags. Returns { timed:false } for
  // daily/correspondence games (where per-move time is meaningless) or when the
  // PGN has no usable clock data. blunderPlies = ply indices of the user's
  // blunders/mistakes, to count how many happened in time trouble.
  function computeTimeStats(results, info, side, blunderPlies) {
    const isDaily = info.timeClass === 'daily' || (info.timeControl && String(info.timeControl).includes('/'));
    if (isDaily || !info.pgn) return { timed: false };
    const clocks = parseClocks(info.pgn);
    if (clocks.length < results.length * 0.5) return { timed: false };
    const spent = clocksToTimePerMove(clocks);
    const baseSec = parseBaseSeconds(info.timeControl);
    const ttThreshold = Math.max(10, baseSec ? baseSec * 0.1 : 15);

    const phaseSec = { opening: { t: 0, c: 0 }, middle: { t: 0, c: 0 }, endgame: { t: 0, c: 0 } };
    let sum = 0, cnt = 0, ttMoves = 0;
    const ttPly = {};
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.move || r.move.color !== side) continue;
      const ph = phaseOfPly(i);
      if (i >= 2 && typeof spent[i] === 'number') { sum += spent[i]; cnt++; phaseSec[ph].t += spent[i]; phaseSec[ph].c++; }
      if (typeof clocks[i] === 'number' && clocks[i] < ttThreshold) { ttMoves++; ttPly[i] = true; }
    }
    let ttErrors = 0;
    for (const p of blunderPlies) if (ttPly[p]) ttErrors++;
    const ph = (k) => phaseSec[k].c ? Math.round(phaseSec[k].t / phaseSec[k].c) : 0;
    return {
      timed: true,
      avgMoveSec: cnt ? Math.round((sum / cnt) * 10) / 10 : 0,
      baseSec,
      phaseSec: { opening: ph('opening'), middle: ph('middle'), endgame: ph('endgame') },
      timeTroubleMoves: ttMoves,
      timeTroubleErrors: ttErrors
    };
  }

  // Single source of truth for the per-game coach record, stored in
  // coach-data.json by the server analyzer (tools/analyze.mjs) AND in IndexedDB
  // by the in-browser bulk analyzer (js/coach.js). Both callers delegate here so
  // server and client can never diverge. info = { side, pgn, timeClass, timeControl }.
  function computeGameStats(results, summary, info) {
    const side = info.side;
    const us = side === 'w' ? summary.stats.w : summary.stats.b;
    const phaseErrors = { opening: 0, middle: 0, endgame: 0 };
    const phaseAcc = { opening: { total: 0, count: 0 }, middle: { total: 0, count: 0 }, endgame: { total: 0, count: 0 } };
    const phaseCp = { opening: { total: 0, count: 0 }, middle: { total: 0, count: 0 }, endgame: { total: 0, count: 0 } };
    const blunders = [];
    let maxUserEval = null, minUserEval = null, turningPoint = null;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.move || r.move.color !== side) continue;
      const phase = phaseOfPly(i);

      if (typeof r.eval === 'number') {
        const ue = Math.max(-1000, Math.min(1000, side === 'w' ? r.eval : -r.eval));
        if (maxUserEval === null || ue > maxUserEval) maxUserEval = ue;
        if (minUserEval === null || ue < minUserEval) minUserEval = ue;
      }

      if (r.type === 'blunder' || r.type === 'mistake') {
        phaseErrors[phase]++;
        if (r.fenBefore && r.bestUci) {
          blunders.push({
            ply: i, phase, type: r.type,
            fenBefore: r.fenBefore, bestUci: r.bestUci, bestSan: r.bestSan || null,
            playedSan: r.sanFr || r.san, cpLoss: r.cpLoss || 0, tip: r.tipFr || ''
          });
        }
      }

      const loss = r.winPctLoss || 0;
      phaseAcc[phase].total += Math.max(0, Math.min(100, Math.round((1 - loss * 2) * 100)));
      phaseAcc[phase].count++;
      phaseCp[phase].total += r.cpLoss || 0;
      phaseCp[phase].count++;

      if (loss > 0 && (!turningPoint || loss > turningPoint.winPctLoss)) {
        turningPoint = {
          ply: i, type: r.type, winPctLoss: loss, cpLoss: r.cpLoss || 0,
          fenBefore: r.fenBefore || null, playedSan: r.sanFr || r.san,
          bestUci: r.bestUci || null, bestSan: r.bestSan || null
        };
      }
    }

    const acplOf = (k) => phaseCp[k].count ? Math.round(phaseCp[k].total / phaseCp[k].count) : 0;
    const mq = {
      brilliant: us.brilliants || 0, best: us.best || 0, great: us.great || 0, good: us.good || 0,
      inaccuracy: us.inaccuracies || 0, mistake: us.mistakes || 0, blunder: us.blunders || 0,
      moveCount: us.moveCount || 0
    };
    mq.ok = Math.max(0, mq.moveCount - (mq.brilliant + mq.best + mq.great + mq.good + mq.inaccuracy + mq.mistake + mq.blunder));

    const time = computeTimeStats(results, info, side, blunders.map(b => b.ply));

    return {
      analyzedAt: Date.now(),
      accuracy: us.accuracy,
      acpl: us.acpl,
      blunders: us.blunders,
      mistakes: us.mistakes,
      inaccuracies: us.inaccuracies,
      moveCount: us.moveCount,
      phaseErrors,
      phaseAccuracy: phaseAcc,
      phaseAcpl: { opening: acplOf('opening'), middle: acplOf('middle'), endgame: acplOf('endgame') },
      moveQuality: mq,
      maxUserEval, minUserEval, turningPoint,
      time,
      blunderList: blunders
    };
  }

  // Robust PGN → verbose-moves parser. chess.js 0.12.1 load_pgn fails on
  // Chess.com PGNs whose comments contain [%clk ...] (the ] breaks header
  // detection) and misreads b-file pawn captures (bxa4) as bishop moves in
  // sloppy mode. So: strip comments first, extract SAN tokens, replay each
  // move strict-first then sloppy.
  function parsePgnMoves(pgn) {
    const txt = (pgn || '')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\$\d+/g, ' ')
      .replace(/\b\d+\.(\.\.)?/g, ' ')
      .replace(/\b(1-0|0-1|1\/2-1\/2)\b/g, ' ')
      .replace(/\*/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const tokens = txt.split(' ').filter(Boolean);
    const game = new Chess();
    const moves = [];
    for (const t of tokens) {
      let m = null;
      try { m = game.move(t); } catch (e) {}
      if (!m) { try { m = game.move(t, { sloppy: true }); } catch (e) {} }
      if (!m) break;
      moves.push(m);
    }
    return moves;
  }

  async function analyzeGameAsync(chess, moves, onProgress, movetime) {
    const depth = movetime || 'movetime 1500';
    const game = new Chess();

    const positions = [game.fen()];
    const madeMovesArr = [];
    for (const move of moves) {
      let made = game.move(move.san, { sloppy: true });
      if (!made) made = game.move({ from: move.from, to: move.to, promotion: move.promotion });
      madeMovesArr.push(made);
      positions.push(made ? game.fen() : null);
    }

    const evals = [];
    const total = positions.length;
    for (let i = 0; i < total; i++) {
      if (!positions[i]) {
        evals.push(null);
      } else {
        const g = new Chess(positions[i]);
        if (g.game_over()) {
          evals.push({ score: g.in_checkmate() ? -30000 : 0, bestMove: null, pv: '', mate: g.in_checkmate() ? 0 : null });
        } else {
          evals.push(await StockfishEngine.evaluate(positions[i], depth));
        }
      }
      if (onProgress) {
        onProgress(i + 1, total);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const results = [];
    for (let i = 0; i < moves.length; i++) {
      const madeMove = madeMovesArr[i];
      if (!madeMove) {
        results.push({ type: 'neutral', san: moves[i].san, sanFr: moves[i].san, tipFr: 'Coup non reconnu.', move: null, fen: null, materialDiff: 0, arrow: null, eval: 0, cpLoss: 0 });
        continue;
      }

      const newFen = positions[i + 1];
      const newMaterial = materialCount(newFen);
      const isWhite = madeMove.color === 'w';
      const sanFr = toFrench(madeMove.san);
      const side = isWhite ? 'Blancs' : 'Noirs';
      const phase = i < 10 ? 'opening' : (i > moves.length - 6 ? 'endgame' : 'middle');

      const evalBefore = evals[i];
      const evalAfter = evals[i + 1];

      let cpLoss = 0;
      let bestMoveSanFr = null;
      let bestMoveUci = null;
      let evalForWhite = null;
      let winPctLoss = 0;
      const alternatives = [];

      if (evalBefore && evalAfter) {
        cpLoss = Math.max(0, evalBefore.score + evalAfter.score);

        if (evalBefore.bestMove) {
          bestMoveUci = evalBefore.bestMove;
          const sanRaw = uciToSan(positions[i], bestMoveUci);
          if (sanRaw) bestMoveSanFr = toFrench(sanRaw);
        }

        const playedUci = madeMove.from + madeMove.to + (madeMove.promotion || '');
        if (bestMoveUci && playedUci === bestMoveUci) {
          cpLoss = 0;
          bestMoveSanFr = null;
        }

        if (cpLoss > 0 && cpLoss < 15) cpLoss = 0;

        evalForWhite = isWhite ? -evalAfter.score : evalAfter.score;

        const winBefore = cpToWinPct(evalBefore.score);
        const winAfterPlayed = cpToWinPct(-evalAfter.score);
        winPctLoss = Math.max(0, winBefore - winAfterPlayed);

        if (evalBefore.lines) {
          for (const line of evalBefore.lines) {
            if (!line || !line.move) continue;
            if (line.move === playedUci) continue;
            if (line.move === bestMoveUci) continue;
            const san = uciToSan(positions[i], line.move);
            if (san) alternatives.push({ uci: line.move, san: toFrench(san), score: line.score, mate: line.mate });
          }
        }
      }

      const prevMat = materialCount(positions[i]);
      const matChange = isWhite
        ? (newMaterial.diff - prevMat.diff)
        : (prevMat.diff - newMaterial.diff);

      const playedUciStr = madeMove.from + madeMove.to + (madeMove.promotion || '');
      const isBestMove = bestMoveUci && playedUciStr === bestMoveUci;

      let type;
      if (madeMove.san.includes('#')) {
        type = 'best';
      } else if (cpLoss <= 5 && matChange <= -2) {
        type = 'brilliant';
      } else if (cpLoss > 200) {
        type = 'blunder';
      } else if (cpLoss > 100) {
        type = 'mistake';
      } else if (cpLoss > 50) {
        type = 'inaccuracy';
      } else if (cpLoss === 0 && isBestMove) {
        type = 'best';
      } else if (cpLoss <= 10) {
        type = 'great';
      } else {
        type = 'neutral';
      }

      const evalDesc = evalAfter ? describeEval(evalForWhite) : '';
      const ed = evalDesc ? ' ' + evalDesc : '';
      let tipFr;
      if (madeMove.san.includes('#')) {
        tipFr = `Échec et mat ! Les ${side} remportent la partie.`;
      } else if (type === 'brilliant') {
        tipFr = `Brillant ! Dans une position difficile, c'est le meilleur coup possible.${ed}`;
      } else if (type === 'blunder') {
        const bestSpan = bestMoveSanFr ? `<span class="alt-move" data-uci="${bestMoveUci}" data-fen="${positions[i]}">${bestMoveSanFr}</span>` : null;
        const whyBad = explainBadMove(newFen, madeMove, evalAfter && evalAfter.lines);
        tipFr = bestSpan
          ? `Gaffe ! ${whyBad ? whyBad + ' ' : ''}Il fallait jouer ${bestSpan}.`
          : `Gaffe ! Ce coup change complètement la position.${whyBad ? ' ' + whyBad : ''}`;
        if (alternatives.length > 0) tipFr += ` Aussi possible : ${altSpans(alternatives, positions[i])}.`;
        tipFr += ed;
      } else if (type === 'mistake') {
        const bestSpan = bestMoveSanFr ? `<span class="alt-move" data-uci="${bestMoveUci}" data-fen="${positions[i]}">${bestMoveSanFr}</span>` : null;
        const whyBad = explainBadMove(newFen, madeMove, evalAfter && evalAfter.lines);
        tipFr = bestSpan
          ? `Erreur coûteuse.${whyBad ? ' ' + whyBad : ''} Le meilleur coup était ${bestSpan}.`
          : `Erreur coûteuse.${whyBad ? ' ' + whyBad : ''}`;
        if (alternatives.length > 0) tipFr += ` Aussi possible : ${altSpans(alternatives, positions[i])}.`;
        tipFr += ed;
      } else if (type === 'inaccuracy') {
        const bestSpan = bestMoveSanFr ? `<span class="alt-move" data-uci="${bestMoveUci}" data-fen="${positions[i]}">${bestMoveSanFr}</span>` : null;
        const whyBad = explainBadMove(newFen, madeMove, evalAfter && evalAfter.lines);
        tipFr = bestSpan
          ? `Imprécision.${whyBad ? ' ' + whyBad : ''} ${bestSpan} était plus précis.`
          : `Imprécision.${whyBad ? ' ' + whyBad : ''}`;
        if (alternatives.length > 0) tipFr += ` Aussi possible : ${altSpans(alternatives, positions[i])}.`;
        tipFr += ed;
      } else if (type === 'best') {
        const enriched = enrichNeutralTip(positions[i], newFen, madeMove, phase, i);
        tipFr = enriched
          ? `Meilleur coup ! ${enriched}${ed}`
          : `Meilleur coup ! C'est exactement ce que recommande le moteur.${ed}`;
      } else if (type === 'great') {
        if (madeMove.captured) {
          const capName = PIECE_NAMES_FR[madeMove.captured];
          tipFr = `Excellent ! Capture optimale${capName ? ' du ' + capName : ''}.${ed}`;
        } else if (madeMove.san === 'O-O' || madeMove.san === 'O-O-O') {
          tipFr = `Bon roque ! Le moteur confirme que c'est un très bon choix ici.${ed}`;
        } else {
          const enriched = enrichNeutralTip(positions[i], newFen, madeMove, phase, i);
          tipFr = enriched ? `Très bon coup. ${enriched}${ed}` : `Très bon coup, quasi-optimal.${ed}`;
        }
      } else {
        const enriched = enrichNeutralTip(positions[i], newFen, madeMove, phase, i);
        tipFr = enriched ? `${enriched}${ed}` : `Coup correct.${ed}`;
      }

      const forkTargets = detectForkAfterMove(newFen, madeMove.to, madeMove.color);
      if (forkTargets && type !== 'blunder' && type !== 'mistake') {
        tipFr += ` Fourchette sur ${forkTargets.join(' et ')} !`;
      }

      if (!forkTargets && evalAfter && evalAfter.lines && evalAfter.lines[0] && evalAfter.lines[0].move) {
        try {
          const tg = new Chess(newFen);
          const tu = evalAfter.lines[0].move;
          const tm = tg.move({ from: tu.slice(0,2), to: tu.slice(2,4), promotion: tu[4] });
          if (tm) {
            const tFr = toFrench(tm.san);
            const opp = isWhite ? 'les Noirs' : 'les Blancs';
            if (tm.san.includes('#')) {
              tipFr += ` ⚠ ${opp} menacent mat avec ${tFr} !`;
            } else if (tm.captured && PIECE_VALUES[tm.captured] >= 3) {
              const art = PIECE_ARTICLE_FR[tm.captured];
              const cn = PIECE_NAMES_FR[tm.captured];
              tipFr += ` ⚠ Attention, ${opp} menacent de prendre ${art} ${cn} (${tFr}).`;
            } else if (tm.san.includes('+')) {
              tipFr += ` ⚠ ${opp} menacent un échec (${tFr}).`;
            }
          }
        } catch(_) {}
      }

      const arrows = [];
      if ((type === 'blunder' || type === 'mistake' || type === 'inaccuracy') && bestMoveUci && bestMoveUci.length >= 4) {
        arrows.push({ from: bestMoveUci.slice(0, 2), to: bestMoveUci.slice(2, 4), color: '#56b886', opacity: 0.85, width: 6 });
        for (const alt of alternatives) {
          if (alt.uci && alt.uci.length >= 4) {
            arrows.push({ from: alt.uci.slice(0, 2), to: alt.uci.slice(2, 4), color: '#5b8fb9', opacity: 0.45, width: 4 });
          }
        }
      } else if (madeMove.san.includes('+') || madeMove.san.includes('#')) {
        const kingSq = findKing(newFen, isWhite ? 'b' : 'w');
        if (kingSq) arrows.push({ from: madeMove.to, to: kingSq, color: '#e2b857', opacity: 0.6, width: 5 });
      } else if (madeMove.captured) {
        arrows.push({ from: madeMove.from, to: madeMove.to, color: '#e2b857', opacity: 0.6, width: 5 });
      }

      results.push({
        type, san: madeMove.san, sanFr, tipFr,
        move: madeMove, fen: newFen,
        materialDiff: newMaterial.diff, arrows,
        eval: evalForWhite, cpLoss, winPctLoss: winPctLoss || 0, alternatives, fenBefore: positions[i],
        bestUci: bestMoveUci, bestSan: bestMoveSanFr
      });
    }

    return results;
  }

  function uciToSan(fen, uci) {
    if (!uci || uci.length < 4) return null;
    try {
      const g = new Chess(fen);
      const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      return m ? m.san : null;
    } catch (_) { return null; }
  }

  function cpToWinPct(cp) {
    if (cp > 29000) return 1;
    if (cp < -29000) return 0;
    return 1 / (1 + Math.pow(10, -cp / 400));
  }

  function describeEval(cpWhite) {
    if (cpWhite >= 29000) return 'Mat forcé pour les Blancs.';
    if (cpWhite <= -29000) return 'Mat forcé pour les Noirs.';
    const abs = Math.abs(cpWhite);
    if (abs <= 30) return 'Position équilibrée.';
    const pawns = (abs / 100).toFixed(1);
    const side = cpWhite > 0 ? 'les Blancs' : 'les Noirs';
    if (abs > 300) return `Avantage décisif pour ${side} (+${pawns}).`;
    if (abs > 100) return `Avantage net pour ${side} (+${pawns}).`;
    return `Léger plus pour ${side} (+${pawns}).`;
  }

  function parseClocks(pgnText) {
    const clocks = [];
    const re = /\{[^}]*\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\][^}]*\}/g;
    let m;
    while ((m = re.exec(pgnText)) !== null) {
      clocks.push(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]));
    }
    return clocks;
  }

  function clocksToTimePerMove(clocks) {
    if (clocks.length < 2) return [];
    const times = [];
    for (let i = 0; i < clocks.length; i++) {
      const prevIdx = i - 2;
      if (prevIdx < 0) {
        times.push(0);
      } else {
        times.push(Math.max(0, clocks[prevIdx] - clocks[i]));
      }
    }
    return times;
  }

  async function probeTablebase(fen) {
    const pieces = fen.split(' ')[0].replace(/[0-9/]/g, '');
    if (pieces.length > 7) return null;
    try {
      const resp = await fetch(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data;
    } catch (_) { return null; }
  }

  return { analyzeGame, analyzeGameAsync, generateSummary, computeGameStats, parsePgnMoves, toFrench, materialCount, cpToWinPct, describeEval, parseClocks, clocksToTimePerMove, probeTablebase };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Analyzer;
