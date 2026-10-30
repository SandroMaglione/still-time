// Native 24×24 batch-3+ actors on the shared sprite-text palette, authored like batch2-art.mjs.
import { readFileSync, writeFileSync } from 'node:fs'
const palette = JSON.parse(readFileSync('pixel.config.json', 'utf8')).palette
const keys = 'ABCDEFGHIJKLMNOP'
// Palette indices: 0 ink, 1 dark, 2 slate, 3 grey, 4 ivory, 5 pale, 6 skin, 7 skin shade,
// 8 red, 9 dark red, 10 orange, 11 gold, 12 purple, 13 dark purple, 14 teal, 15 green.
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
}

// Grenadier: a squat sapper in a powder-orange coat, a round slate pot helmet, a gold bandolier of charges.
actor('grenadier', (r, p) => {
  r(6, 19, 5, 4, 0); r(13, 19, 5, 4, 0); r(7, 20, 3, 2, 2); r(14, 20, 3, 2, 1)
  p([[5, 12], [19, 12], [20, 20], [4, 20]], 0)
  p([[6, 13], [18, 13], [19, 19], [5, 19]], 10)
  r(14, 13, 5, 6, 9); r(6, 13, 2, 6, 11)
  for (let i = 0; i < 5; i++) { r(7 + i * 2, 13 + i, 2, 1, 0); r(8 + i * 2, 14 + i, 1, 1, 11) }
  r(5, 17, 15, 1, 1); r(11, 17, 2, 1, 11)
  p([[7, 2], [17, 2], [19, 6], [19, 12], [5, 12], [5, 6]], 0)
  p([[8, 3], [16, 3], [18, 6], [18, 8], [6, 8], [6, 6]], 2)
  r(8, 3, 5, 1, 3); r(6, 8, 13, 1, 3)
  r(7, 9, 11, 3, 6); r(14, 9, 4, 3, 7)
  r(9, 10, 2, 1, 0); r(13, 10, 2, 1, 0)
}, (r, p) => {
  // A round charge in the right hand, its fuse lit.
  p([[17, 12], [21, 12], [23, 15], [21, 18], [17, 18], [15, 15]], 0)
  p([[18, 13], [21, 13], [22, 15], [21, 17], [18, 17], [16, 15]], 1)
  r(18, 13, 2, 1, 3)
  r(20, 10, 1, 3, 11); r(20, 9, 1, 1, 4)
})

// Clockwork: a brass automaton, riveted, a teal visor slit, a wind-up key on its back.
actor('clockwork', (r, p) => {
  r(6, 19, 5, 4, 0); r(13, 19, 5, 4, 0); r(7, 20, 3, 2, 10); r(14, 20, 3, 2, 9)
  p([[5, 11], [19, 11], [19, 20], [5, 20]], 0)
  r(6, 12, 13, 7, 11); r(14, 12, 5, 7, 10); r(6, 12, 13, 1, 4)
  r(8, 14, 1, 1, 0); r(16, 14, 1, 1, 0); r(8, 17, 1, 1, 0); r(16, 17, 1, 1, 0)
  r(11, 13, 3, 5, 9); r(12, 14, 1, 3, 11)
  p([[7, 3], [17, 3], [18, 5], [18, 11], [6, 11], [6, 5]], 0)
  r(7, 4, 11, 7, 11); r(14, 4, 4, 7, 10); r(7, 4, 6, 1, 4)
  r(8, 7, 9, 2, 0); r(9, 7, 7, 1, 14)
  r(11, 1, 3, 3, 0); r(12, 1, 1, 2, 3)
}, (r) => {
  // The wind-up key on its back, to its left.
  r(1, 12, 5, 5, 0); r(2, 13, 3, 3, 3); r(3, 14, 1, 1, 0); r(4, 14, 2, 1, 2)
})

// Stalker: a hunched, hooded wraith in deep violet, two teal eyes, a ragged hem.
actor('stalker', (r, p) => {
  p([[8, 3], [16, 3], [20, 9], [21, 21], [3, 21], [4, 9]], 0)
  p([[9, 4], [15, 4], [19, 9], [20, 20], [4, 20], [5, 9]], 13)
  p([[9, 4], [12, 4], [8, 12], [6, 20], [5, 20], [5, 9]], 12)
  r(8, 7, 8, 4, 0)
  r(9, 8, 2, 2, 14); r(13, 8, 2, 2, 14); r(9, 8, 1, 1, 4); r(13, 8, 1, 1, 4)
  for (const x of [4, 8, 12, 16, 19]) r(x, 20, 2, 2, 0)
  r(5, 21, 1, 1, 13); r(13, 21, 1, 1, 13)
}, () => {})
