import GraphDashboardV2 from "./graph_dashboard_v2.js"
import { log, MODULE_ID, JSON_graph_types, t, tf } from './constants.js';
import { ForceRenderer, preserveForceVisibility } from "./renderers/force-renderer.js";
//import { TreeRenderer } from "./renderers/tree-renderer.js";
import { GenealogyRenderer } from "./renderers/genealogy-renderer.js";
import { ImageSlotsRenderer } from "./renderers/image-slot-renderer.js";
import { MapRenderer, preserveMapVisibility } from "./renderers/map-renderer.js";
import { migrateGraph } from "./model/graph_migrations.js";
import { TimelineRenderer } from "./renderers/timeline-renderer.js";
import { VisTimelineRenderer } from "./renderers/vis-timeline-renderer.js";
import { SpacekitRenderer } from "./renderers/spacekit-renderer.js";
import { D3GraphApp } from "./d3-graph-app.js";
import { registerGraphSaveRequests, requestGraphSave } from "./graph-save-request.js";

const LEVELS = foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS; // { NONE:0, LIMITED:1, OBSERVER:2, OWNER:3 }
const LEGACY_STORAGE_ROOT = "foundry-graph"; // Old location: Data/foundry-graph/<worldId>/
const WORLD_STORAGE_SUBFOLDER_SETTING = "worldStorageSubfolder";
const DEFAULT_WORLD_STORAGE_SUBFOLDER = "graphs";
const OWNER_EDIT_FIELDS = ["name", "desc", "theme", "background", "relations", "data"];


function _nowISO() { return new Date().toISOString(); }

function _filePicker() {
    const picker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation
        ?? globalThis.foundry?.applications?.apps?.FilePicker
        ?? globalThis.FilePicker;
    if (!picker) throw new Error("Foundry FilePicker API is not available");
    return picker;
}

/**
 * @typedef {object} GraphData
 * @property {string} id Unique graph ID within the world.
 * @property {string} name Display name.
 * @property {string} graphType ID of the graph type definition.
 * @property {string} renderer ID of the renderer that owns data.
 * @property {string} [desc] Graph description.
 * @property {string|null} [theme] Theme ID from the graph type.
 * @property {object} [background] Renderer-specific background configuration.
 * @property {object[]} [relations] Relationship styles available in the editor.
 * @property {object} [data] Renderer-specific graph content.
 * @property {Object<string, number>} [permissions] Ownership levels by user ID, with an optional default.
 * @property {number} [schemaVersion] Version of the saved graph format.
 * @property {number} [graphTypeVersion] Version of the graph type definition.
 */

/**
 * @typedef {GraphData & {file: string, revision?: number, createdAt?: string, updatedAt?: string}} GraphIndexEntry
 */

/** World-scoped API available at game.modules.get("foundry-graph").api. */
export class GraphApi {
    #writeQueue = Promise.resolve();

    /**
     * Register the module settings during Foundry initialization.
     * @returns {Promise<void>} Resolves after the settings are registered.
     */
    static async registerSettings() {
        if (!game.settings.settings.has(`${MODULE_ID}.debug`)) {
            game.settings.register(MODULE_ID, "debug", {
                scope: "world",
                config: true,
                type: Boolean,
                default: false,
                name: t("Settings.DebugName"),
                hint: t("Settings.DebugHint")
            });
        }

        if (!game.settings.settings.has(`${MODULE_ID}.showUnavailableReferences`)) {
            game.settings.register(MODULE_ID, "showUnavailableReferences", {
                scope: "user",
                config: true,
                type: Boolean,
                default: false,
                name: t("Settings.ShowUnavailableReferencesName"),
                hint: t("Settings.ShowUnavailableReferencesHint"),
                onChange: () => Hooks.callAll(`${MODULE_ID}.referenceIndicatorsChanged`)
            });
        }

        // Avoid double registration if hot‑reloaded, but register each setting independently.
        if (!game.settings.settings.has(`${MODULE_ID}.graphs`)) {
            game.settings.register(MODULE_ID, "graphs", {
                scope: "world",
                config: false,
                type: Array,
                default: []
            });
        }

        if (!game.settings.settings.has(`${MODULE_ID}.graphIndex`)) {
            game.settings.register(MODULE_ID, "graphIndex", {
                scope: "world",
                config: false,
                type: Array,
                default: []
            });
        }

        if (!game.settings.settings.has(`${MODULE_ID}.${WORLD_STORAGE_SUBFOLDER_SETTING}`)) {
            game.settings.register(MODULE_ID, WORLD_STORAGE_SUBFOLDER_SETTING, {
                scope: "world",
                config: false,
                type: String,
                default: DEFAULT_WORLD_STORAGE_SUBFOLDER
            });
        }
    }


