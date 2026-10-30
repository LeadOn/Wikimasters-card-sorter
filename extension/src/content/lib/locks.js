// Verrou partagé entre les onglets WikiMasters (et dans l'onglet) : une seule écriture lourde à la
// fois (tri, paquets…). wait : attendre la fin de l'opération en cours au lieu d'échouer.
import {L} from "../../shared/i18n";
export async function withLock(name, fn, {wait = false} = {}) {
  if (!navigator.locks) return fn();
  if (wait) return navigator.locks.request(`wmt:${name}`, () => fn());
  return navigator.locks.request(`wmt:${name}`, {ifAvailable: true}, async (lock) => {
    if (!lock) throw new Error(L("Une opération du même type est déjà en cours (dans cet onglet ou un autre onglet WikiMasters). Réessayez quand elle sera terminée.", "An operation of the same kind is already running (in this tab or another WikiMasters tab). Try again once it has finished."));
    return fn();
  });
}
