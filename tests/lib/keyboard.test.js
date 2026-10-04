import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { placementMap } from "../../scripts/lib/grid.js";
import {
  MOVEMENT_KEYS,
  destination,
  initialTabStop,
  isTabStop,
  movementFor,
} from "../../scripts/lib/keyboard.js";

/**
 * A stand-in for the browser's fetch that reads the real file from disk, so the keyboard behaviour
 * is asserted against the grid the browser will actually render.
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
const placement = placementMap(elements.all());

/** @param {string} symbol */
function cellOf(symbol) {
  const element = elements.bySymbol(symbol);

  return { row: element.position.row, column: element.position.column };
}

test("the grid handles the four arrows and the two ends of a row, and nothing else", () => {
  assert.deepEqual(MOVEMENT_KEYS.sort(), ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home"]);

  assert.equal(movementFor("ArrowUp"), "up");
  assert.equal(movementFor("End"), "row-end");
  assert.equal(movementFor("Tab"), null);
  assert.equal(movementFor("Escape"), null);
  assert.equal(movementFor("a"), null);
  assert.equal(movementFor("PageDown"), null);
});

test("the table's single tab stop starts at the first tile in reading order", () => {
  const start = initialTabStop(placement);

  assert.deepEqual({ row: start.row, column: start.column }, { row: 1, column: 1 });
  assert.equal(start.element.symbol, "H");
});

test("an empty grid offers no tab stop rather than an exception", () => {
  assert.equal(initialTabStop(new Map()), null);
});

test("the arrows move the reader a cell at a time", () => {
  assert.equal(destination(placement, cellOf("H"), "ArrowRight").element.symbol, "He");
  assert.equal(destination(placement, cellOf("He"), "ArrowLeft").element.symbol, "H");
  assert.equal(destination(placement, cellOf("H"), "ArrowDown").element.symbol, "Li");
  assert.equal(destination(placement, cellOf("Li"), "ArrowUp").element.symbol, "H");
});

test("the arrows reach across the table's gaps, because those are the tiles a reader means", () => {
  // Eleven empty cells stand between aluminium and magnesium, and one empty cell stands between the
  // two detached rows and the body of the table. A key that stopped at the first gap would feel
  // broken on the two places a reader most wants to move.
  assert.equal(destination(placement, cellOf("Al"), "ArrowLeft").element.symbol, "Mg");
  assert.equal(destination(placement, cellOf("Rf"), "ArrowUp").element.symbol, "Hf");
});

test("Home and End reach the two ends of the row the reader is in", () => {
  assert.equal(destination(placement, cellOf("Fe"), "Home").element.symbol, "K");
  assert.equal(destination(placement, cellOf("Fe"), "End").element.symbol, "Kr");
  assert.equal(destination(placement, cellOf("Ra"), "End").element.symbol, "Og");
  assert.equal(destination(placement, cellOf("La"), "Home").element.symbol, "La");
  assert.equal(destination(placement, cellOf("Lu"), "End").element.symbol, "Lu");
});

test("Home and End do not leave the row", () => {
  for (const key of ["Home", "End"]) {
    const landing = destination(placement, cellOf("Fe"), key);

    assert.equal(landing.row, 4, `${key} changed the row`);
  }
});

test("a key the grid does not handle leaves the browser to it", () => {
  assert.equal(destination(placement, cellOf("H"), "Tab"), null);
  assert.equal(destination(placement, cellOf("H"), "PageDown"), null);
  assert.equal(destination(placement, cellOf("H"), " "), null);
});

test("at the edge of the grid the reader stays put rather than wrapping or jumping", () => {
  assert.equal(destination(placement, cellOf("H"), "ArrowLeft"), null);
  assert.equal(destination(placement, cellOf("H"), "ArrowUp"), null);
  assert.equal(destination(placement, cellOf("Og"), "ArrowRight"), null);
  assert.equal(destination(placement, cellOf("Og"), "ArrowDown"), null);
});

test("a reader with nowhere to go in a direction has no destination at all", () => {
  assert.equal(destination(placement, null, "ArrowRight"), null);
  assert.equal(destination(new Map(), cellOf("H"), "ArrowRight"), null);
});

test("exactly one tile offers itself to Tab, and none does until the reader has moved", () => {
  const cells = [
    { row: 1, column: 1 },
    { row: 1, column: 18 },
    { row: 2, column: 1 },
  ];

  assert.equal(cells.filter((cell) => isTabStop(cell, null)).length, 0);

  const active = destination(placement, cellOf("H"), "ArrowRight");

  assert.equal(cells.filter((cell) => isTabStop(cell, active)).length, 1);
  assert.equal(isTabStop({ row: 1, column: 18 }, active), true);
  assert.equal(isTabStop({ row: 1, column: 1 }, active), false);
});

test("every one of the 118 tiles can be reached from the first one using only the keys", () => {
  // The exit criterion is that the arrow keys traverse the grid. It is worth asserting rather than
  // assuming: the f-block rows are reached from above through a column the block never occupied, and
  // a scan that stopped at the gap row would strand all thirty of them.
  const seen = new Set();
  const queue = [initialTabStop(placement)];

  while (queue.length > 0) {
    const cell = queue.shift();
    const key = `${cell.row}:${cell.column}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    for (const movementKey of MOVEMENT_KEYS) {
      const landing = destination(placement, cell, movementKey);

      if (landing && !seen.has(`${landing.row}:${landing.column}`)) {
        queue.push(landing);
      }
    }
  }

  assert.equal(seen.size, 118);

  for (const { row, column } of [
    { row: 9, column: 3 },
    { row: 9, column: 17 },
    { row: 10, column: 3 },
    { row: 10, column: 17 },
    { row: 7, column: 18 },
  ]) {
    assert.equal(seen.has(`${row}:${column}`), true, `${row}:${column} is unreachable`);
  }
});