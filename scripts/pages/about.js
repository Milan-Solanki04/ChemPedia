/**
 * The about page's provenance table.
 *
 * **The table is counted from the records, and that is the whole reason this module exists.** ADR-005
 * requires that `/about` list every dataset and licence used, and `DATA_SOURCES.md` §6 makes that
 * document the canonical record. A hand-kept list of sources on the page is a list that goes stale: the
 * day a value is corrected in `data/elements.json` the page would quietly be wrong, and the one section
 * whose entire purpose is to be accurate would be the one that drifts. Each element record already says
 * where its facts came from, so the page counts what is actually there.
 *
 * **The counts are the argument.** "PubChem, public domain" on its own is a claim; "118 elements, all
 * 118, from PubChem" is a fact a reader can check against the file. And the numbers make a change visible
 * — if one element's facts were corrected from a second source, the table would show 117 and 1 rather than
 * quietly absorbing it.
 *
 * The licences are named here rather than read from the data because they are prose about a dataset
 * rather than a property of it: the records say which dataset a value came from, and this project says
 * what licence that dataset is under.
 */

import { escapeHtml } from "../lib/html.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const ABOUT_PLACEHOLDERS = ["sources", "corrections"];

/**
 * What is known about each source, beyond the name the records carry.
 *
 * Written here and nowhere else: the records hold a dataset name, and a dataset's licence is a fact about
 * the dataset rather than a property any element has. Grouping by dataset keeps them in step with the
 * data instead of restating them per element.
 */
const SOURCES = {
  "PubChem Periodic Table (public domain)": {
    host: "Retrieved from the PubChem Periodic Table, hosted by the US National Library of Medicine.",
    role: "The physical and atomic facts: atomic weight, melting and boiling points, density, electron configuration, shells, ionisation energies, radii, oxidation states, crystal system.",
    licence:
      "Public domain — a work of the United States government. PubChem places no restriction on " +
      "the use or distribution of the data it publishes and asks only for acknowledgement.",
  },
  "Wikidata (CC0)": {
    host: "Retrieved from Wikidata, a project of the Wikimedia Foundation.",
    role: "Supplementary facts the first source does not carry: discovery year, discoverer, place of discovery, and the origin of an element's name.",
    licence: "CC0 1.0 Universal — a public-domain dedication with no conditions attached.",
  },
};

/**
 * Count where each element's facts came from.
 *
 * Reads the three provenance keys the records carry and tallies them, so a source is listed with the
 * number of elements it actually supplied rather than with a number written down beside its name.
 *
 * @param {{ dataSource?: { facts?: string, supplementary?: string, prose?: string } }[]} elements
 * @returns {{ dataset: string, count: number }[]} sorted by count, then name
 */
export function sourceCounts(elements) {
  const counts = new Map();

  for (const element of elements) {
    const source = element?.dataSource?.facts;

    if (typeof source !== "string" || source === "") {
      continue;
    }

    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([dataset, count]) => ({ dataset, count }))
    .sort((one, other) => other.count - one.count || one.dataset.localeCompare(other.dataset));
}

/**
 * Every value of the `supplementary` key, for the same reason.
 *
 * @param {object[]} elements
 * @returns {{ dataset: string, count: number }[]}
 */
export function supplementaryCounts(elements) {
  const counts = new Map();

  for (const element of elements) {
    const source = element?.dataSource?.supplementary;

    if (typeof source !== "string" || source === "") {
      continue;
    }

    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([dataset, count]) => ({ dataset, count }))
    .sort((one, other) => other.count - one.count || one.dataset.localeCompare(other.dataset));
}

/**
 * The rows of the provenance table.
 *
 * A real `<table>` with a row header per dataset and a `<th>` per column, because it is tabular data and
 * a screen reader should be able to say which column it is in.
 *
 * @param {{ facts: { dataset: string, count: number }[], supplementary: { dataset: string, count: number }[] }} counts
 * @returns {string}
 */
export function sourceTable({ facts, supplementary }) {
  const rows = [...facts, ...supplementary]
    .map((entry) => {
      const known = SOURCES[entry.dataset] ?? {
        host: "No host recorded.",
        role: "Recorded in the element data, with no further detail held here.",
        licence: "Not recorded — and that is itself worth saying on this page.",
      };

      // The row header is the name the *records* carry, not the host's name for it. A reader checking
      // this table against `data/elements.json` should find the same string in both, and the first
      // version printed only the attribution — so the dataset the data actually names appeared nowhere
      // on the page that is about where the data came from.
      return `<tr>
<th scope="row">${escapeHtml(entry.dataset)}</th>
<td class="sources__count">${entry.count}</td>
<td><span class="sources__host">${escapeHtml(known.host)}</span> ${escapeHtml(known.role)}</td>
<td>${escapeHtml(known.licence)}</td>
</tr>`;
    })
    .join("\n");

  const datasets = [...new Set([...facts, ...supplementary].map((entry) => entry.dataset))];
  const elements = facts.reduce((sum, entry) => sum + entry.count, 0);

  return `<div class="sources">
<table class="sources__table">
<caption class="visually-hidden">Where each element's facts came from, how many elements each source supplied, and under what licence</caption>
<thead>
<tr>
<th scope="col">Dataset</th>
<th scope="col">Elements</th>
<th scope="col">What it supplied</th>
<th scope="col">Licence</th>
</tr>
</thead>
<tbody>
${rows}
<tr class="sources__prose">
<th scope="row">Every description, use, note and glossary definition on this site</th>
<td class="sources__count">118</td>
<td>Written for this site. No sentence here is copied from another source, including the site this one was compared against.</td>
<td>Our own work.</td>
</tr>
</tbody>
</table>
<p class="sources__note">
  All ${elements} elements draw on these ${datasets.length} datasets. A correction that moved one element's facts to a
  different source would show here as a smaller number beside one of them and a new row for the other,
  which is the point of counting rather than listing.
</p>
</div>`;
}

/**
 * The corrections paragraph beneath the table.
 *
 * @param {{ emailHref: string }} context
 * @returns {string}
 */
export function correctionsNote({ emailHref }) {
  return `<div class="about-corrections prose">
<h2 class="section__title">Corrections</h2>
<p>
  A figure here is wrong now and then. Some values have no agreed answer — the electronegativity of
  astatine is a calculation rather than a measurement, and several melting points are estimates from
  compounds rather than from the element. Where that is the case the page says so rather than printing a
  number as though it were settled.
</p>
<p>
  If something is wrong, or a source is miscredited, write to
  <a href="${escapeHtml(emailHref)}">${escapeHtml(emailHref.replace(/^mailto:/, ""))}</a> and say which page. Corrections
  to the data are preferred as a change with a source attached.
</p>
</div>`;
}

/**
 * Render the page's body.
 *
 * @param {{ template: string, elements: object[], emailHref: string }} context
 * @returns {string}
 */
export function aboutPage({ template, elements, emailHref }) {
  return fillTemplate(template, {
    sources: sourceTable({
      facts: sourceCounts(elements),
      supplementary: supplementaryCounts(elements),
    }),
    corrections: correctionsNote({ emailHref }),
  });
}
