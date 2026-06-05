import { t } from "../../constants.js";
import { BaseMapOperator } from "./base-map-operator.js";

export class MapGeoJsonOperator extends BaseMapOperator {
  getInstructions() {
    return t("Map.GeoJsonInstructions");
  }

  async createMap(container, { graph, center = null, zoom = null } = {}) {
    this.graph = graph ?? this.renderer?.graph ?? null;
    this._geoJsonLayers = new Map();
    this._rasterOverlays = new Map();
    this._layerIdsByLayer = new Map();
    this._layerIdsByLeafletId = new Map();
    this._layerControl = null;
    this._enabledLayerIds = new Set(this._getInitialEnabledLayerIds(this.graph));
    this._enabledRasterOverlayIds = new Set(this._getInitialEnabledRasterOverlayIds(this.graph));

    const crs = this._createLeafletCrs();
    const minZoom = this._numberOrDefault(this.mapSource?.minZoom, 1);
    const maxZoom = this._numberOrDefault(this.mapSource?.maxZoom, 8);

    this._log("createMap:start", {
      themeId: this.themeData?.id ?? null,
      sourceType: this.mapSource?.type ?? null,
      crs: this.mapSource?.crs ?? null,
      leafletCrs: this.mapSource?.leafletCrs ?? null,
      layerCount: Array.isArray(this.mapSource?.layers) ? this.mapSource.layers.length : 0,
      rasterOverlayCount: Array.isArray(this.mapSource?.rasterOverlays) ? this.mapSource.rasterOverlays.length : 0,
      enabledLayerIds: Array.from(this._enabledLayerIds),
      enabledRasterOverlayIds: Array.from(this._enabledRasterOverlayIds),
      center,
      zoom
    });

    const map = this.L.map(container, {
      zoomControl: true,
      attributionControl: true,
      crs,
      minZoom,
      maxZoom
    });

    this.map = map;
    this.renderer._map = map;
    this._syncRendererLayerState();

    const attribution = this.mapSource?.attribution;
    if (attribution && map.attributionControl?.addAttribution) {
      try { map.attributionControl.addAttribution(attribution); } catch (_e) { /* ignore */ }
    }

    const bounds = this._getConfiguredBounds();
    if (bounds) {
      const padding = this._numberOrDefault(this.mapSource?.maxBoundsPadding, 0.1);
      try {
        map.setMaxBounds(bounds.pad(padding));
        this._log("createMap:max-bounds-set", { padding, bounds: this._boundsToArray(bounds) });
      } catch (e) {
        this._log("createMap:setMaxBounds failed", e);
      }
    }

    await this._loadConfiguredLayers(map);
    this._bindLayerVisibilityPersistence(map);

    const savedView = this._getSavedOrDefaultView({ center, zoom, bounds });
    if (savedView) {
      map.setView(savedView.center, savedView.zoom, { animate: false });
      this._log("createMap:restored-view", savedView);
    } else if (bounds) {
      map.fitBounds(bounds, { animate: false });
      this._log("createMap:fit-bounds", { bounds: this._boundsToArray(bounds), zoom: map.getZoom?.() });
    } else {
      map.setView([0, 0], this._numberOrDefault(this.mapSource?.defaultZoom, 2), { animate: false });
      this._log("createMap:fallback-view", { center: [0, 0], zoom: map.getZoom?.() });
    }

    if (this.graph?.data) {
      this.graph.data.map = this.getGraphMapData(this.graph.data.map ?? { center: [0, 0], zoom: 2 });
      this._log("createMap:graph-geojson-data-synced", this.graph.data.map?.geoJson ?? null);
    }

    this._log("createMap:done", {
      currentCenter: map.getCenter?.(),
      currentZoom: map.getZoom?.(),
      enabledLayerIds: Array.from(this._enabledLayerIds),
      enabledRasterOverlayIds: Array.from(this._enabledRasterOverlayIds),
      loadedLayerIds: Array.from(this._geoJsonLayers.keys()),
      loadedRasterOverlayIds: Array.from(this._rasterOverlays.keys()).filter(id => this._rasterOverlays.get(id)?.loaded === true)
    });

    return map;
  }

