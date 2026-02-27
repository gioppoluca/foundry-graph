import { MODULE_ID, log, t } from "../constants.js";
import { BaseRenderer } from "./base-renderer.js";
import { FGCalendarDateTimePopover } from "../ui/calendar-datetime-popover.js";
const { DialogV2 } = foundry.applications.api;

// ---------------------------------------------------------------------------
// vis-timeline-renderer.js
//
// A timeline renderer built on the vis.js Timeline library.
//
// KEY DESIGN DECISIONS
// --------------------
// 1. The app passes a D3 selection of <svg id="d3-graph"> to render().
//    vis.js requires a real <div> container, so we:
//      a. Hide the SVG element.
//      b. Create/reuse a sibling <div id="fg-vis-timeline"> inside #d3-graph-container.
//    On teardown we remove the div and restore the SVG.
//
// 2. All time values are stored as TIMESTAMPS IN SECONDS (worldTime convention,
//    matching game.time.worldTime and game.time.calendar). vis.js internally
//    expects ms-epoch numbers. We convert at the boundary:
//      store  → vis :  seconds  * 1000
//      vis → store :  ms / 1000
//
// 3. Axis label overriding: vis.js only accepts plain strings (moment tokens)
//    in format.minorLabels / format.majorLabels — it rejects functions.
//    We monkey-patch vis.moment's prototype.format() to intercept sentinel
//    token strings and redirect them to game.time.calendar.format().
//    The patch is installed before Timeline construction and removed on
//    teardown. When no calendar is present we fall back to raw seconds.
//
// 4. Drop gesture:
//      Normal drop  → "point" item at cursor position (freely moveable).
//      Alt + drop   → "range" item with a default duration; vis.js renders
//                     native left/right resize handles immediately so the
//                     user drags the end to the desired position.
//    No custom gesture code is needed for ranges — vis.js handles it.
//
// 4. The data model (graph.data) mirrors vis.js DataSet structures so we can
//    feed them directly, while staying serialisable as plain JSON:
//
//    graph.data = {
//      items: [
//        {
//          id:         string,           // unique item id
//          uuid:       string,           // Foundry document uuid
//          title:      string,           // display label
//          entityType: string,           // "Actor" | "Scene" | "Item" | ...
//          group:      string,           // laneId (vis.js calls lanes "groups")
//          start:      number,           // SECONDS timestamp (required)
//          end:        number | null,    // SECONDS timestamp (optional)
//          color:      string | null,    // CSS colour override
//          type:       string,           // vis item type: "point" | "range" | "background"
//        }
//      ],
//      groups: [
//        {
//          id:      string,   // matches graph.relations[i].id
//          content: string,   // display label (HTML allowed)
//          style:   string,   // optional inline CSS applied to the group label cell
//        }
//      ],
//      // Persisted viewport so reopening restores the same view window.
//      // Both values are SECONDS timestamps (null = let vis.js auto-fit).
//      windowStart: number | null,
//      windowEnd:   number | null,
//    }
//
// ---------------------------------------------------------------------------

/** ID string used in GraphApi.registryRenderers */
const RENDERER_ID = "vis-timeline";

/** Convert seconds (worldTime) → ms epoch (vis.js) */
const secToMs = (s) => (s != null && Number.isFinite(Number(s))) ? Number(s) * 1000 : null;
/** Convert ms epoch (vis.js) → seconds (worldTime) */
const msToSec = (ms) => (ms != null && Number.isFinite(Number(ms))) ? Number(ms) / 1000 : null;

// ---------------------------------------------------------------------------
// Calendar formatting helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the localised month name (or abbreviation) from CONFIG.
 * Returns null if the calendar config is not available.
 *
 * @param {number} monthIndex  – 0-based month index from timeToComponents
 * @param {"full"|"abbr"}  form
 */
function calendarMonthName(monthIndex, form = "full") {
    try {
        const months = CONFIG.time?.worldCalendarConfig?.months?.values ?? [];
        const m = months[monthIndex];
        if (!m) return null;
        const raw = form === "abbr"
            ? (m.abbreviation ?? m.name ?? null)
            : (m.name ?? m.abbreviation ?? null);
        if (raw == null) return null;
        return typeof raw === "string" ? game.i18n.localize(raw) : String(raw);
    } catch (e) {
        return null;
    }
}

/**
 * Format a seconds timestamp for a given vis.js axis scale.
 *
 * Scale hierarchy (vis.js, coarsest → finest):
 *   year  month  day  weekday  hour  minute  second  millisecond
 *
 * Rules applied here:
 *   • millisecond and second  → suppressed (shown same as minute)
 *   • minute                  → "HH:MM  Day MonthName"  (minor)
 *   • hour                    → "HH:00  Day Abbr"       (minor)  /  "Day MonthName Year" (major)
 *   • weekday / day           → "DD MonthName"          (minor)  /  "MonthName Year"     (major)
 *   • month                   → "MonthName Year"        (minor)  /  "Year"               (major)
 *   • year                    → "Year"
 *
 * @param {number} seconds   – worldTime seconds
 * @param {string} scale     – vis.js scale string
 * @param {"minor"|"major"}  role
 */
function fgFormatForScale(seconds, scale, role) {
    try {
        const cal = game?.time?.calendar;
        if (!cal?.timeToComponents) {
            // No calendar API: fall back to the raw calendar.format() or the number
            return cal?.format ? cal.format(seconds) : String(seconds);
        }

        const c = cal.timeToComponents(seconds);
        // c: { year, month (0-based), dayOfMonth (0-based), hour, minute, second }

        const year = c.year ?? 0;
        const month = c.month ?? 0;   // 0-based
        const day = (c.dayOfMonth ?? 0) + 1;  // make 1-based for display
        const hour = String(c.hour ?? 0).padStart(2, "0");
        const min = String(c.minute ?? 0).padStart(2, "0");

        const monthFull = calendarMonthName(month, "full") ?? String(month + 1);
        const monthAbbr = calendarMonthName(month, "abbr") ?? monthFull.slice(0, 3);

        switch (scale) {
            // ── Finest scales: we don't show sub-minute detail ──────────────────
            case "millisecond":
            case "second":
            // Fall through to minute — vis.js should never reach these scales
            // because zoomMin is set to 1 minute, but be defensive.
            // intentional fall-through
            case "minute":
                return role === "major"
                    ? `${day} ${monthFull} ${year}`
                    : `${hour}:${min}`;

            // ── Hour ─────────────────────────────────────────────────────────────
            case "hour":
                return role === "major"
                    ? `${day} ${monthFull} ${year}`
                    : `${hour}:00`;

            // ── Day / weekday ─────────────────────────────────────────────────────
            case "weekday":
            case "day":
                return role === "major"
                    ? `${monthFull} ${year}`
                    : `${day} ${monthAbbr}`;

            // ── Month ─────────────────────────────────────────────────────────────
            case "month":
                return role === "major"
                    ? String(year)
                    : `${monthFull} ${year}`;

            // ── Year ──────────────────────────────────────────────────────────────
            case "year":
                return String(year);

            default:
                return cal.format ? cal.format(seconds) : String(seconds);
        }
    } catch (e) {
        return String(seconds);
    }
}

