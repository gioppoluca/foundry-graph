import { GRAPH_SCHEMA_VERSION, safeUUID } from "../constants.js";
export function migrateGraph(graph, graphTypes = {}) {
  // Defensive copy if you prefer immutability
  const g = graph;

  // ---- Ensure version fields exist
  if (typeof g.schemaVersion !== "number") g.schemaVersion = 0;

  // ---- Schema migrations (step-by-step)
  while (g.schemaVersion < GRAPH_SCHEMA_VERSION) {
    if (g.schemaVersion === 0) {
      // v0 -> v1 example: ensure fields exist
      //      if (!g.data) g.data = {};
      //      if (!Array.isArray(g.nodes)) g.nodes = g.nodes ?? [];     // if you use nodes
      //      if (!Array.isArray(g.links)) g.links = g.links ?? [];     // if you use links
      // geneaology graphs likely store inside g.data.{persons,unions,links}

      // Ensure theme exists for graphs that predate "themes"
      if (!g.theme) {
        const typeCfg = graphTypes[g.graphType] ?? {};
        const themes = Array.isArray(typeCfg.themes) ? typeCfg.themes : null;
        if (themes && themes.length > 0) {
          g.theme = themes[0].id;
        } else {
          g.theme = null; // unknown / legacy
        }
      }

      g.schemaVersion = 1;
      continue;
    }

    // Future:
    // if (g.schemaVersion === 1) { ...; g.schemaVersion = 2; continue; }

    // Safety fallback
    break;
  }

  // ---- Graph type version sync + optional type-migration
  const gt = graphTypes?.[g.graphType];
  const currentTypeVersion = gt?.version ?? 0;

  if (typeof g.graphTypeVersion !== "number") {
    g.graphTypeVersion = currentTypeVersion;
  }

  // If type has advanced, you can:
  // 1) silently update g.graphTypeVersion and apply fixes
  // 2) or store a mismatch and warn user
  if (g.graphTypeVersion < currentTypeVersion) {
    // Minimal safe behavior: bump and apply non-breaking defaults
    // (Do NOT auto-change semantics unless you have explicit per-type migrations)
    g.graphTypeVersion = currentTypeVersion;

    // Example: if you introduced allowedEntities later, backfill it
    if (!Array.isArray(g.allowedEntities) && Array.isArray(gt?.allowedEntities)) {
      g.allowedEntities = gt.allowedEntities;
    }
  }

  // Backfill link.noArrow from relations if missing
  if (g?.data?.links && Array.isArray(g.relations)) {
    for (const link of g.data.links) {
      if (link.noArrow === undefined || link.noArrow === null) {
        const rel = g.relations.find(r => r.id === link.relationId);
        if (rel?.noArrow) {
          link.noArrow = true;
        }
      }
    }
  }

  // Ensure every link has a stable UUID id
  // (required for D3 keyed joins, deletion, rewiring, etc.)
  if (g?.data?.links && Array.isArray(g.data.links)) {
    for (const link of g.data.links) {
      if (!link.id) link.id = safeUUID();
    }
  }

  return g;
}
