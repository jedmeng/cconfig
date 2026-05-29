import type { SchemaItem } from "../types/config-schema";
import { comparePathsByOrder } from "./path-order";
import type { ConditionOp, SimpleActionOp, SimpleEdit } from "../types/simple-modifier";

export type OpOption = { value: string; label: string; needsValue?: boolean; valueType?: "string" | "number" };

export type ConditionOpGroup = { label: string; options: OpOption[] };

const BASE_ACTIONS: OpOption[] = [
  { value: "delete", label: "删除" },
  { value: "setValue", label: "修改为" },
];

function interleaveNegated(positive: OpOption[], negated: OpOption[]): OpOption[] {
  const out: OpOption[] = [];
  for (let i = 0; i < positive.length; i += 1) {
    out.push(positive[i]!);
    if (negated[i]) out.push(negated[i]!);
  }
  return out;
}

/** 条件下拉分组：全局 → 字符串 → 数字 → 布尔 → 数组；每组内取反项紧跟正向条件 */
export const CONDITION_OP_GROUPS: ConditionOpGroup[] = [
  {
    label: "全局",
    options: [
      { value: "alwaysTrue", label: "固定开启" },
      { value: "alwaysFalse", label: "固定关闭" },
      { value: "exists", label: "存在" },
      { value: "notExists", label: "不存在" },
    ],
  },
  {
    label: "字符串",
    options: interleaveNegated(
      [
        { value: "startsWith", label: "开始于", needsValue: true, valueType: "string" },
        { value: "endsWith", label: "结束于", needsValue: true, valueType: "string" },
        { value: "lengthGt", label: "长度大于", needsValue: true, valueType: "number" },
        { value: "lengthEq", label: "长度等于", needsValue: true, valueType: "number" },
        { value: "lengthLt", label: "长度小于", needsValue: true, valueType: "number" },
        { value: "regexMatch", label: "正则匹配", needsValue: true, valueType: "string" },
      ],
      [
        { value: "notStartsWith", label: "不开始于", needsValue: true, valueType: "string" },
        { value: "notEndsWith", label: "不结束于", needsValue: true, valueType: "string" },
        { value: "notLengthGt", label: "长度不大于", needsValue: true, valueType: "number" },
        { value: "notLengthEq", label: "长度不等于", needsValue: true, valueType: "number" },
        { value: "notLengthLt", label: "长度不小于", needsValue: true, valueType: "number" },
        { value: "notRegexMatch", label: "不匹配正则", needsValue: true, valueType: "string" },
      ],
    ),
  },
  {
    label: "数字",
    options: interleaveNegated(
      [
        { value: "gt", label: "大于", needsValue: true, valueType: "number" },
        { value: "eq", label: "等于", needsValue: true, valueType: "number" },
        { value: "lt", label: "小于", needsValue: true, valueType: "number" },
      ],
      [
        { value: "notGt", label: "不大于", needsValue: true, valueType: "number" },
        { value: "notEq", label: "不等于", needsValue: true, valueType: "number" },
        { value: "notLt", label: "不小于", needsValue: true, valueType: "number" },
      ],
    ),
  },
  {
    label: "布尔",
    options: interleaveNegated(
      [
        { value: "isTrue", label: "为 true" },
        { value: "isFalse", label: "为 false" },
      ],
      [
        { value: "notIsTrue", label: "不为 true" },
        { value: "notIsFalse", label: "不为 false" },
      ],
    ),
  },
  {
    label: "数组",
    options: interleaveNegated(
      [
        { value: "arrayLengthGt", label: "长度大于", needsValue: true, valueType: "number" },
        { value: "arrayLengthEq", label: "长度等于", needsValue: true, valueType: "number" },
        { value: "arrayLengthLt", label: "长度小于", needsValue: true, valueType: "number" },
      ],
      [
        { value: "notArrayLengthGt", label: "长度不大于", needsValue: true, valueType: "number" },
        { value: "notArrayLengthEq", label: "长度不等于", needsValue: true, valueType: "number" },
        { value: "notArrayLengthLt", label: "长度不小于", needsValue: true, valueType: "number" },
      ],
    ),
  },
];

