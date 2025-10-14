import GraphDashboardV2 from "./graph_dashboard_v2.js"
import { log, MODULE_ID } from './constants.js';
import { ForceGraphType } from './graph_types/force.js';

const LEVELS = foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS; // { NONE:0, LIMITED:1, OBSERVER:2, OWNER:3 }


// graph_api.js – SAFE ES2019 VERSION (no class‑fields, no private #names)
// -----------------------------------------------------------------------------
//  • All consumers obtain the singleton via `game.modules.get("foundry-graph").api`
//  • This class handles JSON default loading, graph‑type registration, and
//    world‑persistent storage (setting "foundry-graph.graphs").
//  • No window globals and only ES features that Foundry v12 (Chromium 100+) supports.

export class GraphApi {
    /**
     * Ensure the world‑level setting exists. Call once early in module init.
     */
    static async registerSettings() {
        game.settings.register(MODULE_ID, "debug", {
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            name: "Enable debug logs",
            hint: "Writes verbose logs to the console for troubleshooting."
        });

        // Avoid double registration if hot‑reloaded
        if (game.settings.settings.has(`${MODULE_ID}.graphs`)) return;

        game.settings.register(MODULE_ID, "graphs", {
            scope: "world",
            config: false,
            type: Array,
            default: []
        });
    }