  getGraphMapData(currentMapData = {}) {
    this._refreshEnabledLayerIdsFromMap();

    const data = this._clone(currentMapData ?? {});
    delete data.baseLayer;
    delete data.baseLayerId;
    delete data.image;

    data.enabledGeoJsonLayerIds = Array.from(this._enabledLayerIds ?? []);
    data.enabledRasterOverlayIds = Array.from(this._enabledRasterOverlayIds ?? []);
    data.geoJson = {
      crs: this.mapSource?.crs ?? null,
      leafletCrs: this.mapSource?.leafletCrs ?? null,
      enabledLayerIds: data.enabledGeoJsonLayerIds,
      enabledRasterOverlayIds: data.enabledRasterOverlayIds
    };

    this._log("getGraphMapData", {
      enabledLayerIds: data.enabledGeoJsonLayerIds,
      enabledRasterOverlayIds: data.enabledRasterOverlayIds,
      crs: data.geoJson.crs,
      leafletCrs: data.geoJson.leafletCrs
    });

    return data;
  }

  getScaledSceneZoomInfo() {
    const result = { enabled: false, reason: "scaled-scene-not-supported-for-geojson-map" };
    this._log("scaled-zoom-info", result);
    return result;
  }

  getScaledSceneScaleInfo() {
    const result = {
      ok: false,
      status: "error",
      reason: "scaled-scene-not-supported-for-geojson-map",
      zoomInfo: this.getScaledSceneZoomInfo()
    };
    this._log("scaled-scale-info", result);
    return result;
  }

  async getScaledSceneWallData(_scaleInfo) {
    this._log("walls:skipped-geojson-map");
    return [];
  }

  teardown() {
    try { this._layerControl?.remove?.(); } catch (_e) { /* ignore */ }
    this._layerControl = null;
    this._geoJsonLayers = null;
    this._rasterOverlays = null;
    this._layerIdsByLayer = null;
    this._layerIdsByLeafletId = null;
    this._enabledLayerIds = null;
    this._enabledRasterOverlayIds = null;
    super.teardown();
  }

  _createLeafletCrs() {
    const leafletCrs = String(this.mapSource?.leafletCrs ?? this.mapSource?.crs ?? "EPSG4326").toLowerCase();
    if (leafletCrs === "simple") return this.L.CRS.Simple;
    if (leafletCrs === "epsg4326" || leafletCrs === "epsg:4326" || leafletCrs === "epsg4326_compat") return this.L.CRS.EPSG4326;
    if (leafletCrs === "toril-gcs" || leafletCrs === "toril:gcs") return this._createTorilGcsCrs();

    this._log("custom CRS not recognized, falling back to EPSG4326", { leafletCrs });
    return this.L.CRS.EPSG4326;
  }

