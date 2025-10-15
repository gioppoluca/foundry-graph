import { MODULE_ID,  setDebugFlag, log } from './constants.js';
import { GraphApi } from "./graph_api.js";
//import GraphDashboardV2 from "./graph_dashboard_v2.js"
//import { D3GraphApp } from './d3-graph-app.js';


Hooks.once('init', async function () {
  await GraphApi.registerSettings();
  setDebugFlag(game.settings.get(MODULE_ID, "debug"));
  const api = new GraphApi();

  const mod = game.modules.get(MODULE_ID);
  log(api)

  mod.api = api;                    // <- official home
  log(mod)

  await mod.api.loadGraphs();
  // Build V2 dashboard once
//  api.dashboard = new GraphDashboardV2({ api: api });

  // TODO in case we need to give other modules hooks access to the API
  //Hooks.callAll(`${MODULE_ID}.ready`, api);
});

Hooks.once('ready', async function () {
//  game.d3Graph = () => new D3GraphApp().render(true);

});

/*************************  Scene‑controls button ***************************/
Hooks.on("getSceneControlButtons", (controls) => {
  log(`GIOPPO-----------------------`);
  log(`adding button to scene controls`, controls);
  let tokensControl = null
  if (game.release.generation > 12) {
    tokensControl = controls['tokens']
  } else {
    tokensControl = controls.find(c => c.name === "token");
  }
  log(tokensControl)
  if (tokensControl) {
    console.log(`${MODULE_ID} | found place`);
    if (game.release.generation > 12) {
      tokensControl.tools['graphs'] = {
        name: "graphs",
        title: game.i18n.localize(`${MODULE_ID}.Manager.ControlManage`),
        icon: "fa-solid fa-project-diagram",

        button: true,
        onChange: () => {
           log("onClick")
          const api = game.modules.get(MODULE_ID)?.api;
          log(api)
          if (!api) return;
          api.openDashboard(true)
        }
      }
    } else if (!tokensControl.tools.find(t => t.name === id)) {
      tokensControl.tools.push({
        name: "graphs",
        title: game.i18n.localize(`${MODULE_ID}.Manager.ControlManage`),
        icon: "fa-solid fa-project-diagram",

        button: true,
        onClick: () => {
          console.log("onClick")
          log("onClick")
          const api = game.modules.get(MODULE_ID)?.api;
          log(api)
          if (!api) return;
          api.openDashboard(true)
        }
      });
    }
  }
  console.log(controls);

});
