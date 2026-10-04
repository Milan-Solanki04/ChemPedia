import { test } from "node:test";
import assert from "node:assert/strict";

import {
  shellsFromConfiguration,
  valenceFromShells,
} from "../../tools/data-sources/configuration.js";

test("a bare configuration expands from hydrogen", () => {
  assert.deepEqual(shellsFromConfiguration("1s1"), [1]);
  assert.deepEqual(shellsFromConfiguration("1s2"), [2]);
  assert.deepEqual(shellsFromConfiguration("1s2 2s2 2p2"), [2, 4]);
});

test("a noble-gas core expands to the shell populations of that gas", () => {
  assert.deepEqual(shellsFromConfiguration("[He]2s2 2p2"), [2, 4]);
  assert.deepEqual(shellsFromConfiguration("[Ne]3s1"), [2, 8, 1]);
});

test("iron expands to the shell populations a diagram would draw", () => {
  assert.deepEqual(shellsFromConfiguration("[Ar]4s2 3d6"), [2, 8, 14, 2]);
});

test("gold expands to six shells, not to the filling order's guess", () => {
  // Madelung order would put nine electrons in shell five and two in shell six. Gold is 5d10 6s1.
  assert.deepEqual(shellsFromConfiguration("[Xe]6s1 4f14 5d10"), [2, 8, 18, 32, 18, 1]);
});

test("uranium expands with its f electrons in shell five", () => {
  assert.deepEqual(shellsFromConfiguration("[Rn]7s2 5f3 6d1"), [2, 8, 18, 32, 21, 9, 2]);
});

test("a predicted configuration is read the same as a measured one", () => {
  assert.deepEqual(shellsFromConfiguration("[Rn]7s2 7p6 5f14 6d10 (predicted)"), [
    2, 8, 18, 32, 32, 18, 8,
  ]);
});

test("the order of the subshells does not change the answer", () => {
  assert.deepEqual(
    shellsFromConfiguration("[Rn]7s2 5f3 6d1"),
    shellsFromConfiguration("[Rn]5f3 6d1 7s2"),
  );
});

test("a configuration that cannot be read is refused rather than guessed at", () => {
  assert.throws(() => shellsFromConfiguration(""), TypeError);
  assert.throws(() => shellsFromConfiguration(null), TypeError);
  assert.throws(() => shellsFromConfiguration("[Xx]2s1"), TypeError);
  assert.throws(() => shellsFromConfiguration("[He]"), TypeError);
  assert.throws(() => shellsFromConfiguration("nonsense"), TypeError);
});

test("a principal shell outside the seven the table uses is refused", () => {
  assert.throws(() => shellsFromConfiguration("8s1"), RangeError);
  assert.throws(() => shellsFromConfiguration("0s1"), RangeError);
});

test("empty shells above the outermost occupied one are dropped", () => {
  assert.deepEqual(shellsFromConfiguration("1s1"), [1], "hydrogen has one shell, not seven");
});

test("valence is the outermost shell's electron count", () => {
  assert.equal(valenceFromShells([1]), 1);
  assert.equal(valenceFromShells([2, 4]), 4);
  assert.equal(valenceFromShells([2, 8, 14, 2]), 2);
  assert.equal(valenceFromShells([]), 0);
});
