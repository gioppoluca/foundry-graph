import { MODULE_ID, log, t } from "../constants.js";
import { BaseRenderer } from "./base-renderer.js";
import { FGCalendarDateTimePopover } from "../ui/calendar-datetime-popover.js";
const { DialogV2 } = foundry.applications.api;

/**
 * Timeline renderer (mock / MVP)
 *
 * - Lanes are taken from graph.relations (order = lanes order)
 * - Items are stored in graph.data.items
 * - Drag & drop JournalEntryPage (and other allowed entities) onto a lane to create an item
 */
export class TimelineRenderer extends BaseRenderer {
  static ID = "timeline";

  // === Visual tuning knobs (MVP) ===
  // Marker size for timeline items.
  // Keep this small; the label carries most of the info.
  static ITEM_MARKER_RADIUS = 5;

  // Marker shape: "circle" (default) or "triangle".
  // A downward-pointing triangle can read better as a "time pointer".
  static ITEM_MARKER_SHAPE = "circle";

  constructor() {
    super();
    this.graph = null;
    this._svg = null;
    this._root = null;
    this._laneWidth = 180; // left label area
    this._margin = { top: 30, right: 20, bottom: 30, left: 10 };
    
    // Zoom and pan state
    this._zoom = null;
    this._container = null;

    // Distinct colors by dropped document type (Foundry drag payload "type").
    // You can tune these later or move them into a user setting.
    this._typeColors = {
      Actor: "#60a5fa",
      Scene: "#34d399",
      Item: "#fbbf24",
      JournalEntry: "#a78bfa",
      JournalEntryPage: "#f472b6",
      default: "#e5e7eb"
    };
  }

  initializeGraphData() {
    return {
      items: [],   // [{id, uuid, title, laneId, start, end}]
      extent: null // [isoStart, isoEnd] optional fixed extent
    };
  }


  get isLinkNodesVisible() {
    // Return false to hide the button because we now use Shift+Drag
    // Return true if you want to keep the button as an alternative
    return false;
  }

  get isRelationSelectVisible() {
    // Return false to hide the button because we now use Shift+Drag
    // Return true if you want to keep the button as an alternative
    return false;
  }

  static hasEntity(graphData, uuid) {
    return !!graphData?.items?.some(i => i.uuid === uuid);
  }

  static removeEntity(graphData, uuid) {
    if (!graphData?.items) return graphData;
    graphData.items = graphData.items.filter(i => i.uuid !== uuid);
    return graphData;
  }

  setRelationData(_relation) {
    // not used (lanes are all relations)
  }

  getGraphData() {
    return this.graph?.data;
  }

  teardown() {
    try {
      if (this._svg) {
        this._detachDropHandlers(this._svg.node());
        // Remove zoom behavior
        if (this._zoom) {
          this._svg.on('.zoom', null);
        }
      }
    } catch (e) { /* ignore */ }
    this._svg = null;
    this._root = null;
    this._zoom = null;
    this._container = null;
  }

  _ensureGraph(graph) {
    this.graph = graph;
    if (!this.graph.data) this.graph.data = this.initializeGraphData();
    if (!Array.isArray(this.graph.data.items)) this.graph.data.items = [];
    if (!Array.isArray(this.graph.relations)) this.graph.relations = [];
    if (this.graph.relations.length === 0) {
      // fallback lane
      this.graph.relations.push({
        id: "lane-default",
        label: t?.("Timeline.DefaultLane") ?? "Default",
        color: "#2b2b2b",
        style: "solid",
        strokeWidth: 2,
        noArrow: true
      });
    }
  }

