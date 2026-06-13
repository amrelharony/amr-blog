// Lightweight event-based toasts for the admin UI. Any client component can
// call toast.ok/err/info from anywhere; <AdminToaster/> (mounted once in the
// admin layout) listens and renders them. Mirrors the window-event pattern in
// lib/theme.ts — no Context/provider, degrades to a no-op if unmounted.
export type ToastKind = "ok" | "err" | "info";
export interface ToastDetail {
  kind: ToastKind;
  msg: string;
}

const EVENT = "adm-toast";

function emit(kind: ToastKind, msg: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(EVENT, { detail: { kind, msg } }));
}

export const toast = {
  ok: (msg: string) => emit("ok", msg),
  err: (msg: string) => emit("err", msg),
  info: (msg: string) => emit("info", msg),
};

/** Subscribe to toasts; returns an unsubscribe fn. */
export function onToast(handler: (d: ToastDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ToastDetail>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
