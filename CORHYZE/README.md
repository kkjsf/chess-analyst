# CORHYZE — Extraction des données d'irrigation

Exploration de l'API **CoRHIZE v2** et extraction d'un dataset agronomique
(parcelles, cultures, irrigation, précipitations), conforme aux exigences de la
page Confluence *« Requirements for Dataset extract – Irrigation coRHYZE »*
(espace PROD / EDAGRO).

👉 **Topo complet** : ouvrir [`rapport.html`](rapport.html) dans un navigateur.

## Contenu

| Fichier | Rôle |
|---|---|
| `corhize_extract.py` | Script d'extraction (les 3 livrables en une passe) |
| `compute_stats.py` | Calcul des statistiques → `stats.json` |
| `rapport.html` | Topo technique (API, données, méthode, livrables) |
| `.env.example` | Modèle d'identifiants |
| `data/` | Datasets produits (CSV/texte + GeoPackage + Shapefile) |

## Utilisation

```bash
pip install requests pandas geopandas shapely pyogrio

export CORHIZE_USER=...          # ou copier .env.example -> .env
export CORHIZE_PASSWORD=...

python corhize_extract.py --outdir data --from 2017-01-01
python compute_stats.py
```

Options utiles : `--to YYYY-MM-DD`, `--max-plots N` (test rapide),
`--plots-only` (objectif a seul).

## Fichiers produits dans `data/`

- **Objectif a** — `plots.csv` : liste des parcelles.
- **Objectif b** — `plot_details.csv` (texte) + `plots.gpkg` / `plots.shp` (géospatial) : cultures, dates de semis, surface, géométrie.
- **Objectif c** — `plot_data_long.csv` (texte, format long) + `plot_data_summary.csv` + `plot_data.gpkg` : irrigation & précipitations (date + quantité), et tout autre `data_type` peuplé.

## À retenir (jeu de données actuel)

- 243 parcelles, 1 client anonymisé, historique observé à partir de **2023** (pas 2017).
- Seuls `irrigation` et `rainfalls` sont peuplés ; `ndvi / pet / weather / soilmoisture` sont vides pour ce compte.
- Libellés de culture à normaliser (« Maïs semence » vs « MAIS_SEMENCE », suffixe « * »).
- Le `POST /token` exige un corps de requête, sinon le WAF renvoie un 403 trompeur (géré par le script).

_Aucun identifiant n'est stocké dans ce dépôt — ils sont lus depuis l'environnement._
