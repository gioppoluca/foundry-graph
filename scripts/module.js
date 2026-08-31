import { MODULE_ID, setDebugFlag, log, err as logError, t } from './constants.js';
import { GraphApi } from "./graph_api.js";
import { GraphPageApplication } from "./graph-page-application.js";

Hooks.once('init', async function () {
  await GraphApi.registerSettings();
  setDebugFlag(game.settings.get(MODULE_ID, "debug"));
  const api = new GraphApi();

  const mod = game.modules.get(MODULE_ID);
  log("init", {
    foundryVersion: game.version,
    generation: game.release?.generation,
    systemId: game.system?.id,
    systemVersion: game.system?.version,
    userAvailable: !!game.user
  });
  log(api)

  mod.api = api;                    // <- official home
  log(mod)

  // loadGraphs can perform GM-only migrations. game.user is not guaranteed to
  // exist during init, so loading/migration is deferred to the ready hook.
  await loadTemplates([
    "modules/foundry-graph/templates/partials/calendar-datetime.hbs",
  ]);
  // TODO in case we need to give other modules hooks access to the API
  //Hooks.callAll(`${MODULE_ID}.ready`, api);
});

Hooks.once('ready', async function () {
  const api = game.modules.get(MODULE_ID)?.api;
  log("ready", {
    foundryVersion: game.version,
    generation: game.release?.generation,
    systemId: game.system?.id,
    systemVersion: game.system?.version,
    userId: game.user?.id,
    isGM: game.user?.isGM,
    apiAvailable: !!api
  });

  if (!api) {
    logError("Foundry Graph | API unavailable during ready hook");
    return;
  }

  try {
    await api.loadGraphs();
    log("ready | graphs loaded", {
      graphCount: api.getAllGraphs?.().length ?? null
    });
  } catch (error) {
    logError("Foundry Graph | Failed to load graphs during ready", error);
  }
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
/*************************  Scene-controls button ***************************/
Hooks.on("getSceneControlButtons", (controls) => {
  try {
    const generation = game.release?.generation ?? 0;
    const isModernControls = generation > 12;
    const controlKeys = isModernControls ? Object.keys(controls ?? {}) : (controls ?? []).map(c => c?.name);

    log("getSceneControlButtons | start", {
      foundryVersion: game.version,
      generation,
      systemId: game.system?.id,
      systemVersion: game.system?.version,
      controlKeys
    });

    let tokensControl = null;
    if (isModernControls) {
      // v13/v14 core uses `tokens`. Keep `token` as a defensive fallback in case
      // another system/module has rebuilt the control record.
      tokensControl = controls?.tokens ?? controls?.token ?? null;
    } else {
      tokensControl = controls?.find?.(c => c?.name === "token" || c?.name === "tokens") ?? null;
    }

    log("getSceneControlButtons | token control", tokensControl);

    if (!tokensControl) {
      logError("Foundry Graph | Token scene control not found", {
        systemId: game.system?.id,
        systemVersion: game.system?.version,
        generation,
        controlKeys
      });
      return;
    }

    if (isModernControls) {
      if (!tokensControl.tools || typeof tokensControl.tools !== "object") {
        logError("Foundry Graph | Token scene control has no usable tools record", tokensControl);
        return;
      }

      log("getSceneControlButtons | tools before injection", Object.keys(tokensControl.tools));

      tokensControl.tools['graphs'] = {
        name: "graphs",
        title: t(`Manager.ControlManage`),
        icon: "fa-solid fa-project-diagram",
        button: true,
        onChange: async (...args) => {
          log("scene control | graphs onChange", {
            args,
            systemId: game.system?.id,
            systemVersion: game.system?.version,
            userId: game.user?.id,
            isGM: game.user?.isGM
          });

          const api = game.modules.get(MODULE_ID)?.api;
          log("scene control | API", api);
          if (!api) {
            logError("Foundry Graph | Cannot open dashboard: API unavailable");
            return;
          }

          try {
            const dashboard = await api.openDashboard(true);
            log("scene control | dashboard opened", {
              dashboard,
              rendered: dashboard?.rendered,
              element: dashboard?.element
            });
          } catch (error) {
            logError("Foundry Graph | Dashboard open failed", error);
          }
        }
      };

      log("getSceneControlButtons | tools after injection", Object.keys(tokensControl.tools));
    } else if (!tokensControl.tools.find(t => t.name === "graphs")) {
      tokensControl.tools.push({
        name: "graphs",
        title: t(`Manager.ControlManage`),
        icon: "fa-solid fa-project-diagram",
        button: true,
        onClick: async (...args) => {
          log("scene control | graphs onClick", {
            args,
            systemId: game.system?.id,
            systemVersion: game.system?.version,
            userId: game.user?.id,
            isGM: game.user?.isGM
          });

          const api = game.modules.get(MODULE_ID)?.api;
          log("scene control | API", api);
          if (!api) {
            logError("Foundry Graph | Cannot open dashboard: API unavailable");
            return;
          }

          try {
            const dashboard = await api.openDashboard(true);
            log("scene control | dashboard opened", {
              dashboard,
              rendered: dashboard?.rendered,
              element: dashboard?.element
            });
          } catch (error) {
            logError("Foundry Graph | Dashboard open failed", error);
          }
        }
      });
    }
  } catch (error) {
    // A failure in this hook can prevent the whole Scene Controls toolbar from
    // being built, so contain it and print a useful diagnostic.
    logError("Foundry Graph | getSceneControlButtons failed", error);
  }
});
async function performCleanup(affectedList, uuid) {
  for (const graph of affectedList) {
    const renderer = game.modules.get(MODULE_ID)?.api.getRenderer(graph?.renderer);
    log(renderer);
    log(`Foundry Graph | Cleaning up graph ${graph.name} (${graph.id})`, affectedList);
    // 1. Delegate logic to Renderer
    const cleanedData = renderer.removeEntity(graph, uuid);
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
    const renderer = game.modules.get(MODULE_ID)?.api.getRenderer(graph?.renderer);
    log(renderer);

    if (!renderer) {
      log(`Foundry Graph | Unknown renderer '${graph?.renderer}' for graph ${graph.id}`);
      continue;
    }

    // Ask the renderer logic
    if (renderer.hasEntity(graph, docUuid)) {
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
  // ✅ FIX 1: Don't intercept compendium document deletions
  if (document.uuid?.startsWith("Compendium.")) return true;

  // 3. INTERCEPT: Stop the deletion immediately!
  // We trigger the async logic separately, but we MUST return false now.
  performAsyncCheck(document, options);

  return false;
}
Hooks.on("preDeleteActor", (doc, options, id) => interceptDeletion(doc, options, id));
Hooks.on("preDeleteItem", (doc, options, id) => interceptDeletion(doc, options, id));
Hooks.on("preDeleteScene", (doc, options, id) => interceptDeletion(doc, options, id));
