/**
 * A numeric property, shaded along a ramp.
 *
 * Three of the table's four colour modes ask a question a category can answer — which group, which
 * block, which state — and one does not. Electronegativity, atomic radius, density and melting
 * point are measurements, and the question is where a value falls in the range. For that the tile
 * needs a scale, and the scale needs a rule that cannot go stale.
 *
 * The rule is the one the design reference uses, and it is the only one worth having: **equal-width
 * bins over the domain the data actually spans.** Not hand-picked breaks. Hand-picked breaks are
 * chosen against one version of the data and then quietly wrong after it — a new element moves the
 * extremes, and a legend that still prints the old numbers is a legend lying to the reader. A
 * partition of the measured domain moves with the data, and it can be asserted at both ends.
 *
 * Two distinctions this module is careful about:
 *
 *   - **An unknown value is not a small one.** `null` takes the neutral fill and appears in the
 *     legend as its own entry, never as the bottom of the ramp. Shading 23 elements with no
 *     electronegativity as though they were the least electronegative would be a false claim about
 *     helium, neon and argon.
 *   - **Zero is a measurement.** A density can be zero and an oxidation state can be zero, and
 *     `0` must land in the first bin rather than be mistaken for absent.
 *
 * Pure: no DOM, no data files, no side effects. The ramp arrives as hex values, and the foreground
 * for each step is *derived* through `contrast.js` rather than written down, so a step cannot be
 * added whose text would not be readable on it.
 */

import { readableForeground } from "./contrast.js";

/**
 * The measured range of a field, with the two counts a legend needs.
 *
 * @param {{ [field: string]: unknown }[]} elements
 * @param {string} field
 * @returns {{ min: number, max: number, known: number, unknown: number } | null}
 *   null when nothing in the data carries the value at all
 */
export function domainOf(elements, field) {
  const values = elements
    .map((element) => element[field])
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    known: values.length,
    unknown: elements.length - values.length,
  };
}

/**
 * A step's fill and the foreground that reads on it.
 *
 * @param {string} fill
 * @returns {{ fill: string, onFill: string }}
 */
function pair(fill) {
  return { fill, onFill: readableForeground(fill) };
}

/**
 * Build a scale over a domain.
 *
 * @param {{
 *   domain: { min: number, max: number } | null,
 *   ramp: string[],        hex values, palest first
 *   unknown: string        the neutral fill for a value the sources do not carry
 * }} definition
 * @returns {{
 *   steps: number,
 *   min: number | null,
 *   max: number | null,
 *   step: (value: unknown) => number | null,
 *   colour: (value: unknown) => { fill: string, onFill: string },
 *   bins: () => { from: number, to: number, ...{ fill: string, onFill: string } }[]
 * }}
 */
export function numericScale({ domain, ramp, unknown }) {
  if (!Array.isArray(ramp) || ramp.length === 0) {
    throw new TypeError("A scale needs at least one step");
  }

  const steps = ramp.length;
  const colours = ramp.map(pair);
  const unknownColour = pair(unknown);
  const min = domain?.min ?? null;
  const max = domain?.max ?? null;

  /**
   * Which step a value falls in, or null when there is nothing to place it on.
   *
   * Clamps rather than extends: a value below the minimum is as much a real measurement as one
   * above the maximum, and both belong in an end bin. Extending the ramp instead would invent
   * colours for values the data does not contain.
   *
   * @param {unknown} value
   * @returns {number | null} 0-based, or null for a value that is not a measurement
   */
  function step(value) {
    if (min === null || max === null) {
      return null;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }

    if (value < min) {
      return 0;
    }

    if (value > max) {
      return steps - 1;
    }

    if (max === min) {
      return 0;
    }

    return Math.min(steps - 1, Math.floor(((value - min) / (max - min)) * steps));
  }

  return {
    steps,
    min,
    max,

    step,

    /**
     * The fill and foreground for a value, falling back to the neutral fill for an unknown.
     *
     * @param {unknown} value
     * @returns {{ fill: string, onFill: string }}
     */
    colour(value) {
      const index = step(value);

      return index === null ? unknownColour : colours[index];
    },

    /**
     * The bins themselves, so a legend can print the range each step stands for.
     *
     * The upper bound of the last bin is the domain's maximum rather than its exclusive edge, so
     * the legend reads as the reader's data reads and not as a table of intervals.
     *
     * @returns {{ from: number, to: number, fill: string, onFill: string }[]}
     */
    bins() {
      if (min === null || max === null) {
        return [];
      }

      const width = (max - min) / steps;

      return colours.map((colour, index) => ({
        from: Number((min + width * index).toFixed(6)),
        to: Number((index === steps - 1 ? max : min + width * (index + 1)).toFixed(6)),
        ...colour,
      }));
    },
  };
}