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
- Prototypes/mockups (non prod): `home-redesign-mockup.html` (maquette accueil mobile, v173), `home-redesign-desktop-mockup.html` (maquette accueil desktop, v173), `mockup.html`, `redesign-mockup.html`, `openings-tree-mockup.html`, `openings-tree-visual.html`, `mon-bilan-10min.html` (bilan standalone des parties 10 min ; rafraîchi le 11/08/2026 à 53 parties, mai→11 août : 23V/29D/1N, 43% de victoires, Elo 346, 15 mats subis - stats moteur précision 84/83 & 2,2 gaffes/défaite conservées telles quelles, non recalculées sans re-run Stockfish. Données via l'API publique chess.com `nimokaji`, filtre TimeControl=600).
- `icons/`, `.github/`.

**Historique récent (du plus récent):**
- **v181 - carte Coach « Performance par ouverture »**
  - Nouvelle carte `renderOpeningPerf(an)` (js/coach.js) dans le groupe « Style de jeu & adversaires »
    (avant Profil/Répertoire). Croise tes vraies parties avec leur ouverture : regroupe par famille
    FR (`frenchOpening(g).family`), score = (V + ½N)/parties, ≥3 parties/ligne. Affiche un bandeau
    score-par-couleur (♔ Blancs / ♚ Noirs), une liste de barres classées par volume (nom · barre
    colorée vert≥55/or/rouge≤45 + % · V/D/N · nb parties), et un call-out « plus rentable / plus
    fragile ». CSS `.op-*` ajouté. Aucune donnée nouvelle nécessaire (les jeux du coach ont déjà
    `family`). Distinct de la carte « Répertoire d'ouvertures » (table + fidélité au répertoire) qui
    reste : celle-ci est la vue visuelle de perf. Vérifié preview (données réelles 134 parties) :
    ♔46%/♚43%, 7 familles, meilleure = Attaque Scholar 71%, plus fragile = Ouverture de l'Évêque 17% ;
    barres OK ; 0 erreur applicative. APP_VERSION 180→**181**.
- **v180 - échiquier de l'arbre des ouvertures agrandi**
  - User : « met le preview de l'échiquier dans l'arbre des ouvertures + gros, qu'on voie au premier
    coup d'œil ce qui se passe (sans forcément cliquer sur ouvrir) ». Le board du panneau de détail
    (`.ot-dboard`, affiché quand on sélectionne un nœud) était riquiqui : 128px desktop / 104px
    mobile / 108px paysage. Agrandi (CSS only) : desktop **128→240px**, mobile portrait (≤720)
    **104→min(78vw,300px)** (+ `.ot-detail max-height` 36vh→62vh pour lui laisser la place), petit
    paysage (≤600h) **108→min(100%,200px)** (colonne de 240). Vérifié preview : desktop 1440 → board
    240×240 (328 nœuds SVG, pièces rendues) ; mobile 390 → 300×300, pas de débordement horizontal, le
    détail ne force pas le scroll ; 0 erreur. APP_VERSION 179→**180**.
- **v179 - durcissement de la classif « Brillant » (!!)**
  - Suite du point ouvert v178 (user doute des brillants). Ancienne porte (`js/analysis.js`) trop
    laxe : `isSacrifice && (isBestMove || wpl<0.02) && winAfterPlayed>=0.50 && winBefore<=0.85` →
    se déclenchait sur des tactiques ordinaires (juste « au moins égal » après). **Nouvelle porte**
    (stricte) : `isSacrifice && !inBook && (isBestMove || bestEquivalent) && winAfterPlayed>=0.62 &&
    winBefore>=0.15 && winBefore<=0.80`. Un vrai brillant doit désormais : offrir la pièce jouée
    (SEE 1-ply net ≥2), ÊTRE le meilleur coup du moteur (ou l'égaler à ≤8cp), laisser une position
    **clairement gagnante** (≥0.62, pas juste égale), et partir d'une position **disputée** (ni déjà
    gagnée ≤0.80, ni perdue ≥0.15). Rejette les faux positifs : tactiques qui regagnent le matériel,
    pseudo-sacs sur cases défendues, « sacs » depuis une position déjà gagnée.
  - **Vérif preview** (partie de test = mat de Légal `5.Nxe5` sacrifice de dame) : `5.Cxe5` toujours
    classé **!!** (vrai sacrifice sain, meilleur coup, gagnant) ; reste de la partie classé sainement ;
    0 erreur console. APP_VERSION 178→**179**. **N'affecte que l'analyse LOCALE** (recalculée à la
    volée) : les badges/compteurs du Coach viennent des rapports serveur pré-calculés (coach-data.json)
    → inchangés tant qu'une **ré-analyse complète** n'est pas relancée (GitHub Actions « re-analyze
    ENTIRE archive », non déclenchable en CLI). `great`/`!` non touché.
- **v178 - suppression de « Tes plus beaux coups » + tailles d'échiquier uniformes partout**
  - **Section « Tes plus beaux coups » (brillants/excellents) SUPPRIMÉE** (user : « c'est pas bon,
    renvoie pas sur le bon coup »). Retiré : le groupe `'wins'`/« Tes réussites » et son unique
    carte, les fonctions `renderHighlights/renderHlTier/collectHighlights/bindHighlights` + consts
    `HL_*`, tout le CSS `.coach-hl-*` et `#coach-highlights`. **Revert complet** du plumbing « atterrir
    sur le coup » ajouté en v176/v177 (`pendingGoToIndex`, `openStoredReport(rec,opts)`,
    `loadPgnAndAnalyze(pgn,opts)`, param `atPly` d'`openRecent`) : ne servait qu'à cette section.
    `openRecent(uuid,mode)` reste (utilisé par « Tes dernières parties »).
  - **Tailles d'échiquier uniformisées** (user : « tactiques et mats tout petits »). Nouveau token
    CSS `--ex-board` (`:root` = `min(94vw,460px)` ; `@media(min-width:700px)` = `min(72vh,560px)`)
    appliqué à TOUS les échiquiers d'exercice/leçon : `.guess-board-wrap` (tactiques, mats-training,
    devine-le-coup, replay), `.train-board-wrap` (puzzles/vigilance de l'onglet Entraîner),
    `.mate-diagram` (diagrammes des leçons de mat, **était 300px** → 560), et le board desktop de la
    modale d'ouverture. Grille des puzzles Entraîner élargie en conséquence (col 520→560, side 320→300,
    tient dans 940). Les 2 media-queries `.guess-board-wrap` (66vh/70vh) retirées (le token gère).
    Board d'analyse principal laissé tel quel (height-cap ~540 + barre d'éval, volontaire).
  - **Vérif preview** : desktop 1440×900 → `--ex-board`=560, tactiques=560, diagramme mat=**560**
    (vs 300) ; fenêtre 680px → 432 chacun (vs 360/300), uniformes ; 0 erreur console. Coach : plus de
    carte « Tes plus beaux coups ». APP_VERSION 177→**178**. **Note ouverte** : user doute de la
    classif brillant/excellent (le « sacrifice » n'apporte pas toujours du mieux) - vrai point faible
    (`sacrificedOnMove` = SEE 1-ply, ne vérifie pas que le sac est accepté/gagnant dans la ligne
    moteur), à re-tuner ou retirer (nécessite une ré-analyse coach complète). Pas encore fait.
- **v177 - « Analyser ce coup » atterrit PILE sur le coup (même sans rapport serveur)**
  - Constat clé dans `coach-data.json` : seulement **5/134 parties ont un `report` serveur, 3 ont
    rapport+highlights** ; les ~80 autres parties « beaux coups » tombaient donc dans le fallback
    `engine` de `openRecent` → `loadPgnAndAnalyze(pgn)` qui **ré-analyse et se posait au coup 0**,
    jamais sur le coup brillant. (Le v176 ne réglait le saut que pour les 3 parties à rapport.)
  - Fix : mécanisme `pendingGoToIndex` dans `app.js`. `loadPgnAndAnalyze(pgn, {goToIndex})` le
    stocke ; `showAnalysis` le consomme à la fin (`goTo(target||0)` puis reset) → l'analyseur
    atterrit sur le coup une fois la ré-analyse Stockfish terminée. Même index de ply (même
    séquence de coups, quelle que soit la classif locale vs serveur). `openStoredReport` utilise
    le même canal (plus de double `goTo(0)→goTo(cible)`). Anti-fuite : `pendingGoToIndex=null` dans
    le `finally` d'`onAnalyze` si la run échoue avant `showAnalysis`. `coach.js openRecent` passe
    désormais `opts` aussi à `loadPgnAndAnalyze`.
  - Vérifié preview (localhost:3456) : chemin rapport → carte active `6.dxc4 !` / `16.Dxf3 !` (pile
    sur le coup) ; ré-ouverture sans cible → coup 0 (pas de fuite) ; chemin moteur (mat du berger,
    ré-analyse réelle ~13 s) → atterrit sur `4.Dxf7# ★`. 0 erreur console. APP_VERSION 176→**177**.
- **v176 - Coach « Tes plus beaux coups » : layout desktop + coup ouvrable dans la partie**
  - Problème : sur desktop la carte `#coach-highlights` était un seul item de la masonry
    `column-count` (2/3/4 col) de la section « Tes réussites », donc coincée dans UNE colonne
    étroite (~1/4 de la largeur) avec tout le reste de la section vide → galerie de mini-échiquiers
    en colonne « en longueur », illisible. Et les échiquiers n'étaient pas cliquables : impossible
    d'ouvrir le coup dans son contexte pour juger si l'étiquette « Brillant/Excellent » est méritée.
  - Fix layout : `#coach-highlights` ajouté à la liste `column-span: all` (comme `#coach-recent-games`)
    → il occupe toute la largeur de la section. Override desktop de `.coach-hl-gallery` en tuiles
    fixes `repeat(auto-fill, minmax(180px, 210px)) + justify-content:start` → les coups s'alignent
    en rangées (5/rangée à 1600px, 2-3 à 1000px) au lieu d'une pile verticale. Vérifié en preview
    (harness `_hl_test.html`, supprimé) : `columnSpan:all`, hlWidth = pleine largeur, tuiles 210px.
  - Fix « challenger la classification » : chaque figure devient `role=button tabindex=0` avec
    `data-uuid/data-mode/data-ply`, curseur pointer, hover (lift + bordure accent) et CTA
    « 🔍 Analyser ce coup dans la partie ». Clic/Entrée → `openRecent(uuid, mode, ply)`.
    `openRecent` accepte un `atPly` optionnel ; `App.openStoredReport(rec, {goToIndex: ply+1})`
    fait un `goTo(ply+1)` après `showAnalysis` → l'analyseur s'ouvre PILE sur le coup (surligné,
    verdict moteur affiché) pour les parties avec rapport serveur ; sinon fallback ré-analyse Stockfish.
- **v175 - item Vigilance ajouté à la routine du jour**
  - Le seul drill distinct de la tactique (repérer les pièces en prise) n'avait pas d'item alors
    que « ne rien laisser en prise » est priorité n°1 du pied de carte. Ajout de `🛡️ Vigilance -
    pièces en prise` en tête de `ROUTINE_ITEMS`, action `'vigilance'` → `Training.show('vigilance')`
    (show accepte désormais un onglet cible optionnel). Routine = 4 items, anneau `/4`.
- **v174 - fusion des 2 items redondants de la routine du jour**
  - `🧩 Puzzles tactiques` et `🛡️ Réviser mes erreurs` ouvraient tous deux `Training.show()` →
    onglet Puzzles, qui EST déjà la répétition espacée de tes erreurs. Doublon. Item `srs` retiré,
    gardé un seul `Puzzles tactiques (tes erreurs)` avec le badge SRS "à réviser" reporté dessus.
    Routine = 3 items (puzzles/review/rapide), anneau `/3`. (L'exercice réellement distinct =
    l'onglet Vigilance, non mis en item ; `Training.show()` n'accepte pas d'onglet cible.)
- **v173 - REFONTE UI : accueil "hub" + système visuel + sidebar desktop**
  - Demande user : « pas fan de l'écran d'accueil et de pas mal de choix d'UI » (garde le Coach,
    les échiquiers, l'arbre). Validé sur 2 maquettes autonomes (`home-redesign-mockup.html` mobile
    + `home-redesign-desktop-mockup.html` desktop), puis implémenté pour de vrai.
  - **Système visuel** : tokens `:root` retravaillés en profondeur (mêmes couleurs, navy + or) :
    `--bg #12172b`, `--bg-card #1a2140`, `--bg-elevated #212a4d`, `--text #eef1f7`,
    `--text-dim #9aa4bd`, `--radius 16px` + nouveaux tokens `--bg-2 #0e1223`, `--card-2`,
    `--line`/`--line-str`, `--blue #5b8fb9`, `--dim-2`, `--side-w 236px`. `body` prend un dégradé
    radial doux. Comme les composants existants utilisent ces tokens, TOUT est repeint (coach,
    analyse, arbre inclus - logique inchangée). `theme-color` meta → `#12172b`.
  - **Accueil refait en hub** (`#screen-import`, ex gros textarea en pointillés) : app bar
    (marque ♟ + « Bonjour / Prêt à progresser ? » + streak), **hero Analyser** (carte dégradée :
    textarea + bouton or pleine largeur + hint drop), carte **Reprendre** (dernière partie, avec
    **mini-échiquier réel** = position finale via `Chess.load_pgn`+`BoardRenderer.render`), **routine
    du jour** avec **anneau de progression** SVG (done/total), **accès rapides** (tuiles Entraîner
    /Coach/Arbre/Apprendre, badge SRS), **parties récentes**. Tous les hooks JS existants conservés
    (`#pgn-input`, `#btn-analyze`, `#drop-zone`, `#routine-list`, `#recent-list`, `#home-hint`…).
  - **Desktop (≥1000px)** : la **tabbar du bas devient une sidebar gauche** (236px, marque en haut,
    onglets en lignes, barre d'accent à gauche de l'actif) via media query ; `body{padding-left}`
    décale tous les écrans (vérifié : coach/apprendre/entraîner/analyse ne passent jamais sous la
    sidebar, 0 débordement). L'accueil devient un **dashboard 2 colonnes** (`.home-main` en grid :
    hero pleine largeur, reprendre+récentes à gauche, routine+accès rapides à droite) ; état "aucune
    partie" retombe en colonne unique centrée via `:not(:has(#recent-section:not([hidden])))`.
    720-999px = mode tablette inchangé (pill centrée en bas).
  - **JS** (`js/app.js`) : `renderRoutine` calcule l'anneau (`#rr-num`/`#rr-fill` dashoffset) ;
    `loadRecent` appelle `renderResume(games[0])` + `bindHome()` (once) ; `renderResume` rend la
    carte Reprendre + mini-board ; `bindHome` câble le clic Reprendre (→ `onAnalyze`) et les tuiles
    accès rapides (`data-nav` → `navTo`, 'tree' → `showLearn()`+`_openPanel('tree')`) ;
    `refreshHome` alimente aussi `#quick-train-badge`.
  - Vérifié en preview (mobile 375 + desktop 1300) avec données injectées : dashboard 2-col,
    mini-échiquier réel (110 nœuds SVG), navigation entre écrans OK, 0 erreur applicative
    (seules erreurs = enregistrement SW sous `http.server`, inoffensif). APP_VERSION 172→**173**.
