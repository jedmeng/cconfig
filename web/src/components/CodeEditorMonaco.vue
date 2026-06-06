<script setup lang="ts">
import "../monaco-setup";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import * as monaco from "monaco-editor";

const EXTRA_LIB_URI = "inmemory:///cconfig-modifier-types.d.ts";
const MOBILE_MEDIA = "(max-width: 768px)";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    pathHint?: string;
    typeDefinition?: string;
    language?: "typescript" | "yaml" | "json" | "plaintext";
    height?: string;
    readonly?: boolean;
    borderless?: boolean;
    suppressUnusedChecks?: boolean;
  }>(),
  {
    language: "typescript",
    height: "320px",
    readonly: false,
    borderless: false,
    suppressUnusedChecks: false,
  },
);

const emit = defineEmits<{ "update:modelValue": [string] }>();

const root = ref<HTMLElement | null>(null);
const diagnosticHint = ref("");
const mobileLayout = ref(false);
const hostHeightPx = ref<number | null>(null);

let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let extraLibDisposable: monaco.IDisposable | null = null;
let markerListener: monaco.IDisposable | null = null;
let contentSizeListener: monaco.IDisposable | null = null;
let mobileMediaQuery: MediaQueryList | null = null;
let suppressModelEmit = false;
let applyingAutoGrow = false;
let autoGrowRaf = 0;
let markerRaf = 0;
let touchScrollCleanup: (() => void) | null = null;
let viewportSyncRaf = 0;

const shellClasses = computed(() => ({
  "monaco-shell--layout-mobile": mobileLayout.value,
  "monaco-shell--layout-desktop": !mobileLayout.value,
  "monaco-shell--readonly": props.readonly,
}));

const hostStyle = shallowRef({
  height: props.height,
  border: props.borderless ? "none" : "1px solid #d1d5db",
  borderRadius: props.borderless ? "0" : "8px",
});

function patchHostStyle(patch: Partial<{ height: string; border: string; borderRadius: string }>) {
  const next = { ...hostStyle.value, ...patch };
  if (
    next.height === hostStyle.value.height &&
    next.border === hostStyle.value.border &&
    next.borderRadius === hostStyle.value.borderRadius
  ) {
    return;
  }
  hostStyle.value = next;
}

function syncHostStyle() {
  const border = props.borderless ? "none" : "1px solid #d1d5db";
  const borderRadius = props.borderless ? "0" : "8px";
  if (mobileLayout.value) {
    const height = `${hostHeightPx.value ?? 120}px`;
    patchHostStyle({ height, border, borderRadius });
    return;
  }
  patchHostStyle({
    height: props.height,
    border,
    borderRadius,
  });
}

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
  extraLibDisposable = null;
  if (content.trim()) {
    extraLibDisposable = tsDefaults.addExtraLib(content, EXTRA_LIB_URI);
  }
}

const UNUSED_DIAGNOSTIC_CODES = [6133, 6196, 6192];

function isIgnoredDiagnostic(marker: monaco.editor.IMarkerData): boolean {
  return props.suppressUnusedChecks && UNUSED_DIAGNOSTIC_CODES.includes(Number(marker.code));
}

function refreshDiagnosticHint() {
  if ((props.language ?? "typescript") !== "typescript" || !model) {
    if (diagnosticHint.value) diagnosticHint.value = "";
    return;
  }
  const markers = monaco.editor.getModelMarkers({ resource: model.uri }).filter((m) => !isIgnoredDiagnostic(m));
  const first = markers.find((m) => m.severity >= monaco.MarkerSeverity.Error) ?? markers[0];
  const next = first?.message
    ? `第 ${first.startLineNumber} 行，第 ${first.startColumn} 列：${first.message}`
    : "";
  if (diagnosticHint.value !== next) diagnosticHint.value = next;
}

function scheduleDiagnosticHint() {
  if (markerRaf) cancelAnimationFrame(markerRaf);
  markerRaf = requestAnimationFrame(() => {
    markerRaf = 0;
    refreshDiagnosticHint();
  });
}

function readonlyEditorOptions(readonly: boolean): monaco.editor.IEditorOptions {
  if (!readonly) {
    return { readOnly: false, domReadOnly: false };
  }
  return {
    readOnly: true,
    domReadOnly: true,
    renderLineHighlight: "none",
    selectionHighlight: false,
    occurrencesHighlight: "off",
  };
}

function mobileEditorOptions(enabled: boolean): monaco.editor.IEditorOptions {
  if (enabled) {
    return {
      lineNumbers: "off",
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 0,
      scrollbar: { vertical: "hidden", horizontal: "auto", handleMouseWheel: false },
      overviewRulerLanes: 0,
      automaticLayout: false,
    };
  }
  return {
    lineNumbers: "on",
    glyphMargin: true,
    folding: true,
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 5,
    scrollbar: { vertical: "auto", horizontal: "auto", handleMouseWheel: true },
    overviewRulerLanes: 3,
    automaticLayout: true,
  };
}

