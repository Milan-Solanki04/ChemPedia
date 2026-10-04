import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { createCategoriesRepository } from "../../scripts/data/categories-repository.js";

/**
 * A stand-in for the browser's fetch that reads the real file from disk.
 *
 * The repository under test is the one the browser runs; only its input is substituted, so what
 * these tests exercise is the shipped code path and the shipped data, without a network.
 *
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function fromDisk(url) {
  const name = url.split("/").pop();
  const body = await readFile(new URL(`../../data/${name}`, import.meta.url), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

const elements = await createElementsRepository({ fetchImpl: fromDisk });
const categories = await createCategoriesRepository({ fetchImpl: fromDisk });
const raw = await readFile(new URL("../../data/elements.json", import.meta.url), "utf8");

test("the dataset holds every element", () => {
  assert.equal(elements.count(), 118);
});

test("every element resolves by atomic number, symbol and slug", () => {
  for (const element of elements.all()) {
    assert.equal(elements.byNumber(element.atomicNumber), element);
    assert.equal(elements.bySymbol(element.symbol), element);
    assert.equal(elements.bySlug(element.slug), element);
  }
});

test("a lookup that finds nothing returns null rather than throwing", () => {
  assert.equal(elements.byNumber(0), null);
  assert.equal(elements.byNumber(119), null);
  assert.equal(elements.bySymbol("Xx"), null);
  assert.equal(elements.bySlug("unobtainium"), null);
});

test("atomic numbers run from 1 to 118 without a gap or a repeat", () => {
  assert.deepEqual(
    elements.all().map((element) => element.atomicNumber),
    Array.from({ length: 118 }, (_, index) => index + 1),
  );
});

test("symbols and slugs are unique and URL-safe", () => {
  const symbols = new Set();
  const slugs = new Set();

  for (const element of elements.all()) {
    assert.ok(!symbols.has(element.symbol), `${element.symbol} appears twice`);
    assert.ok(!slugs.has(element.slug), `${element.slug} appears twice`);
    assert.match(element.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${element.slug} is not a safe slug`);

    symbols.add(element.symbol);
    slugs.add(element.slug);
  }
});

test("the category counts are the ones the legend asserts", () => {
  const declared = categories.counts();

  for (const [slug, count] of Object.entries(declared)) {
    assert.equal(elements.withCategory(slug).length, count, `${slug} has the wrong number of members`);
  }

  assert.equal(
    Object.values(declared).reduce((sum, count) => sum + count, 0),
    elements.count(),
  );
});

test("every element is in a category the legend declares", () => {
  for (const element of elements.all()) {
    assert.ok(categories.bySlug(element.category), `${element.symbol} is in "${element.category}"`);
  }
});

test("the shell populations account for every electron", () => {
  for (const element of elements.all()) {
    const total = element.shells.reduce((sum, count) => sum + count, 0);

    assert.equal(total, element.atomicNumber, `${element.symbol}: ${total} electrons`);
  }
});

test("no two elements are drawn in the same cell", () => {
  const cells = new Set();

  for (const element of elements.all()) {
    const cell = `${element.position.row}:${element.position.column}`;

    assert.ok(!cells.has(cell), `${element.symbol} shares cell ${cell}`);
    cells.add(cell);
  }
});

test("a block query returns the elements filed under it", () => {
  assert.equal(elements.withBlock("f").length, 30, "fifteen lanthanides and fifteen actinides");
  assert.equal(elements.withBlock("s").length, 14);
});

test("a ranking puts the unknowns last in both directions", () => {
  const ascending = elements.sortedBy("meltingPoint");
  const descending = elements.sortedBy("meltingPoint", { direction: "descending" });

  const known = (element) => element.meltingPoint !== null;
  const ascendingCut = ascending.findIndex((element) => !known(element));
  const descendingCut = descending.findIndex((element) => !known(element));

  assert.ok(
    ascending.slice(0, ascendingCut).every(known) && ascending.slice(ascendingCut).every((e) => !known(e)),
    "the ascending ranking is not sorted with its unknowns last",
  );
  assert.ok(
    descending.slice(0, descendingCut).every(known) && descending.slice(descendingCut).every((e) => !known(e)),
    "the descending ranking is not sorted with its unknowns last",
  );
  assert.ok(ascending[0].meltingPoint <= ascending[ascendingCut - 1].meltingPoint);
  assert.ok(descending[0].meltingPoint >= descending[descendingCut - 1].meltingPoint);
});

test("six elements are what an authoritative table says they are", () => {
  const hydrogen = elements.bySymbol("H");

  assert.equal(hydrogen.name, "Hydrogen");
  assert.equal(hydrogen.slug, "hydrogen");
  assert.equal(hydrogen.category, "non-metals");
  assert.equal(hydrogen.period, 1);
  assert.equal(hydrogen.group, 1);
  assert.deepEqual(hydrogen.shells, [1]);
  assert.equal(hydrogen.electronConfiguration, "1s1");
  assert.ok(Math.abs(hydrogen.meltingPoint - -259.14) < 0.5, `${hydrogen.meltingPoint} °C`);

  const helium = elements.bySymbol("He");

  assert.equal(helium.group, 18);
  assert.equal(helium.block, "s");

  const iron = elements.bySymbol("Fe");

  assert.equal(iron.atomicWeight, 55.84);
  assert.deepEqual(iron.shells, [2, 8, 14, 2]);
  assert.equal(iron.group, 8);
  assert.equal(iron.period, 4);
  assert.equal(iron.block, "d");

  const gold = elements.bySymbol("Au");

  assert.equal(gold.category, "transition-metals");
  assert.deepEqual(gold.shells, [2, 8, 18, 32, 18, 1]);
  assert.ok(Math.abs(gold.density - 19.282) < 0.01);

  const uranium = elements.bySymbol("U");

  assert.equal(uranium.category, "actinides");
  assert.equal(uranium.group, null);
  assert.deepEqual(uranium.position, { row: 10, column: 6 });
  assert.deepEqual(uranium.shells, [2, 8, 18, 32, 21, 9, 2]);

  const oganesson = elements.bySymbol("Og");

  assert.equal(oganesson.atomicNumber, 118);
  assert.equal(oganesson.slug, "oganesson");
  assert.equal(oganesson.period, 7);
  assert.equal(oganesson.group, 18);
  assert.deepEqual(oganesson.shells, [2, 8, 18, 32, 32, 18, 8]);
});

test("every element carries the prose its page needs", () => {
  const written = (text, what) =>
    assert.ok(typeof text === "string" && text.trim() !== "", `${what} is missing`);

  for (const element of elements.all()) {
    // A pronunciation and a name origin are phrases, so they only have to be there.
    written(element.pronunciation, `${element.symbol}: pronunciation`);
    written(element.discovery.nameOrigin, `${element.symbol}: name origin`);

    for (const [field, minimum] of [
      ["summary", 30],
      ["uses", 30],
      ["sources", 20],
    ]) {
      written(element[field], `${element.symbol}: ${field}`);
      assert.ok(
        element[field].trim().length >= minimum,
        `${element.symbol}: the ${field} is too short to say anything`,
      );
    }
  }
});

test("no two elements lean on the same sentence", () => {
  // A sentence repeated across records is the signature of a template rather than of writing. It
  // is checked on the two paragraphs a reader reads in sequence, not on the sources line, where
  // similar elements legitimately come from similar places.
  for (const field of ["summary", "uses"]) {
    const seen = new Map();

    for (const element of elements.all()) {
      const text = element[field].trim().toLowerCase();

      assert.ok(!seen.has(text), `${element.symbol} and ${seen.get(text)} share a ${field}`);
      seen.set(text, element.symbol);
    }
  }
});

test("the American spellings are gone", () => {
  assert.equal(elements.bySymbol("Al").name, "Aluminium");
  assert.equal(elements.bySymbol("Al").slug, "aluminium");
  assert.equal(elements.bySymbol("Cs").name, "Caesium");
  assert.equal(elements.bySymbol("S").name, "Sulphur");
});

test("no value anywhere is undefined, and none is a borrowed placeholder", () => {
  const walk = (value, path) => {
    assert.notEqual(value, undefined, `${path} is undefined`);

    if (typeof value === "string") {
      assert.notEqual(value.trim(), "", `${path} is an empty string`);
      assert.doesNotMatch(value, /not measured/i, `${path} carries a presentation placeholder`);
    }

    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        walk(child, `${path}.${key}`);
      }
    }
  };

  walk(JSON.parse(raw), "elements.json");
});

test("the raw file does not carry the reference's prose or brand", () => {
  assert.doesNotMatch(raw, /breaking[ _-]?atom/i);
});

/* ---------------------------------------------------------------------------
   The recorded departures from the dataset.
   --------------------------------------------------------------------------- */

