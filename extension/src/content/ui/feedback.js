// Notifications (toasts) et dialogues de confirmation de la Toolbox.
import {createStore} from "../lib/store";

export const toasts = createStore({list: []});
let nextId = 1;

const MAX_TOASTS = 5;

// type : "info" | "ok" | "error" ; action : {label, run}. Les plus anciens disparaissent au-delà de 5.
export function toast(message, {type = "info", action = null, duration = 6000} = {}) {
  const id = nextId++;
  toasts.set((s) => ({list: [...s.list, {id, message, type, action}].slice(-MAX_TOASTS)}));
  if (duration) setTimeout(() => dismissToast(id), duration);
  return id;
}
export const dismissToast = (id) => toasts.set((s) => ({list: s.list.filter((t) => t.id !== id)}));

export const dialog = createStore({current: null});

// confirmAction({title, body, confirm: "Libellé", danger}) → Promise<boolean>
// Un dialogue déjà ouvert est refermé comme « Annuler » : l'action qui l'attendait ne reste pas bloquée.
export function confirmAction(options) {
  dialog.get().current?.resolve(false);
  return new Promise((resolve) => dialog.set({current: {...options, resolve}}));
}
export function closeDialog(result) {
  const current = dialog.get().current;
  dialog.set({current: null});
  current?.resolve(result);
}

export const errorMessage = (e) => (e?.name === "AbortError" ? "Opération annulée." : e?.message || String(e));
