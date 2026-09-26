/* ============================================================
   components/heatmap.js — role × AI-skill heat map
   Two synchronized views over the SAME validated cells:
   - 3D: CSS-3D grid of raised columns (dependency-free), drag
     + button rotation, billboarded labels.
   - 2D: accessible table with identical scale (0–100%).
   Cells are selected (click / Enter / tap) to open the evidence
   panel (lazy-loads data/evidence.json). Role-family drill-down
   uses position-level denominators from the same pipeline.

   Percentages come verbatim from processed/role_ai_skills.csv
   via js/data/dashboard-data.js; nothing is recomputed here.
   ============================================================ */

import { esc } from "../lib/util.js";

const MAXH = 150;          /* column height for 100% (px) */
const COLS_W = 58;         /* 3D column width (px) */
const ROWS_D = 42;         /* 3D row depth (px) */
const GAP = 8;             /* gap between columns (px) */
const GUTTER = 170;        /* row-label gutter width (px) */
const DEFAULT_VIEW = { rot: -35, tilt: 55 };

const MEASURES = {
  req_or_pref: { label: "Required or preferred", field: "req_or_pref", pctField: "pct_req_or_pref" },
  mention: { label: "Any mention (exploratory)", field: "mention", pctField: "pct_mention" },
};

/* short display names for the standardized keywords */
const SHORT = {
  "AI literacy / AI tool usage": "AI literacy",
  "AI agents / agentic workflows": "AI agents",
  "LLMs (large language models)": "LLMs",
  "RAG (retrieval-augmented generation)": "RAG",
  "MLOps / model deployment": "MLOps",
  "Workflow / process automation": "Workflow automation",
  "Model evaluation / evals": "Model evals",
  "Generative AI": "Generative AI",
  "Claude (Anthropic)": "Claude",
  "Claude Code": "Claude Code",
  "OpenAI (general)": "OpenAI",
  "Copilot (unspecified)": "Copilot",
  "Gemini (Google)": "Gemini",
  "Cursor (AI IDE)": "Cursor",
};
const shortName = (kw) => SHORT[kw] ?? kw;

/* sequential bucket for a percentage — shared by 3D top faces, 2D cells,
   and the legend ramp: observed zero | >0–20 | 20–40 | 40–60 | 60–80 | 80–100 */
function seqClass(p) {
  if (p <= 0) return "seq-0";
  if (p <= 20) return "seq-1";
  if (p <= 40) return "seq-2";
  if (p <= 60) return "seq-3";
  if (p <= 80) return "seq-4";
  return "seq-5";
}

