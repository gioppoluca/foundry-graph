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
import { D3GraphApp } from "./d3-graph-app.js";

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
  static TABS = {
    primary: {
      tabs: [
        { id: 'creationGraph', group: 'graph', label: 'foundry-graph.creationGraphTab' },
        { id: 'listGraph', group: 'graph', label: 'foundry-graph.listGraphTab' }
      ],
      initial: 'listGraph'
    }
  }

  static PARTS = {
    //    body: {
    //      template: "modules/foundry-graph/templates/dashboard.hbs"
    //    },
    tabs: {
      // Foundry-provided generic template
      template: 'templates/generic/tab-navigation.hbs',
      // classes: ['sysclass'], // Optionally add extra classes to the part for extra customization
    },
    creationGraph: {
      template: "modules/foundry-graph/templates/creationGraphTab.html",
      scrollable: [''],
    },
    listGraph: {
      template: "modules/foundry-graph/templates/listGraphTab.html",
      scrollable: [''],
    }
  };

  static DEFAULT_OPTIONS = {
    id: "fgraph-dashboard",
    window: {
      title: "Graphs",
      resizable: true,
    },
    resizable: true,
    minimizable: true,
    position: {
      width: 600,
      height: 600
    },
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

  /**
   * Prepare application tab data for a single tab group.
   * @param {string} group The ID of the tab group to prepare
   * @returns {Record<string, ApplicationTab>}
   * @protected
   */
  _prepareTabs(group) {
    const { tabs, labelPrefix, initial = null } = this._getTabsConfig(group) ?? { tabs: [] };
    this.tabGroups[group] ??= initial;
    return tabs.reduce((prepared, { id, cssClass, ...tabConfig }) => {
      const active = this.tabGroups[group] === id;
      if (active) cssClass = [cssClass, "active"].filterJoin(" ");
      const tab = { group, id, active, cssClass, ...tabConfig };
      if (labelPrefix) tab.label ??= `${labelPrefix}.${id}`;
      prepared[id] = tab;
      return prepared;
    }, {});
  }

  /* -------------------------------------------- */

  /**
   * Get the configuration for a tabs group.
   * @param {string} group The ID of a tabs group
   * @returns {ApplicationTabsConfiguration|null}
   * @protected
   */
  _getTabsConfig(group) {
    return this.constructor.TABS[group] ?? null;
  }

  async _prepareContext() {
    const graphs = this.api.graphs;
    console.log(graphs)
    const graphId = graphs[0]?.id ?? "";

    const res = await fetch("modules/foundry-graph/data/graph-types.json");
    this._graphTypes = await res.json();

    return {
      title: this.title,
      version: this.api.version,
      is_gm: game.user.isGM,
      graphTypes: this._graphTypes,
      tabs: this._prepareTabs("primary"),
      graphs: graphs,
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
    const type = this.element.querySelector("#graph-type-select").value?.trim();
    const metadata = this._graphTypes?.find(g => g.id === type);
    console.log(metadata)
    console.log(metadata)
    if (!metadata) return ui.notifications.warn("Invalid graph type selected.");
    console.log("in oncreategraph")
    const name = this.element.querySelector("#graph-name").value?.trim();
    const id = this.element.querySelector("#graph-id").value?.trim();
    const desc = this.element.querySelector("#graph-desc").value?.trim();
    const width = this.element.querySelector("#graph-width").value?.trim();
    const height = this.element.querySelector("#graph-height").value?.trim();
    const graphData = {
      id: id,
      name: name,
      desc: desc,
      width: isNaN(width) ? 800 : width,
      height: isNaN(height) ? 600 : height,
      graphTypeMetadata: metadata  // Includes color, background, relations, etc.
    };

    // Launch D3GraphApp with pre-filled data
    new D3GraphApp(graphData).render(true);
    // new GraphFormV2({ api: this.api }).render(true);
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


  updateButtonState() {
    console.log("updateButtonState")
    console.log(this.element.querySelector("#graph-name"))
    const name = this.element.querySelector("#graph-name").value?.trim();
    const id = this.element.querySelector("#graph-id").value?.trim();
    const type = this.element.querySelector("#graph-type-select").value?.trim();
    console.log(this.element.querySelector("#graph-type-select"))
    console.log(name)
    console.log(id)
    console.log(type)
    const allFilled = name && id && type;
    console.log(this.element.querySelector("#create-graph-btn"))
    this.element.querySelector("#create-graph-btn").disabled = !allFilled;
  }

  /* ------------------------------------------------------------------------ */
  /*  Rendering                                                               */
  /* ------------------------------------------------------------------------ */

  /** Called after the HTML is rendered */
  _onRender() {
    const graphName = this.element.querySelector('#graph-name')
    console.log(graphName)
    graphName.addEventListener("change", (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.log("event change del nome")
      console.log(e)
      let newVal = e.target.value
      console.log(newVal)
      let new_id = newVal.slugify()
      console.log(new_id)
      this.element.querySelector('#graph-id').value = new_id
      this.updateButtonState();
      //        const newQuantity = e.currentTarget.value
      // assuming the item's ID is in the input's `data-item-id` attribute
      //      const itemId = e.currentTarget.dataset.itemId
      //    const item = this.actor.items.get(itemId)
      // the following is asynchronous and assumes the quantity is in the path `system.quantity`
      //  item.update({ system: { quantity: newQuantity }});
    })
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
