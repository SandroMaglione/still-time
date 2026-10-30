// Native 24×24 additions to the existing sprite-text palette. No borrowed bodies.
import { readFileSync, writeFileSync } from 'node:fs'
const palette = JSON.parse(readFileSync('pixel.config.json', 'utf8')).palette
const keys = 'ABCDEFGHIJKLMNOP'
const sheet = []
function actor(name, paint, equip) {
  const pixels = Array.from({ length: 24 }, () => Array(24).fill(-1))
  const r = (x, y, w, h, color) => { for (let yy = Math.max(0, y); yy < Math.min(24, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(24, x + w); xx++) pixels[yy][xx] = color }
  const p = (points, color) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      let inside = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j]
        if ((a[1] > y + 0.5) !== (b[1] > y + 0.5) && x + 0.5 < (b[0] - a[0]) * (y + 0.5 - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
      }
      if (inside) pixels[y][x] = color
    }
  }
  const save = suffix => writeFileSync(`assets/art/source/${name}${suffix}.sprite.txt`, `palette\n. transparent\n${palette.map((c, i) => `${keys[i]} ${c}`).join('\n')}\n\npixels\n${pixels.map(row => row.map(c => c < 0 ? '.' : keys[c]).join('')).join('\n')}\n`)
  paint(r, p); save('-body'); equip(r, p); save('')
  sheet.push(pixels.map(row => [...row]))
}
actor('sniper', (r, p) => {
  r(7, 19, 5, 4, 0); r(14, 19, 4, 4, 0); r(8, 21, 3, 1, 3); r(14, 21, 3, 1, 2)
  p([[7, 14], [17, 14], [20, 21], [14, 21], [12, 19], [6, 21], [5, 18]], 0)
  p([[8, 14], [16, 14], [18, 20], [14, 20], [12, 18], [7, 20]], 13)
  r(7, 16, 4, 3, 12); r(10, 17, 6, 2, 1); r(13, 18, 2, 2, 14)
  p([[12, 1], [17, 4], [20, 10], [20, 13], [17, 16], [7, 16], [4, 12], [6, 6]], 0)
  p([[12, 2], [16, 5], [18, 10], [18, 13], [16, 15], [8, 15], [5, 11], [7, 6]], 12)
  p([[14, 4], [17, 7], [18, 12], [16, 15], [13, 15], [15, 12]], 13)
  r(9, 8, 7, 6, 0); r(11, 10, 1, 2, 14); r(14, 10, 1, 2, 14)
  r(7, 13, 2, 2, 4); r(8, 15, 7, 1, 13)
}, r => {
  r(8, 16, 16, 4, 0); r(9, 17, 5, 2, 7); r(13, 17, 11, 2, 2); r(14, 16, 9, 1, 5)
  r(17, 13, 5, 3, 0); r(18, 14, 3, 1, 3); r(18, 16, 1, 1, 0)
  r(10, 19, 2, 1, 6); r(17, 19, 2, 1, 6)
})
actor('knight', r => {
  r(4, 19, 6, 4, 0); r(15, 19, 6, 4, 0); r(5, 21, 4, 1, 3); r(16, 21, 4, 1, 3)
  r(2, 12, 20, 9, 0); r(3, 13, 18, 6, 8); r(6, 14, 13, 7, 2)
  r(7, 14, 10, 5, 3); r(8, 15, 7, 1, 5); r(10, 17, 4, 3, 11)
  r(1, 12, 5, 6, 0); r(18, 12, 5, 6, 0); r(2, 13, 4, 3, 5); r(18, 13, 4, 3, 3)
  r(2, 13, 3, 1, 4); r(19, 13, 2, 1, 5); r(3, 17, 3, 2, 8); r(18, 17, 3, 2, 8)
  r(4, 2, 16, 12, 0); r(5, 3, 14, 10, 3); r(5, 3, 9, 3, 5); r(6, 3, 7, 1, 4)
  r(17, 4, 2, 8, 2); r(6, 7, 12, 4, 0); r(7, 8, 4, 1, 10); r(13, 8, 4, 1, 10)
  r(11, 7, 2, 6, 5); r(10, 2, 4, 4, 11); r(11, 1, 2, 4, 11)
  r(7, 12, 3, 1, 5); r(14, 12, 3, 1, 2); r(6, 20, 12, 1, 11)
}, r => { r(21, 14, 3, 9, 0); r(22, 14, 1, 6, 5); r(20, 19, 4, 1, 11); r(21, 20, 2, 2, 7) })
actor('shield', (r, p) => {
  r(6, 20, 5, 3, 0); r(14, 20, 5, 3, 0); r(7, 21, 3, 1, 3); r(15, 21, 3, 1, 3)
  r(5, 12, 15, 9, 0); r(6, 13, 13, 6, 14); r(8, 13, 9, 7, 1); r(10, 14, 4, 5, 2)
  r(6, 14, 3, 3, 3); r(17, 14, 2, 3, 3); r(8, 19, 9, 1, 11)
  p([[8, 3], [16, 3], [19, 7], [18, 13], [7, 13], [5, 8]], 0)
  p([[8, 4], [15, 4], [17, 7], [17, 12], [8, 12], [6, 8]], 3)
  r(8, 4, 6, 2, 5); r(8, 7, 9, 3, 0); r(8, 7, 3, 1, 5); r(12, 7, 3, 1, 5)
  r(11, 10, 3, 3, 2); r(9, 1, 5, 3, 0); r(10, 1, 3, 4, 14)
}, (r, p) => {
  p([[12, 8], [22, 8], [23, 20], [17, 24], [11, 20]], 0)
  p([[13, 9], [21, 9], [22, 19], [17, 22], [12, 19]], 5)
  p([[14, 10], [20, 10], [20, 19], [17, 21], [14, 18]], 2)
  r(16, 11, 2, 8, 11); r(14, 13, 6, 2, 11)
})
const atlas = Array.from({ length: 24 }, (_, y) => sheet.flatMap(pixels => pixels[y]))
writeFileSync('assets/art/source/batch2.sprite.txt', `palette\n. transparent\n${palette.map((c, i) => `${keys[i]} ${c}`).join('\n')}\n\npixels\n${atlas.map(row => row.map(c => c < 0 ? '.' : keys[c]).join('')).join('\n')}\n`)
writeFileSync('public/art/batch2.json', JSON.stringify({ image: 'batch2.png', frameSize: [24, 24], anchor: [12, 23], frames: { sniper: { x: 0, y: 0, w: 24, h: 24 }, knight: { x: 24, y: 0, w: 24, h: 24 }, shield: { x: 48, y: 0, w: 24, h: 24 } } }, null, 2) + '\n')