function fmtPct(x) {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

/* ------------------------------------------------------------------
   Tips registry — one provenance entry per cell (family + position
   level, both measure fields). Built once so the evidence system can
   resolve any [data-tip] key without re-attachment.
   ------------------------------------------------------------------ */
export function buildTips(data) {
  const tips = {};
  const cells = [...data.family_matrix, ...data.position_matrix];
  const familyDenom = Object.fromEntries(data.families.map((f) => [f.name, f.analyzable]));
  const posDenom = Object.fromEntries(data.positions.map((p) => [p.name, p.analyzable]));
  const skillById = Object.fromEntries(
    [...data.skills.skills, ...data.skills.tools].map((s) => [s.id, s])
  );

  const seen = new Set();
  for (const c of cells) {
    const key = `${c.level}:${c.group}|${c.skill_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const skill = skillById[c.skill_id];
    const denom = c.level === "family" ? familyDenom[c.group] : posDenom[c.group];
    const measureLines = [
      `<div><b>${esc(fmtPct(c.pct_req_or_pref))}%</b> of analyzable listings explicitly require or prefer <b>${esc(skill.keyword)}</b> — <b>${esc(c.req_or_pref)}</b> of ${esc(denom)} listings.</div>`,
      `<div>Required ${esc(c.required)} · Preferred ${esc(c.preferred)}${c.overlap > 0 ? ` · <b>${esc(c.overlap)}</b> require AND prefer (counted once)</b>` : " · no overlap"}</div>`,
      `<div>Any mention: ${esc(c.mention)} (${esc(fmtPct(c.pct_mention))}%) — includes responsibilities and passing mentions.</div>`,
    ].join("");
    const warn = c.small_group
      ? `<div class="ev-warn">Small group: only ${esc(denom)} analyzable listings — treat the percentage as illustrative.</div>`
      : "";
    tips[key] = measureLines + warn;
  }
  /* zero cells: every family/position was scanned for every keyword, so a
     missing matrix row is an OBSERVED zero, not missing data. */
  for (const g of data.families) {
    for (const tab of ["skills", "tools"]) {
      for (const s of data.skills[tab]) {
        const key = `family:${g.name}|${s.id}`;
        if (!tips[key]) {
          tips[key] =
            `<div><b>0</b> of ${esc(g.analyzable)} analyzable listings explicitly require or prefer <b>${esc(s.keyword)}</b> (observed zero — all listings were scanned).</div>`;
        }
      }
    }
  }
  return tips;
}

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */
export function mountHeatmap(rootEl, data) {
  const state = {
    tab: "skills",
    measure: "req_or_pref",
    view: window.matchMedia("(max-width: 767px)").matches ? "2d" : "3d",
    focus: "all",
    rot: DEFAULT_VIEW.rot,
    tilt: DEFAULT_VIEW.tilt,
    selected: null, /* {level, group, skillId} */
    drill: null,    /* familyId */
  };

  const familyById = Object.fromEntries(data.families.map((f) => [f.id, f]));
  const positionByName = Object.fromEntries(data.positions.map((p) => [p.name, p]));
  const cellIndex = new Map();
  for (const c of [...data.family_matrix, ...data.position_matrix]) {
    cellIndex.set(`${c.level}:${c.group}|${c.skill_id}`, c);
  }
  const skillList = () => data.skills[state.tab];
  const measure = () => MEASURES[state.measure];

  function cellFor(level, group, skillId) {
    return cellIndex.get(`${level}:${group}|${skillId}`) ?? null;
  }
  function cellValue(c) {
    if (!c) return { count: 0, pct: 0 };
    return { count: c[measure().field], pct: c[measure().pctField] };
  }
  const tipKey = (level, group, skillId) => `${level}:${group}|${skillId}`;

  /* ---------- shell ---------- */
  rootEl.innerHTML = `
  <div class="hm-controls" data-controls>
    <div class="hm-control-group">
      <span class="hm-control-label" id="hm-tab-label">Skill set</span>
      <div class="hm-tabs" role="tablist" aria-labelledby="hm-tab-label">
        <button role="tab" data-tab="skills" aria-selected="true">Skills &amp; capabilities</button>
        <button role="tab" data-tab="tools" aria-selected="false">Named tools</button>
      </div>
    </div>
    <div class="hm-control-group">
      <span class="hm-control-label" id="hm-measure-label">Measure</span>
      <div class="hm-seg" role="group" aria-labelledby="hm-measure-label">
        <button data-measure="req_or_pref" aria-pressed="true">Required or preferred</button>
        <button data-measure="mention" aria-pressed="false">Any mention</button>
      </div>
    </div>
    <div class="hm-control-group">
      <span class="hm-control-label" id="hm-view-label">View</span>
      <div class="hm-seg" role="group" aria-labelledby="hm-view-label">
        <button data-view="3d" aria-pressed="${state.view === "3d"}">3D</button>
        <button data-view="2d" aria-pressed="${state.view === "2d"}">2D</button>
      </div>
    </div>
    <div class="hm-control-group">
      <label class="hm-control-label" for="hm-family-select">Focus role family</label>
      <select id="hm-family-select" class="field hm-select" data-family-select>
        <option value="all">All families</option>
        ${data.families.map((f) => `<option value="${esc(f.id)}">${esc(f.name)} (${esc(f.analyzable)})</option>`).join("")}
      </select>
    </div>
  </div>
  <div class="hm-rotatebar" data-rotatebar hidden>
    <button class="btn" data-rot="-15" aria-label="Rotate left 15 degrees">⟲ Rotate</button>
    <button class="btn" data-rot="15" aria-label="Rotate right 15 degrees">⟳ Rotate</button>
    <button class="btn" data-tilt="-10" aria-label="Tilt up 10 degrees">Tilt ↑</button>
    <button class="btn" data-tilt="10" aria-label="Tilt down 10 degrees">Tilt ↓</button>
    <button class="btn" data-reset-view>Reset view</button>
    <span class="spacer"></span>
    <span class="hint">drag the grid to rotate · arrow keys move between cells</span>
  </div>
  <div data-chart aria-live="polite"></div>
  <div class="hm-legend" data-legend></div>
  <p class="note warn" data-caveat></p>
  <div class="hm-evidence" data-evidence-panel></div>
  <div class="hm-drill" data-drill hidden></div>`;

  const chartEl = rootEl.querySelector("[data-chart]");
  const legendEl = rootEl.querySelector("[data-legend]");
  const caveatEl = rootEl.querySelector("[data-caveat]");
  const evidenceEl = rootEl.querySelector("[data-evidence-panel]");
  const drillEl = rootEl.querySelector("[data-drill]");
  const rotateBar = rootEl.querySelector("[data-rotatebar]");

  /* ---------- rows under current focus filter ---------- */
  const activeFamilies = () =>
    state.focus === "all" ? data.families : [familyById[state.focus]].filter(Boolean);

  /* ---------- render: chart ---------- */
  function renderChart() {
    const skills = skillList();
    const fams = activeFamilies();
    const cols = skills.length;
    chartEl.innerHTML =
      state.view === "3d" ? render3D(fams, skills, cols) : render2D(fams, skills, cols);
    rotateBar.hidden = state.view !== "3d";
    wireChart();
  }

  function render3D(fams, skills, cols) {
    const cell = (level, group, s, rowIdx) => {
      const c = cellFor(level, group, s.id);
      const { count, pct } = cellValue(c);
      const h = Math.round((pct / 100) * MAXH);
      const sel =
        state.selected &&
        state.selected.level === level &&
        state.selected.group === group &&
        state.selected.skillId === s.id;
      return `<div class="hm-cell ${pct <= 0 ? "zero" : ""} ${seqClass(pct)}" style="--h:${h}"
        data-cell data-level="${level}" data-group="${esc(group)}" data-skill="${esc(s.id)}"
        data-row="${rowIdx}" data-col="${skills.indexOf(s)}"
        data-tip="${esc(tipKey(level, group, s.id))}"
        aria-label="${esc(group)}, ${esc(s.keyword)}: ${esc(fmtPct(pct))} percent, ${count} of ${level === "family" ? familyById[group]?.analyzable ?? "?" : positionByName[group]?.analyzable ?? "?"} analyzable listings${c?.small_group ? ", small group" : ""}">
        <div class="face face-top">${pct > 0 ? esc(Math.round(pct)) : ""}</div>
        <div class="face face-front" aria-hidden="true"></div>
        <div class="face face-side" aria-hidden="true"></div>
      </div>`;
    };

    const headerCells = skills
      .map(
        (s, i) => `
      <div class="hm-headslot" style="grid-column:${i + 2};grid-row:1">
        <div class="hm-label col-label">${esc(shortName(s.keyword))}</div>
      </div>`
      )
      .join("");

    const rows = fams
      .map((f, r) => {
        const small = f.analyzable < data.meta.small_group_threshold;
        const rowLabel = `<div class="hm-rowhead" style="grid-column:1;grid-row:${r + 2}">
          <div class="hm-label row-label ${small ? "flag" : ""}">${esc(f.name)} <span class="n">n=${esc(f.analyzable)}</span></div>
        </div>`;
        const cells = skills.map((s) => cell("family", f.name, s, r)).join("");
        return rowLabel + cells;
      })
      .join("");

    return `<div class="hm-stage" data-stage tabindex="0" aria-label="3D heat map of AI skill requirements by role family. Use the 2D view for a table representation; arrow keys move between cells when a cell is focused.">
      <div class="hm-scene">
        <div class="hm-world" style="--tilt:${state.tilt};--rot:${state.rot}">
          <div class="hm-floor" style="--cols:${cols};--cw:${COLS_W}px;--cd:${ROWS_D}px;--gap:${GAP}px;--half-gap:${GAP / 2}px;--gutter:${GUTTER}px;--rows:${fams.length + 1}">
            ${headerCells}${rows}
          </div>
        </div>
      </div>
      <div class="hm-axis-note">height &amp; color = ${esc(measure().label.toLowerCase())}, % of analyzable listings (0–100% scale)</div>
    </div>`;
  }

  function render2D(fams, skills, cols) {
    const thead = `<thead><tr>
      <th scope="col">Role family</th>
      ${skills.map((s) => `<th scope="col" title="${esc(s.keyword)}">${esc(shortName(s.keyword))}</th>`).join("")}
    </tr></thead>`;
    const rows = fams
      .map((f) => {
        const small = f.analyzable < data.meta.small_group_threshold;
        return `<tr>
        <th scope="row" data-drill-open="${esc(f.id)}" title="Select to drill down into this family's normalized positions">
          ${esc(f.name)}
          <span class="n">n=${esc(f.analyzable)} analyzable${small ? ' <span class="smallflag">· small n</span>' : ""}</span>
        </th>
        ${skills
          .map((s) => {
            const c = cellFor("family", f.name, s.id);
            const { count, pct } = cellValue(c);
            const sel =
              state.selected &&
              state.selected.level === "family" &&
              state.selected.group === f.name &&
              state.selected.skillId === s.id;
            return `<td class="${seqClass(pct)}" data-cell data-level="family" data-group="${esc(f.name)}" data-skill="${esc(s.id)}"
              data-tip="${esc(tipKey("family", f.name, s.id))}" tabindex="0" data-row="${fams.indexOf(f)}" data-col="${skills.indexOf(s)}"
              data-sel="${sel ? 1 : 0}"
              aria-label="${esc(f.name)}, ${esc(s.keyword)}: ${esc(fmtPct(pct))} percent, ${count} of ${f.analyzable} analyzable listings${c?.small_group ? ", small group" : ""}">${esc(fmtPct(pct))}</td>`;
          })
          .join("")}
      </tr>`;
      })
      .join("");
    return `<div class="hm2d-wrap"><table class="hm2d" style="--cols:${cols}">${thead}<tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- render: legend + caveat ---------- */
  function renderLegend() {
    const unit = state.measure === "req_or_pref" ? "% req/pref" : "% any mention";
    legendEl.innerHTML = `
      <span class="key"><span class="ramp">
        ${["seq-0", "seq-1", "seq-2", "seq-3", "seq-4", "seq-5"]
          .map((c, i) => `<span class="${c}">${i * 20}</span>`)
          .join("")}
      </span><span class="num">${esc(unit)} · 0–100% scale</span></span>
      <span class="key"><span class="sw seq-0"></span>observed zero (scanned, unmentioned)</span>
      <span class="key"><span class="sw" style="border-style:dashed"></span>no scannable text (none in this population)</span>
      <span class="key">⚠ small n: &lt; 10 analyzable listings</span>`;
    caveatEl.innerHTML = `<b>Patterns in collected, remote-heavy job listings; not an estimate of the entire job market.</b>
      Observation window ${esc(data.meta.population.window_from)} → ${esc(data.meta.population.window_to)} ·
      ${esc(data.meta.population.eligible)} eligible listings (${esc(data.meta.population.full_desc)} full + ${esc(data.meta.population.partial_desc)} partial descriptions) from five remote-first boards.
      Each skill is counted once per listing; an unmentioned skill is not an unnecessary skill.`;
  }

  /* ---------- render: evidence panel ---------- */
  let evidenceData = null;
  let evidencePromise = null;
  function loadEvidence() {
    if (!evidencePromise) {
      evidencePromise = fetch("data/evidence.json")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j) => {
          evidenceData = j;
          return j;
        })
        .catch((err) => {
          evidencePromise = null;
          throw err;
        });
    }
    return evidencePromise;
  }

  const STATUS_RANK = { required: 0, preferred: 1, responsibility: 2, mentioned: 3 };
  function renderEvidence() {
    const sel = state.selected;
    if (!sel) {
      evidenceEl.innerHTML = `<div class="hm-evidence-head"><h3>Evidence</h3>
        <span class="ev-stat">select a cell (click, tap, or Enter) to see the matching listings, excerpts, and source links</span></div>
        <div class="hm-evidence-body"><p class="ev-empty">No cell selected.</p></div>`;
      return;
    }
    const skill = [...data.skills.skills, ...data.skills.tools].find((s) => s.id === sel.skillId);
    const denom =
      sel.level === "family"
        ? familyById[Object.keys(familyById).find((id) => familyById[id].name === sel.group)]?.analyzable
        : positionByName[sel.group]?.analyzable;
    const c = cellFor(sel.level, sel.group, sel.skillId);
    const { count, pct } = cellValue(c);
    const head = `<div class="hm-evidence-head">
      <h3>${esc(skill.keyword)} — ${esc(sel.group)}</h3>
      <span class="ev-stat"><b class="num">${esc(fmtPct(pct))}%</b> ${esc(state.measure === "req_or_pref" ? "required or preferred" : "mentioned (any context)")}</span>
      <span class="ev-stat"><b class="num">${esc(count)}</b> of ${esc(denom ?? "?")} analyzable listings</span>
      ${c ? `<span class="ev-stat">Required <b class="num">${esc(c.required)}</b> · Preferred <b class="num">${esc(c.preferred)}</b>${c.overlap > 0 ? ` · <b class="num">${esc(c.overlap)}</b> both (counted once)` : ""}</span>` : ""}
      ${c?.small_group ? `<span class="ev-stat"><b class="text-coral">Small group — illustrative only.</b></span>` : ""}
    </div>`;

    const wantReqOnly = state.measure === "req_or_pref";
    const renderList = (ev) => {
      const entries = (ev[`${sel.level}:${sel.group}|${sel.skillId}`] ?? [])
        .filter((e) => (wantReqOnly ? e.status === "required" || e.status === "preferred" : true))
        .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9));
      if (!entries.length) {
        return `<p class="ev-empty">No matching listing text captured for this cell and measure${wantReqOnly ? " — the mention counts come from other contexts (responsibilities / passing mentions)" : ""}.</p>`;
      }
      const boldWording = (excerpt, wording) => {
        const e = esc(excerpt);
        if (!wording) return e;
        const w = wording.trim();
        const idx = e.toLowerCase().indexOf(esc(w).toLowerCase());
        if (idx < 0) return e;
        return (
          e.slice(0, idx) +
          "<b>" + e.slice(idx, idx + w.length) + "</b>" +
          e.slice(idx + w.length)
        );
      };
      return `<ul class="ev-list">${entries
        .map(
          (e) => `<li>
          <span class="ev-status ${esc(e.status)}">${esc(e.status)}</span>
          <span class="ev-wording">“${esc(e.wording)}”</span>
          <div class="ev-title">${esc(e.title)}</div>
          <div class="ev-employer">${esc(e.employer)} · ${esc(e.section)} section</div>
          <p class="ev-excerpt">…${boldWording(e.excerpt, e.wording)}…</p>
          <a class="ext-link" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Source posting<span aria-hidden="true"> ↗</span></a>
        </li>`
        )
        .join("")}</ul>`;
    };

    evidenceEl.innerHTML = head + `<div class="hm-evidence-body" data-ev-body><p class="ev-empty">Loading evidence…</p></div>`;
    const body = evidenceEl.querySelector("[data-ev-body]");
    if (evidenceData) body.innerHTML = renderList(evidenceData);
    else
      loadEvidence()
        .then((j) => {
          if (state.selected === sel) body.innerHTML = renderList(j);
        })
        .catch(() => {
          body.innerHTML = `<p class="ev-empty">Evidence file could not be loaded (data/evidence.json). Counts above remain valid — they come from the validated matrix.</p>`;
        });
  }

  /* ---------- render: drill-down ---------- */
  function renderDrill() {
    if (!state.drill) {
      drillEl.hidden = true;
      drillEl.innerHTML = "";
      return;
    }
    const fam = familyById[state.drill];
    const positions = data.positions.filter((p) => p.family === fam.name);
    const skills = skillList();
    const rows = positions
      .map((p) => {
        return `<tr>
        <th scope="row">${esc(p.name)}<span class="n">n=${esc(p.analyzable)} analyzable${p.analyzable < data.meta.small_group_threshold ? ' <span class="smallflag">· small n</span>' : ""}</span></th>
        ${skills
          .map((s) => {
            const c = cellFor("position", p.name, s.id);
            const { count, pct } = cellValue(c);
            const sel =
              state.selected &&
              state.selected.level === "position" &&
              state.selected.group === p.name &&
              state.selected.skillId === s.id;
            return `<td class="${seqClass(pct)}" data-cell data-level="position" data-group="${esc(p.name)}" data-skill="${esc(s.id)}"
              data-tip="${esc(tipKey("position", p.name, s.id))}" tabindex="0" data-sel="${sel ? 1 : 0}"
              aria-label="${esc(p.name)}, ${esc(s.keyword)}: ${esc(fmtPct(pct))} percent, ${count} of ${p.analyzable} analyzable listings${c?.small_group ? ", small group" : ""}">${esc(fmtPct(pct))}</td>`;
          })
          .join("")}
      </tr>`;
      })
      .join("");
    drillEl.hidden = false;
    drillEl.innerHTML = `
      <div class="hm-drill-head">
        <h3>Drill-down: ${esc(fam.name)} — normalized positions</h3>
        <span class="ev-stat">${esc(positions.length)} positions · position-level denominators (listings with scannable text in each position)</span>
        <button class="hm-drill-close" data-drill-close>Close</button>
      </div>
      <div class="hm2d-wrap"><table class="hm2d">
        <thead><tr><th scope="col">Position</th>${skills.map((s) => `<th scope="col" title="${esc(s.keyword)}">${esc(shortName(s.keyword))}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    wireCells(drillEl);
    drillEl.querySelector("[data-drill-close]").addEventListener("click", () => {
      state.drill = null;
      renderDrill();
    });
  }

  /* ---------- selection ---------- */
  function select(level, group, skillId) {
    state.selected = { level, group, skillId };
    renderChart();
    renderEvidence();
    if (level === "family") {
      const fam = Object.values(familyById).find((f) => f.name === group);
      if (fam) {
        state.drill = fam.id;
        renderDrill();
      }
    } else {
      renderDrillSelection();
    }
    evidenceEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  /* refresh only the data-sel outlines in the drill table without rebuilding */
  function renderDrillSelection() {
    drillEl.querySelectorAll("[data-cell]").forEach((td) => {
      const s = state.selected;
      td.dataset.sel =
        s && s.level === "position" && s.group === td.dataset.group && s.skillId === td.dataset.skill
          ? "1"
          : "0";
    });
  }

  /* ---------- wiring ---------- */
  function wireCells(scope) {
    scope.querySelectorAll("[data-cell]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        select(el.dataset.level, el.dataset.group, el.dataset.skill);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select(el.dataset.level, el.dataset.group, el.dataset.skill);
        }
      });
    });
  }

  function rovingFocus(container) {
    const cells = [...container.querySelectorAll("[data-cell]")];
    if (!cells.length) return;
    const pos = (el) => ({ r: +el.dataset.row, c: +el.dataset.col });
    const find = (r, c) => cells.find((el) => +el.dataset.row === r && +el.dataset.col === c);
    const rows = Math.max(...cells.map((el) => +el.dataset.row)) + 1;
    const colsN = Math.max(...cells.map((el) => +el.dataset.col)) + 1;
    container.addEventListener("keydown", (e) => {
      const active = document.activeElement;
      if (!active?.dataset?.cell) return;
      const { r, c } = pos(active);
      let target = null;
      if (e.key === "ArrowRight") target = find(r, Math.min(colsN - 1, c + 1));
      else if (e.key === "ArrowLeft") target = find(r, Math.max(0, c - 1));
      else if (e.key === "ArrowDown") target = find(Math.min(rows - 1, r + 1), c);
      else if (e.key === "ArrowUp") target = find(Math.max(0, r - 1), c);
      if (target) {
        e.preventDefault();
        active.tabIndex = -1;
        target.tabIndex = 0;
        target.focus();
      }
    });
  }

  function wireChart() {
    const stage = chartEl.querySelector("[data-stage]");
    wireCells(chartEl);
    if (stage) {
      rovingFocus(stage);
      /* 3D row headers are outside cells: clicking a row label focuses that family */
      stage.querySelectorAll(".hm-rowhead").forEach((rh, i) => {
        rh.addEventListener("click", () => {
          const fam = activeFamilies()[i];
          if (fam) {
            state.drill = fam.id;
            renderDrill();
            drillEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });
      });
      /* drag to rotate */
      let dragging = false, moved = 0, sx = 0, sy = 0;
      stage.addEventListener("pointerdown", (e) => {
        if (e.target.closest("[data-cell]")) return;
        dragging = true; moved = 0; sx = e.clientX; sy = e.clientY;
        stage.classList.add("dragging");
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
        state.rot += dx * 0.35;
        state.tilt = Math.min(85, Math.max(15, state.tilt - dy * 0.25));
        sx = e.clientX; sy = e.clientY;
        applyView();
      });
      const endDrag = () => { dragging = false; stage.classList.remove("dragging"); };
      stage.addEventListener("pointerup", endDrag);
      stage.addEventListener("pointercancel", endDrag);
    }
    /* 2D row headers drill down */
    chartEl.querySelectorAll("[data-drill-open]").forEach((th) => {
      th.addEventListener("click", () => {
        state.drill = th.dataset.drillOpen;
        renderDrill();
        drillEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }

  function applyView() {
    const world = chartEl.querySelector(".hm-world");
    if (world) {
      world.style.setProperty("--tilt", state.tilt.toFixed(1));
      world.style.setProperty("--rot", state.rot.toFixed(1));
    }
    /* keep billboarded labels counter-rotated */
    chartEl.querySelectorAll(".hm-label").forEach((l) => {
      l.style.setProperty("--tilt", state.tilt.toFixed(1));
      l.style.setProperty("--rot", state.rot.toFixed(1));
    });
  }

  rootEl.querySelector("[data-controls]").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    const ms = e.target.closest("[data-measure]");
    const vw = e.target.closest("[data-view]");
    if (tab) {
      state.tab = tab.dataset.tab;
      const ids = new Set(skillList().map((s) => s.id));
      if (state.selected && !ids.has(state.selected.skillId)) state.selected = null;
      syncControls();
      renderChart(); renderLegend(); renderEvidence(); renderDrill();
    } else if (ms) {
      state.measure = ms.dataset.measure;
      syncControls();
      renderChart(); renderLegend(); renderEvidence(); renderDrill();
    } else if (vw) {
      state.view = vw.dataset.view;
      syncControls();
      renderChart();
    }
  });
  function syncControls() {
    rootEl.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    rootEl.querySelectorAll("[data-measure]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.measure === state.measure)));
    rootEl.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
  }

  rootEl.querySelector("[data-family-select]").addEventListener("change", (e) => {
    state.focus = e.target.value;
    renderChart();
  });

  rotateBar.addEventListener("click", (e) => {
    const rot = e.target.closest("[data-rot]");
    const tilt = e.target.closest("[data-tilt]");
    if (rot) state.rot += +rot.dataset.rot;
    else if (tilt) state.tilt = Math.min(85, Math.max(15, state.tilt + +tilt.dataset.tilt));
    else if (e.target.closest("[data-reset-view]")) {
      state.rot = DEFAULT_VIEW.rot;
      state.tilt = DEFAULT_VIEW.tilt;
    } else return;
    applyView();
  });

  /* ---------- first paint ---------- */
  renderChart();
  renderLegend();
  renderEvidence();
  renderDrill();
}
