import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { elementDetail } from "../../scripts/pages/element-detail.js";
import { allRoutes } from "../../scripts/router/routes.js";
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


const template = await readFile(new URL("../../pages/element-detail.html", import.meta.url), "utf8");

const { elements, categories, units, glossary } = await loadRepositories();
const all = elements.all();
const tokens = await loadTokens();

const mode = createColourMode({
  mode: "group",
  labels: Object.fromEntries(categories.all().map((category) => [category.slug, category.name])),
  paint: (key) => tokens.pair(categories.bySlug(key).token.slice(2)),
});

const render = (slug) => elementDetail({ template, element: slug, elements: all, categories, units, mode });
const body = render("iron");

test("every one of the 118 slugs renders a page", () => {
  const routes = allRoutes(all).filter((route) => route.template === "element-detail");

  assert.equal(routes.length, 118);

  for (const route of routes) {
    const markup = elementDetail({
      template,
      element: route.element,
      elements: all,
      categories,
      units,
      mode,
    });

    assert.match(markup, /<h1 class="element__name">/, `${route.path} has no heading`);
    assert.doesNotMatch(markup, /<!--\s*[a-z-]+\s*-->/, `${route.path} has an unfilled marker`);
  }
});

test("a slug that is not an element is refused rather than rendered as an empty page", () => {
  assert.throws(() => render("unobtainium"), /unobtainium/);
});

test("a fact the record does not carry is left out, never printed as null", () => {
  // Iron was in use for thousands of years before anyone wrote down who found it, and thirteen of the
  // 118 elements have no discovery year. Coercing those with String() produces the word "null", which
  // passes a string check and reaches the page, so this is asserted across every slug rather than on
  // the one element it was found on.
  const routes = allRoutes(all).filter((route) => route.template === "element-detail");

  for (const route of routes) {
    const markup = render(route.element);

    assert.doesNotMatch(markup, />null</, `${route.path} prints a null value`);
    assert.doesNotMatch(markup, />\s*undefined\s*</, `${route.path} prints an undefined value`);
  }

  // Iron's own page: the two facts it does carry are kept, and the two it does not are simply absent.
  assert.doesNotMatch(body, /Year<\/dt>/);
  assert.match(body, /Name origin<\/dt>/);
});

test("the page carries one heading and never skips a level", () => {
  const levels = [...body.matchAll(/<h([1-6])\b/g)].map(([, level]) => Number(level));

  assert.equal(levels.filter((level) => level === 1).length, 1);
  assert.equal(levels[0], 1);

  for (let index = 1; index < levels.length; index += 1) {
    assert.ok(levels[index] <= levels[index - 1] + 1, `h${levels[index]} follows h${levels[index - 1]}`);
  }
});

test("every id on the page appears once", () => {
  // The shell, the tile, the strip, the questions, the discovery, the properties and the diagram all
  // declare ids, and a second one of any of them breaks a labelled reference.
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.deepEqual([...new Set(repeated)], []);
  assert.ok(ids.length > 5);
});

test("no link is wrapped in another link", () => {
  // The group tiles are one link each, with the tile inside given no href of its own. A second `<a>`
  // while one is open is invalid markup that browsers and screen readers disagree about.
  let depth = 0;
  let nested = 0;

  for (const match of body.matchAll(/<a\b[^>]*>|<\/a>/g)) {
    if (match[0] === "</a>") {
      depth -= 1;
      continue;
    }

    if (depth > 0) {
      nested += 1;
    }

    depth += 1;
  }

  assert.equal(depth, 0, "the anchors do not balance");
  assert.equal(nested, 0, "an anchor opens inside another");
});

test("the page's links all point at pages the site publishes", () => {
  const published = new Set(allRoutes(all).map((route) => route.path));
  const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  assert.ok(hrefs.length > 100, "the miniature table alone is 118 links");

  for (const href of hrefs) {
    assert.ok(published.has(href), `${href} is not a published page`);
  }
});

test("the miniature table holds all 118 tiles with this element marked", () => {
  const mini = /<figure class="element__mini">[\s\S]*?<figcaption/.exec(body)[0];

  // Counted on `class="tile` followed by a space or a closing quote, so the three spans inside each
  // tile — `tile__z`, `tile__sym`, and in the detailed variant `tile__name` — are not counted too.
  assert.equal((mini.match(/class="tile[ "]/g) || []).length, 118);
  assert.equal((mini.match(/is-on/g) || []).length, 1);
  assert.match(mini, /href="\/elements\/iron\/"[^>]*>/);
});

