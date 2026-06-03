import { log } from "../../constants.js";

/**
 * Base class for map source operators.
 *
 * Operators own map-source-specific behavior and are the only classes that
 * should interpret graph["theme-data"].mapSource.
 */
export class BaseMapOperator {
  constructor({ renderer, L, themeData } = {}) {
    this.renderer = null;
    this.L = null;
    this.themeData = {};
    this.mapSource = {};
    this.map = null;

    this.configure({ renderer, L, themeData });
  }

  /**
   * Refresh the runtime context used by the operator.
   *
   * The renderer owns the graph lifecycle, but the operator owns the meaning of
   * graph["theme-data"].mapSource. Keeping this method in the base class makes
   * all concrete operators consume theme-data in the same way.
   */
  configure({ renderer, L, themeData } = {}) {
    if (!renderer) throw new Error(`${this.constructor.name} requires a renderer instance.`);
    if (!L) throw new Error(`${this.constructor.name} requires the Leaflet global.`);

    this.renderer = renderer;
    this.L = L;
    this.themeData = this._clone(themeData ?? {});
    this.mapSource = this._clone(this.themeData?.mapSource ?? {});

    this._log("configured", {
      themeId: this.themeData?.id ?? null,
      operator: this.mapSource?.operator ?? null,
      type: this.mapSource?.type ?? null
    });

    return this;
  }

  get id() {
    return String(this.mapSource?.operator ?? "base");
  }

  get type() {
    return String(this.mapSource?.type ?? "unknown");
  }

  get isScaledSceneSupported() {
    return this.mapSource?.scaledScene?.enabled === true;
  }

  getThemeData() {
    return this._clone(this.themeData);
  }

  getMapSource() {
    return this._clone(this.mapSource);
  }

  /**
   * Create and initialize the Leaflet map for this source.
   *
   * @param {HTMLElement} container
   * @param {Object} context
   * @param {Object} context.graph
   * @param {Array<number>} context.center
   * @param {number} context.zoom
   * @returns {Promise<L.Map>|L.Map}
   */
  async createMap(_container, _context = {}) {
    throw new Error(`${this.constructor.name} must implement createMap().`);
  }

  getInstructions() {
    return "Drop Actors/Scenes/Items/Journal pages on the map to create markers. Drag markers to reposition. Right-click a marker to radial menu.";
  }

  getGraphMapData(currentMapData = {}) {
    return this._clone(currentMapData ?? {});
  }

  getScaledSceneZoomInfo() {
    return { enabled: false, reason: "scaled-scene-not-supported-for-map-source" };
  }

  getScaledSceneScaleInfo() {
    return {
      ok: false,
      status: "error",
      reason: "scaled-scene-not-supported-for-map-source",
      zoomInfo: this.getScaledSceneZoomInfo()
    };
  }

  async getScaledSceneWallData(_scaleInfo) {
    return [];
  }

  teardown() {
    this.map = null;
  }

  _clone(value) {
    return foundry.utils.deepClone(value);
  }

  _log(...args) {
    log(`${this.constructor.name}:`, ...args);
  }
}