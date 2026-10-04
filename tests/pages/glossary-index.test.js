import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  GLOSSARY_INDEX_PLACEHOLDERS,
  glossaryIndex,
} from "../../scripts/pages/glossary-index.js";
import { allRoutes, glossaryRoutes, stylesheetPathFor } from "../../scripts/router/routes.js";
import { componentStylesheetsFor, scriptsFor, stylesheetsFor } from "../../tools/build.js";
import { loadRepositories } from "../../tools/repositories.js";
import { escapeHtml } from "../../scripts/lib/html.js";
import { glossaryFilterText } from "../../scripts/components/glossary-badge.js";

const template = await readFile(new URL("../../pages/glossary-index.html", import.meta.url), "utf8");

const { glossary } = await loadRepositories();
const terms = glossary.all();

const markup = glossaryIndex({ template, terms });

/** The term slugs the index links to, in page order. */
const linkedSlugs = [...markup.matchAll(/href="\/glossary\/([^/"]+)\/"/g)].map((match) => match[1]);

test("the terms render, all of them, once each", () => {
  assert.equal((markup.match(/class="glossary__row"/g) ?? []).length, terms.length);

  for (const term of terms) {
    assert.ok(markup.includes(`href="/glossary/${term.slug}/"`), `${term.slug} has no row`);
  }
});

test("every row shows the term, its definition and its badge", () => {
  const rows = markup.match(/<li class="glossary__row"[\s\S]*?<\/li>/g) ?? [];

  assert.equal(rows.length, terms.length);

  for (const row of rows) {
    assert.match(row, /<span class="glossary__term">[^<]+<\/span>/, "a row with no term");
    assert.match(row, /<span class="glossary__definition">[^<]+<\/span>/, "a row with no definition");
    assert.match(row, /<span class="badge badge--/, "a row with no badge");
  }
});

test("each row carries the text the filter narrows by, which is the term and the definition", () => {
  // Compared against the component's own function rather than a hand-written spelling, because the
  // attribute is HTML-escaped on the way out and a test that rebuilt the string itself would be
  // asserting its own escaping rather than the page's.
  const expected = new Set(terms.map((term) => `data-filter="${escapeHtml(glossaryFilterText(term))}"`));

  assert.equal((markup.match(/data-filter="/g) ?? []).length, terms.length, "one per row, no more");

  for (const attribute of expected) {
    assert.ok(markup.includes(attribute), `no row carries ${attribute.slice(0, 60)}`);
  }
});

test("the jump index offers every letter that has terms, and no others", () => {
  const expected = new Set(terms.map((term) => term.slug.charAt(0).toUpperCase()));
  const offered = [...markup.matchAll(/class="alphabet__link" href="#letter-([A-Z])"/g)].map((match) => match[1]);

  assert.deepEqual([...new Set(offered)].sort(), [...expected].sort());
  assert.equal(offered.length, expected.size, "each letter appears once");
});

test("the jump index counts its terms, and the counts add up", () => {
  const counts = Object.fromEntries(
    [...markup.matchAll(/href="#letter-([A-Z])"[\s\S]*?alphabet__count">(\d+)</g)].map((match) => [
      match[1],
      Number(match[2]),
    ]),
  );

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  assert.equal(total, terms.length, "every term is counted under exactly one letter");

  for (const [letter, count] of Object.entries(counts)) {
    const actual = terms.filter((term) => term.slug.charAt(0).toUpperCase() === letter).length;

    assert.equal(count, actual, `${letter} counts wrong`);
  }
});

test("every letter heading is a target, because the rail points at them", () => {
  const headings = [...markup.matchAll(/id="letter-([A-Z])"/g)].map((match) => match[1]);
  const railTargets = [...markup.matchAll(/href="#letter-([A-Z])"/g)].map((match) => match[1]);

  for (const letter of railTargets) {
    assert.ok(headings.includes(letter), `the rail links to #letter-${letter} and nothing is there`);
  }
});

test("the terms are grouped under their own letter heading, in reading order", () => {
  const groups = [...markup.matchAll(/id="letter-([A-Z])">\1<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/g)];

  assert.ok(groups.length > 0);

  const letters = groups.map((match) => match[1]);

  assert.deepEqual(letters, [...letters].sort(), "letters run A to Z");

  for (const [, letter, body] of groups) {
    for (const slug of [...body.matchAll(/href="\/glossary\/([^/"]+)\/"/g)].map((match) => match[1])) {
      assert.equal(slug.charAt(0).toUpperCase(), letter, `${slug} is filed under ${letter}`);
    }
  }
});

test("the page declares the markers it fills, and no others", () => {
  const declared = [...template.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]);

  assert.deepEqual(declared, GLOSSARY_INDEX_PLACEHOLDERS);
});

test("the page loads the entry point and its own stylesheet, and the filter's", () => {
  assert.deepEqual(scriptsFor({ template: "glossary-index" }), ["/scripts/app.js"]);
  assert.equal(stylesheetPathFor({ template: "glossary-index" }), "styles/pages/glossary-index.css");

  const sheets = stylesheetsFor({ template: "glossary-index" });

  assert.ok(sheets.includes("/styles/pages/glossary-index.css"), "its own stylesheet is linked");
  assert.ok(sheets.includes("/styles/components/element-filter.css"), "the filter it renders is styled");
  assert.ok(componentStylesheetsFor({ template: "glossary-index" }).includes("styles/components/glossary-badge.css"));
});

test("the term routes are derived from the terms, not written out", () => {
  const routes = glossaryRoutes(terms);

  assert.equal(routes.length, terms.length);

  for (const term of terms) {
    const route = routes.find((one) => one.term === term.slug);

    assert.ok(route, `${term.slug} has no route`);
    assert.equal(route.path, `/glossary/${term.slug}/`);
    assert.equal(route.template, "glossary-term", "one template behind every path");
    assert.ok(route.description.length > 0, "a route with no description is a route a search engine fills in");
  }
});

test("the routes are all distinct, because a duplicate would silently lose a page", () => {
  const paths = glossaryRoutes(terms).map((route) => route.path);

  assert.equal(new Set(paths).size, paths.length);
});

test("every index row points at a route the manifest publishes", () => {
  const published = new Set(allRoutes([], [], terms).map((route) => route.path));

  for (const slug of linkedSlugs) {
    assert.ok(published.has(`/glossary/${slug}/`), `the index links to /glossary/${slug}/ and nothing publishes it`);
  }
});

test("the index links to itself as a term page would not", () => {
  assert.ok(!linkedSlugs.includes(""), "no empty slug");
});