function applyAutoGrowHeight() {
  if (!editor || !root.value || !mobileLayout.value || applyingAutoGrow) return;
  const width = root.value.clientWidth;
  if (width <= 0) return;
  const nextHeight = Math.max(120, Math.ceil(editor.getContentHeight()));
  if (hostHeightPx.value === nextHeight) return;

  applyingAutoGrow = true;
  try {
    hostHeightPx.value = nextHeight;
    syncHostStyle();
    editor.layout({ width, height: nextHeight });
  } finally {
    applyingAutoGrow = false;
  }
}

function scheduleAutoGrowHeight() {
  if (!mobileLayout.value) return;
  if (autoGrowRaf) cancelAnimationFrame(autoGrowRaf);
  autoGrowRaf = requestAnimationFrame(() => {
    autoGrowRaf = 0;
    applyAutoGrowHeight();
    requestAnimationFrame(applyAutoGrowHeight);
  });
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const pageContent = el.closest(".content");
  if (pageContent instanceof HTMLElement) {
    const { overflowY } = getComputedStyle(pageContent);
    if (/(auto|scroll|overlay)/.test(overflowY)) return pageContent;
  }
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

function teardownTouchScrollChain() {
  touchScrollCleanup?.();
  touchScrollCleanup = null;
}

/** 移动端：在编辑器内滑动时滚动页面 .content，不使用 Monaco 内部滚动 */
function setupTouchScrollChain() {
  teardownTouchScrollChain();
  if (!mobileLayout.value || !editor || !root.value) return;

  const bindTargets = (
    props.readonly ? [root.value] : [root.value, editor.getDomNode()]
  ).filter(Boolean) as HTMLElement[];
  let lastY = 0;
  let tracking = false;
  let scrollParent: HTMLElement | null = null;

  const resolveScrollParent = () => {
    scrollParent = findScrollParent(root.value);
    return scrollParent;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    if (!resolveScrollParent()) return;
    tracking = true;
    lastY = e.touches[0].clientY;
  };

  const onTouchEnd = () => {
    tracking = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking || e.touches.length !== 1) return;
    const parent = scrollParent ?? resolveScrollParent();
    if (!parent) return;
    const y = e.touches[0].clientY;
    const deltaY = lastY - y;
    if (deltaY === 0) return;
    lastY = y;

    const maxScroll = parent.scrollHeight - parent.clientHeight;
    if (maxScroll <= 0) return;

    const prevTop = parent.scrollTop;
    parent.scrollTop = Math.min(maxScroll, Math.max(0, prevTop + deltaY));
    e.preventDefault();
    e.stopPropagation();
  };

  const optsCapture = { capture: true, passive: false } as const;
  const optsStart = { capture: true, passive: true } as const;

  for (const target of bindTargets) {
    target.addEventListener("touchstart", onTouchStart, optsStart);
    target.addEventListener("touchmove", onTouchMove, optsCapture);
    target.addEventListener("touchend", onTouchEnd, optsStart);
    target.addEventListener("touchcancel", onTouchEnd, optsStart);
  }

  touchScrollCleanup = () => {
    for (const target of bindTargets) {
      target.removeEventListener("touchstart", onTouchStart, optsStart);
      target.removeEventListener("touchmove", onTouchMove, optsCapture);
      target.removeEventListener("touchend", onTouchEnd, optsStart);
      target.removeEventListener("touchcancel", onTouchEnd, optsStart);
    }
  };
}

function teardownMobileEditor() {
  contentSizeListener?.dispose();
  contentSizeListener = null;
  teardownTouchScrollChain();
  hostHeightPx.value = null;
}

function setupMobileEditor() {
  if (!editor) return;
  editor.updateOptions(mobileEditorOptions(true));
  syncHostStyle();
  contentSizeListener?.dispose();
  contentSizeListener = editor.onDidContentSizeChange(() => {
    if (applyingAutoGrow) return;
    scheduleAutoGrowHeight();
  });
  const afterPaint = () => {
    setupTouchScrollChain();
    scheduleAutoGrowHeight();
    editor?.layout();
  };
  requestAnimationFrame(() => {
    afterPaint();
    requestAnimationFrame(afterPaint);
  });
}

function setupDesktopEditor() {
  if (!editor) return;
  teardownMobileEditor();
  editor.updateOptions(mobileEditorOptions(false));
  syncHostStyle();
  const runLayout = () => {
    if (!editor || !root.value) return;
    editor.layout();
  };
  requestAnimationFrame(() => {
    runLayout();
    requestAnimationFrame(runLayout);
  });
}

/** 视口切换后应用布局（须在 CSS 媒体查询生效后再绑定滚动/尺寸） */
function applyViewportLayout() {
  if (!editor || !mobileMediaQuery) return;
  const enabled = mobileMediaQuery.matches;
  mobileLayout.value = enabled;
  if (enabled) setupMobileEditor();
  else setupDesktopEditor();
}

function scheduleViewportSync() {
  if (viewportSyncRaf) cancelAnimationFrame(viewportSyncRaf);
  viewportSyncRaf = requestAnimationFrame(() => {
    viewportSyncRaf = requestAnimationFrame(() => {
      viewportSyncRaf = 0;
      applyViewportLayout();
    });
  });
}

function onMobileLayoutChange() {
  scheduleViewportSync();
}

