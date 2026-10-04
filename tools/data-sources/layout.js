/**
 * Where an element sits on the periodic table, from its atomic number alone.
 *
 * The datasets publish values; they do not publish geometry. Period, group, block and grid cell
 * are properties of the table's shape, and the table's shape is the one thing everyone agrees on
 * and no dataset bothers to state. So it is derived here, once, from the atomic number.
 *
 * Derived rather than stored because the grid maths in the table engine and the property list on
 * an element page must not be able to disagree about which cell an element occupies. They ask
 * this module, and a test walks all 118 atomic numbers asserting that no two share a cell and
 * that every group number is a real one.
 *
 * Kept apart from configuration.js, which answers a different question: where an element sits is
 * not what is inside it.
 */

/** The atomic number that ends each period. */
const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118];

/**
 * The columns the main rows use, in order.
 *
 * Rows 1 to 3 are missing columns 3 to 12 because there is nothing to put in them: the d block
 * starts at period 4. Rows 6 and 7 are missing column 3 for the same reason at the other end —
 * the f block is pulled out into its own detached rows, so lanthanum and hafnium are adjacent in
 * the table's numbering and fifteen columns apart on the page.
 */
const MAIN_COLUMNS = {
  1: [1, 18],
  2: [1, 2, 13, 14, 15, 16, 17, 18],
  3: [1, 2, 13, 14, 15, 16, 17, 18],
  4: columnsBetween(1, 18),
  5: columnsBetween(1, 18),
  6: [1, 2, ...columnsBetween(4, 18)],
  7: [1, 2, ...columnsBetween(4, 18)],
};

/** The two detached rows, and the grid row each one occupies. */
const F_BLOCKS = [
  { first: 57, last: 71, period: 6, row: 9, column: 3 },
  { first: 89, last: 103, period: 7, row: 10, column: 3 },
];

/**
 * An inclusive run of column numbers.
 *
 * @param {number} first
 * @param {number} last
 * @returns {number[]}
 */
function columnsBetween(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/**
 * The detached row an atomic number belongs to, if any.
 *
 * @param {number} atomicNumber
 * @returns {{ first: number, last: number, period: number, row: number, column: number } | null}
 */
function fBlockFor(atomicNumber) {
  return F_BLOCKS.find(({ first, last }) => atomicNumber >= first && atomicNumber <= last) || null;
}

/**
 * Which period an element is in, 1 to 7.
 *
 * @param {number} atomicNumber
 * @returns {number}
 */
export function periodFor(atomicNumber) {
  const block = fBlockFor(atomicNumber);

  if (block) {
    return block.period;
  }

  return PERIOD_ENDS.findIndex((end) => atomicNumber <= end) + 1;
}

/**
 * The grid cell, as `{ row, column }` on an eighteen-column grid.
 *
 * Rows 1 to 7 are the table. Row 8 is deliberately empty — it is the gap that separates the
 * lanthanides and actinides from the body, and a stylesheet can only leave it empty if the data
 * never puts anything in it. Rows 9 and 10 are the detached rows, starting at column 3.
 *
 * @param {number} atomicNumber
 * @returns {{ row: number, column: number }}
 */
export function positionFor(atomicNumber) {
  const block = fBlockFor(atomicNumber);

  if (block) {
    return { row: block.row, column: block.column + (atomicNumber - block.first) };
  }

  const period = periodFor(atomicNumber);
  const first = period === 1 ? 1 : PERIOD_ENDS[period - 2] + 1;
  const detached = F_BLOCKS.filter((block) => block.period === period && block.last < atomicNumber).reduce(
    (total, block) => total + (block.last - block.first + 1),
    0,
  );

  return { row: period, column: MAIN_COLUMNS[period][atomicNumber - first - detached] };
}

/**
 * The group number, 1 to 18, or null for the lanthanides and actinides.
 *
 * Null rather than a number because those two rows genuinely have no group: they are inserted
 * between groups 2 and 4, and which of lanthanum or lutetium belongs in group 3 is the most
 * stubborn disagreement in the subject. The table's own answer is that neither does.
 *
 * @param {number} atomicNumber
 * @returns {number | null}
 */
export function groupFor(atomicNumber) {
  return fBlockFor(atomicNumber) ? null : positionFor(atomicNumber).column;
}

/**
 * The block an element belongs to, `s`, `p`, `d` or `f`.
 *
 * Helium is the exception the layout cannot express: it sits at the right-hand end of period 1
 * and belongs to the s block, because the electrons it fills are 1s. Reading the block off the
 * column alone would file it under p.
 *
 * @param {number} atomicNumber
 * @returns {"s" | "p" | "d" | "f"}
 */
export function blockFor(atomicNumber) {
  if (fBlockFor(atomicNumber)) {
    return "f";
  }

  if (atomicNumber === 2) {
    return "s";
  }

  const { column } = positionFor(atomicNumber);

  if (column <= 2) {
    return "s";
  }

  return column <= 12 ? "d" : "p";
}
