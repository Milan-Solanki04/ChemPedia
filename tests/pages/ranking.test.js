import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { barWidth, BLOCKS, RANKINGS, rankingPage, RANKING_PLACEHOLDERS, rankBy } from "../../scripts/pages/ranking.js";
import { componentStylesheetsFor, scriptsFor, stylesheetsFor } from "../../tools/build.js";
import { loadRepositories } from "../../tools/repositories.js";
import { loadTokens } from "../../tools/tokens.js";
import { createColourMode } from "../../scripts/lib/colour-modes.js";

/**
 * The last stylesheet a page links that is not the print stylesheet.
 *
 * Every page links `print.css` last, so that its rules beat every screen rule above them of the same
 * specificity — see `styles/print.css`. A test asserting "the page's own stylesheet is linked" has to
 * skip it, or it asserts an order that is deliberately no longer true.
 *
 * @param {string[]} sheets
 * @returns {string | undefined}
 */
const lastOwn = (sheets) => sheets.filter((sheet) => sheet !== "/styles/print.css").at(-1);


const template = await readFile(new URL("../../pages/ranking.html", import.meta.url), "utf8");

const { elements, units } = await loadRepositories();
const all = elements.all();
const tokens = await loadTokens();

const mode = createColourMode({
  mode: "group",
  labels: Object.fromEntries(elements.all().map((element) => [element.category, element.category])),
  paint: (key) => tokens.pair(`--g-${key}`.slice(2)),
});

const render = (property) => rankingPage({ template, property, elements: all, units, mode });
const melting = render("melting-point");
const boiling = render("boiling-point");
const orbital = render("orbital-configuration");

/**
 * The figure each row prints, in the order the rows appear.
 *
 * @param {string} markup
 * @returns {number[]}
 */
