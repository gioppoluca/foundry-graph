// image-slots-renderer.js
import { log, safeUUID } from "../constants.js";
import { BaseRenderer } from "./base-renderer.js";
const { DialogV2 } = foundry.applications.api;

/**
 * ImageSlotsRenderer
 *
 * Renders nodes on top of a background image with configurable "slots"
 * (drop areas). Nodes dragged into a slot will snap to its center and
 * store slotId on the node.
 *
 * Expected config on the graph object:
 *
 * graph.rendererOptions = {
 *   backgroundImage: "modules/foundry-graph/img/background.png",
 *   slots: [
 *     {
 *       id: "slot-1",
 *       label: "Slot 1",
 *       x: 0.10, y: 0.08,   // normalized [0..1] relative to image width/height
 *       w: 0.20, h: 0.10,
 *       maxNodes: 1,
 *       allowedNodeTypes: ["Actor", "Item"]
 *     },
 *     ...
 *   ]
 * }
 */
export class ImageSlotsRenderer extends BaseRenderer {
    static ID = "imageSlots";

    constructor() {
        super();
        // Linking state (same semantics as ForceRenderer)
        this._linkingMode = false;
        this._linkSourceNode = null;
        this.relation = null;

        // Graph + SVG
        this.graph = null;
        this._svg = null;

        // Zoom state (mirrors ForceRenderer so zoom is consistent)
        this._zoomBehavior = null;
        this._zoomLayer = null;
        this._currentTransform = null;

        // Image + slots
        this._backgroundImagePath = null;
        this._imageWidth = 0;
        this._imageHeight = 0;
        this._slots = [];

        // D3 selections we reuse on re-render
        this._slotRectSelection = null;
        this._slotLabelSelection = null;
        this._nodeSelection = null;
        this._nodeLabelSelection = null;
        this._linkSelection = null;
        this._linkLabelSelection = null;
    }

    /** Short help text, similar to ForceRenderer.instructions */
    get instructions() {
        return `
    <b>Drag</b>: Move nodes and drop them into slots<br>
    <b>Shift + Click</b> (when linking mode is enabled): Link nodes<br>
    <b>Scroll</b>: Zoom<br>
    <b>DblClick</b>: Open sheet<br>
    <b>Right Click</b>: Delete node or link
  `;
    }

    initializeGraphData() {
        return {
            nodes: [],
            links: []
        };
    }

    /**
     * Return a clean, serializable graph payload.
     * We keep only IDs for link endpoints and basic node fields,
     * including slotId/x/y.
     */
    getGraphData() {
        const data = this.graph?.data || { nodes: [], links: [] };
        const nodes = data.nodes ?? [];
        const links = data.links ?? [];

        return {
            nodes: nodes.map(n => ({
                id: n.id,
                uuid: n.uuid,
                label: n.label,
                type: n.type,
                img: n.img,
                slotId: n.slotId,
                x: n.x,
                y: n.y
            })),
            links: links.map(l => {
                const sourceId = typeof l.source === "object" ? l.source.id : l.source;
                const targetId = typeof l.target === "object" ? l.target.id : l.target;
                return {
                    id: l.id,
                    source: sourceId,
                    target: targetId,
                    relationId: l.relationId,
                    label: l.label,
                    color: l.color,
                    style: l.style,
                    noArrow: l.noArrow === true || l.noArrow === "true",
                    strokeWidth: l.strokeWidth
                };
            })
        };
    }

    teardown() {
        log("ImageSlotsRenderer.teardown");
        if (this._svg) {
            this._detachDropHandlers(this._svg.node());
            this._svg.selectAll("*").interrupt().remove();
            this._svg = null;
        }
        this.graph = null;
        this._linkingMode = false;
        this._linkSourceNode = null;
        this.relation = null;

        this._zoomBehavior = null;
        this._zoomLayer = null;
        this._currentTransform = null;

        this._slotRectSelection = null;
        this._slotLabelSelection = null;
        this._nodeSelection = null;
        this._nodeLabelSelection = null;
        this._linkSelection = null;
        this._linkLabelSelection = null;
    }

