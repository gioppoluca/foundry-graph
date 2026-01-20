import { log, t } from "../constants.js";

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


  async svgToCanvas({ scale = 3 } = {}) {
    // 1) Grab the SVG element
    const svgElement = document.querySelector("#d3-graph");
    if (!svgElement) {
      log("SVG element not found");
      return;
    }
    //await this.renderer.render(svgElement, this.graph)
    // --- UX: show busy cursor + heads-up message
    const _root = document.body;
    const _prevCursor = _root.style.cursor;
    _root.style.cursor = "progress"; // or "wait"
    ui?.notifications?.info?.(t("Notifications.ExportPrepare"));
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
              log("Error inlining image:", err);
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
      log(t("Errors.ExportFailed"), err);
      ui?.notifications?.error?.(t("Errors.ExportFailed"));
    } finally {
      // --- Always restore cursor, even on error
      _root.style.cursor = _prevCursor || "";
      ui?.notifications?.info?.(t("Notifications.ExportFinished"));
    }
  }
}