/**
 * Names, and the URLs they become.
 *
 * An element's URL is the site's most-copied string: it appears in the table, in the index, in
 * the rankings, in the group pages, in a sitemap, and in whatever anyone links to from outside.
 * Each of those is a place it can be spelled differently, so the rule lives in one function and
 * everything else asks it.
 *
 * The interesting case is spelling. The site writes British English — aluminium, caesium, sulphur
 * — and the datasets do not, so the preferred spelling is applied before the slug is built, not
 * after. Slugging first and patching afterwards would leave `/aluminum` as a URL that once existed
 * and must not, and a URL is not a thing you get to take back.
 */

/**
 * Names this project spells differently from the American English the datasets use.
 *
 * Short on purpose: these are the three elements whose English names genuinely differ, and a
 * longer list would be a place for typos to hide.
 */
export const PREFERRED_NAMES = new Map([
  ["Aluminum", "Aluminium"],
  ["Cesium", "Caesium"],
  ["Sulfur", "Sulphur"],
]);

/**
 * A name in this project's spelling.
 *
 * @param {string} name
 * @returns {string}
 */
export function displayName(name) {
  const text = String(name ?? "").trim();
  const capitalised = text.charAt(0).toUpperCase() + text.slice(1);

  return PREFERRED_NAMES.get(capitalised) ?? capitalised;
}

/**
 * A name as a URL segment: lowercase, words separated by single hyphens.
 *
 * Apostrophes and other punctuation are dropped rather than turned into separators, so a term has
 * one obvious slug instead of two that look equally right.
 *
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2018\u2019]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * An element's name as its slug, with the preferred spelling applied first.
 *
 * @param {string} name
 * @returns {string}
 */
export function slugFor(name) {
  return slugify(displayName(name));
}

/**
 * A slug back into something a person can read.
 *
 * Case cannot be recovered — `melting-point` could have been `Melting Point` or `melting point` —
 * so this capitalises the first word and leaves the rest alone. It is a label, not a round trip,
 * and the name says so.
 *
 * @param {string} slug
 * @returns {string}
 */
export function labelFromSlug(slug) {
  const words = String(slug ?? "").replace(/-+/g, " ").trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}
