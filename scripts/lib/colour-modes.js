/**
 * The table's four colour modes.
 *
 * Three of them answer a question a category can answer — which group, which block, which state at
 * room temperature — and the fourth answers a question no category can: where does a measurement
 * fall in the range. What they share is the shape of the answer. Each mode can say, for any element,
 * **which key it belongs to**, and for a set of elements, **what the keys are, what to call them and
 * how many members each has**. That is exactly what a tile needs to be painted and exactly what a
 * legend needs to print, so one mode definition serves both and the two can never disagree.
 *
 * The counts are counted here rather than read from `categories.json`, which asserts them. Reading
 * the assertion would make the legend incapable of disagreeing with the data — and a legend that
 * cannot disagree is a legend that cannot be checked. Counting from the records and letting the data
 * layer's own test hold the taxonomy means the legend prints what the table actually contains, and a
 * mismatch is a failing test rather than a wrong number on a page.
 *
 * The mode never chooses a colour. It is handed a `paint` function that turns a key into a resolved
 * `{ fill, onFill }` pair, because which token a key resolves to is the caller's knowledge and the
 * token layer's business. What this module owns is the vocabulary: the keys, their names, and their
 * order.
 *
 * Pure: it reads no data file and touches no DOM.
 */

/** The four modes, in the order the reference's table views present them. */
export const COLOUR_MODES = ["group", "block", "state", "value"];

/** The key an element with no value carries in a value mode. */
export const UNKNOWN_KEY = "unknown";

/**
 * The four orbital blocks, in the order the table's shape runs.
 *
 * s, p, d, f is the order a reader learns them in and the order the rows appear left to right, so
 * the legend reads in the same direction as the table.
 */
const BLOCK_LABELS = [
  ["s", "s-block"],
  ["p", "p-block"],
  ["d", "d-block"],
  ["f", "f-block"],
];

/**
 * The three states at room temperature, and the label each is given.
 *
 * The states are capitalised because they are the names of states rather than of properties, and
 * because a legend of eleven lower-case chips reads as data while a legend of three capitalised ones
 * reads as a key.
 */
const STATE_LABELS = [
  ["solid", "Solid"],
  ["liquid", "Liquid"],
  ["gas", "Gas"],
];

/** What a state key is called when a value mode and a state mode have to share a label. */
const UNKNOWN_LABEL = "Not measured";

/**
 * Count how many elements carry each key.
 *
 * @param {object[]} elements
 * @param {(element: object) => string} keyFor
 * @returns {Map<string, number>}
 */
function tally(elements, keyFor) {
  const counts = new Map();

  for (const element of elements) {
    const key = keyFor(element);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

/**
 * Build a colour mode.
 *
 * @param {{
 *   mode: "group" | "block" | "state" | "value",
 *   paint: (key: string) => { fill: string, onFill: string },
 *   labels?: Record<string, string> | [string, string][],  the keys, in legend order
 *   scale?: { step: (value: unknown) => number | null, bins: () => { fill: string, onFill: string }[], steps: number },
 *   field?: string                      the property a value mode shades
 *   keyOf?: (element: object) => string the key a categorical mode sorts elements into, for when the
 *                                  key is something other than the element's category
 * }} definition
 * @returns {{
 *   id: string,
 *   field: string | null,
 *   keyFor: (element: object) => string,
 *   paint: (element: object) => { fill: string, onFill: string, key: string },
 *   keys: (elements: object[]) => { key: string, label: string, count: number, paint: { fill: string, onFill: string } }[]
 * }}
 */
export function createColourMode({ mode, paint, labels, scale, field, keyOf }) {
  if (!COLOUR_MODES.includes(mode)) {
    throw new TypeError(`Not a colour mode: ${mode}`);
  }

  if (typeof paint !== "function") {
    throw new TypeError("A colour mode needs a paint function to turn a key into a colour");
  }

  // A categorical mode keyed on something the record does not carry as a field of its own — the band
  // a discovery year falls in, for instance — is still a categorical mode, so it is given a `keyOf`
  // rather than a fifth entry in `COLOUR_MODES`. Adding a mode to that list would change what the
  // four names in it mean to anyone reading the module.
  if (keyOf !== undefined && typeof keyOf !== "function") {
    throw new TypeError("A mode given a keyOf needs keyOf to be a function");
  }

  /**
   * The key an element belongs to in this mode.
   *
   * @param {object} element
   * @returns {string}
   */
  function keyFor(element) {
    if (mode === "group") {
      return keyOf ? keyOf(element) : element.category;
    }

    if (mode === "block") {
      return element.block;
    }

    if (mode === "state") {
      return element.state ?? UNKNOWN_KEY;
    }

    const index = scale?.step(element[field]);

    return index === null || index === undefined ? UNKNOWN_KEY : String(index);
  }

  /**
   * The keys a legend should print, in the order it should print them.
   *
   * A categorical mode prints every key it knows about, including one with no members, because the
   * taxonomy is a fact about the table rather than about any particular version of the data, and a
   * key that has lost its last member is news. A value mode prints its bins and then the unknown
   * entry, and omits the unknown entry entirely when nothing is unknown — a legend with a "not
   * measured" chip on a table where every value is measured is a chip answering a question nobody
   * asked.
   *
   * @param {object[]} elements
   */
  function keys(elements) {
    const counts = tally(elements, keyFor);

    if (mode === "group") {
      // Labels may arrive as an ordered list of pairs, because a mode keyed on something derived —
      // discovery bands, say — has an order that is not alphabetical and not the object's own.
      const pairs = Array.isArray(labels)
        ? labels
        : Object.entries(labels ?? {});

      return pairs.map(([key, label]) => entry(key, label, counts.get(key) ?? 0));
    }

    if (mode === "block") {
      return BLOCK_LABELS.map(([key, label]) => entry(key, label, counts.get(key) ?? 0));
    }

    if (mode === "state") {
      return STATE_LABELS.map(([key, label]) => entry(key, label, counts.get(key) ?? 0));
    }

    const bins = scale.bins().map((bin, index) => entry(String(index), rangeLabel(bin.from, bin.to), counts.get(String(index)) ?? 0));

    return counts.has(UNKNOWN_KEY) ? [...bins, entry(UNKNOWN_KEY, UNKNOWN_LABEL, counts.get(UNKNOWN_KEY))] : bins;
  }

  /**
   * @param {string} key
   * @param {string} label
   * @param {number} count
   */
  function entry(key, label, count) {
    return { key, label, count, paint: paint(key) };
  }

  return {
    id: mode,
    field: mode === "value" ? field ?? null : null,

    keyFor,

    /**
     * The colour pair and the key an element is painted with.
     *
     * The key travels with the colour rather than being looked up again by the caller, because the
     * isolation behaviour matches on it and a second lookup is a second chance to disagree.
     *
     * @param {object} element
     */
    paint(element) {
      const key = keyFor(element);

      return { ...paint(key), key };
    },

    keys,
  };
}

/**
 * How a bin's range is printed in a legend.
 *
 * Two significant figures is the most a reader can use: a bin's edge is a division of the data's
 * range, and the third digit of it is arithmetic rather than chemistry. Whole numbers lose their
 * decimal point, because "0.7 – 1.2" and "7 – 12" are the same pair of bounds and only one of them
 * is written the way anyone writes it.
 *
 * @param {number} from
 * @param {number} to
 * @returns {string}
 */
function rangeLabel(from, to) {
  const round = (value) => Number(value.toFixed(2));

  return `${round(from)} – ${round(to)}`;
}
