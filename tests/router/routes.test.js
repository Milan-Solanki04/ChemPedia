import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";

import { routes, templatePathFor } from "../../scripts/router/routes.js";
import { sourceDir } from "../../tools/site-paths.js";

test("every route declares a path", () => {
  assert.ok(routes.length > 0, "the manifest declares no routes at all");

  for (const route of routes) {
    assert.equal(typeof route.path, "string", `route ${route.path} has no path`);
    assert.ok(route.path.length > 0, "a route declares an empty path");
  }
});

test("no two routes claim the same path", () => {
  const paths = routes.map((route) => route.path);
  const unique = new Set(paths);

  assert.equal(unique.size, paths.length, `duplicate paths: ${paths.join(", ")}`);
});

test("every path is absolute and published in directory style", () => {
  for (const route of routes) {
    assert.ok(route.path.startsWith("/"), `${route.path} is not absolute`);
    assert.ok(
      route.path === "/" || route.path.endsWith("/"),
      `${route.path} must end with a trailing slash to match how the site is served`,
    );
    assert.equal(route.path.includes("//"), false, `${route.path} repeats a separator`);
  }
});

test("every route declares its own title and description", () => {
  for (const route of routes) {
    assert.equal(typeof route.title, "string", `${route.path} has no title`);
    assert.ok(route.title.trim().length > 0, `${route.path} has an empty title`);
    assert.equal(typeof route.description, "string", `${route.path} has no description`);
    assert.ok(route.description.trim().length > 0, `${route.path} has an empty description`);
  }
});

test("the manifest is plain data, so the browser can read it without the build", () => {
  const serialisable = (value, path) => {
    if (typeof value === "function") {
      assert.fail(`${path} holds a function; the manifest must be data the browser can read`);
    }

    if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        serialisable(nested, `${path}.${key}`);
      }
    }
  };

  for (const route of routes) {
    serialisable(route, route.path);
    assert.equal(
      JSON.parse(JSON.stringify(route)).path,
      route.path,
      `${route.path} does not survive a round trip through JSON`,
    );
  }
});

test("every route names a template in source/pages", () => {
  for (const route of routes) {
    assert.equal(typeof route.template, "string", `${route.path} names no template`);
    assert.match(
      route.template,
      /^[a-z][a-z0-9-]*$/,
      `${route.path} names a template that is not a plain file name: ${route.template}`,
    );
  }
});

test("the manifest declares routes the build can already render", () => {
  const ready = routes.filter((route) => existsSync(path.join(sourceDir, templatePathFor(route))));

  assert.ok(
    ready.length > 0,
    "every declared route is waiting on a template, so the build would produce nothing",
  );
});

test("a route that joins the navigation declares a label and an order", () => {
  const orders = new Set();

  for (const route of routes.filter((candidate) => candidate.nav !== undefined)) {
    assert.equal(typeof route.nav.label, "string", `${route.path} has no navigation label`);
    assert.ok(route.nav.label.length > 0, `${route.path} has an empty navigation label`);
    assert.ok(
      Number.isInteger(route.nav.order),
      `${route.path} has no integer navigation order`,
    );
    assert.equal(orders.has(route.nav.order), false, `two routes claim order ${route.nav.order}`);
    orders.add(route.nav.order);
  }
});

test("a section, where declared, is a named string", () => {
  for (const route of routes.filter((candidate) => candidate.section !== undefined)) {
    assert.equal(typeof route.section, "string", `${route.path} has a section that is not a name`);
    assert.ok(route.section.length > 0, `${route.path} has an empty section`);
  }
});

test("the home page is declared at the root path", () => {
  const home = routes.filter((route) => route.path === "/");

  assert.equal(home.length, 1, "the root path must be declared exactly once");
  assert.equal(home[0].template, "home");
});

test("a template path is relative to source and keeps the family name", () => {
  assert.equal(templatePathFor({ template: "home" }), "pages/home.html");
  assert.equal(templatePathFor({ template: "element-detail" }), "pages/element-detail.html");
});