    // ---------------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------------
    /** Create the API for the world and system currently open in Foundry. */
    constructor() {
        this.moduleId = MODULE_ID;
        this._graphMap = new Map();
        this._indexMap = new Map();      // id -> index entry

        /** @type {Map<string, object>} */

        const currentSystem = game.system.id;

        // Convert map → array and filter by system
        this.graphTypes = Object.fromEntries(Object.entries(JSON_graph_types)
            .filter(([id, cfg]) => cfg.systems.includes(currentSystem) || cfg.systems.includes("*"))
            .filter(([id, cfg]) => cfg.released !== false));

        this.registryRenderers = new Map([
            [ForceRenderer.ID, new ForceRenderer()],
            [GenealogyRenderer.ID, new GenealogyRenderer()],
            [ImageSlotsRenderer.ID, new ImageSlotsRenderer()],
            [MapRenderer.ID, new MapRenderer()],
            [TimelineRenderer.ID, new VisTimelineRenderer()],
            [VisTimelineRenderer.ID, new VisTimelineRenderer()],
            [SpacekitRenderer.ID, new SpacekitRenderer()],
        ]);

        log("GraphApi.constructor", this.graphTypes)
        log("JSON_graph_types", JSON_graph_types)

    }

    // ---------------------------------------------------------------------------
    // Public API surface
    // ---------------------------------------------------------------------------

    /**
     * Get the dashboard for the current world.
     * @param {boolean} [show=false] Render the dashboard before returning it.
     * @returns {Promise<GraphDashboardV2>} The shared dashboard instance.
     */
    async openDashboard(show = false) {
        log("GraphApi.openDashboard", show);
        if (!this.dashboard) this.dashboard = await new GraphDashboardV2(this);
        log("dashboard", this.dashboard)
        if (show) await this.dashboard.render(true);
        return this.dashboard;
    }


    /**
     * Open a saved graph in its renderer.
     * @param {string} graphId ID from the graph list.
     * @param {object} [options={}] Window options.
     * @param {"view"|"edit"|null} [options.mode=null] Use view mode, require edit access, or select the mode from the caller's permissions.
     * @param {Function|null} [options.onCloseCallback=null] Callback invoked when the window closes.
     * @returns {Promise<D3GraphApp|null>} The opened window, or null if the graph is missing or the requested access is denied.
     * @throws {Error} If the graph file cannot be read or the renderer fails.
     */
    async openGraphById(graphId, { mode = null, onCloseCallback = null } = {}) {
        const graph = await this.getGraph(graphId);
        if (!graph || !this.canOpenById(graphId)) {
            ui.notifications.warn(t("Notifications.GraphUnavailable"));
            return null;
        }

        const canEdit = this.canEditById(graphId);
        if (mode === "edit" && !canEdit) {
            ui.notifications.warn(t("Notifications.GraphAccessDenied"));
            return null;
        }
        const finalMode = mode === "view" || !canEdit ? "view" : "edit";

        const app = new D3GraphApp({
            graph,
            mode: finalMode,
            onCloseCallback
        });

        await app.render(true);
        return app;
    }


    /**
     * Check whether a user has the full Gamemaster role.
     * @param {foundry.documents.User|null} [user=game.user] User to check.
     * @returns {boolean} Whether the user has the Gamemaster role.
     */
    isGamemaster(user = game.user) {
        return user?.role === foundry.CONST.USER_ROLES.GAMEMASTER;
    }

