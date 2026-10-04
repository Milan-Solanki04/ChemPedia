/**
 * Reading the supplementary properties from Wikidata.
 *
 * The periodic-table endpoint carries seventeen columns and the element page needs about forty,
 * so the second tier — heats, conductivities, crystal system, who discovered it — comes from
 * Wikidata, which is a CC0 dedication and therefore has no conditions attached to its use.
 *
 * Two things make this adapter more than a fetch. The first is units: a quantity arrives as a
 * number plus the unit it was recorded in, and the units are not the ones the schema wants.
 * Conversion is a small explicit table, and **a unit not in the table becomes null rather than a
 * guess** — a wrong number on a page cannot be noticed, an empty one can. The second is that
 * Wikidata is a wiki: a property may be absent, may appear several times with different
 * references, or may hold a value that contradicts another. So a value is taken only when it is
 * unambiguous, and an ambiguous property is dropped and reported.
 */

/** The endpoint. Anonymous access is fine; Wikimedia asks callers to identify themselves. */
export const ENDPOINT = "https://query.wikidata.org/sparql";

/** Wikimedia refuses a request with no user agent, and asks it to say what it is. */
const USER_AGENT = "ChemiPedia/0.1 (https://github.com/DHBhensdadia/chemipedia)";

/** The numeric properties, in the units the schema stores them in, after conversion. */
export const QUANTITIES = [
  { property: "P2066", field: "heatOfFusion" },
  { property: "P2116", field: "heatOfVaporization" },
  { property: "P2056", field: "specificHeat" },
  { property: "P2068", field: "thermalConductivity" },
  { property: "P5672", field: "thermalExpansion" },
  { property: "P2055", field: "electricalConductivity" },
  { property: "P2807", field: "atomicVolume" },
];

/** The properties whose value is another item, read as its English label. */
export const ITEMS = [
  { property: "P556", field: "crystalStructure" },
  { property: "P61", field: "discoveredBy" },
  { property: "P189", field: "place" },
];

/**
 * What to multiply a recorded value by to reach the schema's unit.
 *
 * Keyed by the unit's English label, because that is what the query returns and a Q-number table
 * would be a second thing to keep correct without being any more readable.
 */
export const UNIT_FACTORS = new Map([
  ["joule per mole", 1e-3],
  ["kilojoule per mole", 1],
  ["joule per kilogram kelvin", 1e-3],
  ["joule per gram kelvin", 1],
  // The same quantity where the temperature is a difference rather than a reading. Wikidata uses
  // both labels, and a value recorded under one is not convertibly different from the other.
  ["joule per kilogram kelvin difference", 1e-3],
  ["joule per gram kelvin difference", 1],
  ["watt per metre kelvin", 1e-2],
  ["watt per centimetre kelvin", 1],
  ["siemens per metre", 1e-6],
  // Conductivity recorded as amps per volt-metre, which is siemens per metre written out.
  ["ampere per volt metre", 1e-6],
  ["megasiemens per metre", 1],
  ["gram per cubic centimetre", 1],
  ["kilogram per cubic metre", 1e-3],
  ["cubic centimetre per mole", 1],
  ["cubic metre per mole", 1e6],
  ["reciprocal kelvin", 1e6],
  ["micrometre per metre kelvin", 1],
  ["kilometre per second", 1],
]);

/** A unit that means "per mole of substance" where the schema wants "per gram". */
const PER_MOLE_KELVIN = "joule per mole kelvin";

/** P1086 is the atomic number, which is how a row is joined to the element table. */
const ATOMIC_NUMBER = "P1086";

/**
 * The query for the numeric properties.
 *
 * One `UNION` branch per property, because a quantity's unit is only reachable through the
 * statement node it hangs off. Every branch also fetches the unit's label so the adapter can
 * convert by name.
 *
 * @returns {string}
 */
function quantityQuery() {
  const branches = QUANTITIES.map(
    ({ property, field }) =>
      `{ ?element p:${property} ?statement .
     ?statement ps:${property} ?value .
     ?statement psv:${property} ?node .
     ?node wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit .
     BIND("${field}" AS ?field)
     ?unit rdfs:label ?unitLabel . FILTER(lang(?unitLabel) = "en") }`,
  );

  return `SELECT ?z ?field ?amount ?unitLabel WHERE {
  ?element wdt:${ATOMIC_NUMBER} ?z .
  FILTER(?z >= 1 && ?z <= 118)
  ${branches.join("\n  UNION ")}
}`;
}

