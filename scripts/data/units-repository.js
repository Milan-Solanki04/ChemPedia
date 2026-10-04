/**
 * The only reader of `data/units.json`.
 *
 * A value and its unit are one measurement, so the pair has to come from somewhere and it must
 * not be the page. This repository is that somewhere: given a field name it returns the unit to
 * print and how many figures to print it to, and `lib/format.js` turns the pair into text.
 *
 * Keeping the definitions in a data file rather than in the formatter means a unit is changed in
 * one place by someone who is looking at a table of units, which is where the mistake would
 * otherwise be made.
 */

import { loadJson } from "./json-source.js";

/** The file this repository owns. */
export const UNITS_FILE = "units.json";

/**
 * Read the unit definitions and return their queries.
 *
 * @param {{ fetchImpl?: typeof fetch, base?: string }} [options] injected so tests need no network
 * @returns {Promise<object>}
 */
export async function createUnitsRepository({ fetchImpl = fetch, base } = {}) {
  const { fields } = await loadJson(UNITS_FILE, { fetchImpl, base });

  if (!fields || typeof fields !== "object") {
    throw new TypeError(`${UNITS_FILE} should hold a "fields" object`);
  }

  const definitions = new Map(Object.entries(fields));

  return {
    /** Every field name a definition exists for. */
    fields: () => [...definitions.keys()],

    /**
     * The definition for a field, or null when the field has none.
     *
     * Null rather than a default, because a field with no definition is a field whose unit nobody
     * has decided, and defaulting it to no-unit would print a bare number as though it were
     * dimensionless.
     *
     * @param {string} field
     * @returns {{ unit?: string | null, decimals?: number, significant?: number } | null}
     */
    definitionFor: (field) => definitions.get(field) ?? null,
  };
}
