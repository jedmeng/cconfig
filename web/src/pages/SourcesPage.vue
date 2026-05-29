<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { api } from "../api";
import { apiUrl } from "../api-base";
import CodeEditorMonaco from "../components/CodeEditorMonaco.vue";
import { showToast } from "../composables/toast";

type SourceKind = "http" | "upload" | "template";
type ValidationIssue = { path: string; message: string };
type IntervalUnit = "none" | "day" | "hour" | "minute" | "second";

const INTERVAL_UNIT_SECONDS: Record<Exclude<IntervalUnit, "none">, number> = {
  day: 86400,
  hour: 3600,
  minute: 60,
  second: 1,
};
type Source = {
  id: string;
  name: string;
  kind: SourceKind;
  url?: string;
  filePath?: string;
  updateIntervalSeconds: number;
  cachedYaml?: string;
  lastFetchedAt?: string;
};

const props = defineProps<{ sourceId: string }>();
const emit = defineEmits<{
  saved: [string];
  back: [];
}>();

const sources = ref<Source[]>([]);
const previewYaml = ref("");
const isRefreshing = ref(false);
const initialSnapshot = ref("");
const intervalUnit = ref<IntervalUnit>("none");
const intervalValue = ref(0);

const form = ref({
  name: "demo-source",
  kind: "http" as SourceKind,
  url: "",
  updateIntervalSeconds: 0,
  initialYaml: "",
});

const selectedSource = computed(() => sources.value.find((x) => x.id === props.sourceId) ?? null);
const isSelectedReadonly = computed(() => form.value.kind === "http");
const isCreateMode = computed(() => !selectedSource.value);
const previewTitle = computed(() => (form.value.kind === "http" ? "配置预览" : "配置编辑"));
const isDirty = computed(() => buildSnapshot() !== initialSnapshot.value);
const formattedLastFetchedAt = computed(() => formatDateTime(selectedSource.value?.lastFetchedAt));

function buildSnapshot(): string {
  return JSON.stringify({
    sourceId: selectedSource.value?.id ?? "",
    name: form.value.name,
    kind: form.value.kind,
    url: form.value.url,
    updateIntervalSeconds: form.value.updateIntervalSeconds,
    previewYaml: previewYaml.value,
  });
}

function markClean() {
  initialSnapshot.value = buildSnapshot();
}

function secondsToIntervalParts(seconds: number): { unit: IntervalUnit; value: number } {
  if (seconds <= 0) return { unit: "none", value: 0 };
  const candidates: { unit: Exclude<IntervalUnit, "none">; seconds: number }[] = [
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];
  for (const item of candidates) {
    if (seconds % item.seconds === 0) {
      return { unit: item.unit, value: seconds / item.seconds };
    }
  }
  return { unit: "second", value: seconds };
}

function intervalPartsToSeconds(unit: IntervalUnit, value: number): number {
  if (unit === "none") return 0;
  const multiplier = INTERVAL_UNIT_SECONDS[unit];
  const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return n * multiplier;
}

function applyIntervalFromSeconds(seconds: number) {
  const parts = secondsToIntervalParts(seconds);
  intervalUnit.value = parts.unit;
  intervalValue.value = parts.value;
}

function syncIntervalToForm() {
  form.value.updateIntervalSeconds = intervalPartsToSeconds(intervalUnit.value, intervalValue.value);
}

function onIntervalUnitChange() {
  if (intervalUnit.value === "none") {
    intervalValue.value = 0;
  } else if (intervalValue.value <= 0) {
    intervalValue.value = 1;
  }
  syncIntervalToForm();
}

function onIntervalValueChange() {
  if (intervalUnit.value === "none") {
    intervalValue.value = 0;
  }
  syncIntervalToForm();
}

