/**
 * One element, as a tile.
 *
 * A tile is the smallest complete statement the site makes about an element: its atomic number, its
 * symbol, and — in the larger variant — its name. It appears in two sizes, and the difference is
 * only whether the name is there, because that is the only line that stops being legible first.
 *
 * Three decisions are worth stating.
 *
 * **The colour arrives as a pair, not as a class.** `paint` is a resolved `{ fill, onFill }`, so a
 * tile never names a group, a block or a ramp step; it takes a colour and a foreground that has
 * already been checked to be readable on it. That is what lets the same tile serve four colour
 * modes, and eleven legend chips and four block colours, without a single extra class.
 *
 * **It is a link, and it says what it is.** The accessible name spells out the name, the symbol, the
 * atomic number, the period and the group, because "La" read on its own is not a name. The `title`
 * carries the shorter form for a pointer user.
 *
 * **A tile can be given no `href`,** and then it is a `<span>` with the same appearance and none of
 * the link's semantics. That is for a tile sitting inside somebody else's link — a row of an element's
 * group members, where the name under each tile is the link and the tile is the picture of it.
 * Wrapping a link in a link is invalid HTML that browsers and screen readers disagree about, so the
 * inner one has to give up being a link rather than the outer one giving up its padding.
 *
 * **Placement is not this component's business.** A tile does not know about rows, columns or the
 * eighteen-column grid. Whoever lays tiles out — the table — puts the cell on the element around it,
 * so the same tile renders identically in a grid, in a card and in a strip. For the same reason a
 * tile takes its tab stop as an argument: the grid decides which one tile is in the tab order, and a
 * tile that decided for itself would put 118 stops back into the page.
 *
 * Pure: markup in, markup out, no DOM and no data files.
 */

import { attributes, classNames, escapeHtml } from "../lib/html.js";

/**
 * The name a screen reader reads for a tile.
 *
 * Period and group are included because a table is a picture of the periodic law, and a reader who
 * cannot see the picture loses exactly that. The group is skipped for the thirty f-block elements,
 * which genuinely have no group in this table, and the category's own name is appended when the
 * caller knows it.
 *
 * @param {{ name: string, symbol: string, atomicNumber: number, period: number, group: number | null }} element
 * @param {string | null} groupName the category's display name, when the caller knows it
 * @returns {string}
 */
function accessibleName(element, groupName) {
  const parts = [
    element.name,
    `symbol ${element.symbol}`,
    `atomic number ${element.atomicNumber}`,
    `period ${element.period}`,
  ];

  if (element.group !== null && element.group !== undefined) {
    parts.push(`group ${element.group}`);
  }

  if (groupName) {
    parts.push(groupName.toLowerCase());
  }

  return parts.join(", ");
}

/**
 * @param {{
 *   element: object,
 *   paint: { fill: string, onFill: string },
 *   href: string,
 *   groupName?: string | null,
 *   variant?: "detailed" | "compact",
 *   highlighted?: boolean,
 *   tabIndex?: 0 | -1 | null
 * }} options
 * @returns {string}
 */
export function elementTile({
  element,
  paint,
  href = null,
  groupName = null,
  variant = "detailed",
  highlighted = false,
  tabIndex = null,
}) {
  const compact = variant === "compact";
  const name = compact ? "" : `<span class="tile__name">${escapeHtml(element.name)}</span>`;
  const tag = href === null ? "span" : "a";

  return `<${tag}${attributes({
    class: classNames("tile", compact && "tile--compact", highlighted && "is-on"),
    href,
    tabindex: tag === "a" ? tabIndex : null,
    style: `--fill:${paint.fill};--on-fill:${paint.onFill}`,
    title: `${element.name} · ${element.symbol} · ${element.atomicNumber}`,
    "aria-label": tag === "a" ? accessibleName(element, groupName) : null,
  })}><span class="tile__z">${escapeHtml(element.atomicNumber)}</span><span class="tile__sym">${escapeHtml(
    element.symbol,
  )}</span>${name}</${tag}>`;
}