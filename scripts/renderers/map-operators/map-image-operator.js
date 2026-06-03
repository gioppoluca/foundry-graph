import { log } from "../../constants.js";
import { BaseMapOperator } from "./base-map-operator.js";

export class MapImageOperator extends BaseMapOperator {
  getInstructions() {
    return "Drop Actors/Scenes/Items/Journal pages on the image map to create markers. Drag markers to reposition. Right-click a marker to radial menu.";
  }

  async createMap(container, { graph, center = null, zoom = null } = {}) {
    this.graph = graph ?? this.renderer?.graph ?? null;

    const url = this._getBackgroundRasterUrl(this.graph);
    this._log("createMap:start", {
      themeId: this.themeData?.id ?? null,
      sourceType: this.mapSource?.type ?? null,
      imageFrom: this.mapSource?.imageFrom ?? null,
      hasImageUrl: Boolean(url),
      center,
      zoom
    });

    if (!url) {
      ui?.notifications?.warn?.("This custom image map has no background image configured.");
      throw new Error("Image map operator requires graph.background.image.");
    }

    const size = await this._getBackgroundRasterSize(this.graph, url);
    const width = Number(size?.width);
    const height = Number(size?.height);

    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      ui?.notifications?.warn?.("Could not read the custom image map size.");
      throw new Error("Image map operator could not determine background image dimensions.");
    }

    const minZoom = Number.isFinite(Number(this.mapSource?.minZoom)) ? Number(this.mapSource.minZoom) : -5;
    const maxZoom = Number.isFinite(Number(this.mapSource?.maxZoom)) ? Number(this.mapSource.maxZoom) : 5;

    const map = this.L.map(container, {
      zoomControl: true,
      attributionControl: true,
      crs: this.L.CRS.Simple,
      minZoom,
      maxZoom
    });

    this.map = map;
    this.renderer._map = map;

    const bounds = this.L.latLngBounds([[0, 0], [height, width]]);
    this._imageBounds = bounds;
    this._imageOverlay = this.L.imageOverlay(url, bounds, {
      interactive: false,
      crossOrigin: this.mapSource?.crossOrigin ?? true
    }).addTo(map);

    this._syncRendererLayerState();

    const maxBoundsPadding = Number(this.mapSource?.maxBoundsPadding ?? 0.25);
    try {
      map.setMaxBounds(bounds.pad(Number.isFinite(maxBoundsPadding) ? maxBoundsPadding : 0.25));
    } catch (e) {
      this._log("createMap:setMaxBounds failed", e);
    }

    const savedImageData = this.graph?.data?.map?.image;
    const hasSavedImageView = savedImageData?.url === url && Number(savedImageData?.width) === width && Number(savedImageData?.height) === height;
    const c0 = Number(center?.[0]);
    const c1 = Number(center?.[1]);
    const z = Number(zoom);
    const looksLikeNonDefaultSavedView = Number.isFinite(c0) && Number.isFinite(c1) && Number.isFinite(z)
      && (Math.abs(c0) > 0.000001 || Math.abs(c1) > 0.000001 || z !== 2);
    const hasUsableSavedView = (hasSavedImageView || looksLikeNonDefaultSavedView)
      && Number.isFinite(c0) && Number.isFinite(c1) && Number.isFinite(z);

    const savedView = hasUsableSavedView ? { center: [c0, c1], zoom: z } : null;

    if (savedView) {
      map.setView(savedView.center, savedView.zoom, { animate: false });
      this._log("createMap:restored-saved-view", savedView);
    } else {
      map.fitBounds(bounds, { animate: false });
      this._log("createMap:fit-image-bounds", {
        width,
        height,
        center: map.getCenter?.(),
        zoom: map.getZoom?.()
      });
    }

    this._imageOverlay.once?.("load", () => {
      this._refreshSizeAndRestoreView(map, savedView, "image-loaded");
    });

    // Image overlays can finish loading after the renderer's first delayed
    // invalidateSize() pass. Run one additional image-operator-owned pass so
    // the saved CRS.Simple viewport is restored after the image is present.
    setTimeout(() => {
      this._refreshSizeAndRestoreView(map, savedView, "post-create-delayed");
    }, 100);

