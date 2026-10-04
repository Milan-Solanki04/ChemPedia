import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  bandFor,
  decadesOf,
  DISCOVERY_BANDS,
  electronegativityOutliers,
  TABLE_VIEW_PLACEHOLDERS,
  TABLE_VIEWS,
  tableView,
} from "../../scripts/pages/table-view.js";
import { componentStylesheetsFor, pageContext, scriptsFor, stylesheetsFor } from "../../tools/build.js";
import { loadRepositories } from "../../tools/repositories.js";

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


const template = await readFile(new URL("../../pages/table-view.html", import.meta.url), "utf8");

const { elements } = await loadRepositories();
const all = elements.all();

// The modes the build really hands the pages, rather than a copy rebuilt here: a test that
// re-derives the thing it is testing passes when the build is wrong and the copy is right.
const context = await pageContext(all);

const render = (view) => tableView({ template, view, elements: all, mode: context[view].mode });

const VIEWS = Object.keys(TABLE_VIEWS);
const bodies = Object.fromEntries(VIEWS.map((view) => [view, render(view)]));

/**
 * The legend's label and count for each chip, in order.
 *
 * @param {string} markup
 * @returns {{ label: string, count: number, fill: string }[]}
 */
function chips(markup) {
  return [...markup.matchAll(/class="chip__label">([^<]*)<\/span><span class="chip__n" aria-hidden="true">(\d+)/g)].map(
    (match) => ({ label: match[1], count: Number(match[2]), fill: "" }),
  );
}

test("all four views render, and each carries its own heading and lede", () => {
  assert.deepEqual(VIEWS, ["properties-and-states", "orbitals", "electronegativity", "evolution"]);

  for (const view of VIEWS) {
    const markup = bodies[view];

    for (const marker of TABLE_VIEW_PLACEHOLDERS) {
      assert.doesNotMatch(markup, new RegExp(`<!--\\s*${marker}\\s*-->`), `${view}: ${marker} unfilled`);
    }

    assert.match(markup, new RegExp(`<h1>${TABLE_VIEWS[view].title}</h1>`), view);
    assert.ok(markup.includes(TABLE_VIEWS[view].lede), `${view}: its own lede`);
    assert.equal((markup.match(/class="ptable"/g) ?? []).length, 1, `${view}: one grid`);
    assert.equal((markup.match(/class="ptable__cell"/g) ?? []).length, 118, `${view}: 118 cells`);
  }
});

test("each view's lede is its own, and no two views share one", () => {
  const ledes = VIEWS.map((view) => TABLE_VIEWS[view].lede);

  assert.equal(new Set(ledes).size, VIEWS.length, "four pages, four explanations");

  for (const view of VIEWS) {
    assert.doesNotMatch(
      TABLE_VIEWS[view].lede,
      /breakingatom/i,
      "the lede is our copy, not the reference's sentence",
    );
  }
});

test("a view this family does not render is refused rather than half-built", () => {
  assert.throws(
    () => tableView({ template, view: "group", elements: all, mode: context.orbitals.mode }),
    /group is not a table view/,
  );
});

test("every table holds all 118 tiles, and every tile links its element", () => {
  for (const view of VIEWS) {
    const markup = bodies[view];

    assert.equal((markup.match(/class="tile[ "]/g) ?? []).length, 118, `${view}: 118 tiles`);
    assert.equal((markup.match(/href="\/elements\/[a-z]+\/"/g) ?? []).length, 118, `${view}: 118 links`);
  }
});

/* ---------------------------------------------------------------------------
   The legends. Ours, not the reference's.
   --------------------------------------------------------------------------- */

