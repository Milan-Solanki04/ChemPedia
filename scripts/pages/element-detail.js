/**
 * The element detail page — 118 pages, one template.
 *
 * **Everything on the page is read from one record.** The name, the pronunciation, the summary, the
 * uses, the sources, the discovery, the property list, the generated questions, the shell diagram
 * and the two neighbours are all fields of the same object. Nothing here is written per element, so
 * two pages cannot disagree and a value cannot appear in the sidebar that the prose contradicts.
 *
 * **The page is rendered at build time.** Every element page is a real file, which is what makes a
 * deep link work on a cold load, on a static host, with no rewrite rule and no JavaScript. What the
 * browser adds afterwards is the arrow-key movement and the isolation on the miniature table — a page
 * that is already complete.
 */

import { elementStrip } from "../components/element-strip.js";
import { elementTile } from "../components/element-tile.js";
import { faqBlock } from "../components/faq-block.js";
import { fillTemplate } from "./home.js";
import { periodicTable, wireTable } from "../components/periodic-table.js";
import { propertyList } from "../components/property-list.js";
import { shellDiagram } from "../components/shell-diagram.js";
import { escapeHtml } from "../lib/html.js";
import { glossaryMatcher, linkSegments } from "../lib/glossary-links.js";

/**
 * The large tile in the group's colour that carries the symbol.
 *
 * @param {{ element: object, paint: { fill: string, onFill: string } }} context
 * @returns {string}
 */
function heroTile({ element, paint }) {
  return `<div class="element__tile" style="--fill:${paint.fill};--on-fill:${paint.onFill}">
<span class="element__tile-number">${escapeHtml(element.atomicNumber)}</span>
<span class="element__tile-symbol">${escapeHtml(element.symbol)}</span>
</div>`;
}

/**
 * Where the element sits, said as a sentence.
 *
 * @param {{ element: object, groupName: string | null }} context
 * @returns {string}
 */
function positionCaption({ element, groupName }) {
  const where =
    element.group === null ? `period ${element.period}, the ${groupName ?? "inner"} series` : `period ${element.period}, group ${element.group}`;

  return `${escapeHtml(element.name)}: ${where}.`;
}

/**
 * A definition list of when and by whom the element was found.
 *
 * A row whose value the record does not carry is left out rather than printed empty: thirteen of the
 * 118 elements have no discovery year, and iron has neither an isolator nor a place, because it was
 * used before anyone wrote down who found it. A list that admits what it does not know is worth more
 * than one padded with placeholders.
 *
 * @param {{ element: object }} context
 * @returns {string}
 */
function discoveryList({ element }) {
  const rows = [
    ["Discovered by", element.discovery.discoveredBy],
    ["Year", element.discovery.year === null ? null : String(element.discovery.year)],
    ["Where", element.discovery.place],
    ["Name origin", element.discovery.nameOrigin],
  ].filter(([, value]) => typeof value === "string" && value !== "");

  const rendered = rows
    .map(
      ([label, value]) =>
        `<div class="definition"><dt class="definition__label">${escapeHtml(label)}</dt><dd class="definition__value">${escapeHtml(
          value,
        )}</dd></div>`,
    )
    .join("\n");

  return `<section class="discovery" aria-labelledby="discovery-heading">
<h2 class="discovery__heading" id="discovery-heading">How it was found</h2>
<dl class="discovery__list">
${rendered}
</dl>
</section>`;
}

/**
 * The heading for the group section, which the template carries so that it is part of the page's
 * heading order rather than something a component invented.
 *
 * The plural comes from the taxonomy rather than from adding an "s" to the singular, because English
 * does not do that: "noble gas" becomes "noble gases", and the twelve-character difference between
 * "noble gases" and "noble gass" is the kind of thing a page should never ship.
 *
 * @param {{ category: { name: string, plural: string } | null }} context
 * @returns {string}
 */
function groupHeading({ category }) {
  return category?.plural ? `The other ${category.plural.toLowerCase()}` : "Elements like this one";
}

/**
 * The other members of the element's group, as tiles.
 *
 * One link per sibling, and it is the outer one: the tile inside it is given no `href` of its own,
 * because a link inside a link is invalid markup that browsers and screen readers disagree about.
 * The link wraps the tile and the name together so that the whole of a forty-pixel square is the hit
 * area, not only the part of it that happens to be underlined.
 *
 * @param {{ elements: object[], element: object, paint: Function, elementPath: Function }} context
 * @returns {string}
 */
