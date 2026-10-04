/**
 * Temperature conversion.
 *
 * Pure, and the whole of the calculator's arithmetic in one file with no DOM in it. That is deliberate:
 * a conversion is a rounding question and a boundary question, and neither should need a browser to
 * settle. Everything here is a function of its arguments, so the test suite can check the reference
 * points — 0 °C = 32 °F = 273.15 K, and the other four that matter — without rendering anything.
 *
 * **The three scales are defined by their conversions to Celsius, not by three pairs of formulas.**
 * Writing each scale as a transformation of Celsius means adding a scale means adding two functions
 * rather than four, and it makes the round trip the tests check exact rather than approximately right.
 *
 * **Floating point is the other half of the job.** `(98.6 − 32) × 5/9` is 37.000000000000004 in IEEE
 * arithmetic, which would print as 37 or as 37.000000000000004 depending on how it is rounded. So
 * rounding happens once, explicitly, at the point of formatting, and never anywhere else — the internal
 * value is left at full precision so a chained conversion does not accumulate error.
 *
 * **The absolute-zero boundary is a property of the result, not of the input.** −459.67 °F is exactly
 * absolute zero and is a legitimate reading; −459.68 °F is not a temperature anything can reach. The
 * reference site draws that line correctly and we match it, which is why the check is expressed in
 * Celsius and applied to the converted value.
 */

/**
 * How many decimal places a reading is printed to, before trailing zeros are trimmed.
 *
 * Two is what the reference uses and it is enough for every reference point: 98.6 °F in Celsius is
 * 37.000000000000004, and two places makes it 37.
 */
export const DECIMALS = 2;

/**
 * The three scales, in the order they appear on the page.
 *
 * `toCelsius` and `fromCelsius` are the only arithmetic in this file; everything else is arrangement.
 * `absoluteZero` is each scale's own reading of that point, which is what lets a typed value be checked
 * without converting it first.
 *
 * @type {{ key: string, symbol: string, name: string, absoluteZero: number, toCelsius: (value: number) => number, fromCelsius: (value: number) => number }[]}
 */
export const SCALES = [
  {
    key: "celsius",
    symbol: "°C",
    name: "Celsius",
    absoluteZero: -273.15,
    toCelsius: (value) => value,
    fromCelsius: (celsius) => celsius,
  },
  {
    key: "fahrenheit",
    symbol: "°F",
    name: "Fahrenheit",
    absoluteZero: -459.67,
    toCelsius: (value) => (value - 32) * (5 / 9),
    fromCelsius: (celsius) => celsius * (9 / 5) + 32,
  },
  {
    key: "kelvin",
    symbol: "K",
    name: "Kelvin",
    absoluteZero: 0,
    toCelsius: (value) => value - 273.15,
    fromCelsius: (celsius) => celsius + 273.15,
  },
];

/**
 * One scale by its key.
 *
 * @param {string} key
 * @returns {(typeof SCALES)[number] | null}
 */
export function scaleFor(key) {
  return SCALES.find((scale) => scale.key === key) ?? null;
}

/**
 * Convert a number between two scales.
 *
 * Returns `null` rather than `NaN` for an unusable request, so that a caller cannot print `NaN` by
 * accident — the failure a converter should never have.
 *
 * @param {number} value
 * @param {string} fromKey
 * @param {string} toKey
 * @returns {number | null}
 */
export function convert(value, fromKey, toKey) {
  const from = scaleFor(fromKey);
  const to = scaleFor(toKey);

  if (!from || !to || !Number.isFinite(value)) {
    return null;
  }

  return to.fromCelsius(from.toCelsius(value));
}

/**
 * Parse what a reader typed into a reading, or `null` if it is not one.
 *
 * The strictness is the point. An empty field, a stray full stop and a number written with a trailing
 * unit are all things a field of `type="number"` will hand over, and none of them is a temperature.
 * Returning `null` lets the page say so rather than showing a reading derived from a guess.
 *
 * @param {string} text
 * @returns {number | null}
 */
export function parseTemperature(text) {
  const trimmed = String(text ?? "").trim();

  if (trimmed === "" || !/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);

  return Number.isFinite(value) ? value : null;
}