  _createTorilGcsCrs() {
    const radius = this._numberOrDefault(
      this.mapSource?.crsDefinition?.semiMajorAxis ?? this.mapSource?.crsDefinition?.radius,
      6410000
    );
    const L = this.L;

    const crs = L.Util.extend({}, L.CRS.Earth, {
      code: "TORIL:GCS",
      projection: L.Projection.LonLat,
      transformation: new L.Transformation(1 / 180, 1, -1 / 180, 0.5),
      wrapLng: [-180, 180],
      wrapLat: [-90, 90],
      infinite: false,
      distance(latlng1, latlng2) {
        const rad = Math.PI / 180;
        const lat1 = latlng1.lat * rad;
        const lat2 = latlng2.lat * rad;
        const sinDLat = Math.sin((latlng2.lat - latlng1.lat) * rad / 2);
        const sinDLon = Math.sin((latlng2.lng - latlng1.lng) * rad / 2);
        const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
        return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
    });

    this._log("created Toril GCS Leaflet CRS", {
      code: crs.code,
      semiMajorAxis: radius,
      inverseFlattening: this.mapSource?.crsDefinition?.inverseFlattening ?? null,
      primeMeridian: this.mapSource?.crsDefinition?.primeMeridian ?? this.mapSource?.primeMeridian ?? null
    });

    return crs;
  }

  async _loadConfiguredLayers(map) {
    const layers = this._getOrderedConfiguredLayers();
    const rasterOverlays = this._getOrderedRasterOverlayDefs();
    const overlays = {};

    for (const layerDef of layers) {
      const id = String(layerDef?.id ?? "").trim();
      if (!id) continue;

      try {
        this._prepareLayerPane(map, layerDef);

        const layer = this.L.layerGroup();
        const leafletId = this.L.Util.stamp(layer);
        this._geoJsonLayers.set(id, {
          layer,
          layerDef: this._clone(layerDef),
          loaded: false,
          loadingPromise: null,
          geoJsonLayer: null
        });
        this._layerIdsByLayer.set(layer, id);
        this._layerIdsByLeafletId.set(leafletId, id);

        const label = this._formatControlLabel(layerDef);
        overlays[label] = layer;

        if (this._enabledLayerIds.has(id)) {
          layer.addTo(map);
          await this._ensureGeoJsonLayerLoaded(id, map);
          this._log("layer enabled and loaded", { id, label, url: layerDef.url });
        } else {
          this._log("layer registered as lazy disabled overlay", { id, label, url: layerDef.url });
        }
      } catch (e) {
        this._log("layer registration failed", { id, url: layerDef?.url ?? null, error: e });
        ui?.notifications?.warn?.(`Could not register GeoJSON layer '${layerDef?.label ?? id}'. Check the layer configuration.`);
      }
    }

    for (const overlayDef of rasterOverlays) {
      const id = String(overlayDef?.id ?? "").trim();
      if (!id) continue;

      try {
        this._prepareLayerPane(map, overlayDef);

        const layer = this.L.layerGroup();
        const leafletId = this.L.Util.stamp(layer);
        this._rasterOverlays.set(id, {
          layer,
          layerDef: this._clone(overlayDef),
          loaded: false,
          loadingPromise: null,
          rasterLayer: null
        });
        this._layerIdsByLayer.set(layer, id);
        this._layerIdsByLeafletId.set(leafletId, id);

        const label = this._formatControlLabel(overlayDef);
        overlays[label] = layer;

        if (this._enabledRasterOverlayIds.has(id)) {
          layer.addTo(map);
          await this._ensureRasterOverlayLoaded(id, map);
          this._log("raster overlay enabled and loaded", { id, label, url: overlayDef.url });
        } else {
          this._log("raster overlay registered as lazy disabled overlay", { id, label, url: overlayDef.url });
        }
      } catch (e) {
        this._log("raster overlay registration failed", { id, url: overlayDef?.url ?? null, error: e });
        ui?.notifications?.warn?.(`Could not register raster overlay '${overlayDef?.label ?? id}'. Check the overlay configuration.`);
      }
    }

    if (Object.keys(overlays).length > 0) {
      this._layerControl = this.L.control.layers(null, overlays, {
        collapsed: this.mapSource?.layerControlCollapsed ?? false,
        sortLayers: false
      }).addTo(map);
      this._log("layer control created", { overlayCount: Object.keys(overlays).length });
    } else {
      this._log("no geojson overlays available; layer control not created");
    }
  }

  async _ensureGeoJsonLayerLoaded(id, map = this.map) {
    const entry = this._geoJsonLayers?.get?.(id);
    if (!entry) return null;
    if (entry.loaded) return entry.geoJsonLayer;
    if (entry.loadingPromise) return entry.loadingPromise;

    entry.loadingPromise = this._loadGeoJsonIntoLayerGroup(entry, map)
      .catch(error => {
        entry.loadError = error;
        this._log("lazy layer load failed", {
          id,
          url: entry.layerDef?.url ?? null,
          error
        });
        ui?.notifications?.warn?.(`Could not load GeoJSON layer '${entry.layerDef?.label ?? id}'. Check that the file exists in module assets.`);
        throw error;
      })
      .finally(() => {
        entry.loadingPromise = null;
      });

    return entry.loadingPromise;
  }

  async _loadGeoJsonIntoLayerGroup(entry, map = this.map) {
    const id = String(entry?.layerDef?.id ?? "").trim();
    this._log("lazy layer load start", { id, url: entry?.layerDef?.url ?? null });

    const geoJsonLayer = await this._createGeoJsonFeatureLayer(entry.layerDef, map);
    geoJsonLayer.addTo(entry.layer);

    entry.geoJsonLayer = geoJsonLayer;
    entry.loaded = true;
    entry.loadError = null;

    this._log("lazy layer load done", { id });
    return geoJsonLayer;
  }

  _getOrderedConfiguredLayers() {
    const layers = Array.isArray(this.mapSource?.layers) ? this.mapSource.layers : [];
    return [...layers].sort((a, b) => this._getLayerOrder(a) - this._getLayerOrder(b));
  }

  _getLayerOrder(layerDef) {
    return this._numberOrDefault(layerDef?.order, 100);
  }

  _getOrderedRasterOverlayDefs() {
    const overlays = Array.isArray(this.mapSource?.rasterOverlays) ? this.mapSource.rasterOverlays : [];
    return [...overlays].sort((a, b) => this._getLayerOrder(a) - this._getLayerOrder(b));
  }

  async _ensureRasterOverlayLoaded(id, map = this.map) {
    const entry = this._rasterOverlays?.get?.(id);
    if (!entry) return null;
    if (entry.loaded) return entry.rasterLayer;
    if (entry.loadingPromise) return entry.loadingPromise;

    entry.loadingPromise = this._loadRasterOverlayIntoLayerGroup(entry, map)
      .catch(error => {
        entry.loadError = error;
        this._log("lazy raster overlay load failed", {
          id,
          url: entry.layerDef?.url ?? null,
          error
        });
        ui?.notifications?.warn?.(`Could not load raster overlay '${entry.layerDef?.label ?? id}'. Check that the file exists in module assets.`);
        throw error;
      })
      .finally(() => {
        entry.loadingPromise = null;
      });

    return entry.loadingPromise;
  }

  async _loadRasterOverlayIntoLayerGroup(entry, map = this.map) {
    const layerDef = entry?.layerDef ?? {};
    const id = String(layerDef?.id ?? "").trim();
    const url = String(layerDef?.url ?? "").trim();
    if (!url) throw new Error("Raster overlay url is required.");

    const bounds = this._getLayerBounds(layerDef);
    if (!bounds) throw new Error("Raster overlay bounds are required.");

    this._log("lazy raster overlay load start", { id, url, bounds: this._boundsToArray(bounds) });

    const pane = this._prepareLayerPane(map, layerDef);
    const options = {
      pane,
      opacity: this._numberOrDefault(layerDef?.opacity, 0.35),
      interactive: layerDef?.interactive === true,
      className: String(layerDef?.className ?? "").trim() || undefined
    };

    const rasterLayer = this.L.imageOverlay(url, bounds, options);
    rasterLayer.on("load", () => this._applyRasterOverlayDomStyle(rasterLayer, layerDef));
    rasterLayer.addTo(entry.layer);
    this._applyRasterOverlayDomStyle(rasterLayer, layerDef);

    entry.rasterLayer = rasterLayer;
    entry.loaded = true;
    entry.loadError = null;

    this._log("lazy raster overlay load done", {
      id,
      opacity: options.opacity,
      pane,
      order: this._getLayerOrder(layerDef),
      blendMode: this._getRasterBlendMode(layerDef) || null
    });
    return rasterLayer;
  }

  _applyRasterOverlayDomStyle(rasterLayer, layerDef) {
    const image = rasterLayer?.getElement?.();
    if (!image?.style) return;

    const blendMode = this._getRasterBlendMode(layerDef);
    if (blendMode) image.style.mixBlendMode = blendMode;

    image.style.pointerEvents = layerDef?.interactive === true ? "auto" : "none";

    const imageRendering = String(layerDef?.imageRendering ?? "").trim();
    if (imageRendering) image.style.imageRendering = imageRendering;

    this._log("raster overlay DOM style applied", {
      id: layerDef?.id ?? null,
      blendMode: blendMode || null,
      pointerEvents: image.style.pointerEvents,
      opacity: rasterLayer?.options?.opacity ?? null
    });
  }

  _getRasterBlendMode(layerDef) {
    const configured = String(layerDef?.blendMode ?? "").trim();
    if (configured) return configured;

    const id = String(layerDef?.id ?? "").toLowerCase();
    if (id.includes("hillshade")) return "multiply";
    if (id.includes("relief")) return "overlay";
    return "";
  }

  async _createGeoJsonFeatureLayer(layerDef, map) {
    const url = String(layerDef?.url ?? "").trim();
    if (!url) throw new Error("GeoJSON layer url is required.");

    this._log("fetch layer", { id: layerDef.id, url });
    const response = await fetch(url, { headers: { "Accept": "application/geo+json, application/json, */*" } });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

    const geojson = await response.json();
    const featureCount = Array.isArray(geojson?.features) ? geojson.features.length : null;
    this._log("fetched layer", { id: layerDef.id, featureCount });

    const pane = this._prepareLayerPane(map, layerDef);

    return this.L.geoJSON(geojson, {
      pane,
      style: feature => this._getGeoJsonStyle(layerDef, feature),
      pointToLayer: (feature, latlng) => this._createPointLayer(layerDef, feature, latlng),
      onEachFeature: (feature, layer) => this._bindFeature(layerDef, feature, layer)
    });
  }

  _prepareLayerPane(map, layerDef) {
    const configuredPane = String(layerDef?.pane ?? "").trim();
    const order = this._getLayerOrder(layerDef);
    const pane = configuredPane || `fg-map-geojson-${order}`;

    try {
      if (!map.getPane(pane)) {
        map.createPane(pane);
        const paneElement = map.getPane(pane);
        if (paneElement?.style) paneElement.style.zIndex = String(300 + order);
        this._log("pane created", { layerId: layerDef?.id, pane, order, zIndex: 300 + order });
      }
    } catch (e) {
      this._log("pane creation failed; using overlayPane", { layerId: layerDef?.id, pane, error: e });
      layerDef.__fgLeafletPane = "overlayPane";
      return "overlayPane";
    }

    layerDef.__fgLeafletPane = pane;
    return pane;
  }

  _createPointLayer(layerDef, feature, latlng) {
    const radius = this._numberOrDefault(layerDef?.radius, this._pointRadiusForFeature(feature));
    const pane = String(layerDef?.__fgLeafletPane ?? layerDef?.pane ?? `fg-map-geojson-${this._getLayerOrder(layerDef)}`).trim();
    return this.L.circleMarker(latlng, {
      radius,
      pane,
      ...this._getGeoJsonPointStyle(layerDef, feature)
    });
  }

  _pointRadiusForFeature(feature) {
    const rank = Number(feature?.properties?.feature_rank);
    if (Number.isFinite(rank)) return Math.max(3, Math.min(7, 8 - rank));
    return 4;
  }

  _bindFeature(layerDef, feature, layer) {
    const label = this._getFeatureLabel(feature, layerDef);
    if (label) {
      try {
        layer.bindTooltip(label, {
          sticky: true,
          direction: "top",
          opacity: 0.9
        });
      } catch (_e) { /* ignore */ }
    }

    const html = this._getFeaturePopupHtml(feature, layerDef, label);
    if (html) {
      try {
        layer.bindPopup(html, {
          className: "fg-map-geojson-popup-shell",
          closeButton: true,
          autoPan: true
        });
        layer.on("popupopen", event => this._preparePopupDom(event?.popup));
      } catch (_e) { /* ignore */ }
    }
  }

  _getFeatureLabel(feature, layerDef) {
    const properties = feature?.properties ?? {};
    const propertyNames = Array.isArray(layerDef?.labelProperties)
      ? layerDef.labelProperties
      : (Array.isArray(this.mapSource?.labelProperties) ? this.mapSource.labelProperties : ["name_en", "name", "name_abb_en", "uuid"]);

    for (const prop of propertyNames) {
      const value = properties?.[prop];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Number.isFinite(Number(value))) return String(value);
    }

    return null;
  }

