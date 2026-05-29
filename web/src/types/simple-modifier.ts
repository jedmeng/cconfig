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

export type SimpleActionOp =
  | "delete"
  | "setValue"
  | "regexReplace"
  | "add"
  | "subtract"
  | "prependList"
  | "appendList";

export interface SimpleCondition {
  path: string;
  op: ConditionOp;
  value?: string | number | boolean;
}

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
