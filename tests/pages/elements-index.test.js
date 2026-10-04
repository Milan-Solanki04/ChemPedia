import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { elementsIndex, ELEMENTS_INDEX_PLACEHOLDERS } from "../../scripts/pages/elements-index.js";
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


const template = await readFile(new URL("../../pages/elements-index.html", import.meta.url), "utf8");

const { elements, categories, units } = await loadRepositories();
const all = elements.all();
const tokens = await loadTokens();

const mode = createColourMode({
  mode: "group",
  labels: Object.fromEntries(categories.all().map((category) => [category.slug, category.name])),
  paint: (key) => tokens.pair(categories.bySlug(key).token.slice(2)),
});

const render = () => elementsIndex({ template, elements: all, categories, units, mode });
const body = render();

test("the page lists every element, in atomic-number order", () => {
  assert.match(body, /<ul class="cards" id="element-index-list" data-count="118">/);

  const numbers = [...body.matchAll(/data-filter-number="(\d+)"/g)].map((match) => Number(match[1]));

  assert.equal(numbers.length, 118);
  assert.deepEqual(
    numbers,
    [...numbers].sort((one, other) => one - other),
    "the grid is in the repository's order, which is atomic number",
  );
  assert.equal(numbers[0], 1);
  assert.equal(numbers.at(-1), 118);
});

test("every card links to its element's own page", () => {
  const hrefs = [...body.matchAll(/class="card" href="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(hrefs.length, 118);

  for (const element of all) {
    assert.ok(
      hrefs.includes(`/elements/${element.slug}/`),
      `the grid has no card for ${element.slug}`,
    );
  }
});

test("every card says how it can be filtered, by name, symbol and number", () => {
  // The filter narrows the grid by reading these attributes rather than by rebuilding the grid, so a
  // card that does not carry them cannot be found.
  for (const element of all) {
    const text = `${element.name} ${element.symbol} ${element.atomicNumber}`.toLowerCase();
    const pattern = new RegExp(
      `data-filter="${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"` +
        `\\s+data-filter-name="${element.name}"` +
        `\\s+data-filter-symbol="${element.symbol}"` +
        `\\s+data-filter-number="${element.atomicNumber}"`,
    );

    assert.match(body, pattern, `${element.slug} does not say how it can be found`);
  }
});

test("every template marker is filled, and no others are declared", () => {
  for (const marker of ELEMENTS_INDEX_PLACEHOLDERS) {
    assert.doesNotMatch(body, new RegExp(`<!--\\s*${marker}\\s*-->`), `${marker} was left empty`);
  }

  assert.deepEqual(ELEMENTS_INDEX_PLACEHOLDERS, ["filter", "cards"]);
});

test("the page carries one heading and never skips a level", () => {
  const levels = [...body.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));

  assert.equal(levels.filter((level) => level === 1).length, 1);
  assert.equal(levels[0], 1, "the h1 comes first");

  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(
      levels[index] <= levels[index - 1] + 1,
      `h${levels[index]} follows h${levels[index - 1]}`,
    );
  }
});

test("every id on the page appears once", () => {
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.deepEqual([...new Set(repeated)], []);
  assert.ok(ids.length > 2, "the filter labels its field and its status");
});

test("no link is wrapped in another link", () => {
  // The card is the link and the tile inside it gives up being one; this asserts that for all 118
  // rather than for the one a screenshot happened to show.
  const nested = [...body.matchAll(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*?<a\b/g)];

  assert.equal(nested.length, 0, "an anchor opens inside another");
});

test("every link on the page is a route the manifest publishes", async () => {
  const { allRoutes } = await import("../../scripts/router/routes.js");
  const published = new Set(allRoutes(all).map((route) => route.path));
  const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  assert.ok(hrefs.length > 100, "the grid alone is 118 links");

  for (const href of hrefs) {
    assert.ok(published.has(href), `${href} is not a published page`);
  }
});

test("the page links the stylesheets for every component it renders, and each one exists", async () => {
  const { existsSync } = await import("node:fs");
  const declared = componentStylesheetsFor({ template: "elements-index" });
  const linked = stylesheetsFor({ template: "elements-index" });

  for (const sheet of ["element-card.css", "element-filter.css", "element-tile.css"]) {
    assert.ok(
      declared.includes(`styles/components/${sheet}`),
      `the page renders ${sheet} and does not declare it`,
    );
  }

  for (const relative of declared) {
    assert.ok(existsSync(new URL(`../../${relative}`, import.meta.url)), `${relative} does not exist`);
  }

  assert.equal(lastOwn(linked), "/styles/pages/elements-index.css", "the page's own stylesheet is last of the screen sheets");
});

test("the page loads the entry point, because its filter needs wiring", () => {
  assert.deepEqual(scriptsFor({ template: "elements-index" }), ["/scripts/app.js"]);
});

test("the page module loads nothing a browser cannot load", async () => {
  const { readFile: read } = await import("node:fs/promises");
  const source = await read(new URL("../../scripts/pages/elements-index.js", import.meta.url), "utf8");
  const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

  assert.ok(imports.length > 0);
  assert.equal(
    imports.filter((specifier) => specifier.includes("tools/") || specifier.includes("node:")).length,
    0,
    "a page module runs in the browser, so it may not reach for the build or for Node",
  );
});

test("the page's copy is written here and is not the reference's", () => {
  assert.match(body, /Elements in the periodic table/);
  assert.match(body, /All 118 elements, ordered by atomic number\./);

  assert.doesNotMatch(body, /breakingatom/i);
});

test("the page names no colour or size of its own", async () => {
  const { readFile: read } = await import("node:fs/promises");
  const css = await read(new URL("../../styles/pages/elements-index.css", import.meta.url), "utf8");
  // Two things are stepped over before measuring, and both are the house exceptions rather than
  // special pleading: comments, because this stylesheet explains itself in terms of the widths the
  // reference was measured at, and the queries themselves, because a media query cannot resolve a
  // custom property and its breakpoints are recorded in the token layer instead.
  const body = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(media|container)[^{]*\{/g, "@x {");
  const literals = body.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g) ?? [];
  const sizes = body.match(/\b\d+(?:\.\d+)?(?:px|rem|em|vw)\b/g) ?? [];

  assert.deepEqual(literals, [], `the stylesheet holds colours of its own: ${literals.join(", ")}`);
  assert.deepEqual(sizes, [], `the stylesheet holds sizes of its own: ${sizes.join(", ")}`);
});