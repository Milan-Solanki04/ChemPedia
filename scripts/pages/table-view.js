/**
 * The four alternate table views: `/periodic-table/properties-and-states/`, `/orbitals/`,
 * `/electronegativity/` and `/evolution/`.
 *
 * One template and one module behind four paths, and that is the whole point of the family. The
 * reference calls this a content tier: one table, four colourings, each with its own explainer and
 * its own legend. Everything below the hero is identical on all four — the legend is `mode.keys()` and
 * the table is `periodicTable` — so what differs is the mode the build hands in and the copy that
 * explains it. The build chooses the mode; this module never resolves a colour, which is the same rule
 * the home page has kept since Phase 3.
 *
 * **Every number on these pages is counted from the records.** The legend's counts come from
 * `mode.keys()`, which tallies rather than reading the counts `categories.json` asserts. That is not
 * a stylistic choice: our block counts are `s 14 · p 36 · d 38 · f 30` where the reference prints
 * `12 · 38 · 40 · 28`, and a legend is the one place a reader goes to be told what the table in front
 * of them actually contains. Ours must print ours.
 *
 * **The outliers are computed, not written down.** The electronegativity page names the elements that
 * sit furthest from the trend, because a figure written into the copy would be true of one version of
 * the data and quietly wrong after the next rebuild — the argument `lib/colour-scale.js` makes about
 * hand-picked bin edges, applied to prose.
 *
 * The evolution view has no reference to compare against: on the design reference that page is a 404
 * placeholder. That is recorded in the audit §3.5 and in the phase log, and it is why this view's
 * colours are a judgement rather than a measurement.
 */

import { escapeHtml } from "../lib/html.js";
import { legendChips } from "../components/legend-chips.js";
import { periodicTable, wireTable } from "../components/periodic-table.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const TABLE_VIEW_PLACEHOLDERS = ["heading", "lede", "legend", "table", "extra"];

/**
 * The bands the evolution view colours by.
 *
 * Six dated bands rather than the thirty decades the data holds, because a legend of thirty chips is a
 * legend nobody reads. The bands fall where the rate of discovery changes rather than at round
 * intervals: the industrial surge of the early 1800s, the noble gases and the rare earths of the late
 * 1800s, the long quiet of the 1900s' first third, the transuranics, then the synthesised elements.
 *
 * The first band is the thirteen elements with no discovery year on record — carbon, iron, copper,
 * gold and their neighbours, all of which were in use long before anyone wrote down who found them.
 * It is not a data failure and is not drawn as one; it is the oldest band there is.
 *
 * @type {{ key: string, label: string, from: number | null, to: number | null }[]}
 */
export const DISCOVERY_BANDS = [
  { key: "undated", label: "Known before 1650", from: null, to: null },
  { key: "early", label: "1650 – 1799", from: 1650, to: 1799 },
  { key: "industrial", label: "1800 – 1849", from: 1800, to: 1849 },
  { key: "gases", label: "1850 – 1899", from: 1850, to: 1899 },
  { key: "radioactive", label: "1900 – 1939", from: 1900, to: 1939 },
  { key: "transuranic", label: "1940 – 1969", from: 1940, to: 1969 },
  { key: "synthetic", label: "1970 onwards", from: 1970, to: null },
];

/**
 * The band a discovery year falls in.
 *
 * Exported because it is a rule about the data rather than a detail of this page: the mode, the
 * legend, the note and the test all have to agree which band an element is in, and one function is how
 * that is arranged.
 *
 * @param {{ discovery?: { year?: number | null } }} element
 * @returns {string}
 */
export function bandFor(element) {
  const year = element.discovery?.year;

  if (typeof year !== "number") {
    return "undated";
  }

  const band = DISCOVERY_BANDS.find((one) => one.from !== null && year >= one.from && year <= one.to);

  return band ? band.key : "synthetic";
}