  _getFeaturePopupHtml(feature, layerDef, label) {
    const properties = feature?.properties ?? {};
    const title = this._getUsefulTextValue(label)
      || this._getUsefulTextValue(layerDef?.label)
      || this._getUsefulTextValue(layerDef?.id)
      || "GeoJSON feature";

    const description = this._getFeatureDescription(properties);
    const rows = [];

    this._pushPopupRow(rows, "Class", properties.feature_class);
    this._pushPopupRow(rows, "Rank", properties.feature_rank);
    this._pushPopupRow(rows, "Editions", properties.dnd_editions_str);
    this._pushPopupRow(rows, "Levels", properties.feature_levels_str);
    this._pushPopupRow(rows, "Location", properties.location_en);
    this._pushPopupRow(rows, "Also known as", properties.name_alt_en_str);

    if (description) {
      rows.push(`<div class="fg-map-geojson-popup-description">${this._escapeHtml(description)}</div>`);
    }

    const referenceUrl = this._sanitizeExternalUrl(properties.url_en);
    if (referenceUrl) {
      rows.push(`<div><strong>Reference:</strong> ${this._formatExternalLink(referenceUrl)}</div>`);
    }

    const sourceName = this._getUsefulTextValue(properties.source_name);
    const sourceUrl = this._sanitizeExternalUrl(properties.source_url);
    if (sourceName || sourceUrl) {
      const sourceParts = [];
      if (sourceName) sourceParts.push(this._escapeHtml(sourceName));
      if (sourceUrl) sourceParts.push(this._formatExternalLink(sourceUrl));
      rows.push(`<div><strong>Source:</strong> ${sourceParts.join(" ")}</div>`);
    }

    this._pushPopupRow(rows, "Coordinates", properties.geog_extent_centroid_fria || properties.geog_extent_centroid_md);

    if (rows.length === 0) return null;

    return `<div class="fg-map-geojson-popup">`
      + `<div class="fg-map-geojson-popup-title">${this._escapeHtml(title)}</div>`
      + rows.join("")
      + `</div>`;
  }

