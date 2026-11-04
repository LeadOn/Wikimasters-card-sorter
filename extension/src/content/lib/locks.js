// Verrou partagé entre les onglets WikiMasters (et dans l'onglet) : une seule écriture lourde à la
// fois (tri, paquets…). wait : attendre la fin de l'opération en cours au lieu d'échouer.
import {L} from "../../shared/i18n";

// Firefox : le navigator.locks d'un script de contenu est celui de la page, et sa promesse est
// rejetée (« Permission denied to access property "then" ») dès que le rappel vient du script,
// quelle que soit sa valeur de retour. On passe donc par le navigator.locks de la page
// (wrappedJSObject), avec un rappel exporté (exportFunction) qui rend une promesse de la page,
// résolue sans valeur à la fin de l'opération ; le résultat et l'erreur passent par la promesse
// du script. callback rend la promesse de l'opération, ou undefined quand le verrou est pris.
function requestLock(key, options, callback) {
  const page = typeof exportFunction === "function" ? window.wrappedJSObject : null;
  if (!page?.navigator?.locks) return navigator.locks.request(key, options, callback);
  const pageCallback = (lock) => {
    const run = callback(lock);
    if (!run) return undefined;
    const settle = (resolve) => run.then(() => resolve(), () => resolve());
    return new page.Promise(exportFunction(settle, page));
  };
  return page.navigator.locks.request(key, cloneInto(options, page), exportFunction(pageCallback, page));
}

export async function withLock(name, fn, {wait = false} = {}) {
  if (!navigator.locks) return fn();
  let run = null;
  const callback = (lock) => {
    if (!lock) return undefined;
    run = (async () => fn())();
    return run;
  };
  await requestLock(`wmt:${name}`, wait ? {} : {ifAvailable: true}, callback);
  if (!run) throw new Error(L("Une opération du même type est déjà en cours (dans cet onglet ou un autre onglet WikiMasters). Réessayez quand elle sera terminée.", "An operation of the same kind is already running (in this tab or another WikiMasters tab). Try again once it has finished."));
  return run;
}
