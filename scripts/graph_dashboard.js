import GraphHandlebarsHelpers from "./graph_handlebarHandlers.js";
import GraphForm from "./graph_form.js";


export default class GraphDashboard extends Application {
  constructor(data = {}, options = {}) {
    super(data, options);
    this.registerHandlebarsHelpers()
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "foundry-graph-dashboard",
      classes: ["foundry.graph"],
      template: "modules/foundry-graph/scripts/templates/graph_dashboard.html",
      minimizable: true,
      resizable: true,
      title: game.i18n.localize("FvttGraph.ActorDashTitle")
    })
  }

  get_selected_graph() {
    let graph_select = document.getElementById("graph-select")
    console.log(graph_select)
    let graph_selected = graph_select.options[graph_select.selectedIndex].value
    console.log(graph_selected)
    return graph_selected
  }

  invoke_graph_form(edit = false) {
    let graph = null
    let rels = null
    if (edit) {
      let graph_selected = this.get_selected_graph()
      graph = window.fgraph.api.get_all_graphs().filter(x => { return x.id === graph_selected })[0]
      rels = window.fgraph.api.get_relations(graph_selected)
    } else {
      graph = { name: "", desc: "", id: "", type: "actor", color: "#ff0000", relations: [] }
      rels = []
    }
    console.log(graph)
    new GraphForm(
      {
        can_browse: game.user && game.user.can("FILES_BROWSE"),
        graph: graph,
        relations: rels,
        edit: edit
      },
      {
        id: "add-graph-form",
        title: game.i18n.localize("FvttGraph.GraphForm.AddGraphTitle")
      }
    ).render(true)
  }

  svgToCanvas() {
    // Select the first svg element
    var svg = window.d3.select('#mygraph')
    console.log(svg)
      //console.log(svg[_groups][0])
      / console.log(svg.node().outerHTML)
    //   console.log(svg[0][0])
    var img = new Image()
    var serializer = new XMLSerializer()
    var svgStr = svg.node().outerHTML;
    var svgBlob = new Blob([svgStr], {type:"image/svg+xml;charset=utf-8"});
    var svgUrl = URL.createObjectURL(svgBlob);
    var downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = "newesttree.svg";
    downloadLink.click();
/*
    let data = 'data:image/svg+xml;base64,' + window.btoa(svgStr);

    var canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    let context = canvas.getContext("2d");
    img.src = data;
    img.onload = function () {
      context.drawImage(img, 0, 0);
      var canvasdata = canvas.toDataURL("image/png");
      var pngimg = '<img src="' + canvasdata + '">';
      var a = document.createElement("a");
      a.download = "sample.png";
      a.href = canvasdata;
      a.click();
    };
    */
  };
  // Probably a good idea to extract some methods here for readability.
  activateListeners(html) {
    super.activateListeners(html)

    html.on('click', '#create-graph', e => {
      //      var e = document.getElementById("country");
      //              var result = e.options[e.selectedIndex].text;
      //let graph_select = html.find('#graph-select')
      this.invoke_graph_form()

    })
    html.on('click', '#edit-graph', e => {
      //      var e = document.getElementById("country");
      //              var result = e.options[e.selectedIndex].text;
      //let graph_select = html.find('#graph-select')
      this.invoke_graph_form(true)

    })

    html.on('click', '#print-diagram', e => {
      this.svgToCanvas()

    })
    /*
        html.on('click', '.change-value', e => {
          this.setup_calculation(e, (setting, jump) => {
            if($(e.currentTarget).hasClass('add')) {
              window.pr.api.increment(setting, jump)
            } else {
              window.pr.api.decrement(setting, jump)
            }
          })
        })
    
        html.on('mousemove', '.change-value', e => {
          let jump = this.increment_jump(e)
          if(jump == 1) return
          let operation = $(e.currentTarget).hasClass('add') ? '+' : '-'
          CursorTooltip.show(operation.concat(new String(jump)))
        })
    
        html.on('mouseout', '.change-value', e => {
          CursorTooltip.hide()
        })
    
        html.on('click', '.delete', e => {
          this.setup_calculation(e, setting => { ResourcesList.remove(setting) })
        })
    
        html.on('click', '.invisible, .visible', e => {
          this.setup_calculation(e, setting => { this.toggle_visiblity(setting) })
        })
    */
    /*
         html.on('drag', '#mygraph', e => {
           console.log("gioppo - event")
           console.log(e)
           $(e.currentTarget).dispatchEvent(e)
         })
   */
    html.on('click', '#create-diagram', e => {
      console.log("pressed button")
      let graph_selected = this.get_selected_graph()
      let graph_elements = window.fgraph.api.get_graph_elements(graph_selected)
      var w = 600;
      var h = 600;

      /*
        var svg = window.d3.select( "#graph" ).append("svg").attr("width",w).attr("height",h);
        console.log(svg)
        svg.append( 'circle' ) // w/o "svg." not working
        .attr( 'cx', 50 )
        .attr( 'cy', 50 )
        .attr( 'r', 25 )
        .style( 'fill', '#4400ff' );
*/


      var nodes = [
        { id: "mammal", group: 0, label: "Mammals", level: 1 },
        { id: "dog", group: 0, label: "Dogs", level: 2 },
        { id: "cat", group: 0, label: "Cats", level: 2 },
        { id: "fox", group: 0, label: "Foxes", level: 2 },
        { id: "elk", group: 0, label: "Elk", level: 2 },
        { id: "insect", group: 1, label: "Insects", level: 1 },
        { id: "ant", group: 1, label: "Ants", level: 2 },
        { id: "bee", group: 1, label: "Bees", level: 2 },
        { id: "fish", group: 2, label: "Fish", level: 1 },
        { id: "carp", group: 2, label: "Carp", level: 2 },
        { id: "pike", group: 2, label: "Pikes", level: 2 }
      ]

      var links = [
        { target: "mammal", source: "dog", strength: 0.7, id: "1" },
        { target: "mammal", source: "cat", strength: 0.7, id: "2" },
        { target: "mammal", source: "fox", strength: 0.7, id: "3" },
        { target: "mammal", source: "elk", strength: 0.7, id: "4" },
        { target: "insect", source: "ant", strength: 0.7, id: "5" },
        { target: "insect", source: "bee", strength: 0.7, id: "6" },
        { target: "fish", source: "carp", strength: 0.7, id: "7" },
        { target: "fish", source: "pike", strength: 0.7, id: "8" },
        { target: "cat", source: "elk", strength: 0.1, id: "9" },
        { target: "carp", source: "ant", strength: 0.1, id: "10" },
        { target: "elk", source: "bee", strength: 0.1, id: "11" },
        { target: "dog", source: "cat", strength: 0.1, id: "12" },
        { target: "fox", source: "ant", strength: 0.1, id: "13" },
        { target: "pike", source: "cat", strength: 0.1, id: "14" }
      ]

      var svg = window.d3.select('#mygraph')
      svg.attr('width', w).attr('height', h)

      // simulation setup with all forces
      // simulation setup with all forces
      var linkForce = window.d3
        .forceLink()
        .id(function (link) { return link.id })
        .strength(function (link) { return link.strength })

      var simulation = window.d3
        .forceSimulation()
        .force('link', linkForce)
        .force('charge', window.d3.forceManyBody().strength(-120))
        .force('center', window.d3.forceCenter(w / 2, h / 2))

      var dragDrop = window.d3.drag().on('start', (event, d) => {
        console.log(d)
        d.fx = d.x
        d.fy = d.y
      }).on('drag', (event, d) => {
        console.log(event)
        simulation.alphaTarget(0.7).restart()
        d.fx = event.x
        d.fy = event.y
      }).on('end', (event, d) => {
        if (!event.active) {
          simulation.alphaTarget(0)
        }
        d.fx = null
        d.fy = null
      })
      /*
      function getNodeColor(node) {
        return node.level === 1 ? 'red' : 'gray'
      }
      */
      var linkElements = svg.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("stroke-width", 1)
        .attr("stroke", "rgba(50, 50, 50, 0.2)")

      var nodeElements = svg.append("g")
        .attr("class", "nodes")
        .selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("r", 10)
        .attr("fill", 'red')
        .call(dragDrop)
        .on('click', function selectNode(selectedNode) {
          //          var neighbors = getNeighbors(selectedNode)

          // we modify the styles to highlight selected nodes
          nodeElements.attr('fill', function (node) { "green" })
          //           textElements.attr('fill', function (node) { return getTextColor(node, neighbors) })
          //           linkElements.attr('stroke', function (link) { return getLinkColor(selectedNode, link) })
        })

      var textElements = svg.append("g")
        .attr("class", "texts")
        .selectAll("text")
        .data(nodes)
        .enter().append("text")
        .text(function (node) { return node.label })
        .attr("font-size", 15)
        .attr("dx", 15)
        .attr("dy", 4)

      var legend = svg.append("g")
        .append("g")
        .selectAll("g")
        .data("red")
        .enter()
        .append('g')
        .attr('class', 'legend')



      legend.append('text')
        .attr('x', 10)
        .attr('y', 10)
        .text("desc");



      simulation.nodes(nodes).on('tick', () => {
        nodeElements
          .attr('cx', function (node) { return node.x })
          .attr('cy', function (node) { return node.y })
        textElements
          .attr('x', function (node) { return node.x })
          .attr('y', function (node) { return node.y })
        linkElements
          .attr('x1', function (link) { return link.source.x })
          .attr('y1', function (link) { return link.source.y })
          .attr('x2', function (link) { return link.target.x })
          .attr('y2', function (link) { return link.target.y })
      })
      simulation.force("link").links(links)
      console.log(svg)
    })
    /*
        html.on('click', '.edit', e => {
          e.stopPropagation()
          e.preventDefault()
    
          new ResourceForm(
            this.resource_data($(e.currentTarget).data('setting')),
            {
              id: "edit-resource-form",
              title: game.i18n.localize("FvttPartyResources.ResourceForm.EditFormTitle")
            }
          ).render(true)
        })
    */
    //  DraggableResources.init(this)
  }
  /*
    increment_jump(event) {
      if(event.ctrlKey || event.metaKey) return 10
      if(event.shiftKey) return 100
      return 1
    }
  */
  getData() {
    const divElem = document.createElement('div');
    let detachedSVG = window.d3.create("svg");

    // Manipulate detached element.
    detachedSVG
      .attr("width", 400)
      .attr("height", 200);
    detachedSVG.selectAll(null)
      .data([50, 100])
      .enter().append("circle")
      .attr("r", 20)
      .attr("cx", d => d)
      .attr("cy", 50);
    window.d3.select(divElem)
      .append(() => detachedSVG.node());
    console.log(detachedSVG)
    console.log(Handlebars)
    var svg1 = window.d3.create('svg')
    svg1.append('circle') // w/o "svg." not working
      .attr('cx', 50)
      .attr('cy', 50)
      .attr('r', 25)
      .style('fill', '#4400ff');
    return mergeObject(window.fgraph.api.resources(), {
      is_gm: game.user.isGM,
      svg: svg1.node().outerHTML,
      graphs: window.fgraph.api.get_all_graphs(),
      id: "pippo",
      dataset: "pluto",
      version: window.fgraph.version
    })
  }
  /*
    setup_calculation(event, process) {
      event.stopPropagation()
      event.preventDefault()
      process(
        $(event.currentTarget).data('setting'),
        this.increment_jump(event)
      )
    }
  
    toggle_visiblity(setting) {
      window.pr.api.set(
        setting.concat('_visible'),
        !window.pr.api.get(setting.concat('_visible'))
      )
    }
  
    // Deprecated and no longer in use since v1.1
    // Leaving it here as a means to a "reset window size" button or something.
    recalculate_height() {
      $('#fvtt-party-resources-dashboard').css({
        width: 'auto',
        height: 'auto'
      })
    }
  */
  redraw(force) {
    //  DashboardDirections.remove()

    this.render(force)
  }

  graphic(dataset, element) {
    var w = 154;
    var h = 42;
    var rect_1_h = 5;
    var rect_2_h = rect_1_h * 2;
    var rect_2_w = rect_1_h / 2;
    var rect_1_color = "#A1C9D9";
    var rect_2_color = "#999999";
    var text_color = "#555555";
    var font_size = 18;
    var font_family = "Segoe UI";

    /*------controller---- */

    //  var xScale = d3.scale.linear().domain([dataset[0],dataset[2]]).range([0,w]);
    console.log(dataset)
    console.log(element)
    var svg = window.d3.select(element).append("svg").attr("width", w).attr("height", h);
    console.log(svg)
    svg.data([50, 100])
      .enter().append("circle")
      .attr("r", 20)
      .attr("cx", d => d)
      .attr("cy", 50);
    /*
          var rect1 = svg.append("rect").attr("x",0).attr("y",3*h/4).attr("width",w).attr("height",rect_1_h)
              .style("fill",rect_1_color);
        var rect2 = svg.append("rect").attr("x",xScale(dataset[1])).attr("y",3*h/4-rect_1_h/2).attr("width",rect_2_w)
              .attr("height",rect_2_h).style("fill",rect_2_color);
      
        //var texts = svg.selectAll("text").data(dataset).enter().append("text").text(function(d){ return d; }).attr("fill","red").attr("x",function(d,i){ return i*50  }).attr("y",30)
      
        var text1 = svg.append("text").attr("x",2).attr("y",h/3+2).text(dataset[0]).style("fill",text_color)
              .attr("font-size",font_size).attr("font-family",font_family);
        var text2 = svg.append("text").attr("x",w-42).attr("y",h/3+2).text(dataset[2]).style("fill",text_color)
              .attr("font-size",font_size).attr("font-family",font_family);
      */
    return svg;
  };

  registerHandlebarsHelpers() {
    const helpers = {
      "svg": GraphHandlebarsHelpers.graphic
    };

    Handlebars.registerHelper('svg', function (dataset, id) {
      var w = 154;
      var h = 42;
      var rect_1_h = 5;
      var rect_2_h = rect_1_h * 2;
      var rect_2_w = rect_1_h / 2;
      var rect_1_color = "#A1C9D9";
      var rect_2_color = "#999999";
      var text_color = "#555555";
      var font_size = 18;
      var font_family = "Segoe UI";

      /*------controller---- */

      //  var xScale = d3.scale.linear().domain([dataset[0],dataset[2]]).range([0,w]);
      console.log(dataset)
      console.log(id)
      console.log(this)
      console.log("element - gioppo")
      console.log($('#graph-version'))
      var svg1 = window.d3.create('svg')
      svg1.append('circle') // w/o "svg." not working
        .attr('cx', 50)
        .attr('cy', 50)
        .attr('r', 25)
        .style('fill', '#4400ff');
      console.log(svg1.node())
      console.log(svg1.node().outerHTML)
      $('#graph-version').html(svg1.node())
      /*
          var svg = window.d3.select( '#graph-version' ).append("svg").attr("width",w).attr("height",h);
        console.log(svg)
        svg.data([50, 100])
        .enter().append("circle")
          .attr("r", 20)
          .attr("cx", d => d)
          .attr("cy", 50);
  */
      var svgContainer = window.d3.select("#graph-version")
        .append("svg")
        .attr("width", 100)
        .attr("height", 100);
      return svgContainer;
    });

    //     if (IS_DEV_BUILD)
    //         logging.debug("Handlebars helpers registered:", Object.keys(helpers));
  }

  resource_data(id) {
    return {
      identifier: id,
      //    position: window.pr.api.get(id.concat('_position')),
      can_browse: game.user && game.user.can("FILES_BROWSE")
      //   default_value: window.pr.api.get(id),
      //  name: window.pr.api.get(id.concat('_name')),
      //    max_value: window.pr.api.get(id.concat('_max')),
      //   min_value: window.pr.api.get(id.concat('_min')),
      //  icon: window.pr.api.get(id.concat('_icon')),
      // use_icon: window.pr.api.get(id.concat('_use_icon')),
      //    player_managed: window.pr.api.get(id.concat('_player_managed')),
      //   notify_chat: window.pr.api.get(id.concat('_notify_chat')),
      //  notify_chat_increment_message: window.pr.api.get(id.concat('_notify_chat_increment_message')),
      // notify_chat_decrement_message: window.pr.api.get(id.concat('_notify_chat_decrement_message')),
      //    allowed_to_modify_settings: game.permissions.SETTINGS_MODIFY.includes(1),
      //    visible: window.pr.api.get(id.concat('_visible')),
      //   system_type: window.pr.api.get(id.concat('_system_type')),
      //  system_name: window.pr.api.get(id.concat('_system_name'))
    }
  }

}