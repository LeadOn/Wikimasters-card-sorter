// API d'extension du navigateur (Firefox expose `browser`, Chrome `chrome`).
export const ext = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;

// Faux après une mise à jour de l'extension : l'ancien script de contenu n'a plus accès à l'extension.
export const extensionAlive = () => {
  try {
    return Boolean(ext?.runtime?.id);
  } catch {
    return false;
  }
};
