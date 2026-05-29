<script setup lang="ts">
import { computed } from "vue";
import type { SchemaItem } from "../types/config-schema";
import type { ConditionOp, SimpleAction, SimpleActionOp, SimpleCondition, SimpleEdit } from "../types/simple-modifier";
import SchemaValueEditor from "./SchemaValueEditor.vue";
import {
  actionNeedsValue,
  actionOpsForKind,
  conditionNeedsPath,
  conditionNeedsValue,
  CONDITION_OP_GROUPS,
  coerceToArrayValue,
  coerceValueForSchemaKind,
  defaultValueForKind,
  findSchemaItem,
  formatPathOptionLabel,
  isPathValidForConditionOp,
  isSimpleEditEnabled,
  normalizeSimpleEdit,
} from "../utils/simple-modifier-meta";
import {
  buildGroupedPathOptions,
  filterGroupedPathOptionsForCondition,
} from "../utils/schema-path-groups";

const props = defineProps<{
  schemaItems: SchemaItem[];
  pathOrder: string[];
  modelValue: SimpleEdit[];
}>();
const emit = defineEmits<{ "update:modelValue": [SimpleEdit[]] }>();

const pathOptionGroups = computed(() =>
  buildGroupedPathOptions(props.schemaItems, props.pathOrder),
);

function newId(): string {
  return crypto.randomUUID();
}

function updateEdits(edits: SimpleEdit[]) {
  emit("update:modelValue", edits);
}

function groupsOf(edit: SimpleEdit): SimpleCondition[][] {
  return normalizeSimpleEdit(edit).conditionGroups;
}

function addEdit() {
  updateEdits([
    ...props.modelValue,
    {
      id: newId(),
      conditionGroups: [[{ path: "", op: "alwaysTrue" }]],
      actions: [{ path: "", op: "setValue", value: "" }],
    },
  ]);
}

function removeEdit(id: string) {
  updateEdits(props.modelValue.filter((e) => e.id !== id));
}

function toggleEditEnabled(id: string) {
  const edit = props.modelValue.find((e) => e.id === id);
  if (!edit) return;
  patchEdit(id, { enabled: !isSimpleEditEnabled(edit) });
}

