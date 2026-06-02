import { nextTick, onUnmounted, ref, watch, type Ref } from "vue";

export function useStickyPageHeaderActions(options: {
  enabled: Ref<boolean>;
  scrollRoot: Ref<HTMLElement | null>;
}) {
  const headerActionsInView = ref(true);
  let slotObserver: MutationObserver | null = null;
  let scrollListener: (() => void) | null = null;

  function hasActionButtons() {
    return !!document.getElementById("page-header-actions")?.querySelector("button");
  }

  function updateVisibility() {
    if (!options.enabled.value || !hasActionButtons()) {
      headerActionsInView.value = true;
      return;
    }
    const root = options.scrollRoot.value;
    const anchor = document.getElementById("page-header-actions");
    if (!root || !anchor) {
      headerActionsInView.value = true;
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const nextVisible =
      anchorRect.bottom > rootRect.top + 2 && anchorRect.top < rootRect.bottom;
    if (headerActionsInView.value !== nextVisible) {
      headerActionsInView.value = nextVisible;
    }
  }

  function detachScrollListener() {
    if (scrollListener && options.scrollRoot.value) {
      options.scrollRoot.value.removeEventListener("scroll", scrollListener);
    }
    scrollListener = null;
  }

  function attachScrollListener() {
    detachScrollListener();
    const root = options.scrollRoot.value;
    if (!root || !options.enabled.value) return;
    scrollListener = () => updateVisibility();
    root.addEventListener("scroll", scrollListener, { passive: true });
  }

  function disconnect() {
    detachScrollListener();
    slotObserver?.disconnect();
    slotObserver = null;
  }

  function watchActionsSlot() {
    slotObserver?.disconnect();
    const slot = document.getElementById("page-header-actions");
    if (!slot) return;
    slotObserver = new MutationObserver(() => {
      updateVisibility();
    });
    slotObserver.observe(slot, { childList: true, subtree: true });
  }

  async function connect() {
    if (!options.enabled.value) {
      disconnect();
      if (!headerActionsInView.value) headerActionsInView.value = true;
      return;
    }
    disconnect();
    headerActionsInView.value = true;
    await nextTick();
    await nextTick();
    watchActionsSlot();
    attachScrollListener();
    requestAnimationFrame(() => {
      updateVisibility();
      requestAnimationFrame(updateVisibility);
    });
  }

  watch(
    () => [options.enabled.value, options.scrollRoot.value] as const,
    () => {
      void connect();
    },
    { flush: "post" },
  );

  onUnmounted(disconnect);

  function triggerHeaderAction(action: "back" | "save") {
    const el = document.querySelector(
      `#page-header-actions [data-header-action="${action}"]`,
    ) as HTMLButtonElement | null;
    el?.click();
  }

  return { headerActionsInView, connect, disconnect, triggerHeaderAction };
}
