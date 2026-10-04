/**
 * A field that filters a list already on the page.
 *
 * This is not the find field the masthead and the home page carry. That one answers "which element
 * do you want" with a short list of links; this one answers "show me only the ones I care about" by
 * narrowing what is already on screen. Two different questions, and the reference makes the same
 * distinction: the elements index filters its hundred and eighteen cards in place, and the property
 * pages filter their tables.
 *
 * So this module owns the field and the counting, and knows nothing about what it is filtering. Each
 * item that can be found declares its own searchable text in a `data-filter` attribute, which means a
 * new list can be filtered without teaching this module anything about that list — the ranking pages
 * filter table rows, the index filters cards, and neither is a special case here.
 *
 * **The matching is the find field's.** `matchRank` is imported rather than rewritten, so the index and
 * the masthead cannot disagree about what "co" matches. That function is pure and tested; this module is
 * the DOM half. A list that means something else by "match" — the glossary, which also searches
 * definitions — passes its own scorer to `filterItems` and reuses everything here.
 *
 * **A filter that is not enhancement would be a page that cannot be read.** So the page renders every
 * item and this hides some of them. With the scripts never running, the reader gets all hundred and
 * eighteen elements and a field that submits — which is the same promise the rest of the site makes.
 *
 * The status line is a `role="status"` region rather than a heading or a visual-only count, because a
 * reader who has typed three letters needs to be told what came back, and a count that is only
 * visible is a count only a sighted reader gets.
 */

import { attributes, escapeHtml } from "../lib/html.js";
import { rankedItems } from "../lib/match.js";
import { matchRank } from "./element-search.js";

/**
 * The field itself.
 *
 * The label is visually hidden rather than the placeholder doing its work. A placeholder disappears
 * the moment a reader types, which is exactly when they need to know what the field is for; the
 * home page's find field already carries a real label for the same reason.
 *
 * @param {{
 *   id?: string,
 *   label?: string,
 *   placeholder?: string,
 *   button?: string | null,
 *   noun?: string
 * }} [options]
 * @returns {string}
 */
export function elementFilter({
  id = "element-filter",
  label = "Filter by element name",
  placeholder = "Filter by element name...",
  button = null,
  noun = "elements",
  controls = null,
} = {}) {
  const statusId = `${id}-status`;

  return `<form${attributes({ class: "filter__form", role: "search", "aria-label": label })}>
<label class="visually-hidden" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
<div class="filter__row">
<input${attributes({
    class: "filter__input",
    id,
    name: "filter",
    type: "search",
    placeholder,
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-describedby": statusId,
    "aria-controls": controls,
  })}>
${button ? `<button class="filter__button" type="submit">${escapeHtml(button)}</button>` : ""}
</div>
<p class="filter__status" id="${escapeHtml(statusId)}" role="status"></p>
</form>`;
}

/**
 * The searchable text for one item.
 *
 * Exported because the page that renders the items is the page that writes the attribute, and both
 * sides of a contract should be able to read the contract. The atomic number is searchable here for
 * the same reason the find field accepts one: a reader who knows iron is 26 should not have to know
 * that its symbol is Fe.
 *
 * @param {{ name: string, symbol: string, atomicNumber: number }} element
 * @returns {string}
 */
export function filterTextFor(element) {
  return `${element.name} ${element.symbol} ${element.atomicNumber}`.toLowerCase();
}

