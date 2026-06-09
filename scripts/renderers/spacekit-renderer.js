import { JSON_graph_types, log, safeUUID, t, tf } from "../constants.js";
import { BaseRenderer } from "./base-renderer.js";

const { DialogV2 } = foundry.applications.api;

const SPACEKIT_BASE_PATH = "modules/foundry-graph/assets/spacekit";
const DEFAULT_JD = 2451545.0;

/**
 * Spacekit renderer
 *
 * This renderer intentionally does not use the Solar System presets.  It uses
 * the Spacekit canvas as a 3D stage for fantasy bodies defined by graph symbols.
 * Distances are visual diagram units, not astronomical units.
 */
export class SpacekitRenderer extends BaseRenderer {
  static ID = "spacekit";

  constructor() {
    super();
    this.graph = null;
    this._svg = null;
    this._container = null;
    this._stage = null;
    this._toolbar = null;
    this._bodyList = null;
    this._simulation = null;
    this._resizeFrame = null;
    this._resizeObserver = null;
    this._onWindowResize = null;
    this._lastStageSize = { width: 0, height: 0 };
    this._objects = new Map();
    this._running = false;
    this._animationFrame = null;
    this._startedAt = 0;
    this._elapsedBeforeStop = 0;
    this._dropHandlers = null;
  }

  get instructions() {
    return t("Spacekit.Instructions");
  }

  get isLinkNodesVisible() {
    return false;
  }

  get isRelationSelectVisible() {
    return false;
  }

  initializeGraphData() {
    return {
      simulation: {
        running: false,
        jd: DEFAULT_JD,
        jdPerSecond: 5,
        unitsPerAu: 1,
        scaleMode: "visual"
      },
      nodes: []
    };
  }

  hasEntity(graphOrData, uuid) {
    const data = graphOrData?.data ?? graphOrData;
    return !!data?.nodes?.some(n => n.uuid === uuid);
  }

  removeEntity(graphOrData, uuid) {
    const data = graphOrData?.data ?? graphOrData;
    if (!Array.isArray(data?.nodes)) return graphOrData;
    data.nodes = data.nodes.filter(n => n.uuid !== uuid);
    return graphOrData;
  }

  setRelationData(_relation) {
    // Relations are intentionally unused in the Spacekit renderer.
  }

