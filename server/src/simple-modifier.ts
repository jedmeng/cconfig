import type { ConditionOp, SimpleAction, SimpleCondition, SimpleEdit } from "./types.js";

export function getByPath(root: unknown, path: string): unknown {
  if (!path) return root;
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, root);
}

export function setByPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i]!;
    if (cursor[k] == null || typeof cursor[k] !== "object" || Array.isArray(cursor[k])) {
      cursor[k] = {};
    }
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]!] = value;
}

export function deleteByPath(root: Record<string, unknown>, path: string): void {
  const keys = path.split(".");
  const last = keys.pop();
  if (!last) return;
  let cursor: unknown = root;
  for (const k of keys) {
    if (cursor == null || typeof cursor !== "object" || Array.isArray(cursor)) return;
    cursor = (cursor as Record<string, unknown>)[k];
  }
  if (cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
    delete (cursor as Record<string, unknown>)[last];
  }
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

type PositiveConditionOp = Exclude<
  ConditionOp,
  "alwaysTrue" | "alwaysFalse" | "exists" | "notExists" | `not${string}`
>;

const NEGATED_TO_POSITIVE: Partial<Record<ConditionOp, PositiveConditionOp>> = {
  notStartsWith: "startsWith",
  notEndsWith: "endsWith",
  notLengthGt: "lengthGt",
  notLengthEq: "lengthEq",
  notLengthLt: "lengthLt",
  notRegexMatch: "regexMatch",
  notGt: "gt",
  notEq: "eq",
  notLt: "lt",
  notIsTrue: "isTrue",
  notIsFalse: "isFalse",
  notArrayLengthGt: "arrayLengthGt",
  notArrayLengthEq: "arrayLengthEq",
  notArrayLengthLt: "arrayLengthLt",
};

/** 属性不存在时视为满足取反条件 */
function evaluateNegated(value: unknown, whenPresent: () => boolean): boolean {
  if (!isPresent(value)) return true;
  return !whenPresent();
}

function evaluatePositiveValueCheck(value: unknown, op: PositiveConditionOp, cmp: unknown): boolean {
  switch (op) {
    case "startsWith":
      return isPresent(value) && asString(value).startsWith(String(cmp ?? ""));
    case "endsWith":
      return isPresent(value) && asString(value).endsWith(String(cmp ?? ""));
    case "lengthGt":
      return asString(value).length > Number(cmp ?? 0);
    case "lengthEq":
      return asString(value).length === Number(cmp ?? 0);
    case "lengthLt":
      return asString(value).length < Number(cmp ?? 0);
    case "regexMatch":
      try {
        return new RegExp(String(cmp ?? "")).test(asString(value));
      } catch {
        return false;
      }
    case "gt": {
      const n = asNumber(value);
      return n !== null && n > Number(cmp ?? 0);
    }
    case "eq": {
      const n = asNumber(value);
      return n !== null && n === Number(cmp ?? 0);
    }
    case "lt": {
      const n = asNumber(value);
      return n !== null && n < Number(cmp ?? 0);
    }
    case "isTrue":
      return value === true;
    case "isFalse":
      return value === false;
    case "arrayLengthGt":
      return arrayLength(value) > Number(cmp ?? 0);
    case "arrayLengthEq":
      return arrayLength(value) === Number(cmp ?? 0);
    case "arrayLengthLt":
      return arrayLength(value) < Number(cmp ?? 0);
    default:
      return false;
  }
}

export function evaluateCondition(root: unknown, condition: SimpleCondition): boolean {
  const value = getByPath(root, condition.path);
  const cmp = condition.value;

  switch (condition.op) {
    case "alwaysTrue":
      return true;
    case "alwaysFalse":
      return false;
    case "exists":
      return isPresent(value);
    case "notExists":
      return !isPresent(value);
    default: {
      const positiveOp = NEGATED_TO_POSITIVE[condition.op];
      if (positiveOp) {
        return evaluateNegated(value, () => evaluatePositiveValueCheck(value, positiveOp, cmp));
      }
      return evaluatePositiveValueCheck(value, condition.op as PositiveConditionOp, cmp);
    }
  }
}

/** 组内且、组间或 */
export function evaluateConditionGroups(root: unknown, groups: SimpleCondition[][] | undefined): boolean {
  if (!groups?.length) return false;
  return groups.some((group) => group.length > 0 && group.every((c) => evaluateCondition(root, c)));
}

export function normalizeSimpleEdit(edit: SimpleEdit & { kind?: string }): SimpleEdit {
  let groups = edit.conditionGroups;
  if (!groups?.length && edit.conditions?.length) {
    groups = [edit.conditions];
  }
  if (edit.kind === "fixed" || !groups?.length) {
    groups = [[{ path: "", op: "alwaysTrue" }]];
  }
  return {
    id: edit.id,
    enabled: edit.enabled,
    conditionGroups: groups,
    actions: edit.actions,
  };
}

export function isSimpleEditEnabled(edit: SimpleEdit): boolean {
  return edit.enabled !== false;
}

export function applySimpleAction(root: Record<string, unknown>, action: SimpleAction): void {
  const current = getByPath(root, action.path);

  switch (action.op) {
    case "delete":
      deleteByPath(root, action.path);
      return;
    case "setValue":
      setByPath(root, action.path, action.value);
      return;
    case "regexReplace": {
      const source = asString(current);
      const replaced = source.replace(new RegExp(action.pattern ?? "", "g"), action.replace ?? "");
      setByPath(root, action.path, replaced);
      return;
    }
    case "add": {
      const n = asNumber(current) ?? 0;
      setByPath(root, action.path, n + Number(action.value ?? 0));
      return;
    }
    case "subtract": {
      const n = asNumber(current) ?? 0;
      setByPath(root, action.path, n - Number(action.value ?? 0));
      return;
    }
    case "prependList": {
      const arr = Array.isArray(current) ? current : [];
      const adds = Array.isArray(action.value)
        ? action.value
        : action.value === undefined
          ? []
          : [action.value];
      setByPath(root, action.path, [...adds, ...arr]);
      return;
    }
    case "appendList": {
      const arr = Array.isArray(current) ? current : [];
      const adds = Array.isArray(action.value)
        ? action.value
        : action.value === undefined
          ? []
          : [action.value];
      setByPath(root, action.path, [...arr, ...adds]);
      return;
    }
  }
}

export function applySimpleEdit(root: Record<string, unknown>, edit: SimpleEdit): void {
  const normalized = normalizeSimpleEdit(edit);
  if (!isSimpleEditEnabled(normalized)) return;
  if (!evaluateConditionGroups(root, normalized.conditionGroups)) return;
  for (const action of normalized.actions) {
    applySimpleAction(root, action);
  }
}

export function applySimpleEdits(root: Record<string, unknown>, edits: SimpleEdit[] | undefined): void {
  if (!edits?.length) return;
  for (const edit of edits) {
    applySimpleEdit(root, normalizeSimpleEdit(edit as SimpleEdit & { kind?: string }));
  }
}