function siblings({ elements, element, paint, elementPath }) {
  const others = elements.filter((one) => one.category === element.category && one.slug !== element.slug);

  const tiles = others
    .map(
      (one) =>
        `<li class="group-tiles__item"><a class="group-tiles__link" href="${escapeHtml(elementPath(one))}">` +
        `${elementTile({ element: one, paint: paint(one), variant: "compact" })}` +
        `<span class="group-tiles__name">${escapeHtml(one.name)}</span></a></li>`,
    )
    .join("\n");

  return `<ul class="group-tiles" data-count="${others.length}">
${tiles}
</ul>`;
}

/**
 * Render one element's page.
 *
 * @param {{
 *   template: string,
 *   element: string,
 *   elements: object[],
 *   categories: { bySlug: (slug: string) => { name: string, plural: string } | null },
 *   units: object,
 *   mode: { paint: (element: object) => { fill: string, onFill: string, key: string } }
 * }} context
 * @returns {string}
 */
export function elementDetail({
  template,
  element: slug,
  elements,
  categories,
  units,
  mode,
  terms = [],
}) {
  const element = elements.find((one) => one.slug === slug) ?? null;

  if (!element) {
    throw new Error(`No element has the slug "${slug}"`);
  }

  const category = categories.bySlug(element.category) ?? null;
  const groupName = category?.name ?? null;
  const paint = mode.paint;
  const elementPath = (one) => `/elements/${one.slug}/`;

  /**
   * One of the entry's paragraphs, with any glossary term in it turned into a link.
   *
   * **This is the other half of the backbone.** The term page links out to the elements a term is
   * about; this links back from the element to the terms its own entry uses, so a reader who arrived
   * from a search for "why does iron rust" and landed on the iron page can go on to read what
   * *oxidation* means rather than having to know that the word was a link.
   *
   * The matcher is built once per page rather than per paragraph, because compiling one regular
   * expression over four hundred headwords is the expensive half and this page renders three
   * paragraphs. It is passed the elements so that element names keep their capitalisation rule and
   * "lead" the verb is still not a link to the metal.
   *
   * @param {string} text
   * @returns {string} HTML, with the text escaped segment by segment
   */
  const linkGlossaryTerms = (text) => {
    if (terms.length === 0) {
      return escapeHtml(text);
    }

    return linkSegments(text, matcher)
      .map((segment) =>
        segment.type === "link"
          ? `<a class="glossary-mention" href="/glossary/${escapeHtml(segment.slug)}/">${escapeHtml(
              segment.value,
            )}</a>`
          : escapeHtml(segment.value),
      )
      .join("");
  };

  const matcher = glossaryMatcher(terms, { elements });

  return fillTemplate(template, {
    strip: elementStrip({ element, all: elements, elementPath }),

    "mini-table":
      periodicTable({ elements, paint, variant: "compact", highlighted: element.slug }) +
      `<figcaption class="element__mini-caption">${positionCaption({ element, groupName })}</figcaption>`,

    hero: heroTile({ element, paint: paint(element) }),

    name: escapeHtml(element.name),

    pronunciation:
      `<p class="element__pronunciation">Pronounced <span class="element__pronunciation-value">${escapeHtml(
        element.pronunciation,
      )}</span></p>`,

    summary: linkGlossaryTerms(element.summary),

    faq: faqBlock({ element, units }),

    "uses-and-sources": `<section class="prose" aria-labelledby="about-heading">
<h2 class="section__title" id="about-heading">What it is and where it comes from</h2>
<h3 class="element__subheading">Uses</h3>
<p>${linkGlossaryTerms(element.uses)}</p>
<h3 class="element__subheading">Where it is found</h3>
<p>${linkGlossaryTerms(element.sources)}</p>
</section>`,

    discovery: discoveryList({ element }),

    properties: propertyList({ element, units }),

    "shell-diagram": shellDiagram({ element, paint: paint(element) }),

    "shell-caption": `Electron configuration — ${escapeHtml(element.electronConfiguration)}`,

    "group-heading": escapeHtml(groupHeading({ category })),

    siblings: siblings({ elements, element, paint, elementPath }),
  });
}

/**
 * Attach the page's behaviour to a page that already contains it.
 *
 * The miniature table is a grid, so it gets the same arrow-key movement and the same isolation as the
 * full one. Nothing else on this page has behaviour: every number on it was in the HTML before any
 * script ran.
 *
 * @param {{ root: ParentNode }} context
 * @returns {{ release: () => void }}
 */
export function hydrateElementDetail({ root }) {
  const table = wireTable(root);

  return { release: () => table.destroy() };
}

