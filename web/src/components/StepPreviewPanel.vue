<script setup lang="ts">
import { computed, ref } from "vue";
import { createPatch } from "diff";
import YAML from "yaml";

const props = defineProps<{ steps: Array<{ stepName: string; yaml: string }> }>();
const inspectPath = ref("");

function getByPath(root: unknown, dotPath: string): unknown {
  if (!dotPath) return undefined;
  let cursor: any = root;
  for (const key of dotPath.split(".")) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function buildUnifiedDiff(prevYaml: string, nextYaml: string): string {
  const patch = createPatch("step.yaml", prevYaml, nextYaml, "prev", "next");
  return patch
    .split("\n")
    .slice(0, 220)
    .join("\n");
}

const withDiff = computed(() =>
  props.steps.map((step, idx) => ({
    ...step,
    diff: idx === 0 ? "" : buildUnifiedDiff(props.steps[idx - 1].yaml, step.yaml),
  })),
);

const pathTimeline = computed(() =>
  props.steps.map((step) => {
    let value: unknown = undefined;
    if (inspectPath.value.trim()) {
      try {
        value = getByPath(YAML.parse(step.yaml), inspectPath.value.trim());
      } catch {
        value = "YAML parse error";
      }
    }
    return { stepName: step.stepName, value };
  }),
);
</script>

<template>
  <div class="panel">
    <h3>流程中间态预览</h3>
    <label>
      路径追踪（例如 dns.enable / proxies）
      <input v-model="inspectPath" placeholder="输入配置路径" />
    </label>
    <div v-if="inspectPath.trim()">
      <h4>路径值变化：`{{ inspectPath }}`</h4>
      <div v-for="entry in pathTimeline" :key="entry.stepName">
        <strong>{{ entry.stepName }}:</strong>
        <pre class="mono">{{ JSON.stringify(entry.value, null, 2) }}</pre>
      </div>
    </div>
    <div v-for="step in withDiff" :key="step.stepName" style="margin-bottom: 12px;">
      <strong>{{ step.stepName }}</strong>
      <div v-if="step.diff">
        <p>与上一步 Unified Diff（截断到 220 行）</p>
        <pre class="mono">{{ step.diff }}</pre>
      </div>
      <pre class="mono">{{ step.yaml }}</pre>
    </div>
  </div>
</template>
