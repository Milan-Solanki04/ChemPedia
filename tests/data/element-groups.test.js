import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementGroupsRepository, ELEMENT_GROUPS_FILE } from "../../scripts/data/element-groups-repository.js";
import { loadRepositories } from "../../tools/repositories.js";

/**
 * A stand-in for the browser's fetch that reads the real file from disk, so the repository under test
 * is the one the browser runs.
 *
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function fromDisk(url) {
  const name = url.split("/").pop();
  const body = await readFile(new URL(`../../data/${name}`, import.meta.url), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

const groups = await createElementGroupsRepository({ fetchImpl: fromDisk });
const { elements, categories } = await loadRepositories();
const raw = await readFile(new URL(`../../data/${ELEMENT_GROUPS_FILE}`, import.meta.url), "utf8");

test("every category has written copy, and every entry is a category", () => {
  const slugs = categories.all().map((category) => category.slug);

  assert.equal(groups.slugs().length, 11);

  for (const slug of slugs) {
    assert.ok(groups.bySlug(slug), `${slug} has no written copy`);
  }

  assert.deepEqual(
    groups.slugs().filter((slug) => !slugs.includes(slug)),
    [],
    "the file names a slug that is not one of the eleven categories",
  );
});

test("each group has a sentence for the hero and a paragraph beneath it", () => {
  for (const slug of groups.slugs()) {
    const copy = groups.bySlug(slug);

    assert.ok(copy.lede.length > 40, `${slug}: the lede is a sentence`);
    assert.ok(copy.lede.endsWith("."), `${slug}: the lede is a sentence, not a fragment`);
    assert.doesNotMatch(copy.lede, /\s\s/, `${slug}: no double spaces`);

    assert.ok(copy.character.length > 200, `${slug}: the character is a paragraph`);
    assert.match(copy.character, /\s/, `${slug}: the character is prose`);
  }
});

test("the eleven ledes are eleven different sentences", () => {
  const ledes = groups.slugs().map((slug) => groups.bySlug(slug).lede);

  assert.equal(new Set(ledes).size, 11, "no two groups share an introduction");

  // The reference pluralises its category names and gets "the noble gass" wrong on the same page
  // twice. Ours is written per group, so a repeated sentence would be a copy-paste rather than a typo.
  for (const slug of groups.slugs()) {
    assert.doesNotMatch(groups.bySlug(slug).character, /gass\b/, `${slug}: the missing letter`);
  }
});

test("the written copy is ours, not the reference's", () => {
  assert.doesNotMatch(raw, /breakingatom/i);
  assert.doesNotMatch(raw, /breaking[ _-]?atom/i);
});

test("the file holds no taxonomy of its own", () => {
  // The trap this file exists to avoid: a second place the member counts could live, and disagree.
  const source = JSON.parse(raw);

  for (const [slug, copy] of Object.entries(source.groups)) {
    assert.deepEqual(
      Object.keys(copy).sort(),
      ["character", "lede"],
      `${slug} carries written copy and nothing else — no members, no count, no colour`,
    );
  }

  assert.doesNotMatch(raw, /"members"/);
  assert.doesNotMatch(raw, /"count"/);
  assert.doesNotMatch(raw, /"elements"/);
});

test("membership is derived from the records, and the counts match the taxonomy", () => {
  for (const category of categories.all()) {
    const members = elements.withCategory(category.slug);

    assert.equal(members.length, category.count, `${category.slug}: counted ${members.length}`);
  }

  assert.equal(
    categories.all().reduce((total, category) => total + category.count, 0),
    118,
  );
});

test("a slug with no written copy returns null, and require stops the build", () => {
  assert.equal(groups.bySlug("not-a-group"), null);

  assert.throws(() => groups.require("not-a-group"), /has no written copy for not-a-group/);
});

test("the repository is wired into the data layer every page module receives", () => {
  assert.equal(typeof groups.require, "function");
  assert.equal(elements.count(), 118);
});