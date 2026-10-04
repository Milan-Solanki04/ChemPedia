/**
 * The only reader of `data/element-groups.json`.
 *
 * That file holds the **written copy** for the eleven group pages and nothing else: one sentence for
 * the hero and a short paragraph for the group itself. The taxonomy is not here — a group's slug,
 * display name, plural and colour live in `categories.json`, and its membership is derived from
 * `elements.json` by that slug. A second file that listed the members would be a second place for the
 * counts to disagree with the records, and a group's page is a page whose headline number is its
 * member count.
 *
 * So this repository joins two sources rather than owning a third: it hands back the prose for a slug,
 * and the caller gets the members from the elements repository. That is why there is no `count` on
 * anything here — a count would have to be counted somewhere, and the only place worth counting it is
 * where the elements are.
 */

import { loadJson } from "./json-source.js";

/** The file this repository owns. */
export const ELEMENT_GROUPS_FILE = "element-groups.json";

/**
 * Read the group's written copy and return its queries.
 *
 * @param {{ fetchImpl?: typeof fetch, base?: string }} [options] injected so tests need no network
 * @returns {Promise<object>}
 */
export async function createElementGroupsRepository({ fetchImpl = fetch, base } = {}) {
  const source = await loadJson(ELEMENT_GROUPS_FILE, { fetchImpl, base });
  const groups = source?.groups;

  if (!groups || typeof groups !== "object" || Array.isArray(groups)) {
    throw new TypeError(`${ELEMENT_GROUPS_FILE} should hold a "groups" object keyed by category slug`);
  }

  for (const [slug, copy] of Object.entries(groups)) {
    if (typeof copy?.lede !== "string" || typeof copy?.character !== "string") {
      throw new TypeError(`${ELEMENT_GROUPS_FILE}: ${slug} needs both a lede and a character`);
    }
  }

  return {
    /**
     * Every group that has written copy, in the order the file declares them.
     *
     * @returns {string[]}
     */
    slugs: () => Object.keys(groups),

    /**
     * One group's written copy, or null when the file has none for that slug.
     *
     * Null rather than a fallback sentence, because a group page with a placeholder for its own
     * description is a page that says nothing while appearing to.
     *
     * @param {string} slug a category slug
     * @returns {{ lede: string, character: string } | null}
     */
    bySlug: (slug) => groups[slug] ?? null,

    /**
     * The group's written copy, or an error naming the slug.
     *
     * The strict twin of `bySlug`, for the build: a declared route pointing at a group with no prose
     * is a mistake worth stopping the build for, and it should stop it rather than publish a blank.
     *
     * @param {string} slug a category slug
     * @returns {{ lede: string, character: string }}
     */
    require: (slug) => {
      const copy = groups[slug];

      if (!copy) {
        throw new Error(`${ELEMENT_GROUPS_FILE} has no written copy for ${slug}`);
      }

      return copy;
    },
  };
}