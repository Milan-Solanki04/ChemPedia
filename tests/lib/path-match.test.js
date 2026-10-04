import { test } from "node:test";
import assert from "node:assert/strict";

import { routes } from "../../scripts/router/routes.js";
import {
  canonicalPath,
  hasRoute,
  pathnameOf,
  publishedPaths,
  routeFor,
  samePath,
} from "../../scripts/lib/path-match.js";
import { normalisePathname } from "../../tools/site-paths.js";

const declared = [
  { path: "/" },
  { path: "/elements/" },
  { path: "/elements/hydrogen/" },
  { path: "/about/" },
];

test("a path is reduced to the part that names a page", () => {
  assert.equal(pathnameOf("/elements/hydrogen/"), "/elements/hydrogen/");
  assert.equal(pathnameOf("/elements/hydrogen/?q=iron"), "/elements/hydrogen/");
  assert.equal(pathnameOf("/about/#data-sources"), "/about/");
  assert.equal(pathnameOf("/about/?a=1#b"), "/about/");
  assert.equal(pathnameOf("https://example.org/glossary/?q=x#y"), "https://example.org/glossary/");
  assert.equal(pathnameOf(""), "");
  assert.equal(pathnameOf(null), "");
});

test("a fragment is stripped before a query, because a query may contain one", () => {
  // "/about/#a?b" is a fragment containing a question mark. Read the other way round it is a query
  // containing a hash, and the page is not the same either time.
  assert.equal(pathnameOf("/about/#a?b"), "/about/");
  assert.equal(pathnameOf("/about/?a=1#b"), "/about/");
});

test("a directory path is published with one trailing slash, and a file path without", () => {
  assert.equal(canonicalPath("/elements/hydrogen"), "/elements/hydrogen/");
  assert.equal(canonicalPath("/elements/hydrogen/"), "/elements/hydrogen/");
  assert.equal(canonicalPath("/"), "/");
  assert.equal(canonicalPath(""), null);
  assert.equal(canonicalPath("/styles/tokens.css"), "/styles/tokens.css");
  assert.equal(canonicalPath("/assets/brand/favicon.svg"), "/assets/brand/favicon.svg");
});

test("repeated separators are one separator, and the root survives having them stripped", () => {
  assert.equal(canonicalPath("//elements///hydrogen//"), "/elements/hydrogen/");
  assert.equal(canonicalPath("////"), "/");
  assert.equal(canonicalPath("/?q=1"), "/");
});

test("a relative path has no canonical form here, because resolving it needs the page it is on", () => {
  assert.equal(canonicalPath("elements/hydrogen/"), null);
  assert.equal(canonicalPath("../elements/"), null);
  assert.equal(canonicalPath("#section"), null);
});

test("a path and an href naming the same page are the same page", () => {
  assert.equal(samePath("/elements/hydrogen", "/elements/hydrogen/"), true);
  assert.equal(samePath("/about/#data-sources", "/about/"), true);
  assert.equal(samePath("/elements/", "/elements/?q=iron"), true);
  assert.equal(samePath("/", "/"), true);
});

test("case is not folded, because a URL path is case-sensitive on every host", () => {
  // The dev server will not serve /elements/Iron/, so a router that treated it as hydrogen would be
  // sending a reader somewhere the server disagrees exists.
  assert.equal(samePath("/elements/Iron/", "/elements/iron/"), false);
  assert.equal(canonicalPath("/elements/Iron/"), "/elements/Iron/");
});

test("a path names the route it was declared as", () => {
  assert.equal(routeFor("/elements/hydrogen/", declared).path, "/elements/hydrogen/");
  assert.equal(routeFor("/elements/hydrogen", declared).path, "/elements/hydrogen/");
  assert.equal(routeFor("/elements/hydrogen/?q=iron", declared).path, "/elements/hydrogen/");
  assert.equal(routeFor("/", declared).path, "/");
  assert.equal(routeFor("/about/#data-sources", declared).path, "/about/");
});

test("a path that names no route is a page that does not exist", () => {
  assert.equal(routeFor("/elements/unobtainium/", declared), null);
  assert.equal(routeFor("/elements/iron/", declared), null);
  assert.equal(routeFor("", declared), null);
  assert.equal(routeFor("elements/hydrogen/", declared), null);
  assert.equal(hasRoute("/elements/unobtainium/", declared), false);
  assert.equal(hasRoute("/about/", declared), true);
});

test("every declared route resolves through the matcher to itself", () => {
  // The rule the whole module exists to hold: the router and the build must never disagree about
  // which URLs exist. Checked against the real manifest, which is where it would show.
  for (const route of routes) {
    assert.equal(routeFor(route.path, routes)?.path, route.path, `${route.path} does not resolve to itself`);
    assert.equal(canonicalPath(route.path), route.path, `${route.path} is not in its published form`);
  }
});

test("the browser's canonical form and the build's are the same rule", () => {
  // `normalisePathname` is Node-only because it also answers "which file", so it cannot be imported
  // here. What it can be is asserted to agree, on every path the manifest publishes and on the paths
  // a reader is most likely to type wrongly.
  for (const route of routes) {
    assert.equal(normalisePathname(route.path), canonicalPath(route.path), `${route.path} disagrees`);
  }

  for (const path of ["/", "/elements", "/elements/", "/elements/hydrogen", "/styles/tokens.css", "//elements//x//"]) {
    assert.equal(normalisePathname(path), canonicalPath(path), `${path} disagrees`);
  }
});

test("the published paths are the manifest's, with nothing added and nothing lost", () => {
  assert.deepEqual(publishedPaths(declared), ["/", "/elements/", "/elements/hydrogen/", "/about/"]);
  assert.equal(publishedPaths(routes).length, routes.length);
  assert.equal(new Set(publishedPaths(routes)).size, routes.length, "two routes publish the same URL");
});

test("nothing the shell links to is a page the site does not publish", () => {
  // The shell's own test proves its paths are declared. This proves the two agree on what "declared"
  // means, which is the part a path-matching bug would break.
  const published = new Set(publishedPaths(routes));

  for (const route of routes) {
    assert.ok(published.has(canonicalPath(route.path)), `${route.path} is not in the published set`);
  }
});