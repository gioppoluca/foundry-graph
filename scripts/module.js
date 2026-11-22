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
const graphDocumentNames = ["Actor", "Item", "Scene", "JournalEntry", "JournalEntryPage"];
let graphCleanupQueue = Promise.resolve();

Hooks.once("setup", () => {
  if (!globalThis.libWrapper) {
    logError("Foundry Graph | libWrapper is unavailable for deleteDialog");
    return;
  }

  for (const name of graphDocumentNames) {
    const prototype = CONFIG[name]?.documentClass?.prototype;
    if (typeof prototype?.deleteDialog !== "function") continue;
    globalThis.libWrapper.register(
      MODULE_ID, `CONFIG.${name}.documentClass.prototype.deleteDialog`, graphDeleteDialog, "WRAPPER"
    );
  }
});

function findAffectedGraphs(api, entries, uuid, user) {
  return entries.filter(graph =>
    api.canEdit(graph, user) && api.getRenderer(graph.renderer)?.hasEntity(graph, uuid)
  );
}

function makeGraphDeleteNotice(graphs) {
  const notice = document.createElement("section");
  notice.className = "foundry-graph-delete-notice";

  const message = document.createElement("p");
  message.textContent = t("DeletionDialog.WarningRemoveFromDiagrams");
  notice.append(message);

  const list = document.createElement("ul");
  for (const graph of graphs) {
    const item = document.createElement("li");
    item.textContent = graph.name;
    list.append(item);
  }
  notice.append(list);
  if (graphs.some(graph => graph.renderer === "genealogy")) {
    const descendants = document.createElement("p");
    descendants.textContent = t("DeletionDialog.GenealogyDescendants");
    notice.append(descendants);
  }
  return notice;
}

async function graphDeleteDialog(wrapped, options = {}, operation = {}) {
  const api = game.modules.get(MODULE_ID)?.api;
  if (!api || !game.user || !api.isGamemaster(game.users.activeGM) || !this.uuid) {
    return wrapped(options, operation);
  }

  let graphs;
  try {
    const entries = game.settings.get(MODULE_ID, "graphIndex") ?? [];
    graphs = findAffectedGraphs(api, entries, this.uuid, game.user);
  } catch (error) {
    logError("Foundry Graph | Failed to check references for deleteDialog", this.uuid, error);
    return wrapped(options, operation);
  }
  if (!graphs.length) return wrapped(options, operation);

  const deleteOperation = { ...operation };
  return wrapped({
    ...options,
    render(event, dialog) {
      options?.render?.call(this, event, dialog);
      const content = dialog.element.querySelector(".dialog-content") ??
        dialog.element.querySelector("form");
      if (!content) return;

      if (!content.querySelector(".foundry-graph-delete-notice")) {
        content.append(makeGraphDeleteNotice(graphs));
      }
      // Only mark the operation if this dialog actually displayed our notice.
      deleteOperation.deleteFormGraph = true;
      deleteOperation.deleteFormGraphIds = graphs.map(graph => graph.id);
    }
  }, deleteOperation);
}

async function cleanDeletedGraphDocument(uuid, userId, graphIds) {
  const api = game.modules.get(MODULE_ID)?.api;
  const user = game.users.get(userId);
  if (!api || !user || !api.isGamemaster() || game.users.activeGM?.id !== game.user?.id) return;

  api.refreshGraphIndex();
  const entries = graphIds.map(id => api.getGraphIndexEntry(id)).filter(Boolean);
  const affectedGraphs = findAffectedGraphs(api, entries, uuid, user);
  let cleaned = false;
  for (const entry of affectedGraphs) {
    try {
      const graph = await api.getGraph(entry.id);
      const renderer = api.getRenderer(graph?.renderer);
      if (!graph || !api.canEdit(graph, user) || !renderer?.hasEntity(graph, uuid)) continue;
      const saved = await api.upsertGraph(renderer.removeEntity(graph, uuid), {
        expectedRevision: entry.revision ?? null
      });
      if (saved) cleaned = true;
    } catch (error) {
      logError("Foundry Graph | Failed to remove deleted reference", uuid, entry.id, error);
    }
  }
  if (cleaned) ui.notifications.info(t("Notifications.GraphCleanupDone"));
}

for (const name of graphDocumentNames) {
  Hooks.on(`delete${name}`, (document, operation, userId) => {
    if (operation?.deleteFormGraph !== true || !document.uuid) return;
    if (!game.user || game.users.activeGM?.id !== game.user.id) return;

    const uuid = document.uuid;
    const graphIds = operation.deleteFormGraphIds;
    if (!Array.isArray(graphIds) || !graphIds.length) return;
    graphCleanupQueue = graphCleanupQueue
      .then(() => cleanDeletedGraphDocument(uuid, userId, graphIds))
      .catch(error => logError("Foundry Graph | Graph cleanup failed", uuid, error));
  });
}
