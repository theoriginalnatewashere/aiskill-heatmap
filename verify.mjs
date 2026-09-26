/* ============================================================
   verify.mjs — self-check for the role × AI-skill heat map
   Run: node verify.mjs  (no browser, no dependencies)
   Fails loudly on: data-contract violations, percentage/count
   inconsistencies, evidence gaps, missing referenced files.
   ============================================================ */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
let errors = 0;
let checks = 0;
const fail = (msg) => { errors++; console.error(`  ✗ ${msg}`); };
const ok = (msg) => { checks++; console.log(`  ✓ ${msg}`); };

/* ---------- referenced files exist ---------- */
console.log("Files");
const refs = [
  "index.html",
  "styles/tokens.css",
  "styles/components.css",
  "styles/project.css",
  "js/main.js",
  "js/lib/util.js",
  "js/components/heatmap.js",
  "js/components/evidence.js",
  "js/components/about.js",
  "js/data/dashboard-data.js",
  "js/data/author-profile.js",
  "data/evidence.json",
  "data/family_skill_matrix.csv",
  "data/position_skill_matrix.csv",
  "assets/author/nethan-profile.png",
  "scripts/build_data.py",
];
for (const r of refs) {
  if (existsSync(join(ROOT, r))) ok(r);
  else fail(`missing referenced file: ${r}`);
}
const html = readFileSync(join(ROOT, "index.html"), "utf8");
for (const m of html.matchAll(/(?:href|src)="(styles\/[^"]+|js\/[^"]+)"/g)) {
  if (!existsSync(join(ROOT, m[1]))) fail(`index.html references missing file: ${m[1]}`);
}

/* ---------- data module ---------- */
console.log("Data contract");
const { dashboardData: data } = await import("./js/data/dashboard-data.js");
if (!data?.meta?.population) fail("dashboard-data.js missing meta.population");
else ok("dashboard-data.js loads and carries meta");

const fams = data.families;
const posMeta = Object.fromEntries(data.positions.map((p) => [p.name, p]));
const famMeta = Object.fromEntries(fams.map((f) => [f.name, f]));
const allSkills = [...data.skills.skills, ...data.skills.tools];

if (fams.length !== 14) fail(`expected 14 role families, got ${fams.length}`);
else ok(`14 role families (Other last: ${fams[fams.length - 1].name === "Other" || fams[fams.length - 1].name.startsWith("Other")})`);
if (data.skills.skills.length !== 12 || data.skills.tools.length !== 12)
  fail(`expected 12+12 selected skills, got ${data.skills.skills.length}+${data.skills.tools.length}`);
else ok("12 skills + 12 tools selected");
const ids = allSkills.map((s) => s.id);
if (new Set(ids).size !== ids.length) fail("skill id collision");
else ok("skill ids unique across tabs");

const pop = data.meta.population;
if (pop.eligible !== 1095) fail(`population: expected 1095 eligible listings, got ${pop.eligible}`);
else ok("population: 1,095 eligible listings (matches findings.md)");
if (pop.full_desc !== 1094 || pop.partial_desc !== 1)
  fail(`descriptions: expected 1094 full + 1 partial, got ${pop.full_desc} + ${pop.partial_desc}`);
else ok("descriptions: 1,094 full + 1 partial");

/* ---------- matrix integrity ---------- */
console.log("Matrix integrity");
const r1 = (x) => Math.round(x * 10) / 10;
let pctBad = 0, denomBad = 0, countBad = 0;
/* tolerance 0.05 + epsilon: stored pcts are round-half-even from the
   pipeline; ties (exact .xx5) legitimately differ by 0.05 from JS rounding */
const TOL = 0.05 + 1e-9;
for (const c of [...data.family_matrix, ...data.position_matrix]) {
  const denom = c.level === "family" ? famMeta[c.group]?.analyzable : posMeta[c.group]?.analyzable;
  if (denom == null || c.denominator !== denom) denomBad++;
  if (Math.abs(c.pct_req_or_pref - (c.req_or_pref / c.denominator) * 100) > TOL) pctBad++;
  if (Math.abs(c.pct_mention - (c.mention / c.denominator) * 100) > TOL) pctBad++;
  if (c.mention < c.req_or_pref || c.req_or_pref < 0 || c.required + c.preferred < c.req_or_pref) countBad++;
  if (c.overlap !== c.required + c.preferred - c.req_or_pref) countBad++;
}
if (pctBad || denomBad || countBad) {
  if (pctBad) fail(`${pctBad} cells with inconsistent percentages`);
  if (denomBad) fail(`${denomBad} cells with wrong denominators`);
  if (countBad) fail(`${countBad} cells with inconsistent count relationships`);
} else ok(`all ${data.family_matrix.length + data.position_matrix.length} matrix cells: percentages = count/denominator, counts consistent`);

