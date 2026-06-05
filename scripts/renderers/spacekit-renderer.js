import { log, safeUUID, t, tf } from "../constants.js";
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

  static hasEntity(graphOrData, uuid) {
    const data = graphOrData?.data ?? graphOrData;
    return !!data?.nodes?.some(n => n.uuid === uuid);
  }

  static removeEntity(graphOrData, uuid) {
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
        texture: n.texture,
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
    this._setStageSize();
    this._renderToolbar();
    this._renderBodyList();
    this._renderSimulation();
  }

  teardown() {
    this.stopSimulation({ persist: false });
    this._detachDropHandlers();

    try {
      this._simulation?.stop?.();
    } catch (_err) { /* ignore */ }

    this._objects.clear();
    this._simulation = null;

    if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = null;

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

  async exportToPNG({ destination = "download" } = {}) {
    const canvas = this._stage?.querySelector?.("canvas");
    if (!canvas) {
      ui.notifications.warn(t("Spacekit.ExportUnavailable"));
      return null;
    }

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error("Canvas toBlob failed")),
        "image/png"
      );
    });

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

    try {
      window.dispatchEvent(new Event("resize"));
    } catch (_err) { /* ignore */ }

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
      const position = this._positionForNode(node, 0);
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
    const orbitIndex = this.graph.data.nodes.filter(n => n.bodyType !== "star").length;
    const orbit = symbol.visualOrbit
      ? { ...symbol.visualOrbit }
      : this._defaultOrbitFor(symbol, orbitIndex);

    return {
      id: safeUUID(),
      label,
      type: "SpaceBody",
      bodyType: symbol.bodyType || "planet",
      symbolId: symbol.id,
      texture: symbol.texture || symbol.img,
      radius: Number(symbol.radius) || 1,
      position: Array.isArray(symbol.position) ? symbol.position.slice(0, 3) : null,
      visualOrbit: symbol.bodyType === "star" ? null : orbit
    };
  }

  _defaultOrbitFor(symbol, index) {
    return {
      radius: Number(symbol.orbitRadius) || 4 + index * 2.4,
      speed: Number(symbol.orbitSpeed) || 0.08 + index * 0.015,
      phase: Number(symbol.orbitPhase) || index * 55,
      inclination: Number(symbol.orbitInclination) || 0
    };
  }

  _nextBodyName(symbol) {
    const base = String(symbol.defaultName || symbol.label || symbol.id || t("Spacekit.BodyFallback")).trim();
    const count = (this.graph?.data?.nodes ?? []).filter(n => n.symbolId === symbol.id).length + 1;
    return `${base} ${String(count).padStart(2, "0")}`;
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

    const content = `
<form class="fg-spacekit-body-form">
  <div class="form-group">
    <label>${t("Labels.Name")}</label>
    <input type="text" name="label" value="${this._escapeHtml(node.label)}" autofocus>
  </div>
  <div class="form-group">
    <label>${t("Spacekit.Radius")}</label>
    <input type="number" name="radius" value="${this._escapeHtml(node.radius)}" step="0.05" min="0.05">
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
    <input type="checkbox" name="useOrbit" ${hasOrbit ? "checked" : ""}>
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

      const useOrbit = obj.useOrbit === true || obj.useOrbit === "on" || obj.useOrbit === "true";
      const next = {
        ...node,
        label,
        radius: this._numberOrFallback(obj.radius, Number(node.radius) || 1)
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

      const label = document.createElement("span");
      label.textContent = node.label;
      label.title = t("Spacekit.EditBody");
      label.addEventListener("dblclick", event => {
        event.preventDefault();
        event.stopPropagation();
        this._editBody(node.id);
      });
      row.appendChild(label);

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

  _tickOrbits() {
    if (!this._running) return;

    const elapsed = this._elapsedBeforeStop + ((performance.now() - this._startedAt) / 1000);
    this._applyOrbitPositions(elapsed);
    this._forceSimulationUpdate();
    this._animationFrame = requestAnimationFrame(() => this._tickOrbits());
  }

  _applyOrbitPositions(elapsedSeconds) {
    for (const node of this.graph?.data?.nodes ?? []) {
      const obj = this._objects.get(node.id);
      if (!obj) continue;
      this._setObjectPosition(obj, this._positionForNode(node, elapsedSeconds));
    }
  }

  _positionForNode(node, elapsedSeconds) {
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
