import { log } from "../constants.js";

// Base class for D3 renderers
export class BaseRenderer {

  static ID = "base";
  render(svg, data, ctx) { throw new Error("BaseRenderer.render must be implemented"); }

  _attachDropHandlers(svgEl, onDrop) {
    // store bound handlers so we can remove them in teardown
    log("BaseRenderer._attachDropHandlers", svgEl, onDrop);
    this._dnd = this._dnd || {};
    this._dnd.onDragOver = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    this._dnd.onDrop = onDrop;

    svgEl.addEventListener("dragover", this._dnd.onDragOver);
    svgEl.addEventListener("drop", this._dnd.onDrop);
  }

  _detachDropHandlers(svgEl) {
    if (!this._dnd || !svgEl) return;
    try {
      svgEl.removeEventListener("dragover", this._dnd.onDragOver);
      svgEl.removeEventListener("drop", this._dnd.onDrop);
    } finally {
      this._dnd = null;
    }
  }

  _abstract(name) {
    throw new Error(`[Renderer] ${this.constructor.name}.${name} must be implemented`);
  }

  // ===== REQUIRED: must be overridden =====
  setWindow(_element) { this._abstract("setWindow"); }
  initializeGraphData(_graph) { this._abstract("initializeGraphData"); }
  render(_svgEl, _graph, _ctx) { this._abstract("render"); }
  getGraphData() { this._abstract("getGraphData"); }
  teardown() { this._abstract("teardown"); }
}