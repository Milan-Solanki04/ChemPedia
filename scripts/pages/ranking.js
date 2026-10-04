/**
 * The property ranking pages: `/properties/melting-point/`, `/properties/boiling-point/` and
 * `/properties/orbital-configuration/`.
 *
 * One template and one module for all three, because they are one family: what differs between them
 * is which columns a row has and in what order the rows come, which is data rather than a different
 * page. The reference puts melting and boiling in two columns of one table; ours gives each its own
 * page, which the route manifest has declared and the submenu has linked since Phase 1, and which
 * lets each page rank one thing rather than showing two tables of unequal meaning side by side.
 *
 * **The ranking is decided here, at build time, and it is a pure function.** `rankBy` sorts the
 * records and drops the ones whose value the record does not carry; no script re-sorts anything in
 * the browser. A ranking a reader could reorder by clicking would stop being a ranking, and this
 * phase's exit criterion is that the order is monotonic and checkable without a mouse.
 *
 * **A value the record does not carry is counted, not shown as a row.** Fifteen elements have no
 * melting point and twenty-five have no boiling point, and a row reading "Unknown" in a list ordered
 * by melting point is a row that cannot be placed in the order. So the ranking is the measured
 * elements, and the count of the rest is printed under the table — a reader who expected 118 rows is
 * told why there are 103.
 *
 * **The bar is drawn from the value, never stored.** `barWidth` maps a value onto the range the
 * ranking itself spans, so the shortest bar is the coldest element on this page and the longest the
 * hottest, and a bar cannot disagree with the number printed on it. Scaling from zero would be worse
 * than useless here: these are temperatures, they are negative, and zero means nothing beside them.
 *
 * The orbital page is grouped by block rather than ranked by a value, because there is no value to
 * rank by. A group heading carries the block, so the block is not repeated on every row.
 */

import { attributes, escapeHtml } from "../lib/html.js";
import { elementFilter, filterTextFor, wireElementFilter } from "../components/element-filter.js";
import { elementTile } from "../components/element-tile.js";
import { fillTemplate } from "./home.js";
import { formatMeasurement, formatNumber } from "../lib/format.js";

/** The markers this template carries, and the order they are expected in. */
export const RANKING_PLACEHOLDERS = ["heading", "lede", "filter", "rankings"];

/**
 * The three pages this family renders.
 *
 * The title, lede and column set are the page's own copy and configuration. Which sentence explains
 * the table depends on what the table is, so it cannot live in a template shared by three pages.
 *
 * @type {Record<string, object>}
 */
export const RANKINGS = {
  "melting-point": {
    title: "Melting points of elements",
    lede: "The temperature at which each element turns from solid to liquid, in degrees Celsius.",
    field: "meltingPoint",
    noun: "melting point",
    columns: ["state"],
    caveat:
      "Carbon heads this list, and not because it melts. At ordinary pressure it sublimes — the " +
      "solid passes straight to gas — which is why it sits above tungsten, the highest-melting metal.",
  },
  "boiling-point": {
    title: "Boiling points of elements",
    lede: "The temperature at which each element turns from liquid to gas, in degrees Celsius.",
    field: "boilingPoint",
    noun: "boiling point",
    columns: ["state"],
    caveat: null,
  },
  "orbital-configuration": {
    title: "Orbital configurations of the elements",
    lede: "Electron configuration and shell structure for every element, grouped by the block each one belongs to.",
    field: null,
    noun: null,
    columns: ["configuration", "shells", "valence"],
    caveat: null,
  },
};

/** The column headings, keyed by the column they name. */
const HEADINGS = {
  state: "State at 293 K",
  configuration: "Configuration",
  shells: "Electrons per shell",
  valence: "Valence",
};

/** The block groups of the orbital page, in the order the blocks fill the table. */
export const BLOCKS = [
  { block: "s", name: "s block" },
  { block: "p", name: "p block" },
  { block: "d", name: "d block" },
  { block: "f", name: "f block" },
];

/**
 * The elements a ranking is made of, in the order it ranks them: highest first.
 *
 * A non-numeric value is dropped rather than sorted, because it has no place in an order of
 * magnitude. Ties break on atomic number, so the order is total and two builds cannot disagree.
 *
 * @param {object[]} elements
 * @param {string} field
 * @returns {{ ranked: object[], unmeasured: number, lowest: number, highest: number }}
 */
