/**
 * The build.
 *
 * Renders every ready route in the manifest to a static HTML file under `dist/`, and copies the
 * static directories across unchanged. It runs on plain Node with no packages: the whole site is
 * produced by reading an authored template, wrapping it in the document skeleton and the global
 * shell, and writing it to the file its URL owns.
 *
 * Three consequences worth stating, because they shape the rest of the project:
 *
 *   - The document skeleton and the shell are written once, here. No template carries its own
 *     `<html>`, `<head>`, `<body>`, header, submenu or footer, so a change to the chrome or to the
 *     metadata is one edit rather than one per page family.
 *   - A route whose template is not written yet is skipped and counted, not rendered as a stub.
 *     That is what lets the manifest declare the site's whole inventory before the pages exist.
 *   - Only what the browser loads is copied. `pages/` holds fragments rather than documents, and
 *     `tools/` and `tests/` are development-only, so none of them reach the built output.
 *
 * Run it directly with `node source/tools/build.js`, or import `build()` — the development server
 * does the latter so that a fresh clone needs only one command.
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { siteFooter } from "../scripts/components/site-footer.js";
import { siteHeader } from "../scripts/components/site-header.js";
import { submenu as submenuBand } from "../scripts/components/submenu.js";
import { createColourMode } from "../scripts/lib/colour-modes.js";
import { domainOf, numericScale } from "../scripts/lib/colour-scale.js";
import { escapeHtml } from "../scripts/lib/html.js";
import { CONTACT_EMAIL, SITE_NAME, SITE_ORIGIN, SOCIAL_CARD } from "../scripts/lib/site.js";
import { elementDetail } from "../scripts/pages/element-detail.js";
import { elementsIndex } from "../scripts/pages/elements-index.js";
import { homePage } from "../scripts/pages/home.js";
import { rankingPage } from "../scripts/pages/ranking.js";
import { groupPage } from "../scripts/pages/group.js";
import { glossaryIndex } from "../scripts/pages/glossary-index.js";
import { temperatureCalculator } from "../scripts/pages/temperature-calculator.js";
import { downloadsPage } from "../scripts/pages/downloads.js";
import { aboutPage } from "../scripts/pages/about.js";
import { elementGroupsIndex } from "../scripts/pages/element-groups-index.js";
import { glossaryTerm } from "../scripts/pages/glossary-term.js";
import { bandFor, DISCOVERY_BANDS, tableView } from "../scripts/pages/table-view.js";
import { footerColumns, isCurrent, primaryNavigation, sectionLanding, submenuForSection } from "../scripts/router/navigation.js";
import { allRoutes, routes, stylesheetPathFor, templatePathFor } from "../scripts/router/routes.js";
import { NOT_FOUND_FILE, distDir, outputFileForPath, projectRoot, sourceDir } from "./site-paths.js";
import { loadRepositories } from "./repositories.js";
import { loadTokens } from "./tokens.js";
import { breadcrumbs, chemicalSubstance, graph, labelFor, robotsFor, sitemapFor, webPage, webSite } from "./metadata.js";

/**
 * The page modules that have one, by template name.
 *
 * A page whose content is only written copy has no module and its template is its body. A page that
 * needs data has one, and the module is what turns a template into a page. The build is the
 * composition root, so the table of what composes what lives here rather than in a registry of its
 * own — a new page family is one import and one line.
 */
const PAGE_MODULES = {
  home: homePage,
  "element-detail": elementDetail,
  "elements-index": elementsIndex,
  "melting-point": rankingPage,
  "boiling-point": rankingPage,
  "orbital-configuration": rankingPage,
  group: groupPage,
  "glossary-index": glossaryIndex,
  "temperature-calculator": temperatureCalculator,
  downloads: downloadsPage,
  about: aboutPage,
  "element-groups-index": elementGroupsIndex,
  "glossary-term": glossaryTerm,
  "properties-and-states": tableView,
  orbitals: tableView,
  electronegativity: tableView,
  evolution: tableView,
};

/**
 * The component stylesheets each page family uses, in cascade order.
 *
 * Declared beside the page module rather than loaded everywhere. A component's stylesheet is loaded
 * by the pages that render that component and by no others, which is what keeps a page's cost
 * proportional to what is on it — and what would break immediately if every component stylesheet were
 * linked from every page, since two components can both want to own the same selector.
 */
