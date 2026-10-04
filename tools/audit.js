/**
 * A static accessibility and structure sweep over the built output.
 *
 * **Static, not a browser, and the distinction is the point.** A browser probe can be run on ten
 * templates; this runs on all five hundred and eighty-four files, so a defect that appears on one page
 * of a family — a missing `alt`, a skipped heading level, an id used twice — is caught on every page
 * that has it rather than on whichever one happened to be looked at.
 *
 * The rules here are the ones that can be decided from the HTML alone. Anything needing layout, focus or
 * a computed style belongs in the browser sweep in `tools/` or in a test with a document, and saying so
 * here is deliberate: a check that passes because it cannot see the defect is worse than no check.
 *
 * Run it with `node source/tools/audit.js`. It prints one line per failure and exits non-zero if there
 * is any, so it can sit in front of a release.
 */

import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { distDir } from "./site-paths.js";

/**
 * Every page the build produced, as a path relative to the document root.
 *
 * @param {string} dir
 * @returns {Promise<string[]>} paths like `/elements/iron/`
 */
export async function builtPages(dir) {
  /**
   * @param {string} current
   * @returns {Promise<string[]>}
   */
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    const found = [];

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        found.push(...(await walk(full)));
      } else if (entry.name === "index.html") {
        // `path.relative` on the root's own directory is the empty string, so the root page came out
        // as "//" — a path no document is served at, and one the sweep then reported as the first page.
        const relative = path.relative(dir, path.dirname(full)).split(path.sep).join("/");

        found.push(relative === "" ? "/" : `/${relative}/`);
      }
    }

    return found;
  }

  const pages = await walk(dir);

  return pages.sort();
}

/**
 * Remove the elements that cannot contain anything, and the comments and scripts.
 *
 * A `<template>`'s contents are inert; a `<script>` and a `<style>` hold text that looks like markup and
 * is not. Stripping them first means a rule about an image or a heading cannot be satisfied by a
 * `<div>` inside a template and cannot be broken by the word "h1" in a comment.
 *
 * @param {string} html
 * @returns {string}
 */
function inert(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "");
}

/**
 * Every tag of a given name, with their attributes, in document order.
 *
 * @param {string} html
 * @param {string} tag
 * @returns {{ attrs: string, index: number, end: number }[]}
 */
function tagsOf(html, tag) {
  const found = [];
  const pattern = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  let match = pattern.exec(html);

  while (match !== null) {
    found.push({
      attrs: match[1] ?? "",
      index: match.index,
      // Where the opening tag ends, so a caller measuring an element's contents does not measure the
      // element itself. The first version of the nested-link rule sliced from the opening tag's start,
      // which therefore always contained an `<a` — its own — and reported a nested link on all 584 pages.
      end: match.index + match[0].length,
    });
    match = pattern.exec(html);
  }

  return found;
}

/**
 * The id on an element's attributes, if it has one.
 *
 * @param {string} attrs
 * @returns {string | null}
 */
function idOf(attrs) {
  return /\bid="([^"]*)"/.exec(attrs)?.[1] ?? null;
}

/**
 * Every rule a single page can fail, and how.
 *
 * Each entry is a name, a check that returns a message or `null`, and what the rule is for. Keeping
 * them as data rather than as a chain of `if`s means the report can list the rules that passed, and a
 * rule that silently stops being run is visible.
 *
 * @type {{ name: string, why: string, run: (html: string) => string | null }[]}
 */
