import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { createCategoriesRepository } from "../../scripts/data/categories-repository.js";
import { periodicTable } from "../../scripts/components/periodic-table.js";
import { UNKNOWN_KEY, createColourMode } from "../../scripts/lib/colour-modes.js";
import { readableForeground } from "../../scripts/lib/contrast.js";
import { domainOf, numericScale } from "../../scripts/lib/colour-scale.js";

/**
 * A stand-in for the browser's fetch that reads the real files from disk, so the markup under test is
 * the markup the site will render.
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
const tableCss = await readFile(new URL("../../styles/components/periodic-table.css", import.meta.url), "utf8");

/** The hex a token declares, read from the token layer rather than restated. */
function fillOf(token) {
  const match = tokens.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,6})`));

  assert.ok(match, `tokens.css does not declare ${token}`);

  return match[1];
}

const labels = Object.fromEntries(categories.all().map((category) => [category.slug, category.name]));

/** The mode a page would build, resolved against the real token layer. */
function mode(id, options = {}) {
  if (id === "group") {
    return createColourMode({
      mode: "group",
      labels,
      paint: (key) => {
        const fill = fillOf(categories.bySlug(key).token);

        return { fill, onFill: readableForeground(fill) };
      },
    });
  }

  if (id === "block") {
    return createColourMode({
      mode: "block",
      paint: (key) => {
        const fill = fillOf(`--g-${key}-block`);

        return { fill, onFill: readableForeground(fill) };
      },
    });
  }

  if (id === "state") {
    return createColourMode({
      mode: "state",
      paint: (key) => {
        const fill = fillOf(`--state-${key}`);

        return { fill, onFill: readableForeground(fill) };
      },
    });
  }

  const ramp = [1, 2, 3, 4, 5, 6].map((step) => fillOf(`--ramp-${step}`));
  const scale = numericScale({
    domain: domainOf(elements.all(), options.field),
    ramp,
    unknown: fillOf("--value-unknown"),
  });
  const bins = scale.bins();

  return createColourMode({
    mode: "value",
    scale,
    field: options.field,
    // A bin's colour is the bin's own step, and the unknown key is whatever the sources do not carry.
    paint: (key) => (key === UNKNOWN_KEY ? scale.colour(null) : bins[Number(key)]),
  });
}

const group = mode("group");
const markup = periodicTable({ elements: elements.all(), paint: group.paint });

test("every element is rendered, and nothing else is", () => {
  assert.equal((markup.match(/class="tile"/g) || []).length, 118);
  assert.equal((markup.match(/<li/g) || []).length, 118);
});

test("the table is a list of links, so it reads as a list and is reachable as links", () => {
  // The reference puts role="list" on the grid and role="listitem" on each of its 118 links, which
  // overrides the link role on every one of them. A list of real li elements needs no ARIA and
  // cannot get it wrong.
  assert.match(markup, /^<div class="ptable">\n<ul class="ptable__grid" aria-label="Periodic table of the elements">/);
  assert.equal((markup.match(/<a /g) || []).length, 118);
  assert.doesNotMatch(markup, /role=/, "a real list needs no roles");
});

test("each tile sits in the cell its own record names", () => {
  const cells = [...markup.matchAll(/<li class="ptable__cell" style="grid-column:(\d+);grid-row:(\d+)" data-cell="(\d+):(\d+)"/g)];

  assert.equal(cells.length, 118);

  for (const [, column, row, cellRow, cellColumn] of cells) {
    assert.equal(`${cellRow}:${cellColumn}`, `${row}:${column}`, "the cell and the placement disagree");
  }
});

test("the thirty f-block elements are in the two detached rows, columns 3 to 17", () => {
  const cells = [...markup.matchAll(/data-cell="(\d+):(\d+)"/g)].map(([, row, column]) => [Number(row), Number(column)]);
  const detached = cells.filter(([row]) => row === 9 || row === 10);

  assert.equal(detached.length, 30);

  for (const row of [9, 10]) {
    const columns = detached.filter(([r]) => r === row).map(([, column]) => column);

    assert.deepEqual(columns, Array.from({ length: 15 }, (_, index) => index + 3));
  }
});

test("no cell holds two tiles", () => {
  const cells = [...markup.matchAll(/data-cell="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(new Set(cells).size, 118);
});

test("each tile is painted in its category's colour, and carries the key to isolate it by", () => {
  const cells = [...markup.matchAll(/data-key="([a-z-]+)"[\s\S]{0,220}?--fill:(#[0-9a-fA-F]{6})/g)];
  const keys = new Set(cells.map(([, key]) => key));

  assert.deepEqual([...keys].sort(), categories.all().map((category) => category.slug).sort());

  for (const [, key, fill] of cells) {
    assert.equal(fill, fillOf(categories.bySlug(key).token), `${key} is painted in the wrong colour`);
  }
});

test("the whole grid is one tab stop, and it is the first tile in reading order", () => {
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 1);
  assert.equal((markup.match(/tabindex="-1"/g) || []).length, 117);

  const stop = /data-cell="(\d+:\d+)"[^>]*><a[^>]*tabindex="0"/.exec(markup);

  assert.equal(stop[1], "1:1");
});

test("the tab stop moves to wherever the reader is", () => {
  const moved = periodicTable({
    elements: elements.all(),
    paint: group.paint,
    tabStop: { row: 6, column: 11 },
  });
  const stop = /data-cell="(\d+:\d+)"[^>]*><a[^>]*tabindex="0"/.exec(moved);

  assert.equal(stop[1], "6:11");
  assert.equal((moved.match(/tabindex="0"/g) || []).length, 1);
});

test("a table cannot be rendered without a tab stop, because it would be unreachable", () => {
  const none = periodicTable({ elements: elements.all(), paint: group.paint, tabStop: null });

  assert.equal((none.match(/tabindex="0"/g) || []).length, 1, "null means the default, not no stop at all");
});

test("the tab stop is the first tile in reading order however the records were ordered", () => {
  // `elements.all()` is in atomic-number order, and reading order is not the same thing: the fifteen
  // lanthanides come at the end of atomic order and the fifteenth row of the grid. A default taken
  // from "the first element in the array" would be right by luck.
  const shuffled = [...elements.all()].reverse();
  const stop = /data-cell="(\d+:\d+)"[^>]*><a[^>]*tabindex="0"/.exec(periodicTable({ elements: shuffled, paint: group.paint }))[1];

  assert.equal(stop, "1:1");
});

test("the compact variant renders the same 118 tiles with no names", () => {
  const compact = periodicTable({ elements: elements.all(), paint: group.paint, variant: "compact" });

  assert.equal((compact.match(/class="tile tile--compact"/g) || []).length, 118);
  assert.doesNotMatch(compact, /tile__name/);
});

test("a mini table marks the element it is about", () => {
  const mini = periodicTable({
    elements: elements.all(),
    paint: group.paint,
    variant: "compact",
    highlighted: "iron",
  });

  assert.match(mini, /class="tile tile--compact is-on" href="\/elements\/iron\/"/);
});

test("the grid declares row 8 as a gap rather than leaving it empty by accident", () => {
  const body = tableCss.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(body, /grid-template-rows: repeat\(7, auto\) var\(--ptable-gap-row\) repeat\(2, auto\)/);
  assert.match(tokens, /--ptable-gap-row: 0\.6rem;/);
});

test("the narrow-screen rule is a scroll, a floor and an edge, and nothing else", () => {
  assert.match(tableCss, /@media \(max-width: 56rem\)/);
  assert.match(tableCss, /@media \(max-width: 40rem\)/);
  assert.match(tableCss, /overflow-x: auto/);
  assert.match(tableCss, /min-width: var\(--ptable-min-width\)/);
  assert.match(tableCss, /overscroll-behavior-x: contain/);
});

test("the table's stylesheet names no colour and no size of its own", () => {
  // The three breakpoints are the documented exception: a media query does not resolve a custom
  // property, so they are echoes of the line in tokens.css rather than separate decisions.
  const body = tableCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@media[^{]*\{/g, "@media {");

  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, "a hex colour outside the token layer");
  assert.doesNotMatch(body, /\b\d+(\.\d+)?(px|rem|em|vw)\b/, "a size literal outside the token layer");
});

test("the container is named, so the tile can ask how wide the table is", () => {
  // The tile's type and the table's gap both resolve against this container, and the tile's stylesheet
  // drops the name in response to it. An unnamed container cannot be queried by name.
  assert.match(tableCss, /container: ptable \/ inline-size;/);
  assert.match(tokens, /--gap-table: clamp\(1px, 0\.25cqw, 4px\)/, "the gap is measured against the table");
});

test("no tile carries a group class, so a colour mode is a colour and nothing more", () => {
  assert.doesNotMatch(markup, /class="tile [a-z-]*transition/);
  assert.doesNotMatch(markup, /--g-transition-metals/, "the tile names a token, not a value");
});