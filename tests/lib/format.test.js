import { test } from "node:test";
import assert from "node:assert/strict";

import {
  UNKNOWN,
  formatList,
  formatMeasurement,
  formatNumber,
  formatSignedInteger,
} from "../../scripts/lib/format.js";

test("a missing value is null, not a zero", () => {
  assert.equal(formatNumber(null), null);
  assert.equal(formatNumber(undefined), null);
  assert.equal(formatNumber(""), null);
  assert.equal(formatNumber("not a number"), null);
});

test("zero is a value and keeps its place", () => {
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(0, { decimals: 3 }), "0");
  assert.equal(formatNumber(-0.0001, { decimals: 2 }), "0");
});

test("significant figures suit a quantity that spans orders of magnitude", () => {
  // A density runs from 0.00008988 to 22.59. A fixed number of decimals renders the first as zero.
  assert.equal(formatNumber(0.00008988, { significant: 4 }), "0.00008988");
  assert.equal(formatNumber(22.59, { significant: 4 }), "22.59");
  assert.equal(formatNumber(1.008, { significant: 5 }), "1.008");
  assert.equal(formatNumber(4.0026, { significant: 5 }), "4.0026");
});

test("decimals suit a value measured to a chosen precision", () => {
  assert.equal(formatNumber(-259.34, { decimals: 2 }), "-259.34");
  assert.equal(formatNumber(1337.33, { decimals: 2 }), "1337.33");
  assert.equal(formatNumber(3823, { decimals: 2 }), "3823");
});

test("trailing zeros are dropped, so a value does not claim precision nobody measured", () => {
  assert.equal(formatNumber(4.0, { decimals: 2 }), "4");
  assert.equal(formatNumber(0.5, { decimals: 3 }), "0.5");
});

test("a measurement carries its unit and a missing one is a word", () => {
  assert.equal(formatMeasurement(-259.34, { unit: "\u00b0C", decimals: 2 }), "-259.34\u00a0\u00b0C");
  assert.equal(formatMeasurement(null, { unit: "\u00b0C", decimals: 2 }), UNKNOWN);
  assert.equal(formatMeasurement(null, {}), UNKNOWN);
});

test("a quantity with no unit is printed without a trailing space", () => {
  assert.equal(formatMeasurement(2.2, { decimals: 2 }), "2.2");
  assert.equal(formatMeasurement(2.2, { unit: null, decimals: 2 }), "2.2");
});

test("the word for unknown is the same one everywhere", () => {
  assert.equal(UNKNOWN, "Unknown");
});

test("a signed integer carries its sign, and zero carries none", () => {
  assert.equal(formatSignedInteger(3), "+3");
  assert.equal(formatSignedInteger(-1), "-1");
  assert.equal(formatSignedInteger(0), "0");
  assert.equal(formatSignedInteger(null), UNKNOWN);
});

test("a list is joined, and an empty one is a word rather than an empty string", () => {
  assert.equal(formatList([-1, 1], formatSignedInteger), "-1, +1");
  assert.equal(formatList([]), UNKNOWN);
  assert.equal(formatList(null), UNKNOWN);
});

test("negative temperatures keep their sign and their degree symbol", () => {
  const text = formatMeasurement(-273.15, { unit: "\u00b0C", decimals: 2 });

  assert.ok(text.startsWith("-"), text);
  assert.ok(text.includes("\u00b0"), text);
});
