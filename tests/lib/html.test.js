import { test } from "node:test";
import assert from "node:assert/strict";

import { attributes, classNames, escapeHtml } from "../../scripts/lib/html.js";

test("text is escaped for markup", () => {
  assert.equal(escapeHtml("Oganesson"), "Oganesson");
  assert.equal(escapeHtml("Borax & co"), "Borax &amp; co");
  assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
  assert.equal(escapeHtml('a "quoted" value'), "a &quot;quoted&quot; value");
  assert.equal(escapeHtml("it's"), "it&#39;s");
});

test("a missing value becomes an empty string rather than the word null", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(""), "");
});

test("numbers survive escaping as themselves", () => {
  assert.equal(escapeHtml(118), "118");
  assert.equal(escapeHtml(0), "0");
});

test("attributes are written with a leading space", () => {
  assert.equal(attributes({ class: "tile", id: "h" }), ' class="tile" id="h"');
  assert.equal(attributes({}), "");
});

test("an attribute is escaped, so a value cannot break out of it", () => {
  const rendered = attributes({ title: 'a "quoted" name' });

  assert.equal(rendered, ' title="a &quot;quoted&quot; name"');
});

test("an absent attribute is omitted and a true one is written bare", () => {
  assert.equal(attributes({ hidden: true, disabled: false, id: null, name: undefined }), " hidden");
});

test("class names are joined, and the empty ones dropped", () => {
  assert.equal(classNames("tile", false, "tile--compact", null, undefined, ""), "tile tile--compact");
  assert.equal(classNames(), "");
});
