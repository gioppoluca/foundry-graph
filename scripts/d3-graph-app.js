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
    actions: {
      saveAction: D3GraphApp._saveGraph,
      exportAction: D3GraphApp.svgToCanvas,
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
    this._graphName = options.name || "test";
    this._graphDescription = options.desc || "desc";
    this._graphId = options.id || "test";
    this._mode = options.mode || "new";
    this._links = [];
    this._nodes = [];
  }

  async _onRender(context, options) {
    this.element.querySelector("#d3-graph").addEventListener("drop", this._onDrop.bind(this));
    this._drawGraph(); // fresh
  }

  async _prepareContext(options) {
    if (this._mode === "edit") {
      const api = game.modules.get("foundry-graph").api;
      const graph = await api.getGraph(this._graphId);
      if (!graph) {
        ui.notifications.warn("Graph not found.");
        return;
      }
      console.log("EDIT GRAPH")
      console.log(graph)
      // now we have the graph but we need to get the graphtype to assign to _graphTypeMetadata
      const graphType = await api.getGraphTypeById(graph.graphType);
      this._graphName = graph.name;
      this._graphDescription = graph.desc;
      this._svgWidth = graph.width;
      this._svgHeight = graph.height;
      this._graphTypeMetadata = graphType || {}; // keep existing, fallback on graph.graphType?
      // Restore nodes, links, and position info
      this._nodes = graph.nodes || [];
      this._links = graph.links || [];
    }
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

  static toggleLinkingMode(e) {
    this._linkingMode = !this._linkingMode;
    this._linkSourceNode = null;
    e.target.classList.toggle("active", this._linkingMode);
    e.target.innerText = this._linkingMode ? "Cancel Linking" : "Link Nodes";
    ui.notifications.info(this._linkingMode ? "Linking mode ON" : "Linking mode OFF");
  }


  static svgToCanvas() {
    // Select the first svg element and get its content
    var svgElement = document.querySelector('#d3-graph');

    if (!svgElement) {
      console.error('SVG element not found');
      return;
    }

    function convertExternalResources(svgElement, callback) {
      const imageElements = Array.from(svgElement.querySelectorAll('image'));

      // Function to fetch and convert an image to data URL
      async function fetchImage(imgElem) {
        try {
          var imgSrc = imgElem.getAttribute('xlink:href') || imgElem.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
          console.log(`Processing image with src: ${imgSrc}`);

          if (!imgSrc || imgSrc.startsWith('data:')) {
            console.log(`Skipping already data URI or missing href: ${imgSrc}`);
            return;  // Skip images without href or already data URIs
          }

          const response = await fetch(imgSrc);
          if (!response.ok) throw new Error(`Failed to load ${imgSrc}`);

          const blob = await response.blob();
          const reader = new FileReader();

          return new Promise((resolve, reject) => {
            reader.onloadend = function () {
              const dataUrl = reader.result;
              imgElem.setAttribute('href', dataUrl);
              // Also set the xlink:href attribute to ensure it's properly set
              if (imgElem.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) {
                imgElem.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
              }
              console.log(`Converted to data URL: ${dataUrl.substring(0, 50)}...`);
              resolve();
            };
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.error('Error converting image:', err);
        }
      }

      // Fetch and convert all images
      Promise.all(imageElements.map(fetchImage)).then(() => callback(svgElement))
        .catch(err => console.error('Error processing images:', err));
    }

    // Clone the SVG element to avoid modifying the original
    var svgClone = svgElement.cloneNode(true);

    convertExternalResources(svgClone, function (preparedSvg) {
      // Serialize the prepared SVG to a string
      var serializer = new XMLSerializer();
      var svgStr = serializer.serializeToString(preparedSvg);
      console.log('Final serialized SVG:', svgStr.substring(0, 500)); // Log part of SVG for inspection

      // Create a Blob from the SVG string and create an object URL for it
      var svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      var svgUrl = URL.createObjectURL(svgBlob);

      // Create download link for the SVG file
      var downloadLink = document.createElement("a");
      downloadLink.href = svgUrl;
      downloadLink.download = "newesttree.svg";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Clean up URL object to free memory (optional)
      setTimeout(() => URL.revokeObjectURL(svgUrl), 100);
    });
  }


  // ---------
  static async _saveGraph() {
    const api = game.modules.get("foundry-graph").api;

    const fullGraph = {
      id: this._graphId,
      name: this._graphName,
      desc: this._graphDescription,
      graphType: this._graphTypeMetadata.id,
      width: this._svgWidth,
      height: this._svgHeight,
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
        relationId: l.relationId,
        label: l.label,
        color: l.color,
        style: l.style,
        strokeWidth: l.strokeWidth
      }))
    };

    await api.upsertGraph(fullGraph);
    ui.notifications.info("Graph saved via API");
    console.log(this)
    this.close()
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
    console.log("GIOPPO :META")
    console.log(this._graphTypeMetadata)
    svg.append("image")
      .attr("xlink:href", this?._graphTypeMetadata?.background || "modules/foundry-graph/img/vampire.png")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 800)
      .attr("height", 600);


    const simulation = d3.forceSimulation(this._nodes)
      .force("link", d3.forceLink(this._links).id(d => d.id).distance(200))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(400, 300))
      .on("tick", ticked)
      .on("end", () => {
        simulation.stop(); // 🔴 stop simulation once nodes settle
      });

    const link = svg.append("g")
      .attr("stroke-opacity", 0.8)
      .selectAll("line")
      .data(this._links)
      .join("line")
      .attr("stroke", d => d.color || "#000")  // fallback if color is missing
      .style("stroke-dasharray", d => {
        if (d.style === "dashed") return "4 4";
        if (d.style === "dotted") return "2 4";
        return "0";
      })
      .attr("stroke-width", d => d.strokeWidth || 2)
      .on("contextmenu", (event, d) => {
        event.preventDefault();
        this._onRightClickLink(d);
      });

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
              const relationId = this.element.querySelector("#relation-type")?.value || "";
              const relation = this._graphTypeMetadata.relations.find(r => r.id === relationId);
              if (!relation) {
                ui.notifications.warn("Please select a valid relation type before creating the link.");
                return;
              }
              this._links.push({
                source: source.id,
                target: target.id,
                relationId: relation.id,
                label: relation.label,
                color: relation.color,
                style: relation.style,
                strokeWidth: relation.strokeWidth
              });
              this._drawGraph({ nodes: this._nodes, links: this._links });
              ui.notifications.info(`Linked ${source.label} → ${target.label} (${relation.label})`);
            } else {
              ui.notifications.warn("Invalid or duplicate link");
            }
            this._linkSourceNode = null;
          }
        } else {
          ui.notifications.info(`Clicked node: ${d.label}`);
        }


      })
      .on("contextmenu", (event, d) => {
        event.preventDefault(); // Prevent default browser context menu
        this._onRightClickNode(d);
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
  }

  _onRightClickNode(nodeData) {
    const confirmed = window.confirm(`Delete node "${nodeData.label || nodeData.id}"?`);
    if (confirmed) {
      // Remove node and connected links
      this._nodes = this._nodes.filter(n => n.id !== nodeData.id);
      this._links = this._links.filter(l => l.source.id !== nodeData.id && l.target.id !== nodeData.id);
      this._drawGraph(); // Redraw
    }
  }

  _onRightClickLink(linkData) {
    const confirmed = window.confirm(`Delete link from "${linkData.source.label || linkData.source.id}" to "${linkData.target.label || linkData.target.id}"?`);
    if (confirmed) {
      this._links = this._links.filter(l => l !== linkData);
      this._drawGraph(); // Redraw
    }
  }
}