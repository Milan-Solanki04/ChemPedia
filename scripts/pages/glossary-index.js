/**
 * The glossary index.
 *
 * One page standing for four hundred, in the same two halves every other page on this site has: this
 * module renders the page at build time, and a second export attaches the filter once it is in the
 * browser.
 *
 * **Nothing here holds a term.** Every letter group, every row and every count on this page is counted
 * from the records the repository hands over, so a term added to `data/glossary.json` appears here with
 * no edit to this file, and a term removed takes its row, its count and its letter with it. The only
 * reason the counts exist is that they cannot be written down — see the rail below.
 *
 * **The rail is the reference's, and the counts are ours.** The reference has a sticky A–Z rail down the
 * side of its list, which on four hundred terms is the only thing telling a scrolling reader where they
 * are. It carries no counts. Ours does, because a reader who wants "something about bonding" does not
 * know whether to try B or R, and a count answers that in the same glance as the letter. A rail that
 * offered a letter with nothing under it would also be worse than useless, which is why the letters come
 * from the repository's own `letters()` — derived from the content, so it cannot offer an empty page.
 *
 * **The rows are in the page, not fetched after it.** Each row carries its term and definition as text
 * and repeats them in `data-filter`, so the list is complete before any script runs and the filter
 * narrows what is already there. A reader whose scripts never run gets every term and a field that
 * submits, which is what every other list on this site gives them.
 *
 * The badge is a `<span>` inside the row's link rather than beside it, so the whole row is one target:
 * on a page with four hundred of them, a reader aiming at a term should not have to hit the word
 * exactly.
 */

import { attributes, escapeHtml } from "../lib/html.js";
import { elementFilter, wireElementFilter } from "../components/element-filter.js";
import { glossaryMatchRank } from "../components/glossary-match.js";
import { glossaryFilterText, levelBadge } from "../components/glossary-badge.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const GLOSSARY_INDEX_PLACEHOLDERS = ["filter", "jump", "letters"];

/**
 * The A–Z rail: one anchor per letter that has terms, each carrying its count.
 *
 * The count is inside the anchor rather than beside it in a separate element, because the reader is
 * deciding between letters while looking at the rail and splitting each entry into two focusable or
 * clickable things would double the number of targets for no gain.
 *
 * @param {{ term: string, slug: string, definition: string, level: string }[]} terms
 * @returns {string}
 */
export function alphabetRail(terms) {
  const present = new Map();

  for (const entry of terms) {
    const letter = entry.slug.charAt(0).toUpperCase();
    present.set(letter, (present.get(letter) ?? 0) + 1);
  }

  const links = [...present.keys()]
    .sort()
    .map((letter) => {
      const count = present.get(letter);

      return `<li class="alphabet__item">
<a class="alphabet__link" href="#letter-${escapeHtml(letter)}" data-letter="${escapeHtml(letter)}">
<span class="alphabet__letter">${escapeHtml(letter)}</span>
<span class="alphabet__count">${count}</span>
</a>
</li>`;
    })
    .join("\n");

  return `<ul class="alphabet__list">
${links}
</ul>`;
}

/**
 * One term row: the term, its definition, and its difficulty badge.
 *
 * The definition is trimmed for the row rather than cut, because a row that ends mid-word is worse than
 * a row that runs to three lines — and every definition on this site is written to be read whole on the
 * term page that carries it in full.
 *
 * @param {{ term: string, slug: string, definition: string, level: string }} entry
 * @returns {string}
 */
export function glossaryRow(entry) {
  return `<li class="glossary__row"${attributes({
    "data-filter": glossaryFilterText(entry),
    "data-filter-term": entry.term,
    "data-filter-definition": entry.definition,
    "data-filter-level": entry.level,
  })}>
<a class="glossary__link" href="/glossary/${escapeHtml(entry.slug)}/">
<span class="glossary__term">${escapeHtml(entry.term)}</span>
<span class="glossary__definition">${escapeHtml(entry.definition)}</span>
${levelBadge(entry.level)}
</a>
</li>`;
}

/**
 * The whole list: a heading and a list of rows per letter that has terms.
 *
 * The letter headings are `h2`s inside the section whose own `h2` is visually hidden, which keeps the
 * document outline saying "letters, then terms" rather than pretending the letters are not there.
 *
 * @param {{ term: string, slug: string, definition: string, level: string }[]} terms
 * @returns {string}
 */
export function glossaryLetters(terms) {
  const groups = new Map();

  for (const entry of terms) {
    const letter = entry.slug.charAt(0).toUpperCase();
    groups.set(letter, [...(groups.get(letter) ?? []), entry]);
  }

  return [...groups.keys()]
    .sort()
    .map((letter) => {
      const rows = groups.get(letter).map(glossaryRow).join("\n");

      return `<div class="glossary__letter" data-letter="${escapeHtml(letter)}">
<h3 class="glossary__letter-heading" id="letter-${escapeHtml(letter)}">${escapeHtml(letter)}</h3>
<ul class="glossary__rows">
${rows}
</ul>
</div>`;
    })
    .join("\n");
}

/**
 * Render the index's body.
 *
 * @param {{ template: string, terms: object[] }} context
 * @returns {string}
 */
export function glossaryIndex({ template, terms }) {
  return fillTemplate(template, {
    filter: elementFilter({
      id: "glossary-filter",
      label: "Filter the glossary by term or definition",
      placeholder: "Search terms and definitions...",
      noun: "terms",
      controls: "glossary-list",
    }),
    jump: alphabetRail(terms),
    letters: `<div class="glossary__list" id="glossary-list" data-count="${terms.length}">
${glossaryLetters(terms)}
</div>`,
  });
}

/**
 * Attach the index's behaviour to a page that already contains it.
 *
 * The glossary's ranker is passed explicitly, because it searches definition text where the element
 * ranker searches names and numbers, and the default would be wrong here.
 *
 * @param {{ root: ParentNode }} context
 * @returns {{ release: () => void }}
 */
export function hydrateGlossaryIndex({ root }) {
  const filter = wireElementFilter(root, { noun: "terms", rank: glossaryMatchRank });

  return {
    release: () => filter.release(),
  };
}

/**
 * The difficulty badge, re-exported from the component that owns it.
 *
 * The index, the term page and any test that checks a row has a badge should all take the same markup
 * from one place; a badge that looked one way on the index and another on its own page would be the
 * sort of drift the components directory exists to prevent.
 */
export { levelBadge } from "../components/glossary-badge.js";