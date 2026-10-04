/**
 * The eleven element group pages, at `/element-groups/:slug/`.
 *
 * One template and one module behind eleven paths, and the page is assembled from pieces that already
 * exist rather than from anything new: the hero's four facts are counted here, the table is the Phase 3
 * grid, the member grid is the Phase 6 card, and the isolation is the Phase 3 legend behaviour with
 * the group's own key as its starting pin.
 *
 * **The isolation is written into the markup, not applied by a script.** A group page whose whole
 * subject is "these are the ones" has to say so to a reader whose scripts never ran, so the grid
 * carries `is-isolating` and the group's cells carry `is-match` as built HTML. `wireTable` then takes
 * the same key as its initial pin, so the behaviour continues from the state the markup is already in
 * rather than clearing it and waiting for a click that will not come.
 *
 * **Nothing about membership is written here.** The members are the records whose category is this
 * group's slug, and the count is the length of that list. A group page whose headline number could
 * come from somewhere other than the records would be a page whose headline number could be wrong.
 *
 * **The facts are derived, including the two that are not simple counts.** The atomic numbers are the
 * span from the first member to the last, which for the noble gases reads `2 – 118` and is honest as
 * long as it is a span and the table is right underneath it. The block is whichever block most members
 * fill, and a group whose members disagree is told so rather than given a single confident answer.
 */

import { escapeHtml } from "../lib/html.js";
import { elementCard } from "../components/element-card.js";
import { groupFacts } from "../components/group-facts.js";
import { legendChips } from "../components/legend-chips.js";
import { periodicTable, wireTable } from "../components/periodic-table.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const GROUP_PLACEHOLDERS = [
  "heading",
  "lede",
  "facts",
  "legend",
  "table",
  "character",
  "members-heading",
  "members",
  "others",
];

/**
 * A phrase's first letter, upper-cased.
 *
 * The stored plurals are written as they read mid-sentence — "unknown elements" is not "Unknown
 * elements" — and a chip or a list of groups is a label, which starts with a capital. The members
 * heading needs the other half of the same decision, which is why this is a function and not a change
 * to the data: one plural serves a heading and two labels, and only one of the three wants it changed.
 *
 * @param {string} text
 * @returns {string}
 */
function label(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Links to the other ten groups.
 *
 * A page about one of eleven should say what the other ten are, or a reader who arrived from a
 * neighbour has to go back to find the neighbours. Every group's colour is shown on its own chip, so
 * the list doubles as the key to the whole taxonomy.
 *
 * @param {{ slug: string, plural: string, token: string }[]} categories
 * @param {string} current the slug not to link to
 * @returns {string}
 */
function otherGroups(categories, current) {
  const items = categories
    .filter((category) => category.slug !== current)
    .map(
      (category) =>
        `<li class="others__item"><a class="others__link" href="/element-groups/${escapeHtml(category.slug)}/">` +
        `<span class="others__swatch" style="--fill:var(${escapeHtml(category.token)})"></span>` +
        `<span class="others__label">${escapeHtml(label(category.plural))}</span>` +
        `<span class="others__count">${category.count}</span></a></li>`,
    )
    .join("\n");

  return `<nav class="others" aria-labelledby="others-heading">
<h2 class="section__title" id="others-heading">The other groups</h2>
<ul class="others__list">
${items}
</ul>
</nav>`;
}

/**
 * Render one group page's body.
 *
 * @param {{
 *   template: string,
 *   group: string,
 *   elements: object[],
 *   categories: { all: () => { slug: string, name: string, plural: string, token: string, count: number }[] },
 *   groups: { require: (slug: string) => { lede: string, character: string } },
 *   units: { definitionFor: (field: string) => object },
 *   mode: { paint: (element: object) => { fill: string, onFill: string, key: string } }
 * }} context
 * @returns {string}
 */
export function groupPage({ template, group, elements, categories, groups, units, mode }) {
  const category = categories.all().find((one) => one.slug === group);

  if (!category) {
    throw new Error(`${group} is not one of the eleven groups`);
  }

  // Resolved here rather than passed in, through the strict query: a declared route pointing at a
  // group with no written copy stops the build rather than publishing a page that describes itself
  // with a blank.
  const copy = groups.require(group);
  const members = elements.filter((element) => element.category === group);

  if (members.length === 0) {
    throw new Error(`${group} has no members, so there is no page to build for it`);
  }

  const paint = (element) => mode.paint(element);
  const cards = members
    .map(
      (element) =>
        `<li class="members__item">${elementCard({
          element,
          paint: paint(element),
          href: `/elements/${element.slug}/`,
          groupName: category.name,
          units,
        })}</li>`,
    )
    .join("\n");

  return fillTemplate(template, {
    heading: escapeHtml(category.name),
    lede: escapeHtml(copy.lede),
    facts: groupFacts({ slug: group, members, units }),
    // One chip, pressed. It is a live control rather than a caption — a reader can press it to see the
    // whole table again — and it is the same button the table's legend has been since Phase 3.
    legend: legendChips({
      entries: [
        {
          key: group,
          label: label(category.plural),
          count: members.length,
          paint: paint(members[0]),
          active: true,
        },
      ],
    }),
    table: periodicTable({ elements, paint, isolate: group }),
    character: `<p class="group__character">${escapeHtml(copy.character)}</p>`,
    // The plural, because the heading is about the members and "The transition metals" reads where
    // "The members" does not. It is the group's own plural rather than a singular with an "s", so the
    // one group whose plural is "unknown elements" stays correct — and its first letter is lowered,
    // because the plurals are stored capitalised for standing alone as a legend chip's label and
    // "The Noble gases" is a sentence.
    "members-heading": escapeHtml(`The ${category.plural.charAt(0).toLowerCase()}${category.plural.slice(1)}`),
    members:
      `<ul class="members" data-count="${members.length}">\n${cards}\n</ul>`,
    others: otherGroups(categories.all(), group),
  });
}

/**
 * Attach the page's behaviour to a page that already contains it.
 *
 * The group is the table's starting pin, so the isolation the markup arrived in survives the wiring
 * rather than being cleared.
 *
 * @param {{ root: ParentNode, group?: string | null }} context
 * @returns {{ release: () => void }}
 */
export function hydrateGroup({ root, group = null }) {
  const table = wireTable(root, { pinned: group });

  return {
    /** Detach everything, for a page that swaps its own content out. */
    release: () => table.destroy(),
  };
}