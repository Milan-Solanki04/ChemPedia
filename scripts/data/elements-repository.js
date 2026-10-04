/**
 * The only reader of `data/elements.json`.
 *
 * Every page that shows an element goes through here. The table engine needs all 118 in grid
 * order, an element page needs one by slug, a ranking needs them sorted by a property with the
 * unknowns at the bottom, and none of those should be reading a JSON file, knowing a URL, or
 * deciding for itself what a missing value sorts as.
 *
 * So the file is read once, indexed once, and everything else is a question asked of the index.
 * A lookup that finds nothing returns null rather than throwing: a URL for an element that does
 * not exist is a 404, which is a page, and a page is not an exception.
 */

import { loadJson } from "./json-source.js";

/** The file this repository owns. */
export const ELEMENTS_FILE = "elements.json";

/**
 * Whether a value counts as known.
 *
 * Null and undefined are unknown. Zero is not: a density, an oxidation state and a temperature
 * can all legitimately be zero, and a sort that treats zero as missing would bury the one value
 * that is exactly on the boundary.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isKnown(value) {
  return value !== null && value !== undefined;
}

/**
 * Read the element data and return its queries.
 *
 * @param {{ fetchImpl?: typeof fetch, base?: string }} [options] injected so tests need no network
 * @returns {Promise<object>}
 */
export async function createElementsRepository({ fetchImpl = fetch, base } = {}) {
  const elements = await loadJson(ELEMENTS_FILE, { fetchImpl, base });

  if (!Array.isArray(elements)) {
    throw new TypeError(`${ELEMENTS_FILE} should hold an array of elements`);
  }

  const byNumber = new Map();
  const bySymbol = new Map();
  const bySlug = new Map();

  for (const element of elements) {
    byNumber.set(element.atomicNumber, element);
    bySymbol.set(element.symbol, element);
    bySlug.set(element.slug, element);
  }

  /**
   * Every element matching one field's value, in atomic-number order.
   *
   * @param {string} field
   * @param {unknown} value
   * @returns {object[]}
   */
  function where(field, value) {
    return elements.filter((element) => element[field] === value);
  }

  return {
    /** All 118, in atomic-number order. */
    all: () => [...elements],

    /** How many there are, so a caller never has to write `all().length`. */
    count: () => elements.length,

    /**
     * One element by atomic number, symbol or slug.
     *
     * @param {number} atomicNumber
     * @returns {object | null}
     */
    byNumber: (atomicNumber) => byNumber.get(atomicNumber) ?? null,

    /**
     * @param {string} symbol
     * @returns {object | null}
     */
    bySymbol: (symbol) => bySymbol.get(symbol) ?? null,

    /**
     * @param {string} slug
     * @returns {object | null}
     */
    bySlug: (slug) => bySlug.get(slug) ?? null,

    /**
     * Every element in a category, by category slug.
     *
     * @param {string} slug
     * @returns {object[]}
     */
    withCategory: (slug) => where("category", slug),

    /**
     * @param {string} block `s`, `p`, `d` or `f`
     * @returns {object[]}
     */
    withBlock: (block) => where("block", block),

    /**
     * @param {number} period
     * @returns {object[]}
     */
    withPeriod: (period) => where("period", period),

    /**
     * @param {number} group
     * @returns {object[]}
     */
    withGroup: (group) => where("group", group),

    /**
     * @param {string} state `solid`, `liquid` or `gas`
     * @returns {object[]}
     */
    withState: (state) => where("state", state),

    /**
     * The elements ordered by a property, with the unknowns last.
     *
     * Unknowns sort last in both directions rather than reversing to the top, because "the
     * lightest element" and "the heaviest element" are both questions about elements whose weight
     * is known, and an element with no measurement is the answer to neither.
     *
     * @param {string} field
     * @param {{ direction?: "ascending" | "descending" }} [options]
     * @returns {object[]}
     */
    sortedBy(field, { direction = "ascending" } = {}) {
      const sign = direction === "descending" ? -1 : 1;

      return [...elements].sort((one, other) => {
        const first = one[field];
        const second = other[field];

        if (!isKnown(first) && !isKnown(second)) {
          return one.atomicNumber - other.atomicNumber;
        }

        if (!isKnown(first)) {
          return 1;
        }

        if (!isKnown(second)) {
          return -1;
        }

        return sign * (first - second) || one.atomicNumber - other.atomicNumber;
      });
    },
  };
}
