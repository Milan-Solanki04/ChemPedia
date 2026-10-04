#!/usr/bin/env node
/**
 * The development server.
 *
 * Plain Node, no packages. It serves `dist/` the way a static host does, which is the point: a page
 * that works here works once deployed, and a link that breaks here would break in production too.
 *
 * Three behaviours are deliberately modelled on real static hosting rather than invented:
 *
 *   - A directory-style URL resolves to its `index.html`, so `/elements/hydrogen/` is a page rather
 *     than a directory listing.
 *   - A request that is not in its canonical form is redirected to it, so `/elements/hydrogen` and
 *     `/elements/hydrogen/` do not become two pages with two addresses.
 *   - A URL that matches nothing is answered with the built not-found document and a 404 status.
 *
 * Because the built output is ignored by git (ADR-001 §3), the server builds it on start when it is
 * missing, so a fresh clone needs one command rather than two.
 *
 * Run it with `node source/tools/serve.js`. Options: `--port <number>`, `--rebuild`, `--help`.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "./build.js";
import {
  INDEX_FILE,
  NOT_FOUND_FILE,
  distDir,
  isInside,
  normalisePathname,
  outputFileForPath,
  sourceDir,
} from "./site-paths.js";

/**
 * The style guide is a development tool, so the build never renders it and it never reaches the
 * built output (ADR-001 §3). It still needs to be viewable, so the server maps this one prefix
 * onto the source tree instead of the build. Nothing else is served from source: a page that is
 * not in the build must not appear to be part of the site.
 */
const STYLE_GUIDE_PREFIX = "/styleguide/";
const styleGuideDir = path.join(sourceDir, "styleguide");

/**
 * @param {string} pathname a normalised URL path
 * @returns {string | null} the file in the source tree that the path names, if it names one
 */
function styleGuideFile(pathname) {
  if (!pathname.startsWith(STYLE_GUIDE_PREFIX)) {
    return null;
  }

  const relative = pathname.slice(STYLE_GUIDE_PREFIX.length);
  const target = relative === "" || relative.endsWith("/") ? `${relative}${INDEX_FILE}` : relative;
  const resolved = path.resolve(styleGuideDir, target);

  return isInside(styleGuideDir, resolved) ? resolved : null;
}

const DEFAULT_PORT = 4173;

/** Types the site actually serves. Anything unlisted is sent as a binary download. */
const CONTENT_TYPES = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  }),
);

/**
 * Read the command line.
 *
 * @param {string[]} argv arguments after the script name
 * @returns {{ port: number, rebuild: boolean, help: boolean }}
 */
export function parseArguments(argv) {
  const options = {
    port: Number(process.env.PORT) || DEFAULT_PORT,
    rebuild: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--rebuild") {
      options.rebuild = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--port" || argument.startsWith("--port=")) {
      const inline = argument.startsWith("--port=") ? argument.slice("--port=".length) : null;

      if (inline === null) {
        index += 1;
      }

      const value = inline ?? argv[index];
      const port = Number(value);

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new RangeError(`Invalid port: ${value}`);
      }

      options.port = port;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

/**
 * @param {string} target
 * @returns {Promise<boolean>} whether the path is a regular file
 */
async function isFile(target) {
  try {
    return (await stat(target)).isFile();
  } catch {
    return false;
  }
}

/**
 * The content type for a file, from its extension.
 *
 * @param {string} file
 * @returns {string}
 */
function contentTypeFor(file) {
  return CONTENT_TYPES.get(path.extname(file).toLowerCase()) ?? "application/octet-stream";
}

/**
 * Send a file, or the not-found document, as the response.
 *
 * @param {import("node:http").ServerResponse} response
 * @param {{ status: number, file: string | null, head?: boolean }} options
 */
async function sendFile(response, { status, file, head = false }) {
  if (file === null) {
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    response.end(head ? undefined : "Not found\n");
    return;
  }

  const body = await readFile(file);

  response.writeHead(status, {
    "content-type": contentTypeFor(file),
    "content-length": body.byteLength,
    // Development only: always serve what is on disk, never a cached copy.
    "cache-control": "no-store",
  });
  response.end(head ? undefined : body);
}

/**
 * Create the server without starting it. Exported so it can be exercised directly.
 *
 * @param {{ logging?: boolean }} [options]
 * @returns {import("node:http").Server}
 */
export function createStaticServer({ logging = true } = {}) {
  return createServer(async (request, response) => {
    const head = request.method === "HEAD";
    let logged = "";

    try {
      if (request.method !== "GET" && !head) {
        response.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
        response.end("Method not allowed\n");
        return;
      }

      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      const requested = decodeURIComponent(url.pathname);
      const canonical = normalisePathname(requested);
      const guide = styleGuideFile(canonical);

      if (guide !== null && (await isFile(guide))) {
        await sendFile(response, { status: 200, file: guide, head });
        logged = `200 ${request.method} ${canonical} (style guide)`;
        return;
      }

      const file = outputFileForPath(canonical);

      if (canonical !== requested && (await isFile(file))) {
        response.writeHead(301, { location: `${canonical}${url.search}` });
        response.end();
        logged = `301 ${request.method} ${requested} -> ${canonical}`;
        return;
      }

      if (await isFile(file)) {
        await sendFile(response, { status: 200, file, head });
        logged = `200 ${request.method} ${canonical}`;
        return;
      }

      const notFound = path.join(distDir, NOT_FOUND_FILE);
      await sendFile(response, {
        status: 404,
        file: (await isFile(notFound)) ? notFound : null,
        head,
      });
      logged = `404 ${request.method} ${canonical}`;
    } catch (error) {
      const status = error instanceof TypeError || error instanceof RangeError ? 400 : 500;
      response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
      response.end(`${status === 400 ? "Bad request" : "Server error"}\n`);
      logged = `${status} ${request.method} ${request.url ?? ""}`;
    } finally {
      if (logging && logged !== "") {
        console.log(logged);
      }
    }
  });
}

/**
 * Build if needed, then listen.
 *
 * @param {{ port?: number, rebuild?: boolean, logging?: boolean }} [options]
 * @returns {Promise<import("node:http").Server>}
 */
export async function startServer({ port = DEFAULT_PORT, rebuild = false, logging = true } = {}) {
  const entryPage = path.join(distDir, INDEX_FILE);

  if (rebuild || !(await isFile(entryPage))) {
    const { routes } = await build();
    console.log(`Built ${routes.length} ${routes.length === 1 ? "route" : "routes"} into dist/`);
  }

  const server = createStaticServer({ logging });

  await new Promise((resolve, reject) => {
    server.once("error", (error) => {
      reject(
        error.code === "EADDRINUSE"
          ? new Error(`Port ${port} is already in use. Pass --port <number> to choose another.`)
          : error,
      );
    });
    server.listen(port, "127.0.0.1", resolve);
  });

  if (logging) {
    console.log(`Serving dist/ at http://localhost:${port}/   (Ctrl+C to stop)`);
  }

  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    console.log(
      [
        "Usage: node source/tools/serve.js [options]",
        "",
        "  --port <number>   port to listen on (default 4173, or $PORT)",
        "  --rebuild         rebuild the site before serving",
        "  --help            show this message",
      ].join("\n"),
    );
  } else {
    await startServer(options);

    process.on("SIGINT", () => {
      console.log("\nStopped.");
      process.exit(0);
    });
  }
}
