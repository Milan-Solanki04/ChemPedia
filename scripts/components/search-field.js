/**
 * The search field.
 *
 * A form, not a script. It submits a query to a page by the ordinary means a browser has always
 * had, which means it works with JavaScript switched off, it can be bookmarked, and it needs no
 * behaviour module to exist yet. What the receiving page does with the query is that page's
 * business.
 *
 * The magnifier is drawn from two primitives rather than shipped as an image: it is generic
 * iconography, it inherits the text colour, and it costs one request less than a file would.
 *
 * The landmark is named, because the home page now carries a second search — a field that jumps
 * straight to an element — and two search landmarks with the same name are two places a screen-reader
 * user cannot tell apart.
 */

import { attributes, escapeHtml } from "../lib/html.js";

/**
 * @param {{ action?: string, label?: string, placeholder?: string, id?: string }} [options]
 * @returns {string}
 */
export function searchField({
  action = "/",
  label = "Search the elements",
  placeholder = "Search\u2026",
  id = "site-search",
  landmark = "Search the whole site",
} = {}) {
  return `<form${attributes({
    class: "search-field",
    action,
    method: "get",
    role: "search",
    "aria-label": landmark,
  })}>
<svg class="search-field__icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
<circle cx="6.8" cy="6.8" r="4.6" stroke="currentColor" stroke-width="1.5"></circle>
<path d="M10.4 10.4 14.6 14.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
</svg>
<label class="visually-hidden" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
<input${attributes({
    class: "search-field__input",
    id,
    name: "query",
    type: "search",
    placeholder,
    autocomplete: "off",
  })}>
</form>`;
}
