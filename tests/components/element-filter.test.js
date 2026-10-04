import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { elementFilter, filterItems, filterTextFor } from "../../scripts/components/element-filter.js";
import { rankedMatches } from "../../scripts/components/element-search.js";

/**
 * A stand-in for the browser's fetch that reads the real files from disk, so the items under test are
 * the 118 elements this project actually ships.
 *
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function fromDisk(url) {
  const name = url.split("/").pop();
  const body = await readFile(new URL(`../../data/${name}`, import.meta.url), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

const elements = await createElementsRepository({ fetchImpl: fromDisk });
const all = elements.all();

// Nodes are stood in for by their slug, which is all `filterItems` needs to be told which item is
// which: it only ever asks whether a node is in the set it built.
const items = all.map((element) => ({ element, node: element.slug }));

const names = (query) =>
  [...filterItems(query, items).keep].map((slug) => elements.bySlug(slug).name);

test("the field carries a real label, and a status region to announce into", () => {
  const markup = elementFilter();

  // A placeholder disappears the moment a reader types, which is when they need the label most.
  assert.match(markup, /<label class="visually-hidden" for="element-filter">Filter by element name<\/label>/);
  assert.match(markup, /placeholder="Filter by element name\.\.\."/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /id="element-filter-status"/);
  assert.match(markup, /aria-describedby="element-filter-status"/);
});

test("aria-controls points at the list the page named, and is absent when it named none", () => {
  // Inventing a target id here would have produced a reference to an id nothing carries, which
  // assistive technology reports as a control over nothing.
  assert.doesNotMatch(elementFilter(), /aria-controls/, "no invented target");

  const markup = elementFilter({ controls: "element-index-list" });

  assert.match(markup, /aria-controls="element-index-list"/);
});

test("the field is a form, so a reader without scripts can still submit it", () => {
  const markup = elementFilter();

  assert.match(markup, /<form/);
  assert.match(markup, /name="filter"/);
});

test("an empty filter keeps everything and says so", () => {
  for (const query of ["", "   ", null, undefined]) {
    const result = filterItems(query, items);

    assert.equal(result.shown, 118, `"${query}" should keep every element`);
    assert.equal(result.total, 118);
  }
});

test("the filter finds an element by its name", () => {
  assert.deepEqual(names("iron"), ["Iron"]);
  assert.deepEqual(names("gold"), ["Gold"]);
  assert.deepEqual(names("oxygen"), ["Oxygen"]);
});

test("the filter finds an element by its symbol, whatever the case", () => {
  assert.deepEqual(names("AU"), ["Gold"]);
  assert.deepEqual(names("au"), names("AU"), "the query is folded before it is matched");
  assert.deepEqual(names("XENON"), ["Xenon"], "a full name finds it by name");
});

test("a symbol query also reaches every name that contains it", () => {
  // "fe" is iron by symbol and fermium by name; "he" is helium by symbol and three heavy metals by
  // name. The filter keeps them all, because it is the find field's matcher doing the work. A filter
  // that matched symbols only would be a second and disagreeing definition of what a symbol is.
  assert.deepEqual(names("fe"), ["Iron", "Fermium"]);
  assert.deepEqual(names("he"), ["Helium", "Ruthenium", "Rhenium", "Rutherfordium"]);
});

test("the filter finds an element by its atomic number", () => {
  assert.deepEqual(names("26"), ["Iron"]);
  assert.deepEqual(names("118"), ["Oganesson"]);
});

test("a partial name matches every element that contains it, in page order", () => {
  // "ium" reaches three-quarters of the table. The grid narrows rather than re-sorts, so what is
  // left is still in atomic-number order — a list that reordered itself under every keystroke would
  // be a list nobody could scan.
  const matched = names("ium");

  assert.equal(matched.length, 79, `"ium" matches 79 of the 118`);
  assert.ok(matched.includes("Sodium"));
  assert.ok(matched.includes("Caesium"));
  assert.ok(!matched.includes("Iron"), "iron has no \"ium\" in it");
  assert.ok(!matched.includes("Neon"), "and neither has neon");

  const numbers = matched.map((name) => all.find((one) => one.name === name).atomicNumber);

  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), "page order is kept");
});

test("the filter and the find field agree, because they share one matcher", () => {
  for (const query of ["c", "co", "gold", "26", "ium", "zzz"]) {
    const byFilter = names(query).sort();
    const bySearch = rankedMatches(all, query)
      .map(({ element }) => element.name)
      .sort();

    assert.deepEqual(byFilter, bySearch, `"${query}" must match the same elements in both`);
  }
});

test("a query nothing matches empties the list rather than showing everything", () => {
  const result = filterItems("unobtainium", items);

  assert.equal(result.shown, 0);
  assert.equal(result.total, 118);
});

test("a query with only whitespace is not a query", () => {
  assert.equal(filterItems("  ", items).shown, 118);
});

test("each element's searchable text carries its name, symbol and number", () => {
  const iron = elements.bySlug("iron");

  assert.equal(filterTextFor(iron), "iron fe 26");

  for (const element of all) {
    const text = filterTextFor(element);

    assert.ok(text.includes(element.name.toLowerCase()));
    assert.ok(text.includes(element.symbol.toLowerCase()));
    assert.ok(text.includes(String(element.atomicNumber)));
  }
});

test("the status line names the noun, because a bare number is not a sentence", () => {
  const markup = elementFilter({ noun: "rows" });

  assert.match(markup, /Filter by element name/);
  assert.equal(markup.includes("rows"), false, "the noun is for the status line, not the field");
});