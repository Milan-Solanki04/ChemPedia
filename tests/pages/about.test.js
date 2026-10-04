import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ABOUT_PLACEHOLDERS,
  aboutPage,
  sourceCounts,
  supplementaryCounts,
} from "../../scripts/pages/about.js";
import { allRoutes } from "../../scripts/router/routes.js";
import { loadRepositories } from "../../tools/repositories.js";
import { scriptsFor, stylesheetsFor } from "../../tools/build.js";
import { CONTACT_ADDRESS, CONTACT_EMAIL } from "../../scripts/lib/site.js";

const template = await readFile(new URL("../../pages/about.html", import.meta.url), "utf8");

const { elements, categories, glossary } = await loadRepositories();
const all = elements.all();

const markup = aboutPage({ template, elements: all, emailHref: CONTACT_EMAIL });
const routes = allRoutes(all, categories.all(), glossary.all());

test("the page declares the markers it fills, and no others", () => {
  const declared = [...template.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]);

  assert.deepEqual(declared, ABOUT_PLACEHOLDERS);
  assert.deepEqual(
    [...markup.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]),
    [],
    "a marker was left unfilled",
  );
});

test("the data-sources table is counted from the records, not written", () => {
  const facts = sourceCounts(all);
  const supplementary = supplementaryCounts(all);

  assert.ok(facts.length > 0, "no dataset was counted");
  assert.equal(
    facts.reduce((sum, entry) => sum + entry.count, 0),
    all.length,
    "the facts rows do not account for every element",
  );
  assert.equal(
    supplementary.reduce((sum, entry) => sum + entry.count, 0),
    all.length,
    "the supplementary rows do not account for every element",
  );
});

test("every dataset named on the page is named in the records, and the other way round", () => {
  const fromRecords = new Set([...sourceCounts(all), ...supplementaryCounts(all)].map((e) => e.dataset));

  for (const dataset of fromRecords) {
    assert.ok(markup.includes(dataset), `${dataset} is in the data but not on the page`);
  }

  // A licence is a fact about a dataset, not about an element, so it is written here. A dataset with no
  // licence recorded is a defect, and the page says so rather than inventing one — but every row the
  // page prints as a real dataset must have its licence stated.
  assert.ok(!/Not recorded/.test(markup), "a dataset on this page has no licence stated");
});

test("every row of the body has a count, a role and a licence", () => {
  // Split on the body only. The header row legitimately has no `scope="row"`, and counting it as a
  // body row makes a correct table look wrong.
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(markup);

  assert.ok(body, "the table has no body");
  const rows = body[1].split("<tr").filter((row) => row.trim() !== "");

  assert.ok(rows.length >= 3, "the table should have at least the two datasets and the prose row");

  for (const row of rows) {
    assert.match(row, /scope="row"/, "a body row with no row header");
    assert.match(row, /sources__count/, "a body row with no count");
  }
});

test("the counts add up to 118 and the note says so without summing two different kinds", () => {
  // Facts and supplementary facts are two roles over the same 118 elements. Summing them produced the
  // sentence "the counts add up to 236 of 118", which is worse than no sentence.
  assert.ok(markup.includes(`All ${all.length} elements draw on these`), "the note does not account for 118");
  assert.ok(!/\b236\b|\b236 of\b/.test(markup), "the note sums two different kinds of source");
});

test("the page states that the writing is ours, which is the ADR-005 claim", () => {
  assert.ok(markup.includes("Written for this site"), "the prose row does not claim authorship");
  assert.ok(
    /No sentence here is copied from another source/.test(markup),
    "and it does not say so as plainly as ADR-005 requires",
  );
});

test("the corrections section says what counts as a correction and where to send one", () => {
  assert.ok(markup.includes("Corrections"), "no corrections section");
  assert.ok(
    /no agreed answer|disputed|estimated/.test(markup),
    "it does not say that some values are disputed rather than settled",
  );
  assert.ok(markup.includes(CONTACT_ADDRESS), "the address is not on the page");
});

test("the contact page says plainly that its address is a placeholder", async () => {
  // The site is not published at a real domain, and a `mailto:` that silently bounces is worse than an
  // address that admits it is not live yet.
  // The template's header comment is stripped, because it explains the decision this test is checking —
  // and it quotes a `mailto:` while doing so, which the assertion below would otherwise match.
  const contact = (await readFile(new URL("../../pages/contact.html", import.meta.url), "utf8"))
    .replace(/<!--[\s\S]*?-->/g, "");

  assert.ok(/placeholder/i.test(contact), "the contact page does not admit its address is a placeholder");
  assert.ok(!contact.includes("mailto:"), "and it still carries a link that would bounce");
});

test("neither page loads a script, because neither has any behaviour", async () => {
  assert.deepEqual(scriptsFor({ template: "about" }), []);
  assert.deepEqual(scriptsFor({ template: "contact" }), []);
});

test("the contact page has no module at all, because its body is entirely copy", async () => {
  const contact = await readFile(new URL("../../pages/contact.html", import.meta.url), "utf8");

  assert.deepEqual(
    [...contact.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]),
    [],
    "the contact page declares a marker, so it needs a module",
  );
});

test("the contact page sorts what people write about instead of showing one bare address", async () => {
  const contact = await readFile(new URL("../../pages/contact.html", import.meta.url), "utf8");

  for (const heading of [
    "What to write about",
    "A figure that looks wrong",
    "Reusing the data or the writing",
    "Where to write",
  ]) {
    assert.ok(contact.includes(heading), `the contact page does not cover: ${heading}`);
  }
});

test("neither page contains the reference's name, or any of its prose", async () => {
  for (const [name, body] of [
    ["about", markup],
    ["contact", await readFile(new URL("../../pages/contact.html", import.meta.url), "utf8")],
  ]) {
    assert.ok(!/breaking\s*atom/i.test(body), `${name} names the reference`);
    assert.ok(!/periodic-table\.com/i.test(body), `${name} links to the reference`);
  }
});

test("every link on either page is a published route, or the one mail address", async () => {
  const contact = await readFile(new URL("../../pages/contact.html", import.meta.url), "utf8");
  const published = new Set(routes.map((route) => route.path));

  for (const body of [markup, contact]) {
    for (const [, href] of body.matchAll(/href="([^"]+)"/g)) {
      if (href === CONTACT_EMAIL) {
        continue;
      }

      assert.ok(published.has(href), `${href} is linked and the manifest does not publish it`);
    }
  }
});

test("the provenance table scrolls sideways on a phone rather than crushing its columns", async () => {
  // Four columns of text — dataset, count, what it supplied, licence — will not fit 375px. Compressing
  // them wraps every phrase and makes the licence the least readable thing on a page whose whole purpose
  // is to state it, so the table scrolls instead.
  const css = await readFile(new URL("../../styles/pages/about.css", import.meta.url), "utf8");

  assert.match(css, /\.sources\s*\{[\s\S]*?overflow-x:\s*auto/, "the table does not scroll on a phone");
  assert.ok(/\.sources__table\s*\{[\s\S]*?min-width:/.test(css), "and has no floor below which it must not shrink");
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), "a hex colour in the page's stylesheet");
  assert.ok(!/\b\d+px\b/.test(css), "a pixel size in the page's stylesheet");
});

test("the about page links the routes it mentions", () => {
  assert.ok(routes.some((route) => route.path === "/elements/"), "the elements index is not published");
  assert.ok(stylesheetsFor({ template: "about" }).includes("/styles/print.css"));
});