function formatDateTime(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}:${ss}`;
}

function showValidationErrors(errors: ValidationIssue[]) {
  const text = errors
    .slice(0, 5)
    .map((e) => `${e.path ? `${e.path}：` : ""}${e.message}`)
    .join("；");
  showToast(errors.length > 5 ? `${text}…等 ${errors.length} 项` : text, "warning");
}

function effectiveSourceKind(): SourceKind {
  if (selectedSource.value) return selectedSource.value.kind;
  return form.value.kind === "upload" ? "template" : form.value.kind;
}

async function loadConfigTemplate() {
  const { yaml } = await api<{ yaml: string }>("/api/config/template");
  previewYaml.value = yaml;
}

async function validateTemplateYaml(): Promise<boolean> {
  if (effectiveSourceKind() !== "template") return true;
  const resp = await fetch(apiUrl("/api/config/validate"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ yaml: previewYaml.value }),
  });
  if (resp.ok) return true;
  const body = (await resp.json().catch(() => ({}))) as { errors?: ValidationIssue[] };
  if (Array.isArray(body.errors) && body.errors.length) {
    showValidationErrors(body.errors);
    return false;
  }
  showToast("配置校验失败", "warning");
  return false;
}

async function load() {
  sources.value = await api<Source[]>("/api/sources");
  syncFromSelected();
}

function syncFromSelected() {
  if (!selectedSource.value) {
    previewYaml.value = form.value.initialYaml;
    applyIntervalFromSeconds(form.value.updateIntervalSeconds);
    markClean();
    return;
  }
  form.value.name = selectedSource.value.name;
  form.value.kind = selectedSource.value.kind;
  form.value.url = selectedSource.value.url ?? "";
  form.value.updateIntervalSeconds = selectedSource.value.updateIntervalSeconds ?? 0;
  applyIntervalFromSeconds(form.value.updateIntervalSeconds);
  form.value.initialYaml = selectedSource.value.cachedYaml ?? "";
  previewYaml.value = selectedSource.value.cachedYaml ?? "";
  markClean();
}

async function saveCurrentSource() {
  if (!(await validateTemplateYaml())) return;
  try {
  if (!selectedSource.value) {
    const createKind: SourceKind = form.value.kind === "upload" ? "template" : form.value.kind;
    const body: Record<string, unknown> = {
      name: form.value.name,
      kind: createKind,
      updateIntervalSeconds: createKind === "http" ? form.value.updateIntervalSeconds : 0,
      cachedYaml: previewYaml.value,
    };
    if (createKind === "http") body.url = form.value.url;
    const created = await api<Source>("/api/sources", {
      method: "POST",
      body: JSON.stringify(body),
    });
    emit("saved", created.id);
  } else {
    const body: Record<string, unknown> = {
      name: form.value.name,
      updateIntervalSeconds: selectedSource.value.kind === "http" ? form.value.updateIntervalSeconds : 0,
      cachedYaml: previewYaml.value,
    };
    if (selectedSource.value.kind === "http") body.url = form.value.url;
    await api<Source>(`/api/sources/${selectedSource.value.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  await load();
  showToast("保存成功", "success");
  markClean();
  } catch (e) {
    const raw = String(e);
    try {
      const body = JSON.parse(raw) as { errors?: ValidationIssue[] };
      if (Array.isArray(body.errors) && body.errors.length) {
        showValidationErrors(body.errors);
        return;
      }
    } catch {
      // not json error body
    }
    showToast(`保存失败：${raw}`, "error");
  }
}

async function refreshSelectedSource() {
  if (isRefreshing.value) return;
  if (form.value.kind !== "http") {
    showToast("仅 URL 拉取类型支持刷新", "warning");
    return;
  }
  isRefreshing.value = true;
  if (!selectedSource.value) {
    if (!form.value.url.trim()) {
      showToast("请先填写 URL", "warning");
      isRefreshing.value = false;
      return;
    }
    try {
      const refreshed = await api<{ yaml: string; lastFetchedAt: string }>("/api/sources/preview-refresh", {
        method: "POST",
        body: JSON.stringify({ url: form.value.url }),
      });
      previewYaml.value = refreshed.yaml;
      form.value.initialYaml = refreshed.yaml;
      showToast("刷新成功", "success");
    } catch (e) {
      showToast(`刷新失败：${String(e)}`, "error");
    } finally {
      isRefreshing.value = false;
    }
    return;
  }
  if (selectedSource.value.kind !== "http") {
    showToast("仅 URL 拉取类型支持刷新", "warning");
    return;
  }
  try {
    const refreshed = await api<Source>(`/api/sources/${selectedSource.value.id}/refresh`, { method: "POST" });
    await load();
    previewYaml.value = refreshed.cachedYaml ?? "";
    showToast("刷新成功", "success");
  } catch (e) {
    showToast(`刷新失败：${String(e)}`, "error");
  } finally {
    isRefreshing.value = false;
  }
}