/**
 * The three property ranking pages render the same parts, so they declare the same stylesheets. Named
 * once so that a fourth ranking page is one line rather than four.
 */
const RANKING_STYLESHEETS = [
  "styles/components/element-filter.css",
  "styles/components/element-tile.css",
];

/**
 * The four alternate table views render the same parts, so they declare the same stylesheets. The
 * legend and the grid are the same components the home page uses, at the same geometry.
 */
const TABLE_VIEW_STYLESHEETS = [
  "styles/components/legend-chips.css",
  "styles/components/periodic-table.css",
  "styles/components/element-tile.css",
];

/**
 * A group page renders the same parts as a table view plus the index card and its own facts.
 */
const GROUP_STYLESHEETS = [
  "styles/components/element-card.css",
  "styles/components/element-tile.css",
  "styles/components/legend-chips.css",
  "styles/components/periodic-table.css",
  "styles/components/group-facts.css",
];

/**
 * The glossary pages render the badge and the filter, and the term page adds its own stylesheet for the
 * panels. The badge stylesheet is shared by both glossary pages because both render badges.
 */
const GLOSSARY_STYLESHEETS = [
  "styles/components/glossary-badge.css",
];

const PAGE_COMPONENT_STYLESHEETS = {
  home: [
    "styles/components/element-search.css",
    "styles/components/element-tile.css",
    "styles/components/legend-chips.css",
    "styles/components/periodic-table.css",
  ],
  "element-detail": [
    "styles/components/element-strip.css",
    "styles/components/element-tile.css",
    "styles/components/faq-block.css",
    "styles/components/periodic-table.css",
    "styles/components/property-list.css",
    "styles/components/shell-diagram.css",
  ],
  "elements-index": [
    "styles/components/element-card.css",
    "styles/components/element-filter.css",
    "styles/components/element-tile.css",
  ],
  "melting-point": RANKING_STYLESHEETS,
  "boiling-point": RANKING_STYLESHEETS,
  "orbital-configuration": RANKING_STYLESHEETS,
  group: GROUP_STYLESHEETS,
  "glossary-index": [...GLOSSARY_STYLESHEETS, "styles/components/element-filter.css"],
  "temperature-calculator": ["styles/components/converter-input.css"],
  downloads: ["styles/components/element-card.css"],
  about: [],
  "glossary-term": GLOSSARY_STYLESHEETS,
  "properties-and-states": TABLE_VIEW_STYLESHEETS,
  orbitals: TABLE_VIEW_STYLESHEETS,
  electronegativity: TABLE_VIEW_STYLESHEETS,
  evolution: TABLE_VIEW_STYLESHEETS,
};

/**
 * Directories copied into the build untouched: the scripts, stylesheets, data and artwork the
 * browser loads. A directory that does not exist yet is skipped, so this list may name folders that
 * later phases create.
 */
const STATIC_DIRECTORIES = ["scripts", "styles", "data", "assets"];

/**
 * The stylesheets every page needs, in cascade order: the tokens first, then the layers that read
 * them, then the shell's components. A page's own stylesheet is appended after these, and only when
 * it exists, so a page family that has not been styled yet still links a working set.
 */
const GLOBAL_STYLESHEETS = ["styles/tokens.css", "styles/base.css", "styles/layout.css"];

/**
 * The print stylesheet, loaded on every page and after everything else.
 *
 * **Last is not a preference, it is the only way the rules take effect.** Every component stylesheet
 * sets its own screen values, and a print rule of the same specificity loses to whichever came later.
 * Loaded in the global layer — where it was at first — `.ptable { padding-inline: 0 }` and
 * `overflow: visible` were both beaten by `periodic-table.css`, so the table kept its 1rem of inline
 * padding and its `overflow-x: auto`, overflowed the sheet by 20px and had its eighteenth column
 * clipped off the right edge of every printed page. It is appended after the page's own stylesheet so
 * that print always wins, and a test asserts the order so it cannot quietly move again.
 *
 * It is loaded on every page rather than only on the ones that print well, because pressing print on any
 * page should give a sensible sheet rather than a photograph of a website. It is linked with
 * `media="print"`, so it is not on the critical path for a reader who came to read the screen.
 */