export const RULES = [
  {
    name: "one h1",
    why: "A page needs exactly one top-level heading, and more than one is a structural claim it cannot support.",
    run(html) {
      const found = tagsOf(html, "h1").length;

      return found === 1 ? null : `${found} h1 elements`;
    },
  },
  {
    name: "heading levels never skip",
    why: "Skipping a level breaks the heading outline a screen reader navigates by.",
    run(html) {
      const order = [...inert(html).matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));

      if (order.length === 0) {
        return "no headings at all";
      }

      let previous = 0;

      for (const level of order) {
        // `previous === 0` is the first heading, which may be any level: a page whose top heading is an
        // `h2` has a document that starts at the wrong depth, which the one-h1 rule already catches.
        if (previous !== 0 && level > previous + 1) {
          return `an h${previous} is followed by an h${level}`;
        }

        previous = level;
      }

      return null;
    },
  },
  {
    name: "every image has an alt attribute",
    why: "An absent alt is read aloud as the filename; an empty alt is correct only for a decorative image.",
    run(html) {
      for (const { attrs } of tagsOf(inert(html), "img")) {
        if (!/\balt="/.test(attrs)) {
          return `an <img> with no alt: <img${attrs.slice(0, 60)}>`;
        }
      }

      return null;
    },
  },
  {
    name: "every id appears once",
    why: "A repeated id makes a label, an aria reference or a fragment link point at the wrong element.",
    run(html) {
      const seen = new Map();

      for (const { attrs } of tagsOf(html, "*")) {
        const id = idOf(attrs);

        if (id === null) {
          continue;
        }

        seen.set(id, (seen.get(id) ?? 0) + 1);
      }

      for (const [id, count] of seen) {
        if (count > 1) {
          return `id "${id}" appears ${count} times`;
        }
      }

      return null;
    },
  },
  {
    name: "every label points at an element that exists",
    why: "A label for a missing input is not a label; a screen reader announces nothing and the field has no name.",
    run(html) {
      const ids = new Set();

      for (const { attrs } of tagsOf(html, "*")) {
        const id = idOf(attrs);

        if (id !== null) {
          ids.add(id);
        }
      }

      for (const { attrs } of tagsOf(html, "label")) {
        const forId = /\bfor="([^"]*)"/.exec(attrs)?.[1];

        if (forId === undefined) {
          return "a <label> with no `for`";
        }

        if (forId !== "" && !ids.has(forId)) {
          return `a <label for="${forId}"> and nothing carries that id`;
        }
      }

      return null;
    },
  },
  {
    name: "every form control has a name",
    why: "A field with no label is announced only by its placeholder, which disappears the moment it is typed into.",
    run(html) {
      const cleaned = inert(html);

      for (const tag of ["input", "select", "textarea"]) {
        for (const { attrs } of tagsOf(cleaned, tag)) {
          const type = /\btype="([^"]*)"/.exec(attrs)?.[1] ?? "text";

          if (type === "hidden") {
            continue;
          }

          const named =
            /\baria-label="/.test(attrs) ||
            /\baria-labelledby="/.test(attrs) ||
            /\bid="/.test(attrs) ||
            /\btitle="/.test(attrs) ||
            /\bplaceholder="/.test(attrs);

          if (!named) {
            return `a <${tag}> with no id, label, title or placeholder: ${attrs.slice(0, 60)}`;
          }
        }
      }

      return null;
    },
  },
  {
    name: "no link is nested inside another",
    why: "Nested links are invalid and a screen reader announces only the inner one.",
    run(html) {
      const cleaned = inert(html);

      for (const { attrs, index, end } of tagsOf(cleaned, "a")) {
        const contents = cleaned.slice(end, cleaned.indexOf("</a>", index));

        if (/<a\b/i.test(contents)) {
          return `a nested <a${attrs.slice(0, 40)}>`;
        }
      }

      return null;
    },
  },
  {
    name: "every aria reference points at an id that exists",
    why: "A dangling aria-labelledby is announced as nothing, which is worse than no attribute at all.",
    run(html) {
      const ids = new Set();

      for (const { attrs } of tagsOf(html, "*")) {
        const id = idOf(attrs);

        if (id !== null) {
          ids.add(id);
        }
      }

      for (const attribute of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
        for (const { attrs } of tagsOf(html, "*")) {
          const value = new RegExp(`\\b${attribute}="([^"]*)"`).exec(attrs)?.[1];

          if (value === undefined) {
            continue;
          }

          for (const reference of value.split(/\s+/).filter(Boolean)) {
            if (!ids.has(reference)) {
              return `${attribute}="${reference}" and nothing carries that id`;
            }
          }
        }
      }

      return null;
    },
  },
  {
    name: "the document has one main landmark",
    why: "The skip link targets `#main`, so there has to be exactly one of it.",
    run(html) {
      const found = tagsOf(html, "main").length;

      return found === 1 ? null : `${found} <main> elements`;
    },
  },
  {
    name: "the skip link's target exists",
    why: "A skip link to nothing is a dead control at the top of every page.",
    run(html) {
      const target = /class="skip-link" href="#([^"]+)"/.exec(html)?.[1];

      if (target === undefined) {
        return "no skip link";
      }

      return html.includes(`id="${target}"`) ? null : `no element with id "${target}"`;
    },
  },
  {
    name: "the skip link's target is focusable",
    why: "A skip link to a target that cannot hold focus still moves the browser's tab start point, so the next Tab lands in the content — but `document.activeElement` never enters it and a screen reader has nothing to announce. `-1` makes it focusable without adding a tab stop.",
    run(html) {
      const target = /class="skip-link" href="#([^"]+)"/.exec(html)?.[1];

      if (target === undefined) {
        return "no skip link";
      }

      const element = tagsOf(html, "*").find(({ attrs }) => idOf(attrs) === target);

      if (element === undefined) {
        return `no element carries id "${target}"`;
      }

      return /\btabindex="(-1|0)"/.test(element.attrs)
        ? null
        : `<${target}> cannot hold focus, so activating the skip link announces nothing`;
    },
  },
  {
    name: "no positive tabindex",
    why: "A positive tabindex reorders the whole tab sequence away from the document's own.",
    run(html) {
      for (const { attrs } of tagsOf(html, "*")) {
        const value = /\btabindex="([^"]*)"/.exec(attrs)?.[1];

        if (value !== undefined && Number(value) > 0) {
          return `tabindex="${value}"`;
        }
      }

      return null;
    },
  },
  {
    name: "every live region is polite and not assertive by accident",
    why: "`assertive` interrupts whatever is being read; a count or a warning does not need to.",
    run(html) {
      for (const { attrs } of tagsOf(html, "*")) {
        if (/\baria-live="assertive"/.test(attrs) && !/\brole="alert"/.test(attrs)) {
          return `aria-live="assertive" on <${attrs.slice(0, 50)}>`;
        }
      }

      return null;
    },
  },
];

