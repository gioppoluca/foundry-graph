import { log } from "../constants.js";

// Base class for D3 renderers
export class BaseRenderer {

  static ID = "base";
  //render(svg, data, ctx) { throw new Error("BaseRenderer.render must be implemented"); }

  _attachDropHandlers(svgEl) {
    // store bound handlers so we can remove them in teardown
    log("BaseRenderer._attachDropHandlers", svgEl);
    this._dnd = this._dnd || {};
    this._dnd.onDragOver = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    //this._dnd.onDrop = onDrop;
    this._dnd.onDrop = this._onDrop?.bind(this);
    log(this._dnd.onDrop)
    const selection = d3.select(svgEl);
    log(selection)
    selection.on("dragover.drop", this._dnd.onDragOver);
    selection.on("drop.drop", this._dnd.onDrop);
//    svgEl.addEventListener("dragover", this._dnd.onDragOver);
//    svgEl.addEventListener("drop", this._dnd.onDrop);

  }

  _detachDropHandlers(svgEl) {
    if (!this._dnd || !svgEl) return;
    try {
      const selection = d3.select(svgEl);
      selection.on("dragover.drop", null);
      selection.on("drop.drop", null);
//      svgEl.removeEventListener("dragover", this._dnd.onDragOver);
//      svgEl.removeEventListener("drop", this._dnd.onDrop);
    } finally {
      this._dnd = null;
    }
  }

  /**
   * Checks if the graph data contains a node representing the given UUID.
   * @param {Object} graphData - The raw data of the graph
   * @param {string} uuid - The UUID of the actor/item/scene being deleted
   * @returns {boolean}
   */
  static hasEntity(graphData, uuid) {
     throw new Error("BaseRenderer.hasEntity must be implemented by subclasses");
  }

  /**
   * Removes the node (and associated links) for the given UUID.
   * @param {Object} graphData - The raw data of the graph
   * @param {string} uuid - The UUID of the entity to remove
   * @returns {Object} - The updated graphData
   */
  static removeEntity(graphData, uuid) {
    throw new Error("BaseRenderer.removeEntity must be implemented by subclasses");
  }

  _abstract(name) {
    throw new Error(`[Renderer] ${this.constructor.name}.${name} must be implemented`);
  }

  // ===== REQUIRED: must be overridden =====
  initializeGraphData(_graph) { this._abstract("initializeGraphData"); }
  render(_svgEl, _graph, _ctx) { this._abstract("render"); }
  getGraphData() { this._abstract("getGraphData"); }
  teardown() { this._abstract("teardown"); }
  _onDrop(_event) {
    log("base._onDrop")
    this._abstract("_onDrop");
  }
}