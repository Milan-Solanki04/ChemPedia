/**
 * Small helpers for building HTML strings safely.
 *
 * The page templates are authored fragments, but the chrome around them is generated: labels come
 * from the manifest, counts come from the data layer, and element names come from a dataset. Any
 * of those could one day contain an ampersand or an angle bracket, and a stray one would not be a
 * cosmetic bug — in an attribute it would break the element the browser builds and everything
 * inside it.
 *
 * So nothing is interpolated into markup without going through here. The functions are pure and
 * trivial, which is the point: there is no clever layer between a value and the page, only an
 * escape, and the whole thing is testable without a browser.
 */

/** Characters that end a text node or an attribute value when they are not escaped. */
const ENTITIES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

/**
 * Escape a value for use in text content.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ENTITIES.get(character));
}

/**
 * Build an attribute list from a plain object.
 *
 * A value of `null`, `undefined` or `false` omits the attribute entirely, which lets a caller pass
 * an optional state through without a branch. `true` renders a bare attribute, which is how
 * boolean attributes such as `hidden` and `disabled` are meant to be written.
 *
 * @param {Record<string, unknown>} values
 * @returns {string} a leading space and the attributes, or an empty string when there are none
 */
export function attributes(values) {
  const pairs = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== false)
    .map(([name, value]) => (value === true ? name : `${name}="${escapeHtml(value)}"`));

  return pairs.length === 0 ? "" : ` ${pairs.join(" ")}`;
}

/**
 * Join class names, dropping the empty ones.
 *
 * @param {(string | false | null | undefined)[]} names
 * @returns {string}
 */
export function classNames(...names) {
  return names.filter(Boolean).join(" ");
}
