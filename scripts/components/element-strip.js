/**
 * The previous / current / next strip.
 *
 * Three labels across the top of an element page: the element before this one, this one, and the
 * element after. It is the one piece of furniture on the page that is pure navigation, and it is here
 * so that moving through the 118 elements is a walk rather than a hunt.
 *
 * **It wraps at both ends.** Hydrogen's previous is oganesson and oganesson's next is hydrogen,
 * because the table is a circle and a strip that dead-ended would make the first and last elements
 * feel like they were not part of it. The wrap is computed from the whole ordered list, not from
 * neighbours, so it cannot be forgotten for one element and remembered for the other.
 *
 * **The current element is marked, not excluded.** It is in the strip as a plain label, because the
 * strip is a map of where this element sits and a map with a hole in it is not a map. It is marked
 * with `aria-current` rather than a class alone, so the fact is announced and drawn from one place.
 */

import { attributes, escapeHtml } from "../lib/html.js";

/**
 * The element before and the element after, wrapping at both ends.
 *
 * @param {{ all: object[], current: object }} context
 * @returns {{ previous: object | null, next: object | null }}
 */
export function neighboursOf({ all, current }) {
  if (all.length === 0) {
    return { previous: null, next: null };
  }

  const index = all.findIndex((element) => element.slug === current.slug);

  if (index === -1) {
    return { previous: null, next: null };
  }

  return {
    previous: all[(index - 1 + all.length) % all.length],
    next: all[(index + 1) % all.length],
  };
}

/**
 * One side of the strip.
 *
 * @param {{
 *   element: object | null,
 *   direction: "previous" | "next",
 *   elementPath?: (element: object) => string
 * }} context
 * @returns {string}
 */
function side({ element, direction, elementPath }) {
  const label = direction === "previous" ? "Previous" : "Next";

  if (!element) {
    return `<div class="strip__item strip__item--${direction}"><span class="strip__label">${label}</span></div>`;
  }

  return `<div class="strip__item strip__item--${direction}">
<span class="strip__label">${label}</span>
<a class="strip__link" href="${escapeHtml(elementPath(element))}"><span class="strip__name">${escapeHtml(
    element.name,
  )}</span><span class="strip__number">${escapeHtml(element.atomicNumber)}</span></a>
</div>`;
}

/**
 * @param {{
 *   element: object,
 *   all: object[],
 *   elementPath?: (element: object) => string,
 *   heading?: string
 * }} options
 * @returns {string}
 */
export function elementStrip({
  element,
  all,
  elementPath = (one) => `/elements/${one.slug}/`,
  heading = "Where this element sits",
}) {
  const { previous, next } = neighboursOf({ all, current: element });

  return `<nav class="strip" aria-label="${escapeHtml(heading)}">
<div class="strip__inner">
${side({ element: previous, direction: "previous", elementPath })}
<p class="strip__current"${attributes({ "aria-current": "page" })}>
<span class="strip__name">${escapeHtml(element.name)}</span>
<span class="strip__number">${escapeHtml(element.symbol)}</span>
</p>
${side({ element: next, direction: "next", elementPath })}
</div>
</nav>`;
}