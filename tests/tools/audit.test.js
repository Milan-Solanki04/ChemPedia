import { test } from "node:test";
import assert from "node:assert/strict";

import { RULES, auditPage, builtPages } from "../../tools/audit.js";
import { renderDocument } from "../../tools/build.js";
import { distDir } from "../../tools/site-paths.js";

/**
 * The audit's rules, against markup that is deliberately wrong.
 *
 * **A rule set that never fails is worth nothing.** The first version of the nested-link rule sliced
 * from an element's opening tag, which always contains an `<a` — its own — so it reported a nested link
 * on all 584 built pages and read as a site-wide defect. It was caught by reading the message rather
 * than by the sweep. So every rule below is shown to fail on something: without that, "584 pages pass"
 * cannot be distinguished from "the rule looked at the wrong bytes".
 *
 * Fixtures are page *bodies*. `renderDocument` supplies the document, the skip link and the `<main>`,
 * exactly as the build does, so the control page is a real document rather than a fragment.
 */
const GOOD = `<h1>One heading</h1>
<h2>A section</h2>
<img src="/a.png" alt="A thing">
<label for="field">A field</label><input id="field">
<a href="/somewhere/">Somewhere</a>`;

/** @param {string} [body] */
const page = (body = GOOD) => renderDocument({ title: "A page", description: "A description.", body });

/**
 * Assert a rule catches a body, and return its message.
 *
 * @param {string} rule
 * @param {string} body
 * @returns {string}
 */
function fails(rule, body) {
  const found = auditPage(page(body)).find((failure) => failure.rule === rule);

  assert.ok(found, `the "${rule}" rule passed markup that breaks it`);

  return found.message;
}

test("the control page passes every rule, so each case below is about the rule and not the fixture", () => {
  assert.deepEqual(auditPage(page()), []);
});

test("one h1 catches none and two", () => {
  assert.match(fails("one h1", `${GOOD}\n<h1>Second</h1>`), /2 h1/);
  assert.match(fails("one h1", GOOD.replace("<h1>One heading</h1>", "")), /0 h1/);
});

test("heading levels never skip catches a jump down", () => {
  assert.match(fails("heading levels never skip", GOOD.replace("<h2>A section</h2>", "<h4>A section</h4>")), /h1 is followed by an h4/);
});

test("a heading that steps up a level is fine, because an h1 may contain an h4", () => {
  assert.deepEqual(auditPage(page(GOOD.replace("<h2>A section</h2>", "<h4>A section</h4>"))).filter((f) => f.rule !== "heading levels never skip"), []);
});

test("a heading named in a comment or inside a template is not in the outline", () => {
  assert.deepEqual(auditPage(page(`<!-- <h5> -->\n${GOOD}`)), []);
  assert.deepEqual(auditPage(page(`${GOOD}\n<template><h5></h5></template>`)), []);
});

test("every image needs an alt, and an empty one is allowed for a decorative image", () => {
  assert.match(fails("every image has an alt attribute", GOOD.replace('alt="A thing"', "")), /no alt/);
  assert.deepEqual(auditPage(page(GOOD.replace('alt="A thing"', 'alt=""'))), []);
});

test("a repeated id is caught, and it is why a label can end up pointing at the wrong element", () => {
  assert.match(fails("every id appears once", `${GOOD}\n<p id="main">Second</p>`), /id "main" appears 2 times/);
});

test("a label for nothing is caught, and a label with no `for` is caught", () => {
  assert.match(fails("every label points at an element that exists", GOOD.replace('for="field"', 'for="missing"')), /nothing carries that id/);
  assert.match(fails("every label points at an element that exists", GOOD.replace('for="field"', "")), /no `for`/);
});

test("a control with no name at all is caught, and a hidden one is exempt", () => {
  assert.match(fails("every form control has a name", GOOD.replace('<input id="field">', "<input>")), /no id, label, title or placeholder/);
  assert.deepEqual(
    auditPage(page(`${GOOD}\n<input type="hidden" name="token" value="1">`)),
    [],
    "a hidden field is not announced, so it needs no name and no label",
  );
});

test("a nested link is caught, and the rule reads the element's contents rather than its own tag", () => {
  assert.match(fails("no link is nested inside another", GOOD.replace("</a>", 'inner <a href="/y/">inner</a></a>')), /nested/);
  assert.deepEqual(auditPage(page()), [], "and it does not call an ordinary link nested with itself");
});

