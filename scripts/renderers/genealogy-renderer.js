import { log, safeUUID } from "../constants.js";
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
    this._orientation = 'horizontal'; // default
    this.opts = {
      orientation: this._orientation,
      nodeClickFunction: (node, ft) => {
        log("nodeClickFunction")
        if (this._linkingMode) {
          log("Linking mode active");
          //          if (!this._linkSourceNode) {
          log("Setting source node for linking:", node);
          this._linkSourceNode = node;
          ui.notifications.info(`Selected source node: ${node.data.name}`);
          return
          //        } else {
          //      }
        }
        log("Node clicked:", node, ft);
        ft.nodeClickHandler(node);
      },
      nodeLabelFunction: (node, missingData) => {

        if (node.isUnion) return [];
        const name = node.data.name;
        const lines = [name];
        return lines;
      }
    }
    this.selectedNode = null;
    this._moveState = null;

  }

  get instructions() {
    return `
    <b>'Link Nodes' button</b>: To Activate Link Mode<br>
    <b>Click on Node</b>: Select Parent Node<br>
    <b>Drop</b>: Link Dropped Actor as Child<br>
    <b>Scroll</b>: Zoom<br>
    <b>DblClick</b>: Open Sheet<br>
    <b>Left Click</b>: Delete Node with all descendants
    <b>Ctrl Click</b>: To drag for re-parenting
  `;
  }

  get isLinkNodesVisible() {
    // Return false to hide the button because we now use Shift+Drag
    // Return true if you want to keep the button as an alternative
    return true;
  }

  get isRelationSelectVisible() {
    // Return false to hide the button because we now use Shift+Drag
    // Return true if you want to keep the button as an alternative
    return true;
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
    this._moveState = null;
    document.getElementById('genealogy-orientation-btn')?.remove();


  }
  /**
   * Find all nodes (persons + unions + links) connected to a starting person id.
   * Traversal is undirected.
   */
  getConnectedIds(data, startId) {
    const visited = new Set([startId]);
    const queue = [startId];
    const connectedLinks = new Set();

    // BFS
    while (queue.length > 0) {
      const current = queue.shift();
      for (const [src, dst] of data.links || []) {
        if (src === current && !visited.has(dst)) {
          visited.add(dst);
          queue.push(dst);
          connectedLinks.add(`${src}->${dst}`);
        } else if (dst === current && !visited.has(src)) {
          visited.add(src);
          queue.push(src);
          connectedLinks.add(`${dst}->${src}`);
        } else if (src === current || dst === current) {
          // even if both visited, still mark link as connected
          connectedLinks.add(`${src}->${dst}`);
        }
      }
    }

    // Split by type
    const connectedPersons = new Set(
      Object.keys(data.persons).filter(id => visited.has(id))
    );
    const connectedUnions = new Set(
      Object.keys(data.unions).filter(id => visited.has(id))
    );

    return {
      persons: connectedPersons,
      unions: connectedUnions,
      links: connectedLinks,
    };
  }

  /**
   * Find all nodes NOT connected to startId.
   */
  getDisconnectedIds(data, startId) {
    const connected = this.getConnectedIds(data, startId);

    const disconnectedPersons = new Set(
      Object.keys(data.persons).filter(id => !connected.persons.has(id))
    );
    const disconnectedUnions = new Set(
      Object.keys(data.unions).filter(id => !connected.unions.has(id))
    );

    const allLinks = new Set(
      (data.links || []).map(([a, b]) => `${a}->${b}`)
    );
    const disconnectedLinks = new Set(
      [...allLinks].filter(k => !connected.links.has(k))
    );

    return {
      persons: disconnectedPersons,
      unions: disconnectedUnions,
      links: disconnectedLinks,
    };
  }

  /**
 * Find all parent persons of a given personId.
 * Returns an array of parent ids (could be empty).
 */
  getParents(data, personId) {
    const parents = new Set();

    // find all unions where this person is a child
    const parentUnions = (data.links || [])
      .filter(([src, dst]) => dst === personId && data.unions[src])
      .map(([src]) => src);

    // for each of those unions, find persons that link to it
    for (const [src, dst] of data.links || []) {
      if (data.persons[src] && parentUnions.includes(dst)) {
        parents.add(src);
      }
    }

    return Array.from(parents);
  }

  render(svg, graph, ctx) {
    if (!this.graph) this.graph = graph;
    log("GenealogyRenderer.render complete");
    const renderGraph = this.graph;
    log("renderGraph:", renderGraph)
    if (!this._svg) this._svg = svg;
    //    this.setWindow();

    let el = document.querySelector("#d3-graph")
    log("attach drop handlers to", el, this._svg, this.graph)
    //this._attachDropHandlers(el, this._onDrop.bind(this));
    this._detachDropHandlers(el);

    // Attach new drop handler
    this._attachDropHandlers(el);
    if (this._svg) {
      this._svg.on(".zoom", null);                       // remove zoom listeners
      this._svg.selectAll("*").interrupt().remove();     // clear old DOM + timers
    }
    const bgWidth = renderGraph.background.width || renderGraph.width;
    const bgHeight = renderGraph.background.height || renderGraph.height;

    this._svg
      .attr("width", bgWidth)
      //      .attr("height", bgHeight)
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${bgWidth} ${bgHeight}`)
      .call(d3.zoom().on("zoom", (event) => {
        this._svg.select("g.zoom-layer").attr("transform", event.transform);
      }));

    this._svg.selectAll("*").remove();
    // Create a layer inside for zoom/pan
    const zoomLayer = this._svg.append("g").classed("zoom-layer", true);
    // --- START: Background Image Update ---

    zoomLayer.append("image")
      .attr("xlink:href", renderGraph.background.image || "modules/foundry-graph/img/vampire.png")
      .attr("x", 0)
      .attr("y", 0)
      .attr("id", "background")
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

      log("this.opts:", this.opts)
      this.familytree = new FT.FamilyTree(this.graph.data, container, this.opts);

      log("FT:", this.familytree)
    }

    // add right click only afterr the graph is created or there are no circles
    this._svg.selectAll('circle')
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        event.stopPropagation();

        // Get the D3 node’s bound data if any
        const nodeData = d || event.target.__data__ || null;
        const nodeId = nodeData?.data?.id ?? event.target.getAttribute('data-id') ?? null;

        log('Right-clicked circle:', nodeId, nodeData);

        this._onNodeRightClick(nodeId, nodeData, event);
      });
    this._attachMoveHandlers();
    // Inject the overlay button (safe to call on every render — it's idempotent)
    this._injectOrientationButton();

  }

  async _onNodeRightClick(nodeId, nodeData, event) {
    log("_onNodeRightClick", nodeId, nodeData)
    let dialogContent = ""
    let deletingStart = false;
    let parents = []
    if (nodeId === this.graph.data.start) {
      deletingStart = true
      parents = this.getParents(this.graph.data, nodeId);
      if (parents.length > 0) {
        dialogContent = `Delete node "${nodeData.data.name || nodeId}" and all descendants? One of its parents will be promoted to graph start.`
      } else {
        dialogContent = `By deleting "${nodeData.data.name || nodeId}" you are deleting the whole graph are you sure?`
      }
    } else {
      dialogContent = `Delete node "${nodeData.data.name || nodeId}" and all descendants?`
    }
    const confirmed = await DialogV2.confirm({
      content: dialogContent,
    })
    if (confirmed) {
      if (deletingStart) {
        if (parents.length > 0) {
          this.graph.data.start = parents[0];
          ui.notifications.info(game.i18n.format("genealogy.promoteStart", { newStart: parents[0] }));
        } else {
          // delete all graph
          this.graph.data = this.initializeGraphData()
        }
      }
      // Remove node and connected links
      this.familytree.deletePerson(nodeId, false)
      let dis = this.getDisconnectedIds(this.graph.data, this.graph.data.start)
      log("disconnected", dis)
      dis.persons.forEach((person) => {
        this.familytree.deletePerson(person, false)
      })
      dis.unions.forEach((union) => {
        this.familytree.deleteUnion(union, false)
      })

      this.render(); // Redraw
    }
  }


  addNode(graph, { id, label, type, img, uuid, x, y }) {
    log("GenealogyRenderer.addNode", graph, id, label, type, img, uuid, x, y);
    if (graph.data.start) {
      // already initialized
      if (!this._linkSourceNode) {
        ui.notifications.warn("Please activate linking mode and select a source node before adding a new node.");
        return;
      }
      // we look if the existing node has a family
      let familyId = null;
      if (this._linkSourceNode.data.ownFamily) {
        familyId = this._linkSourceNode.data.ownFamily;
        log("Source node has family:", familyId);
      } else {
        log("Source node has no family.");
        familyId = safeUUID();
        // now we must update the parent node to have this family
        this.familytree.addPerson({
          id: this._linkSourceNode.data.id,
          name: this._linkSourceNode.data.name,
          ownFamily: familyId,
          parentFamily: this._linkSourceNode.data.parentFamily
        });
      }
      log("Adding person to existing familytree", this._linkSourceNode);
      // in case of wanting to read birth from system:
      // WoD: system.bio.dateof.birth/death

      log("this.relation:", this.relation);
      switch (this.relation.id) {
        case "child-of":
          // since the existing node is the parent the child has not a family of its own yet
          this.familytree.addPerson({ id: uuid, name: label, parentFamily: familyId });
          // add the union of the parents if not already existing (should overwrite it in any case)
          this.familytree.addUnion({ id: familyId });
          // before the link from the source to union - again should overwrite if already present
          this.familytree.addLink(this._linkSourceNode.data.id, familyId);
          // then the link from union to new node [child]
          this.familytree.addLink(familyId, uuid);

          break;
        case "parent-of":
          // since the existing node is the child and I'm adding a parent we must create a new family 
          // for the new parent unless the child already has a parentFamily field
          let parentFamilyId = null;
          if (this._linkSourceNode.data.parentFamily) {
            parentFamilyId = this._linkSourceNode.data.parentFamily;
            log("Source node has parent family:", parentFamilyId);
          } else {
            parentFamilyId = safeUUID();
            // now we must update the child node to have this parentFamily
            this.familytree.addPerson({
              id: this._linkSourceNode.data.id,
              name: this._linkSourceNode.data.name,
              parentFamily: parentFamilyId,
              ownFamily: this._linkSourceNode.data.ownFamily
            });
            // also we must add the union and link it to the child
            this.familytree.addUnion({ id: parentFamilyId });
            this.familytree.addLink(parentFamilyId, this._linkSourceNode.data.id);
          }
          // add the new parent
          this.familytree.addPerson({ id: uuid, name: label, ownFamily: parentFamilyId });
          // add the link of the parent
          this.familytree.addLink(uuid, parentFamilyId);

          break;
        case "spouse-of":
          // since we are adding a spouse we assign it to the existing family of the existing spouse
          this.familytree.addPerson({ id: uuid, name: label, ownFamily: familyId });
          // add the union of the parents if not already existing (should overwrite it in any case)
          this.familytree.addUnion({ id: familyId });
          // before the link from the source to union - again should overwrite if already present
          this.familytree.addLink(this._linkSourceNode.data.id, familyId);
          // then the link from new node [spouse] to union
          this.familytree.addLink(uuid, familyId);
          break;
        default:
          break;
      }

    } else {
      // first node
      this.graph.data = {
        "start": uuid,
        "persons": { [uuid]: { name: label } },
        "unions": {},
        "links": []
      }
      log("initialize familytree", this.graph.data, this._svg)
      const container = document.getElementById('FamilyChartInnerSVG');
      log("container:", container);
      log("this.opts:", this.opts)
      this.familytree = new FT.FamilyTree(this.graph.data, container, this.opts);
      this._attachMoveHandlers();

    }
  }

  setLinkingMode(enabled) {
    this._linkingMode = enabled;
  }

  setRelationData(relation) {
    this.relation = relation;
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
    event.preventDefault();
    event.stopPropagation();
    const data = TextEditor.getDragEventData(event);
    log(data)
    const allowed = this.graph?.allowedEntities;
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(data.type)) {
      ui.notifications.warn(`You cannot add a ${data.type} on this graph type.`);
      return;
    }
    log("this.graph:", this.graph)
    const hasStart =
      typeof this.graph?.data?.start === "string" &&
      this.graph.data.start.trim() !== "";
    log("hasStart:", hasStart)
    log("this._linkSourceNode:", this._linkSourceNode)
    log("!this._linkSourceNode:", !this._linkSourceNode)
    if (hasStart && !this._linkSourceNode) {
      ui.notifications.warn("Please select one node before linking or activate linking mode.");
      return
    }
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
        ui.notifications.info(`You cannot add a Journal Page on a genealogy tree.`);
        break;
      case 'Scene':
        ui.notifications.info(`You cannot add a Scene on a genealogy tree.`);
        break;
      case 'Item':
        ui.notifications.info(`You cannot add an Item on a genealogy tree.`);
        break;

      default:
        break;
    }
    log(this.graph)
    this.render();
  }

  hasEntity(graphData, uuid) {
    log("GenealogyRenderer.hasEntity", graphData, uuid);
    if (!graphData.data.persons) {
      return false;
    }

    const persons = graphData.data.persons;

    // 2. Direct Lookup (O(1))
    // Based on your JSON, the keys of the 'persons' object ARE the UUIDs.
    if (Object.prototype.hasOwnProperty.call(persons, uuid)) {
      return true;
    }
    return false;
  }
  removeEntity(graphData, uuid) {
    // Defensive clone to keep callers safe
    const graph = foundry.utils.deepClone(graphData);

    const data = graph?.data;
    if (!data || !data.persons || !data.links) return graph;

    // If the person is not in the map, nothing to do
    if (!Object.prototype.hasOwnProperty.call(data.persons, uuid)) return graph;

    const persons = data.persons;
    const unions = data.unions ?? {};
    const links = data.links ?? [];

    // --- Build adjacency for fast traversal (src -> [dst...]) ---
    const out = new Map(); // Map<string, Set<string>>
    for (const pair of links) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const [src, dst] = pair;
      if (!out.has(src)) out.set(src, new Set());
      out.get(src).add(dst);
    }

    // --- Descendant traversal (downward only) ---
    // Rule: descendants are reached via: person.ownFamily (union) -> children persons
    const personsToDelete = new Set();
    const unionsToDelete = new Set();
    const queue = [uuid];

    while (queue.length > 0) {
      const personId = queue.shift();
      if (!personId || personsToDelete.has(personId)) continue;

      const p = persons[personId];
      if (!p) continue;

      personsToDelete.add(personId);

      const ownFamily = p.ownFamily;
      if (ownFamily && unions[ownFamily]) {
        unionsToDelete.add(ownFamily);

        // children are linked as: [ownFamily, childPersonId]
        const children = out.get(ownFamily);
        if (children) {
          for (const childId of children) {
            if (persons[childId] && !personsToDelete.has(childId)) {
              queue.push(childId);
            }
          }
        }
      }
    }

    // --- If we're deleting the start, try to promote a surviving parent ---
    if (data.start && personsToDelete.has(data.start)) {
      const parents = this.getParents(data, data.start); // uses links + unions
      const promoted = parents.find(pid => !personsToDelete.has(pid) && persons[pid]);
      data.start = promoted ?? "";
    }

    // --- Remove persons ---
    for (const pid of personsToDelete) {
      delete persons[pid];
    }

    // --- Remove unions (the ones that belong to deleted subtree) ---
    for (const uid of unionsToDelete) {
      delete unions[uid];
    }
    data.unions = unions;

    // --- Remove links touching deleted persons/unions ---
    data.links = (links || []).filter(([src, dst]) => {
      if (personsToDelete.has(src) || personsToDelete.has(dst)) return false;
      if (unionsToDelete.has(src) || unionsToDelete.has(dst)) return false;
      return true;
    });

    // --- Cleanup: remove any remaining unions that are now isolated (no links) ---
    // (optional but keeps data tidy)
    const usedUnionIds = new Set();
    for (const [src, dst] of data.links) {
      if (data.unions[src]) usedUnionIds.add(src);
      if (data.unions[dst]) usedUnionIds.add(dst);
    }
    for (const unionId of Object.keys(data.unions)) {
      if (!usedUnionIds.has(unionId)) delete data.unions[unionId];
    }

    // If start is empty, you may want to pick any remaining person as start (optional).
    // Here we leave it empty to avoid unexpected graph "teleporting".
    return graph;
  }

  async exportToPNG() {
    return await this.svgToCanvas({ scale: 3 });
  }

  // ─── MOVE / REPARENT FEATURE ──────────────────────────────────────────────────
  // Add to the constructor:
  //   this._moveState = null;   // { personId, personData, ghostEl, overlayEl }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── 1. Call this once after each render() ──────────────────────────────────
  _attachMoveHandlers() {
    const svg = this._svg;
    if (!svg) return;

    svg.selectAll("circle").each((d, i, nodes) => {
      const circle = d3.select(nodes[i]);
      // Only person nodes (not union nodes)
      if (!d?.data?.id || d.isUnion) return;

      circle
        .style("cursor", "grab")
        .on("mousedown.move", (event) => this._onMoveMouseDown(event, d))
    });

    // Global mouse tracking on the SVG
    svg
      .on("mousemove.move", (event) => this._onMoveMouseMove(event))
      .on("mouseup.move", (event) => this._onMoveMouseUp(event));
  }
  /*
    _onMoveMouseDown(event, nodeData) {
      // Only trigger on Ctrl+drag (to not conflict with normal click/zoom)
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
  
      const svgEl = this._svg.node();
      const pt = svgEl.createSVGPoint();
      pt.x = event.clientX; pt.y = event.clientY;
      const svgPt = pt.matrixTransform(svgEl.getScreenCTM().inverse());
  
      // Create a ghost circle that follows the cursor
      const ghost = this._svg.select("g.zoom-layer").append("circle")
        .classed("move-ghost", true)
        .attr("r", 22)
        .attr("cx", svgPt.x)
        .attr("cy", svgPt.y)
        .attr("fill", "rgba(255,200,0,0.5)")
        .attr("stroke", "#f90")
        .attr("stroke-width", 2)
        .attr("pointer-events", "none");
  
      this._moveState = {
        personId: nodeData.data.id,
        personData: nodeData.data,
        ghost,
        hoverTargetId: null,
      };
  
      ui.notifications.info(`Moving "${nodeData.data.name}" — Ctrl+drop on a target parent`);
    }
  
    _onMoveMouseMove(event) {
      if (!this._moveState) return;
      const { ghost } = this._moveState;
  
      const svgEl = this._svg.node();
      const pt = svgEl.createSVGPoint();
      pt.x = event.clientX; pt.y = event.clientY;
      const svgPt = pt.matrixTransform(svgEl.getScreenCTM().inverse());
  
      ghost.attr("cx", svgPt.x).attr("cy", svgPt.y);
  
      // Highlight whatever circle is under the cursor (excluding the dragged node)
      this._svg.selectAll("circle.move-highlight").classed("move-highlight", false)
        .attr("stroke", null).attr("stroke-width", null);
  
      this._moveState.hoverTargetId = null;
  
      // Hit-test: find closest person node within 30px of cursor
      this._svg.selectAll("circle").each((d, i, nodes) => {
        if (!d?.data?.id || d.isUnion) return;
        if (d.data.id === this._moveState.personId) return;
  
        const circle = nodes[i];
        const cx = parseFloat(circle.getAttribute("cx") || 0) + (circle.ownerSVGElement ? 0 : 0);
        const cy = parseFloat(circle.getAttribute("cy") || 0);
        // Use getBoundingClientRect for accurate screen position
        const rect = circle.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        if (Math.sqrt(dx * dx + dy * dy) < 30) {
          d3.select(circle).classed("move-highlight", true)
            .attr("stroke", "#0f0").attr("stroke-width", 4);
          this._moveState.hoverTargetId = d.data.id;
        }
      });
    }
  */
  _onMoveMouseUp(event) {
    if (!this._moveState) return;
    const { personId, personData, ghost, hoverTargetId } = this._moveState;

    ghost.remove();
    this._svg.selectAll("circle.move-highlight").classed("move-highlight", false)
      .attr("stroke", null).attr("stroke-width", null);

    this._moveState = null;

    if (!hoverTargetId) return; // dropped on empty space — cancel

    if (hoverTargetId === personId) return; // dropped on self — cancel

    // Prevent dropping onto own descendant (would create a cycle)
    if (this._isDescendant(personId, hoverTargetId)) {
      ui.notifications.error("Cannot move a node onto one of its own descendants.");
      return;
    }

    this._reparentPerson(personId, hoverTargetId);
  }

  _onMoveMouseDown(event, nodeData) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();

    // Ghost lives on the SVG ROOT — not inside zoom-layer — so it's unaffected by pan/zoom transform
    const ghost = this._svg.append("circle")
      .classed("move-ghost", true)
      .attr("r", 22)
      .attr("fill", "rgba(255,200,0,0.5)")
      .attr("stroke", "#f90")
      .attr("stroke-width", 2)
      .attr("pointer-events", "none");

    this._moveState = {
      personId: nodeData.data.id,
      personData: nodeData.data,
      ghost,
      hoverTargetId: null,
    };

    // Position it immediately at the cursor (SVG root coords)
    this._updateGhostPosition(event);

    ui.notifications.info(`Moving "${nodeData.data.name}" — Ctrl+drop on a target parent`);
  }

  _updateGhostPosition(event) {
    if (!this._moveState?.ghost) return;
    const svgEl = this._svg.node();
    const rect = svgEl.getBoundingClientRect();

    // Map clientX/Y → SVG root viewport coords (no zoom transform involved)
    const svgX = (event.clientX - rect.left) * (svgEl.viewBox.baseVal.width / rect.width);
    const svgY = (event.clientY - rect.top) * (svgEl.viewBox.baseVal.height / rect.height);

    this._moveState.ghost.attr("cx", svgX).attr("cy", svgY);
  }

  _onMoveMouseMove(event) {
    if (!this._moveState) return;

    this._updateGhostPosition(event);

    // Reset previous highlight
    this._svg.selectAll("circle.move-highlight")
      .classed("move-highlight", false)
      .attr("stroke", null)
      .attr("stroke-width", null);

    this._moveState.hoverTargetId = null;

    // Hit-test purely in screen space using getBoundingClientRect — no coordinate math needed
    this._svg.selectAll("circle").each((d, i, nodes) => {
      if (!d?.data?.id || d.isUnion) return;
      if (d.data.id === this._moveState.personId) return;

      const rect = nodes[i].getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;

      if (Math.sqrt(dx * dx + dy * dy) < 30) {
        d3.select(nodes[i])
          .classed("move-highlight", true)
          .attr("stroke", "#0f0")
          .attr("stroke-width", 4);
        this._moveState.hoverTargetId = d.data.id;
      }
    });
  }

  // ── 2. Core reparent logic (pure data surgery, no lib modification) ──────────
  _reparentPerson(personId, newParentId) {
    const data = this.graph.data;
    const person = data.persons[personId];
    if (!person) return;

    log(`Reparenting ${personId} under ${newParentId}`);

    // Step A: detach from old parentFamily
    const oldParentFamilyId = person.parentFamily;
    if (oldParentFamilyId) {
      // Remove the link [oldParentFamily → personId]
      data.links = data.links.filter(([s, t]) => !(s === oldParentFamilyId && t === personId));

      // If the old union now has no children left, clean it up
      const oldUnionStillHasChildren = data.links.some(
        ([s, t]) => s === oldParentFamilyId && data.persons[t]
      );
      if (!oldUnionStillHasChildren) {
        // Remove parents' links to this union too
        data.links = data.links.filter(([s, t]) => t !== oldParentFamilyId);
        delete data.unions[oldParentFamilyId];
        // Clear ownFamily from the old parents
        for (const [pid, p] of Object.entries(data.persons)) {
          if (p.ownFamily === oldParentFamilyId) {
            delete data.persons[pid].ownFamily;
          }
        }
      }
      delete person.parentFamily;
    }

    // Step B: attach to newParent's family
    const newParent = data.persons[newParentId];
    if (!newParent) return;

    let newFamilyId = newParent.ownFamily;
    if (!newFamilyId) {
      // Create a new union for the new parent
      newFamilyId = safeUUID();
      newParent.ownFamily = newFamilyId;
      data.unions[newFamilyId] = { id: newFamilyId, visible: true };
      // Link new parent → union
      this.familytree.addLink(newParentId, newFamilyId, false);
    }

    // Update person's parentFamily
    person.parentFamily = newFamilyId;

    // Link union → person
    this.familytree.addLink(newFamilyId, personId, false);

    // Flush
    this.familytree.reimportData();
    log("Reparent complete, new data:", data);
    ui.notifications.info(`Moved "${person.name}" under "${newParent.name}"`);
  }

  // ── 3. Cycle-guard: is candidateId a descendant of personId? ─────────────────
  _isDescendant(personId, candidateId) {
    const data = this.graph.data;
    const visited = new Set();
    const queue = [personId];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === candidateId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const p = data.persons[cur];
      if (!p?.ownFamily) continue;
      for (const [s, t] of data.links) {
        if (s === p.ownFamily && data.persons[t] && !visited.has(t)) {
          queue.push(t);
        }
      }
    }
    return false;
  }

  _toggleOrientation() {
    this._orientation = this._orientation === 'vertical' ? 'horizontal' : 'vertical';
    this.opts.orientation = this._orientation;

    // Update button label
    const btn = document.getElementById('genealogy-orientation-btn');
    if (btn) btn.textContent = this._orientation === 'vertical' ? '↕ Vertical' : '↔ Horizontal';

    // A full render() re-creates the FamilyTree instance with the new opts
    this.render();
  }
  _injectOrientationButton() {
    // Idempotent — don't inject twice
    if (document.getElementById('genealogy-orientation-btn')) return;

    const container = document.getElementById('d3-graph-container');
    if (!container) return;

    // Ensure the container is the positioning context
    container.style.position = 'relative';

    const btn = document.createElement('button');
    btn.id = 'genealogy-orientation-btn';
    btn.textContent = this._orientation === 'vertical' ? '↕ Vertical' : '↔ Horizontal';
    btn.title = 'Toggle tree orientation';
    Object.assign(btn.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: '100',
      padding: '4px 10px',
      background: 'rgba(30,30,30,0.85)',
      color: '#eee',
      border: '1px solid #666',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      userSelect: 'none',
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._toggleOrientation();
    });

    container.appendChild(btn);
  }
}
