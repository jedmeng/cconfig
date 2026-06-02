import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";

const DESKTOP_MEDIA = "(min-width: 769px)";
const CARD_MIN = 160;
const CARD_MAX = 220;
const TRACK_GAP = 8;
const ARROW_WIDTH = 22;

export function useFlowTrackCardWidth(
  trackRef: Ref<HTMLElement | null>,
  cardCount: Ref<number>,
) {
  const cardWidthPx = ref(CARD_MAX);
  let resizeObserver: ResizeObserver | null = null;
  let desktopMediaQuery: MediaQueryList | null = null;
  let rafId = 0;

  const trackStyle = computed(() => ({
    "--flow-card-width": `${cardWidthPx.value}px`,
  }));

  function recalc() {
    if (!desktopMediaQuery?.matches) {
      if (cardWidthPx.value !== CARD_MAX) cardWidthPx.value = CARD_MAX;
      return;
    }
    const track = trackRef.value;
    if (!track || cardCount.value <= 0) return;

    const available = track.clientWidth;
    if (available <= 0) return;

    const n = cardCount.value;
    const arrowCount = n - 1;
    const gapCount = 2 * n - 2;
    const raw = (available - arrowCount * ARROW_WIDTH - gapCount * TRACK_GAP) / n;
    const next = Math.round(Math.min(CARD_MAX, Math.max(CARD_MIN, raw)));
    if (cardWidthPx.value === next) return;
    cardWidthPx.value = next;
  }

  function scheduleRecalc() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      recalc();
    });
  }

  onMounted(() => {
    desktopMediaQuery = window.matchMedia(DESKTOP_MEDIA);
    desktopMediaQuery.addEventListener("change", scheduleRecalc);
    window.addEventListener("resize", scheduleRecalc, { passive: true });

    resizeObserver = new ResizeObserver(() => scheduleRecalc());

    watch(trackRef, (track) => {
      resizeObserver?.disconnect();
      if (track) resizeObserver?.observe(track);
      scheduleRecalc();
    }, { immediate: true });

    watch(cardCount, scheduleRecalc);
  });

  onUnmounted(() => {
    desktopMediaQuery?.removeEventListener("change", scheduleRecalc);
    window.removeEventListener("resize", scheduleRecalc);
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (rafId) cancelAnimationFrame(rafId);
  });

  return { trackStyle, cardWidthPx };
}
