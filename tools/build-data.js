#!/usr/bin/env node
/**
 * Building `source/data/elements.json` from its two sources and our own writing.
 *
 * The data file is a build artefact with a copy in the repository, and that sounds like a
 * contradiction until you see what it buys. Anyone can rerun this script and get the same file;
 * anyone can read the committed file without a network connection or a datasource that still
 * exists. The alternative — fetch at build time and never commit — makes the site depend on
 * somebody else's uptime, and the alternative to that — hand-maintain the file — makes 118
 * records of forty values impossible to check.
 *
 * Run it with `node source/tools/build-data.js`. It fetches, merges, derives, verifies, and only
 * then writes. Nothing is written that has not passed verification, because a data file that is
 * half-updated is worse than one that is a day old.
 */

import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { sourceDir } from "./site-paths.js";
import { fetchRows, coreFields } from "./data-sources/pubchem.js";
import { fetchSupplementary } from "./data-sources/wikidata.js";
import { shellsFromConfiguration, valenceFromShells } from "./data-sources/configuration.js";
import { periodFor, groupFor, blockFor, positionFor } from "./data-sources/layout.js";
import { displayName, slugFor } from "../scripts/lib/slug.js";

/** Where the data lives, and the file the authored prose is kept in. */
const DATA_DIR = path.join(sourceDir, "data");
const NOTES_FILE = "element-notes.json";
const OUTPUT_FILE = "elements.json";

/** How each part of a record is attributed on the about page. */
const PROVENANCE = {
  facts: "PubChem Periodic Table (public domain)",
  supplementary: "Wikidata (CC0)",
  prose: "Written for ChemiPedia",
};

/**
 * Read a JSON file from the data folder.
 *
 * @param {string} name
 * @returns {Promise<unknown>}
 */
async function readData(name) {
  return JSON.parse(await readFile(path.join(DATA_DIR, name), "utf8"));
}

/**
 * Read the authored prose, or an empty object when it has not been written yet.
 *
 * Absence is not an error, because the facts and the prose arrive in different commits and the
 * script has to be runnable in between. A note that is present but blank *is* an error: that is
 * someone having started and not finished, which is the state that ships a half-empty paragraph.
 *
 * @returns {Promise<Record<string, object>>}
 */