const overrides = JSON.parse(
  await readFile(new URL("../../data/overrides.json", import.meta.url), "utf8"),
);

test("every correction of the dataset carries a reason", () => {
  // A correction without a reason is indistinguishable from a mistake, and `overrides.json` exists so
  // that the two can be told apart. This is the test that keeps it worth having.
  const entries = [
    ...overrides.categories.map((entry) => ["category", entry]),
    ...overrides.atomicWeights.map((entry) => ["atomicWeight", entry]),
  ];

  assert.ok(entries.length > 0, "there is at least one recorded departure");

  for (const [kind, entry] of entries) {
    assert.ok(entry.atomicNumber >= 1 && entry.atomicNumber <= 118, `${kind}: atomic number`);
    assert.ok(
      typeof entry.reason === "string" && entry.reason.length > 40,
      `${entry.symbol}: a ${kind} correction must say why, in a sentence`,
    );
    assert.ok(
      elements.byNumber(entry.atomicNumber),
      `${entry.symbol}: the correction names an element that does not exist`,
    );
    assert.equal(
      elements.byNumber(entry.atomicNumber).symbol,
      entry.symbol,
      `${entry.symbol}: the correction points at the wrong element`,
    );
  }
});

test("no element's atomic weight is a whole number, because none of them is one", () => {
  // This is the invariant the atomic-weight corrections exist to hold. A standard atomic weight is
  // always a mean of several isotopes, so it always has decimals: the two elements that arrived as
  // integers were carrying their mass numbers instead, and one of them read "7" on a card.
  for (const element of elements.all()) {
    assert.ok(
      !Number.isInteger(element.atomicWeight),
      `${element.symbol} has a whole-number atomic weight (${element.atomicWeight})`,
    );
  }
});

test("the atomic weight on every record is the one the corrections record", () => {
  // Guards against a rebuild of the data quietly reverting a correction: the source is refetched
  // from the network, and the recorded departures are the only thing that survives the refetch.
  for (const { atomicNumber, symbol, atomicWeight } of overrides.atomicWeights) {
    const element = elements.byNumber(atomicNumber);

    assert.equal(element.symbol, symbol);
    assert.equal(element.atomicWeight, atomicWeight, `${symbol} lost its recorded atomic weight`);
  }
});

test("the corrected weights are the conventional ones", () => {
  // Spelled out rather than derived, so a wrong number in the file cannot agree with itself.
  assert.equal(elements.bySymbol("Li").atomicWeight, 6.94);
  assert.equal(elements.bySymbol("Pb").atomicWeight, 207.2);
});
