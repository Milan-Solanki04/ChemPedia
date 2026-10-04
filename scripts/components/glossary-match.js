/**
 * Scoring a glossary term against a query.
 *
 * The element search ranks a name, a symbol and a number. A glossary has none of those, and its reader
 * is after a different thing: someone who knows the word and wants its meaning is looking for the term,
 * and someone who knows the meaning and not the word is looking for the term's definition. Typing
 * "reaction rates" should find *kinetics*, and that only works if the definition is searched too.
 *
 * So the four ranks are, in order of how sure the match is:
 *
 *   0  the whole query is the term
 *   1  the term starts with the query        — "iso" offers isotope and isobar alike
 *   2  the term contains the query           — "gen" offers the ones with it in the middle
 *   3  the definition contains the query     — a word in the meaning, not the name
 *
 * Rank 3 is why this is not `matchRank` with the fields swapped. It is a weaker kind of match: the term
 * is not what was typed, only something it describes. Keeping it last is what puts "isotope" above
 * "isobar" above "isotonic" when a reader types `iso`, instead of returning them as three equals.
 *
 * Pure, like the element ranker it sits beside, so the count the filter reports and the test that
 * asserts what the filter keeps are reading the same function.
 */

import { NO_MATCH, queryWords, rankedItems } from "../lib/match.js";

export { NO_MATCH };

/**
 * How well one term matches a query. Lower is better, and `NO_MATCH` drops it.
 *
 * **A query is more than one word, so matching cannot be a substring test.** The first version of this
 * was, and it failed on the case this module exists for: "reaction rates" does not appear anywhere in
 * *Kinetics* — "The study of how fast a reaction goes" — so the reader who described the meaning
 * precisely got nothing back. Words are therefore matched individually and *all* of them must be found
 * somewhere in the term, which is what makes a multi-word query work without letting a single stray
 * word pull in an unrelated term.
 *
 * The ranks, best first:
 *
 *   0  the query as written is the whole term
 *   1  the query as written starts the term      — "iso" offers isotope, isobar and isotonic alike
 *   2  the query as written is inside the term    — "gen" offers the terms with it in the middle
 *   3  every word of the query is in the term or in its definition — the reader who knows the meaning
 *
 * For a one-word query, rank 3 is the definition case, which is the order the element ranker uses too.
 * For a several-word query, rank 3 is the "I know what it means" case, which is the order a glossary
 * needs and an element search has no use for.
 *
 * @param {string} query already lower-cased and trimmed
 * @param {{ term: string, definition: string }} entry
 * @returns {number}
 */
export function glossaryMatchRank(query, entry) {
  const term = String(entry?.term ?? "").toLowerCase();
  const definition = String(entry?.definition ?? "").toLowerCase();
  const words = queryWords(query);

  if (term === query) {
    return 0;
  }

  if (term.startsWith(query)) {
    return 1;
  }

  if (term.includes(query)) {
    return 2;
  }

  if (words.length > 0 && words.every((word) => term.includes(word) || definition.includes(word))) {
    return 3;
  }

  return NO_MATCH;
}

/**
 * Every term a query matches, best first, with nothing truncated.
 *
 * Ties are broken alphabetically, which is the order the index is already in — so a filter narrows the
 * list rather than reshuffling it. The glossary's own `search` does the same thing without ranking,
 * and that is deliberate: it is what the no-JavaScript path and the tests use, so the two can be
 * compared rather than assumed to agree.
 *
 * @param {{ term: string, definition: string, slug: string }[]} terms
 * @param {string} raw
 * @returns {{ term: object, rank: number }[]}
 */
export function rankedTerms(terms, raw) {
  return rankedItems(terms, raw, glossaryMatchRank, (one, other) =>
    one.term.localeCompare(other.term, "en", { sensitivity: "base" }),
  ).map(({ item: term, rank }) => ({ term, rank }));
}