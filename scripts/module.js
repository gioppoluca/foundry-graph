import { MODULE_ID } from './settings.js';
import { GraphApi } from "./graph_api.js";
import GraphDashboardV2 from "./graph_dashboard_v2.js"
import { D3GraphApp } from './d3-graph-app.js';


Hooks.once('init', async function () {
  const api = await GraphApi.create(MODULE_ID);

  const mod = game.modules.get(MODULE_ID);
  console.log(api)

  mod.api = api;                    // <- official home
  console.log(mod)
  await GraphApi.registerSettings("foundry-graph")
  await mod.api.loadGraphs();
  // globalThis.fgraph = api;       // <- optional macro alias
  // Build V2 dashboard once
  api.dashboard = new GraphDashboardV2({ api: api });

  Hooks.callAll(`${MODULE_ID}.ready`, api);
});

Hooks.once('ready', async function () {
  game.d3Graph = () => new D3GraphApp().render(true);

});
/*
Hooks.on("renderActorDirectory", async (app, html) => {
  // Obtain the singleton API
  const api = game.modules.get(MODULE_ID)?.api;
  if (!api) return;                               // safety guard
  console.log(app)
  console.log(html)
  console.log(app.form.queryselector("[data-fgraph-btn]"))
  console.log(app.form.queryselector(".directory-header"))
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
*/
/*************************  Scene‑controls button ***************************/
Hooks.on("getSceneControlButtons", (controls) => {
  console.log(`${MODULE_ID} | GIOPPO-----------------------`);
  console.log(`${MODULE_ID} | adding button ${MODULE_ID}`);
  console.log(controls);
  let tokensControl = null
  if (game.release.generation > 12) {
    tokensControl = controls['tokens']
  } else {
    tokensControl = controls.find(c => c.name === "token");
  }
  console.log(tokensControl)
  if (tokensControl) {
    console.log(`${MODULE_ID} | found place`);
    if (game.release.generation > 12) {
      tokensControl.tools['graphs'] = {
        name: "graphs",
        title: game.i18n.localize(`${MODULE_ID}.Manager.ControlManage`),
        icon: "fa-solid fa-project-diagram",

        button: true,
        onChange: () => {
          const api = game.modules.get(MODULE_ID)?.api;
          if (!api) return;
          api.openDashboard(true)
        }
      }
    } else {
      tokensControl.tools.push({
        name: "graphs",
        title: game.i18n.localize(`${MODULE_ID}.Manager.ControlManage`),
        icon: "fa-solid fa-project-diagram",

        button: true,
        onClick: () => {
          const api = game.modules.get(MODULE_ID)?.api;
          if (!api) return;
          api.openDashboard(true)
        }
      });
    }
  }
  console.log(controls);

});
