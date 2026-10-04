/**
 * The data layer, wired to the file system.
 *
 * The repositories read their JSON through an injected `fetch`, which is the right shape for a
 * browser and the wrong one for a build: in Node there is no base URL and no network, and the data
 * is a file two directories away.
 *
 * So this module supplies the one thing that is different here — a `fetch` that reads a data file off
 * the disk — and hands back the same repositories a browser gets. Everything downstream, including
 * the page modules, is then the shipped code path and not a variant of it: the home page renders the
 * table through the repository the browser will also use, not through a copy that only the build can
 * see.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createCategoriesRepository } from "../scripts/data/categories-repository.js";
import { createElementGroupsRepository } from "../scripts/data/element-groups-repository.js";
import { createGlossaryRepository } from "../scripts/data/glossary-repository.js";
import { createElementsRepository } from "../scripts/data/elements-repository.js";
import { createUnitsRepository } from "../scripts/data/units-repository.js";
import { sourceDir } from "./site-paths.js";

/**
 * A `fetch` that answers from `source/data/` instead of the network.
 *
 * @param {string} url whatever a repository asked for; only the file name is used
 * @returns {Promise<Response>}
 */
export async function fetchDataFile(url) {
  const name = path.basename(new URL(url, "http://localhost").pathname);
  const body = await readFile(path.join(sourceDir, "data", name), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

/**
 * Every repository a page module may ask for.
 *
 * @returns {Promise<{
 *   elements: Awaited<ReturnType<typeof createElementsRepository>>,
 *   categories: Awaited<ReturnType<typeof createCategoriesRepository>>,
 *   units: Awaited<ReturnType<typeof createUnitsRepository>>,
 *   groups: Awaited<ReturnType<typeof createElementGroupsRepository>>,
 *   glossary: Awaited<ReturnType<typeof createGlossaryRepository>>
 * }>}
 */
export async function loadRepositories() {
  const options = { fetchImpl: fetchDataFile };
  const [elements, categories, units, groups, glossary] = await Promise.all([
    createElementsRepository(options),
    createCategoriesRepository(options),
    createUnitsRepository(options),
    createElementGroupsRepository(options),
    createGlossaryRepository(options),
  ]);

  return { elements, categories, units, groups, glossary };
}