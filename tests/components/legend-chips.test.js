import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { createCategoriesRepository } from "../../scripts/data/categories-repository.js";
import { legendChips } from "../../scripts/components/legend-chips.js";
import { readableForeground } from "../../scripts/lib/contrast.js";

/**
 * A stand-in for the browser's fetch that reads the real files from disk.
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
const chipCss = await readFile(new URL("../../styles/components/legend-chips.css", import.meta.url), "utf8");

/** The paint a category's chip gets: its token's value, and the foreground derived for it. */
function paintFor(slug) {
  const { token } = categories.bySlug(slug);
  const fill = tokens.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,6})`))[1];

  return { fill, onFill: readableForeground(fill) };
}

const entries = categories.all().map((category) => ({
  key: category.slug,
  label: category.name,
  count: elements.withCategory(category.slug).length,
  paint: paintFor(category.slug),
}));

const markup = legendChips({ entries });

test("there is one chip per category, in the legend's order", () => {
  assert.equal((markup.match(/class="chip"/g) || []).length, 11);

  const order = [...markup.matchAll(/data-key="([a-z-]+)"/g)].map((match) => match[1]);

  assert.deepEqual(order, categories.all().map((category) => category.slug));
});

test("a chip is a button, so it says what it does when pressed", () => {
  // A chip changes what the table shows. It is not a destination yet, so it is not a link.
  assert.match(markup, /<button type="button"/);
  assert.doesNotMatch(markup, /<a /);
  assert.equal((markup.match(/aria-pressed="false"/g) || []).length, 11);
});

test("every chip carries the count its category actually has", () => {
  const printed = [...markup.matchAll(/chip__n" aria-hidden="true">(\d+)</g)].map((match) => Number(match[1]));

  assert.deepEqual(printed, entries.map((entry) => entry.count), "a chip printed a count the data disagrees with");
  assert.equal(
    printed.reduce((sum, count) => sum + count, 0),
    118,
  );
});

test("the count is in the accessible name and not read twice", () => {
  assert.match(
    markup,
    /aria-label="Transition metal, 35 elements"><span class="chip__label">Transition metal<\/span><span class="chip__n" aria-hidden="true">35<\/span>/,
  );
});

test("a chip of one element is named in the singular", () => {
  assert.match(
    legendChips({ entries: [{ key: "a", label: "Alkali metal", count: 1, paint: paintFor("alkali-metals") }] }),
    /aria-label="Alkali metal, 1 element"/,
  );
});

test("a chip paints itself with the pair it was given, and names no token", () => {
  const chip = /<li><button[^>]*data-key="lanthanides"[^>]*>/.exec(markup)[0];

  assert.match(chip, /--fill:#d473a2;--on-fill:#12211f/);
  assert.doesNotMatch(chip, /--g-/);
});

test("a pressed chip says so, in the attribute the isolation code sets", () => {
  const pressed = legendChips({
    entries: [{ ...entries[0], active: true }, entries[1]],
  });

  assert.match(pressed, /class="chip is-active" data-key="transition-metals"[^>]*aria-pressed="true"/);
  assert.match(pressed, /class="chip" data-key="actinides"[^>]*aria-pressed="false"/);
});

test("the count is hidden from the accessibility tree, because the label already says it", () => {
  assert.equal((markup.match(/aria-hidden="true"/g) || []).length, 11);
});

test("the legend is a list, and the heading is left to the page", () => {
  assert.match(markup, /^<ul class="legend">/);
  assert.equal((markup.match(/<li>/g) || []).length, 11);
  assert.doesNotMatch(markup, /<h[1-6]/, "the page owns the heading, so it can choose its level");
});

test("nothing a category is called can break out of the chip's markup", () => {
  const awkward = legendChips({
    entries: [{ key: 'a"b', label: 'Gas "quoted" & <b>', count: 3, paint: { fill: "#e57860", onFill: "#12211f" } }],
  });

  assert.match(awkward, /data-key="a&quot;b"/);
  assert.match(awkward, /Gas &quot;quoted&quot; &amp; &lt;b&gt;/);
  assert.doesNotMatch(awkward, /<b>/);
});

test("the chip's padding scales with its own type, and its wash follows its own ink", () => {
  assert.match(chipCss, /padding-block: var\(--chip-pad-block\)/);
  assert.match(tokens, /--chip-pad-block: 0\.32em;/, "padding in em, so it scales with the chip's font size");
  assert.match(chipCss, /color-mix\(in srgb, var\(--on-fill\) var\(--chip-count-wash\), transparent\)/);
  assert.match(chipCss, /font-variant-numeric: tabular-nums;/);
});

test("the chip stylesheet names no colour and no size of its own", () => {
  const body = chipCss.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}/, "a hex colour outside the token layer");
  assert.doesNotMatch(body, /\b\d+(\.\d+)?(px|rem|em)\b/, "a size literal outside the token layer");
});