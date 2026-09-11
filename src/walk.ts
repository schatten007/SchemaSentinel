/**
 * Total `$ref` discovery (`SPEC.md` section 4.5).
 *
 * A dangling `$ref` nested several levels deep is still `SS-REF-001`, and
 * `SS-REF-002` needs the `$ref` count across the whole tool schema, so every
 * subschema position is visited. Sites are returned sorted by pointer so that
 * downstream behavior never depends on document key order (SPEC 6.3.4).
 */

import {
  compareAscii,
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "./json.js";
import { appendIndexPointer, appendPointer } from "./pointer.js";

/** Keywords whose value is a single subschema. */
const SUBSCHEMA_KEYWORDS = [
  "additionalProperties",
  "contentSchema",
  "contains",
  "else",
  "if",
  "not",
  "propertyNames",
  "then",
  "unevaluatedProperties",
] as const;

/** Keywords whose value maps a name to a subschema. */
const SUBSCHEMA_MAP_KEYWORDS = [
  "$defs",
  "dependentSchemas",
  "patternProperties",
  "properties",
] as const;

/** Keywords whose value is an array of subschemas. */
const SUBSCHEMA_LIST_KEYWORDS = [
  "allOf",
  "anyOf",
  "oneOf",
  "prefixItems",
] as const;

export interface RefSite {
  /** Pointer to the `$ref` keyword itself, e.g. `.../properties/a/$ref`. */
  readonly pointer: string;
  /** Pointer to the schema node that carries the `$ref`. */
  readonly schemaPointer: string;
  readonly value: JsonValue;
}

export interface UnsupportedReferenceSite {
  readonly keyword:
    | "$anchor"
    | "$dynamicAnchor"
    | "$dynamicRef"
    | "$id"
    | "$recursiveAnchor"
    | "$recursiveRef";
  readonly pointer: string;
}

export interface SchemaSites {
  readonly refSites: readonly RefSite[];
  readonly unsupportedReferenceSites: readonly UnsupportedReferenceSite[];
}

interface WalkState {
  readonly sites: RefSite[];
  readonly unsupportedReferenceSites: UnsupportedReferenceSite[];
  readonly active: Set<JsonObject>;
  readonly rootPointer: string;
}

function walkValueAsSchema(
  node: JsonValue | undefined,
  pointer: string,
  state: WalkState,
): void {
  if (node === undefined || !isJsonObject(node)) {
    // Boolean schemas and non-schema values carry no `$ref`.
    return;
  }
  walkSchema(node, pointer, state);
}

function walkMap(
  node: JsonValue | undefined,
  pointer: string,
  state: WalkState,
): void {
  if (!isJsonObject(node)) {
    return;
  }
  for (const key of Object.keys(node)) {
    walkValueAsSchema(node[key], appendPointer(pointer, key), state);
  }
}

function walkList(
  node: JsonValue | undefined,
  pointer: string,
  state: WalkState,
): void {
  if (!Array.isArray(node)) {
    return;
  }
  for (const [index, entry] of node.entries()) {
    walkValueAsSchema(entry, appendIndexPointer(pointer, index), state);
  }
}

function walkSchema(node: JsonObject, pointer: string, state: WalkState): void {
  // JSON.parse never produces cycles; this guards hand-built library inputs.
  if (state.active.has(node)) {
    return;
  }
  state.active.add(node);

  if (Object.hasOwn(node, "$ref")) {
    state.sites.push({
      pointer: `${pointer}/$ref`,
      schemaPointer: pointer,
      value: node.$ref ?? null,
    });
  }

  const unsupportedKeywords = [
    "$anchor",
    "$dynamicAnchor",
    "$dynamicRef",
    "$recursiveAnchor",
    "$recursiveRef",
  ] as const;
  for (const keyword of unsupportedKeywords) {
    if (Object.hasOwn(node, keyword)) {
      state.unsupportedReferenceSites.push({
        keyword,
        pointer: appendPointer(pointer, keyword),
      });
    }
  }
  if (pointer !== state.rootPointer && Object.hasOwn(node, "$id")) {
    state.unsupportedReferenceSites.push({
      keyword: "$id",
      pointer: appendPointer(pointer, "$id"),
    });
  }

  for (const keyword of SUBSCHEMA_KEYWORDS) {
    if (Object.hasOwn(node, keyword)) {
      walkValueAsSchema(node[keyword], appendPointer(pointer, keyword), state);
    }
  }
  for (const keyword of SUBSCHEMA_MAP_KEYWORDS) {
    if (Object.hasOwn(node, keyword)) {
      walkMap(node[keyword], appendPointer(pointer, keyword), state);
    }
  }
  for (const keyword of SUBSCHEMA_LIST_KEYWORDS) {
    if (Object.hasOwn(node, keyword)) {
      walkList(node[keyword], appendPointer(pointer, keyword), state);
    }
  }
  if (Object.hasOwn(node, "items")) {
    walkValueAsSchema(node.items, appendPointer(pointer, "items"), state);
  }

  state.active.delete(node);
}

export function collectRefSites(
  schema: JsonObject,
  schemaPointer: string,
): readonly RefSite[] {
  return collectSchemaSites(schema, schemaPointer).refSites;
}

export function collectSchemaSites(
  schema: JsonObject,
  schemaPointer: string,
): SchemaSites {
  const state: WalkState = {
    sites: [],
    unsupportedReferenceSites: [],
    active: new Set<JsonObject>(),
    rootPointer: schemaPointer,
  };
  walkSchema(schema, schemaPointer, state);
  return {
    refSites: [...state.sites].sort((a, b) =>
      compareAscii(a.pointer, b.pointer),
    ),
    unsupportedReferenceSites: [...state.unsupportedReferenceSites].sort(
      (a, b) => compareAscii(a.pointer, b.pointer),
    ),
  };
}
