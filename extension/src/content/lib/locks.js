// Verrou partagé entre les onglets WikiMasters : une seule écriture lourde à la fois (tri, paquets…).
export async function withLock(name, fn) {
  if (!navigator.locks) return fn();
  return navigator.locks.request(`wmt:${name}`, {ifAvailable: true}, async (lock) => {
    if (!lock) throw new Error("Cette action est déjà en cours dans un autre onglet WikiMasters.");
    return fn();
  });
}
