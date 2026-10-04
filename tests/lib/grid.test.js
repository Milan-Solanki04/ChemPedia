import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import {
  DETACHED_ROWS,
  GAP_ROW,
  GRID_COLUMNS,
  GRID_ROWS,
  cellAt,
  cellKey,
  isInsideGrid,
  neighbour,
  occupiedCells,
  placementMap,
} from "../../scripts/lib/grid.js";

/**
 * A stand-in for the browser's fetch that reads the real file from disk, so the geometry under test
 * is the geometry the shipped grid will render rather than a fixture that could drift from it.
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
const cells = occupiedCells(placement);

test("the grid is eighteen columns by ten rows, with a gap row before the detached rows", () => {
  assert.equal(GRID_COLUMNS, 18);
  assert.equal(GRID_ROWS, 10);
  assert.equal(GAP_ROW, 8);
  assert.deepEqual(DETACHED_ROWS, [9, 10]);
});

test("a cell is inside the grid only if both coordinates are real", () => {
  assert.equal(isInsideGrid(1, 1), true);
  assert.equal(isInsideGrid(10, 18), true);
  assert.equal(isInsideGrid(0, 1), false);
  assert.equal(isInsideGrid(1, 19), false);
  assert.equal(isInsideGrid(11, 1), false);
  assert.equal(isInsideGrid(1.5, 1), false);
  assert.equal(isInsideGrid("1", 1), false);
});

test("every element lands in exactly one cell, and no cell holds two", () => {
  assert.equal(placement.size, 118);

  const seen = new Set();

  for (const { row, column } of cells) {
    const key = cellKey(row, column);

    assert.ok(!seen.has(key), `${key} holds two elements`);
    seen.add(key);
  }
});

test("the occupied cells are in reading order, and the reading order is not the atomic order", () => {
  assert.equal(cells.length, 118);
  assert.equal(cells[0].element.symbol, "H");

  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];

    assert.ok(
      previous.row < current.row || (previous.row === current.row && previous.column < current.column),
      `${previous.element.symbol} and ${current.element.symbol} are out of reading order`,
    );
  }

  // The last cell a reader reaches reading the grid is not the heaviest element. Row 7 ends at
  // oganesson in column 18; rows 9 and 10 then run from column 3 to column 17, so the last cell in
  // reading order is lutetium's neighbour in the actinide row.
  assert.equal(cells.at(-1).element.symbol, "Lr");
  assert.deepEqual(cells.at(-1), { row: 10, column: 17, element: cells.at(-1).element });
});

test("the cells the plan calls out by name are the cells the grid holds", () => {
  const at = (symbol) => {
    const found = cells.find((cell) => cell.element.symbol === symbol);

    return { row: found.row, column: found.column };
  };

  assert.deepEqual(at("H"), { row: 1, column: 1 });
  assert.deepEqual(at("He"), { row: 1, column: 18 });
  assert.deepEqual(at("Li"), { row: 2, column: 1 });
  assert.deepEqual(at("Ne"), { row: 2, column: 18 });
  assert.deepEqual(at("Fe"), { row: 4, column: 8 });
  assert.deepEqual(at("Og"), { row: 7, column: 18 });

  // Every lanthanide and every actinide, which is what the exit criterion names.
  assert.deepEqual(at("La"), { row: 9, column: 3 });
  assert.deepEqual(at("Lu"), { row: 9, column: 17 });
  assert.deepEqual(at("Ac"), { row: 10, column: 3 });
  assert.deepEqual(at("Lr"), { row: 10, column: 17 });
});

test("the gap row and the early d-block gap are empty, not collapsed", () => {
  assert.equal(cellAt(placement, GAP_ROW, 1), null, "the gap row should hold nothing");
  assert.equal(cellAt(placement, 1, 3), null, "period 1 has no d block");
  assert.equal(cellAt(placement, 3, 6), null, "period 3 has no d block either");
  assert.equal(cellAt(placement, 6, 3), null, "column 3 is empty where the f block was pulled out");
  assert.equal(cellAt(placement, 0, 0), null);
  assert.equal(cellAt(placement, 7, 19), null);
});

test("moving along a row skips the empty cells in between", () => {
  const hydrogen = cells.find((cell) => cell.element.symbol === "H");
  const helium = cells.find((cell) => cell.element.symbol === "He");

  assert.equal(neighbour(placement, hydrogen, "right").element.symbol, "He");
  assert.equal(neighbour(placement, helium, "left").element.symbol, "H");

  // Aluminium is in row 3, column 13. Every cell from column 3 to column 12 in that row is empty,
  // because the d block does not begin until period 4, so the nearest tile to its left is magnesium
  // and not beryllium — which is on the row above.
  const aluminium = cells.find((cell) => cell.element.symbol === "Al");

  assert.deepEqual({ row: aluminium.row, column: aluminium.column }, { row: 3, column: 13 });
  assert.equal(neighbour(placement, aluminium, "left").element.symbol, "Mg");
  assert.equal(neighbour(placement, aluminium, "left").column, 2);
});

test("moving along a column skips the empty cells in between", () => {
  const hydrogen = cells.find((cell) => cell.element.symbol === "H");
  const helium = cells.find((cell) => cell.element.symbol === "He");
  const lithium = cells.find((cell) => cell.element.symbol === "Li");
  const neon = cells.find((cell) => cell.element.symbol === "Ne");

  assert.equal(neighbour(placement, hydrogen, "down").element.symbol, "Li");
  assert.equal(neighbour(placement, helium, "down").element.symbol, "Ne");
  assert.equal(neighbour(placement, lithium, "up").element.symbol, "H");
  assert.equal(neighbour(placement, neon, "up").element.symbol, "He");
});

test("moving up out of a detached row looks past every gap it meets", () => {
  const lanthanum = cells.find((cell) => cell.element.symbol === "La");
  const actinium = cells.find((cell) => cell.element.symbol === "Ac");

  // Two gaps stand between actinium and the main table. Row 8 is the declared gap row, and column
  // 3 is empty in rows 6 and 7 because the f block was pulled out of the body of the table — so the
  // first tile above actinium is lanthanum, and the first tile above lanthanum is yttrium.
  assert.equal(neighbour(placement, actinium, "up").element.symbol, "La");
  assert.equal(neighbour(placement, lanthanum, "up").element.symbol, "Y");
  assert.equal(neighbour(placement, lanthanum, "up").row, 5);

  // Rutherfordium sits in column 4, the first column the f block never occupied, so it reaches the
  // main table in a single step.
  const rutherfordium = cells.find((cell) => cell.element.symbol === "Rf");

  assert.equal(neighbour(placement, rutherfordium, "up").element.symbol, "Hf");
  assert.equal(neighbour(placement, rutherfordium, "up").row, 6);
});

test("moving never changes the axis a reader asked about", () => {
  for (const cell of cells) {
    for (const direction of ["left", "right"]) {
      const found = neighbour(placement, cell, direction);

      if (found) {
        assert.equal(found.row, cell.row, `${cell.element.symbol} changed row moving ${direction}`);
      }
    }

    for (const direction of ["up", "down"]) {
      const found = neighbour(placement, cell, direction);

      if (found) {
        assert.equal(found.column, cell.column, `${cell.element.symbol} changed column moving ${direction}`);
      }
    }
  }
});

test("at the edge of the grid there is nowhere to go, and nothing is invented", () => {
  const at = (symbol) => cells.find((cell) => cell.element.symbol === symbol);

  assert.equal(neighbour(placement, at("H"), "left"), null);
  assert.equal(neighbour(placement, at("H"), "up"), null);
  assert.equal(neighbour(placement, at("He"), "right"), null);
  assert.equal(neighbour(placement, at("He"), "up"), null);
  assert.equal(neighbour(placement, at("Og"), "right"), null);
  assert.equal(neighbour(placement, at("Og"), "down"), null);
  assert.equal(neighbour(placement, at("Lr"), "down"), null, "row 10 is the last row");

  // The edge of the grid is not the edge of reading: lawrencium is last in the actinide row, and
  // lutetium above it still has something below it.
  assert.equal(neighbour(placement, at("Lu"), "down").element.symbol, "Lr");
});

test("a direction that is not one of the four moves nothing", () => {
  const hydrogen = cells.find((cell) => cell.element.symbol === "H");

  assert.equal(neighbour(placement, hydrogen, "diagonally"), null);
  assert.equal(neighbour(placement, hydrogen, "PageDown"), null);
});

test("a record with no usable position is left out rather than breaking the grid", () => {
  const partial = placementMap([
    { symbol: "H", position: { row: 1, column: 1 } },
    { symbol: "X", position: null },
    { symbol: "Y", position: { row: 4, column: 19 } },
  ]);

  assert.equal(partial.size, 1);
  assert.equal(cellAt(partial, 1, 1).symbol, "H");
  assert.equal(cellAt(partial, 4, 19), null);
});