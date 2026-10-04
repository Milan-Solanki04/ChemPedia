import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { groupPage, GROUP_PLACEHOLDERS } from "../../scripts/pages/group.js";
import { groupRoutes, allRoutes, stylesheetPathFor } from "../../scripts/router/routes.js";
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


const template = await readFile(new URL("../../pages/group.html", import.meta.url), "utf8");

const { elements, categories, units, groups } = await loadRepositories();
const all = elements.all();
const tokens = await loadTokens();

const mode = createColourMode({
  mode: "group",
  labels: Object.fromEntries(categories.all().map((category) => [category.slug, category.name])),
  paint: (key) => tokens.pair(categories.bySlug(key).token.slice(2)),
});

const render = (group) => groupPage({ template, group, elements: all, categories, groups, units, mode });
const bodies = Object.fromEntries(categories.all().map((one) => [one.slug, render(one.slug)]));

/** The member count a page prints as its first fact. */
const printedCount = (markup) => Number(markup.match(/fact__label">Elements<\/span><span class="fact__value">(\d+)/)?.[1]);

test("the eleven routes are derived from the categories, not written out", () => {
  const routes = groupRoutes(categories.all());

  assert.equal(routes.length, 11);

  for (const category of categories.all()) {
    const route = routes.find((one) => one.group === category.slug);

    assert.ok(route, `${category.slug} has no route`);
    assert.equal(route.path, `/element-groups/${category.slug}/`);
    assert.equal(route.template, "group", "one template behind eleven paths");
    assert.equal(route.section, "reference");
  }

  // The whole point of deriving them: adding a category adds a page, with no route to remember.
  const derived = groupRoutes([...categories.all(), { slug: "a-new-group", name: "New", plural: "New ones", count: 0 }]);

  assert.equal(derived.length, 12);
  assert.ok(derived.some((route) => route.path === "/element-groups/a-new-group/"));
});

test("a derived route's title uses the stored plural, not a singular plus an s", () => {
  const titles = groupRoutes(categories.all()).map((route) => route.title);

  // "Unknowns" is what a singular plus "s" gives for the one group whose plural is not that.
  assert.ok(titles.some((title) => title.startsWith("Unknown elements")), titles.join(" | "));
  assert.ok(!titles.some((title) => title.startsWith("Unknowns")));
});

test("the routes are in the manifest, and the eleven group paths all resolve by family", () => {
  const published = allRoutes(all, categories.all());
  const paths = new Set(published.map((route) => route.path));

  for (const route of groupRoutes(categories.all())) {
    assert.ok(paths.has(route.path), `${route.path} is not published`);
    assert.equal(stylesheetPathFor(route), "styles/pages/group.css", route.path);
  }
});

test("every group page's printed count is the count counted from the records", () => {
  // The plan's exit criterion, and the reason the count is never stored in prose.
  for (const category of categories.all()) {
    const members = elements.withCategory(category.slug);

    assert.equal(members.length, category.count, `${category.slug}: counted from the records`);
    assert.equal(printedCount(bodies[category.slug]), members.length, `${category.slug}: printed`);
  }

  assert.equal(
    categories.all().reduce((total, one) => total + printedCount(bodies[one.slug]), 0),
    118,
    "the eleven pages between them account for every element",
  );
});

test("the counts are the ones the reference prints", () => {
  // Taken off the reference's own eleven group pages; the audit records them in §3.11.
  const expected = {
    "transition-metals": 35,
    actinides: 15,
    lanthanides: 15,
    "post-transition-metals": 8,
    unknown: 8,
    "noble-gases": 7,
    "non-metals": 7,
    "alkali-metals": 6,
    "alkaline-earth-metals": 6,
    metalloids: 6,
    halogens: 5,
  };

  assert.deepEqual(
    Object.fromEntries(categories.all().map((one) => [one.slug, printedCount(bodies[one.slug])])),
    expected,
  );

  assert.equal(Object.values(expected).reduce((total, count) => total + count, 0), 118);
});

test("every member links, and every member link is a page the site publishes", async () => {
  const published = new Set(allRoutes(all, categories.all()).map((route) => route.path));

  for (const category of categories.all()) {
    const members = elements.withCategory(category.slug);
    const hrefs = [...bodies[category.slug].matchAll(/class="card" href="([^"]+)"/g)].map((match) => match[1]);

    assert.equal(hrefs.length, members.length, `${category.slug}: one card per member`);

    for (const href of hrefs) {
      assert.ok(published.has(href), `${href} is not a published page`);
    }
  }
});

test("the table is isolated to the group in the markup, not by a script", () => {
  for (const category of categories.all()) {
    const markup = bodies[category.slug];
    const lit = (markup.match(/ptable__cell is-match/g) ?? []).length;

    assert.match(markup, /class="ptable__grid is-isolating"/, `${category.slug}: the grid is isolating`);
    assert.equal(lit, category.count, `${category.slug}: ${lit} cells lit, ${category.count} members`);
    assert.match(markup, new RegExp(`aria-pressed="true"[^>]*>|aria-label="${category.plural}`), category.slug);
  }
});

test("the chip is pressed, so the isolation survives the wiring rather than being cleared", () => {
  // The markup arrives isolated; `wireTable` takes the same key as its initial pin so it continues
  // from that state. A chip that is pressed in the HTML but pinned to null in the script would blink
  // the whole table on load.
  assert.match(bodies["noble-gases"], /class="chip is-active"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*class="chip is-active"/);
});

test("the atomic-number fact is the span from the first member to the last", () => {
  const numbers = (slug) => bodies[slug].match(/fact__label">Atomic numbers<\/span><span class="fact__value">([^<]+)/)?.[1];

  assert.equal(numbers("noble-gases"), "2 – 118", "helium is 2 and oganesson is 118");
  assert.equal(numbers("transition-metals"), "21 – 112");
  // 85 rather than 117, because tennessine is filed under `unknown` and not as a halogen — its
  // placement is a prediction from periodic trends, and `overrides.json` records why. The fact is
  // counted from the records, so the override shows up on the page.
  assert.equal(numbers("halogens"), "9 – 85");
});

test("a group whose members do not agree about their block is told so", () => {
  const block = (slug) => bodies[slug].match(/fact__label">Block<\/span><span class="fact__value">([^<]+)/)?.[1];

  assert.equal(block("transition-metals"), "d-block", "all thirty-five agree");
  assert.equal(block("alkali-metals"), "s-block");
  assert.equal(block("halogens"), "p-block");

  // The reference answers "p-block" for the noble gases, which include helium and therefore do not
  // all fill the same subshell. Ours says which one disagrees. Hydrogen puts the non-metals in the
  // same position, and the eight elements with no measured chemistry have no majority at all, so
  // every block is named rather than the fact shrugging.
  assert.equal(block("noble-gases"), "p-block, with s-block");
  assert.equal(block("non-metals"), "p-block, with s-block");
  assert.equal(block("unknown"), "p-block and d-block");
});

test("the states fact lists the states the group's members are actually in", () => {
  const states = (slug) => bodies[slug].match(/fact__label">States<\/span><span class="fact__value">([^<]+)/)?.[1];

  assert.equal(states("noble-gases"), "Gas");
  assert.equal(states("halogens"), "Solid, Liquid, Gas");
  assert.equal(states("transition-metals"), "Solid, Liquid");
});

test("the members heading reads as a sentence and the labels read as labels", () => {
  const heading = (slug) => bodies[slug].match(/id="group-members-heading">([^<]+)</)?.[1];
  const chip = (slug) => bodies[slug].match(/chip__label">([^<]+)</)?.[1];

  // One plural serves a heading and two labels, and only the labels want it capitalised.
  assert.equal(heading("noble-gases"), "The noble gases");
  assert.equal(chip("noble-gases"), "Noble gases");
  assert.equal(heading("unknown"), "The unknown elements");
  assert.equal(chip("unknown"), "Unknown elements", "not 'unknown elements' at the head of a label");
});

test("each group page links the other ten, and none of them links itself", () => {
  for (const category of categories.all()) {
    const hrefs = [...bodies[category.slug].matchAll(/others__link" href="([^"]+)"/g)].map((match) => match[1]);

    assert.equal(hrefs.length, 10, `${category.slug}: the other ten`);
    assert.ok(!hrefs.includes(`/element-groups/${category.slug}/`), `${category.slug} links itself`);
  }
});

test("the group colour reaches the page as a token, from the token layer", () => {
  const swatches = [...bodies["noble-gases"].matchAll(/others__swatch" style="--fill:var\((--[a-z-]+)\)"/g)];

  assert.equal(swatches.length, 10, "one swatch per other group");

  for (const [, token] of swatches) {
    assert.ok(tokens.has(token.slice(2)), `${token} is not declared in tokens.css`);
  }
});

test("every group page renders, and every marker is filled", () => {
  for (const category of categories.all()) {
    const markup = bodies[category.slug];

    for (const marker of GROUP_PLACEHOLDERS) {
      assert.doesNotMatch(markup, new RegExp(`<!--\\s*${marker}\\s*-->`), `${category.slug}: ${marker}`);
    }

    assert.match(markup, new RegExp(`<h1>${category.name}</h1>`), `${category.slug}: its own name, singular`);
    assert.match(markup, /class="group__character">/, category.slug);
    assert.equal((markup.match(/class="card"/g) ?? []).length, category.count, category.slug);
  }
});

test("a slug that is not a group, or has no members, is refused rather than half-built", () => {
  assert.throws(() => render("not-a-group"), /not-a-group is not one of the eleven groups/);

  assert.throws(
    () => groupPage({ template, group: "halogens", elements: [], categories, groups, units, mode }),
    /has no members/,
  );
});

test("a group with no written copy stops the build rather than publishing a blank page", () => {
  assert.throws(
    () => groupPage({ template, group: "transition-metals", elements: all, categories, groups: { require: () => { throw new Error("no copy"); } }, units, mode }),
    /no copy/,
  );
});

test("every group page carries one heading and never skips a level, with unique ids", () => {
  for (const markup of Object.values(bodies)) {
    const levels = [...markup.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));

    assert.equal(levels.filter((level) => level === 1).length, 1);
    assert.equal(levels[0], 1);

    for (let index = 1; index < levels.length; index += 1) {
      assert.ok(levels[index] <= levels[index - 1] + 1, `h${levels[index]} follows h${levels[index - 1]}`);
    }

    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual([...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))], []);
  }
});

test("the eleven pages share one template and one stylesheet", () => {
  for (const category of categories.all()) {
    const page = { template: "group" };

    assert.equal(lastOwn(stylesheetsFor(page)), "/styles/pages/group.css");
    assert.deepEqual(scriptsFor(page), ["/scripts/app.js"]);

    for (const sheet of ["group-facts.css", "element-card.css", "periodic-table.css", "legend-chips.css"]) {
      assert.ok(
        componentStylesheetsFor(page).includes(`styles/components/${sheet}`),
        `a group page renders ${sheet} and does not declare it`,
      );
    }
  }
});

test("the stylesheets name no colour or size of their own", async () => {
  for (const relative of ["styles/pages/group.css", "styles/components/group-facts.css"]) {
    const css = await readFile(new URL(`../../${relative}`, import.meta.url), "utf8");
    const body = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@(media|container)[^{]*\{/g, "@x {");

    assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, `${relative} has a hex colour`);
    assert.doesNotMatch(body, /\b\d+(\.\d+)?(px|rem|em|vw)\b/, `${relative} has a size literal`);
  }
});