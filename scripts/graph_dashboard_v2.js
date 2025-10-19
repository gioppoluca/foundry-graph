import { GraphBuilder } from "./model/graph_builder.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;


import GraphFormV2 from "./graph_form_v2.js";
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
    this.currentGraph = null
    this.activeTab = options.activeTab ?? GraphDashboardV2.DEFAULT_ACTIVE_TAB;
    this.editingGraph = null;
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
      onOpenGraph: GraphDashboardV2.onOpenGraph,
      graphEdit: GraphDashboardV2.graphEdit,
      graphDelete: GraphDashboardV2.graphDelete,
      graphPerms: GraphDashboardV2.graphPerms
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
    const activeId = this.activeTab;
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
  setActiveTab(tabId, { render = true } = {}) {
    if (!GraphDashboardV2.ALLOWED_TABS.includes(tabId)) return;
    this.activeTab = tabId;
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

    const bkImage = backgroundImagePath || metadata.background;
    log(metadata  )

    let newGraph = new GraphBuilder({
      id: id,
      name: name,
      desc: desc,
      graphType: type,
      width: isNaN(width) ? 800 : width,
      height: isNaN(height) ? 600 : height,
      background: {
        image: bkImage
      }
    }).build();

    /*
const graphData = {
  id: id,
  name: name,
  desc: desc,
  width: isNaN(width) ? 800 : width,
  height: isNaN(height) ? 600 : height,
  graphTypeMetadata: metadata,  // Includes color, background, relations, etc.
  mode: "new",
  permissions: {
    default: foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
    [game.userId]: foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
  }
};
*/
    log("newGraph", newGraph)
    // Save the new graph
    await this.api.upsertGraph(newGraph);
    ui.notifications.info(`Graph ${name} created.`);
    // Optionally, refresh the dashboard or list view
    this.editingGraph = null;
    this.setActiveTab("listGraph");
    //this.render(true);
    // Launch D3GraphApp with pre-filled data
    //new D3GraphApp({ graph: newGraph, mode: "new" }).render(true);
  }

  static async graphEdit(event, target) {
    log("graphEdit", event, target)
    const graph = this.api.getGraph(event.target.dataset.id);
    this.editingGraph = graph;
    this.setActiveTab("creationGraph");
    //this._prepareTabs("primary")
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
  /*
    _onEditGraph() {
      const select = this.element.querySelector("#graph-select");
      if (!select?.value) return ui.notifications.warn("Select a graph first");
      //new GraphForm(this.api, { graphId: select.value }).render(true);
      new GraphFormV2(this.api, { graphId }).render(true);
    }
  */

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
