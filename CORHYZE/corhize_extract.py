#!/usr/bin/env python3
"""
Extraction des donnees d'irrigation CoRHIZE (API v2).

Produit les 3 livrables decrits dans la page Confluence
"Requirements for Dataset extract - Irrigation coRHYZE" :

  a. Liste de toutes les parcelles                      -> plots.csv
  b. Details des parcelles (crops + seeding + area + geometrie)
        - fichier texte                                 -> plot_details.csv
        - fichier geospatial                            -> plots.gpkg (+ plots.shp)
  c. Donnees des parcelles (irrigation, pluie, ... : date + quantite)
        - fichier texte (format long)                   -> plot_data_long.csv
        - resume par parcelle/type                      -> plot_data_summary.csv
        - fichier geospatial (polygones + agregats)     -> plot_data.gpkg

Identifiants lus dans l'environnement (voir .env.example) :
  CORHIZE_API_URL   (defaut: https://portail.corhize.com/api/v2/)
  CORHIZE_USER
  CORHIZE_PASSWORD

Usage :
  CORHIZE_USER=... CORHIZE_PASSWORD=... python corhize_extract.py [--outdir data] \
      [--from 2017-01-01] [--to today] [--limit N] [--plots-only]
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import datetime as dt
from pathlib import Path

import requests
import pandas as pd
import geopandas as gpd
from shapely import wkt as shapely_wkt

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
API_URL = os.environ.get("CORHIZE_API_URL", "https://portail.corhize.com/api/v2/").rstrip("/") + "/"
USER = os.environ.get("CORHIZE_USER", "")
PASSWORD = os.environ.get("CORHIZE_PASSWORD", "")

# Types de donnees a demander (mandatory + should-have). L'API ignore
# silencieusement ceux qui n'existent pas pour une parcelle donnee.
DATA_TYPES = ["irrigation", "rainfalls", "ndvi", "pet", "weather", "soilmoisture"]

# Un User-Agent "navigateur" evite un blocage WAF ; un corps de requete est
# obligatoire sur POST /token (sinon le WAF renvoie un 403 Apache).
UA = "Mozilla/5.0 (X11; Linux x86_64) CoRHIZE-extract/1.0"
TIMEOUT = 60


class CorhizeClient:
    def __init__(self, api_url: str, user: str, password: str):
        self.api_url = api_url
        self.user = user
        self.password = password
        self.session = requests.Session()
        self.session.headers["User-Agent"] = UA
        self.token: str | None = None

    def authenticate(self) -> None:
        # NB: data="" force un Content-Length -> contourne la regle WAF.
        r = self.session.post(
            self.api_url + "token",
            auth=(self.user, self.password),
            data="",
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        payload = r.json()
        self.token = payload["token"]
        self.session.headers["Authorization"] = f"Bearer {self.token}"
        print(f"  [auth] token obtenu (expire {payload.get('token_expiration')})")

    def get(self, path: str, params: dict | None = None) -> dict | list:
        url = self.api_url + path.lstrip("/")
        last_exc: Exception | None = None
        for attempt in range(4):
            try:
                r = self.session.get(url, params=params, timeout=TIMEOUT)
                if r.status_code == 401:  # token expire -> re-auth puis retry
                    self.authenticate()
                    r = self.session.get(url, params=params, timeout=TIMEOUT)
                r.raise_for_status()
                return r.json()
            except requests.RequestException as e:  # erreurs reseau -> backoff
                last_exc = e
                time.sleep(2 ** attempt)
        raise last_exc  # type: ignore[misc]

    def list_plots(self, limit: int = 100000) -> list[dict]:
        return self.get("plots", params={"$limit": limit})  # type: ignore[return-value]

    def plot_detail(self, code: str) -> dict:
        return self.get(f"plots/{code}", params={"geometry": "wkt"})  # type: ignore[return-value]

    def plot_data(self, code: str, data_types: list[str], date_from: str, date_to: str) -> dict:
        params = {"data_types": ",".join(data_types), "from": date_from, "to": date_to}
        return self.get(f"plots/{code}/data", params=params)  # type: ignore[return-value]


def _safe_wkt(w: object) -> object:
    if not isinstance(w, str) or not w:
        return None
    try:
        return shapely_wkt.loads(w)
    except Exception:  # noqa: BLE001 - geometrie WKT invalide cote API
        return None


def to_geodataframe(rows: list[dict], wkt_col: str = "geometry") -> gpd.GeoDataFrame:
    df = pd.DataFrame(rows)
    geom = df[wkt_col].apply(_safe_wkt)
    n_bad = int(geom.isna().sum())
    if n_bad:
        bad_codes = df.loc[geom.isna(), "code"].tolist()
        print(f"  [warn] {n_bad} geometrie(s) invalide(s) ignoree(s): {bad_codes}")
    gdf = gpd.GeoDataFrame(df.drop(columns=[wkt_col]), geometry=geom, crs="EPSG:4326")
    return gdf


def main() -> int:
    p = argparse.ArgumentParser(description="Extraction dataset irrigation CoRHIZE")
    p.add_argument("--outdir", default="data", help="dossier de sortie")
    p.add_argument("--from", dest="date_from", default="2017-01-01", help="date de debut (YYYY-MM-DD)")
    p.add_argument("--to", dest="date_to", default=dt.date.today().isoformat(), help="date de fin (YYYY-MM-DD)")
    p.add_argument("--limit", type=int, default=100000, help="nb max de parcelles")
    p.add_argument("--max-plots", type=int, default=0, help="ne traiter que les N premieres parcelles (test)")
    p.add_argument("--plots-only", action="store_true", help="objectif a uniquement")
    args = p.parse_args()

    if not USER or not PASSWORD:
        print("ERREUR: definir CORHIZE_USER et CORHIZE_PASSWORD dans l'environnement.", file=sys.stderr)
        return 2

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    client = CorhizeClient(API_URL, USER, PASSWORD)
    print("[1/4] Authentification...")
    client.authenticate()

    # ------------------------------------------------------------------ a. #
    print("[2/4] Liste des parcelles (objectif a)...")
    plots = client.list_plots(limit=args.limit)
    df_plots = pd.DataFrame(plots)
    df_plots.to_csv(outdir / "plots.csv", index=False)
    print(f"  -> {len(df_plots)} parcelles ecrites dans plots.csv")

    if args.plots_only:
        return 0

    codes = df_plots["code"].tolist()
    if args.max_plots:
        codes = codes[: args.max_plots]
        print(f"  (mode test: {len(codes)} parcelles)")

    # ------------------------------------------------------------------ b. #
    print("[3/4] Details + geometrie des parcelles (objectif b)...")
    details: list[dict] = []
    for i, code in enumerate(codes, 1):
        try:
            details.append(client.plot_detail(code))
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] detail {code}: {e}")
        if i % 25 == 0 or i == len(codes):
            print(f"  ... {i}/{len(codes)}")
    df_det = pd.DataFrame(details)
    df_det.to_csv(outdir / "plot_details.csv", index=False)  # fichier texte
    gdf = to_geodataframe(details)
    gdf = gdf[gdf.geometry.notna()]
    gdf.to_file(outdir / "plots.gpkg", layer="plots", driver="GPKG")
    # Shapefile: noms de colonnes <=10 car., encodage explicite
    gdf.to_file(outdir / "plots.shp", driver="ESRI Shapefile", encoding="utf-8")
    print(f"  -> {len(df_det)} details (plot_details.csv) ; {len(gdf)} polygones (plots.gpkg/.shp)")

    # ------------------------------------------------------------------ c. #
    print("[4/4] Donnees irrigation/pluie/... des parcelles (objectif c)...")
    long_rows: list[dict] = []
    for i, code in enumerate(codes, 1):
        try:
            d = client.plot_data(code, DATA_TYPES, args.date_from, args.date_to)
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] data {code}: {e}")
            continue
        for series in d.get("data", []):
            dtype = series.get("type")
            unit = series.get("unit")
            for pt in series.get("values", []):
                long_rows.append({
                    "code": code,
                    "crop": d.get("crop"),
                    "seeding_date": d.get("seeding_date"),
                    "data_type": dtype,
                    "unit": unit,
                    "date": pt.get("date"),
                    "value": pt.get("value"),
                })
        if i % 25 == 0 or i == len(codes):
            print(f"  ... {i}/{len(codes)}")

    df_long = pd.DataFrame(long_rows)
    df_long.to_csv(outdir / "plot_data_long.csv", index=False)  # fichier texte (format long)

    # Resume par parcelle x type de donnee
    if not df_long.empty:
        summary = (
            df_long.groupby(["code", "data_type", "unit"])
            .agg(n_points=("value", "size"),
                 total=("value", "sum"),
                 first_date=("date", "min"),
                 last_date=("date", "max"))
            .reset_index()
        )
        summary.to_csv(outdir / "plot_data_summary.csv", index=False)

        # Agregats "larges" (une colonne par type) pour jointure geospatiale
        wide = (
            df_long.groupby(["code", "data_type"])["value"].sum().unstack(fill_value=0)
            .add_prefix("total_").reset_index()
        )
        counts = (
            df_long.groupby(["code", "data_type"])["value"].size().unstack(fill_value=0)
            .add_prefix("n_").reset_index()
        )
        agg = wide.merge(counts, on="code", how="outer")
    else:
        agg = pd.DataFrame({"code": []})

    # Fichier geospatial objectif c : polygones + agregats de donnees
    gdf_data = gdf.merge(agg, on="code", how="left")
    gdf_data.to_file(outdir / "plot_data.gpkg", layer="plot_data", driver="GPKG")
    print(f"  -> {len(df_long)} points (plot_data_long.csv) ; "
          f"resume (plot_data_summary.csv) ; polygones+agregats (plot_data.gpkg)")

    print("\nTermine. Fichiers dans:", outdir.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
