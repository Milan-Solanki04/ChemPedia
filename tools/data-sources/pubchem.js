/**
 * Reading the PubChem periodic table.
 *
 * One request, one row per element, seventeen columns. The work is not the fetching; it is the
 * normalising. The endpoint reports temperatures in kelvin and radii in picometres, marks
 * unmeasured values with an empty string, spells one element's name the American way, and files
 * its categories under its own labels. Each of those is a chance to store a number that is wrong
 * by a factor of a hundred and look entirely reasonable while doing it.
 *
 * So every conversion happens here, once, and the unit the schema expects is what leaves this
 * module. Nothing downstream has to remember where a value came from.
 */

/** Where the table lives. Public domain; see docs/DATA_SOURCES.md. */
export const ENDPOINT = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON";

/** How the dataset spells each category, against the slug this project uses. */
export const CATEGORY_SLUGS = new Map([
  ["Alkali metal", "alkali-metals"],
  ["Alkaline earth metal", "alkaline-earth-metals"],
  ["Transition metal", "transition-metals"],
  ["Post-transition metal", "post-transition-metals"],
  ["Lanthanide", "lanthanides"],
  ["Actinide", "actinides"],
  ["Metalloid", "metalloids"],
  ["Nonmetal", "non-metals"],
  ["Halogen", "halogens"],
  ["Noble gas", "noble-gases"],
]);

/** The states the dataset reports, and the ones that are a prediction rather than an observation. */
const STATES = new Map([
  ["gas", "gas"],
  ["liquid", "liquid"],
  ["solid", "solid"],
  ["expected to be a gas", "gas"],
  ["expected to be a liquid", "liquid"],
  ["expected to be a solid", "solid"],
]);

/** Kelvin to degrees Celsius. The schema stores temperatures in Celsius. */
const ABSOLUTE_ZERO = 273.15;

/** Picometres to ångströms, which is what the schema asks for. */
const PICOMETRES_PER_ANGSTROM = 100;

/**
 * A number, or null when the dataset is saying it does not have one.
 *
 * The dataset signals an unmeasured value with an empty string. Passing that through `Number`
 * gives zero, which is a measurement, and the one thing an unknown must never become.
 *
 * @param {string} value
 * @returns {number | null}
 */
function numberOrNull(value) {
  const text = String(value ?? "").trim();

  if (text === "") {
    return null;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A kelvin figure as degrees Celsius, or null.
 *
 * @param {string} value
 * @returns {number | null}
 */
function celsiusOrNull(value) {
  const kelvin = numberOrNull(value);

  return kelvin === null ? null : Math.round((kelvin - ABSOLUTE_ZERO) * 100) / 100;
}

/**
 * The reported oxidation states as sorted numbers.
 *
 * The dataset writes them as signed text — `+1, -1` — and in no particular order. They are stored
 * as numbers in ascending order so that the page can render them predictably and a test can
 * compare them without sorting first.
 *
 * @param {string} value
 * @returns {number[] | null}
 */
function oxidationStates(value) {
  const text = String(value ?? "").trim();

  if (text === "" || /no data/i.test(text)) {
    return null;
  }

  const states = text
    .split(",")
    .map((part) => Number(part.trim().replace("+", "")))
    .filter((part) => Number.isFinite(part));

  return states.length === 0 ? null : [...new Set(states)].sort((one, other) => one - other);
}

/**
 * The state at room temperature, lowercased.
 *
 * The dataset marks the superheavy elements `Expected to be a Solid`, which is a prediction. It
 * is stored as the state it predicts rather than dropped, because a page that says nothing about
 * oganesson's state is less useful than one that says the state is expected, and the string is
 * normalised here so the page never has to parse the difference.
 *
 * @param {string} value
 * @returns {string | null}
 */
function state(value) {
  return STATES.get(String(value ?? "").trim().toLowerCase()) ?? null;
}

/**
 * The dataset's category label as our slug.
 *
 * @param {string} label
 * @returns {string | null}
 */
export function categorySlugFor(label) {
  return CATEGORY_SLUGS.get(String(label ?? "").trim()) ?? null;
}

/**
 * The table, as an array of rows keyed by column name.
 *
 * @param {{ fetchImpl?: typeof fetch, url?: string }} [options] injected so tests need no network
 * @returns {Promise<Record<string, string>[]>}
 */
export async function fetchRows({ fetchImpl = fetch, url = ENDPOINT } = {}) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`The element dataset answered ${response.status} ${response.statusText}`);
  }

  const { Table } = await response.json();
  const columns = Table.Columns.Column;

  return Table.Row.map((row) => Object.fromEntries(columns.map((name, index) => [name, row.Cell[index]])));
}

/**
 * One dataset row as the fields this project stores from it.
 *
 * Deliberately does not decide the category — the dataset's classification is corrected before
 * it is used, and the correction is applied where the corrections are recorded rather than here,
 * so that this function is a plain translation and nothing more.
 *
 * @param {Record<string, string>} row
 * @returns {Record<string, unknown>}
 */
export function coreFields(row) {
  const ionizationEnergy = numberOrNull(row.IonizationEnergy);

  return {
    atomicNumber: Number(row.AtomicNumber),
    symbol: String(row.Symbol).trim(),
    name: String(row.Name).trim(),
    atomicWeight: numberOrNull(row.AtomicMass),
    datasetCategory: categorySlugFor(row.GroupBlock),
    electronConfiguration: String(row.ElectronConfiguration ?? "").trim(),
    electronegativity: numberOrNull(row.Electronegativity),
    atomicRadius: (() => {
      const radius = numberOrNull(row.AtomicRadius);

      return radius === null ? null : radius / PICOMETRES_PER_ANGSTROM;
    })(),
    ionizationEnergies: ionizationEnergy === null ? null : [ionizationEnergy],
    oxidationStates: oxidationStates(row.OxidationStates),
    state: state(row.StandardState),
    meltingPoint: celsiusOrNull(row.MeltingPoint),
    boilingPoint: celsiusOrNull(row.BoilingPoint),
    density: numberOrNull(row.Density),
    discoveredYear: (() => {
      const year = numberOrNull(row.YearDiscovered);

      return year === null ? null : Math.trunc(year);
    })(),
  };
}
