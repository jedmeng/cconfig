<script setup lang="ts">
import { computed } from "vue";
import type { SchemaItem } from "../types/config-schema";
import SchemaBoolRadio from "./SchemaBoolRadio.vue";
import {
  coerceToArrayValue,
  defaultValueForKind,
  getArrayElementEnum,
  getArrayElementKind,
  parseScalarInput,
  scalarToInputText,
} from "../utils/simple-modifier-meta";

const props = defineProps<{
  schemaItem?: SchemaItem;
  modelValue: unknown;
  compact?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [unknown] }>();

const elementKind = computed(() => getArrayElementKind(props.schemaItem));
const elementEnum = computed(() => getArrayElementEnum(props.schemaItem));

const entries = computed(() => coerceToArrayValue(props.modelValue));

function emitEntries(next: unknown[]) {
  emit("update:modelValue", next);
}

function patchEntry(index: number, value: unknown) {
  const next = [...entries.value];
  next[index] = value;
  emitEntries(next);
}

function addEntry() {
  emitEntries([...entries.value, defaultValueForKind(elementKind.value)]);
}

function removeEntry(index: number) {
  emitEntries(entries.value.filter((_, i) => i !== index));
}

function moveEntry(index: number, delta: number) {
  const next = [...entries.value];
  const target = index + delta;
  if (target < 0 || target >= next.length) return;
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  emitEntries(next);
}

function onEntryInput(index: number, event: Event) {
  const text = (event.target as HTMLInputElement).value;
  patchEntry(index, parseScalarInput(text, elementKind.value));
}

function onEntrySelect(index: number, event: Event) {
  const text = (event.target as HTMLSelectElement).value;
  const opt = elementEnum.value?.find((v) => String(v) === text);
  patchEntry(index, opt ?? text);
}
</script>

<template>
  <div class="sve-array" :class="{ 'sve-array--compact': compact }">
    <div v-if="!entries.length" class="sve-array-empty">暂无条目</div>
    <div v-for="(_, index) in entries" :key="index" class="sve-array-row">
      <SchemaBoolRadio
        v-if="elementKind === 'boolean'"
        class="sve-array-bool"
        :model-value="entries[index] === true"
        @update:model-value="(v) => patchEntry(index, v)"
      />
      <select
        v-else-if="elementEnum?.length"
        class="sve-ctl sve-array-input"
        :value="String(entries[index] ?? '')"
        @change="onEntrySelect(index, $event)"
      >
        <option v-for="opt in elementEnum" :key="String(opt)" :value="String(opt)">{{ opt }}</option>
      </select>
      <input
        v-else
        class="sve-ctl sve-array-input"
        :type="elementKind === 'number' ? 'number' : 'text'"
        :value="scalarToInputText(entries[index], elementKind)"
        :placeholder="elementKind === 'object' ? 'JSON 对象' : '条目值'"
        @input="onEntryInput(index, $event)"
      />
      <div class="sve-array-actions">
        <button
          type="button"
          class="sve-array-btn"
          title="上移"
          :disabled="index === 0"
          @click="moveEntry(index, -1)"
        >
          <i class="bi bi-arrow-up" />
        </button>
        <button
          type="button"
          class="sve-array-btn"
          title="下移"
          :disabled="index === entries.length - 1"
          @click="moveEntry(index, 1)"
        >
          <i class="bi bi-arrow-down" />
        </button>
        <button type="button" class="sve-array-btn sve-array-btn--danger" title="删除条目" @click="removeEntry(index)">
          <i class="bi bi-x-lg" />
        </button>
      </div>
    </div>
    <button type="button" class="sve-array-add" @click="addEntry">
      <i class="bi bi-plus-lg" />
      添加条目
    </button>
  </div>
</template>

<style scoped>
.sve-array {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.sve-array--compact {
  gap: 4px;
}

.sve-array-empty {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
}

.sve-array-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.sve-array-input {
  flex: 1;
  min-width: 0;
}

.sve-array-bool {
  flex: 1;
  min-width: 0;
}

.sve-array-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}

.sve-array-btn {
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

.sve-array-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: var(--border);
  color: #64748b;
}

.sve-array-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.sve-array-btn--danger:hover:not(:disabled) {
  color: #dc2626;
  background: #fef2f2;
  border-color: #fecaca;
}

.sve-array-add {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  background: #fff;
  font-size: 11px;
  color: var(--primary);
  cursor: pointer;
}

.sve-array-add:hover {
  background: #eff6ff;
  border-color: #93c5fd;
}

.sve-ctl {
  box-sizing: border-box;
  height: 26px;
  margin: 0;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  line-height: 1.2;
  color: var(--text);
}

.sve-array--compact .sve-ctl,
.sve-array--compact .sve-array-btn {
  height: 26px;
}

.sve-ctl:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
}
</style>