function patchEdit(id: string, patch: Partial<SimpleEdit>) {
  updateEdits(props.modelValue.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

function patchCondition(editId: string, groupIndex: number, condIndex: number, patch: Partial<SimpleCondition>) {
  const edit = props.modelValue.find((e) => e.id === editId);
  if (!edit) return;
  const groups = groupsOf(edit).map((g) => [...g]);
  const cond = { ...groups[groupIndex]![condIndex]!, ...patch };

  if (patch.op === "alwaysTrue" || patch.op === "alwaysFalse") {
    cond.path = "";
    delete cond.value;
  } else if (patch.op !== undefined) {
    if (!isPathValidForConditionOp(props.schemaItems, cond.path, cond.op)) {
      cond.path = "";
      delete cond.value;
    }
  } else if (patch.path !== undefined && !isPathValidForConditionOp(props.schemaItems, patch.path, cond.op)) {
    cond.path = "";
    delete cond.value;
  }

  groups[groupIndex]![condIndex] = cond;
  patchEdit(editId, { conditionGroups: groups });
}

function addCondition(editId: string, groupIndex: number) {
  const edit = props.modelValue.find((e) => e.id === editId);
  if (!edit) return;
  const groups = groupsOf(edit).map((g) => [...g]);
  groups[groupIndex] = [...(groups[groupIndex] ?? []), { path: "", op: "exists" }];
  patchEdit(editId, { conditionGroups: groups });
}

function removeCondition(editId: string, groupIndex: number, condIndex: number) {
  const edit = props.modelValue.find((e) => e.id === editId);
  if (!edit) return;
  const groups = groupsOf(edit).map((g) => [...g]);
  const group = groups[groupIndex]!.filter((_, i) => i !== condIndex);
  if (group.length) {
    groups[groupIndex] = group;
  } else if (groups.length > 1) {
    groups.splice(groupIndex, 1);
  } else {
    groups[0] = [{ path: "", op: "alwaysTrue" }];
  }
  patchEdit(editId, { conditionGroups: groups });
}

function addConditionGroup(editId: string) {
  const edit = props.modelValue.find((e) => e.id === editId);
  if (!edit) return;
  patchEdit(editId, { conditionGroups: [...groupsOf(edit), [{ path: "", op: "exists" }]] });
}

function removeConditionGroup(editId: string, groupIndex: number) {
  const edit = props.modelValue.find((e) => e.id === editId);
  if (!edit) return;
  const groups = groupsOf(edit).filter((_, i) => i !== groupIndex);
  patchEdit(editId, { conditionGroups: groups.length ? groups : [[{ path: "", op: "alwaysTrue" }]] });
}

function patchAction(editId: string, index: number, patch: Partial<SimpleAction>) {
  const edit = props.modelValue.find((e) => e.id === editId);
  if (!edit) return;
  const actions = [...edit.actions];
  const prev = actions[index]!;
  actions[index] = { ...prev, ...patch };

  if (patch.path !== undefined && patch.path !== prev.path) {
    const item = findSchemaItem(props.schemaItems, patch.path);
    const ops = actionOpsForKind(item?.kind ?? "string");
    if (!ops.some((o) => o.value === actions[index].op)) {
      actions[index].op = ops[0]!.value as SimpleActionOp;
    }
    actions[index].value = defaultValueForKind(item?.kind ?? "string");
  }

  if (patch.op === "delete") {
    delete actions[index].value;
    delete actions[index].pattern;
    delete actions[index].replace;
    patchEdit(editId, { actions });
    return;
  }

  if (patch.op !== undefined && patch.op !== prev.op && !(patch.path !== undefined && patch.path !== prev.path)) {
    const pathItem = findSchemaItem(props.schemaItems, actions[index].path);
    actions[index].value = defaultValueForKind(pathItem?.kind ?? "string");
  }

  const pathItem = findSchemaItem(props.schemaItems, actions[index].path);
  if (pathItem) {
    actions[index].value = coerceValueForSchemaKind(
      actions[index].value,
      pathItem.kind,
    );
    if (
      pathItem.kind === "array" &&
      (actions[index].op === "setValue" ||
        actions[index].op === "prependList" ||
        actions[index].op === "appendList")
    ) {
      actions[index].value = coerceToArrayValue(actions[index].value);
    }
  }

  patchEdit(editId, { actions });
}

function addAction(editId: string) {
  const edit = props.modelValue.find((e) => e.id === editId);
  if (!edit) return;
  patchEdit(editId, { actions: [...edit.actions, { path: "", op: "setValue", value: "" }] });
}

function removeAction(editId: string, index: number) {
  const edit = props.modelValue.find((e) => e.id === editId);
  if (!edit) return;
  patchEdit(editId, { actions: edit.actions.filter((_, i) => i !== index) });
}

function pathTip(path: string): string {
  const item = findSchemaItem(props.schemaItems, path);
  if (!item?.description) return path;
  return `${path}\n${item.description}`;
}

function condPathOptionGroups(op: ConditionOp) {
  return filterGroupedPathOptionsForCondition(pathOptionGroups.value, op, props.schemaItems);
}

function condValueType(op: ConditionOp): "number" | "text" {
  const base = op.startsWith("not") ? `${op.charAt(3).toLowerCase()}${op.slice(4)}` : op;
  if (
    base === "gt" ||
    base === "eq" ||
    base === "lt" ||
    base.startsWith("length") ||
    base.startsWith("arrayLength")
  ) {
    return "number";
  }
  return "text";
}
</script>

<template>
  <div class="sm">
    <div class="sm-toolbar">
      <button type="button" class="sm-btn sm-btn--primary" @click="addEdit">
        <i class="bi bi-plus-lg" />
        修改规则
      </button>
      <span v-if="modelValue.length" class="sm-count">共 {{ modelValue.length }} 条</span>
    </div>

    <div v-if="!modelValue.length" class="sm-empty">
      <i class="bi bi-sliders2" />
      <p>
        点击「+修改规则」创建规则。条件<strong>组内为且</strong>、<strong>组间为或</strong>；「固定开启」表示始终执行。
      </p>
    </div>

    <div v-else class="sm-list">
      <article
        v-for="(edit, editIndex) in modelValue"
        :key="edit.id"
        class="sm-card"
        :class="{ 'sm-card--disabled': !isSimpleEditEnabled(edit) }"
      >
        <header class="sm-card-head">
          <span class="sm-card-index">{{ editIndex + 1 }}</span>
          <span class="sm-card-title">修改规则</span>
          <div class="sm-card-actions">
            <button
              type="button"
              class="sm-icon-btn sm-icon-btn--toggle"
              :class="{ 'sm-icon-btn--toggle-off': !isSimpleEditEnabled(edit) }"
              :title="isSimpleEditEnabled(edit) ? '禁用本条规则' : '启用本条规则'"
              @click="toggleEditEnabled(edit.id)"
            >
              <i :class="isSimpleEditEnabled(edit) ? 'bi bi-toggle-on' : 'bi bi-toggle-off'" />
            </button>
            <button type="button" class="sm-icon-btn sm-icon-btn--danger" title="删除本条" @click="removeEdit(edit.id)">
              <i class="bi bi-trash3" />
            </button>
          </div>
        </header>

        <div class="sm-card-body">
          <section class="sm-block">
            <div class="sm-block-head">
              <div class="sm-block-head-left">
                <span class="sm-block-label"><i class="bi bi-funnel" /> 条件</span>
                <span class="sm-tag">组内且 · 组间或</span>
              </div>
              <button type="button" class="sm-text-btn sm-text-btn--head" @click="addConditionGroup(edit.id)">
                <i class="bi bi-plus-lg" /> 条件组
              </button>
            </div>

            <div class="sm-groups">
              <template v-for="(group, gi) in groupsOf(edit)" :key="gi">
                <div class="sm-cond-group">
                  <div class="sm-cond-group-head">
                    <span class="sm-cond-group-label">条件组 {{ gi + 1 }}</span>
                    <button
                      v-if="groupsOf(edit).length > 1"
                      type="button"
                      class="sm-text-btn sm-text-btn--muted"
                      @click="removeConditionGroup(edit.id, gi)"
                    >
                      删除组
                    </button>
                  </div>

                  <div class="sm-rules">
                    <div v-for="(cond, ci) in group" :key="ci" class="sm-rule">
                      <div
                        class="sm-rule-fields"
                        :class="{ 'sm-rule-fields--solo': !conditionNeedsPath(cond.op) && !conditionNeedsValue(cond.op) }"
                      >
                        <select
                          class="sm-ctl sm-ctl--op"
                          :value="cond.op"
                          @change="
                            patchCondition(edit.id, gi, ci, {
                              op: ($event.target as HTMLSelectElement).value as ConditionOp,
                            })
                          "
                        >
                          <optgroup v-for="grp in CONDITION_OP_GROUPS" :key="grp.label" :label="grp.label">
                            <option v-for="op in grp.options" :key="op.value" :value="op.value">
                              {{ op.label }}
                            </option>
                          </optgroup>
                        </select>
                        <select
                          v-if="conditionNeedsPath(cond.op)"
                          class="sm-ctl sm-ctl--path"
                          :value="cond.path"
                          :title="pathTip(cond.path)"
                          @change="patchCondition(edit.id, gi, ci, { path: ($event.target as HTMLSelectElement).value })"
                        >
                          <option value="" disabled>属性</option>
                          <optgroup
                            v-for="grp in condPathOptionGroups(cond.op)"
                            :key="grp.label"
                            :label="grp.label"
                          >
                            <option
                              v-for="opt in grp.options"
                              :key="`${grp.label}:${opt.path}`"
                              :value="opt.path"
                              :title="opt.description ?? opt.path"
                            >
                              {{ formatPathOptionLabel(opt.path, opt.depth, opt.kind) }}
                            </option>
                          </optgroup>
                        </select>
                        <input
                          v-if="conditionNeedsValue(cond.op)"
                          class="sm-ctl sm-ctl--val"
                          :type="condValueType(cond.op)"
                          :value="cond.value ?? ''"
                          placeholder="值"
                          @input="patchCondition(edit.id, gi, ci, { value: ($event.target as HTMLInputElement).value })"
                        />
                        <button
                          type="button"
                          class="sm-icon-btn"
                          title="删除条件"
                          :disabled="group.length <= 1 && groupsOf(edit).length <= 1"
                          @click="removeCondition(edit.id, gi, ci)"
                        >
                          <i class="bi bi-x-lg" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button type="button" class="sm-text-btn" @click="addCondition(edit.id, gi)">
                    <i class="bi bi-plus" /> 条件
                  </button>
                </div>
              </template>
            </div>
          </section>

          <section class="sm-block">
            <div class="sm-block-head">
              <span class="sm-block-label"><i class="bi bi-pencil-square" /> 动作</span>
              <button type="button" class="sm-text-btn sm-text-btn--head" @click="addAction(edit.id)">
                <i class="bi bi-plus" /> 动作
              </button>
            </div>

            <div class="sm-rules">
              <div v-for="(action, ai) in edit.actions" :key="ai" class="sm-rule sm-rule--stack">
                <div class="sm-rule-fields">
                  <select
                    class="sm-ctl sm-ctl--path"
                    :value="action.path"
                    :title="pathTip(action.path)"
                    @change="patchAction(edit.id, ai, { path: ($event.target as HTMLSelectElement).value })"
                  >
                    <option value="" disabled>属性</option>
                    <optgroup v-for="grp in pathOptionGroups" :key="grp.label" :label="grp.label">
                      <option
                        v-for="opt in grp.options"
                        :key="`${grp.label}:${opt.path}`"
                        :value="opt.path"
                        :title="opt.description ?? opt.path"
                      >
                        {{ formatPathOptionLabel(opt.path, opt.depth, opt.kind) }}
                      </option>
                    </optgroup>
                  </select>
                  <select
                    class="sm-ctl sm-ctl--op"
                    :value="action.op"
                    @change="patchAction(edit.id, ai, { op: ($event.target as HTMLSelectElement).value as SimpleActionOp })"
                  >
                    <option
                      v-for="op in actionOpsForKind(findSchemaItem(schemaItems, action.path)?.kind ?? 'string')"
                      :key="op.value"
                      :value="op.value"
                    >
                      {{ op.label }}
                    </option>
                  </select>
                  <button type="button" class="sm-icon-btn" title="删除动作" @click="removeAction(edit.id, ai)">
                    <i class="bi bi-x-lg" />
                  </button>
                </div>

                <div v-if="action.op === 'regexReplace'" class="sm-subfields">
                  <input
                    class="sm-ctl"
                    placeholder="正则"
                    :value="action.pattern ?? ''"
                    @input="patchAction(edit.id, ai, { pattern: ($event.target as HTMLInputElement).value })"
                  />
                  <input
                    class="sm-ctl"
                    placeholder="替换为"
                    :value="action.replace ?? ''"
                    @input="patchAction(edit.id, ai, { replace: ($event.target as HTMLInputElement).value })"
                  />
                </div>

                <div
                  v-else-if="actionNeedsValue(action.op) && action.op === 'setValue' && action.path"
                  class="sm-subfields sm-subfields--value"
                >
                  <SchemaValueEditor
                    :key="`set-${edit.id}-${ai}-${action.path}`"
                    :schema-items="schemaItems"
                    :path-order="pathOrder"
                    :path="action.path"
                    :model-value="action.value"
                    compact
                    @update:model-value="(v) => patchAction(edit.id, ai, { value: v })"
                  />
                </div>

                <div
                  v-else-if="actionNeedsValue(action.op) && (action.op === 'add' || action.op === 'subtract')"
                  class="sm-subfields"
                >
                  <input
                    class="sm-ctl"
                    type="number"
                    placeholder="增减量"
                    :value="Number(action.value ?? 0)"
                    @input="patchAction(edit.id, ai, { value: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>

                <div
                  v-else-if="actionNeedsValue(action.op) && (action.op === 'prependList' || action.op === 'appendList') && action.path"
                  class="sm-subfields sm-subfields--value"
                >
                  <SchemaValueEditor
                    :key="`list-${edit.id}-${ai}-${action.path}`"
                    :schema-items="schemaItems"
                    :path-order="pathOrder"
                    :path="action.path"
                    :model-value="coerceToArrayValue(action.value)"
                    compact
                    @update:model-value="(v) => patchAction(edit.id, ai, { value: v })"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.sm {
  --sm-gap: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 12px;
  color: var(--text);
}

.sm-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.sm-count {
  color: var(--text-muted);
  font-size: 11px;
}

.sm-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.sm-btn--primary {
  border-color: #93c5fd;
  background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
  color: var(--primary);
}

.sm-btn--primary:hover {
  background: #dbeafe;
  border-color: #60a5fa;
}

.sm-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px;
  border-radius: 10px;
  border: 1px dashed var(--border);
  background: var(--surface-soft);
  color: var(--text-muted);
  line-height: 1.45;
}

.sm-empty > i {
  flex-shrink: 0;
  font-size: 18px;
  line-height: 1;
  color: #94a3b8;
}

.sm-empty p {
  margin: 0;
}

.sm-empty strong {
  color: var(--text);
  font-weight: 600;
}

.sm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sm-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}

