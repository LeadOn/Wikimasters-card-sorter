// Génère les icônes PNG de l'extension : la marque (fiche à onglet, src/shared/brand.mjs) sur une tuile graphite.
//   node extension/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";
import {BRAND, MARK} from "./src/shared/brand.mjs";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "static", "icons");
fs.mkdirSync(out, {recursive: true});

const crcTable = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Distance signée à un rectangle arrondi, éventuellement tourné (coordonnées unitaires 0..1)
function roundRect(x, y, cx, cy, w, h, r, angle = 0) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = x - cx, dy = y - cy;
  const px = Math.abs(dx * cos + dy * sin) - w / 2 + r;
  const py = Math.abs(-dx * sin + dy * cos) - h / 2 + r;
  return Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - r;
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(255);
const GRAPHITE = hex(BRAND.graphite);
const BONE = hex(BRAND.bone);
const LIME = hex(BRAND.lime);
// Marque centrée sur la grille de 24 (sa boîte va de x = 5 à 19,5)
const SHIFT_X = (MARK.card[0] + MARK.tab[0] + MARK.tab[2]) / 2 - 12;
const inRect = (x, y, [rx, ry, w, h, r]) => roundRect(x, y, rx + w / 2, ry + h / 2, w, h, r) <= 0;

// Tuile graphite arrondie, la marque au centre. margin : marge transparente (le Chrome Web Store
// recommande 16 px autour d'un dessin de 96 px en 128 px) ; pad : marge de la marque dans la tuile,
// plus faible aux petites tailles pour qu'elle reste lisible.
function render(size, {margin = 0, pad}) {
  const ss = 4;
  const inner = size - 2 * margin;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss - margin) / inner, v = (y + (sy + 0.5) / ss - margin) / inner;
          let col = [0, 0, 0, 0];
          if (roundRect(u, v, 0.5, 0.5, 1, 1, 0.23) <= 0) {
            col = GRAPHITE;
            const mx = ((u - pad) / (1 - 2 * pad)) * 24 + SHIFT_X, my = ((v - pad) / (1 - 2 * pad)) * 24;
            if (inRect(mx, my, MARK.tab)) col = LIME;
            if (inRect(mx, my, MARK.card)) col = BONE;
          }
          acc = acc.map((a, i) => a + col[i]);
        }
      const n = ss * ss;
      buf.set(acc.map((a) => Math.round(a / n)), (y * size + x) * 4);
    }
  return png(size, buf);
}

fs.writeFileSync(path.join(out, "16.png"), render(16, {pad: 0.08}));
fs.writeFileSync(path.join(out, "32.png"), render(32, {pad: 0.12}));
fs.writeFileSync(path.join(out, "48.png"), render(48, {pad: 0.14}));
fs.writeFileSync(path.join(out, "128.png"), render(128, {margin: 16, pad: 0.16}));
console.log("Icônes générées dans", out);