  _getFeatureDescription(properties) {
    const candidates = [
      properties.descr_en,
      properties.descr,
      properties.descr_html_en,
      properties.descr_html
    ];

    for (const value of candidates) {
      const text = this._getUsefulTextValue(value);
      if (text) return text;
    }

    return "";
  }

  _pushPopupRow(rows, label, value) {
    const text = this._getUsefulTextValue(value);
    if (!text) return;
    rows.push(`<div><strong>${this._escapeHtml(label)}:</strong> ${this._escapeHtml(text)}</div>`);
  }

  _getUsefulTextValue(value) {
    if (value === null || value === undefined) return "";

    let text = String(value).trim();
    if (!text) return "";

    if (this._looksLikeHtml(text)) {
      text = this._extractTextFromHtml(text);
    }

    text = text.replace(/\s+/g, " ").trim();
    if (!text) return "";

    const normalized = text
      .replace(/[\s\u00a0]/g, "")
      .replace(/[()\[\]{}]/g, "")
      .replace(/[—–-]/g, "")
      .trim()
      .toLowerCase();

    if (!normalized || normalized === "none" || normalized === "null" || normalized === "n/a") return "";
    return text;
  }

  _looksLikeHtml(value) {
    const text = String(value ?? "").trim();
    return /^<!doctype/i.test(text) || /^<html[\s>]/i.test(text) || /<\/?[a-z][\s\S]*>/i.test(text);
  }

