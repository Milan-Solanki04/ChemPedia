/**
 * Contrast — pure colour maths, no DOM and no data.
 *
 * The site paints a tile or a chip in an element group's colour and then has to
 * decide what colour that group's text should be. Pale groups need dark text,
 * dark groups need cream text, and "which is it" is a question with an exact
 * answer, so it is computed rather than tabulated. One rule, nine lines of
 * arithmetic, and one test that walks all eleven groups.
 *
 * Everything here is pure: no DOM, no data, no side effects. That is what lets
 * the colour rules be tested without a browser, and why this lives in lib/.
 */

/**
 * The two foregrounds a group fill may take.
 *
 * These duplicate two values from `styles/tokens.css` — `--on-fill-dark` and
 * `--on-fill-light` — because a JavaScript module cannot read a CSS custom
 * property without the DOM, and this rule must also run in Node during the
 * build. A test asserts that the stylesheet still declares these values, so the
 * duplication cannot drift silently.
 */
export const ON_FILL_DARK = "#12211f";
export const ON_FILL_LIGHT = "#fdfbfa";

/** WCAG AA for normal text. */
export const AA_TEXT = 4.5;

/** WCAG AA for large text, and for a graphic element against its background. */
export const AA_LARGE = 3;

/**
 * Expand a three- or six-digit hex colour and check it is one.
 *
 * @param {string} hex
 * @returns {string} the colour in lowercase six-digit form, without a leading hash
 */
export function normaliseHex(hex) {
  if (typeof hex !== "string") {
    throw new TypeError(`A colour must be a string: received ${typeof hex}`);
  }

  const value = hex.trim().replace(/^#/, "").toLowerCase();

  if (/^[0-9a-f]{3}$/.test(value)) {
    return value
      .split("")
      .map((digit) => digit + digit)
      .join("");
  }

  if (/^[0-9a-f]{6}$/.test(value)) {
    return value;
  }

  throw new TypeError(`Not a hex colour: ${hex}`);
}

/**
 * The three channels of a colour, as numbers from 0 to 255.
 *
 * @param {string} hex
 * @returns {number[]}
 */
function channels(hex) {
  const value = normaliseHex(hex);

  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

/**
 * One channel's contribution to relative luminance, per WCAG.
 *
 * @param {number} channel 0–255
 * @returns {number} 0–1
 */
function linearise(channel) {
  const value = channel / 255;

  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * The relative luminance of a colour, per WCAG 2.1.
 *
 * @param {string} hex
 * @returns {number} 0 for black, 1 for white
 */
export function relativeLuminance(hex) {
  const [red, green, blue] = channels(hex);

  return 0.2126 * linearise(red) + 0.7152 * linearise(green) + 0.0722 * linearise(blue);
}

/**
 * The contrast ratio between two colours, from 1 to 21.
 *
 * Symmetric: the order of the arguments does not change the result.
 *
 * @param {string} one
 * @param {string} other
 * @returns {number}
 */
export function contrastRatio(one, other) {
  const first = relativeLuminance(one);
  const second = relativeLuminance(other);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The foreground to use on a given fill: whichever of the two candidates
 * contrasts against it better.
 *
 * Better, not merely acceptable, because with two candidates the choice is
 * never close — one of them is always far ahead, and picking the stronger one
 * means the fill keeps a margin of safety if it is ever adjusted.
 *
 * @param {string} fill
 * @param {{ candidates?: string[] }} [options]
 * @returns {string} one of the candidates, in six-digit form with a leading hash
 */
export function readableForeground(fill, { candidates = [ON_FILL_DARK, ON_FILL_LIGHT] } = {}) {
  const ranked = candidates
    .map((candidate) => ({ candidate, ratio: contrastRatio(fill, candidate) }))
    .sort((a, b) => b.ratio - a.ratio);

  return `#${normaliseHex(ranked[0].candidate)}`;
}

/**
 * Whether a contrast ratio reaches a WCAG AA threshold.
 *
 * @param {number} ratio
 * @param {{ large?: boolean }} [options] large text, or a graphic against its background
 * @returns {boolean}
 */
export function meetsAA(ratio, { large = false } = {}) {
  return ratio >= (large ? AA_LARGE : AA_TEXT);
}
