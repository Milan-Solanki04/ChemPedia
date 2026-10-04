import { test } from "node:test";
import assert from "node:assert/strict";

import { routes } from "../../scripts/router/routes.js";
import {
  currentItemPath,
  footerColumns,
  isCurrent,
  primaryNavigation,
  shellPaths,
  submenus,
} from "../../scripts/router/navigation.js";

/** The path part of a link, without any fragment or query. */
const pagePart = (path) => path.split("#")[0].split("?")[0];

const declared = new Set(routes.map((route) => route.path));

test("the primary navigation comes from the manifest, in the order it asks for", () => {
  const navigation = primaryNavigation(routes);

  assert.deepEqual(
    navigation.map((item) => item.label),
    ["Periodic Table", "Elements", "Glossary", "Calculators"],
  );
  assert.deepEqual(
    navigation.map((item) => item.path),
    ["/", "/elements/", "/glossary/", "/calculators/temperature/"],
  );
});

test("every path the shell links to is a declared route", () => {
  for (const path of shellPaths(routes)) {
    assert.ok(
      declared.has(pagePart(path)),
      `the shell links to ${path}, which the manifest does not declare`,
    );
  }
});

test("a fragment link still points at a declared page", () => {
  const withFragment = footerColumns
    .flatMap((column) => column.entries)
    .filter((entry) => entry.path.includes("#"));

  for (const entry of withFragment) {
    assert.notEqual(pagePart(entry.path), entry.path, `${entry.path} has no page part`);
    assert.ok(declared.has(pagePart(entry.path)), `${entry.path} points outside the manifest`);
  }
});

test("no destination appears twice inside the navigation or inside one submenu", () => {
  const navigation = primaryNavigation(routes).map((item) => item.path);

  assert.equal(new Set(navigation).size, navigation.length, "a navigation item is repeated");

  for (const [section, submenu] of Object.entries(submenus)) {
    const paths = submenu.items.map((item) => item.path);

    assert.equal(new Set(paths).size, paths.length, `the ${section} submenu repeats a destination`);
  }
});

test("every submenu belongs to a section that a page declares", () => {
  const declaredSections = new Set(routes.map((route) => route.section).filter(Boolean));

  for (const section of Object.keys(submenus)) {
    assert.ok(
      declaredSections.has(section),
      `the ${section} submenu is defined but no page carries it`,
    );
  }
});

test("the footer has the five columns, each with a heading and entries", () => {
  assert.deepEqual(
    footerColumns.map((column) => column.id),
    ["periodic-table", "elements", "reference", "tools", "about"],
  );

  for (const column of footerColumns) {
    assert.ok(column.heading.length > 0, `the ${column.id} column has no heading`);
    assert.ok(column.entries.length > 0, `the ${column.id} column has no entries`);

    for (const entry of column.entries) {
      assert.ok(entry.label.length > 0, `an entry in ${column.id} has no label`);
    }
  }
});

test("a link is current when it names the page being rendered", () => {
  assert.equal(isCurrent("/", "/"), true);
  assert.equal(isCurrent("/elements/", "/elements"), true);
  assert.equal(isCurrent("/elements", "/elements/"), true);
  assert.equal(isCurrent("/about/#data-sources", "/about/"), true);
  assert.equal(isCurrent("/glossary/?term=acid", "/glossary/"), true);
  assert.equal(isCurrent("/elements/", "/glossary/"), false);
});

test("a link is not current when only its case differs", () => {
  assert.equal(isCurrent("/Elements/", "/elements/"), false);
});

test("the current submenu item is found, and its absence is not an error", () => {
  const items = submenus["periodic-table"].items;

  assert.equal(currentItemPath(items, "/periodic-table/orbitals/"), "/periodic-table/orbitals/");
  assert.equal(currentItemPath(items, "/contact/"), null);
});
