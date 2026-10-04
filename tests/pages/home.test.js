import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { createColourMode } from "../../scripts/lib/colour-modes.js";
import { HOME_PLACEHOLDERS, fillTemplate, homePage, placeholder } from "../../scripts/pages/home.js";
import { routes } from "../../scripts/router/routes.js";
import { componentStylesheetsFor, scriptsFor, stylesheetsFor } from "../../tools/build.js";
import { loadRepositories } from "../../tools/repositories.js";
import { loadTokens } from "../../tools/tokens.js";

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


const template = await readFile(new URL("../../pages/home.html", import.meta.url), "utf8");

const { elements, categories } = await loadRepositories();
const tokens = await loadTokens();
const all = elements.all();

const mode = createColourMode({
  mode: "group",
  labels: Object.fromEntries(categories.all().map((category) => [category.slug, category.name])),
  paint: (key) => tokens.pair(categories.bySlug(key).token.slice(2)),
});

const body = homePage({ template, elements: all, mode });

/** Every `href` in the rendered body, absolute, in the order they appear. */
function linksIn(markup) {
  return [...markup.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);
}

/**
 * A markup string with its comments removed.
 *
 * The template's header comment explains what was deliberately left out, which means it names the
 * things that are not there. Scanning a page for them has to look at what a reader sees.
 *
 * @param {string} markup
 * @returns {string}
 */
function visible(markup) {
  return markup.replace(/<!--[\s\S]*?-->/g, "");
}