  getGraphData() {
    const data = this.graph?.data ?? this.initializeGraphData();
    return {
      simulation: {
        ...this.initializeGraphData().simulation,
        ...(data.simulation ?? {}),
        running: false
      },
      nodes: (data.nodes ?? []).map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        bodyType: n.bodyType,
        symbolId: n.symbolId,
        textureId: n.textureId,
        texture: n.texture,
        parentId: n.parentId ?? null,
        radius: Number(n.radius) || 1,
        position: Array.isArray(n.position) ? n.position.slice(0, 3) : null,
        visualOrbit: n.visualOrbit ? { ...n.visualOrbit } : null
      }))
    };
  }

  render(svg, graph = null) {
    if (graph) this._ensureGraph(graph);
    if (!this.graph) return;

    this.teardown();

    this._svg = svg;
    const svgNode = svg?.node ? svg.node() : svg;
    this._container = svgNode?.closest?.("#d3-graph-container") ?? svgNode?.parentElement;
    if (!this._container) return;

    svg?.selectAll?.("*").remove?.();
    if (svgNode) svgNode.style.display = "none";

    this._container.querySelectorAll(".fg-spacekit-stage").forEach(el => el.remove());
    this._container.classList.add("fg-spacekit-container");

    this._stage = document.createElement("div");
    this._stage.className = "fg-spacekit-stage";
    this._stage.style.backgroundImage = this.graph.background?.image ? `url('${this.graph.background.image}')` : "";
    this._container.appendChild(this._stage);

    this._attachDropHandlers();
    this._attachResizeHandlers();
    this._setStageSize();
    this._renderToolbar();
    this._renderBodyList();
    this._renderSimulation();
  }

  teardown() {
    this.stopSimulation({ persist: false });
    this._detachDropHandlers();
    this._detachResizeHandlers();

    try {
      this._simulation?.stop?.();
    } catch (_err) { /* ignore */ }

    this._objects.clear();
    this._simulation = null;

    if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = null;
    this._lastStageSize = { width: 0, height: 0 };

    if (this._stage?.parentNode) this._stage.parentNode.removeChild(this._stage);
    if (this._container) this._container.classList.remove("fg-spacekit-container");

    const svgNode = this._svg?.node ? this._svg.node() : this._svg;
    if (svgNode) svgNode.style.display = "";

    this._stage = null;
    this._toolbar = null;
    this._bodyList = null;
    this._container = null;
    this._svg = null;
  }

  startSimulation({ persist = true } = {}) {
    if (this._running) return;
    this._running = true;
    if (persist && this.graph?.data?.simulation) this.graph.data.simulation.running = true;
    this._startedAt = performance.now();

    try {
      this._simulation?.start?.();
    } catch (err) {
      log("Spacekit start failed", err);
    }

    this._applyOrbitPositions(this._elapsedBeforeStop);
    this._forceSimulationUpdate();
    this._tickOrbits();
    this._syncToolbar();
  }

  stopSimulation({ persist = true } = {}) {
    if (this._animationFrame) cancelAnimationFrame(this._animationFrame);
    this._animationFrame = null;
    if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = null;

    if (this._running) {
      this._elapsedBeforeStop += (performance.now() - this._startedAt) / 1000;
    }

    this._running = false;
    if (persist && this.graph?.data?.simulation) this.graph.data.simulation.running = false;

    try {
      this._simulation?.stop?.();
    } catch (_err) { /* ignore */ }

    this._forceSimulationUpdate();
    this._syncToolbar();
  }

  toggleSimulation() {
    if (this._running) this.stopSimulation();
    else this.startSimulation();
  }

  async exportToPNG({ scale = 3, destination = "download" } = {}) {
    const canvas = this._stage?.querySelector?.("canvas");
    if (!canvas) {
      ui.notifications.warn(t("Spacekit.ExportUnavailable"));
      return null;
    }

    let blob = null;
    try {
      blob = await this._captureSpacekitSceneBlob(scale);
    } catch (err) {
      log("Spacekit export failed", err);
      ui.notifications.error(t("Errors.ExportFailed"));
      return null;
    }

    const rawName = this.graph?.name || "spacekit-graph";
    const safeName = String(rawName).trim().replace(/[^\w.-]+/g, "_");

    if (destination === "data-folder") {
      return this.savePNGToDataFolder(blob, safeName, { overwrite: true });
    }

    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.download = `${safeName}.png`;
      a.href = url;
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
    return null;
  }

  async _captureSpacekitSceneBlob(scale = 1) {
    await this._waitForAnimationFrame();

    const Spacekit = this._spacekit();
    const THREE = Spacekit?.THREE ?? globalThis.THREE;
    const RendererClass = THREE?.WebGLRenderer;
    const scene = this._simulation?.getScene?.() ?? this._simulation?.scene;
    const liveRenderer = this._simulation?.getRenderer?.() ?? this._simulation?.renderer;
    const liveCamera = this._simulation?.getViewer?.()?.get3jsCamera?.()
      ?? this._simulation?.camera?.get3jsCamera?.();

    if (!RendererClass || !scene || !liveCamera) {
      throw new Error("Spacekit scene is not ready for export");
    }

    const stageWidth = this._stage?.clientWidth || liveRenderer?.domElement?.clientWidth || liveRenderer?.domElement?.width || 1024;
    const stageHeight = this._stage?.clientHeight || liveRenderer?.domElement?.clientHeight || liveRenderer?.domElement?.height || 512;
    const exportWidth = Math.max(1, Math.floor(Number(this.graph?.width) || Number(this.graph?.background?.width) || stageWidth));
    const exportHeight = Math.max(1, Math.floor(Number(this.graph?.height) || Number(this.graph?.background?.height) || stageHeight));
    const pixelRatio = Math.max(1, Number(scale) || 1);

    const exportRenderer = new RendererClass({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    const exportCamera = liveCamera.clone?.() ?? liveCamera;
    const previousAspect = exportCamera === liveCamera ? liveCamera.aspect : null;

    try {
      exportRenderer.setPixelRatio?.(pixelRatio);
      exportRenderer.setSize?.(exportWidth, exportHeight, false);
      exportRenderer.setClearColor?.(0x000000, 1);
      exportRenderer.autoClear = true;

      if (liveRenderer) {
        if ("outputEncoding" in exportRenderer && "outputEncoding" in liveRenderer) {
          exportRenderer.outputEncoding = liveRenderer.outputEncoding;
        }
        if ("toneMapping" in exportRenderer && "toneMapping" in liveRenderer) {
          exportRenderer.toneMapping = liveRenderer.toneMapping;
        }
        if ("toneMappingExposure" in exportRenderer && "toneMappingExposure" in liveRenderer) {
          exportRenderer.toneMappingExposure = liveRenderer.toneMappingExposure;
        }
      }

      exportCamera.aspect = exportWidth / exportHeight;
      exportCamera.updateProjectionMatrix?.();
      exportCamera.updateMatrixWorld?.(true);

      this._applyOrbitPositions(this._currentElapsedSeconds());
      scene.updateMatrixWorld?.(true);
      exportRenderer.clear?.(true, true, true);
      exportRenderer.render(scene, exportCamera);

      return await this._canvasToBlob(exportRenderer.domElement);
    } finally {
      if (previousAspect !== null) {
        liveCamera.aspect = previousAspect;
        liveCamera.updateProjectionMatrix?.();
      }
      exportRenderer.dispose?.();
      exportRenderer.forceContextLoss?.();
    }
  }

  _canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        }, "image/png");
        return;
      }

      try {
        resolve(this._dataUrlToBlob(canvas.toDataURL("image/png")));
      } catch (err) {
        reject(err);
      }
    });
  }

  _dataUrlToBlob(dataUrl) {
    const [header, payload] = String(dataUrl).split(",");
    const mime = header.match(/^data:([^;]+);base64$/)?.[1] ?? "image/png";
    const binary = atob(payload ?? "");
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
  }

  _waitForAnimationFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  _ensureGraph(graph) {
    this.graph = graph;
    if (!this.graph.data) this.graph.data = this.initializeGraphData();
    if (!this.graph.data.simulation) this.graph.data.simulation = this.initializeGraphData().simulation;
    if (!Array.isArray(this.graph.data.nodes)) this.graph.data.nodes = [];
    if (!Array.isArray(this.graph.symbols)) this.graph.symbols = [];
  }

  _spacekit() {
    return globalThis.Spacekit?.default ?? globalThis.Spacekit;
  }

  _setStageSize() {
    if (!this._container || !this._stage) return;

    const width = Number(this.graph?.width) || Number(this.graph?.background?.width) || 1024;
    const height = Number(this.graph?.height) || Number(this.graph?.background?.height) || 512;

    this._container.style.aspectRatio = `${width} / ${height}`;
    this._stage.style.aspectRatio = `${width} / ${height}`;
    this._stage.style.minHeight = "420px";
  }

  _attachResizeHandlers() {
    this._detachResizeHandlers();

    this._onWindowResize = () => this._queueSimulationResize();
    window.addEventListener("resize", this._onWindowResize, { passive: true });

    if (globalThis.ResizeObserver && this._stage) {
      this._resizeObserver = new ResizeObserver(() => {
        if (!this._stage) return;

        const rect = this._stage.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (!width || !height) return;

        if (width === this._lastStageSize.width && height === this._lastStageSize.height) return;
        this._lastStageSize = { width, height };
        this._queueSimulationResize();
      });

      this._resizeObserver.observe(this._stage);
      if (this._container) this._resizeObserver.observe(this._container);
    }
  }

  _detachResizeHandlers() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this._onWindowResize) {
      window.removeEventListener("resize", this._onWindowResize);
      this._onWindowResize = null;
    }
  }

  _queueSimulationResize() {
    if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeFrame = requestAnimationFrame(() => {
        this._resizeFrame = null;
        this._resizeSimulation();
      });
    });
  }

  _resizeSimulation() {
    if (!this._simulation || !this._stage) return;

    try {
      this._simulation.resizeUpdate?.();
    } catch (err) {
      log("Spacekit resize update failed", err);
    }

    this._forceSimulationUpdate();
  }

  _forceSimulationUpdate() {
    try {
      this._simulation?.update?.(true);
    } catch (_err) { /* ignore */ }
  }

  _renderSimulation() {
    const Spacekit = this._spacekit();
    if (!Spacekit?.Simulation) {
      this._showStageMessage(t("Spacekit.MissingLibrary"));
      return;
    }

    try {
      this._simulation = new Spacekit.Simulation(this._stage, {
        basePath: this.graph?.["theme-data"]?.spacekitBasePath || SPACEKIT_BASE_PATH,
        startPaused: true,
        jd: Number(this.graph.data.simulation.jd) || DEFAULT_JD,
        jdPerSecond: Number(this.graph.data.simulation.jdPerSecond) || 5,
        unitsPerAu: Number(this.graph.data.simulation.unitsPerAu) || 1,
        camera: {
          initialPosition: this.graph?.["theme-data"]?.camera?.initialPosition || [0, -22, 12],
          enableDrift: false
        },
        debug: {
          showAxes: false,
          showGrid: false,
          showStats: false
        }
      });

      this._createSkybox();
      this._createBodies();
      this._applyOrbitPositions(this._elapsedBeforeStop);
      this._queueSimulationResize();
      this._forceSimulationUpdate();
      this._simulation.stop?.();
    } catch (err) {
      log("Spacekit initialization failed", err);
      this._showStageMessage(tf("Spacekit.InitFailed", { message: err?.message ?? err }));
    }
  }

  _createSkybox() {
    const image = this.graph?.background?.image;
    if (!image || !this._simulation?.createSkybox) return;

    try {
      this._simulation.createSkybox({ textureUrl: image });
    } catch (err) {
      log("Spacekit skybox creation failed", err);
    }
  }

  _createBodies() {
    this._objects.clear();

    for (const node of this.graph.data.nodes) {
      const position = this._worldPositionForNode(node, 0);
      let obj = null;

      try {
        if (this._simulation?.createSphere) {
          obj = this._simulation.createSphere(node.id, {
            textureUrl: node.texture,
            radius: Number(node.radius) || 1,
            position,
            debug: { showAxes: false }
          });
        } else if (this._simulation?.createObject) {
          obj = this._simulation.createObject(node.id, { position });
        }

        if (obj) {
          this._setObjectPosition(obj, position);
          this._objects.set(node.id, obj);
        }
      } catch (err) {
        log("Spacekit body creation failed", node, err);
      }
    }
  }

  _attachDropHandlers() {
    if (!this._stage) return;

    const onDragOver = event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDrop = event => this._onDrop(event);

    this._stage.addEventListener("dragover", onDragOver);
    this._stage.addEventListener("drop", onDrop);
    this._dropHandlers = { onDragOver, onDrop };
  }

  _detachDropHandlers() {
    if (!this._stage || !this._dropHandlers) return;
    this._stage.removeEventListener("dragover", this._dropHandlers.onDragOver);
    this._stage.removeEventListener("drop", this._dropHandlers.onDrop);
    this._dropHandlers = null;
  }

  _getSymbolDropData(event) {
    const transfer = event?.dataTransfer;
    if (!transfer) return null;

    const raw = transfer.getData("application/json") || transfer.getData("text/plain");
    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      return data?.type === "foundry-graph.symbol" ? data : null;
    } catch (_err) {
      return null;
    }
  }

  async _onDrop(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const symbolDrop = this._getSymbolDropData(event);
    if (!symbolDrop) return;

    const symbol = (this.graph?.symbols ?? []).find(s => s.id === symbolDrop.symbolId);
    if (!symbol) {
      ui.notifications.warn(tf("Notifications.UnknownSymbol", { id: symbolDrop.symbolId }));
      return;
    }

    const node = this._nodeFromSymbol(symbol, this._nextBodyName(symbol));
    const edited = await this._promptBodyConfig(node, { isNew: true });
    if (!edited) return;

    this.graph.data.nodes.push(edited);

    ui.notifications.info(tf("Spacekit.AddedBody", { label: edited.label }));
    this.render(this._svg, this.graph);
  }

  _nodeFromSymbol(symbol, label) {
    const bodyType = symbol.bodyType || "planet";
    const bodyIndex = this.graph.data.nodes.filter(n => n.bodyType === bodyType).length;
    const texture = this._defaultTextureFor(bodyType);
    const parentId = this._defaultParentIdFor(bodyType);
    const isStar = bodyType === "star";

    return {
      id: safeUUID(),
      label,
      type: "SpaceBody",
      bodyType,
      symbolId: symbol.id,
      textureId: texture?.id ?? null,
      texture: texture?.texture ?? symbol.texture ?? symbol.img,
      parentId,
      radius: Number(symbol.radius) || this._defaultRadiusFor(bodyType),
      position: isStar ? [0, 0, 0] : null,
      visualOrbit: isStar ? null : this._defaultOrbitFor(symbol, bodyIndex, bodyType)
    };
  }

  _defaultOrbitFor(symbol, index, bodyType) {
    const defaults = {
      planet: {
        radius: 5 + index * 2.4,
        speed: 0.25 - Math.min(index * 0.025, 0.14),
        phase: index * 55,
        inclination: 0
      },
      moon: {
        radius: 1.4 + index * 0.35,
        speed: 0.65 + index * 0.05,
        phase: index * 70,
        inclination: 8
      },
      smallBody: {
        radius: 4 + index * 1.8,
        speed: 0.45 + index * 0.03,
        phase: index * 50,
        inclination: 12
      }
    };

    const fallback = defaults[bodyType] ?? defaults.planet;
    return {
      radius: Number(symbol.orbitRadius) || fallback.radius,
      speed: Number(symbol.orbitSpeed) || fallback.speed,
      phase: Number(symbol.orbitPhase) || fallback.phase,
      inclination: Number(symbol.orbitInclination) || fallback.inclination
    };
  }

  _defaultRadiusFor(bodyType) {
    return {
      star: 2.8,
      planet: 0.75,
      moon: 0.32,
      smallBody: 0.28
    }[bodyType] ?? 1;
  }

  _defaultParentIdFor(bodyType) {
    if (bodyType === "star") return null;

    const nodes = this.graph?.data?.nodes ?? [];
    const firstStar = nodes.find(n => n.bodyType === "star")?.id ?? null;
    const firstPlanet = nodes.find(n => n.bodyType === "planet")?.id ?? null;

    if (bodyType === "moon") return firstPlanet ?? firstStar;
    return firstStar;
  }

  _textureCatalog() {
    return this.graph?.textureCatalog
      ?? this.graph?.["theme-data"]?.textureCatalog
      ?? JSON_graph_types?.[this.graph?.graphType]?.textureCatalog
      ?? {};
  }

  _texturesFor(bodyType) {
    return this._textureCatalog()[bodyType] ?? [];
  }

  _defaultTextureFor(bodyType) {
    return this._texturesFor(bodyType)[0] ?? null;
  }

  _textureById(bodyType, textureId) {
    return this._texturesFor(bodyType).find(texture => texture.id === textureId) ?? this._defaultTextureFor(bodyType);
  }

  _bodyTypeLabel(bodyType) {
    return {
      star: t("Spacekit.BodyTypeStar"),
      planet: t("Spacekit.BodyTypePlanet"),
      moon: t("Spacekit.BodyTypeMoon"),
      smallBody: t("Spacekit.BodyTypeSmallBody")
    }[bodyType] ?? t("Spacekit.BodyFallback");
  }

  _nextBodyName(symbol) {
    const base = String(symbol.defaultName || symbol.label || symbol.id || t("Spacekit.BodyFallback")).trim();
    const count = (this.graph?.data?.nodes ?? []).filter(n => n.symbolId === symbol.id).length + 1;
    return `${base} ${String(count).padStart(2, "0")}`;
  }

  _parentLabel(parentId) {
    if (!parentId) return t("Spacekit.SystemCenter");
    return this.graph?.data?.nodes?.find?.(n => n.id === parentId)?.label ?? t("Spacekit.UnknownParent");
  }

  _parentOptionsFor(node) {
    const options = [{ id: "", label: t("Spacekit.SystemCenter") }];
    if (node.bodyType === "star") return options;

    const allowedTypes = node.bodyType === "planet"
      ? ["star"]
      : ["planet", "star"];

    const candidates = (this.graph?.data?.nodes ?? [])
      .filter(candidate => candidate.id !== node.id)
      .filter(candidate => allowedTypes.includes(candidate.bodyType))
      .filter(candidate => !this._wouldCreateParentCycle(node.id, candidate.id))
      .sort((a, b) => {
        const weight = { planet: 0, star: 1 };
        return (weight[a.bodyType] ?? 9) - (weight[b.bodyType] ?? 9) || String(a.label).localeCompare(String(b.label));
      });

    for (const candidate of candidates) {
      options.push({
        id: candidate.id,
        label: `${candidate.label} (${this._bodyTypeLabel(candidate.bodyType)})`
      });
    }

    return options;
  }

  _wouldCreateParentCycle(nodeId, parentId) {
    if (!nodeId || !parentId) return false;

    let currentId = parentId;
    const visited = new Set();
    const nodes = this.graph?.data?.nodes ?? [];

    while (currentId) {
      if (currentId === nodeId) return true;
      if (visited.has(currentId)) return true;
      visited.add(currentId);
      const current = nodes.find(n => n.id === currentId);
      currentId = current?.parentId ?? null;
    }

    return false;
  }

  _optionsHtml(options, selectedId) {
    return options.map(option => {
      const selected = String(option.id ?? "") === String(selectedId ?? "") ? " selected" : "";
      return `<option value="${this._escapeHtml(option.id ?? "")}"${selected}>${this._escapeHtml(option.label)}</option>`;
    }).join("");
  }

  _formDataObject(form) {
    const FormDataExtendedImpl = globalThis.foundry?.applications?.ux?.FormDataExtended
      ?? globalThis.FormDataExtended;

    if (FormDataExtendedImpl) return new FormDataExtendedImpl(form).object;

    return Object.fromEntries(new FormData(form).entries());
  }

  _escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"]/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    }[ch]));
  }

  _numberOrFallback(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  async _promptBodyConfig(node, { isNew = false } = {}) {
    const title = isNew ? t("Spacekit.AddBody") : t("Spacekit.EditBody");
    const orbit = node.visualOrbit ?? {};
    const position = Array.isArray(node.position) ? node.position : [0, 0, 0];
    const hasOrbit = !!node.visualOrbit;
    const isStar = node.bodyType === "star";
    const selectedTexture = this._textureById(node.bodyType, node.textureId);
    const textureOptions = this._optionsHtml(this._texturesFor(node.bodyType), selectedTexture?.id ?? node.textureId);
    const parentOptions = this._optionsHtml(this._parentOptionsFor(node), node.parentId ?? "");

    const content = `
<form class="fg-spacekit-body-form">
  <div class="form-group">
    <label>${t("Labels.Name")}</label>
    <input type="text" name="label" value="${this._escapeHtml(node.label)}" autofocus>
  </div>
  <div class="form-group">
    <label>${t("Spacekit.BodyType")}</label>
    <input type="text" value="${this._escapeHtml(this._bodyTypeLabel(node.bodyType))}" disabled>
  </div>
  <div class="form-group">
    <label>${t("Spacekit.Texture")}</label>
    <select name="textureId">${textureOptions}</select>
  </div>
  <div class="form-group">
    <label>${t("Spacekit.Radius")}</label>
    <input type="number" name="radius" value="${this._escapeHtml(node.radius)}" step="0.05" min="0.05">
  </div>
  <div class="form-group">
    <label>${t("Spacekit.ParentBody")}</label>
    <select name="parentId" ${isStar ? "disabled" : ""}>${parentOptions}</select>
  </div>
  <div class="form-group">
    <label>${t("Spacekit.PositionX")}</label>
    <input type="number" name="positionX" value="${this._escapeHtml(position[0])}" step="0.1">
  </div>
  <div class="form-group">
    <label>${t("Spacekit.PositionY")}</label>
    <input type="number" name="positionY" value="${this._escapeHtml(position[1])}" step="0.1">
  </div>
  <div class="form-group">
    <label>${t("Spacekit.PositionZ")}</label>
    <input type="number" name="positionZ" value="${this._escapeHtml(position[2])}" step="0.1">
  </div>
  <hr>
  <div class="form-group">
    <label>${t("Spacekit.UseOrbit")}</label>
    <input type="checkbox" name="useOrbit" ${hasOrbit ? "checked" : ""} ${isStar ? "disabled" : ""}>
  </div>
  <div class="form-group">
    <label>${t("Spacekit.OrbitRadius")}</label>
    <input type="number" name="orbitRadius" value="${this._escapeHtml(orbit.radius ?? 6)}" step="0.1" min="0">
  </div>
  <div class="form-group">
    <label>${t("Spacekit.OrbitSpeed")}</label>
    <input type="number" name="orbitSpeed" value="${this._escapeHtml(orbit.speed ?? 0.2)}" step="0.01">
  </div>
  <div class="form-group">
    <label>${t("Spacekit.OrbitPhase")}</label>
    <input type="number" name="orbitPhase" value="${this._escapeHtml(orbit.phase ?? 0)}" step="1">
  </div>
  <div class="form-group">
    <label>${t("Spacekit.OrbitInclination")}</label>
    <input type="number" name="orbitInclination" value="${this._escapeHtml(orbit.inclination ?? 0)}" step="1">
  </div>
  <p class="notes">${t("Spacekit.BodyFormHint")}</p>
</form>`;

    const readForm = form => {
      const obj = this._formDataObject(form);
      const label = String(obj.label ?? "").trim();
      if (!label) return null;

      const nextTexture = this._textureById(node.bodyType, obj.textureId ?? node.textureId);
      const useOrbit = !isStar && (obj.useOrbit === true || obj.useOrbit === "on" || obj.useOrbit === "true");
      const parentId = isStar ? null : String(obj.parentId ?? "").trim() || null;
      const next = {
        ...node,
        label,
        textureId: nextTexture?.id ?? null,
        texture: nextTexture?.texture ?? node.texture,
        parentId: this._wouldCreateParentCycle(node.id, parentId) ? null : parentId,
        radius: this._numberOrFallback(obj.radius, Number(node.radius) || this._defaultRadiusFor(node.bodyType))
      };

      if (useOrbit) {
        next.position = null;
        next.visualOrbit = {
          radius: this._numberOrFallback(obj.orbitRadius, node.visualOrbit?.radius ?? 6),
          speed: this._numberOrFallback(obj.orbitSpeed, node.visualOrbit?.speed ?? 0.2),
          phase: this._numberOrFallback(obj.orbitPhase, node.visualOrbit?.phase ?? 0),
          inclination: this._numberOrFallback(obj.orbitInclination, node.visualOrbit?.inclination ?? 0)
        };
      } else {
        next.position = [
          this._numberOrFallback(obj.positionX, node.position?.[0] ?? 0),
          this._numberOrFallback(obj.positionY, node.position?.[1] ?? 0),
          this._numberOrFallback(obj.positionZ, node.position?.[2] ?? 0)
        ];
        next.visualOrbit = null;
      }

      return next;
    };

    if (DialogV2?.prompt) {
      const result = await DialogV2.prompt({
        window: { title },
        content,
        ok: {
          label: t("Buttons.OK"),
          callback: (_event, button) => readForm(button.form)
        },
        rejectClose: false
      });
      return result || null;
    }

    if (globalThis.Dialog?.prompt) {
      const result = await globalThis.Dialog.prompt({
        title,
        content,
        label: t("Buttons.OK"),
        callback: html => readForm(html[0]?.querySelector?.("form")),
        rejectClose: false
      });
      return result || null;
    }

    return node;
  }

  _renderToolbar() {
    if (!this._stage) return;

    this._toolbar = document.createElement("div");
    this._toolbar.className = "fg-spacekit-toolbar";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "fg-spacekit-toggle";
    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleSimulation();
    });

    this._toolbar.appendChild(toggle);
    this._stage.appendChild(this._toolbar);
    this._syncToolbar();
  }

  _syncToolbar() {
    const button = this._toolbar?.querySelector?.(".fg-spacekit-toggle");
    if (!button) return;
    button.textContent = this._running ? t("Buttons.StopSimulation") : t("Buttons.StartSimulation");
    button.classList.toggle("active", this._running);
  }

  _renderBodyList() {
    if (!this._stage) return;

    this._bodyList = document.createElement("div");
    this._bodyList.className = "fg-spacekit-body-list";

    const title = document.createElement("div");
    title.className = "fg-spacekit-body-list-title";
    title.textContent = t("Spacekit.Bodies");
    this._bodyList.appendChild(title);

    const nodes = this.graph.data.nodes ?? [];
    if (!nodes.length) {
      const empty = document.createElement("div");
      empty.className = "fg-spacekit-body-list-empty";
      empty.textContent = t("Spacekit.DropHint");
      this._bodyList.appendChild(empty);
    }

    for (const node of nodes) {
      const row = document.createElement("div");
      row.className = "fg-spacekit-body-row";

      const labelWrap = document.createElement("div");
      labelWrap.className = "fg-spacekit-body-label";
      labelWrap.title = t("Spacekit.EditBody");
      labelWrap.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
        this._editBody(node.id);
      });

      const label = document.createElement("span");
      label.textContent = node.label;
      labelWrap.appendChild(label);

      const detail = document.createElement("small");
      detail.textContent = `${this._bodyTypeLabel(node.bodyType)} · ${this._parentLabel(node.parentId)}`;
      labelWrap.appendChild(detail);

      row.appendChild(labelWrap);

      const actions = document.createElement("div");
      actions.className = "fg-spacekit-body-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "✎";
      edit.title = t("Spacekit.EditBody");
      edit.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        this._editBody(node.id);
      });
      actions.appendChild(edit);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = t("Spacekit.RemoveBody");
      remove.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        this.graph.data.nodes = this.graph.data.nodes.filter(n => n.id !== node.id);
        this.render(this._svg, this.graph);
      });
      actions.appendChild(remove);
      row.appendChild(actions);

      this._bodyList.appendChild(row);
    }

    this._stage.appendChild(this._bodyList);
  }

  async _editBody(nodeId) {
    const index = this.graph?.data?.nodes?.findIndex?.(n => n.id === nodeId) ?? -1;
    if (index < 0) return;

    const edited = await this._promptBodyConfig({ ...this.graph.data.nodes[index] });
    if (!edited) return;

    this.graph.data.nodes[index] = edited;
    this.render(this._svg, this.graph);
  }

  _showStageMessage(message) {
    const box = document.createElement("div");
    box.className = "fg-spacekit-message";
    box.textContent = message;
    this._stage?.appendChild(box);
  }

  _currentElapsedSeconds() {
    if (!this._running) return this._elapsedBeforeStop;
    return this._elapsedBeforeStop + ((performance.now() - this._startedAt) / 1000);
  }

  _tickOrbits() {
    if (!this._running) return;

    const elapsed = this._currentElapsedSeconds();
    this._applyOrbitPositions(elapsed);
    this._forceSimulationUpdate();
    this._animationFrame = requestAnimationFrame(() => this._tickOrbits());
  }

  _applyOrbitPositions(elapsedSeconds) {
    for (const node of this.graph?.data?.nodes ?? []) {
      const obj = this._objects.get(node.id);
      if (!obj) continue;
      this._setObjectPosition(obj, this._worldPositionForNode(node, elapsedSeconds));
    }
  }

  _worldPositionForNode(node, elapsedSeconds, visited = new Set()) {
    const local = this._localPositionForNode(node, elapsedSeconds);
    if (!node.parentId || visited.has(node.id)) return local;

    const parent = this.graph?.data?.nodes?.find?.(n => n.id === node.parentId);
    if (!parent) return local;

    visited.add(node.id);
    const parentPosition = this._worldPositionForNode(parent, elapsedSeconds, visited);
    return [
      parentPosition[0] + local[0],
      parentPosition[1] + local[1],
      parentPosition[2] + local[2]
    ];
  }

  _localPositionForNode(node, elapsedSeconds) {
    if (Array.isArray(node.position) && node.position.length >= 3) {
      return node.position.slice(0, 3).map(v => Number(v) || 0);
    }

    const orbit = node.visualOrbit;
    if (!orbit) return [0, 0, 0];

    const radius = Number(orbit.radius) || 1;
    const speed = Number(orbit.speed) || 0;
    const phase = ((Number(orbit.phase) || 0) * Math.PI) / 180;
    const inclination = ((Number(orbit.inclination) || 0) * Math.PI) / 180;
    const angle = phase + elapsedSeconds * speed;

    const x = Math.cos(angle) * radius;
    const flatY = Math.sin(angle) * radius;
    const y = flatY * Math.cos(inclination);
    const z = flatY * Math.sin(inclination);
    return [x, y, z];
  }

  _setObjectPosition(obj, position) {
    const [x, y, z] = position;

    try {
      obj?.setPosition?.(x, y, z);
    } catch (_err) { /* fallback below */ }

    try {
      const root = obj?.get3jsObjects?.()?.[0];
      root?.position?.set?.(x, y, z);
    } catch (_err) { /* ignore */ }

    try {
      const jd = this._simulation?.getJd?.() ?? DEFAULT_JD;
      obj?.update?.(jd, true);
    } catch (_err) { /* ignore */ }
  }
}
