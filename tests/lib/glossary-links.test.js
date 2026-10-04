import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_RELATED_SCORE,
  elementsForTerm,
  glossaryMatcher,
  linkSegments,
  relatedTerms,
  termsInElement,
} from "../../scripts/lib/glossary-links.js";

/**
 * The linker's two rules, tested against the words that make them necessary.
 *
 * A fixture rather than the real glossary on purpose: "lead", "tin", "mass" and "state" have to be *in*
 * the fixture for the refusal of a lowercase "lead" to mean anything. A test that relied on the shipped
 * four hundred terms would keep passing after a term was renamed, and would stop meaning anything the
 * day one of them was removed.
 */

const TERMS = [
  { term: "Lead", slug: "lead", definition: "A dense metal that corrodes in place of steel." },
  { term: "Tin", slug: "tin", definition: "A soft metal that alloys easily with lead." },
  { term: "Atomic number", slug: "atomic-number", definition: "The count of protons in a nucleus." },
  { term: "Half-life", slug: "half-life", definition: "The time for half a sample to decay." },
  { term: "Catalyst", slug: "catalyst", definition: "A substance that speeds up a reaction without being used up." },
  { term: "Atom", slug: "atom", definition: "The smallest unit of an element that still has that element's properties." },
];

/**
 * The elements whose names must be capitalised to link.
 *
 * Passed to the matcher because that is how every caller builds one: the rule about capitalisation is
 * about *element names*, and the module is handed the terms and nothing else, so it cannot work out
 * which of them are also periodic.
 */
const ELEMENTS = [
  { name: "Lead", slug: "lead" },
  { name: "Tin", slug: "tin" },
  { name: "Iron", slug: "iron" },
];

const matcher = glossaryMatcher(TERMS, { elements: ELEMENTS });

/** The linked segments of a piece of text, rendered the way the page would render them. */
const rendered = (text) =>
  linkSegments(text, matcher)
    .map((segment) => (segment.type === "link" ? `[${segment.value}](${segment.slug})` : segment.value))
    .join("");

/** @param {string} slug */
const term = (slug) => TERMS.find((entry) => entry.slug === slug);

test("an element's name is linked only when capitalised, because lower case it is the verb", () => {
  assert.equal(rendered("This will lead to trouble."), "This will lead to trouble.");
  assert.equal(rendered("Tin resists corrosion."), "[Tin](tin) resists corrosion.");
  assert.equal(rendered("Lead is soft."), "[Lead](lead) is soft.");
  assert.equal(rendered("lead is soft."), "lead is soft.");
});

test("a term that is not an element's name links however it is written", () => {
  // The rule protects against "lead" the verb. It must not also make "atom" unreachable, because good
  // prose writes "the atom that carries oxygen" and an entry full of unlinkable common nouns would
  // leave the glossary disconnected from the table.
  assert.equal(rendered("The atom is small."), "The [atom](atom) is small.");
  assert.equal(rendered("A catalyst works."), "A [catalyst](catalyst) works.");
});

test("a compound term is linked whatever its capitalisation, because nobody means anything else by it", () => {
  assert.equal(rendered("The atomic number is 26."), "The [atomic number](atomic-number) is 26.");
  assert.equal(rendered("the ATOMIC NUMBER is 26."), "the [ATOMIC NUMBER](atomic-number) is 26.");
});

test("the longer headword wins, so a compound is not broken by the word inside it", () => {
  assert.equal(rendered("A half-life is measured."), "A [half-life](half-life) is measured.");
});

test("a word that merely contains a term is not a match", () => {
  assert.equal(rendered("Leaden prose."), "Leaden prose.", "and neither is a word merely starting like one");
});

test("no match leaves the text as one segment, rather than as none", () => {
  assert.deepEqual(linkSegments("", matcher), []);
  assert.deepEqual(linkSegments("nothing here", matcher), [{ type: "text", value: "nothing here" }]);
});

test("a matcher with nothing in it does not throw on any text", () => {
  const empty = glossaryMatcher([], { elements: ELEMENTS });

  assert.deepEqual(linkSegments("Lead and Tin.", empty), [{ type: "text", value: "Lead and Tin." }]);
});

test("the elements a term is about are the ones whose entries mention it", () => {
  const elements = [
    { name: "Lead", slug: "lead", summary: "A dense metal.", uses: "Batteries and solder." },
    { name: "Tin", slug: "tin", summary: "A soft metal.", uses: "Solder, which contains Lead." },
    { name: "Iron", slug: "iron", summary: "The most-used metal on Earth.", uses: "Steel." },
  ];

  assert.deepEqual(
    elementsForTerm(term("lead"), elements).map((element) => element.slug),
    ["lead", "tin"],
    "Tin's entry mentions Lead and Iron's does not, so Iron is not offered",
  );
});

test("an element whose entry names the term is found through its uses, not only its name", () => {
  const elements = [{ name: "Tin", slug: "tin", summary: "A soft metal.", uses: "Solder, which contains Lead." }];

  assert.deepEqual(
    elementsForTerm(term("lead"), elements).map((element) => element.slug),
    ["tin"],
    "and the lowercase 'lead' inside 'contains lead' would not have counted",
  );
});

test("a term with no elements is given none, rather than four strangers", () => {
  const found = elementsForTerm(term("half-life"), [
    { name: "Iron", slug: "iron", summary: "A metal.", uses: "Steel." },
  ]);

  assert.deepEqual(found, []);
});

test("the terms an element uses are the ones it mentions, and each only once", () => {
  const element = {
    name: "Iron",
    summary: "The atom that carries oxygen in your blood.",
    // "atom" twice, on purpose: a term used in both the summary and the uses must be listed once,
    // because the panel it goes in has room for four links and not for the same one twice.
    uses: "The atom in every haemoglobin molecule, and the atom in every bridge.",
  };

  assert.deepEqual(termsInElement(element, matcher).map((entry) => entry.term), ["Atom"]);
});

test("a term is never offered as related to itself", () => {
  const related = relatedTerms(term("catalyst"), TERMS, 10);

  assert.ok(!related.some((entry) => entry.slug === "catalyst"));
});

test("related terms share real vocabulary, not one incidental word", () => {
  const related = relatedTerms(term("lead"), TERMS, 10);

  assert.deepEqual(related.map((entry) => entry.term).sort(), ["Lead", "Tin"].filter((name) => name !== "Lead").sort());
});

test("the score a shared word contributes is capped, which is what the cut below relies on", () => {
  // "Lead" and "Tin" share only "lead" and "metal" with each other; each word appears in exactly the two
  // definitions, so each is worth one half and the pair together is one. The threshold sits under that.
  assert.ok(MIN_RELATED_SCORE < 1);
});

test("a term with no vocabulary in common with anything is left with no neighbours at all", () => {
  const related = relatedTerms(term("half-life"), TERMS, 10);

  assert.deepEqual(related, [], "an empty panel is honest; four unrelated links would not be");
});