/**
 * Run every rule against one page's markup.
 *
 * @param {string} html
 * @returns {{ rule: string, message: string }[]}
 */
export function auditPage(html) {
  const failures = [];

  for (const rule of RULES) {
    let message = null;

    try {
      message = rule.run(html);
    } catch (error) {
      message = `the rule itself threw: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (message !== null) {
      failures.push({ rule: rule.name, message });
    }
  }

  return failures;
}

/**
 * Audit every built page.
 *
 * @param {string} [dir]
 * @returns {Promise<{ pages: number, failures: { page: string, rule: string, message: string }[], byRule: Map<string, number> }>}
 */
export async function audit(dir = distDir) {
  const pages = await builtPages(dir);
  const failures = [];
  const byRule = new Map();

  for (const page of pages) {
    const file = path.join(dir, page.replace(/^\/|\/$/g, ""), "index.html");

    for (const { rule, message } of auditPage(await readFile(file, "utf8"))) {
      failures.push({ page, rule, message });
      byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
    }
  }

  return { pages: pages.length, failures, byRule };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await audit();

  console.log(`Audited ${report.pages} built pages against ${RULES.length} rules.`);
  console.log(
    report.failures.length === 0
      ? "PASS: every page passes every rule."
      : `FAIL: ${report.failures.length} failures across ${report.byRule.size} rules.`,
  );

  for (const [rule, count] of [...report.byRule].sort((one, other) => other[1] - one[1])) {
    const why = RULES.find((entry) => entry.name === rule).why;

    console.log(`\n  ${count} × ${rule}`);
    console.log(`      ${why}`);
    for (const failure of report.failures.filter((entry) => entry.rule === rule).slice(0, 3)) {
      console.log(`      e.g. ${failure.page}: ${failure.message}`);
    }
  }

  process.exitCode = report.failures.length === 0 ? 0 : 1;
}
