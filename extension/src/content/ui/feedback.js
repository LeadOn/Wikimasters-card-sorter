// Notifications (toasts) et dialogues de confirmation de la Toolbox.
import {createStore} from "../lib/store";

export const toasts = createStore({list: []});
let nextId = 1;

// type : "info" | "ok" | "error" ; action : {label, run}
export function toast(message, {type = "info", action = null, duration = 6000} = {}) {
  const id = nextId++;
  toasts.set((s) => ({list: [...s.list, {id, message, type, action}]}));
  if (duration) setTimeout(() => dismissToast(id), duration);
  return id;
}
export const dismissToast = (id) => toasts.set((s) => ({list: s.list.filter((t) => t.id !== id)}));

export const dialog = createStore({current: null});

// confirmAction({title, body, confirm: "Libellé", danger}) → Promise<boolean>
export function confirmAction(options) {
  return new Promise((resolve) => dialog.set({current: {...options, resolve}}));
}
export function closeDialog(result) {
  const current = dialog.get().current;
  dialog.set({current: null});
  current?.resolve(result);
}

export const errorMessage = (e) => (e?.name === "AbortError" ? "Opération annulée." : e?.message || String(e));
