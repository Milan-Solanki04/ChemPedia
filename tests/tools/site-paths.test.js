import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  INDEX_FILE,
  NOT_FOUND_FILE,
  distDir,
  isInside,
  normalisePathname,
  outputFileForPath,
  projectRoot,
  sourceDir,
} from "../../tools/site-paths.js";

test("the project directories resolve to the repository layout", () => {
  assert.equal(sourceDir, path.join(projectRoot, "source"));
  assert.equal(distDir, path.join(projectRoot, "dist"));
});

test("a path without a file extension resolves to its index file", () => {
  assert.equal(outputFileForPath("/"), path.join(distDir, INDEX_FILE));
  assert.equal(outputFileForPath("/elements/"), path.join(distDir, "elements", INDEX_FILE));
});

test("a path with a file extension is used as it is", () => {
  assert.equal(outputFileForPath("/styles/tokens.css"), path.join(distDir, "styles", "tokens.css"));
  assert.equal(outputFileForPath("/index.html"), path.join(distDir, "index.html"));
});

test("the not-found document lives at the root of the built output", () => {
  assert.equal(path.join(distDir, NOT_FOUND_FILE), path.join(distDir, "404.html"));
});

test("a directory path is normalised to one leading and one trailing separator", () => {
  assert.equal(normalisePathname("/"), "/");
  assert.equal(normalisePathname("//elements//hydrogen//"), "/elements/hydrogen/");
  assert.equal(normalisePathname("/elements/hydrogen"), "/elements/hydrogen/");
});

test("a file path is normalised without a trailing separator", () => {
  assert.equal(normalisePathname("/styles/tokens.css"), "/styles/tokens.css");
  assert.equal(normalisePathname("/assets/brand/mark.svg/"), "/assets/brand/mark.svg");
});

test("a path that does not start with a separator is rejected", () => {
  assert.throws(() => normalisePathname("elements/hydrogen"), TypeError);
  assert.throws(() => normalisePathname(""), TypeError);
});

test("a path that would escape the build directory is rejected", () => {
  assert.throws(() => outputFileForPath("/../../secrets.txt"), RangeError);
  assert.throws(() => outputFileForPath("/../../"), RangeError);
});

test("a path inside the build directory is recognised as inside it", () => {
  assert.equal(isInside(distDir, distDir), true);
  assert.equal(isInside(distDir, path.join(distDir, "elements", INDEX_FILE)), true);
  assert.equal(isInside(distDir, path.join(projectRoot, "source")), false);
  assert.equal(isInside(distDir, `${distDir}-backup`), false, "a prefix is not a child");
});
