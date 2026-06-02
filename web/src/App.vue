<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "./api";
import type { AuthMeResponse } from "./auth-types";
import { isOidcAuthActive } from "./auth-types";
import LoginPage from "./pages/LoginPage.vue";
import SourcesListPage from "./pages/SourcesListPage.vue";
import SourcesPage from "./pages/SourcesPage.vue";
import ModifiersListPage from "./pages/ModifiersListPage.vue";
import ModifiersPage from "./pages/ModifiersPage.vue";
import SchemesListPage from "./pages/SchemesListPage.vue";
import SchemesPage from "./pages/SchemesPage.vue";
import AppToast from "./components/AppToast.vue";
import SidebarAccount from "./components/SidebarAccount.vue";
import { useStickyPageHeaderActions } from "./composables/useStickyPageHeaderActions";

const router = useRouter();
const route = useRoute();
const sidebarCollapsed = ref(false);
const mobileMenuOpen = ref(false);
const isMobile = ref(false);
const oidcEnabled = ref(false);
const currentUser = ref("");
const userEmail = ref("");
const avatarUrl = ref("");

let mobileMediaQuery: MediaQueryList | null = null;

function syncMobileLayout() {
  isMobile.value = mobileMediaQuery?.matches ?? false;
  if (isMobile.value) {
    mobileMenuOpen.value = false;
  }
}

onMounted(async () => {
  mobileMediaQuery = window.matchMedia("(max-width: 768px)");
  syncMobileLayout();
  mobileMediaQuery.addEventListener("change", syncMobileLayout);
  void connectStickyHeaderActions();

  if (route.name === "login") return;
  try {
    const me = await api<AuthMeResponse>("/api/auth/me");
    oidcEnabled.value = me.oidcEnabled;
    if (!isOidcAuthActive(me)) {
      currentUser.value = "";
      userEmail.value = "";
      avatarUrl.value = "";
      return;
    }
    currentUser.value = me.username;
    userEmail.value = me.email ?? "";
    avatarUrl.value = me.avatarUrl;
  } catch {
    oidcEnabled.value = true;
    currentUser.value = "";
    userEmail.value = "";
    avatarUrl.value = "";
  }
});

onUnmounted(() => {
  mobileMediaQuery?.removeEventListener("change", syncMobileLayout);
});

async function logout() {
  if (!oidcEnabled.value) return;
  closeMobileMenu();
  await api("/api/auth/logout", { method: "POST" });
  currentUser.value = "";
  userEmail.value = "";
  avatarUrl.value = "";
  void router.push("/login");
}

function openSourceEditor(id: string) {
  void router.push(`/sources/${encodeURIComponent(id)}`);
}

function openSourceCreator() {
  void router.push("/sources/new");
}

function handleSourceSaved(id: string) {
  void router.replace(`/sources/${encodeURIComponent(id)}`);
}

function openSchemeEditor(id: string) {
  void router.push(`/schemes/${encodeURIComponent(id)}`);
}

function openSchemeCreator() {
  void router.push("/schemes/new");
}

function handleSchemeSaved(id: string) {
  void router.replace(`/schemes/${encodeURIComponent(id)}`);
}

function openModifierEditor(id: string) {
  void router.push(`/modifiers/${encodeURIComponent(id)}`);
}

function isTabActive(group: "sources" | "modifiers" | "schemes") {
  const path = route.path;
  if (group === "sources") return path.startsWith("/sources");
  if (group === "modifiers") return path.startsWith("/modifiers");
  return path.startsWith("/schemes");
}

const routeName = computed(() => String(route.name ?? ""));
const sidebarExpanded = computed(() => !sidebarCollapsed.value || isMobile.value);
const editingSourceId = computed(() => String(route.params.sourceId ?? ""));
const editingModifierId = computed(() => String(route.params.modifierId ?? ""));
const editingSchemeId = computed(() => String(route.params.schemeId ?? ""));

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}

