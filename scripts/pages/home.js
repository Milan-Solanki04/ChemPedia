/**
 * The home page.
 *
 * One page, two halves, and the split is the whole idea of this project.
 *
 * **The first half runs at build time and produces the page.** It takes the authored template, finds
 * the places in it that need data, and fills them: the legend, the table, and the search. Everything
 * else on the page is written copy that lives in `pages/home.html`, where it can be read and edited
 * as prose. That split is why this module takes its data as an argument rather than loading it: it is
 * imported by the build in Node and, for the second half, by a browser — and `source/scripts/**` is
 * what the browser loads, so nothing in here may reach for the file system.
 *
 * **The second half runs in the browser and adds behaviour to a page that already works.**
 * `hydrateHome` attaches the table's isolation and arrow-key movement, and the search's live
 * filtering. With it never called the page is still complete: 118 links, a colour key, a form that
 * submits, and prose that reads. That is the only kind of enhancement worth having.
 *
 * The search needs the data layer in the browser, which is the first time on the site that the
 * shipped repositories are read at runtime rather than at build time. It does not read it: the entry
 * point has already read it for the router's route list, and both are given the same records. When
 * that read fails the form is simply left as the form it already is — it still submits, and the
 * elements index still answers — so there is nothing to report and no page left with a search box
 * that does nothing.
 *
 * Both halves are painted from one argument. `mode` is a colour mode — something that can answer
 * "what colour is this element" and "what does the legend say" — and the home page never learns what
 * a token is. That is what keeps the home page and the four table views from drifting apart on a
 * colour, and it is why neither of them resolves a hex value itself.
 */

import { elementSearch, wireElementSearch } from "../components/element-search.js";
import { legendChips } from "../components/legend-chips.js";
import { periodicTable, wireTable } from "../components/periodic-table.js";

/** The markers the home template carries, and the order they are expected in. */
export const HOME_PLACEHOLDERS = ["legend", "table", "search"];

/**
 * The marker for a block of generated markup: `<!-- table -->`.
 *
 * An HTML comment rather than a brace-delimited placeholder so the template stays valid markup that
 * renders on its own in a browser, and so a reader looking at the built page can see what was put
 * where.
 *
 * @param {string} name
 * @returns {string}
 */
export function placeholder(name) {
  return `<!-- ${name} -->`;
}

/**
 * Fill a template's generated blocks.
 *
 * A marker with nothing to fill it is reported rather than quietly left in the output, because a
 * leftover comment in the built page is a page that is missing something and does not know it. A
 * block with no marker is simply unused — a page may declare a block before it has somewhere to put
 * it.
 *
 * **What a marker is, exactly.** A marker is a comment whose entire body is one bare word. A
 * template's header is a comment whose body is prose. The distinction matters because every template
 * explains itself in a header, and the natural sentence to write there is "this marker is filled by
 * the page module" — quoted, so it reads as prose. To a regular expression that quoted marker is
 * indistinguishable from the real one, so the block is injected into the header as well and the page
 * ships a duplicate id. The elements index did exactly that on its first draft, and the test in that
 * page's suite is the scar.
 *
 * So the comments are taken out first and only the ones that are a bare word are put back filled.
 *
 * @param {string} template the authored fragment
 * @param {Record<string, string>} blocks marker name to markup
 * @returns {string}
 */
export function fillTemplate(template, blocks) {
  const fill = (chunk) =>
    chunk.replace(/<!--\s*([a-z][a-z-]*)\s*-->/g, (marker, name) => {
      const block = blocks[name];

      if (block === undefined) {
        throw new Error(`The template has a ${name} marker and nothing to fill it with`);
      }

      return block;
    });

  return String(template)
    .split(/(<!--[\s\S]*?-->)/g)
    .map((chunk) => {
      if (!chunk.startsWith("<!--")) {
        return fill(chunk);
      }

      const marker = chunk.match(/^<!--\s*([a-z][a-z-]*)\s*-->$/);

      // A comment that is a bare word is a marker and gets filled. Anything else is a header, or a
      // note to the next reader, and is put back exactly as it was written.
      return marker ? fill(marker[0]) : chunk;
    })
    .join("");
}

/**
 * Render the home page's body.
 *
 * @param {{
 *   template: string,
 *   elements: object[],
 *   mode: {
 *     paint: (element: object) => { fill: string, onFill: string, key: string },
 *     keys: (elements: object[]) => { key: string, label: string, count: number, paint: object }[]
 *   },
 * }} context
 * @returns {string}
 */
export function homePage({ template, elements, mode }) {
  return fillTemplate(template, {
    legend: legendChips({ entries: mode.keys(elements) }),
    table: periodicTable({ elements, paint: mode.paint }),
    search: elementSearch(),
  });
}

/**
 * Attach the home page's behaviour to a page that already contains it.
 *
 * Takes the elements rather than loading them, because the entry point has already read the data
 * layer for the router's route list — one fetch for the page, not one per component that wants data.
 * It also means a reader who cannot load the data keeps a page whose table works and whose search
 * form still submits.
 *
 * @param {{ root: ParentNode, elements: object[] }} context
 * @returns {{ release: () => void }}
 */
export function hydrateHome({ root, elements }) {
  const table = wireTable(root);
  const search = wireElementSearch(root, { elements: elements ?? [] });

  return {
    /** Detach everything, for a page that swaps its own content out. */
    release: () => {
      table.destroy();
      search.release();
    },
  };
}