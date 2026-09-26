/* ============================================================
   data/author-profile.js — About Me content (single source)
   Rendered by js/components/about.js. All author content lives
   here — edit this file to change the section; the renderer is
   never hard-coded. Content below is the approved copy.
   ============================================================ */

export const authorProfile = {
  /** Section id (anchor target). */
  id: "about",

  /** Section label (kicker; uppercased by CSS). */
  kicker: "About me",

  /** Display name — array renders one line per entry. */
  name: ["NETHAN", "SUPAKITCHUMNAN"],
  subtitle: "Designer, researcher, and data explorer",

  /** About text (approved copy — exact). */
  bio: "I’m a designer, researcher, and data nerd who enjoys turning messy information into clear stories. I like chasing patterns, spotting odd little anomalies, and following the trail until the data finally gives up its insight. When I’m not exploring datasets, I’m usually experimenting with AI tools, building side projects, refining interfaces, taking photos, or disappearing into a research rabbit hole that somehow ends in a spreadsheet.",

  /** Fun facts (approved copy — exact). */
  facts: [
    "I can turn one simple question into at least three charts.",
    "I like AI, design systems, photography, travel, and thoughtful side projects.",
    "My natural habitat is somewhere between a dashboard, a notebook, and a research rabbit hole.",
  ],

  /** Approved portrait — referenced site-root-absolute so every dashboard on
      the shared Netlify site reuses the one deployed asset. Canonical source:
      templates/research-dashboard/assets/author/nethan-profile.png — each
      build copies it to <publish dir>/assets/author/nethan-profile.png. */
  image: "/assets/author/nethan-profile.png",
  imageAlt: "Monochrome portrait of Nethan Supakitchumnan over a green circular accent",
  imageWidth: 1122,
  imageHeight: 1402,

  /** Profile links (approved URLs). Rendered target="_blank"
      rel="noopener noreferrer" by the component. */
  links: [
    { label: "GitHub", url: "https://github.com/theoriginalnatewashere" },
    { label: "Website", url: "https://natewashere.com" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/nethansu/" },
    { label: "Substack", url: "https://substack.com/@natehere" },
  ],
};
