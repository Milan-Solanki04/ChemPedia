# `source/` — shipped code

Everything in this folder is loaded by a browser. Nothing else belongs here: no plans, no notes, no
research, no screenshots of the design reference. Those live in sibling `../workspace/`.

The rule that decides it: **does the browser load it?** Yes → here. No → `../workspace/`.

## Where things are

| Path | Contents |
|---|---|
| `pages/` | One authored HTML template per page family, written as a fragment. The build wraps each one in the shared document skeleton. |
| `scripts/router/` | `routes.js` — **the route manifest.** Every URL the site publishes. The build renders this list and nothing else. |
| `scripts/data/` | Repositories: the only code that reads the JSON in `data/`. |
| `scripts/components/` | One module per component, reusable and unaware of any URL. |
| `scripts/pages/` | One module per page family. |
| `scripts/lib/` | Pure helpers: grid placement, colour scales, formatters. No DOM, no data, no side effects. |
| `styles/` | `tokens.css` (every design value in the project), `base.css`, `layout.css`, then one stylesheet per component and per page family. One theme only — light (ADR-006). |
| `data/` | `elements.json`, `glossary.json`, `categories.json`, `units.json`. Data only, no logic. |
| `assets/` | Our brand artwork and any self-hosted fonts. |
| `tools/` | Plain-Node development tooling: the site build, the development server, the data build script. Never shipped to the browser. |
| `tests/` | Node's built-in test runner. No dependencies, nothing to install. |

Folders that a later phase owns are absent rather than empty. Git does not track an empty
directory, and a placeholder file would be exactly the stub the working agreement forbids; each
folder arrives with its first real file.

The full tree, with the responsibility of every file, is in
[`../workspace/guides/02-tour-of-the-codebase.md`](../workspace/guides/02-tour-of-the-codebase.md),
and the index of every file actually present is in
[`../workspace/docs/MIND_MAP.md`](../workspace/docs/MIND_MAP.md).

## Running it

From the repository root:

```bash
node source/tools/build.js     # render every route in the manifest into dist/
node source/tools/serve.js     # serve dist/ at http://localhost:4173/ (builds first if needed)
node --test source/tests       # the test suite
```

`serve.js` accepts `--port <number>` and `--rebuild`. The build output is generated and ignored by
git: the repository holds authored source, and `dist/` is regenerated on demand.

## The rules that apply here

- JavaScript ES modules only. No TypeScript, no framework, no package required at runtime.
- A published URL exists only if it is declared in `scripts/router/routes.js`.
- Only the repositories read the raw JSON; a component asks a repository instead.
- One component = one module plus one stylesheet of the same name. One page family = one template,
  one page module and one stylesheet, all named after the family.
- No file over 400 lines. No `utils.js`, `helpers.js`, `misc.js` or `common.js`.
- No literal colour, size, radius or duration outside `styles/tokens.css`.
- No file named after a phase. Files are named after what they own.
- The brand rules in [`../workspace/docs/BRAND_GUIDELINES.md`](../workspace/docs/BRAND_GUIDELINES.md)
  are enforced by a scan before every milestone commit.

## Before you change anything

Read [`../workspace/AGENTS.md`](../workspace/AGENTS.md). It is short and it is binding.
