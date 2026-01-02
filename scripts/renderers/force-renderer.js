import { log, safeUUID } from "../constants.js";
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
    this._zoomBehavior = null;       // Stores the d3.zoom() instance
    this._zoomLayer = null;          // Stores the <g> element
    this._currentTransform = null; // Stores the last zoom/pan transform
  }

  initializeGraphData() {
    return {
      nodes: [],
      links: []
    };
  }

  getGraphData() {
    log("SIM nodes:", this._simulation.nodes());                     // canonical node objects
    log("SIM links:", this._simulation.force("link").links());
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
        noArrow: l.noArrow === true || l.noArrow === "true",
        strokeWidth: l.strokeWidth
      }))
    };
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

    // Reset persistent zoom state
    this._zoomBehavior = null;
    this._zoomLayer = null;
    this._currentTransform = null;
  }

  render(svg, graph, ctx) {
    if (!this.graph) this.graph = graph;
    const renderGraph = this.graph;
    log("ForceRenderer.render", svg, this.graph, ctx);
    if (!this._svg) this._svg = svg;

    if (!this._zoomBehavior) {
      // FIRST RENDER: Set up persistent elements
      log("ForceRenderer: First render, setting up zoom.");

      // 1. Create the zoom behavior
      this._zoomBehavior = d3.zoom().on("zoom", (event) => {
        this._currentTransform = event.transform; // Store the transform
        if (this._zoomLayer) {
          this._zoomLayer.attr("transform", this._currentTransform);
        }
      });

      // 2. Apply zoom behavior to the main SVG
      this._svg
        .attr("width", renderGraph.width)
        .attr("height", renderGraph.height)
        .attr("viewBox", `0 0 ${renderGraph.width} ${renderGraph.height}`)
        .call(this._zoomBehavior); // Attach the behavior

      // 3. Create the persistent <g> layer for zoom/pan
      this._svg.selectAll("*").remove(); // Clear SVG *once*
      this._zoomLayer = this._svg.append("g").classed("zoom-layer", true);

      // 4. Store the initial transform
      this._currentTransform = d3.zoomIdentity;

      // 5. Attach drop handlers (only needs to be done once)
      let el = document.querySelector("#d3-graph") || this._svg.node();
      this._detachDropHandlers(el);
      this._attachDropHandlers(el);
    } else {
      // SUBSEQUENT RENDERS: Just clear the layer's contents
      log("ForceRenderer: Re-render, clearing zoom layer contents.");
      this._zoomLayer.selectAll("*").remove();

      // Ensure the layer has the correct transform
      this._zoomLayer.attr("transform", this._currentTransform);
    }

    // All rendering now happens inside this._zoomLayer
    const zoomLayer = this._zoomLayer;
    // ------------------------------------

    // --- START: Background Image Update ---
    const bgWidth = renderGraph.background.width || renderGraph.width;
    const bgHeight = renderGraph.background.height || renderGraph.height;

    // APPSND TO 'zoomLayer', NOT 'this._svg'
    zoomLayer.append("image")
      .attr("xlink:href", renderGraph.background.image || "modules/foundry-graph/img/vampire.png")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", bgWidth)
      .attr("height", bgHeight);

    log("added background image")

    // --- FIX: <defs> must be a child of <svg>, NOT the zoomLayer ---
    let defs = this._svg.select("defs");
    if (defs.empty()) {
      defs = this._svg.append("defs");
    }
    // -----------------------------------------------------------

    // This marker setup is fine, it just appends to 'defs'
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

    // --- All other elements go inside the 'zoomLayer' ---
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
        log("LINK noArrow:", noArrow, d);
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
      log("DRAG START", d);
      simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      log("DRAGGING", d);
      d.x = d.fx = event.x;
      d.y = d.fy = event.y;
    }

    function dragended(event, d) {
      log("DRAG END", d);
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
    log("_onDrop")
    log(event)
    const data = TextEditor.getDragEventData(event);
    log(data)
    const allowed = this.graph?.allowedEntities;
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(data.type)) {
      ui.notifications.warn(`You cannot add a ${data.type} on this graph type.`);
      return;
    }
    // Get mouse position relative to SVG

    // 1. Get the <g> element that is being transformed by zoom
    const zoomLayerNode = this._svg.select("g.zoom-layer").node();
    if (!zoomLayerNode) {
      log("Could not find zoom layer!");
      return;
    }

    // 2. Use d3.pointer() to get coordinates relative to the zoom layer
    //    This automatically accounts for the current pan and zoom.
    const [x, y] = d3.pointer(event, zoomLayerNode);
    // ==========================================================

    log("Drop position (transformed):", x, y);
    // Add new node
    const newId = safeUUID();

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
        log(page)
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
        log(scene)
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
        log(item)
        if (!item) {
          ui.notifications.warn("Could not find item");
          return;
        }

        this.addNode(this.graph, {
          id: newId,
          uuid: data.uuid,
          label: item.name,
          type: 'Item',
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

  hasEntity(graphData, uuid) {
    log("ForceRenderer.hasEntity", graphData, uuid);
    return graphData.data.nodes.some(n => n.uuid === uuid);
  }

  removeEntity(graphData, uuid) {
    // Clone to ensure immutability
    const graph = foundry.utils.deepClone(graphData);

    // Locate the nodes array
    let nodes = graph.data?.nodes;
    let links = graph.data?.links;

    if (!nodes) return graph;

    // 1. Find the node IDs to remove
    const nodesToRemove = nodes.filter(n => n.uuid === uuid);
    if (nodesToRemove.length === 0) return graph;

    const nodeIdsToRemove = new Set(nodesToRemove.map(n => n.id));

    // 2. Filter Nodes
    const cleanNodes = nodes.filter(n => n.uuid !== uuid);

    // 3. Filter Links (remove if source OR target is gone)
    const cleanLinks = (links || []).filter(l =>
      !nodeIdsToRemove.has(l.source) && !nodeIdsToRemove.has(l.target)
    );

    // 4. Assign back
    graph.data.nodes = cleanNodes;
    graph.data.links = cleanLinks;

    return graph;
  }

}