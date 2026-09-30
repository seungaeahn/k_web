const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawYarnBall(size, bg, fg) {
  // returns RGBA buffer for a simple rounded yarn-ball glyph on solid bg
  const [br, bgc, bb] = hexToRgb(bg);
  const [fr, fgc, fb] = hexToRgb(fg);
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, r = size * 0.32;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let useFg = dist <= r;
      // simple crossing "yarn strand" arcs
      if (!useFg) {
        const ringA = Math.abs(dist - r * 0.55) < size * 0.022 && Math.abs(dx) < r * 1.05 && Math.abs(dy) < r * 0.65;
        const ringB = Math.abs(dist - r * 1.15) < size * 0.022 && dist < r * 1.3 && dist > r * 0.9;
        if (ringA || ringB) useFg = true;
      }
      if (useFg) {
        pixels[idx] = fr; pixels[idx + 1] = fgc; pixels[idx + 2] = fb; pixels[idx + 3] = 255;
      } else {
        pixels[idx] = br; pixels[idx + 1] = bgc; pixels[idx + 2] = bb; pixels[idx + 3] = 255;
      }
    }
  }
  return pixels;
}

function buildPng(size, bg, fg) {
  const raw = drawYarnBall(size, bg, fg);
  const rowSize = size * 4;
  const withFilter = Buffer.alloc((rowSize + 1) * size);
  for (let y = 0; y < size; y++) {
    withFilter[y * (rowSize + 1)] = 0;
    raw.copy(withFilter, y * (rowSize + 1) + 1, y * rowSize, y * rowSize + rowSize);
  }
  const idat = zlib.deflateSync(withFilter);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const bg = '#b5694a';
const fg = '#faf1ea';

fs.writeFileSync(path.join(outDir, 'icon-192.png'), buildPng(192, bg, fg));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), buildPng(512, bg, fg));
fs.writeFileSync(path.join(outDir, 'icon-192-maskable.png'), buildPng(192, bg, fg));

console.log('icons generated');
