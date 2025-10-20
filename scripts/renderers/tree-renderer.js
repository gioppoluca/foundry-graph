import { log } from "../constants.js";
import { BaseRenderer } from "./base-renderer.js";

/**
 * Minimal tree renderer. Expects data.links to define a single-root DAG.
 * If no clear root, picks the first node without incoming links.
 */
export class TreeRenderer extends BaseRenderer {
  static ID = "tree";

  constructor() {
    super()
    this._linkingMode = false;
    this._linkSourceNode = null;
    this.relation = null
  }

  initializeGraphData() {
    return []
  }

  teardown() {

  }

  setWindow() {
    const graphContainer = document.querySelector("#foundry-graph");
    if (graphContainer) {
      const oldSvg = graphContainer.querySelector("svg");
      if (oldSvg) {
        oldSvg.style.display = "none";
      }
    }
  }

  getGraphData() {
    return this.f3Chart.store.getData()
  }

  render(svg, graph, ctx) {
    log("TreeRenderer.render", svg, graph, ctx);
    this.setWindow();


    log(f3)
    /*
    this.data = [
      {
        "id": "1",
        "data": { "first name": "John", "last name": "Doe", "birthday": "1980", "gender": "M" },
        "rels": { "spouses": ["2"], "children": ["3"] }
      },
      {
        "id": "2",
        "data": { "first name": "Jane", "last name": "Doe", "birthday": "1982", "gender": "F" },
        "rels": { "spouses": ["1"], "children": ["3"] }
      },
      {
        "id": "3",
        "data": { "first name": "Bob", "last name": "Doe", "birthday": "2005", "gender": "M" },
        "rels": { "father": "1", "mother": "2" }
      }
    ]
      */
    this.data = graph.data;
    log(this.data)
    this.f3Chart = f3.createChart('#FamilyChart', this.data)
      .setShowSiblingsOfMain(true)
      .setAncestryDepth(5)
      .setTransitionTime(1000)
      .setCardXSpacing(250)
      .setCardYSpacing(100)
      .setSingleParentEmptyCard(false, "")
    log(this.f3Chart)

    // prevent recenter on click
    this.f3Chart.onCardClick = (datum /*, event */) => {
      log("Card clicked:", datum);
      // Option A: keep selection UI, but DO NOT change main id
      // f3Chart.updateMainId(datum.id);   // <-- do NOT call this

      // Option B: if you do change main id, inherit the current view instead of recentering:
      // f3Chart.updateMainId(datum.id);
      this.f3Chart.updateTree({ initial: false, tree_position: "inherit" })
        .setAncestryDepth(5)
    };
    this.f3Chart.setCardHtml()
      .setCardDisplay([["first name", "last name"], ["birthday"]])

    this.f3Chart.updateTree({ initial: true, tree_position: "fit" });
    const elHtml = document.querySelector("#FamilyChart #f3Canvas");  // present in many f3 builds
    log("elHtml", elHtml);
    //    [elSvg, elHtml, elRoot].forEach(el => {
    [elHtml].forEach(el => {
      if (!el) return;
      this._detachDropHandlers(el);
      this._attachDropHandlers(el, this._onDrop.bind(this));
    });

  }

  addNode(graph, { id, label, type, img, uuid, x, y }) {
  }

  setLinkingMode(enabled) {
    this._linkingMode = enabled;
  }

  setRelationData(relation) {
    this.relation = relation;
  }

  async _onDrop(event) {
    log("TreeRenderer._onDrop", event);
    if (!this._linkingMode) {
      log("Not in linking mode; ignoring drop");
      ui.notifications.info("Enable linking mode,  to add nodes. Choose a relation and select the node to apply the relation to.");
      return;
    }

    const data = TextEditor.getDragEventData(event);
    const newId = crypto.randomUUID();
    log("Drop data:", data);
    let nodeLabel = "Node", nodeImg = "", nodeType = data.type, dropped;

    try { dropped = await fromUuid(data.uuid); } catch { }
    log("Dropped entity:", dropped);
    if (!dropped) {
      ui.notifications.warn("Could not resolve dropped entity.");
      return;
    }
    switch (data.type) {
      case "Actor":
        nodeLabel = dropped.name; nodeImg = dropped.img || ""; break;
      case "Scene":
        nodeLabel = dropped.name; nodeImg = "modules/foundry-graph/img/mappin.png"; break;
      case "Item":
        nodeLabel = dropped.name; nodeImg = dropped.img || ""; break;
      case "JournalEntryPage":
        nodeLabel = dropped.name; nodeImg = "modules/foundry-graph/img/journal.png"; break;
      default:
        nodeLabel = dropped?.name ?? data.type;
    }

    log("Creating new node:", { id: newId, label: nodeLabel, type: nodeType, img: nodeImg, uuid: data.uuid });
    const md = this.f3Chart.getMainDatum()
    const idx = this.data.findIndex(el => el.id === md.id);
    log("Main datum:", md);
    let newNode = null;
    switch (this.relation.id) {
      case "father-of":
      case "parent-of":
        newNode = {
          id: newId,
          "data": { "first name": nodeLabel, "last name": "", "birthday": "", "gender": "", "avatar": nodeImg },
          "rels": {
            "father": `${md.id}`,
            "spouses": [],
            "children": []
          }
        };
        if (this.data[idx].rels.children) {
          this.data[idx].rels.children.push(newId);
        } else {
          this.data[idx].rels = { children: [newId] }
        }
        break;

      default:
        break;
    }

    this.data.push(newNode);

    log("New data:", this.data);
    this.f3Chart.updateData(this.data);
    this.f3Chart.updateTree({ initial: true, tree_position: "fit" });

  }
}