    /**
     * Resolve the effective ownership level from a graph or its index entry.
     * @param {GraphData|GraphIndexEntry|null} graph Graph whose ownership to check.
     * @param {foundry.documents.User|null} [user=game.user] User to check.
     * @returns {number} A value from Foundry's document ownership levels.
     */
    getPermission(graph, user = game.user) {
        if (!graph || !user) return LEVELS.NONE;
        if (this.isGamemaster(user)) return LEVELS.OWNER;
        // An explicit NONE overrides the default.
        const level = graph.permissions?.[user.id] ?? graph.permissions?.default;
        return Object.values(LEVELS).includes(level) ? level : LEVELS.NONE;
    }

    /**
     * Check whether a user has at least Limited access.
     * @param {GraphData|GraphIndexEntry|null} graph Graph whose ownership to check.
     * @param {foundry.documents.User|null} [user=game.user] User to check.
     * @returns {boolean} Whether the graph's access level is at least Limited.
     */
    canView(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.LIMITED; }
    /**
     * Check whether a user can open a graph for reading.
     * @param {GraphData|GraphIndexEntry|null} graph Graph whose ownership to check.
     * @param {foundry.documents.User|null} [user=game.user] User to check.
     * @returns {boolean} Whether the graph's access level is at least Observer.
     */
    canOpen(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.OBSERVER; }
    /**
     * Check whether a user can edit a graph.
     * @param {GraphData|GraphIndexEntry|null} graph Graph whose ownership to check.
     * @param {foundry.documents.User|null} [user=game.user] User to check.
     * @returns {boolean} Whether the graph's access level is Owner.
     */
    canEdit(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.OWNER; }

    /**
     * Check Limited access against the current index.
     * @param {string} id Saved graph ID.
     * @param {foundry.documents.User|null} [user=game.user] User to check.
     * @returns {boolean} Whether the graph exists and the user has at least Limited access.
     */
    canViewById(id, user = game.user) {
        this.refreshGraphIndex();
        return this.canView(this._indexMap.get(id), user);
    }

    /**
     * Check read access against the current index.
     * @param {string} id Saved graph ID.
     * @param {foundry.documents.User|null} [user=game.user] User to check.
     * @returns {boolean} Whether the graph exists and the user can open it.
     */
    canOpenById(id, user = game.user) {
        this.refreshGraphIndex();
        return this.canOpen(this._indexMap.get(id), user);
    }

    /**
     * Check edit access against the current index.
     * @param {string} id Saved graph ID.
     * @param {foundry.documents.User|null} [user=game.user] User to check.
     * @returns {boolean} Whether the graph exists and the user can edit it.
     */
    canEditById(id, user = game.user) {
        this.refreshGraphIndex();
        return this.canEdit(this._indexMap.get(id), user);
    }

    /**
     * List the index entries the current user can open.
     * @returns {GraphIndexEntry[]} Copies of the accessible entries.
     */
    getAccessibleGraphs() {
        return this.getAllGraphs();
    }

