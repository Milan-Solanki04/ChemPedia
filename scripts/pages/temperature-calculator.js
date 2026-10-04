/**
 * The temperature converter page.
 *
 * The smallest page module in the project, and the only one whose content is a component rather than a
 * body of writing. Two markers: the converter, which is the interactive part, and the reference points,
 * which are prose-shaped but computed.
 *
 * **The reference points are computed rather than written.** They are three columns of numbers derived
 * from the same scales the converter uses, and writing them into the template would mean a change to a
 * conversion formula could leave the table on the page disagreeing with the field above it. Computing
 * them means the two cannot disagree, and it means the −40 row — the point where Celsius and Fahrenheit
 * coincide — is a consequence rather than a fact someone remembered.
 *
 * The rows are real temperatures rather than round ones: body temperature and the freezing point of
 * water are here because they are the two conversions people actually need, and 21 °C because room
 * temperature is what a thermostat quotes. Water freezing at 0 °C is the only round number on the list
 * and it is there because it defines the scale.
 *
 * With the scripts never running the page is complete: the reference points are in the HTML, the
 * arithmetic is stated in the copy, and the fields do nothing rather than breaking.
 */

import { escapeHtml } from "../lib/html.js";
import { temperatureConverter, wireTemperatureConverter } from "../components/converter-input.js";
import { REFERENCE_POINTS, SCALES, readingsOf, formatReading } from "../lib/temperature.js";
import { fillTemplate } from "./home.js";

/** The markers this template carries, and the order they are expected in. */
export const TEMPERATURE_PLACEHOLDERS = ["converter", "points"];

/**
 * The reference points as a table.
 *
 * A real `<table>` with a row header rather than a list, because it is genuinely tabular data and a
 * screen reader can say which column it is in. The first column is the temperature described in words,
 * which is what a reader scans for; the three scale columns are the readings.
 *
 * @returns {string}
 */
export function referencePointsTable() {
  const head = SCALES.map((scale) => `<th scope="col">${escapeHtml(scale.symbol)}</th>`).join("");

  const rows = REFERENCE_POINTS.map((point) => {
    const readings = readingsOf(point.celsius);
    const cells = SCALES.map((scale) => {
      const reading = formatReading(readings[scale.key], scale.key);
      const atZero = point.celsius <= -273.15;

      return `<td class="points__value">${escapeHtml(reading)}${
        atZero ? '<span class="points__flag">the limit</span>' : ""
      }</td>`;
    }).join("");

    return `<tr><th scope="row">${escapeHtml(point.label)}</th>${cells}</tr>`;
  }).join("\n");

  return `<div class="points">
<table class="points__table">
<caption class="visually-hidden">Six temperatures in Celsius, Fahrenheit and Kelvin</caption>
<thead><tr><th scope="col">Temperature</th>${head}</tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
}

/**
 * Render the page's body.
 *
 * @param {{ template: string }} context
 * @returns {string}
 */
export function temperatureCalculator({ template }) {
  return fillTemplate(template, {
    converter: temperatureConverter(),
    points: referencePointsTable(),
  });
}

/**
 * Attach the converter's behaviour to a page that already works without it.
 *
 * @param {{ root: ParentNode }} context
 * @returns {{ release: () => void }}
 */
export function hydrateTemperatureCalculator({ root }) {
  const converter = wireTemperatureConverter({ root });

  return {
    release: () => converter.release(),
  };
}
