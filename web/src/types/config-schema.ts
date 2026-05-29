export type ConfigRule =
  | { kind: "range"; min?: number; max?: number }
  | { kind: "regex"; pattern: string }
  | { kind: "minLength"; value: number }
  | { kind: "maxLength"; value: number };

export type SchemaValueKind = "object" | "array" | "string" | "number" | "boolean" | "null" | "unknown";

export type SchemaItemItems = {
  type: SchemaValueKind;
  enum?: (string | number | boolean)[];
};

export type SchemaItem = {
  path: string;
  kind: SchemaValueKind;
  sample: string;
  sampleRaw: string;
  description?: string;
  enum?: (string | number | boolean)[];
  rules?: ConfigRule[];
  /** 数组元素 schema（kind === "array" 时） */
  items?: SchemaItemItems;
};