    /**
     * Replace a graph's ownership settings as a Gamemaster.
     * @param {string} graphId Saved graph ID.
     * @param {Object<string, number>} newPerms Ownership levels keyed by Foundry user ID or `default`.
     * @returns {Promise<GraphData|null>} The saved graph, or null if it was missing or changed while saving.
     * @throws {Error} If access is denied, a level is invalid, or the write fails.
     */
    async updateGraphPermissions(graphId, newPerms) {
        if (!this.isGamemaster()) throw new Error(t("Notifications.GraphAccessDenied"));
        const entry = this.getGraphIndexEntry(graphId);
        if (!entry) return null;

        const permissions = this.#validatePermissions(newPerms);
        const graph = await this.getGraph(graphId);
        if (!graph) return null;
        return this.#writeGraph({ ...graph, permissions }, {
            expectedRevision: entry.revision ?? null, changePermissions: true
        });
    }

    #validatePermissions(permissions) {
        const levels = Object.values(LEVELS);
        if (!permissions || typeof permissions !== "object" || Array.isArray(permissions) ||
            Object.values(permissions).some(level => !levels.includes(level))) {
            throw new Error(t("Notifications.GraphPermissionsInvalid"));
        }
        return foundry.utils.deepClone(permissions);
    }

    /**
     * Import graphs from the old world setting when the graph index is empty. Requires a GM.
     * @returns {Promise<void>} Resolves after the import or when there is no work to do.
     * @throws {Error} If a graph write or the settings update fails.
     */
    async #migrateFromLegacySettingIfNeeded() {
        if (!this.isGamemaster()) return;
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
    /**
     * Load the world graph index, run the applicable startup migrations and clear the graph cache.
     * @returns {Promise<void>} Resolves after startup loading completes.
     * @throws {Error} If a startup storage or settings operation fails.
     */
    async loadGraphs() {
        const index = await game.settings.get(MODULE_ID, "graphIndex") || [];
        this._indexMap = new Map(index.map(e => [e.id, e]));
        await this.#migrateFromLegacySettingIfNeeded();
        await this.#migrateGraphFilesToWorldStorageFolderIfNeeded();
        this._graphMap.clear();
    }

    /**
     * Reload the graph index from world settings and evict cached graphs whose file or revision changed.
     * @returns {void}
     */
    refreshGraphIndex() {
        const entries = game.settings.get(MODULE_ID, "graphIndex") ?? [];
        const currentIndex = new Map(entries.map(entry => [entry.id, entry]));
        for (const id of this._graphMap.keys()) {
            const previous = this._indexMap.get(id);
            const current = currentIndex.get(id);
            if (!current || previous?.file !== current.file || previous?.revision !== current.revision) {
                this._graphMap.delete(id);
            }
        }
        this._indexMap = currentIndex;
    }

    /**
     * Read a graph index entry if the current user can open it.
     * @param {string} id Saved graph ID.
     * @returns {GraphIndexEntry|null} A copy of the index entry, or null when inaccessible or missing.
     */
    getGraphIndexEntry(id) {
        this.refreshGraphIndex();
        const entry = this._indexMap.get(id);
        return this.canOpen(entry) ? foundry.utils.deepClone(entry) : null;
    }

    /**
     * Load a graph the current user can open. Older files are migrated in memory.
     * @param {string} id Saved graph ID.
     * @returns {Promise<GraphData|null>} A copy of the graph, or null when inaccessible or missing.
     * @throws {Error} If the file cannot be read or migration fails.
     */
    async getGraph(id) {
        const entry = this.getGraphIndexEntry(id);
        if (!entry) return null;
        if (this._graphMap.has(id)) return foundry.utils.deepClone(this._graphMap.get(id));

        const graphRaw = await this._readGraphFile(entry.file);
        const current = this.getGraphIndexEntry(id);
        if (!current) return null;
        if (current.revision !== entry.revision || current.file !== entry.file) return this.getGraph(id);
        const graph = migrateGraph(graphRaw, this.graphTypes);
        graph.permissions = current.permissions ?? {};
        this._graphMap.set(id, graph);
        return foundry.utils.deepClone(graph);
    }

    async _saveIndex(index = this._indexMap) {
        await game.settings.set(MODULE_ID, "graphIndex", Array.from(index.values()));
    }

    /**
     * Create a graph as GM, or save changes to an existing graph as GM or Owner.
     * An Owner's write is delegated to an active GM and is limited to editable graph fields.
     * @param {GraphData} graph Graph to save.
     * @param {object} [options={}] Write prerequisites.
     * @param {number|null} [options.expectedRevision] Revision from the graph index. Use null for an entry without a revision.
     * @param {boolean} [options.createOnly=false] Refuse to overwrite an existing graph with this ID.
     * @returns {Promise<GraphData|null>} The saved graph, or null when a prerequisite fails.
     * @throws {Error} If access is denied, the delegated save fails, or Foundry rejects the write.
     */
    async upsertGraph(graph, { expectedRevision, createOnly = false } = {}) {
        if (!this.isGamemaster()) {
            this.refreshGraphIndex();
            const entry = this._indexMap.get(graph.id);
            if (createOnly || !this.canEdit(entry)) throw new Error(t("Notifications.GraphAccessDenied"));
            const revision = entry.revision ?? null;
            if (expectedRevision !== undefined && expectedRevision !== revision) return null;

            const changes = Object.fromEntries(OWNER_EDIT_FIELDS
                .filter(field => Object.hasOwn(graph, field))
                .map(field => [field, graph[field]]));
            if (!await requestGraphSave({ id: graph.id, revision, changes })) return null;
            return this.getGraph(graph.id);
        }
        return this.#writeGraph(graph, { expectedRevision, createOnly });
    }

    /**
     * Install the handler for save requests delegated to the active GM. Called once during initialization.
     * @returns {void}
     */
    registerOwnerSaves() {
        registerGraphSaveRequests(async (request, userId) => {
            const { id, revision, changes } = request ?? {};
            const user = game.users.get(userId);
            if (!user || typeof id !== "string" || !changes || typeof changes !== "object" || Array.isArray(changes) ||
                (revision !== null && !Number.isSafeInteger(revision))) return "denied";

            return this.#queueWrite(async () => {
                this.refreshGraphIndex();
                const entry = this._indexMap.get(id);
                if (!this.canEdit(entry, user)) return "denied";
                if ((entry.revision ?? null) !== revision) return "conflict";
                const saved = await this.getGraph(id);
                if (!saved) return "conflict";
                if (Object.hasOwn(changes, "data")) {
                    const renderer = saved.renderer ?? saved.graphType;
                    if (renderer === ForceRenderer.ID) changes.data = preserveForceVisibility(saved.data, changes.data);
                    else if (renderer === MapRenderer.ID) changes.data = preserveMapVisibility(saved.data, changes.data);
                    if ((renderer === ForceRenderer.ID || renderer === MapRenderer.ID) && !changes.data) return "denied";
                }
                for (const field of OWNER_EDIT_FIELDS) {
                    if (Object.hasOwn(changes, field)) saved[field] = changes[field];
                }
                const result = await this.#persistGraph(saved, {
                    expectedRevision: revision, editorId: userId
                });
                return result ? "saved" : "conflict";
            });
        });
    }

    #queueWrite(write) {
        const result = this.#writeQueue.then(write);
        this.#writeQueue = result.catch(() => {});
        return result;
    }

    #writeGraph(input, options) {
        return this.#queueWrite(() => this.#persistGraph(input, options));
    }

    async #persistGraph(input, { expectedRevision, createOnly = false, changePermissions = false, editorId }) {
        const id = input.id;
        const canWrite = entry => this.isGamemaster() && (editorId === undefined ||
            this.canEdit(entry, game.users.get(editorId) ?? null));
        this.refreshGraphIndex();
        let prev = this._indexMap.get(id);
        if (!canWrite(prev)) {
            throw new Error(t("Notifications.GraphAccessDenied"));
        }

        if ((createOnly && prev) ||
            (expectedRevision !== undefined && (!prev || (prev.revision ?? null) !== expectedRevision))) return null;

        const dir = await this._pickWritableStorageDir();
        this.refreshGraphIndex();
        const current = this._indexMap.get(id);
        if (!canWrite(current)) {
            throw new Error(t("Notifications.GraphAccessDenied"));
        }
        if (Boolean(current) !== Boolean(prev) || current?.revision !== prev?.revision) return null;
        prev = current;

        const graph = foundry.utils.deepClone(input);
        graph.permissions = changePermissions || !prev
            ? this.#validatePermissions(graph.permissions ?? {})
            : foundry.utils.deepClone(prev.permissions ?? {});

        // Ensure graph has data
        if (!graph.data) {
            const renderer = this.getRenderer(graph.renderer);
            if (renderer?.initializeGraphData) graph.data = renderer.initializeGraphData();
            else graph.data = {};
        }

        if (!Array.isArray(graph.allowedEntities)) {
            graph.allowedEntities = this.graphTypes?.[graph.graphType]?.allowedEntities || [];
        }

        const filePath = await this._writeGraphFile(dir, graph);

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

        const index = new Map(this._indexMap);
        index.set(graph.id, entry);
        await this._saveIndex(index);
        this._indexMap = index;
        this._graphMap.set(graph.id, graph);
        return foundry.utils.deepClone(graph);
    }

    /**
     * Remove a graph from the world index as a Gamemaster. Its JSON is kept on disk.
     * @param {string} id Saved graph ID.
     * @returns {Promise<boolean>} Whether an index entry was removed.
     * @throws {Error} If access is denied or the index cannot be written.
     */
    async deleteGraph(id) {
        if (!this.isGamemaster()) throw new Error(t("Notifications.GraphAccessDenied"));
        return this.#queueWrite(async () => {
            this.refreshGraphIndex();
            const index = new Map(this._indexMap);
            if (!index.delete(id)) return false;
            await this._saveIndex(index);
            this._indexMap = index;
            this._graphMap.delete(id);
            return true;
        });
    }

    /**
     * List graph index entries the current user can open.
     * @returns {GraphIndexEntry[]} Copies of the accessible entries.
     */
    getAllGraphs() {
        this.refreshGraphIndex();
        const entries = Array.from(this._indexMap.values()).filter(entry => this.canOpen(entry));
        return foundry.utils.deepClone(entries);
    }

    /**
     * Load the full graphs the current user can open in index order.
     * @returns {Promise<GraphData[]>} Copies of the accessible graphs.
     * @throws {Error} If an accessible graph file cannot be read or migrated.
     */
    async getAllGraphsFull() {
        const out = [];
        for (const entry of this.getAllGraphs()) {
            const graph = await this.getGraph(entry.id);
            if (graph) out.push(graph);
        }
        return out.filter(Boolean);
    }

    /**
     * List the released graph types available for the current game system.
     * @returns {object[]} The registered graph type definitions. Treat them as read-only.
     */
    getGraphTypesArray() {
        log("GraphApi.getGraphTypesArray", this.graphTypes)
        return Object.values(this.graphTypes);
    }

    /**
     * Find a graph type available to the current game system.
     * @param {string} id Graph type ID.
     * @returns {Promise<object|null>} Its definition, or null if it is unavailable. Treat the definition as read-only.
     */
    async getGraphTypeById(id) {
        return this.graphTypes[id] || null;
    }

    /**
     * Create a renderer for a graph window.
     * @param {string} id Renderer ID, usually the graph's `renderer` field.
     * @returns {import("./renderers/base-renderer.js").BaseRenderer|undefined} A fresh instance, or undefined for an unknown renderer.
     */
    createRenderer(id) {
        const renderer = this.registryRenderers.get(id);
        return renderer ? new renderer.constructor() : undefined;
    }

    /**
     * Get the shared renderer used for operations on graph data.
     * @param {string} id Renderer ID, usually the graph's `renderer` field.
     * @returns {import("./renderers/base-renderer.js").BaseRenderer|undefined} The shared instance, or undefined for an unknown renderer. Use createRenderer for a window.
     */
    getRenderer(id) {
        return this.registryRenderers.get(id);
    }
    // ---------------------------------------------------------------------------
    // Miscellaneous
    // ---------------------------------------------------------------------------
    /**
     * Installed module version from the manifest.
     * @type {string}
     */
    get version() {
        return game.modules.get(this.moduleId)?.version ?? "0.0.0";
    }

    /**
     * Folder relative to the world directory, as configured in the module settings.
     * @type {string}
     */
    get worldStorageSubfolder() {
        let value = DEFAULT_WORLD_STORAGE_SUBFOLDER;
        try {
            value = game.settings.get(MODULE_ID, WORLD_STORAGE_SUBFOLDER_SETTING) || DEFAULT_WORLD_STORAGE_SUBFOLDER;
        } catch (err) {
            value = DEFAULT_WORLD_STORAGE_SUBFOLDER;
        }

        value = String(value).trim().replace(/^\/+|\/+$/g, "");
        return value || DEFAULT_WORLD_STORAGE_SUBFOLDER;
    }

    /**
     * World-relative data path used for current graph files, with no leading slash.
     * @type {string}
     */
    get storageDirWorld() {
        return `worlds/${game.world.id}/${this.worldStorageSubfolder}`;
    }

    /**
     * Legacy data path checked when relocating older graph files.
     * @type {string}
     */
    get storageDirLegacy() {
        return `${LEGACY_STORAGE_ROOT}/${game.world.id}`;
    }

    _graphFileName(id) {
        return `${id}.json`;
    }

    _graphFilePath(dir, id) {
        return `${dir}/${this._graphFileName(id)}`;
    }

    async _ensureDir(source, target) {
        // Create nested directories segment by segment.
        const parts = target.split("/").filter(Boolean);
        let current = "";
        for (const p of parts) {
            current = current ? `${current}/${p}` : p;
            try {
                await _filePicker().createDirectory(source, current);
            } catch (e) {
                const msg = String(e?.message ?? e);
                const alreadyExists = msg.toLowerCase().includes("exist");
                if (!alreadyExists) throw e;
            }
        }
    }

    async _pickWritableStorageDir() {
        await this._ensureDir("data", this.storageDirWorld);
        return this.storageDirWorld;
    }

    _normalizeStoragePath(path) {
        return String(path ?? "").replace(/^\/+/, "");
    }

    _isWorldStoragePath(path) {
        const normalized = this._normalizeStoragePath(path);
        return normalized.startsWith(`${this.storageDirWorld}/`);
    }

    _isMigratableGraphStoragePath(path) {
        const normalized = this._normalizeStoragePath(path);
        return normalized.startsWith(`${this.storageDirLegacy}/`);
    }

    /**
     * Copy indexed files from the legacy location to this world’s storage folder. Requires a GM.
     * A failed copy leaves its index entry pointing to the original file.
     * @returns {Promise<void>} Resolves after processing the affected entries.
     * @throws {Error} If the destination folder or graph index cannot be written.
     */
    async #migrateGraphFilesToWorldStorageFolderIfNeeded() {
        if (!this.isGamemaster()) return;

        let changed = false;
        await this._ensureDir("data", this.storageDirWorld);

        for (const entry of this._indexMap.values()) {
            if (!entry?.id || !entry?.file) continue;
            if (this._isWorldStoragePath(entry.file)) continue;
            if (!this._isMigratableGraphStoragePath(entry.file)) continue;

            try {
                const graphRaw = await this._readGraphFile(entry.file);
                if (!graphRaw.id) graphRaw.id = entry.id;
                const newFile = await this._writeGraphFile(this.storageDirWorld, graphRaw);
                this._indexMap.set(entry.id, { ...entry, file: newFile });
                changed = true;
                log(`Migrated graph ${entry.id} from ${entry.file} to ${newFile}`);
            } catch (err) {
                log(`Failed to migrate graph ${entry.id} to world storage folder`, err);
                ui.notifications?.warn?.(tf("Notifications.WorldStorageMigrationFailed", { name: entry.name ?? entry.id }));
            }
        }

        if (changed) {
            await this._saveIndex();
            ui.notifications?.info?.(t("Notifications.WorldStorageMigrationDone"));
        }
    }

    async _writeGraphFile(dir, graph) {
        const json = JSON.stringify(graph, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const file = new File([blob], this._graphFileName(graph.id), { type: "application/json" });

        const result = await _filePicker().upload("data", dir, file, {}, { notify: false });
        if (!result?.path) throw new Error(t("Notifications.GraphWriteFailed"));
        return result.path;
    }

    async _readGraphFile(filePath) {
        // filePath is relative, for example: "worlds/world-id/<configured-folder>/graph-id.json".
        const res = await fetch(filePath.startsWith("/") ? filePath : `/${filePath}`, { cache: "no-cache" });
        if (!res.ok) throw new Error(`Failed to load graph file ${filePath}: ${res.status}`);
        return await res.json();
    }
}
