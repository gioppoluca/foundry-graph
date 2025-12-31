const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const LEVELS = foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS; // { NONE:0, LIMITED:1, OBSERVER:2, OWNER:3 }
import { log } from "./constants.js";

export class GraphPermissionsDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id       : "graph-permissions",
    classes  : ["fgraph", "graph-perms"],
    width    : 420,
    height   : "auto",
    window   : { title: "Graph Permissions" },
    submitOnChange : false,
    actions  : {
      save   : GraphPermissionsDialog._onSave,
      cancel : GraphPermissionsDialog._onCancel
    }
  };

  static PARTS = {
    body   : { template: "modules/foundry-graph/templates/graph-perms-body.html" },
    footer : { template: "modules/foundry-graph/templates/graph-perms-footer.html" }
  };

  /**
   * @param {object} opts
   * @param {string} opts.graphId  – ID of the graph we’re editing
   * @param {object} opts.permissions – existing permissions object ({userId:level, default:level})
   */
  constructor(opts) {
    super(opts);
    this.graphId     = opts.graphId;
    this.permissions = opts.permissions ?? {};
  }

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const users = game.users.contents.sort((a,b)=>a.name.localeCompare(b.name));

    return {
      users: users.map(u => ({
        id   : u.id,
        name : u.name,
        level: this.permissions[u.id] ?? 0  // 0 = NONE
      })),
      defaultLevel : this.permissions.default ?? 0,
      LEVELS       : LEVELS                // expose mapping for template
    };
  }

  /* -------------------------------------------- */

  /* ---------- actions ------------ */

  static async _onSave(event) {
    log("GraphPermissionsDialog._onSave", event);
    log(event);
    log(this);
    const app  = this;                        // ApplicationV2 instance
    const selects = this.element.querySelectorAll("select.user-perm");

    const perms = {};                                           // collect result
    selects.forEach(sel => {
      const level = Number(sel.value);
      if (level > 0) perms[sel.dataset.userid] = level;         // skip NONE
    });

    // default selector
    const defSel = this.element.querySelector("select#perm-default");
    perms.default = Number(defSel.value) || 0;

    // Hand off to API
    const api = game.modules.get("foundry-graph").api;
    await api.updateGraphPermissions(app.graphId, perms);

    ui.notifications.info("Graph permissions updated");
    app.close();
  }

  static _onCancel() {
    this.close();
  }
}
