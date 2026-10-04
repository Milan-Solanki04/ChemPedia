/**
 * One element, as a card on the elements index.
 *
 * The card is the tile and three lines of text: the name, the group it belongs to, and the two
 * figures a reader scanning a hundred and eighteen of them is actually looking for — its atomic
 * weight and its state at room temperature. The reference carries the same information in the same
 * order, and its markup is worth reading: the tile sits inside the link rather than beside it, so
 * the whole of the square is part of the hit area.
 *
 * Three decisions are worth stating.
 *
 * **The tile gives up being a link.** A tile with an `href` of its own inside a link is an anchor
 * inside an anchor, which is invalid markup that browsers and screen readers disagree about. So the
 * card is the anchor and the tile is given no `href`, which renders it as a `<span>` with the same
 * appearance — the same arrangement the group row on an element page uses.
 *
 * **The card does not override its own accessible name.** The anchor's content is already its name:
 * number, symbol, name, group, weight, state, all of it visible on the card. An `aria-label` would
 * *replace* that text rather than add to it, and a reader would lose the figures to gain a tidier
 * sentence. The tile already carries a `title` for a pointer user.
 *
 * **The weight is formatted, not printed raw.** It goes through the same unit definition the
 * properties sidebar uses, so a card cannot say `55.840` where the sidebar beside it says `55.84`.
 * The unit is dropped — "55.84" on a card, because "55.84 u" is a unit of atomic mass stated to a
 * reader who is browsing rather than calculating, and the sidebar is where the unit belongs.
 *
 * Pure: markup in, markup out, no DOM and no data files.
 */

import { attributes, escapeHtml } from "../lib/html.js";
import { formatNumber } from "../lib/format.js";
import { elementTile } from "./element-tile.js";

/**
 * The two figures on the card's last line.
 *
 * A weight the record does not carry, or a state it does not know, is left out of the line rather
 * than printed as a placeholder. Every element here has both — a state at 293 K is measured for all
 * 118 — so this is a guard on the formatter rather than a case that occurs today.
 *
 * @param {object} element
 * @param {{ definitionFor: (field: string) => object }} units
 * @returns {string} the line's text, or an empty string
 */
function figures(element, units) {
  const parts = [];

  if (element.atomicWeight !== null && element.atomicWeight !== undefined) {
    parts.push(formatNumber(element.atomicWeight, units.definitionFor("atomicWeight")));
  }

  if (element.state) {
    // A state is a category, not a figure, so it is capitalised the way a sentence capitalises it
    // rather than set in the tabular numerals the numeric lines beside it use.
    parts.push(element.state.charAt(0).toUpperCase() + element.state.slice(1));
  }

  return parts.join(" · ");
}

/**
 * @param {{
 *   element: object,
 *   paint: { fill: string, onFill: string },
 *   href: string,
 *   groupName?: string | null,
 *   units: { definitionFor: (field: string) => object }
 * }} options
 * @returns {string}
 */
export function elementCard({ element, paint, href, groupName = null, units }) {
  const line = figures(element, units);

  return `<a${attributes({
    class: "card",
    href,
    style: `--fill:${paint.fill};--on-fill:${paint.onFill}`,
  })}>` +
    `${elementTile({ element, paint, variant: "compact" })}` +
    `<span class="card__meta">` +
    `<span class="card__name">${escapeHtml(element.name)}</span>` +
    (groupName ? `<span class="card__group">${escapeHtml(groupName)}</span>` : "") +
    (line ? `<span class="card__figures">${escapeHtml(line)}</span>` : "") +
    `</span></a>`;
}