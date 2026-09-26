# Role × AI-Skill Heat Map

**“Which AI skills do employers request for each type of role?”** — an interactive
3D heat map (with an identical-scale 2D toggle) of explicitly required-or-preferred
AI skills across role families, built from the validated AI-related-jobs pipeline.

**Population:** 1,095 eligible listings (1,094 full + 1 partial descriptions),
window 2026-08-03 → 2026-09-25, five remote-first boards. 14 role families,
70 normalized positions, 12 capability keywords + 12 named tools.

## Run locally

ES modules require a static server (not `file://`):

```sh
cd visualization
python -m http.server 8791
# open http://127.0.0.1:8791/
node verify.mjs          # self-check: data contract + files (must end 0 errors)
```

## Architecture (modular research-dashboard, per AGENTS.md)

```
processed/*.csv (validated pipeline, READ-ONLY)
  → scripts/build_data.py            deterministic derived data layer
      → js/data/dashboard-data.js    matrix + meta (generated, do not edit)
      → data/evidence.json           per-cell listings/excerpts/URLs (lazy-loaded)
      → data/*_skill_matrix.csv      analysis-layer copies
  → js/components/heatmap.js         3D + 2D views, controls, evidence, drill-down
  → templates/research-dashboard/*   tokens.css, components.css, evidence.js,
                                     about.js, author-profile.js (shared foundation)
  → js/main.js                       page assembly, method + limitations
```

- Percentages are **copied verbatim** from `processed/role_ai_skills.csv`; no
  percentages are recomputed in the front end. `verify.mjs` re-checks every
  cell (`pct = count/denominator`, count relationships, skill totals) plus
  evidence coverage and referenced files.
- Design system: `templates/research-dashboard` tokens/components (oklch,
  hairline rules, mono numerals); heat-map-specific styles in
  `styles/project.css`. Sequential single-hue ramp (`seq-0`…`seq-6`) shared by
  3D top faces, 2D cells, and the legend. No chart libraries; the 3D view is
  pure CSS transforms with billboarded labels and drag/button rotation.

## Data-handling rules encoded in the UI

- Default measure: **required or preferred** (each skill once per listing).
  “Any mention” is a labeled secondary view.
- One shared 0–100% scale across roles, tabs, measures, and both views.
- Every listing was scanned for every keyword ⇒ an empty cell is an
  **observed zero**, never missing data (no hollow cells exist in this
  population; the style exists and is tested for).
- Families/positions with < 10 analyzable listings are flagged (`small_group`)
  and carry a warning in tooltips and the evidence panel.
- Required + preferred overlap is reported, never summed away silently.
- Caveat rendered beside the chart: *“Patterns in collected, remote-heavy job
  listings; not an estimate of the entire job market.”* with window and n.

## Regenerating the data layer

```sh
python scripts/build_data.py   # from visualization/; pandas only, deterministic
node verify.mjs
```

Never edit `js/data/dashboard-data.js` or `data/evidence.json` by hand.
Processed/research/raw files are never modified by this folder.

## Known limitations (also rendered on the page)

- Remote-heavy convenience sample; no LinkedIn/Indeed/Glassdoor; not an
  estimate of any national job market (Netherlands/EU especially).
- Single Aug–Sep 2026 snapshot — no trend or growth claims.
- Rule-based keyword extraction and role normalization (see
  `processed/keyword_mapping.csv`, `review_log.csv`); 157 listings carry
  review flags and some rankings are sensitive to them (findings.md §sensitivity).
- Small groups: Content / Writing n=8, Research n=3 (flagged, illustrative).

## QA

`visuals/qa-*.{png,json}` — headless Edge + CDP captures (desktop 1440,
mobile 390 emulated), interaction probe results, layout-metrics checks:
no horizontal overflow, 2D default on mobile, console error-free (favicon
404 only), displayed values spot-checked against the CSVs and findings.md.