function onWindowResize() {
  if (!editor || !mobileMediaQuery) return;
  if (mobileMediaQuery.matches === mobileLayout.value) return;
  scheduleViewportSync();
}

function setModelValue(value: string) {
  if (!model || value === model.getValue()) return;
  suppressModelEmit = true;
  try {
    model.setValue(value);
  } finally {
    suppressModelEmit = false;
  }
  if (mobileLayout.value) scheduleAutoGrowHeight();
}

onMounted(() => {
  if (!root.value) return;

  const isTs = props.language === "typescript";
  if (isTs) {
    configureTypeScriptDefaults();
    applyExtraLib(props.typeDefinition ?? "");
  }

  const ext = isTs ? "ts" : props.language;
  const uri = monaco.Uri.parse(`file:///editor-${props.pathHint ?? "code"}.${ext}`);
  model = monaco.editor.createModel(props.modelValue, props.language, uri);

  mobileMediaQuery = window.matchMedia(MOBILE_MEDIA);
  mobileLayout.value = mobileMediaQuery.matches;
  syncHostStyle();

  editor = monaco.editor.create(root.value, {
    model,
    minimap: { enabled: false },
    ...readonlyEditorOptions(props.readonly),
    fixedOverflowWidgets: true,
    hover: { enabled: true, delay: 200 },
    quickSuggestions: false,
    scrollBeyondLastLine: false,
    ...mobileEditorOptions(mobileLayout.value),
  });

  scheduleViewportSync();

  model.onDidChangeContent(() => {
    if (suppressModelEmit || !model) return;
    emit("update:modelValue", model.getValue());
    if (mobileLayout.value) scheduleAutoGrowHeight();
  });

  markerListener = monaco.editor.onDidChangeMarkers((uris) => {
    if (!model || !uris.some((u) => u.toString() === model!.uri.toString())) return;
    scheduleDiagnosticHint();
  });

  mobileMediaQuery.addEventListener("change", onMobileLayoutChange);
  window.addEventListener("resize", onWindowResize, { passive: true });
  scheduleDiagnosticHint();
});

watch(
  () => props.modelValue,
  (value) => setModelValue(value),
);

watch(
  () => props.typeDefinition,
  (value) => {
    if (props.language !== "typescript") return;
    applyExtraLib(value ?? "");
    scheduleDiagnosticHint();
  },
);

watch(
  () => props.readonly,
  (value) => {
    editor?.updateOptions(readonlyEditorOptions(value ?? false));
    if (mobileLayout.value) setupTouchScrollChain();
  },
);

watch(
  () => props.height,
  () => {
    if (!mobileLayout.value) syncHostStyle();
  },
);

watch(
  () => props.borderless,
  () => syncHostStyle(),
);

onBeforeUnmount(() => {
  if (autoGrowRaf) cancelAnimationFrame(autoGrowRaf);
  if (markerRaf) cancelAnimationFrame(markerRaf);
  if (viewportSyncRaf) cancelAnimationFrame(viewportSyncRaf);
  mobileMediaQuery?.removeEventListener("change", onMobileLayoutChange);
  window.removeEventListener("resize", onWindowResize);
  teardownMobileEditor();
  markerListener?.dispose();
  extraLibDisposable?.dispose();
  editor?.dispose();
  model?.dispose();
  editor = null;
  model = null;
});
</script>

<template>
  <div class="monaco-shell" :class="shellClasses">
    <div ref="root" class="monaco-host" :style="hostStyle" />
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

.monaco-shell--layout-mobile {
  flex: none;
  min-height: auto;
  height: auto;
}

.monaco-shell--layout-mobile .monaco-host {
  flex: none;
  min-height: 0;
  touch-action: none;
}

.monaco-shell--layout-desktop .monaco-host {
  touch-action: auto;
}

.monaco-shell--layout-mobile :deep(.monaco-editor),
.monaco-shell--layout-mobile :deep(.monaco-editor .overflow-guard),
.monaco-shell--layout-mobile :deep(.monaco-editor .monaco-scrollable-element),
.monaco-shell--layout-mobile :deep(.monaco-editor .view-lines) {
  touch-action: none;
}

.monaco-shell--layout-mobile :deep(.monaco-editor .margin) {
  width: 0 !important;
}

.monaco-shell--layout-mobile :deep(.monaco-editor .monaco-scrollable-element) {
  left: 0 !important;
}

/* 只读 + 移动端：伪元素遮罩拦截 touch，避免 focus 弹键盘 */
.monaco-shell--readonly.monaco-shell--layout-mobile .monaco-host {
  position: relative;
}

.monaco-shell--readonly.monaco-shell--layout-mobile .monaco-host::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 10;
  user-select: none;
  -webkit-user-select: none;
}

.monaco-shell--readonly.monaco-shell--layout-mobile :deep(.monaco-editor),
.monaco-shell--readonly.monaco-shell--layout-mobile :deep(.monaco-editor *) {
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.monaco-shell--readonly :deep(.cursors-layer) {
  display: none !important;
}

.monaco-shell--readonly :deep(textarea.inputarea:read-only) {
  caret-color: transparent;
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