async function readNotes() {
  try {
    return await readData(NOTES_FILE);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

/**
 * The category an element is filed under: the dataset's own, corrected where recorded.
 *
 * @param {object} core
 * @param {Map<number, { category: string, reason: string }>} overrides
 * @returns {string}
 */
function categoryFor(core, overrides) {
  const override = overrides.get(core.atomicNumber);

  if (override) {
    return override.category;
  }

  if (!core.datasetCategory) {
    throw new Error(`${core.symbol}: the dataset gave a category this project does not know`);
  }

  return core.datasetCategory;
}

/**
 * An element's atomic weight: the dataset's own, corrected where recorded.
 *
 * Two of the 118 arrive as whole numbers, and a standard atomic weight is never a whole number — so
 * what the source gave is a mass number, not a weight, and the difference is visible in a list of
 * 118. The correction is recorded in `overrides.json` with its reason rather than patched here, so it
 * survives a rebuild of the data and cannot be lost by someone regenerating it.
 *
 * @param {object} core
 * @param {Map<number, { atomicWeight: number }>} weights
 * @returns {number}
 */
function atomicWeightFor(core, weights) {
  const override = weights.get(core.atomicNumber);

  return override ? override.atomicWeight : core.atomicWeight;
}

/**
 * One element's record, out of everything that contributed to it.
 *
 * @param {object} core the mapped dataset row
 * @param {object} supplementary the Wikidata fields, possibly empty
 * @param {object | undefined} notes the authored prose, possibly absent
 * @param {Map<number, object>} overrides
 * @param {Map<number, object>} weights
 * @returns {object}
 */
function buildElement(core, supplementary, notes, overrides, weights) {
  const shells = shellsFromConfiguration(core.electronConfiguration);
  const electrons = shells.reduce((sum, count) => sum + count, 0);

  if (electrons !== core.atomicNumber) {
    throw new Error(
      `${core.symbol}: the configuration "${core.electronConfiguration}" accounts for ` +
        `${electrons} electrons, not ${core.atomicNumber}`,
    );
  }

  const { row, column } = positionFor(core.atomicNumber);

  return {
    atomicNumber: core.atomicNumber,
    symbol: core.symbol,
    name: displayName(core.name),
    slug: slugFor(core.name),
    pronunciation: notes?.pronunciation ?? null,

    category: categoryFor(core, overrides),
    group: groupFor(core.atomicNumber),
    period: periodFor(core.atomicNumber),
    block: blockFor(core.atomicNumber),
    position: { row, column },

    atomicWeight: atomicWeightFor(core, weights),
    state: core.state,
    meltingPoint: core.meltingPoint,
    boilingPoint: core.boilingPoint,
    density: core.density,
    crystalStructure: supplementary.crystalStructure ?? null,

    electronConfiguration: core.electronConfiguration,
    shells,
    valence: valenceFromShells(shells),
    electronegativity: core.electronegativity,
    oxidationStates: core.oxidationStates,
    ionizationEnergies: core.ionizationEnergies,

    heatOfFusion: supplementary.heatOfFusion ?? null,
    heatOfVaporization: supplementary.heatOfVaporization ?? null,
    specificHeat: supplementary.specificHeat ?? null,
    thermalConductivity: supplementary.thermalConductivity ?? null,
    thermalExpansion: supplementary.thermalExpansion ?? null,
    electricalConductivity: supplementary.electricalConductivity ?? null,

    atomicRadius: core.atomicRadius,
    covalentRadius: null,
    atomicVolume: supplementary.atomicVolume ?? null,
    latticeParameters: null,

    discovery: {
      discoveredBy: supplementary.discoveredBy ?? null,
      year: core.discoveredYear,
      place: supplementary.place ?? null,
      nameOrigin: notes?.nameOrigin ?? null,
    },

    summary: notes?.summary ?? null,
    uses: notes?.uses ?? null,
    sources: notes?.sources ?? null,

    dataSource: PROVENANCE,
  };
}

/** The five fields an element's authored note carries. */
const NOTE_FIELDS = ["pronunciation", "nameOrigin", "summary", "uses", "sources"];

/**
 * Everything wrong with the authored prose.
 *
 * A note that is absent is fine: the facts and the writing arrive in different commits. A note
 * that is present but blank is not, because that is someone having started and stopped, and it is
 * the state that ships half a paragraph to a page.
 *
 * @param {Record<string, object>} notes
 * @returns {string[]}
 */
function problemsWithNotes(notes) {
  const problems = [];

  for (const [symbol, note] of Object.entries(notes)) {
    // The file carries a short note of its own explaining what it is for. Skip anything that is
    // not an element's entry.
    if (typeof note !== "object" || note === null) {
      continue;
    }

    for (const field of NOTE_FIELDS) {
      if (typeof note[field] !== "string" || note[field].trim() === "") {
        problems.push(`${symbol}: "${field}" is present but blank`);
      }
    }
  }

  return problems;
}

/**
 * Everything wrong with the set of records, as sentences.
 *
 * Collected rather than thrown one at a time, so a run reports all of its problems at once
 * instead of one per invocation.
 *
 * @param {object[]} elements
 * @param {object[]} categories
 * @returns {string[]}
 */
function problemsWith(elements, categories) {
  const problems = [];
  const numbers = new Set();
  const slugs = new Set();
  const cells = new Map();
  const slugsByCategory = new Map();

  for (const element of elements) {
    if (numbers.has(element.atomicNumber)) {
      problems.push(`atomic number ${element.atomicNumber} appears twice`);
    }

    numbers.add(element.atomicNumber);

    if (slugs.has(element.slug)) {
      problems.push(`${element.symbol}: the slug "${element.slug}" is used twice`);
    }

    slugs.add(element.slug);

    const cell = `${element.position.row}:${element.position.column}`;
    const occupant = cells.get(cell);

    if (occupant) {
      problems.push(`${element.symbol} and ${occupant} are both drawn in cell ${cell}`);
    }

    cells.set(cell, element.symbol);
    slugsByCategory.set(element.category, (slugsByCategory.get(element.category) ?? 0) + 1);
  }

  for (const category of categories) {
    const counted = slugsByCategory.get(category.slug) ?? 0;

    if (counted !== category.count) {
      problems.push(`${category.slug}: ${counted} elements, the legend says ${category.count}`);
    }
  }

  for (const category of slugsByCategory.keys()) {
    if (!categories.some((known) => known.slug === category)) {
      problems.push(`${category}: a category the legend does not declare`);
    }
  }

  return problems;
}

/**
 * Fetch, merge, verify and write.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const categories = await readData("categories.json");
  const { categories: corrections, atomicWeights: weightCorrections } = await readData("overrides.json");
  const notes = await readNotes();

  const overrides = new Map(
    corrections.map(({ atomicNumber, category, reason }) => [atomicNumber, { category, reason }]),
  );

  const weights = new Map(
    weightCorrections.map(({ atomicNumber, atomicWeight }) => [atomicNumber, { atomicWeight }]),
  );

  const rows = await fetchRows();
  const cores = rows.map(coreFields).sort((one, other) => one.atomicNumber - other.atomicNumber);

  const molarMass = new Map(cores.map((core) => [core.atomicNumber, core.atomicWeight]));
  const { byNumber, unconvertibleUnits } = await fetchSupplementary({
    molarMassByNumber: molarMass,
  });

  const elements = cores.map((core) =>
    buildElement(core, byNumber.get(core.atomicNumber) ?? {}, notes[core.symbol], overrides, weights),
  );

  const problems = [...problemsWithNotes(notes), ...problemsWith(elements, categories)];

  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`  ${problem}\n`);
    }

    throw new Error(`${problems.length} problem(s); nothing was written`);
  }

  const awaitingProse = elements.filter((element) => !element.summary).map((element) => element.symbol);
  const missing = [
    "covalentRadius",
    "latticeParameters",
    "meltingPoint",
    "boilingPoint",
    "density",
    "electronegativity",
    "crystalStructure",
  ].map((field) => `${field} ${elements.filter((element) => element[field] === null).length}`);

  process.stdout.write(
    [
      `${elements.length} elements, verified`,
      `categories  ${categories.map((category) => `${category.slug} ${category.count}`).join(", ")}`,
      `unknowns    ${missing.join(", ")}`,
      `no prose    ${awaitingProse.length === 0 ? "none" : awaitingProse.join(" ")}`,
      `units       ${unconvertibleUnits.length === 0 ? "all converted" : `unconverted: ${unconvertibleUnits.join(", ")}`}`,
    ].join("\n") + "\n",
  );

  if (dryRun) {
    process.stdout.write("Dry run: nothing written.\n");
    return;
  }

  await writeFile(path.join(DATA_DIR, OUTPUT_FILE), `${JSON.stringify(elements, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote data/${OUTPUT_FILE}.\n`);
}

await main();
