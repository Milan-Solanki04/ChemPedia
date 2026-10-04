import { test } from "node:test";
import assert from "node:assert/strict";

import { glossaryMatchRank, rankedTerms } from "../../scripts/components/glossary-match.js";
import { filterItems } from "../../scripts/components/element-filter.js";

/**
 * The glossary's scorer, tested against a small set written here.
 *
 * The fixture is made of the awkward cases rather than a convenient one, because the four ranks only
 * differ from each other on words that are prefixes of one another. A test with "lead" in it proves
 * almost nothing about "isotope" versus "isobar", which is the distinction that has to be right.
 */

const TERMS = [
  { term: "Isotope", slug: "isotope", definition: "Two atoms of one element with different numbers of neutrons." },
  { term: "Isotonic", slug: "isotonic", definition: "Having the same number of neutrons in the nucleus." },
  { term: "Isobar", slug: "isobar", definition: "Two nuclides with the same mass number and different atomic numbers." },
  { term: "Kinetics", slug: "kinetics", definition: "The study of how fast a reaction goes." },
  { term: "Lead", slug: "lead", definition: "A dense metal that corrodes in place of steel." },
];

/** @param {string} query @param {string} term the fixture's name for the term */
const rankOf = (query, term) => glossaryMatchRank(query, TERM(term));

/** @param {string} term */
function TERM(term) {
  const found = TERMS.find((entry) => entry.term === term);

  assert.ok(found, `no fixture term called ${term}`);

  return found;
}

test("the whole query being the term is the best possible match", () => {
  assert.equal(rankOf("lead", "Lead"), 0);
});

test("a prefix of the term outranks a term that merely contains the query", () => {
  assert.ok(rankOf("iso", "Isotope") < rankOf("bar", "Isobar"));
});

test("three terms starting with the same letters are told apart, not tied", () => {
  const ranks = ["Isotope", "Isotonic", "Isobar"].map((term) => rankOf("iso", term));

  assert.equal(new Set(ranks).size, 1, "the same query gives the same rank to all three");

  const ranked = rankedTerms(TERMS, "iso").map(({ term }) => term.term);

  assert.deepEqual(ranked, ["Isobar", "Isotonic", "Isotope"], "and the tie is settled alphabetically, not arbitrarily");
});

test("a word in the definition finds the term, which is the reason this scorer exists", () => {
  const ranked = rankedTerms(TERMS, "neutrons").map(({ term }) => term.term);

  assert.deepEqual(ranked, ["Isotonic", "Isotope"], "a reader who knows the meaning finds the word");
});

test("one word the definition lacks is enough to reject the term", () => {
  assert.deepEqual(
    rankedTerms(TERMS, "reaction rates"),
    [],
    "every word has to be found somewhere, or a stray word would pull in an unrelated term",
  );
});

test("a multi-word query finds the term even though no definition contains the phrase", () => {
  assert.deepEqual(
    rankedTerms(TERMS, "how fast a reaction goes").map(({ term }) => term.term),
    ["Kinetics"],
  );
});

test("a definition match is weaker than a name match", () => {
  assert.ok(
    rankOf("neutrons", "Isotope") > rankOf("iso", "Isotope"),
    "a word from the definition must not outrank the word itself",
  );
});

test("a query that is nowhere in the term scores as no match at all", () => {
  assert.equal(glossaryMatchRank("unobtainium", TERM("Lead")), 5);
});

test("a term with no fields does not throw, because the data is a file someone can edit", () => {
  assert.equal(glossaryMatchRank("x", {}), 5);
});

test("an empty query matches nothing here, because both callers decide that case first", () => {
  assert.deepEqual(rankedTerms(TERMS, ""), []);
  assert.deepEqual(rankedTerms(TERMS, "   "), []);
});

test("a query in any case is folded before it is scored", () => {
  assert.deepEqual(
    rankedTerms(TERMS, "LEAD").map(({ term }) => term.term),
    ["Lead"],
    "the folding is the library's job, not every caller's",
  );
});

test("the shared filter keeps exactly the terms the scorer ranked, and counts them", () => {
  const items = TERMS.map((term) => ({ element: term, node: term.slug }));

  const result = filterItems("neutrons", items, glossaryMatchRank);

  assert.equal(result.shown, 2, "isotope and isotonic both say neutrons");
  assert.equal(result.total, 5);
  assert.ok(result.keep.has("isotope") && result.keep.has("isotonic"));
});

test("a query that matches nothing shows nothing rather than everything", () => {
  const items = TERMS.map((term) => ({ element: term, node: term.slug }));

  assert.equal(filterItems("unobtainium", items, glossaryMatchRank).shown, 0);
});