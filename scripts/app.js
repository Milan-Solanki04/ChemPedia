/**
 * The entry point.
 *
 * One script, loaded by every page that has behaviour, whose whole job is to work out what page the
 * reader is on and hand the document to the module that owns it.
 *
 * **It reads the data layer once.** The router needs every URL the site publishes, and both the 118
 * element pages and the eleven group pages are derived from the data rather than listed by hand, so
 * the route list, the home page's search and the mini table on an element page all come from one read.
 * Two pages that each fetched it would be two copies of 200KB and two chances to disagree about which
 * element is which. The categories come from the same read because the group routes are derived from
 * them — a second, smaller read of a two-kilobyte file, for the eleven paths that would otherwise be
 * eleven lines of manifest to mistype.
 *
 * **A failure here is not reported.** If the data cannot be read the router still starts with the
 * hand-written routes, and a page whose module needs the records gets none: the table on the home page
 * is already in the HTML and keeps working, and the search form still submits. There is nothing a
 * reader can do about a failed fetch, and a console message about one is noise they did not ask for.
 *
 * **The element family is one entry, not 118.** A page's behaviour is found by the path that carries
 * it, and the 118 element paths differ only in which record they are about — which the page already
 * knows and has already rendered. One pattern says so, rather than a map with a hundred and eighteen
 * keys that could disagree with the manifest.
 */

import { createCategoriesRepository } from "./data/categories-repository.js";
import { createElementsRepository } from "./data/elements-repository.js";
import { createGlossaryRepository } from "./data/glossary-repository.js";
import { allRoutes } from "./router/routes.js";
import { createRouter } from "./router/router.js";
import { hydrateElementDetail } from "./pages/element-detail.js";
import { hydrateElementsIndex } from "./pages/elements-index.js";
import { hydrateRanking } from "./pages/ranking.js";
import { hydrateGroup } from "./pages/group.js";
import { hydrateGlossaryIndex } from "./pages/glossary-index.js";
import { hydrateGlossaryTerm } from "./pages/glossary-term.js";
import { hydrateTemperatureCalculator } from "./pages/temperature-calculator.js";
import { hydrateTableView } from "./pages/table-view.js";
import { hydrateHome } from "./pages/home.js";
import { canonicalPath } from "./lib/path-match.js";

/**
 * Pages whose behaviour is decided by their exact path.
 *
 * @type {Map<string, (context: { root: ParentNode, elements: object[] }) => { release: () => void }>}
 */
const PAGE_BEHAVIOUR = new Map([
  ["/", hydrateHome],
  ["/elements/", hydrateElementsIndex],
  ["/glossary/", hydrateGlossaryIndex],
  ["/calculators/temperature/", hydrateTemperatureCalculator],
]);

/**
 * The element family: one path per element, one module for all of them.
 *
 * @type {{ test: (pathname: string) => boolean, hydrate: typeof hydrateElementDetail }[]}
 */
const PATH_FAMILIES = [
  // The eleven group pages are one family behind eleven paths, and the group slug is read from the
  // path rather than passed down, because the entry point only has a path to work from.
  {
    test: (pathname) => /^\/element-groups\/[a-z-]+\/$/.test(pathname),
    hydrate: (context) => hydrateGroup({ ...context, group: groupSlugFrom(context.path ?? context.root.location.pathname) }),
  },
  // The glossary terms are one family behind four hundred and eighteen paths, and read their slug from
  // the path for the same reason the group pages do. Their hydrate does no work — a term page is
  // definition, prose and links, all of which are in the HTML — but the family is declared so the router
  // has somewhere to send the page and the entry point is not the place that decides it does not need one.
  {
    test: (pathname) => /^\/glossary\/[^/]+\/$/.test(pathname),
    hydrate: () => hydrateGlossaryTerm(),
  },
  { test: (pathname) => /^\/elements\/[^/]+\/$/.test(pathname), hydrate: hydrateElementDetail },
  // The three property pages are one family behind three paths, so they share one module.
  { test: (pathname) => /^\/properties\/[a-z-]+\/$/.test(pathname), hydrate: hydrateRanking },
  // And the four alternate table views are one family behind four more.
  { test: (pathname) => /^\/periodic-table\/[a-z-]+\/$/.test(pathname), hydrate: hydrateTableView },
];

/**
 * The group slug a path names, or null when it names none.
 *
 * @param {string} pathname
 * @returns {string | null}
 */
function groupSlugFrom(pathname) {
  return /^\/element-groups\/([a-z-]+)\/$/.exec(pathname)?.[1] ?? null;
}

/** What happens when the data cannot be read: the hand-written routes and no records. */
const NO_ELEMENTS = [];

/** And no categories, which is the same condition — the two are read together or not at all. */
const NO_CATEGORIES = [];

/**
 * And no terms. The glossary is the third derived family, so with no terms the router knows of the index
 * and none of the term pages — and the index, which is the one page here whose whole content is the
 * data, keeps the rows it was built with rather than emptying itself.
 */
const NO_TERMS = [];

async function start() {
  let elements = NO_ELEMENTS;
  let categories = NO_CATEGORIES;
  let terms = NO_TERMS;

  try {
    const [elementsRepository, categoriesRepository, glossaryRepository] = await Promise.all([
      createElementsRepository(),
      createCategoriesRepository(),
      createGlossaryRepository(),
    ]);

    elements = elementsRepository.all();
    categories = categoriesRepository.all();
    terms = glossaryRepository.all();
  } catch {
    elements = NO_ELEMENTS;
    categories = NO_CATEGORIES;
    terms = NO_TERMS;
  }

  /**
   * Wire whatever page is now on screen.
   *
   * @param {string} pathname
   */
  function hydrate(pathname) {
    const path = canonicalPath(pathname);

    if (path === null) {
      return;
    }

    const behaviour =
      PAGE_BEHAVIOUR.get(path) ?? PATH_FAMILIES.find((family) => family.test(path))?.hydrate;

    // The path is handed to the module rather than left for it to read off `location`, and that is not
    // tidiness. The router adopts the new document and *then* asks for it to be wired, and pushes the
    // history entry after that — so at the moment a module runs, `location.pathname` is still the path
    // the reader is leaving. A group page that read its own slug from there would isolate the group it
    // came from rather than the one it landed on.
    behaviour?.({ root: document, elements, path });
  }

  const router = createRouter({ routes: allRoutes(elements, categories, terms), onArrive: hydrate });

  router.start();
  hydrate(window.location.pathname);
}

void start();