import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ON_FILL_DARK, ON_FILL_LIGHT, contrastRatio, meetsAA } from "../../scripts/lib/contrast.js";
import { TOKENS_FILE, loadTokens, parseTokens } from "../../tools/tokens.js";

const raw = await readFile(new URL(`../../${TOKENS_FILE}`, import.meta.url), "utf8");
const categories = JSON.parse(await readFile(new URL("../../data/categories.json", import.meta.url), "utf8"));
const tokens = parseTokens(raw);
const live = await loadTokens();

test("the token reader reads the real token layer, and the build's copy is the same file", () => {
  assert.equal(tokens.names().length, live.names().length);
  assert.equal(tokens.value("--ink".slice(2)), live.value("ink"));
  assert.ok(tokens.names().length > 100, `only ${tokens.names().length} tokens were read`);
});

test("a token answers with the value the stylesheet declares", () => {
  assert.equal(tokens.value("bg"), "#fdfbfa");
  assert.equal(tokens.value("ink"), "#15403d");
  assert.equal(tokens.value("g-non-metals"), "#a6c6d5");
  assert.equal(tokens.value("shell"), "1100px");
});

test("a token nobody declares is null rather than a guess", () => {
  assert.equal(tokens.value("g-not-a-group"), null);
  assert.equal(tokens.value(""), null);
  assert.equal(tokens.has("g-not-a-group"), false);
  assert.equal(tokens.has("ink"), true);
});

test("a token declared as another token answers with what that one says", () => {
  // Fifteen tokens are written this way. A reader that handed back the text "var(--ink)" to a caller
  // asking for a colour would be worse than no reader at all.
  assert.equal(tokens.value("accent"), "#15403d");
  assert.equal(tokens.value("on-accent"), "#fdfbfa");
  assert.equal(tokens.value("focus-color"), "#15403d");
  assert.equal(tokens.value("gap-legend"), "0.5rem");
  assert.equal(tokens.value("height-submenu"), "2rem");
});

test("a reference that loops terminates instead of hanging the build", () => {
  const circular = parseTokens(":root { --a: var(--b); --b: var(--a); --c: var(--c); }");

  assert.equal(circular.value("a"), null);
  assert.equal(circular.value("b"), null);
  assert.equal(circular.value("c"), null);
});

test("a declaration quoted inside a comment is not a token", () => {
  // None exist today. A comment that quoted one to explain it would otherwise become a token, and a
  // comment is exactly where someone would quote one.
  const commented = parseTokens(':root { --real: #123456; /* --quoted: #abcdef; */ }');

  assert.equal(commented.value("real"), "#123456");
  assert.equal(commented.has("quoted"), false);
});

test("a colour token answers with its value and a non-colour answers with null", () => {
  assert.equal(tokens.hex("g-lanthanides"), "#d473a2");
  assert.equal(tokens.hex("sp-4"), null);
  assert.equal(tokens.hex("shadow-md"), null);
  assert.equal(tokens.hex("nothing"), null);
});

test("a pair is a fill and the foreground that reads on it, derived not written down", () => {
  const pale = tokens.pair("g-non-metals");

  assert.deepEqual(pale, { fill: "#a6c6d5", onFill: ON_FILL_DARK });

  const dark = tokens.pair("g-halogens");

  assert.deepEqual(dark, { fill: "#4c575a", onFill: ON_FILL_LIGHT });
});

test("a pair for a token that does not exist is refused rather than painted with nothing", () => {
  assert.throws(() => tokens.pair("g-invented"), TypeError);
});

test("every fill the table can paint pairs to a foreground that passes AA", () => {
  // The point of the module is that a page never resolves a colour on its own. This is that promise
  // held against the eleven category colours, four states, four blocks, six ramp steps and the
  // neutral unknown — twenty-six pairings, none of them written down anywhere.
  const fills = tokens.names().filter((name) => /^(g|state|ramp|value)-/.test(name));

  assert.ok(fills.length >= 26, `expected at least 26 fills, found ${fills.length}`);

  for (const name of fills) {
    const { fill, onFill } = tokens.pair(name);
    const ratio = contrastRatio(fill, onFill);

    assert.ok(meetsAA(ratio), `--${name} (${fill}) with ${onFill} is ${ratio.toFixed(2)}:1`);
  }
});

test("the eleven category tokens the data names are all declared, and all colour", () => {
  for (const category of categories) {
    assert.ok(tokens.has(category.token.slice(2)), `tokens.css does not declare ${category.token}`);
    assert.ok(tokens.hex(category.token.slice(2)), `${category.token} is not a colour`);
  }
});

test("the two foregrounds the contrast module holds are the ones the token layer declares", () => {
  assert.equal(tokens.value("on-fill-dark"), ON_FILL_DARK);
  assert.equal(tokens.value("on-fill-light"), ON_FILL_LIGHT);
});