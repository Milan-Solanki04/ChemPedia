import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  TEMPERATURE_PLACEHOLDERS,
  referencePointsTable,
  temperatureCalculator,
} from "../../scripts/pages/temperature-calculator.js";
import {
  BELOW_ABSOLUTE_ZERO,
  converterField,
  temperatureConverter,
} from "../../scripts/components/converter-input.js";
import { REFERENCE_POINTS, SCALES } from "../../scripts/lib/temperature.js";
import { allRoutes, stylesheetPathFor } from "../../scripts/router/routes.js";
import { componentStylesheetsFor, scriptsFor, stylesheetsFor } from "../../tools/build.js";

const template = await readFile(
  new URL("../../pages/temperature-calculator.html", import.meta.url),
  "utf8",
);

const markup = temperatureCalculator({ template });

test("the page declares the markers it fills, and no others", () => {
  const declared = [...template.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]);

  assert.deepEqual(declared, TEMPERATURE_PLACEHOLDERS);

  // No bare marker survives into the output. The template's own header comment does survive — it is
  // prose for whoever reads the file next, not a placeholder — so the check is for the marker shape
  // rather than for comments in general.
  assert.deepEqual(
    [...markup.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]),
    [],
    "a marker was left unfilled",
  );
});

test("there is a field per scale, each with a real label and a numeric type", () => {
  for (const scale of SCALES) {
    assert.ok(markup.includes(`id="temperature-${scale.key}"`), `${scale.key} has no field`);
    assert.ok(
      markup.includes(`for="temperature-${scale.key}"`),
      `${scale.key} has no label pointing at its field`,
    );
    assert.ok(markup.includes(`Degrees in ${scale.name}`), `${scale.key} is not named for a screen reader`);
  }

  assert.equal((markup.match(/type="number"/g) ?? []).length, SCALES.length);
  assert.equal((markup.match(/visually-hidden" for="temperature-/g) ?? []).length, SCALES.length);
});

test("a phone is offered a numeric keypad with a decimal point", () => {
  assert.equal((markup.match(/inputmode="decimal"/g) ?? []).length, SCALES.length);
});

test("the fields carry no value in the markup, because a reading nobody supplied is a false claim", () => {
  // The reference's calculator renders "32 °F" on load. Ours renders nothing, so a reader who arrives
  // at this page has not been told a temperature that nobody supplied.
  //
  // Scoped to the converter, because the reference-points table below it does of course print "0 °C".
  const converter = markup.slice(markup.indexOf('class="converter"'), markup.indexOf("converter__note"));

  assert.ok(!/id="temperature-[a-z]+"[^>]*\svalue=/.test(converter), "a field arrives pre-filled");
  assert.ok(!/>\s*-?\d[\d.,]*\s*°[CFK]<\/output>/.test(converter), "a reading is pre-printed");
  assert.ok(converter.includes('placeholder="0"'), "the zero is a placeholder rather than a value");
});

test("there is one warning region, it is a live region, and it starts empty", () => {
  assert.equal((markup.match(/data-warn/g) ?? []).length, 1);
  assert.ok(markup.includes('role="status"'), "the warning is not announced");
  assert.ok(markup.includes('aria-live="polite"'), "the warning is not polite");
  assert.ok(/<p class="converter__warn"[^>]*><\/p>/.test(markup), "the warning region has text in it");
});

test("every field is described by the warning region, so a reader is told what the field can refuse", () => {
  for (const scale of SCALES) {
    assert.ok(
      markup.includes(`aria-describedby="temperature-warn"`) ||
        (markup.match(/aria-describedby="temperature-warn"/g) ?? []).length === SCALES.length,
      "the describedby is missing or wrong",
    );
  }
});

test("the reference points are a real table with row and column headers", () => {
  const table = referencePointsTable();

  assert.ok(table.includes("<table"), "not a table");
  assert.ok(table.includes('scope="col"'), "no column headers");
  assert.equal((table.match(/scope="row"/g) ?? []).length, REFERENCE_POINTS.length, "one row header per point");
  assert.ok(table.includes("<caption"), "a table with no caption");
  assert.ok(table.includes("visually-hidden"), "and the caption is hidden, so a screen reader says nothing");
});

test("every reference point agrees with the converter above it", () => {
  const table = referencePointsTable();

  for (const point of REFERENCE_POINTS) {
    // 0 °C is the value every scale is defined against, so it appearing in all three is the check.
    if (point.celsius === 0) {
      assert.ok(table.includes("0 °C"));
      assert.ok(table.includes("32 °F"));
      assert.ok(table.includes("273.15 K"));
    }
  }

  assert.ok(table.includes("-40 °F"), "the point where two scales coincide is on the page");
  assert.ok(table.includes("-273.15 °C"), "absolute zero is on the page");
});

test("the absolute-zero row is marked as the limit rather than presented as a temperature like the others", () => {
  const table = referencePointsTable();

  assert.ok(table.includes("points__flag"), "the boundary row is not distinguished");
  assert.ok(table.includes("the limit"));
});

test("the note about absolute zero is written here rather than left to the warning alone", () => {
  assert.ok(template.includes("Absolute zero is"), "the page does not say what absolute zero is");
  assert.ok(template.includes("nothing can be colder"));
  assert.ok(template.includes("−273.15 °C") || template.includes("-273.15 °C"));
});

test("the converter loads the entry point and its own stylesheet and the component's", () => {
  assert.deepEqual(scriptsFor({ template: "temperature-calculator" }), ["/scripts/app.js"]);
  assert.equal(
    stylesheetPathFor({ template: "temperature-calculator" }),
    "styles/pages/temperature-calculator.css",
  );

  const sheets = stylesheetsFor({ template: "temperature-calculator" });

  assert.ok(sheets.includes("/styles/pages/temperature-calculator.css"));
  assert.ok(sheets.includes("/styles/components/converter-input.css"));
  assert.ok(
    componentStylesheetsFor({ template: "temperature-calculator" }).includes(
      "styles/components/converter-input.css",
    ),
  );
});

test("the route is declared and the manifest agrees the page exists", () => {
  const route = allRoutes().find((one) => one.path === "/calculators/temperature/");

  assert.ok(route, "the calculator has no route");
  assert.equal(route.template, "temperature-calculator");
  assert.ok(route.nav, "and nothing in the navigation points at it");
  assert.equal(route.nav.label, "Calculators");
});

test("the page's own stylesheet holds no colour or size literal of its own", async () => {
  const css = await readFile(
    new URL("../../styles/pages/temperature-calculator.css", import.meta.url),
    "utf8",
  );

  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "a hex colour in the page's stylesheet");
  assert.ok(!/\b\d+px\b/.test(css), "a pixel size in the page's stylesheet");
});

test("the component's stylesheet holds no colour or size literal either", async () => {
  const css = await readFile(
    new URL("../../styles/components/converter-input.css", import.meta.url),
    "utf8",
  );

  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "a hex colour in the component's stylesheet");
  assert.ok(!/\b\d+px\b/.test(css), "a pixel size in the component's stylesheet");
});

test("the component can be built twice on one page without colliding", () => {
  const two = converterField(SCALES[0], "second") + temperatureConverter({ id: "second" });

  assert.ok(two.includes("second-celsius"), "the second converter reuses the first one's ids");
  assert.ok(markup.includes("temperature-celsius"));
});

test("the warning copy says what it means rather than merely refusing", () => {
  assert.ok(BELOW_ABSOLUTE_ZERO.includes("Below absolute zero"));
  assert.ok(BELOW_ABSOLUTE_ZERO.includes("reach"), "the warning does not say why it matters");
});
