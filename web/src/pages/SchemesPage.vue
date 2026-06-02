<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { api } from "../api";
import { apiUrl } from "../api-base";
import { showToast } from "../composables/toast";
import { useFlowTrackCardWidth } from "../composables/useFlowTrackCardWidth";
import CodeEditorMonaco from "../components/CodeEditorMonaco.vue";

type Source = { id: string; name: string };
type Modifier = { id: string; name: string };
type Scheme = { id: string; name: string; sourceId: string; modifierIds: string[] };
type PreviewStep = { stepName: string; yaml: string };

type FlowCard =
  | { kind: "source" }
  | { kind: "modifier"; index: number }
  | { kind: "output" };

const props = defineProps<{ schemeId: string }>();
const emit = defineEmits<{
  saved: [string];
  back: [];
}>();

const sources = ref<Source[]>([]);
const modifiers = ref<Modifier[]>([]);
const schemes = ref<Scheme[]>([]);
const previewSteps = ref<PreviewStep[]>([]);
const selectedCardIndex = ref(0);
const isSaving = ref(false);
const isPreviewing = ref(false);

const form = ref({
  name: "scheme-" + Date.now(),
  sourceId: "",
  modifierIds: [] as string[],
});

const selectedScheme = computed(() => schemes.value.find((s) => s.id === props.schemeId) ?? null);
const flowCards = computed<FlowCard[]>(() => {
  const cards: FlowCard[] = [{ kind: "source" }];
  for (let i = 0; i < form.value.modifierIds.length; i++) {
    cards.push({ kind: "modifier", index: i });
  }
  cards.push({ kind: "output" });
  return cards;
});

const flowTrackRef = ref<HTMLElement | null>(null);
const flowCardCount = computed(() => flowCards.value.length);
const { trackStyle: flowTrackStyle } = useFlowTrackCardWidth(flowTrackRef, flowCardCount);

const outputUrl = computed(() => {
  if (!selectedScheme.value) return "";
  return new URL(apiUrl(`/api/output/${selectedScheme.value.id}.yaml`), window.location.origin).href;
});

const previewStepIndex = computed(() => {
  if (previewSteps.value.length === 0) return 0;
  const max = previewSteps.value.length - 1;
  return Math.min(selectedCardIndex.value, max);
});

const selectedPreviewYaml = computed(() => previewSteps.value[previewStepIndex.value]?.yaml ?? "");

const sourceName = computed(() => sources.value.find((s) => s.id === form.value.sourceId)?.name ?? "未选择");

async function load() {
  sources.value = await api<Source[]>("/api/sources");
  modifiers.value = await api<Modifier[]>("/api/modifiers");
  schemes.value = await api<Scheme[]>("/api/schemes");
  if (!form.value.sourceId && sources.value[0]) form.value.sourceId = sources.value[0].id;
  if (selectedScheme.value) syncFromScheme(selectedScheme.value);
  await fetchPreview();
  selectOutputCard();
}

function syncFromScheme(scheme: Scheme) {
  form.value = {
    name: scheme.name,
    sourceId: scheme.sourceId,
    modifierIds: [...scheme.modifierIds],
  };
}

let previewTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => void fetchPreview(), 280);
}

async function fetchPreview() {
  if (!form.value.sourceId) {
    previewSteps.value = [];
    return;
  }
  isPreviewing.value = true;
  try {
    const resp = await api<{ steps: PreviewStep[] }>("/api/schemes/preview", {
      method: "POST",
      body: JSON.stringify({
        sourceId: form.value.sourceId,
        modifierIds: form.value.modifierIds.filter(Boolean),
      }),
    });
    previewSteps.value = resp.steps;
    if (selectedCardIndex.value >= flowCards.value.length) {
      selectedCardIndex.value = Math.max(0, flowCards.value.length - 1);
    }
  } catch (e) {
    previewSteps.value = [];
    showToast(`预览失败：${String(e)}`, "error");
  } finally {
    isPreviewing.value = false;
  }
}

function outputCardIndex() {
  return Math.max(0, flowCards.value.length - 1);
}

function selectOutputCard() {
  selectedCardIndex.value = outputCardIndex();
}

function selectCard(index: number) {
  selectedCardIndex.value = index;
}

/** 在当前环节之前插入修改器 */
function addModifierBefore(beforeIndex: number) {
  const unused = modifiers.value.find((m) => !form.value.modifierIds.includes(m.id));
  const nextId = unused?.id ?? modifiers.value[0]?.id ?? "";
  if (!nextId) {
    showToast("请先在修改器列表中创建修改器", "warning");
    return;
  }
  form.value.modifierIds.splice(beforeIndex, 0, nextId);
  selectedCardIndex.value = beforeIndex + 1;
  schedulePreview();
}

function removeModifier(index: number) {
  form.value.modifierIds.splice(index, 1);
  if (selectedCardIndex.value > index) selectedCardIndex.value -= 1;
  if (selectedCardIndex.value >= flowCards.value.length) {
    selectedCardIndex.value = Math.max(0, flowCards.value.length - 1);
  }
  schedulePreview();
}

function onSourceChange() {
  selectedCardIndex.value = 0;
  schedulePreview();
}

function onModifierChange(index: number) {
  selectedCardIndex.value = index + 1;
  schedulePreview();
}

