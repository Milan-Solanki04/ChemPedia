/**
 * The property list.
 *
 * Around forty labelled values, in one order, for every one of the 118 elements. Two of those values
 * are not numbers at all — "Group" reads *Non-metal* and "Shells" reads `2, 8, 14, 2` — and the list
 * is the reason they can be: a two-column table of label and reading is the one layout that does not
 * care whether the reading is a temperature, a unit symbol, a list or a word.
 *
 * **Every row is decided here, from the record.** A row is included or omitted by a rule in this file
 * and nowhere else, so two element pages cannot disagree about which properties an element has, and a
 * value that is unknown is omitted rather than printed as a dash. That last part matters more than it
 * looks: a row of forty where six say "Unknown" reads as though six facts are missing, where six rows
 * that are simply not there read as what they are — a value the sources do not carry.
 *
 * **The unit travels with the value, not with the label.** `meltingPoint` is stored in Celsius and the
 * units repository says so; this module asks, so the unit is stated once and cannot be forgotten on
 * one row and written on another.
 */

import { UNKNOWN, formatMeasurement, formatNumber, formatSignedInteger } from "../lib/format.js";
import { attributes, escapeHtml } from "../lib/html.js";

/**
 * The rows, in the order they appear.
 *
 * Each entry is a label and how to read the field. A reader is a function from the record to a string,
 * or null when the record does not carry the fact — which is how an unknown row disappears.
 *
 * @type {{ label: string, read: (element: object, units: { definitionFor: (field: string) => object }) => string | null }[]}
 */
export const PROPERTY_ROWS = [
  {
    label: "Protons",
    read: (element) => String(element.atomicNumber),
  },
  {
    // The neutron count of an atom is fixed only once you name its isotope, so what is shown is the
    // mass number of the most abundant one — approximated by the standard atomic weight rounded to
    // a whole number, which is that mass number for every element this project carries. It is the one
    // derived reading in the list, and it says so here rather than pretending to be measured.
    label: "Neutrons",
    read: (element) => String(Math.round(element.atomicWeight) - element.atomicNumber),
  },
  {
    label: "Electrons",
    read: (element) => String(element.atomicNumber),
  },
  {
    label: "Element symbol",
    read: (element) => element.symbol,
  },
  {
    label: "Atomic number",
    read: (element) => String(element.atomicNumber),
  },
  {
    label: "Atomic weight",
    read: (element, units) => formatMeasurement(element.atomicWeight, units.definitionFor("atomicWeight")),
  },
  {
    label: "State at 293 K",
    read: (element) => capitalise(element.state),
  },
  {
    label: "Melting point",
    read: (element, units) => formatMeasurement(element.meltingPoint, units.definitionFor("meltingPoint")),
  },
  {
    label: "Boiling point",
    read: (element, units) => formatMeasurement(element.boilingPoint, units.definitionFor("boilingPoint")),
  },
  {
    label: "Heat of vaporisation",
    read: (element, units) =>
      formatMeasurement(element.heatOfVaporization, units.definitionFor("heatOfVaporization")),
  },
  {
    label: "Heat of fusion",
    read: (element, units) => formatMeasurement(element.heatOfFusion, units.definitionFor("heatOfFusion")),
  },
  {
    label: "Crystal structure",
    read: (element) => capitalise(element.crystalStructure),
  },
  {
    label: "Thermal conductivity",
    read: (element, units) =>
      formatMeasurement(element.thermalConductivity, units.definitionFor("thermalConductivity")),
  },
  {
    label: "Specific heat",
    read: (element, units) => formatMeasurement(element.specificHeat, units.definitionFor("specificHeat")),
  },
  {
    label: "Shells",
    read: (element) => element.shells.join(", "),
  },
  {
    label: "Electron configuration",
    read: (element) => element.electronConfiguration,
  },
  {
    label: "Electronegativity",
    read: (element) => formatNumber(element.electronegativity, { decimals: 2 }),
  },
  {
    label: "Valence electrons",
    read: (element) => String(element.valence),
  },
  {
    label: "Oxidation states",
    read: (element) =>
      Array.isArray(element.oxidationStates) && element.oxidationStates.length > 0
        ? element.oxidationStates.map((value) => formatSignedInteger(value)).join(", ")
        : null,
  },
  {
    label: "Atomic radius",
    read: (element, units) => formatMeasurement(element.atomicRadius, units.definitionFor("atomicRadius")),
  },
  {
    label: "Density at 293 K",
    read: (element, units) => formatMeasurement(element.density, units.definitionFor("density")),
  },
  {
    label: "Electrical conductivity",
    read: (element, units) =>
      formatMeasurement(element.electricalConductivity, units.definitionFor("electricalConductivity")),
  },
  {
    label: "Thermal expansion",
    read: (element, units) =>
      formatMeasurement(element.thermalExpansion, units.definitionFor("thermalExpansion")),
  },
  {
    label: "First ionisation energy",
    read: (element, units) =>
      formatMeasurement(element.ionizationEnergies?.[0] ?? null, units.definitionFor("ionizationEnergies")),
  },
  {
    label: "Period",
    read: (element) => String(element.period),
  },
  {
    // Absent for the thirty f-block elements, which have no group in this table: saying "3" would
    // take a side in the oldest argument in the subject, and saying "none" would be wrong.
    label: "Group",
    read: (element) => (element.group === null ? null : String(element.group)),
  },
  {
    label: "Orbital block",
    read: (element) => `${element.block}-block`,
  },
  // The three rows below are empty for every element today. They are here anyway, because the schema
  // carries them: a row that appears the day the data does is better than a row added then, which is
  // a row someone has to remember.
  {
    label: "Atomic volume",
    read: (element, units) => formatMeasurement(element.atomicVolume, units.definitionFor("atomicVolume")),
  },
  {
    label: "Covalent radius",
    read: (element, units) => formatMeasurement(element.covalentRadius, units.definitionFor("covalentRadius")),
  },
  {
    label: "Lattice parameters",
    read: (element, units) => formatMeasurement(element.latticeParameters?.[0] ?? null, units.definitionFor("latticeParameters")),
  },
];

/**
 * A word the dataset stores in lower case, said the way a sentence would.
 *
 * @param {string | null} value
 * @returns {string | null}
 */
function capitalise(value) {
  if (typeof value !== "string" || value === "") {
    return null;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * @param {{
 *   element: object,
 *   units: { definitionFor: (field: string) => object },
 *   heading?: string
 * }} options
 * @returns {string}
 */
export function propertyList({ element, units, heading = "Properties" }) {
  const rows = PROPERTY_ROWS.map(({ label, read }) => ({ label, value: read(element, units) })).filter(
    ({ value }) => value !== null && value !== undefined && value !== "" && value !== UNKNOWN,
  );

  const rendered = rows
    .map(
      ({ label, value }) =>
        `<div class="property"><dt class="property__label">${escapeHtml(label)}</dt><dd class="property__value">${escapeHtml(
          value,
        )}</dd></div>`,
    )
    .join("\n");

  return `<section class="properties" aria-labelledby="properties-heading">
<h2 class="properties__heading" id="properties-heading">${escapeHtml(heading)}</h2>
<dl class="properties__list"${attributes({ "data-property-count": rows.length })}>
${rendered}
</dl>
<p class="properties__note">
  A property the sources do not carry is left out rather than shown as zero. The neutron count is
  that of the most abundant isotope, not a measurement of the element.
</p>
</section>`;
}
