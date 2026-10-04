/**
 * The token layer, as data.
 *
 * The one place that reads `styles/tokens.css` and answers "what is this token's value?". It exists
 * because of where the table is rendered.
 *
 * **The problem.** The table is rendered into the page at build time, in Node, so its colours have
 * to be resolved before the page exists — and in Node a CSS custom property is a line of text in a
 * file. A browser can ask `getComputedStyle(document.documentElement)` what `--g-non-metals`
 * resolves to; the build cannot ask anything. Without this module a page could render the table in
 * one mode and not another, or could resolve a fill's foreground with a second copy of the eleven
 * hex values, and either mistake would look like a colour bug on a page that had no other fault.
 *
 * **Why it is in `tools/` and not in `scripts/`.** `source/scripts/**` is what the browser loads, and
 * a module that reaches for the file system cannot be loaded by a browser. One adapter, on the build
 * side of the line, keeps that line where ADR-001 drew it.
 *
 * **It resolves references.** Fifteen tokens are declared as other tokens — `--accent: var(--ink)`,
 * `--gap-legend: var(--sp-2)` — and a reader that returned the text `var(--ink)` to a caller asking
 * for a colour would be worse than useless. A reference is followed to its value, and a reference
 * cycle is reported as no value rather than being followed forever.
 *
 * The parsing half is pure and tested on its own; only `loadTokens` touches the disk.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { readableForeground } from "../scripts/lib/contrast.js";
import { sourceDir } from "./site-paths.js";

/** Where the token layer lives, relative to `source/`. */
export const TOKENS_FILE = "styles/tokens.css";

/**
 * The tokens declared in a stylesheet, as a readable object.
 *
 * @param {string} css
 * @returns {{
 *   names: () => string[],
 *   has: (name: string) => boolean,
 *   value: (name: string) => string | null,
 *   hex: (name: string) => string | null,
 *   pair: (name: string) => { fill: string, onFill: string }
 * }}
 */
export function parseTokens(css) {
  // Comments are stripped before anything is read out of the file. None of them declare anything
  // today, and a comment that quoted a declaration to explain it would otherwise become a token.
  const withoutComments = String(css).replace(/\/\*[\s\S]*?\*\//g, "");

  const declared = new Map();

  for (const [, name, value] of withoutComments.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    declared.set(name, value.trim());
  }

  /**
   * A token's value, with any reference to another token followed to what that one says.
   *
   * @param {string} name without the leading dashes
   * @param {Set<string>} [seen] the chain already walked, so a cycle terminates
   * @returns {string | null}
   */
  function value(name, seen = new Set()) {
    const raw = declared.get(`--${name}`);

    if (raw === undefined || seen.has(`--${name}`)) {
      return null;
    }

    const reference = /^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/.exec(raw);

    if (!reference) {
      return raw;
    }

    seen.add(`--${name}`);

    return value(reference[1].slice(2), seen);
  }

  return {
    /** Every declared token's name, in the order the stylesheet declares them. */
    names: () => [...declared.keys()].map((name) => name.slice(2)),

    has: (name) => declared.has(`--${name}`),

    /**
     * @param {string} name
     * @returns {string | null} null for a token the layer does not declare
     */
    value,

    /**
     * A token's value when it is a colour, and null when it is not.
     *
     * Null rather than a throw, because asking a spacing token for its colour is a mistake worth one
     * `null` and a fallback rather than a stack trace in the middle of a build.
     *
     * @param {string} name
     * @returns {string | null}
     */
    hex(name) {
      const resolved = value(name);

      return resolved !== null && /^#[0-9a-fA-F]{3,8}$/.test(resolved) ? resolved : null;
    },

    /**
     * A fill and the foreground that reads on it, derived the way the site derives it.
     *
     * This is the call the table's colour modes are built from: the palette is asked for a token by
     * name and hands back a pair whose contrast has already been settled by the same rule that
     * settles it in the browser.
     *
     * @param {string} name
     * @returns {{ fill: string, onFill: string }}
     */
    pair(name) {
      const fill = value(name);

      if (fill === null) {
        throw new TypeError(`The token layer does not declare --${name}`);
      }

      return { fill, onFill: readableForeground(fill) };
    },
  };
}

/**
 * Read the token layer from the source tree.
 *
 * @returns {Promise<ReturnType<typeof parseTokens>>}
 */
export async function loadTokens() {
  return parseTokens(await readFile(path.join(sourceDir, TOKENS_FILE), "utf8"));
}