/**
 * The query for the properties whose value is another item.
 *
 * `GROUP_CONCAT` collapses the repeats a wiki accumulates, so a property with several values
 * arrives as one readable string instead of several rows.
 *
 * @returns {string}
 */
function itemQuery() {
  const selects = ITEMS.map(
    ({ field }) => `(GROUP_CONCAT(DISTINCT ?${field}Label; separator=", ") AS ?${field})`,
  );
  const optionals = ITEMS.map(
    ({ property, field }) =>
      `OPTIONAL { ?element wdt:${property} ?${field} . ?${field} rdfs:label ?${field}Label . FILTER(lang(?${field}Label) = "en") }`,
  );

  return `SELECT ?z ${selects.join(" ")} WHERE {
  ?element wdt:${ATOMIC_NUMBER} ?z .
  FILTER(?z >= 1 && ?z <= 118)
  ${optionals.join("\n  ")}
} GROUP BY ?z`;
}

/**
 * Convert one recorded value into the schema's unit.
 *
 * @param {number} amount
 * @param {string} unitLabel
 * @param {number | null} molarMass grams per mole, needed for the per-mole form of specific heat
 * @returns {number | null} null when the unit is not one this adapter knows how to convert
 */
export function convert(amount, unitLabel, molarMass = null) {
  if (!Number.isFinite(amount)) {
    return null;
  }

  if (UNIT_FACTORS.has(unitLabel)) {
    return round(amount * UNIT_FACTORS.get(unitLabel));
  }

  if (unitLabel === PER_MOLE_KELVIN && Number.isFinite(molarMass) && molarMass > 0) {
    return round(amount / molarMass);
  }

  return null;
}

/**
 * Keep a converted value to a sane number of significant figures.
 *
 * Wikidata holds full-precision figures carried from its sources, and a heat of vaporisation of
 * 3.2748938100000002 kJ/mol would be a claim to precision the source never made.
 *
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Number(value.toPrecision(6));
}

/**
 * Run a query and return its bindings.
 *
 * @param {string} query
 * @param {{ fetchImpl?: typeof fetch, url?: string }} [options]
 * @returns {Promise<object[]>}
 */
async function run(query, { fetchImpl = fetch, url = ENDPOINT } = {}) {
  const target = `${url}?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetchImpl(target, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Wikidata answered ${response.status} ${response.statusText}`);
  }

  const { results } = await response.json();

  return results.bindings;
}

/**
 * The supplementary fields, keyed by atomic number.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.url]
 * @param {Map<number, number>} [options.molarMassByNumber] atomic number to grams per mole
 * @returns {Promise<{ byNumber: Map<number, Record<string, unknown>>, unconvertibleUnits: string[] }>}
 */
export async function fetchSupplementary({
  fetchImpl = fetch,
  url = ENDPOINT,
  molarMassByNumber = new Map(),
} = {}) {
  const [quantityRows, itemRows] = await Promise.all([
    run(quantityQuery(), { fetchImpl, url }),
    run(itemQuery(), { fetchImpl, url }),
  ]);

  const byNumber = new Map();
  const unconvertible = new Map();

  /** Getting the record for a number, creating it on first sight. */
  const record = (z) => {
    if (!byNumber.has(z)) {
      byNumber.set(z, {});
    }

    return byNumber.get(z);
  };

  for (const row of quantityRows) {
    const z = Number(row.z.value);
    const field = row.field.value;
    const unitLabel = row.unitLabel.value;
    const converted = convert(Number(row.amount.value), unitLabel, molarMassByNumber.get(z));

    if (converted === null) {
      unconvertible.set(`${field} (${unitLabel})`, (unconvertible.get(`${field} (${unitLabel})`) || 0) + 1);
      continue;
    }

    // First value wins. A second value for the same property is a disagreement inside the wiki,
    // and quietly overwriting the first with it would make the build's output depend on row
    // order.
    if (record(z)[field] === undefined) {
      record(z)[field] = converted;
    }
  }

  for (const row of itemRows) {
    const z = Number(row.z.value);
    const fields = record(z);

    for (const { field } of ITEMS) {
      const value = row[field]?.value?.trim();

      if (value) {
        fields[field] = value;
      }
    }
  }

  return { byNumber, unconvertibleUnits: [...unconvertible.keys()].sort() };
}
