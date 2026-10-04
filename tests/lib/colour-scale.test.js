import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ON_FILL_DARK, ON_FILL_LIGHT, contrastRatio, meetsAA } from "../../scripts/lib/contrast.js";
import { domainOf, numericScale } from "../../scripts/lib/colour-scale.js";

const tokens = await readFile(new URL("../../styles/tokens.css", import.meta.url), "utf8");

/** Every fill the token layer declares, read from the stylesheet rather than restated here. */
function fills(prefix) {
  const found = new Map();

  for (const [, name, value] of tokens.matchAll(new RegExp(`--(${prefix}[a-z0-9-]+):\\s*(#[0-9a-fA-F]{3,6})\\s*;`, "g"))) {
    found.set(name, value);
  }

  return found;
}

const ramp = [...fills("ramp-")].sort(([a], [b]) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
const unknown = fills("value-").get("value-unknown");

const elements = [
  { symbol: "Fr", electronegativity: 0.7 },
  { symbol: "Li", electronegativity: 0.98 },
  { symbol: "C", electronegativity: 2.55 },
  { symbol: "F", electronegativity: 3.98 },
  { symbol: "He", electronegativity: null },
];

const scale = numericScale({ domain: domainOf(elements, "electronegativity"), ramp: ramp.map(([, value]) => value), unknown });

test("the token layer declares a six-step ramp and one neutral unknown fill", () => {
  assert.equal(ramp.length, 6);
  assert.ok(unknown, "tokens.css does not declare --value-unknown");
  assert.equal(scale.steps, 6);
});

test("the ramp runs from pale to dark, which is the order a scale is read in", () => {
  const values = ramp.map(([, value]) => value);

  for (let index = 1; index < values.length; index += 1) {
    assert.ok(
      contrastRatio(values[index], "#000000") < contrastRatio(values[index - 1], "#000000"),
      `${values[index]} is lighter than the step before it`,
    );
  }
});

test("a domain is the measured range of the field, with the counts a legend needs", () => {
  assert.deepEqual(domainOf(elements, "electronegativity"), {
    min: 0.7,
    max: 3.98,
    known: 4,
    unknown: 1,
  });
});

test("a field nothing carries a value for has no domain", () => {
  assert.equal(domainOf([{ meltingPoint: null }], "meltingPoint"), null);
  assert.equal(domainOf([], "meltingPoint"), null);
});

test("both ends of the domain land in the end bins, exactly", () => {
  assert.equal(scale.step(0.7), 0);
  assert.equal(scale.step(3.98), scale.steps - 1);
});

test("a value in the middle of the domain lands in the middle of the ramp", () => {
  // Six bins over 0.7 to 3.98 put the boundaries at 0.7, 1.2467, 1.7933, 2.34, 2.8867, 3.4333 and
  // 3.98, so a test has to stand clear of one to mean anything.
  assert.equal(scale.step(2.3), 2);
  assert.equal(scale.step(2.35), 3);
  assert.equal(scale.step(2.87), 3);
  assert.equal(scale.step(2.9), 4);
});

test("every value a reader could see falls inside the range its own bin prints", () => {
  // The bin boundaries are what the legend shows, so a value coloured by one bin and printed under
  // another would be a legend contradicting the table. Sweeping the whole domain in thousandths is
  // enough to catch a boundary that has drifted.
  const bins = scale.bins();

  for (let value = 0.7; value <= 3.98; value += 0.001) {
    const bin = bins[scale.step(value)];

    assert.ok(
      value >= bin.from - 1e-9 && value <= bin.to + 1e-9,
      `${value.toFixed(3)} is coloured by the bin printed as ${bin.from}–${bin.to}`,
    );
  }
});

test("values increase monotonically through the ramp", () => {
  let previous = -1;

  for (let value = 0.7; value <= 3.98; value += 0.01) {
    const index = scale.step(value);

    assert.ok(index >= previous, `the step went backwards at ${value}`);
    previous = index;
  }
});

test("a value outside the domain is clamped into the end bin rather than invented a colour for", () => {
  assert.equal(scale.step(-40), 0);
  assert.equal(scale.step(0), 0);
  assert.equal(scale.step(4.2), scale.steps - 1);
  assert.equal(scale.step(Number.POSITIVE_INFINITY), null);
  assert.equal(scale.colour(-40).fill, ramp[0][1]);
  assert.equal(scale.colour(4.2).fill, ramp.at(-1)[1]);
});

test("an unknown value takes the neutral fill and is never shaded as the smallest value", () => {
  assert.equal(scale.step(null), null);
  assert.equal(scale.step(undefined), null);
  assert.equal(scale.step("2.0"), null);
  assert.equal(scale.colour(null).fill, unknown);
  assert.notEqual(scale.colour(null).fill, ramp[0][1]);
});

test("a zero is a measurement and lands in the first bin", () => {
  assert.equal(scale.step(0), 0);
  assert.notEqual(scale.colour(0).fill, unknown);
});

test("every step of the ramp takes a foreground that passes AA for text", () => {
  for (const bin of scale.bins()) {
    const ratio = contrastRatio(bin.fill, bin.onFill);

    assert.ok(meetsAA(ratio), `${bin.fill} with ${bin.onFill} is ${ratio.toFixed(2)}:1`);
  }
});

test("the neutral unknown fill also takes a readable foreground", () => {
  const { onFill } = scale.colour(null);

  assert.equal(onFill, ON_FILL_DARK);
  assert.ok(meetsAA(contrastRatio(unknown, onFill)));
});

test("the bins describe the range each step stands for, and cover the domain without a gap", () => {
  const bins = scale.bins();

  assert.equal(bins.length, 6);
  assert.equal(bins[0].from, 0.7);
  assert.equal(bins.at(-1).to, 3.98);

  for (let index = 1; index < bins.length; index += 1) {
    assert.equal(bins[index].from, bins[index - 1].to, `bin ${index} starts where the last one stopped`);
  }
});

test("a scale with nothing to shade places nothing, and says so", () => {
  const empty = numericScale({ domain: null, ramp: ramp.map(([, value]) => value), unknown });

  assert.equal(empty.step(1), null);
  assert.equal(empty.colour(1).fill, unknown);
  assert.deepEqual(empty.bins(), []);
});

test("a domain where every value is the same has one bin, not a division by zero", () => {
  const flat = numericScale({
    domain: domainOf([{ mass: 4.0 }, { mass: 4.0 }], "mass"),
    ramp: ramp.map(([, value]) => value),
    unknown,
  });

  assert.equal(flat.step(4), 0);
  assert.equal(flat.colour(4).fill, ramp[0][1]);
  assert.equal(flat.bins().length, 6);
  assert.equal(flat.bins()[0].from, 4);
});

test("a scale with no steps is refused rather than silently answering nothing", () => {
  assert.throws(() => numericScale({ domain: null, ramp: [], unknown }), TypeError);
  assert.throws(() => numericScale({ domain: null, ramp: null, unknown }), TypeError);
});

test("the foreground a step takes is derived, not written down", () => {
  // The palest steps are dark ink on a pale fill; the darkest is cream on a deep one. Nothing in the
  // scale module knows which is which.
  assert.equal(scale.colour(0.7).onFill, ON_FILL_DARK);
  assert.equal(scale.colour(3.98).onFill, ON_FILL_LIGHT);
});

/** @param {number} value @returns {number} rounded to two places, for readable assertions */
function midpoint(value) {
  return Number(value.toFixed(2));
}