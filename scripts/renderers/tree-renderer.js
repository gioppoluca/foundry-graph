import * as d3 from "../lib/d3.js";
import { BaseRenderer } from "./base-renderer.js";

/**
 * Minimal tree renderer. Expects data.links to define a single-root DAG.
 * If no clear root, picks the first node without incoming links.
 */
export class TreeRenderer extends BaseRenderer {
  static ID = "tree";

  render(svg, { nodes, links }, ctx) {
    const width = ctx.width ?? 1200;
    const height = ctx.height ?? 800;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const idToNode = new Map(nodes.map(n => [n.id, n]));
    const incoming = new Map(nodes.map(n => [n.id, 0]));
    for (const l of links) incoming.set(l.target.id ?? l.target, (incoming.get(l.target.id ?? l.target) || 0) + 1);
    const rootId = [...incoming.entries()].find(([_, c]) => c === 0)?.[0] ?? nodes[0]?.id;

    // Build hierarchy from links
    const childrenMap = new Map(nodes.map(n => [n.id, []]));
    for (const l of links) {
      const s = l.source.id ?? l.source; const t = l.target.id ?? l.target;
      childrenMap.get(s)?.push(idToNode.get(t));
    }
    const toHierarchy = (id) => ({ ...idToNode.get(id), children: childrenMap.get(id) });
    const root = d3.hierarchy(toHierarchy(rootId), d => d.children);

    const treeLayout = d3.tree().size([height - 40, width - 200]);
    treeLayout(root);

    const g = svg.append("g").attr("transform", "translate(100,20)");

    g.selectAll("path.link")
      .data(root.links())
      .enter().append("path")
      .attr("class", "link")
      .attr("fill", "none")
      .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x))
      .on("contextmenu", (ev, d) => { ev.preventDefault(); ctx.onRightClickLink?.(d); });

    const node = g.selectAll("g.node")
      .data(root.descendants())
      .enter().append("g").attr("class", "node")
      .attr("transform", d => `translate(${d.y},${d.x})`)
      .on("click", (ev, d) => { if (ctx?.linking?.enabled) ctx.linking.onSelect?.(d.data); })
      .on("contextmenu", (ev, d) => { ev.preventDefault(); ctx.onRightClickNode?.(d.data); });

    node.append("circle").attr("r", 10);
    node.append("text").attr("dy", 3).attr("x", 12).text(d => d.data.label ?? d.data.name ?? d.data.id);
  }
}