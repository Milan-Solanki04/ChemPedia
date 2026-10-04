/**
 * The one place that knows how a data file is fetched.
 *
 * Every repository in this folder reads one JSON file, and every one of them needs the same three
 * lines to do it. Those three lines are here instead of copied four times, because the part worth
 * getting right — what a URL is, what happens when the response is not OK, what a caller passes in
 * so that a test never touches the network — should be decided once.
 *
 * It is not a general-purpose helper and it is not called one. It owns one thing: turning a file
 * name in the data folder into parsed JSON.
 */

/** Where the browser finds the data. The build copies `source/data` to this path in the output. */
export const DATA_ROOT = "/data";

/**
 * Read a JSON file from the data folder.
 *
 * @param {string} name the file's name, with its extension
 * @param {{ fetchImpl?: typeof fetch, base?: string }} [options] injected so tests need no network
 * @returns {Promise<unknown>}
 * @throws {Error} when the file cannot be read, naming the file rather than the response
 */
export async function loadJson(name, { fetchImpl = fetch, base = DATA_ROOT } = {}) {
  const url = `${base}/${name}`;
  const response = await fetchImpl(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`The data file ${url} answered ${response.status} ${response.statusText}`);
  }

  return response.json();
}
