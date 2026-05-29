<script setup lang="ts">
import { computed, watch } from "vue";
import type { SchemaItem } from "../types/config-schema";
import SchemaArrayListEditor from "./SchemaArrayListEditor.vue";
import SchemaBoolRadio from "./SchemaBoolRadio.vue";
import {
  coerceValueForSchemaKind,
  findSchemaItem,
  objectChildPaths,
  parseScalarInput,
  scalarToInputText,
  valueMatchesSchemaKind,
} from "../utils/simple-modifier-meta";

const props = defineProps<{
  schemaItems: SchemaItem[];
  pathOrder?: string[];
  path: string;
  modelValue: unknown;
  compact?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [unknown] }>();

const item = computed(() => findSchemaItem(props.schemaItems, props.path));
const kind = computed(() => item.value?.kind ?? "string");
const objectChildren = computed(() =>
  kind.value === "object" ? objectChildPaths(props.schemaItems, props.path, props.pathOrder) : [],
);

function patchObject(key: string, value: unknown) {
  const base =
    props.modelValue && typeof props.modelValue === "object" && !Array.isArray(props.modelValue)
      ? { ...(props.modelValue as Record<string, unknown>) }
      : {};
  base[key] = value;
  emit("update:modelValue", base);
}

function onScalarInput(event: Event) {
  const text = (event.target as HTMLInputElement).value;
  emit("update:modelValue", parseScalarInput(text, kind.value));
}

const normalizedValue = computed(() => coerceValueForSchemaKind(props.modelValue, kind.value));

watch(
  () => [props.path, props.modelValue, kind.value] as const,
  () => {
    if (!item.value) return;
    if (!valueMatchesSchemaKind(props.modelValue, kind.value)) {
      emit("update:modelValue", normalizedValue.value);
    }
  },
  { immediate: true },
);

const boolValue = computed({
  get: () => normalizedValue.value === true,
  set: (v: boolean) => emit("update:modelValue", v),
});
</script>

<template>
  <div class="sve" :class="{ 'sve--compact': compact }">
    <div v-if="!item" class="sve-hint">请先选择属性</div>
    <template v-else-if="kind === 'boolean'">
      <SchemaBoolRadio v-model="boolValue" />
    </template>
    <template v-else-if="kind === 'object'">
      <div class="sve-object">
        <div v-for="child in objectChildren" :key="child.path" class="sve-object-row">
          <label class="sve-object-label" :title="child.description ?? ''">{{ child.path.split(".").pop() }}</label>
          <SchemaValueEditor
            :schema-items="schemaItems"
            :path-order="pathOrder"
            :path="child.path"
            :compact="compact"
            :model-value="
              coerceValueForSchemaKind(
                (modelValue as Record<string, unknown>)?.[child.path.split('.').pop()!],
                child.kind,
              )
            "
            @update:model-value="(v) => patchObject(child.path.split('.').pop()!, v)"
          />
        </div>
        <template v-if="!objectChildren.length">
          <p class="sve-hint">无子字段定义</p>
          <input
            class="sve-ctl sve-ctl--mono"
            type="text"
            placeholder="JSON 对象"
            :value="scalarToInputText(normalizedValue, 'object')"
            @input="onScalarInput"
          />
        </template>
      </div>
    </template>
    <template v-else-if="kind === 'array'">
      <SchemaArrayListEditor
        :schema-item="item"
        :model-value="normalizedValue"
        :compact="compact"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </template>
    <template v-else-if="item.enum?.length">
      <select class="sve-ctl" :value="String(normalizedValue ?? '')" @change="onScalarInput">
        <option v-for="opt in item.enum" :key="String(opt)" :value="String(opt)">{{ opt }}</option>
      </select>
    </template>
    <template v-else>
      <input
        v-if="kind === 'number'"
        class="sve-ctl"
        type="number"
        :value="scalarToInputText(normalizedValue, 'number')"
        @input="onScalarInput"
      />
      <input
        v-else
        class="sve-ctl"
        type="text"
        :value="scalarToInputText(normalizedValue, 'string')"
        @input="onScalarInput"
      />
    </template>
  </div>
</template>

<style scoped>
.sve--compact .sve-ctl {
  height: 26px;
  font-size: 12px;
}

.sve-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
}

.sve-ctl {
  box-sizing: border-box;
  width: 100%;
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

.sve-ctl--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.sve-ctl:focus {
  outline: none;
  border-color: #60a5fa;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
}

.sve-object {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
}

.sve--compact .sve-object {
  padding: 5px 6px;
  gap: 5px;
}

.sve-object-row {
  display: grid;
  grid-template-columns: minmax(72px, 28%) 1fr;
  gap: 4px 8px;
  align-items: center;
}

.sve-object-label {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
