/**
 * The periodic table.
 *
 * Eighteen columns, ten rows, 118 tiles, and roughly half the cells empty. This component renders
 * all of it from the element records and nothing else: where each tile sits comes from the record's
 * own `position`, what colour it wears comes from the colour mode it is handed, and the shape of the
 * grid comes from the stylesheet. There is no arithmetic here at all, which is the point — a table
 * whose geometry is computed at render time is a table that can disagree with the element pages
 * about where an element is.
 *
 * **It is rendered into the page, not assembled by a script in the browser.** That is what makes
 * the table readable with JavaScript switched off, linkable, and present in a crawler's view of the
 * page. The behaviour the reference adds in the browser — isolating a group, moving with the arrow
 * keys — is layered on afterwards and improves a page that already works, which is the only kind of
 * enhancement worth having.
 *
 * **The tiles sit in a real list.** Each tile is wrapped in an `li` inside a `ul`, rather than the
 * grid carrying `role="list"` and every link carrying `role="listitem"` as the reference does. That
 * second arrangement overrides the link role on 118 elements: a screen reader announces "list item"
 * where it should announce a link, and the tile stops being reachable as a link at all. A `ul` with
 * `display: grid` is correct, needs no ARIA, and cannot get it wrong.
 *
 * **One tab stop, not 118.** The tile at `tabStop` carries `tabindex="0"` and the rest `-1`, so the
 * table is a single stop in the page's tab order and the arrow keys are the way around it. The stop
 * defaults to the first tile in reading order, computed from the same grid index the movement code
 * uses — a table whose only tab stop defaulted to whatever element happened to be first in the
 * array would be a table a keyboard reader could not reliably enter.
 *
 * Pure: markup in, markup out.
 */

import { elementTile } from "./element-tile.js";
import { attributes, classNames, escapeHtml } from "../lib/html.js";
import { cellAt, cellKey, parseCell, placementFrom, placementMap } from "../lib/grid.js";
import { destination, initialTabStop } from "../lib/keyboard.js";

/** What the grid is called when a caller does not say. */
const DEFAULT_LABEL = "Periodic table of the elements";

/**
 * @param {{
 *   elements: object[],
 *   paint: (element: object) => { fill: string, onFill: string, key: string },
 *   elementPath?: (element: object) => string,
 *   label?: string,
 *   variant?: "detailed" | "compact",
 *   highlighted?: string | null,
 *   isolate?: string | null,        the key whose cells are lit and everything else dimmed
 *   tabStop?: { row: number, column: number } | null
 * }} options
 * @returns {string}
 */
export function periodicTable({
  elements,
  paint,
  elementPath = (element) => `/elements/${element.slug}/`,
  label = DEFAULT_LABEL,
  variant = "detailed",
  highlighted = null,
  isolate = null,
  tabStop = null,
}) {
  // A table with no tab stop at all would be unreachable by keyboard, so there is no way to ask for
  // one: `null` means "the default", which is the first tile in reading order.
  const stop = tabStop ?? initialTabStop(placementMap(elements));

  const cells = elements
    .map((element) => {
      const { row, column } = element.position;
      const fill = paint(element);
      const key = cellKey(row, column);
      const isStop = stop.row === row && stop.column === column;

      return `<li${attributes({
        // `is-match` is written here rather than by a script, because a group page has to show its
        // group lit with the rest of the table dimmed to a reader whose scripts never ran. `wireTable`
        // takes the same key as its initial pin, so the markup and the behaviour cannot disagree.
        class: classNames("ptable__cell", isolate !== null && fill.key === isolate && "is-match"),
        style: `grid-column:${column};grid-row:${row}`,
        "data-cell": key,
        "data-key": fill.key,
      })}>${elementTile({
        element,
        paint: fill,
        href: elementPath(element),
        variant,
        highlighted: highlighted !== null && element.slug === highlighted,
        tabIndex: isStop ? 0 : -1,
      })}</li>`;
    })
    .join("\n");

  // The compact variant is a diagram inside a panel rather than the page's subject, so it fills
  // whatever it is given instead of claiming the window. This is the one exception to the rule in the
  // stylesheet, and the design reference makes the same exception for its miniature table.
  return `<div${attributes({ class: classNames("ptable", variant === "compact" && "ptable--compact") })}>
<ul${attributes({
    class: classNames("ptable__grid", isolate !== null && "is-isolating"),
    "aria-label": escapeHtml(label),
  })}>
${cells}
</ul>
</div>`;
}

/**
 * Attach the table's behaviour to a page that already contains it.
 *
 * `pinned` is the key the page starts isolated on, for a group page whose markup already has one key
 * lit. It is a start state and nothing more: the reader can still press the chip to un-isolate, and
 * Escape still clears it.
 *
 * Everything this does is an enhancement to a table that is already on the page and already works.
 * With this function never called, the reader gets 118 links, a colour key, and a page that scrolls;
 * with it called, they also get the two interactions the design has.
 *
 * **It works from the DOM, not from the records.** The table was rendered into the page, so by the
 * time any script runs there are no element records in memory — there are `li` elements carrying
 * `data-cell` and `data-key`. Rebuilding the placement index from those attributes is what lets the
 * same grid and keyboard modules serve the browser without being handed the data layer a second time,
 * and it means the behaviour follows the markup that is actually on screen rather than a parallel
 * copy of it.
 *
 * **Isolation is a preview and a pin.** Touching a chip, or tabbing to one, previews its key: the
 * grid dims and the matching tiles come back. Pressing one pins it, so a reader can put the pointer
 * somewhere else and still have the group picked out. Escape clears both. One key at a time — the
 * preview wins over the pin while the pointer is on a chip, which is what a reader hovering a second
 * chip expects.
 *
 * Isolation is two class writes and one per match. It never re-renders the grid and never touches a
 * tile's own state, so a tile being hovered, focused or highlighted while its group is isolated keeps
 * all three.
 *
 * @param {ParentNode} root the element containing the table, and optionally the legend beside it
 * @returns {{ isolate: (key: string | null) => void, release: () => void, destroy: () => void }}
 */