async function saveScheme() {
  if (isSaving.value) return;
  if (!form.value.sourceId) {
    showToast("请先选择配置源", "warning");
    return;
  }
  if (form.value.modifierIds.some((id) => !id)) {
    showToast("请为每个环节选择修改器", "warning");
    return;
  }
  isSaving.value = true;
  try {
    if (!selectedScheme.value) {
      const created = await api<Scheme>("/api/schemes", { method: "POST", body: JSON.stringify(form.value) });
      emit("saved", created.id);
    } else {
      await api<Scheme>(`/api/schemes/${selectedScheme.value.id}`, {
        method: "PUT",
        body: JSON.stringify(form.value),
      });
    }
    await load();
    showToast("保存成功", "success");
  } finally {
    isSaving.value = false;
  }
}

async function copyOutputUrl() {
  if (!outputUrl.value) return;
  try {
    await navigator.clipboard.writeText(outputUrl.value);
    showToast("URL 已复制", "success");
  } catch {
    showToast("复制失败，请手动复制", "error");
  }
}

watch(
  () => props.schemeId,
  async () => {
    if (selectedScheme.value) syncFromScheme(selectedScheme.value);
    await fetchPreview();
    selectOutputCard();
  },
);

onMounted(() => void load());
</script>

<template>
  <div class="panel editor-page">
    <div class="editor-body editor-body--stack">
    <div class="scheme-form-top">
    <div class="form-field name-field">
      <h4 class="field-title">方案名称</h4>
      <input v-model="form.name" />
    </div>

    <div class="form-field">
      <h4 class="field-title">配置链接</h4>
      <section class="soft-panel soft-panel--spaced">
        <div v-if="selectedScheme" class="url-box">
          <code class="url-text">{{ outputUrl }}</code>
          <button type="button" class="btn-ghost btn-sm" @click="copyOutputUrl">复制</button>
        </div>
        <div v-else class="url-placeholder">保存方案后将生成可访问的最终配置文件 URL</div>
      </section>
    </div>

    <div class="form-field">
      <h4 class="field-title">修改链路</h4>
      <section class="flow-section">
      <div ref="flowTrackRef" class="flow-track flow-track--responsive" :style="flowTrackStyle">
        <template v-for="(card, cardIndex) in flowCards" :key="`${card.kind}-${cardIndex}`">
          <div v-if="cardIndex > 0" class="flow-arrow" aria-hidden="true">
            <i class="bi bi-arrow-right"></i>
          </div>

          <div
            class="flow-card"
            :class="{
              active: selectedCardIndex === cardIndex,
              'flow-card--source': card.kind === 'source',
              'flow-card--modifier': card.kind === 'modifier',
              'flow-card--output': card.kind === 'output',
            }"
            @click="selectCard(cardIndex)"
          >
            <template v-if="card.kind === 'source'">
              <div class="flow-card-body">
                <div class="flow-card-badge">起点</div>
                <div class="flow-card-title"><i class="bi bi-hdd-stack"></i> 配置源</div>
                <select v-model="form.sourceId" @click.stop @change="onSourceChange">
                  <option v-for="s in sources" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
                <div class="flow-card-foot">{{ sourceName }}</div>
              </div>
            </template>

            <template v-else-if="card.kind === 'modifier'">
              <div class="flow-card-body">
                <div class="flow-card-badge">修改器 {{ card.index + 1 }}</div>
                <div class="flow-card-title"><i class="bi bi-sliders"></i> 修改环节</div>
                <select
                  v-model="form.modifierIds[card.index]"
                  @click.stop
                  @change="onModifierChange(card.index)"
                >
                  <option value="">请选择修改器</option>
                  <option v-for="m in modifiers" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
              </div>
              <div class="flow-card-footer" @click.stop>
                <button type="button" class="btn-ghost btn-sm" @click="addModifierBefore(card.index)">添加</button>
                <button type="button" class="btn-danger btn-sm" @click="removeModifier(card.index)">删除</button>
              </div>
            </template>

            <template v-else>
              <div class="flow-card-body">
                <div class="flow-card-badge">终点</div>
                <div class="flow-card-title"><i class="bi bi-box-arrow-right"></i> 最终输出</div>
                <div class="flow-card-desc">应用全部修改器后的 YAML 结果</div>
              </div>
              <div class="flow-card-footer" @click.stop>
                <button type="button" class="btn-ghost btn-sm" @click="addModifierBefore(form.modifierIds.length)">添加</button>
              </div>
            </template>
          </div>
        </template>
      </div>
    </section>
    </div>
    </div>

    <section class="preview-section">
      <h4 class="field-title">配置预览</h4>
      <div class="yaml-preview-wrap">
        <CodeEditorMonaco
          :model-value="selectedPreviewYaml"
          path-hint="scheme-step-preview"
          language="yaml"
          readonly
          borderless
          height="100%"
        />
      </div>
    </section>
    </div>

  </div>

  <Teleport to="#page-header-actions">
    <div class="page-header-actions">
      <button type="button" class="btn-muted" data-header-action="back" @click="emit('back')">返回列表</button>
      <button
        type="button"
        data-header-action="save"
        :class="{ submitting: isSaving }"
        :disabled="isSaving"
        @click="saveScheme"
      >
        {{ isSaving ? "保存中..." : "保存" }}
      </button>
    </div>
  </Teleport>
</template>