// ---------------------------------------------------------------------------
// vis.js axis label override via moment monkey-patch
// ---------------------------------------------------------------------------
//
// vis.js validates that format.minorLabels / format.majorLabels values are
// plain strings (moment.js format tokens like "HH:mm") — it rejects functions.
//
// Strategy:
//   We use one sentinel token per (scale, role) combination.
//   The sentinel encodes the scale and role directly so the patched
//   moment.format() can dispatch to the right fgFormatForScale() call.
//
//   Token format:  "§fg:<scale>:<role>§"
//   e.g.           "§fg:day:minor§"
//
//   The monkey-patch on moment.prototype.format() splits the token and
//   calls fgFormatForScale(seconds, scale, role).
// ---------------------------------------------------------------------------

const FG_TOKEN_RE = /^§fg:(\w+):(minor|major)§$/;

/** Build a sentinel token for a given scale and role. */
const fgToken = (scale, role) => `§fg:${scale}:${role}§`;

/**
 * Monkey-patch vis.moment so axis label calls route through fgFormatForScale.
 * Returns an uninstall function.
 */
function installMomentPatch() {
    const visMoment = vis?.moment ?? window?.moment;
    if (!visMoment) {
        log("VisTimelineRenderer: vis.moment not found, axis labels will use raw numbers");
        return () => { };
    }

    const proto = visMoment(0)?.__proto__;
    if (!proto || typeof proto.format !== "function") {
        log("VisTimelineRenderer: could not access moment prototype, skipping patch");
        return () => { };
    }

    const originalFormat = proto.format;

    proto.format = function fgCalendarFormat(token) {
        const m = typeof token === "string" && FG_TOKEN_RE.exec(token);
        if (m) {
            const [, scale, role] = m;
            return fgFormatForScale(msToSec(this.valueOf()), scale, role);
        }
        return originalFormat.call(this, token);
    };

    return function uninstallMomentPatch() {
        proto.format = originalFormat;
    };
}

/**
 * Format a timestamp for human-readable display (tooltips, dialogs).
 * Always shows full date + time down to minutes: "DD MonthName Year HH:MM"
 */
function fgFormatFull(seconds) {
    try {
        const cal = game?.time?.calendar;
        if (!cal?.timeToComponents) {
            return cal?.format ? cal.format(seconds) : String(seconds);
        }
        const c = cal.timeToComponents(seconds);
        const year = c.year ?? 0;
        const month = c.month ?? 0;
        const day = (c.dayOfMonth ?? 0) + 1;
        const hour = String(c.hour ?? 0).padStart(2, "0");
        const min = String(c.minute ?? 0).padStart(2, "0");
        const monthName = calendarMonthName(month, "full") ?? String(month + 1);
        return `${day} ${monthName} ${year} ${hour}:${min}`;
    } catch (e) {
        return String(seconds);
    }
}

/**
 * Build the vis.js `format` option.
 * Each scale × role gets its own sentinel token so fgFormatForScale()
 * knows exactly what level of detail to show.
 */
function buildVisAxisFormat() {
    const scales = ["millisecond", "second", "minute", "hour", "weekday", "day", "month", "year"];
    const minor = Object.fromEntries(scales.map(s => [s, fgToken(s, "minor")]));
    const major = Object.fromEntries(scales.map(s => [s, fgToken(s, "major")]));
    return { minorLabels: minor, majorLabels: major };
}

// ---------------------------------------------------------------------------
// VisTimelineRenderer
// ---------------------------------------------------------------------------

export class VisTimelineRenderer extends BaseRenderer {

    static ID = RENDERER_ID;

    /**
     * Default duration (seconds) applied when a document is Alt+dropped.
     * Chosen to be visible at any typical zoom level; the user resizes it
     * immediately using vis.js's right-edge handle.
     * Override this to suit your calendar's time scale if needed.
     * e.g. for a fantasy calendar where 1 "day" = 86400 seconds, 7 days = 604800.
     */
    static DEFAULT_RANGE_SEC = 7 * 24 * 3600;  // 7 days

    // ---- internal state ------------------------------------------------------
    /** @type {vis.Timeline | null} */
    _timeline = null;
    /** @type {vis.DataSet | null} */
    _itemsDs = null;
    /** @type {vis.DataSet | null} */
    _groupsDs = null;
    /** @type {HTMLDivElement | null} – the <div> we inject next to the SVG */
    _container = null;
    /** @type {SVGElement | null} – original SVG, hidden while we are active */
    _svgEl = null;
    /** @type {Object | null} – the graph object passed to render() */
    graph = null;
    /** @type {Function | null} – restores the moment monkey-patch on teardown */
    _momentPatchRestore = null;

    // --------------------------------------------------------------------------
    // BaseRenderer contract – data shape
    // --------------------------------------------------------------------------

    initializeGraphData() {
        return {
            items: [],   // see data model comment above
            groups: [],
            windowStart: null,
            windowEnd: null,
        };
    }

    // Hide the standard "Link nodes" and "Relation select" toolbar buttons –
    // they are meaningless for a timeline view.
    get isLinkNodesVisible() { return false; }
    get isRelationSelectVisible() { return false; }

    // --------------------------------------------------------------------------
    // Static entity helpers (called by graph_api cleanup hooks)
    // --------------------------------------------------------------------------

    static hasEntity(graphData, uuid) {
        return !!graphData?.items?.some(i => i.uuid === uuid);
    }

    static removeEntity(graphData, uuid) {
        if (!graphData?.items) return graphData;
        graphData.items = graphData.items.filter(i => i.uuid !== uuid);
        return graphData;
    }

    // --------------------------------------------------------------------------
    // Misc renderer overrides
    // --------------------------------------------------------------------------

    setRelationData(_relation) { /* lanes come from graph.relations, not a single relation */ }

    getGraphData() { return this.graph?.data; }

    // --------------------------------------------------------------------------
    // Teardown
    // --------------------------------------------------------------------------

    teardown() {
        try {
            this._detachNativeDropHandlers();
            this._detachDropHandlers(this._container);
            if (this._momentPatchRestore) {
                this._momentPatchRestore();
                this._momentPatchRestore = null;
            }
            if (this._timeline) {
                this._timeline.destroy();
                this._timeline = null;
            }
            if (this._container?.parentNode) {
                this._container.parentNode.removeChild(this._container);
            }
            if (this._svgEl) {
                this._svgEl.style.display = "";   // restore SVG visibility
            }
        } catch (e) {
            log("VisTimelineRenderer.teardown error", e);
        }
        this._container = null;
        this._svgEl = null;
        this._itemsDs = null;
        this._groupsDs = null;
        this.graph = null;
    }