const PRINT_STYLESHEET = "styles/print.css";

const SHELL_STYLESHEETS = [
  "styles/components/wordmark.css",
  "styles/components/search-field.css",
  "styles/components/site-header.css",
  "styles/components/submenu.css",
  "styles/components/site-footer.css",
];

/**
 * The document served for a URL that matches no route. It is not a route — it has no URL of its own
 * — so it is declared here rather than in the manifest, but it is rendered through the same path.
 *
 * Its chrome is rendered for a path that no route matches, so no navigation item claims to be the
 * current page on a page that does not exist.
 */
const NOT_FOUND_PAGE = {
  template: "404",
  title: "Page not found — ChemiPedia",
  description: "The address you followed does not match a page on ChemiPedia.",
  currentPath: "/not-found/",
};

/**
 * Wrap authored markup in the document skeleton every page shares.
 *
 * `tabindex="-1"` on `<main>` is what makes the skip link announce where it arrived. A fragment target
 * that is not focusable still moves the browser's sequential focus start point — so the next Tab does
 * land inside the content — but `document.activeElement` never enters it and a screen reader has
 * nothing to say. -1 is the one value that makes the element focusable without adding it to the tab
 * order, and the audit rules treat a *positive* tabindex as the defect it is.
 *
 * The favicon is the one asset linked from here on its own account. A browser asks for an icon on
 * every page load, so a document that declares none produces a failed request on every page;
 * declaring ours is what keeps the console and network log clean.
 *
 * @param {{
 *   title: string,
 *   description: string,
 *   body: string,
 *   stylesheets?: string[],
 *   scripts?: string[],
 *   header?: string,
 *   submenu?: string,
 *   footer?: string
 * }} page
 * @returns {string}
 */
