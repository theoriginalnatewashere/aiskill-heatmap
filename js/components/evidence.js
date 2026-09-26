/* ============================================================
   components/evidence.js — the provenance tooltip system
   Port of the reference Tip.tsx (TipProvider + Evidence):
   - hover follows the cursor; click or keyboard-focus pins
   - Esc / scroll / outside-click close; pinned survives mouse-out
   - viewport-clamped positioning; single overlay, offset shadow
   - fully keyboard-operable (tabindex + focus pin) with
     aria-labels carried by the figure elements themselves

   Usage: any element with [data-tip="<key>"] becomes evidence.
   Keys resolve against the `tips` registry passed to attachEvidence.
   ============================================================ */

const TIP_WIDTH = 360;
const EDGE_X = 372; /* keep tooltip clear of the right edge */
const EDGE_Y = 240; /* and the bottom edge */

let tipEl = null;
let registry = { tips: {} };
let current = null; /* { key, x, y, pinned } */

function ensureTipEl() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "provenance-tip";
  tipEl.setAttribute("role", "tooltip");
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

function position(x, y) {
  const w = globalThis.innerWidth ?? 1200;
  const h = globalThis.innerHeight ?? 800;
  tipEl.style.left = `${Math.max(12, Math.min(x + 16, w - EDGE_X))}px`;
  tipEl.style.top = `${Math.max(12, Math.min(y + 16, h - EDGE_Y))}px`;
}

function render(key) {
  const html = registry.tips[key];
  if (!html) return false;
  ensureTipEl();
  const pinned = current?.pinned;
  tipEl.innerHTML =
    `<div class="tip-head"><span class="tip-label">Provenance${pinned ? " · pinned (Esc to close)" : ""}</span></div>` +
    `<div class="tip-body">${html}</div>`;
  tipEl.hidden = false;
  return true;
}

function show(key, x, y, pinned = false) {
  if (current?.pinned && !pinned) return; /* a pinned tip wins over hover, like the reference */
  current = { key, x, y, pinned };
  if (render(key)) position(x, y);
}

function hide({ force = false } = {}) {
  if (!tipEl || tipEl.hidden) return;
  if (current?.pinned && !force) return;
  tipEl.hidden = true;
  current = null;
}

function clearPinned() {
  current = null;
  if (tipEl) tipEl.hidden = true;
}

export function attachEvidence(root, { tips }) {
  registry = { tips };

  root.addEventListener("mouseover", (e) => {
    const target = e.target.closest?.("[data-tip]");
    if (!target) return;
    show(target.dataset.tip, e.clientX, e.clientY, false);
  });

  root.addEventListener("mousemove", (e) => {
    if (!tipEl || tipEl.hidden || current?.pinned) return;
    if (e.target.closest?.("[data-tip]")) position(e.clientX, e.clientY);
  });

  root.addEventListener("mouseout", (e) => {
    const from = e.target.closest?.("[data-tip]");
    if (!from) return;
    const to = e.relatedTarget?.closest?.("[data-tip]");
    if (from !== to) hide();
  });

  root.addEventListener("click", (e) => {
    const target = e.target.closest?.("[data-tip]");
    if (target) {
      e.stopPropagation();
      show(target.dataset.tip, e.clientX, e.clientY, true); /* click pins */
      return;
    }
    clearPinned(); /* outside click closes a pinned tip */
  });

  root.addEventListener("focusin", (e) => {
    const target = e.target.closest?.("[data-tip]");
    if (!target) return;
    const r = target.getBoundingClientRect();
    show(target.dataset.tip, r.left, r.bottom, true); /* keyboard focus pins */
  });

  root.addEventListener("focusout", () => hide());

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") clearPinned();
  });
  window.addEventListener("scroll", () => clearPinned(), { passive: true });
}

/** Build an evidence element's attribute string for HTML-string renderers. */
export function tipAttrs(key, label) {
  const attrs = ` data-tip="${key}" tabindex="0"`;
  return label ? `${attrs} aria-label="${label}"` : attrs;
}
