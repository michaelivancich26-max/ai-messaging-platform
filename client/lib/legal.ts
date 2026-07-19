// Single source of truth for the CURRENT version of the user-facing agreements.
// Bump AGREEMENTS_VERSION whenever the Terms, Privacy Policy, or Community
// Guidelines change materially — every user whose stored acceptance differs is
// re-prompted to accept. Keep this value in sync with the server constant in
// services/legal.ts (they are deliberately duplicated across the client/server
// package boundary).
export const AGREEMENTS_VERSION = "2026-07-19";

// Human-readable effective date shown on the documents.
export const LEGAL_EFFECTIVE_DATE = "July 19, 2026";

// Operator name. Defaults to the product itself; change to a registered legal
// entity name here if you incorporate one.
export const LEGAL_ENTITY = "Grounds for Debate";
// These two are genuinely yours to set — a real inbox and the governing-law
// jurisdiction. Update them here (single source of truth for every document).
export const LEGAL_CONTACT_EMAIL = "[legal@your-domain.com]";
export const LEGAL_GOVERNING_LAW = "[State / Country]";
export const MIN_AGE = 13;

export const LEGAL_DOCS = [
  { slug: "terms", title: "Terms of Service" },
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "guidelines", title: "Community Guidelines" },
  { slug: "cookies", title: "Cookie Policy" },
] as const;
