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


import GraphFormV2 from "./graph_form_v2.js";
import { D3GraphApp } from "./d3-graph-app.js";


export default class GraphDashboardV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {GraphApi} api
   */
  constructor(options = {}) {
    super(options);
    this.api = options.api;
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
      graphEdit: GraphDashboardV2.graphEdit,
      "edit-graph": "_onEditGraph",
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
    const graphs = this.api.getAllGraphs();
    this._graphTypes = await this.api.loadGraphTypes();
    console.log(graphs)

    return {
      title: this.title,
      version: this.api.version,
      is_gm: game.user.isGM,
      graphTypes: this._graphTypes,
      tabs: this._prepareTabs("primary"),
      graphs
    };
  }

  /* ------------------------------------------------------------------------ */
  /*  Action dispatcher                                                        */
  /* ------------------------------------------------------------------------ */

  // Replace ACTION table
  static ACTIONS = {
    "create-graph": "onCreateGraph",
    "edit-graph": "_onEditGraph",
    "print-graph": "_onPrintGraph"
  };

  static async onCreateGraph(event, target) {
    const type = this.element.querySelector("#graph-type-select").value?.trim();
    const metadata = this._graphTypes?.find(g => g.id === type);
    console.log(metadata)
    if (!metadata) return ui.notifications.warn("Invalid graph type selected.");
    console.log("in oncreategraph")
    const name = this.element.querySelector("#graph-name").value?.trim();
    const id = this.element.querySelector("#graph-id").value?.trim();
    const desc = this.element.querySelector("#graph-desc").value?.trim();
    const width = this.element.querySelector("#graph-width").value?.trim();
    const height = this.element.querySelector("#graph-height").value?.trim();
    const backgroundImagePath = this.element.querySelector("#graph-background").value?.trim();

    metadata.background = backgroundImagePath || metadata.background;

    const graphData = {
      id: id,
      name: name,
      desc: desc,
      width: isNaN(width) ? 800 : width,
      height: isNaN(height) ? 600 : height,
      graphTypeMetadata: metadata,  // Includes color, background, relations, etc.
      mode: "new"
    };

    // Launch D3GraphApp with pre-filled data
    new D3GraphApp(graphData).render(true);
  }

  static graphEdit(event, target) {
    console.log(event)
    console.log(target)
    console.log(event.target.dataset.id)
    const graphData = {
      id: event.target.dataset.id,
      mode: "edit"
    };
    new D3GraphApp(graphData).render(true);
  }

  _onEditGraph() {
    const select = this.element.querySelector("#graph-select");
    if (!select?.value) return ui.notifications.warn("Select a graph first");
    //new GraphForm(this.api, { graphId: select.value }).render(true);
    new GraphFormV2(this.api, { graphId }).render(true);
  }


  _onPrintGraph() {
    const svgEl = this.element.querySelector("svg#graph-svg");
    if (!svgEl) return;
    const svgBlob = new Blob([svgEl.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    window.open(url, "_blank");
  }


  updateButtonState() {
    console.log("updateButtonState")
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
    })
  }
}