function handleUrlBlur() {
  if (form.value.kind !== "http") return;
  void refreshSelectedSource();
}

function goBack() {
  if (isDirty.value) {
    const confirmed = window.confirm("当前有未保存内容，确认返回列表页吗？");
    if (!confirmed) return;
  }
  emit("back");
}

async function handleUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  const text = await file.text();
  form.value.initialYaml = text;
  previewYaml.value = text;
}

watch(
  () => form.value.kind,
  (kind) => {
    if (!isCreateMode.value || kind !== "template") return;
    void loadConfigTemplate();
  },
);

watch(() => props.sourceId, () => syncFromSelected());
onMounted(() => {
  applyIntervalFromSeconds(form.value.updateIntervalSeconds);
  void load().then(() => {
    if (isCreateMode.value && form.value.kind === "template") {
      void loadConfigTemplate();
    }
  });
});
</script>

<template>
  <div class="panel editor-page">
    <div class="editor-body editor-body--stack">
      <div class="source-form-block">
        <div class="form-field">
          <h4 class="field-title">名称</h4>
          <input v-model="form.name" />
        </div>
        <div class="form-field">
          <h4 class="field-title">类型</h4>
          <select v-model="form.kind" :disabled="!isCreateMode">
            <option value="http">URL拉取</option>
            <option value="upload">本地上传</option>
            <option value="template">在线编辑</option>
          </select>
        </div>
        <template v-if="form.kind === 'http'">
          <div class="form-field">
            <h4 class="field-title">URL</h4>
            <input v-model="form.url" placeholder="https://example.com/config.yaml" @blur="handleUrlBlur" />
          </div>
          <div class="form-field">
            <div class="form-row">
              <h4 class="field-title">更新周期</h4>
              <span v-if="formattedLastFetchedAt" class="hint-text hint-text--push">最后更新时间：{{ formattedLastFetchedAt }}</span>
            </div>
            <div class="form-row-inline">
              <select v-model="intervalUnit" @change="onIntervalUnitChange">
                <option value="none">不更新</option>
                <option value="day">日</option>
                <option value="hour">时</option>
                <option value="minute">分</option>
                <option value="second">秒</option>
              </select>
              <input
                v-model.number="intervalValue"
                type="number"
                min="1"
                :disabled="intervalUnit === 'none'"
                @input="onIntervalValueChange"
              />
            </div>
          </div>
        </template>

        <template v-else-if="form.kind === 'upload'">
          <div class="form-field">
            <h4 class="field-title">上传 YAML 文件</h4>
            <input type="file" accept=".yaml,.yml,text/yaml,text/plain" @change="handleUpload" />
          </div>
        </template>

      </div>

      <div class="source-preview-section">
        <div class="preview-head">
          <h4 class="field-title">{{ previewTitle }}</h4>
          <button
            v-if="form.kind === 'http'"
            :disabled="isRefreshing"
            class="btn-icon"
            :class="{ loading: isRefreshing }"
            :title="isRefreshing ? '刷新中' : '刷新'"
            @click="refreshSelectedSource"
          >
            <i class="bi bi-arrow-clockwise" :class="{ spinning: isRefreshing }"></i>
          </button>
        </div>
        <div class="yaml-preview-wrap">
          <CodeEditorMonaco
            v-model="previewYaml"
            path-hint="source-preview"
            language="yaml"
            :readonly="isSelectedReadonly"
            borderless
          />
        </div>
      </div>
    </div>

  </div>

  <Teleport to="#page-header-actions">
    <div class="page-header-actions">
      <button class="btn-muted" @click="goBack">返回列表</button>
      <button @click="saveCurrentSource">保存</button>
    </div>
  </Teleport>
</template>
