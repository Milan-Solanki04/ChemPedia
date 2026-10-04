/**
 * The wordmark.
 *
 * The identity is a stacked lockup: the name set as two lines in a tall, narrow box. That shape is
 * part of the design being reproduced, so the structure is fixed even though the words are ours.
 * The two lines are separate elements rather than a line break, so the box can be controlled and
 * so the accessible name stays one word.
 *
 * In the header the lockup is a link home. In the footer it is plain text, because a link back to
 * the page you may already be on is noise.
 */

import { attributes, classNames, escapeHtml } from "../lib/html.js";

const LINES = ["Chemi", "Pedia"];

/**
 * @param {{ link?: boolean, small?: boolean, home?: string }} [options]
 * @returns {string}
 */
export function wordmark({ link = true, small = false, home = "/" } = {}) {
  const name = LINES.join("");
  const lines = LINES.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
  const classes = classNames("wordmark", small && "wordmark--sm");

  if (!link) {
    return `<p class="${classes}">${lines}</p>`;
  }

  return `<a${attributes({ class: classes, href: home, "aria-label": `${name}, home` })}>${lines}</a>`;
}
