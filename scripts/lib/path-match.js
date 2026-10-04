/**
 * Does this path name that page?
 *
 * One answer to one question, written once. The question has been asked three times in this project
 * already and answered three times: by `normalisePathname` in the build, by `isCurrent` in the
 * shell, and — the moment a link is intercepted — by the router. Three answers are three places to
 * fix when the rules change, and they will change: the site is about to publish 118 element pages
 * and then 418 glossary terms.
 *
 * So the rules live here, and the other two call in.
 *
 * **The rules, in full.**
 *
 * A published path is absolute, and carries exactly one separator between segments. It ends in a
 * slash if it names a directory and carries no slash if it names a file — which is decided by whether
 * its last segment has an extension, the same rule a static host uses, and the reason this project's
 * slugs never contain a dot. `/elements/hydrogen` and `/elements/hydrogen/` are therefore one page.
 *
 * A query string and a fragment are not part of a page's identity: `/about/#data-sources` is the
 * about page, scrolled to somewhere. They are stripped before comparing.
 *
 * Case is **not** folded. A URL path is case-sensitive on every host this site will meet, so
 * `/elements/Iron/` is a page that does not exist rather than one that does. Folding case would make
 * the router agree with a URL the server will not serve.
 *
 * Pure, and it reads no data file: the routes are an argument, so the same functions serve the build,
 * the browser and the tests.
 */

/** A file is anything whose last segment carries an extension. */
const HAS_EXTENSION = /\.[a-zA-Z0-9]+$/;

/**
 * The path part of a URL, an href or a pathname, with its query and fragment removed.
 *
 * Accepts anything a link can be, because a link can be any of three things: an absolute URL, a
 * root-relative path, or — in a hand-written template — a relative one. A relative path has no
 * answer here, because resolving it needs to know where it is written, and that is the caller's
 * business.
 *
 * @param {string} href
 * @returns {string} the pathname, or an empty string when there is nothing to return
 */
export function pathnameOf(href) {
  const value = String(href ?? "").trim();

  if (value === "") {
    return "";
  }

  // Strip a fragment, then a query, in that order: a query may itself contain a `#`.
  return value.split("#")[0].split("?")[0];
}

/**
 * The published form of a path.
 *
 * Returns null for anything that is not an absolute path rather than throwing, because this function
 * is called on whatever a link or a request carries and a router that refuses to answer is a router
 * that breaks on a link it did not expect. The build's own `normalisePathname` throws instead, and
 * deliberately: a malformed route in the manifest should stop the build, not be normalised away.
 *
 * @param {string} pathname
 * @returns {string | null} null when the input is not an absolute path
 */
export function canonicalPath(pathname) {
  const value = pathnameOf(pathname);

  if (!value.startsWith("/")) {
    return null;
  }

  const trimmed = value.replace(/\/{2,}/g, "/").replace(/\/+$/, "");

  if (trimmed === "") {
    return "/";
  }

  return HAS_EXTENSION.test(trimmed) ? trimmed : `${trimmed}/`;
}

/**
 * Whether two paths — or two hrefs, or a path and an href — name the same page.
 *
 * @param {string} one
 * @param {string} other
 * @returns {boolean}
 */
export function samePath(one, other) {
  return canonicalPath(one) !== null && canonicalPath(one) === canonicalPath(other);
}

/**
 * The declared route a path names, or null.
 *
 * Null rather than a throw, and null rather than a guess: a path that names no route is a page that
 * does not exist, which is a 404 and a 404 is a page.
 *
 * @param {string} pathname a path, an href or a full URL
 * @param {{ path: string }[]} routes
 * @returns {{ path: string } | null}
 */
export function routeFor(pathname, routes) {
  const canonical = canonicalPath(pathname);

  if (canonical === null) {
    return null;
  }

  return routes.find((route) => canonicalPath(route.path) === canonical) ?? null;
}

/**
 * Whether the manifest publishes a path.
 *
 * @param {string} pathname
 * @param {{ path: string }[]} routes
 * @returns {boolean}
 */
export function hasRoute(pathname, routes) {
  return routeFor(pathname, routes) !== null;
}

/**
 * Every path the manifest publishes, in their published form.
 *
 * For the tests that check the shell, the footer and the legend against the manifest: they want the
 * set of real URLs, and they want it computed by the same rule the router will use.
 *
 * @param {{ path: string }[]} routes
 * @returns {string[]}
 */
export function publishedPaths(routes) {
  return routes.map((route) => canonicalPath(route.path)).filter((path) => path !== null);
}