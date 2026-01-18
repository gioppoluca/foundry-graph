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


  // ========================================================================
  // Radial menu helper (used by renderers on right-click).
  // Renderers call this with screen coordinates so it works regardless of zoom.
  // ========================================================================
  _closeRadialMenu() {
    if (this._radialMenuCleanup) {
      try { this._radialMenuCleanup(); } catch (e) { /* noop */ }
      this._radialMenuCleanup = null;
    }
  }

  /**
   * Show a small radial menu near the cursor.
   *
   * @param {Object} opts
   * @param {number} opts.clientX
   * @param {number} opts.clientY
   * @param {Array<{id:string,label:string,icon?:string,enabled?:boolean,onClick:Function}>} opts.items
   */
  _showRadialMenu({ clientX, clientY, items }) {
    this._closeRadialMenu();
    const menu = document.createElement("div");
    menu.className = "fg-radial-menu";
    menu.style.position = "fixed";
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    menu.style.zIndex = "10000";
    menu.style.width = "1px";
    menu.style.height = "1px";
    menu.style.pointerEvents = "none";

    const radius = 46;
    const btnSize = 34;
    const safeItems = Array.isArray(items) ? items : [];
    const enabledItems = safeItems.filter(i => i && i.onClick);
    const step = enabledItems.length > 1 ? (Math.PI * 2) / enabledItems.length : 0;

    enabledItems.forEach((item, idx) => {
      const angle = -Math.PI / 2 + idx * step;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fg-radial-btn";
      btn.title = item.label ?? item.id;
      btn.style.position = "absolute";
      btn.style.left = `${x - btnSize / 2}px`;
      btn.style.top = `${y - btnSize / 2}px`;
      btn.style.width = `${btnSize}px`;
      btn.style.height = `${btnSize}px`;
      btn.style.borderRadius = "999px";
      btn.style.border = "1px solid rgba(0,0,0,0.35)";
      btn.style.background = "rgba(255,255,255,0.95)";
      btn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
      btn.style.pointerEvents = "auto";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.padding = "0";

      if (item.enabled === false) {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
      }

      const iconClass = item.icon || "fa-solid fa-circle";
      btn.innerHTML = `<i class="${iconClass}"></i>`;

      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try { await item.onClick(); } finally { this._closeRadialMenu(); }
      });

      menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    const onDocPointerDown = (ev) => {
      if (!menu.contains(ev.target)) this._closeRadialMenu();
    };
    const onKeyDown = (ev) => {
      if (ev.key === "Escape") this._closeRadialMenu();
    };

    setTimeout(() => {
      document.addEventListener("pointerdown", onDocPointerDown, true);
      window.addEventListener("keydown", onKeyDown, true);
    }, 0);

    this._radialMenuCleanup = () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      if (menu.parentNode) menu.parentNode.removeChild(menu);
    };
  }
}