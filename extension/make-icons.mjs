// Génère les icônes PNG de l'extension (deux cartes empilées sur un fond dégradé).
//   node extension/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";

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

function render(size) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size, v = (y + (sy + 0.5) / ss) / size;
          let col = [0, 0, 0, 0];
          if (roundRect(u, v, 0.5, 0.5, 1, 1, 0.22) <= 0) {
            const t = (u + v) / 2;
            col = [79 + (147 - 79) * t, 70 + (51 - 70) * t, 229 + (234 - 229) * t, 255];
            if (roundRect(u, v, 0.43, 0.53, 0.42, 0.56, 0.06, -0.26) <= 0) col = [199, 210, 254, 255];
            if (roundRect(u, v, 0.57, 0.49, 0.42, 0.56, 0.06, 0.12) <= 0) {
              col = [255, 255, 255, 255];
              if (roundRect(u, v, 0.57, 0.42, 0.3, 0.24, 0.03, 0.12) <= 0) col = [251, 191, 36, 255];
              if (roundRect(u, v, 0.585, 0.64, 0.26, 0.04, 0.02, 0.12) <= 0) col = [129, 140, 248, 255];
            }
          }
          acc = acc.map((a, i) => a + col[i]);
        }
      const n = ss * ss;
      buf.set(acc.map((a) => Math.round(a / n)), (y * size + x) * 4);
    }
  return png(size, buf);
}

for (const size of [16, 32, 48, 128]) fs.writeFileSync(path.join(out, `${size}.png`), render(size));
console.log("Icônes générées dans", out);
