/* ============================================================
   components/about.js — AboutMe section
   Permanent closing band, rendered by main.js immediately
   before the Provenance Chain footer. Pure renderer (HTML
   string in → HTML string out), styled only with tokens.css
   roles. The portrait asset keeps its own monochrome /
   green-circle treatment — never filtered or recolored.
   Content lives in js/data/author-profile.js.
   ============================================================ */

import { esc } from "../lib/util.js";

export function renderAboutMe(profile) {
  const missing = ["name", "subtitle", "bio", "image"].filter((k) => !profile?.[k]);
  if (missing.length) {
    throw new Error(`author profile is missing required fields: ${missing.join(", ")}`);
  }

  /** Name renders as given: a string, or an array of display lines
      (e.g. ["NETHAN", "SUPAKITCHUMNAN"]) joined with <br>. */
  const nameLines = (Array.isArray(profile.name) ? profile.name : [profile.name])
    .map((line) => esc(line))
    .join("<br>");
  const altText = profile.imageAlt ?? (Array.isArray(profile.name) ? profile.name.join(" ") : profile.name);

  const facts = (profile.facts ?? [])
    .map(
      (fact, i) => `<li>
  <span class="about-fact-num num" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
  <span class="about-fact">${esc(fact)}</span>
</li>`
    )
    .join("\n");

  const links = (profile.links ?? [])
    .map(
      (link) => `<li><a class="ext-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}<span aria-hidden="true"> ↗</span></a></li>`
    )
    .join("\n");

  const dims =
    profile.imageWidth && profile.imageHeight
      ? ` width="${esc(profile.imageWidth)}" height="${esc(profile.imageHeight)}"`
      : "";

  return `<section class="about" id="${esc(profile.id ?? "about")}" aria-label="About the author">
  <div class="container">
    <div class="about-grid">
      <div class="about-text">
        <p class="about-kicker num">${esc(profile.kicker ?? "About me")}</p>
        <h2 class="about-name">${nameLines}</h2>
        <p class="about-subtitle">${esc(profile.subtitle)}</p>
        <p class="about-bio">${esc(profile.bio)}</p>
        ${facts ? `<ol class="about-facts">${facts}</ol>` : ""}
      </div>
      <figure class="about-portrait">
        <img src="${esc(profile.image)}" alt="${esc(altText)}"${dims} loading="lazy">
      </figure>
    </div>
    ${links ? `<ul class="about-links">${links}</ul>` : ""}
  </div>
</section>`;
}
