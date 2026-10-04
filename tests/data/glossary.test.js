import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LEVELS,
  createGlossaryRepository,
  GLOSSARY_FILE,
} from "../../scripts/data/glossary-repository.js";

/**
 * A handful of terms standing in for the four hundred.
 *
 * The definitions are written here and belong to no glossary but this one. What is under test is
 * the arrangement — grouping, jumping, searching, looking up — which is the same for six terms as
 * for four hundred, and much easier to see when it goes wrong.
 */
const FIXTURE = [
  { term: "Kinetics", slug: "kinetics", level: "Expert", definition: "The study of how fast a reaction goes." },
  { term: "Acid", slug: "acid", level: "Beginner", definition: "A substance that gives up a proton." },
  { term: "Mole", slug: "mole", level: "Beginner", definition: "The amount of a substance holding Avogadro's number of particles." },
  { term: "Isotope", slug: "isotope", level: "Novice", definition: "One of two atoms of an element with different numbers of neutrons." },
  { term: "Zinc", slug: "zinc", level: "Novice", definition: "A metal that protects steel by corroding in its place." },
  { term: "Period", slug: "period", level: "Novice", definition: "A row of the periodic table." },
];

/** @param {unknown} body @returns {Promise<Response>} */
const serving = (body) =>
  Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));

const glossary = await createGlossaryRepository({ fetchImpl: () => serving(FIXTURE) });

test("the repository reads the file it says it owns", async () => {
  let requested = null;

  await createGlossaryRepository({
    fetchImpl: (url) => {
      requested = url;
      return serving(FIXTURE);
    },
  });

  assert.ok(requested.endsWith(GLOSSARY_FILE), `asked for ${requested}`);
});

test("every term is available, in reading order", () => {
  assert.equal(glossary.count(), FIXTURE.length);
  assert.deepEqual(
    glossary.all().map((entry) => entry.term),
    ["Acid", "Isotope", "Kinetics", "Mole", "Period", "Zinc"],
  );
});

test("a term resolves by its slug and a missing one returns null", () => {
  assert.equal(glossary.bySlug("mole").term, "Mole");
  assert.equal(glossary.bySlug("unobtainium"), null);
});

test("the index offers only the letters that have terms under them", () => {
  assert.deepEqual(glossary.letters(), ["A", "I", "K", "M", "P", "Z"]);
});

test("a letter returns its terms and an unused letter returns none", () => {
  assert.deepEqual(glossary.byLetter("a").map((entry) => entry.term), ["Acid"]);
  assert.deepEqual(glossary.byLetter("Q"), []);
  assert.deepEqual(glossary.byLetter("m").map((entry) => entry.term), ["Mole"]);
});

test("a search matches the term, and also the definition a reader half-remembers", () => {
  assert.deepEqual(glossary.search("mole").map((entry) => entry.term), ["Mole"]);
  assert.deepEqual(
    glossary.search("proton").map((entry) => entry.term),
    ["Acid"],
    "the word is only in the definition",
  );
  assert.deepEqual(glossary.search("NEUTRON").map((entry) => entry.term), ["Isotope"]);
});

test("an empty search returns everything rather than nothing", () => {
  assert.equal(glossary.search("").length, FIXTURE.length);
  assert.equal(glossary.search(null).length, FIXTURE.length);
});

test("the difficulty levels are counted and add up", () => {
  const counts = glossary.levelCounts();

  assert.deepEqual(Object.keys(counts), LEVELS);
  assert.deepEqual(counts, { Beginner: 2, Novice: 3, Expert: 1 });
  assert.equal(
    Object.values(counts).reduce((sum, count) => sum + count, 0),
    glossary.count(),
  );
});

test("every term carries the shape the page expects", () => {
  for (const entry of glossary.all()) {
    assert.equal(typeof entry.term, "string");
    assert.match(entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${entry.term} has an unsafe slug`);
    assert.ok(LEVELS.includes(entry.level), `${entry.term} has the level "${entry.level}"`);
    assert.ok(entry.definition.trim() !== "", `${entry.term} has no definition`);
  }
});

test("the data file must hold an array", async () => {
  await assert.rejects(
    () => createGlossaryRepository({ fetchImpl: () => serving({ terms: [] }) }),
    TypeError,
  );
});
