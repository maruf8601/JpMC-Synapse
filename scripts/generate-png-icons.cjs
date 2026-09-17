const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const toCrc = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  chunk.writeUInt32BE(crc32(toCrc), 8 + len);
  return chunk;
}

function createPng(width, height, drawFn) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // deflate
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // no interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // Scanlines
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter type 0: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

// Brand drawer: #006A60 medical teal background with white cross & gold accents
function drawJpMCIcon(isMaskable) {
  return (x, y, w, h) => {
    const nx = x / w;
    const ny = y / h;
    const cx = 0.5;
    const cy = 0.5;
    const distFromCenter = Math.sqrt((nx - cx) ** 2 + (ny - cy) ** 2);

    // If maskable, full bleed background; else rounded rect
    if (!isMaskable) {
      // Rounded rect check (radius = 0.22)
      const r = 0.22;
      const dx = Math.max(Math.abs(nx - 0.5) - (0.5 - r), 0);
      const dy = Math.max(Math.abs(ny - 0.5) - (0.5 - r), 0);
      if (Math.sqrt(dx * dx + dy * dy) > r) {
        return [0, 0, 0, 0]; // Transparent outside rounded corner
      }
    }

    // Medical Teal Gradient
    const gradFactor = (nx + ny) / 2;
    let r = Math.round(0 + gradFactor * 0);
    let g = Math.round(77 + gradFactor * 60); // 77 -> 137
    let b = Math.round(64 + gradFactor * 59); // 64 -> 123
    let a = 255;

    // Cross dimensions in normalized coords
    // Safe zone is between 0.15 and 0.85
    const crossHalfWidth = 0.08;
    const crossHalfLength = 0.28;

    const inHorizBar = (Math.abs(ny - 0.5) <= crossHalfWidth && Math.abs(nx - 0.5) <= crossHalfLength);
    const inVertBar = (Math.abs(nx - 0.5) <= crossHalfWidth && Math.abs(ny - 0.5) <= crossHalfLength);

    if (inHorizBar || inVertBar) {
      // White cross
      r = 255;
      g = 255;
      b = 255;
    }

    // Central Gold Pulse circle
    if (distFromCenter <= 0.075) {
      // Gold
      r = 255;
      g = 179;
      b = 0;
    }
    if (distFromCenter <= 0.035) {
      // White center
      r = 255;
      g = 255;
      b = 255;
    }

    // 4 Satellite dots in gold (top, bottom, left, right)
    const topDot = Math.hypot(nx - 0.5, ny - 0.32);
    const botDot = Math.hypot(nx - 0.5, ny - 0.68);
    const leftDot = Math.hypot(nx - 0.32, ny - 0.5);
    const rightDot = Math.hypot(nx - 0.68, ny - 0.5);

    if (topDot <= 0.03 || botDot <= 0.03 || leftDot <= 0.03 || rightDot <= 0.03) {
      r = 255;
      g = 200;
      b = 50;
    }

    return [r, g, b, a];
  };
}

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. 192x192
const pwa192 = createPng(192, 192, drawJpMCIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), pwa192);

// 2. 512x512
const pwa512 = createPng(512, 512, drawJpMCIcon(false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), pwa512);

// 3. 512x512 Maskable (full bleed)
const pwaMaskable = createPng(512, 512, drawJpMCIcon(true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pwaMaskable);

// 4. apple-touch-icon.png (180x180)
const appleIcon = createPng(180, 180, drawJpMCIcon(true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon);

// 5. favicon.png / favicon.ico
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), pwa192);

console.log('Successfully generated all PWA icons in /public!');
