import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { contrastRatio, meetsAA } from "../../scripts/lib/contrast.js";
import { loadTokens } from "../../tools/tokens.js";

/**
 * Every foreground/background pair the site can paint, checked against WCAG AA by arithmetic.
 *
 * The palette is small and the combinations are finite, so this is decided from `tokens.css` alone —
 * no browser, no screenshots, and no room for a colour to be right on one page and wrong on another.
 * `contrast.test.js` covers the group fills, where the foreground is *computed*; this covers the ink
 * ramp and the surfaces, where the author picks the pairing by hand and therefore has to be checked.
 *
 * **What it found.** `--ink-faint` was `#8a938f`: 3.06:1 on `--bg`, 2.84:1 on `--surface-sunk`, and
 * below AA on all three surfaces. It paints placeholders, element-strip labels and numbers, footer
 * text and captions on sixteen stylesheets. Nothing about it looked wrong, and it had survived ten
 * phases. The token is now `#656d6a`.
 */

const SURFACES = ["--bg", "--surface", "--surface-sunk"];
const TEXT_INKS = ["--ink", "--ink-body", "--ink-soft", "--ink-faint"];

const tokens = await loadTokens();

/** The search input's stylesheet, read once: two of the rules below quote it by selector. */
const searchCss = await readFile(new URL("../../styles/components/element-search.css", import.meta.url), "utf8");

/**
 * A token's colour as six-digit hex.
 *
 * `loadTokens` resolves a token's references to other tokens, so this is the colour the browser will
 * paint rather than the text `var(--ink)` sitting in the file.
 *
 * @param {string} name
 * @returns {string}
 */
function tokenValue(name) {
  // `loadTokens` reports names without the leading dashes, which is the CSS declaration's own name.
  const hex = tokens.hex(name.replace(/^--/, ""));

  assert.ok(hex !== null, `${name} is not declared in tokens.css`);

  return hex;
}

test("every text ink passes AA on every surface it can be laid on", () => {
  for (const ink of TEXT_INKS) {
    for (const surface of SURFACES) {
      const ratio = contrastRatio(tokenValue(ink), tokenValue(surface));

      assert.ok(meetsAA(ratio), `${ink} on ${surface} is ${ratio.toFixed(2)}:1, below AA's 4.5:1`);
    }
  }
});

test("the placeholder colour passes AA, since a placeholder is the only name a field has until it is typed into", () => {
  // The search input's placeholder is `--ink-faint` and it carries no `label` in the markup, so this
  // ratio is the difference between a field that announces itself and one that does not.
  assert.match(searchCss, /\.find__input::placeholder\s*\{\s*color:\s*var\(--ink-faint\)/);
  assert.ok(meetsAA(contrastRatio(tokenValue("--ink-faint"), tokenValue("--surface"))));
});

test("text on the ink-coloured footer and buttons passes AA", () => {
  const ratio = contrastRatio(tokenValue("--ink-inverse"), tokenValue("--ink"));

  assert.ok(meetsAA(ratio), `--ink-inverse on --ink is ${ratio.toFixed(2)}:1`);
});

test("the ink ramp is ordered, and no two of its steps are indistinguishable", () => {
  const steps = TEXT_INKS.map((name) => ({ name, value: tokenValue(name) }));
  const surface = tokenValue("--bg");

  // Body copy must be the step a reader spends longest looking at, so it is checked to be the most
  // legible rather than assumed to be: a palette edited until every pair passes can quietly end up
  // with `--ink-body` lighter than `--ink`.
  const byRatio = [...steps].sort(
    (one, other) => contrastRatio(other.value, surface) - contrastRatio(one.value, surface),
  );

  assert.deepEqual(
    byRatio.map((step) => step.name),
    ["--ink-body", "--ink", "--ink-soft", "--ink-faint"],
    "the ramp should run body copy, headings, secondary, tertiary",
  );

  for (let index = 1; index < steps.length; index += 1) {
    const between = contrastRatio(steps[index - 1].value, steps[index].value);

    assert.ok(between >= 1.15, `${steps[index - 1].name} and ${steps[index].name} are ${between.toFixed(2)}:1 apart and read as one colour`);
  }
});

test("a control's border is distinguishable from the surface behind it", () => {
  // WCAG 1.4.11 asks 3:1 of a component's *boundary* when that boundary is what identifies it. Every
  // focusable input here is outlined in `--ink` rather than `--line`, which clears it easily.
  const ink = tokenValue("--ink");

  for (const surface of SURFACES) {
    const ratio = contrastRatio(ink, tokenValue(surface));

    assert.ok(ratio >= 3, `an input outline on ${surface} is ${ratio.toFixed(2)}:1, below 3:1`);
  }
});

test("the decorative rules are recorded as exempt, with the reason, rather than quietly ignored", () => {
  // `--line` measures 1.30:1 on `--bg` and `--line-strong` 1.65:1. Neither clears 3:1, and that is
  // deliberate rather than overlooked: these draw the rules between table rows and around cards, and
  // 1.4.11 applies to a boundary that is the *only* way to identify a control. Where a rule does
  // identify one — every input, and both focus rings — `--ink` is used instead, and the test above
  // holds those to 3:1. Stating the exemption here means a reader who disagrees can see the decision
  // instead of having to infer it from a rule that quietly does not mention them.
  const line = contrastRatio(tokenValue("--line"), tokenValue("--bg"));

  assert.ok(line < 3, "this exemption is written on the assumption that --line is below 3:1; if that changed, the reasoning above must be rewritten");

  assert.doesNotMatch(searchCss, /border(?:-color)?:[^;]*var\(--line\)/, "an input may not be identified by a decorative rule");
});
