import { test } from "node:test";
import assert from "node:assert/strict";

import { COLOUR_MODES, UNKNOWN_KEY, createColourMode } from "../../scripts/lib/colour-modes.js";

const paint = (key) => ({ fill: `#${key}`.padEnd(7, "0"), onFill: "#12211f" });

const labels = { alpha: "Alpha", beta: "Beta", gamma: "Gamma" };

const elements = [
  { category: "alpha", block: "s", state: "gas", reading: 0.7 },
  { category: "alpha", block: "s", state: "gas", reading: 1.0 },
  { category: "beta", block: "p", state: "solid", reading: 2.0 },
  { category: "gamma", block: "p", state: "solid", reading: null },
];

const scale = {
  steps: 3,
  step: (value) => (value === null ? null : Math.min(2, Math.floor(value * 1.5))),
  bins: () => [
    { from: 0, to: 0.667, fill: "#111111", onFill: "#12211f" },
    { from: 0.667, to: 1.333, fill: "#222222", onFill: "#12211f" },
    { from: 1.333, to: 2, fill: "#333333", onFill: "#fdfbfa" },
  ],
};

test("there are four modes, and they are the ones the table views ask for", () => {
  assert.deepEqual(COLOUR_MODES, ["group", "block", "state", "value"]);
});

test("a mode that does not exist is refused", () => {
  assert.throws(() => createColourMode({ mode: "temperature", paint }), TypeError);
});

test("a mode with nothing to paint it with is refused rather than rendering no colour", () => {
  assert.throws(() => createColourMode({ mode: "group" }), TypeError);
  assert.throws(() => createColourMode({ mode: "group", paint: null }), TypeError);
});

test("a group mode keys an element by its category, in the taxonomy's own order", () => {
  const mode = createColourMode({ mode: "group", paint, labels });

  assert.equal(mode.keyFor(elements[0]), "alpha");
  assert.deepEqual(
    mode.keys(elements).map(({ key, label }) => [key, label]),
    [
      ["alpha", "Alpha"],
      ["beta", "Beta"],
      ["gamma", "Gamma"],
    ],
  );
});

test("a group mode counts what the data holds, not what the taxonomy asserts", () => {
  // Reading the asserted count would make the legend incapable of disagreeing with the table, and a
  // legend that cannot disagree is a legend that cannot be checked.
  const mode = createColourMode({ mode: "group", paint, labels });

  assert.deepEqual(
    mode.keys(elements).map((key) => key.count),
    [2, 1, 1],
  );
});

test("a category with no members is still printed, because the taxonomy is a fact about the table", () => {
  const mode = createColourMode({ mode: "group", paint, labels: { ...labels, delta: "Delta" } });
  const delta = mode.keys(elements).find((key) => key.key === "delta");

  assert.deepEqual([delta.label, delta.count], ["Delta", 0]);
});

test("a block mode names the four blocks in the order the table's rows run", () => {
  const mode = createColourMode({ mode: "block", paint });

  assert.deepEqual(
    mode.keys(elements).map(({ key, label, count }) => [key, label, count]),
    [
      ["s", "s-block", 2],
      ["p", "p-block", 2],
      ["d", "d-block", 0],
      ["f", "f-block", 0],
    ],
  );
});

test("a state mode names the three states in the order a reader meets them", () => {
  const mode = createColourMode({ mode: "state", paint });

  assert.deepEqual(
    mode.keys(elements).map(({ key, label }) => [key, label]),
    [
      ["solid", "Solid"],
      ["liquid", "Liquid"],
      ["gas", "Gas"],
    ],
  );
});

test("an element with no recorded state gets the unknown key rather than an empty one", () => {
  const mode = createColourMode({ mode: "state", paint });

  assert.equal(mode.keyFor({ category: "alpha", block: "s", state: null }), UNKNOWN_KEY);
});

test("a value mode keys an element by the bin its value falls in", () => {
  const mode = createColourMode({ mode: "value", paint, scale, field: "reading" });

  assert.equal(mode.field, "reading");
  assert.equal(mode.keyFor(elements[0]), "1", "0.7 falls in the second of three bins");
  assert.equal(mode.keyFor(elements[1]), "1");
  assert.equal(mode.keyFor(elements[2]), "2");
  assert.equal(mode.keyFor(elements[3]), UNKNOWN_KEY);
});

test("a value mode prints each bin with the range it stands for", () => {
  const mode = createColourMode({ mode: "value", paint, scale, field: "reading" });

  assert.deepEqual(
    mode.keys(elements).map(({ key, label }) => [key, label]),
    [
      ["0", "0 – 0.67"],
      ["1", "0.67 – 1.33"],
      ["2", "1.33 – 2"],
      [UNKNOWN_KEY, "Not measured"],
    ],
  );
});

test("a value mode prints the unknown entry only when something is unknown", () => {
  const mode = createColourMode({ mode: "value", paint, scale, field: "reading" });
  const measured = elements.filter((element) => element.reading !== null);
  const printed = mode.keys(measured).map((key) => key.key);

  assert.deepEqual(printed, ["0", "1", "2"]);
  assert.equal(printed.includes(UNKNOWN_KEY), false, "a legend chip for a question nobody asked");
});

test("the counts of a value mode add up to the elements, unknowns included", () => {
  const mode = createColourMode({ mode: "value", paint, scale, field: "reading" });

  assert.equal(
    mode.keys(elements).reduce((sum, key) => sum + key.count, 0),
    elements.length,
  );
});

test("a painted element carries its colour and the key it was painted by, together", () => {
  const mode = createColourMode({ mode: "group", paint, labels });
  const painted = mode.paint(elements[0]);

  assert.deepEqual(Object.keys(painted).sort(), ["fill", "key", "onFill"]);
  assert.equal(painted.key, "alpha");
});

test("a mode that is not a value mode has no field, because it is not shading a measurement", () => {
  assert.equal(createColourMode({ mode: "group", paint, labels }).field, null);
  assert.equal(createColourMode({ mode: "state", paint }).field, null);
});