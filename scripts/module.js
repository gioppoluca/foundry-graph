//import { FOUNDRY_GRAPH_MODULE_NAME } from './settings.js';
import GraphApi from "./graph_api.js";
import GraphDashboard from "./graph_dashboard.js"
import * as d3 from "./lib/d3.js"

Hooks.once('init', async function() {
  window.fgraph = {
    version: game.modules.get('foundry-graph').version,
    dashboard: new GraphDashboard(),
    api: new GraphApi()
//    notifications: new ResourceNotifications(),
//    status_bar: ResourcesStatusBar
  }

//  loadTemplates(templates())
//  ModuleSettings.register()
});

Hooks.once('ready', async function() {

});

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