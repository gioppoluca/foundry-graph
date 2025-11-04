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
    this.search_input = null
    this.dropdown = null
    this.all_select_options = []
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
    this.f3Chart.onCardClick = (datum/*, event*/) => {
      log("Card clicked:", datum);
      //log("Event:", event);
      // Option A: keep selection UI, but DO NOT change main id
      // f3Chart.updateMainId(datum.id);   // <-- do NOT call this

      // Option B: if you do change main id, inherit the current view instead of recentering:
      // f3Chart.updateMainId(datum.id);
      this.f3Chart.updateTree({ initial: true, tree_position: "inherit" })
        .setAncestryDepth(5)
    };
    this.f3Chart.setCardHtml()
      .setCardDisplay([["first name", "last name"], []])
      .setOnCardClick((e, d) => {
        log("Card clicked:", e, d);
      });
    /*
    let f3Card = this.f3Chart.setCardHtml()
      .setCardDisplay([["first name", "last name"], ["birthday"]])
      
    const f3EditTree = this.f3Chart.editTree()
      .setFields(["first name", "last name", "birthday"])
      .setEditFirst(true)  // true = open form on click, false = open info in click
      .setCardClickOpen(f3Card)
*/
    this.f3Chart.updateTree({ initial: true, tree_position: "fit" });
    //    f3EditTree.open(this.f3Chart.getMainDatum())
    this.f3Chart.updateTree({ initial: true })


    const elHtml = document.querySelector("#FamilyChart #f3Canvas");  // present in many f3 builds
    log("elHtml", elHtml);
    //    [elSvg, elHtml, elRoot].forEach(el => {
    [elHtml].forEach(el => {
      if (!el) return;
      this._detachDropHandlers(el);
      this._attachDropHandlers(el, this._onDrop.bind(this));
    });


    const f3Card = this.f3Chart.setCardHtml()
      .setOnCardUpdate(function (d) {
        if (d.data._new_rel_data) return

        d3.select(this).select('.card').style('cursor', 'default')
        const card = this.querySelector('.card-inner')
        d3.select(card)
          .append('div')
          .attr('class', 'f3-svg-circle-hover')
          .attr('style', 'cursor: pointer; width: 20px; height: 20px;position: absolute; top: 0; right: 0;')
          .html(f3.icons.userEditSvgIcon())
          .select('svg')
          .style('padding', '0')
          .on('click', (e) => {
            e.stopPropagation()
            log("edit click", d, e)
            /*
            f3EditTree.open(d.data)
            if (f3EditTree.isAddingRelative()) return
            if (f3EditTree.isRemovingRelative()) return
            */
            f3Card.onCardClickDefault(e, d)
          })
        d3.select(card)
          .append('div')
          .attr('class', 'f3-svg-circle-hover')
          .attr('style', 'cursor: pointer; width: 20px; height: 20px;position: absolute; top: 0; right: 23px;')
          .html(f3.icons.trashIcon())
          .select('svg')
          .style('padding', '0')
          .on('click', (e) => {
            e.stopPropagation()
            log("delete", d, e)
            log("f3", f3  )
            /*
            if (f3EditTree.isAddingRelative()) {
              if (f3Chart.store.getMainDatum().id === d.data.id) {
                f3EditTree.addRelativeInstance.onCancel()
              } else {
                f3EditTree.addRelativeInstance.onCancel()
                f3EditTree.open(d.data)
                f3Card.onCardClickDefault(e, d)
                document.querySelector('.f3-add-relative-btn').click()
              }
            } else {
              f3EditTree.open(d.data)
              f3Card.onCardClickDefault(e, d)
              document.querySelector('.f3-add-relative-btn').click()
            }
              */
          })
      })

    this.f3Chart.updateTree({ initial: true })
    // setup search dropdown
    this.all_select_options = []
    this.data.forEach(d => {
      if (this.all_select_options.find(d0 => d0.value === d["id"])) return
      this.all_select_options.push({ label: `${d.data["first name"]}`, value: d["id"] })
    })
    log("all_select_options", this.all_select_options)
    this.search_cont = d3.select(document.querySelector("#FamilyChart")).append("div")
      .attr("style", "position: absolute; top: 10px; left: 10px; width: 150px; z-index: 1000;")
      .on("focusout", () => {
        setTimeout(() => {
          if (!this.search_cont.node().contains(document.activeElement)) {
            this.updateDropdown([]);
          }
        }, 200);
      })
    log("search_cont", this.search_cont)
    this.search_input = this.search_cont.append("input")
      .attr("id", "tree-search-input")
      .attr("style", "width: 100%;")
      .attr("type", "text")
      .attr("placeholder", "Search")
      .on("focus", this.activateDropdown.bind(this))
      .on("input", this.activateDropdown.bind(this))
    log("this.search_input", this.search_input)
    this.dropdown = this.search_cont.append("div").attr("style", "overflow-y: auto; max-height: 300px; background-color: #000;")
      .attr("tabindex", "0")
      .on("wheel", (e) => {
        e.stopPropagation()
      })

  }


  activateDropdown() {
    log("activateDropdown")
    log("this.search_input", this.search_input)
    let si = d3.select(document.querySelector("#tree-search-input"))
    log("si", si)
    log("this", this)
    log("this.all_select_options", this.all_select_options)
    const search_input_value = si.property("value")
    const filtered_options = this.all_select_options.filter(d => d.label.toLowerCase().includes(search_input_value.toLowerCase()))
    this.updateDropdown(filtered_options)
  }

  updateDropdown(filtered_options) {
    this.dropdown.selectAll("div").data(filtered_options).join("div")
      .attr("style", "padding: 5px;cursor: pointer;border-bottom: .5px solid currentColor;")
      .on("click", (e, d) => {
        this.updateTreeWithNewMainPerson(d.value, true)
      })
      .text(d => d.label)
  }

  // with person_id this function will update the tree
  updateTreeWithNewMainPerson(person_id, animation_initial = true) {
    this.f3Chart.updateMainId(person_id)
    this.f3Chart.updateTree({ initial: animation_initial })
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
    let nodeLabel = "Node", nodeImg = "", nodeType = data.type, dropped, nodeGender = "";

    try { dropped = await fromUuid(data.uuid); } catch { }
    log("Dropped entity:", dropped);
    if (!dropped) {
      ui.notifications.warn("Could not resolve dropped entity.");
      return;
    }
    switch (data.type) {
      case "Actor":
        nodeLabel = dropped.name;
        nodeImg = dropped.img || "";
        nodeGender = dropped.system.details?.gender || "";
        log("Actor", dropped, nodeGender);
        break;
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
    newNode = {
      id: newId,
      "data": { "first name": nodeLabel, "last name": "", "birthday": "", "gender": "", "avatar": nodeImg },
      "rels": {
        "spouses": [],
        "children": []
      }
    };
    switch (this.relation.id) {
      case "father-of":
      case "parent-of":
        newNode.rels.father = md.id;
        if (this.data[idx].rels.children) {
          this.data[idx].rels.children.push(newId);
        } else {
          this.data[idx].rels = { children: [newId] }
        }
        break;
      case 'child-of':
        newNode.rels.children = [md.id];
        switch (nodeGender) {
          case "F":

            break;

          default:
            md.rels.father = newId;
            break;
        }
      default:
        break;
    }

    this.data.push(newNode);

    log("New data:", this.data);
    this.f3Chart.updateData(this.data);
    this.f3Chart.updateTree({ initial: true, tree_position: "fit" });

  }
}