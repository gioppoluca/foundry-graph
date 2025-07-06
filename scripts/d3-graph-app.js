const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "foundry-graph";


export class D3GraphApp extends HandlebarsApplicationMixin(ApplicationV2) {

  _linkingMode = false;
  _linkSourceNode = null;
  static DEFAULT_OPTIONS = {
    id: "fgraph-form",
    position: {
      width: 600,
      height: 600
    },
    classes: ["fgraph", "fgraph-form"],
    window: {
      title: "Graph Title",
      resizable: true,
    },
    dragDrop: [{ dragSelector: '[data-drag="true"]', dropSelector: '.drop-zone' }],
    minimizable: false,
    resizable: false,
    submitOnChange: false,
    //        actions: {
    //           onChangeGraphName: GraphFormV2.onChangeGraphName
    //      },
    actions: {
      saveAction: D3GraphApp._saveGraph,
      loadAction: D3GraphApp._loadGraph,
      exportAction: D3GraphApp._exportGraph,
      linkNodes: D3GraphApp.toggleLinkingMode

    },
    closeOnSubmit: true
  };
  static PARTS = {
    body: {
      template: "modules/foundry-graph/templates/d3-graph-app.html"
    },
    footer: {
      template: "modules/foundry-graph/templates/d3-graph-buttons.html"
    }
  };

  constructor(options = {}) {
    super(options);
    this._graphTypeMetadata = options.graphTypeMetadata || {};
    this._svgWidth = options.width || 800;
    this._svgHeight = options.height || 600;
  }

  _onRender(context, options) {
    //      const html =  renderTemplate(this.options.template, this.getData());
    //this.element.querySelectorAll("export-btn").addEventListener("click", () => this._exportGraph());
    //this.element.querySelectorAll("save-btn").addEventListener("click", () => this._saveGraph());
    //this.element.querySelectorAll("load-btn").addEventListener("click", () => this._loadGraph());
    this._drawGraph(); // Safe async defer
    this.element.querySelector("#d3-graph").addEventListener("drop", this._onDrop.bind(this));
    //     return html;
  }

  _prepareContext(options) {
    return {
      ...super._prepareContext(options),
      relations: this._graphTypeMetadata.relations || []
    };
  }


  async _onDrop(event) {
    console.log("_onDrop")
    console.log(event)
    const data = TextEditor.getDragEventData(event);
    console.log(data)

    // Handle different data types
    switch (data.type) {
      // write your cases
      case "Actor":
        const actor = await fromUuid(data.uuid);
        if (!actor) {
          ui.notifications.warn("Could not find actor");
          return;
        }

        // Get mouse position relative to SVG
        const svg = this.element.querySelector("#d3-graph");
        const rect = svg.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Add new node
        const newId = crypto.randomUUID();
        this._nodes.push({
          id: newId,           // generic UUID
          uuid: data.uuid,     // foundry UUID
          label: actor.name,
          type: 'Actor',
          img: actor.img,
          fx: x,
          fy: y
        });

        this._drawGraph({ nodes: this._nodes, links: this._links });
        ui.notifications.info(`Added node for actor: ${actor.name}`);


      default:
        break;
    }

  }

  static toggleLinkingMode() {
    this._linkingMode = !this._linkingMode;
    this._linkSourceNode = null;
    ui.notifications.info(this._linkingMode ? "Linking mode ON" : "Linking mode OFF");
  }

  async inlineImages(svg) {
    const images = svg.querySelectorAll("image");
    for (const img of images) {
      const href = img.getAttribute("xlink:href");
      if (!href || href.startsWith("data:")) continue;

      try {
        const res = await fetch(href);
        const blob = await res.blob();
        const dataUrl = await this.blobToDataURL(blob);
        img.setAttribute("xlink:href", dataUrl);
      } catch (err) {
        console.warn("Could not embed image:", href, err);
      }
    }
  }

  blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  static async _loadGraph() {
    const saved = await game.settings.get("my-d3-graph-module", "graphData");
    if (!saved?.nodes) return;
    this._graphName = saved.name || "Unnamed";
    this._graphDescription = saved.description || "";
    this._graphTypes = saved.types || [];
    this._backgroundImage = saved.backthis._graphRelationTypes = this._graphTypeMetadata.relations || []; groundImage || "modules/foundry-graph/img/vampire.png";
    this._drawGraph(saved);
  }


  static async _saveGraph() {
    const api = game.modules.get("foundry-graph").api;
  
    const fullGraph = {
      id: this._graphId,
      name: this._graphName,
      desc: this._graphDescription,
      background: this._backgroundImage,
      color: this._graphColor,
      relations: this._graphRelations,
      width: this._graphWidth,
      height: this._graphHeight,
      nodes: this._nodes.map(n => ({
        id: n.id,
        label: n.label,
        img: n.img,
        uuid: n.uuid,
        fx: n.fx,
        fy: n.fy,
        type: n.type || null
      })),
      links: this._links.map(l => ({
        source: l.source.id || l.source,
        target: l.target.id || l.target,
        type: l.type,
        label: l.label
      }))
    };
  
    await api.upsertGraph(fullGraph);
    ui.notifications.info("Graph saved via API");
  }
  


