// scripts/models/foundry-graph.js
// A lightweight model for the canonical graph JSON stored in the Foundry world.
// Schema (saved to settings):
// {
//   id: string,
//   name: string,
//   description: string,
//   graphtype: string,            // style id
//   version: number,              // schema version
//   metadata: {
//     width: number,
//     height: number,
//     background?: string|null,
//     relations?: Array<{ id:string, label:string, arrow?:boolean }>
//   },
//   graphData: { /* opaque, renderer-owned */ }
// }

/** @typedef {{ id:string, label:string, arrow?:boolean }} Relation */

export class FoundryGraph {
    /** Increment when structure expectations change. */
    static CURRENT_VERSION = 1;
  
    /**
     * Create a new FoundryGraph.
     * @param {object} params
     * @param {string} params.id
     * @param {string} params.name
     * @param {string} [params.description]
     * @param {string} params.graphtype
     * @param {number} [params.version]
     * @param {{width:number,height:number,background?:string|null,relations?:Relation[]}} params.metadata
     * @param {object} [params.graphData]
     */
    constructor(params) {
      this.id = String(params.id ?? "");
      this.name = String(params.name ?? "");
      this.description = String(params.description ?? "");
      this.graphtype = String(params.graphtype ?? "");
      this.version = Number(params.version ?? FoundryGraph.CURRENT_VERSION);
  
      const md = params.metadata ?? {};
      this.metadata = {
        width: FoundryGraph.#toPosInt(md.width, 1200),
        height: FoundryGraph.#toPosInt(md.height, 800),
        background: md.background ?? null,
        relations: Array.isArray(md.relations) ? md.relations.map(FoundryGraph.#sanitizeRelation) : []
      };
  
      // Renderer-owned payload; keep as-is.
      this.graphData = FoundryGraph.#isPlainObject(params.graphData) ? params.graphData : {};
  
      // Validate at construction time to keep instances sane.
      const errors = this.validate();
      if (errors.length) {
        throw new Error(`Invalid FoundryGraph: \n- ${errors.join("\n- ")}`);
      }
    }
  
    /** Build from any supported shape, migrating as needed. */
    static from(obj, { styleDefaults } = {}) {
      if (obj instanceof FoundryGraph) return obj.clone();
      const migrated = FoundryGraph.migrate(obj, { styleDefaults });
      return new FoundryGraph(migrated);
    }
  
    /**
     * Migrate legacy objects to the canonical schema.
     * Accepted inputs:
     * 1) Canonical shape (passes through)
     * 2) Our previous split { base, metadata, graphData }
     * 3) Old flat shape { id,name,desc,graphType,width,height,background?,relations?,nodes?,links? }
     * @param {any} src
     * @param {{ styleDefaults?: (graphtype:string)=>({background?:string|null, relations?:Relation[]}|undefined) }} opts
     * @returns {any} canonical object (plain)
     */
    static migrate(src, { styleDefaults } = {}) {
      // Already canonical
      if (src && src.id && src.metadata && src.graphData && src.graphtype) {
        const o = FoundryGraph.#clone(src);
        o.version = Number(o.version ?? FoundryGraph.CURRENT_VERSION);
        // Ensure required metadata fields
        o.metadata.width = FoundryGraph.#toPosInt(o.metadata.width, 1200);
        o.metadata.height = FoundryGraph.#toPosInt(o.metadata.height, 800);
        if (!Array.isArray(o.metadata.relations)) {
          const def = styleDefaults?.(String(o.graphtype)) ?? {};
          o.metadata.relations = FoundryGraph.#clone(def.relations ?? []);
        }
        if (!("background" in o.metadata)) {
          const def = styleDefaults?.(String(o.graphtype)) ?? {};
          o.metadata.background = def.background ?? null;
        }
        return o;
      }
  
      // Previous split { base, metadata, graphData }
      if (src && src.base && src.metadata && src.graphData) {
        const style = styleDefaults?.(String(src.base.graphType ?? src.base.graphtype)) ?? {};
        return {
          id: src.base.id,
          name: src.base.name,
          description: src.base.desc ?? src.base.description ?? "",
          graphtype: src.base.graphType ?? src.base.graphtype,
          version: Number(src.version ?? FoundryGraph.CURRENT_VERSION),
          metadata: {
            width: FoundryGraph.#toPosInt(src.metadata.width, 1200),
            height: FoundryGraph.#toPosInt(src.metadata.height, 800),
            background: src.metadata.background ?? style.background ?? null,
            relations: Array.isArray(src.metadata.relations) ? src.metadata.relations : FoundryGraph.#clone(style.relations ?? [])
          },
          graphData: FoundryGraph.#isPlainObject(src.graphData) ? FoundryGraph.#clone(src.graphData) : {}
        };
      }
  
      // Legacy flat
      if (src && (src.graphType || src.graphtype)) {
        const gt = String(src.graphType ?? src.graphtype);
        const style = styleDefaults?.(gt) ?? {};
        const nodes = Array.isArray(src.nodes) ? src.nodes : undefined;
        const links = Array.isArray(src.links) ? src.links : undefined;
        const graphData = {};
        if (nodes) graphData.nodes = FoundryGraph.#clone(nodes);
        if (links) graphData.links = FoundryGraph.#clone(links);
        return {
          id: src.id,
          name: src.name,
          description: src.desc ?? src.description ?? "",
          graphtype: gt,
          version: Number(src.version ?? FoundryGraph.CURRENT_VERSION),
          metadata: {
            width: FoundryGraph.#toPosInt(src.width, 1200),
            height: FoundryGraph.#toPosInt(src.height, 800),
            background: src.background ?? style.background ?? null,
            relations: Array.isArray(src.relations) ? src.relations : FoundryGraph.#clone(style.relations ?? [])
          },
          graphData
        };
      }
  
      throw new Error("Unsupported graph format");
    }
  
    /** Plain JSON for settings storage */
    toJSON() {
      return {
        id: this.id,
        name: this.name,
        description: this.description,
        graphtype: this.graphtype,
        version: this.version,
        metadata: FoundryGraph.#clone(this.metadata),
        graphData: FoundryGraph.#clone(this.graphData)
      };
    }
  
    /** Deep clone as another instance */
    clone() { return new FoundryGraph(this.toJSON()); }
  
    /** Return a new instance with shallow patching (deeply merges metadata & graphData). */
    with(patch = {}) {
      const base = this.toJSON();
      if (patch.metadata) base.metadata = { ...base.metadata, ...patch.metadata };
      if (patch.graphData) base.graphData = FoundryGraph.#deepMerge(base.graphData, patch.graphData);
      for (const k of ["id","name","description","graphtype","version"]) {
        if (k in patch) base[k] = patch[k];
      }
      return new FoundryGraph(base);
    }
  
    /** Update only metadata */
    withMetadata(p) { return this.with({ metadata: p }); }
    /** Replace graphData entirely (renderer decides shape) */
    withGraphData(data) { return this.with({ graphData: data }); }
  
    /** Ensure defaults from a style (background, relations). */
    ensureStyleDefaults(style = {}) {
      const md = { ...this.metadata };
      if (md.background == null && style.background != null) md.background = style.background;
      if (!Array.isArray(md.relations) || md.relations.length === 0) md.relations = FoundryGraph.#clone(style.relations ?? []);
      return this.with({ metadata: md });
    }
  
    /** Validate fields; returns an array of error strings (empty if ok). */
    validate() {
      const errs = [];
      if (!this.id || typeof this.id !== "string") errs.push("id must be a non-empty string");
      if (typeof this.name !== "string") errs.push("name must be a string");
      if (!this.graphtype || typeof this.graphtype !== "string") errs.push("graphtype must be a non-empty string");
  
      const { width, height, relations } = this.metadata ?? {};
      if (!Number.isFinite(width) || width <= 0) errs.push("metadata.width must be a positive number");
      if (!Number.isFinite(height) || height <= 0) errs.push("metadata.height must be a positive number");
  
      if (relations != null) {
        if (!Array.isArray(relations)) errs.push("metadata.relations must be an array");
        else {
          for (const [i, r] of relations.entries()) {
            if (!r || typeof r.id !== "string" || typeof r.label !== "string") {
              errs.push(`metadata.relations[${i}] must have string id and label`);
            }
          }
        }
      }
  
      if (!FoundryGraph.#isPlainObject(this.graphData)) errs.push("graphData must be a plain object");
      return errs;
    }
  
    // -------------------- utils --------------------
    static #clone(v) {
      if (typeof structuredClone === "function") return structuredClone(v);
      return JSON.parse(JSON.stringify(v));
    }
  
    static #isPlainObject(o) {
      return !!o && typeof o === "object" && (o.constructor === Object || Object.getPrototypeOf(o) === null);
    }
  
    static #toPosInt(v, def) {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : def;
    }
  
    static #sanitizeRelation(r) {
      if (!r) return { id: "", label: "" };
      return { id: String(r.id ?? ""), label: String(r.label ?? ""), arrow: Boolean(r.arrow) };
    }
  
    static #deepMerge(a, b) {
      if (!FoundryGraph.#isPlainObject(a)) return FoundryGraph.#clone(b);
      if (!FoundryGraph.#isPlainObject(b)) return FoundryGraph.#clone(a);
      const out = { ...a };
      for (const [k, v] of Object.entries(b)) {
        out[k] = (FoundryGraph.#isPlainObject(v)) ? FoundryGraph.#deepMerge(a[k], v) : FoundryGraph.#clone(v);
      }
      return out;
    }
  }
  
  export default FoundryGraph;
  