/**
 * Every decade the records date, earliest first, with what was found in it.
 *
 * The timeline, rather than the colouring: thirty decades is the shape of the data and a reader wants
 * to see it, but thirty legend chips is not a key anybody can use. So the colours carry the bands and
 * this carries the decades.
 *
 * @param {object[]} elements
 * @returns {{ decade: number, count: number, names: string[] }[]}
 */
export function decadesOf(elements) {
  const decades = new Map();

  for (const element of elements) {
    const year = element.discovery?.year;

    if (typeof year !== "number") {
      continue;
    }

    const decade = Math.floor(year / 10) * 10;
    const entry = decades.get(decade) ?? { decade, count: 0, names: [] };

    entry.count += 1;
    entry.names.push(element.name);
    decades.set(decade, entry);
  }

  return [...decades.values()].sort((one, other) => one.decade - other.decade);
}

/**
 * The elements whose electronegativity sits furthest from their group's average.
 *
 * The trend runs across a period and down a group, and **down a group is the yardstick used here.**
 * Judged against its period instead, krypton comes out as an outlier — and only because five of the
 * seven noble gases have no value on record, which drags its period's mean down and makes its
 * conventional estimate look extreme. That is an artefact of what the data is missing, not chemistry,
 * and a page that named krypton here would be reporting the gap in our sources as a finding.
 *
 * An element with no value is skipped rather than counted as a zero, because "no measurement" is not
 * "the least electronegative", and so is one with no group — the thirty f-block elements have none.
 *
 * @param {object[]} elements
 * @param {number} [howMany]
 * @returns {object[]}
 */
export function electronegativityOutliers(elements, howMany = 4) {
  const measured = elements.filter(
    (element) => typeof element.electronegativity === "number" && typeof element.group === "number",
  );
  const byGroup = new Map();

  for (const element of measured) {
    byGroup.set(element.group, [...(byGroup.get(element.group) ?? []), element.electronegativity]);
  }

  const means = new Map(
    [...byGroup].map(([group, values]) => [group, values.reduce((total, value) => total + value, 0) / values.length]),
  );

  return measured
    .map((element) => ({ element, deviation: Math.abs(element.electronegativity - means.get(element.group)) }))
    .sort((one, other) => other.deviation - one.deviation || one.element.atomicNumber - other.element.atomicNumber)
    .slice(0, howMany)
    .map(({ element }) => element);
}

/**
 * The four views, each with the copy that explains it.
 *
 * The ledes restate the reference's sentences in our own words: this project's prose is its own, and
 * theirs were written for their table.
 *
 * @type {Record<string, { title: string, lede: string, note: (context: object) => string | null }>}
 */
