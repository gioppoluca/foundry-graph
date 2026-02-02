import { MODULE_ID, setDebugFlag, log, t } from './constants.js';
import { GraphApi } from "./graph_api.js";
import { GraphPageApplication } from "./graph-page-application.js";

Hooks.once('init', async function () {
  await GraphApi.registerSettings();
  setDebugFlag(game.settings.get(MODULE_ID, "debug"));
  const api = new GraphApi();

  const mod = game.modules.get(MODULE_ID);
  log(api)

  mod.api = api;                    // <- official home
  log(mod)

  await mod.api.loadGraphs();
  await loadTemplates([
    "modules/foundry-graph/templates/partials/calendar-datetime.hbs",
  ]);
  // TODO in case we need to give other modules hooks access to the API
  //Hooks.callAll(`${MODULE_ID}.ready`, api);
});

Hooks.once('ready', async function () {

});

/**
 * Add a "Foundry Graph" configuration entry to the header controls (3-dots menu)
 * of JournalEntryPage sheets.
 */
Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const doc = app?.document;
  if (!doc) return;
  if (doc.documentName !== "JournalEntryPage") return;

  // Avoid duplicates
  const action = `${MODULE_ID}.configurePage`;
  if (controls.some(c => c.action === action)) return;

  controls.push({
    action,
    icon: "fa-solid fa-project-diagram",
    label: "foundry-graph.GraphPage.Configure",
    ownership: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    onClick: () => {
      new GraphPageApplication({ page: doc }).render(true);
    }
  });
});

/*************************  Scene‑controls button ***************************/
Hooks.on("getSceneControlButtons", (controls) => {
  log(`adding button to scene controls`, controls);
  let tokensControl = null
  if (game.release.generation > 12) {
    tokensControl = controls['tokens']
  } else {
    tokensControl = controls.find(c => c.name === "token");
  }
  log(tokensControl)
  if (tokensControl) {
    log(`${MODULE_ID} | found place`);
    if (game.release.generation > 12) {
      tokensControl.tools['graphs'] = {
        name: "graphs",
        title: t(`Manager.ControlManage`),
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
    } else if (!tokensControl.tools.find(t => t.name === "graphs")) {
      tokensControl.tools.push({
        name: "graphs",
        title: t(`Manager.ControlManage`),
        icon: "fa-solid fa-project-diagram",

        button: true,
        onClick: () => {
          log("onClick")
          const api = game.modules.get(MODULE_ID)?.api;
          log(api)
          if (!api) return;
          api.openDashboard(true)
        }
      });
    }
  }
  log(controls);

});

async function performCleanup(affectedList, uuid) {
  for (const graph of affectedList) {
    const RendererClass = game.modules.get(MODULE_ID)?.api.getRenderer(graph?.renderer);
    log(RendererClass);
    log(`Foundry Graph | Cleaning up graph ${graph.name} (${graph.id})`, affectedList);
    // 1. Delegate logic to Renderer
    const cleanedData = RendererClass.removeEntity(graph, uuid);
    log(cleanedData);

    // 2. Save via API
    await game.modules.get(MODULE_ID)?.api.upsertGraph(cleanedData);

    log(`Foundry Graph | Removed ${uuid} from ${graph.name}`);
  }
  ui.notifications.info(t("Notifications.GraphCleanupDone"));
}

async function performAsyncCheck(document, options) {
  if (!game.user.isGM) return true;

  const docUuid = document.uuid;

  // 1. GET ALL GRAPHS VIA API
  // Ensure this returns the full object list, not just IDs
  const allGraphs = await game.modules.get(MODULE_ID)?.api.getAllGraphs();

  // 2. FIND AFFECTED GRAPHS
  // Delegate detection to the specific Renderer
  const affectedGraphs = [];

  for (const graph of allGraphs) {
    const RendererClass = game.modules.get(MODULE_ID)?.api.getRenderer(graph?.renderer);
    log(RendererClass);

    if (!RendererClass) {
      log(`Foundry Graph | Unknown renderer '${graph?.renderer}' for graph ${graph.id}`);
      continue;
    }

    // STATIC CALL: Ask the renderer logic
    if (RendererClass.hasEntity(graph, docUuid)) {
      affectedGraphs.push(graph);
    }
  }

  // Case 1: Safe to delete (No graphs affected)
  if (affectedGraphs.length === 0) {
    // Re-trigger the delete, but add our flag so we don't block it again
    return document.delete({ ...options, graphModuleChecked: true });
  }

  // 3. PROMPT USER
  return new Promise((resolve) => {
    const listHtml = affectedGraphs.map(item => `<li>${item.name}</li>`).join("");

    new Dialog({
      title: `${t("DeletionDialog.Title")}: ${document.name}`,
      content: `
                <p><strong>${document.name}</strong> ${t("DeletionDialog.UsedInGraphs")}</p>
                <ul>${listHtml}</ul>
                <p>${t("DeletionDialog.WarningRemoveFromDiagrams")}</p>
            `,
      buttons: {
        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: t("Buttons.DeleteClean"),
          callback: async () => {
            // CLEANUP
            await performCleanup(affectedGraphs, docUuid);

            // RE-TRIGGER DELETE
            document.delete({ ...options, graphModuleChecked: true });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: t("Buttons.Cancel"),
          callback: () => {
            // Do nothing. The original delete was already blocked (return false).
            // The user stays on the screen.
          }
        }
      },
      default: "cancel",
      close: () => resolve(false)
    }).render(true);
  });
}

/**
 * Synchronous interceptor.
 * Returns false to BLOCK the delete, then starts the async check.
 */
function interceptDeletion(document, options, id) {
  // 1. BYPASS: If we already checked this delete, let it pass
  if (options.graphModuleChecked) return true;

  // 2. PERMISSION: Only GM checks (or rely on API permissions)
  if (!game.user.isGM) return true;

  // 3. INTERCEPT: Stop the deletion immediately!
  // We trigger the async logic separately, but we MUST return false now.
  performAsyncCheck(document, options);

  return false;
}

Hooks.on("preDeleteActor", (doc, options, id) => interceptDeletion(doc, options, id));
Hooks.on("preDeleteItem", (doc, options, id) => interceptDeletion(doc, options, id));
Hooks.on("preDeleteScene", (doc, options, id) => interceptDeletion(doc, options, id));