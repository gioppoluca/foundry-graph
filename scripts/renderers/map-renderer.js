// map-renderer.js
// Leaflet + OpenStreetMap renderer
//  - No nodes/links
//  - Graph data stores: map viewport + draggable markers georeferenced by lat/lng
const { DialogV2 } = foundry.applications.api;

import { BaseRenderer } from "./base-renderer.js";
import { log, safeUUID } from "../constants.js";


async function fromUuidSafe(uuid) {
  try {
    return await fromUuid(uuid);
  } catch (_e) {
    return null;
  }
}

export class MapRenderer extends BaseRenderer {
  static ID = "map";

  constructor() {
    super();
    // this._leaflet = null;
    this._map = null;
    this._mapDiv = null;
    this._markersLayer = null;
    this._leafletMarkers = new Map(); // markerId -> Leaflet marker
    this._geomanLayer = null;
    this._geomanLoaded = false;
    this._geomanEventsBound = false;
    this._geomanGraphKey = null;

    this._resizeObserver = null;
    this._resizeRaf = null;
    this._onWindowResize = null;
    // UI toggles for the D3GraphApp chrome
    this.isLinkNodesVisible = false;
    this.isRelationSelectVisible = false;
    this.instructions = "Drop Actors/Scenes/Items/Journal pages on the map to create markers. Drag markers to reposition. Right-click a marker to delete.";
  }

  initializeGraphData(_graph) {
    return {
      map: {
        center: [0, 0],
        zoom: 2
      },
      markers: [],
      geoman: { type: "FeatureCollection", features: [] }
    };
  }

  /**
   * Returns true if the graph contains a marker referencing the uuid.
   */
  hasEntity(graphData, uuid) {
    const markers = graphData?.data?.markers;
    if (!Array.isArray(markers)) return false;
    return markers.some(m => m?.uuid === uuid);
  }

  /**
   * Removes all markers referencing uuid.
   */
  removeEntity(graphData, uuid) {
    const graph = foundry.utils.deepClone(graphData);
    const markers = graph?.data?.markers;
    if (!Array.isArray(markers)) return graph;
    graph.data.markers = markers.filter(m => m?.uuid !== uuid);
    return graph;
  }

  getGraphData() {
    // Persist viewport + marker positions
    const data = foundry.utils.deepClone(this.graph?.data ?? {});

    // Ensure shape
    data.map = data.map ?? { center: [0, 0], zoom: 2 };
    data.markers = Array.isArray(data.markers) ? data.markers : [];
    // Ensure geoman shape
    if (!data.geoman || data.geoman.type !== "FeatureCollection" || !Array.isArray(data.geoman.features)) {
      data.geoman = { type: "FeatureCollection", features: [] };
    }

    if (this._map) {
      try {
        const c = this._map.getCenter();
        data.map.center = [c.lat, c.lng];
        data.map.zoom = this._map.getZoom();
      } catch (_e) {
        // ignore
      }
    }

    // Persist Leaflet-Geoman layers
    try {
      const fc = this._serializeGeoman();
      if (fc) {
        data.geoman = fc;
        log("MapRenderer.getGraphData: saved geoman features =", fc.features?.length ?? 0);
      } else {
        log("MapRenderer.getGraphData: geoman serialize returned null (geoman layer not ready?)");
      }
    } catch (e) {
      log("MapRenderer.getGraphData: failed to serialize geoman", e);
    }

    return data;
  }

  setRelationData(relation) {
    this.relation = relation;
  }


  teardown() {
    this._closeRadialMenu();
    this._stopResizeObserver();

    // Detach drop handlers
    this._detachDropHandlers(this._mapDiv);

    // Leaflet teardown
    try {
      if (this._map) {
        this._map.off();
        this._map.remove();
      }
    } catch (_e) {
      // ignore
    }

    this._map = null;
    this._markersLayer = null;
    this._geomanLayer = null;
    this._leafletMarkers.clear();

    // Reset Geoman lifecycle flags so a new/opened graph can reload its layers
    this._geomanLoaded = false;
    this._geomanEventsBound = false;
    this._geomanGraphKey = null;

    // Remove injected container
    try {
      if (this._mapDiv?.parentElement) this._mapDiv.parentElement.removeChild(this._mapDiv);
    } catch (_e) {
      // ignore
    }
    this._mapDiv = null;

    // Restore SVG if we hid it
    try {
      if (this._svgEl) this._svgEl.style.display = "";
    } catch (_e) {
      // ignore
    }
    this._svgEl = null;
  }

