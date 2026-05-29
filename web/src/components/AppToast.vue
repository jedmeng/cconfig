<script setup lang="ts">
import { useToastState } from "../composables/toast";

const toast = useToastState();

const iconClass: Record<string, string> = {
  success: "bi-check-circle-fill",
  warning: "bi-exclamation-triangle-fill",
  error: "bi-x-circle-fill",
};
</script>

<template>
  <Transition name="toast-fade">
    <div
      v-if="toast.visible"
      class="app-toast"
      :class="`app-toast--${toast.type}`"
      role="status"
      aria-live="polite"
    >
      <i class="bi toast-icon" :class="iconClass[toast.type]" aria-hidden="true" />
      <span class="toast-message">{{ toast.message }}</span>
    </div>
  </Transition>
</template>
