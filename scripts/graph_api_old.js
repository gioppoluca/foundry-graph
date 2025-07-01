import ActorGraphType from './graph_types/actor.js';
import GraphDashboardV2 from "./graph_dashboard_v2.js"

export default class GraphApi {
  /** @private */
  static async #fetchJSON(path, moduleId) {
    const url = `modules/${moduleId}/data/${path}`;
    return foundry.utils.fetchJsonWithTimeout(url);
  }


  /**
   * Factory that returns a fully-initialised singleton.
   * @param {string} moduleId  The module directory name (e.g. "foundry-graph")
   */
  static async create(moduleId) {
    // Load every external asset in parallel
    const [defaultGraphs, defaultRelations, demoData] = await Promise.all([
      this.#fetchJSON("default-graphs.json", moduleId),
      this.#fetchJSON("default-relations.json", moduleId),
      this.#fetchJSON("demo-nodes-links.json", moduleId)
    ]);


    const api = new GraphApi(moduleId, {
      defaultGraphs,
      defaultRelations,
      demoData
    });

    // Seed built-in graph types
    //defaultGraphs.forEach(g => api.registerGraphType(g));

    return api;
  }

  // ---------- instance -------------------------------------------------

  constructor(moduleId, defaults) {
    /** @readonly */ this.moduleId = moduleId;
    /** private */   this._defaults = defaults;

    this.graphTypes = new Map();
    this._worldGraphs = null;          // lazy-loaded cache
  }

  /* … same upsertGraph(), loadGraphs(), getGraphTypes(), etc. … */

  getDefaultRelations() { return this._defaults.defaultRelations; }
  getDemoData() { return this._defaults.demoData; }
  /*
    constructor() {
      var actor = new ActorGraphType()
      console.log(actor)
      this.graphTypes[actor.get_id()] = actor
      console.log(this.get_graph_types())
    }
  */
  //  graphTypes = []

  /** Lazily build one dashboard tied to this API */
  get dashboard() {
    return (this._dashboard ??= new GraphDashboardV2(this));
  }

  get_graph_types() {
    console.log("GIOPPO----------------------")
    console.log(this.graphTypes)
    let gkeys = Object.keys(this.graphTypes)
    console.log(gkeys)
    let gt = []
    for (let element of gkeys) {
      console.log(element)
      gt.push({ color: this.graphTypes[element].get_color(), id: this.graphTypes[element].get_id(), name: this.graphTypes[element].get_name() });
    };

    console.log(gt)
    return gt
  }

  get_all_graphs() {
    let all_graphs = game.settings.get('foundry-graph', 'graphs')
    console.log(all_graphs)
    return [{ name: "Enemy Map", desc: "map of the enemies of the PC", id: "enemy-map", type: "actor", color: "#ff0000", relations: ["enemy of", "ally of"] },
    { name: "Alliance Map", desc: "map of the enemies of the PC", id: "alliance-map", type: "actor", color: "#ff0000", relations: ["son of", "sibling of"] },
    { name: "Story plot", desc: "plot for adventure", id: "story-plot", type: "story", color: "#00ff00", relations: [] }]
  }

  save_graph(graph, relations) {
    console.log(graph)
    console.log(relations)
    let gtype = graph.type
    console.log(gtype)
    if (graph.id) {
      this.graphTypes[gtype].save_graph(graph, relations)
    } else {
      ui.notifications.error(game.i18n.localize("FvttGraph.GraphForm.SaveError"));
    }
  }

  get_relations(graph_id) {
    // need to get all relations of the graph_id graph inside all actors
    let actors_with_relations = game.actors.filter(x => {
      return (x.flags.fgraph && Object.keys(x.flags.fgraph).includes(graph_id))
    })
    let graph_relations = []
    actors_with_relations.forEach(element => {
      element.flags.fgraph[graph_id].forEach(rel => {
        graph_relations.push({
          actor_source_id: element.id,
          actor_source_name: element.name,
          relation: rel.relation,
          actor_target_id: rel.targetId,
          actor_target_name: rel.targetName,
          rel_id: element.id + "-" + rel.relation + "-" + rel.targetId
        })
      })
    });
    console.log(graph_relations)
    return graph_relations
  }
  get_graph_elements(graph_id) {
    let graph_elements = {}
    let actors_with_relations = game.actors.filter(x => {
      return (x.flags.fgraph && Object.keys(x.flags.fgraph).includes(graph_id))
    })


    // working to recover nodes
    const nodesMap = new Map();
    actors_with_relations.forEach(element => {
      nodesMap.set(element.id, { id: element.id, group: 0, label: element.name, level: 1, img: element.img })

      element.flags.fgraph[graph_id].forEach(rel => {
        nodesMap.set(element.id, { id: rel.targetId, group: 0, label: rel.targetName, level: 1, img: game.actors.get(rel.targetId).img })
      })
    });
    let arrNodes = Array.from(nodesMap.values())
    console.log(arrNodes)
    graph_elements.nodes = arrNodes
    // working to recover links
    return graph_elements
  }
  /**
   * 
   * @param {*} name 
   * @returns 
   */
  get(name) {
    // This try/catch should make sure users can still access the dashboard
    // when any validation errors trigger upon setting retrieval due to
    // Foundry v10's DataModel changes.
    try {
      return game.settings.get('foundry-graph', name)
    } catch (error) {
      return null
    }
  }


  register_settings() {
    game.settings.register('foundry-graph', 'graphs', {
      name: 'Graphs',
      hint: 'The graphs used in the game',
      scope: 'world',     // "world" = sync to db, "client" = local storage
      config: false,       // false if you dont want it to show in module config
      type: Object,       // Number, Boolean, String, Object
      default: [],
      onChange: value => { // value is the new value of the setting
        console.log("foundry graph updated the settings")
        console.log(value)
      },
    });
  }
  register_graph(graph) {
    /*
    this.register_setting(graph, { type: Number, default: 0 })
    this.register_setting(resource.concat('_name'), { type: String, default: '' })
    this.register_setting(resource.concat('_icon'), { type: ExtraTypes.FilePickerImage, default: '' })
    this.register_setting(resource.concat('_use_icon'), { Type: Boolean, default: false })
    this.register_setting(resource.concat('_visible'), { Type: Boolean, default: true })
    this.register_setting(resource.concat('_notify_chat'), { Type: Boolean, default: false })
    this.register_setting(resource.concat('_notify_chat_increment_message'), { Type: String, default: "A resource value has increased." })
    this.register_setting(resource.concat('_notify_chat_decrement_message'), { Type: String, default: "A resource value has decreased." })
    this.register_setting(resource.concat('_max'), { Type: Number, default: 100 })
    this.register_setting(resource.concat('_min'), { Type: Number, default: -100 })
    this.register_setting(resource.concat('_player_managed'), { type: Boolean, default: false })
    this.register_setting(resource.concat('_position'), { type: Number, default: ResourcesList.all().length + 1 })
    // We need this one to store specific item resource names into when filtering
    // for system-specific resources.
    this.register_setting(resource.concat('_system_type'), { type: String, default: '' })
    this.register_setting(resource.concat('_system_name'), { type: String, default: '' })
    */
  }

  resources() {
    let results = []
    // Create detached <svg> element.

    /*
            let data = ResourcesList.all().sort((a, b) => {
              this.register_resource(a)
              this.register_resource(b)
              return this.get(a.concat('_position')) - this.get(b.concat('_position'))
            })
        
            data.forEach((resource, index) => {
              if(resource == '') return ResourcesList.remove(resource)
        
              this.register_resource(resource)
        
              if(this.is_system_specific_resource(resource)) {
                const old_value = this.get(resource)
                const new_value = ActorDnd5eResources.count(
                  this.get(resource.concat('_system_type')),
                  this.get(resource.concat('_system_name'))
                )
        
                this.set(resource, new_value, { notify: old_value != new_value })
              }
        
              results.push({
    //            id: resource,
     //           value: this.get(resource),
      //          position: this.get(resource.concat('_position')),
       //         name: this.get(resource.concat('_name')),
        //        max_value: this.get(resource.concat('_max')),
         //       min_value: this.get(resource.concat('_min')),
          //      icon: this.get(resource.concat('_icon')),
           //     icon_on_top: this.get('icon_images_orientation') == 'on_top',
            //    use_icon: this.get(resource.concat('_use_icon')),
     //           player_managed: this.get(resource.concat('_player_managed')),
      //          manageable: game.user.isGM || this.get(resource.concat('_player_managed')),
       //         visible: this.get(resource.concat('_visible')),
        //        notify_chat: this.get(resource.concat('_notify_chat')),
         //       notify_chat_increment_message: this.get(resource.concat('_notify_chat_increment_message')),
          //      notify_chat_decrement_message: this.get(resource.concat('_notify_chat_decrement_message')),
           //     visible_for_players: game.user.isGM || this.get(resource.concat('_visible')),
            //    is_regular_resource: !this.is_system_specific_resource(resource),
    //            is_gm: game.user.isGM,
     //           allowed_to_modify_settings: game.permissions.SETTINGS_MODIFY.includes(1),
      //          system_type: this.get(resource.concat('_system_type')),
        //        system_name: this.get(resource.concat('_system_name'))
              })
            })
     */
    return { resources: results }
  }
}