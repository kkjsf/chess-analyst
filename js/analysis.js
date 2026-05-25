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
      if (gain > bestVal || (!best && PIECE_VALUES[c.captured] >= 3)) {
        best = c;
        bestVal = gain;
      }
    }
    return best;
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
          } else if (madeMove.piece === 'p' && madeMove.to[0] === 'h' || madeMove.to[0] === 'a') {
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
            tipFr = `Les ${side} jouent ${sanFr}.`;
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

  function detectHanging(game, color) {
    const moves = game.moves({ verbose: true });
    const attackerColor = color === 'w' ? 'b' : 'w';
    const captures = moves.filter(m => m.captured && m.color !== color);

    for (const cap of captures) {
      if (PIECE_VALUES[cap.captured] > PIECE_VALUES[cap.piece] + 1) {
        return {
          piece: cap.captured,
          square: cap.to,
          arrow: { from: cap.from, to: cap.to }
        };
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

  async function analyzeGameAsync(chess, moves, onProgress) {
    const depth = 'movetime 1500';
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

      const evalBefore = evals[i];
      const evalAfter = evals[i + 1];

      let cpLoss = 0;
      let bestMoveSanFr = null;
      let bestMoveUci = null;
      let evalForWhite = 0;
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
        var winPctLoss = Math.max(0, winBefore - winAfterPlayed);

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
      } else if (cpLoss <= 5 && (matChange <= -2 || (evalBefore && evalBefore.score <= -150))) {
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
      let tipFr;
      if (madeMove.san.includes('#')) {
        tipFr = `Échec et mat ! Les ${side} remportent la partie.`;
      } else if (type === 'brilliant') {
        tipFr = `Brillant ! Dans une position difficile, c'est le meilleur coup possible. ${evalDesc}`;
      } else if (type === 'blunder') {
        const bestSpan = bestMoveSanFr ? `<span class="alt-move" data-uci="${bestMoveUci}" data-fen="${positions[i]}">${bestMoveSanFr}</span>` : null;
        tipFr = bestSpan
          ? `Gaffe ! Ce coup perd ${cpLoss} centipièces d'avantage. Il fallait jouer ${bestSpan}.`
          : `Gaffe ! Ce coup coûte ${cpLoss} centipièces.`;
        if (alternatives.length > 0) tipFr += ` Aussi possible : ${altSpans(alternatives, positions[i])}.`;
        tipFr += ' ' + evalDesc;
      } else if (type === 'mistake') {
        const bestSpan = bestMoveSanFr ? `<span class="alt-move" data-uci="${bestMoveUci}" data-fen="${positions[i]}">${bestMoveSanFr}</span>` : null;
        tipFr = bestSpan
          ? `Erreur sérieuse (−${cpLoss} cp). Le meilleur coup était ${bestSpan}.`
          : `Erreur sérieuse (−${cpLoss} cp).`;
        if (alternatives.length > 0) tipFr += ` Aussi possible : ${altSpans(alternatives, positions[i])}.`;
        tipFr += ' ' + evalDesc;
      } else if (type === 'inaccuracy') {
        const bestSpan = bestMoveSanFr ? `<span class="alt-move" data-uci="${bestMoveUci}" data-fen="${positions[i]}">${bestMoveSanFr}</span>` : null;
        tipFr = bestSpan
          ? `Légère imprécision (−${cpLoss} cp). ${bestSpan} était plus précis.`
          : `Légère imprécision (−${cpLoss} cp).`;
        if (alternatives.length > 0) tipFr += ` Aussi possible : ${altSpans(alternatives, positions[i])}.`;
        tipFr += ' ' + evalDesc;
      } else if (type === 'best') {
        tipFr = `Meilleur coup ! C'est exactement ce que recommande le moteur. ${evalDesc}`;
      } else if (type === 'great') {
        if (madeMove.captured) {
          const capName = PIECE_NAMES_FR[madeMove.captured];
          tipFr = `Excellent ! Capture optimale${capName ? ' du ' + capName : ''}. ${evalDesc}`;
        } else if (madeMove.san === 'O-O' || madeMove.san === 'O-O-O') {
          tipFr = `Bon roque ! Le moteur confirme que c'est un très bon choix ici. ${evalDesc}`;
        } else {
          tipFr = `Très bon coup, quasi-optimal. ${evalDesc}`;
        }
      } else {
        tipFr = `Coup correct (−${cpLoss} cp). ${evalDesc}`;
      }

      if (evalAfter && evalAfter.lines && evalAfter.lines[0] && evalAfter.lines[0].move) {
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
        eval: evalForWhite, cpLoss, winPctLoss: winPctLoss || 0, alternatives, fenBefore: positions[i]
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
    if (cpWhite > 300) return 'Avantage décisif pour les Blancs.';
    if (cpWhite > 100) return 'Les Blancs ont un avantage clair.';
    if (cpWhite > 30) return 'Léger avantage pour les Blancs.';
    if (cpWhite < -300) return 'Avantage décisif pour les Noirs.';
    if (cpWhite < -100) return 'Les Noirs ont un avantage clair.';
    if (cpWhite < -30) return 'Léger avantage pour les Noirs.';
    return 'Position équilibrée.';
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

  return { analyzeGame, analyzeGameAsync, generateSummary, toFrench, materialCount, cpToWinPct, parseClocks, clocksToTimePerMove, probeTablebase };
})();