.sm-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-bottom: 1px solid var(--border);
}

.sm-card-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.sm-card-title {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.sm-card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.sm-icon-btn--toggle {
  color: var(--primary);
  font-size: 18px;
}

.sm-icon-btn--toggle-off {
  color: #94a3b8;
}

.sm-card--disabled .sm-card-body {
  opacity: 0.52;
  filter: grayscale(0.35);
  pointer-events: none;
  user-select: none;
}

.sm-card--disabled .sm-card-index {
  background: #94a3b8;
}

.sm-card--disabled .sm-card-title {
  color: #94a3b8;
}

.sm-card-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

@media (max-width: 960px) {
  .sm-card-body {
    grid-template-columns: 1fr;
  }
}

.sm-block {
  padding: 8px 10px 6px;
  min-width: 0;
}

.sm-block + .sm-block {
  border-left: 1px solid var(--border);
}

@media (max-width: 960px) {
  .sm-block + .sm-block {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}

.sm-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.sm-block-head-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.sm-block-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.sm-block-label i {
  font-size: 11px;
  opacity: 0.75;
}

.sm-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #e0e7ff;
  color: #4338ca;
  font-weight: 500;
}

.sm-groups {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sm-cond-group {
  padding: 5px 7px;
  border-radius: 8px;
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.sm-cond-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.sm-cond-group .sm-rules {
  gap: 5px;
}

.sm-cond-group .sm-text-btn {
  margin-top: 2px;
}

.sm-cond-group-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
}

.sm-rules {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sm-rule {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.sm-rule--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 5px 6px;
  border-radius: 6px;
  background: var(--surface-soft);
}

.sm-rule-fields {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.sm-rule-fields--solo {
  flex-wrap: nowrap;
}

/* 与 select 一致，覆盖全局 input 的 10px 圆角 / 外边距 */
.sm input.sm-ctl:not([type="radio"]):not([type="checkbox"]),
.sm select.sm-ctl,
.sm :deep(.sve-ctl),
.sm :deep(.sve-array-input) {
  margin: 0;
  border-radius: 6px;
}

.sm-ctl {
  box-sizing: border-box;
  width: auto;
  height: 26px;
  margin: 0;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  line-height: 1.2;
  color: var(--text);
  min-width: 0;
}

.sm-ctl:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.sm-ctl--op {
  flex: 0 1 108px;
  max-width: 140px;
}

.sm-ctl--path {
  flex: 1 1 160px;
  min-width: 100px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.sm-ctl--val {
  flex: 0 1 88px;
  width: 88px;
}

.sm-subfields {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 0;
}

.sm-subfields .sm-ctl {
  flex: 1;
  min-width: 80px;
}

.sm-subfields--value {
  flex-direction: column;
  width: 100%;
}

.sm-icon-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.sm-icon-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: var(--border);
  color: #64748b;
}

.sm-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.sm-icon-btn--danger:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #fecaca;
  color: var(--danger);
}

.sm-text-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: 4px;
  padding: 2px 4px;
  border: none;
  background: none;
  color: var(--primary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 4px;
}

.sm-text-btn:hover {
  background: #eff6ff;
}

.sm-text-btn--head {
  margin-top: 0;
  flex-shrink: 0;
}

.sm-text-btn--muted {
  color: #94a3b8;
  margin-top: 0;
}

.sm-text-btn--muted:hover {
  background: #f1f5f9;
  color: #64748b;
}
</style>
