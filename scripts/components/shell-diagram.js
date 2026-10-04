/**
 * The electron shell diagram.
 *
 * A picture of where an element's electrons are: one ring per occupied principal shell, and one dot
 * per electron on its ring. It is generated SVG rather than an image because the shape *is* the data —
 * there are 118 of these and they are all different, and a picture of iron's shells is a picture of
 * `2, 8, 14, 2` drawn as geometry.
 *
 * **The ring radii are spread, not fixed.** A nucleus with seven shells and one with two cannot both
 * use the same radii without one of them collapsing into the middle or bursting out of the frame, so
 * the innermost and outermost are fixed and the rest are spread evenly between them. The diagram is
 * therefore always the same size on the page whatever the element, which is what lets it sit in a
 * column beside a property list without the list moving.
 *
 * **Electrons are spread evenly, first at the top.** Two electrons sit either side of the top rather
 * than one at the top and one wherever the trigonometry put it, because a diagram that puts hydrogen's
 * single electron at an arbitrary angle looks like a different element.
 *
 * **It is a picture, so it says what it is.** `role="img"` with a title that names the shells and a
 * description that gives the numbers, because a screen-reader user is owed the same fact the picture
 * is making — and this project's own shell populations are already asserted to account for every
 * electron, so the caption cannot disagree with the rings.
 */

import { attributes, escapeHtml } from "../lib/html.js";

/** The drawing's coordinate system. A viewBox rather than pixels, so it scales with its box. */
const VIEW = 100;

/** Where the outermost ring sits, and the dot that rides on it. */
const OUTER_RADIUS = 44;
const INNER_RADIUS = 12;
const DOT_RADIUS = 3.4;
const NUCLEUS_RADIUS = 5;

/**
 * The radius of each ring, outermost last.
 *
 * @param {number} shells how many there are
 * @returns {number[]}
 */
export function ringRadii(shells) {
  if (shells <= 1) {
    return [OUTER_RADIUS];
  }

  const step = (OUTER_RADIUS - INNER_RADIUS) / (shells - 1);

  return Array.from({ length: shells }, (_, index) => INNER_RADIUS + step * index);
}

/**
 * The points at which a ring's electrons sit.
 *
 * Evenly spaced, going clockwise, with the first one at the top — so the first electron of every
 * element is in the same place, and a ring of two is a pair diametrically opposite rather than
 * whichever two the trigonometry happened to produce.
 *
 * @param {number} radius
 * @param {number} electrons how many are on this ring
 * @returns {{ x: number, y: number }[]}
 */
export function ringDots(radius, electrons) {
  const step = (Math.PI * 2) / electrons;
  const points = [];

  for (let index = 0; index < electrons; index += 1) {
    const angle = -Math.PI / 2 + index * step;

    points.push({
      x: VIEW / 2 + radius * Math.cos(angle),
      y: VIEW / 2 + radius * Math.sin(angle),
    });
  }

  return points;
}

/**
 * @param {{
 *   element: { symbol: string, shells: number[], atomicNumber: number },
 *   paint: { fill: string, onFill: string },
 *   size?: number
 * }} options
 * @returns {string}
 */
export function shellDiagram({ element, paint, size = VIEW }) {
  const centre = VIEW / 2;
  const radii = ringRadii(element.shells.length);
  const total = element.shells.reduce((sum, count) => sum + count, 0);

  const rings = radii
    .map(
      (radius) =>
        `<circle class="shell-diagram__ring" cx="${centre}" cy="${centre}" r="${radius.toFixed(2)}"/>`,
    )
    .join("");

  const dots = element.shells
    .flatMap((electrons, index) => ringDots(radii[index], electrons))
    .map(
      (point) =>
        `<circle class="shell-diagram__electron" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${DOT_RADIUS}"/>`,
    )
    .join("");

  // Both counts are spoken, and hydrogen is the case that gets it wrong: "1 electrons in 1 shell" is
// the one element whose description a reader is guaranteed to read.
const description =
    `${total} ${total === 1 ? "electron" : "electrons"} in ${element.shells.length} ` +
    `${element.shells.length === 1 ? "shell" : "shells"}: ${element.shells.join(", ")}.`;

  return `<svg${attributes({
    class: "shell-diagram",
    viewBox: `0 0 ${VIEW} ${VIEW}`,
    width: size,
    height: size,
    role: "img",
    "aria-labelledby": "shell-diagram-title",
  })}>
<title id="shell-diagram-title">Electron shells of ${escapeHtml(element.symbol)}</title>
<desc>${escapeHtml(description)}</desc>
<g fill="none" stroke="currentColor"${attributes({ style: `--fill:${paint.fill}` })}>${rings}</g>
<g fill="currentColor"${attributes({ style: `--on-fill:${paint.onFill}` })}>${dots}</g>
<circle class="shell-diagram__nucleus" cx="${centre}" cy="${centre}" r="${NUCLEUS_RADIUS}"
  fill="currentColor"${attributes({ style: `--on-fill:${paint.onFill}` })}></circle>
</svg>`;
}