test("a dangling aria reference is caught in all three attributes", () => {
  for (const attribute of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
    assert.match(fails("every aria reference points at an id that exists", GOOD.replace("<h1>", `<h1 ${attribute}="nowhere">`)), new RegExp(`${attribute}="nowhere"`));
  }
});

test("a document with no main, or two, is caught", () => {
  const html = page();

  // Matched on the opening tag's attributes rather than the whole element, so this keeps working when
  // an attribute is added to the skeleton — which is exactly what happened when `tabindex="-1"` went on.
  const mainOpen = /<main id="main"[^>]*>/;

  assert.match(
    auditPage(html.replace(mainOpen, "<div>").replace("</main>", "</div>")).find((f) => f.rule === "the document has one main landmark").message,
    /0 <main>/,
  );
  assert.match(
    auditPage(html.replace("</main>", "<main>Second</main></main>")).find((f) => f.rule === "the document has one main landmark").message,
    /2 <main>/,
  );
});

test("a skip link whose target cannot hold focus is caught, because it announces nothing", () => {
  // Found by tabbing: activating the skip link moved the next Tab into the content but left
  // `document.activeElement` on `<body>`, so a screen reader had nothing to say about where the
  // reader had arrived. `tabindex="-1"` fixes it without adding a tab stop.
  const message = auditPage(page().replace('<main id="main">', '<main id="main">')).find((failure) => failure.rule === "the skip link's target is focusable");

  assert.equal(message, undefined, "the built document should already have a focusable main");

  const broken = renderDocument({ title: "A page", description: "A description.", body: GOOD }).replace(
    '<main id="main" tabindex="-1">',
    '<main id="main">',
  );
  const failure = auditPage(broken).find((entry) => entry.rule === "the skip link's target is focusable");

  assert.ok(failure !== undefined, "a main that cannot hold focus was not caught");
  assert.match(failure.message, /cannot hold focus/);
});

test("a skip link pointing at nothing is caught", () => {
  const message = auditPage(page().replace('href="#main"', 'href="#elsewhere"')).find((failure) => failure.rule === "the skip link's target exists");

  assert.ok(message, "a skip link pointing at nothing was not caught");
  assert.match(message.message, /no element with id "elsewhere"/);
});

test("a positive tabindex is caught, and zero and minus one are allowed", () => {
  assert.match(fails("no positive tabindex", GOOD.replace("<h1>", '<h1 tabindex="1">')), /tabindex="1"/);
  assert.deepEqual(auditPage(page(GOOD.replace("<h1>", '<h1 tabindex="0">'))), []);
  assert.deepEqual(auditPage(page(GOOD.replace("<h1>", '<h1 tabindex="-1">'))), []);
});

test("an assertive live region is caught unless it is a role=alert", () => {
  assert.match(fails("every live region is polite and not assertive by accident", GOOD.replace("<h1>", '<h1 aria-live="assertive">')), /assertive/);
  assert.deepEqual(auditPage(page(GOOD.replace("<h1>", '<h1 role="alert" aria-live="assertive">'))), []);
});

test("a rule that throws is reported as a failure rather than crashing the sweep", () => {
  const broken = { name: "a rule that throws", why: "x".repeat(40), run: () => { throw new Error("boom"); } };

  assert.equal(RULES.includes(broken), false, "the broken rule is not in the shipped set");

  const length = RULES.length;

  RULES.push(broken);

  try {
    assert.match(auditPage(page())[0].message, /the rule itself threw: boom/);
  } finally {
    RULES.length = length;
  }
});

test("every rule has a reason, because a rule whose reason is unknown is a rule nobody can judge", () => {
  for (const rule of RULES) {
    assert.ok(rule.name.length > 0, "a rule with no name");
    assert.ok(rule.why.length > 30, `"${rule.name}" does not say what it is for`);
  }
});

test("the page list covers the built output rather than a hand-written sample", async () => {
  const pages = await builtPages(distDir);

  assert.ok(pages.length > 500, `only found ${pages.length} built pages`);
  for (const page of ["/", "/glossary/", "/elements/oganesson/", "/about/", "/calculators/temperature/"]) {
    assert.ok(pages.includes(page), `${page} is missing from the page list`);
  }
});
