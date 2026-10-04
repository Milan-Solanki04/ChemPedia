import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DECIMALS,
  REFERENCE_POINTS,
  SCALES,
  convert,
  formatReading,
  formatTemperature,
  isBelowAbsoluteZero,
  parseTemperature,
  readingFor,
  readingsOf,
  scaleFor,
} from "../../scripts/lib/temperature.js";

/**
 * The reference points, which is the whole of the plan's first exit criterion.
 *
 * These are the values a textbook prints, not values this code produced. A converter that agrees with
 * itself and disagrees with these is worse than no converter, which is why they are written out here
 * rather than derived from the functions under test.
 */
const AUTHORITATIVE = [
  { celsius: 0, fahrenheit: 32, kelvin: 273.15 },
  { celsius: -40, fahrenheit: -40, kelvin: 233.15 },
  { celsius: 100, fahrenheit: 212, kelvin: 373.15 },
  { celsius: 37, fahrenheit: 98.6, kelvin: 310.15 },
  { celsius: -273.15, fahrenheit: -459.67, kelvin: 0 },
];

test("every authoritative reference point reads as the value a textbook prints", () => {
  // Compared as a *reading*, not as raw arithmetic. `convert(37, "celsius", "fahrenheit")` is
  // 98.60000000000001 in IEEE arithmetic; a reader sees 98.6 and a test that demanded bit equality
  // would be testing the float format rather than the conversion.
  for (const point of AUTHORITATIVE) {
    assert.equal(readingFor(point.celsius, "celsius", "fahrenheit"), `${point.fahrenheit} °F`);
    assert.equal(readingFor(point.celsius, "celsius", "kelvin"), `${point.kelvin} K`);
  }
});

test("the raw conversion is left unrounded, so a chain of them does not drift", () => {
  assert.ok(convert(37, "celsius", "fahrenheit") !== 98.6, "convert is exact, not rounded for display");
  assert.equal(readingFor(convert(37, "celsius", "fahrenheit"), "fahrenheit", "celsius"), "37 °C");
});

test("and the other way round, because a conversion that only runs one way is not a conversion", () => {
  for (const point of AUTHORITATIVE) {
    assert.ok(Math.abs(convert(point.fahrenheit, "fahrenheit", "celsius") - point.celsius) < 1e-9);
    assert.ok(Math.abs(convert(point.kelvin, "kelvin", "celsius") - point.celsius) < 1e-9);
  }
});

test("every pair of scales round-trips, so no value is lost through two conversions", () => {
  for (const start of SCALES) {
    for (const middle of SCALES) {
      for (const end of SCALES) {
        const there = convert(21.5, start.key, middle.key);
        const back = convert(there, middle.key, end.key);

        assert.ok(
          Math.abs(back - convert(21.5, start.key, end.key)) < 1e-9,
          `${start.key} -> ${middle.key} -> ${end.key} drifted`,
        );
      }
    }
  }
});

test("a conversion to the same scale is the identity", () => {
  for (const scale of SCALES) {
    assert.equal(convert(17.25, scale.key, scale.key), 17.25);
  }
});

test("floating point does not leak into what is printed", () => {
  // (98.6 - 32) * 5/9 is 37.000000000000004 in IEEE arithmetic. Printing that would be absurd.
  assert.equal(formatTemperature(convert(98.6, "fahrenheit", "celsius")), "37");
  assert.equal(formatTemperature(convert(32, "fahrenheit", "celsius")), "0");
  assert.equal(formatTemperature(convert(212, "fahrenheit", "celsius")), "100");
  assert.equal(formatTemperature(convert(-40, "fahrenheit", "celsius")), "-40");
});

test("trailing zeros are trimmed and a rounded-to-zero value never prints as -0", () => {
  assert.equal(formatTemperature(100), "100", "trailing zeros are dropped");
  assert.equal(formatTemperature(1.239), "1.24", "and the rounding still happens");
  assert.equal(formatTemperature(-0.001), "0", "a hair below zero is zero, not minus zero");
  assert.equal(formatTemperature(0), "0");
  assert.equal(formatTemperature(100.0), "100");
});