test("the state legend prints our counts and carries no chip for nothing missing", () => {
  const legend = context["properties-and-states"].mode.keys(all);

  assert.deepEqual(
    legend.map(({ label, count }) => [label, count]),
    [
      ["Solid", 104],
      ["Liquid", 2],
      ["Gas", 12],
    ],
  );

  // The reference prints a fourth chip, `Unknown 14`. Ours has none to print, because all 118 carry a
  // measured state — a chip on a table where nothing is missing is a chip answering a question nobody
  // asked, and the mode omits it deliberately.
  assert.equal(legend.length, 3);
  assert.doesNotMatch(bodies["properties-and-states"], /Unknown/);
  assert.match(bodies["properties-and-states"], /All 118 have a measured state on record/);
});

test("the block legend prints our counts, not the reference's", () => {
  const legend = context.orbitals.mode.keys(all);

  assert.deepEqual(
    legend.map(({ label, count }) => [label, count]),
    [
      ["s-block", 14],
      ["p-block", 36],
      ["d-block", 38],
      ["f-block", 30],
    ],
  );

  // The reference prints 12 · 38 · 40 · 28. Ours differ because helium is in the s block and the
  // thirty f-block elements are all in the f block; the legend has to say what the table in front of
  // the reader contains, and the audit records both counts.
  assert.equal(legend.reduce((total, one) => total + one.count, 0), 118);
});

test("the electronegativity legend prints six bins and the gap, and they account for 118", () => {
  const legend = context.electronegativity.mode.keys(all);

  assert.equal(legend.length, 7, "six bins and one for the values nobody has");
  assert.equal(legend.at(-1).label, "Not measured");
  assert.equal(legend.at(-1).count, 23);
  assert.equal(legend.reduce((total, one) => total + one.count, 0), 118);

  // The bins are contiguous and in order, which is what makes a legend of ranges readable as a scale.
  const ranges = legend.slice(0, 6).map(({ label }) => label);

  assert.equal(ranges[0], "0.7 – 1.25");
  assert.equal(ranges.at(-1), "3.43 – 3.98");
  assert.match(ranges[0], /^0\.7 /, "the first bin starts at the domain's minimum");
  assert.ok(ranges.at(-1).endsWith("3.98"), "the last bin ends at the domain's maximum");
});

test("the domain is the one the reference reports", () => {
  const scale = context.electronegativity.mode.scale;

  assert.equal(scale.min, 0.7, "francium");
  assert.equal(scale.max, 3.98, "fluorine");
  assert.equal(scale.steps, 6);
});

test("the ramp places both extremes correctly and clamps beyond them", () => {
  // The exit criterion for this phase: the continuous scale interpolates correctly across its
  // domain, verified at both ends.
  const { scale } = context.electronegativity.mode;
  const colourAt = (value) => scale.step(value);

  assert.equal(colourAt(scale.min), 0, "the minimum is in the first bin");
  assert.equal(colourAt(scale.max), 5, "the maximum is in the last bin");

  // The middle of the first bin and the middle of the last, rather than fractions of the domain: a
  // value sitting exactly on a bin edge belongs to whichever side floating-point arithmetic puts it,
  // and that is not what this test is for.
  const bins = scale.bins();
  const middleOf = (bin) => (bin.from + bin.to) / 2;

  assert.equal(colourAt(middleOf(bins[0])), 0);
  assert.equal(colourAt(middleOf(bins.at(-1))), 5);

  // Each bin's own middle lands in that bin, which is the whole claim about equal-width bins.
  for (const [index, bin] of bins.entries()) {
    assert.equal(colourAt(middleOf(bin)), index, `bin ${index}`);
  }

  // And the ramp never goes backwards, which is what makes it a scale rather than a lookup.
  let previous = -1;

  for (let step = 0; step <= 100; step += 1) {
    const bin = colourAt(scale.min + ((scale.max - scale.min) * step) / 100);

    assert.ok(bin >= previous, `the ramp went backwards at ${step}% of the domain`);
    previous = bin;
  }

  // Clamped rather than extended: a value outside the measured domain is still a measurement, and
  // inventing a colour for it would be inventing data.
  assert.equal(colourAt(scale.min - 10), 0);
  assert.equal(colourAt(scale.max + 10), 5);

  // And a value nobody has measured is not the bottom of the ramp.
  assert.equal(colourAt(null), null);
  assert.notDeepEqual(scale.colour(null), scale.colour(scale.min));
});

