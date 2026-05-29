<script setup lang="ts">
import { useRoute } from "vue-router";
import { apiUrl } from "../api-base";

const route = useRoute();

function resolveReturnTo(): string {
  const raw = String(route.query.returnTo ?? "/sources");
  return new URL(raw, window.location.origin).href;
}

function login() {
  const returnTo = encodeURIComponent(resolveReturnTo());
  window.location.href = `${apiUrl("/api/auth/oidc/start")}?returnTo=${returnTo}`;
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="brand-logo login-brand-logo" aria-hidden="true">
          <span class="brand-logo-grid"></span>
          <span class="brand-logo-core"></span>
        </div>
        <div class="login-brand-copy">
          <h1>CConfig</h1>
          <p>Config Studio</p>
        </div>
      </div>

      <p class="login-lead">使用企业账号登录，管理C软件配置源。</p>

      <button type="button" class="login-btn" @click="login">
        <i class="bi bi-shield-lock" aria-hidden="true"></i>
        登录
      </button>

      <p class="login-footnote">通过 Authelia 安全认证</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.login-card {
  width: min(420px, 100%);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: calc(var(--radius) + 4px);
  box-shadow: var(--shadow);
  padding: 36px 32px 28px;
  text-align: center;
}

.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin-bottom: 22px;
}

.login-brand-logo {
  width: 56px;
  height: 56px;
  border-radius: 18px;
}

.login-brand-copy h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--text);
}

.login-brand-copy p {
  margin: 6px 0 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--primary);
}

.login-lead {
  margin: 0 0 24px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.login-btn {
  width: 100%;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
}

.login-spinner {
  animation: spin 0.8s linear infinite;
}

.login-footnote {
  margin: 18px 0 0;
  font-size: 12px;
  color: var(--text-subtle);
}
</style>
