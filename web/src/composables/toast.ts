import { reactive } from "vue";

export type ToastType = "success" | "warning" | "error";

const state = reactive({
  message: "",
  type: "success" as ToastType,
  visible: false,
});

let hideTimer: ReturnType<typeof setTimeout> | null = null;

const DURATION_MS: Record<ToastType, number> = {
  success: 2400,
  warning: 2800,
  error: 3200,
};

export function showToast(message: string, type: ToastType = "success") {
  if (hideTimer) clearTimeout(hideTimer);
  state.message = message;
  state.type = type;
  state.visible = true;
  hideTimer = setTimeout(() => {
    state.visible = false;
    state.message = "";
    hideTimer = null;
  }, DURATION_MS[type]);
}

export function useToastState() {
  return state;
}
