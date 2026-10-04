/**
 * The occupancy of the periodic table's grid, and movement within it.
 *
 * The table is a sparse grid: eighteen columns by ten rows, of which row 8 holds nothing because it
 * is the declared gap between the body of the table and the two detached rows. Roughly half the
 * cells are empty, and the empties are not incidental — they are where the d block has not started
 * yet, where the f block has been pulled out, and where the gap row sits.
 *
 * So movement through the grid cannot be arithmetic. There is no cell one step to the left of
 * aluminium; there are eleven, all empty, and then beryllium. This module answers the two
 * questions the component and the keyboard layer actually have — *what is in this cell*, and *what
 * is the next cell worth focusing in that direction* — by asking the data rather than counting.
 *
 * **It does not work out where an element sits.** That is `tools/data-sources/layout.js`, it runs
 * at build time from the atomic number, and its answer is frozen into each record's `position`.
 * Two modules that both derived a cell would be two modules free to disagree about which cell
 * lutetium occupies, and a disagreement between the table and an element's own page is the kind
 * of defect nobody notices until both are published. So this module reads `position` and never
 * re-derives it.
 *
 * Pure: no DOM, no data files, no side effects. Every function takes a placement map and returns a
 * value, which is what lets the whole of the table's geometry be tested in Node.
 */

/** The grid is eighteen columns wide: eighteen groups, or eighteen columns of elements. */
export const GRID_COLUMNS = 18;

/** Seven periods, the gap row, then the two detached rows. */
export const GRID_ROWS = 10;

/**
 * The row the grid template reserves as a gap between the body and the detached rows.
 *
 * Declared rather than merely left empty, so the separation is a property of the grid rather than
 * a consequence of no element ever being assigned there. Nothing reads this to place an element —
 * it is here so that a caller reasoning about the grid's shape has the row named.
 */
export const GAP_ROW = 8;

/** The rows the detached f-block series occupy, in order. */
export const DETACHED_ROWS = [9, 10];

/** The four directions a reader can move in. */
export const DIRECTIONS = ["up", "down", "left", "right"];

/**
 * A cell's key, as the string a map is indexed by.
 *
 * @param {number} row 1–10
 * @param {number} column 1–18
 * @returns {string}
 */
export function cellKey(row, column) {
  return `${row}:${column}`;
}

/**
 * A cell's row and column, from its key.
 *
 * The inverse of `cellKey`, and needed by the browser side of the table, which reads cells out of the
 * rendered page as `data-cell` strings rather than out of the records it was not given.
 *
 * @param {string} key
 * @returns {{ row: number, column: number } | null} null for anything that is not a cell key
 */
export function parseCell(key) {
  const match = /^(\d+):(\d+)$/.exec(String(key ?? ""));

  if (!match) {
    return null;
  }

  const row = Number(match[1]);
  const column = Number(match[2]);

  return isInsideGrid(row, column) ? { row, column } : null;
}

/**
 * Whether a row and column are inside the grid at all.
 *
 * Distinct from asking whether a cell is occupied: a cell in the gap row is inside the grid and
 * empty, and a column of 19 is not a cell at all.
 *
 * @param {number} row
 * @param {number} column
 * @returns {boolean}
 */
export function isInsideGrid(row, column) {
  const whole = Number.isInteger(row) && Number.isInteger(column);

  return whole && row >= 1 && row <= GRID_ROWS && column >= 1 && column <= GRID_COLUMNS;
}

/**
 * Index the elements by the cell they occupy.
 *
 * A later element displaces an earlier one rather than the map being rejected, because the data
 * layer's own test is what guarantees no two elements share a cell. A grid that threw at render
 * time would take the whole page down over one bad record; a grid that renders 117 tiles and lets
 * the test shout about the collision fails more honestly.
 *
 * @param {{ position: { row: number, column: number } }[]} elements
 * @returns {Map<string, object>} cell key to the element that occupies it
 */
export function placementMap(elements) {
  return placementFrom(
    elements.map((element) => ({
      row: element.position?.row,
      column: element.position?.column,
      value: element,
    })),
  );
}

/**
 * Index cells by their coordinates, whatever each one is.
 *
 * The other way to build a placement, and the one the browser uses. The table is rendered into the
 * page, so by the time any script runs there are no records in memory — there are `li` elements
 * carrying `data-cell`, and those are what the placement has to be built from. Same map, same
 * movement code, whether the values are records or nodes.
 *
 * @param {{ row: number, column: number, value: unknown }[]} cells
 * @returns {Map<string, unknown>}
 */
export function placementFrom(cells) {
  const placement = new Map();

  for (const { row, column, value } of cells) {
    if (isInsideGrid(row, column)) {
      placement.set(cellKey(row, column), value);
    }
  }

  return placement;
}

/**
 * The element in a cell, or null.
 *
 * Null rather than a throw, for the same reason every other lookup in this project returns null: an
 * empty cell is a normal state of a sparse grid, and the gap row is empty on purpose.
 *
 * @param {Map<string, unknown>} placement
 * @param {number} row
 * @param {number} column
 * @returns {unknown | null}
 */
export function cellAt(placement, row, column) {
  return placement.get(cellKey(row, column)) ?? null;
}

/**
 * Every occupied cell, in reading order: rows top to bottom, columns left to right.
 *
 * This is the order a reader moving through the table with the keyboard encounters elements in, and
 * it is also where the roving tab stop starts.
 *
 * @param {Map<string, unknown>} placement
 * @returns {{ row: number, column: number, element: unknown }[]}
 */
export function occupiedCells(placement) {
  const cells = [];

  for (let row = 1; row <= GRID_ROWS; row += 1) {
    for (let column = 1; column <= GRID_COLUMNS; column += 1) {
      const element = cellAt(placement, row, column);

      if (element) {
        cells.push({ row, column, element });
      }
    }
  }

  return cells;
}

/**
 * The nearest occupied cell in a direction, skipping the empties in between.
 *
 * Skipping rather than refusing is the whole point. Aluminium sits in row 3, column 13; the ten
 * cells to its left are empty because the d block does not begin until period 4, and the eleventh is
 * magnesium. A reader pressing the left arrow there means "the thing to my left", and the thing to
 * their left is magnesium. Refusing to move would read as a broken key.
 *
 * The scan runs along one axis only, so moving left never changes row and moving down never changes
 * column. That keeps the reader's mental model intact: they asked for a direction, they got that
 * direction.
 *
 * @param {Map<string, unknown>} placement
 * @param {{ row: number, column: number }} from
 * @param {"up" | "down" | "left" | "right"} direction
 * @returns {{ row: number, column: number, element: unknown } | null} null at the grid's edge
 */
export function neighbour(placement, { row, column }, direction) {
  if (!DIRECTIONS.includes(direction)) {
    return null;
  }

  const horizontal = direction === "left" || direction === "right";
  const towardsStart = direction === "left" || direction === "up";
  const limit = horizontal ? GRID_COLUMNS : GRID_ROWS;
  const from = towardsStart
    ? (horizontal ? column : row) - 1
    : (horizontal ? column : row) + 1;

  for (let step = from; towardsStart ? step >= 1 : step <= limit; step += towardsStart ? -1 : 1) {
    const element = horizontal ? cellAt(placement, row, step) : cellAt(placement, step, column);

    if (element) {
      return horizontal ? { row, column: step, element } : { row: step, column, element };
    }
  }

  return null;
}