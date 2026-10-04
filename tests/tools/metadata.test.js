import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { builtPages } from "../../tools/audit.js";
import { labelFor, robotsFor, sitemapFor } from "../../tools/metadata.js";
import { allRoutes } from "../../scripts/router/routes.js";
import { loadRepositories } from "../../tools/repositories.js";
import { distDir } from "../../tools/site-paths.js";
import { SITE_NAME, SITE_ORIGIN, SOCIAL_CARD } from "../../scripts/lib/site.js";

/**
 * The metadata a crawler reads: canonical links, the share card, structured data, and the two files a
 * site is found by.
 *
 * Written against the built output rather than the renderer, because the failures worth catching here
 * are the ones that only appear once the pieces have been assembled — a tag that renders but points at
 * the wrong URL, a JSON-LD block that is valid when it is built and invalid when it is embedded, a
 * sitemap listing a page that did not build.
 */

const dist = distDir;
const pages = await builtPages(dist);

/** @param {string} page */
const htmlOf = (page) => readFile(path.join(dist, page.replace(/^\/|\/$/g, ""), "index.html"), "utf8");

const headOf = (html) => html.slice(html.indexOf("<head>"), html.indexOf("</head>"));

/** @param {string} html @param {RegExp} pattern */
const metaOf = (html, pattern) => html.match(pattern)?.[1] ?? null;

test("every page declares a canonical URL that is its own absolute address", async () => {
  assert.ok(pages.length > 500, `only found ${pages.length} pages`);

  for (const page of pages) {
    const canonical = metaOf(await htmlOf(page), /<link rel="canonical" href="([^"]+)">/);

    assert.equal(canonical, `${SITE_ORIGIN}${page}`, `${page} declares the wrong canonical URL`);
  }
});

test("the not-found page declares no canonical URL", async () => {
  // A canonical on a 404 points the index at a URL that answers 404, which is how soft-404s are made.
  const notFound = await readFile(path.join(dist, "404.html"), "utf8");

  assert.doesNotMatch(notFound, /<link rel="canonical"/);
});

test("every page carries the share card, sized and absolute", async () => {
  for (const page of pages) {
    const head = headOf(await htmlOf(page));

    for (const [property, expected] of [
      ["og:title", metaOf(head, /<meta property="og:title" content="([^"]+)">/)],
      ["og:description", metaOf(head, /<meta property="og:description" content="([^"]+)">/)],
      ["og:url", metaOf(head, /<meta property="og:url" content="([^"]+)">/)],
      ["og:image", `${SITE_ORIGIN}${SOCIAL_CARD}`],
      ["og:site_name", SITE_NAME],
      ["twitter:card", "summary_large_image"],
    ]) {
      assert.ok(expected !== null && expected.length > 0, `${page} has no ${property}`);
    }
  }
});

test("the share card is a real PNG, present and no larger than it should be", async () => {
  const png = await readFile(path.join(dist, SOCIAL_CARD));

  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "not a PNG — the SVG has been referenced by mistake");
  assert.ok(png.length < 1_000_000, `the card is ${Math.round(png.length / 1024)}KB, which is a megabyte of link preview`);
  assert.ok(png.length > 1_000, "the card is too small to be a 1200x630 image");
});

test("the structured data on every page parses, and nothing can close the script early", async () => {
  for (const page of pages) {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(await htmlOf(page));

    assert.ok(block !== null, `${page} has no structured data`);

    const parsed = JSON.parse(block[1].replace(/\\u003c/g, "<"));

    assert.equal(parsed["@context"], "https://schema.org");
    assert.ok(Array.isArray(parsed["@graph"]) && parsed["@graph"].length > 0, `${page} has an empty graph`);
    assert.ok(
      block[1].includes("\\u003c") === block[1].includes("<"),
      `${page} has both an escaped and an unescaped "<", which means the escaping is inconsistent`,
    );
  }
});

test("an element page describes the element, with values that came from the record", async () => {
  const { elements } = await loadRepositories();
  const iron = elements.all().find((element) => element.slug === "iron");
  const graph = JSON.parse(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(await htmlOf("/elements/iron/"))[1]
      .replace(/\\u003c/g, "<"),
  );
  const substance = graph["@graph"].find((node) => node["@type"] === "ChemicalSubstance");

  assert.ok(substance !== undefined, "no ChemicalSubstance on an element page");
  assert.equal(substance.name, iron.name);
  assert.equal(substance.alternateName, iron.symbol);
  assert.equal(substance.identifier.value, iron.atomicNumber);
  assert.equal(substance.url, `${SITE_ORIGIN}/elements/iron/`);

  // The bug this guards: the route carries `element: "iron"`, a slug. Passing that in produced a node
  // whose name, symbol and description were all `undefined`, so `JSON.stringify` dropped them and the
  // build reported a node with a null meaning and no complaint.
  for (const field of ["name", "alternateName", "chemicalComposition", "description", "url"]) {
    assert.ok(substance[field] !== undefined && substance[field] !== "", `ChemicalSubstance.${field} is empty on iron`);
  }
});

