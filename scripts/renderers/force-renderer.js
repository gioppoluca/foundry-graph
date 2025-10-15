import { log } from "../constants.js";
//import * as d3 from "../lib/d3.js";
import { BaseRenderer } from "./base-renderer.js";
const { DialogV2 } = foundry.applications.api;

export class ForceRenderer extends BaseRenderer {
  static ID = "force";

  constructor() {
    super()
    this._linkingMode = false;
    this._linkSourceNode = null;
    //this.relationId = null;
    this.relation = null

  }

  render(svg, graph, ctx) {
    log("ForceRenderer.render", svg, graph, ctx);
    svg
      .attr("width", graph.width)
      .attr("height", graph.height)
      .attr("viewBox", `0 0 ${graph.width} ${graph.height}`)
      .call(d3.zoom().on("zoom", (event) => {
        svg.select("g.zoom-layer").attr("transform", event.transform);
      }));

    svg.selectAll("*").remove();

    // Create a layer inside for zoom/pan
    const zoomLayer = svg.append("g").classed("zoom-layer", true);
    console.log("GIOPPO :META")
    svg.append("image")
      .attr("xlink:href", graph.background.image || "modules/foundry-graph/img/vampire.png")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", graph.width)
      .attr("height", graph.height);


    const simulation = d3.forceSimulation(graph.data.nodes)
      .force("link", d3.forceLink(graph.data.links).id(d => d.id).distance(200))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(400, 300))
      .on("tick", ticked)
      .on("end", () => {
        simulation.stop(); // 🔴 stop simulation once nodes settle
      });

    const link = svg.append("g")
      .attr("stroke-opacity", 0.8)
      .selectAll("line")
      .data(graph.data.links)
      .join("line")
      .attr("stroke", d => d.color || "#000")  // fallback if color is missing
      .style("stroke-dasharray", d => {
        if (d.style === "dashed") return "4 4";
        if (d.style === "dotted") return "2 4";
        return "0";
      })
      .attr("stroke-width", d => d.strokeWidth || 2)
      .on("contextmenu", (event, d) => {
        event.preventDefault();
        this._onRightClickLink(d, svg, graph);
      });

    const linkLabels = svg.append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(graph.data.links)
      .join("text")
      .attr("font-size", 12)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .text(d => d.label || d.type || "");

    const node = svg.append("g")
      .selectAll("image")
      .data(graph.data.nodes)
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
            const alreadyLinked = graph.data.links.some(l =>
              (l.source.id === source.id && l.target.id === target.id) ||
              (l.source.id === target.id && l.target.id === source.id)
            );
            if (!alreadyLinked && source.id !== target.id) {
              //const relationId = this.relationId
              const relation = this.relation
              if (!relation) {
                ui.notifications.warn("Please select a valid relation type before creating the link.");
                return;
              }
              graph.data.links.push({
                source: source.id,
                target: target.id,
                relationId: relation.id,
                label: relation.label,
                color: relation.color,
                style: relation.style,
                strokeWidth: relation.strokeWidth
              });
              this.render(svg, graph);
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
        this._onRightClickNode(d, svg, graph);
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

    const nodeLabels = svg.append("g")
      .attr("class", "node-labels")
      .selectAll("text")
      .data(graph.data.nodes)
      .join("text")
      .attr("font-size", 12)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .text(d => d.label || d.id);

    function ticked() {
      link
        .attr("x1", d => d.source.fx)
        .attr("y1", d => d.source.fy)
        .attr("x2", d => d.target.fx)
        .attr("y2", d => d.target.fy);

      node
        .attr("x", d => d.fx - 32)
        .attr("y", d => d.fy - 32);

      linkLabels
        .attr("x", d => (d.source.fx + d.target.fx) / 2)
        .attr("y", d => (d.source.fy + d.target.fy) / 2);
      nodeLabels
        .attr("x", d => d.fx)
        .attr("y", d => d.fy + 42); // 32 (half icon) + 10 spacing
    }

    function dragstarted(event, d) {
      console.log("DRAG START", d);
      simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      console.log("DRAGGING", d);
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      console.log("DRAG END", d);
      if (!event.active) simulation.alphaTarget(0);
      // Do NOT nullify fx/fy — keep node fixed after drag
      d.fx = event.x;
      d.fy = event.y;
    }
  }


  addNode(graph, { id, label, type, img, uuid, x, y }) {
    graph.data.nodes.push({
      id: id,
      uuid: uuid,
      label: label,
      type: type,
      img: img,
      fx: x,
      fy: y
    });

  }

  setLinkingMode(enabled) {
    this._linkingMode = enabled;
  }

  setRelationData(relation) {
    //this.relationId = relationId;
    this.relation = relation;
  }

  async _onRightClickNode(nodeData, svg, graph) {
    log("_onRightClickNode", nodeData, graph)
    const confirmed = await DialogV2.confirm({
      content: `Delete node "${nodeData.label || nodeData.id}"?`,
    })
    if (confirmed) {
      // Remove node and connected links
      graph.data.nodes = graph.data.nodes.filter(n => n.id !== nodeData.id);
      graph.data.links = graph.data.links.filter(l => l.source.id !== nodeData.id && l.target.id !== nodeData.id);
      this.render(svg, graph); // Redraw
    }
  }

  async _onRightClickLink(linkData, svg, graph) {
    const confirmed = await DialogV2.confirm({
      content: `Delete link from "${linkData.source.label || linkData.source.id}" to "${linkData.target.label || linkData.target.id}"?`,
    })
    if (confirmed) {
      graph.data.links = graph.data.links.filter(l => l !== linkData);
      this.render(svg, graph); // Redraw
    }
  }
  /*
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

        this._nodes.push({
          id: newId,
          uuid: data.uuid,
          label: actor.name,
          type: 'Actor',
          img: actor.img,
          fx: x,
          fy: y
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

        this._nodes.push({
          id: newId,
          uuid: data.uuid,
          label: page.name,
          type: 'JournalEntryPage',
          img: "modules/foundry-graph/img/journal.png",
          fx: x,
          fy: y
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

        this._nodes.push({
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

        this._nodes.push({
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
    this._drawGraph({ nodes: this._nodes, links: this._links });

  }
*/
}