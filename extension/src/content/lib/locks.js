// Verrou partagé entre les onglets WikiMasters (et dans l'onglet) : une seule écriture lourde à la
// fois (tri, paquets…). wait : attendre la fin de l'opération en cours au lieu d'échouer.
import {L} from "../../shared/i18n";

// Firefox : le navigator.locks d'un script de contenu est celui de la page, qui n'a pas le droit de
// lire une promesse du script (« Permission denied to access property "then" »). Le rappel lui rend
// donc une promesse de la page, résolue sans valeur à la fin de l'opération ; le résultat et l'erreur
// de l'opération passent par la promesse du script.
function holdUntil(promise) {
  const page = typeof exportFunction === "function" ? window.wrappedJSObject : null;
  if (!page) return promise;
  const settle = (resolve) => promise.then(() => resolve(), () => resolve());
  return new page.Promise(exportFunction(settle, page));
}

export async function withLock(name, fn, {wait = false} = {}) {
  if (!navigator.locks) return fn();
  let run = null;
  const callback = (lock) => {
    if (!lock) return undefined;
    run = (async () => fn())();
    return holdUntil(run);
  };
  const key = `wmt:${name}`;
  await (wait ? navigator.locks.request(key, callback) : navigator.locks.request(key, {ifAvailable: true}, callback));
  if (!run) throw new Error(L("Une opération du même type est déjà en cours (dans cet onglet ou un autre onglet WikiMasters). Réessayez quand elle sera terminée.", "An operation of the same kind is already running (in this tab or another WikiMasters tab). Try again once it has finished."));
  return run;
}
