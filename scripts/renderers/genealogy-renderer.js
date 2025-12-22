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
    this.opts = {
      nodeClickFunction: (node, ft) => {
        console.log("nodeClickFunction")
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
      .attr("height", bgHeight)
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

        console.log('Right-clicked circle:', nodeId, nodeData);

        this._onNodeRightClick(nodeId, nodeData, event);
      });

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
        familyId = crypto.randomUUID();
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
            parentFamilyId = crypto.randomUUID();
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
    console.log("_onDrop")
    console.log(event)
    event.preventDefault();
    event.stopPropagation();
    const data = TextEditor.getDragEventData(event);
    console.log(data)
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
    console.log("GenealogyRenderer.hasEntity", graphData, uuid);
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
}