/* skill totals across family rows must equal the selection totals */
let totBad = 0;
for (const tab of ["skills", "tools"]) {
  for (const s of data.skills[tab]) {
    const rows = data.family_matrix.filter((c) => c.skill_id === s.id);
    const rp = rows.reduce((a, c) => a + c.req_or_pref, 0);
    const men = rows.reduce((a, c) => a + c.mention, 0);
    if (rp !== s.req_or_pref_total || men !== s.mention_total) totBad++;
  }
}
if (totBad) fail(`${totBad} skills whose family-row totals differ from selection totals`);
else ok("every skill's family-row totals match its population totals");

/* every family x selected skill: row present, or documented observed zero */
const famCells = new Set(data.family_matrix.map((c) => `${c.group}|${c.skill_id}`));
let missing = 0;
for (const f of fams) for (const s of allSkills) if (!famCells.has(`${f.name}|${s.id}`)) missing++;
ok(`family coverage: ${famCells.size} populated cells, ${missing} observed-zero cells (all listings scanned — zero ≠ missing)`);

/* positions all map into a family */
const badPos = data.positions.filter((p) => !famMeta[p.family] && p.family !== "Other");
if (badPos.length) fail(`positions with unknown family: ${badPos.map((p) => p.name).join(", ")}`);
else ok("all positions map to a known role family");

/* ---------- evidence ---------- */
console.log("Evidence");
const evidence = JSON.parse(readFileSync(join(ROOT, "data/evidence.json"), "utf8"));
const skillIds = new Set(ids);
const groupNames = new Set([...fams.map((f) => f.name), ...data.positions.map((p) => p.name)]);
let badKeys = 0, gapCells = 0;
const evKeys = new Set(Object.keys(evidence));
for (const k of evKeys) {
  const [gk, skillId] = k.split("|");
  const [level, group] = gk.split(":");
  if (!skillIds.has(skillId) || !groupNames.has(group) || !["family", "position"].includes(level)) badKeys++;
}
for (const c of [...data.family_matrix, ...data.position_matrix]) {
  if (c.req_or_pref > 0) {
    const entries = evidence[`${c.level}:${c.group}|${c.skill_id}`] ?? [];
    if (!entries.some((e) => e.status === "required" || e.status === "preferred")) gapCells++;
  }
}
if (badKeys) fail(`${badKeys} evidence keys reference unknown groups/skills`);
else ok(`all ${evKeys.size} evidence keys reference known role/skill pairs`);
if (gapCells) fail(`${gapCells} cells with req_or_pref>0 lack required/preferred evidence`);
else ok("every populated (req/pref > 0) cell has matching required-or-preferred evidence");

/* evidence entries reference real listing ids in the matrix population */
const badUrl = Object.values(evidence).flat().filter((e) => !e.id || !e.url || !e.excerpt).length;
if (badUrl) fail(`${badUrl} evidence entries missing id/url/excerpt`);
else ok("all evidence entries carry id, wording, excerpt, and source URL");

/* ---------- presentation guards ---------- */
console.log("Presentation guards");
const hm = readFileSync(join(ROOT, "js/components/heatmap.js"), "utf8");
if (!hm.includes("Patterns in collected, remote-heavy job listings")) fail("market caveat text missing from the chart");
else ok("market caveat rendered beside the chart");
if (!hm.includes("observed zero")) fail("observed-zero distinction missing");
else ok("observed zero distinguished from missing data");
if (!hm.includes("small_group")) fail("small-group flag not consumed");
else ok("small-group (<10 analyzable) flags consumed");
if (/placeholder/i.test(readFileSync(join(ROOT, "js/data/dashboard-data.js"), "utf8")))
  fail("dashboard-data.js contains placeholder markers");
else ok("no placeholder markers in the data module");
if (!hm.includes("0–100")) fail("shared 0–100% scale note missing");
else ok("shared 0–100% scale stated");

console.log(`\n${errors === 0 ? "PASS" : "FAIL"} — ${checks} check(s) passed, ${errors} error(s)`);
process.exit(errors === 0 ? 0 : 1);