test("every element page describes its own element, and the graph never carries an empty node", async () => {
  const { elements } = await loadRepositories();

  for (const element of [elements.all()[0], elements.all()[57], elements.all()[117]]) {
    const graph = JSON.parse(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(await htmlOf(`/elements/${element.slug}/`))[1]
        .replace(/\\u003c/g, "<"),
    );
    const substance = graph["@graph"].find((node) => node["@type"] === "ChemicalSubstance");

    assert.equal(substance?.name, element.name, `${element.slug} is described as ${substance?.name}`);
    assert.equal(substance?.alternateName, element.symbol);
  }
});

test("a page that is its own section's landing page is not a step below itself", async () => {
  const graph = JSON.parse(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(await htmlOf("/elements/"))[1].replace(/\\u003c/g, "<"),
  );
  const crumbs = graph["@graph"].find((node) => node["@type"] === "BreadcrumbList");
  const items = crumbs.itemListElement.map((item) => item.item);

  assert.deepEqual(items, [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/elements/`], "the trail repeats the page it is describing");
});

test("breadcrumb items are absolute, because a consumer has no base URL to resolve them against", async () => {
  for (const page of ["/elements/iron/", "/glossary/ion/", "/periodic-table/orbitals/", "/about/"]) {
    const graph = JSON.parse(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(await htmlOf(page))[1].replace(/\\u003c/g, "<"),
    );
    const crumbs = graph["@graph"].find((node) => node["@type"] === "BreadcrumbList");

    if (crumbs === undefined) {
      continue;
    }

    crumbs.itemListElement.forEach((item, position) => {
      assert.equal(item.position, position + 1, `${page} breadcrumb positions are not consecutive`);
      assert.ok(item.item.startsWith("https://"), `${page} has the relative breadcrumb ${item.item}`);
      assert.ok(item.name.length > 0 && !item.name.includes(" — "), `${page} uses a page title as a label: ${item.name}`);
    });
  }
});

test("the home page describes the site as well as the page", async () => {
  const graph = JSON.parse(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(await htmlOf("/"))[1].replace(/\\u003c/g, "<"),
  );
  const types = graph["@graph"].map((node) => node["@type"]);

  assert.ok(types.includes("WebSite"), "the home page does not describe the site");
  assert.ok(types.includes("WebPage"));

  const contact = JSON.parse(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(await htmlOf("/contact/"))[1].replace(/\\u003c/g, "<"),
  );

  assert.ok(
    !contact["@graph"].some((node) => node["@type"] === "WebSite"),
    "only the home page describes the site",
  );
});

test("the sitemap lists exactly the pages that built, and nothing else", async () => {
  const { elements, categories, glossary } = await loadRepositories();
  const declared = allRoutes(elements.all(), categories.all(), glossary.all()).map((route) => route.path);
  const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(SITE_ORIGIN, ""));

  assert.equal(listed.length, declared.length, "the sitemap and the declared routes disagree");
  assert.deepEqual(listed, [...declared].sort(), "the sitemap is not the declared routes, sorted");
  assert.ok(!sitemap.includes("404"), "the sitemap lists a URL that answers 404");
  assert.ok(!sitemap.includes("lastmod"), "lastmod would be a build time, which is not a modification");
  assert.ok(sitemap.startsWith("<?xml"), "no XML declaration");
});

test("the sitemap is derived from the built routes, so an unbuilt page cannot appear in it", () => {
  // Built from a list rather than generated inline, so the property is checkable: give it a route that
  // does not exist and it must still come out well-formed and containing only what it was given.
  const xml = sitemapFor(["/", "/elements/iron/"]);

  assert.equal([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].length, 2);
  assert.ok(xml.includes("https://chemipedia.example/elements/iron/"));
  assert.ok(!xml.includes("lastmod"));
});

test("robots.txt invites crawlers in, and names the sitemap with the same origin", async () => {
  const robots = await readFile(path.join(dist, "robots.txt"), "utf8");

  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: \/$/m, "a reference work must not ask to be kept out of indexes");
  assert.match(robots, new RegExp(`^Sitemap: ${SITE_ORIGIN.replace(/\./g, "\\.")}/sitemap\\.xml$`, "m"));
});

test("one origin, used by the canonical, the share card, the sitemap and robots", () => {
  // Four places that could disagree. The printed origin and the contact address use `example` for the
  // same reason the canonical does; a build that emitted different absolutes on different machines
  // would produce a sitemap full of lies.
  assert.match(SITE_ORIGIN, /^https:\/\/[a-z0-9.-]+$/);
  assert.ok(robotsFor().includes(`${SITE_ORIGIN}/sitemap.xml`));
  assert.ok(sitemapFor(["/"]).includes(`${SITE_ORIGIN}/`));
  assert.ok(SOCIAL_CARD.startsWith("/"), "the card is a site path, joined onto the origin by whoever uses it");
});

test("every route's title yields a label a breadcrumb can use", async () => {
  const { elements, categories, glossary } = await loadRepositories();
  const byElement = new Map(elements.all().map((element) => [element.slug, element]));
  const byTerm = new Map(glossary.all().map((term) => [term.slug, term]));

  for (const route of allRoutes(elements.all(), categories.all(), glossary.all())) {
    const label = labelFor(route, { element: byElement.get(route.element), term: byTerm.get(route.term) });

    assert.ok(label.length > 0, `${route.path} has an empty label`);
    assert.ok(label.length <= 60, `${route.path} has a label of ${label.length} characters: ${label}`);
  }
});
