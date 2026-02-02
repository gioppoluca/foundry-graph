import { MODULE_ID, log, t } from "./constants.js";
import { FGCalendarDateTimePopover } from "./ui/calendar-datetime-popover.js";


function _toDatetimeLocalValue(ts) {
    if (ts == null || ts === "") return "";
    const n = Number(ts);
    if (!Number.isFinite(n)) return "";
    const d = new Date(n);
    if (isNaN(d.getTime())) return "";
    const pad = (v) => String(v).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function _fromDatetimeLocalValue(value) {
    const v = (value ?? "").trim();
    if (!v) return null;
    // datetime-local is interpreted as local time by Date()
    const d = new Date(v);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
}

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
            resizable: true,
        },
        position: {
            width: 520,
            height: 600,
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
        const startTs = this.page.getFlag(MODULE_ID, "start-date");
        const endTs = this.page.getFlag(MODULE_ID, "end-date");
        const color = this.page.getFlag(MODULE_ID, "color") ?? "#ffffff";
        return {
            pageName: this.page.name,
            icon,
            defaultIcon: `modules/${MODULE_ID}/img/journal.png`,
            startdate: startTs,
            enddate: _toDatetimeLocalValue(endTs),
            colorevent: color,
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        console.log("GraphPageApplication rendered", this);
        FGCalendarDateTimePopover.enhance(this.element);
    }

    /** @private */
    static async _onSave(event, target) {
        event?.preventDefault?.();
        const app = this;
        const form = target?.form ?? app.element?.querySelector("form") ?? app.element;
        console.log("GraphPageApplication _onSave", form);
        const data = new FormDataExtended(form).object;
console.log("GraphPageApplication _onSave data", data);
        const icon = (data.icon ?? "").trim();
        const startTs = data.startdate;
        console.log("GraphPageApplication _onSave startTs", startTs);
        const endTs = _fromDatetimeLocalValue(data.enddate);
        const color = (data.colorevent ?? "").trim();

        if (startTs == null) {
            ui.notifications.warn(t("GraphPage.StartDateRequired") ?? "Start date is required.");
            return;
        }

        try {
            // icon
            if (icon) await app.page.setFlag(MODULE_ID, "icon", icon);
            else await app.page.unsetFlag(MODULE_ID, "icon");

            // timeline flags (timestamps)
            await app.page.setFlag(MODULE_ID, "start-date", startTs);
            if (endTs != null) await app.page.setFlag(MODULE_ID, "end-date", endTs);
            else await app.page.unsetFlag(MODULE_ID, "end-date");

            // optional color override
            if (color) await app.page.setFlag(MODULE_ID, "color", color);
            else await app.page.unsetFlag(MODULE_ID, "color");

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
