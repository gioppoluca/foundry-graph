import BaseGraphType from '../base_graph_type.js'

export default class ActorGraphType extends BaseGraphType {
    get_color() {
        return ""
    }
    get_name() {
        return "actor"
    }
    get_id() {
        return "actor"
    }
    save_graph(graph, relations) {
        console.log("actor style saving")
        console.log(graph)
        // have to persist the graph in settings
        // since the saving of the graph is common to all types it will be done in the Base
        this.save_to_settings(graph)
        // now filter need to get a distinct on relations source
        //for each distinct we filter all relations and write to the actor document the structure

    }
    get_relations(graph_id) {
        throw new Error('get_relations method must be implemented in derived classes');

    }
    get_all_graphs() {
        throw new Error('get_all_graphs method must be implemented in derived classes');

    }
    get_graph_elements(graph_id) {
        throw new Error(game.i18n.localize("FvttGraph.GraphForm.SaveError"));

    }
}