test("the evolution legend prints seven bands that account for 118", () => {
  const legend = context.evolution.mode.keys(all);

  assert.deepEqual(
    legend.map(({ label, count }) => [label, count]),
    [
      ["Known before 1650", 13],
      ["1650 – 1799", 22],
      ["1800 – 1849", 23],
      ["1850 – 1899", 24],
      ["1900 – 1939", 8],
      ["1940 – 1969", 15],
      ["1970 onwards", 13],
    ],
  );
});

test("the evolution ramp runs from the oldest band to the newest, with the gap apart from it", () => {
  const legend = context.evolution.mode.keys(all);
  const fills = legend.map(({ paint }) => paint.fill);

  assert.notEqual(fills[0], fills[1], "the undated band is not on the ramp");
  assert.equal(new Set(fills).size, fills.length, "every band is a colour of its own");

  // The dated bands deepen with recency, so the shading reads as "how recently".
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const dated = fills.slice(1).map(luminance);

  for (let index = 1; index < dated.length; index += 1) {
    assert.ok(dated[index] <= dated[index - 1], `band ${index} is lighter than the one before it`);
  }
});

/* ---------------------------------------------------------------------------
   The rules behind the numbers.
   --------------------------------------------------------------------------- */

test("every element falls in exactly one discovery band, and the bands account for all 118", () => {
  const counts = new Map();

  for (const element of all) {
    const band = bandFor(element);

    assert.ok(DISCOVERY_BANDS.some((one) => one.key === band), `${element.name}: band ${band}`);
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }

  assert.equal(DISCOVERY_BANDS.length, counts.size, "no band is empty and none is invented");
  assert.equal([...counts.values()].reduce((total, count) => total + count, 0), 118);
});

test("the undated band is the elements that were in use before anyone recorded finding them", () => {
  const undated = all.filter((element) => bandFor(element) === "undated");

  assert.equal(undated.length, 13);

  // Not a data failure, and not drawn as one: copper, gold, silver, iron, sulphur and lead are the
  // classic seven metals, and none of them has a discoverer.
  for (const symbol of ["Cu", "Au", "Ag", "Fe", "S", "Pb", "C"]) {
    assert.ok(
      undated.some((element) => element.symbol === symbol),
      `${symbol} should be in the undated band`,
    );
  }

  for (const element of undated) {
    assert.equal(element.discovery.year, null, `${element.name} carries no year, by definition`);
  }
});

test("a band boundary belongs to the band it opens, not the one it closes", () => {
  const bandOf = (year) => bandFor({ discovery: { year } });

  assert.equal(bandOf(1650), "early");
  assert.equal(bandOf(1799), "early");
  assert.equal(bandOf(1800), "industrial");
  assert.equal(bandOf(1849), "industrial");
  assert.equal(bandOf(1850), "gases");
  assert.equal(bandOf(1939), "radioactive");
  assert.equal(bandOf(1940), "transuranic");
  assert.equal(bandOf(1969), "transuranic");
  assert.equal(bandOf(1970), "synthetic");
  assert.equal(bandOf(2016), "synthetic");
});

test("the decades account for the dated elements and run earliest first", () => {
  const decades = decadesOf(all);

  assert.equal(decades.length, 31);
  assert.equal(decades[0].decade, 1660, "fluorine, in 1669");
  assert.equal(decades.at(-1).decade, 2010, "the last element was made in 2010");

  const dated = decades.reduce((total, one) => total + one.count, 0);

  assert.equal(dated, 105);
  assert.equal(dated + all.filter((element) => bandFor(element) === "undated").length, 118);

  for (let index = 1; index < decades.length; index += 1) {
    assert.ok(decades[index].decade > decades[index - 1].decade, "decades ascend");
  }

  for (const one of decades) {
    assert.equal(one.names.length, one.count, "every element in a decade is named in it");
  }
});

