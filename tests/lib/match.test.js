import { test } from "node:test";
import assert from "node:assert/strict";

import { NO_MATCH, queryWords, rankedItems } from "../../scripts/lib/match.js";

test("a query is folded to lower case and split on what is not a word", () => {
  assert.deepEqual(queryWords("Reaction, isotope; ZINC"), ["reaction", "isotope", "zinc"]);
});

test("a trailing s is dropped, so a plural query finds the singular definition", () => {
  // "the study of reaction rates" is the example DATA_SOURCES.md gives for reaching kinetics, and the
  // definition it reaches says "rate". Before this, the two did not match.
  assert.deepEqual(queryWords("atoms"), ["atom"]);
  assert.deepEqual(queryWords("ions"), ["ion"]);
  assert.deepEqual(queryWords("rates"), ["rate"]);
});

test("a word that only looks plural is left alone", () => {
  for (const word of ["physics", "analysis", "gas", "mass", "basis", "statistics"]) {
    assert.deepEqual(queryWords(word), [word], `${word} was stemmed`);
  }
});

test("a query of nothing but punctuation matches nothing rather than everything", () => {
  assert.deepEqual(queryWords("  -- ,. "), []);
  assert.deepEqual(queryWords(""), []);
  assert.deepEqual(queryWords(undefined), []);
});

test("scoring keeps what matches, drops what does not, and orders by rank", () => {
  const items = [
    { name: "isotope", group: 1 },
    { name: "isobar", group: 2 },
    { name: "iron", group: 3 },
  ];
  const rank = (query, item) => (item.name === query ? 0 : item.name.startsWith(query) ? 1 : NO_MATCH);

  assert.deepEqual(rankedItems(items, "iso", rank).map(({ item }) => item.name), ["isotope", "isobar"]);
});

test("ties are settled by the tie-break given, so a filtered list keeps its own order", () => {
  const items = [
    { name: "beta", order: 2 },
    { name: "alpha", order: 1 },
  ];
  const rank = () => 1;

  assert.deepEqual(
    rankedItems(items, "x", rank, (one, other) => one.order - other.order).map(({ item }) => item.name),
    ["alpha", "beta"],
  );
});

test("an empty query matches nothing, because both callers decide that case for themselves", () => {
  assert.deepEqual(rankedItems([{ name: "a" }], "", () => 0), []);
});

test("NO_MATCH is the last rank, and a bare 5 would be a coupling nothing would notice breaking", () => {
  assert.equal(NO_MATCH, 5);
});
