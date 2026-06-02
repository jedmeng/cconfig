<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { api } from "../api";
import { apiUrl } from "../api-base";
import { showToast } from "../composables/toast";
import CodeEditorMonaco from "../components/CodeEditorMonaco.vue";
import SimpleModifierPanel from "../components/SimpleModifierPanel.vue";
import type { SchemaItem } from "../types/config-schema";
import type { SimpleEdit } from "../types/simple-modifier";
import { buildDefaultEditorClassCode, extractEditorClassCode } from "../utils/modifier-codegen";
import { normalizeSimpleEdit } from "../utils/simple-modifier-meta";

type Modifier = {
  id: string;
  name: string;
  simpleEdits: SimpleEdit[];
  codeEdits: Array<{ path: string; code: string }>;
  classCode?: string;
  classCodeEnabled?: boolean;
  ruleEdits?: unknown[];
};
type Source = { id: string; name: string; cachedYaml?: string };

const props = defineProps<{ modifierId: string }>();
const emit = defineEmits<{ back: [] }>();
const schemaItems = ref<SchemaItem[]>([]);
const schemaPathOrder = ref<string[]>([]);
const typeDefinition = ref("");
const sources = ref<Source[]>([]);
const modifiers = ref<Modifier[]>([]);
const activeTab = ref<"simple" | "code" | "preview">("simple");
const selectedSourceId = ref("");
const previewFinalYaml = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const isPreviewing = ref(false);
const initialClassCode = ref("");
const form = ref({
  name: "",
  classCode: "",
  classCodeEnabled: false,
  simpleEdits: [] as SimpleEdit[],
  codeEdits: [] as Modifier["codeEdits"],
});

function resolveClassCodeEnabled(modifier: Modifier): boolean {
  if (modifier.classCodeEnabled === false) return false;
  if (modifier.classCodeEnabled === true) return true;
  return Boolean(modifier.classCode?.trim());
}

function refreshInitialClassCode() {
  if (schemaItems.value.length) {
    initialClassCode.value = buildDefaultEditorClassCode(schemaItems.value);
  }
}

const selectedModifier = computed(() => modifiers.value.find((m) => m.id === props.modifierId) ?? null);
const editorState = computed(() => {
  if (!props.modifierId) return "no-id" as const;
  if (isLoading.value) return "loading" as const;
  if (!selectedModifier.value) return "not-found" as const;
  return "ready" as const;
});

async function load() {
  isLoading.value = true;
  try {
    const schema = await api<{ items: SchemaItem[]; pathOrder: string[] }>("/api/config/schema");
    schemaPathOrder.value = schema.pathOrder ?? schema.items.map((i) => i.path);
    schemaItems.value = schema.items;
    refreshInitialClassCode();
    typeDefinition.value = await fetch(apiUrl("/api/config/modifier-types.d.ts"), {
      credentials: "include",
    }).then((r) => r.text());
    sources.value = await api<Source[]>("/api/sources");
    if (!selectedSourceId.value && sources.value[0]) selectedSourceId.value = sources.value[0].id;
    await refreshModifiers();
  } finally {
    isLoading.value = false;
  }
}

function syncFromModifier(modifier: Modifier) {
  refreshInitialClassCode();
  form.value = {
    name: modifier.name,
    classCode: extractEditorClassCode(modifier.classCode, schemaItems.value),
    classCodeEnabled: resolveClassCodeEnabled(modifier),
    simpleEdits: (modifier.simpleEdits ?? []).map((e) =>
      normalizeSimpleEdit(e as SimpleEdit & { kind?: string }),
    ),
    codeEdits: modifier.codeEdits ?? [],
  };
}

function restoreClassCode() {
  const first = window.confirm("确定将代码修改器还原为初始模板吗？");
  if (!first) return;
  const second = window.confirm("再次确认：当前编辑器中的代码将被替换为初始模板，未保存的修改将丢失。");
  if (!second) return;
  form.value.classCode = initialClassCode.value;
  showToast("已还原为初始模板", "success");
}

async function refreshModifiers() {
  modifiers.value = await api<Modifier[]>("/api/modifiers");
  if (selectedModifier.value) syncFromModifier(selectedModifier.value);
}

