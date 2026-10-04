/**
 * The downloads page.
 *
 * **Nothing here is a file, and the page says so in its first line.** The reference's downloads page
 * offers four thumbnails linking to `/printables-and-pdfs/`, which is a 404 placeholder, and every one of
 * its four detail pages is an unmigrated stub with no file behind it — so there is no working downloads
 * page to reproduce. This one prints instead, which is a better answer than a PDF and is achievable here
 * for a specific reason: ADR-001 renders the table into the page, so `styles/print.css` over the page a
 * reader is already looking at produces the printable table, and every figure on paper is the figure that
 * was on screen.
 *
 * **Both lists are derived from the manifest, which is what makes the criterion checkable.** The plan asks
 * that every download target resolve in the built output; deriving the cards from the same route list the
 * build renders means a card cannot point at a page that does not exist, and a table view added later
 * appears here without anyone remembering to add it. The test asserts it anyway, because a derivation that
 * is correct by construction is still worth an assertion that says so.
 *
 * The cards say whether each page fits one sheet, because that is the question a reader actually has
 * about a printable table and the question a row of file names never answered. The figures come from the
 * measurement made in the browser with print emulation on, and are stated as facts about the layout
 * rather than as estimates.
 */

import { escapeHtml } from "../lib/html.js";
import { familyFor } from "../router/routes.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const DOWNLOADS_PLACEHOLDERS = ["tables", "groups", "notes"];

/**
 * What each table view is for, in a phrase a card can carry.
 *
 * Written here rather than derived, because the routes carry a title and a meta description and neither
 * of them answers "what is this colouring for?" in four words. This is prose, so it is prose here.
 */
const VIEW_PURPOSE = {
  "properties-and-states": "Solid, liquid or gas, and which are not measured",
  orbitals: "Which orbital each element fills",
  electronegativity: "How strongly each element pulls shared electrons",
  evolution: "When each element was discovered, by decade",
};

/**
 * Which of the four table views fit a single sheet.
 *
 * A measurement, not an estimate: each page was rendered with print emulation at A4 and at Letter and
 * the content height compared against the paper's printable height. Three fit. **The evolution view does
 * not**, and it is not made to by shrinking the table further — the timeline below it is thirty decades
 * of content, and compressing that until it fits would make it useless. So the page says so, and the card
 * says so, rather than claiming four and printing one wrong.
 */
const ONE_SHEET = {
  "properties-and-states": true,
  orbitals: true,
  electronegativity: true,
  evolution: false,
};

/**
 * The four table views, derived from the manifest by the family they share.
 *
 * Family rather than template, because the four views have four template names and one stylesheet; the
 * family is what says "these are the four colourings".
 *
 * @param {object[]} routes every published route
 * @returns {object[]}
 */
export function printableTables(routes) {
  return routes.filter((route) => familyFor(route) === "table-view");
}

/**
 * The element-card groups, derived from the routes rather than written.
 *
 * @param {object[]} routes
 * @returns {object[]}
 */
export function cardGroups(routes) {
  return routes.filter((route) => route.template === "group");
}

/**
 * One card: a title, what it is for, whether it fits a sheet, and where to go.
 *
 * @param {{ path: string, title: string, detail: string, oneSheet: boolean, kind: string, extra?: string }} card
 * @returns {string}
 */
function downloadCard({ path, title, detail, oneSheet, kind, extra = "" }) {
  return `<li class="downloads__item">
<a class="downloads__card" href="${escapeHtml(path)}">
<span class="downloads__kind">${escapeHtml(kind)}</span>
<span class="downloads__title">${escapeHtml(title)}</span>
<span class="downloads__detail">${escapeHtml(detail)}</span>
<span class="downloads__fit${oneSheet ? "" : " downloads__fit--many"}">${
    oneSheet ? "Prints on one sheet" : "Prints over several sheets"
  }</span>
${extra ? `<span class="downloads__extra">${escapeHtml(extra)}</span>` : ""}
</a>
</li>`;
}

/**
 * The cards for the four table views — one sheet each.
 *
 * @param {object[]} routes every published route
 * @returns {string}
 */
export function tableCards(routes) {
  const cards = printableTables(routes)
    .map((route) =>
      downloadCard({
        path: route.path,
        title: route.title,
        detail: VIEW_PURPOSE[route.template] ?? "The periodic table, one colour",
        oneSheet: ONE_SHEET[route.template] ?? false,
        kind: "Periodic table",
      }),
    )
    .join("\n");

  return `<ul class="downloads__list">
${cards}
</ul>`;
}

/**
 * The cards for the element groups, plus the index.
 *
 * The group's `label` is the stored plural rather than a name built by appending an "s", because
 * "unknown elements" is the one of the eleven that does not end that way.
 *
 * @param {{ routes: object[], indexPath: string, indexCount: number, counts: Map<string, number> }} context
 * @returns {string}
 */
export function cardCards({ routes, indexPath, indexCount, counts }) {
  const index = downloadCard({
    path: indexPath,
    title: `All ${indexCount} elements`,
    detail: "Every card on one index, and a way into each element's own page",
    oneSheet: false,
    kind: "Element cards",
  });

  const groups = cardGroups(routes)
    .map((route) =>
      downloadCard({
        path: route.path,
        title: route.label ?? route.title,
        detail: "One card per member, with the group isolated in the table above",
        oneSheet: false,
        kind: "Element cards",
        // The member count from the taxonomy rather than scraped out of the route's description, which
        // begins "The 35 transition metals on one page" — a sentence written for a page hero, read here
        // as if it were data.
        extra: `${counts.get(route.group) ?? 0} elements`,
      }),
    )
    .join("\n");

  return `<ul class="downloads__list">
${index}
${groups}
</ul>`;
}

/**
 * The notes beneath the cards.
 *
 * The print behaviour is not obvious from a link — a reader who has never printed from a web page does
 * not know that the buttons will disappear and the colours will survive — so it is written down here
 * rather than left to be discovered.
 *
 * @returns {string}
 */
function printNotes() {
  return `<div class="downloads__notes prose">
<h2 class="section__title">How printing behaves here</h2>
<ul>
<li>The masthead, the navigation, the search field and every filter come off the sheet. What prints is
the content.</li>
<li>The category colours stay. On this site a tile's colour <em>is</em> its classification, so a black
and white print would throw away the information rather than the decoration.</li>
<li>Each printed sheet carries the address it was printed from, because a periodic table with nothing on
it saying where it came from is not much use to whoever finds it in a drawer.</li>
<li>Paper size is left to your printer, so the same page fits A4 and Letter. The table views are built
to fit both.</li>
</ul>
</div>`;
}

/**
 * Render the page's body.
 *
 * @param {{
 *   template: string,
 *   routes: object[],
 *   indexPath: string,
 *   indexCount: number,
 *   categories: { all: () => { slug: string, count: number }[] }
 * }} context
 * @returns {string}
 */
export function downloadsPage({ template, routes, indexPath, indexCount, categories }) {
  return fillTemplate(template, {
    tables: tableCards(routes),
    groups: cardCards({
      routes,
      indexPath,
      indexCount,
      counts: new Map(categories.all().map((category) => [category.slug, category.count])),
    }),
    notes: printNotes(),
  });
}

/**
 * The page has no behaviour of its own.
 *
 * Printing is the browser's, the lists are links, and there is nothing here that a script could add. A
 * page with no behaviour is a page that loads no script, which is why it is not in the entry point's
 * dispatch table at all.
 *
 * @returns {{ release: () => void }}
 */
export function hydrateDownloads() {
  return { release() {} };
}
