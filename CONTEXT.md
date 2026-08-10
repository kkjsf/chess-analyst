# Chess Analyst — Context

**Quoi:** PWA d'analyse de parties d'échecs. On importe un PGN (ou via Share Target), l'app rejoue la partie sur un échiquier SVG et produit une analyse coach en français (précision, coups clés, tactiques, ouvertures).
**Statut:** Actif, déployé. Développement continu.
**Stack:** Vanilla JS (`js/`, `css/`), chess.js (UMD), Stockfish (analyse MultiPV + précision via WDL), échiquier SVG, PWA avec Share Target. UI en français.
**Repo / déploiement:** `git@github.com:kkjsf/chess-analyst.git` (compte GitHub `kkjsf`), hébergé en Pages/statique.
**Lancer:** ouvrir `index.html` (aucun build). Stockfish tourne côté client.

**Versioning (règle importante):**
- Source unique de version: bumper UNIQUEMENT `window.APP_VERSION` dans `index.html`.
- `sw.js` dérive `CACHE_NAME` depuis le `?v=`. Le SW est cache-first pour les assets `?v=`.
- Ne pas dupliquer le numéro de version ailleurs.

**Fichiers clés:**
- `index.html` - app principale.
- `js/`, `css/` - logique et styles.
- `sw.js`, `manifest.json` - PWA.
- `coach-data.json` - contenu de coaching généré (~680 KB). Certains items de correctness ne se reflètent qu'après une RE-RUN complète du coach.
- `tools/` - scripts utilitaires.
- Prototypes/mockups (non prod): `mockup.html`, `redesign-mockup.html`, `openings-tree-mockup.html`, `openings-tree-visual.html`, `mon-bilan-10min.html`.
- `icons/`, `.github/`.

