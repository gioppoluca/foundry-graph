import { MODULE_ID, log, t } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A small configuration app for JournalEntryPage documents.
 * Stores settings under: flags.foundry-graph.*
 */
export class GraphPageApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * @param {{page: JournalEntryPage}} options
     */
    constructor(options = {}) {
        super(options);
        this.page = options.page;
        if (!this.page) throw new Error("GraphPageApplication requires a JournalEntryPage");
    }

    static DEFAULT_OPTIONS = {
        id: "fgraph-page-config",
        tag: "form",
        window: {
            resizable: false,
        },
        position: {
            width: 520,
            height: "auto",
        },
        classes: ["fgraph", "fgraph-page-config"],
        actions: {
            save: GraphPageApplication._onSave,
            cancel: GraphPageApplication._onCancel,
            pickIcon: GraphPageApplication._onPickIcon,
            clearIcon: GraphPageApplication._onClearIcon,
        }
    };

    static PARTS = {
        body: {
            template: "modules/foundry-graph/templates/graphPageApplication.html",
            scrollable: [""]
        }
    };

    get title() {
        return `${t("GraphPage.Title")}: ${this.page.name ?? ""}`.trim();
    }

    _prepareContext() {
        const icon = this.page.getFlag(MODULE_ID, "icon") ?? "";
        return {
            pageName: this.page.name,
            icon,
            defaultIcon: `modules/${MODULE_ID}/img/journal.png`,
        };
    }

    /** @private */
    static async _onSave(event, target) {
        event?.preventDefault?.();
        const app = this;
        const form = target?.form ?? app.element?.querySelector("form") ?? app.element;
        const data = new FormDataExtended(form).object;

        const icon = (data.icon ?? "").trim();
        try {
            if (icon) await app.page.setFlag(MODULE_ID, "icon", icon);
            else await app.page.unsetFlag(MODULE_ID, "icon");
            ui.notifications.info(t("GraphPage.Saved"));
            app.close();
        } catch (err) {
            log(err);
            ui.notifications.error(t("GraphPage.SaveError"));
        }
    }

    /** @private */
    static _onCancel(event) {
        event?.preventDefault?.();
        this.close();
    }

    /** @private */
    static async _onPickIcon(event, target) {
        event?.preventDefault?.();
        const app = this;
        const current = app.page.getFlag(MODULE_ID, "icon") ?? "";

        const fp = new FilePicker({
            type: "image",
            current,
            callback: async (path) => {
                try {
                    const input = app.element?.querySelector('input[name="icon"]');
                    if (input) input.value = path;
                } catch (e) { }
            }
        });
        return fp.browse();
    }

    /** @private */
    static _onClearIcon(event) {
        event?.preventDefault?.();
        const input = this.element?.querySelector('input[name="icon"]');
        if (input) input.value = "";
    }
}
