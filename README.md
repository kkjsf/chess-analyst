# Chess Analyst

Analyseur de parties d'echecs pour joueurs debutants/intermediaires. PWA en francais avec analyse Stockfish, explications pedagogiques, coach cross-parties et entrainement tactique.

**[Ouvrir l'app](https://kkjsf.github.io/chess-analyst/)**

L'app s'organise en 4 onglets (barre de navigation en bas, sidebar sur desktop) : **Analyser**, **Coach**, **Apprendre**, **Entrainer**.

## Analyser

### Import de parties
- Coller un PGN ou glisser-deposer un fichier `.pgn`
- Import direct depuis Chess.com (partager une URL ou coller un lien)
- Parties privees (bot/coach) : coller la liste des coups telle qu'affichee sur Chess.com
- Share Target Android (partager depuis l'app Chess.com)

### Analyse moteur
- Stockfish WASM avec MultiPV 3, 1.5s par position (analyse locale, hors-ligne)
- Scoring de precision base sur le modele WDL (win%)
- Classification des coups : brillant, meilleur, excellent, correct, imprecision, erreur, gaffe
- Fleches colorees : vert (meilleur coup), bleu (alternatives), coups alternatifs cliquables
- Barre d'evaluation verticale
- Navigation clavier, curseur, ou glisser sur l'echiquier (mobile)

### Explications pedagogiques
- **Evaluation numerique** : "+1.2 pion d'avantage" au lieu de descriptions vagues
- **Pourquoi c'est mauvais** : piece en prise, fourchette adverse, echec dangereux, pions doubles
- **Tips positionnels sur coups neutres** : developpement, tour en colonne ouverte, cavalier centralise, fianchetto, paire de fous, poussee de pion central
- **Detection de fourchettes** : cavalier, pion, fou, tour, dame
- **Menaces adverses** : captures, echecs, mats annonces

### Contexte de partie
- Detection d'ouverture ECO (~190 ouvertures, noms francais)
- Resume narratif : synthese de la partie, barres de precision, ouverture + date
- Profil d'erreurs : tactique vs positionnel, distribution par phase, correlation au temps
- Tips de finale : conseils educatifs pour ~15 types de finales (tablebases Lichess)
- Moments cles : les 5 coups les plus importants avec badges et explications
- Parties recentes (20) et cache d'analyse (5 dernieres) en localStorage

## Coach

Analyse l'**ensemble** de vos parties Chess.com pour en tirer un bilan global :
- **Une seule prescription** en haut du bilan (« Ta priorite en ce moment »), classee sur tous les motifs sans filtre - les autres cartes montrent leurs chiffres sans se declarer n°1
- **Ton vrai niveau** : ton score contre des adversaires plus forts que toi, le seul repere qu'une opposition qui faiblit ne peut pas gonfler
- **Ton rythme** : la part de tes erreurs jouees en moins de 15 s avec la pendule pleine
- **Termine la partie** : les parties que tu menais nettement et que tu as perdues
- **Est-ce que ca marche ?** : tes erreurs en partie avant / apres le debut de ton entrainement
- **Tes seances de jeu** : une ligne par journee (parties, bilan, precision) + la regle d'arret a 2 defaites d'affilee
- **Ton systeme** : combien d'ouvertures differentes tu joues, et laquelle garder
- Taux de victoire, repertoire, profil du joueur (radar), faiblesses tactiques
- Toute comparaison « avant / apres » est normalisee par l'**Elo adverse**, et aucun verdict n'est rendu sous 8 parties (ouverture) ou 20 parties par fenetre (tendance)
- Entrainement bati sur **vos propres erreurs**

L'analyse tourne **cote serveur** (GitHub Actions), se met a jour automatiquement chaque semaine, et l'app telecharge un petit fichier de resultats (`coach-data.json`). Options manuelles : `⟳ Actualiser`, "Analyser ici" (dans le navigateur, pour quelques parties), ou relance complete serveur. Le bilan est conserve hors-ligne.

## Apprendre

Hub pedagogique regroupant plusieurs panneaux :
- **Tactiques & concepts** : ~35 motifs illustres (fourchette, clouage, zwischenzug...) avec entrainement 🎯 directement sur l'echiquier
- **Mats & finales** : 21 figures - les schemas de mat essentiels (couloir, etouffe, roi+dame, roi+tour...) et les **5 regles des finales de pions** (regle du carre, roi devant son pion, course de pions, nulle du pion de tour, idee de Reti)
- **Ouvertures a connaitre** : la check-list de l'essentiel a ce niveau
- **Ouvertures** : explorateur des grandes ouvertures en arbre, coup par coup
- **Notation des echecs** : lire/ecrire les coups + quiz
- **Guide d'utilisation** : import, lecture de l'analyse, couleurs, Coach
- **Comment ca marche** : Stockfish, Multi-PV, score de precision (WDL) et limites

## Entrainer

Trainer en quatre onglets, tous alimentes par **tes propres erreurs** :
- **🧩 Puzzles** : tes erreurs en repetition espacee (SM-2). Les cartes sans solution forcante deviennent une **comparaison de 3 coups** plutot qu'un « trouve LE coup »
- **🛡️ Vigilance** : l'inventaire des prises. Tu **cliques la case** du danger (ou « rien »), apres un **delai plancher de 10 s** - c'est la pause qu'on entraine, pas seulement le motif. Desactivable.
- **🏁 Convertir** : « Termine la partie ». Reprend une partie que tu menais nettement et que tu as perdue, a la position ou ca a bascule, et la rejoue contre Stockfish **sans aucune aide affichee** (ni eval, ni meilleur coup)
- **📊 Motifs** : drills par motif tactique, plus une fenetre **« coups 5 a 15 »** (la sortie d'ouverture, ou tombe la moitie des erreurs)

## Stack technique

- Vanilla HTML/CSS/JS (zero framework, zero build step)
- [chess.js](https://github.com/jhlywa/chess.js) 0.12.1 (UMD)
- Stockfish WASM (asm.js fallback)
- Echiquier SVG custom
- Coach cote serveur via GitHub Actions (`coach-data.json`)
- PWA : service worker + manifest + Share Target POST
- UI mobile-first : bottom nav 5 onglets, jauge de precision, bannieres de moments cles

## Utilisation locale

Servir le dossier avec n'importe quel serveur statique :

```bash
npx serve .
```

Ou ouvrir `index.html` directement (le service worker necessite HTTPS ou localhost).

## Deploiement

Push sur `main` deploie automatiquement via GitHub Pages.

Avant chaque deploy, bumper **uniquement** `window.APP_VERSION` en haut de `index.html` :
`sw.js` derive `CACHE_NAME` du `?v=`, et tous les assets sont charges avec ce meme `?v=`.
Le service worker est cache-first, donc il faut bumper a **chaque** edit.
