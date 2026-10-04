import { test } from "node:test";
import assert from "node:assert/strict";

import { createElementsRepository } from "../../scripts/data/elements-repository.js";
import { allRoutes, routes } from "../../scripts/router/routes.js";
import { scrollTargetFor, shouldHandleLink } from "../../scripts/router/router.js";

import { readFile } from "node:fs/promises";

async function fromDisk(url) {
  const name = url.split("/").pop();
  const body = await readFile(new URL(`../../data/${name}`, import.meta.url), "utf8");

  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

const elements = (await createElementsRepository({ fetchImpl: fromDisk })).all();

const HERE = "https://chemipedia.test";
const context = { routes: allRoutes(elements), currentOrigin: HERE };

/** A plain left click on a link to `href`, with the given overrides. */
const click = (href, overrides = {}) => ({
  href,
  currentOrigin: HERE,
  target: null,
  download: null,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...overrides,
});

test("a plain left click on one of our own links is ours to follow", () => {
  assert.equal(shouldHandleLink(click("/"), context), true);
  assert.equal(shouldHandleLink(click("/elements/"), context), true);
  assert.equal(shouldHandleLink(click("/about/"), context), true);
  assert.equal(shouldHandleLink(click("/elements/iron/"), context), true);
});

test("a link with no path is left to the browser, which does it better", () => {
  assert.equal(shouldHandleLink(click("#main"), context), false);
  assert.equal(shouldHandleLink(click(""), context), false);
  assert.equal(shouldHandleLink(click(null), context), false);
});

test("a click the reader asked to open somewhere else is not ours", () => {
  // Every one of these is a way a reader has said "not in this tab": a new tab, a new window, a
  // download, or a paste. Intercepting any of them would break a habit rather than speed it up.
  assert.equal(shouldHandleLink(click("/elements/", { button: 1 }), context), false, "middle click");
  assert.equal(shouldHandleLink(click("/elements/", { metaKey: true }), context), false, "cmd");
  assert.equal(shouldHandleLink(click("/elements/", { ctrlKey: true }), context), false, "ctrl");
  assert.equal(shouldHandleLink(click("/elements/", { shiftKey: true }), context), false, "shift");
  assert.equal(shouldHandleLink(click("/elements/", { altKey: true }), context), false, "alt");
  assert.equal(shouldHandleLink(click("/elements/", { target: "_blank" }), context), false, "new tab");
  assert.equal(shouldHandleLink(click("/elements/", { target: "download" }), context), false, "named window");
  assert.equal(shouldHandleLink(click("/elements/", { download: "" }), context), false, "download");
  assert.equal(shouldHandleLink(click("/elements/", { download: "iron.txt" }), context), false);
});

test("a link already handled by something else is left alone", () => {
  assert.equal(shouldHandleLink(click("/elements/", { defaultPrevented: true }), context), false);
});

test("a link to somewhere else is not ours, whatever it looks like", () => {
  assert.equal(shouldHandleLink(click("https://example.org/elements/"), context), false);
  assert.equal(shouldHandleLink(click("//example.org/elements/"), context), false, "protocol-relative");
});

test("a link that is not a page is not ours", () => {
  assert.equal(shouldHandleLink(click("mailto:hello@example.org"), context), false);
  assert.equal(shouldHandleLink(click("tel:+441234567890"), context), false);
  assert.equal(shouldHandleLink(click("javascript:void(0)"), context), false);
});

test("a path the manifest does not publish belongs to the server", () => {
  // The router has nothing to swap in for it, and the honest answer to a URL that names no page is
  // the server's 404 — with a status a reader and a crawler can both see.
  assert.equal(shouldHandleLink(click("/elements/unobtainium/"), context), false);
  assert.equal(shouldHandleLink(click("/no/such/page/"), context), false);
  assert.equal(shouldHandleLink(click("/elements/ironium/"), context), false);
  assert.equal(shouldHandleLink(click("/elements/iron/details/"), context), false);
});

test("a trailing slash and a query do not change which page a link is", () => {
  assert.equal(shouldHandleLink(click("/elements"), context), true);
  assert.equal(shouldHandleLink(click("/elements/?q=iron"), context), true);
  assert.equal(shouldHandleLink(click("/about/#data-sources"), context), true);
});

test("every element page is a link this site would follow", () => {
  // The route list the router reads is the manifest plus what the data layer generates, and the two
  // have to agree — otherwise the router declines to follow a link the site publishes, and a reader
  // gets a full page load for no reason on a page that will have 118 of them.
  const published = allRoutes(elements);

  assert.equal(published.length, routes.length + 118);

  for (const route of published) {
    assert.equal(shouldHandleLink(click(route.path), context), true, `${route.path} is not followed`);
  }
});

test("a link the reader clicked starts at the top, and one they came back to does not", () => {
  // The rule every router gets wrong the same way: it is not "scroll to top on navigation", it is
  // "scroll to the top when the reader asked for a new page".
  assert.equal(scrollTargetFor("push"), 0);
  assert.equal(scrollTargetFor("push", 2400), 0);
  assert.equal(scrollTargetFor("pop", 2400), 2400);
  assert.equal(scrollTargetFor("pop"), 0, "a page with no saved position starts at the top");
});