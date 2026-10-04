/**
 * The four facts a group page states about itself.
 *
 * The reference prints four: how many elements, which atomic numbers, which block, which states.
 * All four are **counted from the records** here, and that is the whole reason this is a component
 * rather than four strings in the data file. A member count stored in prose is a number that rots the
 * moment the records change; a range of atomic numbers written out is a claim about which elements are
 * in the group, which is exactly the second source of truth this project refuses to keep.
 *
 * The two answers that are not simply a count are the interesting ones, and both are derived:
 *
 *   - **The atomic numbers** are the span from the group's first member to its last. For the noble
 *     gases that reads `2 – 118`, because helium is 2 and oganesson is 118 and the fourteen elements
 *     between them belong to other groups. The span is what the reference prints too, and it is
 *     honest as long as it is labelled as a span — which is why the label says "Atomic numbers" and
 *     the reader can see the table underneath for exactly which ones.
 *   - **The block** is whichever block most of the group's members fill. A group whose members do not
 *     agree is given its own answer rather than a single confident one, because the reference answers
 *     `p-block` for the noble gases, which include helium and therefore do not all fill the same
 *     subshell.
 *
 * Pure: records in, markup out.
 */

import { attributes, escapeHtml } from "../lib/html.js";

/**
 * The block most of a group's members fill, or a statement that they do not agree.
 *
 * @param {object[]} members
 * @returns {{ label: string, mixed: boolean }}
 */
function blockOf(members) {
  const counts = new Map();

  for (const member of members) {
    counts.set(member.block, (counts.get(member.block) ?? 0) + 1);
  }

  const ranked = [...counts].sort((one, other) => other[1] - one[1]);

  if (ranked.length === 1) {
    return { label: `${ranked[0][0]}-block`, mixed: false };
  }

  // Close enough to be called a majority, and the rest said out loud rather than dropped. The noble
  // gases and the non-metals both reach this: helium and hydrogen are s-block and the other six are
  // p-block, which is 86% and a real majority.
  if (ranked[0][1] / members.length >= 0.8) {
    const others = ranked.slice(1).map(([block]) => `${block}-block`);

    return { label: `${ranked[0][0]}-block, with ${others.join(" and ")}`, mixed: true };
  }

  // No majority at all, so every block is named. The eight elements whose chemistry has never been
  // measured are five p-block and three d-block, and "more than one" would be honest while telling a
  // reader nothing they could not already see in the table underneath.
  return { label: ranked.map(([block]) => `${block}-block`).join(" and "), mixed: true };
}

/**
 * The states the group's members are in, capitalised and in the order a sentence would use them.
 *
 * @param {object[]} members
 * @returns {string}
 */
function statesOf(members) {
  const order = ["solid", "liquid", "gas"];
  const present = new Set(members.map((member) => member.state).filter(Boolean));
  const names = order.filter((state) => present.has(state)).map((state) => state[0].toUpperCase() + state.slice(1));

  return names.length > 0 ? names.join(", ") : "Not measured";
}

/**
 * One fact: a label above a value.
 *
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
function fact(label, value) {
  return `<div class="fact"><span class="fact__label">${escapeHtml(label)}</span><span class="fact__value">${escapeHtml(
    value,
  )}</span></div>`;
}

/**
 * @param {{ slug: string, members: object[], units: { definitionFor: (field: string) => object } }} context
 * @returns {string}
 */
export function groupFacts({ slug, members }) {
  if (members.length === 0) {
    throw new Error(`${slug} has no members, so it has nothing to state about itself`);
  }

  const numbers = members.map((member) => member.atomicNumber);
  const first = Math.min(...numbers);
  const last = Math.max(...numbers);
  const block = blockOf(members);

  return `<dl class="facts">${[
    fact("Elements", String(members.length)),
    fact("Atomic numbers", first === last ? String(first) : `${first} – ${last}`),
    fact("Block", block.label),
    fact("States", statesOf(members)),
  ].join("\n")}</dl>`;
}