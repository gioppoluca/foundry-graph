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

    // Link endpoint rewiring state
    this._isRewiringLink = false;
    this._rewireGhostLine = null;
  }

  get instructions() {
    return `
    <b>Shift + Drag</b>: Link Nodes<br>
    <b>Drag</b>: Move/Position Nodes<br>
    <b>Scroll</b>: Zoom<br>
    <b>DblClick</b>: Open Sheet<br>
    <b>Left Click</b>: Delete Node or Link
  `;
  }

  get isLinkNodesVisible() {
    // Return false to hide the button because we now use Shift+Drag
    // Return true if you want to keep the button as an alternative
    return false;
  }

  get isRelationSelectVisible() {
    // Return false to hide the button because we now use Shift+Drag
    // Return true if you want to keep the button as an alternative
    return true;
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
        status: Array.isArray(n.status) ? n.status : (n.status == null ? [] : [n.status]),
        x: n.x,
        y: n.y,
        // Keep fx/fy to preserve user-dragged positions
        fx: n.fx,
        fy: n.fy
      })),
      links: links.map(l => ({
        // CRITICAL FIX: Store only the ID of the source and target nodes
        id: l.id,
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
    this._closeRadialMenu?.();
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
    const self = this;
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
    // Ensure every link has a stable id (older graphs or legacy links may be missing it)

    // Ensure every link has a stable id (older graphs or legacy links may be missing it)
    if (Array.isArray(renderGraph?.data?.links)) {
      for (const l of renderGraph.data.links) {
        if (!l.id) l.id = safeUUID();
      }
    }

    // Ensure every node has a defensive status array
    for (const n of renderGraph.data.nodes) {
      if (!Array.isArray(n.status)) n.status = n.status == null ? [] : [n.status];
    }

    const getOverlaySymbol = (node) => {
      const st = Array.isArray(node?.status) ? node.status : [];
      if (st.includes("hidden")) return "?";
      if (st.includes("locked")) return "🔒";
      if (st.includes("warning")) return "!";
      return "";
    };

    const isHidden = (node) => {
      const st = Array.isArray(node?.status) ? node.status : (node?.status == null ? [] : [node.status]);
      return st.includes("hidden");
    };

    // Utility: links may contain endpoints as node objects (after d3.forceLink)
    // or as raw node ids (persisted format). Always normalize when comparing.
    const getEndpointId = (endpoint) => (typeof endpoint === "object" ? endpoint?.id : endpoint);

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

    if (defs.select("#fg-blur").empty()) {
      const f = defs.append("filter")
        .attr("id", "fg-blur")
        .attr("x", "-30%")
        .attr("y", "-30%")
        .attr("width", "160%")
        .attr("height", "160%");
      f.append("feGaussianBlur")
        .attr("in", "SourceGraphic")
        .attr("stdDeviation", "4"); // tune blur strength
    }

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
      .data(renderGraph.data.links, d => d.id)
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
      .attr("filter", d => isHidden(d) ? "url(#fg-blur)" : null)
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
                id: safeUUID(),
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
        //this._onRightClickNode(d);
        this._onRightClickNode(event, d);
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

    const nodeOverlayCircle = zoomLayer.append("g")
      .attr("class", "node-status-overlay")
      .selectAll("circle")
      .data(renderGraph.data.nodes, d => d.id)
      .join("circle")
      .attr("r", 32)
      .attr("fill", "#808080")
      .attr("opacity", d => (getOverlaySymbol(d) ? 0.55 : 0))
      .attr("pointer-events", "none");

    const nodeOverlayText = zoomLayer.append("g")
      .attr("class", "node-status-overlay-text")
      .selectAll("text")
      .data(renderGraph.data.nodes, d => d.id)
      .join("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 28)
      .attr("fill", "#ffffff")
      .attr("opacity", d => (getOverlaySymbol(d) ? 1 : 0))
      .attr("pointer-events", "none")
      .text(d => getOverlaySymbol(d));

    const nodeLabels = zoomLayer.append("g")
      .attr("class", "node-labels")
      .selectAll("text")
      .data(renderGraph.data.nodes)
      .join("text")
      .attr("font-size", 12)
      .attr("fill", renderGraph?.nodeLabelColor || "#000")
      .attr("text-anchor", "middle")
      .text(d => isHidden(d) ? "?" : (d.label || d.id));

    log("added nodes and labels")

    const simulation = d3.forceSimulation(renderGraph.data.nodes).stop();
    const linkForce = d3.forceLink().id(d => d.id).distance(200); // set id accessor *before* links
    simulation.force("link", linkForce);
    simulation.force("charge", d3.forceManyBody().strength(-400));
    simulation.force("center", d3.forceCenter(400, 300));
    linkForce.links(renderGraph.data.links);

    // NEW CODE ADDED BELOW
    // ------------------------------
    // Rewire handles (shown only on link hover)
    // ------------------------------
    const resolveEndpointNode = (endpoint) => {
      if (!endpoint) return null;
      if (typeof endpoint === "object") return endpoint;
      return renderGraph.data.nodes.find(n => n.id === endpoint) ?? null;
    };

    // Handles should be placed where the arrow marker appears, not at node center.
    // Marker uses refX=30 in defs, so we match that offset here.
    const END_OFFSET = 30;
    const endpointHandlePos = (linkObj, end) => {
      const s = resolveEndpointNode(linkObj.source);
      const t = resolveEndpointNode(linkObj.target);
      if (!s || !t) return { x: 0, y: 0 };
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      if (end === "target") return { x: t.x - ux * END_OFFSET, y: t.y - uy * END_OFFSET };
      return { x: s.x + ux * END_OFFSET, y: s.y + uy * END_OFFSET };
    };

    const handleData = renderGraph.data.links.flatMap(l => ([
      { link: l, end: "source", _hid: `${l.id}:source` },
      { link: l, end: "target", _hid: `${l.id}:target` },
    ]));

    const showHandlesFor = (linkId) => {
      linkHandles
        .attr("opacity", h => (h.link.id === linkId ? 1 : 0))
        .style("pointer-events", h => (h.link.id === linkId ? "all" : "none"));
    };
    const hideHandles = () => {
      // If we are actively dragging a handle, do not hide until drag end
      if (self._isRewiringLink) return;
      linkHandles.attr("opacity", 0).style("pointer-events", "none");
    };

    const rewireDrag = d3.drag()
      .on("start", (event, h) => {
        event.sourceEvent?.stopPropagation?.();
        event.sourceEvent?.preventDefault?.();

        self._isRewiringLink = true;
        showHandlesFor(h.link.id);

        //        const otherEndpoint = h.end === "source" ? h.link.target : h.link.source;
        //        const otherNode = resolveEndpointNode(otherEndpoint);
        //        if (!otherNode) return;
        const otherEnd = h.end === "source" ? "target" : "source";
        const otherPos = endpointHandlePos(h.link, otherEnd);

        self._rewireGhostLine = zoomLayer.append("line")
          .attr("class", "rewire-ghost")
          //          .attr("x1", otherNode.x)
          //         .attr("y1", otherNode.y)
          //        .attr("x2", otherNode.x)
          //       .attr("y2", otherNode.y)
          .attr("x1", otherPos.x)
          .attr("y1", otherPos.y)
          .attr("x2", otherPos.x)
          .attr("y2", otherPos.y)
          .attr("stroke", h.link.color || "#000")
          .attr("stroke-width", (h.link.strokeWidth || 2))
          .style("stroke-dasharray", "4 4")
          .attr("pointer-events", "none");
      })
      .on("drag", (event) => {
        if (!self._rewireGhostLine) return;
        self._rewireGhostLine.attr("x2", event.x).attr("y2", event.y);
      })
      .on("end", (event, h) => {
        if (self._rewireGhostLine) {
          self._rewireGhostLine.remove();
          self._rewireGhostLine = null;
        }
        self._isRewiringLink = false;

        const otherEndpoint = h.end === "source" ? h.link.target : h.link.source;
        const otherNode = resolveEndpointNode(otherEndpoint);
        if (!otherNode) { hideHandles(); return; }

        const droppedOn = simulation.find(event.x, event.y, 30);
        if (!droppedOn) { hideHandles(); return; }

        if (droppedOn.id === otherNode.id) {
          ui.notifications.warn("Cannot link a node to itself.");
          hideHandles();
          return;
        }

        // Prevent duplicate links (undirected)
        const newSourceId = h.end === "source" ? droppedOn.id : otherNode.id;
        const newTargetId = h.end === "target" ? droppedOn.id : otherNode.id;
        const duplicate = renderGraph.data.links.some(l => {
          if (l === h.link) return false;
          const s = getEndpointId(l.source);
          const t = getEndpointId(l.target);
          return (s === newSourceId && t === newTargetId) || (s === newTargetId && t === newSourceId);
        });
        if (duplicate) {
          ui.notifications.warn("That link already exists.");
          hideHandles();
          return;
        }

        if (h.end === "source") h.link.source = droppedOn.id;
        else h.link.target = droppedOn.id;

        self.render();
      });

    const linkHandles = zoomLayer.append("g")
      .attr("class", "link-handles")
      .selectAll("circle")
      .data(handleData, d => d._hid)
      .join("circle")
      .attr("r", 7)
      .attr("fill", d => d.link.color || "#000")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      // Hidden by default so exports don't include them
      .attr("opacity", 0)
      .style("pointer-events", "none")
      .style("cursor", "grab")
      .call(rewireDrag);

    // Show handles only while hovering the link (or while rewiring)
    link
      .on("mouseenter", (event, d) => {
        if (self._isDraggingLink) return;
        showHandlesFor(d.id);
      })
      .on("mouseleave", (event) => {
        const rt = event.relatedTarget;
        if (rt && rt.closest && rt.closest(".link-handles")) return;
        hideHandles();
      });

    // Also keep handles visible while hovering the handles themselves
    linkHandles
      .on("mouseenter", (event, h) => {
        event.stopPropagation?.();
        showHandlesFor(h.link.id);
      })
      .on("mouseleave", (event) => {
        const rt = event.relatedTarget;
        if (rt && rt.closest && rt.closest("line")) return;
        hideHandles();
      });

    // ------------------------------

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

      nodeOverlayCircle
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("opacity", d => (getOverlaySymbol(d) ? 0.55 : 0));

      nodeOverlayText
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("opacity", d => (getOverlaySymbol(d) ? 1 : 0))
        .text(d => getOverlaySymbol(d));

      // Position rewire handles at link endpoints (even though hidden by default)
      /*
      linkHandles
        .attr("cx", h => {
          const n = resolveEndpointNode(h.end === "source" ? h.link.source : h.link.target);
          return n?.x ?? 0;
        })
        .attr("cy", h => {
          const n = resolveEndpointNode(h.end === "source" ? h.link.source : h.link.target);
          return n?.y ?? 0;
        });
        */
      linkHandles
        .attr("cx", h => endpointHandlePos(h.link, h.end).x)
        .attr("cy", h => endpointHandlePos(h.link, h.end).y);
    }

    function dragstarted(event, d) {
      // 1. Check for Shift key to start "Linking Mode"
      if (event.sourceEvent.shiftKey) {
        self._isDraggingLink = true;
        self._linkSourceNode = d;

        // Get style from current relation or default
        const rel = self.relation || { color: "#000000", strokeWidth: 2, style: "solid" };

        // Create the temporary line
        self._dragLine = zoomLayer.append("line")
          .attr("class", "drag-line")
          .attr("x1", d.x)
          .attr("y1", d.y)
          .attr("x2", d.x)
          .attr("y2", d.y)
          .attr("stroke", rel.color)
          .attr("stroke-width", rel.strokeWidth)
          .style("stroke-dasharray", rel.style === "dashed" ? "4 4" : (rel.style === "dotted" ? "2 4" : "0"))
          .attr("pointer-events", "none"); // Ignore mouse events so we can detect target node below

        return; // Stop here, do not move the node
      }
      log("DRAG START", d);
      simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      // 2. Update the visual line
      if (self._isDraggingLink && self._dragLine) {
        self._dragLine
          .attr("x2", event.x)
          .attr("y2", event.y);
        return;
      }
      log("DRAGGING", d);
      d.x = d.fx = event.x;
      d.y = d.fy = event.y;
    }

    function dragended(event, d) {
      // 3. Finish Link Drag
      if (self._isDraggingLink) {
        if (self._dragLine) {
          self._dragLine.remove();
          self._dragLine = null;
        }
        self._isDraggingLink = false;

        // Find the node under the mouse cursor
        // simulation.find uses the same coordinate system as nodes
        const target = simulation.find(event.x, event.y, 30); // 30px hit radius

        if (target && target !== d) {
          const source = d;

          // Check for existing links
          const alreadyLinked = renderGraph.data.links.some(l =>
            (l.source.id === source.id && l.target.id === target.id) ||
            (l.source.id === target.id && l.target.id === source.id)
          );

          if (!alreadyLinked) {
            const relation = self.relation;
            if (!relation) {
              ui.notifications.warn("Please select a valid relation type before creating the link.");
            } else {
              renderGraph.data.links.push({
                id: safeUUID(),
                source: source.id,
                target: target.id,
                relationId: relation.id,
                label: relation.label,
                color: relation.color,
                style: relation.style,
                noArrow: relation?.noArrow || false,
                strokeWidth: relation.strokeWidth
              });
              self.render(); // Redraw graph
              ui.notifications.info(`Linked ${source.label} → ${target.label} (${relation.label})`);
            }
          }
        }
        self._linkSourceNode = null;
        return;
      }
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

  /*
  async _onRightClickNode(nodeData) {
    log("_onRightClickNode", nodeData)
    const confirmed = await DialogV2.confirm({
      content: `Delete node "${nodeData.label || nodeData.id}"?`,
    })
    if (confirmed) {
      // Remove node and connected links
      this.graph.data.nodes = this.graph.data.nodes.filter(n => n.id !== nodeData.id);
      //      this.graph.data.links = this.graph.data.links.filter(l => l.source.id !== nodeData.id && l.target.id !== nodeData.id);
      this.graph.data.links = this.graph.data.links.filter(l => {
        const sourceId = typeof l.source === "object" ? l.source.id : l.source;
        const targetId = typeof l.target === "object" ? l.target.id : l.target;
        return sourceId !== nodeData.id && targetId !== nodeData.id;
      });
      this.render(); // Redraw
    }
  }
  */
  async _onRightClickNode(event, nodeData) {
    log("_onRightClickNode", nodeData);
    const label = nodeData.label || nodeData.id;
    if (!Array.isArray(nodeData.status)) {
      nodeData.status = nodeData.status == null ? [] : [nodeData.status];
    }
    const isHidden = nodeData.status.includes("hidden");

    this._showRadialMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      items: [
        {
          id: "toggleHidden",
          label: isHidden ? `Show to players (${label})` : `Hide from players (${label})`,
          icon: isHidden ? "fa-solid fa-eye" : "fa-solid fa-eye-slash",
          onClick: async () => {
            const st = Array.isArray(nodeData.status) ? [...nodeData.status] : [];
            const idx = st.indexOf("hidden");
            if (idx >= 0) st.splice(idx, 1); else st.push("hidden");
            nodeData.status = st;
            this.render();
          }
        },
        {
          id: "delete",
          label: `Delete (${label})`,
          icon: "fa-solid fa-trash",
          onClick: async () => {
            const confirmed = await DialogV2.confirm({ content: `Delete node "${label}"?` });
            if (!confirmed) return;

            this.graph.data.nodes = this.graph.data.nodes.filter(n => n.id !== nodeData.id);
            this.graph.data.links = this.graph.data.links.filter(l => {
              const sourceId = typeof l.source === "object" ? l.source.id : l.source;
              const targetId = typeof l.target === "object" ? l.target.id : l.target;
              return sourceId !== nodeData.id && targetId !== nodeData.id;
            });
            this.render();
          }
        }
      ]
    });
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