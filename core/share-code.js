// Codes de partage (profils d'intérêts, familles) : JSON compressé, encodé en base64url.
// Format : "WMT-<type>1.<données>", par exemple "WMT-P1.eJz…" pour un profil.
// Fonctionne dans Node 18+ et dans les navigateurs (CompressionStream).
"use strict";

const PREFIX = "WMT-";

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// Un code décompressé ne dépasse jamais quelques centaines de Ko : au-delà, il est refusé
// (un code fabriqué pour se décompresser en gigaoctets figerait la page).
const MAX_DECODED = 2 * 1024 * 1024;

async function transform(bytes, stream, maxBytes = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new RangeError("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// type : une lettre ("P" profil, "F" famille)
async function encodeShareCode(type, payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packed = await transform(json, new CompressionStream("deflate-raw"));
  return `${PREFIX}${type}1.${bytesToBase64Url(packed)}`;
}

async function decodeShareCode(code, expectedType) {
  const clean = String(code || "").replace(/\s+/g, "");
  const m = /^WMT-([A-Z])1\.([A-Za-z0-9_-]+)$/.exec(clean);
  if (!m) throw new Error("Code invalide : il doit commencer par « WMT- ».");
  if (expectedType && m[1] !== expectedType)
    throw new Error(expectedType === "P" ? "Ce code n'est pas un code de profil." : "Ce code n'est pas un code de famille.");
  let payload;
  try {
    const json = new TextDecoder().decode(await transform(base64UrlToBytes(m[2]), new DecompressionStream("deflate-raw"), MAX_DECODED));
    payload = JSON.parse(json);
  } catch (e) {
    if (e instanceof RangeError) throw new Error("Code refusé : son contenu est anormalement volumineux.");
    throw new Error("Code incomplet ou abîmé : vérifiez qu'il a été copié en entier.");
  }
  return {type: m[1], payload};
}

module.exports = {encodeShareCode, decodeShareCode, bytesToBase64Url, base64UrlToBytes};
