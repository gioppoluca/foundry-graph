import { log } from "../constants.js";
import { BaseRenderer } from "./base-renderer.js";
const { DialogV2 } = foundry.applications.api;

export class ForceRenderer extends BaseRenderer {
  static ID = "force";

  constructor() {
    super()
    this._linkingMode = false;
    this._linkSourceNode = null;
    this.relation = null
    this.graph = null;
    this._svg = null;
    this._simulation = null;
  }

  initializeGraphData() {
    return {
      nodes: [],
      links: []
    };
  }

  getGraphData() {
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
    /*
    return {
      nodes: this._simulation.nodes(),
      links: this._simulation.force("link").links()
    };
    */
  }

  teardown() {
    log("ForceRenderer.teardown");
    if (this._simulation) {
      this._simulation.stop();
      this._simulation = null;
    }
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
    log("ForceRenderer.setWindow");
    const familyChartDiv = document.querySelector("#FamilyChart");
    if (familyChartDiv) {
      log("Removing existing FamilyChart div before rendering ForceRenderer");
      familyChartDiv.style.display = "none";
    }
  }

  render(svg, graph, ctx) {
    if (!this.graph) this.graph = graph;
    const renderGraph = this.graph;
    log("ForceRenderer.render", svg, this.graph, ctx);
    this.setWindow();
    // Ensure only one set of handlers at a time
    // --- teardown from a previous render ---
    //if (this._simulation) { this._simulation.stop(); this._simulation = null; }
    if (!this._svg) this._svg = svg;
    let el = document.querySelector("#d3-graph")
    this._detachDropHandlers(el);

    // Attach new drop handler
    this._attachDropHandlers(el, this._onDrop.bind(this));
    log("ForceRenderer.render - svg", this._svg)
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
    //    const bgX = (renderGraph.width - bgWidth) / 2;
    //    const bgY = (renderGraph.height - bgHeight) / 2;

    zoomLayer.append("image")
      .attr("xlink:href", renderGraph.background.image || "modules/foundry-graph/img/vampire.png")
      .attr("x", 0)
      .attr("y", 0)
      //      .attr("width", renderGraph.width)
      //      .attr("height", renderGraph.height);
      .attr("width", bgWidth)
      .attr("height", bgHeight);

    log("added background image")

    const defs = this._svg.append("defs");
    defs.append("marker")
      .attr("id", "fg-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 30)           // tweak if you want more/less offset on the target
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "context-stroke");  // ← inherits the line’s stroke color

    const shadow = defs.append("filter")
      .attr("id", "link-label-shadow")
      .attr("filterUnits", "objectBoundingBox")
      // expand the box around the text (fractions, not %)
      .attr("x", -0.5)
      .attr("y", -0.5)
      .attr("width", 2)
      .attr("height", 2);

    shadow.append("feGaussianBlur")
      .attr("in", "SourceAlpha")
      .attr("stdDeviation", 1.5)
      .attr("result", "blur");

    shadow.append("feOffset")
      .attr("in", "blur")
      .attr("dx", 1)
      .attr("dy", 1)
      .attr("result", "offsetBlur");

    const merge = shadow.append("feMerge");
    merge.append("feMergeNode").attr("in", "offsetBlur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const link = zoomLayer.append("g")
      .attr("stroke-opacity", 0.8)
      .selectAll("line")
      .data(renderGraph.data.links, d => d.id)
      .join("line")
      .attr("stroke", d => d.color || "#000")  // fallback if color is missing
      .style("stroke-dasharray", d => {
        if (d.style === "dashed") return "4 4";
        if (d.style === "dotted") return "2 4";
        return "0";
      })
      .attr("stroke-width", d => d.strokeWidth || 2)
      .attr("marker-end", d => {
        const noArrow = d.noArrow === true || d.noArrow === "true";
        console.log("LINK noArrow:", noArrow, d);
        return noArrow ? null : "url(#fg-arrow)";
      })
      .on("contextmenu", (event, d) => {
        log("RIGHT CLICK LINK", d, event)
        event.preventDefault();
        this._onRightClickLink(d);
      });

    const linkLabels = zoomLayer.append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(renderGraph.data.links)
      .join("text")
      .attr("font-size", 12)
      .attr("fill", d => d.color || "#000")
      .attr("text-anchor", "middle")
      .attr("filter", "url(#link-label-shadow)")
      .text(d => d.label || d.type || "");

    log("added link labels")
    const node = zoomLayer.append("g")
      .selectAll("image")
      .data(renderGraph.data.nodes, d => d.id)
      .join("image")
      .attr("xlink:href", d => d.img)
      .attr("width", 64)
      .attr("height", 64)
      .attr("clip-path", "circle(32px at center)")
      .call(
        d3.drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      )
      .on("click", async (event, d) => {
        ui.notifications.info(`Clicked node: ${d.label}`);
        if (this._linkingMode) {
          if (!this._linkSourceNode) {
            this._linkSourceNode = d;
            ui.notifications.info(`Selected source node: ${d.label}`);
          } else {
            const source = this._linkSourceNode;
            const target = d;

            // Prevent self-links or duplicate links
            const alreadyLinked = renderGraph.data.links.some(l =>
              (l.source.id === source.id && l.target.id === target.id) ||
              (l.source.id === target.id && l.target.id === source.id)
            );
            if (!alreadyLinked && source.id !== target.id) {
              const relation = this.relation
              if (!relation) {
                ui.notifications.warn("Please select a valid relation type before creating the link.");
                return;
              }
              renderGraph.data.links.push({
                source: source.id,
                target: target.id,
                relationId: relation.id,
                label: relation.label,
                color: relation.color,
                style: relation.style,
                noArrow: relation?.noArrow || false,
                strokeWidth: relation.strokeWidth
              });
              this.render();
              ui.notifications.info(`Linked ${source.label} → ${target.label} (${relation.label})`);
            } else {
              ui.notifications.warn("Invalid or duplicate link");
            }
            this._linkSourceNode = null;
          }
        } else {
          ui.notifications.info(`Clicked node: ${d.label}`);
        }
      })
      .on("contextmenu", (event, d) => {
        event.preventDefault(); // Prevent default browser context menu
        this._onRightClickNode(d);
      })
      .on("dblclick", (event, d) => {
        ui.notifications.info(`Double-clicked node: ${d.label}`);
        // Example: open the actor sheet if the UUID is valid
        if (d.uuid) {
          fromUuid(d.uuid).then(doc => {
            if (doc?.sheet) doc.sheet.render(true);
            else ui.notifications.warn("No document found for UUID");
          });
        }
      });

    const nodeLabels = zoomLayer.append("g")
      .attr("class", "node-labels")
      .selectAll("text")
      .data(renderGraph.data.nodes)
      .join("text")
      .attr("font-size", 12)
      .attr("fill", renderGraph?.nodeLabelColor || "#000")
      .attr("text-anchor", "middle")
      .text(d => d.label || d.id);

    log("added nodes and labels")

    const simulation = d3.forceSimulation(renderGraph.data.nodes).stop();
    const linkForce = d3.forceLink().id(d => d.id).distance(200); // set id accessor *before* links
    simulation.force("link", linkForce);
    simulation.force("charge", d3.forceManyBody().strength(-400));
    simulation.force("center", d3.forceCenter(400, 300));
    linkForce.links(renderGraph.data.links);
    simulation.on("tick", ticked)
      .on("end", () => {
        simulation.stop(); // 🔴 stop simulation once nodes settle
      });

    simulation.alpha(0.2).restart();
    this._simulation = simulation;

    log("started simulation")
    function ticked() {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("x", d => d.x - 32)
        .attr("y", d => d.y - 32);

      linkLabels
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);
      nodeLabels
        .attr("x", d => d.x)
        .attr("y", d => d.y + 42); // 32 (half icon) + 10 spacing
    }

    function dragstarted(event, d) {
      console.log("DRAG START", d);
      simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      console.log("DRAGGING", d);
      d.x = d.fx = event.x;
      d.y = d.fy = event.y;
    }

    function dragended(event, d) {
      console.log("DRAG END", d);
      if (!event.active) simulation.alphaTarget(0);
      // Do NOT nullify fx/fy — keep node fixed after drag
      d.x = d.fx = event.x;
      d.y = d.fy = event.y;
    }
    log("ForceRenderer.render complete");
  }


  addNode(graph, { id, label, type, img, uuid, x, y }) {
    log("ForceRenderer.addNode", graph, id, label, type, img, uuid, x, y);
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
    // in view no drop
    //    if (this._mode === "view") {
    //      ui.notifications.warn("Cannot drop nodes in view mode");
    //      return;
    //    }
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