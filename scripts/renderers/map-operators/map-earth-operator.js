import { log } from "../../constants.js";
import { BaseMapOperator } from "./base-map-operator.js";

export class MapEarthOperator extends BaseMapOperator {
  getInstructions() {
    return "Drop Actors/Scenes/Items/Journal pages on the map to create markers. Drag markers to reposition. Right-click a marker to radial menu.";
  }

  async createMap(container, { graph, center = [0, 0], zoom = 2 } = {}) {
    this.graph = graph ?? this.renderer?.graph ?? null;

    this._log("createMap:start", {
      themeId: this.themeData?.id ?? null,
      sourceType: this.mapSource?.type ?? null,
      center,
      zoom,
      baseLayerCount: this._getBaseLayerDefinitions().length
    });

    const map = this.L.map(container, {
      zoomControl: true,
      attributionControl: true
    });

    this.map = map;

    // Keep renderer fields synchronized until the rest of MapRenderer is fully delegated.
    this.renderer._map = map;

    const initialBaseLayerData = this._getInitialBaseLayerData(this.graph);
    this._log("createMap:initial-base-layer", {
      id: initialBaseLayerData?.id ?? null,
      label: initialBaseLayerData?.label ?? null
    });

    this._addBaseLayerControl(initialBaseLayerData);
    map.setView(center, zoom);
    this._log("createMap:view-set", {
      center: map.getCenter?.(),
      zoom: map.getZoom?.()
    });

    if (this.graph?.data) {
      this.graph.data.map = this.graph.data.map ?? { center: [0, 0], zoom: 2 };
      this.graph.data.map.baseLayer = this._cloneBaseLayerData(this._activeBaseLayerData);
      this._log("createMap:graph-base-layer-synced", this.graph.data.map.baseLayer);
    }

    this._addSearchControl();

    this._log("createMap:done");
    return map;
  }

  getGraphMapData(currentMapData = {}) {
    const data = this._clone(currentMapData ?? {});
    data.baseLayer = this._cloneBaseLayerData(this._activeBaseLayerData ?? this._getDefaultBaseLayerData());
    this._log("getGraphMapData", {
      baseLayerId: data.baseLayer?.id ?? null,
      baseLayerLabel: data.baseLayer?.label ?? null
    });
    return data;
  }

  getScaledSceneZoomInfo() {
    if (!this.map || !this._baseTileLayer) {
      const result = { enabled: false, reason: "map-not-ready" };
      this._log("scaled-zoom-info", result);
      return result;
    }

    const currentZoom = Number(this.map.getZoom?.());
    const maxNativeZoom = this._getLayerMaxNativeZoom();
    if (!Number.isFinite(currentZoom) || !Number.isFinite(maxNativeZoom)) {
      const result = { enabled: false, reason: "zoom-unavailable", currentZoom, maxNativeZoom };
      this._log("scaled-zoom-info", result);
      return result;
    }

    const scaledScene = this.mapSource?.scaledScene ?? {};
    const offset = Number(scaledScene.minimumZoomOffsetFromMaxNative ?? 1);
    const minimumCompatibleZoom = maxNativeZoom - (Number.isFinite(offset) ? offset : 1);

    const result = {
      enabled: scaledScene.enabled !== false && currentZoom >= minimumCompatibleZoom && currentZoom <= maxNativeZoom,
      currentZoom,
      maxNativeZoom,
      minimumCompatibleZoom
    };
    this._log("scaled-zoom-info", result);
    return result;
  }

