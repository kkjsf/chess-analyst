# Chess Analyst

Analyseur de parties d'echecs pour joueurs debutants/intermediaires. PWA en francais avec analyse Stockfish, explications pedagogiques, coach cross-parties et entrainement tactique.

**[Ouvrir l'app](https://kkjsf.github.io/chess-analyst/)**

L'app s'organise en 5 onglets (barre de navigation en bas) : **Analyser**, **Coach**, **Apprendre**, **Entrainer**, **Finales**.

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
- Taux de victoire, repertoire d'ouvertures, points faibles par phase
- Profil du joueur (radar) et decomposition des faiblesses tactiques
- Entrainement bati sur **vos propres erreurs**

L'analyse tourne **cote serveur** (GitHub Actions), se met a jour automatiquement chaque semaine, et l'app telecharge un petit fichier de resultats (`coach-data.json`). Options manuelles : `⟳ Actualiser`, "Analyser ici" (dans le navigateur, pour quelques parties), ou relance complete serveur. Le bilan est conserve hors-ligne.

## Apprendre

Hub pedagogique regroupant plusieurs panneaux :
- **Tactiques & concepts** : ~35 motifs illustres (fourchette, clouage, zwischenzug, mats classiques...) avec entrainement 🎯 directement sur l'echiquier
- **Ouvertures** : explorateur des grandes ouvertures, coup par coup
- **Notation des echecs** : lire/ecrire les coups + quiz
- **Guide d'utilisation** : import, lecture de l'analyse, couleurs, Coach
- **Comment ca marche** : Stockfish, Multi-PV, score de precision (WDL) et limites

## Entrainer

Trainer tactique en trois onglets :
- **🧩 Puzzles** : exercices tactiques a resoudre sur l'echiquier
- **👁️ Menaces** : reperer la menace adverse
- **📊 Motifs** : drills verifies par motif tactique

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

Avant chaque deploy, bumper la version du cache :
- `sw.js` : `CACHE_NAME`
- `index.html` : tous les `?v=XX`
