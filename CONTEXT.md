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
- **`_mockups/opening-mobile-mockup.html` (2026-08-19)** - maquette INTERACTIVE du cours
  d'ouverture sur MOBILE. Le systeme v195 marche sur desktop mais pas a 390px, mesure sur le live :
  seulement **25 % de l'arbre visible** (1 272 px de fil dans 320 px), **0 noeud sur 5**
  entierement visible sans defiler lateralement, **12 px d'indentation pour tous les noeuds**
  (profondeur ecrasee, traits de branche desactives : la fourche disparait), **2,5 ecrans** de
  defilement vertical, et l'echiquier n'est **pas collant** donc il sort du champ des qu'on lit.
  Proposition : DEUX ECRANS au lieu d'un empilement. (1) la **carte** = l'arbre en pleine largeur,
  vraie indentation 18/40/62 px et traits de branche ; (2) une **branche** = echiquier COLLANT qui
  se reduit de 300 a 104 px des qu'on defile (le commentaire passe a cote), contenu dessous, et une
  barre des **branches soeurs** collee en bas pour passer de 3…Fc5 a 3…Cf6 sans repasser par la
  carte. Honnete : ca ne reduit PAS le defilement (2,5 ecrans, comme avant) - le gain est que
  l'echiquier reste visible pendant ces 2,5 ecrans et que l'arbre redevient lisible.
  Contenu de la maquette : les DEUX telephones restent visibles en parallele (sur un vrai
  appareil l'un remplace l'autre ; ici toucher une branche a gauche recharge la fiche a droite,
  ce qui permet de juger les deux ecrans d'un coup), 4 annotations numerotees, un tableau des
  7 gestes, et TROIS AUTRES OUVERTURES en exemple pour montrer que la forme de l'arbre varie :
  Espagnole (seule a 2 niveaux : 3...a6 se subdivise), Scandinave et Gambit du Roi (3 soeurs a
  plat). Toucher 3...Fc5 montre une branche SANS piege ni question, ce qui illustre que chaque
  noeud ne porte que ce qui le concerne.
  IMPLEMENTE en v196-v199 (voir ci-dessus). Le bloc CSS `@media (max-width: 900px)` du rail a ete REMPLACE, pas corrige :
  c'est un changement de navigation. `buildBranches` / `spread` ne bougent pas.
  ⚠️ Lecon de recette : ma validation mobile de la v195 verifiait « pas de debordement, cibles a
  44px ». Bons criteres pour un formulaire, inutiles pour un arbre - il fallait mesurer la part
  d'arbre visible et la persistance de l'echiquier.
- **`_mockups/opening-course-mockup.html` (2026-08-19)** - maquette INTERACTIVE proposant de
  remplacer les 6 onglets du cours d'ouverture (Presentation / Lignes / Plans / Pieges /
  Transpositions / Quiz) par l'ARBRE des variantes comme navigation, chaque noeud portant tout
  ce qui le concerne. Repond a 4 reproches du user : la fourche disparait, redondances
  (`Transpositions[0]` = `Lines[0]` = la meme branche), sous-menus opaques, espace mal utilise
  (mesure : colonne droite remplie a 32-42 % sur Plans/Transpo/Quiz a 1400x900, contre 82 %
  en moyenne dans la maquette). Contenu reel de l'Italienne, 11 noeuds, positions calculees.
  IMPLEMENTE en v191-v195 (voir ci-dessus). Pre-requis identifie a l'epoque : champ `parent` aux traps/quiz pour les
  raccrocher a leur branche, et faire exporter ses noeuds a `js/opening-tree.js` (il n'expose
  que `render`, d'ou une 3e representation des memes ouvertures).
- **`_mockups/analysis-redesign-2026-09.html` (2026-09-08)** - maquette de refonte de l'ECRAN
  ANALYSE (**implementee en v212-v223**). Constat mesure sur le code : 13 cartes de meme poids
  dans 2 onglets desequilibres (`Conseil` = turning + pace + bouton guess, `Analyse` = 11 cartes),
  le meme coup raconte 3 fois (`turning-card`, `highlights-card`, bloc « Moment cle » de
  `summary-card`), 3 cartes sur le temps (`pace-card` dit litteralement « regarde la carte Pression
  du temps plus bas »), 4 graphiques sur le meme axe des x jamais alignes, et 2 cartes nommees
  « Resume » (`intro-card` + `summary-card`). Proposition : (1) la courbe des chances de gain
  DEVIENT le scrubber de navigation, avec Matiere/Temps en onglets du meme cadre - remplace le
  ruban de 43 pastilles + 3 cartes graphiques ; (2) la bulle du coach passe SOUS l'echiquier,
  fusionnee au label du coup (le plateau remonte d'environ 90 px sur mobile) ; (3) le rapport
  devient « les 4 moments » (le tournant simplement badge en premier) + 3 verdicts depliables
  (phase / rythme / type d'erreur) ; (4) le reste (pastilles completes, plans, tablebase, effort
  moteur) derriere un pli « Tout le detail ». Onglets Conseil/Analyse supprimes, CTA unique
  « Rejouer les 4 moments » en fin de lecture. 3 telephones + table de correspondance carte par
  carte. Donnees reelles de la partie du 14/08/2026 vs Koln (rapide 10 min, defaite au temps,
  precision 52, 3 gaffes, acpl par phase 51/335/37, temps par coup extraits des `[%clk]`).
- **`_mockups/opening-lesson-enrich-2026-09.html` (2026-09-08)** - maquette + 10 propositions pour
  ENRICHIR LES COURS D'OUVERTURE (**les 10 implementees en v212-v223**). Chiffres mesures sur
  `coach-data.json` (150 parties) : 9 des 28 ouvertures du catalogue ont un vrai cours (arbre +
  notes + pieges + quiz) ; 124 parties sur 150 ne completent aucune ligne du catalogue au-dela du
  coup 2 (profondeur mediane 3 plies, mesuree par prefixe exact contre les 172 lignes de
  `js/openings.js` - borne basse) ; 8 parties contre **2.Dh5** apres 1.e4 e5 (aucun contenu dans
  l'app, un mat en 5 subi) ; 8 parties d'Ouverture de l'Eveque cote Noirs a 38 % (absente du
  catalogue OPENINGS) ; sur les 7 parties passant par 3.Fc4, il joue 4.Cc3 3 fois - un coup que le
  cours ne couvre pas (il enseigne 4.c3 / 4.d3 / 4.b4). Les 3 propositions prioritaires : (1)
  « tes parties ici » sur chaque noeud de l'arbre (nb de passages, score, coup par lequel il sort
  du livre, point rouge sur les branches qu'il joue vraiment) ; (2) transformer les `deviations`
  en prose en exercices d'une position, alimentes par les deviations reellement subies ; (5)
  repetition espacee par branche (1/3/7/21 j) a la place de l'ensemble plat `ca_lessons_done`,
  expose dans la Routine du jour. Les 7 autres : quiz sur l'echiquier au lieu du QCM texte (qui
  enchaine au bout de 2 s et masque l'explication), rejeu en aveugle, position-type en diagramme,
  deep-link analyse -> noeud du cours, fiche « 3 choses a retenir », budget temps affiche,
  et l'ordre de creation des cours manquants pilote par ses parties (2.Dh5 > Eveque > Francaise > Sicilienne).
- **`_mockups/coach-mode-2026-09.html` (09/09/2026) - VALIDEE ET IMPLEMENTEE en v225-v232.**
  Maquette du **mode entraineur** demande par le user : jouer une partie complete contre le coach,
  avec le **niveau de l'adversaire** reglable (defaut = son Elo par cadence, 760 rapide / 946
  journalier), un **mode libre** (aucune aide pendant, commentaire + fleches de menace APRES coup),
  un **mode assiste** (menaces + meilleur coup + le pourquoi), et une **ouverture imposee** ou le
  coach suit sa ligne - ou en sort expres. 6 ecrans (reglages / libre / assiste / ouverture
  pilotee / fin de partie / historique separe). **Arbitrage du user (09/09) : ces parties restent A
  PART.** Elles vont dans un magasin dedie (jamais l'IndexedDB des parties Chess.com) et ne comptent
  dans aucune stat de l'archive - courbe Elo, « ton vrai niveau », `lineStats`, gaffes/100 coups ;
  une seule passerelle, sur demande : un interrupteur « envoyer cette gaffe dans mes exercices ».
  Deux raisons TECHNIQUES en plus de la mesure : `Coach.clearStore()` vide tout le magasin des
  parties quand le pseudo Chess.com change (des parties d'entrainement y seraient effacees sans
  preavis, et rechargeables depuis aucun serveur), et le pipeline d'analyse appelle
  `Training.capture()` a la fin (app.js:470 et 584), donc « analyser cette partie » remplirait le
  paquet d'exercices tout seul sans un drapeau explicite. **Sa question PC / PWA Android :** les
  vraies parties convergent (rechargees de l'API + `coach-data.json`), mais les parties du coach se
  jouent sur l'appareil sans serveur -> chaque partie est ETIQUETEE par appareil, avec export/import
  JSON dans l'ecran 6. A noter au passage : la progression locale (`chess-analyst-training`,
  `ca_lessons_srs`, `chess-analyst-sessions`, `ca_checklist_v1`) **diverge deja** entre son PC et
  son Android, en silence - le meme export/import reglerait les deux. Contient l'analyse de faisabilite : ce qui est
  deja code (`replay.js` = deja un moteur de mode entraineur avec ses DEUX niveaux d'aide,
  `tactics.js` pour les menaces, `freeplay.js`, le livre des cours) et ce qui reste a ecrire (le
  reglage du niveau, un hote de partie complete avec PGN, le pilote d'ouverture).
  **Fait technique verifie en live (envoi de `uci` au worker) : le moteur embarque est Stockfish
  2019-08-15 Multi-Variant, il a `Skill Level` 0-20 mais PAS `UCI_Elo` ni `UCI_LimitStrength`.**
  Un niveau se fabrique donc en combinant Skill Level + movetime court + tirage pondere dans les
  5 lignes de MultiPV + taux de gaffe volontaire, et il faudra le calibrer en jouant. **Piege :
  `Skill Level 20` et `MultiPV 5` sont poses une seule fois a l'init de `js/engine.js` - si le
  mode les baisse sans les restaurer, tout l'analyseur se degrade en silence.**
- Prototypes/mockups (non prod), tous deplaces dans `_mockups/` en v186: `home-redesign-mockup.html` (maquette accueil mobile, v173), `home-redesign-desktop-mockup.html` (maquette accueil desktop, v173), `mockup.html`, `redesign-mockup.html`, `openings-tree-mockup.html`, `openings-tree-visual.html`, `mon-bilan-10min.html` (bilan standalone des parties 10 min ; rafraîchi le 11/08/2026 à 53 parties, mai→11 août : 23V/29D/1N, 43% de victoires, Elo 346, 15 mats subis - stats moteur précision 84/83 & 2,2 gaffes/défaite conservées telles quelles, non recalculées sans re-run Stockfish. Données via l'API publique chess.com `nimokaji`, filtre TimeControl=600).
- `icons/`, `.github/`.

**Historique récent (du plus récent):**
- **v233-v234 (SHIPPED `e60fe20`, verifie en live) - LE MODE ENTRAINEUR PREND SON PROPRE ONGLET, l'ancien Coach devient
  « Statistiques ».** Demande du user. La barre de navigation passe a 5 entrees :
  **Analyser | Coach | Statistiques | Apprendre | Entrainer**. Les cles internes suivent les
  libelles (`data-tab="coach"` = JOUER, `data-tab="stats"` = le bilan de l'archive) pour que le
  code ne mente pas sur ce qu'il ouvre : `navTo`, `syncTabbar` et `wireTabSync` sont a jour, et
  `CoachGame.open` est patche pour allumer l'onglet. La tuile « Jouer avec le coach » disparait du
  hub Apprendre (elle avait un onglet maintenant), l'acces rapide de l'accueil se scinde en deux
  (« Coach - jouer une partie contre lui » et « Statistiques - bilan de toutes tes parties »), et
  le guide d'utilisation est renomme en consequence. Verifie : 5 onglets tiennent a **320 px**
  (64 px chacun, « Statistiques » = 57 px) comme en sidebar desktop.
  - **Deux bugs de calque corriges au passage, mesures en direct.** Avec le mode ouvert, un clic
    sur un autre onglet laissait le calque EN PLACE par-dessus le nouvel ecran (il est en
    `position:fixed`, donc `offsetParent` rend `null` et trompe la verification) **et** laissait
    `body.guess-open`, c'est-a-dire `overflow:hidden` - l'ecran d'arrivee n'etait meme plus
    defilable. Nouveau `closeOverlays(except)` dans app.js : changer d'onglet ferme tous les
    calques `.guess-*` (CoachGame, Mates, Replay, GuessMove) via leur propre `close()`, qui fait
    leur menage. Le bug valait pour les calques existants, pas seulement le nouveau.
  - Et pour ne pas perdre une partie en allant voir ses stats : `CoachGame.open()` **reprend la
    partie en cours** (`inProgress()`) au lieu de rouvrir les reglages. Verifie : coup joue ->
    onglet Statistiques -> retour Coach -> le pion est toujours en e4 et c'est mon trait.
- **v225-v232 - LE MODE ENTRAINEUR : jouer une partie complete contre le coach** (SHIPPED `fe398a1`, verifie en live).
  La maquette `_mockups/coach-mode-2026-09.html` (6 ecrans) est implementee. Nouveau module
  `js/coachgame.js` (~900 lignes), tuile en TETE du hub Apprendre. 66 tests unitaires OK
  (39 + 27 nouveaux), 121 controles de verify_openings OK, 0 erreur console, verifie en jouant
  vraiment des parties dans le navigateur (mobile 375 px compris).
  - **Ce qui existait deja et n'a PAS ete reecrit** : `replay.js` (boucle je joue / l'ordi repond,
    notation du coup, explication de la gaffe, reprendre-ce-coup, indice en 3 temps),
    `tactics.js` (`threats`/`threatSentence` + SEE, donc une piece defendue ne declenche rien),
    `freeplay.js` (eval FR, PV FR, terminal), `board.js` (glisser-deposer, fleches), et le LIVRE :
    les `sans` des cours d'ouverture, deja verifies. Le mode n'ajoute que l'hote de partie.
  - **Le niveau de l'adversaire, sans option d'Elo.** `js/engine.js` accepte desormais
    `evaluate(fen, depth, { skill })`. Choix de conception : le niveau est un PARAMETRE DE
    RECHERCHE, jamais un etat a restaurer - un appel sans `skill` revient d'office a
    `ANALYSIS_SKILL` (20), donc un mode de jeu qui oublie de « remettre » le moteur ne peut pas
    degrader l'analyseur en silence. Un niveau = Skill Level + movetime + **tirage pondere dans
    les 5 lignes MultiPV** + **taux de gaffe volontaire** (echelle `LADDER`, 250 a 1400).
  - **Deux corrections trouvees en JOUANT, pas en relisant le code.** (1) A ~350 le coach a
    **laisse passer une dame gratuite** : le tirage pondere seul suffisait a le rendre aveugle.
    Ajout de `effSpread()` - quand la meilleure ligne devance la suivante d'au moins une piece
    (ou qu'un mat est en vue), le tirage se resserre fortement ; mesure : il ne rate plus la piece
    que dans **3,5 %** des coups, et la gaffe volontaire est desactivee dans ces positions.
    (2) **1.e4 etait note « erreur (-63 cp) »** : je jugeais en centiemes de pion bruts alors que
    toute l'app juge en CHANCES DE GAIN. Passage a `Analyzer.cpToWinPct` avec les seuils de
    `analysis.js` (0,20 / 0,10 / 0,05 / 0,02) - une seule definition de « gaffe » dans l'app.
    Plus la regle « theorie connue » (`Openings.detect` + la ligne imposee) qui fait primer
    **📖 Coup theorique** sur « imprecision », comme l'analyseur.
  - **Son Elo reel n'etait pas celui que je croyais.** `Coach.myRatings()` (nouveau) trie par
    `endTime` : **rapide 348 (07/09), journalier 735 (05/09)**. Lire le DERNIER ELEMENT du tableau
    `games` de `coach-data.json` donne 760/946 - le tableau n'est pas trie chronologiquement.
    D'ou aussi le plancher de l'echelle a 250 et non 400.
  - **Le magasin est SEPARE** (demande explicite du user) : `localStorage['ca_coachgames']`,
    jamais l'IndexedDB des parties Chess.com. Raisons techniques en plus de la mesure :
    `Coach.clearStore()` vide ce magasin des que le pseudo change (et une partie du coach n'est
    rechargeable depuis aucun serveur), et le pipeline d'analyse appelle `Training.capture()` a la
    fin. D'ou `App.loadPgnAndAnalyze(pgn, { ingest: false })` - drapeau **consomme au debut**
    d'`onAnalyze` (sinon une sortie en erreur le laisserait arme et l'analyse suivante, une VRAIE
    partie, ne serait plus ingeree en silence). Verifie en direct : la partie du coach s'analyse
    entierement et n'ecrit rien (0 recente, 0 carte, 0 cache) ; un PGN normal ecrit bien (1/1).
  - **Une seule passerelle vers l'entrainement, explicite** : un interrupteur du bilan appelle
    `Training.ingestGame('coach:<id>', ...)` - meme paquet, meme repetition espacee, cartes
    reconnaissables (`timeClass: 'coach'`).
  - **PC vs PWA Android** : chaque partie porte son `device`, l'ecran historique montre la
    repartition, et un **export/import JSON** (fusion par `id`, rien ne s'ecrase) les reunit.
  - **Ouverture imposee** : le catalogue est construit sur les lignes des cours
    (`Courses.COURSES`, alias exclus) et nommee par `Openings.detect`. Deux sous-modes verifies en
    jouant : « il joue le jeu » (bandeau `0/15 -> 10/15`, coups tagues « coup du livre ») et
    « il sort du livre expres » (deviation tiree au sort sur un coup DU COACH, bandeau
    « ⚡ Il vient de sortir du livre »).
  - **Piege CSS deja rencontre ailleurs** : `.cg-opts { display:flex }` battait `[hidden]`, donc le
    choix « il joue le jeu / il sort du livre » restait affiche sans ouverture imposee. Corrige par
    `.cg-opts[hidden] { display:none }`. Et la pastille « mon niveau » faisait 22 px de haut
    (cible tactile) -> 36 px.
  - Les fleches de menace du mode libre survivent au changement de trait : `onMyTurn()` commencait
    par vider le calque, donc la phrase « le pion d5 attaque e4 » s'affichait SANS les fleches.
- **v224 - LE LONDRES A DEUX ORDRES DE COUPS (classique / accelere)** (SHIPPED `336a21c`, live). Sa question : « d4 d5 Ff4,
  ce n'est pas la version acceleree ? il n'y a pas un Cf3 avant le fou ? » - si. Le cours ne
  presentait que 2.Ff4 et reduisait l'ordre de reference a une note de transposition.
  - `js/courses.js` : nouvelle ligne 0 **Ordre classique (2.Cf3 puis 3.Ff4)** (`altOrder: 1`),
    l'ancien « Plan principal » devient **Version acceleree (2.Ff4 tout de suite)**, et la ligne
    …c5+…Db6 devient **Le prix de l'acceleration**. Les deux ordres transposent : verifie par le
    verificateur, positions finales identiques (`r1bq1rk1/pp3ppp/2nbpn2/2pp4/3P4/2PBPNB1/PP1N1PPP/R2QK2R`).
    L'arbre des branches fourche donc maintenant des `1...d5` : DEPART -> 2.Cf3 (classique) | 2.Ff4
    (accelere -> …Cf6 3.e3 -> plan principal / clone …Ff5 ; …c5 -> le prix).
  - Le point qu'il a lui-meme formule (« on verrouille en defendant le fou avec e3 ») est desormais
    dit partout : un pion blanc en e3 couvre **d4 ET f4**. Nouvelle question de quiz dessus, plus une
    sur « lequel est l'ordre classique ». Piege « ordre des coups » reecrit : le seul ordre qui compte
    est fou -> e3, Cf3 avant ou apres est au choix.
  - Nouveau piege joue : **…Ch5 -> Fg5 !** (harcelement typique de l'ordre accelere apres 1.d4 Cf6
    2.Ff4). Stockfish d18 : Fg5 +0.97, Fd2 +0.82, Fc1 +0.56 - le fou reste dehors, et si …h6, Fh4.
  - Correction d'un distracteur FAUX dans le quiz …Db6 : « 5.b3 (affaiblit) » etait donne comme
    mauvais alors que Stockfish d18 met b3 en tete (+0.38, devant Dc2 +0.19 et Dc1 +0.17). Remplace
    par « 5.Fxb8 (on rend le bon fou) », et la note de la ligne dit maintenant que Dc1 = Dc2 = b3 et
    que le coup a eviter est Db3.
  - Aucun des deux ordres n'est refute (Stockfish d18 : egalite apres 2.Ff4 comme apres 3.Ff4 ; sa
    reponse preferee a l'accelere est …Ff5, pas …c5) - le cours le dit au lieu de laisser croire que
    …c5 punit.
  - **Alias de cles de cours** (`Courses.ALIASES`) : `d4 d5 Cf3 Cf6 Ff4`, `d4 Cf6 Ff4` et
    `d4 Cf6 Cf3 d5 Ff4` pointent sur le MEME objet que `d4 d5 Ff4`. Sans ca, `Courses.match()` ne
    retrouvait pas le cours pour une partie jouee dans l'ordre classique (le prefixe ne collait pas).
  - `tools/verify_openings.cjs` : saute les cles alias, et comprend `altOrder: j` - il exige alors
    deux choses PLUS fortes que le prefixe (les coups de la ligne de base joues dans le meme ordre
    relatif, et la position finale identique a celle de `lines[j]`). 121 controles OK.
  - Aussi : fiche catalogue `app.js` (desc/idea/deviations) et noeud de l'arbre `opening-tree.js`
    (idea + nouvelle branche « Londres - ordre classique », FEN calee chess.js). Verifie en preview
    (rail des variantes, carte DEPART, branche classique), 0 erreur console. APP_VERSION 223->224.
- **v212-v223 - REFONTE DE L'ECRAN ANALYSE + COURS D'OUVERTURE BRANCHES SUR SES PARTIES**
  (SHIPPED `6e43aa1`, verifie en live). Les deux maquettes de `_mockups/`
  (analysis-redesign-2026-09.html, opening-lesson-enrich-2026-09.html) sont IMPLEMENTEES.
  39 tests unitaires OK, 115 controles du nouveau `tools/verify_openings.cjs` OK, 0 erreur console.
  Deploiement : `origin/main` portait encore un commit automatique « chore: update coach analysis
  data » de l'action GitHub (comme en v211 - le piege se repete a chaque fois), rebase sans conflit
  puis push ; Pages met ~30 a 60 s a servir la nouvelle version.

  **1. L'ecran Analyse : 13 cartes -> 4 blocs.** Constats mesures avant de toucher au code :
  deux onglets desequilibres (`Conseil` = 3 blocs, `Analyse` = 11 cartes), le meme coup raconte
  TROIS fois (`turning-card`, `highlights-card`, bloc « Moment cle » de `summary-card`), trois
  cartes sur le temps (dont `pace-card` qui ecrivait « regarde la carte Pression du temps plus
  bas »), quatre graphiques sur le meme axe des x jamais alignes, et deux cartes nommees « Resume »
  (`intro-card` + `summary-card`).
  - **La timeline EST la navigation** (`buildTimeline` / `drawTimeline` / `updateTimelineCursor` /
    `bindTimeline`) : une courbe SVG 320x64 sous l'echiquier, trois series commutables
    (Gain = win% vue Blancs, Matiere = `materialDiff` avec les glyphes de capture recuperes de
    l'ancienne carte, Temps = secondes par coup avec le seuil 15 s), marqueurs des erreurs (plein =
    tes coups, creux = les siens), curseur commun. On navigue en GLISSANT dessus (`pointerdown` /
    `pointermove` avec `setPointerCapture`) - `goTo` pendant le geste et `pinBoard` seulement au
    relachement, sinon la page sauterait a chaque pixel. Remplace le ruban de N pastilles
    (`buildMoveStrip`) + `buildWinGraph` + `buildMaterialGraph` + `buildTimeChart`, tous supprimes,
    ainsi que `materialFromFen` devenu mort.
  - **Le commentaire du coach passe SOUS l'echiquier**, fusionne avec le label du coup (`#tl-cmt`,
    `#tl-move-label`) : il disait la meme chose que le label et poussait le plateau d'environ 90 px
    sur mobile. `updateReplayCta` et le bouton « retour au coup joue » de `bindAltMoves` y sont
    reaccroches. Le lisere gauche de la carte prend la couleur de la classe du coup.
  - **Le rapport** = l'histoire en un paragraphe (`#story-card`, l'ancienne `intro-card` sans son
    titre « Resume » redondant) + **« Les moments »** (`buildMoments`, qui reutilise la collecte de
    l'ancien `buildHighlights` renomme `collectMoments` : rien de la prose n'a ete perdu) + **trois
    verdicts depliables** (`buildVerdicts`) + un pli « Tout le detail ».
    - Le tournant n'est plus une carte : c'est le premier moment, badge `LE TOURNANT`, choisi par la
      meme regle que l'ancien `buildTurningPoint` (gravite puis winPctLoss). Les moments sont
      ordonnes tournant-d'abord puis chronologiquement.
    - **Biais +5 sur tes coups** dans `collectMoments` : sans lui, deux gains manques par
      l'ADVERSAIRE (score 11 chacun) sortaient avant sa propre gaffe decisive.
    - Verdicts : phase (depuis `currentPhaseAccs`, extrait du paragraphe du resume ou il etait
      noye), rythme (`paceStats` + `timeTroubleStats` fusionnes, les deux fonctions renvoient
      maintenant du contenu au lieu de remplir une carte), type d'erreur (`mistakeStats`, avec la
      sortie vers `Training.show('vigilance')`).
    - **Piege corrige a la volee** : la premiere version du verdict de phase affirmait « ta perte
      moyenne passe de 338 a 161 centiemes dans ta phase faible », soit l'INVERSE du chiffre montre.
      La precision (base sur les chances de gain, qui saturent des que la position est perdue) et
      l'acpl (centiemes de pion) ne varient pas dans le meme sens : on donne desormais les deux
      phase par phase, sans en deduire de direction.
  - CTA unique en fin de rapport, pre-rempli avec les indices des moments. Onglets
    Conseil/Analyse, `setSegment` et `layoutCoachReview` supprimes. Grille desktop reprise
    (`.verdict-strip` et `.report` en colonne 2, `board-wrapper` = `min(520px, 100vh - 420px)`
    pour que la timeline tienne sous l'echiquier).

  **2. Les cours d'ouverture, branches sur ses 150 parties.** Chiffres mesures sur
  `coach-data.json` avant d'ecrire : 9 des 28 ouvertures du catalogue avaient un vrai cours ;
  124 parties sur 150 ne completent AUCUNE ligne du catalogue au-dela du coup 2 (profondeur
  mediane 3 demi-coups, par prefixe exact contre les 172 lignes de `js/openings.js`, donc borne
  basse) ; 8 parties contre **2.Dh5** sans une ligne de contenu dans l'app (dont un mat en 5
  encaisse : `e4 e5 Dh5 Cc6 Fc4 g6 Df3 Cd4?? Dxf7#`) ; 8 parties d'**Ouverture de l'Eveque** cote
  Noirs a 38 %, absente du catalogue ; et sur les 7 parties passant par 3.Fc4, il joue 4.Cc3 ou
  4.O-O au lieu des 4.c3 / 4.d3 / 4.b4 du cours.
  - **`Coach.lineStats(sans)`** (nouveau, exporte) croise une ligne avec l'archive : nombre de
    passages, V/N/D, score, et la distribution du coup suivant avec le camp qui l'a joue. Les coups
    sont memoises sur l'objet partie (`gameMoves`) - `lineStats` est appele une fois par noeud.
  - **Bloc « Tes parties apres X »** sur chaque noeud de l'arbre (`fillMine`, asynchrone via
    `Coach.ensureData`) : stats + « Tu quittes le livre ici : g6 (2 parties) » + barres des coups
    suivants (vert = au livre, rouge = ta fuite, bleu = son coup). Sur la TABIYA on compte a partir
    de la ligne de l'ouverture (« apres 2.Dh5 » = 8 parties) et non sur les 8 demi-coups de la
    tabiya, qui n'en retiendraient qu'une.
  - **Bloc « S'il sort du livre »** : les `deviations` en prose deviennent des exercices d'UNE
    position (`course.punish`, reparti par `Courses.spread` comme les pieges, joue par
    `Tactics.start`). 15 drills, tous verifies.
  - **Rejeu en aveugle** (`blindable` / `blindReplay` / `blindSide`) : le format `sol` de Tactics
    alterne deja « ton coup / reponse forcee », une ligne d'ouverture y entre telle quelle. L'app
    joue les coups de l'adversaire, on retrouve les siens. `Tactics.start` accepte un 3e argument
    `{onDone}` et suit `sessionClean` pour faire redescendre une branche ratee.
  - **Repetition espacee par branche** (`srsTouch` / `srsGet` / `srsDue` / `srsLabel`, cle
    `ca_lessons_srs`, boites 1/3/7/21 j) a la place de l'ensemble plat `ca_lessons_done`. Bandeau
    « branche revue N fois · a revoir demain » en bas de chaque noeud, item de routine
    « Reviser une ligne d'ouverture » avec compteur, et l'action ouvre la branche la plus en
    retard (deep-link `openOpeningByLine(line, {branch})`).
  - **Quiz sur l'echiquier** quand la question porte une position (`quiz[].fen` + `sol`), et
    surtout **plus d'enchainement automatique au bout de 2 s** : l'explication s'effacait avant
    d'etre lue, il y a maintenant un bouton « Question suivante ».
  - **`course.target`** (position type + cases-cibles surlignees via
    `BoardRenderer.highlightSquares` dans un overlay dedie) et **`course.keep`** (les 3 phrases a
    retenir) sur les 12 cours. **Budget temps** affiche a cote de la barre de progression
    (`data-budget`, ~40 s par branche).
  - **Boucle analyse -> cours** (`addLessonLink` + `lessonLinkOutOfBook`) : la carte histoire dit
    « Tu as suivi le livre jusqu'au coup N » et deep-linke la BRANCHE suivie ; si aucun cours ne
    correspond (le cas le plus frequent chez lui), elle dit « Tu sors du livre des 2.f3 » et ouvre
    le cours de l'ouverture concernee.
  - **3 nouveaux cours** : `e4 e5 Qh5` (Attaque Parham, 3 drills dont la position exacte du mat
    encaisse), `e4 e5 Bc4` (Ouverture de l'Eveque) et `e4 e6 d4 d5` (Francaise ecrite du cote des
    BLANCS, avec `course.side` qui prend le pas sur le `side` du catalogue). Deux nouvelles entrees
    de catalogue (Eveque, Parham).
  - **Le fil pedagogique verifie mecaniquement** : `…Cf6 bloque la colonne f`, donc Dxf7 devient
    ILLEGAL - c'est ce qui tue le mat du berger, 2.Dh5 et 2.Fc4+3.Df3 d'un seul coup. Verifie avec
    chess.js, pas raisonne de tete.
  - **`tools/verify_openings.cjs`** (nouveau) : legalite de chaque FEN, de chaque `sol`, de chaque
    ligne, prefixe des lignes = ligne de base du cours, `keep` a 3 phrases, cases de `target`
    valides. **115 controles.**
  - **⚠ Piege chess.js confirme** : en mode `sloppy`, `bxc6` est lu comme un coup de FOU. Eviter
    les prises de pion de la colonne b dans les lignes et les solutions (rencontre en composant
    la position type de l'Ecossaise).
  - **Bug trouve au passage** : `openOpeningByLine` ne transmettait pas `side` a l'explorateur, donc
    le camp du cours etait inconnu (rejeu en aveugle et detection de fuite cassés en silence).
- **v205-v211 - « TERMINE LA PARTIE » : LA LISTE SE REMPLIT, ET L'EXERCICE EST GUIDE.**
  Deux reproches du user, tous les deux traites, verifies sur ses 26 vraies parties gagnees puis
  perdues (26 cibles, pas 0).
  - **Le bug : la liste etait vide depuis l'accueil (js/coach.js, js/training.js).** `conversionTargets()`
    lit le tableau `games` du module Coach, et ce tableau n'est peuple que par `Coach.show()`
    (ouverture d'IndexedDB + `loadHosted()` sur `coach-data.json`). Depuis la routine de l'accueil
    (`runRoutineAction('convert')` → `Training.show('convert')`) ou depuis la carte CTA du Coach,
    on arrivait AVANT ce chargement : `Coach.conversionTargets()` renvoyait `[]` et l'onglet
    affichait « Rien a reconvertir pour l'instant » alors que l'archive en contient 26. Mesure
    faite en direct sur le live : `0` avant `ensureData()`, `26` apres. Nouveau
    **`Coach.ensureData()`** (promesse partagee, memoisee, invalidee sur changement de compte) qui
    charge les parties SANS ouvrir l'ecran Coach ; `renderConvert()` est devenu async, affiche
    « ⏳ Chargement de tes parties… » et re-tente une fois la promesse resolue (garde `convToken`
    si l'utilisateur change d'onglet entre-temps).
  - **Le fond : l'exercice etait un test, pas une lecon (js/replay.js).** Le mode `convert` etait
    muet par principe (« aucune aide affichee : ni eval, ni fleche, ni meilleur coup »), donc il le
    remettait dans la position qu'il avait deja perdue sans rien lui apprendre - un seul retour
    existait, l'avertissement « ton avantage vient de filer », APRES coup. Le mode est maintenant
    **accompagne** :
    - **Briefing** a l'ouverture : ce qu'il a en matiere (`edgeWords`, comptage de materiel :
      « une tour de plus », « une piece de plus »), l'eval du Coach quand elle porte sur CETTE
      position (`entry.evalCp` ; on ne retombe volontairement pas sur `maxEval`, qui est le maximum
      de toute la partie et affichait un faux « +10 »), et un **plan en 2 + 1 points** derive de la
      position (`conversionPlan`) : sa dame est encore la / echange les pieces garde les pions /
      finale : monte ton roi, plus la regle de tempo. Replie dans un `<details>` sous 900 px - ouvert,
      il repoussait l'echiquier sous la ligne de flottaison du telephone.
    - **A chaque trait** : l'eval au point de vue de SON camp (`fmtMe`, « +5 » veut toujours dire
      « je gagne »), la derive depuis le depart, et une **consigne** (`turnCue`) qui commence par le
      danger. Le balayage des **pieces en prise** reutilise le SEE de `js/tactics.js`
      (`boardOf` + `seeOn`), donc une piece defendue ne declenche rien : sur la premiere cible il
      annonce « Ta tour en g6 est en prise » - exactement la piece qu'il a perdue dans la partie.
    - **Indice en trois temps** a la demande (`hintFor`) : le theme, puis la piece et sa case, puis
      le coup. La **fleche bleue n'apparait qu'au troisieme** (`hintArrow`), et le compteur d'indices
      part dans le bilan. Le niveau se remet a zero a chaque coup et sur « Annuler ».
    - **Verdict commente sur chaque coup** au lieu du silence : meilleur coup / solide / imprecis /
      « laisse filer une partie de ton avantage » / « voila exactement le genre de coup qui te fait
      reperdre une partie gagnee », avec `Analyzer.explainBadMove` pour la menace et la reprise de
      l'ordi. Deux formulations distinctes de l'avantage (`advHold` en absolu sur un bon coup,
      `advDrop` comparatif sur un mauvais) : annoncer « tu passes de +6.9 a +6.3 » sur le MEILLEUR
      coup ne mesurait que le bruit de profondeur du moteur et se lisait comme un reproche. Au-dela
      de 3 pions perdus on retire le chiffre en centipions, la phrase le dit mieux.
    - **« ↶ Reprendre ce coup »** injecte dans le verdict apres une gaffe (delegation sur
      `#rp-verdict`, appelle `undo()`) : une erreur qui passe sans etre rejouee n'apprend rien.
      Habillage propre (`.rp-retry`) parce que `.train-btn` de base est clair sur clair ici.
    - **Bilan de fin** (`convRecap`) : coups joues, meilleurs coups, gaffes, indices - « converti /
      reperdue » seul ne disait pas ou ca s'etait joue.
  - Recette faite dans le navigateur sur le vrai `coach-data.json` : liste a 26 depuis l'accueil,
    briefing, alerte g6, les trois indices (theme → dame en d1 → Dh5 + fleche), le coup reel
    perdant (Td6) note « voila exactement le genre de coup… » avec « La tour est en prise ! » et le
    bouton de reprise, retour propre a la position apres reprise, meilleur coup (Dh5) note, mat de
    verification → « Converti ! » + bilan + `Training.logSession('conversion')`. Mode « Rejoue ta
    defaite » non regresse (fleche visible, bouton indice masque). Zero erreur console, mobile 375 px
    tient en un ecran.
- **v202-v204 - LA REVUE PEDAGOGIQUE, IMPLEMENTEE. 12 constats sur 12.**
  - Suite directe de la revue du 2026-08-28 (entree ci-dessous). Tout est fait, verifie en local sur
    ses 146 vraies parties, 39 tests unitaires verts.
  - **D1+D2 - une seule prescription (js/coach.js).** `renderFocus` classait les motifs APRES avoir
    retire `prise`/`defense`/`fourchette`/`gain`, puis collait « de loin ta fuite n°1 » en dur : la
    carte la plus visible du Coach ne pouvait afficher que les 5 motifs les plus RARES et prescrivait
    « Enfilade » (5 % des erreurs) pendant que 30 % étaient des pièces en prise. Nouveau
    `priorityOf(an)` (mémoïsé par WeakMap) classe TOUS les motifs tactiques ; `positionnel` reste
    exclu du classement car c'est un fallback, pas un diagnostic. La carte affiche désormais
    **« Arrête de laisser des pièces en prise »** et absorbe la ventilation vigilance quand le
    vainqueur est un motif de vigilance ; `renderVigilance` s'efface alors complètement (sinon elle
    reste, en carte secondaire, sans superlatif ni bouton primaire). « de loin » n'apparaît plus que
    si la part vaut ≥ 2× celle du second. Ordre du bandeau du haut revu : priorité, mot du coach,
    (vrai niveau + rythme), Termine la partie, dernières parties.
  - **D3 - plus de félicitations pour une opposition qui faiblit.** « Ta trajectoire » comparait deux
    moitiés sans regarder l'adversaire : elle disait « Continue comme ça » sur un bond 31 → 52 % de
    victoires obtenu contre du **134 points plus faible** (444 → 310), précision plate à 67 %.
    Elle porte maintenant un avertissement chiffré dès que l'Élo adverse bouge de ≥ 50 points, et
    « Continue comme ça » ne sort que si le progrès tient debout. « Tes coups forts » ne peut plus
    être désigné comme « le point qui régresse » (on ne s'entraîne pas à produire des coups
    brillants) et la phrase finale renvoie à la priorité réelle. **Nouvelle carte « 📏 Ton vrai
    niveau »** dans le bandeau du haut : son score contre plus fort (**0 % sur 22 parties**) contre
    plus faible (100 % sur 14) - la ligne la plus honnête du bilan, jusque-là enterrée en bas d'une
    carte à sept sections. Au passage, `renderTrends` comparait l'adversaire à la **moyenne de
    période** du joueur (`myAvg`, supprimé) : avec 437 points d'amplitude, un adversaire à 400
    passait pour « plus fort » même dans les parties jouées à 700. Une seule définition désormais,
    par partie, partagée par les deux cartes.
  - **D4 - la précision ne mesure rien en position décidée (js/analysis.js).** Mesuré sur ses
    parties : 26 % d'erreurs/coup à |éval| < 1,0, 47 % entre 2 et 4, **5,7 % dès |éval| ≥ 8,0**. La
    finale, qui arrive presque toujours après un +5 (69 parties sur 146), affichait donc 95 % et se
    faisait couronner « point fort ». `computeGameStats` produit maintenant **`phaseAccuracyContested`
    + `phaseErrorsContested`** (|éval AVANT le coup| < `CONTESTED_CP` = 300) à côté des compteurs
    bruts ; côté Coach, `phasePool()` préfère les compteurs disputés et **retombe** sur les bruts,
    donc rien ne casse avant la re-run. `hasContested()`/`accLabel()` nomment la métrique, et **tant
    que les compteurs disputés manquent, aucune carte n'annonce de « point fort » de phase** (ni le
    mot du coach, ni le radar - qui porte une note expliquant pourquoi). ⚠ **Nécessite une re-run
    complète du coach serveur** pour que les vrais chiffres apparaissent.
  - **D5 - `positionnel` était un fourre-tout présenté comme un diagnostic (js/training.js).**
    96 cartes sur 220 (44 %) portent le fallback de `detectMotif`. (1) Renommé
    **« Non tactique / à classer »** ; (2) la carte « faiblesses tactiques » devient
    « Répartition de tes ratés tactiques », ses pourcentages portent sur le **total tactique**
    (Pièce en prise passe de 18 % à 32 %) et le non-classé part dans une note ; (3) ces cartes
    changent de tâche : au lieu de « trouve LE coup » (où plusieurs coups se valent et l'app
    répondait « ❌ pas le meilleur coup » à un coup défendable) c'est une **comparaison de 3
    coups** - le meilleur, celui qu'il avait joué, et un leurre qui laisse du matériel (`buildChoices`
    / `renderChoiceCard` / `answerChoice`, réutilise `revealSolution` donc explication + SRS +
    « continuer à jouer » intacts) ; (4) `moveIsEquivalent` ne cherche plus seulement dans les
    lignes MultiPV (un 4e/6e choix raisonnable était rejeté d'office) : à défaut il **évalue la
    position obtenue** et compare, ce qui couvre tous les coups légaux.
  - **D6 - plus de verdict sur 2 parties.** Ouvertures : `MIN_VERDICT = 8` parties pour nommer une
    ligne forte/faible (avant : « la plus faible : Petrov, 0 % sur **2 parties** »), sinon une note
    le dit. Tendance du mot du coach : fenêtres de **20** parties au lieu de 10, seuil de 15 points -
    la version 10 vs 10 couvrait 9 jours avec une marge de ±30.
  - **M1 - « 🏁 Termine la partie », l'entraînement à la conversion.** Son plus gros gisement (il
    atteint +2 dans 87 de ses 146 parties et en perd 29) n'avait aucun exercice. Nouveau **mode
    `convert` de `js/replay.js`** : même coquille que « Rejoue ta défaite », mais **aide coupée** -
    pas de flèche bleue, pas d'éval, pas de note coup par coup. On mesure toujours en interne (il
    faut savoir quand l'avantage file) mais le seul retour pendant la partie est **un** avertissement,
    une seule fois, quand l'éval passe sous `CONV_SLIP` (120) alors qu'on partait de ≥ `CONV_WIN`
    (300). Bilan de fin : « Converti ! » ou « Reperdue », journalisé. Côté données,
    `Coach.conversionTargets()` prend les parties `result === 'loss' && maxUserEval >= 300`, avec le
    nouveau **`conversionMoment`** (1er instant où il est à ≥ +3 ET au trait, produit par
    analysis.js) et, en attendant la re-run, le **tournant** de la partie. `FreePlay.statusHtml`
    accepte `opts.hints === false` (il affichait TOUJOURS le meilleur coup et l'éval : c'est ce qui
    rendait l'exercice impossible). Nouvel onglet **Convertir** dans Entraîner (26 parties listées,
    triées par avantage max) + carte d'entrée dans le Coach + item de routine.
  - **M2 - Vigilance entraîne la PAUSE, plus le pile-ou-face.** L'exercice était un oui/non à 50 %
    de réussite au hasard **qui annonçait lui-même** laquelle des trois vérifications faire. Refait :
    on **clique la case du danger** (ou « Rien à signaler »), la question est toujours la même donc
    les deux vérifications doivent tourner à chaque fois, priorité défensive (ta pièce en prise
    d'abord, sinon la pièce adverse à prendre), et un **délai plancher de 10 s** (`VIG_DELAY_MS`,
    barre de progression, chip ⏱ pour le couper, mémorisé dans `chess-analyst-vig-delay`) masque
    les commandes : 50 % de ses erreurs sont des coups joués en moins de 15 s avec plus de la moitié
    de la pendule. Le 3e type de question (« tu envisages X, d'où vient la punition ? ») se répond
    aussi par une case. **Nouveau drill « coups 5 à 15 »** (`plyQueue`/`drillPly`, 206 cartes) -
    48 % de ses erreurs sont là. ⚠ Les cartes stockées portent **`moveNo`**, pas `ply` (d'où
    `moveNoOf`/`inMoveWindow`).
  - **M3 - la boucle de retour.** Rien n'enregistrait ce qui avait été travaillé ni quand, donc l'app
    ne pouvait pas répondre à « je drille depuis trois semaines, est-ce que j'en laisse moins en
    partie ? ». Journal `chess-analyst-sessions` (`logSession(kind, n, score, motif)`, 400 entrées
    max, alimenté par les 3 exercices) + carte **« 📶 Est-ce que ça marche ? »** : séances,
    exercices, taux de réussite au 1er coup, et surtout **gaffes + erreurs pour 100 coups AVANT vs
    APRES** la première séance (min 5 parties de chaque côté, sinon elle le dit).
  - **M4 - discipline de séance.** Ses bonnes journées tournent à 73-81 % de précision, les mauvaises
    à 44-52 %, et ce sont tous des enchaînements de défaites. Carte **« 📅 Tes séances de jeu »**
    (une ligne par jour : parties, bilan, pastilles V/D, précision, bord coloré) + comparaison
    mesurée bonnes/mauvaises journées + **alerte 🛑 sur la série de défaites EN COURS** à partir de
    2 (c'était affiché « 4 D » comme une stat neutre). La routine du jour porte la règle
    (« 2 défaites d'affilée = stop ») et son pied devient la règle des 15 secondes.
  - **M5 - carte « ♟ Ton système ».** Le Coach classait les performances par ligne sans jamais dire
    « réduis ». ⚠ Piège évité : avec les **Noirs**, la « famille » détectée est l'ouverture de
    l'ADVERSAIRE - recommander « garde l'Attaque Scholar » n'a aucun sens. On ne nomme une ligne que
    pour les Blancs (Viennoise, 9 parties, 72 %) ; pour les Noirs on donne le conseil structurel
    (une réponse à 1.e4, une à 1.d4).
  - **M6 - 5 finales de pions dans le cours (js/mates.js).** Le cours « Mats » devient
    **« Mats & finales »**, 21 figures. Nouveau groupe ⑤ : **règle du carré** (exercice à coup
    unique `b6`), **roi devant son pion** (demo `Ke6`), **course de pions** (2 exercices à coup unique
    `b4`), **pion de tour : la nulle du coin** (demo `Kf6`, la règle qui explique la moitié des
    « j'étais gagnant et ça a fait nulle »), **idee de Réti** (coup unique `Kg7`). Toutes les
    positions ont été vérifiées à **depth 28 avec MultiPV sur TOUS les coups légaux** : `b6`, `b4`
    et `Kg7` sont bien les seuls coups à ne pas jeter le résultat ; les deux autres sont marquées
    `demo` parce que plusieurs coups gagnent. ⚠ Les lignes multi-coups initiales ont été réduites à
    un coup : le format `sol` promet une **réponse forcée** aux index impairs, et le roi noir avait
    trois cases.
  - **CSS** : `.vig-gate*`, `.train-chip`, `.train-opt-move`, `.conv-*`, `.coach-truth-*`, `.sess-*`,
    `.coach-kpi*`, `.coach-note*`, `.sys-row`, `.coach-link-btn`, `.coach-flag-warn` (+ media query
    560px). Aucun débordement horizontal sur les 4 écrans, 0 erreur console.
  - **⚠ A FAIRE APRES LE DEPLOY : relancer l'analyse complète du coach** (GitHub Actions, workflow
    `analyze.yml`, non déclenchable en CLI). Sans elle, `phaseAccuracyContested` /
    `phaseErrorsContested` / `conversionMoment` restent absents de `coach-data.json` : l'app
    fonctionne (fallbacks en place, et elle DIT que les notes de phase ne sont pas encore
    recalculées), mais D4 n'affiche pas ses vrais chiffres et « Termine la partie » utilise le
    tournant de la partie au lieu du premier instant à +3.

- **2026-08-28 - REVUE PEDAGOGIQUE (pas une revue de code) : « est-ce que l'app fait progresser ? »**
  - Livrable : `revue_pedagogique.html` (racine, NON deploye, a laisser hors de git/Pages) + artifact
    « Revue pedagogique Chess Analyst ». En francais, palette ardoise/madder/jade, Instrument Serif
    + Karla. Aucun constat de style de code : la question posee est uniquement pedagogique.
  - **La these, tiree de `coach-data.json` du 25/08 (146 parties, 88 journalieres + 58 rapides) :**
    les 5 premieres parties de chaque cadence sont un CLASSEMENT PROVISOIRE (946 -> 758 en une seule
    partie), donc lire « chute 946->718 / 760->323 » est faux. Depuis le plancher reel : journalier
    **543 (13/05) -> 718 = +175** sur 82 parties ; rapide **266 (05/08) -> 323 = +57** sur 21. Et
    l'ecart entre cadences EST le diagnostic : journalier 74,1 % de precision / 4,9 gaffes pour 100
    coups / ACPL 100 ; rapide 67,1 % / 6,3 / 128. Meme joueur, meme repertoire, **+29 % de gaffes des
    que la pendule tourne**. Probleme d'attention sous pendule, pas de savoir.
  - **Le levier chiffre :** il atteint +2 ou mieux dans **87 des 146 parties** (60 %) et en **perd 29**
    (33 %) ; +5 ou mieux dans 69, en perd 13. **29 de ses 74 defaites sont des parties gagnees** (39 %).
    En rapide : 14 defaites sur 33, dont 10 depuis +5. Le Coach note deja « Conversion 61/100 » comme
    point faible et n'offre AUCUN exercice de conversion.
  - **Anatomie des 645 erreurs** (les 645 `blunderList` rejouees avec chess.js, echange statique sur la
    case d'arrivee) : 44 % surviennent alors qu'une prise gratuite existait DEJA pour l'adversaire ;
    33 % offrent du materiel juste apres le coup (dont **141 fois une piece entiere** : C 51, D 33,
    F 30, T 27) ; 25 % les deux ; **48 % entre les plis 10 et 30**. Cause unique : aucun inventaire des
    prises avant de jouer. La carte Rythme du Coach le confirme : **50 % des erreurs jouees en < 15 s
    avec plus de la moitie de la pendule**, et 2 % seulement en zeitnot.
  - **6 constats « l'app te trompe » (D1-D6), verifies dans le code :**
    - **D1 (P0)** `renderFocus` (js/coach.js:591) retire `prise`/`defense`/`fourchette`/`gain` du
      classement puis colle un superlatif code en dur -> la carte la plus visible du Coach affiche
      « Travaille : **Enfilade** (10 occurrences, 5 %) - c'est de loin ta fuite n°1 ». Elle ne peut
      STRUCTURELLEMENT jamais montrer la vraie faiblesse, et `FOCUS_HEADLINE` contient des accroches
      MORTES (« Arrete de laisser des pieces en prise ») pour exactement les motifs que le filtre exclut.
    - **D2 (P0)** quatre cartes 🎯 a bouton d'action donnent quatre priorites, trois se declarent n°1
      (Le mot du coach = gaffes ; Vigilance = pieces en prise ; Priorite = enfilade ; Faiblesses
      tactiques = piece en prise). La seule fausse est celle qui s'appelle « Ta priorite ».
    - **D3 (P1)** « Ta trajectoire » conclut « Continue comme ca » alors que l'Elo adverse moyen est
      passe de **444 a 310** entre les deux moities et que la precision est PLATE (67 -> 67 %). Meme
      confusion derriere « ↓ 41 % mieux qu'avant ». La ligne honnete existe et est enterree en bas
      d'une carte : **0 % de victoires contre +25 ou plus fort**, 72 % contre plus faible.
    - **D4 (P1)** « la finale est ton point fort (95 %) » = artefact de saturation WDL. Mesure sur ses
      parties : taux d'erreur/coup 26 % a |eval| < 1,0 ; 47 % a 2-4 ; **5,7 % des que |eval| >= 8,0**.
      Ses finales arrivent presque toujours apres un +5 (69/146) et il les joue a **3,4 s/coup** contre
      13 au milieu. Correctif : precision par phase sur les seuls coups DISPUTES (|eval| < 3,0).
    - **D5 (P2)** `'positionnel'` est le fallback de `detectMotif` (js/training.js:453) = **96 cartes
      sur 220, 44 %**. Double degat : le Coach dit a un joueur ~320 que sa faiblesse n°1 est le jeu
      positionnel ; et 44 % du paquet SRS n'a pas de solution forcante (« Pas le meilleur coup » sur
      un coup defendable). A noter : `moveIsEquivalent` tolere 30 cp mais cherche le coup dans les
      lignes MultiPV -> un 4e choix raisonnable est rejete d'office.
    - **D6 (P2)** verdicts sur echantillons minuscules : « la plus faible : Petrov, 0 % sur **2
      parties** » ; et la phrase de tendance compare 10 parties a 10 parties sur **9 jours** (5 -> 14
      aout, marge +/-30 pts). Seuils proposes : 8 parties pour nommer une ouverture faible, 20 par
      fenetre pour annoncer une tendance.
  - **6 briques manquantes (M1-M6) :**
    - **M1 (P0)** « Termine la partie » : charger la position d'une vraie partie perdue au moment du
      premier +3 et la jouer contre Stockfish. `js/replay.js` + `js/freeplay.js` font deja 90 % du
      travail ; **il manque un `hints:false`** - FreePlay affiche TOUJOURS la fleche du meilleur coup
      et l'eval, donc impossible de s'entrainer a convertir. Filtre : `maxUserEval >= 300 &&
      result === 'loss'`.
    - **M2 (P0)** entrainer la PAUSE : (a) delai plancher de 10 s sur Vigilance (boutons grises) ;
      (b) Vigilance passe du oui/non (50 % au hasard, ET la question annonce quelle verification faire)
      a « **clique la case du danger, ou rien** », mode tire au sort en silence ; (c) mode
      « coups 5-15 » via `it.ply` (48 % des erreurs).
    - **M3 (P1)** boucle de retour : le paquet stocke `reps/interval/ease/due` mais RIEN n'enregistre ce
      qui a ete travaille et quand -> l'app ne peut pas repondre « je drille X depuis 3 semaines,
      est-ce que j'en laisse moins en partie ? ». Journal de session + une carte Coach. C'est la seule
      carte qui prouverait que l'app marche.
    - **M4 (P1)** discipline de seance : bons jours 76-81 % de precision, mauvais **44-52 %** (29/07 :
      6 parties 2V-4D acc 52 ; 04/08 : 0V-2D acc 44 ; 14/08 : 0V-3D acc 52), tous des enchainements de
      defaites. Regle d'arret « 2 defaites d'affilee = stop », carte par journee, et la serie de
      defaites en cours passe en avertissement des 2 (aujourd'hui « 4 D » est une stat neutre).
    - **M5 (P2)** repertoire : 6+ familles en 29 parties avec les Blancs ; le conseil manquant est
      « **reduis** » (1.e4 + Viennoise = sa meilleure ligne, 72 % de precision / 6-0-3, plus une reponse
      a 1.e4 et une a 1.d4). Tension a assumer : le pied de la routine dit « les ouvertures, plus tard »
      alors que l'arbre + les cours sont la plus grosse piece de l'app (~130 ko de JS).
    - **M6 (P2)** plus de module de finales : les Mats couvrent bien roi+dame et roi+tour, mais rien sur
      roi+pion contre roi / regle du carre / quand echanger pour entrer dans une finale gagnee. C'est
      exactement la technique qui transforme un +5 en victoire.
  - **Bug de donnees a noter :** `playedSan` de `blunderList` melange **deux notations** - francaise pour
    445 entrees ("Ce4", "Fxa3", "Db4"), anglaise pour 200 - le champ est donc inexploitable par une
    machine sans detection de dialecte. `bestUci`, lui, est legal sur les 645 positions.
  - **README perime :** il annonce 5 onglets dont « Finales » (supprime en v150, remplace par les Mats)
    et decrit un onglet « Menaces » dans Entrainer qui s'appelle « Vigilance ».
  - **Rien n'a ete implemente** : revue seule, aucun fichier de l'app touche, APP_VERSION inchangee (201).

- **v201 - Section Ouvertures sur mobile : plus d'arbre, on descend niveau par niveau**
  - User : « en mode mobile, enlève complètement l'arbre des ouvertures, toutes les fioritures
    inutiles (le "tourne ton téléphone", les tags ouvertes/semi-ouvertes, les boutons paysage /
    focus / tout déplier). Concentre-toi sur l'échiquier, la navigation via la search bar ou en
    descendant : Ouvertures > Pion roi > Italienne. »
  - Sous **899px** (ou paysage ≤600px de haut) le panneau `#panel-tree` masque en CSS le canvas de
    l'arbre, la légende des familles et les boutons Focus/Tout déplier/Replier. Il reste : la
    recherche, un **fil d'Ariane**, un grand échiquier, la liste des suites.
  - **Fil d'Ariane** `#ot-crumb` (`renderCrumb`, appelé par `select`) : `Ouvertures › 1.e4 Pion roi
    › … › nœud courant`, chaque échelon cliquable + un bouton ◀ pour remonter d'un cran. C'est le
    SEUL moyen de remonter une fois l'arbre masqué. Il défile horizontalement (`scrollLeft =
    scrollWidth` après rendu, pour garder la fin du chemin visible) et n'existe pas sur desktop,
    où l'arbre montre déjà le chemin.
  - **Les « Suites » deviennent la descente** : les mêmes puces `.ot-nm` passent en lignes pleine
    largeur de 48 px (icône du nœud + coup + nom + chevron ›). Deux spans ajoutés au markup
    (`.ot-nm-ic`, `.ot-nm-go`), masqués sur desktop où la puce reste une chip.
  - **Ordre de lecture** : `.ot-detail-board` et `.ot-txt` passent en `display: contents` sur
    mobile, ce qui met tout le contenu de la fiche dans le même flex et le rend ordonnable :
    nom → ECO/famille → échiquier (`min(92vw, 62vh, 440px)`) → liens → idée → suites → plans.
  - **Code mort supprimé** : le bandeau « tourne ton téléphone », le bouton ⟳ Paysage et tout le
    verrouillage d'orientation (`lockLandscape`/`toggleLandscape`/`observePanelClose`, ~40 lignes)
    - c'était la contournement du problème que cette version supprime. La media query paysage qui
    remettait l'arbre en grille a disparu avec.
  - ⚠️ `.panel-body.ot-body` était `overflow: hidden` (le canvas de l'arbre faisait le défilement) ;
    sur mobile il redevient le scroller (`overflow-y: auto`), sinon la fiche est coupée.
  - Vérifié en preview à 375×812, 812×375 et 1280×900 : descente Ouvertures → Pion roi → Jeux
    ouverts → Cavalier roi → Défense de e5 → Italienne, retour ◀ et clic sur un ancêtre, recherche
    « najdorf » qui atterrit avec le chemin complet, échiquier 345 px, lignes 48 px, aucun
    débordement horizontal, 0 erreur console ; desktop inchangé (95 cartes, 32 branches tracées,
    fil d'Ariane masqué, puces en ligne).
- **v200 - Barres collantes du cours : plus de transparence**
  - User : « pas terrible la barre en mode transparente sur les variantes, ça fait des
    superpositions bizarres ». Diagnostic : `.opening-sibs` avait `background: var(--line-str)`,
    soit **rgba(255,255,255,.12)**, en `position: sticky` avec `z-index: 6` - le contenu
    defilait donc visiblement au travers. Meme symptome sur l'echiquier collant, dont l'ombre
    portee floue (`0 6px 14px -8px rgba(0,0,0,.8)`) laissait transparaitre le texte.
  - Fond PLEIN partout (`--bg-2` pour la barre, `--bg-card` pour l'echiquier), ombre remplacee
    par un `border-bottom` net, et les traits entre boutons deviennent de vraies
    `border-left` au lieu d'un `gap` qui laissait passer le fond translucide.
  - ⚠️ Regle : toute surface `sticky` de cette modale doit avoir un fond OPAQUE. Un `gap` sur un
    conteneur colle laisse voir ce qui defile dessous.
- **v196-v199 - Cours d'ouverture : deux écrans sur mobile**
  - User : « marche très bien sur desktop, beaucoup moins sur l'app mobile », puis validation de la
    maquette `_mockups/opening-mobile-mockup.html`, avec la consigne « garde bien l'accès facile à
    la recherche et autocomplétion des ouvertures ».
  - Le rail devenait un fil horizontal sous 900px. Mesuré à 390px sur la v195 : **25 % de l'arbre
    visible**, **0 noeud sur 5** entièrement lisible sans défilement latéral, **12 px d'indentation
    pour tous** (traits de branche désactivés, la fourche disparaissait), échiquier **non collant**
    qui sortait du champ dès qu'on lisait.
  - Deux écrans, pilotés par les classes **`m-map`** et **`m-branch`** sur `.opening-modal` (le
    desktop les ignore, ses trois colonnes ne bougent pas) :
    - **carte** = l'arbre en pleine largeur, indentation réelle 18/40/62 px et traits de branche ;
    - **branche** = `.opening-modal-left` en `position: sticky`, qui se replie en **`m-compact`**
      au-delà de 26 px de défilement (échiquier 343 → 104 px, le commentaire du coup passe à côté).
  - **`#opening-sibs`** : barre des branches sœurs collée en bas (sœur = même profondeur ET même
    parent, le parent étant le noeud précédent le plus proche de profondeur n-1).
  - **Recherche préservée** : la recherche + autocomplétion vit sur l'écran d'arbre, DERRIÈRE la
    modale (`#ot-search`, `js/opening-tree.js`). Un bouton **🔍** sur l'écran carte ferme la modale
    et met le focus dans le champ - sinon chercher une autre ouverture aurait coûté trois gestes.
  - `#opening-modal-explanation` **déplacé dans la colonne gauche**, sous l'échiquier : c'est du
    coup courant qu'il parle, et sur mobile il doit rester collé à la position.
  - ⚠️ **Trois pièges CSS rencontrés, à ne pas réintroduire** :
    1. les règles de base de `.opening-modal-back/.opening-modal-search` étaient APRÈS la media
       query : à spécificité égale la dernière gagne, les boutons restaient invisibles ;
    2. `.m-map .obr-node { padding: ... }` en raccourci écrasait le `padding-left` des `.d1/.d2`
       (plus spécifique), l'indentation retombait à 0 - les profondeurs sont redéclarées dans le
       bloc `m-map` ;
    3. déplacer le commentaire dans la colonne gauche lui a fait hériter d'un `max-width: 760px`
       qui élargissait la colonne et réduisait la lecture desktop à **145 px** ; la colonne gauche
       est désormais bornée à `var(--ex-board)`.
  - Vérifié à 390 px : 5/5 noeuds visibles (contre 0/5), indentation 18/40/62, cibles ≥ 56 px, pas
    de débordement, échiquier collant qui reste à l'écran, 3 sœurs, 2 pièges sur la bonne branche,
    0 erreur console. Espagnole (fourche imbriquée), Scandinave et Londres vérifiées aussi.
    Desktop inchangé : rail 250 / échiquier 518 / lecture 366.
- **v191-v195 - Cours d'ouverture : l'ARBRE remplace les six onglets**
  - User : « pas 100% convaincu par les cours sur les ouvertures, on retrouve pas la logique des
    embranchements / variantes de l'arbre, y'a des redondances, sous-menus pas très clairs
    (lignes, transpositions, pièges), l'espace est mal utilisé ». Maquette validée d'abord
    (`_mockups/opening-course-mockup.html`), puis implémentée.
  - Les six onglets (Présentation / Lignes / Plans / Pièges / Transpositions / Quiz) découpaient la
    matière par TYPE de contenu. Une ouverture se structure par POSITION dans l'arbre : tout
    découlait de là.
  - **`Courses.buildBranches(course)`** dérive l'arbre des `lines[].sans` par un trie. Là où deux
    lignes divergent, il y a une fourche ; les suites forcées sont repliées en un noeud (sinon
    25 à 35 entrées par cours). **Rien n'a été ressaisi** : la structure était déjà dans les
    données. 9 cours -> 37 noeuds, 3 à 5 par cours, la bonne fourche à chaque fois.
  - **`Courses.spread(items, branches)`** répartit pièges et questions. Champ `at:` = index de
    ligne, posé sur **32 des 48 éléments** d'après le texte existant, qui nomme sa branche
    (« Dans les Deux Cavaliers… »). Sans `at`, l'élément vaut pour toute l'ouverture et reste sur
    la tabiya - donc ne rien poser ne peut pas régresser.
    ⚠️ La répartition est GLOBALE, pas noeud par noeud : une ligne traverse plusieurs noeuds
    (« 3…a6 » PUIS « 4.Fa4 → 8…O-O » sont tous deux de la ligne 0), un filtre local faisait
    apparaître 7 pièges deux fois. On prend le noeud le plus PROFOND qui porte la ligne.
  - **Redondance supprimée** : les entrées de `transpositions` dont le libellé est un coup déjà
    présent dans la fourche sont retirées à l'affichage. C'était le doublon le plus visible
    (`Transpositions[0]` = « 3…Fc5 » = `Lines[0]` = « Giuoco Piano »). Restent les vraies
    déviations hors arbre (« 3…Fe7 », « Ordre des coups »).
  - **Les notes de coup passent sur le pas-à-pas** : `loadLine(sans, b.allNotes)` au lieu de
    relister les coups en texte. L'échiquier redevient utile (il était figé sur une position
    morte) et le contenu par noeud fond. On atterrit sur le PREMIER coup de la branche, pas sur
    sa fin.
  - **Espace** : colonne droite remplie à 32-42 % sur Plans/Transpo/Quiz avant. Après, contenu
    médian par branche **477 px** (205 à 962). La tabiya concentre le niveau ouverture
    (995-1669 px) ; ses deux blocs secondaires (Plans, déviations hors arbre) sont repliables.
  - **50 lignes de CSS mort** retirées (`.ol-tab`, `.ol-line-btn`, `.opening-lesson-picker`) :
    l'arbre remplace à la fois la barre d'onglets et le sélecteur de ligne.
  - Vérifié : 9 cours parcourus noeud par noeud, 0 erreur console ; pas-à-pas commenté OK ;
    ouverture SANS cours (`e4 c5`) garde la vue plate, pas de régression ; 390 px sans
    débordement, rail en fil horizontal défilable, noeuds à 44 px.
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