**Historique récent (du plus récent):**
- Cours sur les mats (v150): l'onglet du bas **Finales** (ancien entraîneur roi-seul, `js/endgame.js`)
  est SUPPRIMÉ (Chess.com le fait déjà bien) et remplacé par un onglet **Mats** = un vrai cours illustré.
  Nouveau module `js/mates.js` (`Mates.show/close`, overlay `#mate-overlay` réutilisant le shell
  `.guess-*`): menu à 2 niveaux (menu groupé → fiche détaillée) avec 14 figures de mat en 4 groupes
  (① pièges du début: imbécile/berger/Légal, ② mats de base: couloir/escalier/épaulettes, ③ classiques:
  étouffée/arabe/Boden/baiser de la mort, ④ sur le roque: h7/g7/Lolli/Damiano). Chaque fiche = diagramme
  SVG + flèches (BoardRenderer) + leçon + séquence-type; le bouton « S'entraîner » relance
  `Tactics.start(puzzles, name)` (moteur d'exos existant). **Ajouts demandés**: mat du berger, de
  l'imbécile, du couloir. Toutes les FEN de diagramme + solutions d'exos sont vérifiées hors-ligne
  par `tools/verify_mates.cjs` (16 exos, 13 diagrammes, tous verts). Les entrées « ♚ Mats classiques »
  ont été RETIRÉES de `js/tactics.js` (déplacées dans le cours) pour éviter le doublon; le sous-titre
  de la tuile « Tactiques & concepts » pointe vers l'onglet Mats. Câblage: `index.html` (loader
  endgame.js→mates.js, tab finales→mats + icône, home-hint), `app.js` (navTo/wireTabSync finales→mats,
  Endgame→Mates, handler mort `btn-open-endgame` retiré), `sw.js` (précache endgame.js→mates.js),
  `css/style.css` (bloc `.eg-*` remplacé par `.mate-*`). Vérifié en preview (menu, diagrammes, flèches,
  lancement exo, résolution clic → « ✅ Résolu — De6# »).
- UI Coach + Analyse (v147): (A) le dashboard Coach est découpé en 5 sections thématiques
  labellisées (Vue d'ensemble / Résultats & progression / Erreurs & faiblesses / Style de jeu &
  adversaires / Passer à l'action), chacune avec sa propre masonry + un panneau teinté à couleur
  d'accent (`.coach-group`, var `--grp`) → catégories nettes en desktop. Masonry re-scopée de
  `#coach-dashboard` vers `.coach-group-cards`. (B) Analyse desktop ≥1000px: la tabbar (nav) était
  un pill centré 600px qui recouvrait l'échiquier → repassée pleine largeur; `.board-sticky` plafonnée
  en hauteur pour que la bande de coups sous l'échiquier reste visible au-dessus de la nav. (C) flèche
  rouge de menace (façon Chess.com) tracée sur l'échiquier quand l'adversaire menace mat/prise/échec
  (`threatArrow` dans analysis.js; immédiat en analyse live, re-analyse Coach requise pour les rapports
  stockés).
- Séries victoires/défaites (v146): carte "📈 Bilan & tendances" du Coach → sous-section "Séries"
  = plus longue série de victoires consécutives + plus longue série de défaites, chacune avec ses
  dates (du…au…). `longestRun`/`streakRow` dans coach.js, calculé sur la cadence filtrée, app-side
  (lit `g.result`/`g.endTime`, pas de re-analyse). Une nulle interrompt une série de victoires.
- Classif alignée Chess.com FR (v145): les libellés `great`/`excellent` étaient inversés vs la
  hiérarchie Chess.com FR réelle (Brillant > **Excellent** = le `!` rare > Meilleur > **Très bien**
  = tier courant > Bon). Corrigé dans `MOVE_CLASS` (app.js) + prose (analysis.js) : `great`→"Excellent",
  `excellent`→"Très bien". En plus, `best` élargi aux coups qui égalent le n°1 à ≤8cp (`bestEquivalent`,
  analysis.js) pour ne plus sous-compter "Meilleur". Fix labels = immédiat ; `bestEquivalent` change la
  sortie stockée → re-analyse Coach complète requise pour que ça se voie dans le Coach.
- Layout desktop (v144): la carte "Tes dernières parties" gaspillait de la place (carte seule
  coincée entre 2 bandes pleine largeur dans la masonry multi-colonnes). Passée en bande
  `column-span: all` avec ses 10 lignes réparties en 2 colonnes (`.coach-recent-list`,
  `column-count: 2` en ≥720px) : 5 récentes/riches à gauche, 5 suivantes à droite. Mobile
  inchangé (1 colonne).
- Fix (v143): "Chargement du moteur Stockfish" infini sur toute analyse non-cachée (import
  chess.com one-shot inclus). Le refactor v142 avait retiré le `const chess` encore passé à
  `Analyzer.analyzeGameAsync/analyzeGame` → ReferenceError dans le try ET son catch → barre de
  progression jamais masquée. Fix = restaurer `const chess = new Chess()` avant le bloc moteur.
- Coach "Tes dernières parties" (v142): carte des 10 parties les plus récentes. Les 5 plus
  récentes embarquent un `report` complet (per-ply) dans `coach-data.json` → clic « 📊 Voir
  l'analyse » = ouverture directe dans l'analyseur détaillé, SANS relancer Stockfish. Les autres
  gardent le bouton « Analyser ici » (analyse moteur locale classique).
  - Serveur (`tools/analyze.mjs`): `RICH_RECENT=5`. `analyzeGame` renvoie désormais
    `{stats, results, summary}`; les 5 parties récentes conservent `report={analysis,summary}`
    (backfill si besoin), stripé partout ailleurs pour limiter la taille (~50 Ko/partie).
    Le report n'apparaît qu'après un run du workflow postérieur au changement.
  - Client: `App.openStoredReport(rec)` (rend via `showAnalysis` sans moteur) + `App.loadPgnAndAnalyze(pgn)`;
    dérivation PGN→{header,moves} factorisée dans `deriveHeaderMoves`. Carte + binds dans `coach.js`
    (`renderRecentGames`/`bindRecentGames`/`openRecent`). `bulkImport` conserve le champ `report`.
- Drag-and-drop des pièces façon chess.com.
- Correctness-edges + polish: cacheKey enrichi (Link/composite, plus de collision même-jour), garde deux-comptes IDB pour le Coach, puzzle accepte tout mat, SEE ep-aware, rate-limit fetch chess.com, modal aria-dialog + focus trap.
- Labels/couleurs FR façon Chess.com: Occasion manquée→Coup manqué, couleur "miss" en rouge (distincte de l'orange "erreur"). NB: le mapping great/excellent posé ici en v106 (great="Très bon") était faux, corrigé en v145 (great="Excellent", excellent="Très bien").

**Backlog / laissé de côté (à connaître avant de reprendre):**
- NON fait (gap features signalé): type de coup **Forcé**, et glyphe Excellent (✔ à passer en 👍 pour matcher Chess.com).
- Volontairement laissés: adherence-after-deviation, tactics forced-replies, profondeur item #20, accuracy=100, renderRepeated en brut.

**Notes:** Les data de coaching sont liées au compte utilisateur analysé (garde IDB deux-comptes en place). Sur un changement de correctness, prévoir une re-run complète du coach pour que ça se voie.
