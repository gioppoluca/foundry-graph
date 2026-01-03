import GraphDashboardV2 from "./graph_dashboard_v2.js"
import { log, MODULE_ID, JSON_graph_types, t } from './constants.js';
import { ForceRenderer } from "./renderers/force-renderer.js";
//import { TreeRenderer } from "./renderers/tree-renderer.js";
import { GenealogyRenderer } from "./renderers/genealogy-renderer.js";
import { ImageSlotsRenderer } from "./renderers/image-slot-renderer.js";
import { migrateGraph } from "./model/graph_migrations.js";


const LEVELS = foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS; // { NONE:0, LIMITED:1, OBSERVER:2, OWNER:3 }
const DEFAULT_STORAGE_ROOT = "foundry-graph"; // Data/foundry-graph/<worldId>/


// graph_api.js – SAFE ES2019 VERSION (no class‑fields, no private #names)
// -----------------------------------------------------------------------------
//  • All consumers obtain the singleton via `game.modules.get("foundry-graph").api`
//  • This class handles JSON default loading, graph‑type registration, and
//    world‑persistent storage (setting "foundry-graph.graphs").
//  • No window globals and only ES features that Foundry v12 (Chromium 100+) supports.
function _nowISO() { return new Date().toISOString(); }

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
            name: t("Settings.DebugName"),
            hint: t("Settings.DebugHint")
        });

        // Avoid double registration if hot‑reloaded
        if (game.settings.settings.has(`${MODULE_ID}.graphs`)) return;

        game.settings.register(MODULE_ID, "graphs", {
            scope: "world",
            config: false,
            type: Array,
            default: []
        });

        if (game.settings.settings.has(`${MODULE_ID}.graphIndex`)) return;
        game.settings.register(MODULE_ID, "graphIndex", {
            scope: "world",
            config: false,
            type: Array,
            default: []
        });
    }


    // ---------------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------------
    /**
     */
    constructor() {
        this.moduleId = MODULE_ID;
        this._graphMap = new Map();
        this._indexMap = new Map();      // id -> index entry

        /** @type {Map<string, object>} */

        const currentSystem = game.system.id;

        // Convert map → array and filter by system
        this.graphTypes = Object.fromEntries(Object.entries(JSON_graph_types)
            .filter(([id, cfg]) => cfg.systems.includes(currentSystem) || cfg.systems.includes("*")));

        this.registryRenderers = new Map([
            [ForceRenderer.ID, new ForceRenderer()],
            [GenealogyRenderer.ID, new GenealogyRenderer()],
            [ImageSlotsRenderer.ID, new ImageSlotsRenderer()],
        ]);

        log("GraphApi.constructor", this.graphTypes)
        log("JSON_graph_types", JSON_graph_types)

    }

    // ---------------------------------------------------------------------------
    // Public API surface
    // ---------------------------------------------------------------------------

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
        return Array.from(this._indexMap.values()).filter(g => this.canOpen(g, user));
    }

    async updateGraphPermissions(graphId, newPerms) {
        const g = await this.getGraph(graphId);
        log("updateGraphPermissions", graphId, newPerms, g);    
        if (!g) throw new Error(`Graph ${graphId} not found`);

        g.permissions = newPerms;
        await this.upsertGraph(g);          // reuse existing save method
        return g;
    }

    async migrateFromLegacySettingIfNeeded() {
        const index = await game.settings.get(MODULE_ID, "graphIndex") || [];
        if (index.length) return;

        const legacy = await game.settings.get(MODULE_ID, "graphs") || [];
        if (!legacy.length) return;

        for (const g of legacy) await this.upsertGraph(g);

        await game.settings.set(MODULE_ID, "graphs", []); // optional
    }
    // ---------------------------------------------------------------------------
    // Persistence helpers
    // ---------------------------------------------------------------------------
    async loadGraphs() {
        const index = await game.settings.get(MODULE_ID, "graphIndex") || [];
        this._indexMap = new Map(index.map(e => [e.id, e]));
        await this.migrateFromLegacySettingIfNeeded();
        this._graphMap.clear();
    }

    getGraphIndexEntry(id) {
        return this._indexMap.get(id) ?? null;
    }

    async getGraph(id) {
        // cached?
        if (this._graphMap.has(id)) return this._graphMap.get(id);

        const entry = this.getGraphIndexEntry(id);
        if (!entry) return null;

        const graphRaw = await this._readGraphFile(entry.file);
        const graph = migrateGraph(graphRaw, this.graphTypes);
        this._graphMap.set(id, graph);
        return graph;
    }


    async _saveIndex() {
        await game.settings.set(MODULE_ID, "graphIndex", Array.from(this._indexMap.values()));
    }
    async upsertGraph(graph) {
        // Ensure graph has data
        if (!graph.data) {
            const renderer = this.getRenderer(graph.renderer);
            if (renderer?.initializeGraphData) graph.data = renderer.initializeGraphData();
            else graph.data = {};
        }

        if (!Array.isArray(graph.allowedEntities)) {
            graph.allowedEntities = this.graphTypes?.[graph.graphType]?.allowedEntities || [];
        }

        const dir = await this._pickWritableStorageDir();
        const filePath = await this._writeGraphFile(dir, graph);

        const prev = this._indexMap.get(graph.id);
        const createdAt = prev?.createdAt ?? _nowISO();
        const updatedAt = _nowISO();
        const revision = (prev?.revision ?? 0) + 1;

        const entry = {
            id: graph.id,
            name: graph.name,
            desc: graph.desc,
            graphType: graph.graphType,
            renderer: graph.renderer,
            width: graph.width ?? 800,
            height: graph.height ?? 600,
            color: graph.color ?? "#ffffff",
            nodeLabelColor: graph.nodeLabelColor ?? "#000000",
            background: graph.background ?? null,
            permissions: graph.permissions ?? {},
            relations: graph.relations ?? {},
            allowedEntities: graph.allowedEntities ?? [],
            schemaVersion: graph.schemaVersion,
            graphTypeVersion: graph.graphTypeVersion,
            data: graph.data,
            file: filePath,
            createdAt: createdAt,
            updatedAt: updatedAt,
            revision: revision
        };

//        this._indexMap.set(graph.id, graph);
//        this._graphMap.set(graph.id, entry);
        this._indexMap.set(graph.id, entry);
        this._graphMap.set(graph.id, graph);

        await this._saveIndex();
        return graph;
    }
    async deleteGraph(id) {
        this._graphMap.delete(id);
        this._indexMap.delete(id);
        await this._saveIndex();

        // NOTE: file remains on disk; Foundry does not provide a supported file delete API. :contentReference[oaicite:7]{index=7}
    }

    getAllGraphs() {
        return Array.from(this._indexMap.values());
    }

    async getAllGraphsFull() {
        const out = [];
        for (const entry of this._indexMap.values()) {
            out.push(await this.getGraph(entry.id));
        }
        return out.filter(Boolean);
    }

    getGraphTypesArray() {
        log("GraphApi.getGraphTypesArray", this.graphTypes)
        return Object.values(this.graphTypes);
    }

    async getGraphTypeById(id) {
        return this.graphTypes[id] || null;
    }

    getRenderer(id) {
        log("getRenderer", id, this.registryRenderers)
        log("getRenderer", this.registryRenderers.get(id))
        log("getRenderer", this.registryRenderers[id])
        return this.registryRenderers.get(id);
    }
    // ---------------------------------------------------------------------------
    // Miscellaneous
    // ---------------------------------------------------------------------------
    /** Convenience pass‑through for module version */
    get version() {
        return game.modules.get(this.moduleId)?.version ?? "0.0.0";
    }

    // Prefer your desired location, but be ready to fall back.
    get storageDirPreferred() {
        return `${DEFAULT_STORAGE_ROOT}/${game.world.id}`;
    }

    get storageDirWorldFallback() {
        return `worlds/${game.world.id}/foundry-graph`;
    }

    _graphFileName(id) {
        return `${id}.json`;
    }

    _graphFilePath(dir, id) {
        return `${dir}/${this._graphFileName(id)}`;
    }

    async _ensureDir(source, target) {
        // Create nested directories segment by segment
        const parts = target.split("/").filter(Boolean);
        let current = "";
        for (const p of parts) {
            current = current ? `${current}/${p}` : p;
            try {
                await FilePicker.createDirectory(source, current);
            } catch (e) {
                // If already exists or forbidden, ignore existence; rethrow on true failures
                const msg = String(e?.message ?? e);
                const alreadyExists = msg.toLowerCase().includes("exist");
                if (!alreadyExists) throw e;
            }
        }
    }

    async _pickWritableStorageDir() {
        // Try preferred first
        try {
            await this._ensureDir("data", this.storageDirPreferred);
            return this.storageDirPreferred;
        } catch (e) {
            // Fallback to world folder
            await this._ensureDir("data", this.storageDirWorldFallback);
            return this.storageDirWorldFallback;
        }
    }

    async _writeGraphFile(dir, graph) {
        const json = JSON.stringify(graph, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const file = new File([blob], this._graphFileName(graph.id), { type: "application/json" });

        // Upload overwrites same filename (the common “save” behavior)
        // FilePicker.upload docs: upload(source, path, file, ...) :contentReference[oaicite:5]{index=5}
        await FilePicker.upload("data", dir, file, {}, { notify: false });

        // Return a usable path for fetch/links
        return this._graphFilePath(dir, graph.id);
    }

    async _readGraphFile(filePath) {
        // filePath is relative like "foundry-graph/worldId/graphId.json"
        // Fetch relative to the server root
        const res = await fetch(filePath.startsWith("/") ? filePath : `/${filePath}`);
        if (!res.ok) throw new Error(`Failed to load graph file ${filePath}: ${res.status}`);
        return await res.json();
    }
}
