/**
 * The elements index.
 *
 * The second page of the pattern the home page set, in the same two halves.
 *
 * **The first half runs at build time and produces the page.** It fills two markers: the filter and
 * the hundred and eighteen cards. Everything else on the page is written copy in
 * `pages/elements-index.html`, so this module holds no prose. It takes its data as an argument rather
 * than loading it, which is what lets the same module run in the build under Node and in the browser
 * without either of them reaching for the file system.
 *
 * **The second half runs in the browser and adds behaviour to a page that already works.** With it
 * never called, the page is still a complete index: 118 cards, each a link, and a filter that submits.
 * That is the promise the whole site makes and this page keeps it.
 *
 * **Each card says how it can be found.** Every card carries `data-filter` with its element's name,
 * symbol and atomic number, because the filter narrows the grid by what the page wrote rather than by
 * a list the script rebuilt — the cards are already on the page before any script runs, so the script
 * reads them rather than regenerating them and then having to keep the two in step.
 *
 * Ordering is atomic number, ascending, and it is the repository's order rather than a sort applied
 * here: the ranking pages are where an order is chosen, and an index that reordered itself would be an
 * index whose order meant nothing.
 */

import { attributes, escapeHtml } from "../lib/html.js";
import { elementCard } from "../components/element-card.js";
import { elementFilter, filterTextFor, wireElementFilter } from "../components/element-filter.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const ELEMENTS_INDEX_PLACEHOLDERS = ["filter", "cards"];

/**
 * The grid of cards.
 *
 * A `ul` of `li` rather than a bare sequence of anchors, for the same reason the periodic table is
 * one: a hundred and eighteen repeated things are a list, and a list a screen reader can say how long
 * it is.
 *
 * @param {{
 *   elements: object[],
 *   paint: (element: object) => { fill: string, onFill: string, key: string },
 *   groupName: (element: object) => string | null,
 *   units: { definitionFor: (field: string) => object }
 * }} context
 * @returns {string}
 */
function cards({ elements, paint, groupName, units }) {
  const items = elements
    .map(
      (element) =>
        `<li class="cards__item"${attributes({
          "data-filter": filterTextFor(element),
          "data-filter-name": element.name,
          "data-filter-symbol": element.symbol,
          "data-filter-number": element.atomicNumber,
        })}>${elementCard({
          element,
          paint: paint(element),
          href: `/elements/${element.slug}/`,
          groupName: groupName(element),
          units,
        })}</li>`,
    )
    .join("\n");

  return `<ul class="cards" id="element-index-list" data-count="${elements.length}">
${items}
</ul>`;
}

/**
 * Render the index's body.
 *
 * @param {{
 *   template: string,
 *   elements: object[],
 *   categories: { nameFor: (slug: string) => string },
 *   units: { definitionFor: (field: string) => object },
 *   mode: { paint: (element: object) => { fill: string, onFill: string, key: string } }
 * }} context
 * @returns {string}
 */
export function elementsIndex({ template, elements, categories, units, mode }) {
  return fillTemplate(template, {
    filter: elementFilter({
      id: "index-filter",
      label: "Filter the element list",
      controls: "element-index-list",
    }),
    cards: cards({
      elements,
      paint: mode.paint,
      groupName: (element) => categories.nameFor(element.category),
      units,
    }),
  });
}

/**
 * Attach the index's behaviour to a page that already contains it.
 *
 * @param {{ root: ParentNode }} context
 * @returns {{ release: () => void }}
 */
export function hydrateElementsIndex({ root }) {
  const filter = wireElementFilter(root, { noun: "elements" });

  return {
    /** Detach everything, for a page that swaps its own content out. */
    release: () => filter.release(),
  };
}