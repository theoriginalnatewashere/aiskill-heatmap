# -*- coding: utf-8 -*-
"""
build_data.py — derived data layer for the role-by-AI-skill heat map.

Reads (READ-ONLY, preserved):
    processed/role_ai_skills.csv
    processed/role_summary.csv
    processed/jobs_classified.csv
    processed/requirements_extracted.csv

Writes (derived, visualization-local):
    data/family_skill_matrix.csv      analysis layer (family x skill)
    data/position_skill_matrix.csv    analysis layer (position x skill)
    js/data/dashboard-data.js         ES module consumed by the dashboard
    data/evidence.json                per-cell supporting listings (lazy-loaded)

Deterministic: pandas only, no network, no imputation. Percentages are copied
verbatim from role_ai_skills.csv (computed there by the validated pipeline);
this script derives NO new percentages.

Skill selection rule (documented in the dashboard methodology note):
    top 12 ai_method ("Skills" tab) and top 12 ai_tool ("Tools" tab) by total
    req_or_pref_count across role families; ties broken by listings_mentioning,
    then keyword name. Family order: role_summary listing_count desc, with
    "Other" last.
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

PKG = Path(__file__).resolve().parents[2]          # .../ai-related-jobs
PROC = PKG / "processed"
VIZ = PKG / "visualization"
DATA = VIZ / "data"
JS_DATA = VIZ / "js" / "data"

TOP_N = 12

def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)

def main() -> None:
    ras = pd.read_csv(PROC / "role_ai_skills.csv")
    rs = pd.read_csv(PROC / "role_summary.csv")
    jc = pd.read_csv(PROC / "jobs_classified.csv")
    req = pd.read_csv(PROC / "requirements_extracted.csv")

    fam = ras[ras.role_level == "family"].copy()
    pos = ras[ras.role_level == "position"].copy()

    # ---- population meta (from validated findings / jobs_classified) ----
    eligible = len(jc)
    full_desc = int((jc.description_status == "full").sum())
    partial_desc = int((jc.description_status == "partial").sum())
    window = (jc.posting_date.min(), jc.posting_date.max())

    # ---- families: all, ordered by listing_count desc, Other last ----
    fs = rs[rs.role_level == "family"][
        ["group_name", "listing_count", "distinct_employers", "analyzable_count"]
    ].copy()
    fs = fs.sort_values(["listing_count", "group_name"], ascending=[False, True])
    fam_order = (
        fs[~fs.group_name.str.startswith("Other")].group_name.tolist()
        + fs[fs.group_name.str.startswith("Other")].group_name.tolist()
    )
    fam_meta = {
        r.group_name: {
            "listings": int(r.listing_count),
            "employers": int(r.distinct_employers),
            "analyzable": int(r.analyzable_count),
        }
        for r in fs.itertuples()
    }

    # ---- skill selection: top 12 per category by req_or_pref across families ----
    tot = (
        fam.groupby(["standardized_keyword", "keyword_category"])
        .agg(rp=("req_or_pref_count", "sum"), men=("listings_mentioning", "sum"))
        .reset_index()
    )
    selected = {}
    for cat, tab in (("ai_method", "skills"), ("ai_tool", "tools")):
        t = tot[tot.keyword_category == cat].sort_values(
            ["rp", "men", "standardized_keyword"], ascending=[False, False, True]
        )
        chosen = t.head(TOP_N)
        selected[tab] = [
            {
                "keyword": r.standardized_keyword,
                "id": slug(r.standardized_keyword),
                "category": cat,
                "req_or_pref_total": int(r.rp),
                "mention_total": int(r.men),
            }
            for r in chosen.itertuples()
        ]

    # keyword -> id map (both tabs; ids are unique across categories by construction check)
    kw2id = {s["keyword"]: s["id"] for tab in selected.values() for s in tab}
    if len(kw2id) != sum(len(v) for v in selected.values()):
        sys.exit("FATAL: skill id collision")

    # ---- family x skill matrix ----
    def cell_rows(level_df, name_map_level):
        rows = []
        for tab in selected.values():
            for s in tab:
                sub = level_df[level_df.standardized_keyword == s["keyword"]]
                for r in sub.itertuples():
                    grp = r.group_name
                    denom = int(r.analyzable_denominator)
                    rp, rq, pf = int(r.req_or_pref_count), int(r.required_count), int(r.preferred_count)
                    men = int(r.listings_mentioning)
                    overlap = rq + pf - rp  # listings counted in both required and preferred
                    if rp < 0 or men < rp:
                        sys.exit(f"FATAL: inconsistent counts at {grp}/{s['keyword']}")
                    rows.append(
                        {
                            "group": grp,
                            "level": name_map_level,
                            "skill_id": s["id"],
                            "req_or_pref": rp,
                            "required": rq,
                            "preferred": pf,
                            "overlap": overlap,
                            "mention": men,
                            "denominator": denom,
                            "pct_req_or_pref": float(r.pct_req_or_pref),
                            "pct_mention": float(r.pct_of_role),
                            "small_group": r.small_group == "Y",
                        }
                    )
        return rows

    fam_rows = cell_rows(fam, "family")
    pos_rows = cell_rows(pos, "position")

    # position meta (for drill-down), family back-reference from jobs_classified
    pos_family = jc.groupby("normalized_position").role_family.agg(lambda x: x.mode().iat[0]).to_dict()
    ps = rs[rs.role_level == "position"][
        ["group_name", "listing_count", "analyzable_count"]
    ].copy()
    pos_meta = {
        r.group_name: {
            "family": pos_family.get(r.group_name, "Other"),
            "listings": int(r.listing_count),
            "analyzable": int(r.analyzable_count),
        }
        for r in ps.itertuples()
    }
    # safety: every position matrix row must map to a known position
    unknown = {r["group"] for r in pos_rows if r["group"] not in pos_meta}
    if unknown:
        sys.exit(f"FATAL: positions missing from role_summary: {sorted(unknown)}")

    # ---- evidence: one entry per listing x selected keyword (all statuses) ----
    req_sel = req[req.standardized_keyword.isin(kw2id)].copy()
    jc_idx = jc.set_index("listing_id")
    evidence = {}
    for r in req_sel.itertuples():
        if r.listing_id not in jc_idx.index:
            sys.exit(f"FATAL: evidence listing {r.listing_id} not in jobs_classified")
        src = jc_idx.loc[r.listing_id]
        if isinstance(src, pd.DataFrame):  # duplicate id guard
            src = src.iloc[0]
        pos_name = r.normalized_position
        if pos_name not in pos_meta:
            continue  # position not in role_summary (should not happen) — skip, do not guess
        for grp, lvl in ((r.role_family, "family"), (pos_name, "position")):
            key = f"{lvl}:{grp}|{kw2id[r.standardized_keyword]}"
            evidence.setdefault(key, []).append(
                {
                    "id": r.listing_id,
                    "title": str(src.original_title_display),
                    "employer": str(src.employer),
                    "status": r.status,
                    "wording": str(r.original_wording),
                    "excerpt": str(r.evidence_excerpt),
                    "section": r.source_section,
                    "url": str(src.source_url),
                }
            )

    # ---- derived analysis-layer CSVs ----
    DATA.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(fam_rows).to_csv(DATA / "family_skill_matrix.csv", index=False)
    pd.DataFrame(pos_rows).to_csv(DATA / "position_skill_matrix.csv", index=False)

    # ---- dashboard data module ----
    dashboard = {
        "meta": {
            "title": "Which AI skills do employers request for each type of role?",
            "population": {
                "eligible": eligible,
                "full_desc": full_desc,
                "partial_desc": partial_desc,
                "window_from": window[0],
                "window_to": window[1],
                "families": len(fam_order),
                "positions": len(pos_meta),
            },
            "measure_default": "req_or_pref",
            "scale_max": 100,
            "small_group_threshold": 10,
            "generated": "2026-09-26",
        },
        "families": [
            {"name": f, "id": slug(f), **fam_meta[f]} for f in fam_order
        ],
        "skills": selected,
        "family_matrix": fam_rows,
        "positions": [
            {"name": p, "id": slug(p), **pos_meta[p]} for p in sorted(pos_meta)
        ],
        "position_matrix": pos_rows,
    }

    JS_DATA.mkdir(parents=True, exist_ok=True)
    (JS_DATA / "dashboard-data.js").write_text(
        "/* GENERATED by visualization/scripts/build_data.py — do not edit by hand.\n"
        "   Source: processed/role_ai_skills.csv + role_summary.csv (validated pipeline,\n"
        "   findings.md). Percentages copied verbatim from the pipeline outputs.\n"
        "   Regenerate: python scripts/build_data.py (from visualization/). */\n"
        "export const dashboardData = " + json.dumps(dashboard, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )

    (DATA / "evidence.json").write_text(
        json.dumps(evidence, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    # ---- console summary ----
    print(f"eligible listings: {eligible} ({full_desc} full, {partial_desc} partial) window {window[0]}..{window[1]}")
    print(f"families: {len(fam_order)} | positions: {len(pos_meta)}")
    for tab, items in selected.items():
        print(f"{tab}: " + ", ".join(f"{s['keyword']} ({s['req_or_pref_total']})" for s in items))
    print(f"family matrix cells: {len(fam_rows)} | position matrix cells: {len(pos_rows)}")
    print(f"evidence entries: {sum(len(v) for v in evidence.values())} across {len(evidence)} cells")

if __name__ == "__main__":
    main()
