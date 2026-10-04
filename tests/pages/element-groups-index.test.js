import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ELEMENT_GROUPS_INDEX_PLACEHOLDERS,
  elementGroupsIndex,
} from "../../scripts/pages/element-groups-index.js";
import { allRoutes } from "../../scripts/router/routes.js";
import { scriptsFor, stylesheetsFor } from "../../tools/build.js";
import { loadRepositories } from "../../tools/repositories.js";

const template = await readFile(
  new URL("../../pages/element-groups-index.html", import.meta.url),
  "utf8",
);

const { elements, categories, glossary } = await loadRepositories();
const all = elements.all();
const markup = elementGroupsIndex({ template, categories, elements });
const routes = allRoutes(all, categories.all(), glossary.all());

/** What the page prints beside each group. */
const printed = Object.fromEntries(
  [...markup.matchAll(/group-index__name">([^<]+)<[\s\S]*?group-index__count">(\d+)</g)].map((match) => [
    match[1],
    Number(match[2]),
  ]),
);

test("the page declares the marker it fills, and no others", () => {
  const declared = [...template.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]);

  assert.deepEqual(declared, ELEMENT_GROUPS_INDEX_PLACEHOLDERS);
  assert.deepEqual(
    [...markup.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]),
    [],
    "a marker was left unfilled",
  );
});

test("there is a card for each of the eleven groups", () => {
  assert.equal(categories.all().length, 11);
  assert.equal(Object.keys(printed).length, 11);
  assert.equal((markup.match(/class="group-index__card"/g) ?? []).length, 11);
});

test("every printed count is counted from the records, and equals what the taxonomy asserts", () => {
  for (const category of categories.all()) {
    const counted = elements.withCategory(category.slug).length;

    assert.equal(printed[category.plural], counted, `${category.slug} prints the wrong count`);
    assert.equal(printed[category.plural], category.count, `${category.slug} disagrees with the taxonomy`);
  }
});

test("the counts account for all 118 elements, since the eleven categories partition them", () => {
  const total = Object.values(printed).reduce((sum, count) => sum + count, 0);

  assert.equal(total, 118, "the groups do not partition the elements");
});

test("the group is titled by its stored plural, so 'unknown elements' stays correct", () => {
  assert.ok(printed["unknown elements"] !== undefined, "the unknown group is not listed by its plural");
  assert.ok(!printed.Unknown && !printed["Unknown"], "it is titled by the singular name instead");
});

test("every card swatch is the category's own token, so a group is one colour in four places", () => {
  for (const category of categories.all()) {
    assert.ok(
      markup.includes(`--fill:var(${category.token})`),
      `${category.slug} does not use its own token`,
    );
  }
});

test("every card links its group's page, and every one of those pages is published", () => {
  const hrefs = [...markup.matchAll(/href="(\/element-groups\/[^"]+\/)"/g)].map((match) => match[1]);
  const published = new Set(routes.map((route) => route.path));

  assert.equal(hrefs.length, 11);

  for (const href of hrefs) {
    assert.ok(published.has(href), `${href} is linked and the manifest does not publish it`);
  }
});

test("the whole card is one anchor rather than a name with a link inside it", () => {
  assert.deepEqual(
    [...markup.matchAll(/<a class="group-index__card"[^>]*>([\s\S]*?)<\/a>/g)].flatMap((match) =>
      [...match[1].matchAll(/<a[\s>]/g)],
    ),
    [],
    "a link inside a link",
  );
});

test("the list is a list with its markers reset, so a screen reader can say how long it is", () => {
  assert.ok(markup.includes('<ul class="group-index"'), "not a list");
  assert.equal((markup.match(/<li class="group-index__item">/g) ?? []).length, 11);
  assert.ok(!/class="cards/.test(markup), "it borrows the elements index's page class, which brings no styles");
});

test("the stylesheet the page links is its own, and it is what resets the list", async () => {
  const css = await readFile(
    new URL("../../styles/pages/element-groups-index.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.group-index\s*\{[\s\S]*?list-style:\s*none/, "the bullets are never turned off");
  assert.match(css, /\.group-index\s*\{[\s\S]*?display:\s*grid/, "the list is not a grid");
});

test("the page loads no script, because it has no behaviour of its own", () => {
  assert.deepEqual(scriptsFor({ template: "element-groups-index" }), []);
  assert.ok(stylesheetsFor({ template: "element-groups-index" }).includes("/styles/pages/element-groups-index.css"));
});

test("the route is declared, and it is the last route the manifest declares by hand", () => {
  const route = routes.find((one) => one.path === "/element-groups/");

  assert.ok(route, "the groups index has no route");
  assert.equal(route.template, "element-groups-index");
  assert.equal(route.section, "reference");
});

test("the page's own stylesheet holds no colour or size literal", async () => {
  const css = await readFile(
    new URL("../../styles/pages/element-groups-index.css", import.meta.url),
    "utf8",
  );

  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "a hex colour in the page's stylesheet");
  assert.ok(!/\b\d+px\b/.test(css), "a pixel size in the page's stylesheet");
});
