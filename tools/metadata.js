/**
 * The structured data and machine-readable metadata a page carries.
 *
 * **What is deliberately absent.** `sameAs` is the field that would point at Wikidata or PubChem, and
 * it is left out: the dataset records those as the *sources* of supplementary facts but carries no
 * identifiers, and writing 118 QIDs by hand from memory is a way to ship 118 wrong links. Everything
 * below is read from a record or from a constant in this repository.
 *
 * **`ChemicalSubstance` is a compromise, and it is the closest honest one.** schema.org has no
 * settled type for a chemical element — `ChemicalElement` 404s — and `ChemicalSubstance` is flagged in
 * schema.org's "new area", meaning its adoption is still settling. It is used here because the
 * properties we can fill truthfully (`name`, `alternateName`, `chemicalComposition`, `description`)
 * are the ones an element actually has, and because a `BreadcrumbList` alongside it is understood
 * everywhere. If schema.org settles a better type, this is the one file to change.
 *
 * Pure data in, JSON out: no DOM, so it is testable in Node and runs at build time.
 */

import { SITE_NAME, SITE_ORIGIN } from "../scripts/lib/site.js";

const CONTEXT = "https://schema.org";

/**
 * A site-level description, on the home page only.
 *
 * `SearchAction` is declared because it is the honest shape for a site with a search box — but the
 * box filters the page it is on rather than navigating, so no `target` is offered. Declaring a
 * `/search?q=` endpoint that does not exist would be worse than declaring none.
 *
 * @returns {object}
 */
export function webSite() {
  return {
    "@type": "WebSite",
    name: SITE_NAME,
    description: "An interactive periodic table: every element, the table that arranges them, and the words for what they do.",
  };
}

/**
 * The page itself.
 *
 * @param {{ path: string, title: string, description: string, image: string }} page
 * @returns {object}
 */
export function webPage({ path, title, description, image }) {
  return {
    "@type": "WebPage",
    url: path,
    name: title,
    description,
    isPartOf: { "@type": "WebSite", name: SITE_NAME },
    primaryImageOfPage: image,
  };
}

/**
 * A trail of pages leading to this one, as a `BreadcrumbList`.
 *
 * Returned as `null` for a page with no trail rather than as an empty list, because an empty
 * `BreadcrumbList` is a claim that the page has a position in a hierarchy and does not.
 *
 * @param {{ name: string, path: string }[]} trail
 * @returns {object | null}
 */
export function breadcrumbs(trail) {
  if (trail.length < 2) {
    return null;
  }

  return {
    "@type": "BreadcrumbList",
    // Absolute, not site-relative: a consumer reading the structured data has no base URL to resolve
    // `/elements/` against, so a relative item is a link that goes nowhere.
    itemListElement: trail.map((step, position) => ({
      "@type": "ListItem",
      position: position + 1,
      name: step.name,
      item: `${SITE_ORIGIN}${step.path}`,
    })),
  };
}

/**
 * An element, as a chemical substance.
 *
 * `chemicalComposition` is the symbol, which is what that property means for something that is not
 * a compound. `identifier` is an atomic number expressed as a `PropertyValue` rather than as text, so
 * a reader can tell it apart from a name.
 *
 * @param {{ element: object, path: string }} page
 * @returns {object}
 */
export function chemicalSubstance({ element, path }) {
  return {
    "@type": "ChemicalSubstance",
    name: element.name,
    alternateName: element.symbol,
    chemicalComposition: element.symbol,
    description: element.summary,
    url: path,
    identifier: {
      "@type": "PropertyValue",
      name: "Atomic number",
      value: element.atomicNumber,
    },
  };
}

/**
 * The short name a page should be known by in a trail.
 *
 * The `title` is not it: an element page is titled "Iron (Fe) — properties, uses and discovery", and
 * a breadcrumb reading that tells a reader nothing they cannot already see. Thirteen pages — the
 * standalone ones with no em dash in their title — take the whole title, which for those is the label
 * already. A test holds both halves of that.
 *
 * @param {{ path: string, title: string }} page
 * @param {{ element?: { name: string }, term?: { term: string } }} [context]
 * @returns {string}
 */
export function labelFor(page, context = {}) {
  return context.element?.name ?? context.term?.term ?? page.title.split(" — ")[0];
}

/**
 * Everything one page declares, as a single `@graph`.
 *
 * A graph rather than a list of separate script elements: several nodes describing one page is what
 * a `@graph` is for, and one element to parse is one less thing to get wrong.
 *
 * @param {object[]} nodes
 * @returns {object}
 */
export function graph(nodes) {
  return { "@context": CONTEXT, "@graph": nodes.filter((node) => node !== null) };
}

/**
 * `sitemap.xml`, for the routes that built.
 *
 * Excludes the not-found page: a URL that returns 404 belongs in neither a sitemap nor an index, and
 * listing it invites exactly the soft-404 behaviour the page exists to prevent. Every `lastmod` is
 * left out rather than filled with the build time, because a build time is not a modification and a
 * crawler told otherwise learns to ignore the field.
 *
 * @param {string[]} paths the routes that built, each beginning and ending with a slash
 * @returns {string}
 */
export function sitemapFor(paths) {
  const entries = paths
    .map((route) => `  <url>\n    <loc>${SITE_ORIGIN}${route}</loc>\n  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

/**
 * `robots.txt`.
 *
 * **Deliberately permissive.** This is a reference work; the one thing it must not do is keep search
 * engines away from it. The sitemap is named because crawlers look for it, and the address carries the
 * same `example` placeholder as the contact address and the print origin — one constant to change at
 * deployment, rather than three that can disagree.
 *
 * @returns {string}
 */
export function robotsFor() {
  return `# ${SITE_NAME}
User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}
