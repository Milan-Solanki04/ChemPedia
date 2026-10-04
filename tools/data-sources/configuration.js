/**
 * Reading an electron configuration into shell populations.
 *
 * The build gets a configuration string from the dataset and needs one thing out of it: how many
 * electrons sit in each principal shell. That is arithmetic over a compressed statement —
 * `[Xe]6s1 4f14 5d10` — and arithmetic like this fails quietly. Expand a core wrongly, or miss a
 * subshell, and the result is still a plausible-looking array, still seven numbers, still summing
 * to something close to the atomic number.
 *
 * So this module reads and reports, and the caller checks the total against the atomic number
 * before the record is written. A configuration that does not account for every electron stops
 * the build. That check is the point of the module: without it, a wrong shell diagram would reach
 * a page and nothing would catch it.
 *
 * It does not use the Madelung filling order to guess the answer. Filling order gets chromium's
 * and copper's and palladium's actual configurations wrong, because those elements do not fill
 * the way the rule says, and a derived diagram would be wrong for about twenty elements while
 * looking right for the other ninety-eight.
 */

/** Electrons in each noble-gas core, in shell order. */
const CORES = new Map([
  ["He", [2]],
  ["Ne", [2, 8]],
  ["Ar", [2, 8, 8]],
  ["Kr", [2, 8, 18, 8]],
  ["Xe", [2, 8, 18, 18, 8]],
  ["Rn", [2, 8, 18, 32, 18, 8]],
]);

/** The most principal shells any element uses. Oganesson occupies seven. */
const SHELL_COUNT = 7;

/** A noble-gas core in square brackets, at the start of the string. */
const CORE = /^\[\s*([A-Z][a-z]?)\s*\]/;

/** One subshell: a principal number, a letter, and an electron count. */
const SUBSHELL = /(\d)\s*([spdf])\s*(\d+)/g;

/**
 * The electrons in each occupied principal shell.
 *
 * Returns only the shells that hold electrons, so hydrogen is `[1]` and gold is
 * `[2, 8, 18, 32, 18, 1]` rather than either being padded out to seven entries.
 *
 * @param {string} configuration e.g. `[Xe]6s1 4f14 5d10`, optionally marked `(predicted)`
 * @returns {number[]} electrons per shell, outermost last
 * @throws {TypeError} when the string is empty, names an unknown core, or holds no subshell
 */
export function shellsFromConfiguration(configuration) {
  const text = String(configuration ?? "")
    .replace(/\(\s*predicted\s*\)/i, "")
    .trim();

  if (text === "") {
    throw new TypeError("An electron configuration is required.");
  }

  const shells = new Array(SHELL_COUNT).fill(0);
  let remainder = text;

  const core = text.match(CORE);

  if (core) {
    const counts = CORES.get(core[1]);

    if (!counts) {
      throw new TypeError(`Not a noble-gas core: ${core[1]}`);
    }

    counts.forEach((count, index) => {
      shells[index] += count;
    });
    remainder = text.slice(core[0].length);
  }

  let found = 0;

  for (const [, principal, , count] of remainder.matchAll(SUBSHELL)) {
    const shell = Number(principal);

    if (shell < 1 || shell > SHELL_COUNT) {
      throw new RangeError(`Principal shell out of range: ${principal}`);
    }

    shells[shell - 1] += Number(count);
    found += 1;
  }

  if (found === 0) {
    throw new TypeError(`No subshell found in: ${configuration}`);
  }

  return trim(shells);
}

/**
 * Drop the empty shells above the outermost occupied one.
 *
 * @param {number[]} shells
 * @returns {number[]}
 */
function trim(shells) {
  const last = shells.findLastIndex((count) => count > 0);

  return shells.slice(0, last + 1);
}

/**
 * The outermost shell's electron count.
 *
 * This is what the site means by valence, and it says so here because the word means different
 * things in different tables. For a main-group element it is the group's last digit; for a
 * transition metal it is the s electrons alone, which is the reading that makes `valence` a
 * value a reader can check against the configuration rather than a second opinion about it.
 *
 * @param {number[]} shells
 * @returns {number}
 */
export function valenceFromShells(shells) {
  return shells.length === 0 ? 0 : shells[shells.length - 1];
}
