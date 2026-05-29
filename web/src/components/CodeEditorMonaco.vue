<script setup lang="ts">
import "../monaco-setup";
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import * as monaco from "monaco-editor";

const EXTRA_LIB_URI = "inmemory:///cconfig-modifier-types.d.ts";

const props = defineProps<{
  modelValue: string;
  pathHint?: string;
  typeDefinition?: string;
  language?: "typescript" | "yaml" | "json" | "plaintext";
  height?: string;
  readonly?: boolean;
  borderless?: boolean;
  /** Modifier class editor: allow unused method params like `rawAllowLan`. */
  suppressUnusedChecks?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [string] }>();

const root = ref<HTMLElement | null>(null);
const diagnosticHint = ref("");
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let extraLibDisposable: monaco.IDisposable | null = null;
let markerListener: monaco.IDisposable | null = null;

function getTsDefaults(): any {
  return (monaco.languages as any).typescript?.typescriptDefaults;
}

function configureTypeScriptDefaults() {
  const tsDefaults = getTsDefaults();
  if (!tsDefaults) return;
  const ts = (monaco.languages as any).typescript;
  tsDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    strict: false,
    skipLibCheck: true,
    esModuleInterop: true,
    noUnusedLocals: props.suppressUnusedChecks ? false : undefined,
    noUnusedParameters: props.suppressUnusedChecks ? false : undefined,
  });
  tsDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
    diagnosticCodesToIgnore: props.suppressUnusedChecks ? [6133, 6196, 6192] : [],
  });
  tsDefaults.setEagerModelSync(true);
}

function applyExtraLib(content: string) {
  const tsDefaults = getTsDefaults();
  if (!tsDefaults) return;
  extraLibDisposable?.dispose();
  if (content.trim()) {
    extraLibDisposable = tsDefaults.addExtraLib(content, EXTRA_LIB_URI);
  }
  if (model) {
    const current = model.getValue();
    model.setValue(`${current}\n`);
    model.setValue(current);
  }
}

const UNUSED_DIAGNOSTIC_CODES = [6133, 6196, 6192];

function isIgnoredDiagnostic(marker: monaco.editor.IMarkerData): boolean {
  return props.suppressUnusedChecks && UNUSED_DIAGNOSTIC_CODES.includes(Number(marker.code));
}

function refreshDiagnosticHint() {
  if (!model) {
    diagnosticHint.value = "";
    return;
  }
  const markers = monaco.editor.getModelMarkers({ resource: model.uri }).filter((m) => !isIgnoredDiagnostic(m));
  const first = markers.find((m) => m.severity >= monaco.MarkerSeverity.Error) ?? markers[0];
  if (!first?.message) {
    diagnosticHint.value = "";
    return;
  }
  diagnosticHint.value = `第 ${first.startLineNumber} 行，第 ${first.startColumn} 列：${first.message}`;
}

onMounted(() => {
  const isTs = (props.language ?? "typescript") === "typescript";
  if (isTs) {
    configureTypeScriptDefaults();
    applyExtraLib(props.typeDefinition ?? "");
  }
  const ext = isTs ? "ts" : (props.language ?? "plaintext");
  const uri = monaco.Uri.parse(`file:///editor-${props.pathHint ?? "code"}.${ext}`);
  model = monaco.editor.createModel(props.modelValue, props.language ?? "typescript", uri);
  editor = monaco.editor.create(root.value!, {
    model,
    minimap: { enabled: false },
    automaticLayout: true,
    readOnly: props.readonly ?? false,
    fixedOverflowWidgets: true,
    glyphMargin: true,
    hover: { enabled: true, delay: 200 },
    quickSuggestions: false,
    scrollBeyondLastLine: false,
  });
  model.onDidChangeContent(() => emit("update:modelValue", model!.getValue()));
  markerListener = monaco.editor.onDidChangeMarkers((uris) => {
    if (!model || !uris.some((u) => u.toString() === model!.uri.toString())) return;
    refreshDiagnosticHint();
  });
  refreshDiagnosticHint();
});

watch(
  () => props.modelValue,
  (v) => {
    if (model && v !== model.getValue()) model.setValue(v);
  },
);

watch(
  () => props.typeDefinition,
  (v) => {
    if ((props.language ?? "typescript") !== "typescript") return;
    applyExtraLib(v ?? "");
    refreshDiagnosticHint();
  },
);

watch(
  () => props.readonly,
  (v) => {
    editor?.updateOptions({ readOnly: v ?? false });
  },
);

onBeforeUnmount(() => {
  markerListener?.dispose();
  extraLibDisposable?.dispose();
  editor?.dispose();
  model?.dispose();
});
</script>

<template>
  <div class="monaco-shell">
    <div
      ref="root"
      class="monaco-host"
      :style="{
        height: props.height ?? '320px',
        border: props.borderless ? 'none' : '1px solid #d1d5db',
        borderRadius: props.borderless ? '0' : '8px',
      }"
    />
    <p v-if="diagnosticHint" class="diagnostic-hint">{{ diagnosticHint }}</p>
  </div>
</template>

<style scoped>
.monaco-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.monaco-host {
  flex: 1;
  min-height: 0;
  overflow: visible;
}

.diagnostic-hint {
  flex-shrink: 0;
  margin: 6px 0 0;
  padding: 6px 10px;
  border-radius: 6px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.4;
}
</style>
