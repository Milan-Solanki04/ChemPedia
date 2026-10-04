import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { createCategoriesRepository } from "../../scripts/data/categories-repository.js";
import { createUnitsRepository } from "../../scripts/data/units-repository.js";
import { elementCard } from "../../scripts/components/element-card.js";
import { contrastRatio, meetsAA, readableForeground } from "../../scripts/lib/contrast.js";
import { formatMeasurement, formatNumber } from "../../scripts/lib/format.js";

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
const units = await createUnitsRepository({ fetchImpl: fromDisk });

const iron = elements.bySymbol("Fe");
const hydrogen = elements.bySymbol("H");
const lanthanum = elements.bySymbol("La");
const fermium = elements.bySymbol("Fm");
const tokens = await readFile(new URL("../../styles/tokens.css", import.meta.url), "utf8");

const paint = { fill: "#f9aa62", onFill: "#12211f" };

const render = (element, options = {}) =>
  elementCard({
    element,
    paint,
    href: `/elements/${element.slug}/`,
    groupName: categories.nameFor(element.category),
    units,
    ...options,
  });

test("a card carries the name, its group, and its weight and state", () => {
  const markup = render(iron);

  assert.match(markup, /<span class="card__name">Iron<\/span>/);
  assert.match(markup, /<span class="card__group">Transition metal<\/span>/);
  assert.match(markup, /<span class="card__figures">55\.84 · Solid<\/span>/);
});

test("the card is the link, and the tile inside it is not", () => {
  // An anchor inside an anchor is invalid markup that browsers and screen readers disagree about, so
  // the card takes the link and the tile gives it up.
  const markup = render(iron);
  const anchors = markup.match(/<a[\s>]/g) ?? [];

  assert.equal(anchors.length, 1, "the card is the only anchor");
  assert.match(markup, /<span class="tile tile--compact"/, "the tile is a span, and the compact one");
  assert.match(markup, /href="\/elements\/iron\/"/);
});

test("the tile is the compact variant, because the card prints the name beside it", () => {
  const markup = render(iron);

  assert.doesNotMatch(markup, /tile__name/, "a detailed tile would print the name twice");
});

test("the weight is formatted through the unit layer, without the unit", () => {
  // The digits have to agree with the properties sidebar, which is why they go through the same unit
  // definition rather than through `String()`. The unit itself is dropped: "55.84 u" on a card is a
  // unit of atomic mass stated to a reader who is browsing, and the sidebar is where it belongs.
  assert.match(render(hydrogen), /1\.008 · Gas/);
  assert.match(render(iron), /55\.84 · Solid/);

  const digits = formatNumber(iron.atomicWeight, units.definitionFor("atomicWeight"));
  const sidebar = formatMeasurement(iron.atomicWeight, units.definitionFor("atomicWeight"));

  assert.ok(sidebar.startsWith(digits), "the sidebar shows the same digits as the card");
  assert.match(render(iron), new RegExp(`card__figures">${digits} · Solid<`));
  assert.doesNotMatch(render(iron), /card__figures">[^<]*u</, "the card does not carry the unit");
});

test("a state is a word and is capitalised; a weight is a figure and takes tabular numerals", () => {
  const markup = render(iron);

  assert.match(markup, /· Solid</);
  assert.doesNotMatch(markup, /card__figures">55\.84 · solid</);
});

test("an f-block element is named by its category, because it has no group", () => {
  // Lanthanum genuinely has no group in this table, so the card's second line is the category it
  // belongs to rather than a missing value, and the card keeps the same three lines as every other.
  const markup = render(lanthanum);

  assert.match(markup, /card__group">Lanthanide</);
  assert.match(markup, /card__figures">138\.91 · Solid</);
  assert.equal((markup.match(/card__(name|group|figures)/g) ?? []).length, 3);
});

test("the card carries the group's colours as custom properties, so it holds no colour of its own", () => {
  const markup = render(iron, { paint: { fill: "#0f5f5c", onFill: "#fffdf7" } });

  assert.match(markup, /--fill:#0f5f5c;--on-fill:#fffdf7/);
});

test("an element with no group is still a card that says everything it knows", () => {
  const markup = render(fermium, { groupName: null });

  assert.doesNotMatch(markup, /card__group/);
  assert.match(markup, /card__name">Fermium</);
  assert.match(markup, /card__figures/);
});

test("every card the categories can paint has text that reads on it", () => {
  // The tile is the one place a group colour meets a symbol and a number, and the card's three lines
  // of text sit beside it in the page ink. The fill comes from the token layer rather than being
  // restated, and the tile's foreground is derived the way the site derives it.
  for (const category of categories.all()) {
    const token = tokens.match(new RegExp(`${category.token}:\\s*(#[0-9a-fA-F]{3,6})`));

    assert.ok(token, `tokens.css does not declare ${category.token}`);

    const element = elements.withCategory(category.slug)[0];
    const foreground = readableForeground(token[1]);
    const markup = render(element, { paint: { fill: token[1], onFill: foreground } });

    assert.match(markup, new RegExp(`--fill:${token[1]};--on-fill:${foreground}`));
    assert.ok(
      meetsAA(contrastRatio(token[1], foreground)),
      `${category.slug} on ${token[1]} does not read`,
    );
  }
});

test("all 118 elements produce a card, and every one names itself", () => {
  for (const element of elements.all()) {
    const markup = render(element, { groupName: null });

    assert.match(markup, new RegExp(`card__name">${element.name}<`));
    assert.match(markup, new RegExp(`href="/elements/${element.slug}/"`));
  }
});

test("nothing an element record says can break out of the card's markup", () => {
  const awkward = {
    ...iron,
    name: 'Iron "><script>alert(1)</script>',
    slug: "iron",
  };

  const markup = elementCard({
    element: awkward,
    paint,
    href: '/elements/iron/"><script>alert(1)</script>',
    groupName: 'Transition "metal',
    units,
  });

  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});