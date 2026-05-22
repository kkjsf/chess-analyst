const Analyzer = (() => {
  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const PIECE_NAMES_FR = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
  const PIECE_ARTICLE_FR = { p: 'le', n: 'le', b: 'le', r: 'la', q: 'la', k: 'le' };
  const SAN_TO_FR = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' };

  function toFrench(san) {
    return san.replace(/^([NBRQK])/, (_, p) => SAN_TO_FR[p] || p);
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

  function generateSummary(results) {
    const stats = {
      w: { blunders: 0, mistakes: 0, good: 0 },
      b: { blunders: 0, mistakes: 0, good: 0 }
    };
    let keyMoment = null;
    let biggestSwing = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.move) continue;
      const side = r.move.color;

      if (r.type === 'blunder') {
        stats[side].blunders++;
        if (!keyMoment || r.type === 'blunder') {
          keyMoment = { index: i, result: r, moveNum: Math.floor(i / 2) + 1 };
        }
      }
      if (r.type === 'mistake') stats[side].mistakes++;
      if (r.type === 'good') stats[side].good++;
    }

    if (!keyMoment) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].type === 'mistake') {
          keyMoment = { index: i, result: results[i], moveNum: Math.floor(i / 2) + 1 };
          break;
        }
      }
    }

    return { stats, keyMoment };
  }

  return { analyzeGame, generateSummary, toFrench, materialCount };
})();
