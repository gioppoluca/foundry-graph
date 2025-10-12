// Base class for D3 renderers
export class BaseRenderer {
    static ID = "base";
    /**
     * @param {d3.Selection<SVGSVGElement, unknown, null, undefined>} svg
     * @param {{nodes: any[], links: any[]}} data  Normalized data
     * @param {object} ctx                         Rendering context & hooks
     *  - width, height, background
     *  - relations: Relation[] chosen for this graph instance
     *  - onRightClickNode(node)
     *  - onRightClickLink(link)
     *  - linking: { enabled, source, onSelect(node) }
     */
    render(svg, data, ctx) { throw new Error("BaseRenderer.render must be implemented"); }
  }