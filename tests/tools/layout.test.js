import { test } from "node:test";
import assert from "node:assert/strict";

import { blockFor, groupFor, periodFor, positionFor } from "../../tools/data-sources/layout.js";

const NUMBERS = Array.from({ length: 118 }, (_, index) => index + 1);

test("periods follow the rows of the table", () => {
  assert.equal(periodFor(1), 1);
  assert.equal(periodFor(2), 1);
  assert.equal(periodFor(3), 2);
  assert.equal(periodFor(10), 2);
  assert.equal(periodFor(11), 3);
  assert.equal(periodFor(36), 4);
  assert.equal(periodFor(54), 5);
  assert.equal(periodFor(86), 6);
  assert.equal(periodFor(118), 7);
});

test("the lanthanides are period six and the actinides period seven", () => {
  assert.equal(periodFor(57), 6);
  assert.equal(periodFor(71), 6);
  assert.equal(periodFor(89), 7);
  assert.equal(periodFor(103), 7);
});

test("groups are the columns, and the two detached rows have none", () => {
  assert.equal(groupFor(1), 1);
  assert.equal(groupFor(2), 18);
  assert.equal(groupFor(5), 13);
  assert.equal(groupFor(26), 8);
  assert.equal(groupFor(72), 4);
  assert.equal(groupFor(86), 18);
  assert.equal(groupFor(57), null);
  assert.equal(groupFor(71), null);
  assert.equal(groupFor(89), null);
  assert.equal(groupFor(103), null);
});

test("blocks follow the subshell being filled, and helium is the exception", () => {
  assert.equal(blockFor(1), "s");
  assert.equal(blockFor(2), "s", "helium sits in group 18 but fills 1s");
  assert.equal(blockFor(4), "s");
  assert.equal(blockFor(24), "d");
  assert.equal(blockFor(30), "d");
  assert.equal(blockFor(6), "p");
  assert.equal(blockFor(18), "p");
  assert.equal(blockFor(57), "f");
  assert.equal(blockFor(92), "f");
});

test("the grid cells match the table's shape", () => {
  assert.deepEqual(positionFor(1), { row: 1, column: 1 });
  assert.deepEqual(positionFor(2), { row: 1, column: 18 });
  assert.deepEqual(positionFor(5), { row: 2, column: 13 });
  assert.deepEqual(positionFor(57), { row: 9, column: 3 });
  assert.deepEqual(positionFor(71), { row: 9, column: 17 });
  assert.deepEqual(positionFor(72), { row: 6, column: 4 });
  assert.deepEqual(positionFor(86), { row: 6, column: 18 });
  assert.deepEqual(positionFor(89), { row: 10, column: 3 });
  assert.deepEqual(positionFor(103), { row: 10, column: 17 });
  assert.deepEqual(positionFor(104), { row: 7, column: 4 });
  assert.deepEqual(positionFor(118), { row: 7, column: 18 });
});

test("the detached rows sit below an empty row eight", () => {
  assert.ok(
    !NUMBERS.some((number) => positionFor(number).row === 8),
    "row 8 is the gap that separates the detached rows from the body",
  );
});

test("no two elements are drawn in the same cell", () => {
  const seen = new Map();

  for (const number of NUMBERS) {
    const { row, column } = positionFor(number);
    const cell = `${row}:${column}`;

    assert.equal(seen.get(cell), undefined, `${number} collides with ${seen.get(cell)} at ${cell}`);
    seen.set(cell, number);
  }
});

test("every main-table element lands in a real group and column", () => {
  for (const number of NUMBERS) {
    const { row, column } = positionFor(number);

    assert.ok(column >= 1 && column <= 18, `${number} is in column ${column}`);
    assert.ok(row >= 1 && row <= 10, `${number} is in row ${row}`);

    if (row <= 7) {
      assert.equal(groupFor(number), column, `${number}: group should be its column`);
    }
  }
});

test("the lanthanides and actinides are contiguous in their rows", () => {
  for (const [first, last, row] of [
    [57, 71, 9],
    [89, 103, 10],
  ]) {
    const columns = Array.from({ length: last - first + 1 }, (_, index) => positionFor(first + index));

    assert.ok(columns.every((cell) => cell.row === row));
    assert.deepEqual(
      columns.map((cell) => cell.column),
      Array.from({ length: 15 }, (_, index) => index + 3),
    );
  }
});
