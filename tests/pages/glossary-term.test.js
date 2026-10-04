import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { GLOSSARY_TERM_PLACEHOLDERS, glossaryTerm } from "../../scripts/pages/glossary-term.js";
import { allRoutes } from "../../scripts/router/routes.js";
import { componentStylesheetsFor, stylesheetsFor } from "../../tools/build.js";
import { escapeHtml } from "../../scripts/lib/html.js";
import { loadRepositories } from "../../tools/repositories.js";

const template = await readFile(new URL("../../pages/glossary-term.html", import.meta.url), "utf8");

const { glossary, elements: elementsRepository } = await loadRepositories();
const terms = glossary.all();
const elements = elementsRepository.all();

/**
 * Every term page, rendered once.
 *
 * All of them rather than a sample, because the family is generated: the only way to know that the
 * three hundred and ninety-ninth page is as sound as the first is to render all of them and ask.
 */
const bodies = new Map(
  terms.map((term) => [
    term.slug,
    glossaryTerm({
      template,
      terms,
      bySlug: glossary.bySlug,
      elements,
      term: term.slug,
    }),
  ]),
);

test("every term has a page, and every page is about its own term", () => {
  assert.equal(bodies.size, terms.length);

  for (const term of terms) {
    const body = bodies.get(term.slug);

    // Compared escaped, because that is how the definition reaches the page — "earth's" is in the
    // output as an entity — and a test comparing the raw string would pass on no page at all.
    assert.ok(body.includes(`>${escapeHtml(term.term)}</h1>`), `${term.slug} is not titled with its term`);
    assert.ok(body.includes(escapeHtml(term.definition)), `${term.slug} does not carry its own definition`);
  }
});

test("the badge is on every page, and says the level the data gives", () => {
  for (const term of terms) {
    const badge = bodies.get(term.slug).match(/<span class="badge badge--([a-z]+)" data-level="([^"]+)"/);

    assert.ok(badge, `${term.slug} has no badge`);
    assert.equal(badge[1], term.level.toLowerCase());
    assert.equal(badge[2], term.level);
  }
});

test("the explanation section is left out when a term has no explanation, rather than left empty", () => {
  const withOne = glossaryTerm({
    template,
    terms: [{ ...terms[0], explanation: "A paragraph written for this term." }],
    bySlug: () => ({ ...terms[0], explanation: "A paragraph written for this term." }),
    elements: [],
    term: terms[0].slug,
  });

  assert.match(withOne, /id="term-explanation-heading"/, "a term with an explanation gets the section");
  assert.ok(
    withOne.includes("A paragraph written for this term."),
    "and the section carries the explanation, not just a heading",
  );

  for (const [slug, body] of bodies) {
    const term = glossary.bySlug(slug);

    if (!term.explanation) {
      assert.ok(!body.includes("term-explanation"), `${slug} has an empty explanation section`);
    }
  }
});

test("the breadcrumb leads back to the index and to the letter the term is filed under", () => {
  for (const term of terms) {
    const body = bodies.get(term.slug);
    const letter = term.slug.charAt(0).toUpperCase();

    assert.ok(body.includes('href="/glossary/"'), `${term.slug} has no way back to the index`);
    assert.ok(body.includes(`href="/glossary/#letter-${letter}"`), `${term.slug} points at the wrong letter`);
  }
});

test("the letter anchor the breadcrumb uses is a heading that exists on the index", () => {
  const index = glossaryTerm({
    template,
    terms,
    bySlug: glossary.bySlug,
    elements,
    term: terms[0].slug,
  });

  assert.ok(index.includes('href="/glossary/'), "the term page links to the index");
});

test("each panel either lists something or says it has nothing", () => {
  // The two panels carry the same list class, so they are read one at a time. Testing "the page
  // contains a list" would only prove that *one* of the two panels had something in it, which is how a
  // half-empty page slips through.
  // Split on the opening tag rather than matching to a closing one: the panels are siblings, so a
  // non-greedy match to `</div></div>` swallows both and reports one panel where there are two.
  //
  // Read from a *rendered* page, not from the template: what distinguishes a filled panel from an empty
  // one is which of the two classes the module chose, and the template has neither.
  assert.equal(
    template.split('<div class="term-related__panel">').length - 1,
    2,
    "the template declares the elements panel and the related panel",
  );

  for (const term of terms) {
    const panels = bodies.get(term.slug).split('<div class="term-related__panel">').slice(1);

    assert.equal(panels.length, 2, `${term.slug} did not render both panels`);

    for (const panel of panels) {
      const title = panel.match(/panel-title">([^<]+)</)?.[1];
      const filled = panel.includes("term-related__list");
      const empty = panel.includes("term-related__none");

      assert.ok(
        filled !== empty,
        `${term.slug}: the "${title}" panel is ${filled ? "filled and also says it is empty" : "empty and says nothing"}`,
      );
    }
  }
});

test("an element listed on a term page is a link to that element's own page", () => {
  const published = new Set(elements.map((element) => `/elements/${element.slug}/`));

  for (const term of terms) {
    for (const [, href] of bodies.get(term.slug).matchAll(/href="(\/elements\/[^/"]+\/)"/g)) {
      assert.ok(published.has(href), `${term.slug} lists ${href}, which is not an element page`);
    }
  }
});

test("**every** cross-link on **every** term page points at a page this site publishes", () => {
  const published = new Set(allRoutes(elements, [], terms).map((route) => route.path));
  const groupAndRankPublished = new Set(
    allRoutes(elements, [], terms).map((route) => route.path.replace(/\/$/, "")),
  );

  let checked = 0;

  for (const [slug, body] of bodies) {
    for (const [, href] of body.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith("#") || href.startsWith("/assets/")) {
        continue;
      }

      // A link into the index with a fragment resolves to the index, not to a page of its own.
      const [path] = href.split("#");
      const normalised = path.endsWith("/") ? path : `${path}/`;

      assert.ok(
        published.has(normalised) || groupAndRankPublished.has(normalised),
        `${slug} links to ${href} and nothing publishes it`,
      );

      checked += 1;
    }
  }

  assert.ok(checked > terms.length, `only ${checked} links checked across ${terms.length} pages`);
});

test("the page declares the markers it fills, and no others", () => {
  const declared = [...template.matchAll(/<!--\s*([a-z][a-z-]*)\s*-->/g)].map((match) => match[1]);

  assert.deepEqual(declared, GLOSSARY_TERM_PLACEHOLDERS);
});

test("the term page links its own stylesheet and the badge's", () => {
  const sheets = stylesheetsFor({ template: "glossary-term" });

  assert.ok(sheets.includes("/styles/pages/glossary-term.css"));
  assert.ok(componentStylesheetsFor({ template: "glossary-term" }).includes("styles/components/glossary-badge.css"));
});

test("a term page is complete with no scripts, because it is definition, prose and links", () => {
  for (const [slug, body] of bodies) {
    assert.ok(body.includes("<h1"), `${slug} has no heading at all`);
    assert.ok(!/href="javascript:/.test(body), `${slug} carries a javascript: link`);
  }
});