- **v170→172 - mode « Rejoue ta défaite » (jeu contre Stockfish depuis une gaffe, commenté)**
  - Nouveau module `js/replay.js` (`Replay.start(entry)` / `Replay.close`), sur la coquille
    `.guess-*` comme `tactics.js`/`mates.js`. Depuis une partie analysée, on reprend la main à
    `fenBefore` d'une de tes gaffes et on **rejoue la position CONTRE Stockfish** : tu glisses ton
    coup (drag, comme l'explorateur d'ouverture - pas de clic-clic), l'ordi répond automatiquement
    son meilleur coup, et un **commentaire du coach** apparaît à chaque coup.
  - **Commentaires** (réutilise les helpers de `analysis.js`, désormais exportés :
    `explainBadMove` + `detectForkAfterMove`). Intro au coup de la gaffe (ce que tu avais joué +
    le tip + la meilleure suite). Verdict de chaque coup par perte de centipions vue de ton camp,
    calé sur la classif de l'app : ✅ Parfait (= meilleur coup) / 👍 Précis (≤20cp) / 🟡 Imprécision
    (≤50) / 🟠 Erreur (≤120) / 🔴 Gaffe (>120) ou « permet un mat forcé », enrichi par
    `explainBadMove` (« tu rends le fou », « fourchette sur roi et tour »). Réplique de l'ordi
    décrite (prise / échec / mat). Éval live au point de vue des Blancs + flèche bleue du meilleur
    coup à ton trait. Boutons ↶ Annuler / ⟳ Recommencer / ✕ Quitter. Détection mat/pat/nulle.
  - **Deux zones de commentaire** (correctif clé) : le **verdict** de ton dernier coup (+ la réplique)
    PERSISTE, tandis qu'une ligne de **statut** (trait courant + éval) se rafraîchit ; sinon le prompt
    du tour suivant écrasait instantanément la sanction et tu ne la lisais jamais.
  - **Points d'entrée** (`▶ Rejoue …`) : bulle du coach de l'écran Analyse (sur chacune de TES
    erreurs, via `updateReplayCta` dans `goTo`), carte « Le tournant » (`buildTurningPoint`), et côté
    Coach les cartes « Rejoue tes erreurs partie par partie » (rejoue la gaffe la plus coûteuse) et
    « Conversion & moments charnières » (le tournant). GuessMove (devine le coup) reste en parallèle.
  - Vérifié : logique d'échecs headless chess.js (14/14 : signes meScore/cpLoss, verdicts, légalité,
    helpers exportés, détection mat/fourchette) ; puis bout-en-bout en preview avec le vrai moteur
    (overlay + flip + intro dédoublonnée, flèche bleue + éval, mat du berger → verdict « permet un
    mat » + « Dxf7# » + fin de partie, g6 → « Erreur (-103cp) » qui coexiste avec le statut du tour
    suivant, Annuler/Recommencer/Quitter, boutons présents sur la carte tournant + bulle coach d'une
    vraie partie analysée). 0 erreur console. APP_VERSION 169→**172** (3 bumps : SW cache-first).
