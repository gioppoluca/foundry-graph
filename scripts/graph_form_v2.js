const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
//import { DragDrop } from foundry.applications.ui


//dragDrop.bind(html); 

export default class GraphFormV2 extends HandlebarsApplicationMixin(ApplicationV2) {
    #dragDrop;

    /**
     * @param {GraphApi} api              – singleton instance
     * @param {object}   [options]        – V2 options, plus:
     *        {string} [graphId]          – existing graph to edit (omit to create)
     */
    constructor(options = {}) {
        super(options);
        this.api = options.api;
        this.graphId = options.graphId ?? null;
        this.#dragDrop = this.#createDragDropHandlers();
    }

    /* ------------------------------------------------------------------------ */
    /*  Static                                                                   */
    /* ------------------------------------------------------------------------ */

    static PARTS = {
        body: {
            template: "modules/foundry-graph/templates/graph_form.hbs"
        }
    };

    static DEFAULT_OPTIONS = {
        id: "fgraph-form",
        width: 480,
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
            onChangeGraphName: GraphFormV2.onChangeGraphName
        },
        closeOnSubmit: true
    };

    /* ------------------------------------------------------------------------ */
    /*  Data                                                                    */
    /* ------------------------------------------------------------------------ */

    async _prepareContext() {
        // Existing graph or blank template
        const allGraphs = this.api.get_all_graphs();
        const graph = this.graphId ? allGraphs.find(g => g.id === this.graphId) : {
            id: "",
            name: "",
            desc: "",
            type: "actor",
            color: "#ffffff",
            relations: []
        };

        return {
            isEdit: Boolean(this.graphId),
            graph,
            relations: this.api.getDefaultRelations(),
            title: this.graphId ? `${game.i18n.localize("FvttGraph.EditGraph")}: ${graph.name}`
                : game.i18n.localize("FvttGraph.CreateGraph")
        };
    }

    static onChangeGraphName(event, target) {

        console.log(event.target.value)
        console.log(event.target.defaultValue)
        let newVal = event.target.value
        console.log(event)
        console.log(target)
        console.log(newVal)
        let new_id = newVal.slugify()
        console.log(new_id)
        console.log(this)
        //      this.object.graph.name = newVal
        //     this.object.graph.id = new_id
        //      this.render()

    }


    _onRender(context, options) {
        const graphName = this.element.querySelectorAll('#graph-name')
        console.log(graphName)
        console.log(graphName[0])
        graphName[0].addEventListener("change", (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            console.log("event change del nome")
            console.log(e)
            let newVal = e.target.value
            console.log(newVal)
            let new_id = newVal.slugify()
            console.log(new_id)
            //        const newQuantity = e.currentTarget.value
            // assuming the item's ID is in the input's `data-item-id` attribute
            //      const itemId = e.currentTarget.dataset.itemId
            //    const item = this.actor.items.get(itemId)
            // the following is asynchronous and assumes the quantity is in the path `system.quantity`
            //  item.update({ system: { quantity: newQuantity }});
        })

        const droppableItems = this.element.querySelectorAll('.droppable')
        console.log(droppableItems)
        for (const droppableItem of droppableItems) {
            droppableItem.addEventListener("drop", this._onDrop.bind(this));
        }


        this.#dragDrop.forEach((d) => d.bind(this.element));
    }

    /* ------------------------------------------------------------------------ */
    /*  Form handling                                                           */
    /* ------------------------------------------------------------------------ */

    /** Collect form data and call GraphApi.upsertGraph */
    async _onSubmit(event, formData) {
        event.preventDefault();

        // Basic validation – require name & id
        if (!formData["graph.name"]?.trim()) {
            return ui.notifications.warn("Graph name is required.");
        }

        // Build graph object
        const graph = {
            id: formData["graph.id"].trim() || foundry.utils.randomID(10),
            name: formData["graph.name"].trim(),
            desc: formData["graph.desc"].trim(),
            type: formData["graph.type"],
            color: formData["graph.color"],
            relations: formData["graph.relations"] ?? []
        };

        await this.api.upsertGraph(graph);
        ui.notifications.info(game.i18n.localize("FvttGraph.GraphSaved"));

        // Optional: refresh dashboard if open
        this.api.dashboard?.render(false);

        return super._onSubmit(event, formData);
    }

    /**
 * Create drag-and-drop workflow handlers for this Application
 * @returns {DragDrop[]}     An array of DragDrop handlers
 * @private
 */
    #createDragDropHandlers() {
        return this.options.dragDrop.map((d) => {
            d.permissions = {
                dragstart: this._canDragStart.bind(this),
                drop: this._canDragDrop.bind(this),
            };
            d.callbacks = {
                dragstart: this._onDragStart.bind(this),
                dragover: this._onDragOver.bind(this),
                drop: this._onDrop.bind(this),
            };
            return new DragDrop(d);
        });
    }


    // Optional: Add getter to access the private property

    /**
     * Returns an array of DragDrop instances
     * @type {DragDrop[]}
     */
    get dragDrop() {
        return this.#dragDrop;
    }

    /**
     * Define whether a user is able to begin a dragstart workflow for a given drag selector
     * @param {string} selector       The candidate HTML selector for dragging
     * @returns {boolean}             Can the current user drag this selector?
     * @protected
     */
    _canDragStart(selector) {
        // game.user fetches the current user
        console.log("_canDragStart")
        console.log(selector)
        return this.isEditable;
    }


    /**
     * Define whether a user is able to conclude a drag-and-drop workflow for a given drop selector
     * @param {string} selector       The candidate HTML selector for the drop target
     * @returns {boolean}             Can the current user drop on this selector?
     * @protected
     */
    _canDragDrop(selector) {
        // game.user fetches the current user
        console.log("_canDragDrop")
        console.log(selector)
        return this.isEditable;
    }


    /**
     * Callback actions which occur at the beginning of a drag start workflow.
     * @param {DragEvent} event       The originating DragEvent
     * @protected
     */
    _onDragStart(event) {
        console.log("_onDragStart")
        console.log(event)
        const el = event.currentTarget;
        if ('link' in event.target.dataset) return;

        // Extract the data you need
        let dragData = null;

        if (!dragData) return;

        // Set data transfer
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    }


    /**
     * Callback actions which occur when a dragged element is over a drop target.
     * @param {DragEvent} event       The originating DragEvent
     * @protected
     */
    _onDragOver(event) { }


    /**
     * Callback actions which occur when a dragged element is dropped on a target.
     * @param {DragEvent} event       The originating DragEvent
     * @protected
     */
    async _onDrop(event) {
        console.log("_onDrop")
        console.log(event)
        const data = TextEditor.getDragEventData(event);
        console.log(data)

        // Handle different data types
        switch (data.type) {
            // write your cases
        }
    }
}