  _normalizeDate(d) {
    // Normalize into a TIMESTAMP (ms).
    // Accept Date, number(ms), iso string
    if (d === null || d === undefined || d === "") return null;
    if (typeof d === "number") return Number.isFinite(d) ? d : null;
    if (d instanceof Date) {
      const ts = d.getTime();
      return Number.isFinite(ts) ? ts : null;
    }
    const dd = new Date(d);
    const ts = dd.getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  _defaultStartEnd() {
    const now = new Date();
    const start = now.getTime();
    //const end = now.getTime() + 60 * 60 * 1000; // +1h
    const end = null
    return [start, end];
  }

  _computeExtent(items, fixedExtent, widthPx) {
    let minTs = null;
    let maxTs = null;

    if (Array.isArray(fixedExtent) && fixedExtent.length === 2) {
      //      minTs = this._normalizeDate(fixedExtent[0]);
      //      maxTs = this._normalizeDate(fixedExtent[1]);
      minTs = (fixedExtent[0]);
      maxTs = (fixedExtent[1]);
    } else {
      for (const it of items) {
        //        const sTs = this._normalizeDate(it.start);
        //        const eTs = this._normalizeDate(it.end);
        const sTs = (it.start);
        const eTs = (it.end);
        if (sTs !== null && (minTs === null || sTs < minTs)) minTs = sTs;
        const candidateMax = (eTs !== null ? eTs : sTs);
        if (candidateMax !== null && (maxTs === null || candidateMax > maxTs)) maxTs = candidateMax;
      }
    }

    if (minTs === null || maxTs === null || minTs === maxTs) {
      const [s, e] = this._defaultStartEnd();
      minTs = (minTs ?? s);
      maxTs = (maxTs ?? e);
      if (minTs === maxTs) maxTs = minTs + 60 * 60 * 1000;
    }

    // Add padding so items aren't glued to the borders
    const span = Math.max(1, maxTs - minTs);
    const pad = Math.max(60_000, Math.floor(span * 0.05)); // >= 1 minute or 5%
    minTs -= pad;
    maxTs += pad;

    // Use a linear scale on timestamps (ms) so later you can swap calendar formatting freely
    const x = d3.scaleLinear().domain([minTs, maxTs]).range([0, widthPx]);
    return { minTs, maxTs, x };
  }

  /**
   * Axis tick formatter: timestamps -> string.
   * Keep conversion isolated so later you can plug a fantasy calendar formatter.
   */
  _formatAxisTick(ts) {
    console.log("TimelineRenderer._formatAxisTick ts", ts);
    console.log("game.time.calendar", game.time.calendar.format(ts));
    try {
      //      return d3.timeFormat("%Y-%m-%d")(new Date(ts));
      return game.time.calendar.format(ts);
    } catch (e) {
      return String(ts);
    }
  }

  _getTypeColor(type) {
    return this._typeColors?.[type] ?? this._typeColors?.default ?? "#e5e7eb";
  }

  /**
   * Zoom in by a factor
   * @param {number} factor - Zoom factor (default 1.2)
   */
  zoomIn(factor = 1.2) {
    if (!this._svg || !this._zoom) return;
    this._svg.transition().duration(300).call(this._zoom.scaleBy, factor);
  }

  /**
   * Zoom out by a factor
   * @param {number} factor - Zoom factor (default 1.2)
   */
  zoomOut(factor = 1.2) {
    if (!this._svg || !this._zoom) return;
    this._svg.transition().duration(300).call(this._zoom.scaleBy, 1 / factor);
  }

  /**
   * Reset zoom to default (1:1)
   */
  resetZoom() {
    if (!this._svg || !this._zoom) return;
    this._svg.transition().duration(500).call(this._zoom.transform, d3.zoomIdentity);
  }

  /**
   * Fit content to viewport
   */
  fitToViewport() {
    if (!this._svg || !this._zoom || !this.graph) return;
    const svgNode = this._svg.node();
    const parentNode = svgNode.parentNode;
    const parentRect = parentNode.getBoundingClientRect();
    const viewportWidth = parentRect.width || 800;
    const viewportHeight = parentRect.height || 600;
    
    const bgW = Number.isFinite(this.graph?.background?.width) ? this.graph.background.width : (this.graph.width || 800);
    const bgH = Number.isFinite(this.graph?.background?.height) ? this.graph.background.height : (this.graph.height || 600);
    
    // Calculate scale to fit the background into the viewport
    const scale = Math.min(viewportWidth / bgW, viewportHeight / bgH, 1);
    
    const transform = d3.zoomIdentity.scale(scale);
    this._svg.transition().duration(500).call(this._zoom.transform, transform);
  }

  async render(svg, graph, ctx) {
    this._ensureGraph(graph);

    // svg is a d3 selection in this module
    this._svg = svg;
    const svgNode = svg.node();
    const el = svgNode;
    if (!el) return;

    // attach DnD just once
    this._detachDropHandlers(el);
    this._attachDropHandlers(el);
    d3.select(svg.node().parentNode).classed("timeline-active", true);
    /*
    const width = graph.width || 800;
    const height = graph.height || 600;

    // reset
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();
    */
    const bgImage = graph?.background?.image;
    const bgW = Number.isFinite(graph?.background?.width) ? graph.background.width : (graph.width || 800);
    const bgH = Number.isFinite(graph?.background?.height) ? graph.background.height : (graph.height || 600);

    // Get the parent container
    const parentNode = svg.node().parentNode;

    // Set SVG to the full background image dimensions
    // This allows it to overflow the container naturally
    svg.style("width", null)
//      .style("height", null)
      .style("display", "block")
      .attr("width", bgW)
//      .attr("height", bgH)
      .attr("viewBox", `0 0 ${bgW} ${bgH}`);
    
    svg.selectAll("*").remove();

    // Create a container group for zoom/pan transformations
    this._container = svg.append("g").attr("class", "timeline-container");
    
    // Set up zoom behavior
    this._zoom = d3.zoom()
      .scaleExtent([0.1, 10])  // Allow zoom from 10% to 1000%
      .on("zoom", (event) => {
        this._container.attr("transform", event.transform);
      });
    
    // Apply zoom to svg
    svg.call(this._zoom);
    
    // Start with a fit-to-viewport initial transform if background is larger than default size
    const parentRect = parentNode.getBoundingClientRect();
    if (parentRect.width > 0 && parentRect.height > 0 && (bgW > parentRect.width || bgH > parentRect.height)) {
      const scale = Math.min(parentRect.width / bgW, parentRect.height / bgH, 1);
      svg.call(this._zoom.transform, d3.zoomIdentity.scale(scale));
    } else {
      svg.call(this._zoom.transform, d3.zoomIdentity);
    }

    // root group (now a child of container)
    this._root = this._container.append("g").attr("class", "timeline-root");

    // background
    // Keep consistent with other renderers: if a background image is configured, use it.
    //const bgImage = graph?.background?.image;
    //const bgW = Number.isFinite(graph?.background?.width) ? graph.background.width : width;
    //const bgH = Number.isFinite(graph?.background?.height) ? graph.background.height : height;

    if (bgImage) {
      this._root.append("image")
        .attr("xlink:href", bgImage)
        .attr("class", "timeline-bg-image")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", bgW)
        .attr("height", bgH)
        //        .attr("width", totalSvgWidth) // Use the full calculated width
        //        .attr("height", totalContentHeight)
        //.attr("preserveAspectRatio", "xMidYMid slice");
        .attr("preserveAspectRatio", "none");

      // Add a subtle veil so lane text stays readable on busy images.
      /*
      this._root.append("rect")
        .attr("x", 0).attr("y", 0)
        .attr("width", width).attr("height", height)
        .attr("fill", graph.color || "#111")
        .attr("opacity", 0.35);
        */
    } else {
      this._root.append("rect")
        .attr("x", 0).attr("y", 0)
        .attr("width", width).attr("height", height)
        .attr("fill", graph.color || "#111");
    }

    const lanes = graph.relations;
    const laneCount = Math.max(1, lanes.length);
    const laneTop = this._margin.top;
    // Reduce available height by 20px to leave dedicated room for the axis labels
    const axisSpace = 30;
    //const laneHeight = Math.max(24, Math.floor((height - this._margin.top - this._margin.bottom - axisSpace) / laneCount));
    const laneHeight = 45;
    const laneAreaHeight = laneHeight * laneCount;
    //const laneHeight = Math.max(24, Math.floor((height - this._margin.top - this._margin.bottom) / laneCount));
    //const laneAreaHeight = laneHeight * laneCount;
    // The final height is the lanes + margins + axis
    const totalContentHeight = Math.max(bgH, laneTop + laneAreaHeight + axisSpace + this._margin.bottom);

    // time scale
    /*
    const xAreaWidth = width - this._laneWidth - this._margin.left - this._margin.right;
    console.log("graph data:", this.graph.data);
    const { x } = this._computeExtent(this.graph.data.items, this.graph.data.extent, xAreaWidth);
    */
    // 1. Determine the time span to calculate dynamic width
    const extentData = this._computeExtent(this.graph.data.items, this.graph.data.extent, 100);
    const msSpan = extentData.maxTs - extentData.minTs;

    // 2. Define density: How many pixels per hour? 
    // This example uses roughly 200px per "standard unit" (e.g., a day or hour depending on scale)
    // Adjust 0.0000001 to fit your specific calendar's scale needs.
    const density = 0.0000001;
    const calculatedWidth = Math.max(bgW - this._laneWidth, msSpan * density);

    const xAreaWidth = calculatedWidth;
    const { x } = this._computeExtent(this.graph.data.items, this.graph.data.extent, xAreaWidth);

    // 3. Update SVG dimensions for the scrollable area
    //const totalSvgWidth = xAreaWidth + this._laneWidth + this._margin.left + this._margin.right;
    //svg.attr("width", totalSvgWidth);
    //svg.attr("viewBox", `0 0 ${totalSvgWidth} ${height}`);
    // Ensure the timeline is at least as wide as the background image
    const totalSvgWidth = Math.max(bgW, xAreaWidth + this._laneWidth + this._margin.left + this._margin.right);

    // Force the SVG to the full size of the background/content
    svg.style("width", `${totalSvgWidth}px`)
//      .style("height", `${totalContentHeight}px`)
      .attr("width", totalSvgWidth)
//      .attr("height", totalContentHeight)
      .attr("viewBox", `0 0 ${totalSvgWidth} ${totalContentHeight}`);

    // axis
    // Generate ticks and pre-format them if necessary
    const ticks = x.ticks(6);
    const tickLabels = await Promise.all(ticks.map(ts => this._formatAxisTick(ts)));

    // Create a mapping for the synchronous formatter
    const tickMap = new Map(ticks.map((ts, i) => [ts, tickLabels[i]]));

    const axis = d3.axisBottom(x)
      .tickValues(ticks)
      .tickFormat(ts => tickMap.get(ts) ?? String(ts));


    const axisG = this._root.append("g")
      .attr("class", "timeline-axis")
      .attr("transform", `translate(${this._laneWidth + this._margin.left},${laneTop + laneAreaHeight})`)
      .call(axis);
    //const axis = await d3.axisBottom(x).ticks(6).tickFormat(async ts => await this._formatAxisTick(ts));
    console.log("axis:", axis);
    // Style the axis to be visible
    const axisColor = "#000";
    //axisG.selectAll("text").attr("fill", axisColor);
    axisG.selectAll("line").attr("stroke", axisColor);
    axisG.selectAll("path.domain").attr("stroke", axisColor);
    axisG.selectAll("text")
      .attr("fill", axisColor)
      .attr("transform", "rotate(25)") // Slant down to the right
      .style("text-anchor", "start")   // Anchor at the start so they grow away from the tick
      .attr("x", 9)                    // Move slightly right of the tick
      .attr("y", 5)                  // Move slightly down from the tick
      .style("white-space", "nowrap");

    /*
    this._root.append("g")
      .attr("class", "timeline-axis")
      .attr("transform", `translate(${this._laneWidth + this._margin.left},${laneTop + laneAreaHeight})`)
      .call(axis);
*/
    // lanes
    const laneG = this._root.append("g").attr("class", "timeline-lanes");

    const laneSel = laneG.selectAll("g.lane")
      .data(lanes, d => d.id)
      .join("g")
      .attr("class", "lane")
      .attr("data-lane-id", d => d.id)
      .attr("transform", (d, i) => `translate(0, ${laneTop + i * laneHeight})`);

    /*
  laneSel.append("rect")
    .attr("class", "lane-bg")
    .attr("x", 0).attr("y", 0)
    .attr("width", width).attr("height", laneHeight)
    .attr("fill", (d, i) => (i % 2 === 0 ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.10)"));
    */
    // Lane veil: tint each lane using the lane/relation color.
    // We keep it subtle so the background image remains visible.
    // Slight alternation helps separate rows without changing the "lane identity".
    const laneVeilOpacity = 0.12;
    /*
    laneSel.append("rect")
      .attr("class", "lane-bg")
      .attr("x", 0).attr("y", 0)
      .attr("width", width).attr("height", laneHeight)
      .attr("fill", d => d.color || "rgba(0,0,0,0)")
      .attr("opacity", (d, i) => laneVeilOpacity + (i % 2 === 0 ? 0.03 : 0));
*/
    laneSel.append("rect")
      .attr("class", "lane-bg")
      .attr("x", 0).attr("y", 0)
      .attr("width", totalSvgWidth).attr("height", laneHeight)
      .attr("fill", d => d.color || "rgba(0,0,0,0)")
      .attr("opacity", (d, i) => laneVeilOpacity + (i % 2 === 0 ? 0.03 : 0));

    // Stronger veil only under the label column to preserve readability over busy images
    // (still per-lane; no global overlay)
    const labelVeilOpacity = 0.20;
    laneSel.append("rect")
      .attr("class", "lane-label-veil")
      .attr("x", 0).attr("y", 0)
      .attr("width", this._laneWidth + this._margin.left)
      .attr("height", laneHeight)
      .attr("fill", d => d.color || "#000")
      .attr("opacity", (d, i) => labelVeilOpacity + (i % 2 === 0 ? 0.03 : 0));

    laneSel.append("text")
      .attr("class", "lane-label")
      .attr("x", this._margin.left + 8)
      .attr("y", Math.floor(laneHeight / 2))
      .attr("dominant-baseline", "middle")
      .attr("fill", graph.nodeLabelColor || "#fff")
      .text(d => d.label || d.id);

    // items layer
    const itemsG = this._root.append("g")
      .attr("class", "timeline-items")
      .attr("transform", `translate(${this._laneWidth + this._margin.left},${laneTop})`);

    const items = (this.graph.data.items || []).map(it => {
      //      const sTs = this._normalizeDate(it.start);
      //      const eTs = this._normalizeDate(it.end);
      const sTs = (it.start);
      const eTs = (it.end);
      return { ...it, _sTs: sTs, _eTs: eTs };
    }).filter(it => it._sTs !== null);

    const barH = Math.max(12, Math.floor(laneHeight * 0.55));

    const itemSel = itemsG.selectAll("g.item")
      .data(items, d => d.id)
      .join("g")
      .attr("class", "item")
      .attr("transform", d => {
        const laneIndex = Math.max(0, lanes.findIndex(l => l.id === d.laneId));
        const y = laneIndex * laneHeight + Math.floor((laneHeight - barH) / 2);
        return `translate(0, ${y})`;
      });

    // Hover tooltip (MVP): show item title only
    //itemSel.append("title")
    //  .text(d => d.title || d.uuid || d.id);
    const self = this;

    // Enhanced Hover Tooltip
    itemSel.each(async function (d) {
      const el = d3.select(this);
      const startStr = await self._formatAxisTick(d._sTs);
      const endStr = d._eTs ? await self._formatAxisTick(d._eTs) : null;

      const dateRange = endStr ? `${startStr} – ${endStr}` : startStr;
      const tooltipText = `${d.title || d.uuid}\n(${dateRange})`;

      // Standard SVG title (Text only)
      //el.append("title").text(tooltipText);

      // Foundry-specific HTML Tooltip (Supports Images)
      // This uses Foundry's native tooltip system if available
      const doc = await fromUuid(d.uuid);
      const img = doc?.img || doc?.src || "";

      this.setAttribute("data-tooltip", `
        <section class="timeline-tooltip">
          ${img ? `<img src="${img}" style="width: 50px; height: 50px; float: left; margin-right: 8px;">` : ""}
          <div class="content">
            <strong>${d.title}</strong><br>
            <span class="dates">${dateRange}</span>
          </div>
        </section>
      `);
      this.setAttribute("data-tooltip-class", "foundry-graph-tooltip");
    });

    const drag = d3.drag()
      .on("start", function (ev, d) {
        d._dragging = true;
        d3.select(this).raise();
      })
      .on("drag", function (ev, d) {
        const se = ev.sourceEvent ?? ev;
        // Get pointer position relative to the container (accounting for zoom)
        const [px, py] = d3.pointer(se, self._container.node());
        let laneIndex = Math.floor((py - laneTop) / laneHeight);
        laneIndex = Math.max(0, Math.min(laneCount - 1, laneIndex));
        const y = laneIndex * laneHeight + Math.floor((laneHeight - barH) / 2);
        d3.select(this).attr("transform", `translate(0, ${y})`);
      })
      .on("end", function (ev, d) {
        const se = ev.sourceEvent ?? ev;
        // Get pointer position relative to the container (accounting for zoom)
        const [px, py] = d3.pointer(se, self._container.node());
        let laneIndex = Math.floor((py - laneTop) / laneHeight);
        laneIndex = Math.max(0, Math.min(laneCount - 1, laneIndex));
        const laneId = lanes[laneIndex]?.id || lanes[0]?.id;
        const stored = self.graph?.data?.items?.find(i => i.id === d.id);
        if (stored && stored.laneId !== laneId) stored.laneId = laneId;
        d._dragging = false;
        self.render(self._svg, self.graph, ctx);
      });

    itemSel.call(drag);


    const r = TimelineRenderer.ITEM_MARKER_RADIUS;
    const markerShape = TimelineRenderer.ITEM_MARKER_SHAPE;
    // Marker / pill vertical size should be consistent.
    // If marker radius is r, the "height" is 2r.
    const itemH = Math.max(2, r * 2);
    const cy = Math.floor(itemH / 2);

    // === Alternative rendering (STRICT) ===
    // 1) only start (no valid end) => marker (circle/triangle)
    // 2) start+end with end > start => pill ONLY

    const hasDuration = (d) => (d._eTs !== null && d._eTs > d._sTs);

    // PILL GROUP (only duration items)
    const pillSel = itemSel.filter(d => hasDuration(d));
    pillSel.append("rect")
      .attr("class", "item-pill")
      .attr("x", d => x(d._sTs))
      .attr("y", Math.floor((barH - itemH) / 2))
      .attr("width", d => Math.max(2, x(d._eTs) - x(d._sTs)))
      .attr("height", itemH)
      .attr("rx", Math.floor(itemH / 2))
      .attr("ry", Math.floor(itemH / 2))
      .attr("fill", d => (d.color || this._getTypeColor(d.entityType)))
      .attr("stroke", d => lanes.find(l => l.id === d.laneId)?.color || "rgba(255,255,255,0.6)")
      .attr("stroke-width", 2)
      .attr("opacity", 0.90);

    // MARKER GROUP (no duration items)
    const markerSel = itemSel.filter(d => !hasDuration(d));
    if (markerShape === "triangle") {
      // d3's triangle symbol points up; rotate 180° to point down.
      const size = Math.max(40, r * r * 8); // area in px^2
      const sym = d3.symbol().type(d3.symbolTriangle).size(size);
      markerSel.append("path")
        .attr("class", "item-dot")
        .attr("d", sym)
        .attr("transform", d => `translate(${x(d._sTs)},${Math.floor((barH / 2))}) rotate(180)`)
        .attr("fill", d => (d.color || this._getTypeColor(d.entityType)))
        .attr("stroke", d => lanes.find(l => l.id === d.laneId)?.color || "rgba(255,255,255,0.6)")
        .attr("stroke-width", 2)
        .attr("opacity", 0.95);
    } else {
      markerSel.append("circle")
        .attr("class", "item-dot")
        .attr("cx", d => x(d._sTs))
        .attr("cy", Math.floor((barH / 2)))
        .attr("r", r)
        .attr("fill", d => (d.color || this._getTypeColor(d.entityType)))
        .attr("stroke", d => lanes.find(l => l.id === d.laneId)?.color || "rgba(255,255,255,0.6)")
        .attr("stroke-width", 2)
        .attr("opacity", 0.95);
    }

    itemSel.append("text")
      .attr("class", "item-label")
      .attr("x", d => {
        return hasDuration(d) ? (x(d._sTs) + 8) : (x(d._sTs) + r + 8);
      })
      .attr("y", Math.floor(barH / 2))
      .attr("dominant-baseline", "middle")
      .attr("fill", graph.nodeLabelColor || "#fff")
      .text(d => d.title || d.uuid || d.id);

    // right-click -> radial menu (consistent with other renderers)
    itemSel
      .style("cursor", "grab")
      .on("contextmenu", (ev, d) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (d._dragging) return;
        this._onRightClickItem(ev, d);
      });
  }


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
          onClick: async () => {
            try {
              const doc = await fromUuid(item.uuid);
              if (doc?.sheet) doc.sheet.render(true);
              else ui.notifications.warn("No sheet available for this document.");
            } catch (e) {
              log("TimelineRenderer: failed to open", e);
            }
          }
        },
        {
          id: "editDates",
          label: `Edit Dates (${label})`,
          icon: "fa-solid fa-calendar-days",
          onClick: async () => {
            await this._showEditDatesDialog(item);
          }
        },
        {
          id: "delete",
          label: `Delete (${label})`,
          icon: "fa-solid fa-trash",
          onClick: async () => {
            const confirmed = await DialogV2.confirm({ content: `Delete timeline item "${label}"?` });
            if (!confirmed) return;
            const items = this.graph?.data?.items || [];
            this.graph.data.items = items.filter(i => i.id !== item.id);
            this.render(this._svg, this.graph);
          }
        }
      ]
    });
  }

  /**
   * Show a dialog to edit the start and end dates of a timeline item
   */
  async _showEditDatesDialog(item) {
    const doc = await fromUuid(item.uuid);
    if (!doc) {
      ui.notifications.error("Could not resolve document.");
      return;
    }

    const currentStartTs = doc.getFlag?.(MODULE_ID, "start-date") ?? item.start;
    const currentEndTs = doc.getFlag?.(MODULE_ID, "end-date") ?? item.end;

    console.log("Current start ts:", currentStartTs);
    console.log("Current end ts:", currentEndTs);

    // Render the calendar datetime pickers using Handlebars - AWAIT these!
    const startTemplate = await renderTemplate(
      "modules/foundry-graph/templates/partials/calendar-datetime.hbs",
      {
        name: "start-date",
        label: game.i18n.localize("foundry-graph.GraphPage.start_date") || "Start Date",
        value: currentStartTs ? String(currentStartTs) : "",
        required: true
      }
    );

    const endTemplate = await renderTemplate(
      "modules/foundry-graph/templates/partials/calendar-datetime.hbs",
      {
        name: "end-date",
        label: game.i18n.localize("foundry-graph.GraphPage.end_date") || "End Date",
        value: currentEndTs ? String(currentEndTs) : "",
        required: false
      }
    );
    console.log("Rendered startTemplate:", startTemplate);
    console.log("Rendered endTemplate:", endTemplate);

    // Now create the dialog with the rendered templates
    const dialog = DialogV2.wait({
      window: { 
        title: `Edit Dates: ${item.title}`,
        resizable: true
      },
      content: `
        <form class="timeline-edit-dates-form">
          <p class="notes" style="margin-bottom: 1em;">
            Edit the start and end dates for this timeline item. Changes will be saved to the document flags.
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
          callback: (event, button, dialog) => {
            const form = dialog.element.querySelector("form");
            const formData = new FormData(form);
            
            const startDateValue = formData.get("start-date");
            const endDateValue = formData.get("end-date");

            if (!startDateValue || startDateValue === "") {
              ui.notifications.warn("Start date is required.");
              return false; // Don't close dialog
            }

            return { 
              startDate: Number(startDateValue), 
              endDate: endDateValue && endDateValue !== "" ? Number(endDateValue) : null 
            };
          }
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fa-solid fa-times"
        }
      ],
      submit: async (result) => {
        if (result?.startDate === undefined) return; // Cancelled

        try {
          // Update document flags
          await doc.setFlag(MODULE_ID, "start-date", result.startDate);
          
          if (result.endDate !== null) {
            await doc.setFlag(MODULE_ID, "end-date", result.endDate);
          } else {
            await doc.unsetFlag(MODULE_ID, "end-date");
          }

          // Update the graph item
          const graphItem = this.graph?.data?.items?.find(i => i.id === item.id);
          if (graphItem) {
            graphItem.start = result.startDate;
            graphItem.end = result.endDate;
            graphItem.title = doc.name; // Update title in case it changed
          }

          // Re-render
          await this.render(this._svg, this.graph);
          
          ui.notifications.info(`Dates updated for "${item.title}"`);
        } catch (e) {
          log("TimelineRenderer: failed to update dates", e);
          ui.notifications.error("Failed to update dates. See console for details.");
        }
      },
      render: async (event, dialog) => {
        // Enhance the calendar datetime pickers after dialog renders
        console.log("Enhancing calendar datetime pickers...", dialog, event);
        //await super._onRender(context, options);
        FGCalendarDateTimePopover.enhance(dialog.element);
      }
    });

    //dialog.render(true);
  }

  async _onDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const data = TextEditor.getDragEventData(event);
    log("TimelineRenderer._onDrop", data);

    const allowed = this.graph?.allowedEntities;
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(data.type)) {
      ui.notifications.warn(`You cannot add a ${data.type} on this timeline.`);
      return;
    }

    const doc = await fromUuid(data.uuid);
    if (!doc) {
      ui.notifications.warn("Could not resolve dropped document.");
      return;
    }

    // Only accept documents that have Foundry Graph timeline flags:
    // - start-date (required)
    // - end-date (optional)
    const startTs = doc.getFlag?.(MODULE_ID, "start-date");
    const endTs = doc.getFlag?.(MODULE_ID, "end-date");
    const colorOverride = doc.getFlag?.(MODULE_ID, "color") ?? null;

    if (startTs == null) {
      ui.notifications.warn(t("GraphPage.StartDateRequired") ?? "Start date is required on the dropped document.");
      return;
    }

    // compute lane by mouse Y
    const containerNode = this._container?.node();
    if (!containerNode) return;
    const [, y0] = d3.pointer(event, containerNode);

    const lanes = this.graph.relations || [];
    const laneCount = Math.max(1, lanes.length);
    const height = this.graph.height || 600;
    const laneTop = this._margin.top;
    const laneHeight = Math.max(24, Math.floor((height - this._margin.top - this._margin.bottom) / laneCount));

    let laneIndex = Math.floor((y0 - laneTop) / laneHeight);
    laneIndex = Math.max(0, Math.min(laneCount - 1, laneIndex));
    const laneId = lanes[laneIndex]?.id || lanes[0]?.id;

    const title = doc?.name || data.uuid;

    const item = {
      id: `tl-${foundry.utils.randomID(8)}`,
      uuid: data.uuid,
      title,
      entityType: data.type,
      laneId,
      // Store timestamps (ms) as required; render converts to Date
      start: Number(startTs),
      end: endTs != null ? Number(endTs) : null,
      color: colorOverride
    };

    // upsert (one item per uuid for MVP)
    const items = this.graph.data.items || [];
    const existing = items.find(i => i.uuid === item.uuid);
    if (existing) {
      existing.laneId = item.laneId;
      existing.title = item.title;
      existing.entityType = item.entityType;
      existing.start = item.start;
      existing.end = item.end;
      existing.color = item.color;
    } else {
      items.push(item);
    }

    this.graph.data.items = items;

    // re-render
    this.render(this._svg, this.graph);
  }
}