- **v169 - échiquier sur TOUS les onglets de cours + cours Scandinave & Londres + Mats déplacé dans Apprendre**
  - **Board partout** (`js/app.js`) : helper `freezeBoardOnTabiya()` (charge la ligne, fige sur la
    tabiya, `controlsEl.hidden`, `boardActive=false`, `explEl.hidden`). `renderPlans`, `renderPieges`,
    `renderTranspo` ET `renderQuiz` l'appellent → l'échiquier reste visible sur les 6 onglets de la
    modale de cours (avant : Plans/Pièges/Transpo/Quiz le masquaient).
  - **2 nouveaux cours 🎓** (`js/courses.js`) : **Scandinave** (`'e4 d5 exd5 Qxd5'`, 3 lignes Da5/Dd6/Dd8,
    drill Cb5 fourchette c7, 3 pièges, 3 transpo, 3 quiz) et **Système de Londres** (`'d4 d5 Bf4'`, 3 lignes
    principal/…Ff5/…c5+Db6, drill Ce5→dxe5 fourchette de pion sur d6+f6, schéma d'attaque Ce5/Fd3/Dc1-h6,
    3 quiz). Toutes les `sans` + les 2 FEN/sol de drill **vérifiés chess.js** (script node jetable).
    Comme les fiches OPENINGS existent déjà pour ces lignes, `openOpeningByLine` ouvre direct en mode cours.
  - **Mats déplacé** : l'onglet **Mats** de la barre du bas est supprimé (`index.html`) ; il devient une
    tuile 👑 dans le hub **Apprendre** (`data-panel="mats"`, handler spécial dans `showLearn` → `Mates.show()`).
    `wireTabSync` : `Mates.show` surligne désormais l'onglet **Apprendre** (plus 'mats'). Branche morte
    `navTo('mats')` retirée, home-hint mis à jour (+ em dash → tiret).
  - Vérifié en preview (localhost:3456, SW purgé) : v169, barre du bas = analyser/coach/apprendre/entrainer
    (plus de mats), tuile Mats dans Apprendre ouvre l'overlay en gardant l'onglet Apprendre actif ; les 2 cours
    ouvrent les 6 onglets avec board visible partout, 3 lignes chacun, drill « Essayer ce coup » lance Tactics ;
    0 erreur console. `node --check` OK sur app.js/courses.js/board.js.