test("the outliers are named from the data, and are not an artefact of what is missing", () => {
  const outliers = electronegativityOutliers(all).map((element) => element.symbol);

  // Judged against its period instead, krypton appears — only because five of the seven noble gases
  // have no value, which drags its period's mean and makes its conventional estimate look extreme.
  // That would be reporting a gap in our sources as a finding about the chemistry.
  assert.ok(!outliers.includes("Kr"), "krypton is a missing-data artefact, not an outlier");

  for (const symbol of ["H", "F", "O"]) {
    assert.ok(outliers.includes(symbol), `${symbol} should be named`);
  }

  assert.match(bodies.electronegativity, /furthest from the average of their own group are/);
});

/* ---------------------------------------------------------------------------
   The page, and the family it belongs to.
   --------------------------------------------------------------------------- */

test("every view carries one heading and never skips a level", () => {
  for (const markup of Object.values(bodies)) {
    const levels = [...markup.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));

    assert.equal(levels.filter((level) => level === 1).length, 1);
    assert.equal(levels[0], 1);

    for (let index = 1; index < levels.length; index += 1) {
      assert.ok(levels[index] <= levels[index - 1] + 1, `h${levels[index]} follows h${levels[index - 1]}`);
    }
  }
});

test("every id on a page appears once", () => {
  for (const markup of Object.values(bodies)) {
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual([...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))], []);
  }
});

test("every chip is a button that isolates, and its count is the one the mode counted", () => {
  const markup = bodies.orbitals;

  assert.equal((markup.match(/<button type="button" class="chip"/g) ?? []).length, 4);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /aria-label="s-block, 14 elements"/);

  // The count on the chip and the count the mode tallied are the same number, read from one place.
  const printed = chips(markup).map((one) => one.count);
  const tallied = context.orbitals.mode.keys(all).map((one) => one.count);

  assert.deepEqual(printed, tallied);
});

test("only the evolution view carries a timeline", () => {
  assert.match(bodies.evolution, /<h2 class="section__title" id="timeline-heading">When each element was found<\/h2>/);
  assert.equal((bodies.evolution.match(/class="timeline__row"/g) ?? []).length, 31);

  for (const view of VIEWS.filter((one) => one !== "evolution")) {
    assert.doesNotMatch(bodies[view], /class="timeline/, `${view} has no timeline to carry`);
  }
});

test("the four views share one template and one stylesheet", () => {
  for (const view of VIEWS) {
    const page = { template: view };
    const linked = stylesheetsFor(page);

    assert.equal(lastOwn(linked), "/styles/pages/table-view.css", `${view} links the family's stylesheet`);
    assert.deepEqual(
      componentStylesheetsFor(page),
      [
        "styles/components/legend-chips.css",
        "styles/components/periodic-table.css",
        "styles/components/element-tile.css",
      ],
      `${view} renders the same parts as the others`,
    );
    assert.deepEqual(scriptsFor(page), ["/scripts/app.js"], `${view} needs the entry point`);
  }
});

test("the page module loads nothing a browser cannot load", async () => {
  const source = await readFile(new URL("../../scripts/pages/table-view.js", import.meta.url), "utf8");
  const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

  assert.ok(imports.length > 0);
  assert.equal(
    imports.filter((specifier) => specifier.includes("tools/") || specifier.includes("node:")).length,
    0,
    "a page module runs in the browser, so it may not reach for the build or for Node",
  );
});

test("the stylesheet names no colour or size of its own", async () => {
  const css = await readFile(new URL("../../styles/pages/table-view.css", import.meta.url), "utf8");
  const body = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(media|container)[^{]*\{/g, "@x {");

  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, "a hex colour outside the token layer");
  assert.doesNotMatch(body, /\b\d+(\.\d+)?(px|rem|em|vw)\b/, "a size literal outside the token layer");
});
