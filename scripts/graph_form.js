//import ResourcesList from "./../resources_list.mjs";
//import ActorDnd5eResources from "./../actor_dnd5e_resources.mjs";

export default class GraphForm extends FormApplication {
  constructor(data = {}, options = {}) {
    super(data, options);
    console.log("GIOPPO - graph form")
    console.log(data)
    console.log(options)
    console.log(this)
  }
  get_selected_actor(select_id) {
    let actor_select = document.getElementById(select_id)
    console.log(actor_select)
    let actor_selected = actor_select.options[actor_select.selectedIndex].value
    console.log(actor_selected)
    return actor_selected
  }
  activateListeners(html) {
    super.activateListeners(html)
    html.on('change', '#graph-name', event => {
      console.log(event.currentTarget.value)
      console.log(event.currentTarget.defaultValue)
      let newVal = event.currentTarget.value
      let new_id = newVal.slugify()
      console.log(new_id)
      this.object.graph.name = newVal
      this.object.graph.id = new_id
      this.render()
    })

    html.on('click', '#rel-remove', event => {
      console.log(event)
      console.log(event.currentTarget.attributes.getNamedItem("data").nodeValue)
      /*
      if (confirm('Are you sure you want to save this thing into the database?')) {
        // Save it!
        console.log('Thing was saved to the database.');
      } else {
        // Do nothing!
        console.log('Thing was not saved to the database.');
      }
      */
      if (!this.object.edit) {
        let d = Dialog.confirm({
          title: "A Yes or No Question",
          content: "<p>Choose wisely.</p>",
          yes: () => console.log("You chose ... wisely"),
          no: () => console.log("You chose ... poorly"),
          defaultYes: false
        });
      }
    })



    html.on('click', '#rel-add', event => {
      let new_relation = document.getElementById("new-rel").value
      if (new_relation && !(this.object.graph.relations.includes(new_relation))) {
        this.object.graph.relations.push(new_relation)
      }
      this.render()
    })

    html.on('click', '#add-relation', event => {
      let actorTarget = this.get_selected_actor("actor-t-select")
      let actorSource = this.get_selected_actor("actor-s-select")
      let actorsRelation = this.get_selected_actor("relation-select")
      console.log(actorTarget)
      console.log(actorSource)
      let new_relation = {
        actor_source_id: actorSource,
        actor_source_name: game.actors.get(actorSource).name,
        actor_source_img: game.actors.get(actorSource).img,
        relation: actorsRelation,
        actor_target_id: actorTarget,
        actor_target_name: game.actors.get(actorTarget).name,
        actor_target_img: game.actors.get(actorTarget).img,
        rel_id: actorSource + "-" + actorsRelation + "-" + actorTarget
      }
      console.log(new_relation)
      this.object.relations.push(new_relation)
      this.render()
    })

    html.on('click', '#persist-graph', event => {
      console.log(this.object.graph)
      console.log(this.object.relations)
      window.fgraph.api.save_graph(this.object.graph, this.object.relations)
    })
  }

  /**
   * Default Application options
   *
   * @returns {Object}
   */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "foundry-graph-form",
      classes: ["foundry-graph"],
      template: "modules/foundry-graph/scripts/templates/graph_form.html",
      width: 600,
      minimizable: false,
      closeOnSubmit: true
    })
  }

  getData(object) {
    let rels = [{ id: 1, descr: "ally of" }, { id: 1, descr: "enemy of" }, { id: 1, descr: "father of" }, { id: 1, descr: "mother of" }, { id: 1, descr: "brother of" }]
    let defaults = {
      id_disabled: false,
      actors: Array.from(game.actors),
      relations: this.object.relations,
      graph: this.object.graph,
      dnd5e: game.system.id == 'dnd5e',
      allowed_to_modify_settings: game.permissions.SETTINGS_MODIFY.includes(1)
    }
    return mergeObject(defaults, this.object)
  }

  /**
   * Called "on submit". Handles saving Form's data
   *
   * @param event
   * @param formData
   * @private
   */

  async _updateObject(event, data) {
    console.log(event)
    console.log(data)
    /*
    let identifier = data['resource[identifier]'] || this.object.identifier
    if(typeof identifier == 'undefined') return

    let id = this.sanitize_identifier(identifier)
    if(id != this.object.identifier && ResourcesList.all().includes(id)) return

    ResourcesList.add(id)

    window.pr.api.register_resource(id)
    window.pr.api.set(id, data['resource[default_value]'], { notify: false })
    window.pr.api.set(id.concat('_name'), data['resource[name]'])
    window.pr.api.set(id.concat('_notify_chat'), data['resource[notify_chat]'])
    window.pr.api.set(id.concat('_notify_chat_increment_message'), data['resource[notify_chat_increment_message]'])
    window.pr.api.set(id.concat('_notify_chat_decrement_message'), data['resource[notify_chat_decrement_message]'])
    window.pr.api.set(id.concat('_max'), data['resource[max_value]'])
    window.pr.api.set(id.concat('_min'), data['resource[min_value]'])
    window.pr.api.set(id.concat('_player_managed'), data['resource[player_managed]'])
    window.pr.api.set(id.concat('_use_icon'), data['resource[use_icon]'])
    window.pr.api.set(id.concat('_icon'), data['resource[icon]'])
    window.pr.api.set(id.concat('_system_name'), data['resource[system_name]'])

    if(this.id == 'add-resource-form') {
      window.pr.api.set(id.concat('_system_type'), data['resource[system_type]'])
    }
    */
  }
  /*
    sanitize_identifier(string) {
      return string
        .toLowerCase()
        .replace(/[0-9]+/g, '')
        .replace(/[^\w ]|\s+/g, '-')
    }
    */
}