- **v168 - curseur main fermée au drag + échiquier gardé dans l'onglet Transpositions**
  - `js/board.js` (`enableDrag`) : au survol d'une pièce jouable le curseur passe en `grab` (main
    ouverte) et pendant le glisser-déposer en `grabbing` (main fermée), réinitialisé au `cleanup`.
    Feedback drag-and-drop plus clair.
  - `js/app.js` (`renderTranspo`) : l'onglet « 🔀 Transpositions » de la modale de cours ne masquait
    plus le board (`setBoardVisible(false)` comme Plans/Pièges/Quiz). Il **garde maintenant l'échiquier
    visible**, figé sur la tabiya, pour donner le contexte des lignes alternatives.
- **v167 - explorer les variations d'ouverture depuis n'importe quel coup + coup théorique indiqué**
  (`js/app.js`, modale `#opening-modal`) : le mode « Continuer à jouer » (analyse libre, v164) n'était
  proposé qu'à la **fin** de la ligne. Maintenant on peut **reprendre la main à n'importe quel coup** :
  bouton « 🔍 Continuer à jouer d'ici » affiché à chaque pas (`renderStep`, gate `!exploring && boardActive`)
  **et** glisser-déposer directement une pièce sur une position théorique (auto-branche : `_exCanMove` =
  `exploring || boardActive`, `_onExploreMove` entre en explore depuis `idx` si besoin). Pendant l'exploration,
  on **suit la théorie** : `exStartIdx` = point de reprise, `bookInfo()` compare la suite jouée (`exHist`)
  à la ligne d'ouverture (`positions`) → dit si on est **encore dans la théorie** et quel est le coup attendu.
  Affichage clair (`bookLineHtml`) : encadré vert « 📖 Coup théorique : 3.Cf3 (flèche verte) » tant qu'on
  suit la ligne, encadré rouge « 📖 Hors théorie. La ligne jouait X ici » dès qu'on dévie, « Fin de la théorie
  répertoriée » au bout. Le **coup théorique est aussi dessiné en flèche verte** (`exBookArrow`) en plus de
  la flèche bleue du moteur (`drawExploreArrows` compose les deux, verte au-dessus). Logique `bookInfo`
  vérifiée headless avec chess.js (on-book/déviation/fin de ligne). CSS `.oe-book-move`/`.oe-book-dev` ajouté.