  static async _exportGraph() {
    console.log("_exportGraph")
    const svg = this.element.querySelector("#d3-graph");
    if (!svg) {
      ui.notifications.error("SVG element not found");
      return;
    }

    await this.inlineImages(svg); // Inline external images as data URIs

    const serializer = new XMLSerializer();
    let svgData = serializer.serializeToString(svg);

    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svg.width.baseVal.value || 800;
      canvas.height = svg.height.baseVal.value || 600;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white"; // Optional background fill
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(blob => {
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = "graph.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
      }, "image/png");

      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      ui.notifications.error("Failed to render SVG for PNG export");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }




  async _drawGraph(data = null) {
    const svg = d3.select("#d3-graph")
      .attr("width", this._svgWidth)
      .attr("height", this._svgHeight)
      .attr("viewBox", `0 0 ${this._svgWidth} ${this._svgHeight}`)
      .call(d3.zoom().on("zoom", (event) => {
        svg.select("g.zoom-layer").attr("transform", event.transform);
      }));

    svg.selectAll("*").remove();

    // Create a layer inside for zoom/pan
    const zoomLayer = svg.append("g").classed("zoom-layer", true);

    svg.append("image")
      .attr("xlink:href", data?.backgroundImage || "modules/foundry-graph/img/vampire.png")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 800)
      .attr("height", 600);

    this._nodes = data?.nodes || [
      { id: 1, label: "A", img: "/icons/svg/mystery-man.svg", fx: 200, fy: 200 },
      { id: 2, label: "B", img: "/icons/svg/mystery-man.svg", fx: 500, fy: 300 }
    ];

    this._links = data?.links || [
      { source: 1, target: 2 }
    ];

    const simulation = d3.forceSimulation(this._nodes)
      .force("link", d3.forceLink(this._links).id(d => d.id).distance(200))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(400, 300))
      .on("tick", ticked)
      .on("end", () => {
        simulation.stop(); // 🔴 stop simulation once nodes settle
      });

    const link = svg.append("g")
      .attr("stroke", "#111")
      .attr("stroke-opacity", 0.8)
      .selectAll("line")
      .data(this._links)
      .join("line")
      .attr("stroke-width", 2);

    const linkLabels = svg.append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(this._links)
      .join("text")
      .attr("font-size", 12)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .text(d => d.label || d.type || "");

    const node = svg.append("g")
      .selectAll("image")
      .data(this._nodes)
      .join("image")
      .attr("xlink:href", d => d.img)
      .attr("width", 64)
      .attr("height", 64)
      .attr("clip-path", "circle(32px at center)")
      .call(
        d3.drag()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      )
      .on("click", async (event, d) => {
        ui.notifications.info(`Clicked node: ${d.label}`);
        // Example: open actor sheet
        // const actor = game.actors.getName(d.label);
        // if (actor) actor.sheet.render(true);
        if (this._linkingMode) {
          if (!this._linkSourceNode) {
            this._linkSourceNode = d;
            ui.notifications.info(`Selected source node: ${d.label}`);
          } else {
            const source = this._linkSourceNode;
            const target = d;

            // Prevent self-links or duplicate links
            const alreadyLinked = this._links.some(l =>
              (l.source.id === source.id && l.target.id === target.id) ||
              (l.source.id === target.id && l.target.id === source.id)
            );
            if (!alreadyLinked && source.id !== target.id) {
              const relationType = this.element.querySelector("#relation-type")?.value || "";
              this._links.push({
                source: source.id,
                target: target.id,
                type: relationType,
                label: relationType
              });
              this._drawGraph({ nodes: this._nodes, links: this._links });
              ui.notifications.info(`Linked ${source.label} → ${target.label} (${relationType})`);
            } else {
              ui.notifications.warn("Invalid or duplicate link");
            }
            this._linkSourceNode = null;
          }
        } else {
          ui.notifications.info(`Clicked node: ${d.label}`);
        }


      })
      .on("dblclick", (event, d) => {
        ui.notifications.info(`Double-clicked node: ${d.label}`);
        // Example: open the actor sheet if the UUID is valid
        if (d.uuid) {
          fromUuid(d.uuid).then(doc => {
            if (doc?.sheet) doc.sheet.render(true);
            else ui.notifications.warn("No document found for UUID");
          });
        }
      });

    function ticked() {
      link
        .attr("x1", d => d.source.fx)
        .attr("y1", d => d.source.fy)
        .attr("x2", d => d.target.fx)
        .attr("y2", d => d.target.fy);

      node
        .attr("x", d => d.fx - 32)
        .attr("y", d => d.fy - 32);

      linkLabels
        .attr("x", d => (d.source.fx + d.target.fx) / 2)
        .attr("y", d => (d.source.fy + d.target.fy) / 2);
    }

    function dragstarted(event, d) {
      console.log("DRAG START", d);
      simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      console.log("DRAGGING", d);
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      console.log("DRAG END", d);
      if (!event.active) simulation.alphaTarget(0);
      // Do NOT nullify fx/fy — keep node fixed after drag
      d.fx = event.x;
      d.fy = event.y;
    }

    //  simulation.tick(300);
  }

}

