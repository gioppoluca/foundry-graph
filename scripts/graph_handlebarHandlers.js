export default class GraphHandlebarsHelpers {
    /**
     * Prefixes the module name and a dot to the specified string_id and then calls the default localize helper.
     *
     * @param {String} string_id    The string ID to translate
     * @param {Object} data         Data to pass to localize
     *
     * @return {string}
     * @see HandlebarsHelpers.localize
     */
/*    static mlocalize(string_id, data) {
        return HandlebarsHelpers.localize(`__MODULE_NAME__.${string_id}`, data);
    }
*/
  static graphic( dataset, element ) {
    var w = 154;
    var h = 42;
    var rect_1_h = 5;
    var rect_2_h = rect_1_h * 2;
    var rect_2_w = rect_1_h/2;
    var rect_1_color = "#A1C9D9";
    var rect_2_color = "#999999";
    var text_color = "#555555";
    var font_size = 18;
    var font_family = "Segoe UI";
  
    /*------controller---- */
  
  //  var xScale = d3.scale.linear().domain([dataset[0],dataset[2]]).range([0,w]);
  console.log(dataset)
  console.log(element)
    var svg = window.d3.select( element ).append("svg").attr("width",w).attr("height",h);
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
}

/*


function graphic( dataset, element ) {
  var w = 154;
  var h = 42;
  var rect_1_h = 5;
  var rect_2_h = rect_1_h * 2;
  var rect_2_w = rect_1_h/2;
  var rect_1_color = "#A1C9D9";
  var rect_2_color = "#999999";
  var text_color = "#555555";
  var font_size = 18;
  var font_family = "Segoe UI";

  /*------controller----

  var xScale = d3.scale.linear().domain([dataset[0],dataset[2]])
        .range([0,w]);

  var svg = d3.select( element ).append("svg").attr("width",w).attr("height",h);
  var rect1 = svg.append("rect").attr("x",0).attr("y",3*h/4).attr("width",w).attr("height",rect_1_h)
        .style("fill",rect_1_color);
  var rect2 = svg.append("rect").attr("x",xScale(dataset[1])).attr("y",3*h/4-rect_1_h/2).attr("width",rect_2_w)
        .attr("height",rect_2_h).style("fill",rect_2_color);

  //var texts = svg.selectAll("text").data(dataset).enter().append("text").text(function(d){ return d; }).attr("fill","red").attr("x",function(d,i){ return i*50  }).attr("y",30)

  var text1 = svg.append("text").attr("x",2).attr("y",h/3+2).text(dataset[0]).style("fill",text_color)
        .attr("font-size",font_size).attr("font-family",font_family);
  var text2 = svg.append("text").attr("x",w-42).attr("y",h/3+2).text(dataset[2]).style("fill",text_color)
        .attr("font-size",font_size).attr("font-family",font_family);

  return svg;
};

Handlebars.registerHelper('graphics', function( dataset, id ) {
  graphic( dataset, '#' + id );
});


And then in your template:

<script id="datatemplate" type="text/x-handlebars-template">
  {{#each objects}}
  <tr>
  <td>{{lp}}<span class="text1">{{lp2}}</span></td>
  <td>{{dc}}<span class="text1">{{dc2}}</span></td>
  <td>{{lp}}<span class="text1">{{lp2}}</span></td>
  </tr>
  {{/each}}
  <div id={{ id }}></div>
  {{graphics dataset id}} 
</script>
*/