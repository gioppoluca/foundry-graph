import { FOUNDRY_GRAPH_MODULE_NAME } from './settings.js';
import { GraphApi } from "./graph_api.js";
import GraphDashboardV2 from "./graph_dashboard_v2.js"
//import {ReteImageNodeApp} from "./rete-app.js"
import { D3GraphApp } from './d3-graph-app.js';
import * as d3 from "./lib/d3.js"

const MODULE_ID = "foundry-graph";


Hooks.once('init', async function () {
  const api = await GraphApi.create(MODULE_ID);

  const mod = game.modules.get(MODULE_ID);
  console.log(api)

  mod.api = api;                    // <- official home
  console.log(mod)
  GraphApi.registerSettings("foundry-graph")
  // globalThis.fgraph = api;       // <- optional macro alias
   // Build V2 dashboard once
  api.dashboard = new GraphDashboardV2(api);

  Hooks.callAll(`${MODULE_ID}.ready`, api);
  /*
  window.fgraph = {
    version: game.modules.get('foundry-graph').version,
    dashboard: new GraphDashboard(),
    api: new GraphApi()
    //    notifications: new ResourceNotifications(),
    //    status_bar: ResourcesStatusBar
  }

  //  loadTemplates(templates())
  //  ModuleSettings.register()
  window.fgraph.api.register_settings()
  */
});

Hooks.once('ready', async function () {
//game.reteDemo = () => new ReteImageNodeApp().render(true);
game.d3Graph = () => new D3GraphApp().render(true);

});
/*
Hooks.on('renderActorDirectory', async (app, html, data) => {
  //console.log(`${FOUNDRY_GRAPH_MODULE_NAME} | Initializing ${FOUNDRY_GRAPH_MODULE_NAME}`);
  console.log("GIOPPO-----------------------")
  let actor_button = await renderTemplate(
    'modules/foundry-graph/scripts/templates/actorButton.html'
  )

  const myButton = '<div class="action-buttons flexrow"><button id="btn-gioppo"><i class="fas fa-calculator"></i>GIOPPO</button></div>';
  html.find('.directory-header')
    .prepend(actor_button)
    .promise()
    .done(() => {
      $('#btn-actor-graph').on('click', e => window.fgraph.dashboard.redraw(true))
    });
});
*/

Hooks.on("renderActorDirectory", async (app, html) => {
  // Obtain the singleton API
  const api = game.modules.get(MODULE_ID)?.api;
  if (!api) return;                               // safety guard

  // Inject header button exactly once
  if (!html.find("[data-fgraph-btn]").length) {
    const btnHtml = await renderTemplate(
      "modules/foundry-graph/scripts/templates/actorButton.html"
    );
    html.find(".directory-header").prepend(btnHtml);
  }

  // Wire click handler (remove & add to avoid duplicates after re-render)
  html.find("[data-fgraph-btn]")
      .off("click.fgraph")
      .on("click.fgraph", () => api.openDashboard(true));
});

/*************************  Scene-controls button ***************************/
Hooks.on("getSceneControlButtons", (controls) => {
  console.log(`${FOUNDRY_GRAPH_MODULE_NAME} | GIOPPO-----------------------`);
  console.log(`${FOUNDRY_GRAPH_MODULE_NAME} | adding button ${FOUNDRY_GRAPH_MODULE_NAME}`);
  console.log(controls);
  const tokensControl = controls.find(c => c.name === "token");
  if (tokensControl) {
    console.log(`${FOUNDRY_GRAPH_MODULE_NAME} | found place`);
    controls.find(c => c.name === "token").tools.push({
      name: "graphs",
      title: game.i18n.localize(`${FOUNDRY_GRAPH_MODULE_NAME}.Manager.ControlManage`),
      icon: "fa-solid fa-project-diagram",

      button: true,
      onClick: () => { 
        const api = game.modules.get(MODULE_ID)?.api;
        if (!api) return;
        api.openDashboard(true) }
    });
  }
  console.log(controls);

  //onClick: () => new GraphManagerApp().render(true)
});