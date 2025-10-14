import * as d3 from "../lib/d3.js";
import { BaseRenderer } from "./base-renderer.js";

export class ForceRenderer extends BaseRenderer {
  static ID = "force";

  render(svg, { nodes, links }, ctx) {
    const width = ctx.width ?? 1200;
    const height = ctx.height ?? 800;

    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    if (ctx.background) {
      svg.append("image")
        .attr("href", ctx.background)
        .attr("x", 0).attr("y", 0)
        .attr("width", width).attr("height", height)
        .attr("preserveAspectRatio", "xMidYMid slice");
    }

    const gZoom = svg.append("g");

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(120).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-250))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => (d.r ?? 24) + 8))
      .on("end", () => {
        // Simulation naturally stopped or finished
        console.debug("D3 simulation ended");
        sim.stop(); // ensures all timers are cleared
      });

    //ctx.setDisposer?.(() => sim.stop());
    // Define markers for directed relations (arrows)
    const markerId = `arrow-end-${crypto.randomUUID?.()}`;
    //defs.append("marker").attr("id", markerId) /* ... */;
    //link.attr("marker-end", d => (d.arrow ? `url(#${markerId})` : null));
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", markerId)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 14)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5");

    // Links
    const link = gZoom.append("g").attr("class", "links")
      .selectAll("line").data(links).enter().append("line")
      .attr("stroke-width", d => d.width ?? 2)
      .attr("marker-end", d => (d.arrow ? `url(#${markerId})` : null))
      .on("contextmenu", (ev, d) => { ev.preventDefault(); ctx.onRightClickLink?.(d); });

    // Link labels
    const linkLabel = gZoom.append("g").attr("class", "link-labels")
      .selectAll("text").data(links).enter().append("text")
      .attr("font-size", 12).attr("text-anchor", "middle")
      .text(d => d.label || d.type || "");

    // Nodes (image or circle)
    const node = gZoom.append("g").attr("class", "nodes")
      .selectAll("g").data(nodes).enter().append("g")
      .call(d3.drag()
        .on("start", (ev, d) => {
          if (!ev.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (ev, d) => {
        if (ctx?.linking?.enabled) ctx.linking.onSelect?.(d);
      })
      .on("contextmenu", (ev, d) => { ev.preventDefault(); ctx.onRightClickNode?.(d); });

    node.append(d => {
      if (d.img) {
        const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
        img.setAttribute("href", d.img);
        img.setAttribute("width", String(d.w ?? 48));
        img.setAttribute("height", String(d.h ?? 48));
        img.setAttribute("x", String(-(d.w ?? 48) / 2));
        img.setAttribute("y", String(-(d.h ?? 48) / 2));
        return img;
      }
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", String(d.r ?? 24));
      return c;
    });

    node.append("text").attr("y", d => (d.h ? (d.h / 2 + 14) : 30)).attr("text-anchor", "middle").text(d => d.label ?? d.name ?? d.id);

    svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", (ev) => { gZoom.attr("transform", ev.transform); }));

    sim.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      linkLabel
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);

      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
  }
}