    /**
     * Convenience fetch wrapper (with basic error handling).
     * @param {string} moduleId
     * @param {string} fileName   – relative to modules/<id>/data/
     */
    static async _fetchJSON(fileName) {
        const url = `modules/${MODULE_ID}/data/${fileName}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`GraphApi: Failed to load ${url} (${resp.status})`);
        return resp.json();
    }

    /**
     * Async factory that returns a fully‑initialised API instance.
     * @param {string} moduleId  – your module id ("foundry-graph")
     */

    static async create() {
        const [defaultGraphs, defaultRelations, demoData] = await Promise.all([
            this._fetchJSON("default-graphs.json"),
            this._fetchJSON("default-relations.json"),
            this._fetchJSON("demo-nodes-links.json")
        ]);

        return new GraphApi({
            defaultGraphs,
            defaultRelations,
            demoData
        });
    }

    // ---------------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------------
    /**
     * @param {string} moduleId
     * @param {{ defaultGraphs:Array, defaultRelations:Array, demoData:Object }} defaults
     */
    constructor(defaults) {
        this.moduleId = MODULE_ID;
        this.defaults = defaults;
        this._graphMap = new Map();
        /** @type {Map<string, object>} */
        this.graphTypes = new Map();
        this._typeManagers = new Map();
        this._typeManagers.set("force", new ForceGraphType());

        /** @type {Array<object>|null} Cached world graphs */
        // Seed registry with bundled graph‑types
        defaults.defaultGraphs.forEach((g) => {
            if (g && g.id) this.graphTypes.set(g.id, g);
        });
    }

    // ---------------------------------------------------------------------------
    // Public API surface
    // ---------------------------------------------------------------------------

    /** Return every graph type object that was registered */
    get_graph_types() {
        return Array.from(this.graphTypes.values());
    }

    /**
     * Graph retrieval with fallback:
     *  1) Returns the world‑saved graphs if any exist
     *  2) Otherwise returns the defaults bundled with the module
     */
    get_all_graphs() {
        const SETTING_KEY = `${this.moduleId}.graphs`;

        // 1) Register setting lazily if missing (avoids assertKey crash)
        if (!game.settings.settings.has(SETTING_KEY)) {
            game.settings.register(this.moduleId, "graphs", {
                scope: "world",
                config: false,
                type: Array,
                default: []
            });
        }


        let graphs = game.settings.get(this.moduleId, "graphs") || [];

        // First‑run: seed defaults
        if (!graphs.length && this._defaults && this._defaults.defaultGraphs) {
            graphs = foundry.utils.duplicate(this._defaults.defaultGraphs);
            game.settings.set(this.moduleId, "graphs", graphs);    // persist
        }

        return foundry.utils.duplicate(graphs);
    }

    /**
     * Return the singleton GraphDashboardV2, creating it if needed.
     * @param {boolean} [show] – if true, call render(true) after creating.
     */
    async openDashboard(show = false) {
        log("GraphApi.openDashboard",  show );
        if (!this.dashboard) this.dashboard = await new GraphDashboardV2(this);
        log("dashboard", this.dashboard)
        if (show) await this.dashboard.render(true);
        return this.dashboard;
    }

    /**
     * Placeholder – adapt to your original structure.
     * @param {string} graphId
     */
    get_graph_elements(graphId) {
        // TODO: replicate your original mapping logic here.
        return [];
    }

    getPermission(graph, user = game.user) {
        // Explicit setting?
        if (graph.permissions?.[user.id] !== undefined) return graph.permissions[user.id];
        // Fallback to default
        return graph.permissions?.default ?? LEVELS.NONE;
    }

    canView(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.LIMITED || user.isGM; }
    canOpen(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.OBSERVER || user.isGM; }
    canEdit(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.OWNER || user.isGM; }


    canViewById(id, user = game.user) {
        const g = this.getGraph(id);
        return g ? this.canView(g, user) : false;
    }
    canOpenById(id, user = game.user) {
        const g = this.getGraph(id);
        return g ? this.canOpen(g, user) : false;
    }
    canEditById(id, user = game.user) {
        const g = this.getGraph(id);
        return g ? this.canEdit(g, user) : false;
    }

    getAccessibleGraphs(user = game.user) {
        return Array.from(this._graphMap.values()).filter(g => this.canOpen(g, user));
    }


    /** Demo JSON from data/demo-nodes-links.json */
    getDemoData() {
        return this.defaults.demoData;
    }

    getDefaultRelations() {
        return this.defaults.defaultRelations;
    }


    async updateGraphPermissions(graphId, newPerms) {
        const g = this.getGraph(graphId);
        if (!g) throw new Error(`Graph ${graphId} not found`);

        g.permissions = newPerms;
        await this.upsertGraph(g);          // reuse existing save method
        return g;
    }
    // ---------------------------------------------------------------------------
    // Persistence helpers
    // ---------------------------------------------------------------------------
    async loadGraphs() {
        const data = await game.settings.get("foundry-graph", "graphs") || [];
        this._graphMap = new Map(data.map(g => [g.id, g]));
    }

    getGraph(id) {
        return this._graphMap.get(id) ?? null;
    }

    async upsertGraph(graph) {
        this._graphMap.set(graph.id, graph);
        await this.saveGraphs();
    }

    async deleteGraph(id) {
        this._graphMap.delete(id);
        await this.saveGraphs();
    }

    async saveGraphs() {
        await game.settings.set("foundry-graph", "graphs", Array.from(this._graphMap.values()));
    }

    getAllGraphs() {
        console.log(this._graphMap.values())
        return Array.from(this._graphMap.values());
    }

    async loadGraphTypes() {
        if (!this._graphTypes) {
            const res = await fetch("modules/foundry-graph/data/graph-types.json");
            const allTypes = await res.json();
            const currentSystem = game.system.id;

            this._graphTypes = allTypes.filter(type =>
                type.systems?.includes("*") || type.systems?.includes(currentSystem)
            );
        }
        return this._graphTypes;
    }

    async getGraphTypeById(id) {
        if (!this._graphTypes) {
            await this.loadGraphTypes();
        }
        return this._graphTypes.find(type => type.id === id) || null;
    }

    // ---------------------------------------------------------------------------
    // Miscellaneous
    // ---------------------------------------------------------------------------
    /** Convenience pass‑through for module version */
    get version() {
        return game.modules.get(this.moduleId)?.version ?? "0.0.0";
    }
}