    // --------------------------------------------------------------------------
    // Main render entry point
    // --------------------------------------------------------------------------

    /**
     * @param {d3.Selection} svgSelection – D3 selection wrapping <svg id="d3-graph">
     * @param {Object}       graph        – the full graph object
     * @param {Object}       [ctx]        – optional context (unused for now)
     */
    async render(svgSelection, graph, ctx) {
        this.graph = graph;
        this._ensureGraphData();

        // --- 1. Obtain the raw SVG element and its parent container div ----------
        this._svgEl = svgSelection.node?.() ?? svgSelection;
        const parentDiv = this._svgEl.parentElement; // #d3-graph-container

        // Hide the SVG – vis.js renders into its own div
        this._svgEl.style.display = "none";

        // --- 2. Create / reuse the vis container div ----------------------------
        if (!this._container || !parentDiv.contains(this._container)) {
            this._container = document.createElement("div");
            this._container.id = "fg-vis-timeline";
            this._container.style.cssText = "width:100%; height:100%; overflow:hidden;";
            parentDiv.appendChild(this._container);
        }

        // --- 3. Backfill img for items that predate the img field ----------------
        // Items loaded from disk (saved before img was added) won't have img set.
        // We resolve them here once, update graph.data in-place, and the tooltip
        // will find the value on subsequent hovers.  Fire-and-forget: we don't
        // await all of them before first render so the timeline appears instantly.
        this._backfillMissingImages();

        // --- 4. Build vis.js DataSets from graph.data ---------------------------
        const { visItems, visGroups } = this._buildVisData();

        // --- 4. Determine initial window ----------------------------------------
        const { windowStart, windowEnd } = this._resolveWindow(visItems);

        // --- 5. Assemble vis.js options -----------------------------------------
        const options = this._buildVisOptions(windowStart, windowEnd);

        // --- 6. Create or update the vis Timeline -------------------------------
        if (this._timeline) {
            // Already exists: update data and options in-place (avoids flicker)
            this._itemsDs.clear();
            this._itemsDs.add(visItems);
            this._groupsDs.clear();
            this._groupsDs.add(visGroups);
            this._timeline.setOptions(options);
        } else {
            // First render: create DataSets and Timeline instance
            // vis.js is expected to be available as a global (loaded via module.json lib)
            if (typeof vis === "undefined") {
                ui.notifications.error("[foundry-graph] vis.js is not loaded. Add it to module.json as a library.");
                return;
            }
            this._itemsDs = new vis.DataSet(visItems);
            this._groupsDs = new vis.DataSet(visGroups);
            // Install the moment monkey-patch so axis labels use game.time.calendar
            this._momentPatchRestore = installMomentPatch();
            this._timeline = new vis.Timeline(this._container, this._itemsDs, this._groupsDs, options);

            // Attach event handlers
            this._attachVisEvents();
        }

        // --- 7. Set up drag-and-drop ----------------------------------------------
        // We bypass BaseRenderer's D3-based handler and register native listeners
        // directly on the container div.  This is necessary because:
        //  a. vis.js renders deeply nested divs with their own pointer-event
        //     handling that can swallow D3-namespaced events.
        //  b. We need the raw native DragEvent to pass to getEventProperties().
        this._detachDropHandlers(this._container);
        this._attachNativeDropHandlers(this._container);
    }

    // --------------------------------------------------------------------------
    // Internal helpers – data preparation
    // --------------------------------------------------------------------------

    _ensureGraphData() {
        if (!this.graph.data) this.graph.data = this.initializeGraphData();
        if (!Array.isArray(this.graph.data.items)) this.graph.data.items = [];
        if (!Array.isArray(this.graph.data.groups)) this.graph.data.groups = [];

        // Sync groups from graph.relations (relations ARE the lanes/groups)
        this._syncGroupsFromRelations();
    }

    /**
     * graph.relations is the authoritative lane definition.
     * We mirror it into graph.data.groups so both the API index and vis.js stay
     * in sync. Existing group entries are updated, new ones appended, obsolete
     * ones removed.
     */
    _syncGroupsFromRelations() {
        const relations = Array.isArray(this.graph.relations) ? this.graph.relations : [];

        if (relations.length === 0) {
            // Ensure at least one default group
            relations.push({
                id: "lane-default",
                label: t?.("Timeline.DefaultLane") ?? "Default",
                color: "#2b2b2b",
            });
            this.graph.relations = relations;
        }

        const relById = new Map(relations.map(r => [r.id, r]));

        // Remove stale groups
        this.graph.data.groups = this.graph.data.groups.filter(g => relById.has(g.id));

        // Upsert from relations
        const existingIds = new Set(this.graph.data.groups.map(g => g.id));
        for (const rel of relations) {
            const styleStr = rel.color ? `color: ${rel.color};` : "";
            if (existingIds.has(rel.id)) {
                const g = this.graph.data.groups.find(x => x.id === rel.id);
                g.content = rel.label || rel.id;
                g.style = styleStr;
            } else {
                this.graph.data.groups.push({ id: rel.id, content: rel.label || rel.id, style: styleStr });
            }
        }
    }

    /**
     * Backfill the `img` field on items that were stored before img was added.
     * Fires async lookups only for items missing img — typically just once after
     * a graph is first opened with the new renderer.  When all lookups resolve
     * we update the DataSet in-place so the next hover shows the image without
     * a full re-render.
     */
    _backfillMissingImages() {
        const items = this.graph?.data?.items ?? [];
        const missing = items.filter(i => i.img == null && i.uuid);
        if (missing.length === 0) return;

        for (const item of missing) {
            fromUuid(item.uuid).then(doc => {
                if (!doc) return;
                const img = doc.img ?? doc.src ?? doc.background?.src ?? doc.thumb ?? null;
                if (img == null) return;
                item.img = img;   // update in-place on graph.data.items
                // Also push the update into the live DataSet so vis.js re-renders
                // the tooltip on the next hover without a full render() call.
                if (this._itemsDs) {
                    try { this._itemsDs.updateOnly({ id: item.id }); } catch (_) { /* item may not exist yet */ }
                }
            }).catch(() => { /* uuid may be invalid — silently skip */ });
        }
    }

