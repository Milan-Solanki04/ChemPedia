import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { levelBadge, glossaryFilterText } from "../../scripts/components/glossary-badge.js";
import { LEVELS } from "../../scripts/data/glossary-repository.js";
import { AA_TEXT, contrastRatio, meetsAA, relativeLuminance } from "../../scripts/lib/contrast.js";
import { escapeHtml } from "../../scripts/lib/html.js";

const stylesheet = await readFile(
  new URL("../../styles/components/glossary-badge.css", import.meta.url),
  "utf8",
);

/**
 * Read a token's value out of the token layer.
 *
 * Read from the file rather than hardcoded, because the assertion that matters is "these three ramps
 * pass against these two inks", and that is only a real claim if the ramps are the ones the site uses.
 */
const tokens = await readFile(new URL("../../styles/tokens.css", import.meta.url), "utf8");

/** @param {string} name */
const token = (name) => {
  const match = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));

  assert.ok(match, `the token layer does not declare --${name}`);

  return match[1];
};

/**
 * The fill and the foreground one level is painted with.
 *
 * Parsed out of the stylesheet rather than restated here, because a test that declared the colours
 * itself would pass unchanged if someone repainted a badge to something unreadable.
 *
 * @param {string} level
 * @returns {{ fill: string, foreground: string }}
 */
function paintFor(level) {
  const block = stylesheet.match(
    new RegExp(`\\.badge--${level.toLowerCase()}\\s*\\{([\\s\\S]*?)\\}`),
  );

  assert.ok(block, `no rule for .badge--${level.toLowerCase()}`);

  const background = block[1].match(/background:\s*var\((--[\w-]+)\)/)?.[1];
  const color = block[1].match(/color:\s*var\((--[\w-]+)\)/)?.[1];

  assert.ok(background, `no fill on .badge--${level.toLowerCase()}`);
  assert.ok(color, `no foreground on .badge--${level.toLowerCase()}`);

  return { fill: token(background.slice(2)), foreground: token(color.slice(2)) };
}

test("the badge says the level in words, not only in colour", () => {
  for (const level of LEVELS) {
    const badge = levelBadge(level);

    assert.ok(badge.includes(`>${level}</span>`), `${level} is not written on the badge`);
    assert.ok(badge.includes(`data-level="${level}"`), `${level} carries no level attribute`);
  }
});

test("every level's badge passes AA against its own fill", () => {
  for (const level of LEVELS) {
    const { fill, foreground } = paintFor(level);
    const ratio = contrastRatio(foreground, fill);

    assert.ok(
      meetsAA(ratio, AA_TEXT),
      `the ${level} badge is ${ratio.toFixed(2)}:1, under the ${AA_TEXT}:1 needed for text its size`,
    );
  }
});

test("the three levels are told apart by their fill, not merely by their text", () => {
  const fills = LEVELS.map((level) => paintFor(level).fill);

  assert.equal(new Set(fills).size, LEVELS.length, "two levels share a fill");
});

test("the levels darken in the order a reader reads difficulty in", () => {
  // Measured on the fills, and not on the contrast ratios: the levels use two different foregrounds, so
  // a ratio that fell as the fill darkened would say nothing about which fill is darker.
  const luminance = LEVELS.map((level) => relativeLuminance(paintFor(level).fill));

  for (let step = 1; step < luminance.length; step += 1) {
    assert.ok(
      luminance[step] < luminance[step - 1],
      `${LEVELS[step]} is not darker than ${LEVELS[step - 1]}`,
    );
  }
});

test("a level the data does not allow still renders, because the data is a file someone can edit", () => {
  const badge = levelBadge("Wizard");

  assert.ok(badge.includes("Wizard"));
  assert.ok(badge.includes("badge--wizard"));
});

test("a level carrying markup is escaped rather than injected", () => {
  const badge = levelBadge("<script>x</script>");

  assert.ok(!badge.includes("<script>"), "the level went in as markup");
  assert.ok(badge.includes(escapeHtml("<script>x</script>")));
});

test("the searchable text is the term and the definition, and not the level", () => {
  const text = glossaryFilterText({ term: "Kinetics", definition: "How fast a reaction goes.", level: "Expert" });

  assert.equal(text, "kinetics how fast a reaction goes.");
  assert.ok(!text.includes("expert"), "a reader typing a level wants the hard terms, not every term labelled hard");
});

test("a record with no fields produces searchable text rather than throwing", () => {
  assert.equal(glossaryFilterText({}), " ");
  assert.equal(glossaryFilterText(undefined), " ");
});