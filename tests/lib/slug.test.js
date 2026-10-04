import { test } from "node:test";
import assert from "node:assert/strict";

import { PREFERRED_NAMES, displayName, labelFromSlug, slugFor, slugify } from "../../scripts/lib/slug.js";

test("a name becomes a lowercase hyphenated slug", () => {
  assert.equal(slugify("Hydrogen"), "hydrogen");
  assert.equal(slugify("Melting Point"), "melting-point");
  assert.equal(slugify("  Orbital   Configuration  "), "orbital-configuration");
});

test("punctuation is dropped rather than turned into a separator", () => {
  assert.equal(slugify("Mohs' hardness"), "mohs-hardness");
  assert.equal(slugify("Mendeleev\u2019s table"), "mendeleevs-table");
  assert.equal(slugify("A/B testing"), "a-b-testing");
});

test("accents are folded rather than removed with the letter", () => {
  assert.equal(slugify("R\u00f6ntgen"), "rontgen");
});

test("an element name takes this project's spelling before it is slugged", () => {
  assert.equal(slugFor("Aluminum"), "aluminium");
  assert.equal(slugFor("Cesium"), "caesium");
  assert.equal(slugFor("Sulfur"), "sulphur");
  assert.equal(slugFor("Hydrogen"), "hydrogen");
});

test("a length of three", () => {
  // The list is short on purpose. If it grows, this test should be the thing that notices.
  assert.equal(PREFERRED_NAMES.size, 3);
});

test("displayName capitalises and applies the preferred spelling", () => {
  assert.equal(displayName("hydrogen"), "Hydrogen");
  assert.equal(displayName("aluminum"), "Aluminium");
  assert.equal(displayName("  sulfur "), "Sulphur");
});

test("a slug reads back as a label with only its first word capitalised", () => {
  // Case cannot be recovered, so the inverse is a label and not a round trip.
  assert.equal(labelFromSlug("melting-point"), "Melting point");
  assert.equal(labelFromSlug("noble-gases"), "Noble gases");
  assert.equal(labelFromSlug("hydrogen"), "Hydrogen");
});

test("an empty or missing value slugs to an empty string rather than to undefined", () => {
  assert.equal(slugify(""), "");
  assert.equal(slugify(null), "");
  assert.equal(slugify(undefined), "");
});
