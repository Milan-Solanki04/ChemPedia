/**
 * Following links without reloading the page.
 *
 * The site is a static site: every URL is a real file, and a cold load of `/elements/iron/` is
 * served directly by any host with no rewrite rule. That is the property that makes the site
 * indexable, printable, and readable with JavaScript switched off, and this module is built entirely
 * on top of it rather than at the cost of it. With this never started, every link is a link and every
 * page is a page.
 *
 * **It swaps what the server rendered, not what it thinks the page should contain.** The header, the
 * contextual band, the footer, the title and the page's own stylesheet are all per-page facts, so a
 * router that replaced only `<main>` would leave a reader on the iron page with the home page's
 * navigation marked current and the home page's stylesheets loaded. The target document is fetched,
 * parsed, and its `<head>` and chrome are moved across — which also means the router cannot render
 * anything the build does not already render, so there is no second copy of a page to keep in step.
 *
 * **A path the manifest does not declare is not intercepted.** The router has nothing to swap in for
 * it, and the honest answer to a URL that names no page is the server's: a 404, with a 404 status, and
 * the site's own not-found document. A client-side 404 would look identical and tell a crawler and a
 * reader's status bar something false.
 *
 * **A swapped-in page gets its own behaviour.** `onArrive` is called with the new path after every
 * swap, so the page that arrives is wired the way a full load would have wired it. The alternative —
 * leaving the reader on a table whose arrow keys no longer work — is the kind of quiet break that only
 * a reader who uses a keyboard and navigates in one session ever finds.
 *
 * **Two decisions are pure and tested without a browser**: whether a click is one this site should
 * follow itself, and where the page should scroll afterwards. Everything else here is plumbing
 * between the document and the browser, and it is verified by driving the real thing.
 */

import { routeFor } from "../lib/path-match.js";

/**
 * Whether a click on a link is one this site should follow itself.
 *
 * Plain values in and a boolean out, so the whole rule is testable in Node. The list is the standard
 * one — a plain left click, no modifier keys, same origin, no new tab, no download — and each of
 * those is a way a reader has asked the browser to do something this site should not intercept.
 *
 * @param {{
 *   href: string | null,
 *   currentOrigin: string,
 *   target?: string | null,
 *   download?: string | true | null,
 *   button?: number,
 *   metaKey?: boolean,
 *   ctrlKey?: boolean,
 *   shiftKey?: boolean,
 *   altKey?: boolean,
 *   defaultPrevented?: boolean
 * }} link the link's own attributes and the event's modifiers, as plain values
 * @param {{ routes: { path: string }[] }} context
 * @returns {boolean}
 */