  getScaledSceneScaleInfo(options = {}) {
    const scaledScene = this.mapSource?.scaledScene ?? {};
    const minGridSize = Number(options.minGridSize ?? scaledScene.minGridSize ?? 20);
    const feetPerSquare = Number(options.feetPerSquare ?? scaledScene.feetPerSquare ?? 5);
    const maxScale = Number(options.maxScale ?? scaledScene.maxScale ?? 4);

    const zoomInfo = this.getScaledSceneZoomInfo();
    if (!zoomInfo.enabled) {
      return {
        ok: false,
        status: "error",
        reason: zoomInfo.reason ?? "zoom-not-compatible",
        zoomInfo
      };
    }

    const center = this.map?.getCenter?.();
    const latitude = Number(center?.lat);
    const exportZoom = Number(zoomInfo.currentZoom);

    if (!Number.isFinite(latitude) || !Number.isFinite(exportZoom)) {
      return {
        ok: false,
        status: "error",
        reason: "scale-input-unavailable",
        latitude,
        exportZoom,
        zoomInfo
      };
    }

    const latitudeRadians = latitude * Math.PI / 180;
    const metersPerPixel = 156543.03392 * Math.cos(latitudeRadians) / Math.pow(2, exportZoom);
    const feetPerPixel = metersPerPixel * 3.28084;
    const nativePixelsPerSquare = feetPerSquare / feetPerPixel;
    const scale = Math.max(1, minGridSize / nativePixelsPerSquare);
    const finalGridSize = nativePixelsPerSquare * scale;

    const result = {
      ok: scale <= maxScale,
      status: scale <= maxScale ? "ok" : "error",
      reason: scale <= maxScale ? null : "scale-too-high",
      scale,
      maxScale,
      minGridSize,
      feetPerSquare,
      finalGridSize,
      nativePixelsPerSquare,
      feetPerPixel,
      metersPerPixel,
      latitude,
      exportZoom,
      zoomInfo
    };

    this._log("scaled-scale-info", {
      ok: result.ok,
      status: result.status,
      reason: result.reason,
      scale: result.scale,
      finalGridSize: result.finalGridSize,
      nativePixelsPerSquare: result.nativePixelsPerSquare,
      latitude: result.latitude,
      exportZoom: result.exportZoom
    });
    return result;
  }

  async getScaledSceneWallData(scaleInfo) {
    this._log("walls:start", {
      scaleOk: Boolean(scaleInfo?.ok),
      scale: scaleInfo?.scale ?? null,
      wallsConfig: this.mapSource?.walls ?? null
    });

    if (!this.map) {
      this._log("walls:skipped-map-not-ready");
      return [];
    }

    if (!scaleInfo?.ok) {
      this._log("walls:skipped-scale-not-ok", scaleInfo);
      return [];
    }

    const wallsConfig = this.mapSource?.walls ?? {};
    if (wallsConfig.enabled === false) {
      this._log("walls:disabled-by-theme");
      return [];
    }

    if (wallsConfig.type && wallsConfig.type !== "osm-buildings") {
      this._log("walls:unsupported-type", wallsConfig.type);
      return [];
    }

    const bounds = this.map.getBounds?.();
    if (!bounds) {
      this._log("walls:skipped-bounds-unavailable");
      return [];
    }

    const scale = Number(scaleInfo.scale);
    if (!Number.isFinite(scale) || scale <= 0) {
      this._log("walls:skipped-invalid-scale", scaleInfo?.scale);
      return [];
    }

    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();

    if (![south, west, north, east].every(Number.isFinite)) {
      this._log("walls:skipped-invalid-bounds", { south, west, north, east });
      return [];
    }

    this._log("walls:query-bounds", { south, west, north, east });

    const elements = await this._fetchVisibleOsmBuildings({ south, west, north, east });
    const walls = [];

    this._log("walls:osm-elements", { count: elements.length });

    for (const element of elements) {
      const geometry = Array.isArray(element?.geometry) ? element.geometry : [];
      if (geometry.length < 2) continue;

      for (let i = 0; i < geometry.length; i++) {
        const a = geometry[i];
        const b = geometry[(i + 1) % geometry.length];
        if (!a || !b) continue;

        const p1 = this._latLngToScaledScenePoint(a.lat, a.lon, scale);
        const p2 = this._latLngToScaledScenePoint(b.lat, b.lon, scale);
        if (!p1 || !p2) continue;

        if (p1.x === p2.x && p1.y === p2.y) continue;

        walls.push(this._buildFoundryWallData(p1, p2));
      }
    }

    this._log("walls:done", { count: walls.length });
    return walls;
  }

  teardown() {
    this._baseTileLayer = null;
    this._baseLayers = null;
    this._baseLayerControl = null;
    this._activeBaseLayerData = null;
    super.teardown();
  }

  _getBaseLayerDefinitions() {
    const layers = Array.isArray(this.mapSource?.baseLayers) ? this.mapSource.baseLayers : [];
    const validLayers = layers.filter(layer => layer?.id && layer?.url).map(layer => this._clone(layer));
    if (validLayers.length === 0) {
      this._log("no valid baseLayers found in theme-data", this.mapSource?.baseLayers);
    }
    return validLayers;
  }

