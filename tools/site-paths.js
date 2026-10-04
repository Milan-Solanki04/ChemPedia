/**
 * Where things live, and where a URL lands on disk.
 *
 * The build writes one HTML file per route under `dist/`, and the development server reads those
 * same files back. Both need the same two answers — what is the project root, and what file does a
 * given URL own — so both import them from here rather than each computing them their own way.
 *
 * Everything in this module is pure path arithmetic. It performs no file-system access, which is
 * what makes it testable without building anything.
 *
 * `normalisePathname` is the build's half of a rule the browser also has to follow: a directory path
 * is published with a trailing slash and a file path without. It cannot be imported from
 * `scripts/lib/path-match.js`, because that module is what the browser loads and this one reaches for
 * the file system. So the two are written apart and asserted to agree — `tests/lib/path-match.test.js`
 * checks every published route and every likely mistyped path through both. If they ever diverge, that
 * test fails rather than a reader finding out.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** `source/` — the authored, shipped code. */
export const sourceDir = path.resolve(here, "..");

/** The repository root. */
export const projectRoot = path.resolve(sourceDir, "..");

/**
 * Built output. Git ignores it (`.gitignore`, ADR-001 §3): the repository holds authored source
 * and the build regenerates this directory on demand.
 */
export const distDir = path.join(projectRoot, "dist");

/** The file a directory-style URL resolves to, exactly as a static host would resolve it. */
export const INDEX_FILE = "index.html";

/** The document served, with a 404 status, for a URL that matches nothing. */
export const NOT_FOUND_FILE = "404.html";

/**
 * Normalise a URL path into the form this site publishes.
 *
 * A published path is absolute and free of repeated separators. A path that names a directory
 * keeps exactly one trailing slash, because that is the canonical URL the server redirects to and
 * the URL the built output answers; a path that names a file keeps none. A path is taken to name a
 * file when its last segment carries an extension, which is the same rule a static host uses and
 * the reason page slugs in this project never contain a dot.
 *
 * @param {string} pathname
 * @returns {string}
 */
export function normalisePathname(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) {
    throw new TypeError("A URL path must be a non-empty string.");
  }

  if (!pathname.startsWith("/")) {
    throw new TypeError(`A URL path must start with "/": received ${pathname}`);
  }

  const trimmed = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");

  if (trimmed === "") {
    return "/";
  }

  return path.extname(trimmed) === "" ? `${trimmed}/` : trimmed;
}

/**
 * The absolute path in the build directory that a URL is written to and read from.
 *
 * `/` and `/elements/` resolve to their `index.html`, mirroring static hosting, while any path
 * carrying a file extension is used as-is so that CSS, JavaScript and images keep working.
 *
 * A path that would escape the build directory is rejected rather than clamped, so a malformed
 * request can never read or overwrite something outside the site.
 *
 * @param {string} pathname
 * @returns {string}
 */
export function outputFileForPath(pathname) {
  const normalised = normalisePathname(pathname);
  const relative = normalised.slice(1);

  const target =
    relative === "" || relative.endsWith("/") ? `${relative}${INDEX_FILE}` : relative;

  const resolved = path.resolve(distDir, target);

  if (!isInside(distDir, resolved)) {
    throw new RangeError(`Refusing to resolve outside the build directory: ${pathname}`);
  }

  return resolved;
}

/**
 * Whether `candidate` is `directory` itself or something beneath it.
 *
 * @param {string} directory
 * @param {string} candidate
 * @returns {boolean}
 */
export function isInside(directory, candidate) {
  return candidate === directory || candidate.startsWith(directory + path.sep);
}
