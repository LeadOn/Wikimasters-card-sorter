// Profils d'intérêts : le mien et ceux de mes amis. Chacun génère un tag « Pour : <pseudo> ».
import {persistentStore} from "../lib/storage";
import {readSession} from "../lib/session";

// mine : profil (ou null) ; friends : [{id, name, color, about, rules, simple?, enabled}]
export const profiles = persistentStore("profiles", {mine: null, friends: []});

export const newId = () => Math.random().toString(36).slice(2, 10);

// Profils appliqués lors du tri : le mien (au nom de mon pseudo) puis ceux de mes amis actifs.
export function activeProfiles() {
  const {mine, friends} = profiles.get();
  const me = readSession()?.username;
  const list = [];
  if (mine && me && mine.rules?.length) list.push({...mine, name: me});
  for (const f of friends) if (f.enabled !== false && f.rules?.length && f.name !== me) list.push(f);
  return list;
}

export function profileFor(username) {
  if (!username) return null;
  const me = readSession()?.username;
  if (me && username.toLowerCase() === me.toLowerCase()) return profiles.get().mine ? {...profiles.get().mine, name: me} : null;
  return profiles.get().friends.find((f) => f.enabled !== false && f.name.toLowerCase() === username.toLowerCase()) || null;
}
