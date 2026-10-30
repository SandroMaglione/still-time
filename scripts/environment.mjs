// Native-size room art, authored as editable sprite text and rendered by ritmo-tools.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = 'assets/art/environment'
const output = 'output/art/environment'
const config = `${root}/pixel.config.json`
const palette = JSON.parse(readFileSync(config, 'utf8')).palette
const keys = 'ABCDEFGHIJKLMNOP'
const assets = []
mkdirSync(`${root}/source`, { recursive: true })
for (const dir of ['previews', 'reports']) mkdirSync(`${output}/${dir}`, { recursive: true })
mkdirSync('public/art', { recursive: true })
function command(args, report) {
  const result = spawnSync('pnpm', ['exec', 'ritmo-tools', 'pixel', ...args, '--config', config], { encoding: 'utf8' })
  writeFileSync(`${output}/reports/${report}.json`, result.stdout)
  if (result.status !== 0) throw new Error(result.stdout + result.stderr)
}
function render(name, pixels) {
  const text = `palette\n. transparent\n${palette.map((c, i) => `${keys[i]} ${c}`).join('\n')}\n\npixels\n${pixels.map(row => row.map(c => c < 0 ? '.' : keys[c]).join('')).join('\n')}\n`
  const source = `${root}/source/${name}.sprite.txt`
  writeFileSync(source, text)
  command(['render', source, '-o', `public/art/${name}`, '--scale', '4'], name)
  command(['lint', `public/art/${name}.png`], `${name}-lint`)
  for (const suffix of ['@4x.png', '.svg', '.preview.png']) renameSync(`public/art/${name}${suffix}`, `${output}/previews/${name}${suffix}`)
}
function tile(name, w, h, paint) {
  const pixels = Array.from({ length: h }, () => Array(w).fill(-1))
  const rect = (x, y, width, height, color) => {
    for (let py = Math.max(0, y); py < Math.min(h, y + height); py++)
      for (let px = Math.max(0, x); px < Math.min(w, x + width); px++) pixels[py][px] = color
  }
  const line = (x, y, toX, toY, color) => {
    const steps = Math.max(Math.abs(toX - x), Math.abs(toY - y), 1)
    for (let s = 0; s <= steps; s++) rect(Math.round(x + (toX - x) * s / steps), Math.round(y + (toY - y) * s / steps), 1, 1, color)
  }
  paint(rect, line)
  assets.push({ name, pixels })
  render(name, pixels)
}
function flag(r, variant) {
  r(0, 0, 24, 24, 3)
  const grain = [
    [[4, 5, 5, 2], [14, 16, 4, 2], [6, 18, 3, 2]],
    [[12, 4, 5, 2], [4, 10, 3, 3], [16, 18, 4, 2]],
    [[3, 17, 6, 2], [15, 7, 4, 3], [7, 4, 3, 2]],
    [[5, 6, 3, 3], [12, 15, 5, 2], [18, 20, 3, 2]],
    [[3, 12, 5, 2], [11, 3, 3, 3], [16, 17, 5, 2]],
    [[7, 8, 5, 2], [17, 5, 3, 2], [5, 18, 4, 3]]
  ][variant]
  grain.forEach(([x, y, w, h], i) => { r(x, y, w, h, i === 1 ? 2 : 4); r(x + 2, y + h, w - 2, 1, i === 1 ? 2 : 4) })
  if (variant === 1) { r(0, 15, 8, 2, 2); r(6, 17, 2, 3, 2); r(1, 17, 4, 1, 4) }
  if (variant === 3) { r(19, 0, 2, 6, 2); r(17, 6, 4, 2, 2); r(17, 8, 2, 1, 4) }
  if (variant === 5) { r(16, 22, 8, 2, 2); r(14, 20, 4, 2, 2); r(14, 19, 3, 1, 4) }
}
for (let variant = 0; variant < 6; variant++) tile(`floor-${variant}`, 24, 24, r => flag(r, variant))
tile('floor-cracked', 24, 24, r => {
  flag(r, 2); r(8, 5, 3, 5, 2); r(10, 9, 4, 3, 2); r(12, 11, 3, 6, 2); r(15, 15, 4, 3, 2)
  r(7, 5, 1, 3, 4); r(11, 12, 1, 3, 4); r(16, 18, 3, 1, 4)
})
tile('floor-moss', 24, 24, r => {
  flag(r, 3); r(3, 12, 7, 5, 10); r(6, 16, 7, 4, 10); r(4, 13, 4, 3, 9); r(8, 17, 3, 2, 9)
})
tile('floor-drain', 24, 24, r => {
  flag(r, 1); r(5, 6, 14, 12, 2); r(6, 6, 12, 2, 4); r(7, 9, 10, 7, 1)
  for (const x of [8, 12, 16]) r(x, 9, 2, 7, 2)
})
for (let variant = 0; variant < 3; variant++) tile(`rock-${variant}`, 24, 24, r => {
  r(0, 0, 24, 24, 1)
  if (variant === 0) {
    r(0, 2, 14, 5, 2); r(4, 0, 7, 2, 2); r(14, 4, 5, 3, 2)
    r(3, 12, 3, 9, 0); r(6, 19, 11, 3, 0); r(16, 17, 8, 3, 0)
    r(5, 10, 7, 2, 2); r(18, 10, 6, 3, 2)
  } else if (variant === 1) {
    r(0, 4, 8, 4, 2); r(8, 7, 12, 3, 2); r(18, 9, 6, 5, 2)
    r(3, 0, 3, 5, 0); r(3, 5, 8, 3, 0); r(9, 8, 3, 6, 0)
    r(0, 19, 14, 3, 2); r(5, 16, 7, 3, 2); r(19, 21, 5, 3, 0)
  } else {
    r(0, 1, 24, 3, 2); r(0, 4, 11, 3, 2); r(16, 4, 8, 5, 2)
    r(0, 11, 9, 3, 0); r(9, 13, 6, 3, 0); r(13, 16, 3, 8, 0)
    r(3, 17, 6, 3, 2); r(20, 16, 4, 5, 2)
  }
})
for (const name of ['cap', 'cover-cap-1', 'cover-cap-2']) tile(name, 24, 24, r => {
  r(0, 0, 24, 24, 0); r(1, 1, 22, 22, 5); r(1, 1, 21, 20, 6)
  r(2, 1, 19, 2, 7); r(1, 3, 2, 16, 7)
  r(5, 5, 5, 2, 7); r(14, 14, 5, 3, 5); r(17, 12, 3, 2, 5)
  if (name !== 'cap') {
    const x = name === 'cover-cap-1' ? 7 : 14
    r(x, 8, 5, 2, 5); r(x + 2, 10, 3, 2, 5)
  }
})
// Stamped once per cap, so resizing a panel never repeats a crack into a motif.
tile('cover-chip', 16, 16, r => {
  r(4, 2, 3, 5, 5); r(6, 6, 4, 3, 5); r(8, 8, 3, 5, 5)
  r(3, 3, 1, 3, 7); r(7, 10, 1, 3, 7)
})
tile('masonry', 24, 24, r => {
  r(0, 0, 24, 24, 0)
  for (let row = 0; row < 2; row++) for (let x = row === 0 ? 0 : -12; x < 24; x += 24) {
    const y = row * 12
    r(x + 1, y + 1, 22, 10, 5); r(x + 2, y + 1, 19, 2, 6)
    r(x + 1, y + 3, 2, 6, 6); r(x + 16, y + 7, 5, 3, 4)
    r(x + 7, y + 5, 4, 2, 6)
  }
})
tile('crate-cap', 24, 24, r => {
  r(0, 0, 24, 24, 0); r(1, 1, 22, 22, 11)
  for (const x of [2, 9, 16]) { r(x, 2, 6, 19, 12); r(x, 2, 5, 2, 14) }
  r(1, 18, 22, 4, 11); r(1, 18, 21, 2, 12)
})
tile('crate-face', 24, 24, r => {
  r(0, 0, 24, 24, 0); r(1, 1, 22, 22, 11)
  for (const x of [2, 9, 16]) r(x, 2, 5, 19, 12)
  r(1, 10, 22, 6, 0); r(1, 11, 22, 4, 5); r(2, 11, 20, 1, 6)
  r(3, 12, 2, 2, 0); r(19, 12, 2, 2, 0)
})
tile('wood-top', 16, 16, r => {
  r(0, 0, 16, 16, 11); r(1, 1, 14, 14, 12); r(0, 0, 16, 1, 12)
  r(0, 1, 1, 14, 12); r(15, 0, 1, 16, 1); r(0, 15, 16, 1, 1)
  r(5, 1, 1, 14, 11); r(10, 1, 1, 14, 11)
})
tile('wood-front', 16, 16, r => {
  r(0, 0, 16, 16, 1); r(1, 1, 14, 14, 11)
  r(1, 1, 14, 2, 12); r(1, 12, 14, 2, 12)
  for (let x = 4; x < 15; x += 5) r(x, 3, 1, 9, 1)
  r(2, 4, 1, 7, 12); r(2, 2, 2, 2, 8); r(12, 12, 2, 2, 0)
})
tile('iron', 16, 16, r => {
  r(0, 0, 16, 16, 0)
  for (let x = 1; x < 16; x += 4) { r(x, 1, 2, 15, 4); r(x, 1, 1, 15, 7) }
  r(0, 0, 16, 2, 5); r(0, 1, 16, 1, 7); r(0, 12, 16, 2, 5)
})
for (let frame = 0; frame < 2; frame++) tile(`torch-${frame}`, 16, 24, r => {
  r(5, 12, 7, 11, 0); r(6, 13, 5, 9, 4); r(7, 14, 2, 7, 7)
  r(3, 13, 11, 2, 0); r(4, 13, 9, 1, 7)
  r(5, 6, 7, 7, 11); r(6, frame === 0 ? 2 : 4, 4, 10, 14)
  r(frame === 0 ? 8 : 6, 1, 2, 5, 14); r(7, 7, 3, 5, 15); r(8, 9, 2, 3, 15)
})
for (const [name, light, shade] of [['banner-red', 13, 11], ['banner-moss', 9, 10]]) tile(name, 24, 24, r => {
  r(2, 0, 20, 3, 0); r(4, 1, 16, 1, 6); r(4, 3, 16, 18, 0)
  r(5, 3, 14, 17, shade); r(6, 4, 10, 14, light); r(6, 20, 12, 2, 0)
  r(10, 7, 4, 2, 14); r(8, 9, 8, 5, 14); r(10, 14, 4, 2, 14); r(10, 10, 4, 3, light)
})
for (let frame = 0; frame < 2; frame++) tile(`brazier-${frame}`, 24, 24, r => {
  r(5, 14, 14, 5, 0); r(7, 19, 3, 5, 0); r(15, 19, 3, 5, 0)
  r(6, 15, 12, 3, 5); r(7, 15, 10, 2, 14); r(8, 18, 8, 2, 5)
  r(7, 9, 10, 6, 11); r(8, 7 + frame, 8, 7 - frame, 14)
  r(10 + frame, 3, 3, 8, 14); r(8, 10, 7, 4, 15); r(11, 8, 3, 5, 15)
})
tile('rubble', 16, 16, r => {
  r(1, 12, 14, 3, 1); r(2, 9, 6, 5, 4); r(3, 8, 4, 1, 6); r(2, 9, 2, 2, 6)
  r(9, 11, 4, 3, 5); r(9, 10, 3, 1, 7); r(12, 6, 2, 2, 4); r(1, 6, 2, 1, 5)
})
tile('pots', 16, 16, r => {
  r(1, 13, 14, 2, 1); r(1, 8, 7, 5, 0); r(2, 6, 5, 7, 11); r(1, 4, 7, 3, 0)
  r(2, 4, 5, 1, 12); r(2, 5, 5, 1, 1); r(2, 8, 2, 3, 12)
  r(9, 10, 6, 4, 0); r(10, 8, 4, 5, 12); r(9, 7, 6, 2, 0); r(10, 7, 4, 1, 8)
})
tile('chain', 16, 24, r => {
  for (const y of [0, 8, 16]) {
    r(4, y, 8, 8, 0); r(5, y + 1, 6, 6, 5); r(6, y + 2, 4, 4, 0)
    r(5, y + 1, 6, 2, 7); r(5, y + 3, 2, 3, 6)
  }
})
tile('shadow', 24, 16, r => {
  r(3, 11, 18, 3, 1); r(1, 12, 22, 1, 1); r(5, 10, 12, 5, 1)
  r(5, 11, 13, 3, 0); r(3, 12, 17, 1, 0)
})
tile('exit-rune', 24, 24, r => {
  r(3, 3, 18, 18, 1); r(3, 3, 18, 1, 9); r(3, 20, 18, 1, 9)
  r(3, 3, 1, 18, 9); r(20, 3, 1, 18, 9)
  for (let row = 0; row < 2; row++) for (let x = 0; x < 6; x++) {
    r(6 + x, 11 - x + row * 6, 1, 2, 8); r(12 + x, 6 + x + row * 6, 1, 2, 8)
  }
})
tile('bullet', 16, 16, r => {
  r(4, 5, 7, 5, 0); r(5, 4, 5, 7, 0); r(5, 5, 5, 5, 14); r(6, 6, 3, 3, 15)
})
tile('spark', 16, 16, r => {
  r(7, 1, 2, 14, 14); r(1, 7, 14, 2, 14); r(5, 5, 6, 6, 14); r(6, 6, 4, 4, 15)
})
const sheet = Array.from({ length: 192 }, () => Array(144).fill(-1))
assets.forEach(({ pixels }, i) => {
  const ox = i % 6 * 24, oy = Math.floor(i / 6) * 24
  pixels.forEach((row, y) => row.forEach((c, x) => { sheet[oy + y][ox + x] = c }))
})
render('environment', sheet)
renameSync('public/art/environment.png', `${output}/previews/environment.png`)
writeFileSync(`${root}/manifest.json`, JSON.stringify(assets.map(({ name, pixels }) => ({ name, width: pixels[0].length, height: pixels.length })), null, 2) + '\n')
console.log(`Rendered and linted ${assets.length} room/effect assets with ritmo-tools.`)
