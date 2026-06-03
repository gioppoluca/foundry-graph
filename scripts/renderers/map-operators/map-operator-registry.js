import { log } from "../../constants.js";
import { MapEarthOperator } from "./map-earth-operator.js";
import { MapImageOperator } from "./map-image-operator.js";

const MAP_OPERATOR_REGISTRY = {
  earth: MapEarthOperator,
  image: MapImageOperator
};

export function createMapOperator({ renderer, L, themeData } = {}) {
  const operatorId = String(themeData?.mapSource?.operator ?? "earth");
  const OperatorClass = MAP_OPERATOR_REGISTRY[operatorId];

  if (!OperatorClass) {
    const supported = Object.keys(MAP_OPERATOR_REGISTRY).join(", ");
    throw new Error(`Unsupported map operator '${operatorId}'. Supported operators: ${supported}`);
  }

  log("MapOperatorRegistry: creating operator", {
    operatorId,
    themeId: themeData?.id ?? null,
    mapSourceType: themeData?.mapSource?.type ?? null
  });

  return new OperatorClass({ renderer, L, themeData });
}

export function getRegisteredMapOperatorIds() {
  return Object.keys(MAP_OPERATOR_REGISTRY);
}
