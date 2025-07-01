import GraphDashboardV2 from "./graph_dashboard_v2.js"

// graph_api.js – SAFE ES2019 VERSION (no class-fields, no private #names)
// -----------------------------------------------------------------------------
//  • All consumers obtain the singleton via `game.modules.get("foundry-graph").api`
//  • This class handles JSON default loading, graph-type registration, and
//    world-persistent storage (setting "foundry-graph.graphs").
//  • No window globals and only ES features that Foundry v12 (Chromium 100+) supports.

export class GraphApi {
    // ---------------------------------------------------------------------------
    // Factory / bootstrap helpers
    // ---------------------------------------------------------------------------

    /**
     * Ensure the world-level setting exists. Call once early in your module init.
     * @param {string} moduleId
     */
    static registerSettings(moduleId) {
        // Avoid double registration if hot-reloaded
        if (game.settings.settings.has(`${moduleId}.graphs`)) return;

        game.settings.register(moduleId, "graphs", {
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
    static async _fetchJSON(moduleId, fileName) {
        const url = `modules/${moduleId}/data/${fileName}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`GraphApi: Failed to load ${url} (${resp.status})`);
        return resp.json();
    }

    /**
     * Async factory that returns a fully-initialised API instance.
     * @param {string} moduleId  – your module id ("foundry-graph")
     */
    static async create(moduleId) {
        const [defaultGraphs, defaultRelations, demoData] = await Promise.all([
            this._fetchJSON(moduleId, "default-graphs.json"),
            this._fetchJSON(moduleId, "default-relations.json"),
            this._fetchJSON(moduleId, "demo-nodes-links.json")
        ]);

        return new GraphApi(moduleId, {
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
    constructor(moduleId, defaults) {
        this.moduleId = moduleId;
        this.defaults = defaults;

        /** @type {Map<string, object>} */
        this.graphTypes = new Map();

        /** @type {Array<object>|null} Cached world graphs */
        this._worldGraphs = null;

        // Seed registry with bundled graph-types
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
     *  1) Returns the world-saved graphs if any exist
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

        // 2) Use cached copy unless you explicitly want a fresh read
        if (this._worldGraphs) return foundry.utils.duplicate(this._worldGraphs);

        let graphs = game.settings.get(this.moduleId, "graphs") || [];

        // First-run: seed defaults
        if (!graphs.length && this._defaults && this._defaults.defaultGraphs) {
            graphs = foundry.utils.duplicate(this._defaults.defaultGraphs);
            game.settings.set(this.moduleId, "graphs", graphs);    // persist
        }

        // Cache and return a duplicate so external code can't mutate our copy
        this._worldGraphs = graphs;
        return foundry.utils.duplicate(graphs);
    }

    /**
     * Return the singleton GraphDashboardV2, creating it if needed.
     * @param {boolean} [show] – if true, call render(true) after creating.
     */
    openDashboard(show = false) {
        if (!this.dashboard) this.dashboard = new GraphDashboardV2(this);
        if (show) this.dashboard.render(true);
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

    /** Demo JSON from data/demo-nodes-links.json */
    getDemoData() {
        return this.defaults.demoData;
    }

    getDefaultRelations() {
        return this.defaults.defaultRelations;
    }

    // ---------------------------------------------------------------------------
    // Persistence helpers
    // ---------------------------------------------------------------------------
    async _loadGraphsCache() {
        if (this._worldGraphs === null) {
            this._worldGraphs = duplicate(game.settings.get(this.moduleId, "graphs")) || [];
        }
        return this._worldGraphs;
    }

    async _saveGraphsCache() {
        await game.settings.set(this.moduleId, "graphs", this._worldGraphs);
    }

    /** Upsert a graph object into the world-saved list */
    async upsertGraph(graph) {
        const list = await this._loadGraphsCache();
        const idx = list.findIndex((g) => g.id === graph.id);
        if (idx >= 0) list[idx] = graph; else list.push(graph);
        await this._saveGraphsCache();
    }

    // ---------------------------------------------------------------------------
    // Miscellaneous
    // ---------------------------------------------------------------------------
    /** Convenience pass-through for module version */
    get version() {
        return game.modules.get(this.moduleId)?.version ?? "0.0.0";
    }
}
