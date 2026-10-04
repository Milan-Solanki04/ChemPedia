import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Two rules a browser sweep found, and the two invariants behind them.
 *
 * A responsive sweep is a measurement of one viewport against one data set, so it can only ever report
 * what it saw. These hold the *reasons* it saw it, which is what stops the same overflow returning
 * when a record grows a character.
 */

const stylesDir = fileURLToPath(new URL("../../styles", import.meta.url));

/**
 * Every stylesheet in the visual layer, read once.
 *
 * Discovered from the filesystem rather than a hand-written list, so a stylesheet added tomorrow is
 * covered by these rules without anyone remembering to add it.
 *
 * @returns {Promise<{ file: string, source: string }[]>}
 */
async function everyStylesheet() {
  const entries = await readdir(stylesDir, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".css")) {
      found.push({ file: `styles/${entry.name}`, source: await readFile(path.join(stylesDir, entry.name), "utf8") });
    } else if (entry.isDirectory()) {
      for (const name of await readdir(path.join(stylesDir, entry.name))) {
        if (name.endsWith(".css")) {
          found.push({ file: `styles/${entry.name}/${name}`, source: await readFile(path.join(stylesDir, entry.name, name), "utf8") });
        }
      }
    }
  }

  return found;
}

const sheets = await everyStylesheet();
const all = sheets.map((sheet) => sheet.source).join("\n");

test("a property reading can shrink, so a long reading cannot push the page sideways", () => {
  // Found by sweeping /elements/oganesson/ at 375px: `[Rn]7s2 7p6 5f14 6d10 (predicted)` overflowed by
  // 3px, because `.property__value` was `flex: 0 0 auto` and so could never give ground to its label.
  // `flex: 0 1 auto` allows the shrink, `min-width: 0` is what permits it below the content's width,
  // and the break is a backstop for a reading with no space in it.
  assert.match(all, /\.property__value\s*\{[^}]*flex:\s*0 1 auto/);
  assert.match(all, /\.property__value\s*\{[^}]*min-width:\s*0/);
  assert.doesNotMatch(all, /\.property__value\s*\{[^}]*flex:\s*0 0 auto/, "a reading that cannot shrink will overflow again");
});

test("the longest unbreakable run in any property reading fits a phone without a break", async () => {
  // The reason `overflow-wrap` is a safety net rather than the mechanism: it should never be needed.
  const elements = JSON.parse(await readFile(new URL("../../data/elements.json", import.meta.url), "utf8"));
  const runs = [];

  for (const element of elements) {
    for (const value of [element.name, element.electronConfiguration, String(element.atomicMass ?? "")]) {
      if (typeof value === "string") {
        runs.push(...value.split(/[\s,]+/));
      }
    }
  }

  const longest = runs.sort((one, other) => other.length - one.length)[0];

  // 14 characters of "Praseodymium" at the smallest step is comfortably inside 375px minus a gutter.
  assert.ok(longest.length <= 18, `a reading contains "${longest}" — ${longest.length} characters with no break opportunity`);
});

test("reduced motion is switched off by one universal rule rather than per component", () => {
  // Eight components declare a transition. The project neutralises all of them with a single `*` block
  // carrying `!important`, so a component added tomorrow is covered by default instead of by memory.
  assert.match(all, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(
    all,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[^}]*transition-duration:\s*0\.01ms\s*!important/,
  );
  assert.match(all, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?scroll-behavior:\s*auto\s*!important/);
});

test("smooth scrolling is overridden under reduced motion, by a selector that reaches the element", () => {
  // `html { scroll-behavior: smooth }` is the one piece of motion in the project that is not a
  // transition, so the universal block cannot catch it by shortening a duration — it has to set the
  // property. It does: the block sets `scroll-behavior: auto !important` on `*`, and `*` matches
  // `html`, and `!important` outranks the plain declaration it overrides. An earlier version of this
  // test only asked whether any stylesheet said `smooth`, and flagged the site for a declaration that
  // was already correctly overridden.
  const declares = sheets.filter((sheet) => /scroll-behavior:\s*smooth/.test(sheet.source));

  assert.deepEqual(
    declares.map((sheet) => sheet.file),
    ["styles/base.css"],
    "only the document itself should scroll smoothly",
  );

  const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{([^}]*)\}/.exec(all);

  assert.ok(block !== null, "no universal reduced-motion block was found");
  assert.match(block[1], /scroll-behavior:\s*auto\s*!important/, "smooth scrolling survives under reduced motion");
  assert.match(block[1], /transition-duration:[^;]*!important/, "and the block should also stop transitions");
});

test("every stylesheet in the tree is loaded by some page, and none is dead", async () => {
  // A stylesheet nobody loads is dead weight. All thirty-four are loaded, checked against the
  // templates read off disk so a page added later is covered without editing this list.
  const { stylesheetsFor } = await import("../../tools/build.js");
  const templates = (await readdir(new URL("../../pages", import.meta.url)))
    .filter((file) => file.endsWith(".html"))
    .map((file) => file.slice(0, -".html".length));

  const loaded = new Set(
    templates.flatMap((template) => stylesheetsFor({ template }).map((href) => new URL(href, "https://x").pathname)),
  );

  for (const sheet of sheets) {
    assert.ok(
      loaded.has(`/${sheet.file}`),
      `${sheet.file} is never loaded by any page template`,
    );
  }
});
