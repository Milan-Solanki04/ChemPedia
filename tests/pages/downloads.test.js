import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOWNLOADS_PLACEHOLDERS,
  cardCards,
  cardGroups,
  downloadsPage,
  printableTables,
  tableCards,
} from "../../scripts/pages/downloads.js";
import { allRoutes } from "../../scripts/router/routes.js";
import { componentStylesheetsFor, scriptsFor, stylesheetsFor } from "../../tools/build.js";
import { loadRepositories } from "../../tools/repositories.js";

const template = await readFile(new URL("../../pages/downloads.html", import.meta.url), "utf8");

const { elements, categories, glossary } = await loadRepositories();
const all = elements.all();
const routes = allRoutes(all, categories.all(), glossary.all());
const categoriesBySlug = new Map(categories.all().map((category) => [category.slug, category]));

const markup = downloadsPage({
  template,
  routes,
  indexPath: "/elements/",
  indexCount: all.length,
  categories,
});

/** Every card target on the page. */
const targets = [...markup.matchAll(/class="downloads__card" href="([^"]+)"/g)].map((match) => match[1]);

test("the page declares the markers it fills, and no others", () => {
  const declared = [...template.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]);

  assert.deepEqual(declared, DOWNLOADS_PLACEHOLDERS);
  assert.deepEqual(
    [...markup.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]),
    [],
    "a marker was left unfilled",
  );
});