export function rankBy(elements, field) {
  const measured = elements.filter((element) => typeof element[field] === "number");
  const ranked = [...measured].sort(
    (one, other) => other[field] - one[field] || one.atomicNumber - other.atomicNumber,
  );

  return {
    ranked,
    unmeasured: elements.length - ranked.length,
    lowest: ranked.at(-1)[field],
    highest: ranked[0][field],
  };
}

/**
 * A value's place in the ranking's own range, as a percentage of the width.
 *
 * @param {number} value
 * @param {{ lowest: number, highest: number }} range
 * @returns {number} 0 to 100
 */
export function barWidth(value, { lowest, highest }) {
  const span = highest - lowest;

  if (span === 0) {
    return 100;
  }

  return ((value - lowest) / span) * 100;
}

/**
 * One cell beyond the figure, chosen by name.
 *
 * A name this does not know is an error rather than an empty cell, because a column that silently
 * renders nothing is a column a reader is waiting for that never arrives.
 *
 * @param {object} element
 * @param {string} column
 * @param {{ definitionFor: (field: string) => object }} units
 * @returns {string}
 */
function cell(element, column, units) {
  switch (column) {
    case "state": {
      const state = element.state ?? "";

      return `<td class="rank__cell">${escapeHtml(state ? state[0].toUpperCase() + state.slice(1) : "")}</td>`;
    }
    case "configuration":
      return `<td class="rank__cell rank__cell--mono">${escapeHtml(element.electronConfiguration)}</td>`;
    case "shells":
      return `<td class="rank__cell">${escapeHtml(element.shells.join(", "))}</td>`;
    case "valence":
      return `<td class="rank__cell">${escapeHtml(String(element.valence))}</td>`;
    case "mass":
      return `<td class="rank__cell">${escapeHtml(
        formatNumber(element.atomicWeight, units.definitionFor("atomicWeight")),
      )}</td>`;
    default:
      throw new Error(`This ranking has a column nothing can render: ${column}`);
  }
}

/**
 * One row: the element, then the figure with its bar, then the rest.
 *
 * @param {{ element: object, field: string | null, range: object | null, columns: string[], units: object, paint: Function }} context
 * @returns {string}
 */
function row({ element, field, range, columns, units, paint }) {
  const figure =
    field === null
      ? ""
      : `<td class="rank__cell rank__cell--figure">` +
        `<span class="rank__bar" style="--rank-bar:${barWidth(element[field], range).toFixed(2)}%"></span>` +
        `<span class="rank__value">${escapeHtml(
          formatMeasurement(element[field], units.definitionFor(field)),
        )}</span></td>`;

  return (
    `<tr${attributes({
      "data-filter": filterTextFor(element),
      "data-filter-name": element.name,
      "data-filter-symbol": element.symbol,
      "data-filter-number": element.atomicNumber,
    })}>` +
    `<th scope="row" class="rank__cell rank__cell--element"><span class="rank__element">` +
    elementTile({ element, paint: paint(element), variant: "compact" }) +
    `<span class="rank__name">${escapeHtml(element.name)}</span>` +
    `<span class="rank__number">${element.atomicNumber}</span></span></th>` +
    figure +
    columns.map((column) => cell(element, column, units)).join("") +
    `</tr>`
  );
}

/**
 * One table.
 *
 * @param {{ id: string, caption: string, field: string | null, noun: string | null, list: object[], range: object | null, columns: string[], units: object, paint: Function }} context
 * @returns {string}
 */
