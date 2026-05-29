<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";

type Modifier = {
  id: string;
  name: string;
  simpleEdits?: Array<{ id: string; kind: string }>;
  ruleEdits?: Array<{ path: string; op: string; value?: unknown }>;
  codeEdits: Array<{ path: string; code: string }>;
  classCode?: string;
  classCodeEnabled?: boolean;
};

const emit = defineEmits<{
  edit: [string];
}>();
const modifiers = ref<Modifier[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    modifiers.value = await api<Modifier[]>("/api/modifiers");
  } finally {
    loading.value = false;
  }
}

function selectModifier(id: string) {
  emit("edit", id);
}

async function createModifier() {
  const created = await api<Modifier>("/api/modifiers", {
    method: "POST",
    body: JSON.stringify({
      name: `modifier-${Date.now()}`,
      simpleEdits: [],
      ruleEdits: [],
      codeEdits: [],
      classCode: "",
      classCodeEnabled: false,
    }),
  });
  emit("edit", created.id);
  await load();
}

async function removeModifier(id: string) {
  const target = modifiers.value.find((x) => x.id === id);
  const confirmed = window.confirm(`确认删除修改器「${target?.name ?? id}」吗？`);
  if (!confirmed) return;
  await api<{ ok: boolean }>(`/api/modifiers/${id}`, { method: "DELETE" });
  await load();
}

onMounted(() => void load());
</script>

<template>
  <div class="panel list-page-panel">
    <div class="list-toolbar">
      <div class="list-count">
        <i class="bi bi-sliders"></i>
        <span>共 {{ modifiers.length }} 个修改器</span>
      </div>
      <button @click="createModifier">新建修改器</button>
    </div>

    <div v-if="loading" class="empty-wrap">
      <div class="empty-title">加载中...</div>
      <div class="empty-desc">正在获取修改器列表。</div>
    </div>

    <div v-else-if="modifiers.length === 0" class="empty-wrap">
      <div class="empty-icon">🧩</div>
      <div class="empty-title">暂无修改器</div>
      <div class="empty-desc">点击右上角“新建修改器”，开始创建你的第一个修改器。</div>
    </div>

    <div v-else class="card-list">
      <div v-for="item in modifiers" :key="item.id" class="card-item">
        <div class="card-item-main">
          <div class="card-item-title">{{ item.name }}</div>
          <div class="card-item-meta">
            <span class="pill-tag">简单修改 {{ item.simpleEdits?.length ?? item.ruleEdits?.length ?? 0 }}</span>
            <span class="pill-tag">代码片段 {{ item.codeEdits.length }}</span>
            <span
              v-if="item.classCodeEnabled === true || (item.classCodeEnabled !== false && item.classCode?.trim())"
              class="pill-tag"
            >
              代码修改器已启用
            </span>
          </div>
        </div>
        <div class="card-actions">
          <button @click="selectModifier(item.id)">编辑</button>
          <button class="btn-danger" @click="removeModifier(item.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>