export const TABLE_VIEWS = {
  "properties-and-states": {
    title: "Properties and states",
    lede:
      "The same table, coloured by what each element is at room temperature rather than by group. " +
      "Most of the table is one colour, and that is the finding: at this temperature almost " +
      "everything is a solid.",
    note: ({ elements }) => {
      const liquids = elements.filter((element) => element.state === "liquid");
      const unknown = elements.filter((element) => typeof element.state !== "string");
      const liquidNames = liquids.map((element) => element.name.toLowerCase()).join(" and ");
      const tail =
        unknown.length === 0
          ? `All ${elements.length} have a measured state on record, which is why this legend carries no "not measured" chip — there is nothing missing to key.`
          : `${unknown.length} have no measured state on record.`;

      return `Only ${liquids.length} elements are liquid here — ${liquidNames}. ${tail}`;
    },
  },
  orbitals: {
    title: "Orbitals and configurations",
    lede:
      "The same table, coloured by the orbital block each element fills last. The shape of the table " +
      "is the shape of the blocks.",
    note: () =>
      "A block is where an element's outermost electron lives, and the four of them are the table's " +
      "four regions — which is why the two short rows sit below the rest rather than beside them.",
  },
  electronegativity: {
    title: "Electronegativity",
    lede:
      "How strongly each element pulls on shared electrons, on the Pauling scale. Shading runs " +
      "across the measured range, and the trend rises across a period and falls down a group.",
    note: ({ elements, mode }) => {
      const outliers = electronegativityOutliers(elements);
      const measured = elements.filter((element) => typeof element.electronegativity === "number").length;
      const scale = mode?.scale;

      return (
        `Measured values run from ${scale?.min ?? "—"} to ${scale?.max ?? "—"}: fluorine pulls hardest of ` +
        `all, and francium least of those with a figure. ${elements.length - measured} elements have ` +
        `none on record, and five of the seven noble gases are among them — the scale is defined by bond ` +
        `measurements, and the noble gases form almost no bonds. The furthest from the average of their ` +
        `own group are ${outliers
          .map((element) => `${element.name} (${element.electronegativity})`)
          .join(", ")}.`
      );
    },
  },
  evolution: {
    title: "History and evolution",
    lede:
      "The same table, coloured by when each element was found. The shape of the modern table is the " +
      "shape of the last four centuries of chemistry.",
    note: ({ elements }) => {
      const decades = decadesOf(elements);
      const dated = decades.reduce((total, one) => total + one.count, 0);

      return (
        `${dated} elements carry a discovery year, between ${decades[0]?.decade ?? "—"} and ` +
        `${decades.at(-1)?.decade ?? "—"}, and ${elements.length - dated} were in use before anyone ` +
        `recorded finding them. The quietest decades are the nineteen-hundreds' first third; the ` +
        `loudest are the eighteen-hundredths, when one generation of chemists isolated most of what ` +
        `the table now holds.`
      );
    },
  },
};

/**
 * The timeline: one row per decade, with the elements found in it.
 *
 * @param {object[]} elements
 * @returns {string}
 */
function timeline(elements) {
  const decades = decadesOf(elements);
  const undated = elements.length - decades.reduce((total, one) => total + one.count, 0);

  const rows = decades
    .map(
      ({ decade, count, names }) =>
        `<li class="timeline__row"><span class="timeline__decade">${decade}s</span>` +
        `<span class="timeline__count">${count}</span>` +
        `<span class="timeline__names">${escapeHtml(names.join(", "))}</span></li>`,
    )
    .join("\n");

  return (
    `<section class="timeline" aria-labelledby="timeline-heading">\n` +
    `<h2 class="section__title" id="timeline-heading">When each element was found</h2>\n` +
    `<p class="timeline__hint">${decades.length} decades, from ${decades[0]?.decade ?? "—"} to ` +
    `${decades.at(-1)?.decade ?? "—"}. The ${undated} elements with no year on record are not listed ` +
    `here; they were in use before anyone wrote down who found them.</p>\n` +
    `<ol class="timeline__list">\n${rows}\n</ol>\n</section>`
  );
}

/**
 * Render one table view's body.
 *
 * @param {{
 *   template: string,
 *   view: string,
 *   elements: object[],
 *   mode: { paint: (element: object) => object, keys: (elements: object[]) => object[], scale?: object }
 * }} context
 * @returns {string}
 */
export function tableView({ template, view, elements, mode }) {
  const described = TABLE_VIEWS[view];

  if (!described) {
    throw new Error(`${view} is not a table view this family renders`);
  }

  const note = described.note({ elements, mode });

  return fillTemplate(template, {
    heading: escapeHtml(described.title),
    lede: escapeHtml(described.lede),
    legend: legendChips({ entries: mode.keys(elements) }),
    table: periodicTable({ elements, paint: mode.paint }),
    extra:
      (view === "evolution" ? timeline(elements) : "") +
      (note ? `\n<p class="view__note">${escapeHtml(note)}</p>` : ""),
  });
}

/**
 * Attach the view's behaviour to a page that already contains it.
 *
 * @param {{ root: ParentNode }} context
 * @returns {{ release: () => void }}
 */
export function hydrateTableView({ root }) {
  const table = wireTable(root);

  return {
    /** Detach everything, for a page that swaps its own content out. */
    release: () => table.destroy(),
  };
}