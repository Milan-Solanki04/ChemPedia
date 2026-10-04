import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createCategoriesRepository } from "../../scripts/data/categories-repository.js";
import { createUnitsRepository } from "../../scripts/data/units-repository.js";
import { formatMeasurement } from "../../scripts/lib/format.js";

/** @param {string} url @returns {Promise<Response>} */
async function fromDisk(url) {
  const name = url.split("/").pop();
  const body = await readFile(new URL(`../../data/${name}`, import.meta.url), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

const categories = await createCategoriesRepository({ fetchImpl: fromDisk });
const units = await createUnitsRepository({ fetchImpl: fromDisk });

test("there are eleven categories, in the legend's order", () => {
  const all = categories.all();

  assert.equal(all.length, 11);
  assert.deepEqual(
    all.map((category) => category.slug),
    [
      "transition-metals",
      "actinides",
      "lanthanides",
      "post-transition-metals",
      "unknown",
      "noble-gases",
      "non-metals",
      "alkali-metals",
      "alkaline-earth-metals",
      "metalloids",
      "halogens",
    ],
  );
});

test("every category has a plural, and the awkward ones are spelled out rather than derived", () => {
  // The element page says "The other noble gases". A plural formed by adding an "s" to the singular
  // says "noble gass", and a singular left alone says "The other noble gas" — which is a heading with
  // one member in it. The taxonomy owns both forms rather than the page deriving one.
  for (const category of categories.all()) {
    assert.equal(typeof category.plural, "string", `${category.slug} has no plural`);
    assert.ok(category.plural.trim().length > 0, `${category.slug} has an empty plural`);
    assert.notEqual(category.plural, category.name, `${category.slug} repeats its singular`);
  }

  assert.equal(categories.bySlug("noble-gases").plural, "Noble gases");
  assert.equal(categories.bySlug("non-metals").plural, "Non-metals");
  assert.equal(categories.bySlug("alkaline-earth-metals").plural, "Alkaline earth metals");
  assert.equal(categories.bySlug("unknown").plural, "unknown elements");
  assert.equal(categories.bySlug("transition-metals").plural, "Transition metals");
});

test("every category names a token the token layer declares", async () => {
  const tokens = await readFile(new URL("../../styles/tokens.css", import.meta.url), "utf8");

  for (const category of categories.all()) {
    assert.ok(
      tokens.includes(`${category.token}:`),
      `${category.slug} names ${category.token}, which tokens.css does not declare`,
    );
  }
});

test("the counts add up to the periodic table", () => {
  assert.equal(categories.total(), 118);
});

test("a category that does not exist is null rather than a guess", () => {
  assert.equal(categories.bySlug("unobtainium"), null);
  assert.equal(categories.nameFor("unobtainium"), null);
  assert.equal(categories.nameFor("noble-gases"), "Noble gas");
});

test("every field the page formats has a unit definition", () => {
  for (const field of [
    "atomicWeight",
    "meltingPoint",
    "boilingPoint",
    "density",
    "electronegativity",
    "atomicRadius",
    "heatOfFusion",
    "specificHeat",
    "thermalConductivity",
    "electricalConductivity",
  ]) {
    assert.ok(units.definitionFor(field), `no definition for ${field}`);
  }
});

test("a field with no definition is null, not a dimensionless default", () => {
  assert.equal(units.definitionFor("notAField"), null);
});

test("a definition turns a stored value into what a reader sees", () => {
  assert.equal(
    formatMeasurement(1.008, units.definitionFor("atomicWeight")),
    "1.008\u00a0u",
  );
  assert.equal(
    formatMeasurement(-259.14, units.definitionFor("meltingPoint")),
    "-259.14\u00a0\u00b0C",
  );
  assert.equal(
    formatMeasurement(0.00008988, units.definitionFor("density")),
    "0.00008988\u00a0g/cm\u00b3",
  );
  assert.equal(formatMeasurement(null, units.definitionFor("meltingPoint")), "Unknown");
});
