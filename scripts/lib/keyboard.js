/**
 * Where a key sends the reader in the table, and where the tab stop begins.
 *
 * The table is 118 links. Tabbing through all of them before reaching anything below it would put a
 * reader's next stop half a minute away and make the table a trap for anyone navigating by keyboard
 * alone, so the grid uses **roving focus**: one tile is in the tab order at a time, the arrow keys
 * move the reader around the table, and Tab leaves the table for the rest of the page.
 *
 * Two decisions are worth stating, because both could reasonably have gone the other way.
 *
 * **The arrow keys belong to the grid, and Tab does not.** Arrow keys on a grid mean "move within
 * the grid" in every convention for gridded widgets, and a reader who presses one expects it to be
 * handled. Tab still means "leave", because a grid that trapped Tab would make the rest of the page
 * unreachable from the keyboard.
 *
 * **Home and End move along the row, not out of the table.** A grid of sparse, irregular cells has
 * no obvious row end other than the first and last tile in it, and those are the two a reader who
 * has overshot wants. Anything a key does not name is left alone entirely: this module returns null
 * and the browser's own behaviour stands.
 *
 * Pure. It holds no element, no DOM node and no state between calls, which is what lets the whole
 * of the grid's keyboard behaviour be asserted in Node against the real dataset.
 */

import { neighbour, occupiedCells } from "./grid.js";

/**
 * What each key means, as a movement this module can resolve.
 *
 * The four arrows carry the grid's four directions; Home and End carry the two ends of the row a
 * reader is in. Nothing else is listed, and that is deliberate — an unlisted key is not handled.
 */
const MOVEMENTS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Home: "row-start",
  End: "row-end",
};

/**
 * The movement a key stands for, or null for a key this grid leaves to the browser.
 *
 * @param {string} key
 * @returns {"up" | "down" | "left" | "right" | "row-start" | "row-end" | null}
 */
export function movementFor(key) {
  return MOVEMENTS[key] ?? null;
}

/** The keys this grid handles, for the component that installs the listener. */
export const MOVEMENT_KEYS = Object.keys(MOVEMENTS);

/**
 * The first tile in reading order, which is where the table's single tab stop starts.
 *
 * Reading order rather than atomic-number order, because reading order is what a reader arriving by
 * Tab expects to continue in — and on this table the two differ, because the detached rows come last.
 *
 * @param {Map<string, unknown>} placement
 * @returns {{ row: number, column: number, element: unknown } | null} null on an empty grid
 */
export function initialTabStop(placement) {
  return occupiedCells(placement)[0] ?? null;
}

/**
 * The first or last occupied cell in a row.
 *
 * @param {Map<string, unknown>} placement
 * @param {number} row
 * @param {"first" | "last"} which
 * @returns {{ row: number, column: number, element: unknown } | null} null when the row is empty
 */
function endOfRow(placement, row, which) {
  const inRow = occupiedCells(placement).filter((cell) => cell.row === row);

  if (inRow.length === 0) {
    return null;
  }

  return which === "first" ? inRow[0] : inRow.at(-1);
}

/**
 * The tile a key sends the reader to.
 *
 * Returns the cell itself rather than its element, because the caller has to move focus to a node
 * and also keep the roving tab stop in step with where the reader is.
 *
 * @param {Map<string, unknown>} placement
 * @param {{ row: number, column: number }} from the cell the reader is in
 * @param {string} key
 * @returns {{ row: number, column: number, element: unknown } | null}
 *   null when the key is not ours, when there is nowhere to go, or when the grid is empty
 */
export function destination(placement, from, key) {
  const movement = movementFor(key);

  if (!movement || !from) {
    return null;
  }

  if (movement === "row-start" || movement === "row-end") {
    return endOfRow(placement, from.row, movement === "row-start" ? "first" : "last");
  }

  return neighbour(placement, from, movement);
}

/**
 * Whether a cell is the one the grid currently offers to Tab.
 *
 * A single tile carries `tabindex="0"` and the rest carry `-1`, so the grid is one stop in the page's
 * tab order and the arrow keys are the way around it. The first tile is the stop until the reader
 * has moved, which is what keeps a page nobody has touched yet reachable.
 *
 * @param {{ row: number, column: number }} cell
 * @param {{ row: number, column: number } | null} active
 * @returns {boolean}
 */
export function isTabStop(cell, active) {
  if (!active) {
    return false;
  }

  return cell.row === active.row && cell.column === active.column;
}