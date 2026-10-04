/**
 * The masthead.
 *
 * Present on every page, and rendered into the HTML at build time rather than assembled by a
 * script in the browser. That is the whole reason the chrome is a string builder: a page whose
 * header only exists after JavaScript has run is a page with no header for a reader opening the
 * file, a crawler, or anyone whose script failed.
 *
 * The component is given its links; it does not look them up. Where a link goes is the page's
 * business, not the component's, which is what lets the same masthead sit on a page that is not
 * part of any section.
 *
 * The current page is marked with aria-current rather than a class alone, so the underline is
 * drawn from a semantic fact and a screen reader announces it.
 */

import { attributes, classNames, escapeHtml } from "../lib/html.js";
import { searchField } from "./search-field.js";
import { wordmark } from "./wordmark.js";

/**
 * @param {{
 *   navigation: { label: string, path: string }[],
 *   currentPath: string,
 *   isCurrent: (path: string, currentPath: string) => boolean,
 *   search?: { action?: string }
 * }} options
 * @returns {string}
 */
export function siteHeader({ navigation, currentPath, isCurrent, search = {} }) {
  const items = navigation
    .map((item) => {
      const current = isCurrent(item.path, currentPath);

      return `<li><a${attributes({
        href: item.path,
        class: classNames("masthead__link", current && "is-current"),
        "aria-current": current ? "page" : null,
      })}>${escapeHtml(item.label)}</a></li>`;
    })
    .join("\n");

  return `<header class="masthead">
<div class="shell masthead__inner">
${wordmark()}
<nav class="masthead__nav" aria-label="Primary">
<ul>
${items}
</ul>
</nav>
${searchField(search)}
</div>
</header>`;
}
