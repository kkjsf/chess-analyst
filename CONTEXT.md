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
- `js/`, `css/` - logique et styles. `js/app-scripts.js` = LISTE des scripts, source unique
  lue par `index.html` et par `sw.js` (elles avaient divergé). `js/freeplay.js` = fond commun
  du mode « Continuer a jouer ». Le worker Stockfish est dans `js/vendor/` (le build wasm
  resout `stockfish.wasm` relativement au worker).
- `sw.js`, `manifest.json` - PWA.
- `coach-data.json` - contenu de coaching généré (~680 KB). Certains items de correctness ne se reflètent qu'après une RE-RUN complète du coach.
- `tools/test_core.cjs` - 39 tests unitaires du coeur logique (`node tools/test_core.cjs`,
  ou `npm test` dans `tools/`). Tourne aussi en CI avant l'analyse serveur.
- `tools/` - scripts utilitaires. Chaîne de contenu des leçons (v184) : `mine_lichess.cjs`
  (streame `lichess_db_puzzle.csv.zst`, gitignoré, → pool JSONL) → `pick_lichess.cjs` (choisit les
  exercices par motif : thème + motif visible + gain qui tient) → `inject_puzzles.cjs` (audite
  l'existant et réécrit les tableaux `puzzles` des catalogues, rejouable). Vérification moteur :
  `sf.cjs` + `verify_lessons.cjs` (`DEPTH=14 node tools/verify_lessons.cjs [mates|tactics]`).
  Ne JAMAIS lancer deux process Stockfish asm.js en parallèle (ils s'affament).
- **`_mockups/opening-course-mockup.html` (2026-08-19)** - maquette INTERACTIVE proposant de
  remplacer les 6 onglets du cours d'ouverture (Presentation / Lignes / Plans / Pieges /
  Transpositions / Quiz) par l'ARBRE des variantes comme navigation, chaque noeud portant tout
  ce qui le concerne. Repond a 4 reproches du user : la fourche disparait, redondances
  (`Transpositions[0]` = `Lines[0]` = la meme branche), sous-menus opaques, espace mal utilise
  (mesure : colonne droite remplie a 32-42 % sur Plans/Transpo/Quiz a 1400x900, contre 82 %
  en moyenne dans la maquette). Contenu reel de l'Italienne, 11 noeuds, positions calculees.
  NON implemente. Pre-requis identifie : ajouter un champ `parent` aux traps/quiz pour les
  raccrocher a leur branche, et faire exporter ses noeuds a `js/opening-tree.js` (il n'expose
  que `render`, d'ou une 3e representation des memes ouvertures).
- Prototypes/mockups (non prod), tous deplaces dans `_mockups/` en v186: `home-redesign-mockup.html` (maquette accueil mobile, v173), `home-redesign-desktop-mockup.html` (maquette accueil desktop, v173), `mockup.html`, `redesign-mockup.html`, `openings-tree-mockup.html`, `openings-tree-visual.html`, `mon-bilan-10min.html` (bilan standalone des parties 10 min ; rafraîchi le 11/08/2026 à 53 parties, mai→11 août : 23V/29D/1N, 43% de victoires, Elo 346, 15 mats subis - stats moteur précision 84/83 & 2,2 gaffes/défaite conservées telles quelles, non recalculées sans re-run Stockfish. Données via l'API publique chess.com `nimokaji`, filtre TimeControl=600).
- `icons/`, `.github/`.

**Historique récent (du plus récent):**
- **v185-v190 - Revue de code complète : 21 constats, tous corrigés**
  - User : « fais une revue complète et vois ce qui peut être amélioré (théorie échecs, code, UI) »,
    puis « fais tous les autres correctifs ». Revue conduite en INSTRUMENTANT l'app servie en local
    (pas seulement en lisant le code) : les constats les plus lourds sont reproduits, pas déduits.
  - **F1 - course sur les réponses du moteur** (`js/engine.js`). Un `go` produit exactement un
    `bestmove`, mais rien ne les appariait : une recherche abandonnée sur `EVAL_TIMEOUT` émettait
    quand même son bestmove et l'appel SUIVANT le ramassait. Toutes les évaluations se décalaient
    d'une position (repro : 5/8/16/0 ms au lieu de ~800 ms chacune), et l'une recevait un
    `{score:0, lines:[]}` qui n'est PAS null - donc pas de repli heuristique : un ★ Meilleur à
    100 % de précision gratuit. Chaque recherche a un `searchId`, les `evaluate()` sont sérialisées
    (`chain`), et un `stop` garde son créneau (`DRAIN_TIMEOUT`) jusqu'à encaisser le bestmove avorté.
  - **F2 - le build WASM était livré mais jamais chargé.** Le worker importait `stockfish.js`
    (asm.js, 1,58 Mo) alors que `stockfish.wasm` dormait à côté depuis mai. Mesuré à conditions
    égales (MultiPV 3, 3 s) : **141 844 -> 1 117 863 n/s, profondeur 13 -> 17**, soit ~8x.
    ATTENTION : le worker DOIT vivre dans `js/vendor/` : le build wasm demande « stockfish.wasm »
    en chemin nu relatif au worker (son `locateFile` rend le nom verbatim, il ignore
    `scriptDirectory`). asm.js reste en repli sans WebAssembly et n'est plus précaché.
  - **F3 - MultiPV 3 -> 5.** `analysis.js` note le coup joué depuis sa ligne DANS la recherche
    pré-coup ; hors du top N il retombe sur le chemin bruité, ce qui est le cas le plus fréquent
    à 350 Elo.
  - **F4 - effort moteur tracé par partie** (`engineEffort`) et affiché (« analyse rapide
    (navigateur) » vs « analyse complète ») : serveur à depth 20 et navigateur à movetime 600
    alimentaient les mêmes courbes sans que rien ne le dise.
  - **F5 - l'onglet Analyser utilisait encore le détecteur de fourchette géométrique.** C'était
    littéralement la plainte qui avait déclenché la v184, corrigée dans les exercices mais pas dans
    l'écran principal. `detectFork` s'appuie désormais sur `Tactics.threats` + `netGain >= 2`.
    Même coup Dd5 : l'ancien annonçait « fourchette cavalier + dame », le nouveau voit **-9**.
    `tactics.js` passe avant `analysis.js`, et `analyze.mjs` installe le global `Tactics`.
  - **F6 - `netGain` était aveugle à la promotion et au pat.** Promotion imparable -> 0 (donc
    « Pion passé » ne pouvait avoir AUCUN exercice, le sélecteur exigeant netGain >= 2) ; laisser
    l'adversaire faire dame ne coûtait rien ; un pat était indistinguable de « rien ne se passe ».
    La promotion compte des trois côtés (le coup jugé via `threats.promoted`, ma suite, la défense
    adverse) et `threats` expose `stalemate`, que la phrase française nomme avant tout le reste.
  - **F7 - trois définitions incompatibles des phases** cohabitaient (ply<20/50 pour les stats,
    ply<10 et « 6 derniers coups » pour les textes) : le 12e demi-coup était « ouverture » pour la
    statistique et « milieu de jeu » pour le commentaire. Une seule `phaseOf(fen, ply, bookDepth)`,
    déduite de la POSITION. ATTENTION : les deux signaux sont MONOTONES (matériel <= 26 pts hors
    pions ; droit de roque) - compter les mineures développées, qui semblait naturel, remettait une
    Espagnole « en ouverture » au 10e coup sur la retraite Breyer ...Cb8.
  - **F8 - la précision était la moyenne arithmétique** des précisions par coup : une gaffe unique
    se noyait dans quarante coups faciles (95 %). Moyenne pondérée par la volatilité + moyenne
    harmonique, comme Chess.com : 39 parfaits + 1 grosse gaffe -> **66 %**, un jeu régulier ne
    bouge pas.
  - **F9 - nomenclature** : ...e5 après ...d6 = Boleslavsky (B58), pas Sveshnikov ; la vraie
    Sveshnikov (B33, via ...Cc6) manquait ; 3...a6 = défense Morphy en C70 (C68 = variante
    d'échange).
  - **F10 - les « mats de base » ne contenaient AUCUN des deux mats de base.** Ajout de
    **Roi + dame contre roi** et **Roi + tour contre roi** (méthode de la boîte qui rétrécit,
    opposition, avertissement pat), 4 exercices, positions vérifiées (légalité, unicité, lignes
    forcées). A nécessité `altMate` : sur le DERNIER coup d'un exercice de mat, **tout coup qui
    mate est accepté** - sinon impossible d'ajouter ces mats, où plusieurs coups matent presque
    toujours. Le corrigé cite alors le mat trouvé par l'élève.
  - **F11 - 8 motifs sur 28 sans aucun exercice** (Coups candidats, Pion isolé, Colonne ouverte,
    Rupture de pions, Cases faibles, Paire de fous, Initiative & tempo, Prophylaxie). Ce n'est pas
    un oubli du pipeline : ce sont des thèmes STRATÉGIQUES et la base Lichess n'étiquette que des
    tactiques - `pick_lichess.cjs` ne trouvera jamais rien. Marqués `study: true`, chip
    « 📖 à lire » dans la liste et note explicative dans la fiche.
  - **F12 - `js/repertoire.js` n'était chargé par personne** et `coach.js` le testait derrière un
    `typeof !== 'undefined'` : le bloc « fidélité au répertoire » ne s'affichait jamais, en silence,
    et son bouton ouvrait un panneau supprimé en v159-169. **Supprimé** plutôt que ressuscité (la
    checklist « Ouvertures à connaître » le remplace) : 247 lignes JS + 30 de CSS orphelin.
  - **F13 - le precache du SW ne correspondait pas aux scripts chargés** : `courses.js` et
    `opening-tree.js` chargés mais jamais cachés (onglet Apprendre cassé au premier lancement
    hors ligne), `repertoire.js` caché mais jamais chargé. La liste vit dans **`js/app-scripts.js`**,
    lue par `index.html` ET par `sw.js`. `cache.addAll` (atomique : un 404 jetait tout) remplacé
    par un `add` par entrée.
  - **F14 - « Continuer à jouer » existait en trois exemplaires** + `pvToFr` en cinq copies, déjà
    divergentes. Nouveau **`js/freeplay.js`** : `pvToFr` / `evalWhite` / `terminalHtml` /
    `statusHtml` / `analyze`. Les trois UI restent chez elles (DOM, boutons et extras différents -
    app.js suit la théorie, tactics.js peint les menaces) : seule la logique échecs/moteur est
    mutualisée. Fusionner les UI aurait été une réécriture à risque pour un gain cosmétique.
  - **F15 - aucun test unitaire sur le coeur logique.** `tools/test_core.cjs`, **39 tests**
    (seeOn / netGain / threats / detectFork / phaseOf / précision / ouvertures / dictionnaire),
    sans moteur, une seconde, branché sur la CI avant l'analyse. `npm test` dans `tools/`.
  - **F16 - 970 Ko en 14 scripts strictement sérialisés** (`document.write`). Ajout de
    `<link rel="preload">` pour tous : **15 requêtes en parallèle** au lieu d'une chaîne de 14,
    sans toucher à l'ordre d'exécution. Le lazy-loading par onglet a été écarté volontairement :
    le SW masque déjà le coût après la première visite, et l'async introduirait des états de
    chargement et des races dans une app sans build.
  - **F17 - le mot « Excellent » désignait DEUX catégories de coups** : le glyphe `!` dans l'app et
    le glyphe `✔` dans la légende rapide, la légende étant la seule fausse sur les deux lignes.
    Quatre copies du dictionnaire existaient. Une seule désormais, **`Analyzer.MOVE_TYPES`**, d'où
    les deux légendes de l'aide sont générées au chargement. « □ Forcé » y figure enfin.
  - **F18/F19/F20 - accessibilité** : `h1` (la hiérarchie démarrait en h2), `role="tablist"` +
    `aria-selected` synchronisé, `aria-live` sur la progression et le retour d'exercice,
    `:focus-visible` global (il y avait 4 règles de focus pour 51 boutons), `.panel-close`
    30x32 -> **44x44**, glyphes de légende 9,5 -> 11 px. ATTENTION : le constat « les modales n'ont
    pas `role=dialog` » était FAUX - elles l'avaient déjà sur leur boîte interne, l'audit avait
    interrogé l'overlay.
  - **F21** - les 5 maquettes obsolètes passent dans `_mockups/` (versionnées, donc servies
    publiquement par Pages).
  - **Piège de dev rencontré** : le SW est cache-first sur les `?v=`, et le cache HTTP du navigateur
    garde aussi `fichier.js?v=N`. Éditer sans bumper `APP_VERSION` fait tourner du code périmé et
    donne de fausses vérifications. Bumper à chaque passe de vérif.
- **v184 - Menaces affichées, « continuer à jouer », et exercices refaits sur la base Lichess**
  - User : « affiche les flèches de menaces sur les tactiques (ex. les menaces causées par une
    fourchette) et permets de continuer à jouer comme sur les ouvertures ; la tactique ne marche
    que s'il ne peut y avoir reprise (une fourchette royale reprise au coup d'après par un fou n'en
    est pas une) ; globalement les exemples de mats et de puzzles tactiques ne sont pas tous très
    bons ». Il a lui-même pointé la base de puzzles Lichess et l'a téléchargée dans le dossier.
  - **Nouveau module de lecture du plateau dans `js/tactics.js`** (indépendant de chess.js, exporté
    pour l'outillage) : `attacksFrom` / `attackersOf` (rayons X compris) / `seeOn` (échange statique
    SEE) / `netGain` / `threats` / `threatSentence`.
    - `netGain(fen)` = **le juge de paix demandé par le user** : l'adversaire joue sa MEILLEURE
      défense (reprise incluse), puis on encaisse au mieux ; en pions, 1000 = mat. Une fourchette
      reprise au coup suivant tombe à 0 ou en négatif et n'est plus traitée comme une tactique.
    - `threats(fenAvant, fenApres, coup)` rend `checks` / `direct` (ce que la pièce attaque avec
      profit, filtré au SEE) / `discovered` (lignes démasquées en partant) / `behind` (la pièce
      coincée DERRIÈRE la cible : clouage si elle vaut strictement plus, enfilade si le roi est
      devant) / `recapture` / `net`.
  - **Flèches de menace dans l'entraînement** (`#tac-threats` + `paintThreats`), donc aussi bien
    pour les Tactiques que pour les Mats (les deux passent par `Tactics.start`) : dès que l'élève
    trouve le coup, l'échiquier montre **rouge = échec, vert = ce que la pièce attaque, bleu = ce
    qu'elle démasque**, et une phrase nomme les pièces puis conclut sur le gain réel
    (« Le cavalier d2 fait échec au roi f1, attaque la dame f3. L'adversaire ne peut pas tout
    sauver : le coup gagne +6 au bas mot. »). Les flèches restent 1,5 s avant la réponse adverse,
    et un bouton bascule **👁 Menaces** les rappelle en fin d'exercice.
  - **« 🔍 Continuer à jouer »** en fin d'exercice, calqué sur l'exploration libre des ouvertures :
    on rejoue les DEUX camps, Stockfish indique son meilleur coup (flèche bleue) + éval + suite,
    avec ↶ Annuler / ⟳ Départ / ✕ Revenir à l'exercice. Les menaces s'affichent aussi sur les coups
    libres.
  - **Contenu refait sur la base de puzzles Lichess** (CC0, `lichess_db_puzzle.csv.zst`, 304 Mo,
    **gitignoré** - à retélécharger sur https://database.lichess.org/#puzzles). Pipeline en 3 passes,
    dans `tools/` :
    1. `mine_lichess.cjs` : streame l'archive zstd (⚠️ elle commence par un *skippable frame*
       que `node:zlib` refuse : lire à partir de l'octet **12**) et filtre large (Elo 600-1750,
       popularité ≥ 90, ≥ 800 parties, ≤ 6 demi-coups, thèmes utiles) → pool de **26 476** puzzles.
    2. `pick_lichess.cjs` : choisit, motif par motif, 4 exercices (3 pour les mats) sur **trois**
       critères cumulés - thème Lichess, **motif réellement visible** (`threats` doit retrouver la
       figure), et **gain qui tient** (`netGain` ≥ 2). Tranches de difficulté (facile / moyenne /
       soutenue), tri par popularité, dédoublonnage global (un puzzle ne sert qu'à un seul motif).
       Les figures de mat que Lichess n'étiquette pas (h7 grec, g7, Lolli, Damiano, baiser de la
       mort) sont reconnues **géométriquement** sur la position finale, plateau normalisé en miroir
       pour que le camp qui mate soit toujours « les Blancs ».
    3. `inject_puzzles.cjs` : audite l'existant, réécrit les tableaux `puzzles` des deux catalogues
       (rejouable sans dupliquer : les entrées Lichess sont régénérées).
  - **Résultat du ménage** (l'audit est la réponse chiffrée au point 2 du user) :
    - **13 exercices de tactique supprimés parce qu'ils ne gagnent rien**, dont 9 tirés de ses
      propres parties : le clouage `Bb4` (net **-1**, la dame reprend le fou), la fourchette `Nxc2`
      (+1), la découverte `d5` (-1), `Bxd4` (+1), la surcharge `Rxf7` (**-2**), l'enfilade `Qh4+` (0),
      les coups tranquilles `Bf4` (0) et `Nb5` (+1), l'attaque double `Qxb7` (+1) ; plus la démo
      d'Attraction (échange dame contre dame, net 0), et la fourchette `Bxf7+` (net +1) débusquée
      après correction du SEE (ci-dessous).
    - **22 exercices « habillés »** (schéma épuré + décor artificiel, v183) supprimés : remplacés par
      de vraies parties.
    - Au plus 2 positions « ta partie » par motif, dédoublonnées par partie + premier coup.
  - **75 → 141 exercices** (95 tactiques + 46 mats). Chaque motif a maintenant des positions de
    vraies parties avec chip « 🌍 vraie partie - Lichess · niveau 1162 ↗ » + « difficulté moyenne ».
    Les 4 entrées qui n'avaient AUCUN exercice en ont : Interférence, Méthode CCT, Coups forçants,
    Zugzwang.
  - **Bug chess.js corrigé** : en mode `sloppy`, `bxc3` est lu comme un coup de FOU, donc toutes les
    prises de pion sur la colonne b échouaient (2 exercices de mat de Boden plantaient à la réponse
    adverse). `sanToMove` (app) et `playSan` (outils) résolvent désormais le SAN sur la liste exacte
    des coups légaux avant de retomber sur `sloppy`.
  - **Deux pièges de l'échange statique, corrigés en cours de route** (à ne pas réintroduire) :
    1. `seeOn` rendait `VAL.k` (100) quand la cible était un roi : dès qu'un ROI reprenait, la
       récursion croyait que l'adversaire « reprenait le roi » pour 100, et le gain explosait
       (`Nxd7` du Desperado annoncé à +9 au lieu de +6, la fourchette `Bxf7+` de ses parties à +7 au
       lieu de +1). On ne gagne pas un roi -> retour 0.
    2. `netGain` sortait de la boucle dès qu'une défense annulait le gain (`worst <= 0`) : la valeur
       rendue était alors un MAJORANT, pas le minimum. Le seuil restait juste, mais le chiffre
       affiché à l'élève était faux. Boucle complète désormais (~37 ms par appel, largement tenable :
       un appel par coup joué, et le minage n'évalue que les candidats déjà triés).
  - **Vérificateur durci** : `tools/verify_lessons.cjs` remplace l'ancien test « matériel ≥ 2 OU éval
    ≥ 2,5 » (qui laissait passer les fourchettes reprises) par `matériel + netGain ≥ 2`, et signale en
    WARN les positions où le moteur n'est pas convaincu. Deux mats ne se départagent plus : sur un
    schéma où tout mate, « le moteur mate un demi-coup plus vite » n'est plus une erreur de contenu.
    Lancer `DEPTH=14 node tools/verify_lessons.cjs [mates|tactics] [motif…]`.
  - **Résultat de la passe moteur (DEPTH=14, Stockfish asm.js, ~25 min)** : **141 exercices vérifiés,
    0 FAIL, 13 WARN**. Les WARN sont tous sur les vieux schémas épurés (coup ex aequo, réponse
    scriptée qui n'est pas la meilleure défense, moteur peu convaincu sur une figure où le gain est
    matériel) - rien de bloquant. Rejeu indépendant des 141 lignes avec la résolution SAN de l'app :
    0 problème, tous les mats notés `#` matent vraiment.
  - **Déployé** le 19/08/2026 (commit `f50eb85`, rebase sur le chore coach-data puis push
    `origin main`) : live vérifié sur https://kkjsf.github.io/chess-analyst/ (v184, 95 + 46
    exercices, flèches de menaces OK, 0 erreur console). Pages met ~30 s à basculer.
    Un `.gitignore` a été créé au passage (il n'y en avait aucun) pour la base `.zst` de 304 Mo.
- **v183 - Tactiques & Mats : beaucoup plus d'exercices, en vraies positions, + recherche**
  - User : « exemples des exercices plus nombreux pour chaque mat ou tactique, et aussi + parlant
    (dans un contexte donné avec plus de pièces, pas juste les pièces qu'il faut pour une fourchette) ;
    sois sûr qu'il y ait une illustration principale pour chaque mat et tactique ; ajoute une barre
    de recherche pour mat et pour tactiques ».
  - **Exercices : 31 → 75** (46 côté Tactiques, 29 côté Mats). Trois familles, affichées telles quelles
    dans l'entraînement via des « chips » de contexte au-dessus de l'échiquier :
    - `mine:` **24 exercices tirés des vraies parties de Simon** (extraits de `coach-data.json`,
      `analysis.blunderList` : des coups gagnants qu'il a lui-même laissés passer). Chip
      « 🎮 ta partie - contre X · blitz · 12 mai 2026 » + lien vers la partie chess.com.
    - `ctx:` **22 exercices « habillés »** : le schéma épuré d'origine, rejoué avec un décor de pièces
      et de pions équilibré autour (structure de pions, tours, roque) pour qu'il ressemble à une partie.
    - `demo: true` : les 7 figures pures restantes (géométrie du motif). Sur celles-là, un autre coup
      gagnant n'est plus traité comme une faute : message « d'autres coups gagnent aussi, cherche la figure ».
  - **Illustration principale pour tout le monde** : ajout de diagrammes + flèches pour Attraction,
    Coup intermédiaire, Méthode CCT, Paire de fous, Initiative & tempo, Prophylaxie (et le **Mat de Légal**
    qui n'avait aucun diagramme : position finale calculée `rn1q1bnr/ppp1kB1p/3p2p1/3NN3/4P3/8/PPPP1PPP/R1BbK2R`).
  - **Barres de recherche** : composant partagé `.lx-search` (CSS) + compteur `.lx-count`.
    - Tactiques (`#panel-concepts`) : `#concept-search` filtre les 28 motifs sur nom / nom anglais /
      catégorie / description (insensible aux accents), masque les en-têtes de catégorie vides,
      état vide `#concept-empty`, compteur « N motifs - M exercices jouables ».
    - Mats (overlay `#mate-stage`) : `#mate-search` filtre les 14 figures sur nom / nom anglais / leçon /
      séquence / groupe, masque les groupes vides, et **la requête survit** à l'aller-retour vers une fiche
      de mat (variable `query` du module).
    - Piège CSS corrigé : `.concept`/`.mate-card` posent `display:flex`, qui écrase l'attribut `[hidden]`
      → règles `.concept[hidden], .concept-cat[hidden], .mate-card[hidden], .mate-group[hidden] { display:none }`.
  - **Outillage de vérification (nouveau, dans `tools/`)** - tout le contenu ajouté est vérifié hors-ligne :
    - `tools/sf.cjs` : pilote Stockfish (le build asm.js `js/vendor/stockfish.js`) en Node via les
      globales `onmessage`/`postMessage` du build Worker. MultiPV + PV complète.
    - `tools/verify_lessons.cjs` : passe les DEUX catalogues au moteur. Pour chaque exercice : FEN
      lisible, ligne légale, le coup à trouver **est** le meilleur coup du moteur, la réponse scriptée
      est une vraie défense, et la ligne gagne (mat, ou gain matériel ≥ 2 / éval ≥ 2,5). Les diagrammes
      de mat doivent être des mats. Flags respectés : `demo` (figure pure) et `trap` (Légal : la ligne ne
      mate que si l'adversaire prend la dame). Lancer : `DEPTH=14 node tools/verify_lessons.cjs [mates|tactics]`.
    - Scripts jetables (scratchpad, non commités) : minage de `coach-data.json` par motif (détecteurs
      fourchette/clouage/enfilade/découverte/double échec/surcharge/interférence écrits à la main sur le
      plateau), habillage automatique des schémas épurés, et récupération d'un run interrompu depuis son log.
  - Note : 4 exercices dont la « tactique » ne gagnait rien (position matériellement perdue, ou gain
    inférieur à 1 pion) ont été supprimés. Les concepts purement stratégiques (pion isolé, colonne ouverte,
    rupture, cases faibles, paire de fous, zugzwang, initiative, prophylaxie) restent illustrés mais sans
    exercice - ce ne sont pas des motifs à calculer. **Restent sans exercice** (mais avec illustration) :
    `Interférence` (motif trop rare pour être miné dans les parties de Simon) et les 3 entrées de méthode
    `Méthode CCT`, `Coups forçants`, `Coups candidats` - le minage ciblé pour elles s'est fait tuer deux
    fois par un « engine timeout » du Stockfish asm.js (ne PAS lancer deux process Stockfish Node en
    parallèle, ils s'affament). C'est la première chose à reprendre.
  - `Attraction` et `Moulin` n'ont qu'un exercice chacun (leur schéma épuré `demo`), faute de position
    équivalente trouvée dans les parties.
  - Piste écartée : les puzzles Lichess par thème (`/api/puzzle/next?angle=...`, base CC0) auraient donné
    des positions de vraies parties d'inconnus ; l'API nous a rate-limité (429 après ~4 req/s en parallèle),
    et les parties de Simon sont de toute façon plus parlantes. Gotcha réseau : `fetch` Node tente l'IPv6
    de lichess et time out → `require('dns').setDefaultResultOrder('ipv4first')`.
- **v182 - refonte de la section Ouvertures (arbre = la section, tree-centric)**
  - User : fusionner l'arbre + les cours + les fiches d'ouverture en UNE seule section « Ouvertures »
    cohérente. Choix d'IA retenu (via question) : **tout dans l'arbre** - l'arbre EST la section ;
    fiches et cours sont atteints DEPUIS l'arbre (boutons du panneau détail + résultats de recherche).
    La grille catalogue de fiches (tuile `openings`) disparaît (redondante : chaque fiche a son nœud).
    La checklist « Ouvertures à connaître » reste une tuile à part.
  - **Hub Apprendre** : les 2 tuiles `openings` (grille de fiches) + `tree` (arbre) fusionnées en UNE
    tuile « 📖 Ouvertures » (`data-panel="tree"`, `learn-tile-hero`). `#panel-openings` reste en DOM
    comme filet de sécurité (fallback de `openOpeningByLine` quand aucune fiche ne matche) mais n'a
    plus de point d'entrée. Titre du panneau `#panel-tree` : « 🌳 Arbre des ouvertures » → « 📖 Ouvertures ».
  - **Recherche + autocomplétion** (`opening-tree.js`) : `<input#ot-search>` injecté dans `.ot-toolbar`
    (+ `#ot-suggest` dropdown, `#ot-search-clear`). Index `SEARCH` = tous les nœuds TREE (lbl/eco/fam/mv),
    normalisation accent-insensible (NFD). Suggestions (≤10) avec pastille famille + icône + ECO +
    badges « 📖 fiche » / « 🎓 cours ». Clavier ↑/↓/Entrée/Échap. À la sélection → `navigateTo(node)` :
    déplie les ancêtres, `select()`, `scrollIntoView` centré ; `ensureFamVisible()` ré-active la famille
    si son filtre légende était coupé (les chips portent désormais `data-fam`).
  - **Panneau détail enrichi** (`select()`), échiquier **240→300px** (mobile min(78vw,300), petit
    paysage min(100%,200)) : board déplacé dans un wrapper `.ot-detail-board` (board + actions
    empilées dessous) ; nouvelle rangée **« Suites »** = chips cliquables vers les enfants directs
    (`.ot-nm`, navigation via `navigateTo`) ; idea/plans/ECO/famille conservés.
  - **Liens adaptatifs** (piste #4) : si une **fiche** existe (`App.openingExists(line)` - nouvel export)
    → bouton « ♟ Ouvrir la fiche » (« + cours » si `Courses.match` matche aussi) ; sinon si un **cours**
    est lié → « 🎓 Ouvrir le cours lié » ; **Chess.com** toujours en secondaire. Plus de bouton fiche
    désactivé/à vide.
  - Vérifié en preview (pane masqué → pilotage JS, ouverture synchrone du panneau car rAF gelé) :
    95 cartes, board 300px, recherche « italienne » → badges fiche+cours → nav OK, « centrale » → cours
    seul, « C45 » (ECO) → famille Écossaise, chip de suite → nav, fiche → ouvre l'explorer, filtre
    famille coupé puis « najdorf » → famille ré-activée + carte visible, responsive mobile (recherche
    pleine largeur order -1, détail empilé, board 293px, 0 overflow), 0 erreur console. APP_VERSION 181→**182**.
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
