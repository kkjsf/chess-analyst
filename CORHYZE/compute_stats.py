#!/usr/bin/env python3
"""Calcule les statistiques du dataset extrait -> stats.json (pour le rapport)."""
import json
from pathlib import Path
import pandas as pd

D = Path("data")
plots = pd.read_csv(D / "plots.csv")
details = pd.read_csv(D / "plot_details.csv")
long = pd.read_csv(D / "plot_data_long.csv")
summary = pd.read_csv(D / "plot_data_summary.csv")

long["value"] = pd.to_numeric(long["value"], errors="coerce")
long["date"] = pd.to_datetime(long["date"], errors="coerce", utc=True)

by_type = long.groupby("data_type").agg(
    n_points=("value", "size"),
    n_plots=("code", "nunique"),
    total=("value", "sum"),
    unit=("unit", "first"),
).reset_index().sort_values("n_points", ascending=False)

crops = plots["crop"].value_counts().head(12)

irr = long[long.data_type == "irrigation"]
rain = long[long.data_type == "rainfalls"]

stats = {
    "n_plots": int(len(plots)),
    "n_clients": int(plots["client"].nunique()),
    "n_crops": int(plots["crop"].nunique()),
    "n_with_geometry": int(details["geometry"].notna().sum()) if "geometry" in details else None,
    "surface_total_ha": round(pd.to_numeric(plots["surface_area"], errors="coerce").sum(), 1),
    "date_min": str(long["date"].min().date()) if long["date"].notna().any() else None,
    "date_max": str(long["date"].max().date()) if long["date"].notna().any() else None,
    "n_data_points": int(len(long)),
    "data_types": [
        {
            "type": r.data_type,
            "unit": r.unit,
            "n_points": int(r.n_points),
            "n_plots": int(r.n_plots),
            "total": round(float(r.total), 1),
        }
        for r in by_type.itertuples()
    ],
    "irrigation": {
        "n_plots": int(irr["code"].nunique()),
        "n_events": int(len(irr)),
        "total_mm": round(float(irr["value"].sum()), 1),
        "mean_mm_per_plot": round(float(irr.groupby("code")["value"].sum().mean()), 1) if len(irr) else 0,
        "mean_events_per_plot": round(float(irr.groupby("code").size().mean()), 1) if len(irr) else 0,
    },
    "rainfalls": {
        "n_plots": int(rain["code"].nunique()),
        "n_events": int(len(rain)),
        "total_mm": round(float(rain["value"].sum()), 1),
        "mean_mm_per_plot": round(float(rain.groupby("code")["value"].sum().mean()), 1) if len(rain) else 0,
    },
    "crops": [{"name": k, "n": int(v)} for k, v in crops.items()],
}

Path("stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2))
print(json.dumps(stats, ensure_ascii=False, indent=2))
