# Brand assets

| File | What it is |
|---|---|
| `favicon.svg` | The tab icon. Referenced by every page. |
| `social-card.svg` | The editable original of the share card. |
| `social-card.png` | What the pages actually reference from `og:image`. |

**Why there are two of the card.** The crawlers that read `og:image` — Facebook among them — do not
render SVG, so a card that exists only as SVG is a card nobody sees. Generating a PNG needs an image
library or a browser, and this project has neither as a dependency: the build must run on a clean
clone with nothing installed.

So the PNG is generated once, here, by a browser, and committed. It is an artefact of the SVG beside
it rather than a second drawing that has to be kept in step by hand.

**Regenerating it.** After editing the SVG, render it with any browser and export at 1200 × 630:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --screenshot=source/assets/brand/social-card.png \
  --window-size=1200,630 --default-background-color=00000000 \
  "file://$PWD/source/assets/brand/social-card.svg"
```

A test asserts the PNG exists, is a PNG, and is no larger than a megabyte — so a forgotten
regeneration, or an SVG substituted by mistake, is caught rather than shipped.
