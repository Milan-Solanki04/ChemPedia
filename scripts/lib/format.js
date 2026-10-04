/**
 * Turning a stored value into the string a reader sees.
 *
 * Two rules decide almost everything here.
 *
 * The first is that an unknown value is not an empty string and not a dash. It is a word, it is
 * said once, and it says only what is true — that this site does not have the number — rather
 * than borrowing a phrase from whoever designed the page before us.
 *
 * The second is that a measurement and its unit are formatted together or not at all. Half of a
 * value's meaning lives in the unit, so a number that reaches a page without one is a bug in a
 * way that a missing row is not.
 *
 * The library is pure. It reads no data file: the definitions that say which unit and how many
 * figures a field takes belong to the units repository, and arrive here as an argument.
 */

/** What a reader is told when the site does not have a value. */
export const UNKNOWN = "Unknown";

/** A number that reached the formatter from somewhere unexpected. */
function asNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

/**
 * Drop the zeros that toFixed and toPrecision leave behind.
 *
 * `4.00` and `4` are the same measurement, and only one of them looks like a claim to a precision
 * nobody made. Exponential notation is left alone, because its digits carry the exponent.
 *
 * @param {string} text
 * @returns {string}
 */
function trimZeros(text) {
  if (text.includes("e") || text.includes("E")) {
    return text;
  }

  const trimmed = text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;

  return Number(trimmed) === 0 ? "0" : trimmed;
}

/**
 * A number as text, or null when there is no number.
 *
 * Exactly one of `significant` and `decimals` should be given. Significant figures suit values
 * that span many orders of magnitude — a density runs from 0.00008988 to 22.59, and a fixed
 * number of decimals renders the first as zero. Decimals suit values measured to a precision
 * someone chose, such as a melting point.
 *
 * @param {number | null} value
 * @param {{ decimals?: number, significant?: number }} [definition]
 * @returns {string | null}
 */
export function formatNumber(value, { decimals, significant } = {}) {
  const number = asNumber(value);

  if (number === null) {
    return null;
  }

  if (significant) {
    return trimZeros(number.toPrecision(significant));
  }

  return trimZeros(number.toFixed(decimals ?? 2));
}

/**
 * A value with its unit, or the word for not having one.
 *
 * @param {number | null} value
 * @param {{ unit?: string | null, decimals?: number, significant?: number }} [definition]
 * @returns {string}
 */
export function formatMeasurement(value, definition = {}) {
  const text = formatNumber(value, definition);

  if (text === null) {
    return UNKNOWN;
  }

  return definition.unit ? `${text}\u00a0${definition.unit}` : text;
}

/**
 * A signed integer, the way an oxidation state or a charge is written.
 *
 * Zero takes no sign, because `+0` and `-0` are not numbers anyone writes.
 *
 * @param {number | null} value
 * @returns {string}
 */
export function formatSignedInteger(value) {
  const number = asNumber(value);

  if (number === null) {
    return UNKNOWN;
  }

  const rounded = Math.round(number);

  return rounded > 0 ? `+${rounded}` : String(rounded);
}

/**
 * A list rendered as a sentence fragment, or the word for not having one.
 *
 * @param {unknown[] | null} values
 * @param {(value: unknown) => string} [format] applied to each entry
 * @param {string} [separator]
 * @returns {string}
 */
export function formatList(values, format = String, separator = ", ") {
  if (!Array.isArray(values) || values.length === 0) {
    return UNKNOWN;
  }

  return values.map(format).join(separator);
}
