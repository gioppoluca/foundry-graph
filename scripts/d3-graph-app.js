import { log, MODULE_ID } from './constants.js';
//import {getRenderer} from './renderers/index.js';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;


export class D3GraphApp extends HandlebarsApplicationMixin(ApplicationV2) {

  _linkingMode = false;
  _linkSourceNode = null;

  static DEFAULT_OPTIONS = {
    id: "fgraph-form",
    position: {
      width: 600,
      height: 600
    },
    classes: ["fgraph", "fgraph-form"],
    window: {
      title: "",//this.windowTitle,
      resizable: true,
    },
    dragDrop: [{ dragSelector: '[data-drag="true"]', dropSelector: '.drop-zone' }],
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
    if (this.renderer._svg) log("renderer already has svg", this.renderer._svg)
    log("D3GraphApp.constructor", options, this.renderer)
    this._svgWidth = options.graph.width || 800;
    this._svgHeight = options.graph.height || 600;
    this._graphName = options.graph.name || "test";
    this._graphDescription = options.graph.desc || "desc";
    this._graphId = options.graph.id || "test";
    this._mode = options.mode || "new";
  }

  async _onRender(context, options) {
    let el = this.element.querySelector("#d3-graph")
    const onDrop = this._onDrop.bind(this);
    el.addEventListener("drop", onDrop);
    this._disposers ??= [];
    this._disposers.push(() => el.removeEventListener("drop", onDrop));
    this._disposers.push(() => this.renderer.teardown());
    this._drawGraph(); // fresh
  }

