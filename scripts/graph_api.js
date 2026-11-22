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


// graph_api.js – SAFE ES2019 VERSION (no class‑fields, no private #names)
// -----------------------------------------------------------------------------
//  • All consumers obtain the singleton via `game.modules.get("foundry-graph").api`
//  • This class handles JSON default loading, graph‑type registration, and
//    world‑persistent storage (setting "foundry-graph.graphs").
//  • No window globals and only ES features that Foundry v12 (Chromium 100+) supports.
function _nowISO() { return new Date().toISOString(); }

function _filePicker() {
    const picker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation
        ?? globalThis.foundry?.applications?.apps?.FilePicker
        ?? globalThis.FilePicker;
    if (!picker) throw new Error("Foundry FilePicker API is not available");
    return picker;
}

export class GraphApi {
    #writeQueue = Promise.resolve();

    /**
     * Ensure the world‑level setting exists. Call once early in module init.
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
     * Placeholder – adapt to your original structure.
     * @param {string} graphId
     */
    get_graph_elements(graphId) {
        // TODO: replicate your original mapping logic here.
        return [];
    }

    isGamemaster(user = game.user) {
        return user?.role === foundry.CONST.USER_ROLES.GAMEMASTER;
    }

    getPermission(graph, user = game.user) {
        if (!graph || !user) return LEVELS.NONE;
        if (this.isGamemaster(user)) return LEVELS.OWNER;
        // An explicit NONE overrides the default.
        const level = graph.permissions?.[user.id] ?? graph.permissions?.default;
        return Object.values(LEVELS).includes(level) ? level : LEVELS.NONE;
    }

    canView(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.LIMITED; }
    canOpen(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.OBSERVER; }
    canEdit(graph, user = game.user) { return this.getPermission(graph, user) >= LEVELS.OWNER; }

    canViewById(id, user = game.user) {
        this.refreshGraphIndex();
        return this.canView(this._indexMap.get(id), user);
    }

    canOpenById(id, user = game.user) {
        this.refreshGraphIndex();
        return this.canOpen(this._indexMap.get(id), user);
    }

    canEditById(id, user = game.user) {
        this.refreshGraphIndex();
        return this.canEdit(this._indexMap.get(id), user);
    }

    getAccessibleGraphs() {
        return this.getAllGraphs();
    }

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

    async migrateFromLegacySettingIfNeeded() {
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
    async loadGraphs() {
        const index = await game.settings.get(MODULE_ID, "graphIndex") || [];
        this._indexMap = new Map(index.map(e => [e.id, e]));
        await this.migrateFromLegacySettingIfNeeded();
        await this.migrateGraphFilesToWorldStorageFolderIfNeeded();
        this._graphMap.clear();
    }

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

    getGraphIndexEntry(id) {
        this.refreshGraphIndex();
        const entry = this._indexMap.get(id);
        return this.canOpen(entry) ? foundry.utils.deepClone(entry) : null;
    }

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

    migrateGraph(graphRaw) {
        return migrateGraph(graphRaw, this.graphTypes); // the imported function
    }

    async _saveIndex(index = this._indexMap) {
        await game.settings.set(MODULE_ID, "graphIndex", Array.from(index.values()));
    }

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

    getAllGraphs() {
        this.refreshGraphIndex();
        const entries = Array.from(this._indexMap.values()).filter(entry => this.canOpen(entry));
        return foundry.utils.deepClone(entries);
    }

    async getAllGraphsFull() {
        const out = [];
        for (const entry of this.getAllGraphs()) {
            const graph = await this.getGraph(entry.id);
            if (graph) out.push(graph);
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

    createRenderer(id) {
        const renderer = this.registryRenderers.get(id);
        return renderer ? new renderer.constructor() : undefined;
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

    get storageDirWorld() {
        return `worlds/${game.world.id}/${this.worldStorageSubfolder}`;
    }

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

    async migrateGraphFilesToWorldStorageFolderIfNeeded() {
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
