import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * `DATA_SOURCES.md` against the data it describes.
 *
 * **This file exists because §7 of that document claimed to be guarded and was not.** It listed nine
 * assertions that guard the *data* — 118 elements, unique slugs, no sentinel strings — and not one
 * that compared the schema it prints in §5 with the records actually shipped. So two things sat wrong
 * in it while every listed test passed:
 *
 * - §5 documented `dataSource` as a string, when it has been an object carrying three per-field
 *   attributions (`facts`, `supplementary`, `prose`) for some time. The about page counts its
 *   provenance rows from that object.
 * - §5's table of derived fields said `shells` came from the Madelung filling order, while
 *   `data-sources/configuration.js` has always said at the top of its file that it does not use
 *   Madelung, because Madelung gets chromium wrong. The two documents contradicted each other and
 *   nothing noticed.
 *
 * The lesson is not "documents rot". It is that a document asserting "tests guard this document" is
 * making a claim that can be checked, and a check that does not exist is worse than no claim.
 *
 * The parsing is deliberately crude: a `jsonc` block and a regular expression. The test is about
 * whether the document and the data disagree, and a stricter parser would only make it harder to see
 * when it quietly stops reading the right block.
 */

const document = await readFile(new URL("../../../workspace/docs/DATA_SOURCES.md", import.meta.url), "utf8");
const elements = JSON.parse(await readFile(new URL("../../data/elements.json", import.meta.url), "utf8"));
const glossary = JSON.parse(await readFile(new URL("../../data/glossary.json", import.meta.url), "utf8"));
const configuration = await readFile(
  new URL("../../tools/data-sources/configuration.js", import.meta.url),
  "utf8",
);

/** The `jsonc` block §5 prints as the record schema. */
const schemaBlock = (() => {
  const section = document.split("## 5. Target schema")[1];

  assert.ok(section !== undefined, "§5 has moved or been renamed — this test needs updating");

  const block = section.split("```")[1];

  assert.ok(block?.startsWith("jsonc"), "§5 no longer opens with a jsonc block");

  return block;
})();

/**
 * Every field name the schema block declares, at any depth.
 *
 * @returns {string[]}
 */
function declaredFields() {
  return [...schemaBlock.matchAll(/^\s*"?([a-zA-Z][a-zA-Z0-9]*)"?\s*:/gm)].map((match) => match[1]);
}

test("every field the schema declares exists in the records", () => {
  const present = new Set(elements.flatMap((element) => [
    ...Object.keys(element),
    ...Object.keys(element.discovery),
    ...Object.keys(element.dataSource),
  ]));

  for (const field of new Set(declaredFields())) {
    if (field === "jsonc") {
      continue;
    }

    assert.ok(present.has(field), `§5 declares "${field}", which no record carries`);
  }
});

test("every field the records carry is in the schema", () => {
  const declared = new Set(declaredFields());

  for (const element of elements) {
    for (const field of Object.keys(element)) {
      assert.ok(declared.has(field), `the records carry "${field}" and §5 does not document it`);
    }

    for (const field of Object.keys(element.discovery)) {
      assert.ok(declared.has(field), `discovery.${field} is not documented in §5`);
    }
  }
});

test("every record has the same fields, so the schema can be one schema", () => {
  const shapes = new Set(elements.map((element) => Object.keys(element).sort().join(",")));

  assert.equal(shapes.size, 1, `the records have ${shapes.size} different shapes`);
});

test("`dataSource` is documented as the object it is, with its three tiers", () => {
  // The defect: a string in the document, an object in the data.
  assert.match(schemaBlock, /"dataSource"\s*:\s*\{/, "§5 still shows dataSource as a string or a placeholder");
  assert.doesNotMatch(schemaBlock, /"dataSource"\s*:\s*"…"/, "§5 documents dataSource as an ellipsis string");

  for (const tier of ["facts", "supplementary", "prose"]) {
    assert.ok(declaredFields().includes(tier), `§5 does not document the "${tier}" attribution tier`);
  }

  for (const element of elements) {
    assert.equal(typeof element.dataSource, "object", `${element.symbol}'s dataSource is not an object`);
    for (const tier of ["facts", "supplementary", "prose"]) {
      assert.equal(typeof element.dataSource[tier], "string", `${element.symbol} has no "${tier}" attribution`);
      assert.ok(element.dataSource[tier].length > 0, `${element.symbol}'s "${tier}" attribution is empty`);
    }
  }
});

test("§5 does not claim a derivation rule that contradicts the code", () => {
  // The other defect: §5 said Madelung, the code said "does not use the Madelung filling order", and
  // chromium is the element that proves which is right.
  const derivedTable = document.split("**Derived fields.**")[1];

  assert.ok(derivedTable !== undefined, "the derived-fields table has gone");

  const shellsRow = derivedTable.split("\n").find((line) => line.includes("`shells`"));

  assert.ok(shellsRow !== undefined, "§5 no longer documents how shells are derived");

  assert.match(configuration, /does not use the Madelung filling order/i, "the code no longer states the rule §5 must match");

  // The row mentions Madelung in order to say it is not used, so the test asserts the *positive* claim
  // rather than the absence of a word that legitimately appears inside its own refutation.
  assert.match(shellsRow, /Madelung filling order is deliberately not used/, "§5 no longer states which rule is followed");
  assert.match(shellsRow, /read from the record's own `electronConfiguration`/, "§5 should say the shells are read from the configuration");
  assert.doesNotMatch(shellsRow, /from the Madelung filling order\./i, "§5 claims shells come from Madelung");
});

test("the shipped shells agree with the configuration, not with Madelung", () => {
  // The claim §5 makes, checked against the data: chromium is [Ar] 3d5 4s1.
  const chromium = elements.find((element) => element.symbol === "Cr");

  assert.deepEqual(chromium.electronConfiguration, "[Ar]3d5 4s1");
  assert.deepEqual(chromium.shells, [2, 8, 13, 1], "chromium's shells are not the configuration's own");
  assert.notDeepEqual(chromium.shells, [2, 8, 12, 2], "chromium has the Madelung answer, which is wrong");
});

test("§7 lists the schema check, so the list and the reality agree", () => {
  const guards = document.split("## 7. Tests that guard this document")[1];

  assert.ok(guards !== undefined, "§7 has moved or been renamed");
  assert.match(guards, /data-sources\.test\.js/, "§7 does not mention the test that guards §5");
  assert.doesNotMatch(guards, /exactly 418 glossary terms/, "§7 still says 418 glossary terms; there are 440");
});

test("the counts this document states are the counts in the data", () => {
  assert.match(document, new RegExp(`\\*\\*${glossary.length} terms\\*\\*`), "§3 does not state the real glossary count");
  assert.match(document, /exactly 118 elements/i, "§7 does not state the real element count");
  assert.equal(elements.length, 118);
});