  // ---------------------------------------------------------------------------
  // Resize handling
  // ---------------------------------------------------------------------------
  _startResizeObserver() {
    // Leaflet needs an explicit invalidateSize() when its container changes size.
    if (this._resizeObserver || !this._map || !this._mapDiv) return;

    if (typeof ResizeObserver === "undefined") {
      // Very old browser... still try to keep things in sync via window resize.
      const invalidate = () => {
        try { this._map?.invalidateSize?.({ pan: false }); } catch (_e) { /* ignore */ }
      };
      window.addEventListener("resize", invalidate, { passive: true });
      this._onWindowResize = invalidate;
      return;
    }

    const invalidate = () => {
      if (!this._map) return;
      try {
        // Coalesce multiple rapid resize events into a single invalidate.
        if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = requestAnimationFrame(() => {
          this._resizeRaf = null;
          this._map?.invalidateSize?.({ pan: false });
        });
      } catch (_e) {
        // ignore
      }
    };

    // 1) Observe the map div itself (works for CSS/layout changes).
    // 2) Also listen to window resize (covers Foundry window chrome resizing quirks).
    this._resizeObserver = new ResizeObserver(invalidate);
    this._resizeObserver.observe(this._mapDiv);
    window.addEventListener("resize", invalidate, { passive: true });
    this._onWindowResize = invalidate;
  }

  _stopResizeObserver() {
    try {
      if (this._resizeObserver) this._resizeObserver.disconnect();
    } catch (_e) {
      // ignore
    }
    this._resizeObserver = null;

    try {
      if (this._onWindowResize) window.removeEventListener("resize", this._onWindowResize);
    } catch (_e) {
      // ignore
    }
    this._onWindowResize = null;

    try {
      if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    } catch (_e) {
      // ignore
    }
    this._resizeRaf = null;
  }