    /**
     * Convert graph.data (seconds) → vis.js DataSet entries (ms).
     * @returns {{ visItems: Object[], visGroups: Object[] }}
     */
    _buildVisData() {
        const visItems = this.graph.data.items.map(item => {
            const startMs = secToMs(item.start);
            if (startMs === null) return null;   // skip items with no valid start

            const endMs = secToMs(item.end);
            const hasRange = endMs !== null && endMs > startMs;

            return {
                id: item.id,
                content: this._buildItemContent(item),
                start: startMs,
                end: hasRange ? endMs : undefined,
                group: item.group,
                type: hasRange ? "range" : "point",
                // Note: vis.js DataSet strips unknown fields, so we do NOT store _raw here.
                // The tooltip.template callback looks up the item by id from this.graph.data.items.
                style: this._buildItemStyle(item),
                className: `fg-vis-item fg-type-${(item.entityType || "unknown").toLowerCase()}`,
            };
        }).filter(Boolean);

        const visGroups = this.graph.data.groups.map(g => ({
            id: g.id,
            content: g.content,
            style: g.style || "",
        }));

        return { visItems, visGroups };
    }

    _buildItemContent(item) {
        // Plain text label. You can return HTML here for richer displays later.
        return item.title || item.uuid || item.id;
    }



    _buildItemStyle(item) {
        const fill = item.color || this._typeColor(item.entityType);
        const border = item.color || this._typeBorderColor(item.entityType);
        const text = this._typeTextColor(item.entityType);
        return `background-color:${fill}; border-color:${border}; color:${text};`;
    }

    /**
     * Build the rich HTML tooltip shown on item hover.
     *
     * Layout:
     *   ┌──────────────────────────────────┐
     *   │ [img]  Title              [type] │
     *   │        DD MonthName Year HH:MM   │
     *   │        → DD MonthName Year HH:MM │  (only for ranges)
     *   └──────────────────────────────────┘
     *
     * The image is shown only for Actor, Item, and Scene (types that reliably
     * carry a portrait/icon).  JournalEntry / JournalEntryPage can have images
     * but they are often large article illustrations — we skip them by default.
     */
    _buildTooltipHTML(item) {
        const fill = item.color || this._typeColor(item.entityType);
        const border = item.color || this._typeBorderColor(item.entityType);
        const startStr = fgFormatFull(item.start);
        const endStr = item.end != null ? fgFormatFull(item.end) : null;

        // Type badge label
        const typeLabel = item.entityType ?? "Unknown";

        // Image — only for types that have a meaningful portrait/icon
        const showImg = ["Actor", "Item", "Scene"].includes(item.entityType) && item.img;
        /*
        const imgHTML = showImg
            ? `<img src="${item.img}"
              style="width:52px;height:52px;object-fit:cover;
                     border-radius:4px;flex-shrink:0;
                     border:1px solid ${border};" />`
            : "";
            */
        const imgHTML = showImg
            ? `<div style="
                    width:52px; height:52px; flex-shrink:0;
                    border-radius:4px;
                    border:2px solid ${border};
                    background-image:url('${item.img}');
                    background-size:cover;
                    background-position:center;
                    background-repeat:no-repeat;
                    background-color:#2a2a3e;"></div>`
            : "";


        console.log("Tooltip for item", item, "showImg?", showImg, "imgHTML:", imgHTML);
        // Date line(s)
        const dateHTML = endStr
            ? `<span>${startStr}</span>
         <span style="opacity:.7;margin:0 3px;">→</span>
         <span>${endStr}</span>`
            : `<span>${startStr}</span>`;

        return `
      <div class="fg-vis-tooltip" style="
            display:flex; flex-direction:column; gap:4px;
            min-width:180px; max-width:260px;
            background:#1e1e2e; color:#cdd6f4;
            border:2px solid ${border};
            border-radius:6px; padding:8px;
            font-size:12px; line-height:1.4;
            box-shadow:0 4px 12px rgba(0,0,0,.5);">

        <div style="display:flex; gap:8px; align-items:flex-start;">
          ${imgHTML}
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between;
                        align-items:center; gap:6px; margin-bottom:3px;">
              <strong style="
                    white-space:nowrap; overflow:hidden;
                    text-overflow:ellipsis; font-size:13px;
                    color:#cdd6f4;">
                ${item.title || item.id}
              </strong>
              <span style="
                    font-size:10px; font-weight:600;
                    background:${fill}; color:${this._typeTextColor(item.entityType)};
                    border-radius:3px; padding:1px 5px;
                    white-space:nowrap; flex-shrink:0;">
                ${typeLabel}
              </span>
            </div>
            <div style="display:flex; align-items:center; flex-wrap:wrap;
                        gap:2px; color:#a6adc8; font-size:11px;">
              ${dateHTML}
            </div>
          </div>
        </div>
      </div>`;
    }

    /**
     * Background fill colour per entity type.
     * Colours are chosen to be visually distinct, accessible against both
     * light and dark backgrounds, and semantically suggestive:
     *   Actor            – blue   (characters, people)
     *   Scene            – teal   (locations, places)
     *   Item             – amber  (objects, things)
     *   JournalEntry     – violet (lore, notes)
     *   JournalEntryPage – pink   (specific pages / fragments)
     *   RollTable        – orange (random events)
     *   Macro            – grey   (scripted events)
     */
    _typeColor(type) {
        const map = {
            Actor: "#3b82f6",   // blue-500
            Scene: "#10b981",   // emerald-500
            Item: "#f59e0b",   // amber-500
            JournalEntry: "#8b5cf6",   // violet-500
            JournalEntryPage: "#ec4899",   // pink-500
            RollTable: "#f97316",   // orange-500
            Macro: "#6b7280",   // grey-500
        };
        return map[type] ?? "#94a3b8";   // slate-400 fallback
    }

    /**
     * Border colour — a darker shade of the fill for visual depth.
     * We darken by blending toward black at ~40%.
     */
    _typeBorderColor(type) {
        const map = {
            Actor: "#1d4ed8",   // blue-700
            Scene: "#047857",   // emerald-700
            Item: "#b45309",   // amber-700
            JournalEntry: "#6d28d9",   // violet-700
            JournalEntryPage: "#be185d",   // pink-700
            RollTable: "#c2410c",   // orange-700
            Macro: "#374151",   // grey-700
        };
        return map[type] ?? "#475569";   // slate-600 fallback
    }

    /**
     * Text colour to use on top of the item fill.
     * Most fills are dark enough that white is legible; amber is an exception.
     */
    _typeTextColor(type) {
        return type === "Item" ? "#1c1917" : "#ffffff";
    }

    // --------------------------------------------------------------------------
    // Internal helpers – window / options
    // --------------------------------------------------------------------------

