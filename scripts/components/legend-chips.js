/**
 * The legend: one chip per colour key, carrying its member count.
 *
 * The legend is two things at once, and the reference's design is right that it should be. It is the
 * table's colour key — a reader who lands on a green tile learns that green means lanthanide. And it
 * is the table's isolation control: touching a chip picks that key out of the grid and pushes the
 * rest back, so a reader can count one group's members without reading 117 tiles.
 *
 * **A chip is a button, not a picture, and not a link.** It does something when it is pressed — it
 * changes what the table shows — so it is a button, and it says whether it is currently pressed
 * through `aria-pressed`. A link would have been the reference's choice because its chips also lead
 * to a group's page; ours do not yet, and a control dressed as a destination is a control that lies
 * about where it goes.
 *
 * **The count is a pill inside the chip, not a number after it.** It sits in a translucent wash of
 * the chip's own foreground, so it reads against every one of the eleven fills without a second
 * palette, and it is set in tabular figures so a row of counts aligns on the digit.
 *
 * The heading is not this component's. A legend on the home page is under an `h2` and one on a table
 * view under an `h3`, and a component that emitted its own heading would have to be told which — so
 * the page supplies the heading and this emits the list it labels.
 *
 * Pure: markup in, markup out. The isolation behaviour belongs to the table, which owns the grid the
 * chips are isolating; a chip carries the key to match on and nothing else.
 */

import { attributes, classNames, escapeHtml } from "../lib/html.js";

/**
 * @param {{
 *   entries: { key: string, label: string, count: number, paint: { fill: string, onFill: string } }[]
 * }} options
 * @returns {string}
 */
export function legendChips({ entries }) {
  const chips = entries
    .map((entry) => {
      const pressed = entry.active === true;

      return `<li><button${attributes({
        type: "button",
        class: classNames("chip", pressed && "is-active"),
        "data-key": entry.key,
        "aria-pressed": pressed ? "true" : "false",
        style: `--fill:${entry.paint.fill};--on-fill:${entry.paint.onFill}`,
        "aria-label": `${entry.label}, ${entry.count} ${entry.count === 1 ? "element" : "elements"}`,
      })}><span class="chip__label">${escapeHtml(entry.label)}</span><span class="chip__n" aria-hidden="true">${escapeHtml(
        entry.count,
      )}</span></button></li>`;
    })
    .join("\n");

  return `<ul class="legend">
${chips}
</ul>`;
}