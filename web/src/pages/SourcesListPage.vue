<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";

type SourceKind = "http" | "upload" | "template";
type Source = {
  id: string;
  name: string;
  kind: SourceKind;
  lastFetchedAt?: string;
};

const emit = defineEmits<{
  edit: [string];
  create: [];
}>();
const sources = ref<Source[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    sources.value = await api<Source[]>("/api/sources");
  } finally {
    loading.value = false;
  }
}

function selectSource(id: string) {
  emit("edit", id);
}

function createSource() {
  emit("create");
}

async function removeSource(source: Source) {
  const confirmed = window.confirm(`确认删除配置源「${source.name}」吗？`);
  if (!confirmed) return;
  await api(`/api/sources/${source.id}`, { method: "DELETE" });
  await load();
}

function kindLabel(kind: SourceKind): string {
  if (kind === "http") return "URL拉取";
  if (kind === "upload") return "本地上传";
  return "在线编辑";
}

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}:${ss}`;
}

onMounted(() => void load());
</script>

<template>
  <div class="panel list-page-panel list-page-panel--sources">
    <div class="list-toolbar">
      <div class="list-count">
        <i class="bi bi-hdd-stack"></i>
        <span>共 {{ sources.length }} 个配置源</span>
      </div>
      <button class="list-create-btn" @click="createSource">
        <span class="list-create-btn-full">新建配置源</span>
        <span class="list-create-btn-short">新建</span>
      </button>
    </div>

    <div v-if="loading" class="empty-wrap">
      <div class="empty-title">加载中...</div>
      <div class="empty-desc">正在获取配置源列表。</div>
    </div>

    <div v-else-if="sources.length === 0" class="empty-wrap">
      <div class="empty-icon">🗂️</div>
      <div class="empty-title">暂无配置源</div>
      <div class="empty-desc">点击右上角“新建配置源”，开始创建你的第一个配置源。</div>
    </div>

    <div v-else class="card-list">
      <div
        v-for="source in sources"
        :key="source.id"
        class="card-item card-item--clickable"
        @click="selectSource(source.id)"
      >
        <div class="card-item-main">
          <div class="card-item-title-row">
            <div class="card-item-title">{{ source.name }}</div>
            <div class="card-item-tags">
              <span class="pill-tag pill-tag--muted">{{ kindLabel(source.kind) }}</span>
            </div>
          </div>
          <div class="card-item-meta">
            <span>最后更新时间：{{ formatDateTime(source.lastFetchedAt) }}</span>
          </div>
        </div>
        <div class="card-actions" @click.stop>
          <button @click="selectSource(source.id)">编辑</button>
          <button class="btn-danger" @click="removeSource(source)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>