const NEGATED_OP_KIND: Partial<Record<ConditionOp, SchemaItem["kind"]>> = {
  notStartsWith: "string",
  notEndsWith: "string",
  notLengthGt: "string",
  notLengthEq: "string",
  notLengthLt: "string",
  notRegexMatch: "string",
  notGt: "number",
  notEq: "number",
  notLt: "number",
  notIsTrue: "boolean",
  notIsFalse: "boolean",
  notArrayLengthGt: "array",
  notArrayLengthEq: "array",
  notArrayLengthLt: "array",
};

/** 条件要求的路径类型；null 表示不限制（存在/不存在）或无路径（固定开/关） */
export function kindRequiredByConditionOp(op: ConditionOp): SchemaItem["kind"] | null | "none" {
  const negatedKind = NEGATED_OP_KIND[op];
  if (negatedKind) return negatedKind;

  switch (op) {
    case "alwaysTrue":
    case "alwaysFalse":
      return "none";
    case "exists":
    case "notExists":
      return null;
    case "startsWith":
    case "endsWith":
    case "lengthGt":
    case "lengthEq":
    case "lengthLt":
    case "regexMatch":
      return "string";
    case "gt":
    case "eq":
    case "lt":
      return "number";
    case "isTrue":
    case "isFalse":
      return "boolean";
    case "arrayLengthGt":
    case "arrayLengthEq":
    case "arrayLengthLt":
      return "array";
    default:
      return null;
  }
}

export function filterPathOptionsForCondition(
  options: Array<SchemaItem & { depth: number }>,
  op: ConditionOp,
  items: SchemaItem[],
): Array<SchemaItem & { depth: number }> {
  const required = kindRequiredByConditionOp(op);
  if (required === "none") return [];
  if (required == null) return options;
  return options.filter((opt) => findSchemaItem(items, opt.path)?.kind === required);
}

export function isPathValidForConditionOp(items: SchemaItem[], path: string, op: ConditionOp): boolean {
  const required = kindRequiredByConditionOp(op);
  if (required === "none") return true;
  if (!path) return required == null;
  const item = findSchemaItem(items, path);
  if (!item) return false;
  if (required == null) return true;
  return item.kind === required;
}

export function actionOpsForKind(kind: SchemaItem["kind"]): OpOption[] {
  const common = [...BASE_ACTIONS];
  switch (kind) {
    case "string":
      return [
        ...common,
        { value: "regexReplace", label: "正则替换", needsValue: true, valueType: "string" },
      ];
    case "number":
      return [
        ...common,
        { value: "add", label: "增加（+=）", needsValue: true, valueType: "number" },
        { value: "subtract", label: "减少（-=）", needsValue: true, valueType: "number" },
      ];
    case "array":
      return [
        ...common,
        { value: "prependList", label: "头部新增", needsValue: true },
        { value: "appendList", label: "尾部新增", needsValue: true },
      ];
    default:
      return common;
  }
}

export function conditionNeedsPath(op: ConditionOp): boolean {
  return !["alwaysTrue", "alwaysFalse"].includes(op);
}

export function conditionNeedsValue(op: ConditionOp): boolean {
  return ![
    "alwaysTrue",
    "alwaysFalse",
    "exists",
    "notExists",
    "isTrue",
    "isFalse",
    "notIsTrue",
    "notIsFalse",
  ].includes(op);
}

export function actionNeedsValue(op: SimpleActionOp): boolean {
  return op !== "delete";
}

/** 属性下拉展示文案（数组类型在 path 后加 " []"） */
export function formatPathOptionLabel(
  path: string,
  depth: number,
  kind?: SchemaItem["kind"],
): string {
  const pad = depth > 0 ? `${"·".repeat(depth)} ` : "";
  const suffix = kind === "array" ? " []" : "";
  return `${pad}${path}${suffix}`;
}