  _buildSearchControl(L) {
    const Search = L.Control.extend({
      options: { position: "topright" },
      onAdd: () => {
        const container = L.DomUtil.create("div", "leaflet-control fg-leaflet-search");
        container.innerHTML = `
          <div class="fg-leaflet-search-row">
            <input class="fg-leaflet-search-input" type="text" placeholder="Search (Nominatim)…" />
            <button class="fg-leaflet-search-btn" type="button" title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
          </div>
          <div class="fg-leaflet-search-results"></div>
        `;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        const input = container.querySelector(".fg-leaflet-search-input");
        const button = container.querySelector(".fg-leaflet-search-btn");
        const results = container.querySelector(".fg-leaflet-search-results");

        const doSearch = async () => {
          const q = (input?.value ?? "").trim();
          results.innerHTML = "";
          if (!q) return;

          try {
            // Nominatim usage policy: send a User-Agent; Foundry runs in browser so we can't set UA,
            // but we can set an Accept-Language and keep requests light.
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
            const res = await fetch(url, {
              headers: { "Accept": "application/json" }
            });
            const json = await res.json();
            const items = Array.isArray(json) ? json : [];
            if (items.length === 0) {
              results.innerHTML = `<div class="fg-leaflet-search-empty">No results</div>`;
              return;
            }

            for (const it of items) {
              const row = document.createElement("div");
              row.className = "fg-leaflet-search-item";
              row.textContent = it.display_name;
              row.addEventListener("click", () => {
                const lat = Number(it.lat);
                const lng = Number(it.lon);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                  this._map?.setView([lat, lng], Math.max(this._map.getZoom(), 12), { animate: true });
                }
                results.innerHTML = "";
              });
              results.appendChild(row);
            }
          } catch (e) {
            log("MapRenderer.search failed", e);
            results.innerHTML = `<div class="fg-leaflet-search-empty">Search failed</div>`;
          }
        };

        button?.addEventListener("click", doSearch);
        input?.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") doSearch();
        });

        return container;
      }
    });

    return new Search();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  async render(svgSelection, graph) {
    this.graph = graph;
    const svgNode = svgSelection?.node?.() ?? svgSelection;
    this._svgEl = svgNode;

    // Hide the SVG and inject a div-based Leaflet container in the same parent
    const container = svgNode?.parentElement;
    if (!container) {
      log("MapRenderer.render: missing container");
      return;
    }

    if (!this._mapDiv) {
      // Ensure SVG is not visible (Leaflet needs a real div)
      svgNode.style.display = "none";

      const div = document.createElement("div");
      div.className = "fg-map-container";
      div.style.width = "100%";
      div.style.height = "100%";
      container.appendChild(div);
      this._mapDiv = div;
    }

    const L = globalThis.L;
    log("MapRenderer: Leaflet loaded", L);

    if (!this._map) {
      // Initialize map
      const d = graph?.data ?? this.initializeGraphData(graph);
      const center = Array.isArray(d?.map?.center) ? d.map.center : [0, 0];
      const zoom = Number.isFinite(d?.map?.zoom) ? d.map.zoom : 2;

      this._map = L.map(this._mapDiv, {
        zoomControl: true,
        attributionControl: true
      }).setView(center, zoom);

      // --- Geoman persistence group (must exist BEFORE load/bind) ---
      try {
        this._geomanLayer = L.featureGroup().addTo(this._map);
        log("MapRenderer: geoman featureGroup created");
      } catch (e) {
        log("MapRenderer: failed to create geoman featureGroup", e);
      }

      if (this._map?.pm?.addControls) {
        // Keep it conservative for now (we can expand later).
        this._map.pm.addControls({
          position: "topleft",
          drawMarker: false,
          drawCircleMarker: false,
          drawCircle: false,
          drawRectangle: true,
          drawPolyline: true,
          drawPolygon: true,
          editMode: true,
          dragMode: true,
          cutPolygon: false,
          removalMode: true,
        });
      }

      // OSM tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        crossOrigin: "anonymous",
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(this._map);

      // Markers group
      this._markersLayer = L.layerGroup().addTo(this._map);

      // Search control
      try {
        this._buildSearchControl(L).addTo(this._map);
      } catch (e) {
        log("MapRenderer: failed to add search control", e);
      }


      // Leaflet-Geoman: load persisted layers and bind events so edits are saved.
      try {
        this._loadGeomanFromGraphData();
        this._bindGeomanEvents();
      } catch (e) {
        log("MapRenderer: failed to init Geoman persistence", e);
      }

      // Attach drop handlers to the map div
      this._attachDropHandlers(this._mapDiv);

      // Keep tiles updated when the Foundry window is resized.
      this._startResizeObserver();
    }

    // Sync markers
    this._syncMarkers();

    // Ensure persisted Geoman data is always in sync (FeatureCollection)
    try {
      const fc = this._serializeGeoman();
      if (fc) {
        this.graph.data.geoman = fc;
        log("MapRenderer.render: updated graph.data.geoman features =", fc.features?.length ?? 0);
      } else {
        log("MapRenderer.render: geoman serialize returned null (layer not ready?)");
      }
    } catch (e) {
      log("MapRenderer.render: failed to serialize geoman", e);
    }

    // Fix sizing if rendered in a new window
    try {
      //setTimeout(() => this._map?.invalidateSize?.(), 50);
      setTimeout(() => this._map?.invalidateSize?.({ pan: false }), 50);
    } catch (_e) {
      // ignore
    }

    // If map already existed (re-render), ensure observer is active.
    this._startResizeObserver();
  }

  // ---------------------------------------------------------------------------
  // Leaflet-Geoman persistence
  // ---------------------------------------------------------------------------

  /**
   * Bind a permanent tooltip label to a Geoman layer.
   * This is Leaflet-native (bindTooltip), not a custom overlay renderer.
   */
  _applyGeomanLabel(layer, label) {
    if (!layer || !label) return;
    try {
      // Remove existing tooltip if any
      if (layer.getTooltip?.()) layer.unbindTooltip?.();
    } catch (_e) { /* ignore */ }

    try {
      layer.bindTooltip(String(label), {
        permanent: true,
        direction: "center",
        opacity: 0.9,
        className: "fg-geoman-label"
      });
      // Ensure the tooltip is anchored to the current geometry center
      this._refreshGeomanLabelPosition(layer);
    } catch (e) {
      log("MapRenderer: failed to bind tooltip label", e);
    }
  }

  /**
   * Re-anchor a permanent tooltip to the "center" of the layer geometry.
   * Needed because Leaflet does not always auto-update tooltip anchor for edited/moved
   * vector layers (polygons/polylines/rectangles).
   */
  _refreshGeomanLabelPosition(layer) {
    if (!layer) return;
    const tt = layer.getTooltip?.();
    if (!tt) return;

    try {
      let latlng = null;

      // Marker-like layers
      if (typeof layer.getLatLng === "function") {
        latlng = layer.getLatLng();
      }
      // Vector layers (polygon/polyline/rectangle) usually have bounds
      else if (typeof layer.getBounds === "function") {
        const b = layer.getBounds();
        if (b && typeof b.getCenter === "function") latlng = b.getCenter();
      }
      // Some shapes expose getCenter (e.g., circles in some Leaflet versions)
      else if (typeof layer.getCenter === "function") {
        latlng = layer.getCenter();
      }

      if (latlng) {
        tt.setLatLng(latlng);
      }
    } catch (e) {
      log("MapRenderer: failed to refresh geoman label position", e);
    }
  }


  /**
   * Prompt user for a label.
   * @param {string} initialValue
   * @returns {Promise<string|null>}
   */
  async _promptForLabel(initialValue = "") {
    try {
      const safe = String(initialValue ?? "");
      const content = `
        <form>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label>Label</label>
            <input name="label" type="text" value="${safe.replace(/"/g, "&quot;")}" />
            <small style="opacity:0.7">Leave empty to skip.</small>
          </div>
        </form>
      `;
      return await DialogV2.prompt({
        window: { title: "Set Label" },
        content,
        ok: {
          label: "Apply",
          callback: (_event, button) => button.form.elements.label.value
        }
      });
    } catch (e) {
      log("MapRenderer: _promptForLabel failed", e);
      return null;
    }
  }

  _bindGeomanEvents() {
    if (!this._map) return;
    // Avoid double-binding on re-render
    if (this._geomanEventsBound) return;
    this._geomanEventsBound = true;
    log("MapRenderer: binding geoman events");

    const onCreate = (e) => {
      const layer = e?.layer;
      if (!layer) return;
      // Ensure layer is in our persistence group
      try { this._geomanLayer?.addLayer(layer); } catch (_e) { /* ignore */ }
      // Track the original Geoman shape (polygon, line, rectangle, etc.)
      try { layer.__fgPmShape = e?.shape || layer.__fgPmShape; } catch (_e) { /* ignore */ }
      this._attachGeomanLayerListeners(layer);
      log("MapRenderer: pm:create shape =", e?.shape, " total layers =",
        this._geomanLayer?.getLayers?.()?.length ?? 0
      );
      // Optional: ask for a label and bind it as a permanent tooltip.
      // (Geoman doesn't have a native per-feature label system; Leaflet tooltips do.)
      Promise.resolve()
        .then(async () => {
          const label = await this._promptForLabel("");
          if (label && String(label).trim().length > 0) {
            layer.__fgLabel = String(label).trim();
            this._applyGeomanLabel(layer, layer.__fgLabel);
          }
        })
        .finally(() => {
          this._updateGeomanDataFromLayers();
        });
    };

    const onRemove = (e) => {
      // IMPORTANT:
      // Geoman removes the layer from the map, but our persistence FeatureGroup
      // can still keep a reference unless we also remove it from _geomanLayer.
      const layer = e?.layer;
      if (layer && this._geomanLayer) {
        try {
          this._geomanLayer.removeLayer(layer);
          log("MapRenderer: pm:remove removed from geoman group. Remaining layers =",
            this._geomanLayer.getLayers?.()?.length ?? 0
          );
        } catch (err) {
          log("MapRenderer: pm:remove failed to remove from geoman group", err);
        }
      } else {
        log("MapRenderer: pm:remove fired but missing e.layer or _geomanLayer");
      }
      this._updateGeomanDataFromLayers();
    };

    const onEdit = (_e) => {
      this._updateGeomanDataFromLayers();
    };

    const onDrag = (_e) => {
      this._updateGeomanDataFromLayers();
    };

    this._map.on("pm:create", onCreate);
    this._map.on("pm:remove", onRemove);
    this._map.on("pm:edit", onEdit);
    // Some layers emit these during interactive moves
    this._map.on("pm:dragend", onDrag);
    this._map.on("pm:rotateend", onDrag);
  }

  _attachGeomanLayerListeners(layer) {
    if (!layer || layer.__fgGeomanBound) return;
    layer.__fgGeomanBound = true;

    // Existing persistence triggers
    const bump = () => {
      // Keep label anchored to geometry center while editing/moving
      this._refreshGeomanLabelPosition(layer);
      this._updateGeomanDataFromLayers();
    };
    try { layer.on?.("pm:edit", bump); } catch (_e) { /* ignore */ }
    try { layer.on?.("pm:update", bump); } catch (_e) { /* ignore */ }
    try { layer.on?.("pm:remove", bump); } catch (_e) { /* ignore */ }
    try { layer.on?.("dragend", bump); } catch (_e) { /* ignore */ }

    // NEW: Right-click menu for shapes
    layer.on("contextmenu", (ev) => {
      // Prevent the map's default context menu from firing
      if (ev.originalEvent) {
        ev.originalEvent.stopPropagation();
        ev.originalEvent.preventDefault();
      }

      this._showRadialMenu({
        clientX: ev.originalEvent?.clientX ?? 0,
        clientY: ev.originalEvent?.clientY ?? 0,
        items: [
          {
            id: "color",
            label: "Change Color",
            icon: "fa-solid fa-palette",
            onClick: () => this._promptForGeomanColor(layer)
          },
          {
            id: "label",
            label: "Edit Label",
            icon: "fa-solid fa-tag",
            onClick: () => this._promptForGeomanLabel(layer)
          },
          {
            id: "delete",
            label: "Delete Shape",
            icon: "fa-solid fa-trash",
            onClick: () => {
              if (this._geomanLayer) {
                this._geomanLayer.removeLayer(layer);
                this._updateGeomanDataFromLayers();
              }
            }
          }
        ]
      });
    });
  }

  /**
   * Edit (or remove) the label stored in feature.properties.label.
   * Reuses the same DialogV2 prompt used for label creation.
   */
  async _promptForGeomanLabel(layer) {
    if (!layer) return;

    const current =
      layer.__fgLabel ??
      layer.feature?.properties?.label ??
      "";

    const label = await this._promptForLabel(String(current ?? ""));
    // DialogV2.prompt returns null/undefined on cancel -> do nothing
    if (label === null || label === undefined) return;

    const trimmed = String(label).trim();
    if (!trimmed) {
      // Remove label
      try { layer.__fgLabel = null; } catch (_e) { /* ignore */ }
      try {
        if (layer.getTooltip?.()) layer.unbindTooltip?.();
      } catch (_e) { /* ignore */ }
    } else {
      // Set/update label
      layer.__fgLabel = trimmed;
      this._applyGeomanLabel(layer, trimmed);
    }

    // Persist change in graph.data.geoman (GeoJSON)
    this._updateGeomanDataFromLayers();
  }

  /**
   * Opens a Foundry dialog to pick a new color for a Geoman layer.
   */
  async _promptForGeomanColor(layer) {
    const currentStyle = layer.options?.color || "#3388ff";
    const color = await this._promptForColor(currentStyle);

    if (color) {
      layer.setStyle({
        color: color,
        fillColor: color
      });
      this._updateGeomanDataFromLayers();
    }
  }

  /**
   * Generic helper to prompt for a color.
   * @param {string} initialColor - The current color hex string.
   * @returns {Promise<string|null>} - The chosen color or null if cancelled.
   */
  async _promptForColor(initialColor = "#3388ff") {
    const content = `
    <div class="form-group">
      <label>Choose Color</label>
      <div class="form-fields">
        <input type="color" name="color" value="${initialColor}">
      </div>
    </div>
  `;

    return await DialogV2.prompt({
      window: { title: "Pick Color" },
      content: content,
      ok: {
        label: "Apply",
        callback: (event, button) => button.form.elements.color.value
      }
    });
  }

  _updateGeomanDataFromLayers() {
    if (!this.graph?.data) return;
    const fc = this._serializeGeoman();
    if (fc) {
      this.graph.data.geoman = fc;
      log("MapRenderer: geoman updated features =", fc.features?.length ?? 0);
    } else {
      log("MapRenderer: geoman update skipped (serialize returned null)");
    }
  }

  _serializeGeoman() {
    if (!this._geomanLayer) return null;

    const layers = this._geomanLayer.getLayers?.() ?? [];
    const features = [];

    for (const layer of layers) {
      if (!layer) continue;

      // Skip our graph "entity" markers (they live in a different layer and have pmIgnore)
      if (layer?.options?.pmIgnore) continue;

      // toGeoJSON exists for most vector layers and markers
      const gj = layer.toGeoJSON?.();
      if (!gj) continue;

      // Normalize to a single Feature
      const feature = gj.type === "Feature" ? gj : { type: "Feature", geometry: gj, properties: {} };
      feature.properties = feature.properties ?? {};

      // Persist label (Leaflet tooltip content)
      // - on freshly drawn layers we store it on layer.__fgLabel
      // - on reloaded layers it may already be in feature.properties.label
      const lbl = layer.__fgLabel ?? layer.feature?.properties?.label ?? feature.properties.label;
      if (lbl && String(lbl).trim().length > 0) {
        feature.properties.label = String(lbl).trim();
      } else {
        delete feature.properties.label;
      }

      // Preserve basic style so we can restore visuals on load.
      // (Geoman uses Leaflet layer options)
      feature.properties.__fgStyle = {
        color: layer.options?.color,
        weight: layer.options?.weight,
        opacity: layer.options?.opacity,
        fillColor: layer.options?.fillColor,
        fillOpacity: layer.options?.fillOpacity,
        dashArray: layer.options?.dashArray,
        lineCap: layer.options?.lineCap,
        lineJoin: layer.options?.lineJoin
      };

      // Preserve Geoman shape name when available (helps future migrations)
      if (layer.__fgPmShape) feature.properties.__fgPmShape = layer.__fgPmShape;

      features.push(feature);
    }

    return { type: "FeatureCollection", features };
  }

  _loadGeomanFromGraphData() {
    if (!this._map || !this._geomanLayer) return;

    // Load only once per renderer lifetime unless explicitly cleared.
    if (this._geomanLoaded) return;
    this._geomanLoaded = true;

    const L = globalThis.L;
    const raw = this.graph?.data?.geoman;
    const fc = (raw && raw.type === "FeatureCollection" && Array.isArray(raw.features))
      ? raw
      : null;

    if (!fc || fc.features.length === 0) return;

    const styleFn = (feature) => {
      const s = feature?.properties?.__fgStyle;
      return (s && typeof s === "object") ? s : undefined;
    };

    const pointToLayer = (_feature, latlng) => {
      // Default marker for geoman point features.
      // (If later you enable drawMarker in Geoman controls, this will persist those too.)
      return L.marker(latlng, { draggable: true });
    };

    const layer = L.geoJSON(fc, {
      style: styleFn,
      pointToLayer
    });

    // Add each child to the geoman group and bind listeners so later edits persist.
    layer.eachLayer((child) => {
      try { this._geomanLayer.addLayer(child); } catch (_e) { /* ignore */ }
      try {
        const shp = child?.feature?.properties?.__fgPmShape;
        if (shp) child.__fgPmShape = shp;
      } catch (_e) { /* ignore */ }

      // Restore label (if any)
      try {
        const lbl = child?.feature?.properties?.label;
        if (lbl && String(lbl).trim().length > 0) {
          child.__fgLabel = String(lbl).trim();
          this._applyGeomanLabel(child, child.__fgLabel);
          this._refreshGeomanLabelPosition(child);
        }
      } catch (_e) { /* ignore */ }

      this._attachGeomanLayerListeners(child);
    });
  }


  // ---------------------------------------------------------------------------
  // SVG Marker icons (inline SVG -> Leaflet divIcon)
  // ---------------------------------------------------------------------------

  _makeSvgDivIcon(markerType, color) {
    const safeType = markerType || "generic";
    const safeColor = color || "#64748b";
    const symbol = this._svgSymbolPath(safeType);

    // Pin (viewBox 0 0 32 48) + inner symbol in white
    const html = `
      <div class="fg-map-marker" data-type="${safeType}">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">
          <path d="M16 0C8.82 0 3 5.82 3 13c0 9.5 10.1 26.44 12.3 30.02.33.54 1.07.54 1.4 0C18.9 39.44 29 22.5 29 13 29 5.82 23.18 0 16 0z" fill="${safeColor}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>
          <circle cx="16" cy="13" r="8" fill="rgba(255,255,255,0.18)" />
          <path d="${symbol}" fill="#ffffff" transform="translate(0 0)" />
        </svg>
      </div>
    `;

    return window.L.divIcon({
      className: "fg-leaflet-divicon",
      html,
      iconSize: [32, 48],
      iconAnchor: [16, 46],
      popupAnchor: [0, -44]
    });
  }

  _svgSymbolPath(markerType) {
    // These are simple paths designed to sit around the top circle area.
    // Coordinates are in the same viewBox (0..32, 0..48).
    switch (markerType) {
      case "actor":
        // head + shoulders
        return "M16 8.5a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 0 0 0-6.4zm-6.2 12.2c0-2.6 3.1-4.7 6.2-4.7s6.2 2.1 6.2 4.7v1.3H9.8v-1.3z";
      case "scene":
        // folded map
        return "M9 10l5-2 4 2 5-2v14l-5 2-4-2-5 2V10zm5 0v12l4 2V12l-4-2z";
      case "item":
        // cube
        return "M16 8l6 3.2v7.6L16 22l-6-3.2v-7.6L16 8zm0 2.2l-4 2.1 4 2.1 4-2.1-4-2.1zm-4 4.6v2.9l4 2.1v-2.9l-4-2.1zm12 0l-4 2.1v2.9l4-2.1v-2.9z";
      case "journal":
        // book
        return "M10 9h9c1.7 0 3 1.3 3 3v10c0 1.1-.9 2-2 2h-10c-1.1 0-2-.9-2-2V11c0-1.1.9-2 2-2zm1.5 2v11H20V11h-8.5zm1.2 2h5.8v1.4h-5.8V13zm0 3h5.8v1.4h-5.8V16z";
      default:
        // dot
        return "M16 10.5a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 0 0 0-5.6z";
    }
  }

  // ---------------------------------------------------------------------------
  // Marker handling
  // ---------------------------------------------------------------------------

  _defaultMarkerTypeForEntity(entityType) {
    switch (entityType) {
      case "Actor":
        return "actor";
      case "Scene":
        return "scene";
      case "Item":
        return "item";
      case "JournalEntryPage":
        return "journal";
      default:
        return "generic";
    }
  }

  _defaultColorForEntity(entityType) {
    // Kept in data model now; you'll add UI later.
    switch (entityType) {
      case "Actor":
        return "#3b82f6"; // blue
      case "Scene":
        return "#22c55e"; // green
      case "Item":
        return "#f59e0b"; // amber
      case "JournalEntryPage":
        return "#a855f7"; // purple
      default:
        return "#64748b"; // slate
    }
  }

  _updateMarkerColor(markerId, newColor) {
    // 1. Find the data in the graph
    const markerData = this.graph.data.markers.find(m => m.id === markerId);
    if (!markerData) return;

    // 2. Update the data
    markerData.color = newColor;

    // 3. Update the live Leaflet icon
    const leafletMarker = this._leafletMarkers.get(markerId);
    if (leafletMarker) {
      // Use window.L directly to avoid null property errors
      // Reuse the existing SVG divIcon factory used by _syncMarkers()
      const markerType = markerData.markerType ?? this._defaultMarkerTypeForEntity(markerData.type);
      leafletMarker.setIcon(this._makeSvgDivIcon(markerType, newColor));
    }

    // 4. Persist changes
    this._requestSave();
  }

  /**
     * Ask the host app to persist graph changes (best-effort).
     * Some renderers/modules expose different hooks; keep it defensive.
     */
  _requestSave() {
    try {
      if (typeof this.requestSave === "function") return this.requestSave();
    } catch (_e) { /* ignore */ }
    try {
      if (typeof this.onGraphChanged === "function") return this.onGraphChanged();
    } catch (_e) { /* ignore */ }
    // As a fallback, do nothing: the graph data is already mutated in memory and will be saved
    // when the user hits the normal Save action.
  }

  _syncMarkers() {
    if (!this._map || !this._markersLayer) return;
    const L = globalThis.L;

    const markers = Array.isArray(this.graph?.data?.markers) ? this.graph.data.markers : [];
    const byId = new Map(markers.map(m => [m.id, m]));

    // Remove markers not present anymore
    for (const [id, lm] of this._leafletMarkers.entries()) {
      if (!byId.has(id)) {
        try { this._markersLayer.removeLayer(lm); } catch (_e) { /* ignore */ }
        this._leafletMarkers.delete(id);
      }
    }

    // Add/update markers
    for (const m of markers) {
      if (!m || !m.id) continue;
      // ensure required fields
      m.markerType ??= this._defaultMarkerTypeForEntity(m.type);
      m.color ??= this._defaultColorForEntity(m.type);
      const lat = Number(m.lat);
      const lng = Number(m.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const existing = this._leafletMarkers.get(m.id);
      const icon = this._makeSvgDivIcon(m.markerType, m.color);
      if (existing) {
        // keep popup + drag binding; just move/label
        existing.setLatLng([lat, lng]);
        if (m.label) existing.bindTooltip(m.label, { permanent: false });
        continue;
      }

      const lm = L.marker([lat, lng], { draggable: true, icon, pmIgnore: true, });
      if (m.label) lm.bindTooltip(m.label, { permanent: false });

      lm.on("dragend", () => {
        const p = lm.getLatLng();
        const idx = (this.graph.data.markers || []).findIndex(x => x.id === m.id);
        if (idx >= 0) {
          this.graph.data.markers[idx].lat = p.lat;
          this.graph.data.markers[idx].lng = p.lng;
        }
      });

      lm.on("click", async (ev) => {
        ev?.originalEvent?.preventDefault?.();
        const doc = await fromUuidSafe(m.uuid);
        if (doc?.sheet?.render) doc.sheet.render(true);
      });

      lm.on("contextmenu", (ev) => {
        const oe = ev?.originalEvent;
        const clientX = oe?.clientX ?? 0;
        const clientY = oe?.clientY ?? 0;
        this._showRadialMenu({
          clientX,
          clientY,
          items: [
            {
              id: "color",
              label: "Change Color",
              icon: "fa-solid fa-palette",
              onClick: async () => {
                const newColor = await this._promptForColor(m.color);
                if (newColor) {
                  this._updateMarkerColor(m.id, newColor);
                }
              }
            },
            {
              id: "delete",
              label: "Delete marker",
              icon: "fa-solid fa-trash",
              onClick: async () => {
                this.graph.data.markers = (this.graph.data.markers || []).filter(x => x.id !== m.id);
                this._syncMarkers();
              }
            }
          ]
        });
      });

      lm.addTo(this._markersLayer);
      this._leafletMarkers.set(m.id, lm);
    }
  }

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------
  async _onDrop(event) {
    log("MapRenderer._onDrop", event);
    const data = TextEditor.getDragEventData(event);
    log("MapRenderer drop data", data);

    const allowed = this.graph?.allowedEntities;
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(data.type)) {
      ui.notifications.warn(`You cannot add a ${data.type} on this graph type.`);
      return;
    }

    if (!this._map) return;

    // Compute lat/lng from the drop point
    const rect = this._mapDiv.getBoundingClientRect();
    const x = (event.clientX ?? 0) - rect.left;
    const y = (event.clientY ?? 0) - rect.top;
    const latlng = this._map.containerPointToLatLng([x, y]);

    const doc = await fromUuidSafe(data.uuid);
    const label = doc?.name ?? data?.uuid ?? "Unknown";

    const marker = {
      id: safeUUID(),
      uuid: data.uuid,
      type: data.type,
      label,
      lat: latlng.lat,
      lng: latlng.lng,
      markerType: this._defaultMarkerTypeForEntity(data.type),
      color: this._defaultColorForEntity(data.type)
    };

    this.graph.data.markers = Array.isArray(this.graph.data.markers) ? this.graph.data.markers : [];
    this.graph.data.markers.push(marker);

    ui.notifications.info(`Added marker: ${label}`);
    this._syncMarkers();
  }


  async exportToPNG({ scale = 3 } = {}) {
    if (!this._map || !this._mapDiv) {
      ui?.notifications?.warn?.("Map is not ready for export yet");
      return;
    }

    // UX: show busy cursor
    const _root = document.body;
    const _prevCursor = _root.style.cursor;
    _root.style.cursor = "progress";
    ui?.notifications?.info?.("Preparing map export…");

    // We deliberately DO NOT include Leaflet controls (search, zoom, attribution)
    // by only rasterizing the tile/overlay/marker panes.
    try {
      await this._waitForLeafletIdle();

      const pixelRatio = Math.max(1, Number(scale) || 1);
      const size = this._map.getSize();
      const w = Math.max(1, Math.round(size.x));
      const h = Math.max(1, Math.round(size.y));

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * pixelRatio);
      canvas.height = Math.round(h * pixelRatio);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.scale(pixelRatio, pixelRatio);

      const container = this._map.getContainer();
      const containerRect = container.getBoundingClientRect();

      // 1) Tiles
      await this._drawTilesToCanvas(ctx, container, containerRect);

      // 2) Vector overlays (Leaflet SVG pane)
      await this._drawSvgOverlayToCanvas(ctx, container, containerRect);

      // 3) Markers (our SVG divIcons)
      await this._drawMarkerSvgsToCanvas(ctx, container, containerRect);

      // Download
      const safeName = String(this.graph?.name ?? "map").replace(/[^a-z0-9_-]+/gi, "_");
      const a = document.createElement("a");
      a.download = `${safeName}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();

      ui?.notifications?.info?.("Map export complete");
    } catch (e) {
      log("MapRenderer.exportPng failed", e);
      ui?.notifications?.error?.(
        "Map export failed (often due to tile CORS restrictions). If you use online tiles, prefer a CORS-enabled tile source or local/offline tiles."
      );
    } finally {
      _root.style.cursor = _prevCursor || "";
    }
  }

  async _waitForLeafletIdle() {
    // Wait for Leaflet to finish any in-flight tile requests/animations.
    // idle fires after all tiles are loaded (for current view).
    return new Promise((resolve) => {
      if (!this._map) return resolve();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this._map?.off?.("idle", finish);
        resolve();
      };
      this._map.once("idle", finish);
      // In case idle doesn't fire within a reasonable time.
      setTimeout(finish, 1000);
    });
  }

  async _drawTilesToCanvas(ctx, container, containerRect) {
    const tileImages = Array.from(container.querySelectorAll(".leaflet-tile-pane img.leaflet-tile"));
    // Ensure any pending tiles finish loading
    await Promise.all(
      tileImages.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          const cleanup = () => {
            img.removeEventListener("load", cleanup);
            img.removeEventListener("error", cleanup);
            resolve();
          };
          img.addEventListener("load", cleanup, { once: true });
          img.addEventListener("error", cleanup, { once: true });
        });
      })
    );

    for (const img of tileImages) {
      if (!img.complete || img.naturalWidth <= 0) continue;
      const r = img.getBoundingClientRect();
      const x = r.left - containerRect.left;
      const y = r.top - containerRect.top;
      const w = r.width;
      const h = r.height;
      ctx.drawImage(img, x, y, w, h);
    }
  }

  async _drawSvgOverlayToCanvas(ctx, container, containerRect) {
    // 1. Identify the hierarchy. Leaflet spreads transforms across these layers.
    const mapPane = container.querySelector(".leaflet-map-pane");
    const overlayPane = container.querySelector(".leaflet-overlay-pane");
    const svg = overlayPane?.querySelector("svg");

    if (!svg) return;

    const readMatrix = (el) => {
      try {
        const t = window.getComputedStyle(el)?.transform;
        if (!t || t === "none") return new DOMMatrix();
        return new DOMMatrix(t);
      } catch (_e) {
        return new DOMMatrix();
      }
    };

    // 2. Combine the transforms. 
    // mapPane usually holds the 'Pan' translation.
    // overlayPane and svg may hold additional offsets or zoom scaling.
    const m1 = readMatrix(mapPane);
    const m2 = readMatrix(overlayPane);
    const m3 = readMatrix(svg);
    const combined = m1.multiply(m2).multiply(m3);

    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    // 3. Inline the combined transform so the serialized SVG knows where to position paths
    try {
      const prev = clone.getAttribute("style") || "";
      // Ensure transform-origin is 0,0 to match Leaflet's coordinate system
      clone.setAttribute(
        "style",
        `${prev}; transform: ${combined.toString()}; transform-origin: 0 0;`
      );
    } catch (e) {
      log("MapRenderer: export - failed to inline overlay transform", e);
    }

    const svgText = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();

      // 4. Draw to canvas.
      // We draw at 0,0 without specifying w/h. 
      // The inlined 'combined' transform handles shifting the content into view.
      ctx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async _drawMarkerSvgsToCanvas(ctx, container, containerRect) {
    const markerSvgs = Array.from(container.querySelectorAll(".leaflet-marker-pane .fg-map-marker svg"));
    if (markerSvgs.length === 0) return;

    for (const svg of markerSvgs) {
      const r = svg.getBoundingClientRect();
      const x = r.left - containerRect.left;
      const y = r.top - containerRect.top;
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));

      const clone = svg.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const svgText = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        ctx.drawImage(img, x, y, w, h);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
}
