/**
 * Find an element.
 *
 * A search box that jumps straight to an element's page. It is the first thing on the site that runs
 * against the data layer in the browser rather than at build time, and it is written to that rule:
 * the form works with no script at all, and the live results are an addition to a form that already
 * submits.
 *
 * **The no-JavaScript path is the real one.** The form GETs `/elements/?q=…`, which is the elements
 * index's own job and a page that exists to be searched. A reader whose script fails, or who has
 * turned it off, submits the form and gets the same answer a moment later. Nothing here is required
 * for the page to work.
 *
 * **What it matches.** A name, a symbol, or an atomic number — and the three are matched differently
 * on purpose. Typing `26` should find iron, not the element whose name happens to contain two sixes;
 * typing `fe` should find iron before francium, because a symbol is an abbreviation and an
 * abbreviation is meant to be typed in full. So an exact symbol beats a symbol prefix, which beats a
 * name that starts the same way, which beats a name that contains it anywhere.
 *
 * **The placeholder is shorter than the label on purpose.** The label says all three kinds of thing
 * to look for; the placeholder has to fit a phone-sized field beside a button, and a placeholder
 * that does not fit is a placeholder cut off mid-word.
 *
 * **Pressing Enter with one match goes there.** With more than one it does not guess: the form
 * submits and the elements index narrows, which is what a reader who typed `car` and got two
 * candidates wants.
 *
 * The data comes from the repository rather than from the table's own markup, so the search does not
 * stop working on a page that has no table and does not break when a tile changes shape.
 */

import { attributes, escapeHtml } from "../lib/html.js";
import { NO_MATCH, rankedItems } from "../lib/match.js";

/** How many results to show at once. Eight is what fits beside the input without a scrollbar. */
export const RESULT_LIMIT = 8;

/**
 * The rank `matchRank` gives an element that does not match at all.
 *
 * Re-exported from `lib/match.js` rather than declared here, because the glossary's filter scores the
 * same way against different fields and the two must agree on what "no match" is. Anything that wants
 * the constant imports it from the library; this re-export is here so the search module still reads as
 * the one place that ranks elements.
 */
export { NO_MATCH };

/**
 * @param {{
 *   action?: string,
 *   id?: string,
 *   label?: string,
 *   placeholder?: string,
 *   button?: string,
  landmark?: string
 * }} [options]
 * @returns {string}
 */
export function elementSearch({
  action = "/elements/",
  id = "element-search",
  label = "Find an element by name, symbol or atomic number",
  placeholder = "Name, symbol or number",
  button = "Find",
  landmark = "Find one element",
} = {}) {
  const statusId = `${id}-status`;
  const resultsId = `${id}-results`;

  // Named, because the masthead already carries a search landmark and two of the same name are two
  // places a screen-reader user cannot tell apart.
  return `<form class="find__form"${attributes({ action, method: "get", role: "search", "aria-label": landmark })}>
<label class="visually-hidden" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
<div class="find__row">
<input${attributes({
    class: "find__input",
    id,
    name: "q",
    type: "search",
    placeholder,
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-describedby": statusId,
    "aria-controls": resultsId,
  })}>
<button class="find__button" type="submit">${escapeHtml(button)}</button>
</div>
<p class="find__status" id="${escapeHtml(statusId)}" role="status"></p>
<ul class="find__results" id="${escapeHtml(resultsId)}" hidden></ul>
</form>`;
}

/**
 * How well an element matches a query. Lower is better, and a non-match is last.
 *
 * @param {string} query already lower-cased and trimmed
 * @param {{ symbol: string, name: string, atomicNumber: number }} element
 * @returns {number}
 */
export function matchRank(query, element) {
  const symbol = element.symbol.toLowerCase();
  const name = element.name.toLowerCase();

  if (symbol === query) {
    return 0;
  }

  if (Number(query) === element.atomicNumber) {
    return 1;
  }

  if (symbol.startsWith(query)) {
    return 2;
  }

  if (name.startsWith(query)) {
    return 3;
  }

  if (name.includes(query)) {
    return 4;
  }

  return NO_MATCH;
}

