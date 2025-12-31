import { GRAPH_TYPES } from "../data/graph-types.js";

export const JSON_graph_types = GRAPH_TYPES;
export const MODULE_ID = "foundry-graph";
export const MODULE_NAME = "Foundry Graph";
export let isDebug = false;
export function setDebugFlag(value) { isDebug = value === true; }
export const GRAPH_SCHEMA_VERSION = 1;

/**
 * Extract caller info (file + function) from stack trace.
 */
function getCallerInfo(depth = 3) {
  try {
    const err = new Error();
    const stack = err.stack?.split("\n");
    // Typical stack line formats:
    // - "    at functionName (file.js:line:col)"
    // - "    at file.js:line:col"
    const line = stack?.[depth] || stack?.[stack.length - 1];
    if (!line) return "";
    const match = line.match(/at\s+(.*?)\s+\((.*?):(\d+):(\d+)\)/) ||
      line.match(/at\s+(.*?):(\d+):(\d+)/);
    if (!match) return "";
    const func = match[1].replace(/^Object\./, "");
    const file = match[2].split("/").pop();
    const ln = match[3];
    const col = match[4];
    return `${file}:${ln}:${col}${func ? ` (${func})` : ""}`;
  } catch {
    return "";
  }
}

/**
 * Base formatter used by all log levels.
 */
function formatMessage(level, args) {
  const caller = getCallerInfo(4);
  const prefix = `[${MODULE_ID}${caller ? ` | ${caller}` : ""}]`;
  console[level](prefix, ...args);
}

/**
 * Module log utilities
 */
export function log(...args) {
  if (!isDebug) return;
  formatMessage("log", args);
}

export function warn(...args) {
  formatMessage("warn", args);
}

export function err(...args) {
  formatMessage("error", args);
}