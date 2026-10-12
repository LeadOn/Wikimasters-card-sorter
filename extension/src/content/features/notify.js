// Son discret quand le nombre de notifications non lues augmente, et pour les alertes d'enchère.
import {on} from "../lib/bus";
import {isOn} from "../state/settings";

let audio = null;
let unlocked = false;
// Les navigateurs n'autorisent le son qu'après un geste du joueur sur la page
for (const type of ["pointerdown", "keydown"])
  window.addEventListener(type, () => (unlocked = true), {once: true, capture: true});

export function chime(high = false) {
  if (!unlocked) return;
  try {
    audio ||= new AudioContext();
    const now = audio.currentTime;
    for (const [i, freq] of (high ? [880, 1320] : [660, 990]).entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.25);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    }
  } catch {}
}

export function startNotificationSound() {
  let lastUnread = null;
  on("notifications", ({data}) => {
    const unread = (data?.notifications || []).filter((n) => n.read === false).length;
    if (lastUnread != null && unread > lastUnread && isOn("notificationSound")) chime();
    lastUnread = unread;
  });
  on("bid-alert", () => isOn("bidAlerts") && chime(true));
}