/**
 * Every element a query matches, best first, with nothing truncated.
 *
 * Ties are broken by atomic number, so typing `c` lists caesium, calcium, carbon and chlorine in
 * atomic order rather than in whatever order the dataset happened to hold them. The full list and
 * the shown list are different lengths on purpose: the status line has to be able to say how many
 * there were, not how many fitted.
 *
 * @param {object[]} elements
 * @param {string} raw
 * @returns {{ element: object, rank: number }[]}
 */
export function rankedMatches(elements, raw) {
  return rankedItems(
    elements,
    raw,
    matchRank,
    (one, other) => one.atomicNumber - other.atomicNumber,
  ).map(({ item: element, rank }) => ({ element, rank }));
}

/**
 * The elements a query matches, best first, up to a limit.
 *
 * @param {object[]} elements
 * @param {string} raw
 * @param {{ limit?: number }} [options]
 * @returns {object[]}
 */
export function searchElements(elements, raw, { limit = RESULT_LIMIT } = {}) {
  return rankedMatches(elements, raw)
    .slice(0, limit)
    .map(({ element }) => element);
}

/**
 * What the status line says, which is a sentence and not a number.
 *
 * @param {string} query
 * @param {number} found how many matched, in total and not only how many are shown
 * @param {number} shown
 * @returns {string}
 */
export function statusFor(query, found, shown) {
  if (found === 0) {
    return `No element matches ${query}.`;
  }

  const noun = found === 1 ? "element" : "elements";

  return found === 1
    ? "One element. Press Enter to open it."
    : `${found} ${noun}${shown < found ? `, showing the first ${shown}` : ""}.`;
}

/**
 * Attach the live results to a form that already works.
 *
 * Takes the elements rather than loading them, so the page module decides when the data arrives and
 * a failure there leaves the form submitting instead of throwing. Every listener is registered
 * through `on`, so `release` detaches all of them.
 *
 * @param {ParentNode} root the element containing the form
 * @param {{ elements: object[], limit?: number }} context
 * @returns {{ release: () => void }}
 */
export function wireElementSearch(root, { elements, limit = RESULT_LIMIT }) {
  const form = root.querySelector(".find__form");
  const input = form?.querySelector(".find__input");
  const results = form?.querySelector(".find__results");
  const status = form?.querySelector(".find__status");

  if (!form || !input || !results || !status) {
    return { release() {} };
  }

  const listeners = [];
  const matches = [];

  /**
   * @param {EventTarget} target
   * @param {string} type
   * @param {(event: Event) => void} handler
   */
  function on(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push([target, type, handler]);
  }

  function draw(query) {
    const ranked = rankedMatches(elements, query);

    matches.length = 0;
    matches.push(...ranked.slice(0, limit).map(({ element }) => element));

    results.hidden = matches.length === 0;
    status.textContent = query.trim() === "" ? "" : statusFor(query.trim(), ranked.length, matches.length);

    results.innerHTML = matches
      .map(
        (element) =>
          `<li class="find__result"><a href="/elements/${escapeHtml(element.slug)}/"><span class="find__result-name">${escapeHtml(
            element.name,
          )}</span> <span class="find__result-symbol">${escapeHtml(element.symbol)}</span></a></li>`,
      )
      .join("\n");
  }

  on(input, "input", () => draw(input.value));

  on(input, "keydown", (event) => {
    // Only one key is handled: the one that means "I have finished typing and I want the first
    // result". Everything else belongs to the browser, and in particular Tab must leave the field.
    if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault();
      results.querySelector("a")?.focus();
    }
  });

  on(form, "submit", (event) => {
    if (matches.length !== 1) {
      return;
    }

    event.preventDefault();
    window.location.assign(`/elements/${matches[0].slug}/`);
  });

  draw("");

  return {
    release() {
      for (const [target, type, handler] of listeners) {
        target.removeEventListener(type, handler);
      }

      listeners.length = 0;
    },
  };
}