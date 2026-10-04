/**
 * The site's own configuration — the few strings that are not data and not prose.
 *
 * A tag line, a provenance note and a contact address, all of which appear in more than one place and all
 * of which would be duplicated if each page wrote its own. The footer's note is the version of the
 * provenance statement that fits in one sentence at the bottom of every page; the about page's is the
 * long one, counted from the records.
 *
 * **The address is a constant rather than an environment variable.** A static site has no server to read
 * one, and a build that produced different links on different machines would be worse than one that is
 * honestly the same everywhere. It is `example` on purpose: the domain is a placeholder, and a printed
 * page that carries it says honestly where a printout came from rather than naming a host that does not
 * exist. Changing it is one edit in one file.
 */

/** The line under the wordmark. */
export const TAGLINE = "Every element, the table that arranges them, and the words for what they do.";

/**
 * The provenance note in the footer — one sentence, on every page.
 *
 * Kept short because it is read by nobody most of the time, and because the long version is on the about
 * page, counted from the records rather than written. What matters here is that the claim is true and
 * that it is visible.
 */
export const PROVENANCE_NOTE =
  "Element facts come from an openly licensed dataset, transformed by a script in this " +
  "repository. The explanations are written for this site.";

/** The address to write to, as a `mailto:` href. */
export const CONTACT_EMAIL = "mailto:hello@chemipedia.example";

/** The same address without the scheme, for prose that says "write to". */
export const CONTACT_ADDRESS = CONTACT_EMAIL.replace(/^mailto:/, "");

/**
 * The address a printed page should carry.
 *
 * A printed periodic table with nothing on it saying where it came from is of limited use to whoever
 * found it in a drawer, and this is the one thing on the sheet worth the ink. Deliberately a plain
 * sentence rather than a link: a printed link cannot be followed, and a bare URL at the bottom of a sheet
 * of paper reads as an artefact rather than as an instruction.
 */
export const PRINT_ORIGIN = "chemipedia.example";

/**
 * The site's own origin, without a trailing slash.
 *
 * A canonical link, an `og:url` and a sitemap all have to name the site absolutely, and there is no
 * server to ask at build time. Like the address and the print origin above, this is one constant
 * rather than an environment variable, and it is `example` for the same reason: a build that emitted
 * different absolute URLs on different machines would produce a sitemap full of lies. Changing it is
 * one edit, and deploying means editing it.
 */
export const SITE_ORIGIN = "https://chemipedia.example";

/** The site name, for `og:site_name`. */
export const SITE_NAME = "ChemiPedia";

/**
 * The card a link shows when it is shared.
 *
 * `source/assets/brand/social-card.svg` is the editable original; the PNG beside it is what is
 * referenced, because the large crawlers that read `og:image` will not render an SVG. See the note in
 * `assets/brand/README.md` for how the PNG was produced and how to regenerate it.
 */
export const SOCIAL_CARD = "/assets/brand/social-card.png";
