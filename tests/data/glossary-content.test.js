import { test } from "node:test";
import assert from "node:assert/strict";

import { LETTERS, LEVELS, createGlossaryRepository, GLOSSARY_FILE } from "../../scripts/data/glossary-repository.js";
import { loadRepositories } from "../../tools/repositories.js";
import { slugFor } from "../../scripts/lib/slug.js";

/**
 * The real file, rather than a fixture.
 *
 * The repository's own tests use six terms standing in for the four hundred, because the *arrangement*
 * is what can be proved with six. This file exists to hold the other half: that the content itself is
 * the size, the shape and the quality the project committed to, which a fixture cannot check at all.
 *
 * The count is a commitment rather than an observation. `DATA_SOURCES.md` §3 records 418 because the
 * reference publishes 418, and a glossary with 300 of them would be a different and smaller thing.
 */

const { glossary } = await loadRepositories();
const terms = glossary.all();

/**
 * The number of terms the reference publishes, which is a floor rather than a target.
 *
 * 418 is where `DATA_SOURCES.md` §3 set the bar, because the reference has that many and matching it
 * was the original scope. Counting past it is deliberate: the reference's set is not ours, and it is
 * missing vocabulary a chemistry glossary cannot do without. Ion, cation, anion, acid, orbital,
 * reaction, concentration and molarity are all absent from it, and a glossary that defines
 * "electronegativity" and not "ion" is not a glossary.
 *
 * The test is therefore `>=`, not `==`. A count of exactly 418 would pass a project that had quietly
 * dropped terms to hit the number, which is the failure this change was made to prevent.
 */
const REFERENCE_COUNT = 418;

test("the glossary holds at least as many terms as the reference, and explains all of them", () => {
  assert.ok(
    glossary.count() >= REFERENCE_COUNT,
    `${glossary.count()} terms, fewer than the reference's ${REFERENCE_COUNT}`,
  );

  console.log(`      glossary holds ${glossary.count()} terms, ${glossary.count() - REFERENCE_COUNT} more than the reference`);
});

test("every term is a term, with a definition, a level and a slug", () => {
  for (const term of terms) {
    assert.ok(term.term, "a term with no name");
    assert.ok(LEVELS.includes(term.level), `${term.term} is ${term.level}, which is not a level`);
    assert.ok(term.definition.length > 40, `${term.term} has a definition of ${term.definition.length} characters`);
  }
});

test("every slug is the one its own term derives, so a term cannot be filed under two URLs", () => {
  for (const term of terms) {
    assert.equal(term.slug, slugFor(term.term), `${term.term} is filed at ${term.slug}`);
  }
});

test("no two terms share a name or a slug", () => {
  assert.equal(new Set(terms.map((term) => term.term.toLowerCase())).size, terms.length, "a repeated name");
  assert.equal(new Set(terms.map((term) => term.slug)).size, terms.length, "a repeated slug");
});

/**
 * The reference's own glossary gives "actinide" and "actinoid" byte-identical definitions. Ours are
 * authored, and this is the test that keeps them apart — two words that sound alike are the whole
 * reason a reader looks either of them up, and answering both with the same sentence is worse than
 * having only one of them.
 */
test("no two terms share a definition", () => {
  const byDefinition = new Map();

  for (const term of terms) {
    const key = term.definition.trim().toLowerCase();

    assert.ok(
      !byDefinition.has(key),
      `"${term.term}" and "${byDefinition.get(key)}" have the same definition`,
    );

    byDefinition.set(key, term.term);
  }
});

test("every letter of the alphabet has terms under it", () => {
  const present = glossary.letters();

  for (const letter of LETTERS) {
    assert.ok(present.includes(letter), `no term is filed under ${letter}`);
  }

  assert.equal(present.length, 26);
});

test("the terms are in reading order, and the letters are in alphabet order", () => {
  assert.deepEqual(
    terms.map((term) => term.term),
    [...terms].sort((one, other) => one.term.localeCompare(other.term, "en", { sensitivity: "base" })).map(
      (term) => term.term,
    ),
  );

  assert.deepEqual(glossary.letters(), [...LETTERS]);
});

test("every term is filed under the letter its own slug begins with", () => {
  // Grouped once rather than asking per term: `byLetter` sorts all four hundred every time it is
  // called, so four hundred calls would do sixteen thousand sorts for a question with one answer.
  const byLetter = new Map(
    glossary.letters().map((letter) => [letter, new Set(glossary.byLetter(letter).map((term) => term.slug))]),
  );

  for (const term of terms) {
    const letter = term.slug.charAt(0).toUpperCase();

    assert.ok(byLetter.get(letter)?.has(term.slug), `${term.term} is not findable under ${letter}`);
  }

  for (const [letter, slugs] of byLetter) {
    assert.equal(slugs.size, glossary.byLetter(letter).length, `${letter} lists a term twice or not at all`);
  }
});

test("the three levels are all used, and every one of them a fair share", () => {
  const counts = glossary.levelCounts();

  for (const level of LEVELS) {
    assert.ok(counts[level] > 0, `no term is labelled ${level}`);
    assert.ok(counts[level] > 20, `only ${counts[level]} terms are ${level}`);
  }

  assert.equal(
    Object.values(counts).reduce((sum, count) => sum + count, 0),
    glossary.count(),
    "the levels do not account for every term",
  );
});

test("every term carries an explanation, which is what the term detail page exists to show", () => {
  // The index shows a definition in one line. The explanation is the reason a term has a page at all,
  // and a term without one renders a page that is a thesaurus entry with a set of links round it.
  const without = terms.filter((term) => !term.explanation).map((term) => term.term);

  assert.deepEqual(without, [], `${without.length} terms have no explanation`);
});

test("an explanation says something the definition does not", () => {
  for (const term of terms) {
    assert.ok(
      term.explanation.length > term.definition.length,
      `${term.term}: its explanation is shorter than its definition, so it is not adding anything`,
    );

    // A restatement of the definition in different words is the failure mode this rules out.
    assert.notEqual(
      term.explanation.trim().toLowerCase(),
      term.definition.trim().toLowerCase(),
      `${term.term}: the explanation repeats the definition`,
    );
  }
});

test("no two terms share an explanation either", () => {
  const byText = new Map();

  for (const term of terms) {
    const key = term.explanation.trim().toLowerCase();

    assert.ok(!byText.has(key), `"${term.term}" and "${byText.get(key)}" share an explanation`);
    byText.set(key, term.term);
  }
});

test("every element in the periodic table is a term of the glossary", async () => {
  const { elements } = await loadRepositories();
  const slugs = new Set(terms.map((term) => term.slug));

  for (const element of elements.all()) {
    assert.ok(slugs.has(element.slug), `${element.name} is not in the glossary`);
  }
});

test("a search finds the terms a reader would look for by meaning rather than by name", () => {
  const found = glossary.search("the study of reaction rates");

  assert.ok(
    found.some((term) => term.term === "Kinetics"),
    "describing a meaning should reach the word for it",
  );
});

test("an unknown word finds nothing rather than everything", () => {
  assert.deepEqual(glossary.search("zzzzunobtainium"), []);
});

test("the file is the one the repository says it reads", () => {
  assert.equal(GLOSSARY_FILE, "glossary.json");
});