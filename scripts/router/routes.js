/**
 * The route manifest.
 *
 * Every URL this site publishes is declared here. Nothing discovers routes by walking the file
 * system: the build renders this list and nothing else, so the manifest is the single place that
 * answers "which pages exist?". That matters most for the generated families — all 118 element
 * pages, all 418 glossary terms — where an explicit list turns "every element page was built" into
 * an assertion a test can make rather than a hope.
 *
 * The manifest holds plain data, not functions, so the same list can be read by the Node build, by
 * the test suite and by the browser router without any of them depending on the others.
 *
 * The list declares the whole static inventory, which is more than is built. That is deliberate:
 * the addresses and the metadata are part of the design, the shell links them, and the build
 * renders the ones whose template exists and reports the rest. Nothing needs editing when a later
 * phase adds a page — its template appears, and the page starts being rendered.
 *
 * Fields
 *   path         The published URL. Always begins with `/`, and is either the bare root or ends
 *                with `/`: the site serves directory-style URLs, so `/elements/hydrogen/` is
 *                canonical and `/elements/hydrogen` redirects to it.
 *   template     The name of the authored template in `source/pages/`, without its extension.
 *   title        The document title, written by us.
 *   description  The meta description, written by us.
 *   nav          Optional. The label and order this route takes in the primary navigation.
 *   section      Optional. Which contextual submenu the page carries, if any. The submenus
 *                themselves live in `navigation.js`, because they are an arrangement rather than a
 *                set of URLs.
 *
 * A page family shares one template when the difference between its pages is data — the 118
 * element pages are one template, and so are the eleven group pages. Where the difference is
 * written copy, each page has its own template; the four table views share a component rather than
 * a file.
 *
 * The generated families — element detail pages, group pages and glossary terms — are **derived from
 * the data layer**, never written out. One hundred and eighteen element paths listed by hand would be
 * 118 opportunities to type a slug wrongly, and nothing would notice until a reader clicked it.
 *
 * Deriving them costs the manifest one function rather than one array, and it costs the reader
 * nothing: `build.js` and the browser's router both ask for the same list from the same records, so
 * the set of pages the site publishes is decided in one place from one source of truth.
 *
 * A generated route carries only what a template needs to identify itself — for an element, its slug.
 * The record itself is looked up from the repository, so the manifest holds 118 slugs rather than 118
 * copies of every record.
 */

