import { log, MODULE_ID, t } from './constants.js';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;


export class D3GraphApp extends HandlebarsApplicationMixin(ApplicationV2) {

  _linkingMode = false;
  _linkSourceNode = null;

  static DEFAULT_OPTIONS = {
    id: "fgraph-form",
    position: {
      width: 800,
      height: 850
    },
    classes: ["fgraph", "fgraph-form"],
    window: {
      title: "",
      resizable: true,
    },
    dragDrop: [{
      dragSelector: '[data-drag="true"]', dropSelector: '.drop-zone',
      callbacks: {
        dragover: this._onDragOver,
        drop: this._onDrop
      }
    }],
    minimizable: false,
    resizable: false,
    submitOnChange: false,
    actions: {
      saveAction: D3GraphApp._saveGraph,
      exportAction: D3GraphApp.exportDownload,
      exportSceneAction: D3GraphApp.exportToScene,
      exportScaledSceneAction: D3GraphApp.exportToScaledScene,
      linkNodes: D3GraphApp.toggleLinkingMode

    },
    closeOnSubmit: true
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/d3-graph-app.html`
    },
    footer: {
      template: `modules/${MODULE_ID}/templates/d3-graph-buttons.html`
    }
  };

  constructor(options = {}) {
    super(options);
    log("D3GraphApp.constructor options", options, this)
    if (this.graph) log("graph already set", this.graph)
    this.api = game.modules.get(MODULE_ID)?.api;
    this.graph = foundry.utils.deepClone(options.graph || {});
    this.renderer = this.api.getRenderer(options.graph?.renderer);
    this.renderer?.setScaledSceneAvailabilityChangeHandler?.(() => this._syncScaledSceneButtonState());
    log("D3GraphApp.constructor renderer", this.renderer)
    // just once we remove fix the window accordingly to the need of the renderer
    log("D3GraphApp.constructor", options, this.renderer)
    this._svgWidth = options.graph.width || 800;
    this._svgHeight = options.graph.height || 600;
    this._graphName = options.graph.name || "test";
    this._graphDescription = options.graph.desc || "desc";
    this._graphId = options.graph.id || "test";
    this._mode = options.mode || "new";
    this.onCloseCallback = options.onCloseCallback;
    //    this._rendererHandlersRegistered = false;
  }

  get title() {
    return t("Window.GraphTitle") + " : " + this.graph.name;
  }

  async _onRender(context, options) {
    let el = this.element.querySelector("#d3-graph")
    this._disposers ??= [];
    this._disposers.push(() => this.renderer.teardown());

    const relationsSelect = this.element.querySelector('#relation-type');
    if (relationsSelect) {
      relationsSelect.addEventListener("change", (e) => this._onRelationsChange(e));
    }
    this._drawGraph(); // fresh
    this._syncScaledSceneButtonState();
  }

  _onRelationsChange(event) {
    const relationId = event.target.value;
    const relation = this.graph.relations.find(r => r.id === relationId);
    log("_onRelationsChange", relationId, relation)
    this.renderer.setRelationData(relation);
  }


  async _prepareContext(options) {
    log("PREPARE CONTEXT", options);
    log(this._mode)

    if ((this._mode === "edit") || (this._mode === "view")) {
      this._graphName = this.graph.name;
      this._graphDescription = this.graph.desc;
      this._svgWidth = this.graph.width;
      this._svgHeight = this.graph.height;

    }
    return {
      ...super._prepareContext(options),
      relations: this.graph?.relations || [],
      isEdit: this._mode === "edit" || this._mode === "new",
      instructions: this.renderer?.instructions || "No instructions available",
      isLinkNodesVisible: this.renderer?.isLinkNodesVisible ?? true,
      isRelationSelectVisible: this.renderer?.isRelationSelectVisible ?? true,
      isSaveNewSceneVisible: this.renderer?.isSaveNewSceneVisible ?? false,
      isSaveNewSceneScaledVisible: this.renderer?.isSaveNewSceneScaledVisible ?? false,
      isSaveNewSceneScaledEnabled: this._isSaveNewSceneScaledEnabled()
    };
  }

  static toggleLinkingMode(e) {
    this._linkingMode = !this._linkingMode;
    this._linkSourceNode = null;
    e.target.classList.toggle("active", this._linkingMode);
    const tCancel = t("Buttons.CancelLinking");
    const tLink = t("Buttons.LinkNodes");
    e.target.innerText = this._linkingMode ? tCancel : tLink;
    const tOn = t("Notifications.LinkingOn");
    const tOff = t("Notifications.LinkingOff");
    ui.notifications.info(this._linkingMode ? tOn : tOff);
    const relationId = this.element.querySelector("#relation-type")?.value || "";
    const relation = this.graph.relations.find(r => r.id === relationId);
    log("toggleLinkingMode", relationId, relation)
    this.renderer.setLinkingMode(this._linkingMode);
    this.renderer.setRelationData(relation);
  }

  async svgToCanvas({ scale = 3, destination = "download" } = {}) {
    log("svgToCanvas called - use renderer method")
    log("svgToCanvas params", { scale, destination })
    return await this.renderer.exportToPNG({ scale, destination });
  }

  static async _saveGraph() {
    const api = game.modules.get("foundry-graph").api;

    let data = this.renderer.getGraphData()
    log("D3GraphApp._saveGraph", data)
    // Refresh labels/images from live Foundry documents before persisting
    data = await this.renderer.syncLabels(data);
    this.graph.data = data;
    await api.upsertGraph(this.graph);
    this.renderer.teardown();
    ui.notifications.info(t("Notifications.GraphSaved"));
    log(this)
    this.close()
  }


  async _drawGraph(data = null) {
    let svg = d3.select("#d3-graph");
    log("D3GraphApp._drawGraph", this.renderer, this.graph, svg)
    if (this.graph?.data) {
      this.graph.data = await this.renderer.syncLabels(
        foundry.utils.deepClone(this.graph.data)
      );
    }
    const relationId = this.element.querySelector("#relation-type")?.value || "";
    const relation = this.graph.relations.find(r => r.id === relationId);
    this.renderer.setRelationData(relation);
    this.renderer.render(svg, this.graph)
  }

  _isSaveNewSceneScaledEnabled() {
    return typeof this.renderer?.isSaveNewSceneScaledEnabled === "function"
      ? this.renderer.isSaveNewSceneScaledEnabled()
      : false;
  }

  _syncScaledSceneButtonState() {
    const button = this.element?.querySelector?.("#export-scaled-scene-btn");
    if (!button) return;

    const enabled = this._isSaveNewSceneScaledEnabled();
    button.disabled = !enabled;
    button.title = enabled
      ? ""
      : "Scaled scene export is available only when the map is close enough to the provider native max zoom.";
  }

  async _onClose(options) {
    log("D3GraphApp._onClose | Running disposers");

    // 1. Execute all registered cleanup functions.
    this._disposers?.forEach(d => d());

    // 2. Clear the disposers array.
    this._disposers = [];

    // 3. If an onCloseCallback is defined, execute it.
    if (typeof this.onCloseCallback === 'function') {
      log("D3GraphApp._onClose | Executing dashboard refresh callback");
      this.onCloseCallback();
    }

    // 4. Call the parent class's _onClose method.
    await super._onClose(options);
  }

  /**
 * Static action handler for "Download PNG" button
 */
  static async exportDownload(event, target, application) {
    event?.preventDefault?.();
    console.log("Export Download clicked", { event, target, application });
    console.log(this)
    await this.svgToCanvas({ scale: 3, destination: "download" });
  }

  static async exportToScaledScene(event, target, application) {
    event?.preventDefault?.();

    if (!this._isSaveNewSceneScaledEnabled()) {
      ui.notifications.warn("Scaled scene export is available only when the map is close enough to the provider native max zoom.");
      return;
    }

    const scaleInfo = this.renderer?.getScaledSceneScaleInfo?.();
    if (!scaleInfo) {
      ui.notifications.warn("Scaled scene export is not available for this renderer.");
      return;
    }

    console.log("[foundry-graph] Scaled scene scale info", scaleInfo);

    if (!scaleInfo.ok) {
      const scaleText = Number.isFinite(scaleInfo.scale) ? ` Scale: ${scaleInfo.scale.toFixed(2)}.` : "";
      ui.notifications.warn(`Scaled scene check failed: ${scaleInfo.reason}.${scaleText}`);
      return;
    }

    try {
      ui.notifications.info(
        `Saving scaled scene image. Scale: ${scaleInfo.scale.toFixed(2)}; grid: ${scaleInfo.finalGridSize.toFixed(2)} px / ${scaleInfo.feetPerSquare} ft.`
      );

      let wallData = null
      try {
        wallData = await this.renderer?.getScaledSceneWallData?.(scaleInfo);
        log("[foundry-graph] Scaled scene wall data", wallData);
      } catch (wallErr) {
        log("[foundry-graph] Failed to retrieve scaled scene wall data", wallErr);
      }

      const filePath = await this.svgToCanvas({
        scale: scaleInfo.scale,
        destination: "data-folder"
      });

      if (!filePath) {
        ui.notifications.warn("Scaled scene export did not return a saved image path.");
        return;
      }

      const scene = await this._createSceneFromGraphImage(filePath, {
        gridSize: scaleInfo.finalGridSize,
        gridDistance: scaleInfo.feetPerSquare,
        gridUnits: "ft"
      });

      if (Array.isArray(wallData) && wallData.length > 0) {
        await scene.createEmbeddedDocuments("Wall", wallData);
      }
    } catch (err) {
      console.error("Scaled scene export failed:", err);
      ui.notifications.error("Failed to create scaled scene from map image");
    }
  }

  // Add a new export button handler in your renderer class
  static async exportToScene(event, target, application) {
    event?.preventDefault?.();
    console.log("Export to Scene clicked", { event, target, application });
    console.log(this)

    try {
      ui.notifications.info("Saving graph to world folder...");

      // Call svgToCanvas with new destination parameter
      const filePath = await this.svgToCanvas({
        scale: 3,
        destination: "data-folder"
      });
      log("Exported file path:", filePath);

      if (filePath) {
        ui.notifications.success(`Graph saved: ${filePath}`);

        /*
        // Store path on graph document for scene transformation
        await this.graph.update({
          system: {
            ...this.graph.system,
            exportedImagePath: filePath
          }
        });
*/
        // Optional: Prompt user to create scene now
        const createScene = await Dialog.confirm({
          title: "Create Scene from Graph?",
          content: `<p>Graph image saved to <code>${filePath}</code>.</p><p>Create a new scene using this image as background?</p>`,
          yes: () => true,
          no: () => false
        });

        if (createScene) {
          await this._createSceneFromGraphImage(filePath);
        }
      }
    } catch (err) {
      console.error("Export to folder failed:", err);
      ui.notifications.error("Failed to save graph image to world folder");
    }
  }

  /**
   * Create a new Foundry Scene using the exported graph image
   * @param {string} imagePath - Relative path from _savePNGToDataFolder
   * @returns {Promise<Scene>}
   * @private
   */
  async _createSceneFromGraphImage(imagePath, options = {}) {
    const graph = this.graph;

    const texture = await loadTexture(imagePath);
    const gridSize = options.gridSize ?? 100;
    const gridDistance = options.gridDistance ?? 1;
    const gridUnits = options.gridUnits ?? "units";

    const sceneData = {
      name: `${graph.name} - Map`,

      width: texture.width,
      height: texture.height,
      padding: 0,

      background: {
        src: imagePath
      },

      grid: {
        type: CONST.GRID_TYPES.SQUARE,
        size: gridSize,
        distance: gridDistance,
        units: gridUnits
      }
    };

    const scene = await Scene.create(sceneData);
    ui.notifications.info(`Scene created: ${scene.name}`);
    return scene;
  }
}
