import GraphDashboardV2 from "./graph_dashboard_v2.js"
import { log, MODULE_ID, JSON_graph_types } from './constants.js';
import { ForceRenderer } from "./renderers/force-renderer.js";
import { TreeRenderer } from "./renderers/tree-renderer.js";
import { GenealogyRenderer } from "./renderers/genealogy-renderer.js";


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
     * Async factory that returns a fully‑initialised API instance.
     * @param {string} moduleId  – your module id ("foundry-graph")
     */


    // ---------------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------------
    /**
     */
    constructor() {
        this.moduleId = MODULE_ID;
        this._graphMap = new Map();
        /** @type {Map<string, object>} */

        const currentSystem = game.system.id;

        // Convert map → array and filter by system
        this.graphTypes = Object.fromEntries(Object.entries(JSON_graph_types)
            .filter(([id, cfg]) => cfg.systems.includes(currentSystem) || cfg.systems.includes("*")));

        this.registryRenderers = new Map([
            [ForceRenderer.ID, new ForceRenderer()],
            [TreeRenderer.ID, new TreeRenderer()],
            [GenealogyRenderer.ID, new GenealogyRenderer()]
        ]);

        log("GraphApi.constructor", this.graphTypes)
        log("JSON_graph_types", JSON_graph_types)

    }

    // ---------------------------------------------------------------------------
    // Public API surface
    // ---------------------------------------------------------------------------

    /** Return every graph type object that was registered */
    get_graph_types() {
        return Array.from(JSON_graph_types.values());
    }

    /**
     * Return the singleton GraphDashboardV2, creating it if needed.
     * @param {boolean} [show] – if true, call render(true) after creating.
     */
    async openDashboard(show = false) {
        log("GraphApi.openDashboard", show);
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
        // here we must initialize data attribure is the graph is just created, thus empty
        log("GraphApi.upsertGraph", graph)
        if (!graph.data) {
            log("GraphApi.upsertGraph initializing data for graph", graph.id, graph.graphType)
            // must ask the proper renderer to initialize the data, so we get the type of the graph and get the renderer of the type
            const renderer = this.getRenderer(this.graphTypes[graph.graphType].renderer);
            log("GraphApi.upsertGraph got renderer", renderer)
            if (renderer) {
                graph.data = renderer.initializeGraphData();
            }
        }
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

    getGraphTypesArray() {
        log("GraphApi.getGraphTypesArray", this.graphTypes)
        return Object.values(this.graphTypes);
    }

    async getGraphTypeById(id) {
        return this.graphTypes[id] || null;
    }

    /*
    registerRenderer(RendererClass) {
        registry.set(RendererClass.ID, RendererClass);
    }
*/
    getRenderer(id) {
        log("getRenderer", id, this.registryRenderers)
        log("getRenderer", this.registryRenderers.get(id))
        log("getRenderer", this.registryRenderers[id])
        return this.registryRenderers.get(id);
    }
/*
    listRenderers() {
        return [...registry.keys()];
    }
*/
    // ---------------------------------------------------------------------------
    // Miscellaneous
    // ---------------------------------------------------------------------------
    /** Convenience pass‑through for module version */
    get version() {
        return game.modules.get(this.moduleId)?.version ?? "0.0.0";
    }
}