export function wireTable(root, { pinned: initialPin = null } = {}) {
  const grid = root.querySelector(".ptable__grid");
  const legend = root.querySelector(".legend");

  if (!grid) {
    return { isolate() {}, release() {}, destroy() {} };
  }

  const cells = [...grid.querySelectorAll(".ptable__cell[data-cell]")];

  const placement = placementFrom(
    cells.map((cell) => ({ ...(parseCell(cell.dataset.cell) ?? {}), value: cell.querySelector(".tile") })),
  );

  const chips = legend ? [...legend.querySelectorAll(".chip[data-key]")] : [];
  const listeners = [];
  let preview = null;
  // A group page hands its own key in, so the isolation its markup already shows survives the call to
  // `apply()` at the end of setup instead of being cleared and waiting for a click that will not come.
  let pinned = initialPin;

  /**
   * @param {EventTarget} target
   * @param {string} type
   * @param {(event: Event) => void} handler
   */
  function on(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push([target, type, handler]);
  }

  /** The key currently isolated: a preview while one is showing, otherwise the pin. */
  function active() {
    return preview ?? pinned;
  }

  /**
   * Push the current key into the grid.
   *
   * `is-isolating` goes on the grid and `is-match` on the tiles that belong to the key, which is the
   * mechanism the design uses and the reason a filter costs two attribute writes instead of a render.
   */
  function apply() {
    const key = active();

    grid.classList.toggle("is-isolating", key !== null);

    for (const cell of cells) {
      cell.classList.toggle("is-match", key !== null && cell.dataset.key === key);
    }

    for (const chip of chips) {
      chip.setAttribute("aria-pressed", String(chip.dataset.key === pinned));
      chip.classList.toggle("is-active", chip.dataset.key === pinned);
    }
  }

  /**
   * Move the roving tab stop to a cell, and focus it.
   *
   * The stop moves with the reader so that tabbing out of the table and back in returns them to where
   * they were. Focusing the tile also scrolls the sideways-scrolling table to it, which is how a
   * keyboard reader reaches oganesson on a phone without a scroll control of its own.
   *
   * @param {number} row
   * @param {number} column
   */
  function moveTo(row, column) {
    const landing = cellAt(placement, row, column);

    if (!landing) {
      return;
    }

    for (const cell of cells) {
      const tile = cell.querySelector(".tile");

      tile?.setAttribute("tabindex", tile === landing ? "0" : "-1");
    }

    landing.focus();
  }

  on(grid, "keydown", (event) => {
    const from = parseCell(event.target.closest?.("[data-cell]")?.dataset.cell);
    const landing = from === null ? null : destination(placement, from, event.key);

    if (!landing) {
      // Either the key is not ours, or there is nowhere to go. Either way the browser keeps it.
      return;
    }

    event.preventDefault();
    moveTo(landing.row, landing.column);
  });

  // Escape is listened for on the whole table rather than on the grid, because a reader who has
  // pressed a chip to pin a group is most likely sitting on that chip when they decide to undo it.
  on(root, "keydown", (event) => {
    if (event.key !== "Escape" || (preview === null && pinned === null)) {
      return;
    }

    preview = null;
    pinned = null;
    apply();
  });

  // A tile focused by pointer or by Tab, rather than by an arrow key, still has to become the stop —
  // otherwise the reader tabs away and returns to the first tile, having visited the hundredth.
  on(grid, "focusin", (event) => {
    const cell = event.target.closest?.("[data-cell]");

    if (!cell) {
      return;
    }

    for (const other of cells) {
      other.querySelector(".tile")?.setAttribute("tabindex", other === cell ? "0" : "-1");
    }
  });

  for (const chip of chips) {
    const key = chip.dataset.key;

    on(chip, "pointerenter", () => {
      preview = key;
      apply();
    });

    on(chip, "pointerleave", () => {
      preview = null;
      apply();
    });

    // Tabbing to a chip previews its group too, which is the whole of the keyboard half of the
    // interaction: the reader reaches the legend and the table answers without them pressing anything.
    on(chip, "focus", () => {
      preview = key;
      apply();
    });

    on(chip, "blur", () => {
      preview = null;
      apply();
    });

    on(chip, "click", () => {
      pinned = pinned === key ? null : key;
      apply();
    });
  }

  apply();

  return {
    /** @param {string | null} key */
    isolate(key) {
      pinned = key;
      preview = null;
      apply();
    },

    release() {
      preview = null;
      pinned = null;
      apply();
    },

    /** Detach everything, for a page that swaps its own content out. */
    destroy() {
      for (const [target, type, handler] of listeners) {
        target.removeEventListener(type, handler);
      }

      listeners.length = 0;
    },
  };
}