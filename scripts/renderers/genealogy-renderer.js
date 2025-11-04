import { log } from "../constants.js";
import { BaseRenderer } from "./base-renderer.js";
const { DialogV2 } = foundry.applications.api;

export class GenealogyRenderer extends BaseRenderer {
  static ID = "genealogy";

  constructor() {
    super()
    this._linkingMode = false;
    this._linkSourceNode = null;
    this.relation = null
    this.graph = null;
    this._svg = null;

  }

  initializeGraphData() {
    return {
      "start": "",
      "persons": {},
      "unions": {},
      "links": []
    };
  }

  getGraphData() {
    return this.graph.data
    /*
    console.log("SIM nodes:", this._simulation.nodes());                     // canonical node objects
    console.log("SIM links:", this._simulation.force("link").links());
    const links = this._simulation.force("link").links();
    const nodes = this._simulation.nodes();
    return {
      nodes: nodes.map(n => ({
        id: n.id,
        uuid: n.uuid,
        label: n.label,
        type: n.type,
        img: n.img,
        x: n.x,
        y: n.y,
        // Keep fx/fy to preserve user-dragged positions
        fx: n.fx,
        fy: n.fy
      })),
      links: links.map(l => ({
        // CRITICAL FIX: Store only the ID of the source and target nodes
        source: l.source.id,
        target: l.target.id,
        // --- copy other link properties ---
        relationId: l.relationId,
        label: l.label,
        color: l.color,
        style: l.style,
        strokeWidth: l.strokeWidth
      }))
    };
    */
  }

  teardown() {
    log("GenealogyRenderer.teardown");
    if (this._svg) {
      // Remove all D3-attached listeners and elements
      this._svg.on(".zoom", null);
      this._detachDropHandlers(this._svg.node());
      this._svg.selectAll("*").interrupt().remove();
      this._svg = null;
    }
    if (this.graph) {
      this.graph = null;
    }
    this._linkingMode = false;
    this._linkSourceNode = null;
    this.relation = null

  }

  setWindow() {
    log("GenealogyRenderer.setWindow");
  }

  setWindow() {
    log("ForceRenderer.setWindow");
    const familyChartDiv = document.querySelector("#FamilyChart");
    if (familyChartDiv) {
      log("Removing existing FamilyChart div before rendering ForceRenderer");
      familyChartDiv.style.display = "none";
    }
  }

  render(svg, graph, ctx) {
    if (!this.graph) this.graph = graph;
    log("GenealogyRenderer.render complete");
    const renderGraph = this.graph;

    if (!this._svg) this._svg = svg;
    this.setWindow();

    let el = document.querySelector("#d3-graph")
    log("attach drop handlers to", el, this._svg, this.graph)
    this._attachDropHandlers(el, this._onDrop.bind(this));
    if (this._svg) {
      this._svg.on(".zoom", null);                       // remove zoom listeners
      this._svg.selectAll("*").interrupt().remove();     // clear old DOM + timers
    }
    this._svg
      .attr("width", renderGraph.width)
      .attr("height", renderGraph.height)
      .attr("viewBox", `0 0 ${renderGraph.width} ${renderGraph.height}`)
      .call(d3.zoom().on("zoom", (event) => {
        this._svg.select("g.zoom-layer").attr("transform", event.transform);
      }));

    this._svg.selectAll("*").remove();
    // Create a layer inside for zoom/pan
    const zoomLayer = this._svg.append("g").classed("zoom-layer", true);
    // --- START: Background Image Update ---
    const bgWidth = renderGraph.background.width || renderGraph.width;
    const bgHeight = renderGraph.background.height || renderGraph.height;

    zoomLayer.append("image")
      .attr("xlink:href", renderGraph.background.image || "modules/foundry-graph/img/vampire.png")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", bgWidth)
      .attr("height", bgHeight);
    // create inner SVG container for Family Chart
    zoomLayer.append("g")
      .attr("id", "FamilyChartInnerSVG")
    log("renderGraph:", renderGraph)
    log("this._svg:", this._svg)
    log("zoomLayer:", zoomLayer)
    if (this.graph.data.start) {
      const container = document.getElementById('FamilyChartInnerSVG');
      log("container:", container);


      this.familytree = new FT.FamilyTree(this.graph.data, container);
      log("FT:", this.familytree)
    }


  }


  addNode(graph, { id, label, type, img, uuid, x, y }) {
    log("GenealogyRenderer.addNode", graph, id, label, type, img, uuid, x, y);
    if (graph.data.start) {
      // already initialized
    } else {
      // first node
      this.graph.data = {
        "start": id,
        "persons": { [id]: { name: label } },
        "unions": {},
        "links": []
      }
      log("initialize familytree", this.graph.data, this._svg)
      const container = document.getElementById('FamilyChartInnerSVG');
      log("container:", container);
      this.familytree = new FT.FamilyTree(this.graph.data, container);
    }
    /*
    this.graph.data.nodes.push({
      id: id,
      uuid: uuid,
      label: label,
      type: type,
      img: img,
      x: x,
      y: y,
      fx: x,
      fy: y,
      vx: 0,
      vy: 0
    });
*/
  }

  setLinkingMode(enabled) {
    this._linkingMode = enabled;
  }

  setRelationData(relation) {
    this.relation = relation;
  }

  async _onRightClickNode(nodeData) {
    log("_onRightClickNode", nodeData)
    const confirmed = await DialogV2.confirm({
      content: `Delete node "${nodeData.label || nodeData.id}"?`,
    })
    if (confirmed) {
      // Remove node and connected links
      this.graph.data.nodes = this.graph.data.nodes.filter(n => n.id !== nodeData.id);
      this.graph.data.links = this.graph.data.links.filter(l => l.source.id !== nodeData.id && l.target.id !== nodeData.id);
      this.render(); // Redraw
    }
  }

  async _onRightClickLink(linkData) {
    log("_onRightClickLink", linkData)
    const confirmed = await DialogV2.confirm({
      content: `Delete link from "${linkData.source?.label || linkData.source?.id}" to "${linkData.target?.label || linkData.target?.id}"?`,
    })
    if (confirmed) {
      this.graph.data.links = this.graph.data.links.filter(l => l !== linkData);
      this.render(); // Redraw
    }
  }

  async _onDrop(event) {
    console.log("_onDrop")
    console.log(event)
    const data = TextEditor.getDragEventData(event);
    console.log(data)
    // Get mouse position relative to SVG
    // 2) Compute SVG coords (correct under zoom/pan)
    const svgEl = this._svg.node();
    const pt = svgEl.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgPt = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    const x = svgPt.x;
    const y = svgPt.y;

    log("Drop position:", x, y);

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

        this.addNode(this.graph, {
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

        this.addNode(this.graph, {
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

        this.addNode(this.graph, {
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

        this.addNode(this.graph, {
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
    this.render();

  }

}