export const routes = [
  {
    path: "/",
    template: "home",
    title: "ChemiPedia — an interactive periodic table",
    description:
      "An interactive periodic table of all 118 elements, with element properties, group " +
      "overviews and a chemistry glossary.",
    nav: { label: "Periodic Table", order: 1 },
    section: "periodic-table",
  },
  {
    path: "/elements/",
    template: "elements-index",
    title: "Elements — all 118, in order of atomic number",
    description:
      "Every element in the periodic table, ordered by atomic number, with its symbol, group, " +
      "atomic weight and state at room temperature.",
    nav: { label: "Elements", order: 2 },
    section: "elements",
  },
  {
    path: "/periodic-table/properties-and-states/",
    template: "properties-and-states",
    title: "Properties and states of the elements",
    description:
      "The periodic table coloured by state at room temperature, with the counts of solids, " +
      "liquids and gases and the elements that change state near it.",
    section: "table-views",
  },
  {
    path: "/periodic-table/orbitals/",
    template: "orbitals",
    title: "Orbitals and electron configurations",
    description:
      "The periodic table coloured by orbital block, showing how the s, p, d and f blocks give " +
      "the table its shape.",
    section: "table-views",
  },
  {
    path: "/periodic-table/electronegativity/",
    template: "electronegativity",
    title: "Electronegativity across the periodic table",
    description:
      "The periodic table coloured by electronegativity, from fluorine to caesium, with the " +
      "trend across periods and down groups explained.",
    section: "table-views",
  },
  {
    path: "/periodic-table/evolution/",
    template: "evolution",
    title: "The evolution of the periodic table",
    description:
      "How the periodic table took its present shape, from the first groupings of the elements " +
      "to the synthetic elements at the end of the last century.",
    section: "table-views",
  },
  {
    path: "/properties/melting-point/",
    template: "melting-point",
    title: "Melting points of the elements",
    description:
      "Every element ranked by melting point, from helium to tungsten, with the values that " +
      "make the extremes worth knowing.",
    section: "elements",
  },
  {
    path: "/properties/boiling-point/",
    template: "boiling-point",
    title: "Boiling points of the elements",
    description:
      "Every element ranked by boiling point, with the elements that are gases, the metals that " +
      "refuse to boil, and the values that need qualifying.",
    section: "elements",
  },
  {
    path: "/properties/orbital-configuration/",
    template: "orbital-configuration",
    title: "Orbital configurations of the elements",
    description:
      "The electron configuration of every element, grouped by block, with the notation " +
      "explained and the irregularities named.",
    section: "elements",
  },
  {
    path: "/downloads/",
    template: "downloads",
    title: "Periodic table downloads and printables",
    description:
      "Printable periodic tables and element cards, ready to print at A4 or Letter, with and " +
      "without the group colours.",
    section: "tools",
  },
  {
    path: "/calculators/temperature/",
    template: "temperature-calculator",
    title: "Temperature calculator",
    description:
      "Convert temperatures between Celsius, Fahrenheit and Kelvin, with the notable reference " +
      "points listed alongside.",
    nav: { label: "Calculators", order: 4 },
    section: "tools",
  },
  {
    path: "/glossary/",
    template: "glossary-index",
    title: "Chemistry glossary",
    description:
      "A glossary of the vocabulary of the periodic table and chemistry, from absolute zero to " +
      "the terms that only make sense once two elements sit next to each other.",
    nav: { label: "Glossary", order: 3 },
    section: "reference",
  },
  {
    path: "/element-groups/",
    template: "element-groups-index",
    title: "Element groups",
    description:
      "The eleven groups of the periodic table, from the alkali metals to the noble gases, and " +
      "what the elements in each one have in common.",
    section: "reference",
  },
  {
    path: "/about/",
    template: "about",
    title: "About ChemiPedia",
    description:
      "What ChemiPedia is, how it is built, where the element data comes from, and how to " +
      "reproduce it.",
    section: "about",
  },
  {
    path: "/contact/",
    template: "contact",
    title: "Contact ChemiPedia",
    description: "How to get in touch about ChemiPedia, including corrections to the data.",
    section: "about",
  },
];

/**
 * The metadata for one element page.
 *
 * The description is the record's own first sentence, capped at a length a search engine will not
 * truncate mid-word. Taking a sentence rather than the whole summary is deliberate: the summary is
 * written to be read in a paragraph, and a meta description is read in a list.
 *
 * @param {{ name: string, symbol: string, slug: string, summary: string }} element
 * @returns {{ title: string, description: string }}
 */
function elementMetadata(element) {
  const firstSentence = element.summary.split(/(?<=\.)\s+/)[0];
  const capped =
    firstSentence.length <= DESCRIPTION_LENGTH
      ? firstSentence
      : `${firstSentence.slice(0, DESCRIPTION_LENGTH).replace(/\s+\S*$/, "")}…`;

  return {
    title: `${element.name} (${element.symbol}) — properties, uses and discovery`,
    description: capped,
  };
}

/** How long a generated page's meta description may be before it is cut at a word. */
const DESCRIPTION_LENGTH = 155;

/**
 * The 118 element pages, derived from the records.
 *
 * @param {{ slug: string, name: string, symbol: string, summary: string }[]} elements
 * @returns {object[]}
 */
export function elementRoutes(elements) {
  return elements.map((element) => ({
    path: `/elements/${element.slug}/`,
    template: "element-detail",
    element: element.slug,
    section: "elements",
    ...elementMetadata(element),
  }));
}

/**
 * The eleven group pages, derived from the categories.
 *
 * The same argument the 118 element routes make, for the same reason: eleven paths written by hand
 * are eleven chances to mistype a slug, and the slugs already exist in `categories.json` beside the
 * names the pages are titled with. Deriving them means a category added there becomes a page here
 * without anyone remembering to add a route, and a category removed takes its page with it.
 *
 * @param {{ slug: string, name: string, plural: string }[]} categories
 * @returns {object[]}
 */
export function groupRoutes(categories) {
  return categories.map((category) => ({
    path: `/element-groups/${category.slug}/`,
    template: "group",
    group: category.slug,
    section: "reference",
    // The plural is stored rather than made by adding an "s", because "unknown elements" is the one
    // of the eleven that does not end that way.
    label: category.plural,
    title: `${capitalise(category.plural)} — properties, members and what they have in common`,
    description: `The ${category.count} ${category.plural} on one page: where they sit in the table, what they have in common, and a page for each one.`,
  }));
}

