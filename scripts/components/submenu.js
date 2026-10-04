/**
 * The contextual submenu.
 *
 * A band of small links under the masthead, belonging to the section the page is in and changing
 * with it. A section that has no submenu renders no band at all rather than an empty one, which is
 * why this component can return nothing.
 *
 * The band carries the site's signature motif: a 1px dotted rule across its full width, in the ink
 * colour. The rule spans the viewport while the items stay inside the content column, which is
 * what makes the band read as a band rather than as a row.
 */

import { attributes, classNames, escapeHtml } from "../lib/html.js";

/**
 * @param {{
 *   submenu: { label: string | null, items: { label: string, path: string }[] } | null,
 *   currentPath: string,
 *   isCurrent: (path: string, currentPath: string) => boolean
 * }} options
 * @returns {string} the band, or an empty string when the section has no submenu
 */
export function submenu({ submenu: definition, currentPath, isCurrent }) {
  if (!definition || definition.items.length === 0) {
    return "";
  }

  const label = definition.label
    ? `<span class="submenu__label">${escapeHtml(definition.label)}</span>`
    : "";

  const items = definition.items
    .map((item) => {
      const current = isCurrent(item.path, currentPath);

      return `<a${attributes({
        class: classNames("submenu__item", current && "is-current"),
        href: item.path,
        "aria-current": current ? "page" : null,
      })}>${escapeHtml(item.label)}</a>`;
    })
    .join("\n");

  return `<nav class="submenu" aria-label="Section">
<div class="shell submenu__inner">
${label}
${items}
</div>
</nav>`;
}