export function buildPathOptions(
  items: SchemaItem[],
  pathOrder?: string[],
): Array<SchemaItem & { depth: number }> {
  const options = items.map((item) => ({
    ...item,
    depth: item.path.split(".").length - 1,
  }));
  if (!pathOrder?.length) return options;
  return [...options].sort((a, b) => comparePathsByOrder(pathOrder, a.path, b.path));
}

export function sortSchemaItemsByPathOrder(items: SchemaItem[], pathOrder: string[]): SchemaItem[] {
  return [...items].sort((a, b) => comparePathsByOrder(pathOrder, a.path, b.path));
}

export function findSchemaItem(items: SchemaItem[], path: string): SchemaItem | undefined {
  return items.find((x) => x.path === path);
}

export function objectChildPaths(
  items: SchemaItem[],
  objectPath: string,
  pathOrder?: string[],
): SchemaItem[] {
  const prefix = `${objectPath}.`;
  const depth = objectPath.split(".").length;
  const children = items.filter((item) => {
    if (!item.path.startsWith(prefix)) return false;
    return item.path.split(".").length === depth + 1;
  });
  if (!pathOrder?.length) return children;
  return sortSchemaItemsByPathOrder(children, pathOrder);
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

export function coerceToArrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return [...value];
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

export function getArrayElementKind(item: SchemaItem | undefined): SchemaItem["kind"] {
  if (!item) return "string";
  if (item.items?.type) return item.items.type;
  try {
    const sample = JSON.parse(item.sampleRaw) as unknown;
    if (Array.isArray(sample) && sample.length > 0) {
      const first = sample[0];
      if (typeof first === "boolean") return "boolean";
      if (typeof first === "number") return "number";
      if (first !== null && typeof first === "object") return "object";
      if (typeof first === "string") return "string";
    }
  } catch {
    /* ignore */
  }
  return "string";
}

export function getArrayElementEnum(item: SchemaItem | undefined): (string | number | boolean)[] | undefined {
  return item?.items?.enum ?? item?.enum;
}

/** 标量输入框展示（字符串不包引号） */
export function scalarToInputText(value: unknown, kind: SchemaItem["kind"]): string {
  if (value == null) return "";
  if (kind === "string") {
    if (typeof value === "string") return value;
    return String(value);
  }
  if (kind === "number") return Number.isFinite(Number(value)) ? String(value) : "";
  if (kind === "boolean") return value === true ? "true" : "false";
  if (kind === "object" || kind === "array") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

export function parseScalarInput(text: string, kind: SchemaItem["kind"]): unknown {
  if (kind === "boolean") return text === "true";
  if (kind === "number") {
    const n = Number(text);
    return Number.isNaN(n) ? 0 : n;
  }
  if (kind === "object") {
    try {
      return JSON.parse(text || "{}");
    } catch {
      return {};
    }
  }
  if (kind === "array") {
    try {
      return JSON.parse(text || "[]");
    } catch {
      return [];
    }
  }
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return text;
}

export function valueMatchesSchemaKind(value: unknown, kind: SchemaItem["kind"]): boolean {
  if (value === undefined || value === null) return true;
  switch (kind) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "string":
      return typeof value === "string";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

export function coerceValueForSchemaKind(value: unknown, kind: SchemaItem["kind"]): unknown {
  if (valueMatchesSchemaKind(value, kind)) return value;
  return defaultValueForKind(kind);
}

export function defaultValueForKind(kind: SchemaItem["kind"]): unknown {
  switch (kind) {
    case "boolean":
      return false;
    case "number":
      return 0;
    case "string":
      return "";
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "";
  }
}

export function parseStoredValue(text: string, kind: SchemaItem["kind"]): unknown {
  return parseScalarInput(text, kind);
}

export function valueToEditorText(value: unknown, kind: SchemaItem["kind"]): string {
  return scalarToInputText(value, kind);
}
