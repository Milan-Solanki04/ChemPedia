/**
 * The element-groups index.
 *
 * A list of the eleven categories, each with its member count and a link to its own page.
 *
 * **Every count is counted.** The figure on each card is `elements.withCategory(slug).length` — the same
 * number the group page prints in its first fact, and the same number `categories.json` asserts as its
 * member count. Three places, one source. A count typed into a template would be a fourth place to be
 * wrong, and it is the number a reader is most likely to check.
 *
 * The reference has no such page — its group section is a menu beside the group pages rather than a page
 * of its own — so there is no structure here to reproduce. What is reused instead is the element card
 * the index already draws, which means a group on this page looks like an element on the other one and
 * the two pages share a component rather than each inventing a card.
 */

import { escapeHtml } from "../lib/html.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const ELEMENT_GROUPS_INDEX_PLACEHOLDERS = ["cards"];

/**
 * The eleven group cards.
 *
 * A `ul`, because eleven repeated things are a list and a screen reader can then say how long it is.
 *
 * @param {{
 *   categories: { all: () => object[] },
 *   elements: { withCategory: (slug: string) => object[] },
 * }} context
 * @returns {string}
 */
export function groupCards({ categories, elements }) {
  const items = categories
    .all()
    .map((category) => {
      const count = elements.withCategory(category.slug).length;
      const path = `/element-groups/${category.slug}/`;

      return `<li class="group-index__item">
<a class="group-index__card" href="${escapeHtml(path)}">
<span class="group-index__swatch" style="--fill:var(${escapeHtml(category.token)})"></span>
<span class="group-index__name">${escapeHtml(category.plural)}</span>
<span class="group-index__count">${count}</span>
</a>
</li>`;
    })
    .join("\n");

  // Not `.cards`: that class belongs to the elements index's own page stylesheet, so borrowing the name
  // brought none of its rules and left this list with default bullets and no grid at all. A page style
  // reused by another page is a page style that has quietly become a component's.
  return `<ul class="group-index" id="group-index-list" data-count="${categories.all().length}">
${items}
</ul>`;
}

/**
 * Render the page's body.
 *
 * @param {{ template: string, categories: object, elements: object }} context
 * @returns {string}
 */
export function elementGroupsIndex({ template, categories, elements }) {
  return fillTemplate(template, {
    cards: groupCards({ categories, elements }),
  });
}
