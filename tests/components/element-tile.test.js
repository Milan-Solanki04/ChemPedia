import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { createCategoriesRepository } from "../../scripts/data/categories-repository.js";
import { elementTile } from "../../scripts/components/element-tile.js";
import { contrastRatio, meetsAA, readableForeground } from "../../scripts/lib/contrast.js";

/**
 * A stand-in for the browser's fetch that reads the real files from disk, so the markup under test is
 * the markup the site will render for these records.
 *
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function fromDisk(url) {
  const name = url.split("/").pop();
  const body = await readFile(new URL(`../../data/${name}`, import.meta.url), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

const elements = await createElementsRepository({ fetchImpl: fromDisk });
const categories = await createCategoriesRepository({ fetchImpl: fromDisk });
const tokens = await readFile(new URL("../../styles/tokens.css", import.meta.url), "utf8");

const iron = elements.bySymbol("Fe");
const hydrogen = elements.bySymbol("H");
const lanthanum = elements.bySymbol("La");

const paint = { fill: "#f9aa62", onFill: "#12211f" };

const render = (element, options = {}) =>
  elementTile({
    element,
    paint,
    href: `/elements/${element.slug}/`,
    groupName: categories.nameFor(element.category),
    ...options,
  });

test("a tile carries the number, the symbol and the name", () => {
  const markup = render(iron);

  assert.match(markup, /<span class="tile__z">26<\/span>/);
  assert.match(markup, /<span class="tile__sym">Fe<\/span>/);
  assert.match(markup, /<span class="tile__name">Iron<\/span>/);
});

test("a tile links to the element's own page", () => {
  assert.match(render(iron), /href="\/elements\/iron\/"/);
});

test("a tile with no link is a span, because a sibling list is already inside a link", () => {
  // The group row links each tile; the element page marks the element it is about by passing no href,
  // and an anchor there would be an anchor inside an anchor, which no parser will recover from.
  const markup = elementTile({ element: iron, paint });

  assert.match(markup, /^<span /);
  assert.doesNotMatch(markup, /<a[\s>]/);
  assert.doesNotMatch(markup, /href=/);
  assert.match(markup, /Iron/, "it still carries the element it describes");
});

test("a tile is painted with the pair it was given, and names no group of its own", () => {
  const markup = render(iron);

  assert.match(markup, /--fill:#f9aa62;--on-fill:#12211f/);
  assert.doesNotMatch(markup, /transition-metal/, "the tile must not carry a category class");
  assert.doesNotMatch(markup, /--g-/, "the tile must not name a token");
});

test("every tile the categories can paint has text that reads on it", () => {
  // The tile is the one place a group colour meets a symbol and a number, so this is where a
  // category colour that fails contrast actually becomes unreadable. The fill is taken from the
  // token layer rather than restated, and the foreground is derived the way the site derives it.
  for (const category of categories.all()) {
    const token = tokens.match(new RegExp(`${category.token}:\\s*(#[0-9a-fA-F]{3,6})`));

    assert.ok(token, `tokens.css does not declare ${category.token}`);

    const element = elements.withCategory(category.slug)[0];
    const foreground = readableForeground(token[1]);
    const markup = render(element, { paint: { fill: token[1], onFill: foreground } });
    const ratio = contrastRatio(token[1], foreground);

    assert.match(markup, new RegExp(`--fill:${token[1]};--on-fill:${foreground}`));
    assert.ok(meetsAA(ratio), `${category.slug} on ${token[1]} is ${ratio.toFixed(2)}:1 with ${foreground}`);
  }
});

test("the compact variant drops the name and keeps the number and the symbol", () => {
  const markup = render(iron, { variant: "compact" });

  assert.match(markup, /tile--compact/);
  assert.doesNotMatch(markup, /tile__name/);
  assert.match(markup, /tile__sym">Fe</);
  assert.match(markup, /tile__z">26</);
});

test("an unknown variant is the detailed one rather than an empty tile", () => {
  assert.match(render(iron, { variant: "something-else" }), /tile__name">Iron</);
});

test("a tile names itself out loud, in full", () => {
  assert.match(
    render(iron),
    /aria-label="Iron, symbol Fe, atomic number 26, period 4, group 8, transition metal"/,
  );
});

test("the thirty f-block elements are named by their series, because they have no group", () => {
  // Saying "group none" would be inventing a value the table deliberately does not assign, and
  // omitting the period as well would leave the reader with the least informative name on the page.
  assert.match(
    render(lanthanum),
    /aria-label="Lanthanum, symbol La, atomic number 57, period 6, lanthanide"/,
  );
  assert.doesNotMatch(render(lanthanum), /group/);
});

test("a tile with no category name still says everything it knows", () => {
  assert.match(
    elementTile({ element: hydrogen, paint, href: "/elements/hydrogen/" }),
    /aria-label="Hydrogen, symbol H, atomic number 1, period 1, group 1"/,
  );
});

test("the pointer's tooltip carries the short form", () => {
  assert.match(render(iron), /title="Iron · Fe · 26"/);
});

test("a highlighted tile says so in a class, for a mini table to mark the current element", () => {
  assert.match(render(iron, { highlighted: true }), /class="tile is-on"/);
  assert.doesNotMatch(render(iron), /is-on/);
});

test("nothing an element record says can break out of the tile's markup", () => {
  const awkward = { ...iron, name: 'Fe <script>alert("x")</script>', symbol: "F&e" };
  const markup = elementTile({ element: awkward, paint, href: "/elements/iron/", groupName: 'a "quoted" name' });

  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
  assert.match(markup, /F&amp;e/);
  assert.doesNotMatch(markup, /="[^"]*"quoted"/);
});

test("a tile emits no grid placement of its own", () => {
  // Placement belongs to whoever lays tiles out. A tile that also declared a cell would make the
  // grid's geometry depend on a component that is meant to be reusable anywhere.
  const markup = render(iron);

  assert.doesNotMatch(markup, /grid-column/);
  assert.doesNotMatch(markup, /grid-row/);
});