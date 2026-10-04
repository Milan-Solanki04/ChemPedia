import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderDocument, stylesheetsFor } from "../../tools/build.js";
import { existsSync } from "node:fs";
import { readdir as readDir, readFile as read } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = fileURLToPath(new URL("../../", import.meta.url));

const stylesheet = await readFile(
  new URL("../../styles/print.css", import.meta.url),
  "utf8",
);

/**
 * The same file with its comments removed.
 *
 * This stylesheet argues at length in its comments — including about `@page { size: … }`, which it
 * explains is deliberately absent. Asserting against the raw text therefore finds the words in the
 * prose and fails on a rule the file does not have, so every assertion below runs against the
 * declarations alone.
 */
const declarations = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Every template the build knows about.
 *
 * Read off the filesystem rather than listed, because the assertion is that the print stylesheet is
 * loaded last on **every** page — and a hand-written list would quietly stop covering pages added later,
 * which is exactly the regression this test exists to prevent.
 */
const templates = (await readDir(path.join(sourceDir, "pages")))
  .filter((file) => file.endsWith(".html"))
  .map((file) => path.basename(file, ".html"));

/**
 * Every `.js` file under a directory, recursively.
 *
 * The corpus for the dead-rule check below is every script and every template, because the classes the
 * print rules hide are produced by components rather than written into markup — and a rule that
 * targets a class some component stopped rendering is a rule that quietly stopped working.
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function scriptsUnder(dir) {
  const found = [];

  for (const entry of await readDir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await scriptsUnder(full)));
    } else if (entry.name.endsWith(".js")) {
      found.push(full);
    }
  }

  return found;
}

test("the print stylesheet is linked for print only, so it is not on a reader's critical path", () => {
  // `print.css` is 10.8KB — the second-largest file in the visual layer — and a reader who came to read
  // the screen will never use a line of it. Without `media="print"` it is fetched and parsed on every
  // page load and blocks the first paint. With it the browser fetches it at low priority and applies
  // it only to a print, which was verified by printing: padding, overflow and font-size all switch,
  // the masthead is hidden and all 118 tiles are still there.
  //
  // The cascade order is unchanged and still matters — it is asserted in the test above.
  for (const template of templates) {
    const html = renderDocument({ title: "A page", description: "A description.", body: "", stylesheets: stylesheetsFor({ template }) });

    assert.match(
      html,
      /<link rel="stylesheet" href="\/styles\/print\.css" media="print">/,
      `${template} does not link the print stylesheet for print only`,
    );

    const screenOnly = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]);

    assert.ok(
      !screenOnly.includes("/styles/print.css"),
      `${template} still has print.css on the screen's critical path`,
    );
  }
});

test("the templates directory is not empty, so the loop above is testing something", () => {
  assert.ok(templates.length >= 8, `only found ${templates.length} templates`);
  assert.ok(templates.includes("home"));
  assert.ok(templates.includes("glossary-index"));
});

/**
 * The print stylesheet's load order, which is not a matter of taste.
 *
 * Every component stylesheet sets its own screen values, so a print rule of equal specificity loses to
 * whichever sheet is linked after it. Loaded in the global layer — where it was at first — every print
 * rule that mattered was beaten: `.ptable { padding-inline: 0 }` and `overflow: visible` both lost to
 * `periodic-table.css`, and the printed table kept its 1rem of inline padding, its `overflow-x: auto`
 * and its 820px `min-width`, overflowed the sheet by 20px and had its eighteenth column clipped off the
 * right edge. The rules were present, correct, and doing nothing at all.
 */
test("the print stylesheet is loaded after every other stylesheet, on every page", async () => {
  for (const template of templates) {
    const sheets = stylesheetsFor({ template });

    assert.ok(sheets.length > 0, `${template} links no stylesheet at all`);
    assert.equal(
      sheets.at(-1),
      "/styles/print.css",
      `${template} loads ${sheets.at(-1)} after print.css, so print rules lose to it`,
    );
    assert.equal(
      sheets.filter((sheet) => sheet === "/styles/print.css").length,
      1,
      `${template} links print.css more than once`,
    );
  }
});

test("a page whose own stylesheet does not exist yet still gets the print rules", () => {
  const sheets = stylesheetsFor({ template: "404" });

  assert.ok(sheets.includes("/styles/print.css"), "that page would print as a photograph of itself");
});

test("every class the print rules hide is a class something actually renders", async () => {
  // A print rule that targets a class nothing renders is dead weight that looks like it works, and a
  // rename anywhere in the project would leave it silently hiding nothing.
  const hidden = [...declarations.matchAll(/^\s*\.([a-z][a-z0-9_-]*)[,\s{]/gm)].map((match) => match[1]);
  assert.ok(hidden.length > 8, "the hide list should be a real list");

  const templates_ = await Promise.all(
    templates.map((name) => readFile(path.join(sourceDir, "pages", `${name}.html`), "utf8")),
  );

  const scripts = await Promise.all(
    (await scriptsUnder(path.join(sourceDir, "scripts"))).map((file) => read(file, "utf8")),
  );
  const corpus = [...templates_, ...scripts].join("\n");

  for (const name of new Set(hidden)) {
    assert.ok(
      corpus.includes(name),
      `.${name} is hidden in print but nothing on this site renders it — a dead rule`,
    );
  }
});

test("the print stylesheet names no colour of its own", () => {
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(declarations), "a hex colour in the print stylesheet");
  assert.ok(!/\brgba?\(/.test(declarations), "an rgb colour in the print stylesheet");
});

test("the print stylesheet fits a sheet without pinning a paper size", () => {
  // `@page { size: A4 }` would satisfy one paper size and break the other. The criterion is that the
  // printable table fits a single sheet at *both*, so the size is left to the printer and only the
  // margin is declared. Asserted against the declarations, because the file's own comment quotes the
  // rule it does not have.
  assert.ok(/@page\s*\{[^}]*margin/.test(declarations), "the page margin is not declared");
  assert.ok(!/@page\s*\{[^}]*size\s*:/.test(declarations), "the page size is pinned, so one paper size breaks");
});

test("the print stylesheet keeps the element colours, because on this site the colour is the information", () => {
  assert.ok(
    /print-color-adjust:\s*exact/.test(declarations),
    "a printed table would lose its category colours without this",
  );
});

test("the provenance line prints and is not shown on screen", () => {
  assert.ok(
    /\.print-only\s*\{\s*display:\s*none/.test(declarations),
    "the provenance line is never hidden on screen",
  );
  assert.ok(
    /@media print\s*\{[\s\S]*?\.print-only\s*\{\s*display:\s*block/.test(declarations),
    "the provenance line never shows on paper",
  );
});

test("the element page prints as a card, which means the navigation parts of it are hidden", () => {
  for (const selector of [".ptable--compact", ".element__shell", ".strip", ".group-tiles"]) {
    assert.ok(
      declarations.includes(selector),
      `${selector} is not hidden in print, so an element card carries 118 tiles onto the sheet`,
    );
  }
});

test("the stylesheet exists where the build expects it", () => {
  assert.ok(existsSync(path.join(sourceDir, "styles", "print.css")));
});
