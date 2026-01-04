import { GraphBuilder } from "./model/graph_builder.js";
import { GraphRelationsDialog } from "./graph-relations-dialog.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { D3GraphApp } from "./d3-graph-app.js";
import { GraphPermissionsDialog } from "./graph-permissions-dialog.js";
import { log, t, tf } from "./constants.js";

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
    this.tabGroups ??= {};
    this.tabGroups.primary = options.activeTab ?? GraphDashboardV2.DEFAULT_ACTIVE_TAB;
    this.editingGraph = null;
  }

  /* ------------------------------------------------------------------------ */
  /*  Static application definitions                                          */
  /* ------------------------------------------------------------------------ */
  static TABS = {
    primary: {
      tabs: [
        { id: 'creationGraph' },
        { id: 'listGraph' }
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
      graphRelations: GraphDashboardV2.onGraphRelations,
      onCancelCreate: GraphDashboardV2.onCancelCreate
    }
  };

  get title() {
    return t("Window.DashboardTitle");
  }


  /* ------------------------------------------------------------------------ */
  /*  Context / Data                                                          */
  /* ------------------------------------------------------------------------ */

  _prepareContext() {
    const graphs = this.api.getAccessibleGraphs();
    this._graphTypes = this.api.getGraphTypesArray();
    log(graphs)
    log(this._graphTypes)
    if (this.editingGraph) {
      log("editingGraph", this.editingGraph)
    }
    log(this.editingGraph?.graphType)
    const graph = this.editingGraph ?? GraphDashboardV2.blankGraph();

    // --- Determine which graph type is currently selected ---
    // In edit mode: the graph's own type. In create mode: none by default.
    const selectedGraphType = this.editingGraph?.graphType ?? "";

    // --- Build theme list and selected theme for that type ---
    let selectedGraphThemes = null;
    let selectedTheme = this.editingGraph?.theme ?? "";
    if (selectedGraphType) {
      const metadata = this._graphTypes?.find(g => g.id === selectedGraphType);
      if (metadata && Array.isArray(metadata.themes) && metadata.themes.length > 0) {
        selectedGraphThemes = metadata.themes;

        // If the graph has no theme yet (legacy graphs), default to the first theme
        if (!selectedTheme) {
          selectedTheme = metadata.themes[0].id;
        }
      }
    }

    return {
      title: this.title,
      version: this.api.version,
      is_gm: game.user.isGM,
      graphTypes: this._graphTypes,
      tabs: this._prepareTabs("primary"),
      tab: this.activeTab,
      graph,
      selectedGraphType: this.editingGraph?.graphType,
      selectedGraphThemes,
      selectedTheme,
      graphs
    };
  }

  async _preparePartContext(partId, context) {
    switch (partId) {
      case 'creationGraph':
      case 'listGraph':
        context.tab = context.tabs[partId];
        break;
      default:
    }
    return context;
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
    this.changeTab("listGraph", "primary");
    this.render(true);
  }

  static async onCreateGraph(event, target) {
    const type = this.element.querySelector("#graph-type-select").value?.trim();
    const metadata = this._graphTypes?.find(g => g.id === type);
    log(metadata)
    if (!metadata) return ui.notifications.warn(t("Notifications.InvalidGraphType"));
    log("in oncreategraph")
    const name = this.element.querySelector("#graph-name").value?.trim();
    const id = this.element.querySelector("#graph-id").value?.trim();
    const desc = this.element.querySelector("#graph-desc").value?.trim();
    const width = this.element.querySelector("#graph-width").value?.trim();
    const height = this.element.querySelector("#graph-height").value?.trim();
    const backgroundImagePath = this.element.querySelector("#graph-background").value?.trim();
    const themeSelect = this.element.querySelector("#graph-theme-select");
    const selectedThemeId = themeSelect?.value?.trim() || null;

    // Determine base background from selected theme or fallback to metadata.background
    let metadataBg = metadata.background || {};
    if (selectedThemeId && Array.isArray(metadata.themes)) {
      const theme = metadata.themes.find(t => t.id === selectedThemeId);
      if (theme) metadataBg = theme;
    }
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
      theme: selectedThemeId,
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
    this.changeTab("listGraph", "primary");
    this.render(true);
  }

  static async graphEdit(event, target) {
    log("graphEdit", event, target)
    const graph = await this.api.getGraph(event.target.dataset.id);
    this.editingGraph = graph;
    this.changeTab("creationGraph", "primary");
    this.render(true);
  }

  static async onOpenGraph(event, target) {
    log(event)
    log(target)
    log(event.target.dataset.id)
    const graph = await this.api.getGraph(event.target.dataset.id);
    const mode = this.api.canEditById(event.target.dataset.id) ? "edit" : "view";
    log("mode", mode)
    const appData = {
      graph: graph,
      mode: mode,
      onCloseCallback: () => this.render(false)
    };
    log("graphData", appData)
    await new D3GraphApp(appData).render(true);
  }


  static async graphDelete(event, target) {
    log(event)
    log(event.target.dataset.id)
    await this.api.deleteGraph(event.target.dataset.id);
    ui.notifications.info(`Graph ${event.target.dataset.id} deleted.`);
    this.render(true);
  }

  static async graphPerms(event, target) {
    log(event)
    const graphId = event.target.dataset.id;
    if (!graphId) return ui.notifications.warn(t("Errors.NoGraphSelectedForExport"));
    const g = await this.api.getGraph(graphId);
    new GraphPermissionsDialog({ graphId: graphId, gName: g.name, permissions: g.permissions }).render(true);
  }

  _onPrintGraph() {
    const svgEl = this.element.querySelector("svg#graph-svg");
    if (!svgEl) return;
    const svgBlob = new Blob([svgEl.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    window.open(url, "_blank");
  }


  /**
     * Open the dialog to manage relations for a specific graph.
     */
  static async onGraphRelations(event, target) {
    log("onGraphRelations", event, target);
    const graphId = event.target.dataset.id;
    const graph = await this.api.getGraph(graphId);
    if (!graph) return ui.notifications.warn("Graph not found!");

    // Define the callback function to run when the dialog saves
    const onSaveCallback = async (newRelations) => {
      log(`Saving ${newRelations.length} relations for graph ${graphId}`);
      graph.relations = newRelations;
      await this.api.upsertGraph(graph);
      //this.render(true); // Refresh the dashboard
      ui.notifications.info(`Relations for "${graph.name}" updated.`);
    };

    // Create and render the dialog
    // We pass a deepClone of relations so canceling doesn't modify the original
    new GraphRelationsDialog({
      graphId: graphId,
      gName: graph.name,
      relations: foundry.utils.deepClone(graph.relations),
      onSave: onSaveCallback
    }).render(true);
  }

  updateButtonState() {
    log("updateButtonState")
    const name = this.element.querySelector("#graph-name").value?.trim();
    const id = this.element.querySelector("#graph-id").value?.trim();
    const type = this.element.querySelector("#graph-type-select").value?.trim();
    log(this.element.querySelector("#graph-type-select"))
    log(name)
    log(id)
    log(type)
    const allFilled = name && id && type;
    log(this.element.querySelector("#create-graph-btn"))
    this.element.querySelector("#create-graph-btn").disabled = !allFilled;
  }

  /** Added to auto-fill form on graph type selection */
  _onGraphTypeChange(event) {
    // Only autofill if we are in "new graph" mode (no editingGraph)
    if (this.editingGraph) return;

    const typeId = event.target.value;
    const metadata = this._graphTypes?.find(g => g.id === typeId) ?? null;

    const widthInput = this.element.querySelector("#graph-width");
    const heightInput = this.element.querySelector("#graph-height");
    const bgInput = this.element.querySelector("#graph-background");
    const themeSelect = this.element.querySelector("#graph-theme-select");

    // Reset theme select options whenever the graph type changes
    if (themeSelect) {
      themeSelect.innerHTML = "";
    }

    // If no type selected, clear fields and exit
    if (!metadata) {
      if (widthInput) widthInput.value = "";
      if (heightInput) heightInput.value = "";
      if (bgInput) {
        bgInput.value = "";
        const valueDisplay = bgInput.querySelector(".file-picker-value");
        if (valueDisplay) valueDisplay.textContent = "";
      }
      this.updateButtonState();
      return;
    }

    const themes = Array.isArray(metadata.themes) ? metadata.themes : [];
    let themeBg = metadata.background || {};
    let defaultThemeId = "";

    if (themes.length > 0) {
      const t0 = themes[0];
      themeBg = t0;
      defaultThemeId = t0.id;
    }

    // Populate theme select with the themes belonging to this graph type
    if (themeSelect) {
      if (themes.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = game.i18n?.localize?.("foundry-graph.themes.none") ?? "Default";
        themeSelect.appendChild(opt);
        themeSelect.value = "";
      } else {
        for (const theme of themes) {
          const opt = document.createElement("option");
          opt.value = theme.id;
          opt.textContent = theme.label || theme.id;
          themeSelect.appendChild(opt);
        }
        themeSelect.value = defaultThemeId;
      }
    }

    // Autofill width/height/background from the chosen theme (or fallback background)
    if (themeBg.width && widthInput) widthInput.value = themeBg.width;
    if (themeBg.height && heightInput) heightInput.value = themeBg.height;
    if (themeBg.image && bgInput) {
      bgInput.value = themeBg.image;
      const valueDisplay = bgInput.querySelector(".file-picker-value");
      if (valueDisplay) valueDisplay.textContent = themeBg.image;
    }

    this.updateButtonState(); // Make sure save button updates
  }

  static onThemeChange(event) {
    //  if (this.editingGraph) return; // only for new graphs

    const typeId = this.element.querySelector("#graph-type-select")?.value;
    if (!typeId) return;
    const metadata = this._graphTypes?.find(g => g.id === typeId);
    if (!metadata || !Array.isArray(metadata.themes)) return;

    const selectedThemeId = event.target.value;
    const theme = metadata.themes.find(t => t.id === selectedThemeId);
    if (!theme) return;

    const widthInput = this.element.querySelector("#graph-width");
    const heightInput = this.element.querySelector("#graph-height");
    const bgInput = this.element.querySelector("#graph-background");

    if (theme.width && widthInput) widthInput.value = theme.width;
    if (theme.height && heightInput) heightInput.value = theme.height;
    if (theme.image && bgInput) {
      bgInput.value = theme.image;
      const valueDisplay = bgInput.querySelector(".file-picker-value");
      if (valueDisplay) valueDisplay.textContent = theme.image;
    }

    this.updateButtonState();
  }


  /** Called after the HTML is rendered */
  _onRender() {
    const graphName = this.element.querySelector('#graph-name')
    log(graphName)
    graphName.addEventListener("change", (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      log("event change del nome")
      log(e)
      let newVal = e.target.value
      log(newVal)
      let new_id = newVal.slugify()
      log(new_id)
      this.element.querySelector('#graph-id').value = new_id
      this.updateButtonState();
    })
    // Add listener for graph type dropdown
    const graphTypeSelect = this.element.querySelector('#graph-type-select');
    const themeSelect = this.element.querySelector('#graph-theme-select');

    if (graphTypeSelect) {
      graphTypeSelect.addEventListener("change", (e) => this._onGraphTypeChange(e));
    }

    // Add listener for theme dropdown (call static handler with this bound to the app instance)
    if (themeSelect) {
      themeSelect.addEventListener("change", (e) => {
        this.constructor.onThemeChange.call(this, e);
      });
    }

    this.updateButtonState();
  }


  async _onClose(options) {
    log("GraphDashboardV2._onClose")
    this.editingGraph = null;
    this.changeTab("listGraph", "primary");

    log(this.activeTab, this.editingGraph, options)
    await super._onClose(options);
  }
}