test("the page says where the element sits, in a sentence", () => {
  assert.match(body, /element__mini-caption">Iron: period 4, group 8\./);
});

test("an f-block element is captioned by its series rather than given a group", () => {
  const lanthanum = render("lanthanum");

  assert.match(lanthanum, /Lanthanum: period 6, the Lanthanide series\./);
  assert.doesNotMatch(lanthanum, /Group<\/dt>/);
});

test("the page's own text is written here", () => {
  assert.match(body, /<h1 class="element__name">\s*Iron\s*<\/h1>/);
  assert.match(body, /Pronounced/);
  assert.match(body, /The most-used metal on Earth/);
  assert.match(body, /Uses/);
  assert.match(body, /Where it is found/);
  assert.match(body, /How it was found/);
  assert.doesNotMatch(body, /breaking/i);
});

test("the strip links to the two neighbours and marks this element as the current one", () => {
  const strip = /<nav class="strip"[\s\S]*?<\/nav>/.exec(body)[0];
  const hrefs = [...strip.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(hrefs, ["/elements/manganese/", "/elements/cobalt/"]);
  assert.equal((strip.match(/aria-current="page"/g) || []).length, 1);
});

test("the group section offers every other member of the group, once each", () => {
  const group = /<ul class="group-tiles" data-count="(\d+)">/.exec(body);

  assert.equal(Number(group[1]), 34, "iron is one of 35 transition metals");
  assert.equal((body.match(/class="group-tiles__link"/g) || []).length, 34);
  assert.equal((body.match(/href="\/elements\/iron\/"/g) || []).length, 1, "iron links to itself once");
});

test("a category of one would offer no siblings and say something true", () => {
  // Not a case this dataset has, but a row heading reading "The other unknowns" with nothing under
  // it is the shape of the bug, so the code has to answer it rather than render an empty list.
  const single = elementDetail({
    template,
    element: "iron",
    elements: [all.find((one) => one.slug === "iron")],
    categories,
    units,
    mode,
  });

  assert.match(single, /<ul class="group-tiles" data-count="0">/);
});

test("the page loads the components it renders, and each stylesheet exists", () => {
  const linked = stylesheetsFor({ template: "element-detail" });

  for (const component of [
    "element-strip",
    "element-tile",
    "faq-block",
    "periodic-table",
    "property-list",
    "shell-diagram",
  ]) {
    assert.ok(linked.includes(`/styles/components/${component}.css`), `${component}.css is not linked`);
    assert.ok(existsSync(new URL(`../../styles/components/${component}.css`, import.meta.url)));
  }

  assert.deepEqual(componentStylesheetsFor({ template: "element-detail" }).length, 6);
  assert.equal(lastOwn(linked), "/styles/pages/element-detail.css");
  assert.deepEqual(scriptsFor({ template: "element-detail" }), ["/scripts/app.js"]);
});

test("no stylesheet the element page loads names a colour or a size of its own", async () => {
  for (const relative of [...componentStylesheetsFor({ template: "element-detail" }), "styles/pages/element-detail.css"]) {
    const css = await readFile(new URL(`../../${relative}`, import.meta.url), "utf8");
    const stripped = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@(media|container)[^{]*\{/g, "@x {");

    assert.doesNotMatch(stripped, /#[0-9a-fA-F]{3,8}\b/, `${relative} has a hex colour`);
    assert.doesNotMatch(stripped, /\b\d+(\.\d+)?(px|rem|em|vw)\b/, `${relative} has a size literal`);
  }
});

test("the page family owns four files and they are all there", () => {
  for (const relative of [
    "pages/element-detail.html",
    "styles/pages/element-detail.css",
    "scripts/pages/element-detail.js",
  ]) {
    assert.ok(existsSync(new URL(`../../${relative}`, import.meta.url)), `${relative} is missing`);
  }
});
/**
 * The glossary cross-links in an element's entry, which is the other half of the backbone.
 *
 * Rendered here rather than reusing the file's own `render`, because that one deliberately passes no
 * terms: these pages are about linking, and a fixture set up for anything else would have none.
 *
 * All 118 entries rather than a sample, since the claim being tested is that every entry links the
 * terms it uses and that none of those links goes anywhere.
 */
const terms = glossary.all();

const bodies = Object.fromEntries(
  all.map((one) => [
    one.slug,
    elementDetail({
      template,
      element: one.slug,
      elements: all,
      categories,
      units,
      mode,
      terms,
    }),
  ]),
);

const publishedPaths = new Set(allRoutes(all, [], terms).map((route) => route.path));

test("every element entry links the glossary terms it uses", () => {
  const linked = Object.values(bodies).filter((markup) => markup.includes("glossary-mention")).length;

  assert.ok(linked > 100, `only ${linked} of ${all.length} entries carry a glossary link`);

  for (const [slug, markup] of Object.entries(bodies)) {
    for (const [, href] of markup.matchAll(/class="glossary-mention" href="(\/glossary\/[^/"]+\/)"/g)) {
      assert.ok(publishedPaths.has(href), `${slug} links to ${href} and nothing publishes it`);
    }
  }
});

test("the verb lead is never linked to the metal, in any entry", () => {
  const wrongCase = Object.entries(bodies).filter(([, markup]) =>
    /<a class="glossary-mention"[^>]*>lead</.test(markup),
  );

  assert.deepEqual(wrongCase, [], "a lowercase 'lead' in an entry is the verb, not the element");
});

test("a common-noun term is linked in lower case, which is how the entries write it", () => {
  const lowerCase = Object.values(bodies).flatMap((markup) =>
    [...markup.matchAll(/<a class="glossary-mention"[^>]*>([a-z][\w-]*)<\/a>/g)].map((match) => match[1]),
  ).filter((text) => text === text.toLowerCase());

  assert.ok(
    lowerCase.length > 20,
    `only ${lowerCase.length} lower-case links: the rule is protecting "lead" by making everything else unlinkable`,
  );
});

test("linking a term does not break the escaping of the text around it", () => {
  for (const [slug, markup] of Object.entries(bodies)) {
    assert.ok(!/<script/i.test(markup), `${slug} let a script through`);
    assert.ok(!/class="glossary-mention"[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|#)/.test(markup), `${slug} left a raw entity inside a link`);
  }
});