async function saveModifier() {
  if (!selectedModifier.value) return;
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    await api(`/api/modifiers/${selectedModifier.value.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: form.value.name,
        simpleEdits: form.value.simpleEdits,
        ruleEdits: [],
        codeEdits: form.value.codeEdits,
        classCode: form.value.classCode,
        classCodeEnabled: form.value.classCodeEnabled,
      }),
    });
    await refreshModifiers();
    showToast("保存成功", "success");
    if (activeTab.value === "preview") void previewModifier();
  } finally {
    isSaving.value = false;
  }
}

async function previewModifier() {
  if (!selectedModifier.value || !selectedSourceId.value) return;
  if (isPreviewing.value) return;
  isPreviewing.value = true;
  try {
    const resp = await api<{ finalYaml: string }>(
      `/api/modifiers/${selectedModifier.value.id}/preview?sourceId=${encodeURIComponent(selectedSourceId.value)}`,
      {
        method: "POST",
        body: JSON.stringify({
          simpleEdits: form.value.simpleEdits,
          ruleEdits: [],
          codeEdits: form.value.codeEdits,
          classCode: form.value.classCode,
          classCodeEnabled: form.value.classCodeEnabled,
        }),
      },
    );
    previewFinalYaml.value = resp.finalYaml;
  } catch {
    previewFinalYaml.value = "";
  } finally {
    isPreviewing.value = false;
  }
}

watch(
  () => props.modifierId,
  async (id) => {
    if (!id) return;
    if (modifiers.value.length === 0) {
      await load();
      return;
    }
    if (selectedModifier.value) syncFromModifier(selectedModifier.value);
  },
);

watch(
  () => activeTab.value,
  (tab) => {
    if (tab === "preview") void previewModifier();
  },
);

watch(
  () => selectedSourceId.value,
  () => {
    if (activeTab.value === "preview") void previewModifier();
  },
);

watch(
  () => form.value.classCodeEnabled,
  () => {
    if (activeTab.value === "preview") void previewModifier();
  },
);

onMounted(() => void load());
</script>

<template>
  <div class="panel editor-page">
    <div v-if="editorState === 'loading'" class="editor-empty">
      <p>加载修改器中...</p>
    </div>
    <div v-else-if="editorState === 'no-id'" class="editor-empty">
      <p>请从修改器列表进入编辑。</p>
      <button class="btn-muted" @click="emit('back')">返回列表</button>
    </div>
    <div v-else-if="editorState === 'not-found'" class="editor-empty">
      <p>未找到该修改器，可能已被删除。</p>
      <button class="btn-muted" @click="emit('back')">返回列表</button>
    </div>
    <template v-else>
      <div class="editor-body editor-body--stack">
        <div class="editor-toolbar">
          <div class="name-field form-field">
            <h4 class="field-title">名称</h4>
            <input v-model="form.name" />
          </div>
        </div>

        <div class="editor-tabs">
          <div class="editor-tab-bar" role="tablist">
            <button
              class="editor-tab"
              role="tab"
              :class="{ active: activeTab === 'simple' }"
              :aria-selected="activeTab === 'simple'"
              @click="activeTab = 'simple'"
            >
              简单修改器
            </button>
            <button
              class="editor-tab"
              role="tab"
              :class="{ active: activeTab === 'code' }"
              :aria-selected="activeTab === 'code'"
              @click="activeTab = 'code'"
            >
              代码修改器
            </button>
            <button
              class="editor-tab"
              role="tab"
              :class="{ active: activeTab === 'preview' }"
              :aria-selected="activeTab === 'preview'"
              @click="activeTab = 'preview'"
            >
              配置预览
            </button>
          </div>

          <div
            class="editor-tab-body"
            :class="{
              'editor-tab-body--code': activeTab === 'code',
              'editor-tab-body--preview': activeTab === 'preview',
              'editor-tab-body--simple': activeTab === 'simple',
            }"
          >
            <template v-if="activeTab === 'simple'">
              <div class="simple-scroll">
                <SimpleModifierPanel
                  v-model="form.simpleEdits"
                  :schema-items="schemaItems"
                  :path-order="schemaPathOrder"
                />
              </div>
            </template>

            <template v-else-if="activeTab === 'code'">
              <div class="code-modifier-toolbar">
                <label class="code-modifier-switch" title="关闭后编译与预览均不应用代码修改器">
                  <input v-model="form.classCodeEnabled" type="checkbox" />
                  <span class="code-modifier-switch-slider" />
                  <span class="code-modifier-switch-label">启用代码修改器</span>
                </label>
                <button type="button" class="btn-muted code-modifier-restore" @click="restoreClassCode">
                  还原初始代码
                </button>
              </div>
              <div class="code-editor-wrap" :class="{ 'code-editor-wrap--disabled': !form.classCodeEnabled }">
                <CodeEditorMonaco
                  v-if="typeDefinition"
                  v-model="form.classCode"
                  path-hint="class-modifier"
                  suppress-unused-checks
                  :readonly="!form.classCodeEnabled"
                  :type-definition="typeDefinition"
                  height="100%"
                  borderless
                />
              </div>
            </template>

            <template v-else>
              <div class="preview-toolbar">
                <div class="preview-source-field">
                  <h4 class="field-title">配置源</h4>
                  <select v-model="selectedSourceId">
                    <option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option>
                  </select>
                </div>
                <span v-if="isPreviewing" class="preview-status">预览中...</span>
              </div>
              <div class="preview-scroll">
                <CodeEditorMonaco
                  v-model="previewFinalYaml"
                  path-hint="modifier-preview"
                  language="yaml"
                  :readonly="true"
                  height="100%"
                  borderless
                />
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>

  <Teleport v-if="editorState === 'ready'" to="#page-header-actions">
    <div class="page-header-actions">
      <button type="button" class="btn-muted" data-header-action="back" @click="emit('back')">返回列表</button>
      <button
        type="button"
        data-header-action="save"
        :class="{ submitting: isSaving }"
        :disabled="isSaving"
        @click="saveModifier"
      >
        {{ isSaving ? "保存中..." : "保存" }}
      </button>
    </div>
  </Teleport>
</template>