  _extractTextFromHtml(value) {
    const html = String(value ?? "");

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      doc.querySelectorAll("script, style, head, meta, title").forEach(el => el.remove());
      return (doc.body?.textContent ?? doc.documentElement?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
    } catch (_e) {
      const div = document.createElement("div");
      div.innerHTML = html;
      div.querySelectorAll("script, style, head, meta, title").forEach(el => el.remove());
      return (div.textContent ?? "").replace(/\s+/g, " ").trim();
    }
  }

  _sanitizeExternalUrl(value) {
    const url = this._getUsefulTextValue(value);
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) return "";
    return url;
  }

  _formatExternalLink(url) {
    const safeUrl = this._escapeHtml(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" data-fg-map-link="true">open</a>`;
  }

  _preparePopupDom(popup) {
    const el = popup?.getElement?.();
    if (!el) return;

    try { this.L.DomEvent.disableClickPropagation(el); } catch (_e) { /* ignore */ }
    try { this.L.DomEvent.disableScrollPropagation(el); } catch (_e) { /* ignore */ }

    const closeButton = el.querySelector?.(".leaflet-popup-close-button");
    if (closeButton) {
      closeButton.setAttribute("title", "Close");
      try {
        this.L.DomEvent.on(closeButton, "click", event => {
          this.L.DomEvent.preventDefault(event);
          this.L.DomEvent.stopPropagation(event);
        });
      } catch (_e) { /* ignore */ }
    }

    el.querySelectorAll?.("a").forEach(anchor => {
      try {
        this.L.DomEvent.on(anchor, "click", event => {
          this.L.DomEvent.stopPropagation(event);
        });
      } catch (_e) { /* ignore */ }
    });
  }

  _getGeoJsonStyle(layerDef, feature) {
    const configured = this._clone(layerDef?.style ?? {});
    const propertyStyle = this._getGeoJsonPropertyStyle(layerDef, feature);
    const defaults = this._getGeoJsonStyleDefaults(layerDef, feature);
    const role = String(layerDef?.role ?? "").toLowerCase();

    if (role === "line") {
      return {
        ...defaults,
        ...configured,
        ...propertyStyle
      };
    }

    if (role === "point") {
      return {
        ...defaults,
        ...configured,
        ...propertyStyle
      };
    }

    return {
      ...defaults,
      ...configured,
      ...propertyStyle
    };
  }

  _getGeoJsonPointStyle(layerDef, feature) {
    const configured = this._clone(layerDef?.style ?? {});
    const propertyStyle = this._getGeoJsonPropertyStyle(layerDef, feature);
    const defaults = this._getGeoJsonStyleDefaults(layerDef, feature);
    return {
      radius: this._numberOrDefault(layerDef?.radius, this._pointRadiusForFeature(feature)),
      ...defaults,
      ...configured,
      ...propertyStyle
    };
  }

  _getGeoJsonPropertyStyle(layerDef, feature) {
    const propertyName = String(layerDef?.styleByProperty ?? "").trim();
    const styles = layerDef?.styles;
    if (!propertyName || !styles || typeof styles !== "object") return {};

    const rawValue = feature?.properties?.[propertyName];
    const value = String(rawValue ?? "").trim();
    if (!value) return {};

    if (styles[value] && typeof styles[value] === "object") return this._clone(styles[value]);

    const normalizedValue = value.toLowerCase();
    const matchedKey = Object.keys(styles).find(key => String(key).toLowerCase() === normalizedValue);
    if (matchedKey && styles[matchedKey] && typeof styles[matchedKey] === "object") return this._clone(styles[matchedKey]);

    return {};
  }

  _getGeoJsonStyleDefaults(layerDef, feature) {
    const role = String(layerDef?.role ?? "").toLowerCase();
    const id = String(layerDef?.id ?? "").toLowerCase();
    const label = String(layerDef?.label ?? "").toLowerCase();
    const featureClass = String(feature?.properties?.feature_class ?? "").toLowerCase();

    if (role === "point") {
      return {
        color: "#4b2f18",
        fillColor: "#f2d16b",
        weight: 1,
        opacity: 0.95,
        fillOpacity: 0.9
      };
    }

    if (role === "line") {
      if (id.includes("river") || label.includes("river") || featureClass.includes("river")) {
        return {
          color: "#4f9ed8",
          weight: 1.5,
          opacity: 0.9
        };
      }

      if (id.includes("path") || label.includes("path") || featureClass.includes("road") || featureClass.includes("path")) {
        return {
          color: "#8b5a2b",
          weight: 1.5,
          opacity: 0.85,
          dashArray: "4 4"
        };
      }

      return {
        color: "#6d6d6d",
        weight: 1.5,
        opacity: 0.85
      };
    }

    if (id.includes("ocean") || label.includes("ocean")) {
      return {
        color: "#4f9ed8",
        fillColor: "#6bb7df",
        weight: 1,
        opacity: 0.7,
        fillOpacity: 0.55
      };
    }

    if (id.includes("lake") || label.includes("lake")) {
      return {
        color: "#4f9ed8",
        fillColor: "#87cdea",
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.65
      };
    }

    if (id.includes("land") || label.includes("land")) {
      return {
        color: "#6c7f3f",
        fillColor: "#d8c58a",
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.65
      };
    }

    if (id.includes("region") || label.includes("region")) {
      return {
        color: "#7a4f9a",
        fillColor: "#c8a9dc",
        weight: 1.25,
        opacity: 0.9,
        fillOpacity: 0.18
      };
    }

    if (id.includes("underdark") || label.includes("underdark")) {
      return {
        color: "#5d4a7d",
        fillColor: "#7d6a9c",
        weight: 1.25,
        opacity: 0.9,
        fillOpacity: 0.22
      };
    }

    return {
      color: "#666666",
      fillColor: "#cfcfcf",
      weight: 1,
      opacity: 0.8,
      fillOpacity: 0.35
    };
  }

  _bindLayerVisibilityPersistence(map) {
    map.on("overlayadd", event => {
      const id = this._getLayerIdFromLeafletLayer(event?.layer);
      if (!id) {
        this._log("overlay enabled but layer id not found", { leafletId: event?.layer?._leaflet_id ?? null });
        return;
      }

      const type = this._getConfiguredOverlayType(id);
      if (type === "raster") {
        this._enabledRasterOverlayIds.add(id);
        this._log("raster overlay enabled", { id, enabledRasterOverlayIds: Array.from(this._enabledRasterOverlayIds) });
        this._ensureRasterOverlayLoaded(id, map).then(() => {
          this._log("raster overlay lazy load completed", { id });
        }).catch(_e => {
          // The loader already logs and warns; keep the checkbox state so the user can retry by toggling.
        });
        return;
      }

      this._enabledLayerIds.add(id);
      this._log("geojson overlay enabled", { id, enabledLayerIds: Array.from(this._enabledLayerIds) });

      this._ensureGeoJsonLayerLoaded(id, map).then(() => {
        this._log("geojson overlay lazy load completed", { id });
      }).catch(_e => {
        // The loader already logs and warns; keep the checkbox state so the user can retry by toggling.
      });
    });

    map.on("overlayremove", event => {
      const id = this._getLayerIdFromLeafletLayer(event?.layer);
      if (!id) {
        this._log("overlay disabled but layer id not found", { leafletId: event?.layer?._leaflet_id ?? null });
        return;
      }

      const type = this._getConfiguredOverlayType(id);
      if (type === "raster") {
        this._enabledRasterOverlayIds.delete(id);
        this._log("raster overlay disabled", { id, enabledRasterOverlayIds: Array.from(this._enabledRasterOverlayIds) });
        return;
      }

      this._enabledLayerIds.delete(id);
      this._log("geojson overlay disabled", { id, enabledLayerIds: Array.from(this._enabledLayerIds) });
    });
  }

  _getLayerIdFromLeafletLayer(layer) {
    if (!layer) return null;

    const byObject = this._layerIdsByLayer?.get?.(layer);
    if (byObject) return byObject;

    const leafletId = layer._leaflet_id ?? this.L?.Util?.stamp?.(layer);
    if (leafletId === null || leafletId === undefined) return null;

    return this._layerIdsByLeafletId?.get?.(leafletId) ?? null;
  }

  _getConfiguredOverlayType(id) {
    if (this._rasterOverlays?.has?.(id)) return "raster";
    if (this._geoJsonLayers?.has?.(id)) return "geojson";
    return "unknown";
  }

  _refreshEnabledLayerIdsFromMap() {
    if (!this.map || !this._geoJsonLayers) return;

    const enabled = [];
    for (const [id, entry] of this._geoJsonLayers.entries()) {
      if (entry?.layer && this.map.hasLayer(entry.layer)) enabled.push(id);
    }

    const enabledRaster = [];
    for (const [id, entry] of this._rasterOverlays?.entries?.() ?? []) {
      if (entry?.layer && this.map.hasLayer(entry.layer)) enabledRaster.push(id);
    }

    this._enabledLayerIds = new Set(enabled);
    this._enabledRasterOverlayIds = new Set(enabledRaster);
    this._log("enabled layers refreshed from map", { enabledLayerIds: enabled, enabledRasterOverlayIds: enabledRaster });
  }

  _getInitialEnabledLayerIds(graph) {
    const configuredLayers = Array.isArray(this.mapSource?.layers) ? this.mapSource.layers : [];
    const saved = graph?.data?.map?.enabledGeoJsonLayerIds ?? graph?.data?.map?.geoJson?.enabledLayerIds;

    if (Array.isArray(saved)) {
      const configuredIds = new Set(configuredLayers.map(l => String(l?.id ?? "").trim()).filter(Boolean));
      const filtered = saved.map(id => String(id)).filter(id => configuredIds.has(id));
      if (filtered.length > 0 || saved.length === 0) return filtered;
    }

    return configuredLayers
      .filter(layer => layer?.enabled === true)
      .map(layer => String(layer.id));
  }

  _getInitialEnabledRasterOverlayIds(graph) {
    const configuredOverlays = Array.isArray(this.mapSource?.rasterOverlays) ? this.mapSource.rasterOverlays : [];
    const saved = graph?.data?.map?.enabledRasterOverlayIds ?? graph?.data?.map?.geoJson?.enabledRasterOverlayIds;

    if (Array.isArray(saved)) {
      const configuredIds = new Set(configuredOverlays.map(l => String(l?.id ?? "").trim()).filter(Boolean));
      const filtered = saved.map(id => String(id)).filter(id => configuredIds.has(id));
      if (filtered.length > 0 || saved.length === 0) return filtered;
    }

    return configuredOverlays
      .filter(overlay => overlay?.enabled === true)
      .map(overlay => String(overlay.id));
  }

  _getSavedOrDefaultView({ center, zoom, bounds } = {}) {
    const c0 = Number(center?.[0]);
    const c1 = Number(center?.[1]);
    const z = Number(zoom);
    const hasSavedView = Number.isFinite(c0) && Number.isFinite(c1) && Number.isFinite(z)
      && (Math.abs(c0) > 0.000001 || Math.abs(c1) > 0.000001 || z !== 2);

    if (hasSavedView) return { center: [c0, c1], zoom: z };

    const defaultCenter = this.mapSource?.defaultCenter;
    const dz = Number(this.mapSource?.defaultZoom);
    if (Array.isArray(defaultCenter) && defaultCenter.length >= 2 && Number.isFinite(dz)) {
      const dc0 = Number(defaultCenter[0]);
      const dc1 = Number(defaultCenter[1]);
      if (Number.isFinite(dc0) && Number.isFinite(dc1)) return { center: [dc0, dc1], zoom: dz };
    }

    if (bounds) return null;
    return { center: [0, 0], zoom: 2 };
  }

  _getConfiguredBounds() {
    return this._boundsFromArray(this.mapSource?.bounds);
  }

  _getLayerBounds(layerDef) {
    return this._boundsFromArray(layerDef?.bounds) ?? this._getConfiguredBounds();
  }

  _boundsFromArray(value) {
    const b = value;
    if (!Array.isArray(b) || b.length < 2) return null;

    const sw = b[0];
    const ne = b[1];
    if (!Array.isArray(sw) || !Array.isArray(ne)) return null;

    const south = Number(sw[0]);
    const west = Number(sw[1]);
    const north = Number(ne[0]);
    const east = Number(ne[1]);
    if (![south, west, north, east].every(Number.isFinite)) return null;

    return this.L.latLngBounds([[south, west], [north, east]]);
  }

  _formatControlLabel(layerDef) {
    const group = String(layerDef?.group ?? "").trim();
    const label = String(layerDef?.label ?? layerDef?.id ?? t("Map.Layer")).trim();
    return group ? `${group} / ${label}` : label;
  }

  _boundsToArray(bounds) {
    return [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()]
    ];
  }

  _syncRendererLayerState() {
    if (!this.renderer) return;
    this.renderer._baseLayers = null;
    this.renderer._baseTileLayer = null;
    this.renderer._baseLayerControl = null;
    this.renderer._activeBaseLayerData = null;
  }

  _numberOrDefault(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  _escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }
}