function goSourcesList() {
  closeMobileMenu();
  void router.push("/sources");
}

function goModifiersList() {
  closeMobileMenu();
  void router.push("/modifiers");
}

function goSchemesList() {
  closeMobileMenu();
  void router.push("/schemes");
}

const pageTitle = computed(() => {
  if (routeName.value === "sources-list") return "配置源列表";
  if (routeName.value === "sources-edit") return "编辑配置源";
  if (routeName.value === "sources-create") return "新建配置源";
  if (routeName.value === "modifiers-list") return "修改器列表";
  if (routeName.value === "modifiers-edit") return "修改器编辑";
  if (routeName.value === "schemes-list") return "配置方案列表";
  if (routeName.value === "schemes-edit") return "编辑配置方案";
  if (routeName.value === "schemes-create") return "新建配置方案";
  return "CConfig";
});

const pageDescription = computed(() => {
  if (routeName.value === "sources-list") return "管理 YAML 配置源，并进入编辑页维护详情。";
  if (routeName.value === "sources-edit" || routeName.value === "sources-create") return "维护配置源拉取方式、刷新策略与 YAML 内容。";
  if (routeName.value === "modifiers-list") return "管理修改器并进入编辑页维护详情。";
  if (routeName.value === "modifiers-edit") return "通过可视化或代码方式调整配置字段。";
  if (routeName.value === "schemes-list") return "管理配置方案并进入方案装配流程。";
  if (routeName.value === "schemes-edit" || routeName.value === "schemes-create") return "组合配置源与修改器，通过配置预览查看各步骤结果。";
  return "配置管理工作台";
});

const isEditorPage = computed(() => {
  const name = routeName.value;
  return (
    name === "sources-edit" ||
    name === "sources-create" ||
    name === "modifiers-edit" ||
    name === "schemes-edit" ||
    name === "schemes-create"
  );
});

const contentRef = ref<HTMLElement | null>(null);
const stickyHeaderEnabled = computed(() => isMobile.value && isEditorPage.value);

const { headerActionsInView, connect: connectStickyHeaderActions, triggerHeaderAction } =
  useStickyPageHeaderActions({
    enabled: stickyHeaderEnabled,
    scrollRoot: contentRef,
  });

const showStickyTopbarActions = computed(
  () => stickyHeaderEnabled.value && !headerActionsInView.value,
);

watch(routeName, () => {
  void connectStickyHeaderActions();
});
</script>