/**
 * Whether a temperature is below absolute zero, and so not reachable.
 *
 * Expressed against Celsius because that is the one scale all three can be reduced to, and because the
 * tolerance matters: floating point puts `−459.67 °F` at −273.14999999999998 °C, which is *above*
 * absolute zero and must be accepted.
 *
 * A small tolerance rather than an exact comparison, and named, because the exact comparison gets the
 * one value that must be accepted wrong.
 *
 * @param {number} celsius
 * @returns {boolean}
 */
export function isBelowAbsoluteZero(celsius) {
  return Number.isFinite(celsius) && celsius < ABSOLUTE_ZERO_CELSIUS - TOLERANCE;
}

/**
 * Absolute zero in Celsius.
 *
 * Named because two of the three scales' own absolute zeros are derived from it, and because the
 * boundary test needs it as a single number rather than as three.
 */
export const ABSOLUTE_ZERO_CELSIUS = -273.15;

/**
 * How far below absolute zero still counts as absolute zero.
 *
 * Subtracted rather than added, which is the whole of it. Adding the tolerance raises the threshold
 * and makes absolute zero itself read as *below* absolute zero — which is how this function got it
 * wrong the first time, and the test that caught it is in the suite for that reason.
 */
export const TOLERANCE = 1e-9;

/**
 * Round a reading to the printed precision, then drop trailing zeros.
 *
 * Rounding first and trimming second, so 37.000000000000004 prints as `37` and 100.005 prints as
 * `100.01` rather than as `100.00`. The sign is handled separately so that a value rounding to zero
 * does not print as `-0`.
 *
 * @param {number} value
 * @param {number} [decimals]
 * @returns {string}
 */
export function formatTemperature(value, decimals = DECIMALS) {
  if (!Number.isFinite(value)) {
    return "";
  }

  const rounded = Number(value.toFixed(decimals));

  if (Object.is(rounded, -0)) {
    return "0";
  }

  return String(rounded);
}

/**
 * A reading converted and formatted in one call, which is what the page shows.
 *
 * `convert` on its own is deliberately unrounded, so that a chain of conversions does not accumulate
 * error and because the identity conversion stays the identity for any input. Everything a reader sees
 * goes through here, which is the one place rounding happens.
 *
 * @param {number | null} value
 * @param {string} fromKey
 * @param {string} toKey
 * @returns {string}
 */
export function readingFor(value, fromKey, toKey) {
  const converted = convert(value, fromKey, toKey);

  return converted === null ? "" : formatReading(converted, toKey);
}

/**
 * A reading with its scale's symbol, or an empty string when there is no reading.
 *
 * The empty string rather than a placeholder is what lets the page clear a result instead of leaving a
 * stale one — the defect in the reference's calculator.
 *
 * @param {number | null} value
 * @param {string} scaleKey
 * @returns {string}
 */
export function formatReading(value, scaleKey) {
  const scale = scaleFor(scaleKey);

  if (scale === null || value === null || !Number.isFinite(value)) {
    return "";
  }

  return `${formatTemperature(value)} ${scale.symbol}`;
}

/**
 * The temperatures worth knowing, which is what the page lists beside the fields.
 *
 * Every entry is a real reference point rather than a round number, because the round ones are the ones
 * a reader can already work out. Body temperature and the freezing point of water are here for a
 * reason: they are the two conversions people actually need.
 *
 * @type {{ label: string, celsius: number }[]}
 */
export const REFERENCE_POINTS = [
  { label: "Water freezes", celsius: 0 },
  { label: "Room temperature", celsius: 21 },
  { label: "Body temperature", celsius: 37 },
  { label: "Water boils", celsius: 100 },
  { label: "The scales coincide", celsius: -40 },
  { label: "Absolute zero", celsius: -273.15 },
];

/**
 * Every scale's reading of one temperature, for the reference table and for a round-trip test.
 *
 * @param {number} celsius
 * @returns {Record<string, number>}
 */
export function readingsOf(celsius) {
  return Object.fromEntries(
    SCALES.map((scale) => [scale.key, scale.fromCelsius(celsius)]),
  );
}
