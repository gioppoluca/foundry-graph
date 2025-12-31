import { log, MODULE_ID } from './constants.js';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;


export class D3GraphApp extends HandlebarsApplicationMixin(ApplicationV2) {

  _linkingMode = false;
  _linkSourceNode = null;

  static DEFAULT_OPTIONS = {
    id: "fgraph-form",
    position: {
      width: 600,
      height: 750
    },
    classes: ["fgraph", "fgraph-form"],
    window: {
      title: "",//this.windowTitle,
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
      exportAction: D3GraphApp.svgToCanvas,
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

  async _onRender(context, options) {
    let el = this.element.querySelector("#d3-graph")
    this._disposers ??= [];
    this._disposers.push(() => this.renderer.teardown());

    const relationsSelect = this.element.querySelector('#relation-type');
    if (relationsSelect) {
      relationsSelect.addEventListener("change", (e) => this._onRelationsChange(e));
    }
    this._drawGraph(); // fresh
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
    };
  }

  static toggleLinkingMode(e) {
    this._linkingMode = !this._linkingMode;
    this._linkSourceNode = null;
    e.target.classList.toggle("active", this._linkingMode);
    const tCancel = game.i18n.localize("foundry-graph.Buttons.CancelLinking");
    const tLink = game.i18n.localize("foundry-graph.Buttons.LinkNodes");
    e.target.innerText = this._linkingMode ? tCancel : tLink;
    const tOn = game.i18n.localize("foundry-graph.Notifications.LinkingOn");
    const tOff = game.i18n.localize("foundry-graph.Notifications.LinkingOff");
    ui.notifications.info(this._linkingMode ? tOn : tOff);
    const relationId = this.element.querySelector("#relation-type")?.value || "";
    const relation = this.graph.relations.find(r => r.id === relationId);
    log("toggleLinkingMode", relationId, relation)
    this.renderer.setLinkingMode(this._linkingMode);
    this.renderer.setRelationData(relation);
  }


  static async svgToCanvas({ scale = 3 } = {}) {
    // 1) Grab the SVG element
    const svgElement = document.querySelector("#d3-graph");
    if (!svgElement) {
      error("SVG element not found");
      return;
    }
    //await this.renderer.render(svgElement, this.graph)
    // --- UX: show busy cursor + heads-up message
    const _root = document.body;
    const _prevCursor = _root.style.cursor;
    _root.style.cursor = "progress"; // or "wait"
    ui?.notifications?.info?.("Preparing high-resolution export… this may take a few seconds for large graphs.");
    try {
      // 2) Clone so we don’t mutate the on-screen SVG
      log("phase 2")
      const svgClone = svgElement.cloneNode(true);

      // 3) Ensure namespaces (helps some renderers)
      svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svgClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

      // 3.1) IMPORTANT: reset any zoom/pan transform so we export the full diagram
      // D3 applies transforms to the inner <g class="zoom-layer">; remove it in the clone.
      const zl = svgClone.querySelector("g.zoom-layer");
      if (zl) zl.removeAttribute("transform");

      // --- helper: convert any image href -> PNG dataURL (handles webp/png/jpg/blob)
      const hrefToPngDataURL = async (src) => {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        await img.decode();

        const w = Math.max(1, img.naturalWidth || img.width || 1);
        const h = Math.max(1, img.naturalHeight || img.height || 1);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0, w, h);
        return c.toDataURL("image/png");
      };

      // --- helper: inline all <image> elements in parallel (faster)
      const inlineImages = async () => {
        const images = Array.from(svgClone.querySelectorAll("image"));
        await Promise.all(
          images.map(async (imgElem) => {
            try {
              const href =
                imgElem.getAttribute("href") ||
                imgElem.getAttribute("xlink:href") ||
                imgElem.getAttributeNS("http://www.w3.org/1999/xlink", "href");
              if (!href || href.startsWith("data:")) return;

              const dataUrl = await hrefToPngDataURL(href);
              imgElem.setAttribute("href", dataUrl);
              imgElem.setAttributeNS("http://www.w3.org/1999/xlink", "href", dataUrl);

              // Ensure width/height exist for reliable layout
              if (!imgElem.getAttribute("width") || !imgElem.getAttribute("height")) {
                const probe = new Image();
                probe.src = dataUrl;
                await probe.decode();
                imgElem.setAttribute("width", String(probe.naturalWidth || 1));
                imgElem.setAttribute("height", String(probe.naturalHeight || 1));
              }
            } catch (err) {
              error("Error inlining image:", err);
            }
          })
        );
      };

      // --- helper: inline computed styles from the live DOM into the clone
      // We walk both trees in parallel and copy a whitelist of important properties.
      const inlineComputedStyles = () => {
        const whitelist = [
          // shape / lines
          "fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width",
          "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
          "paint-order", "opacity", "vector-effect", "shape-rendering", "image-rendering",
          // text
          "font-family", "font-size", "font-style", "font-weight", "font-variant",
          "letter-spacing", "word-spacing", "text-anchor", "dominant-baseline",
          "text-rendering", "white-space",
          // misc
          "color"
        ];

        const srcWalker = document.createTreeWalker(svgElement, NodeFilter.SHOW_ELEMENT);
        const dstWalker = document.createTreeWalker(svgClone, NodeFilter.SHOW_ELEMENT);

        // include root too
        const apply = (srcEl, dstEl) => {
          const cs = getComputedStyle(srcEl);
          const styleParts = [];
          for (const prop of whitelist) {
            const val = cs.getPropertyValue(prop);
            if (val) styleParts.push(`${prop}:${val}`);
          }
          if (styleParts.length) {
            // Preserve any existing inline style (rare) by appending
            const existing = dstEl.getAttribute("style");
            dstEl.setAttribute("style", existing ? `${existing};${styleParts.join(";")}` : styleParts.join(";"));
          }
        };

        apply(svgElement, svgClone);
        while (true) {
          const srcNext = srcWalker.nextNode();
          const dstNext = dstWalker.nextNode();
          if (!srcNext || !dstNext) break;
          apply(srcNext, dstNext);
        }
      };

      // 4) Inline images + styles
      await inlineImages();
      inlineComputedStyles();
      log("end phase 4")
      // 5) Use the background image dimensions to export the WHOLE graph
      let exportX = 0, exportY = 0, exportW, exportH;
      const bgImg =
        svgClone.querySelector("#background") ||
        svgClone.querySelector("g.zoom-layer > image") ||
        svgClone.querySelector('image[data-role="background"]') ||
        svgClone.querySelector("image.bg") ||
        svgClone.querySelector("image");

      log("BG:", bgImg)
      if (bgImg) {
        //        exportX = parseFloat(bgImg.getAttribute("x") ?? "0") || 0;
        //        exportY = parseFloat(bgImg.getAttribute("y") ?? "0") || 0;

        let wAttr = parseFloat(bgImg.getAttribute("width") ?? "NaN");
        let hAttr = parseFloat(bgImg.getAttribute("height") ?? "NaN");

        if (!Number.isFinite(wAttr) || !Number.isFinite(hAttr)) {
          const href =
            bgImg.getAttribute("href") ||
            bgImg.getAttribute("xlink:href") ||
            bgImg.getAttributeNS("http://www.w3.org/1999/xlink", "href");
          if (href) {
            const probe = new Image();
            probe.src = href;
            await probe.decode();
            wAttr = probe.naturalWidth;
            hAttr = probe.naturalHeight;
          }
        }

        exportW = Math.max(1, Math.floor(wAttr || 0));
        exportH = Math.max(1, Math.floor(hAttr || 0));
        log("bgImg export dimensions", exportX, exportY, exportW, exportH, bgImg)
        // Make the cloned SVG render exactly the whole background area
        svgClone.setAttribute("viewBox", `${exportX} ${exportY} ${exportW} ${exportH}`);
        svgClone.setAttribute("width", exportW);
        svgClone.setAttribute("height", exportH);
      } else {
        // Fallback: union bbox of content
        const bbox = svgElement.getBBox();
        //        exportX = bbox.x;
        //        exportY = bbox.y;
        exportW = Math.max(1, Math.floor(bbox.width || 1024));
        exportH = Math.max(1, Math.floor(bbox.height || 768));
        log("bbox export dimensions", exportX, exportY, exportW, exportH, bgImg)
        svgClone.setAttribute("viewBox", `${exportX} ${exportY} ${exportW} ${exportH}`);
        svgClone.setAttribute("width", exportW);
        svgClone.setAttribute("height", exportH);
      }
      log("end phase 5", svgClone)
      // 6) Serialize prepared SVG
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svgClone);

      // 7) Filename from graph name
      const rawName = this?.graph?.name || this?._graphName || "graph";
      const safeName = String(rawName).trim().replace(/[^\w.-]+/g, "_");

      // 8) Rasterize to high-res PNG (scale = DPR by default)
      const pixelRatio = Number.isFinite(scale) ? Math.max(1, scale) : (window.devicePixelRatio || 1);

      const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(exportW * pixelRatio);
        canvas.height = Math.round(exportH * pixelRatio);
        log("drawimage export dimensions", exportX, exportY, exportW, exportH, canvas.width, canvas.height)

        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.scale(pixelRatio, pixelRatio);
        ctx.drawImage(img, 0, 0, exportW, exportH);

        const pngUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.download = `${safeName}.png`;
        a.href = pngUrl;
        a.click();
      } finally {
        log("error create image")
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      log(game.i18n.localize("foundry-graph.Errors.ExportFailed"), err);
      ui?.notifications?.error?.(game.i18n.localize("foundry-graph.Errors.ExportFailed"));
    } finally {
      // --- Always restore cursor, even on error
      _root.style.cursor = _prevCursor || "";
      ui?.notifications?.info?.(game.i18n.localize("foundry-graph.Notifications.ExportFinished"));
    }
  }

    static async _saveGraph() {
    const api = game.modules.get("foundry-graph").api;

    const data = this.renderer.getGraphData()
    log("D3GraphApp._saveGraph", data)
    this.graph.data = data;
    await api.upsertGraph(this.graph);
    this.renderer.teardown();
    ui.notifications.info(game.i18n.localize("foundry-graph.Notifications.GraphSaved"));
    log(this)
    this.close()
  }


  async _drawGraph(data = null) {
    let svg = d3.select("#d3-graph");
    log("D3GraphApp._drawGraph", this.renderer, this.graph, svg)
    this.renderer.render(svg, this.graph)
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
}