export function renderDocument({
  title,
  description,
  path,
  body,
  stylesheets = [],
  scripts = [],
  header = "",
  submenu = "",
  footer = "",
  jsonLd = null,
}) {
  const canonical = path === undefined ? null : `${SITE_ORIGIN}${path}`;
  const social = `${SITE_ORIGIN}${SOCIAL_CARD}`;
  const socialTags = canonical === null
    ? []
    : [
        `<link rel="canonical" href="${escapeHtml(canonical)}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
        `<meta property="og:title" content="${escapeHtml(title)}">`,
        `<meta property="og:description" content="${escapeHtml(description)}">`,
        `<meta property="og:url" content="${escapeHtml(canonical)}">`,
        `<meta property="og:image" content="${escapeHtml(social)}">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta property="og:locale" content="en_GB">`,
        // The card a reader sees when a link is shared. Twitter's own tags rather than Open Graph's,
        // because the two disagree about the large card and the large card is the point.
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${escapeHtml(title)}">`,
        `<meta name="twitter:description" content="${escapeHtml(description)}">`,
        `<meta name="twitter:image" content="${escapeHtml(social)}">`,
      ];
  // `</script>` cannot appear inside a script element, and a description containing an apostrophe is
  // written with the HTML entity — so the escaping has to survive being read back out of the DOM.
  const structured = jsonLd === null
    ? ""
    : `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;
  // `media="print"` on the print stylesheet, which is the one stylesheet a reader almost never needs
  // and the second-largest file in the visual layer at 10.8KB. Without the attribute it is downloaded
  // and parsed on every page load and blocks the first paint; with it the browser fetches it at low
  // priority and only applies it to a print. Every rule inside is already inside `@media print`, so
  // nothing about the printed sheet changes. It stays last in the cascade, which is the other thing
  // that matters and is asserted separately.
  const links = stylesheets
    .map((href) =>
      href === `/${PRINT_STYLESHEET}`
        ? `<link rel="stylesheet" href="${escapeHtml(href)}" media="print">`
        : `<link rel="stylesheet" href="${escapeHtml(href)}">`,
    )
    .join("\n");

  const modules = scripts.map((src) => `<script type="module" src="${escapeHtml(src)}"></script>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">
${socialTags.join("\n")}
${structured}
${links}
${modules}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${header}
${submenu}
<main id="main" tabindex="-1">
${body.trim()}
</main>
${footer}
</body>
</html>
`;
}

/**
 * The stylesheets a page links: the global layer, the shell, and the page's own if it has one.
 *
 * @param {{ template: string }} page
 * @returns {string[]} URLs, in cascade order
 */
export function stylesheetsFor(page) {
  const candidates = [
    ...GLOBAL_STYLESHEETS,
    ...SHELL_STYLESHEETS,
    ...(PAGE_COMPONENT_STYLESHEETS[page.template] ?? []),
    stylesheetPathFor(page),
    // Last, so that a print rule of the same specificity beats every screen rule above rather than
    // losing to whichever component happened to be linked after it.
    PRINT_STYLESHEET,
  ];

  return candidates
    .filter((relative) => existsSync(path.join(sourceDir, relative)))
    .map((relative) => `/${relative}`);
}

/**
 * The component stylesheets a page declares, for the test that checks a page links what it uses.
 *
 * @param {{ template: string }} page
 * @returns {string[]} paths relative to `source/`
 */
export function componentStylesheetsFor(page) {
  return PAGE_COMPONENT_STYLESHEETS[page.template] ?? [];
}

/**
 * Templates that render from data but wire nothing.
 *
 * Having a page module and needing a script are two different questions, and `scriptsFor` used to
 * answer both with one lookup. That sent the downloads page — a list of links, with printing left to
 * the browser — to load the entry point, which then read `elements.json`, `categories.json` and
 * `glossary.json` in order to find no behaviour to attach. Three hundred kilobytes of fetch for a page
 * whose only interaction is the browser's own print dialogue.
 *
 * The templates are listed here rather than their modules being removed, because the modules are what
 * render their pages: the downloads page's cards, the about page's provenance table and the groups
 * index's eleven cards are all generated, so the build still needs each module — and only the browser
 * does not.
 *
 * @type {Set<string>}
 */
const UNWIRED = new Set(["downloads", "about", "element-groups-index"]);

/**
 * The scripts a page loads, in order.
 *
 * One: the entry point, which finds the page's behaviour module and runs it. A page whose template
 * is its whole body loads nothing; neither does a page that renders from data and wires nothing; and
 * neither does the not-found document — a request for a behaviour file that would find nothing to do
 * is still a request, and the data it would fetch on the way is 300KB the reader did not ask for.
 *
 * @param {{ template: string }} page
 * @returns {string[]} URLs
 */
export function scriptsFor(page) {
  if (UNWIRED.has(page.template)) {
    return [];
  }

  return PAGE_MODULES[page.template] ? ["/scripts/app.js"] : [];
}

/**
 * The chrome for a page: the masthead, the contextual submenu band, and the footer.
 *
 * @param {{ section?: string }} page
 * @param {string} currentPath
 * @returns {{ header: string, submenu: string, footer: string }}
 */
/**
 * The trail of pages leading to this one, for the breadcrumb structured data.
 *
 * Home, then the page that stands for this page's section, then the page itself — with the middle step
 * left out when the page *is* that section's landing page, so `/elements/` is described as being in the
 * site rather than in itself.
 *
 * @param {{ section?: string, path: string, title: string }} page
 * @param {{ element?: { name: string }, term?: { term: string } }} [context]
 * @returns {{ name: string, path: string }[]}
 */
export function trailFor(page, context = {}) {
  const trail = [{ name: SITE_NAME, path: "/" }];
  const landing = page.section === undefined ? undefined : sectionLanding[page.section];

  if (landing !== undefined && landing.path !== page.path) {
    trail.push({ name: landing.label, path: landing.path });
  }

  if (page.path !== "/") {
    trail.push({ name: labelFor(page, context), path: page.path });
  }

  return trail;
}

/**
 * The `application/ld+json` graph for one page.
 *
 * The home page additionally describes the site; an element page additionally describes the element;
 * every page that has a trail gets the breadcrumb it can actually be shown.
 *
 * **The records, not the slugs.** A route carries `element: "iron"` and `term: "ion"`, which are
 * slugs. Passing those in place of the records produced a `ChemicalSubstance` with no name, no symbol
 * and no description — every one of them `undefined`, so `JSON.stringify` dropped them and the build
 * reported a node with three fields and a null meaning.
 *
 * @param {{ section?: string, path: string, title: string, description: string }} page
 * @param {{ element?: object, term?: object }} [context]
 * @returns {object}
 */
export function structuredDataFor(page, context = {}) {
  const image = `${SITE_ORIGIN}${SOCIAL_CARD}`;
  const nodes = [webPage({ path: `${SITE_ORIGIN}${page.path}`, title: page.title, description: page.description, image })];

  if (page.path === "/") {
    nodes.push(webSite());
  }

  if (context.element !== undefined) {
    nodes.push(chemicalSubstance({ element: context.element, path: `${SITE_ORIGIN}${page.path}` }));
  }

  nodes.push(breadcrumbs(trailFor(page, context)));

  return graph(nodes);
}

export function shellFor(page, currentPath, published = routes) {
  return {
    header: siteHeader({ navigation: primaryNavigation(published), currentPath, isCurrent }),
    submenu: submenuBand({ submenu: submenuForSection(page.section), currentPath, isCurrent }),
    footer: siteFooter({ columns: footerColumns }),
  };
}

/**
 * Read a route's authored template from `source/`.
 *
 * @param {{ template: string }} page
 * @returns {Promise<string>}
 */
async function readTemplate(page) {
  return readFile(path.join(sourceDir, templatePathFor(page)), "utf8");
}

/**
 * @param {{ template: string }} page
 * @returns {boolean} whether the page's authored template exists yet
 */
export function isReady(page) {
  return existsSync(path.join(sourceDir, templatePathFor(page)));
}

/**
 * Everything a page module may ask for, loaded once per build.
 *
 * Built here rather than inside each page module for one reason: a page module is loaded by the
 * browser as well as by the build, so it cannot read a data file or a stylesheet. The colour mode the
 * home page paints with is assembled here, from the token layer and the repositories, which is the
 * one place that can do it.
 *
 * Exported so a test can assert the colour modes this build actually hands the pages, rather than a
 * copy of them rebuilt in the test. A test that re-derives the thing it is testing passes when the
 * build is wrong and the copy is right.
 *
 * @param {object[]} all
 * @returns {Promise<object>}
 */
export async function pageContext(all) {
  const [{ elements, categories, units, groups, glossary }, tokens] = await Promise.all([
    loadRepositories(),
    loadTokens(),
  ]);

  /**
   * The home page's colour mode: one colour per element category, with the member count on the chip.
   * Its fill comes from the token the category names and its foreground is derived from that fill, so
   * the page never holds a colour of its own.
   */
  const groupMode = createColourMode({
    mode: "group",
    labels: Object.fromEntries(categories.all().map((category) => [category.slug, category.name])),
    paint: (key) => tokens.pair(categories.bySlug(key).token.slice(2)),
  });

  /**
   * The two other categorical modes, one per view that needs one.
   *
   * Both take their fill from a token and derive the foreground the way every other colour on the
   * site does, so no view holds a hex value of its own. The block colours are the four the layout
   * module already uses for blocks; the state colours are the three states plus the neutral the
   * properties view uses for a value nobody has measured.
   */
  const blockMode = createColourMode({
    mode: "block",
    paint: (key) => tokens.pair(`g-${key}-block`),
  });

  const stateMode = createColourMode({
    mode: "state",
    paint: (key) => tokens.pair(key === "unknown" ? "state-unknown" : `state-${key}`),
  });

  /**
   * Electronegativity, shaded along the ramp over the domain the data actually spans.
   *
   * Equal-width bins rather than hand-picked breaks, which is what `lib/colour-scale.js` exists for:
   * a break chosen against one version of the data is quietly wrong after the next rebuild. Twenty-
   * three elements have no value and take the neutral fill, which is a different colour from every
   * ramp step — so "we have no measurement" never looks like "barely electronegative".
   */
  const scale = numericScale({
    domain: domainOf(all, "electronegativity"),
    ramp: [1, 2, 3, 4, 5, 6].map((step) => tokens.value(`ramp-${step}`)),
    unknown: tokens.value("state-unknown"),
  });

  const electronegativityMode = createColourMode({
    mode: "value",
    field: "electronegativity",
    scale,
    paint: (key) => (key === "unknown" ? scale.colour(null) : scale.colour(scale.bins()[Number(key)].from)),
  });

  /**
   * The evolution view, coloured by the band a discovery year falls in.
   *
   * A categorical mode keyed on something derived rather than on a field, so it is given `bandFor`.
   * The undated band is painted with the same neutral as an unmeasured value, because that is what it
   * is: not a decade we cannot guess, but a set of elements in use long before anyone wrote one down.
   */
  // The dated bands take the ramp, oldest palest, and the step is their position among *themselves*.
  // Using each band's position in the whole list would work today only because the undated band
  // happens to be first, and would quietly ask for `--ramp-0` the moment anyone reordered them.
  const datedBands = DISCOVERY_BANDS.filter((band) => band.from !== null);

  const bandMode = createColourMode({
    mode: "group",
    keyOf: bandFor,
    labels: DISCOVERY_BANDS.map(({ key, label }) => [key, label]),
    paint: (key) => {
      const step = datedBands.findIndex((band) => band.key === key);

      return tokens.pair(step < 0 ? "state-unknown" : `ramp-${step + 1}`);
    },
  });

  // One entry per page family, each holding everything that family needs and nothing else, so
  // reading this function tells you exactly what each page is given rather than what it might ask
  // for.
  // Both pages paint in the element's category colour, from the token the category names. Neither
  // page holds a colour of its own, which is what keeps five page families from drifting apart.
  return {
    home: { elements: all, mode: groupMode },
    // `terms` so the element entries can link to the definitions of the words they use.
    "element-detail": { elements: all, categories, units, terms: glossary.all(), mode: groupMode },
    "elements-index": { elements: all, categories, units, mode: groupMode },
    group: { elements: all, categories, units, groups, mode: groupMode },
    "glossary-index": { terms: glossary.all() },
    // The downloads page lists the pages that print well, derived from the manifest — which is what
    // makes the plan's criterion ("every download target resolves in the built output") a property of
    // the data rather than something a test has to police.
    downloads: {
      routes: allRoutes(all, categories.all(), glossary.all()),
      indexPath: "/elements/",
      indexCount: all.length,
      categories,
    },
    // The provenance table is counted from the records, so the about page's data sources cannot drift
    // from the data they describe.
    about: { elements: all, emailHref: CONTACT_EMAIL },
    "element-groups-index": { categories, elements },
    // `bySlug` rather than a resolved record, because the build hands the module the *slug* its route
    // is about — the same key the 118 element routes carry — and the record is looked up from the data
    // layer beside it. A route holding a copy of the term would have two copies to drift apart.
    "glossary-term": { terms: glossary.all(), bySlug: glossary.bySlug, elements: all },
    "properties-and-states": { elements: all, mode: stateMode },
    orbitals: { elements: all, mode: blockMode },
    electronegativity: { elements: all, mode: { ...electronegativityMode, scale } },
    evolution: { elements: all, mode: bandMode },
    "melting-point": { elements: all, units, mode: groupMode },
    "boiling-point": { elements: all, units, mode: groupMode },
    "orbital-configuration": { elements: all, units, mode: groupMode },
  };
}

/**
 * A page's body: its authored template, filled in by its page module when it has one.
 *
 * @param {{ template: string, element?: string }} page
 * @param {object[]} all the element records, for the families derived from them
 * @returns {Promise<string>}
 */
async function renderBody(page, all) {
  const template = await readTemplate(page);
  const render = PAGE_MODULES[page.template];

  if (!render) {
    return template;
  }

  const context = await pageContext(all);

  // A generated route carries the slug its template is about; a hand-written one carries nothing.
  // Either way the module is also handed the page's own name, because a family can be one template
  // behind several paths — the three property rankings and the four alternate table views each share
  // a module and differ only in which columns or which colour they use, and that difference is the
  // name. It arrives under two words because the two families each name it for what it means to them:
  // a ranking is about a property, a table view is a view.
  return render({
    template,
    ...context[page.template],
    element: page.element,
    property: page.template,
    view: page.template,
    // The group slug, which is the route's rather than the template's: eleven paths share one template
    // and each is about a different group.
    group: page.group,
    // The term slug, which is the route's rather than the template's: four hundred and eighteen paths
    // share one template and each is about a different term. The record itself is looked up by slug, so
    // the route carries the key and not a copy of the term.
    term: page.term,
  });
}

/**
 * Copy the browser-facing directories into the build.
 *
 * @returns {Promise<string[]>} the names of the directories that were copied
 */
async function copyStaticDirectories() {
  const copied = [];

  for (const name of STATIC_DIRECTORIES) {
    const from = path.join(sourceDir, name);

    if (!existsSync(from)) {
      continue;
    }

    await cp(from, path.join(distDir, name), { recursive: true });
    copied.push(name);
  }

  return copied;
}

/**
 * Rebuild the whole site into `dist/`.
 *
 * The directory is emptied first, so the output never accumulates a page whose route has been
 * removed. That deletion is the one destructive thing in the project, so it is guarded: the build
 * refuses to run if its output directory has drifted onto the source tree or the repository root.
 *
 * @returns {Promise<{ routes: string[], skipped: string[], copied: string[], distDir: string, declared: number }>}
 */
export async function build() {
  if (distDir === projectRoot || distDir === sourceDir) {
    throw new Error(`Refusing to build into ${distDir}: that is not a build directory.`);
  }

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const copied = await copyStaticDirectories();
  const built = [];
  const skipped = [];

  // One read of the data layer, used twice: the routes derived from it, and the pages rendered from
  // it. A build that read the elements twice would be two chances to render two different tables.
  const { elements, categories, glossary } = await loadRepositories();
  const all = elements.all();
  const published = allRoutes(all, categories.all(), glossary.all());

  // A route names its element or its term by slug; the structured data needs the record. Looked up once
  // here rather than by scanning the data per page, which is 584 scans of 118 records.
  const byElementSlug = new Map(all.map((element) => [element.slug, element]));
  const byTermSlug = new Map(glossary.all().map((term) => [term.slug, term]));

  for (const route of published) {
    if (!isReady(route)) {
      skipped.push(route.path);
      continue;
    }

    const body = await renderBody(route, all);
    const file = outputFileForPath(route.path);
    const document = renderDocument({
      ...route,
      path: route.path,
      body,
      jsonLd: structuredDataFor(route, { element: byElementSlug.get(route.element), term: byTermSlug.get(route.term) }),
      stylesheets: stylesheetsFor(route),
      scripts: scriptsFor(route),
      ...shellFor(route, route.path, published),
    });

    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, document, "utf8");
    built.push(route.path);
  }

  const notFound = renderDocument({
    ...NOT_FOUND_PAGE,
    body: await readTemplate(NOT_FOUND_PAGE),
    stylesheets: stylesheetsFor(NOT_FOUND_PAGE),
    scripts: scriptsFor(NOT_FOUND_PAGE),
    ...shellFor(NOT_FOUND_PAGE, NOT_FOUND_PAGE.currentPath),
  });

  await writeFile(path.join(distDir, NOT_FOUND_FILE), notFound, "utf8");

  // Written after the loop, from the routes that actually built rather than from the ones declared —
  // a sitemap listing a page that failed to render is a promise the site cannot keep.
  const listed = [...built].sort();
  await writeFile(path.join(distDir, "sitemap.xml"), sitemapFor(listed), "utf8");
  await writeFile(path.join(distDir, "robots.txt"), robotsFor(), "utf8");

  return { routes: built, skipped, copied, distDir, declared: published.length, listed: listed.length };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { routes: built, skipped, copied, distDir: output, declared } = await build();
  const where = path.relative(process.cwd(), output) || ".";

  console.log(
    `Built ${built.length} ${built.length === 1 ? "route" : "routes"} and the not-found page into ${where}/`,
  );

  if (skipped.length > 0) {
    console.log(`${skipped.length} of ${declared} declared routes are waiting on their templates:`);
    console.log(`  ${[...new Set(skipped)].slice(0, 6).join(", ")}${skipped.length > 6 ? ", ..." : ""}`);
  }

  for (const name of copied) {
    console.log(`Copied ${name}/ into ${where}/${name}/`);
  }
}