    /**
     * Determine the initial visible window (ms epoch) for vis.js.
     * Priority: persisted windowStart/windowEnd → auto-fit from items.
     */
    _resolveWindow(visItems) {
        const storedStart = secToMs(this.graph.data.windowStart);
        const storedEnd = secToMs(this.graph.data.windowEnd);

        if (storedStart !== null && storedEnd !== null) {
            return { windowStart: new Date(storedStart), windowEnd: new Date(storedEnd) };
        }

        // Auto-fit: find the span of all items, add 5% padding on each side
        if (visItems.length === 0) {
            // No items yet: show a window centred on "now" (in worldTime ms)
            const nowMs = (game?.time?.worldTime ?? 0) * 1000;
            const span = 7 * 24 * 3600 * 1000; // 1 week in ms as a sensible default
            return { windowStart: new Date(nowMs - span / 2), windowEnd: new Date(nowMs + span / 2) };
        }

        let minMs = Infinity, maxMs = -Infinity;
        for (const it of visItems) {
            const s = it.start instanceof Date ? it.start.valueOf() : Number(it.start);
            const e = it.end instanceof Date ? it.end.valueOf() : (it.end != null ? Number(it.end) : s);
            if (s < minMs) minMs = s;
            if (e > maxMs) maxMs = e;
        }
        const pad = Math.max(3600 * 1000, (maxMs - minMs) * 0.05); // ≥1h or 5%
        return { windowStart: new Date(minMs - pad), windowEnd: new Date(maxMs + pad) };
    }

    /**
     * Build the complete vis.js Timeline options object.
     * The most important parts for our use-case:
     *   - `timeAxis.format` → custom calendar labels
     *   - `locale` / `moment` → we bypass both with our own format fn
     *   - `stack` → true so overlapping items in the same lane don't collide
     *   - `selectable` → false (we use right-click radial menus instead)
     *   - `editable` → partial (allow moving start/end via drag inside vis)
     */
    _buildVisOptions(windowStart, windowEnd) {
        const axisFormat = buildVisAxisFormat();

        return {
            // ---- Viewport --------------------------------------------------------
            start: windowStart,
            end: windowEnd,

            // ---- Axis labels (custom calendar) -----------------------------------
            // vis.js `format` option accepts function maps per scale.
            // We provide both minor (dense ticks) and major (header row) labels.
            format: axisFormat,

            // Axis labels are handled via the moment monkey-patch (installMomentPatch).

            // ---- Layout ----------------------------------------------------------
            orientation: { axis: "top" },  // axis at the top, groups below
            stack: true,             // stack overlapping items within a group
            groupOrder: "content",        // sort groups alphabetically by label

            // ---- Interaction -----------------------------------------------------
            selectable: true,
            multiselect: false,
            moveable: true,
            zoomable: true,

            // Allow dragging items to change their time position and lane.
            // Changes are committed via the `itemMove` / `itemMoving` events below.
            editable: {
                add: false,  // we use DnD from the Foundry sidebar instead
                updateTime: true,
                updateGroup: true,
                remove: false,  // we use the radial menu delete action
                overrideItems: false,
            },

            // Called when the user finishes dragging an item; we commit the new
            // start/end back into graph.data and trigger a save.
            onMove: (item, callback) => {
                this._onVisItemMove(item, callback);
            },

            // ---- Appearance ------------------------------------------------------
            tooltip: {
                followMouse: true,
                overflowMethod: "cap",
                // template is called on hover with the vis DataSet item.
                // vis.js strips unknown fields from DataSet items, so we look up our
                // stored item by id from graph.data.items — img and all fields intact.
                template: (visItem, _element, _data) => {
                    const raw = this.graph?.data?.items?.find(i => i.id === visItem?.id);
                    if (!raw) return "";
                    return this._buildTooltipHTML(raw);
                },
            },
            xss: {
                filterOptions: {
                    allowList: {
                        img: ['src', 'style'],
                        span: ['style'],
                        div: ['style'],
                        strong: ['style'],
                    },
                },
            },
            // Height: fill the container div (which itself fills #d3-graph-container)
            height: "100%",

            // Snap dragged items to the nearest calendar unit.
            // We use null to keep free-form dragging; change to a snap function
            // once the calendar integration is more mature.
            snap: null,

            // Increase the minimum zoom interval so users don't accidentally zoom
            // into sub-second territory on fantasy calendars.
            zoomMin: 60 * 1000,  // 1 minute (ms) minimum visible window
        };
    }

    // --------------------------------------------------------------------------
    // vis.js event handlers
    // --------------------------------------------------------------------------

    _attachVisEvents() {
        if (!this._timeline) return;

        // Persist the viewport window whenever the user pans or zooms
        this._timeline.on("rangechanged", (props) => {
            if (!this.graph?.data) return;
            this.graph.data.windowStart = msToSec(props.start.valueOf());
            this.graph.data.windowEnd = msToSec(props.end.valueOf());
            // Note: we do NOT call save here – the next explicit save (e.g. closing
            // the graph app) will persist it.  Calling save on every pan would be
            // too expensive.
        });

        // Right-click → radial menu (mirrors existing timeline renderer)
        this._timeline.on("contextmenu", (props) => {
            if (!props.item) return;
            props.event.preventDefault();
            props.event.stopPropagation();
            const item = this.graph.data.items.find(i => i.id === props.item);
            if (item) this._onRightClickItem(props.event, item);
        });

        // Double-click on item → open the document sheet
        this._timeline.on("doubleClick", (props) => {
            if (!props.item) return;
            const item = this.graph.data.items.find(i => i.id === props.item);
            if (item) this._openDocumentSheet(item);
        });

    }

    /**
     * Called by vis.js after the user drags an item to a new position.
     * `item` contains the new `start`, `end`, and `group` values in ms/Date.
     * We convert back to seconds and update graph.data.
     */
    async _onVisItemMove(visItem, callback) {
        const stored = this.graph.data.items.find(i => i.id === visItem.id);
        if (!stored) { callback(null); return; }  // reject unknown item

        const newStartSec = msToSec(
            visItem.start instanceof Date ? visItem.start.valueOf() : Number(visItem.start)
        );
        const newEndSec = visItem.end != null
            ? msToSec(visItem.end instanceof Date ? visItem.end.valueOf() : Number(visItem.end))
            : null;

        stored.start = newStartSec;
        stored.end = newEndSec;
        if (visItem.group) stored.group = visItem.group;

        // Persist the new dates to the underlying Foundry document flags
        try {
            const doc = await fromUuid(stored.uuid);
            if (doc) {
                await doc.setFlag(MODULE_ID, "start-date", newStartSec);
                if (newEndSec !== null) await doc.setFlag(MODULE_ID, "end-date", newEndSec);
                else await doc.unsetFlag(MODULE_ID, "end-date");
            }
        } catch (e) {
            log("VisTimelineRenderer: failed to update document flags after drag", e);
        }

        callback(visItem);  // accept the move in vis.js
    }

    // --------------------------------------------------------------------------
    // Right-click radial menu
    // --------------------------------------------------------------------------

