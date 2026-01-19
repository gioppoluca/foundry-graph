// map-renderer.js
// Leaflet + OpenStreetMap renderer
//  - No nodes/links
//  - Graph data stores: map viewport + draggable markers georeferenced by lat/lng

import { BaseRenderer } from "./base-renderer.js";
import { log, safeUUID } from "../constants.js";

function randomId() {
  try {
    return foundry?.utils?.randomID?.() ?? crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  } catch (_e) {
    return `${Date.now()}-${Math.random()}`;
  }
}

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
    this._leaflet = null;
    this._map = null;
    this._mapDiv = null;
    this._markersLayer = null;
    this._leafletMarkers = new Map(); // markerId -> Leaflet marker

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
      markers: []
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

    if (this._map) {
      try {
        const c = this._map.getCenter();
        data.map.center = [c.lat, c.lng];
        data.map.zoom = this._map.getZoom();
      } catch (_e) {
        // ignore
      }
    }

    return data;
  }

  setRelationData(relation) {
    this.relation = relation;
  }


  teardown() {
    this._closeRadialMenu();

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
    this._leafletMarkers.clear();

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
  // Leaflet bootstrapping
  // ---------------------------------------------------------------------------
  /*
  async _ensureLeafletLoaded() {
    if (globalThis.L && globalThis.L.map) return;

    const leafletCssId = "fg-leaflet-css";
    const leafletJsId = "fg-leaflet-js";

    // CSS
    if (!document.getElementById(leafletCssId)) {
      const link = document.createElement("link");
      link.id = leafletCssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // JS
    if (!document.getElementById(leafletJsId)) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.id = leafletJsId;
        s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
      });
    } else {
      // If already in DOM but not yet loaded, wait a tick
      if (!(globalThis.L && globalThis.L.map)) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    if (!(globalThis.L && globalThis.L.map)) {
      throw new Error("Leaflet failed to load. Check CSP / network access.");
    }
  }
*/
  _buildSearchControl(L) {
    const Search = L.Control.extend({
      options: { position: "topleft" },
      onAdd: () => {
        const container = L.DomUtil.create("div", "fg-leaflet-search");
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

    // Load Leaflet on-demand
    //await this._ensureLeafletLoaded();
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

      // OSM tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
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

      // Attach drop handlers to the map div
      this._attachDropHandlers(this._mapDiv);
    }

    // Sync markers
    this._syncMarkers();

    // Fix sizing if rendered in a new window
    try {
      setTimeout(() => this._map?.invalidateSize?.(), 50);
    } catch (_e) {
      // ignore
    }
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

      const lm = L.marker([lat, lng], { draggable: true, icon });
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
}
