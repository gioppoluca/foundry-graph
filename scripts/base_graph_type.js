export default class BaseGraphType {
    get_color() {
        throw new Error('get_color method must be implemented in derived classes');
    }
    get_name() {
        throw new Error('get_name method must be implemented in derived classes');
    }
    get_id() {
        throw new Error('get_id method must be implemented in derived classes');
    }
    save_graph(graph, relations) {
        throw new Error('save_graph method must be implemented in derived classes');
    }
    get_relations(graph_id) {
        throw new Error('get_relations method must be implemented in derived classes');
    }
    get_all_graphs() {
        throw new Error('get_all_graphs method must be implemented in derived classes');
    }
    get_graph_elements(graph_id) {
        throw new Error('get_graph_elements method must be implemented in derived classes');
    }
    async save_to_settings(graph) {
        orig_graph = game.settings.get('foundry-graph', 'graphs')
        console.log(orig_graph)
        const itemIndex = orig_graph.findIndex(o => o.id === graph.id);
        if (itemIndex > -1) {
            // if graph exists replace it

            orig_graph[itemIndex] = graph;
        } else {
            // else add it
            orig_graph.push(graph);
        }

        await game.settings.set('foundry-graph', 'graphs', orig_graph);
    }
}