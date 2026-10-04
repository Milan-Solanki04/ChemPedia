/**
 * The questions an element's own numbers answer.
 *
 * Four questions, generated from the record, in the words a reader would ask. This is a data
 * transformation rather than authored copy — there is nothing here to write, only values to format —
 * and that is the point. A generated answer cannot be out of date with the property list beside it,
 * because it is computed from the same record. An authored FAQ would be, within one release.
 *
 * **A question whose value the sources do not carry is not asked.** Four questions on every page
 * would be four questions on every page, three of which on most elements answer "the site does not
 * know". So each pair is generated or it is not, and a page shows however many the element can
 * actually support.
 *
 * **The wording is ours and the numbers are the data's.** "What is the melting point of iron?" is a
 * fact about the record; "the temperature at which it becomes a liquid" would be authored prose, and
 * would have to be right for every element.
 */

import { formatMeasurement } from "../lib/format.js";
import { escapeHtml } from "../lib/html.js";

/**
 * The questions this module knows how to ask.
 *
 * Each is a label for the question, a field, and whether to format it with its unit. Ordered as a
 * reader would ask them: what it is, what it melts at, what it boils at, how it behaves.
 *
 * @type {{ question: (element: object) => string, field: string | null, unit: boolean }[]}
 */
const QUESTIONS = [
  {
    question: (element) => `What is the atomic weight of ${element.name}?`,
    field: "atomicWeight",
    unit: true,
  },
  {
    question: (element) => `What is the melting point of ${element.name}?`,
    field: "meltingPoint",
    unit: true,
  },
  {
    question: (element) => `What is the boiling point of ${element.name}?`,
    field: "boilingPoint",
    unit: true,
  },
  {
    question: (element) => `What is the electron configuration of ${element.name}?`,
    field: "electronConfiguration",
    unit: false,
  },
];

/**
 * The questions one element can answer, with their answers.
 *
 * @param {{ element: object, units: { definitionFor: (field: string) => object } }} context
 * @returns {{ question: string, answer: string, field: string }[]}
 */
export function answerableQuestions({ element, units }) {
  return QUESTIONS.map(({ question, field, unit }) => ({
    question: question(element),
    field,
    answer: unit
      ? formatMeasurement(element[field], units.definitionFor(field))
      : (element[field] ?? null),
  })).filter(({ answer }) => answer !== null && answer !== "" && answer !== "Unknown");
}

/**
 * @param {{
 *   element: object,
 *   units: { definitionFor: (field: string) => object },
 *   heading?: string
 * }} options
 * @returns {string}
 */
export function faqBlock({ element, units, heading = "Questions this element answers" }) {
  const pairs = answerableQuestions({ element, units });

  if (pairs.length === 0) {
    return "";
  }

  const items = pairs
    .map(
      ({ question, answer, field }) =>
        `<div class="faq__item"${` data-field="${escapeHtml(field)}"`}>` +
        `<dt class="faq__question">${escapeHtml(question)}</dt>` +
        `<dd class="faq__answer">${escapeHtml(answer)}</dd></div>`,
    )
    .join("\n");

  return `<section class="faq" aria-labelledby="faq-heading">
<h2 class="faq__heading" id="faq-heading">${escapeHtml(heading)}</h2>
<dl class="faq__list" data-count="${pairs.length}">
${items}
</dl>
<p class="faq__note">
  Every answer here is read from the same record as the property list, so the two cannot disagree.
</p>
</section>`;
}