    if (this.graph?.data) {
      this.graph.data.map = this.getGraphMapData(this.graph.data.map ?? { center: [0, 0], zoom: 2 });
      this._log("createMap:graph-image-data-synced", this.graph.data.map?.image);
    }

    this._log("createMap:done", {
      currentCenter: map.getCenter?.(),
      currentZoom: map.getZoom?.(),
      width,
      height
    });

    return map;
  }

  getGraphMapData(currentMapData = {}) {
    const data = this._clone(currentMapData ?? {});
    delete data.baseLayer;
    delete data.baseLayerId;

    const image = this._getCurrentImageData();
    if (image) data.image = image;

    this._log("getGraphMapData", {
      imageUrl: data.image?.url ?? null,
      width: data.image?.width ?? null,
      height: data.image?.height ?? null
    });

    return data;
  }

  getScaledSceneZoomInfo() {
    const result = { enabled: false, reason: "scaled-scene-not-supported-for-image-map" };
    this._log("scaled-zoom-info", result);
    return result;
  }

  getScaledSceneScaleInfo() {
    const result = {
      ok: false,
      status: "error",
      reason: "scaled-scene-not-supported-for-image-map",
      zoomInfo: this.getScaledSceneZoomInfo()
    };
    this._log("scaled-scale-info", result);
    return result;
  }

  async getScaledSceneWallData(_scaleInfo) {
    this._log("walls:skipped-image-map");
    return [];
  }

  teardown() {
    this._imageOverlay = null;
    this._imageBounds = null;
    super.teardown();
  }

  _refreshSizeAndRestoreView(map, savedView, reason) {
    if (!map) return;

    try {
      map.invalidateSize?.({ pan: false });
      this._log("image-map-size-refresh", {
        reason,
        restoreView: Boolean(savedView),
        center: savedView?.center ?? null,
        zoom: savedView?.zoom ?? null
      });
    } catch (e) {
      this._log("image-map-size-refresh failed", { reason, error: e });
    }

    if (!savedView) return;

    try {
      map.setView(savedView.center, savedView.zoom, { animate: false });
      this._log("image-map-view-restored-after-size-refresh", {
        reason,
        center: savedView.center,
        zoom: savedView.zoom,
        currentCenter: map.getCenter?.(),
        currentZoom: map.getZoom?.()
      });
    } catch (e) {
      this._log("image-map-view-restore-after-size-refresh failed", { reason, error: e });
    }
  }

  _syncRendererLayerState() {
    if (!this.renderer) return;
    this.renderer._baseLayers = null;
    this.renderer._baseTileLayer = null;
    this.renderer._baseLayerControl = null;
    this.renderer._activeBaseLayerData = null;
  }

  _getCurrentImageData() {
    const url = this._getBackgroundRasterUrl(this.graph);
    if (!url) return null;

    const size = this._imageBounds;
    const southWest = size?.getSouthWest?.();
    const northEast = size?.getNorthEast?.();

    const width = Number(northEast?.lng);
    const height = Number(northEast?.lat);

    return {
      url,
      width: Number.isFinite(width) && width > 0 ? width : Number(this.graph?.background?.width) || null,
      height: Number.isFinite(height) && height > 0 ? height : Number(this.graph?.background?.height) || null,
      bounds: [[0, 0], [Number.isFinite(height) ? height : 0, Number.isFinite(width) ? width : 0]]
    };
  }

  _getBackgroundRasterUrl(graph) {
    if (this.mapSource?.imageFrom && this.mapSource.imageFrom !== "background") {
      this._log("unsupported imageFrom value; falling back to graph background", this.mapSource.imageFrom);
    }

    const bg = graph?.background;
    const img = (typeof bg?.image === "string") ? bg.image.trim() : "";
    return img ? img : null;
  }

  async _getBackgroundRasterSize(graph, url) {
    const bg = graph?.background;
    const w = Number(bg?.width);
    const h = Number(bg?.height);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      this._log("image-size:from-graph-background", { width: w, height: h });
      return { width: w, height: h };
    }

    this._log("image-size:loading-natural-size", { url });

    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const natural = {
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        };
        this._log("image-size:from-natural-size", natural);
        resolve(natural);
      };
      img.onerror = () => {
        this._log("image-size:load-failed", { url });
        resolve(null);
      };
      img.src = url;
    });
  }
}