<template>
  <LoginPage v-if="routeName === 'login'" />
  <div
    v-else
    class="layout"
    :class="{ collapsed: sidebarCollapsed && !isMobile, 'mobile-menu-open': mobileMenuOpen }"
  >
    <header class="mobile-topbar">
      <button
        type="button"
        class="mobile-menu-btn"
        :aria-expanded="mobileMenuOpen"
        aria-controls="app-sidebar"
        :aria-label="mobileMenuOpen ? '关闭菜单' : '打开菜单'"
        @click="mobileMenuOpen = !mobileMenuOpen"
      >
        <i class="bi" :class="mobileMenuOpen ? 'bi-x-lg' : 'bi-list'" aria-hidden="true"></i>
      </button>
      <div class="mobile-topbar-brand">
        <div class="brand-logo brand-logo--sm" aria-hidden="true">
          <span class="brand-logo-grid"></span>
          <span class="brand-logo-core"></span>
        </div>
        <div class="mobile-topbar-copy">
          <strong>CConfig</strong>
          <span>{{ pageTitle }}</span>
        </div>
      </div>
      <div v-if="showStickyTopbarActions" class="mobile-topbar-actions">
        <button
          type="button"
          class="mobile-topbar-action"
          aria-label="返回列表"
          @click="triggerHeaderAction('back')"
        >
          <i class="bi bi-arrow-left" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="mobile-topbar-action mobile-topbar-action--primary"
          aria-label="保存"
          @click="triggerHeaderAction('save')"
        >
          <i class="bi bi-check-lg" aria-hidden="true"></i>
        </button>
      </div>
    </header>
    <div
      v-if="mobileMenuOpen"
      class="mobile-menu-backdrop"
      aria-hidden="true"
      @click="closeMobileMenu"
    ></div>
    <aside id="app-sidebar" class="sidebar">
      <div v-if="sidebarExpanded && !isMobile" class="sidebar-brand">
        <div class="brand-logo" aria-hidden="true">
          <span class="brand-logo-grid"></span>
          <span class="brand-logo-core"></span>
        </div>
        <div class="brand-copy">
          <h2>CConfig</h2>
          <p>Config Studio</p>
        </div>
      </div>
      <button
        :class="{ active: isTabActive('sources') }"
        :title="sidebarExpanded ? '' : '配置源'"
        @click="goSourcesList"
      >
        <i class="bi bi-hdd-stack icon"></i>
        <span v-if="sidebarExpanded">配置源</span>
      </button>
      <button
        :class="{ active: isTabActive('modifiers') }"
        :title="sidebarExpanded ? '' : '修改器'"
        @click="goModifiersList"
      >
        <i class="bi bi-sliders icon"></i>
        <span v-if="sidebarExpanded">修改器</span>
      </button>
      <button
        :class="{ active: isTabActive('schemes') }"
        :title="sidebarExpanded ? '' : '配置方案'"
        @click="goSchemesList"
      >
        <i class="bi bi-diagram-3 icon"></i>
        <span v-if="sidebarExpanded">配置方案</span>
      </button>
      <div class="sidebar-footer">
        <SidebarAccount
          v-if="oidcEnabled && currentUser && avatarUrl"
          :collapsed="sidebarCollapsed && !isMobile"
          :username="currentUser"
          :email="userEmail || undefined"
          :avatar-url="avatarUrl"
          @logout="logout"
        />
        <div v-if="sidebarExpanded" class="sidebar-footnote">Powered by Jedm</div>
      </div>
      <button
        v-if="!isMobile"
        class="collapse-btn"
        :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
        <span class="collapse-chevron">{{ sidebarCollapsed ? "›" : "‹" }}</span>
      </button>
    </aside>
    <main ref="contentRef" class="content">
      <div class="content-header" :class="{ 'content-header--editor': isEditorPage }">
        <div class="content-header-text">
          <h2>{{ pageTitle }}</h2>
          <p>{{ pageDescription }}</p>
        </div>
        <div id="page-header-actions" class="content-header-actions"></div>
      </div>
      <div class="content-shell">
        <div class="app-toast-layer" aria-hidden="false">
          <AppToast />
        </div>
        <SourcesListPage
          v-if="routeName === 'sources-list'"
          @edit="openSourceEditor"
          @create="openSourceCreator"
        />
        <SourcesPage
          v-else-if="routeName === 'sources-edit' || routeName === 'sources-create'"
          :source-id="editingSourceId"
          @saved="handleSourceSaved"
          @back="goSourcesList"
        />
        <ModifiersListPage v-else-if="routeName === 'modifiers-list'" @edit="openModifierEditor" />
        <ModifiersPage
          v-else-if="routeName === 'modifiers-edit'"
          :key="editingModifierId"
          :modifier-id="editingModifierId"
          @back="goModifiersList"
        />
        <SchemesListPage
          v-else-if="routeName === 'schemes-list'"
          @edit="openSchemeEditor"
          @create="openSchemeCreator"
        />
        <SchemesPage
          v-else-if="routeName === 'schemes-edit' || routeName === 'schemes-create'"
          :scheme-id="editingSchemeId"
          @saved="handleSchemeSaved"
          @back="goSchemesList"
        />
        <div v-else class="panel">未找到页面，请从侧栏重新进入。</div>
      </div>
    </main>
  </div>
</template>

