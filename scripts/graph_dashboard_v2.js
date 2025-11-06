import { GraphBuilder } from "./model/graph_builder.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { D3GraphApp } from "./d3-graph-app.js";
import { GraphPermissionsDialog } from "./graph-permissions-dialog.js";
import { log } from "./constants.js";

export default class GraphDashboardV2 extends HandlebarsApplicationMixin(ApplicationV2) {

  static ALLOWED_TABS = ["listGraph", "creationGraph"];
  static DEFAULT_ACTIVE_TAB = "listGraph";

  /**
   * @param {GraphApi} api
   */
  constructor(options = {}) {
    log("GraphDashboardV2.constructor", options)
    super(options);
    this.api = options;
    //    this.currentGraph = null
    //    this.activeTab = options.activeTab ?? GraphDashboardV2.DEFAULT_ACTIVE_TAB;
    this.tabGroups ??= {};
    this.tabGroups.primary ??= options.activeTab ?? GraphDashboardV2.DEFAULT_ACTIVE_TAB;
    this.editingGraph = null;
  }

  /* ------------------------------------------------------------------------ */
  /*  Static application definitions                                          */
  /* ------------------------------------------------------------------------ */
  static TABS = {
    primary: {
      tabs: [
        { id: 'creationGraph', group: 'graph' },
        { id: 'listGraph', group: 'graph' }
      ],
      initial: 'listGraph',
      labelPrefix: "foundry-graph.Tabs",
    }
  }

  static PARTS = {
    tabs: {
      // Foundry-provided generic template
      template: 'templates/generic/tab-navigation.hbs',
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
      onOpenGraph: GraphDashboardV2.onOpenGraph,
      graphEdit: GraphDashboardV2.graphEdit,
      graphDelete: GraphDashboardV2.graphDelete,
      graphPerms: GraphDashboardV2.graphPerms,
      onCancelCreate: GraphDashboardV2.onCancelCreate
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
    const activeId = this.tabGroups[group];
    //const activeId = this.activeTab;
    return tabs.reduce((prepared, { id, cssClass, ...tabConfig }) => {
      //const active = this.tabGroups[group] === id;
      const active = id === activeId;
      if (active) cssClass = [cssClass, "active"].filterJoin(" ");
      const tab = { group, id, active, cssClass, ...tabConfig };
      if (labelPrefix) tab.label ??= `${labelPrefix}.${id}`;
      prepared[id] = tab;
      return prepared;
    }, {});
  }

  /** Programmatically switch tabs (optionally re-render). */
  //setActiveTab(tabId, { render = true } = {}) {
  setActiveTab(tabId, { group = "primary", render = true } = {}) {

    log("GraphDashboardV2.setActiveTab", tabId, render)
    if (!GraphDashboardV2.ALLOWED_TABS.includes(tabId)) return;
    //this.activeTab = tabId;
    this.tabGroups[group] = tabId;
    if (render && this.rendered) this.render(false);
  }

  /* -------------------------------------------- */

  /**
   * Get the configuration for a tabs group.
   * @param {string} group The ID of a tabs group
   * @returns {ApplicationTabsConfiguration|null}
   * @protected
   */
  _getTabsConfig(group) {
    log("GraphDashboardV2._getTabsConfig", group)
    log(this.constructor.TABS)
    return this.constructor.TABS[group] ?? null;
  }

  _prepareContext() {
    //const graphs = this.api.getAllGraphs(); // changed for permission
    const graphs = this.api.getAccessibleGraphs();
    this._graphTypes = this.api.getGraphTypesArray();
    console.log(graphs)
    log(this._graphTypes)
    if (this.editingGraph) {
      log("editingGraph", this.editingGraph)
    }
    log(this.editingGraph?.graphType)

    return {
      title: this.title,
      version: this.api.version,
      is_gm: game.user.isGM,
      graphTypes: this._graphTypes,
      tabs: this._prepareTabs("primary"),
      graph: this.editingGraph,
      selectedGraphType: this.editingGraph?.graphType,
      //      tabs: this._getTabsConfig("primary"),
      graphs
    };
  }


  static blankGraph() {
    return {
      id: "",
      name: "",
      desc: "",
      graphType: "",
      background: { image: "", width: "", height: "" }
    };
  }

  /** Cancel from Create tab: wipe form state and go back to list */
  static onCancelCreate(event, target) {
    // Clear any edit mode and reset inputs defensively
    this.editingGraph = null;
    //this._clearCreateForm();
    this.setActiveTab("listGraph");
  }

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

    //const bkImage = backgroundImagePath || metadata.background.image;
    const metadataBg = metadata.background;
    let finalBgImg = backgroundImagePath || metadataBg?.image;
    let finalBgWidth, finalBgHeight;

    if (backgroundImagePath && backgroundImagePath !== metadataBg?.image) {
      // User picked a new image. Assume the width/height are for the image.
      finalBgWidth = width;
      finalBgHeight = height;
    } else {
      // User is using the default. Use the metadata dimensions.
      finalBgWidth = metadataBg?.width || width;
      finalBgHeight = metadataBg?.height || height;
    }
    log(metadata)

    let newGraph = new GraphBuilder({
      id: id,
      name: name,
      desc: desc,
      graphType: type,
      //      width: isNaN(width) ? 800 : width,
      //      height: isNaN(height) ? 600 : height,
      background: {
        image: finalBgImg,
        width: Number(finalBgWidth) || Number(width) || 800,
        height: Number(finalBgHeight) || Number(height) || 600
      }
    }).build();

    log("newGraph", newGraph)
    // Save the new graph
    await this.api.upsertGraph(newGraph);
    ui.notifications.info(`Graph ${name} created.`);
    // Optionally, refresh the dashboard or list view
    this.editingGraph = null;
    this.setActiveTab("listGraph");
  }