  _getDefaultBaseLayerData() {
    const layers = this._getBaseLayerDefinitions();
    if (layers.length === 0) {
      throw new Error("Earth map operator requires at least one mapSource.baseLayers entry.");
    }

    const defaultId = this.mapSource?.defaultBaseLayerId;
    return this._clone(layers.find(layer => layer.id === defaultId) ?? layers[0]);
  }

  _cloneBaseLayerData(layerData) {
    return this._clone(layerData ?? this._getDefaultBaseLayerData());
  }

  _sanitizeBaseLayerData(layerData) {
    const fallback = this._getDefaultBaseLayerData();
    const id = String(layerData?.id ?? fallback.id);
    const label = String(layerData?.label ?? fallback.label);
    const url = String(layerData?.url ?? fallback.url);
    const sourceOptions = layerData?.options ?? {};
    const fallbackOptions = fallback.options ?? {};

    return {
      id,
      label,
      url,
      options: {
        maxZoom: Number.isFinite(sourceOptions.maxZoom) ? sourceOptions.maxZoom : fallbackOptions.maxZoom,
        maxNativeZoom: Number.isFinite(sourceOptions.maxNativeZoom) ? sourceOptions.maxNativeZoom : fallbackOptions.maxNativeZoom,
        crossOrigin: true,
        attribution: String(sourceOptions.attribution ?? fallbackOptions.attribution ?? ""),
        detectRetina: true
      }
    };
  }

  _getInitialBaseLayerData(graph) {
    const savedLayer = graph?.data?.map?.baseLayer;
    if (savedLayer?.url) return this._sanitizeBaseLayerData(savedLayer);

    const savedId = graph?.data?.map?.baseLayerId;
    const layerBySavedId = this._getBaseLayerDefinitions().find(layer => layer.id === savedId);
    if (layerBySavedId) return this._cloneBaseLayerData(layerBySavedId);

    return this._getDefaultBaseLayerData();
  }

  _getSelectableBaseLayerData(initialBaseLayerData) {
    const layers = this._getBaseLayerDefinitions();
    const activeId = initialBaseLayerData?.id;
    const index = layers.findIndex(layer => layer.id === activeId);

    if (index >= 0) layers[index] = this._cloneBaseLayerData(initialBaseLayerData);
    else layers.unshift(this._cloneBaseLayerData(initialBaseLayerData));

    return layers;
  }

  _createBaseTileLayer(layerData) {
    const cleanLayerData = this._sanitizeBaseLayerData(layerData);
    const layer = this.L.tileLayer(cleanLayerData.url, cleanLayerData.options);
    layer.__fgBaseLayerData = cleanLayerData;
    return layer;
  }

  _addBaseLayerControl(initialBaseLayerData) {
    const layersByLabel = {};
    let activeLayer = null;

    for (const layerData of this._getSelectableBaseLayerData(initialBaseLayerData)) {
      const layer = this._createBaseTileLayer(layerData);
      layersByLabel[layerData.label] = layer;

      this._log("base-layer:registered", {
        id: layerData.id,
        label: layerData.label
      });

      if (layerData.id === initialBaseLayerData.id) {
        activeLayer = layer;
      }
    }

    activeLayer ??= Object.values(layersByLabel)[0];
    this._baseLayers = layersByLabel;
    this._baseTileLayer = activeLayer;
    this._activeBaseLayerData = this._cloneBaseLayerData(activeLayer.__fgBaseLayerData);
    this._baseTileLayer.addTo(this.map);

    this._log("base-layer:active", {
      id: this._activeBaseLayerData?.id ?? null,
      label: this._activeBaseLayerData?.label ?? null
    });

    this._baseLayerControl = this.L.control.layers(layersByLabel, null, {
      position: "topright",
      collapsed: false
    }).addTo(this.map);

    this._log("base-layer:control-added", Object.keys(layersByLabel));

    this._syncRendererLayerState();

    this.map.on("baselayerchange", (event) => {
      if (!event?.layer?.__fgBaseLayerData) return;

      this._baseTileLayer = event.layer;
      this._activeBaseLayerData = this._cloneBaseLayerData(event.layer.__fgBaseLayerData);
      this._syncRendererLayerState();

      this._log("base-layer:changed", {
        id: this._activeBaseLayerData?.id ?? null,
        label: this._activeBaseLayerData?.label ?? null
      });

      if (this.graph?.data) {
        this.graph.data.map = this.graph.data.map ?? { center: [0, 0], zoom: 2 };
        this.graph.data.map.baseLayer = this._cloneBaseLayerData(this._activeBaseLayerData);
      }

      this.renderer?._notifyScaledSceneAvailabilityChanged?.();
    });
  }

