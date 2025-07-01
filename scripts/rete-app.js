const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { NodeEditor, GetSchemes, ClassicPreset } from "rete";

export class ReteImageNodeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "rete-image-app",
      title: "Rete Image Node (AppV2)",
      template: "modules/my-rete-module/templates/rete-app.html",
      width: 800,
      height: 600,
      resizable: true
    });
  }

  async _renderInner(data, options) {
    const html = await super._renderInner(data, options);
    setTimeout(() => this._initRete(), 0); // Delay to wait for DOM
    return html;
  }

  async _initRete() {
    const container = document.getElementById("rete-container");
    if (!container) return;

    const editor = new NodeEditor("rete@0.1.0", container);
    editor.use(ConnectionPlugin.default);
    editor.use(AreaPlugin);

    const ImgComponent = new Rete.Component("ImageNode");
    ImgComponent.builder = async (node) => {
      node.meta.render = "html";
      node.meta.html = `
        <div class="circular-node">
          <img src="/icons/svg/mystery-man.svg" />
        </div>
      `;
      return node;
    };

    editor.register(ImgComponent);

    const node = await ImgComponent.createNode();
    node.position = [300, 200];
    editor.addNode(node);

    editor.view.resize();
    AreaPlugin.zoomAt(editor);
    editor.trigger("process");
  }
}


