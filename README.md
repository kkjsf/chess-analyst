# Chess Analyst

Analyseur de parties d'echecs pour joueurs debutants/intermediaires. PWA en francais avec analyse Stockfish, explications pedagogiques et detection de motifs tactiques.

**[Ouvrir l'app](https://kkjsf.github.io/chess-analyst/)**

## Fonctionnalites

### Import de parties
- Coller un PGN ou glisser-deposer un fichier `.pgn`
- Import direct depuis Chess.com (partager une URL ou coller un lien)
- Share Target Android (partager depuis l'app Chess.com)

### Analyse moteur
- Stockfish WASM avec MultiPV 3, 1.5s par position
- Scoring de precision base sur le modele WDL (win%)
- Classification des coups : brillant, meilleur, tres bon, correct, imprecision, erreur, gaffe
- Fleches colorees : vert (meilleur coup), bleu (alternatives)

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

### Historique et tendances
- 20 dernieres parties en localStorage
- Cache d'analyse (5 dernieres)
- Tendances cross-parties : taux de victoire par ouverture, precision par phase, distribution des gaffes

## Stack technique

- Vanilla HTML/CSS/JS (zero framework, zero build step)
- [chess.js](https://github.com/jhlywa/chess.js) 0.12.1 (UMD)
- Stockfish WASM (asm.js fallback)
- Echiquier SVG custom
- PWA : service worker + manifest + Share Target POST

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
