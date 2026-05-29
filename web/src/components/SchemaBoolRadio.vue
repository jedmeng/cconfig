<script setup lang="ts">
import { useId } from "vue";

const model = defineModel<boolean>({ default: false });
const groupName = useId();
</script>

<template>
  <div class="sve-radio-group" role="radiogroup">
    <label class="sve-radio">
      <input v-model="model" type="radio" :name="groupName" :value="true" />
      <span>true</span>
    </label>
    <label class="sve-radio">
      <input v-model="model" type="radio" :name="groupName" :value="false" />
      <span>false</span>
    </label>
  </div>
</template>

<style scoped>
.sve-radio-group {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 28px;
}

.sve-radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
}

.sve-radio input[type="radio"] {
  width: 14px;
  height: 14px;
  min-width: 14px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 50%;
  box-shadow: none;
  background: transparent;
  accent-color: var(--primary, #2563eb);
  cursor: pointer;
  flex-shrink: 0;
}

.sve-radio input[type="radio"]:focus {
  outline: 2px solid rgba(59, 130, 246, 0.35);
  outline-offset: 1px;
}
</style>
