/**
 * The glossary term pages.
 *
 * Four hundred of them, one template and one module, and the whole family is a function of which term
 * the route names — the same derivation the 118 element pages make, for the same reason.
 *
 * **A definition and an explanation are different things, so they are different fields.** The definition
 * is one or two sentences, it is what the index row shows, and it is written to be read in a list. The
 * explanation is longer prose and it is optional: a term whose definition is the whole story does not
 * get one, and the section is then left out of the page entirely.
 *
 * That optionality is a deliberate decision rather than a convenience. Four hundred terms will not all
 * *deserve* a paragraph beyond their definition, and the honest way to handle the ones that do not is to
 * leave the section off the page — not to pad it with a sentence restating the definition in different
 * words, which would be invented content filling space on a page whose job is to be trusted.
 *
 * **The links out of here are the point of the family.** The plan calls this the internal-link
 * backbone, and a term page that only defined its word would not be one. So each page resolves to the
 * elements its definition names and the terms its neighbours are — both computed from the records by
 * `lib/glossary-links.js`, never written by hand, so a term that is about iron lists iron and a term
 * that is about nothing in particular lists nothing instead of four strangers.
 *
 * The reference's page sends its reader to a Learn course and to Flash cards. We build neither, so
 * neither is linked; `lib/glossary-links.js` exists partly because that rule had to be enforced rather
 * than remembered.
 */

import { escapeHtml } from "../lib/html.js";
import { levelBadge } from "../components/glossary-badge.js";
import { elementsForTerm, relatedTerms } from "../lib/glossary-links.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const GLOSSARY_TERM_PLACEHOLDERS = [
  "letter-link",
  "name",
  "badge",
  "definition",
  "explanation",
  "elements",
  "related",
  "others",
];

/**
 * The breadcrumb's letter: the part of the index this term is filed under.
 *
 * The reference's breadcrumb ends in a letter rather than in the term, which is the one idea from its
 * term page worth keeping — it tells a reader who clicked through from a search result where the term
 * lives, and it gives them the way back to their neighbours.
 *
 * @param {{ slug: string }} entry
 * @returns {string}
 */
function letterLink(entry) {
  const letter = entry.slug.charAt(0).toUpperCase();

  return `<a href="/glossary/#letter-${escapeHtml(letter)}">${escapeHtml(letter)}</a>`;
}

/**
 * A list of element links, or a sentence saying there are none.
 *
 * The empty case is written rather than left blank: a panel with an empty list under a heading that
 * promises elements is a broken promise, and one line of prose is cheaper to read than a heading with
 * nothing under it.
 *
 * @param {{ name: string, symbol: string, slug: string }[]} elements
 * @returns {string}
 */
function elementLinks(elements) {
  if (elements.length === 0) {
    return `<p class="term-related__none">
      No element on this site is written up in terms of this one. It is a word for describing reactions
      rather than for describing an element.
    </p>`;
  }

  const items = elements
    .map(
      (element) =>
        `<li class="term-related__item">
<a class="term-related__link" href="/elements/${escapeHtml(element.slug)}/">
<span class="term-related__name">${escapeHtml(element.name)}</span>
<span class="term-related__meta">${escapeHtml(element.symbol)}</span>
</a>
</li>`,
    )
    .join("\n");

  return `<ul class="term-related__list">
${items}
</ul>`;
}

/**
 * A list of related term links, or a sentence saying there are none.
 *
 * @param {{ term: string, slug: string }[]} terms
 * @returns {string}
 */
function relatedLinks(terms) {
  if (terms.length === 0) {
    return `<p class="term-related__none">
      Nothing in the glossary shares enough vocabulary with this one to be worth suggesting, which is
      honest — a list of unrelated links would not help anybody.
    </p>`;
  }

  const items = terms
    .map(
      (term) =>
        `<li class="term-related__item">
<a class="term-related__link" href="/glossary/${escapeHtml(term.slug)}/">
<span class="term-related__name">${escapeHtml(term.term)}</span>
</a>
</li>`,
    )
    .join("\n");

  return `<ul class="term-related__list">
${items}
</ul>`;
}

/**
 * The foot of the page: the way back to the whole glossary.
 *
 * @param {number} total how many terms there are, so the sentence can be honest about the size
 * @returns {string}
 */
function backToIndex(total) {
  return `<p class="term__back">
<a class="term__back-link" href="/glossary/">All ${total} terms in the glossary</a>
</p>`;
}

/**
 * The explanation section, or nothing at all.
 *
 * Returned whole — heading included — because the section is conditional and the template cannot
 * condition itself. A term with an explanation gets a section; a term without one gets nothing, and the
 * page reads as a definition followed by where the term comes up, which is a complete page rather than a
 * stub.
 *
 * @param {string | undefined} explanation
 * @returns {string}
 */
function explanationSection(explanation) {
  if (!explanation) {
    return "";
  }

  return `<section class="term-explanation section" aria-labelledby="term-explanation-heading">
<div class="shell prose">
<h2 class="section__title" id="term-explanation-heading">What it means</h2>
<p class="term__explanation-lede">${escapeHtml(explanation)}</p>
</div>
</section>`;
}

/**
 * Render one term page's body.
 *
 * The `term` context value is the route's *slug*, not a record — the same key an element route carries —
 * so the record is resolved here rather than handed over already copied.
 *
 * @param {{
 *   template: string,
 *   terms: object[],
 *   bySlug: (slug: string) => object | null,
 *   elements: object[],
 *   term: string
 * }} context
 * @returns {string}
 */
export function glossaryTerm({ template, terms, bySlug, elements, term: slug }) {
  const term = bySlug(slug);

  // A route can name a slug that is not in the file — a term deleted from the data, or a URL left over
  // from an old index. Sending the reader to the index is better than rendering a page about nothing,
  // and the manifest only produces routes for slugs the data holds, so this is a guard rather than a
  // path anything normally takes.
  if (!term) {
    return backToIndex(terms.length);
  }

  return fillTemplate(template, {
    name: escapeHtml(term.term),
    badge: levelBadge(term.level),
    definition: escapeHtml(term.definition),
    "letter-link": letterLink(term),
    explanation: explanationSection(term.explanation),
    elements: elementLinks(elementsForTerm(term, elements)),
    related: relatedLinks(relatedTerms(term, terms)),
    others: backToIndex(terms.length),
  });
}

/**
 * Attach a term page's behaviour.
 *
 * There is nothing to attach. A term page is a definition, some links and prose, and every one of them
 * works with the scripts never running — which is why this exists only so that the build has one
 * `hydrate` to call for the family, and it deliberately does no work at all.
 *
 * @returns {{ release: () => void }}
 */
export function hydrateGlossaryTerm() {
  return { release() {} };
}