    /**
     * Main render entry point.
     */
    render(svg, graph, ctx) {
        if (!this.graph) this.graph = graph;
        const renderGraph = this.graph;
        log("ImageSlotsRenderer.render", svg, renderGraph, ctx);

        if (!this._svg) this._svg = svg;

        // Base canvas size
        const width = renderGraph.width || ctx?.width || 1024;
        const height = renderGraph.height || ctx?.height || 768;

        // Background now comes from the graph metadata (same idea as ForceRenderer)
        const bg = renderGraph.background || {};
        this._backgroundImagePath =
            bg.image || "modules/foundry-graph/img/background-placeholder.png";

        // Slots are now stored directly on the graph (GraphBuilder copies them
        // from the graph-type at creation time, and they are persisted in JSON).
        this._slots = Array.isArray(renderGraph.slots) ? renderGraph.slots : [];

        // Initial zoom setup (same pattern as ForceRenderer)
        if (!this._zoomBehavior) {
            log("ImageSlotsRenderer: First render, setting up zoom.");

            this._zoomBehavior = d3.zoom().on("zoom", (event) => {
                this._currentTransform = event.transform;
                if (this._zoomLayer) {
                    this._zoomLayer.attr("transform", this._currentTransform);
                }
            });

            this._svg
                .attr("width", width)
                .attr("height", height)
                .attr("viewBox", `0 0 ${width} ${height}`)
                .call(this._zoomBehavior);

            this._svg.selectAll("*").remove();
            this._zoomLayer = this._svg.append("g").classed("zoom-layer", true);

            this._currentTransform = d3.zoomIdentity;

            let el = document.querySelector("#d3-graph") || this._svg.node();
            this._detachDropHandlers(el);
            this._attachDropHandlers(el);
        } else {
            // Re-render: clear contents but keep zoom
            this._zoomLayer.selectAll("*").remove();
            this._zoomLayer.attr("transform", this._currentTransform);
        }

        const zoomLayer = this._zoomLayer;

        // --- defs for arrow + link label shadow (copied from ForceRenderer) ---
        let defs = this._svg.select("defs");
        if (defs.empty()) {
            defs = this._svg.append("defs");
        }

        defs.append("marker")
            .attr("id", "fg-arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 30)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "context-stroke");

        const shadow = defs.append("filter")
            .attr("id", "link-label-shadow")
            .attr("filterUnits", "objectBoundingBox")
            .attr("x", -0.5)
            .attr("y", -0.5)
            .attr("width", 2)
            .attr("height", 2);

        shadow.append("feGaussianBlur")
            .attr("in", "SourceAlpha")
            .attr("stdDeviation", 2);

        shadow.append("feOffset")
            .attr("dx", 1)
            .attr("dy", 1)
            .attr("result", "offsetblur");

        const feMerge = shadow.append("feMerge");
        feMerge.append("feMergeNode").attr("in", "offsetblur");
        feMerge.append("feMergeNode").attr("in", "SourceGraphic");

        // --- Background image (fills the SVG) ---
        const bgWidth = bg.width || width;
        const bgHeight = bg.height || height;

        // These are the reference size for normalized slot coords
        this._imageWidth = bgWidth;
        this._imageHeight = bgHeight;

        zoomLayer.append("image")
            .attr("href", this._backgroundImagePath)
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", bgWidth)
            .attr("height", bgHeight)
            .attr("preserveAspectRatio", "xMidYMid meet");

        // --- Slot overlays ---
        const slotLayer = zoomLayer.append("g").attr("class", "slots");
        this._slotRectSelection = slotLayer.selectAll("rect")
            .data(this._slots, z => z.id)
            .join("rect")
            .attr("class", "fg-slot-rect")
            .attr("fill", "rgba(0,0,0,0.15)")
            .attr("stroke", "rgba(255,255,255,0.5)")
            .attr("stroke-dasharray", "4 4")
            .attr("rx", 4)
            .attr("ry", 4);

        this._slotLabelSelection = slotLayer.selectAll("text")
            .data(this._slots, z => z.id)
            .join("text")
            .attr("class", "fg-slot-label")
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("fill", "rgba(255,255,255,0.8)")
            .attr("font-size", 10)
            .text(z => z.label ?? z.id);

        // --- Links + link labels ---
        const linkLayer = zoomLayer.append("g").attr("class", "links");
        const linkLabelLayer = zoomLayer.append("g").attr("class", "link-labels");

        const nodes = renderGraph.data.nodes ?? [];
        const links = renderGraph.data.links ?? [];

        // normalized => pixels
        this._updateSlotPositions();

        // links use IDs; build a map
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const linkData = links.map(l => {
            const sourceId = typeof l.source === "object" ? l.source.id : l.source;
            const targetId = typeof l.target === "object" ? l.target.id : l.target;
            return {
                ...l,
                source: sourceId,
                target: targetId,
                _sourceNode: nodeMap.get(sourceId),
                _targetNode: nodeMap.get(targetId)
            };
        });

        this._linkSelection = linkLayer.selectAll("line")
            .data(linkData, d => d.id)
            .join("line")
            .attr("class", "fg-link")
            .attr("stroke", d => d.color || "#000")
            .style("stroke-dasharray", d => {
                if (d.style === "dashed") return "4 4";
                if (d.style === "dotted") return "2 4";
                return "0";
            })
            .attr("stroke-width", d => d.strokeWidth || 2)
            .attr("marker-end", d => {
                const noArrow = d.noArrow === true || d.noArrow === "true";
                return noArrow ? null : "url(#fg-arrow)";
            })
            .on("contextmenu", (event, d) => {
                event.preventDefault();
                this._onRightClickLink(d);
            });

        this._linkLabelSelection = linkLabelLayer.selectAll("text")
            .data(linkData, d => d.id)
            .join("text")
            .attr("class", "fg-link-label")
            .attr("font-size", 12)
            .attr("fill", d => d.color || "#000")
            .attr("text-anchor", "middle")
            .attr("filter", "url(#link-label-shadow)")
            .text(d => d.label || d.type || "");

        // --- Nodes + labels ---
        const nodeLayer = zoomLayer.append("g").attr("class", "nodes");
        const nodeLabelLayer = zoomLayer.append("g").attr("class", "node-labels");

        const drag = d3.drag()
            .on("start", (event, d) => this._onDragStart(event, d))
            .on("drag", (event, d) => this._onDrag(event, d))
            .on("end", (event, d) => this._onDragEnd(event, d));

        this._nodeSelection = nodeLayer.selectAll("image")
            .data(nodes, d => d.id)
            .join("image")
            .attr("class", "fg-node")
            .attr("xlink:href", d => d.img)
            .attr("width", 64)
            .attr("height", 64)
            .attr("clip-path", "circle(32px at center)")
            .call(drag)
            .on("click", async (event, d) => {
                event.preventDefault();
                if (this._linkingMode) {
                    // Linking mode: same behavior as ForceRenderer
                    if (!this._linkSourceNode) {
                        this._linkSourceNode = d;
                        ui.notifications.info(`Selected source node: ${d.label}`);
                    } else {
                        const source = this._linkSourceNode;
                        const target = d;

                        const alreadyLinked = renderGraph.data.links.some(l =>
                            ((typeof l.source === "object" ? l.source.id : l.source) === source.id &&
                                (typeof l.target === "object" ? l.target.id : l.target) === target.id) ||
                            ((typeof l.source === "object" ? l.source.id : l.source) === target.id &&
                                (typeof l.target === "object" ? l.target.id : l.target) === source.id)
                        );

                        if (!alreadyLinked && source.id !== target.id) {
                            const relation = this.relation;
                            if (!relation) {
                                ui.notifications.warn("Please select a valid relation type before creating the link.");
                                return;
                            }
                            const newLink = {
                                id: safeUUID(),
                                source: source.id,
                                target: target.id,
                                relationId: relation.id,
                                label: relation.label,
                                color: relation.color,
                                style: relation.style,
                                noArrow: relation?.noArrow || false,
                                strokeWidth: relation.strokeWidth
                            };
                            renderGraph.data.links.push(newLink);
                            ui.notifications.info(`Linked ${source.label} → ${target.label} (${relation.label})`);
                            this.render(this._svg, this.graph, ctx);
                        } else {
                            ui.notifications.warn("Invalid or duplicate link");
                        }
                        this._linkSourceNode = null;
                    }
                } else {
                    // Normal click: open sheet
                    ui.notifications.info(`Clicked node: ${d.label}`);
                    if (d.uuid) {
                        fromUuid(d.uuid).then(doc => {
                            if (doc?.sheet) doc.sheet.render(true);
                            else ui.notifications.warn("No document found for UUID");
                        });
                    }
                }
            })
            .on("contextmenu", (event, d) => {
                event.preventDefault();
                this._onRightClickNode(d);
            })
            .on("dblclick", (event, d) => {
                event.preventDefault();
                ui.notifications.info(`Double-clicked node: ${d.label}`);
                if (d.uuid) {
                    fromUuid(d.uuid).then(doc => {
                        if (doc?.sheet) doc.sheet.render(true);
                        else ui.notifications.warn("No document found for UUID");
                    });
                }
            });

        this._nodeLabelSelection = nodeLabelLayer.selectAll("text")
            .data(nodes, d => d.id)
            .join("text")
            .attr("class", "fg-node-label")
            .attr("font-size", 12)
            .attr("fill", renderGraph?.nodeLabelColor || "#000")
            .attr("text-anchor", "middle")
            .text(d => d.label || d.id);

        // Final position update (slots + links + labels)
        this._updateNodeAndLinkPositions();

        log("ImageSlotsRenderer.render complete");
    }

    /**
     * Given current image size, convert normalized slot coords to pixels.
     */
    _updateSlotPositions() {
        const W = this._imageWidth || 1;
        const H = this._imageHeight || 1;

        if (this._slotRectSelection) {
            this._slotRectSelection
                .attr("x", z => z.x * W)
                .attr("y", z => z.y * H)
                .attr("width", z => z.w * W)
                .attr("height", z => z.h * H);
        }

        if (this._slotLabelSelection) {
            this._slotLabelSelection
                .attr("x", z => (z.x + z.w / 2) * W)
                .attr("y", z => (z.y + z.h / 2) * H);
        }
    }

    /**
     * Resolve the "visual" position of a node:
     * - If it has slotId and the slot exists, return the slot center.
     * - Otherwise use node.x / node.y or center of the canvas as fallback.
     */
    _getNodePosition(node) {
        const W = this._imageWidth || 1;
        const H = this._imageHeight || 1;

        if (node.slotId && this._slots?.length) {
            const slot = this._slots.find(z => z.id === node.slotId);
            if (slot) {
                const cx = (slot.x + slot.w / 2) * W;
                const cy = (slot.y + slot.h / 2) * H;
                return [cx, cy];
            }
        }

        const x = (typeof node.x === "number") ? node.x : W / 2;
        const y = (typeof node.y === "number") ? node.y : H / 2;
        return [x, y];
    }

    _findSlotAt(x, y) {
        const W = this._imageWidth || 1;
        const H = this._imageHeight || 1;

        return this._slots.find(z => {
            const zx = z.x * W;
            const zy = z.y * H;
            const zw = z.w * W;
            const zh = z.h * H;
            return x >= zx && x <= zx + zw && y >= zy && y <= zy + zh;
        }) || null;
    }

    _canDropInSlot(node, slot) {
        const allowedTypes = slot.allowedNodeTypes;
        if (Array.isArray(allowedTypes) && allowedTypes.length > 0) {
            const nodeType = node.type || node.data?.type;
            if (!allowedTypes.includes(nodeType)) {
                return false;
            }
        }

        if (typeof slot.maxNodes === "number") {
            const count = (this.graph?.data?.nodes ?? []).filter(n => n.slotId === slot.id).length;
            // allow node to stay if it's already in this slot
            if (count >= slot.maxNodes && node.slotId !== slot.id) {
                return false;
            }
        }

        return true;
    }

    _updateNodeAndLinkPositions() {
        if (!this.graph) return;
        const nodes = this.graph.data.nodes ?? [];
        const W = this._imageWidth || 1;
        const H = this._imageHeight || 1;

        // Normalize node positions based on slots where needed
        for (const n of nodes) {
            const [x, y] = this._getNodePosition(n);
            n.x = x;
            n.y = y;
        }

        if (this._nodeSelection) {
            this._nodeSelection
                .attr("x", d => d.x - 32)
                .attr("y", d => d.y - 32);
        }

        if (this._nodeLabelSelection) {
            this._nodeLabelSelection
                .attr("x", d => d.x)
                .attr("y", d => d.y + 40);
        }

        const links = this.graph.data.links ?? [];
        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        if (this._linkSelection) {
            this._linkSelection
                .attr("x1", d => {
                    const src = nodeMap.get(d.source);
                    return src ? src.x : W / 2;
                })
                .attr("y1", d => {
                    const src = nodeMap.get(d.source);
                    return src ? src.y : H / 2;
                })
                .attr("x2", d => {
                    const tgt = nodeMap.get(d.target);
                    return tgt ? tgt.x : W / 2;
                })
                .attr("y2", d => {
                    const tgt = nodeMap.get(d.target);
                    return tgt ? tgt.y : H / 2;
                });
        }

        if (this._linkLabelSelection) {
            this._linkLabelSelection
                .attr("x", d => {
                    const src = nodeMap.get(d.source);
                    const tgt = nodeMap.get(d.target);
                    if (!src || !tgt) return W / 2;
                    return (src.x + tgt.x) / 2;
                })
                .attr("y", d => {
                    const src = nodeMap.get(d.source);
                    const tgt = nodeMap.get(d.target);
                    if (!src || !tgt) return H / 2;
                    return (src.y + tgt.y) / 2;
                });
        }
    }

    _onDragStart(event, d) {
        event.sourceEvent.stopPropagation();
    }

    _onDrag(event, d) {
        d.x = event.x;
        d.y = event.y;
        // While dragging, "detach" from slot (will re-evaluate on drop)
        d.slotId = null;
        this._updateNodeAndLinkPositions();
    }

    _onDragEnd(event, d) {
        const [x, y] = [event.x, event.y];
        const slot = this._findSlotAt(x, y);
        if (slot && this._canDropInSlot(d, slot)) {
            d.slotId = slot.id;
            const [sx, sy] = this._getNodePosition(d);
            d.x = sx;
            d.y = sy;
        }
        this._updateNodeAndLinkPositions();
    }

    addNode(graph, { id, label, type, img, uuid, x, y }) {
        log("ImageSlotsRenderer.addNode", graph, id, label, type, img, uuid, x, y);
        if (!this.graph) this.graph = graph;
        if (!this.graph.data) this.graph.data = { nodes: [], links: [] };

        this.graph.data.nodes.push({
            id,
            uuid,
            label,
            type,
            img,
            x,
            y,
            slotId: null
        });
    }

    setLinkingMode(enabled) {
        this._linkingMode = enabled;
    }

    setRelationData(relation) {
        this.relation = relation;
    }

    async _onRightClickNode(nodeData) {
        log("ImageSlotsRenderer._onRightClickNode", nodeData);
        const confirmed = await DialogV2.confirm({
            content: `Delete node "${nodeData.label || nodeData.id}"?`,
        });
        if (confirmed) {
            this.graph.data.nodes = this.graph.data.nodes.filter(n => n.id !== nodeData.id);
            this.graph.data.links = (this.graph.data.links ?? []).filter(l => {
                const srcId = typeof l.source === "object" ? l.source.id : l.source;
                const tgtId = typeof l.target === "object" ? l.target.id : l.target;
                return srcId !== nodeData.id && tgtId !== nodeData.id;
            });
            this.render(this._svg, this.graph, {});
        }
    }

    async _onRightClickLink(linkData) {
        log("ImageSlotsRenderer._onRightClickLink", linkData);
        const srcLabel = linkData.source?.label || linkData.source?.id || linkData.source;
        const tgtLabel = linkData.target?.label || linkData.target?.id || linkData.target;

        const confirmed = await DialogV2.confirm({
            content: `Delete link from "${srcLabel}" to "${tgtLabel}"?`,
        });
        if (confirmed) {
            this.graph.data.links = (this.graph.data.links ?? []).filter(l => l !== linkData);
            this.render(this._svg, this.graph, {});
        }
    }

    /**
     * Drop handler used via BaseRenderer._attachDropHandlers
     */
    async _onDrop(event) {
        log("ImageSlotsRenderer._onDrop");
        const data = TextEditor.getDragEventData(event);
        log(data);

        const allowed = this.graph?.allowedEntities;
        if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(data.type)) {
            ui.notifications.warn(`You cannot add a ${data.type} on this graph type.`);
            return;
        }

        const zoomLayerNode = this._svg.select("g.zoom-layer").node();
        if (!zoomLayerNode) {
            log("ImageSlotsRenderer: Could not find zoom layer!");
            return;
        }

        const [x, y] = d3.pointer(event, zoomLayerNode);
        log("Drop position (transformed):", x, y);

        const newId = safeUUID();

        switch (data.type) {
            case "Actor": {
                const actor = await fromUuid(data.uuid);
                if (!actor) {
                    ui.notifications.warn("Could not find actor");
                    return;
                }
                this.addNode(this.graph, {
                    id: newId,
                    uuid: data.uuid,
                    label: actor.name,
                    type: "Actor",
                    img: actor.img,
                    x,
                    y
                });
                ui.notifications.info(`Added node for actor: ${actor.name}`);
                break;
            }
            case "JournalEntryPage": {
                const page = await fromUuid(data.uuid);
                if (!page) {
                    ui.notifications.warn("Could not find page");
                    return;
                }
                this.addNode(this.graph, {
                    id: newId,
                    uuid: data.uuid,
                    label: page.name,
                    type: "JournalEntryPage",
                    img: "modules/foundry-graph/img/journal.png",
                    x,
                    y
                });
                ui.notifications.info(`Added node for page: ${page.name}`);
                break;
            }
            case "Scene": {
                const scene = await fromUuid(data.uuid);
                if (!scene) {
                    ui.notifications.warn("Could not find scene");
                    return;
                }
                this.addNode(this.graph, {
                    id: newId,
                    uuid: data.uuid,
                    label: scene.name,
                    type: "Scene",
                    img: "modules/foundry-graph/img/mappin.png",
                    x,
                    y
                });
                ui.notifications.info(`Added node for scene: ${scene.name}`);
                break;
            }
            case "Item": {
                const item = await fromUuid(data.uuid);
                if (!item) {
                    ui.notifications.warn("Could not find item");
                    return;
                }
                this.addNode(this.graph, {
                    id: newId,
                    uuid: data.uuid,
                    label: item.name,
                    type: "Item",
                    img: item.img,
                    x,
                    y
                });
                ui.notifications.info(`Added node for item: ${item.name}`);
                break;
            }
            default: {
                ui.notifications.warn(`Dropping ${data.type} on this graph is not yet supported.`);
                return;
            }
        }

        // After adding a node, re-render to show it
        this.render(this._svg, this.graph, {});
    }

    hasEntity(graphData, uuid) {
        log("ImageSlotsRenderer.hasEntity", graphData, uuid);
        return graphData.data.nodes.some(n => n.uuid === uuid);
    }

    removeEntity(graphData, uuid) {
        const graph = foundry.utils.deepClone(graphData);
        let nodes = graph.data?.nodes;
        let links = graph.data?.links;
        if (!nodes) return graph;

        const nodesToRemove = nodes.filter(n => n.uuid === uuid);
        if (nodesToRemove.length === 0) return graph;

        const nodeIdsToRemove = new Set(nodesToRemove.map(n => n.id));

        const cleanNodes = nodes.filter(n => n.uuid !== uuid);
        const cleanLinks = (links || []).filter(l => {
            const srcId = typeof l.source === "object" ? l.source.id : l.source;
            const tgtId = typeof l.target === "object" ? l.target.id : l.target;
            return !nodeIdsToRemove.has(srcId) && !nodeIdsToRemove.has(tgtId);
        });

        graph.data.nodes = cleanNodes;
        graph.data.links = cleanLinks;
        return graph;
    }
}
