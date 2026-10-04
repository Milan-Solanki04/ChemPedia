/**
 * One temperature, three scales, and the behaviour that keeps them in step.
 *
 * **The fields are synchronised, and that is a deliberate difference from the reference.** Its
 * calculator is three independent one-way converters, each with its own input and its own result, so
 * typing into the Celsius box changes neither of the other two and a reader holding a temperature has to
 * type it three times. Here there is one temperature and three scales of it: type in any field and the
 * other two follow.
 *
 * That design decision removes the reason the reference needs an `<output>` at all. Each of its cards
 * has a single input and therefore nowhere to put the answer, so it uses an output — which is the right
 * element for a value the page computed. Here the *other two fields* are that answer, so an output
 * beside each one would be a fourth copy of a number the reader can already see twice. The idea is
 * right and it does not apply here, which is worth knowing before copying anything.
 *
 * **The field being typed in is never rewritten.** This is the detail that makes the thing usable. If
 * every keystroke rewrote all three fields then typing `37.` would become `37.0` immediately and the
 * caret would jump, because the value is mid-edit and not yet a number. So the edited field keeps
 * exactly what was typed and the other two are filled in; a conversion is only computed once the field
 * holds something parseable.
 *
 * **An empty or unusable field clears the other two rather than leaving them stale.** The reference
 * leaves the last reading on screen when a field is cleared or when the browser rejects what was typed,
 * so a reader who deletes their number is left looking at the answer to a question they have withdrawn.
 * Clearing is the honest response and it is what this does.
 *
 * **The below-absolute-zero warning is a live region**, which the reference also does and which is the
 * right element for it: a reader who types a temperature that cannot exist is told so without having to
 * notice it themselves.
 */

import { attributes, escapeHtml } from "../lib/html.js";
import { SCALES, convert, formatTemperature, isBelowAbsoluteZero, parseTemperature } from "../lib/temperature.js";

/** What a reader is told when a temperature is below absolute zero. */
export const BELOW_ABSOLUTE_ZERO = "Below absolute zero — not a temperature anything can reach.";

/**
 * One field: a label and an input, in a box headed by the scale's name.
 *
 * The label is visually hidden and the scale's name is also the box's visible heading, so the field says
 * what it is without depending on a placeholder that disappears the moment it is typed into. The input
 * carries `inputmode="decimal"` so a phone offers a numeric keypad with a decimal point, which it does
 * not for `type="text"` and does not for `type="number"` on every browser.
 *
 * @param {{ key: string, symbol: string, name: string }} scale
 * @param {string} id the page's input id prefix, so two converters on one page cannot collide
 * @returns {string}
 */
export function converterField(scale, id = "temperature") {
  return `<div class="converter__field">
<h3 class="converter__scale"><abbr title="${escapeHtml(scale.name)}">${escapeHtml(scale.symbol)}</abbr></h3>
<label class="visually-hidden" for="${escapeHtml(`${id}-${scale.key}`)}">Degrees in ${escapeHtml(scale.name)}</label>
<input${attributes({
    class: "converter__input",
    id: `${id}-${scale.key}`,
    type: "number",
    step: "any",
    inputmode: "decimal",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "0",
    "data-scale": scale.key,
    "aria-describedby": `${id}-warn`,
  })}>
</div>`;
}

/**
 * The whole converter: a field per scale, and one shared warning region.
 *
 * @param {{ id?: string }} [options]
 * @returns {string}
 */
export function temperatureConverter({ id = "temperature" } = {}) {
  const fields = SCALES.map((scale) => converterField(scale, id)).join("\n");

  return `<div class="converter" data-converter>
<div class="converter__fields">
${fields}
</div>
<p class="converter__warn" id="${escapeHtml(id)}-warn" data-warn role="status" aria-live="polite"></p>
</div>`;
}

/**
 * Attach the converter's behaviour to a page that already works without it.
 *
 * With the scripts never running the page is still a page: the reference points are in the markup, the
 * arithmetic is stated, and the fields do nothing at all rather than breaking. That is the same promise
 * the rest of the site makes, and here it is easier to keep because the conversion is an enhancement and
 * not the content.
 *
 * @param {{ root: ParentNode }} context
 * @returns {{ release: () => void }}
 */
export function wireTemperatureConverter({ root }) {
  const converter = root.querySelector("[data-converter]");

  if (!converter) {
    return { release() {} };
  }

  const inputs = new Map(
    [...converter.querySelectorAll("[data-scale]")].map((input) => [input.dataset.scale, input]),
  );
  const warn = converter.querySelector("[data-warn]");

  /**
   * Recompute the other two fields from the one being edited.
   *
   * @param {string} editedKey the scale whose field is being typed into
   * @param {string} text what it holds
   */
  function apply(editedKey, text) {
    const value = parseTemperature(text);

    // An empty or unusable field clears the others rather than leaving the last reading on screen.
    if (value === null) {
      for (const [key, input] of inputs) {
        if (key !== editedKey) {
          input.value = "";
        }
      }

      if (warn) {
        warn.textContent = "";
      }

      return;
    }

    for (const [key, input] of inputs) {
      if (key === editedKey) {
        continue;
      }

      // Written as the formatted number rather than as the raw conversion: a field showing
      // 98.60000000000001 is worse than one showing 98.6, and this value is about to be read rather
      // than computed on. Asking the pure module for the number rather than stripping the symbol off a
      // formatted reading keeps the unit handling in one place.
      input.value = formatTemperature(convert(value, editedKey, key));
    }

    if (warn) {
      const edited = SCALES.find((scale) => scale.key === editedKey);

      warn.textContent = isBelowAbsoluteZero(edited.toCelsius(value)) ? BELOW_ABSOLUTE_ZERO : "";
    }
  }

  const listeners = [];

  /**
   * @param {HTMLElement} target
   * @param {string} type
   * @param {(event: Event) => void} handler
   */
  function on(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push([target, type, handler]);
  }

  for (const [key, input] of inputs) {
    on(input, "input", () => apply(key, input.value));
  }

  return {
    release() {
      for (const [target, type, handler] of listeners) {
        target.removeEventListener(type, handler);
      }

      listeners.length = 0;
    },
  };
}