- **v166 - menaces fourchettes en flèches + liens Chess.com de l'arbre corrigés** :
  - **Fourchettes montrées avec des flèches** (`js/analysis.js`) : `detectForkAfterMove` renvoie
    désormais `{ names, squares, forkSquare }` (avant : juste les noms) pour pouvoir tracer une flèche
    vers chaque pièce attaquée. Quand **le meilleur coup adverse est une fourchette**, la menace est
    dessinée : flèche rouge pleine sur le coup + une **branche rouge clair** (`#f0938a`, w4) du point de
    fourchette vers chacune des pièces visées, et le tip dit « ⚠ Fourchette ! … attaque à la fois X et Y ».
    Bonus : quand **le coup du joueur** fait lui-même une fourchette, on trace des **rayons dorés**
    (`#f0c96b`) vers les pièces fourchées. Détecteur vérifié headless (fourchette royale du cavalier →
    bonnes cases ; 1 seule pièce touchée → null). Tout passe par `drawArrows` v165 donc rendu façon Chess.com.
  - **Liens « Voir sur Chess.com » de l'arbre d'ouvertures corrigés** (`js/opening-tree.js`) : sur les
    64 slugs `cc:`, **21 étaient cassés** (redirigeaient 302 vers le hub au lieu d'ouvrir la fiche). Tous
    revérifiés en live (200 = fiche existe, 302 = cassé) et remappés vers le slug canonique Chess.com,
    ex. `Italian-Game-Giuoco-Piano`→`Giuoco-Piano-Game`, `Evans-Gambit`→`Giuoco-Piano-Game-Evans-Gambit`,
    `Ruy-Lopez-Opening-Schliemann-Defense`→`…-Jaenisch-Gambit`, `Sicilian-Defense-Rossolimo-Variation`→
    `Sicilian-Defense-Nyezhmetdinov-Rossolimo-Attack`, `Sicilian-Defense-Closed`→`Closed-Sicilian-Defense`,
    `Tennison-Gambit`→`Reti-Opening-Tennison-Gambit`, `Vienna-Game-Vienna-Gambit`→`…-Falkbeer-Vienna-Gambit`,
    etc. (Pianissimo et Knight-Attack sans fiche dédiée → repli sur la fiche parente valide). **Re-check
    final : 63/63 slugs uniques renvoient 200.** Méthode : `curl` avec UA navigateur, 200 vs 302.
- **v165 - flèches « façon Chess.com » partout** : `drawArrows` dans `js/board.js` refait. Shaft en
  `<path>` épais à jointures/bouts arrondis (`stroke-linejoin/linecap:round`) + tête (marker) large et
  nette dont la taille est proportionnelle à l'épaisseur du trait (une tête par couple couleur+width,
  `markerUnits=userSpaceOnUse`). **Coude en L pour les cavaliers** : déplacement détecté par
  Δcol/Δrow ∈ {1,2}/{2,1} → 2 segments perpendiculaires, **longue jambe d'abord** puis courte jambe
  vers la cible (tête sur la courte jambe), comme Chess.com. Tail rentré du centre (0.28·SQ), tip
  reculé d'une longueur de tête. Case→même case = anneau conservé. API `drawArrows`/`drawArrow`/
  `clearArrows` inchangée (coords viewBox 0-360), donc **tous les appelants mis à jour d'un coup** :
  analyse (vert meilleur coup, rouge menace), exploration entraînement + explorateur d'ouverture
  (bleu), tactiques/mats, devine-le-coup, vigilance. Couleurs conservées (#56b886/#5b8fb9/#d36b6b).
  Vérifié headless (board.js chargé sous node) : droit=2 sommets, cavalier=3 sommets (elbow
  longue-jambe-first), têtes 22.8×26.4 (w7) / 20.4×23.2 (w6), même-case=cercle.
- Ouvertures : arbre + catalogue étoffés, cours 2 colonnes, check-list (v159→161) :
  - **Arbre des ouvertures** (`js/opening-tree.js`) bien plus exhaustif - passé de ~40 à **89 nœuds**.
    Ajout des variantes demandées et de leurs sous-lignes : **Italienne** → Giuoco Piano (variante
    centrale 4.c3 / Pianissimo 4.d3 / **Gambit Evans** accepté+décliné) et **Deux Cavaliers** (attaque
    Cg5 → Polerio + Traxler, Max Lange, variante lente) + Défense hongroise ; **Espagnole** → Morphy
    (système fermé, Marshall, échange), Berlin, Steinitz, Schliemann ; **Écossaise** → partie
    (classique/Schmidt) + gambits Écossais/Göring ; **Gambit du Roi** (accepté/décliné/Falkbeer) ;
    **Viennoise** (2…Cf6 + gambit viennois, 2…Cc6) ; **Sicilienne** (classique + Alapin/fermée/
    Rossolimo) ; côté 1.d4 : GDR classique/Tarrasch/échange, Slave acceptée/Semi-Slave, Nimzo
    classique/Rubinstein, **Est-indienne** (classique/Sämisch) séparée de la **Grünfeld**, Benko,
    contre-jeu …c5 vs Londres. Tous les FEN et appLine **vérifiés par chess.js** (script node ad hoc).
    Un FEN pré-existant cassé du Gambit du Roi (rangée à 9 pions) corrigé au passage.
  - **Catalogue de détection** (`js/openings.js`) : +~25 lignes nommées (Marshall, échange espagnol,
    Evans accepté/décliné, Deux Cav. Cg5/Traxler/Polerio/Fegatello, hongroise, gambit Écossais,
    Falkbeer, gambit viennois…) ; label « Slave — semi-Slave » erroné corrigé en « Slave acceptée ».
  - **Catalogue explorable** (`OPENINGS` dans `js/app.js`) : ajout des fiches complètes **Giuoco Piano**,
    **Gambit Evans**, **Défense des deux cavaliers** (les 3 exemples cités par l'user) pour que le bouton
    « Ouvrir dans Chess Analyst » de l'arbre ouvre une vraie fiche cours plutôt que la liste.
  - **UI cours d'ouverture desktop 2 colonnes** : la modale `#opening-modal` était une colonne verticale
    cappée à 760px (échiquier ~460px, beaucoup de vide latéral). Restructurée en `.opening-modal-main`
    (`.opening-modal-left` = échiquier + contrôles, sticky ; `.opening-modal-right` = onglets, texte,
    éval, détails). CSS : à `min-width:900px` → **flex-row, échiquier `min(70vh,600px)` (~504px) à gauche,
    texte à droite** ; sous 900px ça re-empile comme avant (board `min(52vh,88vw,460px)`). En-tête pleine
    largeur au-dessus. Piège CSS résolu : l'override de taille du board doit être plus spécifique
    (`.opening-modal-left .opening-modal-board svg`) sinon la règle de base 52vh gagnait par ordre source.
  - **« Mon répertoire » supprimé** (tuile + `#panel-repertoire` + `js/repertoire.js` retiré du chargeur)
    et remplacé par **« Ouvertures à connaître »** (`#panel-checklist`, `renderChecklist()` dans app.js) :
    check-list de l'essentiel niveau ~300-900 (réflexes, 1.e4 blancs, réponses à 1.e4 / 1.d4, pièges),
    **cochable et persistante** (localStorage `ca_checklist_v1`, barre de progression, reset), chaque item
    a un bouton **« Explorer ↗ »** qui ouvre la fiche du catalogue (`openOpeningByLine`).
  - Vérifié en preview (localhost:3456) : 89 cartes d'arbre, modale 2 colonnes (desktop board 504 /
    droite 642 ; mobile 375px → empilé, board 330), check-list 15 items/5 groupes/8 liens Explorer +
    persistance, les 3 nouvelles fiches présentes dans la liste Ouvertures, aucune erreur console.
    APP_VERSION 158→**161**.
  - **v164 - « Continuer à jouer » (analyse libre) dans l'explorateur d'ouverture** : à la fin de la
    séquence d'ouverture, un bouton « 🔍 Continuer à jouer (moteur) » lance un mode analyse libre (comme
    l'exploration post-puzzle de l'entraînement, v156) : on joue les 2 camps par glisser-déposer, Stockfish
    dessine son meilleur coup (flèche bleue) + éval relative aux Blancs + suite PV en FR, avec Annuler /
    Départ / Revenir à l'ouverture. Implémenté dans `openOpeningExplorer` (`js/app.js`) : état
    `exploring`/`exHist`, `enterExplore`/`renderExplore`/`exploreMove`/`analyzeExplore`, `enableDrag` lié
    **une seule fois** au board svg via des refs mutables (`svg._exGetFen/_exCanMove/_onExploreMove`). Ajout
    d'un overlay de flèches `#opening-modal-arrows` (le `.opening-modal-board` devient un conteneur carré
    `position:relative`, les 2 svg en `position:absolute inset:0`). Marche dans l'explorateur plat ET la
    section « Lignes » des cours. Vérifié preview : bouton à la fin, coup joué → flèche bleue + « Éval +1.3,
    Meilleur : Dd6, Suite : Dd6 Cf3 », Annuler/quitter OK, board 504px overlay aligné, 0 erreur.
    APP_VERSION 163→**164**.
  - **v163 - Réti étoffé + Gambit Tennison** : le nœud Réti (1.Cf3) n'avait pas de variantes ; ajout de
    1…d5 → {Gambit Réti 2.c4, système fianchetto 2.g3, **Gambit Tennison 2.e4** → accepté 2…dxe4 3.Cg5}
    et 1…Cf6 symétrique (arbre 89→**95 nœuds**). Détection (`js/openings.js`) : Tennison ajouté dans les
    **2 ordres de coups** (1.Cf3 d5 2.e4 = A06, et 1.e4 d5 2.Cf3 = B01) + accepté. FEN/appLine vérifiés.
    APP_VERSION 162→**163**.
  - **v162 - échiquiers des exercices agrandis** : la coquille de drill `.guess-panel` / `.guess-board-wrap`
    (partagée par les tactiques, le cours des Mats, les drills « Essayer ce coup » des ouvertures et
    « Devine le coup ») était cappée à 460px/**360px** et perdue au milieu du vide sur desktop. Ajout d'un
    `@media (min-width:700px)` dans `css/style.css` : panneau 680px, board `min(66vh,560px)` (et
    `min(70vh,620px)` si hauteur ≥780), prompt centré. Vérifié : 1280×720 → board **475**, 1440×900 →
    **620** (contre 360 avant) ; mobile inchangé (360). APP_VERSION 161→**162**.
- Refonte layout Analyse desktop (v158): en vue desktop (grille 2 colonnes ≥1000px) l'échiquier
  gonflait jusqu'à ~545px, ce qui poussait la **barre de coups (move-strip) sous le pli**, derrière la
  tabbar - il fallait dézoomer pour voir les coups ; et la colonne de droite restait à moitié vide sous
  la carte Conseil. Corrigé dans `css/style.css` (bloc `@media (min-width:1000px)`) + `js/app.js` :
  (1) l'échiquier est plafonné par la hauteur dispo - `.board-wrapper { width: min(540px, calc(100vh -
  280px)) }` - donc board + player-bars + move-strip tiennent toujours au-dessus de la tabbar (plus de
  scroll interne sur `.board-sticky`, `overflow: visible`, ce qui dé-clippe aussi la barre d'éval à
  gauche) ; (2) la **bulle du coach (verdict)** est déplacée en haut de la colonne de droite sur desktop
  (elle reste dans l'en-tête collant du board sur mobile) - `layoutCoachReview()` relocalise le nœud
  selon `matchMedia('(min-width:1000px)')` car la grille ne place que les enfants directs ; (3) tabs
  segmentés étirés à la largeur de colonne, gouttières resserrées. Vérifié par mesures en preview :
  1280×800 → board 496, move-strip bottom 709 < tabbar 738 (visible), coach en colonne droite ;
  1280×720 → board 416, strip 629 < 658 (visible). Mobile inchangé (CSS scoping + relocation JS).
  APP_VERSION 157→158.
- Cours d'ouverture Viennoise (v153): ajout d'une entrée `'e4 e5 Nc3'` dans `js/courses.js` (même
  structure que l'Italienne/l'Espagnole), donc l'explorateur ouvre désormais la Viennoise en **mode
  cours** (6 onglets : Présentation / Lignes / Plans / Pièges / Transpositions / Quiz + badge 🎓 Cours).
  3 lignes rejouables (Gambit 3.f4 avec la parade …d5, Classique 3.Fc4, Fianchetto 3.g3), notes par
  coup ; 3 pièges (2 drills jouables : « Gambit accepté → e5 » et « 3…Cxe4 → Dh5 » ; 1 texte : la
  règle …d5) ; 3 transpositions ; 3 questions de quiz. Tous les `sans` et les fen+sol des drills sont
  chess.js-validés (node). Demande user (c'est l'ouverture qu'il joue le plus). Vérifié en preview :
  cours ouvert (6 onglets), Lignes rejouable (3 lignes + nav), Pièges → drill lance Tactics avec le bon
  titre/board, 0 erreur console. APP_VERSION 152→153.
- Panneaux "reading" pleine page + Viennoise (v152): (A) les rubriques de l'onglet Apprendre
  **Comment ça marche ? / Notation des échecs / Guide d'utilisation** s'ouvraient en tiroir latéral
  étroit (`max-width:420px`) → la table Type/Critère/Définition débordait et la colonne Définition
  était coupée. Corrigé : ces 3 panneaux reçoivent `panel-wide panel-read` (index.html) → **pleine
  page**, avec le contenu centré dans une colonne lisible (`max-width:900px`) et `overflow-x:auto` sur
  `.info-content` (les tables larges scrollent dans la colonne au lieu d'être coupées, y compris en
  mobile). CSS `.panel-read` ajouté après `.panel.panel-wide`. Vérifié : desktop 1280 → panneau 1265px,
  colonne 900 centrée, Définition entièrement visible ; mobile 375 → table scrolle, pas de débordement
  de page. (B) **Ouverture Viennoise ajoutée** (1.e4 e5 2.Cc3) : nœud dans l'arbre des ouvertures
  (`js/opening-tree.js`, frère de 2.Cf3/2.f4, FEN chess.js-validée, idea+plans, slug cc `Vienna-Game`
  vérifié 200) + entrée riche dans le catalogue `OPENINGS` (`js/app.js`, `line: 'e4 e5 Nc3'`, desc/idea/
  plans/structure/mistakes/deviations) → clic dans l'arbre ouvre bien l'explorateur Viennoise (pas le
  fallback). Demande user (il joue souvent e4 e5 Cc3 et ne le trouvait pas). **GOTCHA rappel** : le SW
  est cache-first sur `?v=` — j'ai dû bumper 151→152 (les edits opening-tree.js/app.js faits APRÈS que
  v151 ait été mis en cache pendant la vérif du panneau étaient servis périmés).
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

- v154 — deux ajouts orientés "montrer les coups" :
  1. **Entraînement (puzzles)** : le contexte de partie nomme désormais l'adversaire et la date
     ("Coup N · tu avais joué X lors de ta partie contre Y le 12 mai 2024"). Helpers `formatCardDate`
     + `opponentName` + `puzzleContextHtml` dans `js/training.js` ; l'adversaire = couleur non jouée,
     date PGN `YYYY.MM.DD` → FR.
  2. **Coach — carte "✨ Tes plus beaux coups"** (`renderHighlights`/`bindHighlights`/`collectHighlights`
     dans `js/coach.js`, groupe `wins`) : galerie de mini-échiquiers des coups **brillants** et **très bons**
     (BoardRenderer.render du `fenBefore` + surbrillance du coup joué), badge + `vs adversaire · date` + tip.
     Source des positions = `analysis.highlights` (nouveau, ajouté à `computeGameStats` dans `js/analysis.js`,
     stocké comme `blunderList`) OU dérivé du `report.analysis` des 5 parties riches. Les parties qui n'ont
     que des compteurs agrégés (pas encore ré-analysées) tombent dans une liste "à voir" avec bouton 👁
     (ouvre la partie via `openRecent`). CSS `.coach-hl-*` dans `style.css`.
     ⚠️ La galerie complète pour TOUTES les parties passées nécessite une **re-run Coach** (workflow
     GitHub Actions, non déclenchable en CLI) car les brillants n'étaient pas stockés per-move avant v154 ;
     les 5 brillants "rapide" de Simon apparaissent immédiatement dans la liste "à voir".

- v155 — **fix confusion libellés + carte beaux coups scindée en 2 tiers**. (1) Le libellé du coup
  `!` (`great`) était incohérent : « Excellent » dans l'analyseur/les commentaires moteur mais « Très
  bon » dans le Coach + ma galerie (badge « Très bon » AVEC un tip « Excellent ! » = contradiction).
  Unifié sur le canonique (= MOVE_CLASS app.js, aligné Chess.com FR) : `great`=**Excellent** (!),
  `excellent`=**Très bien** (✔). Corrigé dans `coach.js` renderMoveQuality + HL_META + EVO_META
  (`strong` renommé « Coups forts » car brillant+excellent combinés) et `app.js` stat-pills. (2) Carte
  « Tes plus beaux coups » scindée en 2 sections `renderHlTier` : **!! Brillants** et **! Excellents**,
  chacune galerie d'échiquiers (si data per-move) + liste « à voir » (bouton 👁). Fini les échiquiers
  Excellent sous un titre brillants. ⚠️ Toujours : les brillants de Simon (5 rapide + 9 daily) n'ont pas
  de position stockée → ils sont dans la liste 👁 (re-run Coach FULL requise pour les échiquiers).

- v156 — **mode exploration après un puzzle résolu** (`js/training.js`). Une fois le puzzle résolu,
  bouton « 🔍 Continuer à jouer » (masqué si la position est déjà terminale) → mode analyse libre :
  l'échiquier redevient jouable (n'importe quel coup légal, les deux camps), Stockfish trace son
  meilleur coup (flèche bleue) et affiche une éval en direct (relative aux Blancs) + la suite en FR.
  Fonctions `enterExplore`/`renderExplore`/`exploreMove`/`analyzeExplore`/`exploreStatusHtml`/
  `fmtEvalWhite` ; état `exploreHist` (pile pour Annuler/Départ) ; le moteur est réveillé à la
  demande (StockfishEngine.init si pas prêt). Les boutons de notation SRS (À revoir/Bon/Facile)
  restent dispo et terminent l'exploration. Binding notation factorisé dans `bindGradeButtons`
  (partagé entre carte résolue et mode explore). Seed = position après le meilleur coup (afterFirstFen).
  Vérifié en preview : reveal → Continuer → coup g7g6 (trait passe aux Blancs) → Annuler → Départ →
  notation avance au puzzle suivant ; éval/flèche/PV OK (moteur fonctionnel sous npx serve). CSS
  `.train-feedback.explore`. APP_VERSION 155→156.
- v157 — **contexte des puzzles enrichi du résultat + de la cadence** (`js/training.js`, `js/coach.js`).
  La ligne de contexte d'un puzzle d'entraînement affiche désormais, après l'adversaire et la date,
  le résultat vu du joueur (**victoire / défaite / partie nulle**) et la **cadence** (rapide /
  journalière), ex. « ... le 12 mai 2024 · **défaite** · partie rapide ». Nouveaux champs `result`
  (win/loss/draw) + `timeClass` (rapid/daily/…) stockés sur chaque carte : dérivés de l'en-tête PGN
  côté analyseur simple (`deriveResult(header.Result, side)` + `deriveTimeClass(header.TimeControl)`
  dans `capture`) et passés depuis la partie d'archive côté Coach (`g.result`, `g.timeClass` via
  `ingestGame`/`syncToTraining`). Ajoutés à `MUTABLE` → backfill des vieilles cartes à la prochaine
  ré-analyse/ingestion. Libellés `RESULT_FR`/`CADENCE_FR`. Vérifié en preview via `Training.capture`
  (item stocké result=loss/timeClass=rapid) + rendu réel de l'onglet Entraîner. APP_VERSION 156→157.

**Backlog / laissé de côté (à connaître avant de reprendre):**
- NON fait (gap features signalé): type de coup **Forcé**, et glyphe Excellent (✔ à passer en 👍 pour matcher Chess.com).
- Volontairement laissés: adherence-after-deviation, tactics forced-replies, profondeur item #20, accuracy=100, renderRepeated en brut.

**Notes:** Les data de coaching sont liées au compte utilisateur analysé (garde IDB deux-comptes en place). Sur un changement de correctness, prévoir une re-run complète du coach pour que ça se voie.
