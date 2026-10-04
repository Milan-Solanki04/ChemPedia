import { test } from "node:test";
import assert from "node:assert/strict";

import { renderDocument } from "../../tools/build.js";

const page = {
  title: "ChemiPedia — a title",
  description: "A description of the page.",
  body: '<article class="intro"><h1>ChemiPedia</h1></article>',
};

test("the skeleton is a complete HTML document", () => {
  const document = renderDocument(page);

  assert.ok(document.startsWith("<!doctype html>"), "the doctype comes first");
  assert.match(document, /<html lang="en">/);
  assert.match(document, /<meta charset="utf-8">/);
  assert.match(document, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.ok(document.trimEnd().endsWith("</html>"), "the document is closed");
});

test("the skeleton carries the page's own title and description", () => {
  const document = renderDocument(page);

  assert.ok(document.includes("<title>ChemiPedia — a title</title>"));
  assert.ok(
    document.includes('<meta name="description" content="A description of the page.">'),
  );
});

test("the skeleton declares an icon, so no page load makes a request that fails", () => {
  const document = renderDocument(page);

  assert.ok(
    document.includes('<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml">'),
    "a document with no icon makes the browser ask for one anyway and fail",
  );
});

test("metadata is escaped before it reaches the markup", () => {
  const document = renderDocument({
    ...page,
    title: 'A <title> & a "quote"',
    description: "An <em>emphasis</em> & an ampersand",
  });

  assert.ok(document.includes("<title>A &lt;title&gt; &amp; a &quot;quote&quot;</title>"));
  assert.ok(document.includes('content="An &lt;em&gt;emphasis&lt;/em&gt; &amp; an ampersand"'));
  assert.equal(document.includes("<em>emphasis</em>"), false);
});

test("authored markup is placed inside the main landmark and left alone", () => {
  const document = renderDocument(page);

  // `tabindex="-1"` is on the landmark so the skip link can announce where it arrived; the assertion
  // matches the attributes so it keeps testing the wrapping rather than the exact tag.
  assert.match(document, /<main id="main"[^>]*>\n<article class="intro">/, "the landmark wraps the page");
  assert.ok(document.includes('<h1>ChemiPedia</h1>'), "authored markup is not escaped");
  assert.match(document, /<main id="main" tabindex="-1">/, "the skip link's target must be focusable");
});
