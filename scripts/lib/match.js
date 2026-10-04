/**
 * Ranking, for the two things on this site that filter a list they already have.
 *
 * **What is shared is the shape, not the meaning.** The masthead's find field ranks an element by
 * symbol, then atomic number, then name; the glossary's filter ranks a term by how well the query
 * matches the word and then falls back to the definition. Those are different opinions about what a
 * reader means, and neither should be rewritten to suit the other — but the mechanics around them are
 * identical: score each item, drop the ones that scored nothing, sort what is left, and break ties the
 * way that list is already ordered.
 *
 * So the mechanics live here, and each caller supplies the scoring function and the tie-break. A third
 * filtered list is then a ranker of its own and no more, rather than a third copy of this loop.
 *
 * **`NO_MATCH` is named because two modules now depend on it.** A literal `5` would be a coupling
 * nobody would notice breaking, and the failure would be a filter that quietly reported the wrong
 * count.
 *
 * Every function here is pure: no DOM, no data layer, nothing loaded. The DOM half of filtering is in
 * `components/element-filter.js`, and it cannot disagree with these because it asks them rather than
 * reimplementing them.
 */

/** The rank a scored item gets when the query does not match it at all. Last, and filtered out. */
export const NO_MATCH = 5;

/**
 * Words that end in a letter that looks like a plural but is not.
 *
 * The first rule below strips a trailing "s" so that a reader who types "reaction rates" finds the
 * definition that says "rate". It has to know about these, because they would otherwise become
 * nonsense stems — "physics" to "physic", "analysis" to "analysi" — and a stem that matches nothing
 * is a word that finds nothing.
 */
const NOT_PLURAL = new Set([
  "analysis", "atlas", "basis", "bias", "canvas", "gas", "hypothesis", "is", "os",
  "osmosis", "physics", "statistics", "synthesis", "thermodynamics", "us",
]);

/**
 * The words of a query, folded for matching.
 *
 * Three things happen, and each of them is a search that used to fail for a reason no reader could see:
 *
 *   - the query is lower-cased and split on anything that is not a letter or a digit;
 *   - a trailing "s" is dropped, so "atoms" and "atom" match the same definition and "reaction rates"
 *     finds the term about a reaction's rate;
 *   - empty words are dropped, so a query of punctuation matches nothing rather than everything.
 *
 * Singular and plural are the only case folded. Stemming "reaction" to "react" would match "reactant"
 * and "reactive" as well, which is a different and much less predictable decision — one that belongs
 * to the ranking function rather than here.
 *
 * @param {string} query
 * @returns {string[]}
 */
export function queryWords(query) {
  return String(query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (plural(word) ? word.slice(0, -1) : word));
}

/**
 * Whether a word is an ordinary word that happens to end in "s".
 *
 * @param {string} word already lower-cased
 * @returns {boolean}
 */
function plural(word) {
  return (
    word.length > 3 &&
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    !NOT_PLURAL.has(word)
  );
}

/**
 * Score every item, drop the non-matches, and sort what is left.
 *
 * Rank order first, then `tie` to break equal ranks. The tie-break matters more than it looks: without
 * it, two items with the same score come out in whatever order the input happened to be in, and a
 * filter that reorders its list under every keystroke is a list nobody can scan. With it, ties keep
 * the order the page already had.
 *
 * An empty query matches nothing rather than everything. Both callers handle "no query" before they get
 * here — one shows the whole list, the other hides its dropdown — and a function that quietly decided
 * either way would leave that decision somewhere invisible.
 *
 * @template T
 * @param {T[]} items
 * @param {string} raw the query as typed
 * @param {(query: string, item: T) => number} rank lower is better; `NO_MATCH` to drop it
 * @param {(one: T, other: T) => number} [tie] falls back to reading order
 * @returns {{ item: T, rank: number }[]}
 */
export function rankedItems(items, raw, rank, tie) {
  const query = String(raw ?? "").trim().toLowerCase();

  if (query === "") {
    return [];
  }

  return items
    .map((item) => ({ item, rank: rank(query, item) }))
    .filter(({ rank: score }) => score < NO_MATCH)
    .sort((one, other) => one.rank - other.rank || (tie ? tie(one.item, other.item) : 0));
}