    async _onRightClickItem(event, item) {
        const label = item?.title || item?.uuid || item?.id || "item";
        this._showRadialMenu({
            clientX: event.clientX,
            clientY: event.clientY,
            items: [
                {
                    id: "openSheet",
                    label: `Open (${label})`,
                    icon: "fa-solid fa-up-right-from-square",
                    onClick: () => this._openDocumentSheet(item),
                },
                {
                    id: "editDates",
                    label: `Edit Dates (${label})`,
                    icon: "fa-solid fa-calendar-days",
                    onClick: () => this._showEditDatesDialog(item),
                },
                {
                    id: "delete",
                    label: `Delete (${label})`,
                    icon: "fa-solid fa-trash",
                    onClick: async () => {
                        const confirmed = await DialogV2.confirm({
                            content: `Delete timeline item "${label}"?`,
                        });
                        if (!confirmed) return;
                        this.graph.data.items = this.graph.data.items.filter(i => i.id !== item.id);
                        await this.render(d3.select(this._svgEl), this.graph);
                    },
                },
            ],
        });
    }

    async _openDocumentSheet(item) {
        try {
            const doc = await fromUuid(item.uuid);
            if (doc?.sheet) doc.sheet.render(true);
            else ui.notifications.warn("No sheet available for this document.");
        } catch (e) {
            log("VisTimelineRenderer: failed to open sheet", e);
        }
    }

    // --------------------------------------------------------------------------
    // Edit Dates dialog (reuses the same calendar-datetime partial as before)
    // --------------------------------------------------------------------------

    async _showEditDatesDialog(item) {
        const doc = await fromUuid(item.uuid);
        if (!doc) { ui.notifications.error("Could not resolve document."); return; }

        const currentStartSec = doc.getFlag?.(MODULE_ID, "start-date") ?? item.start;
        const currentEndSec = doc.getFlag?.(MODULE_ID, "end-date") ?? item.end;

        const [startTemplate, endTemplate] = await Promise.all([
            renderTemplate("modules/foundry-graph/templates/partials/calendar-datetime.hbs", {
                name: "start-date",
                label: game.i18n.localize("foundry-graph.GraphPage.start_date") || "Start Date",
                value: currentStartSec != null ? String(currentStartSec) : "",
                required: true,
            }),
            renderTemplate("modules/foundry-graph/templates/partials/calendar-datetime.hbs", {
                name: "end-date",
                label: game.i18n.localize("foundry-graph.GraphPage.end_date") || "End Date",
                value: currentEndSec != null ? String(currentEndSec) : "",
                required: false,
            }),
        ]);

        await DialogV2.wait({
            window: { title: `Edit Dates: ${item.title}`, resizable: true },
            content: `
        <form class="timeline-edit-dates-form">
          <p class="notes" style="margin-bottom:1em;">
            Edit the start and end dates for this timeline item.
          </p>
          ${startTemplate}
          ${endTemplate}
        </form>
      `,
            buttons: [
                {
                    action: "save",
                    label: "Save",
                    icon: "fa-solid fa-save",
                    callback: (_ev, _btn, dialog) => {
                        const form = dialog.element.querySelector("form");
                        const formData = new FormData(form);
                        const startVal = formData.get("start-date");
                        const endVal = formData.get("end-date");
                        if (!startVal) { ui.notifications.warn("Start date is required."); return false; }
                        return {
                            startSec: Number(startVal),
                            endSec: endVal ? Number(endVal) : null,
                        };
                    },
                },
                { action: "cancel", label: "Cancel", icon: "fa-solid fa-times" },
            ],
            submit: async (result) => {
                if (result?.startSec == null) return;  // cancelled
                try {
                    await doc.setFlag(MODULE_ID, "start-date", result.startSec);
                    if (result.endSec !== null) await doc.setFlag(MODULE_ID, "end-date", result.endSec);
                    else await doc.unsetFlag(MODULE_ID, "end-date");

                    const stored = this.graph.data.items.find(i => i.id === item.id);
                    if (stored) {
                        stored.start = result.startSec;
                        stored.end = result.endSec;
                        stored.title = doc.name;
                    }

                    await this.render(d3.select(this._svgEl), this.graph);
                    ui.notifications.info(`Dates updated for "${item.title}"`);
                } catch (e) {
                    log("VisTimelineRenderer: failed to update dates", e);
                    ui.notifications.error("Failed to update dates. See console for details.");
                }
            },
            render: async (_ev, dialog) => {
                FGCalendarDateTimePopover.enhance(dialog.element);
            },
        });
    }

    // --------------------------------------------------------------------------
    // Drag-and-drop  (Foundry sidebar → timeline)
    // --------------------------------------------------------------------------

    // --------------------------------------------------------------------------
    // Native drag-and-drop registration (overrides BaseRenderer D3 approach)
    // --------------------------------------------------------------------------

    /**
     * Register native dragover + drop listeners directly on the container div.
     * Native listeners are needed so that:
     *  - getEventProperties(event) receives the original DragEvent (not a D3 wrap).
     *  - Events are not swallowed by vis.js's internal pointer capture.
     * Stored on this._nativeDnd so _detachNativeDropHandlers() can remove them.
     */
    _attachNativeDropHandlers(el) {
        this._detachNativeDropHandlers();
        this._nativeDnd = {
            onDragOver: (ev) => { ev.preventDefault(); ev.stopPropagation(); },
            onDrop: this._onDrop.bind(this),
        };
        el.addEventListener("dragover", this._nativeDnd.onDragOver);
        el.addEventListener("drop", this._nativeDnd.onDrop);
    }

    _detachNativeDropHandlers() {
        if (!this._nativeDnd || !this._container) return;
        this._container.removeEventListener("dragover", this._nativeDnd.onDragOver);
        this._container.removeEventListener("drop", this._nativeDnd.onDrop);
        this._nativeDnd = null;
    }

    /**
     * Handle a Foundry document drop onto the timeline.
     *
     * NORMAL DROP  → places a "point" item at the cursor's axis position.
     *                The item can be moved freely with vis.js's built-in drag.
     *
     * ALT + DROP   → places a "range" item.  A sensible default duration
     *                (DEFAULT_RANGE_SEC) is applied immediately so vis.js
     *                renders the item with its native left- and right-edge
     *                resize handles, letting the user drag the end position
     *                without any custom gesture code.
     *
     * In both cases the resolved start (and end, for ranges) is written to the
     * document flag so it persists and is visible to other renderers.
     * Re-dropping an already-placed document updates its position and lane.
     */
    async _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();

        const data = TextEditor.getDragEventData(event);
        log("VisTimelineRenderer._onDrop", data);

