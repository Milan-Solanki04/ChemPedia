/**
 * The shell's information architecture.
 *
 * The manifest says which URLs exist; this module says how they are arranged into the primary
 * navigation, the contextual submenu under the masthead, and the footer's five columns. The
 * split is deliberate: a URL is a fact about the site, an arrangement is a design decision, and
 * keeping them apart means the shell can be rearranged without touching a single route.
 *
 * Everything here is pure data and pure functions. A test asserts that every path this module
 * mentions is a declared route, so the shell cannot link to a page the site does not publish.
 *
 * Comparing two paths is not this module's business: it asks `lib/path-match.js`, which is the one
 * place the rule lives. The shell used to carry its own copy of "a trailing slash and a fragment
 * are not part of a page's identity", and a second copy is how the build and the browser come to
 * disagree about which URLs exist.
 *
 * The submenus are the reference design's contextual band. A section either has one or it does
 * not, which is why the band appears on the table and elements pages and disappears on a leaf
 * page such as the contact page.
 */

import { samePath } from "../lib/path-match.js";

/** The sections a page can belong to, each with the submenu it carries. */
export const submenus = {
  "periodic-table": {
    label: "Explore Periodic Tables:",
    items: [
      { label: "States", path: "/periodic-table/properties-and-states/" },
      { label: "Orbitals", path: "/periodic-table/orbitals/" },
      { label: "Electronegativity", path: "/periodic-table/electronegativity/" },
      { label: "Evolution", path: "/periodic-table/evolution/" },
    ],
  },
  elements: {
    label: null,
    items: [
      { label: "Attributes", path: "/elements/" },
      { label: "Melting points", path: "/properties/melting-point/" },
      { label: "Boiling points", path: "/properties/boiling-point/" },
      { label: "Orbital configuration", path: "/properties/orbital-configuration/" },
      { label: "Downloads", path: "/downloads/" },
    ],
  },
  "table-views": {
    label: null,
    items: [
      { label: "Groups", path: "/element-groups/" },
      { label: "Properties and states", path: "/periodic-table/properties-and-states/" },
      { label: "Orbitals", path: "/periodic-table/orbitals/" },
      { label: "Electronegativity", path: "/periodic-table/electronegativity/" },
      { label: "Evolution", path: "/periodic-table/evolution/" },
    ],
  },
};

/**
 * The footer, column by column.
 *
 * Five columns, re-cut for a site without the reference's learning and games sections. Two
 * columns of the original had no subject matter left once those sections were removed, so these
 * hold fewer entries than the others rather than being padded with links to pages that would not
 * earn their place. Order within a column is the order a reader would want them.
 */
export const footerColumns = [
  {
    id: "periodic-table",
    heading: "Periodic table",
    entries: [
      { label: "Groups", path: "/element-groups/" },
      { label: "Properties and states", path: "/periodic-table/properties-and-states/" },
      { label: "Orbitals and configurations", path: "/periodic-table/orbitals/" },
      { label: "Electronegativity", path: "/periodic-table/electronegativity/" },
      { label: "History and evolution", path: "/periodic-table/evolution/" },
    ],
  },
  {
    id: "elements",
    heading: "Elements",
    entries: [
      { label: "All elements", path: "/elements/" },
      { label: "Melting points", path: "/properties/melting-point/" },
      { label: "Boiling points", path: "/properties/boiling-point/" },
      { label: "Orbital configuration", path: "/properties/orbital-configuration/" },
    ],
  },
  {
    id: "reference",
    heading: "Reference",
    entries: [
      { label: "Glossary of terms", path: "/glossary/" },
      { label: "Element groups", path: "/element-groups/" },
      { label: "Downloads", path: "/downloads/" },
    ],
  },
  {
    id: "tools",
    heading: "Tools",
    entries: [
      { label: "Temperature calculator", path: "/calculators/temperature/" },
      { label: "Downloads", path: "/downloads/" },
    ],
  },
  {
    id: "about",
    heading: "About",
    entries: [
      { label: "About ChemiPedia", path: "/about/" },
      { label: "Data sources", path: "/about/#data-sources" },
      { label: "Contact", path: "/contact/" },
    ],
  },
];

/**
 * The primary navigation, in the order the manifest asks for.
 *
 * A route joins the navigation by declaring a label and an order; nothing else decides membership,
 * so adding a page to the navigation is one line in the manifest and cannot drift from the URLs.
 *
 * @param {{ path: string, nav?: { label: string, order: number } }[]} routes
 * @returns {{ label: string, path: string }[]}
 */
export function primaryNavigation(routes) {
  return routes
    .filter((route) => route.nav !== undefined)
    .sort((one, other) => one.nav.order - other.nav.order)
    .map((route) => ({ label: route.nav.label, path: route.path }));
}

/**
 * The submenu for a section, or null when the section has none.
 *
 * @param {string | undefined} section
 * @returns {{ label: string | null, items: { label: string, path: string }[] } | null}
 */
export function submenuForSection(section) {
  return (section && submenus[section]) || null;
}

/**
 * Every path the shell links to, so the test can prove each one is a declared route.
 *
 * @param {{ nav?: unknown }[]} routes
 * @returns {string[]}
 */
export function shellPaths(routes) {
  const fromNavigation = primaryNavigation(routes).map((item) => item.path);
  const fromSubmenus = Object.values(submenus).flatMap((submenu) =>
    submenu.items.map((item) => item.path),
  );
  const fromFooter = footerColumns.flatMap((column) => column.entries.map((entry) => entry.path));

  return [...new Set([...fromNavigation, ...fromSubmenus, ...fromFooter])];
}

/**
 * Whether a link points at the page being rendered.
 *
 * `/elements/` and `/elements` are the same page, and `/about/#data-sources` is still the about
 * page. How that is decided belongs to `lib/path-match.js`; this is the shell's use of it.
 *
 * @param {string} path
 * @param {string} currentPath
 * @returns {boolean}
 */
export function isCurrent(path, currentPath) {
  return samePath(path, currentPath);
}

/**
 * The section a submenu item belongs to, used to mark the current item inside the band.
 *
 * @param {{ label: string, path: string }[]} items
 * @param {string} currentPath
 * @returns {string | null} the path of the current item, or null when none is current
 */
export function currentItemPath(items, currentPath) {
  const match = items.find((item) => isCurrent(item.path, currentPath));

  return match ? match.path : null;
}

/**
 * The page that stands for each section, for the breadcrumb structured data.
 *
 * Declared here rather than in the build because it is navigation: the same question the submenu band
 * answers for a reader — "where does this section begin?" — asked for a crawler. Kept beside
 * `submenus` so that adding a section means adding it in one place.
 *
 * A section absent from this map has no landing page and simply contributes no step, which is why
 * `trailFor` does not assume every route has one.
 */
export const sectionLanding = {
  about: { label: "About", path: "/about/" },
  elements: { label: "Elements", path: "/elements/" },
  "periodic-table": { label: "Periodic table", path: "/periodic-table/properties-and-states/" },
  reference: { label: "Glossary", path: "/glossary/" },
  "table-views": { label: "Groups", path: "/element-groups/" },
  tools: { label: "Tools", path: "/calculators/temperature/" },
};