  async _prepareContext(options) {
    console.log("PREPARE CONTEXT", options);
    console.log(this._mode)
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


  async _onDrop(event) {
    console.log("_onDrop")
    // in view no drop
    if (this._mode === "view") {
      ui.notifications.warn("Cannot drop nodes in view mode");
      return;
    }
    console.log(event)
    const data = TextEditor.getDragEventData(event);
    console.log(data)
    // Get mouse position relative to SVG
    const svg = this.element.querySelector("#d3-graph");
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    log("Drop position:", x, y, rect);

    // Add new node
    const newId = crypto.randomUUID();

    // Handle different data types
    switch (data.type) {
      // write your cases
      case "Actor":
        const actor = await fromUuid(data.uuid);
        if (!actor) {
          ui.notifications.warn("Could not find actor");
          return;
        }

        this.renderer.addNode(this.graph, {
          //        this._nodes.push({
          id: newId,
          uuid: data.uuid,
          label: actor.name,
          type: 'Actor',
          img: actor.img,
          x: x,
          y: y
        });

        ui.notifications.info(`Added node for actor: ${actor.name}`);
        break;
      case 'JournalEntryPage':
        const page = await fromUuid(data.uuid);
        console.log(page)
        if (!page) {
          ui.notifications.warn("Could not find page");
          return;
        }

        this.renderer.addNode(this.graph, {
          //        this._nodes.push({
          id: newId,
          uuid: data.uuid,
          label: page.name,
          type: 'JournalEntryPage',
          img: "modules/foundry-graph/img/journal.png",
          x: x,
          y: y
        });
        ui.notifications.info(`Added node for page: ${page.name}`);
        break;
      case 'Scene':
        const scene = await fromUuid(data.uuid);
        console.log(scene)
        if (!scene) {
          ui.notifications.warn("Could not find scene");
          return;
        }

        this.renderer.addNode(this.graph, {
          //        this._nodes.push({
          id: newId,
          uuid: data.uuid,
          label: scene.name,
          type: 'Scene',
          img: "modules/foundry-graph/img/mappin.png",
          fx: x,
          fy: y
        });
        ui.notifications.info(`Added node for scene: ${scene.name}`);
        break;
      case 'Item':
        const item = await fromUuid(data.uuid);
        console.log(item)
        if (!item) {
          ui.notifications.warn("Could not find item");
          return;
        }

        this.renderer.addNode(this.graph, {
          //        this._nodes.push({
          id: newId,
          uuid: data.uuid,
          label: item.name,
          type: 'Actor',
          img: item.img,
          fx: x,
          fy: y
        });
        ui.notifications.info(`Added node for item: ${item.name}`);
        break;

      default:
        break;

    }
    log(this.graph)
    this._drawGraph();

  }

  static toggleLinkingMode(e) {
    this._linkingMode = !this._linkingMode;
    this._linkSourceNode = null;
    e.target.classList.toggle("active", this._linkingMode);
    e.target.innerText = this._linkingMode ? "Cancel Linking" : "Link Nodes";
    ui.notifications.info(this._linkingMode ? "Linking mode ON" : "Linking mode OFF");
    const relationId = this.element.querySelector("#relation-type")?.value || "";
    const relation = this.graph.relations.find(r => r.id === relationId);
    log("toggleLinkingMode", relationId, relation)
    this.renderer.setLinkingMode(this._linkingMode);
    this.renderer.setRelationData(relation);
  }


  static svgToCanvas() {
    // Select the first svg element and get its content
    var svgElement = document.querySelector('#d3-graph');

    if (!svgElement) {
      console.error('SVG element not found');
      return;
    }

    function convertExternalResources(svgElement, callback) {
      const imageElements = Array.from(svgElement.querySelectorAll('image'));

      // Function to fetch and convert an image to data URL
      async function fetchImage(imgElem) {
        try {
          var imgSrc = imgElem.getAttribute('xlink:href') || imgElem.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
          console.log(`Processing image with src: ${imgSrc}`);

          if (!imgSrc || imgSrc.startsWith('data:')) {
            console.log(`Skipping already data URI or missing href: ${imgSrc}`);
            return;  // Skip images without href or already data URIs
          }

          const response = await fetch(imgSrc);
          if (!response.ok) throw new Error(`Failed to load ${imgSrc}`);

          const blob = await response.blob();
          const reader = new FileReader();

          return new Promise((resolve, reject) => {
            reader.onloadend = function () {
              const dataUrl = reader.result;
              imgElem.setAttribute('href', dataUrl);
              // Also set the xlink:href attribute to ensure it's properly set
              if (imgElem.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) {
                imgElem.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
              }
              console.log(`Converted to data URL: ${dataUrl.substring(0, 50)}...`);
              resolve();
            };
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.error('Error converting image:', err);
        }
      }

      // Fetch and convert all images
      Promise.all(imageElements.map(fetchImage)).then(() => callback(svgElement))
        .catch(err => console.error('Error processing images:', err));
    }

    // Clone the SVG element to avoid modifying the original
    var svgClone = svgElement.cloneNode(true);

    convertExternalResources(svgClone, function (preparedSvg) {
      // Serialize the prepared SVG to a string
      var serializer = new XMLSerializer();
      var svgStr = serializer.serializeToString(preparedSvg);
      console.log('Final serialized SVG:', svgStr.substring(0, 500)); // Log part of SVG for inspection

      // Create a Blob from the SVG string and create an object URL for it
      var svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      saveAs(svgBlob, "graph.svg");
    });
  }


  // ---------
  static async _saveGraph() {
    const api = game.modules.get("foundry-graph").api;

    const data = this.renderer.getGraphData()
    log("D3GraphApp._saveGraph", data)
    this.graph.data = data;
    await api.upsertGraph(this.graph);
    this.renderer.teardown();
    ui.notifications.info("Graph saved via API");
    console.log(this)
    this.close()
  }


  async _drawGraph(data = null) {
    // log("D3GraphApp._drawGraph", data)
    let svg = d3.select("#d3-graph");
    log("D3GraphApp._drawGraph", this.renderer, this.graph)
    this.renderer.render(svg, this.graph)
  }

  async _onClose(options) {
    log("D3GraphApp._onClose | Running disposers");

    // 1. Execute all registered cleanup functions.
    this._disposers?.forEach(d => d());

    // 2. Clear the disposers array.
    this._disposers = [];

    // 3. Call the parent class's _onClose method.
    await super._onClose(options);
  }

}