function table({ id, caption, field, noun, list, range, columns, units, paint }) {
  const figureHeading =
    field === null
      ? ""
      : `<th scope="col" class="rank__cell rank__cell--figure"><span class="rank__value">${escapeHtml(
          noun[0].toUpperCase() + noun.slice(1),
        )} (${escapeHtml(units.definitionFor(field).unit)})</span></th>`;

  // The wrapper is what scrolls, because a `table` given `overflow-x` stops being a table. The floor
  // width is on the table so it never squeezes below the width its figures need; the wrapper is what
  // gives way. The periodic table answers the same problem the same way.
  return (
    `<div class="rank__scroll">\n<table class="rank">\n` +
    `<caption class="visually-hidden" id="${escapeHtml(id)}">${escapeHtml(caption)}</caption>\n` +
    `<thead><tr><th scope="col" class="rank__cell rank__cell--element">Element</th>` +
    figureHeading +
    columns.map((column) => `<th scope="col" class="rank__cell">${escapeHtml(HEADINGS[column])}</th>`).join("") +
    `</tr></thead>\n<tbody>\n` +
    list.map((element) => row({ element, field, range, columns, units, paint })).join("\n") +
    `\n</tbody>\n</table>\n</div>`
  );
}

/**
 * The ranked block, and the note that says how many elements the ranking left out.
 *
 * @param {object} ranking
 * @param {object[]} elements
 * @param {object} units
 * @param {Function} paint
 * @returns {string}
 */
function rankedBlock({ ranking, elements, units, paint }) {
  const { ranked, unmeasured, lowest, highest } = rankBy(elements, ranking.field);
  const definition = units.definitionFor(ranking.field);

  return (
    table({
      id: "rank-table",
      caption: `${ranking.title}, highest first`,
      field: ranking.field,
      noun: ranking.noun,
      list: ranked,
      range: { lowest, highest },
      columns: ranking.columns,
      units,
      paint,
    }) +
    "\n" +
    `<p class="rank__note">Ranked from ${escapeHtml(
      formatMeasurement(highest, definition),
    )} to ${escapeHtml(formatMeasurement(lowest, definition))}, highest first.` +
    (unmeasured > 0
      ? ` ${unmeasured} of the 118 have no ${escapeHtml(ranking.noun)} on record and are not ranked here.`
      : "") +
    `</p>` +
    (ranking.caveat ? `\n<p class="rank__caveat">${escapeHtml(ranking.caveat)}</p>` : "")
  );
}

/**
 * The grouped block: one table per orbital block, each under its own heading.
 *
 * @param {object} ranking
 * @param {object[]} elements
 * @param {object} units
 * @param {Function} paint
 * @returns {string}
 */
function groupedBlock({ ranking, elements, units, paint }) {
  return BLOCKS.map(({ block, name }) => {
    const list = elements.filter((element) => element.block === block);

    return (
      `<section class="rank__group" aria-labelledby="rank-block-${block}">\n` +
      `<h2 class="section__title" id="rank-block-${block}">${escapeHtml(name)}` +
      `<span class="rank__count">${list.length} elements</span></h2>\n` +
      table({
        id: `rank-table-${block}`,
        caption: `${name} electron configurations`,
        field: null,
        noun: null,
        list,
        range: null,
        columns: ranking.columns,
        units,
        paint,
      }) +
      `\n</section>`
    );
  }).join("\n");
}

/**
 * Render one ranking page's body.
 *
 * @param {{
 *   template: string,
 *   property: string,
 *   elements: object[],
 *   units: { definitionFor: (field: string) => object },
 *   mode: { paint: (element: object) => { fill: string, onFill: string, key: string } }
 * }} context
 * @returns {string}
 */
export function rankingPage({ template, property, elements, units, mode }) {
  const ranking = RANKINGS[property];

  if (!ranking) {
    throw new Error(`${property} is not a ranking this family renders`);
  }

  const paint = mode.paint;

  return fillTemplate(template, {
    heading: escapeHtml(ranking.title),
    lede: escapeHtml(ranking.lede),
    filter: elementFilter({
      id: "rank-filter",
      label: `Filter the ${ranking.noun ?? "configuration"} list`,
      controls: "rank-tables",
    }),
    rankings: ranking.noun === null ? groupedBlock({ ranking, elements, units, paint }) : rankedBlock({ ranking, elements, units, paint }),
  });
}

/**
 * Attach the page's behaviour to a page that already contains it.
 *
 * @param {{ root: ParentNode }} context
 * @returns {{ release: () => void }}
 */
export function hydrateRanking({ root }) {
  const filter = wireElementFilter(root, { noun: "elements" });

  return {
    release: () => filter.release(),
  };
}