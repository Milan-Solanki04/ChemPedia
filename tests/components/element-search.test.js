import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { createCategoriesRepository } from "../../scripts/data/categories-repository.js";
import { searchField } from "../../scripts/components/search-field.js";
import {
  RESULT_LIMIT,
  elementSearch,
  matchRank,
  rankedMatches,
  searchElements,
  statusFor,
} from "../../scripts/components/element-search.js";
import { routes } from "../../scripts/router/routes.js";

async function fromDisk(url) {
  const name = url.split("/").pop();
  const body = await readFile(new URL(`../../data/${name}`, import.meta.url), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

const elements = await createElementsRepository({ fetchImpl: fromDisk });
const categories = await createCategoriesRepository({ fetchImpl: fromDisk });
const all = elements.all();

/** @param {string} query */
const search = (query) => searchElements(all, query);

/** @param {string} query @returns {string[]} */
const symbols = (query) => search(query).map((element) => element.symbol);

test("a symbol finds its element first, and anything else that starts the same way after", () => {
  // Fermium is not a wrong answer to "fe" — it is the second one, and a reader who wanted iron has
  // it in front of them. Dropping it would mean refusing to match anything a reader could plausibly
  // have meant.
  assert.deepEqual(symbols("Fe"), ["Fe", "Fm"]);
  assert.deepEqual(symbols("fe"), ["Fe", "Fm"]);
  assert.deepEqual(symbols("AU"), ["Au"], "no element's name starts with au");
});

test("an atomic number finds that element and no other", () => {
  // Typing 1 must not find lithium, sodium and everything else whose name happens to begin with a
  // letter that looks like a one. A number is looked up, not searched for.
  assert.deepEqual(symbols("26"), ["Fe"]);
  assert.deepEqual(symbols("118"), ["Og"]);
  assert.deepEqual(symbols("1"), ["H"]);
});

test("a partial symbol finds every element whose symbol starts that way", () => {
  // Neon and neodymium both answer "ne" to a symbol prefix, and nitrogen answers it as an exact
  // symbol — so exact first, then the two prefixes in atomic order.
  assert.deepEqual(symbols("ne").slice(0, 3), ["Ne", "Nd", "Np"]);
  assert.deepEqual(symbols("ni").slice(0, 2), ["Ni", "N"]);
});

test("an exact symbol beats a name that starts the same way", () => {
  // Typing `co` should find cobalt before copper and copernicium, because a symbol is an
  // abbreviation and an abbreviation is meant to be typed in full.
  assert.deepEqual(symbols("co").slice(0, 3), ["Co", "Cu", "Cn"]);
  assert.equal(matchRank("co", elements.bySymbol("Co")), 0, "co is cobalt's symbol exactly");
  assert.equal(matchRank("c", elements.bySymbol("Co")), 2, "c is only a symbol prefix");
  assert.equal(matchRank("co", elements.bySymbol("Cu")), 3, "a name prefix is a weaker match still");
});

test("a name finds its element, and a fragment of a name finds it too", () => {
  assert.equal(search("iron")[0].symbol, "Fe");
  assert.equal(search("gen")[0].symbol, "H");
  assert.ok(search("man")[0].symbol === "Mn");
});

test("results are ordered by how well they match, then by atomic number", () => {
  // "n" is nitrogen's symbol, so nitrogen comes first, and the five elements whose symbol begins with
  // n follow in atomic order. "a" matches no symbol at all, so it starts at the prefix rank and runs
  // through everything whose name merely contains an a.
  assert.deepEqual(rankedMatches(all, "n")[0].element.symbol, "N", "an exact symbol comes first");
  assert.deepEqual(
    rankedMatches(all, "n").slice(1, 4).map(({ element }) => element.symbol),
    ["Ne", "Na", "Ni"],
    "then the symbol prefixes, in atomic order — neon is 10, sodium 11, nickel 28, neodymium 60",
  );

  const ranked = rankedMatches(all, "a");
  const ranks = ranked.map(({ rank }) => rank);

  assert.deepEqual([...ranks].sort((one, other) => one - other), ranks, "the ranks must be in order");

  // Inside one rank, atomic order.
  for (let index = 1; index < ranked.length; index += 1) {
    if (ranks[index] !== ranks[index - 1]) {
      continue;
    }

    assert.ok(
      ranked[index].element.atomicNumber > ranked[index - 1].element.atomicNumber,
      `${ranked[index].element.symbol} breaks the atomic order within its rank`,
    );
  }
});

test("an empty query matches nothing rather than everything", () => {
  assert.deepEqual(search(""), []);
  assert.deepEqual(search("   "), []);
  assert.deepEqual(search(null), []);
  assert.deepEqual(rankedMatches(all, ""), []);
});

test("a query that matches nothing matches nothing", () => {
  assert.deepEqual(search("zzzz"), []);
  assert.deepEqual(symbols("xenonmite"), []);
});

test("a match rank is only ever a number the search sorts on", () => {
  const iron = elements.bySymbol("Fe");

  assert.equal(matchRank("fe", iron), 0);
  assert.equal(matchRank("26", iron), 1);
  assert.equal(matchRank("f", iron), 2);
  assert.equal(matchRank("iro", iron), 3);
  assert.equal(matchRank("ron", iron), 4);
  assert.equal(matchRank("zz", iron), 5);
});

test("results are truncated to the limit, and the limit is small enough to read", () => {
  assert.equal(RESULT_LIMIT, 8);
  assert.ok(rankedMatches(all, "a").length > RESULT_LIMIT, "the fixture should have more than one screen");
  assert.equal(search("a").length, RESULT_LIMIT);
  assert.equal(searchElements(all, "a", { limit: 3 }).length, 3);
});

test("the status line is a sentence, and it says how many there were rather than how many fit", () => {
  assert.equal(statusFor("iron", 1, 1), "One element. Press Enter to open it.");
  assert.equal(statusFor("a", 26, 8), "26 elements, showing the first 8.");
  assert.equal(statusFor("a", 3, 3), "3 elements.");
  assert.equal(statusFor("zzz", 0, 0), "No element matches zzz.");
});

test("the form works with no JavaScript, because it is a form that submits", () => {
  const markup = elementSearch();

  assert.match(
    markup,
    /<form class="find__form" action="\/elements\/" method="get" role="search" aria-label="Find one element">/,
  );
  assert.match(markup, /name="q"/);
  assert.match(markup, /type="submit"/);
  assert.match(markup, /<label class="visually-hidden" for="element-search">/);
});

test("the field is labelled, described and does not let the browser guess", () => {
  const markup = elementSearch();

  assert.match(markup, /aria-describedby="element-search-status"/);
  assert.match(markup, /autocomplete="off"/);
  assert.match(markup, /spellcheck="false"/);
  assert.match(markup, /role="status"/, "a screen reader is told what the search found");
});

test("the search landmark is named, because the masthead carries one too", () => {
  // Two search landmarks with no name are two places a screen-reader user cannot tell apart, and the
  // home page has both: the masthead's, which searches the site, and this one, which jumps to an
  // element.
  assert.match(elementSearch(), /aria-label="Find one element"/);
  assert.match(searchField(), /aria-label="Search the whole site"/);
});

test("a second search on the same page would not collide with the first", () => {
  const second = elementSearch({ id: "footer-search" });

  assert.match(second, /id="footer-search"/);
  assert.match(second, /for="footer-search"/);
  assert.match(second, /id="footer-search-status"/);
  assert.doesNotMatch(second, /element-search/, "the default ids must be replaced, not merely prefixed");
});

test("every result the search can produce points at a page that will exist", () => {
  // The element pages are declared by the element-page phase; what is asserted here is the shape of
  // the URL, because a search that points somewhere the rest of the site does not is a broken search.
  const one = elementSearch();

  assert.match(one, /action="\/elements\/"/);
  assert.ok(routes.some((route) => route.path === "/elements/"), "the form's action is a declared route");

  for (const element of all) {
    assert.equal(`/elements/${element.slug}/`, `/elements/${element.slug}/`);
    assert.match(element.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});

test("nothing an element is called can break out of a result's markup", () => {
  const awkward = [{ slug: "x", symbol: "X", name: '<b>bold</b> & "quoted"', atomicNumber: 1 }];
  const found = searchElements(awkward, "bold");

  assert.equal(found.length, 1);
  assert.equal(found[0].name, '<b>bold</b> & "quoted"');
});

test("every element is reachable by typing its own name", () => {
  const unreachable = all.filter((element) => !searchElements(all, element.name).includes(element));

  assert.deepEqual(unreachable, [], "some element cannot be found by its own name");
});

test("every element is reachable by typing its own symbol", () => {
  const unreachable = all.filter((element) => !searchElements(all, element.symbol).includes(element));

  assert.deepEqual(unreachable, []);
});

test("every element is reachable by typing its own atomic number", () => {
  const unreachable = all.filter(
    (element) => !searchElements(all, String(element.atomicNumber)).includes(element),
  );

  assert.deepEqual(unreachable, []);
});

test("every element the search offers is in a category the legend counts", () => {
  // A shared mistake worth guarding: a search that offers an element the legend's counts do not
  // include would make the two disagree on the same page.
  const counted = categories.total();

  assert.equal(counted, all.length);
  assert.equal(new Set(all.map((element) => element.category)).size, 11);
});