test("there is a card for each of the four table views, derived from the family and not listed", () => {
  const views = printableTables(routes);

  assert.equal(views.length, 4);
  assert.deepEqual(
    views.map((route) => route.template).sort(),
    ["electronegativity", "evolution", "orbitals", "properties-and-states"],
  );

  const cards = [...tableCards(routes).matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(cards, views.map((route) => route.path));
});

test("every card says whether it fits on one sheet, because that is the reader's question", () => {
  const cards = [...markup.matchAll(/<a class="downloads__card"[\s\S]*?<\/a>/g)].map((match) => match[0]);

  assert.equal(cards.length, targets.length);

  for (const card of cards) {
    assert.ok(
      /Prints on one sheet|Prints over several sheets/.test(card),
      "a card does not say how it prints",
    );
  }
});

test("only the table views claim one sheet, and not all four of those do", () => {
  // The four were measured with print emulation on at A4 and at Letter. Three fit. The evolution view
  // carries a timeline of thirty decades below the table and runs onto a second sheet, and the page says
  // so — rather than claiming four and printing one wrong.
  const measured = {
    "/periodic-table/properties-and-states/": true,
    "/periodic-table/orbitals/": true,
    "/periodic-table/electronegativity/": true,
    "/periodic-table/evolution/": false,
  };

  for (const href of targets) {
    const isTableView = href.startsWith("/periodic-table/");
    const claimsOne = new RegExp(`href="${href}"[\\s\\S]*?Prints on one sheet`).test(markup);

    assert.equal(claimsOne, measured[href] ?? false, `${href}'s claim disagrees with the measurement`);
    assert.equal(isTableView, href in measured, `${href} is not one of the measured views`);
  }

  assert.ok(!/Each prints on a single page/.test(markup), "the page claims all four fit, and one does not");
});

test("the copy names how many of the four fit, rather than leaving it to the cards", () => {
  assert.ok(/Three of them print on a single page/.test(markup), "the count of what fits is not stated");
  assert.ok(/timeline of thirty/.test(markup), "and the reason the fourth does not is not given");
});

test("**every download target resolves in the built output**", () => {
  assert.ok(targets.length >= 15, `only ${targets.length} targets`);

  for (const href of targets) {
    assert.ok(
      routes.some((route) => route.path === href),
      `${href} is linked here and the manifest does not publish it`,
    );
  }
});

test("there is a card for the elements index and one for each of the eleven groups", () => {
  const groups = cardGroups(routes);

  assert.equal(groups.length, 11);

  const cards = cardCards({
    routes,
    indexPath: "/elements/",
    indexCount: all.length,
    counts: new Map(categories.all().map((category) => [category.slug, category.count])),
  });

  const hrefs = [...cards.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(hrefs.length, 12, "the index plus eleven groups");
  assert.ok(hrefs.includes("/elements/"));
  assert.deepEqual(
    hrefs.filter((href) => href !== "/elements/").sort(),
    groups.map((route) => route.path).sort(),
  );
});

test("each group card prints the count the taxonomy asserts, not one scraped from a sentence", () => {
  const cards = cardCards({
    routes,
    indexPath: "/elements/",
    indexCount: all.length,
    counts: new Map(categories.all().map((category) => [category.slug, category.count])),
  });

  for (const route of cardGroups(routes)) {
    const expected = `${categoriesBySlug.get(route.group).count} elements`;

    assert.ok(
      cards.includes(`>${expected}</span>`),
      `${route.group} does not print "${expected}"`,
    );
  }
});

test("the group's stored plural is used as the title, so 'unknown elements' stays correct", () => {
  const cards = cardCards({
    routes,
    indexPath: "/elements/",
    indexCount: all.length,
    counts: new Map(),
  });

  assert.ok(cards.includes(">unknown elements</span>"), "the unknown group is not titled by its plural");
});

test("the page says in its first line that nothing here is a file", () => {
  // The reference's downloads page has no file behind it either, so a reader who has been there before
  // needs to be told what is different here rather than left to find out.
  assert.ok(/nothing here is a file/i.test(markup), "the page does not say it holds no files");
});

test("the print behaviour is written down rather than left to be discovered", () => {
  for (const phrase of [
    "come off the sheet",
    "category colours stay",
    "address it was printed from",
    "Paper size is left to your printer",
  ]) {
    assert.ok(markup.includes(phrase), `the notes do not mention: ${phrase}`);
  }
});

test("the whole card is one anchor rather than a title with a link inside it", () => {
  assert.deepEqual(
    [...markup.matchAll(/<a class="downloads__card"[^>]*>([\s\S]*?)<\/a>/g)].flatMap((match) =>
      [...match[1].matchAll(/<a[\s>]/g)],
    ),
    [],
    "a link inside a link",
  );
});

test("the page loads no script, because it has no behaviour of its own", () => {
  assert.deepEqual(scriptsFor({ template: "downloads" }), [], "a static page that loads the entry point");
});

test("the page links its own stylesheet and the card component's, and they are last of the screen sheets", () => {
  const sheets = stylesheetsFor({ template: "downloads" });

  assert.ok(sheets.includes("/styles/pages/downloads.css"));
  assert.ok(
    componentStylesheetsFor({ template: "downloads" }).includes("styles/components/element-card.css"),
  );
  assert.equal(
    sheets.filter((sheet) => sheet !== "/styles/print.css").at(-1),
    "/styles/pages/downloads.css",
  );
});

test("the page's own stylesheet holds no colour or size literal", async () => {
  const css = await readFile(new URL("../../styles/pages/downloads.css", import.meta.url), "utf8");

  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "a hex colour in the page's stylesheet");
  assert.ok(!/\b\d+px\b/.test(css), "a pixel size in the page's stylesheet");
});

test("the route is declared", () => {
  const route = routes.find((one) => one.path === "/downloads/");

  assert.ok(route, "the downloads page has no route");
  assert.equal(route.template, "downloads");
});

test("every target has a file in the build output, checked against the filesystem rather than the manifest", () => {
  // The manifest and the filesystem are two different claims about what exists, and the criterion is
  // about the output. This skips when `dist/` is absent, so the suite still runs before a build.
  const dist = fileURLToPath(new URL("../../../dist/", import.meta.url));

  if (!existsSync(dist)) {
    return;
  }

  for (const href of targets) {
    const file = path.join(dist, href.replace(/^\/|\/$/g, ""), "index.html");

    assert.ok(existsSync(file), `${href} is linked but there is no built file at ${file}`);
  }
});
