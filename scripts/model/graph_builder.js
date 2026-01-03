import { MODULE_ID, JSON_graph_types, GRAPH_SCHEMA_VERSION, t} from "../constants.js";

export class GraphBuilder {
    constructor({
        id = foundry.utils.randomID(),
        name = t("Defaults.UntitledGraph"),
        desc = "",
        graphType = "character-map",
        width = 800,
        height = 600,
        color = "#ffffff",
        nodeLabelColor = "#000000",
        background = { },
        relations = [],
        userId = game.userId,
    } = {}) {

        this._g = {
            id, name, desc,
            graphType,
            renderer: JSON_graph_types[graphType]?.renderer || "force",
            width, height,
            color: JSON_graph_types[graphType]?.color || color,
            nodeLabelColor: JSON_graph_types[graphType]?.nodeLabelColor || nodeLabelColor,
            background: {
                image: JSON_graph_types[graphType]?.background,
                width: JSON_graph_types[graphType]?.background?.width || width,
                height: JSON_graph_types[graphType]?.background?.height || height,
                color: "#000000",
                opacity: 1.0, 
                fit: "contain", 
                ...background
            },
            allowedEntities: JSON_graph_types[graphType]?.allowedEntities || [],
            permissions: {
                default: foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
                [userId]: foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
            },
            relations: JSON_graph_types[graphType]?.relations || [],
            slots: JSON_graph_types[graphType]?.slots || [],
            schemaVersion: GRAPH_SCHEMA_VERSION,
            graphTypeVersion: JSON_graph_types[graphType]?.version,
        };
    }

    setDesc(desc) { this._g.desc = desc ?? ""; return this; }
    setBackground(bg) { Object.assign(this._g.background, bg || {}); return this; }
    setPermissions(perms) { this._g.permissions = { ...this._g.permissions, ...(perms || {}) }; return this; }
    setRelations(relations) { this._g.relations = Array.isArray(relations) ? [...relations] : []; return this; }
    setSize({ width, height }) { if (width) this._g.width = +width; if (height) this._g.height = +height; return this; }
    setGraphType(graphType) { 
        this._g.graphType = graphType; 
        this._g.renderer = JSON_graph_types[graphType]?.renderer; 
        return this; }

    /** Validate minimal structure; return { ok, errors[] } */
    validate() {
        const errors = [];
        if (!this._g.id) errors.push("id is required");
        return { ok: errors.length === 0, errors };
    }

    /** Return a deep clone ready to persist */
    build() {
        // Foundry helper is handy for immutability
        return foundry.utils.deepClone(this._g);
    }

    /** Normalize an incoming graph object to the canonical structure */
    static from(graph) {
        const g = foundry.utils.deepClone(graph ?? {});
        const b = new GraphBuilder({
            id: g.id,
            name: g.name,
            desc: g.desc,
            graphType: g.graphType ?? "custom",
            width: g.width ?? 800,
            height: g.height ?? 600,
            background: g.background,
            relations: g.relations,
        });
        // permissions
        if (g.permissions) b.setPermissions(g.permissions);
        // nodes/links
        return b;
    }
}
