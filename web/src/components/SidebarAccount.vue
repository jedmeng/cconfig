<script setup lang="ts">
defineProps<{
  collapsed: boolean;
  username: string;
  email?: string;
  avatarUrl: string;
}>();

const emit = defineEmits<{
  logout: [];
}>();
</script>

<template>
  <div class="sidebar-account" :class="{ collapsed }">
    <div class="sidebar-account-main">
      <img class="sidebar-account-avatar" :src="avatarUrl" :alt="username" width="32" height="32" />
      <div v-if="!collapsed" class="sidebar-account-body">
        <span class="sidebar-account-name" :title="username">{{ username }}</span>
        <span v-if="email" class="sidebar-account-email" :title="email">{{ email }}</span>
      </div>
      <button
        type="button"
        class="sidebar-account-logout"
        title="退出登录"
        aria-label="退出登录"
        @click="emit('logout')"
      >
        <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</template>
