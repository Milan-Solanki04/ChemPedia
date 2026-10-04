import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createCategoriesRepository } from "../../scripts/data/categories-repository.js";
import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { createUnitsRepository } from "../../scripts/data/units-repository.js";
import { faqBlock, answerableQuestions } from "../../scripts/components/faq-block.js";
import { neighboursOf, elementStrip } from "../../scripts/components/element-strip.js";
import { PROPERTY_ROWS, propertyList } from "../../scripts/components/property-list.js";
import { ringDots, ringRadii, shellDiagram } from "../../scripts/components/shell-diagram.js";
import { readableForeground } from "../../scripts/lib/contrast.js";
import { formatMeasurement } from "../../scripts/lib/format.js";

async function fromDisk(url) {
  const name = url.split("/").pop();
  const body = await readFile(new URL(`../../data/${name}`, import.meta.url), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

const { elements, categories, units } = await loadRepositories();

/** Every element, loaded through the shipped repositories so the fixtures cannot drift. */
async function loadRepositories() {
  const [elementRepo, categoryRepo, unitRepo] = await Promise.all([
    createElementsRepository({ fetchImpl: fromDisk }),
    createCategoriesRepository({ fetchImpl: fromDisk }),
    createUnitsRepository({ fetchImpl: fromDisk }),
  ]);

  return { elements: elementRepo.all(), categories: categoryRepo, units: unitRepo };
}

const paint = (element) => {
  const fill = fillFor(element);

  return { fill, onFill: readableForeground(fill) };
};

const tokens = await readFile(new URL("../../styles/tokens.css", import.meta.url), "utf8");

function fillFor(element) {
  const token = categories.bySlug(element.category).token;

  return tokens.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,6})`))[1];
}

/** How many of a class a string carries. */
const count = (markup, pattern) => (markup.match(pattern) || []).length;

/** One element by its symbol, from the loaded records. */
const bySymbol = (symbol) => elements.find((one) => one.symbol === symbol);

test("a shell diagram has one ring per shell and one dot per electron", () => {
  for (const symbol of ["H", "C", "Fe", "Au", "U"]) {
    const element = bySymbol(symbol);
    const markup = shellDiagram({ element, paint: paint(element) });

    assert.equal(count(markup, /class="shell-diagram__ring"/g), element.shells.length, `${symbol}: rings`);
    assert.equal(
      count(markup, /class="shell-diagram__electron"/g),
      element.atomicNumber,
      `${symbol}: one dot per electron`,
    );
  }
});

test("the five elements the exit criterion names have the shells their records say", () => {
  const expected = {
    H: [1],
    C: [2, 4],
    Fe: [2, 8, 14, 2],
    Au: [2, 8, 18, 32, 18, 1],
    U: [2, 8, 18, 32, 21, 9, 2],
  };

  for (const [symbol, shells] of Object.entries(expected)) {
    assert.deepEqual(bySymbol(symbol).shells, shells, symbol);
    assert.equal(shellDiagram({ element: bySymbol(symbol), paint: paint(bySymbol(symbol)) }).match(/shell-diagram__ring/g).length, shells.length, `${symbol} rings`);
  }
});

test("every element's diagram adds up to its own atomic number", () => {
  for (const element of elements) {
    const dots = shellDiagram({ element, paint: paint(element) }).match(/shell-diagram__electron/g) ?? [];

    assert.equal(dots.length, element.atomicNumber, `${element.symbol}: dots`);
  }
});

test("a diagram with one shell is one ring, not a ring of the wrong size", () => {
  assert.deepEqual(ringRadii(1), [44]);
  assert.equal(ringRadii(2).length, 2);
  assert.equal(ringRadii(7).length, 7);
});

test("every ring is inside the frame, and the rings do not cross", () => {
  for (const shells of [1, 2, 3, 4, 7]) {
    const radii = ringRadii(shells);

    for (const radius of radii) {
      assert.ok(radius <= 50, `a ring of ${radius} falls outside a 100-unit box`);
    }

    for (let index = 1; index < radii.length; index += 1) {
      assert.ok(radii[index] > radii[index - 1], "rings must grow outwards");
    }
  }
});

test("one electron sits at the top, and two sit either side of it", () => {
  const [single] = ringDots(20, 1);

  assert.ok(Math.abs(single.x - 50) < 0.001, "the first electron is at the top");
  assert.ok(single.y < 50);

  const pair = ringDots(20, 2);

  assert.equal(pair.length, 2);
  assert.ok(pair[0].y < 50, "the first of two is at the top");
  assert.ok(pair[1].y > 50, "and the second is diametrically opposite");
  assert.ok(Math.abs(pair[0].x - pair[1].x) < 0.001);

  // A full shell is evenly spread, which is what makes a ring of 18 look like a shell rather than a
  // clock face with a gap in it.
  const full = ringDots(20, 18);
  const gaps = full.map((dot, index) => {
    const next = full[(index + 1) % 18];

    return Math.atan2(next.y - 50, next.x - 50) - Math.atan2(dot.y - 50, dot.x - 50);
  });

  // The gap that crosses the end of the circle comes out negative, so it is measured the short way
  // round rather than by sign.
  for (const gap of gaps) {
    const short = gap < 0 ? gap + Math.PI * 2 : gap;

    assert.ok(Math.abs(short - (Math.PI * 2) / 18) < 0.001, `a gap of ${short}`);
  }
});

test("a diagram says what it is, in words a screen reader can read", () => {
  const iron = bySymbol("Fe");
  const markup = shellDiagram({ element: iron, paint: paint(iron) });

  assert.match(markup, /role="img"/);
  assert.match(markup, /<title id="shell-diagram-title">Electron shells of Fe<\/title>/);
  assert.match(markup, /<desc>26 electrons in 4 shells: 2, 8, 14, 2\.<\/desc>/);
});

test("the one element with a single electron is described in the singular", () => {
  // Hydrogen is the element every reader meets first, and "1 electrons in 1 shell" is the sentence
  // they would meet it in.
  const hydrogen = bySymbol("H");

  assert.match(
    shellDiagram({ element: hydrogen, paint: paint(hydrogen) }),
    /<desc>1 electron in 1 shell: 1\.<\/desc>/,
  );
});

test("a diagram is drawn in its own element's ink, so it belongs to it", () => {
  const copper = bySymbol("Cu");
  const markup = shellDiagram({ element: copper, paint: paint(copper) });

  assert.match(markup, new RegExp(`--fill:${paint(copper).fill}`));
  assert.match(markup, new RegExp(`--on-fill:${paint(copper).onFill}`));
});

test("the property list prints every value the record carries and invents none", () => {
  const iron = bySymbol("Fe");
  const markup = propertyList({ element: iron, units });
  const shown = [...markup.matchAll(/<dt class="property__label">([^<]+)<\/dt><dd class="property__value">([^<]*)</g)].map(
    ([, label, value]) => [label, value],
  );

  const valueOf = (label) => shown.find(([name]) => name === label)?.[1];

  assert.equal(valueOf("Protons"), "26");
  assert.equal(valueOf("Electrons"), "26");
  assert.equal(valueOf("Neutrons"), "30");
  assert.equal(valueOf("Atomic weight"), "55.84\u00a0u");
  assert.equal(valueOf("Melting point"), "1537.85\u00a0°C");
  assert.equal(valueOf("State at 293 K"), "Solid");
  assert.equal(valueOf("Shells"), "2, 8, 14, 2");
  assert.equal(valueOf("Oxidation states"), "+2, +3");
  // The record's own order, not the order a textbook writes: both describe the same configuration,
  // and a page that reordered it would be a page that had decided the data was wrong.
  assert.equal(valueOf("Electron configuration"), bySymbol("Fe").electronConfiguration);
  assert.equal(
    valueOf("Thermal expansion"),
    formatMeasurement(bySymbol("Fe").thermalExpansion, units.definitionFor("thermalExpansion")),
    "a measurement never loses its unit",
  );
  assert.match(valueOf("Thermal expansion"), /10\u207b\u2076\/K$/);
  assert.ok(shown.length >= 20, `only ${shown.length} rows`);
});

test("a property the sources do not carry is left out rather than shown as zero or a dash", () => {
  // Oganesson carries almost nothing measured, and a page of forty rows reading "Unknown" says the
  // site is missing facts where it is missing rows.
  const oganesson = bySymbol("Og");
  const markup = propertyList({ element: oganesson, units });

  assert.doesNotMatch(markup, /Unknown/);
  assert.doesNotMatch(markup, /—/);
  assert.doesNotMatch(markup, /<dd class="property__value"><\/dd>/);
  assert.ok(/data-property-count="(\d+)"/.test(markup));
});

test("no element's property list ever says Unknown, and every one is non-empty", () => {
  for (const element of elements) {
    const markup = propertyList({ element, units });
    const count = Number(/data-property-count="(\d+)"/.exec(markup)[1]);

    assert.ok(count >= 10, `${element.symbol}: only ${count} rows`);
    assert.doesNotMatch(markup, /Unknown/, `${element.symbol} prints Unknown`);
  }
});

test("the thirty f-block elements have no group row, because this table gives them none", () => {
  const fBlock = elements.filter((one) => one.block === "f");

  assert.equal(fBlock.length, 30);

  for (const element of fBlock) {
    assert.equal(element.group, null, `${element.symbol} has a group`);
    assert.doesNotMatch(propertyList({ element, units }), /Group<\/dt>/, `${element.symbol} prints a group`);
  }
});

test("the property list's rows are in the one order on every page, with gaps only where facts are", () => {
  // Two pages must not disagree about which properties an element has. So the rows a page prints must
  // be a subsequence of the canonical order — never reordered, and never a row that belongs to
  // somewhere else.
  const labels = (element) =>
    [...propertyList({ element, units }).matchAll(/property__label">([^<]+)</g)].map((match) => match[1]);

  // The canonical order is the declaration itself, not one element's reading of it: an element with
  // unusually complete measurements is not the shape of the table.
  const canonical = PROPERTY_ROWS.map((row) => row.label);

  for (const element of elements) {
    const here = labels(element);
    const positions = here.map((label) => canonical.indexOf(label));

    assert.ok(positions.every((position) => position !== -1), `${element.symbol} has an unknown row`);

    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(positions[index] > positions[index - 1], `${element.symbol} reorders at ${here[index]}`);
    }
  }

  // Every declared row is a real label and the sequence starts and ends where it should.
  assert.equal(canonical[0], "Protons");
  assert.equal(canonical.at(-1), "Lattice parameters");
  assert.equal(new Set(canonical).size, canonical.length, "two rows share a label");
  assert.equal(labels(bySymbol("Fe")).every((label) => canonical.includes(label)), true);
});

test("the questions an element answers are generated from its own record", () => {
  const iron = bySymbol("Fe");
  const answers = answerableQuestions({ element: iron, units });
  const answerOf = (field) => answers.find((one) => one.field === field)?.answer;

  assert.equal(answerOf("atomicWeight"), "55.84\u00a0u");
  assert.equal(answerOf("meltingPoint"), "1537.85\u00a0°C");
  assert.equal(answerOf("boilingPoint"), "2860.85\u00a0°C");
  assert.equal(answerOf("electronConfiguration"), bySymbol("Fe").electronConfiguration);
});

test("a generated answer always agrees with the property list beside it", () => {
  // The exit criterion. Every value the questions print must be the same string the property list
  // prints, because both are computed from the same record and neither may format it its own way.
  for (const element of elements) {
    const list = propertyList({ element, units });
    const shown = new Map(
      [...list.matchAll(/property__label">([^<]+)<\/dt><dd class="property__value">([^<]*)</g)].map(([, label, value]) => [
        label,
        value,
      ]),
    );

    const answers = answerableQuestions({ element, units });

    const pairs = [
      ["atomicWeight", "Atomic weight"],
      ["meltingPoint", "Melting point"],
      ["boilingPoint", "Boiling point"],
      ["electronConfiguration", "Electron configuration"],
    ];

    for (const [field, label] of pairs) {
      const answer = answers.find((one) => one.field === field)?.answer;

      if (answer === undefined) {
        continue;
      }

      assert.equal(answer, shown.get(label), `${element.symbol}: ${label} disagrees`);
    }
  }
});

test("a question the sources cannot answer is not asked", () => {
  const oganesson = bySymbol("Og");
  const answers = answerableQuestions({ element: oganesson, units });
  const markup = faqBlock({ element: oganesson, units });

  for (const { answer } of answers) {
    assert.notEqual(answer, "Unknown", "a question was asked whose answer is not measured");
    assert.match(markup, new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.ok(answers.length < 4, "oganesson should answer fewer than all four");
});

test("an element whose record answers nothing renders no question block at all", () => {
  const bare = {
    ...bySymbol("Fe"),
    atomicWeight: null,
    meltingPoint: null,
    boilingPoint: null,
    electronConfiguration: null,
  };

  assert.equal(faqBlock({ element: bare, units }), "");
});

test("the strip's neighbours are the ones either side, in atomic order", () => {
  const all = elements;
  const iron = bySymbol("Fe");
  const { previous, next } = neighboursOf({ all, current: iron });

  assert.equal(previous.symbol, "Mn");
  assert.equal(next.symbol, "Co");
});

test("the strip wraps at both ends, because the table is a circle", () => {
  const all = elements;
  const hydrogen = neighboursOf({ all, current: bySymbol("H") });
  const oganesson = neighboursOf({ all, current: bySymbol("Og") });

  assert.equal(hydrogen.previous.symbol, "Og", "hydrogen's previous is the heaviest element");
  assert.equal(hydrogen.next.symbol, "He");
  assert.equal(oganesson.previous.symbol, "Ts");
  assert.equal(oganesson.next.symbol, "H", "oganesson's next is the lightest element");
});

test("an element that is not in the list has no neighbours rather than a wrong pair", () => {
  const invented = { slug: "unobtainium", name: "Unobtainium", atomicNumber: 119 };

  assert.deepEqual(neighboursOf({ all: elements, current: invented }), { previous: null, next: null });
  assert.deepEqual(neighboursOf({ all: [], current: invented }), { previous: null, next: null });
});

test("the strip names the current element and links only to the other two", () => {
  const iron = bySymbol("Fe");
  const markup = elementStrip({ element: iron, all: elements });
  const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(hrefs, ["/elements/manganese/", "/elements/cobalt/"]);
  assert.match(markup, /aria-current="page"/);
  assert.match(markup, /<span class="strip__name">Iron<\/span>/);
});

test("no value anywhere in the four components can break out of its markup", () => {
  // Each component is given a field it actually prints, so the assertion is that the escaping ran
  // rather than that the value never appeared.
  const hostile = '<img src=x onerror="alert(1)">';
  const fill = { fill: "#f9aa62", onFill: "#12211f" };
  const cases = [
    [propertyList({ element: { ...bySymbol("Fe"), crystalStructure: hostile }, units }), "the property list"],
    [faqBlock({ element: { ...bySymbol("Fe"), electronConfiguration: hostile }, units }), "the questions"],
    [
      elementStrip({ element: { ...bySymbol("Fe"), name: hostile }, all: elements }),
      "the strip",
    ],
    [shellDiagram({ element: { ...bySymbol("Fe"), symbol: hostile }, paint: fill }), "the diagram"],
  ];

  for (const [markup, which] of cases) {
    assert.doesNotMatch(markup, /<img/, `${which} did not escape`);
    assert.match(markup, /&lt;img/, `${which} dropped the value instead of escaping it`);
  }
});