export function shouldHandleLink(link, { routes }) {
  const {
    href,
    currentOrigin,
    target,
    download,
    button = 0,
    metaKey = false,
    ctrlKey = false,
    shiftKey = false,
    altKey = false,
    defaultPrevented = false,
  } = link;

  // Something else on the page already handled this click.
  if (defaultPrevented) {
    return false;
  }

  // Middle click, and any modifier, mean "open this somewhere else".
  if (button !== 0 || metaKey || ctrlKey || shiftKey || altKey) {
    return false;
  }

  if (target !== null && target !== undefined && target !== "" && target !== "_self") {
    return false;
  }

  // Present is present: `getAttribute("download")` answers "" for `<a download>`, which is an empty
  // filename rather than the absence of an attribute, and an empty filename is still a download.
  if (download !== null && download !== undefined) {
    return false;
  }

  // A fragment with no path is a jump within this page, and the browser does it better than we can.
  if (typeof href !== "string" || href === "" || href.startsWith("#")) {
    return false;
  }

  let url;

  try {
    url = new URL(href, currentOrigin);
  } catch {
    return false;
  }

  // Another site.
  if (url.origin !== currentOrigin) {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  // The manifest has to have an opinion. Anything it does not publish belongs to the server.
  return routeFor(url.pathname, routes) !== null;
}

/**
 * Where the page should be scrolled to after a navigation.
 *
 * A link the reader clicked starts at the top, because they asked for a new page. A page they came
 * *back* to — the browser's Back button — starts where they left it, because they did not ask to be
 * somewhere else. This is the one behaviour every router gets wrong the same way, and the reason is
 * worth writing down: it is not "scroll to top on navigation", it is "scroll to the top when the
 * reader asked for a new page".
 *
 * @param {"push" | "pop"} how the page was reached
 * @param {number} savedScrollY where the page was left, for a `pop`
 * @returns {number} a scroll position
 */
export function scrollTargetFor(how, savedScrollY = 0) {
  return how === "pop" ? savedScrollY : 0;
}

/**
 * The pieces of a page the router replaces.
 *
 * Named rather than blanket-replaced, so a page that adds something to the body outside these four
 * places is not silently discarded. The skip link is the fifth: it is the same on every page and it
 * is the reader's way past this chrome.
 */
const CHROME = ["header", "nav.submenu", "main", "footer"];
const SKIP_LINK = ".skip-link";

/**
 * Build a router.
 *
 * The document and the window are arguments so the module has nothing to reach for at import time,
 * which is what lets its two decisions be tested in Node.
 *
 * @param {{
 *   routes: { path: string }[],
 *   doc?: Document,
 *   win?: Window,
 *   fetchImpl?: typeof fetch,
 *   parse?: (markup: string) => Document,
 *   onArrive?: (pathname: string) => void
 * }} options
 * @returns {{
 *   start: () => void,
 *   navigate: (href: string, { replace?: boolean }?: { replace?: boolean }) => Promise<boolean>,
 *   stop: () => void
 * }}
 */
export function createRouter({
  routes,
  doc = document,
  win = window,
  fetchImpl = fetch,
  parse,
  onArrive = () => {},
}) {
  const parseDocument = parse ?? ((markup) => new DOMParser().parseFromString(markup, "text/html"));

  let started = false;

  /**
   * @param {Event} event
   */
  function onClick(event) {
    const anchor = event.target.closest?.("a[href]");

    if (!anchor) {
      return;
    }

    if (
      !shouldHandleLink(
        {
          href: anchor.getAttribute("href"),
          currentOrigin: win.location.origin,
          target: anchor.getAttribute("target"),
          download: anchor.getAttribute("download"),
          button: event.button,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          defaultPrevented: event.defaultPrevented,
        },
        { routes },
      )
    ) {
      return;
    }

    event.preventDefault();
    void navigate(anchor.href);
  }

  /**
   * Move the page's own state into the new document.
   *
   * @param {Document} next
   */
  function adopt(next) {
    doc.title = next.title;

    for (const name of ["description", "og:title", "og:description"]) {
      const meta = next.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      const current = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);

      if (meta && current) {
        current.setAttribute("content", meta.getAttribute("content") ?? "");
      }
    }

    // Stylesheets, in the order the build declared them. The previous page's own stylesheet is
    // removed rather than left behind, or a page accumulates every stylesheet it has visited.
    for (const link of [...doc.querySelectorAll('link[rel="stylesheet"]')]) {
      link.remove();
    }

    for (const link of [...next.querySelectorAll('link[rel="stylesheet"]')]) {
      doc.head.append(link);
    }

    for (const selector of CHROME) {
      const replacement = next.querySelector(selector);
      const current = doc.querySelector(selector);

      if (replacement && current) {
        current.replaceWith(replacement);
      }
    }

    const skip = next.querySelector(SKIP_LINK);
    const currentSkip = doc.querySelector(SKIP_LINK);

    if (skip && currentSkip) {
      currentSkip.replaceWith(skip);
    }
  }

  /**
   * @param {number} top
   */
  function scrollTo(top) {
    if (typeof win.scrollTo === "function") {
      win.scrollTo({ top, behavior: "auto" });
    }
  }

  /**
   * Go to a URL by swapping in the page the server already renders.
   *
   * @param {string} href
   * @param {{ replace?: boolean, restoreScrollY?: number }} [options]
   * @param {number} [options.restoreScrollY] where to leave the viewport when replacing, which is how
   *   a Back or Forward carries the position it was left at
   * @returns {Promise<boolean>} whether the swap happened
   */
  async function navigate(href, { replace = false, restoreScrollY = 0 } = {}) {
    const url = new URL(href, win.location.href);
    const response = await fetchImpl(url.pathname + url.search, {
      headers: { Accept: "text/html" },
    });

    // The server disagrees, or failed. Hand the whole thing back to it: a status code the reader and
    // a crawler can both see is worth more than a swap that might be wrong.
    if (!response.ok) {
      win.location.assign(url.href);

      return false;
    }

    // The page being left keeps the position it was left at, not the position it was opened at. The
    // reader may have scrolled a long way down before choosing something else, and a Back that
    // returns them to the top of a page they had already read is a Back that throws that reading away.
    if (!replace && win.history?.replaceState) {
      win.history.replaceState({ scrollY: win.scrollY ?? 0 }, "", win.location.href);
    }

    adopt(parseDocument(await response.text()));
    onArrive(url.pathname);

    const state = { scrollY: restoreScrollY };

    if (replace) {
      win.history.replaceState(state, "", url.href);
    } else {
      win.history.pushState(state, "", url.href);
    }

    // Focus moves into the new page, because the element the reader was on has just been removed
    // and focus that has nowhere to be is focus a keyboard reader has lost. `main` rather than the
    // document, because Tab from the top of a document goes through the masthead again.
    const main = doc.querySelector("main");

    if (main) {
      main.setAttribute("tabindex", "-1");
      // `preventScroll` because focusing scrolls the element into view, and `main` begins below the
      // masthead: without it, moving focus to the top of the page would drag the viewport down to
      // wherever `main` happens to start, and a new page would open part-way down itself.
      main.focus({ preventScroll: true });
    }

    // The scroll goes last, so that it is the last thing to decide where the viewport is. Anything
    // that moves focus or sets an anchor would otherwise be free to undo it. Which position is the
    // shared decision, so a Back and a Forward cannot drift apart from it.
    scrollTo(scrollTargetFor(replace ? "pop" : "push", restoreScrollY));

    return true;
  }

  /**
   * @param {PopStateEvent} event
   */
  function onPopState(event) {
    const state = event.state;

    if (!state) {
      return;
    }

    // The position to return to is the one in the entry being popped, and `navigate` is told it, so the
    // swap and the scroll cannot be made to disagree by anything happening between them.
    void navigate(win.location.href, { replace: true, restoreScrollY: state.scrollY ?? 0 });
  }

  return {
    start() {
      if (started) {
        return;
      }

      started = true;
      doc.addEventListener("click", onClick);
      win.addEventListener("popstate", onPopState);

      // Manual, because the router restores the position itself: the browser's own restoration
      // happens before the swap and therefore restores to the previous document's layout.
      if ("scrollRestoration" in win.history) {
        win.history.scrollRestoration = "manual";
      }

      win.history.replaceState({ scrollY: win.scrollY ?? 0 }, "", win.location.href);
    },

    navigate,

    stop() {
      if (!started) {
        return;
      }

      started = false;
      doc.removeEventListener("click", onClick);
      win.removeEventListener("popstate", onPopState);
    },
  };
}
