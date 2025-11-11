import { log } from "./constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A dialog for adding, editing, and removing relations for a specific graph.
 */
export class GraphRelationsDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        id: "graph-relations",
        classes: ["fgraph", "graph-relations"],
        width: 500,
        height: "auto",
        window: { title: "Manage Graph Relations" },
        actions: {
            save: this._onSave,
            cancel: this._onCancel,
            add: this._onAddRelation,
            delete: this._onDeleteRelation
        }
    };

    static PARTS = {
        body: { template: "modules/foundry-graph/templates/graph-relations-body.html" },
        footer: { template: "modules/foundry-graph/templates/graph-relations-footer.html" }
    };

    /**
     * @param {object} opts
     * @param {string} opts.graphId            - ID of the graph being edited.
     * @param {Array<object>} opts.relations  - A deep clone of the graph's relations array.
     * @param {Function} opts.onSave          - Async callback to run on save, passed the new relations array.
     */
    constructor(opts) {
        super(opts);
        this.graphId = opts.graphId;
        this.relations = opts.relations; // This should be a deepClone
        this.onSave = opts.onSave;
    }

    /* -------------------------------------------- */

    async _prepareContext(options) {
        return {
            relations: this.relations,
            styleOptions: ["solid", "dashed", "dotted"]
        };
    }

    /* -------------------------------------------- */
    /* Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Add a new blank relation to the list and re-render.
     */
    static _onAddRelation(event) {
        this.relations.push({
            id: `new-relation-${foundry.utils.randomID(4)}`,
            label: "New Relation",
            color: "#ffffff",
            style: "solid",
            strokeWidth: 2,
            noArrow: false
        });
        this.render(true);
    }

    /**
     * Remove a relation from the list and re-render.
     */
    static _onDeleteRelation(event, target) {
        log("GraphRelationsDialog._onDeleteRelation".event, target);
        const row = target.closest(".relation-row");
        const id = row.dataset.relationId;
        this.relations = this.relations.filter(r => r.id !== id);
        this.render(true); // Re-render to remove the row
    }

    /**
     * Read all data from the form, build the new relations array,
     * and pass it to the onSave callback.
     */
    static async _onSave(event) {
        log("GraphRelationsDialog._onSave");
        const newRelations = [];
        const form = this.element.querySelector("form");

        for (const row of form.querySelectorAll(".relation-row")) {
            const id = row.querySelector("input[name='id']").value.slugify({ strict: true });
            const label = row.querySelector("input[name='label']").value;
            const color = row.querySelector("input[name='color']").value;
            const style = row.querySelector("select[name='style']").value;
            const strokeWidth = Number(row.querySelector("input[name='strokeWidth']").value) || 1;
            const noArrow = row.querySelector("input[name='noArrow']").checked;

            if (!id) {
                ui.notifications.warn(`Relation "${label}" must have an ID.`);
                return;
            }
            if (newRelations.some(r => r.id === id)) {
                ui.notifications.warn(`Relation ID "${id}" is duplicated. IDs must be unique.`);
                return;
            }

            newRelations.push({ id, label, color, style, strokeWidth, noArrow });
        }

        // Call the async onSave callback provided by the dashboard
        if (this.onSave) {
            await this.onSave(newRelations);
        }
        this.close();
    }

    static _onCancel() {
        this.close();
    }
}