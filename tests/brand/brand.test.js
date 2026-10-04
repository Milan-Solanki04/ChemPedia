import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The brand scan, as a test rather than a command someone has to remember.
 *
 * `docs/TESTING_STRATEGY.md` already asks for the scan before a phase closes, and a scan that is
 * remembered is a scan that is skipped. This one walks the whole of `source/` and fails the suite
 * if the reference's name appears anywhere in it — code, comment, page title, data record or
 * prose. The phase log's separate scan output exists so the check is visible in the record; this
 * exists so that it cannot be forgotten.
 *
 * `tests/` is skipped because this file has to name the thing it forbids.
 */

const SOURCE = fileURLToPath(new URL("../..", import.meta.url));

/** What may not appear. The reference's name, in the spellings it is written in. */
const PROHIBITED = /breaking[ _-]?atom/i;

/**
 * Every file under `source/`, apart from the tests.
 *
 * @param {string} directory
 * @returns {Promise<string[]>} paths
 */
async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== "tests" && entry.name !== "node_modules") {
        found.push(...(await filesUnder(full)));
      }
    } else {
      found.push(full);
    }
  }

  return found;
}

test("the reference's name appears nowhere in the shipped tree", async () => {
  const offenders = [];

  for (const file of await filesUnder(SOURCE)) {
    const contents = await readFile(file, "utf8");

    if (PROHIBITED.test(contents)) {
      offenders.push(path.relative(SOURCE, file));
    }
  }

  assert.deepEqual(offenders, [], `the reference's name appears in: ${offenders.join(", ")}`);
});

test("the scan is looking at the tree it thinks it is", async () => {
  const files = await filesUnder(SOURCE);

  assert.ok(files.length > 30, `the scan found only ${files.length} files`);
  assert.ok(files.some((file) => file.endsWith("styles/tokens.css")));
  assert.ok(files.some((file) => file.endsWith("data/elements.json")));
});