/**
 * Which of a set of items a query keeps.
 *
 * The decision is `rankedItems` — the same machinery the find field's dropdown is built from — so
 * the index and the masthead cannot disagree about what "co" matches. Page order is deliberately
 * kept rather than rank order: a filter narrows a list, it does not re-sort it, and a grid that
 * reordered itself under every keystroke would be a list a reader could not scan.
 *
 * **The ranker is an argument because two lists mean different things by "match".** The default scores
 * an element, which is what the elements index, the property rankings and the home page all need. The
 * glossary passes its own scorer, which falls back to searching definition text, because a reader
 * searching a glossary often knows the meaning and not the word. That is the whole difference between
 * the two; the counting, the hiding and the status line below are shared, because none of them should
 * be written twice.
 *
 * Pure, and shared by the count the status line reports and by the test that asserts the filter is
 * correct, so the number a reader is told cannot disagree with the number of rows they can see.
 *
 * @param {string} query raw, as typed
 * @param {{ element: object, node: object }[]} items
 * @param {(query: string, item: object) => number} [rank]
 * @returns {{ keep: Set<object>, total: number, shown: number }}
 */
export function filterItems(query, items, rank = matchRank) {
  const cleaned = String(query ?? "").trim().toLowerCase();
  const total = items.length;

  if (cleaned === "") {
    return { keep: new Set(items.map(({ node }) => node)), total, shown: total };
  }

  const matched = new Set(
    rankedItems(items.map(({ element }) => element), cleaned, rank).map(({ item }) => item),
  );
  const keep = new Set(items.filter(({ element }) => matched.has(element)).map(({ node }) => node));

  return { keep, total, shown: keep.size };
}

/**
 * Attach filtering to a list already on the page.
 *
 * Returns a release function for a page that swaps its own content out, and does nothing at all when
 * the page has no filter or no list, so a caller never has to ask which it is looking at.
 *
 * @param {{
 *   root: ParentNode,
 *   items?: { element: object, node: Element }[],
 *   noun?: string,
 *   rank?: (query: string, item: object) => number
 * }} context
 * @returns {{ release: () => void, shown: () => number }}
 */
export function wireElementFilter(root, { items, noun = "elements", rank } = {}) {
  const form = root.querySelector(".filter__form");
  const input = form?.querySelector(".filter__input");
  const status = form?.querySelector(".filter__status");
  const list = items ?? collectItems(root);

  if (!form || !input || !status || list.length === 0) {
    return { release() {}, shown: () => list.length };
  }

  /**
   * @param {string} query
   */
  function apply(query) {
    const { keep, total, shown } = rank
      ? filterItems(query, list, rank)
      : filterItems(query, list);

    for (const { node } of list) {
      // `hidden` rather than a class, so a filtered-out item leaves the accessibility tree and the
      // tab order with the screen. A card that is only invisible is still a link a keyboard reader
      // lands on, and it goes nowhere useful.
      node.hidden = !keep.has(node);
    }

    status.textContent =
      shown === total ? `All ${total} ${noun}.` : `${shown} of ${total} ${noun}.`;

    return shown;
  }

  const onInput = () => apply(input.value);

  input.addEventListener("input", onInput);
  apply("");

  return {
    release() {
      input.removeEventListener("input", onInput);
    },
    shown: () => list.filter(({ node }) => !node.hidden).length,
  };
}

/**
 * Read the filterable items out of the page.
 *
 * Each item carries `data-filter` with its searchable text and is paired with the record it came from,
 * read back off the same attributes the page wrote. Working from the DOM rather than from the records
 * is the point: the list is already on the page before any script runs, so the script reads what is
 * there rather than rebuilding a list it would then have to keep in step.
 *
 * One reader serves both lists because the two write parallel attributes — an element card writes its
 * name, symbol and atomic number, a glossary row writes its term and definition — and a reader that
 * knew which page it was on would be a reader that has to be told.
 *
 * @param {ParentNode} root
 * @returns {{ element: object, node: Element }[]}
 */
function collectItems(root) {
  return [...root.querySelectorAll("[data-filter]")].map((node) => ({
    node,
    element: {
      name: node.dataset.filterName ?? "",
      symbol: node.dataset.filterSymbol ?? "",
      atomicNumber: Number(node.dataset.filterNumber ?? Number.NaN),
      term: node.dataset.filterTerm ?? "",
      definition: node.dataset.filterDefinition ?? "",
    },
  }));
}