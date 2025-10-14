import BaseGraphType from "../base_graph_type.js";

/**
 * ForceGraphType
 * - storage: { id, name, type: "force", color?, data: { nodes[], links[] }, relations? }
 * - render:  expects { nodes[], links[] } compatible with force-renderer.js
 */
export default class ForceGraphType extends BaseGraphType {
  get_id() { return "force"; }
  get_name() { return "Force-Directed"; }

  toRenderData(storedGraph) {
    // Normalize stored shape. Expect storedGraph.data.{nodes,links}
    const data = storedGraph?.data ?? {};
    const nodes = Array.isArray(data.nodes) ? data.nodes.map(n => ({ ...n })) : [];
    const links = Array.isArray(data.links) ? data.links.map(l => ({ ...l })) : [];
    return { nodes, links };
  }

  toStorage({ graph, nodes, links }) {
    // Persist minimal data; carry top-level metadata (id, name, type, color, relations)
    const { id, name, type, color, relations, desc } = graph;
    return {
      id, name, type: type ?? "force", color, relations, desc,
      data: {
        nodes: nodes.map(n => ({
          id: n.id,
          label: n.label ?? n.id,
          group: n.group ?? 0,
          level: n.level ?? 1,
          img: n.img ?? undefined,
          // Persist x,y/fx,fy if you want layout to be sticky
          x: n.x, y: n.y, fx: n.fx, fy: n.fy
        })),
        links: links.map(l => ({
          id: l.id ?? `${l.source?.id ?? l.source}-${l.target?.id ?? l.target}`,
          source: (typeof l.source === "object" ? l.source.id : l.source),
          target: (typeof l.target === "object" ? l.target.id : l.target),
          strength: l.strength ?? 0.7,
          arrow: l.arrow ?? false
        }))
      }
    };
  }
}
