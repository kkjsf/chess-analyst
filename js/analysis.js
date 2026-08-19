const Analyzer = (() => {
  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const CPLOSS_CAP = 1000; // clamp per-move cp loss for ACPL (mate scores ≈ 30000)
  const PIECE_NAMES_FR = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
  const PIECE_ARTICLE_FR = { p: 'le', n: 'le', b: 'le', r: 'la', q: 'la', k: 'le' };
  const SAN_TO_FR = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' };

  function toFrench(san) {
    return san
      .replace(/^([NBRQK])/, (_, p) => SAN_TO_FR[p] || p)
      .replace(/=([NBRQK])/, (_, p) => '=' + (SAN_TO_FR[p] || p));
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

  // How much net material the side to move in `fen` can win with a single
  // capture (1-ply static-exchange approximation: victim value minus the value
  // of whatever recaptures on that square). Used to tell whether the move that
  // just produced `fen` left a piece en prise — i.e. was a real sacrifice.
  // After the mover has played, it is the opponent to move. Return the best net
  // material the opponent can win by immediately capturing the piece the mover
  // just moved to (a 1-ply SEE approximation). Tying the sacrifice to the moved
  // piece is what separates a genuine offer from an unrelated piece that was
  // already hanging — only the former can be a brilliancy.
  function sacrificedOnMove(fen, movedTo) {
    let g;
    try { g = new Chess(fen); } catch (_) { return 0; }
    let best = 0;
    for (const cap of g.moves({ verbose: true })) {
      if (!cap.captured || cap.captured === 'k' || cap.to !== movedTo) continue;
      const gain = PIECE_VALUES[cap.captured] || 0;
      let recapVal = 0;
      try {
        const g2 = new Chess(g.fen());
        const c2 = g2.move(cap.san, { sloppy: true });
        if (!c2) continue;
        const recap = g2.moves({ verbose: true }).some(m => m.to === cap.to);
        recapVal = recap ? (PIECE_VALUES[c2.piece] || 0) : 0;
      } catch (_) { continue; }
      const net = gain - recapVal;
      if (net > best) best = net;
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


  // A fork worth telling the user about. Built on the v184 board reader in
  // js/tactics.js rather than on raw geometry: the old version called it a fork
  // as soon as two enemy pieces sat on the moved piece's lines, whether or not
  // the forking piece was itself hanging and whether or not the targets were
  // defended. That is exactly the false positive the user complained about
  // ("une fourchette royale reprise au coup d'après par un fou n'en est pas
  // une") — fixed in the training exercises in v184, but the game analysis kept
  // drawing gold fork rays on moves that simply hang a piece.
  //
  // Two conditions now, both from Tactics:
  //  - the moved piece attacks ≥ 2 enemy pieces *profitably* (each target
  //    survives a static exchange, `threats` filters them on SEE);
  //  - the whole thing still nets ≥ 2 pawns AFTER the opponent's best defence
  //    (`net`), so a fork that gets recaptured next move is not a fork.
  //
  // Returns { names, squares, forkSquare, net } — same shape as before, so the
  // callers that name the victims and draw one ray each are unchanged.
  const FORK_MIN_NET = 2;
  function detectFork(fenBefore, fenAfter, move) {
    if (typeof Tactics === 'undefined' || !Tactics.threats) return null;
    let t;
    try { t = Tactics.threats(fenBefore, fenAfter, { from: move.from, to: move.to }); }
    catch (_) { return null; }
    if (!t) return null;
    // Only what the piece that just moved hits itself — a discovered attack is a
    // different motif and is described elsewhere.
    const hits = t.checks.concat(t.direct).filter(x => x.from === move.to);
    if (hits.length < 2) return null;
    if (!t.mate && t.net < FORK_MIN_NET) return null;
    return {
      names: hits.map(h => h.t === 'k' ? 'roi' : PIECE_NAMES_FR[h.t]),
      squares: hits.map(h => h.sq),
      forkSquare: move.to,
      net: t.net
    };
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
        const fork = detectFork(fenAfter, g.fen(), oppMove);
        if (fork) return `L'adversaire menace une fourchette avec échec sur ${fork.names.join(' et ')}.`;
        return 'Ce coup expose le roi à un échec dangereux.';
      }

      const fork = detectFork(fenAfter, g.fen(), oppMove);
      if (fork) return `L'adversaire menace une fourchette sur ${fork.names.join(' et ')}.`;
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
      const phase = phaseOf(prevFen, i);

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

  // ── Les types de coups, source unique ──────────────────────────────────────
  // Le glyphe, le libellé, la classe CSS et le critère de CHAQUE type, en un
  // seul endroit. Il y en avait quatre : MOVE_CLASS dans app.js, deux légendes
  // écrites à la main dans index.html, et un couple ordre/GLYPH dans coach.js.
  // Elles avaient divergé sur le point le plus visible : le mot « Excellent »
  // désignait le glyphe ! dans l'app et le glyphe ✔ dans la légende rapide.
  // Les libellés retenus sont ceux du Game Review de Chess.com en français.
  //
  // L'ordre du tableau est l'ordre d'affichage, du meilleur au pire.
  const MOVE_TYPES = [
    { k: 'brilliant',  mark: '!!', label: 'Brillant',     crit: '< 0,05 pp + sacrifice',            desc: 'Un sacrifice de pièce gagnant (≥ une mineure donnée), qui reste fort, sans être perdant après ni déjà totalement gagnant avant.' },
    { k: 'great',      mark: '!',  label: 'Excellent',    crit: '< 0,02 pp + seul coup',            desc: 'Le coup n°1 alors que le 2ᵉ meilleur est bien pire (écart ≥ 1,5 pion), dans une position disputée.' },
    { k: 'best',       mark: '★',  label: 'Meilleur',     crit: '< 0,02 pp, coup n°1 (ou équivalent)', desc: "Le coup n°1 du moteur, ou un coup qui l'égale à quelques centièmes de pion près." },
    { k: 'excellent',  mark: '✔',  label: 'Très bien',    crit: '< 0,02 pp',                        desc: "Presque optimal, sans être exactement le coup n°1." },
    { k: 'good',       mark: '✓',  label: 'Bon',          crit: '0,02 – 0,05 pp',                   desc: 'Un bon coup, sans être optimal.' },
    { k: 'book',       mark: '📖', label: 'Théorique',    crit: 'ouverture connue, < 0,10 pp',      desc: "Coup d'ouverture reconnu ; prioritaire sur « Imprécision » dans la théorie connue." },
    { k: 'forced',     mark: '□',  label: 'Forcé',        crit: 'un seul coup légal',               desc: "Il n'y avait rien d'autre à jouer : ni mérite, ni faute, et donc pas compté comme un bon coup." },
    { k: 'inaccuracy', mark: '?!', label: 'Imprécision',  crit: '0,05 – 0,10 pp',                   desc: "Petit écart, l'avantage se grignote." },
    { k: 'miss',       mark: '✗',  label: 'Coup manqué',  crit: '≥ 0,10 pp + gain lâché',           desc: 'Tu étais gagnant (≥ 70 % de chances) et tu retombes à l\'équilibre sans pour autant te mettre en danger.' },
    { k: 'mistake',    mark: '?',  label: 'Erreur',       crit: '0,10 – 0,20 pp',                   desc: "Coup coûteux, l'avantage change de camp." },
    { k: 'blunder',    mark: '??', label: 'Gaffe',        crit: '≥ 0,20 pp',                        desc: 'Erreur grave, la position bascule.' }
  ];
  const MOVE_CLASS = {};
  for (const t of MOVE_TYPES) MOVE_CLASS[t.k] = { label: t.label, cls: t.k, mark: t.mark };

  function generateSummary(results, moves) {
    const stats = {
      w: { brilliants: 0, best: 0, great: 0, excellent: 0, good: 0, book: 0, forced: 0, inaccuracies: 0, misses: 0, mistakes: 0, blunders: 0, totalCpLoss: 0, totalWinLoss: 0, totalAcc: 0, moveCount: 0, accs: [], plies: [] },
      b: { brilliants: 0, best: 0, great: 0, excellent: 0, good: 0, book: 0, forced: 0, inaccuracies: 0, misses: 0, mistakes: 0, blunders: 0, totalCpLoss: 0, totalWinLoss: 0, totalAcc: 0, moveCount: 0, accs: [], plies: [] }
    };
    let keyMoment = null;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.move) continue;
      const side = r.move.color;
      stats[side].moveCount++;
      // Cap per-move cp loss so a single missed/allowed mate (stored as a
      // ~30000cp mate score) can't blow up the ACPL average.
      stats[side].totalCpLoss += Math.min(r.cpLoss || 0, CPLOSS_CAP);
      stats[side].totalWinLoss += r.winPctLoss || 0;
      stats[side].totalAcc += winLossToAccuracy(r.winPctLoss);
      // Gardés pour la moyenne pondérée/harmonique plus bas.
      stats[side].accs.push(winLossToAccuracy(r.winPctLoss));
      stats[side].plies.push(i);

      if (r.type === 'brilliant') stats[side].brilliants++;
      if (r.type === 'best') stats[side].best++;
      if (r.type === 'great') stats[side].great++;
      if (r.type === 'excellent') stats[side].excellent++;
      if (r.type === 'good') stats[side].good++;
      if (r.type === 'book') stats[side].book++;
      if (r.type === 'forced') stats[side].forced++;
      if (r.type === 'inaccuracy') stats[side].inaccuracies++;
      if (r.type === 'miss') stats[side].misses++;
      if (r.type === 'mistake') stats[side].mistakes++;
      if (r.type === 'blunder' || r.type === 'miss') {
        if (r.type === 'blunder') stats[side].blunders++;
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

    // Courbe des chances de gain (vue des Blancs), reconstruite depuis les évals
    // stockées — elle sert à mesurer la volatilité locale de chaque position.
    const winSeries = results.map(r => typeof r.eval === 'number' ? cpToWinPct(r.eval) : 0.5);

    for (const side of ['w', 'b']) {
      const s = stats[side];
      s.acpl = s.moveCount > 0 ? Math.round(s.totalCpLoss / s.moveCount) : 0;
      s.accuracy = s.moveCount > 0
        ? Math.round(blendedAccuracy(s.accs, volatilityWeights(winSeries, s.plies)))
        : 100;
      delete s.accs; delete s.plies;
    }

    const opening = moves ? Openings.detect(moves.map(m => m.san || m)) : null;

    return { stats, keyMoment, opening, engineEffort: results.engineEffort || null };
  }

  // ── Phase de jeu ───────────────────────────────────────────────────────────
  // UNE seule définition, déduite de la POSITION. Il y en avait trois
  // incompatibles dans ce fichier (ply<20/50 pour les stats, ply<10 et
  // « 6 derniers coups » pour les textes), si bien que le 12e demi-coup était
  // « ouverture » pour la statistique et « milieu de jeu » pour le commentaire.
  //
  // Compter les coups n'a de toute façon pas de sens échiquéen : une Française
  // fermée est encore en ouverture au 25e coup, une Scandinave échangée est en
  // finale au 20e. On regarde donc le matériel et le développement.
  //   finale    : matériel hors pions ≤ 26 pts sur l'échiquier (62 au départ),
  //               soit en gros dames échangées + une tour et une mineure par camp
  //   ouverture : encore dans le livre, ou développement à peine entamé
  //   milieu    : le reste
  //
  // Les deux signaux utilisés sont MONOTONES, pour qu'une partie ne puisse pas
  // revenir en arrière : le matériel ne fait que baisser, et un droit de roque
  // perdu ne revient jamais. Compter les pièces mineures encore sur leur case de
  // départ, ce qui semblait naturel, ne l'est pas : une retraite Breyer (…Cb8)
  // remettait la partie « en ouverture » au 10e coup.
  const ENDGAME_MATERIAL = 26;
  const OPENING_PLY_CAP = 20;

  function nonPawnMaterial(fen) {
    let total = 0;
    // Les chiffres et les « / » ne sont pas dans PIECE_VALUES, le roi y vaut 0.
    for (const ch of (fen || '').split(' ')[0]) {
      const t = ch.toLowerCase();
      if (t !== 'p' && PIECE_VALUES[t]) total += PIECE_VALUES[t];
    }
    return total;
  }

  // Un camp peut-il encore roquer ? Tant que les rois ne sont pas à l'abri, on
  // est encore dans les tâches d'ouverture.
  function someoneCanCastle(fen) {
    const rights = (fen || '').split(' ')[2];
    return !!rights && rights !== '-';
  }

  function phaseOf(fen, ply, bookDepth) {
    // Sans FEN (vieux enregistrements), on retombe sur l'ancien découpage.
    if (!fen) return ply < 20 ? 'opening' : ply < 50 ? 'middle' : 'endgame';
    if (nonPawnMaterial(fen) <= ENDGAME_MATERIAL) return 'endgame';
    if (bookDepth && ply < bookDepth) return 'opening';
    if (ply < OPENING_PLY_CAP && someoneCanCastle(fen)) return 'opening';
    return 'middle';
  }

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
    const spent = clocksToTimePerMove(clocks, tcIncrement(info.timeControl));
    const baseSec = parseBaseSeconds(info.timeControl);
    const ttThreshold = Math.max(10, baseSec ? baseSec * 0.1 : 15);

    const phaseSec = { opening: { t: 0, c: 0 }, middle: { t: 0, c: 0 }, endgame: { t: 0, c: 0 } };
    let sum = 0, cnt = 0, ttMoves = 0;
    const ttPly = {};
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.move || r.move.color !== side) continue;
      const ph = phaseOf(r.fenBefore, i);
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
    const highlights = [];
    let maxUserEval = null, minUserEval = null, turningPoint = null;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.move || r.move.color !== side) continue;
      const phase = phaseOf(r.fenBefore, i);

      if (typeof r.eval === 'number') {
        const ue = Math.max(-1000, Math.min(1000, side === 'w' ? r.eval : -r.eval));
        if (maxUserEval === null || ue > maxUserEval) maxUserEval = ue;
        if (minUserEval === null || ue < minUserEval) minUserEval = ue;
      }

      if (r.type === 'blunder' || r.type === 'mistake' || r.type === 'miss') {
        phaseErrors[phase]++;
        if (r.fenBefore && r.bestUci) {
          blunders.push({
            ply: i, phase, type: r.type,
            fenBefore: r.fenBefore, bestUci: r.bestUci, bestSan: r.bestSan || null,
            playedSan: r.sanFr || r.san, cpLoss: r.cpLoss || 0, tip: r.tipFr || ''
          });
        }
      }

      // Your best moves — the ones worth revisiting for inspiration. Stored the
      // same way as blunders (position + the move you played, which IS the good
      // move) so the coach can replay them without a fresh engine run.
      if ((r.type === 'brilliant' || r.type === 'great') && r.fenBefore && r.move) {
        highlights.push({
          ply: i, phase, type: r.type,
          fenBefore: r.fenBefore,
          playedUci: r.move.from + r.move.to + (r.move.promotion || ''),
          playedSan: r.sanFr || r.san, eval: typeof r.eval === 'number' ? r.eval : null,
          tip: r.tipFr || ''
        });
      }

      phaseAcc[phase].total += winLossToAccuracy(r.winPctLoss);
      phaseAcc[phase].count++;
      phaseCp[phase].total += Math.min(r.cpLoss || 0, CPLOSS_CAP);
      phaseCp[phase].count++;

      const loss = r.winPctLoss || 0;
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
      brilliant: us.brilliants || 0, best: us.best || 0, great: us.great || 0,
      excellent: us.excellent || 0, good: us.good || 0, book: us.book || 0, forced: us.forced || 0,
      inaccuracy: us.inaccuracies || 0, miss: us.misses || 0, mistake: us.mistakes || 0, blunder: us.blunders || 0,
      moveCount: us.moveCount || 0
    };
    mq.ok = Math.max(0, mq.moveCount - (mq.brilliant + mq.best + mq.great + mq.excellent + mq.good + mq.book + mq.forced + mq.inaccuracy + mq.miss + mq.mistake + mq.blunder));

    const time = computeTimeStats(results, info, side, blunders.map(b => b.ply));

    return {
      analyzedAt: Date.now(),
      // Effort moteur qui a produit ces chiffres. Deux qualités très différentes
      // atterrissent dans le même jeu de données : le serveur cherche à
      // --depth 20 avec un Stockfish natif, « Analyser ici » à movetime 600 dans
      // le navigateur. Sans cette étiquette, une partie analysée localement
      // paraissait simplement plus propre que les autres dans les tendances.
      engineEffort: (summary && summary.engineEffort) || null,
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
      blunderList: blunders,
      highlights
    };
  }

  // Robust PGN → verbose-moves parser. chess.js 0.12.1 load_pgn fails on
  // Chess.com PGNs whose comments contain [%clk ...] (the ] breaks header
  // detection) and misreads b-file pawn captures (bxa4) as bishop moves in
  // sloppy mode. So: strip comments first, extract SAN tokens, replay each
  // move strict-first then sloppy.
  function parsePgnMoves(pgn) {
    let txt = (pgn || '')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ');
    // Strip variations innermost-first so NESTED RAVs like "(a (b) c)" are fully
    // removed. A single non-recursive pass would stop at the first ')', leaking
    // the outer variation's tail ("c)") into the move stream.
    let prev;
    do { prev = txt; txt = txt.replace(/\([^()]*\)/g, ' '); } while (txt !== prev);
    txt = txt
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
    // Étiquette d'effort transportée jusqu'aux stats de partie (voir
    // computeGameStats.engineEffort) : le serveur et le navigateur ne
    // produisent pas la même qualité d'analyse.
    const game = new Chess();

    const positions = [game.fen()];
    const madeMovesArr = [];
    for (const move of moves) {
      let made = game.move(move.san, { sloppy: true });
      if (!made) made = game.move({ from: move.from, to: move.to, promotion: move.promotion });
      madeMovesArr.push(made);
      positions.push(made ? game.fen() : null);
    }

    const bookInfo = Openings.detect(moves.map(m => (m && m.san) ? m.san : m));
    const bookDepth = bookInfo && bookInfo.moves >= 3 ? bookInfo.moves : 0;

    const evals = [];
    const total = positions.length;
    for (let i = 0; i < total; i++) {
      if (!positions[i]) {
        evals.push(null);
      } else {
        const g = new Chess(positions[i]);
        // Only short-circuit when there is genuinely no move to search
        // (checkmate or stalemate). game_over() also fires on the claimable
        // 50-move / threefold / insufficient-material draws — but the actual
        // game kept going past those, so let the engine evaluate them instead
        // of flatlining the eval to 0 for the rest of the game.
        if (g.moves().length === 0) {
          evals.push({ score: g.in_checkmate() ? -30000 : 0, bestMove: null, pv: '', mate: g.in_checkmate() ? 0 : null });
        } else {
          // A dead engine must cost us this position, not the whole game: push
          // null so THIS move takes the heuristic path while the 40 positions
          // already searched keep their real evaluations.
          let ev = null;
          try { ev = await StockfishEngine.evaluate(positions[i], depth); } catch (_) { ev = null; }
          evals.push(ev);
        }
      }
      if (onProgress) {
        onProgress(i + 1, total);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const results = [];
    results.engineEffort = depth;
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
      const phase = phaseOf(positions[i], i, bookDepth);

      const evalBefore = evals[i];
      const evalAfter = evals[i + 1];

      let cpLoss = 0;
      let bestMoveSanFr = null;
      let bestMoveUci = null;
      let bestMovePv = null;
      let evalForWhite = null;
      let winPctLoss = 0;
      let winBefore = 0.5, winAfterPlayed = 0.5, onlyMoveGap = 0;
      let bestEquivalent = false;
      const alternatives = [];

      if (evalBefore && evalAfter) {
        cpLoss = Math.max(0, evalBefore.score + evalAfter.score);

        if (evalBefore.bestMove) {
          bestMoveUci = evalBefore.bestMove;
          bestMovePv = evalBefore.pv || null;
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

        // Expected points before = value of the position with best play (mover
        // POV). Expected points after the played move: score it INSIDE the same
        // pre-move search whenever we can — the engine's own MultiPV line for
        // that move — so the best move loses exactly 0 and we don't pick up
        // noise from comparing two independent 1.5 s searches (which made even
        // top moves look like inaccuracies). Only moves outside the top-N fall
        // back to the after-position search. This mirrors Chess.com.
        winBefore = cpToWinPct(evalBefore.score);
        let scoreAfterMover;
        if (bestMoveUci && playedUci === bestMoveUci) {
          scoreAfterMover = evalBefore.score;
        } else {
          const playedLine = evalBefore.lines && evalBefore.lines.find(l => l && l.move === playedUci && typeof l.score === 'number');
          scoreAfterMover = playedLine ? playedLine.score : -evalAfter.score;
        }
        winAfterPlayed = cpToWinPct(scoreAfterMover);
        winPctLoss = Math.max(0, winBefore - winAfterPlayed);

        // "Best" the way Chess.com shows it: not only the engine's single #1 move,
        // but any move that TIES the top line (its own search score is within a
        // few cp of the best). Equal-best alternatives are graded Best, not the
        // lower Excellent tier — this is why our Best count sat below Chess.com's.
        bestEquivalent = (playedUci === bestMoveUci) ||
          (typeof scoreAfterMover === 'number' && scoreAfterMover >= evalBefore.score - 8);

        // Gap (in cp, mover POV) between the engine's #1 and #2 lines — how much
        // worse every alternative is. A large gap means the best move was the
        // "only move", which Chess.com rewards as a Great Move (!).
        if (evalBefore.lines && evalBefore.lines.length >= 2 &&
            typeof evalBefore.lines[0].score === 'number' &&
            typeof evalBefore.lines[1].score === 'number') {
          onlyMoveGap = evalBefore.lines[0].score - evalBefore.lines[1].score;
        }

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

      // ── Chess.com move classification ──────────────────────────────────
      // Every move is graded on "expected points lost" (wpl, 0..1) using the
      // Expected-Points table from Chess.com's Game Review, plus their special
      // categories (Brilliant, Great, Book, Miss). Order matters: the special
      // categories are checked before the plain threshold bands.
      //   Best        wpl ≈ 0 and you played the engine's #1
      //   Excellent   wpl 0.00–0.02
      //   Good        wpl 0.02–0.05
      //   Inaccuracy  wpl 0.05–0.10
      //   Mistake     wpl 0.10–0.20
      //   Blunder     wpl 0.20–1.00
      const wpl = winPctLoss;
      const inBook = bookDepth && i < bookDepth;
      const noEngine = !(evalBefore && evalAfter);
      // A "good piece sacrifice" for Brilliant, tied to the move just played:
      // the piece that moved is left en prise for net ≥ 2. Requiring the offer
      // to be the moved piece stops an unrelated piece that was already hanging
      // from being mistaken for a brilliancy. Combined below with soundness: the
      // sac must be best/near-best, keep you at least equal, and you must not
      // have been winning easily already — otherwise giving up material is a
      // blunder, not a brilliant (the line between the two is thin).
      const isSacrifice = !noEngine && sacrificedOnMove(newFen, madeMove.to) >= 2;
      // Chess.com greys out a move as "Forced" (□) when the mover had only one
      // legal move — it is neither skilful nor a blunder, so it must not be
      // graded Best/Excellent (which would inflate accuracy).
      let legalBefore = 0;
      try { legalBefore = new Chess(positions[i]).moves().length; } catch (_) {}
      // A Miss (rather than a Blunder/Mistake) is failing to punish while
      // STAYING OK: you were winning and let the big edge slip, but you didn't
      // hand the game away. If the move leaves you clearly worse (winAfter below
      // this floor) it is a real Blunder/Mistake, not a Miss.
      const MISS_FLOOR = 0.45;
      const stillOk = winAfterPlayed >= MISS_FLOOR;
      let type;

      if (noEngine) {
        // Heuristic fallback path (no Stockfish) — keep it simple.
        type = madeMove.san.includes('#') ? 'best' : 'neutral';
      } else if (legalBefore === 1) {
        // Only one legal move — forced, regardless of how good the position is.
        type = 'forced';
      } else if (isSacrifice && !inBook &&
                 (isBestMove || bestEquivalent) &&
                 winAfterPlayed >= 0.62 &&
                 winBefore >= 0.15 && winBefore <= 0.80) {
        // Sound sacrifice — deliberately strict so the badge means something.
        // A real brilliancy must clear ALL of:
        //  - the piece you just moved is left en prise for net ≥ 2 (isSacrifice);
        //  - it is the engine's #1 move, or ties it within a few cp
        //    (isBestMove || bestEquivalent) — not merely "close to best";
        //  - after best play you are CLEARLY WINNING (winAfterPlayed ≥ 0.62), so
        //    the sac actually buys a winning advantage, it doesn't just hold
        //    equality or get tolerated by the engine;
        //  - the position was genuinely contested first (winBefore 0.15–0.80):
        //    not already winning easily (where giving material is routine) and
        //    not already lost (where a desperate sac isn't brilliant).
        // This rejects the common false positives: everyday tactics that regain
        // material, pseudo-sacrifices onto defended squares, and "sacs" from an
        // already-won position.
        type = 'brilliant';
      } else if (wpl >= 0.20) {
        // Blunder — but if a winning move was on the board and you merely let the
        // win slip while staying OK, Chess.com shows this as a Miss.
        type = (winBefore >= 0.70 && stillOk) ? 'miss' : 'blunder';
      } else if (wpl >= 0.10) {
        type = (winBefore >= 0.70 && stillOk) ? 'miss' : 'mistake';
      } else if (inBook) {
        // Recognised opening theory shows as Book (📖), never a bare inaccuracy —
        // Chess.com trusts its book for any non-error move.
        type = 'book';
      } else if (wpl >= 0.05) {
        type = 'inaccuracy';
      } else if (wpl >= 0.02) {
        type = 'good';
      } else if (isBestMove && onlyMoveGap >= 150 &&
                 winBefore > 0.15 && winBefore < 0.92) {
        // The only good move in a contested position — a Great Move (!).
        type = 'great';
      } else if (isBestMove || bestEquivalent) {
        type = 'best';
      } else {
        type = 'excellent';
      }
      if (madeMove.san.includes('#')) type = 'best';

      const evalDesc = evalAfter ? describeEval(evalForWhite) : '';
      const ed = evalDesc ? ' ' + evalDesc : '';
      let tipFr;
      if (madeMove.san.includes('#')) {
        tipFr = `Échec et mat ! Les ${side} remportent la partie.`;
      } else if (type === 'forced') {
        tipFr = `Coup forcé — c'était le seul coup légal.${ed}`;
      } else if (type === 'brilliant') {
        tipFr = `Brillant ! Un sacrifice de matériel gagnant — le meilleur coup, et difficile à trouver.${ed}`;
      } else if (type === 'miss') {
        const bestSpan = bestMoveSanFr ? `<span class="alt-move" data-uci="${bestMoveUci}" data-fen="${positions[i]}">${bestMoveSanFr}</span>` : null;
        const whyBad = explainBadMove(newFen, madeMove, evalAfter && evalAfter.lines);
        tipFr = bestSpan
          ? `Coup manqué ! Vous étiez en position de gagner — il fallait jouer ${bestSpan}.${whyBad ? ' ' + whyBad : ''}`
          : `Coup manqué ! Vous laissez filer un avantage gagnant.${whyBad ? ' ' + whyBad : ''}`;
        if (alternatives.length > 0) tipFr += ` Aussi possible : ${altSpans(alternatives, positions[i])}.`;
        tipFr += ed;
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
      } else if (type === 'great') {
        const enriched = enrichNeutralTip(positions[i], newFen, madeMove, phase, i);
        tipFr = enriched
          ? `Excellent ! Le seul bon coup de la position. ${enriched}${ed}`
          : `Excellent ! C'était le seul bon coup de la position.${ed}`;
      } else if (type === 'best') {
        const enriched = enrichNeutralTip(positions[i], newFen, madeMove, phase, i);
        tipFr = enriched
          ? `Meilleur coup ! ${enriched}${ed}`
          : `Meilleur coup ! C'est exactement ce que recommande le moteur.${ed}`;
      } else if (type === 'excellent') {
        if (madeMove.captured) {
          const capName = PIECE_NAMES_FR[madeMove.captured];
          tipFr = `Très bien ! Capture optimale${capName ? ' du ' + capName : ''}.${ed}`;
        } else {
          const enriched = enrichNeutralTip(positions[i], newFen, madeMove, phase, i);
          tipFr = enriched ? `Très bien. ${enriched}${ed}` : `Très bien, coup quasi-optimal.${ed}`;
        }
      } else if (type === 'book') {
        const note = openingMoveNote(madeMove.san);
        const open = bookInfo && bookInfo.name ? ' de la ' + bookInfo.name : '';
        tipFr = note
          ? `Coup théorique${open}. ${note}`
          : `Coup théorique${open}. Vous suivez la théorie d'ouverture reconnue.`;
      } else if (type === 'good') {
        const enriched = enrichNeutralTip(positions[i], newFen, madeMove, phase, i);
        tipFr = enriched ? `Bon coup. ${enriched}${ed}` : `Bon coup, sans être optimal.${ed}`;
      } else {
        const enriched = enrichNeutralTip(positions[i], newFen, madeMove, phase, i);
        tipFr = enriched ? `${enriched}${ed}` : `Coup correct.${ed}`;
      }

      const forkTargets = detectFork(positions[i], newFen, madeMove);
      if (forkTargets && type !== 'blunder' && type !== 'mistake') {
        tipFr += ` Fourchette sur ${forkTargets.names.join(' et ')} !`;
      }

      // The opponent's best reply is their THREAT. When it's serious (mate, a
      // real capture, a fork, or a check) we both warn in the tip AND draw it as
      // red arrows on the board, the way Chess.com surfaces threats. A fork adds
      // one ray per attacked piece so the double attack is obvious.
      let threatArrows = [];
      if (!forkTargets && evalAfter && evalAfter.lines && evalAfter.lines[0] && evalAfter.lines[0].move) {
        try {
          const tg = new Chess(newFen);
          const tu = evalAfter.lines[0].move;
          const tm = tg.move({ from: tu.slice(0,2), to: tu.slice(2,4), promotion: tu[4] });
          if (tm) {
            const tFr = toFrench(tm.san);
            const opp = isWhite ? 'les Noirs' : 'les Blancs';
            const threatFork = detectFork(newFen, tg.fen(), tm);
            const moveArrow = { from: tu.slice(0, 2), to: tu.slice(2, 4), color: '#e0574a', opacity: 0.9, width: 6, threat: true };
            if (threatFork) {
              const chk = tm.san.includes('+') ? ' avec échec' : '';
              tipFr += ` ⚠ Fourchette${chk} ! ${opp} menacent ${tFr}, qui attaque à la fois ${threatFork.names.join(' et ')}.`;
              threatArrows.push(moveArrow);
              // Lighter, thinner rays from the fork square to each victim.
              for (const sq of threatFork.squares) {
                threatArrows.push({ from: tm.to, to: sq, color: '#f0938a', opacity: 0.75, width: 4, threat: true });
              }
            } else {
              let isThreat = false;
              if (tm.san.includes('#')) {
                tipFr += ` ⚠ ${opp} menacent mat avec ${tFr} !`;
                isThreat = true;
              } else if (tm.captured && PIECE_VALUES[tm.captured] >= 3) {
                const art = PIECE_ARTICLE_FR[tm.captured];
                const cn = PIECE_NAMES_FR[tm.captured];
                tipFr += ` ⚠ Attention, ${opp} menacent de prendre ${art} ${cn} (${tFr}).`;
                isThreat = true;
              } else if (tm.san.includes('+')) {
                tipFr += ` ⚠ ${opp} menacent un échec (${tFr}).`;
                isThreat = true;
              }
              if (isThreat) threatArrows.push(moveArrow);
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
      // When the player's own move forks, trace a gold ray to each piece it
      // hits (on top of the move arrow) so the double attack reads at a glance.
      if (forkTargets && type !== 'blunder' && type !== 'mistake') {
        if (!arrows.some(a => a.from === madeMove.from && a.to === madeMove.to)) {
          arrows.push({ from: madeMove.from, to: madeMove.to, color: '#e2b857', opacity: 0.7, width: 5 });
        }
        for (const sq of forkTargets.squares) {
          arrows.push({ from: forkTargets.forkSquare, to: sq, color: '#f0c96b', opacity: 0.6, width: 4 });
        }
      }
      // Red threat arrows drawn on top of any move/best arrows (Chess.com-style).
      if (threatArrows.length) arrows.push(...threatArrows);

      results.push({
        type, san: madeMove.san, sanFr, tipFr,
        move: madeMove, fen: newFen,
        materialDiff: newMaterial.diff, arrows,
        eval: evalForWhite, cpLoss, winPctLoss: winPctLoss || 0, alternatives, fenBefore: positions[i],
        bestUci: bestMoveUci, bestSan: bestMoveSanFr, bestPv: bestMovePv
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

  // Beginner-friendly notes for the most common opening moves, keyed by English
  // SAN. Shown on "Théorique" moves so e4, the Sicilian, castling, etc. get a
  // one-line explanation instead of a bare "coup théorique".
  const OPENING_NOTES = {
    'e4': "<b>e4</b>, le pion roi : il ouvre la dame et le fou-roi et prend le centre.",
    'd4': "<b>d4</b>, le pion dame : une prise de centre solide, soutenue par la dame.",
    'Nf3': "<b>Cf3</b> développe le cavalier roi, attaque e5 et contrôle le centre.",
    'c4': "<b>c4</b>, l'Anglaise : le pion attaque la case d5 depuis le flanc.",
    'g3': "<b>g3</b> prépare le fianchetto du fou en g2, sur la grande diagonale.",
    'Nc3': "<b>Cc3</b> développe le cavalier dame et renforce le contrôle de d5 et e4.",
    'e5': "<b>e5</b> réplique au centre et libère les pièces, en miroir de e4.",
    'c5': "<b>c5</b>, la Sicilienne : on conteste le centre de biais, très combatif.",
    'e6': "<b>e6</b>, la Française : prépare d5 pour défier le centre (enferme un peu le fou c8).",
    'c6': "<b>c6</b>, la Caro-Kann : prépare d5 solidement, sans bloquer le fou c8.",
    'd5': "<b>d5</b> conteste directement le centre.",
    'd6': "<b>d6</b> soutient e5 et libère la voie au fou c8.",
    'Nf6': "<b>Cf6</b> attaque e4 et développe le cavalier vers le centre.",
    'Nc6': "<b>Cc6</b> développe le cavalier dame et soutient e5 / d4.",
    'g6': "<b>g6</b> prépare le fianchetto du fou-roi (défenses indienne / moderne).",
    'b6': "<b>b6</b> prépare le fianchetto du fou dame en b7.",
    'Bb5': "<b>Fb5</b>, l'Espagnole : le fou attaque le cavalier qui défend e5.",
    'Bc4': "<b>Fc4</b>, l'Italienne : le fou vise le point faible f7.",
    'Bb4': "<b>Fb4</b> cloue le cavalier c3 sur la dame ou le roi.",
    'Bg2': "<b>Fg2</b> achève le fianchetto : le fou rayonne sur la grande diagonale.",
    'Bg7': "<b>Fg7</b> achève le fianchetto : le fou tient la grande diagonale.",
    'O-O': "Le <b>petit roque</b> met le roi à l'abri et active la tour.",
    'O-O-O': "Le <b>grand roque</b> met le roi à l'abri et centralise la tour dame."
  };
  function openingMoveNote(san) {
    if (!san) return '';
    const key = san.replace(/[+#!?]/g, '');
    return OPENING_NOTES[key] || '';
  }

  // Expected-points / win-probability model, same logistic Chess.com & Lichess
  // use (k = 0.00368208 per centipawn). Returns 0..1 from the mover's point of
  // view — 1 = winning, 0.5 = equal, 0 = lost. Every move classification below
  // is expressed as "expected points lost" = winPct(before) − winPct(after) on
  // this curve, exactly like Chess.com's Game Review.
  function cpToWinPct(cp) {
    if (cp > 29000) return 1;
    if (cp < -29000) return 0;
    return 1 / (1 + Math.exp(-0.00368208 * cp));
  }

  // Chess.com's per-move accuracy from expected-points lost (winPctLoss, 0..1):
  // 103.1668·e^(−0.04354·Δwin%) − 3.1669, clamped 0..100. The ONE accuracy
  // curve for the whole app — averaging per-move values of this is how every
  // accuracy figure must be computed (summary, phases, narrative), so a game
  // never shows two different numbers.
  function winLossToAccuracy(winPctLoss) {
    return Math.max(0, Math.min(100,
      103.1668 * Math.exp(-0.04354 * ((winPctLoss || 0) * 100)) - 3.1669));
  }

  // Volatilité locale de la courbe d'évaluation autour de chaque coup : un coup
  // joué dans une position tranchante pèse plus lourd qu'un coup joué dans une
  // position morte où tout se vaut. Écart-type des chances de gain sur une
  // fenêtre glissante, borné pour qu'aucun coup ne domine ni ne disparaisse.
  function volatilityWeights(winSeries, plies) {
    const w = Math.max(2, Math.min(8, Math.ceil(winSeries.length / 10)));
    return plies.map(i => {
      const lo = Math.max(0, i - w), hi = Math.min(winSeries.length - 1, i + 1);
      const seg = winSeries.slice(lo, hi + 1);
      if (seg.length < 2) return 1;
      const m = seg.reduce((a, v) => a + v, 0) / seg.length;
      const sd = Math.sqrt(seg.reduce((a, v) => a + (v - m) * (v - m), 0) / seg.length);
      return Math.max(0.5, Math.min(12, sd * 100));
    });
  }

  // Précision d'une partie. PAS la moyenne arithmétique des précisions par coup :
  // une seule gaffe se noierait dans quarante coups faciles, et une partie perdue
  // sur une bourde unique affichait 88 %. Comme Chess.com, on combine
  //   - une moyenne PONDÉRÉE par la volatilité (les moments qui comptent pèsent),
  //   - une moyenne HARMONIQUE (qui punit franchement les valeurs basses),
  // et on prend la moyenne des deux.
  function blendedAccuracy(accs, weights) {
    if (!accs || !accs.length) return 100;
    let sumW = 0, sumWA = 0, sumInv = 0;
    for (let i = 0; i < accs.length; i++) {
      const a = Math.max(accs[i], 1); // borne basse : évite 1/0 dans l'harmonique
      const w = weights && weights[i] ? weights[i] : 1;
      sumWA += a * w; sumW += w; sumInv += 1 / a;
    }
    const weighted = sumW ? sumWA / sumW : 100;
    const harmonic = accs.length / sumInv;
    return Math.max(0, Math.min(100, (weighted + harmonic) / 2));
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

  // Increment (in seconds) from a TimeControl header like "600+5" or "180+2".
  // Daily ("1/86400") and plain base-only controls have no increment → 0.
  function tcIncrement(tc) {
    const m = /^\s*\d+\s*\+\s*(\d+)/.exec(tc || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  function clocksToTimePerMove(clocks, increment) {
    if (clocks.length < 2) return [];
    const inc = increment || 0;
    const times = [];
    for (let i = 0; i < clocks.length; i++) {
      const prevIdx = i - 2;
      if (prevIdx < 0) {
        times.push(0);
      } else {
        // Time spent = clock before this move − clock after it + the increment
        // that was credited when the move was made. Without the +inc every
        // think is understated by one increment (e.g. 5 s on a 600+5 game),
        // inflating the "played too fast" (<15 s) counts.
        times.push(Math.max(0, clocks[prevIdx] - clocks[i] + inc));
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

  return { analyzeGame, analyzeGameAsync, generateSummary, computeGameStats, parsePgnMoves, toFrench, materialCount, cpToWinPct, describeEval, parseClocks, clocksToTimePerMove, tcIncrement, winLossToAccuracy, probeTablebase, explainBadMove, detectFork, phaseOf, MOVE_TYPES, MOVE_CLASS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Analyzer;
