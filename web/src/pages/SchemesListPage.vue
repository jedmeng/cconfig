<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { showToast } from "../composables/toast";

type Scheme = {
  id: string;
  name: string;
  sourceId: string;
  modifierIds: string[];
};
type Source = { id: string; name: string };

const emit = defineEmits<{
  edit: [string];
  create: [];
}>();
const schemes = ref<Scheme[]>([]);
const sources = ref<Source[]>([]);
const loading = ref(false);

function outputUrl(schemeId: string): string {
  return `${window.location.origin}/api/output/${schemeId}.yaml`;
}

function sourceName(sourceId: string): string {
  if (!sourceId) return "-";
  return sources.value.find((s) => s.id === sourceId)?.name ?? "未知配置源";
}

async function load() {
  loading.value = true;
  try {
    const [schemeList, sourceList] = await Promise.all([
      api<Scheme[]>("/api/schemes"),
      api<Source[]>("/api/sources"),
    ]);
    schemes.value = schemeList;
    sources.value = sourceList;
  } finally {
    loading.value = false;
  }
}

function selectScheme(id: string) {
  emit("edit", id);
}

function createScheme() {
  emit("create");
}

async function copyLink(schemeId: string) {
  try {
    await navigator.clipboard.writeText(outputUrl(schemeId));
    showToast("链接已复制", "success");
  } catch {
    showToast("复制失败，请手动复制", "error");
  }
}

async function removeScheme(id: string) {
  const target = schemes.value.find((item) => item.id === id);
  const confirmed = window.confirm(`确认删除配置方案「${target?.name ?? id}」吗？`);
  if (!confirmed) return;
  await api<{ ok: boolean }>(`/api/schemes/${id}`, { method: "DELETE" });
  await load();
}

onMounted(() => void load());
</script>

<template>
  <div class="panel list-page-panel">
    <div class="list-toolbar">
      <div class="list-count">
        <i class="bi bi-diagram-3"></i>
        <span>共 {{ schemes.length }} 个配置方案</span>
      </div>
      <button @click="createScheme">新建配置方案</button>
    </div>

    <div v-if="loading" class="empty-wrap">
      <div class="empty-title">加载中...</div>
      <div class="empty-desc">正在获取配置方案列表。</div>
    </div>

    <div v-else-if="schemes.length === 0" class="empty-wrap">
      <div class="empty-icon">🧭</div>
      <div class="empty-title">暂无配置方案</div>
      <div class="empty-desc">点击右上角“新建配置方案”，开始创建你的第一个方案。</div>
    </div>

    <div v-else class="card-list">
      <div v-for="scheme in schemes" :key="scheme.id" class="card-item">
        <div class="card-item-main">
          <div class="card-item-title">{{ scheme.name }}</div>
          <div class="card-item-meta">
            <span>配置源：{{ sourceName(scheme.sourceId) }}</span>
            <span>关联修改器：{{ scheme.modifierIds.length }}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-ghost" @click="copyLink(scheme.id)">复制链接</button>
          <button @click="selectScheme(scheme.id)">编辑</button>
          <button class="btn-danger" @click="removeScheme(scheme.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>