  static async graphEdit(event, target) {
    log("graphEdit", event, target)
    const graph = this.api.getGraph(event.target.dataset.id);
    this.editingGraph = graph;
    this.setActiveTab("creationGraph");
  }

  static async onOpenGraph(event, target) {
    console.log(event)
    console.log(target)
    console.log(event.target.dataset.id)
    const graph = this.api.getGraph(event.target.dataset.id);
    const mode = this.api.canEditById(event.target.dataset.id) ? "edit" : "view";
    console.log("mode", mode)
    const appData = {
      graph: graph,
      mode: mode
    };
    log("graphData", appData)
    await new D3GraphApp(appData).render(true);
  }


  static async graphDelete(event, target) {
    console.log(event)
    console.log(event.target.dataset.id)
    await this.api.deleteGraph(event.target.dataset.id);
    ui.notifications.info(`Graph ${event.target.dataset.id} deleted.`);
    // Optionally, refresh the dashboard or list view
    this.render(true);
    // Or you can trigger a re-render of the entire dashboard
  }

  static graphPerms(event, target) {
    console.log(event)
    const graphId = event.target.dataset.id;
    if (!graphId) return ui.notifications.warn("No graph selected for export");
    const g = this.api.getGraph(graphId);
    new GraphPermissionsDialog({ graphId, permissions: g.permissions }).render(true);
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

  /** Added to auto-fill form on graph type selection */
  _onGraphTypeChange(event) {
    // Only autofill if we are in "new graph" mode (no editingGraph)
    if (this.editingGraph) return;

    const typeId = event.target.value;
    const metadata = this._graphTypes?.find(g => g.id === typeId);
    if (!metadata || !metadata.background) return;

    const widthInput = this.element.querySelector("#graph-width");
    const heightInput = this.element.querySelector("#graph-height");
    const bgInput = this.element.querySelector("#graph-background"); // FilePicker

    if (metadata.background.width && widthInput) widthInput.value = metadata.background.width;
    if (metadata.background.height && heightInput) heightInput.value = metadata.background.height;
    if (metadata.background.image && bgInput) {
      bgInput.value = metadata.background.image;
      const valueDisplay = bgInput.querySelector(".file-picker-value");
      if (valueDisplay) valueDisplay.textContent = metadata.background.image;
    }
    this.updateButtonState(); // Make sure save button updates
  }

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
    // Add listener for graph type dropdown
    const graphTypeSelect = this.element.querySelector('#graph-type-select');
    if (graphTypeSelect) {
      graphTypeSelect.addEventListener("change", (e) => this._onGraphTypeChange(e));
    }
    this.updateButtonState();
  }

  async _onClose(options) {
    this.editingGraph = null;
    this.activeTab = GraphDashboardV2.DEFAULT_ACTIVE_TAB;
    await super._onClose(options);
  }
}