  _syncRendererLayerState() {
    if (!this.renderer) return;
    this.renderer._baseLayers = this._baseLayers;
    this.renderer._baseTileLayer = this._baseTileLayer;
    this.renderer._baseLayerControl = this._baseLayerControl;
    this.renderer._activeBaseLayerData = this._cloneBaseLayerData(this._activeBaseLayerData);
  }

  _addSearchControl() {
    const search = this.mapSource?.search ?? {};
    if (search.enabled === false || search.type !== "nominatim") {
      this._log("search:disabled-or-unsupported", search);
      return;
    }

    try {
      this._buildSearchControl().addTo(this.map);
      this._log("search:control-added", {
        type: search.type,
        url: search.url ?? null,
        limit: search.limit ?? null
      });
    } catch (e) {
      log("MapEarthOperator: failed to add search control", e);
    }
  }

  _buildSearchControl() {
    const L = this.L;
    const map = this.map;
    const search = this.mapSource?.search ?? {};
    const searchUrl = String(search.url ?? "");
    const limit = Number.isFinite(Number(search.limit)) ? Number(search.limit) : 5;

    if (!searchUrl) {
      throw new Error("Nominatim search requires mapSource.search.url.");
    }

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
            const url = `${searchUrl}?format=json&limit=${encodeURIComponent(limit)}&q=${encodeURIComponent(q)}`;
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
                  map?.setView([lat, lng], Math.max(map.getZoom(), 12), { animate: true });
                }
                results.innerHTML = "";
              });
              results.appendChild(row);
            }
          } catch (e) {
            log("MapEarthOperator.search failed", e);
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

  _getLayerMaxNativeZoom() {
    const layerOptions = this._baseTileLayer?.options ?? {};
    const candidates = [
      layerOptions.maxNativeZoom,
      layerOptions.maxZoom,
      this.map?.getMaxZoom?.()
    ];

    for (const value of candidates) {
      const zoom = Number(value);
      if (Number.isFinite(zoom)) return zoom;
    }

    return Number.NaN;
  }

  async _fetchVisibleOsmBuildings({ south, west, north, east }) {
    const overpassUrl = String(this.mapSource?.walls?.overpassUrl ?? "");
    if (!overpassUrl) {
      this._log("walls:missing-overpass-url");
      return [];
    }

    const query = `
[out:json][timeout:25];
(
  way["building"](${south},${west},${north},${east});
);
out geom;
`;

    this._log("walls:fetch-overpass", { overpassUrl });

    let response;
    try {
      response = await fetch(overpassUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "Accept": "application/json"
        },
        body: new URLSearchParams({ data: query })
      });
    } catch (e) {
      log("MapEarthOperator: Overpass building query failed", e);
      ui?.notifications?.warn?.("Failed to retrieve building data from OpenStreetMap. Scaled scene walls will be missing. Probably a temporary issue with the Overpass API, but if it persists you may want to check your network connection.");
      return [];
    }

    if (!response.ok) {
      log(`Overpass building query failed: HTTP ${response.status}, ${response.statusText}, ${await response.text()}`);
      ui?.notifications?.warn?.("Failed to retrieve building data from OpenStreetMap. Scaled scene walls will be missing. Probably a temporary issue with the Overpass API, but if it persists you may want to check your network connection.");
      return [];
    }

    const json = await response.json();
    const elements = Array.isArray(json?.elements) ? json.elements : [];
    this._log("walls:overpass-response", { elementCount: elements.length });
    return elements;
  }

  _latLngToScaledScenePoint(lat, lng, scale) {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;

    const point = this.map?.latLngToContainerPoint?.([nLat, nLng]);
    if (!point) return null;

    return {
      x: Math.round(point.x * scale),
      y: Math.round(point.y * scale)
    };
  }

  _buildFoundryWallData(p1, p2) {
    return {
      c: [p1.x, p1.y, p2.x, p2.y],
      move: CONST.WALL_MOVEMENT_TYPES.NORMAL,
      sight: CONST.WALL_SENSE_TYPES.LIMITED,
      sound: CONST.WALL_SENSE_TYPES.LIMITED,
      light: CONST.WALL_SENSE_TYPES.LIMITED
    };
  }
}