/**
 * The glossary term pages, derived from the terms.
 *
 * Four hundred and eighteen paths from four hundred and eighteen records, for the same reason the 118
 * element paths are derived: a list written by hand is a list that can be typed wrongly, and the slugs
 * are already in `glossary.json` beside the words the pages are titled with.
 *
 * The description is the definition, capped at a length a search engine will not truncate mid-word —
 * and for this family the definition *is* the right thing to put there, because a search result for a
 * glossary term should show the meaning rather than a sentence about what the page contains.
 *
 * @param {{ term: string, slug: string, definition: string }[]} terms
 * @returns {object[]}
 */
export function glossaryRoutes(terms) {
  return terms.map((term) => {
    const capped =
      term.definition.length <= DESCRIPTION_LENGTH
        ? term.definition
        : `${term.definition.slice(0, DESCRIPTION_LENGTH).replace(/\s+\S*$/, "")}…`;

    return {
      path: `/glossary/${term.slug}/`,
      template: "glossary-term",
      term: term.slug,
      section: "reference",
      title: `${term.term} — definition, ${term.level.toLowerCase()} chemistry term`,
      description: capped,
    };
  });
}

/**
 * A phrase's first letter, upper-cased.
 *
 * @param {string} text
 * @returns {string}
 */
function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Every route the site publishes: the hand-written inventory plus whatever the data layer generates.
 *
 * The arguments are the element records, the categories and the glossary terms, and they are arguments
 * rather than loads because this module is plain data both to the build in Node and to the browser.
 * Whoever calls it has the records to hand — the build from the data directory, the browser from the
 * repositories it needs anyway.
 *
 * @param {{ slug: string, name: string, symbol: string, summary: string }[]} [elements]
 * @param {{ slug: string, name: string, plural: string, count: number }[]} [categories]
 * @param {{ term: string, slug: string, definition: string, level: string }[]} [terms]
 * @returns {object[]}
 */
export function allRoutes(elements = [], categories = [], terms = []) {
  return [
    ...routes,
    ...elementRoutes(elements),
    ...groupRoutes(categories),
    ...glossaryRoutes(terms),
  ];
}

/**
 * Families whose routes share one authored template.
 *
 * A page family is one template, one module and one stylesheet, named after the family — so the three
 * property rankings are three routes behind one file called `ranking`, not three near-identical files
 * to keep in step. The route's own name is what tells the module which columns its rows have, so
 * nothing is lost by sharing the markup.
 *
 * @type {Record<string, string>}
 */
const TEMPLATE_FAMILY = {
  group: "group",
  "melting-point": "ranking",
  "boiling-point": "ranking",
  "orbital-configuration": "ranking",
  "properties-and-states": "table-view",
  orbitals: "table-view",
  electronegativity: "table-view",
  evolution: "table-view",
};

/**
 * The family a route belongs to: the name its template and stylesheet are both filed under.
 *
 * Usually the route's own template name. It differs when one family is several routes — the eleven
 * group pages share `group`, the three property rankings share `ranking` and the four alternate table
 * views share `table-view`, so each of them is named by what it is about and filed under what it is
 * made of.
 *
 * @param {{ template: string }} route
 * @returns {string}
 */
export function familyFor(route) {
  return TEMPLATE_FAMILY[route.template] ?? route.template;
}

/**
 * The authored template for a route, as a path relative to `source/`.
 *
 * The build reads this file and wraps its markup in the document skeleton; the build also uses it
 * to decide whether a declared route is ready to render; tests use it to prove the declaration is
 * well-formed.
 *
 * @param {{ template: string }} route
 * @returns {string}
 */
export function templatePathFor(route) {
  return `pages/${familyFor(route)}.html`;
}

/**
 * The page's own stylesheet, as a path relative to `source/`.
 *
 * The one the family is filed under rather than the one the route is named after, for the same
 * reason the template is: three routes are one stylesheet.
 *
 * @param {{ template: string }} route
 * @returns {string}
 */
export function stylesheetPathFor(route) {
  return `styles/pages/${familyFor(route)}.css`;
}
