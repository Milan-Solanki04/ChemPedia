/**
 * The difficulty badge.
 *
 * Four hundred terms cannot all be the same difficulty, and a reader who does not know what "exothermic"
 * means deserves to know before they commit to the definition rather than after. The three levels are
 * the ones `data/glossary.json` is allowed to use, and this component is the only thing that turns one
 * into something you can see.
 *
 * **The level is in the text, not only in the colour.** A badge that was only a tinted pill would say
 * "Novice" to nobody who could not see it, and the words are what carry the information for a screen
 * reader, for a colourblind reader and for anyone printing the page in black and white. The colour is
 * decoration on top of a word, never the word's substitute.
 *
 * **The colours come from the ramp, not from here.** Beginner sits at one step and Expert at a darker
 * one, so the badge darkens as the term gets harder, which is the direction a reader reads difficulty
 * in without being told. No page holds a colour of its own, and neither does this component — see
 * `styles/components/glossary-badge.css`, which is the only place the ramp steps appear.
 */

import { attributes, escapeHtml } from "../lib/html.js";

/**
 * The badge for one difficulty level.
 *
 * The level is written into a class as well as the text, so the stylesheet can darken it, and it is
 * escaped because it comes from the data file: a level is one of three known strings today, but the
 * data is a file someone can edit, and a file is not a promise.
 *
 * @param {string} level one of the three levels in `LEVELS`
 * @returns {string}
 */
export function levelBadge(level) {
  const safe = String(level ?? "");
  const modifier = safe.toLowerCase();

  return `<span${attributes({ class: `badge badge--${modifier}`, "data-level": safe })}>${escapeHtml(
    safe,
  )}</span>`;
}

/**
 * The searchable text for one glossary row.
 *
 * Term and definition, both lower-cased, and nothing else. The level is deliberately not searchable:
 * a reader who types "expert" wants a hard term, not every term that happens to be labelled hard, and
 * the badge is there to be read rather than searched.
 *
 * @param {{ term: string, definition: string }} entry
 * @returns {string}
 */
export function glossaryFilterText(entry) {
  return `${entry?.term ?? ""} ${entry?.definition ?? ""}`.toLowerCase();
}