function figuresInOrder(markup) {
  return [...markup.matchAll(/--rank-bar:[\d.]+%"><\/span><span class="rank__value">(-?[\d.]+)/g)].map(
    (match) => Number(match[1]),
  );
}

test("a ranking is ordered, highest first, with no gaps", () => {
  const { ranked } = rankBy(all, "meltingPoint");

  assert.equal(ranked.length, 103, "103 elements have a melting point on record");

  for (let index = 1; index < ranked.length; index += 1) {
    assert.ok(
      ranked[index - 1].meltingPoint >= ranked[index].meltingPoint,
      `${ranked[index - 1].name} (${ranked[index - 1].meltingPoint}) should not be below ` +
        `${ranked[index].name} (${ranked[index].meltingPoint})`,
    );
  }
});

test("the ranking never contains a value the record does not carry", () => {
  for (const field of ["meltingPoint", "boilingPoint"]) {
    const { ranked, unmeasured } = rankBy(all, field);

    assert.ok(
      ranked.every((element) => typeof element[field] === "number"),
      `${field} ranks an element with no ${field}`,
    );
    assert.equal(ranked.length + unmeasured, 118, `${field} accounts for every element`);
  }
});

test("ties break on atomic number, so the order is total", () => {
  // Two elements at the same temperature are a real case — gallium and caesium melt within a degree
  // of each other — and an order that wobbled between two builds would be an order nobody could cite.
  const { ranked } = rankBy(all, "meltingPoint");

  for (let index = 1; index < ranked.length; index += 1) {
    if (ranked[index - 1].meltingPoint === ranked[index].meltingPoint) {
      assert.ok(
        ranked[index - 1].atomicNumber < ranked[index].atomicNumber,
        `${ranked[index - 1].name} should come before ${ranked[index].name} on a tie`,
      );
    }
  }
});

test("the extremes are the ones the reference reports, with one recorded difference", () => {
  const melting_ = rankBy(all, "meltingPoint");

  // Helium is the coldest thing on the list in every table ever printed of it.
  assert.equal(melting_.ranked.at(-1).symbol, "He");
  assert.equal(melting_.lowest, -272.2);

  // The reference names tungsten as the highest-melting element. Ours is carbon, above tungsten,
  // because carbon's figure is where it sublimes rather than melts. The difference is the page's
  // caveat, not a different number.
  assert.equal(melting_.ranked[0].symbol, "C");
  assert.equal(melting_.highest, 3549.85);
  assert.equal(melting_.ranked[1].symbol, "W", "tungsten is the highest-melting metal");
  assert.match(melting, /Carbon heads this list/);
  assert.match(melting, /sublimes/);

  const boiling_ = rankBy(all, "boilingPoint");

  assert.equal(boiling_.ranked[0].symbol, "Re", "rhenium boils highest");
  assert.equal(boiling_.highest, 5595.85);
  assert.equal(boiling_.ranked.at(-1).symbol, "He", "helium boils lowest");
});

test("the bar maps a value onto the ranking's own range", () => {
  const range = { lowest: -272.2, highest: 3549.85 };

  assert.equal(barWidth(range.lowest, range), 0);
  assert.equal(barWidth(range.highest, range), 100);
  assert.equal(barWidth(0, range), ((0 - range.lowest) / (range.highest - range.lowest)) * 100);

  // A range of one value has no span to divide by, so every bar is full rather than NaN.
  assert.equal(barWidth(5, { lowest: 5, highest: 5 }), 100);
});

test("the rendered bars are monotonic, because the bar is drawn from the value", () => {
  for (const [markup, label] of [
    [melting, "melting point"],
    [boiling, "boiling point"],
  ]) {
    const values = figuresInOrder(markup);

    assert.ok(values.length > 90, `${label} rendered ${values.length} figures`);

    for (let index = 1; index < values.length; index += 1) {
      assert.ok(
        values[index - 1] >= values[index],
        `${label}: row ${index} prints ${values[index]}, above the ${values[index - 1]} before it`,
      );
    }
  }
});

test("the longest bar is the longest figure, in the built page", async () => {
  const { readFile: read } = await import("node:fs/promises");
  const built = await read(new URL("../../../dist/properties/melting-point/index.html", import.meta.url), "utf8");
  const bars = [...built.matchAll(/--rank-bar:([\d.]+)%/g)].map((match) => Number(match[1]));

  assert.ok(bars.length > 90);
  assert.equal(bars[0], 100, "the first row is the highest and fills the bar");
  assert.ok(
    bars.every((bar, index) => index === 0 || bars[index - 1] >= bar),
    "no bar is longer than the one above it",
  );
});

test("every ranking counts what it left out, rather than showing a row it cannot place", () => {
  assert.match(melting, /Ranked from 3549\.85\u00a0°C to -272\.2\u00a0°C, highest first\./);
  assert.match(melting, /15 of the 118 have no melting point on record and are not ranked here\./);
  assert.match(boiling, /25 of the 118 have no boiling point on record and are not ranked here\./);

  // The orbital page ranks nothing, so it has nothing to leave out and shows all 118. The status line
  // under the filter is filled by the script, so the count that is in the server-rendered page is the
  // number of rows.
  assert.doesNotMatch(orbital, /are not ranked here/);
  assert.equal((orbital.match(/<tr /g) ?? []).length, 118);
});

test("the orbital page is grouped by block, and the groups account for every element", () => {
  for (const { block, name } of BLOCKS) {
    assert.match(orbital, new RegExp(`id="rank-block-${block}">${name}`), `${name} heading`);
    assert.match(orbital, new RegExp(`id="rank-block-${block}">[\\s\\S]*?${name}<span class="rank__count">(\\d+) elements`), name);
  }

  const counts = [...orbital.matchAll(/rank__count">(\d+) elements/g)].map((match) => Number(match[1]));

  assert.equal(counts.length, 4, "four blocks");
  assert.equal(
    counts.reduce((total, count) => total + count, 0),
    118,
    "the four groups between them hold all 118",
  );

  // The counts are the ones the layout module produces, which the audit already records as differing
  // from the reference's, and a legend that disagrees with the table it explains is worse.
  assert.deepEqual(counts, [14, 36, 38, 30]);
});

test("every row says how it can be filtered", () => {
  for (const markup of [melting, orbital]) {
    const rows = markup.match(/<tr /g) ?? [];

    assert.ok(rows.length > 90);
    assert.equal((markup.match(/data-filter="/g) ?? []).length, rows.length);
    assert.equal((markup.match(/data-filter-number="/g) ?? []).length, rows.length);
  }
});

test("all three pages render, and each carries its own heading and lede", () => {
  for (const property of Object.keys(RANKINGS)) {
    const markup = render(property);

    for (const marker of RANKING_PLACEHOLDERS) {
      assert.doesNotMatch(markup, new RegExp(`<!--\\s*${marker}\\s*-->`), `${property}: ${marker} unfilled`);
    }

    assert.match(markup, new RegExp(`<h1>${RANKINGS[property].title}</h1>`), property);
    assert.match(markup, new RegExp(RANKINGS[property].lede.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), property);
  }
});

test("a ranking this family does not render is refused rather than half-built", () => {
  assert.throws(() => render("electronegativity"), /electronegativity is not a ranking/);
});

test("the pages carry one heading and never skip a level", () => {
  for (const markup of [melting, orbital]) {
    const levels = [...markup.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));

    assert.equal(levels.filter((level) => level === 1).length, 1);
    assert.equal(levels[0], 1);

    for (let index = 1; index < levels.length; index += 1) {
      assert.ok(levels[index] <= levels[index - 1] + 1, `h${levels[index]} follows h${levels[index - 1]}`);
    }
  }
});

test("every id on a page appears once", () => {
  for (const markup of [melting, orbital]) {
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);

    assert.deepEqual([...new Set(repeated)], []);
  }
});

test("each ranking table has a caption naming what it is", () => {
  assert.match(melting, /<caption class="visually-hidden" id="rank-table">Melting points of elements, highest first<\/caption>/);
  assert.match(orbital, /id="rank-table-f">f block electron configurations<\/caption>/);
});

test("the three rankings share one template and one stylesheet", () => {
  // Three routes, one file each: a second ranking page must not need a second template.
  for (const property of ["melting-point", "boiling-point", "orbital-configuration"]) {
    const page = { template: property };
    const linked = stylesheetsFor(page);

    assert.equal(lastOwn(linked), "/styles/pages/ranking.css", `${property} links the family's stylesheet`);
    assert.deepEqual(
      componentStylesheetsFor(page),
      componentStylesheetsFor({ template: "melting-point" }),
      `${property} declares the same components`,
    );
  }
});

test("each ranking page loads the entry point, because its filter needs wiring", () => {
  for (const property of ["melting-point", "boiling-point", "orbital-configuration"]) {
    assert.deepEqual(scriptsFor({ template: property }), ["/scripts/app.js"], property);
  }
});

test("the page module loads nothing a browser cannot load", async () => {
  const source = await readFile(new URL("../../scripts/pages/ranking.js", import.meta.url), "utf8");
  const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

  assert.ok(imports.length > 0);
  assert.equal(
    imports.filter((specifier) => specifier.includes("tools/") || specifier.includes("node:")).length,
    0,
    "a page module runs in the browser, so it may not reach for the build or for Node",
  );
});

test("the stylesheet names no colour or size of its own", async () => {
  const css = await readFile(new URL("../../styles/pages/ranking.css", import.meta.url), "utf8");
  const body = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(media|container)[^{]*\{/g, "@x {");

  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, "a hex colour outside the token layer");
  assert.doesNotMatch(body, /\b\d+(\.\d+)?(px|rem|em|vw)\b/, "a size literal outside the token layer");
});
