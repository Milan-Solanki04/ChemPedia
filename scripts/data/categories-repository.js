/**
 * The only reader of `data/categories.json`.
 *
 * The eleven categories are the table's legend and its colour key at the same time: each one has
 * a name a reader sees, a token a stylesheet reads, and a member count the legend prints. The
 * count is stored rather than counted because it is an assertion — the legend is meant to say
 * "35 transition metals", and if the data ever disagreed with that, the right outcome is a failed
 * test rather than a silently different number on the page.
 */

import { loadJson } from "./json-source.js";

/** The file this repository owns. */
export const CATEGORIES_FILE = "categories.json";

/**
 * Read the categories and return their queries.
 *
 * @param {{ fetchImpl?: typeof fetch, base?: string }} [options] injected so tests need no network
 * @returns {Promise<object>}
 */
export async function createCategoriesRepository({ fetchImpl = fetch, base } = {}) {
  const categories = await loadJson(CATEGORIES_FILE, { fetchImpl, base });

  if (!Array.isArray(categories)) {
    throw new TypeError(`${CATEGORIES_FILE} should hold an array of categories`);
  }

  const bySlug = new Map(categories.map((category) => [category.slug, category]));

  return {
    /** All eleven, in the order the legend prints them. */
    all: () => [...categories],

    /**
     * One category by slug.
     *
     * @param {string} slug
     * @returns {object | null}
     */
    bySlug: (slug) => bySlug.get(slug) ?? null,

    /**
     * The display name for a slug, or null when the slug is not one of the eleven.
     *
     * @param {string} slug
     * @returns {string | null}
     */
    nameFor: (slug) => bySlug.get(slug)?.name ?? null,

    /**
     * The member count each slug is asserted to have.
     *
     * @returns {Record<string, number>}
     */
    counts: () => Object.fromEntries(categories.map((category) => [category.slug, category.count])),

    /** The total the counts add up to, which the test holds to the element count. */
    total: () => categories.reduce((sum, category) => sum + category.count, 0),
  };
}