        // Check entity type is allowed
        const allowed = this.graph?.allowedEntities;
        if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(data.type)) {
            ui.notifications.warn(`You cannot add a ${data.type} to this timeline.`);
            return;
        }

        const doc = await fromUuid(data.uuid);
        if (!doc) { ui.notifications.warn("Could not resolve dropped document."); return; }

        // --- Resolve start time and lane from drop position --------------------
        let dropTimeSec = null;
        let groupId = this.graph.relations?.[0]?.id ?? "lane-default";

        if (this._timeline) {
            try {
                const props = this._timeline.getEventProperties(event);
                if (props.time instanceof Date && Number.isFinite(props.time.valueOf())) {
                    dropTimeSec = msToSec(props.time.valueOf());
                }
                if (props.group != null) groupId = props.group;
            } catch (e) {
                log("VisTimelineRenderer._onDrop: getEventProperties failed", e);
            }
        }

        // Fallback if drop landed on the group-label column (outside the axis)
        if (dropTimeSec === null) {
            dropTimeSec = doc.getFlag?.(MODULE_ID, "start-date") ?? game.time.worldTime;
        }

        const colorOverride = doc.getFlag?.(MODULE_ID, "color") ?? null;
        const isRange = event.altKey;

        // For Alt+drop: apply a default duration so vis.js renders resize handles.
        // The user can immediately drag the right handle to the exact end they want.
        const endSec = isRange
            ? dropTimeSec + VisTimelineRenderer.DEFAULT_RANGE_SEC
            : null;

        // Persist start (and end for ranges) to document flags
        try {
            await doc.setFlag(MODULE_ID, "start-date", dropTimeSec);
            if (endSec !== null) await doc.setFlag(MODULE_ID, "end-date", endSec);
        } catch (e) {
            log("VisTimelineRenderer._onDrop: could not set date flags", e);
        }

        // Resolve the portrait/image for the tooltip.
        // Actor and Item have .img; Scene has .background.src or .thumb;
        // JournalEntryPage has .src (image pages) or no image.
        // We store it on the item so the tooltip never needs an async lookup.
        const img = doc.img
            ?? doc.src
            ?? doc.background?.src
            ?? doc.thumb
            ?? null;

        const item = {
            id: `tl-${foundry.utils.randomID(8)}`,
            uuid: data.uuid,
            title: doc.name || data.uuid,
            entityType: data.type,
            group: groupId,
            start: dropTimeSec,
            end: endSec,
            color: colorOverride,
            img,                          // portrait/icon for tooltip
        };
        console.log("Constructed timeline item from drop:", item, img);
        // Upsert: re-dropping the same document updates position and lane
        const existing = this.graph.data.items.find(i => i.uuid === item.uuid);
        if (existing) {
            Object.assign(existing, { ...item, id: existing.id });
        } else {
            this.graph.data.items.push(item);
        }

        await this.render(d3.select(this._svgEl), this.graph);

        if (isRange) {
            ui.notifications.info(
                game.i18n.localize("foundry-graph.Timeline.RangeDropHint")
                ?? "Range item placed — drag the right edge to set the end date."
            );
        }
    }

    // --------------------------------------------------------------------------
    // Zoom / pan helpers (called by D3GraphApp toolbar buttons)
    // --------------------------------------------------------------------------

    zoomIn(factor = 1.2) {
        if (!this._timeline) return;
        const w = this._timeline.getWindow();
        const mid = (w.start.valueOf() + w.end.valueOf()) / 2;
        const half = (w.end.valueOf() - w.start.valueOf()) / 2 / factor;
        this._timeline.setWindow(new Date(mid - half), new Date(mid + half), { animation: true });
    }

    zoomOut(factor = 1.2) {
        if (!this._timeline) return;
        const w = this._timeline.getWindow();
        const mid = (w.start.valueOf() + w.end.valueOf()) / 2;
        const half = (w.end.valueOf() - w.start.valueOf()) / 2 * factor;
        this._timeline.setWindow(new Date(mid - half), new Date(mid + half), { animation: true });
    }

    resetZoom() {
        if (!this._timeline) return;
        this._timeline.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
    }

    fitToViewport() {
        this.resetZoom();
    }

    // --------------------------------------------------------------------------
    // PNG Export
    // --------------------------------------------------------------------------

    /**
     * Export the current timeline view as a PNG file.
     *
     * Strategy: the foreignObject/innerHTML approach always taints the canvas
     * in Foundry's browser environment because stylesheets and assets are loaded
     * from paths the browser considers cross-origin relative to a blob: URL.
     *
     * Instead we render the timeline directly onto a <canvas> using the 2D API:
     *   1. Read the bounding rects of vis.js DOM elements (axis, group labels,
     *      item boxes) from the live DOM — no serialisation, no taint.
     *   2. Draw backgrounds, borders, text and (optionally) portrait images
     *      using ctx.drawImage() with per-image taint detection.
     *
     * This produces a faithful, always-exportable screenshot of the visible
     * timeline window.
     *
     * @param {{ scale?: number }} [options]
     */
    async exportToPNG({ scale = 3 } = {}) {
        if (!this._container || !this._timeline) {
            ui?.notifications?.warn?.("Timeline is not ready for export yet.");
            return;
        }

        const _root = document.body;
        const _prevCursor = _root.style.cursor;
        _root.style.cursor = "progress";
        ui?.notifications?.info?.(t("Notifications.ExportPrepare") ?? "Preparing export…");

        try {
            const pixelRatio = Math.max(1, Number(scale) || 2);
            const containerRect = this._container.getBoundingClientRect();
            const W = Math.max(1, Math.round(containerRect.width));
            const H = Math.max(1, Math.round(containerRect.height));

            const canvas = document.createElement("canvas");
            canvas.width  = Math.round(W * pixelRatio);
            canvas.height = Math.round(H * pixelRatio);
            const ctx = canvas.getContext("2d");
            ctx.scale(pixelRatio, pixelRatio);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            // Helper: translate a viewport rect to canvas-local coords
            const toLocal = (domRect) => ({
                x: domRect.left - containerRect.left,
                y: domRect.top  - containerRect.top,
                w: domRect.width,
                h: domRect.height,
            });

            // Helper: clamp a local rect to the canvas area
            const clip = (r) => ({
                x: Math.max(0, r.x),
                y: Math.max(0, r.y),
                w: Math.min(W - Math.max(0, r.x), r.w),
                h: Math.min(H - Math.max(0, r.y), r.h),
            });

            // ── 1. Background ──────────────────────────────────────────────────
            ctx.fillStyle = "#1a1a2e";
            ctx.fillRect(0, 0, W, H);

            // ── 2. Paint every visible DOM element by class ───────────────────
            //
            // We read computed styles from the live DOM so colours / borders are
            // accurate without needing to parse any CSS ourselves.

            const paintEl = (el, { fillOverride, strokeOverride, textOverride, radius = 2 } = {}) => {
                const cs   = getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                const r    = clip(toLocal(rect));
                if (r.w <= 0 || r.h <= 0) return;

                // Fill
                const fill = fillOverride ?? cs.backgroundColor;
                if (fill && fill !== "rgba(0, 0, 0, 0)" && fill !== "transparent") {
                    ctx.fillStyle = fill;
                    if (radius > 0) {
                        ctx.beginPath();
                        ctx.roundRect?.(r.x, r.y, r.w, r.h, radius) ??
                            ctx.rect(r.x, r.y, r.w, r.h);
                        ctx.fill();
                    } else {
                        ctx.fillRect(r.x, r.y, r.w, r.h);
                    }
                }

                // Border
                const bw = parseFloat(cs.borderTopWidth) || 0;
                if (bw > 0) {
                    ctx.strokeStyle = strokeOverride ?? cs.borderTopColor ?? "#555";
                    ctx.lineWidth   = bw;
                    ctx.beginPath();
                    ctx.roundRect?.(r.x + bw / 2, r.y + bw / 2, r.w - bw, r.h - bw, radius) ??
                        ctx.rect(r.x + bw / 2, r.y + bw / 2, r.w - bw, r.h - bw);
                    ctx.stroke();
                }

                // Text
                const textEl = el.querySelector(".vis-item-content, .vis-group, .vis-label") ?? el;
                const text   = (textOverride ?? textEl.textContent ?? "").trim();
                if (text) {
                    const fs   = parseFloat(cs.fontSize) || 11;
                    ctx.fillStyle  = cs.color || "#cdd6f4";
                    ctx.font       = `${cs.fontWeight || "normal"} ${fs}px ${cs.fontFamily || "sans-serif"}`;
                    ctx.textBaseline = "middle";
                    ctx.save();
                    ctx.rect(r.x + 2, r.y, Math.max(0, r.w - 4), r.h);
                    ctx.clip();
                    ctx.fillText(text, r.x + 4, r.y + r.h / 2);
                    ctx.restore();
                }
            };

            // ── 3. Axis / header rows ──────────────────────────────────────────
            for (const el of this._container.querySelectorAll(".vis-time-axis .vis-panel, .vis-time-axis")) {
                paintEl(el, { radius: 0, fillOverride: "#12121e" });
            }
            for (const el of this._container.querySelectorAll(".vis-time-axis .vis-text")) {
                const r = clip(toLocal(el.getBoundingClientRect()));
                if (r.w <= 0 || r.h <= 0) continue;
                const cs = getComputedStyle(el);
                ctx.fillStyle = cs.color || "#888";
                ctx.font = `${parseFloat(cs.fontSize) || 10}px ${cs.fontFamily || "sans-serif"}`;
                ctx.textBaseline = "middle";
                ctx.fillText(el.textContent.trim(), r.x + 2, r.y + r.h / 2);
            }

            // ── 4. Group label column ──────────────────────────────────────────
            for (const el of this._container.querySelectorAll(".vis-labelset .vis-label")) {
                paintEl(el, { radius: 0, fillOverride: "#1e1e30" });
            }

            // ── 5. Item rows (background stripes) ─────────────────────────────
            for (const el of this._container.querySelectorAll(".vis-background .vis-group")) {
                paintEl(el, { radius: 0, fillOverride: "#16162a" });
            }

            // ── 6. Timeline items ─────────────────────────────────────────────
            for (const el of this._container.querySelectorAll(".vis-item")) {
                paintEl(el, { radius: 3 });
            }

            // ── 7. Gridlines (minor) ───────────────────────────────────────────
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.06)";
            ctx.lineWidth   = 1;
            for (const el of this._container.querySelectorAll(".vis-time-axis .vis-grid.vis-minor")) {
                const r = toLocal(el.getBoundingClientRect());
                if (r.x < 0 || r.x > W) continue;
                ctx.beginPath();
                ctx.moveTo(Math.round(r.x) + 0.5, 0);
                ctx.lineTo(Math.round(r.x) + 0.5, H);
                ctx.stroke();
            }
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            for (const el of this._container.querySelectorAll(".vis-time-axis .vis-grid.vis-major")) {
                const r = toLocal(el.getBoundingClientRect());
                if (r.x < 0 || r.x > W) continue;
                ctx.beginPath();
                ctx.moveTo(Math.round(r.x) + 0.5, 0);
                ctx.lineTo(Math.round(r.x) + 0.5, H);
                ctx.stroke();
            }
            ctx.restore();

            // ── 8. Portrait images (best-effort, never taints) ────────────────
            //   We draw each <img> inside a vis item.  If the image is cross-origin
            //   and drawing it would taint the canvas we catch that and move on.
            const imagePromises = [];
            for (const imgEl of this._container.querySelectorAll(".vis-item img")) {
                const src = imgEl.getAttribute("src");
                if (!src) continue;
                const imgRect = clip(toLocal(imgEl.getBoundingClientRect()));
                if (imgRect.w <= 0 || imgRect.h <= 0) continue;

                imagePromises.push((async () => {
                    try {
                        const probe = new Image();
                        probe.decoding = "async";
                        await new Promise((res, rej) => {
                            probe.onload  = res;
                            probe.onerror = rej;
                            probe.src = src;
                        });
                        // Test for taint with a throwaway canvas before drawing on ours
                        const test = document.createElement("canvas");
                        test.width = 1; test.height = 1;
                        test.getContext("2d").drawImage(probe, 0, 0, 1, 1);
                        test.toDataURL();           // throws SecurityError if tainted

                        ctx.save();
                        ctx.beginPath();
                        ctx.roundRect?.(imgRect.x, imgRect.y, imgRect.w, imgRect.h, 3) ??
                            ctx.rect(imgRect.x, imgRect.y, imgRect.w, imgRect.h);
                        ctx.clip();
                        ctx.drawImage(probe, imgRect.x, imgRect.y, imgRect.w, imgRect.h);
                        ctx.restore();
                    } catch (_) {
                        // Cross-origin or broken — skip silently, item text still visible
                    }
                })());
            }
            await Promise.all(imagePromises);

            // ── 9. Download ───────────────────────────────────────────────────
            const safeName = String(this.graph?.name ?? "timeline")
                .trim().replace(/[^\w.-]+/g, "_");
            const a = document.createElement("a");
            a.download = `${safeName}.png`;
            a.href = canvas.toDataURL("image/png");
            a.click();

        } catch (err) {
            log("VisTimelineRenderer.exportToPNG failed", err);
            ui?.notifications?.error?.(t("Errors.ExportFailed") ?? "Export failed — see console.");
        } finally {
            _root.style.cursor = _prevCursor || "";
            ui?.notifications?.info?.(t("Notifications.ExportFinished") ?? "Export complete.");
        }
    }
}