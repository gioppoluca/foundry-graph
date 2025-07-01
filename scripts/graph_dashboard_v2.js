// graph_dashboard_v2.js
// ApplicationV2 dashboard with **no** global window references.
// Works on Foundry VTT v12+ which exposes ApplicationV2 and
// HandlebarsApplicationMixin via the "@foundry/client" package entry.
//
// A singleton GraphApi instance must be available at:
//   game.modules.get("foundry-graph").api
//
// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;


import GraphForm from "./graph_form.js";
import GraphFormV2 from "./graph_form_v2.js";

import * as d3 from "./lib/d3.js";

export default class GraphDashboardV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {GraphApi} api
   */
  constructor(api, options = {}) {
    super(options);
    this.api = api;
  }

  /* ------------------------------------------------------------------------ */
  /*  Static application definitions                                          */
  /* ------------------------------------------------------------------------ */

  static PARTS = {
    body: {
      template: "modules/foundry-graph/templates/dashboard.hbs"
    }
  };

  static DEFAULT_OPTIONS = {
    id: "fgraph-dashboard",
    title: "Foundry Graph",
    resizable: true,
    minimizable: true,
    width: 650,
    height: "auto",
    classes: ["fgraph", "fgraph-dashboard"],
    actions: {
      onCreateGraph: GraphDashboardV2.onCreateGraph,
      "edit-graph": "_onEditGraph",
      "render-graph": "_onRenderGraph",
      "print-graph": "_onPrintGraph"
    }
  };

  /* ------------------------------------------------------------------------ */
  /*  Context / Data                                                          */
  /* ------------------------------------------------------------------------ */

  async _prepareContext() {
    const graphs = this.api.get_all_graphs();
    const graphId = graphs[0]?.id ?? "";

    return {
      title: this.title,
      version: this.api.version,
      is_gm: game.user.isGM,
      graphs,
      graphId,
      svg: "" // will be filled in _onRender
    };
  }

  /* ------------------------------------------------------------------------ */
  /*  Action dispatcher                                                        */
  /* ------------------------------------------------------------------------ */

  // Replace ACTION table
  static ACTIONS = {
    "create-graph": "onCreateGraph",
    "edit-graph": "_onEditGraph",
    "render-graph": "_onRenderGraph",
    "print-graph": "_onPrintGraph"
  };

  //onCreateGraph() {
  static onCreateGraph(event, target) {
    //new GraphForm(this.api).render(true);
    console.log("in oncreategraph")
    new GraphFormV2({api:this.api}).render(true);
  }

  _onEditGraph() {
    const select = this.element.querySelector("#graph-select");
    if (!select?.value) return ui.notifications.warn("Select a graph first");
    //new GraphForm(this.api, { graphId: select.value }).render(true);
    new GraphFormV2(this.api, { graphId }).render(true);
  }

  _onRenderGraph() {
    this._drawSVG();
  }

  _onPrintGraph() {
    const svgEl = this.element.querySelector("svg#graph-svg");
    if (!svgEl) return;
    const svgBlob = new Blob([svgEl.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    window.open(url, "_blank");
  }

  _onCreateDiagram() {
    this._drawSVG();
  }

  _onPrintDiagram() {
    const svgEl = this.element.querySelector("svg#mygraph");
    if (!svgEl) return;
    const svgBlob = new Blob([svgEl.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    window.open(url, "_blank");
  }

  /* ------------------------------------------------------------------------ */
  /*  Rendering                                                               */
  /* ------------------------------------------------------------------------ */

  /** Called after the HTML is rendered */
  _onRender() {
    // initial draw if a graph is pre‑selected
    this._drawSVG();

    // change listener on select
    this.element
      .querySelector("#graph-select")
      ?.addEventListener("change", () => this._drawSVG());
  }

  _drawSVG() {
    const select = this.element.querySelector("#graph-select");
    if (!select?.value) return;

    // Clear previous svg
    const svgContainer = this.element.querySelector("svg#mygraph");
    const svg = d3.select(svgContainer);
    svg.selectAll("*").remove();

    const { nodes, links } = this.api.getDemoData();

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(120))
      .force("charge", d3.forceManyBody())
      .force("center", d3.forceCenter(300, 300));

    const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => Math.sqrt(d.strength || 1));

    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 8)
      .attr("fill", "steelblue")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("title").text(d => d.label || d.id);

    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
    });

    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  }
}