test("a reading carries its scale's symbol, and an absent reading is empty", () => {
  assert.equal(formatReading(0, "celsius"), "0 °C");
  assert.equal(formatReading(32, "fahrenheit"), "32 °F");
  assert.equal(formatReading(273.15, "kelvin"), "273.15 K");
  assert.equal(formatReading(null, "celsius"), "", "no reading is empty, not a stale one");
  assert.equal(formatReading(Number.NaN, "kelvin"), "");
});

test("exactly absolute zero is reachable, and a hair below it is not", () => {
  assert.equal(isBelowAbsoluteZero(-273.15), false, "absolute zero itself is a temperature");
  assert.equal(isBelowAbsoluteZero(convert(-459.67, "fahrenheit", "celsius")), false);
  assert.equal(isBelowAbsoluteZero(0), false);

  assert.equal(isBelowAbsoluteZero(convert(-459.68, "fahrenheit", "celsius")), true);
  assert.equal(isBelowAbsoluteZero(-300), true);
  assert.equal(isBelowAbsoluteZero(0), false);
  assert.equal(isBelowAbsoluteZero(Number.NaN), false, "no reading is not a reading below absolute zero");
});

test("the boundary is drawn on the result, so -459.68 °F is refused and -459.67 °F is not", () => {
  const accepted = convert(-459.67, "fahrenheit", "celsius");
  const refused = convert(-459.68, "fahrenheit", "celsius");

  assert.equal(isBelowAbsoluteZero(accepted), false);
  assert.equal(isBelowAbsoluteZero(refused), true);
});

test("a temperature is only a temperature if it is written like one", () => {
  assert.equal(parseTemperature("0"), 0);
  assert.equal(parseTemperature("37.5"), 37.5);
  assert.equal(parseTemperature("-40"), -40);
  assert.equal(parseTemperature("+21"), 21);
  assert.equal(parseTemperature(".5"), 0.5);
  assert.equal(parseTemperature("  12  "), 12, "whitespace around a typed number is not a reason to refuse it");

  for (const bad of ["", "   ", "abc", "37°C", "1,000", "1e3", "--5", "5.", "NaN", "Infinity", null, undefined]) {
    assert.equal(parseTemperature(bad), null, `${JSON.stringify(bad)} is not a temperature`);
  }
});

test("an unusable request returns null rather than NaN, so a caller cannot print NaN", () => {
  assert.equal(convert(1e999, "celsius", "fahrenheit"), null);
  assert.equal(convert(20, "celsius", "rankine"), null);
  assert.equal(convert(20, "reaumur", "celsius"), null);
  assert.equal(convert(Number.NaN, "celsius", "kelvin"), null);
});

test("the three scales are the ones a reader expects, in the order the page shows them", () => {
  assert.deepEqual(SCALES.map((scale) => scale.symbol), ["°C", "°F", "K"]);
  assert.deepEqual(SCALES.map((scale) => scale.key), ["celsius", "fahrenheit", "kelvin"]);

  for (const scale of SCALES) {
    assert.ok(scaleFor(scale.key), `${scale.key} is not findable`);
    assert.ok(scale.name.length > 0, `${scale.key} has no name for a label`);
  }

  assert.equal(scaleFor("rankine"), null);
});

test("two decimal places is the printed precision", () => {
  assert.equal(DECIMALS, 2);
});

test("the reference points are real ones rather than the round numbers a reader can already work out", () => {
  const celsiuses = REFERENCE_POINTS.map((point) => point.celsius);

  assert.ok(celsiuses.includes(37), "body temperature is the conversion people actually need");
  assert.ok(celsiuses.includes(-40), "the point where the two scales coincide is worth showing");
  assert.ok(celsiuses.includes(-273.15), "absolute zero belongs on the page as the boundary");

  for (const point of REFERENCE_POINTS) {
    assert.ok(point.label.length > 0, `a reference point of ${point.celsius} has no label`);
    assert.ok(Number.isFinite(point.celsius));
  }
});

test("readingsOf gives every scale's view of one temperature", () => {
  assert.deepEqual(readingsOf(0), { celsius: 0, fahrenheit: 32, kelvin: 273.15 });
});
