// Génère les icônes PNG (iOS n'accepte pas le SVG pour l'écran d'accueil).
// Usage : node scripts/gen-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0xb4, 0x56, 0x6e]
const NAIL = [0xfb, 0xf7, 0xf5]
const TIP = [0xe9, 0xb7, 0xc2]

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

// Forme d'ongle : demi-ellipse en haut + rectangle arrondi en bas (coordonnées normalisées 0..1)
function inNail(x, y) {
  const cx = 0.5, w = 0.16, top = 0.22, mid = 0.45, bottom = 0.78
  if (y < top || y > bottom || Math.abs(x - cx) > w) return false
  if (y < mid) {
    const dy = (mid - y) / (mid - top)
    return ((x - cx) / w) ** 2 + dy ** 2 <= 1
  }
  return true
}
function inTip(x, y) {
  return inNail(x, y) && y < 0.42
}

function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size, y = (py + 0.5) / size
      const c = inTip(x, y) ? TIP : inNail(x, y) ? NAIL : BG
      raw.set(c, py * (size * 3 + 1) + 1 + px * 3)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/apple-touch-icon.png', png(180))
writeFileSync('public/icon-192.png', png(192))
writeFileSync('public/icon-512.png', png(512))
console.log('Icônes générées')
