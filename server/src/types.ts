export type SourceKind = "http" | "upload" | "template";

export interface ConfigSource {
  id: string;
  name: string;
  kind: SourceKind;
  url?: string;
  filePath?: string;
  updateIntervalSeconds: number;
  etag?: string;
  lastModified?: string;
  cachedYaml?: string;
  lastFetchedAt?: string;
}

export type RuleOp = "replace" | "regexReplace" | "prependList" | "appendList";

export type ConditionOp =
  | "alwaysTrue"
  | "alwaysFalse"
  | "exists"
  | "notExists"
  | "startsWith"
  | "notStartsWith"
  | "endsWith"
  | "notEndsWith"
  | "lengthGt"
  | "notLengthGt"
  | "lengthEq"
  | "notLengthEq"
  | "lengthLt"
  | "notLengthLt"
  | "regexMatch"
  | "notRegexMatch"
  | "gt"
  | "notGt"
  | "eq"
  | "notEq"
  | "lt"
  | "notLt"
  | "isTrue"
  | "notIsTrue"
  | "isFalse"
  | "notIsFalse"
  | "arrayLengthGt"
  | "notArrayLengthGt"
  | "arrayLengthEq"
  | "notArrayLengthEq"
  | "arrayLengthLt"
  | "notArrayLengthLt";

export interface SimpleCondition {
  path: string;
  op: ConditionOp;
  value?: string | number | boolean;
}

export type SimpleActionOp =
  | "delete"
  | "setValue"
  | "regexReplace"
  | "add"
  | "subtract"
  | "prependList"
  | "appendList";

export interface SimpleAction {
  path: string;
  op: SimpleActionOp;
  value?: unknown;
  pattern?: string;
  replace?: string;
}

export interface SimpleEdit {
  id: string;
  /** 为 false 时跳过本条规则；未设置视为启用 */
  enabled?: boolean;
  /** 条件组之间为或；组内条件为且 */
  conditionGroups: SimpleCondition[][];
  actions: SimpleAction[];
  /** @deprecated 已迁移为 conditionGroups */
  conditions?: SimpleCondition[];
}

export interface RuleEdit {
  path: string;
  op: RuleOp;
  value?: unknown;
  pattern?: string;
  replace?: string;
}

export interface CodeEdit {
  path: string;
  code: string;
}

export interface Modifier {
  id: string;
  name: string;
  /** 简单修改器：固定修改 / 条件修改 */
  simpleEdits: SimpleEdit[];
  /** @deprecated 由 simpleEdits 替代；仅兼容旧数据 */
  ruleEdits?: RuleEdit[];
  codeEdits: CodeEdit[];
  classCode?: string;
  /** 是否应用 classCode；未设置时按 classCode 是否有内容推断 */
  classCodeEnabled?: boolean;
}

export interface Scheme {
  id: string;
  name: string;
  sourceId: string;
  modifierIds: string[];
}

export interface PreviewStep {
  stepName: string;
  yaml: string;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  preferredUsernameWhitelist: string[];
  scope?: string;
}

export type ConfigValueKind = "object" | "array" | "string" | "number" | "boolean" | "null" | "unknown";

export type ConfigRule =
  | { kind: "range"; min?: number; max?: number }
  | { kind: "regex"; pattern: string }
  | { kind: "minLength"; value: number }
  | { kind: "maxLength"; value: number };

/** Single property in server/data/config-schema.yaml (recursive). */
export interface ConfigPropertySchema {
  /** 对象字段名；primitive 数组的 items schema 可省略 */
  key?: string;
  type: ConfigValueKind;
  description?: string;
  default?: unknown;
  enum?: (string | number | boolean)[];
  rules?: ConfigRule[];
  properties?: ConfigPropertySchema[];
  items?: ConfigPropertySchema;
}

export interface ConfigSchemaFile {
  version: number;
  properties: ConfigPropertySchema[];
}

/** Flattened catalog item consumed by API / UI / validator. */
export interface ConfigPathMeta {
  path: string;
  kind: ConfigValueKind;
  sample: string;
  sampleRaw: string;
  description?: string;
  enum?: (string | number | boolean)[];
  rules?: ConfigRule[];
  /** Element schema when kind === "array". */
  items?: ConfigPropertySchema;
}