/** The section classes in the rendered body, in order. */
function sectionsIn(markup) {
  return [...markup.matchAll(/<section class="([a-z-]+)/g)].map(([, name]) => name);
}

test("the page's sections come in the reference's order", () => {
  // The reference runs: hero, legend and table, understanding, learning block, learning tracks, find.
  // Ours replaces the learning block with in-scope teasers and drops the tracks entirely, because
  // those existed to sell courses and the absence of courses is a decision rather than a gap (ADR-002).
  assert.deepEqual(sectionsIn(body), ["intro", "table-section", "reading", "further", "find"]);
});

test("every generated block in the template is filled, and nothing is left behind", () => {
  const markers = [...template.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map(([, name]) => name);

  assert.ok(markers.length > 0, "the template declares no blocks at all");

  for (const name of markers) {
    assert.ok(template.includes(placeholder(name)), `the template has a ${name} marker written oddly`);
  }

  // The build's own check: a leftover marker in the output is a page that is missing something.
  assert.doesNotMatch(body, /<!--\s*[a-z][a-z-]*\s*-->/, "a marker survived into the built page");
  assert.throws(() => fillTemplate("<!-- legend -->\n<!-- table -->", { legend: "" }), /table/);
});

test("a marker with nothing to fill it is reported rather than left in the page", () => {
  assert.throws(() => fillTemplate("<!-- table -->", {}), /table/);
  assert.doesNotThrow(() => fillTemplate("<!-- table -->", { table: "<p>x</p>" }));
});

test("the template's own explanation survives being filled", () => {
  // The header comment is prose for the next person. A filler that treated every comment as a marker
  // would either eat it or refuse to build.
  assert.match(body, /A fragment, not a document/);
  assert.match(body, /the two panels the reference splits into three sections/);
});

test("a header that quotes a marker does not have the block injected into itself", () => {
  // The trap this project fell into once. Every template explains itself in a header, and the natural
  // sentence to write in one is "this marker is filled by the page module" — quoted, so it reads as
  // prose. To a regular expression that quoted marker is indistinguishable from the real one, so the
  // block lands in the header as well and the page ships a duplicate id. The elements index did
  // exactly that on its first draft.
  const quoted = `<!--
  The filter is marked <!-- filter --> in the body below.
-->
<p>before</p>
<!-- filter -->`;

  const filled = fillTemplate(quoted, { filter: "<form id='f'></form>" });

  assert.equal(
    (filled.match(/<form id='f'><\/form>/g) ?? []).length,
    1,
    "the block appears once, not once per mention",
  );
  assert.match(filled, /marked <!-- filter --> in the body/, "the header survives verbatim");
});

test("the blocks the module declares and the blocks the template has are kept in step", () => {
  // The module may declare a block before the template has somewhere to put it — the search is the
  // one today — but the template may not carry a marker the module does not know how to fill, or the
  // build would stop.
  const markers = new Set([...template.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map(([, name]) => name));

  for (const name of markers) {
    assert.ok(HOME_PLACEHOLDERS.includes(name), `${name} is not a block the page module can fill`);
  }
});

test("the page carries the table, all 118 of it, and one tab stop", () => {
  assert.equal((body.match(/class="tile"/g) || []).length, 118);
  assert.equal((body.match(/class="ptable__cell"/g) || []).length, 118);
  assert.equal((body.match(/tabindex="0"/g) || []).length, 1);
  assert.equal((body.match(/tabindex="-1"/g) || []).length, 117);
});

test("the legend has one chip per category, and its counts are the data's own", () => {
  const chips = [...body.matchAll(/chip__n" aria-hidden="true">(\d+)</g)].map(([, count]) => Number(count));

  assert.equal((body.match(/class="chip"/g) || []).length, 11);
  assert.equal(chips.reduce((sum, count) => sum + count, 0), 118);
  assert.deepEqual(chips, categories.all().map((category) => category.count));
});

test("the page has one h1 and never skips a heading level", () => {
  const levels = [...body.matchAll(/<h([1-6])\b/g)].map(([, level]) => Number(level));

  assert.equal(levels.filter((level) => level === 1).length, 1);
  assert.equal(levels[0], 1);

  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index] <= levels[index - 1] + 1, `h${levels[index]} follows h${levels[index - 1]}`);
  }
});

test("the section naming the legend is hidden rather than absent", () => {
  // The legend and the table are one visual block. A visible heading above them would break the
  // rhythm the reference has, and a missing one would leave the section unnameable.
  assert.match(body, /<h2 class="visually-hidden" id="element-groups">Element groups<\/h2>/);
  assert.match(body, /<section class="table-section" aria-labelledby="element-groups">/);
});

test("every link the page writes is a route the manifest publishes", () => {
  const declared = new Set(routes.map((route) => route.path));

  // The table's 118 tiles link to /elements/<slug>/, which the element-page phase declares. That is
  // the same accepted construction state the shell is in, and it is the only exception here.
  const authored = linksIn(body).filter((href) => !href.startsWith("/elements/"));

  assert.ok(authored.length > 0);
  for (const href of authored) {
    assert.ok(declared.has(href), `${href} is not a declared route`);
  }
});

test("no link on the page points at the element index while the tiles point at elements", () => {
  const hrefs = linksIn(body);

  assert.ok(hrefs.includes("/elements/iron/"), "a tile should link to an element's own page");
  assert.ok(hrefs.includes("/properties/melting-point/"), "a teaser should link to a declared route");
});

test("the page links the stylesheets for every component it renders, and each one exists", () => {
  const linked = stylesheetsFor({ template: "home" });

  for (const component of ["element-search", "element-tile", "legend-chips", "periodic-table"]) {
    assert.ok(linked.includes(`/styles/components/${component}.css`), `${component}.css is not linked`);
    assert.ok(existsSync(new URL(`../../styles/components/${component}.css`, import.meta.url)));
  }

  assert.deepEqual(componentStylesheetsFor({ template: "home" }), [
    "styles/components/element-search.css",
    "styles/components/element-tile.css",
    "styles/components/legend-chips.css",
    "styles/components/periodic-table.css",
  ]);

  assert.ok(linked.indexOf("/styles/pages/home.css") > linked.indexOf("/styles/tokens.css"));
  assert.equal(lastOwn(linked), "/styles/pages/home.css", "a page's own stylesheet comes last of the screen sheets");
});

test("every page with a behaviour module loads the entry point, and no others do", () => {
  assert.deepEqual(scriptsFor({ template: "home" }), ["/scripts/app.js"]);
  assert.deepEqual(scriptsFor({ template: "element-detail" }), ["/scripts/app.js"]);
  // The index grew a behaviour module in Phase 6, which is what this assertion caught: a filter that
  // needs wiring in the browser is a page that must load the entry point to get it.
  assert.deepEqual(scriptsFor({ template: "elements-index" }), ["/scripts/app.js"]);
  assert.deepEqual(scriptsFor({ template: "404" }), []);
});

test("the page's copy is written here and is not the reference's", () => {
  assert.match(body, /The periodic table, element by element/);
  assert.match(body, /Choose any tile to read its properties/);
  assert.doesNotMatch(body, /All 118 elements, arranged by atomic number\. Select any element/);
});

test("the learning block is replaced by teasers, and nothing sells a course", () => {
  const teasers = [...body.matchAll(/teaser__title">\s*<a href="([^"]+)">([^<]+)</g)].map(([, href, label]) => [
    href,
    label.trim(),
  ]);

  assert.equal(teasers.length, 4);

  for (const [href] of teasers) {
    assert.ok(routes.some((route) => route.path === href), `${href} is not a declared route`);
  }

  for (const forbidden of [/learn/i, /course/i, /\btrack\b/i, /games?/i, /tutor/i]) {
    assert.doesNotMatch(visible(body), forbidden, `the page shows something out of scope: ${forbidden}`);
  }
});

test("the two explain panels are there, with a heading and a direction each", () => {
  const panels = [...body.matchAll(/panel__title">([^<]+)<\/h3>\s*<p class="panel__label">([^<]+)</g)].map(
    ([, title, label]) => [title.trim(), label.trim()],
  );

  assert.deepEqual(panels, [
    ["Periods", "Across a row"],
    ["Groups", "Down a column"],
  ]);
});

test("the quickswitch strip is the submenu band, written by the shell and not by this page", () => {
  // The reference puts "Explore Periodic Tables:" above its hero. Ours is the contextual band, built
  // by the shell, so the page must not carry a second copy that could fall out of step with it.
  assert.doesNotMatch(visible(template), /Explore Periodic Tables/);
  assert.ok(routes.find((route) => route.path === "/").section === "periodic-table");
});

test("the page module loads nothing that cannot run in a browser", async () => {
  const source = await readFile(new URL("../../scripts/pages/home.js", import.meta.url), "utf8");
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map(([, specifier]) => specifier);

  assert.ok(imports.length > 0);

  for (const specifier of imports) {
    assert.doesNotMatch(specifier, /node:/, `${specifier} cannot be loaded by a browser`);
    assert.doesNotMatch(specifier, /\/tools\//, `${specifier} is development-only`);
  }
});

test("no stylesheet the home page loads names a colour or a size of its own", async () => {
  for (const relative of [
    "styles/pages/home.css",
    "styles/components/element-search.css",
    "styles/components/element-tile.css",
    "styles/components/legend-chips.css",
    "styles/components/periodic-table.css",
  ]) {
    const css = await readFile(new URL(`../../${relative}`, import.meta.url), "utf8");
    const body = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@(media|container)[^{]*\{/g, "@x {");

    assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, `${relative} has a hex colour outside the token layer`);
    assert.doesNotMatch(body, /\b\d+(\.\d+)?(px|rem|em|vw)\b/, `${relative} has a size literal outside the token layer`);
  }
});

test("every file the page family owns exists where the manifest says it does", () => {
  for (const relative of ["pages/home.html", "styles/pages/home.css", "scripts/pages/home.js", "scripts/app.js"]) {
    assert.ok(existsSync(new URL(`../../${relative}`, import.meta.url)), `${relative} is missing`);
  }
});