import { ForceRenderer } from "./force-renderer.js";
import { TreeRenderer } from "./tree-renderer.js";

const registry = new Map([
  [ForceRenderer.ID, ForceRenderer],
  [TreeRenderer.ID, TreeRenderer]
]);

export function registerRenderer(RendererClass) {
  registry.set(RendererClass.ID, RendererClass);
}

export function getRenderer(id) {
  return registry.get(id) ?? registry.get("force");
}

export function listRenderers() {
  return [...registry.keys()];
}