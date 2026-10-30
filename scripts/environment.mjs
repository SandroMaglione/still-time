// Native-size room art, authored as editable sprite text and rendered by ritmo-tools.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = 'assets/art/environment'
const config = `${root}/pixel.config.json`
const palette = JSON.parse(readFileSync(config, 'utf8')).palette
const keys = 'ABCDEFGHIJKLMNOP'
const assets = []
for (const dir of ['source', 'previews', 'reports']) mkdirSync(`${root}/${dir}`, { recursive: true })
mkdirSync('public/art', { recursive: true })
function command(args, report) {
  const result = spawnSync('pnpm', ['exec', 'ritmo-tools', 'pixel', ...args, '--config', config], { encoding: 'utf8' })
  writeFileSync(`${root}/reports/${report}.json`, result.stdout)
  if (result.status !== 0) throw new Error(result.stdout + result.stderr)
}
function render(name, pixels) {
  const text = `palette\n. transparent\n${palette.map((c, i) => `${keys[i]} ${c}`).join('\n')}\n\npixels\n${pixels.map(row => row.map(c => c < 0 ? '.' : keys[c]).join('')).join('\n')}\n`
  const source = `${root}/source/${name}.sprite.txt`
  writeFileSync(source, text)
  command(['render', source, '-o', `public/art/${name}`, '--scale', '4'], name)
  command(['lint', `public/art/${name}.png`], `${name}-lint`)
  for (const suffix of ['@4x.png', '.svg', '.preview.png']) renameSync(`public/art/${name}${suffix}`, `${root}/previews/${name}${suffix}`)
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
for (let variant = 0; variant < 6; variant++) tile(`floor-${variant}`, 24, 16, (r, l) => {
  r(0, 0, 24, 16, variant === 1 ? 2 : 3)
  r(0, 15, 24, 1, 2); r(23, 0, 1, 16, 2)
  r(1, 0, 12, 1, 4); r(0, 1, 1, 7, 4)
  if (variant === 2) { l(17, 0, 14, 4, 1); l(14, 4, 16, 7, 1); l(14, 4, 10, 5, 2) }
  if (variant === 3) { r(1, 11, 4, 3, 10); r(4, 13, 4, 2, 10); r(2, 13, 2, 1, 5); r(1, 8, 2, 2, 10) }
  if (variant === 4) { r(15, 11, 4, 1, 4); r(18, 10, 2, 1, 4); r(6, 5, 2, 1, 2) }
  if (variant === 5) { l(0, 9, 3, 10, 1); l(3, 10, 5, 15, 1); r(1, 12, 2, 2, 2); r(5, 14, 3, 1, 4) }
})
tile('cap', 16, 16, (r, l) => {
  r(0, 0, 16, 16, 6); r(0, 0, 16, 1, 8); r(0, 1, 1, 14, 7)
  r(0, 15, 16, 1, 4); r(15, 0, 1, 16, 5); r(1, 1, 14, 1, 7)
  l(12, 0, 10, 3, 5); l(10, 3, 12, 5, 5)
})
tile('masonry', 16, 16, r => {
  r(0, 0, 16, 16, 4)
  for (let row = 0; row < 2; row++) {
    const y = row * 8, offset = row === 0 ? 0 : -8
    for (let x = offset; x < 16; x += 16) {
      r(x + 1, y + 1, 14, 6, 5); r(x + 1, y + 1, 14, 1, 6)
      r(x + 1, y + 2, 1, 4, 6); r(x + 2, y + 6, 13, 1, 3)
    }
  }
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
  r(2, 4, 1, 7, 12); r(2, 2, 1, 1, 8); r(13, 13, 1, 1, 0)
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
for (const [name, light, shade] of [['banner-red', 13, 11], ['banner-moss', 9, 10]]) tile(name, 16, 24, r => {
  r(1, 1, 14, 2, 0); r(2, 1, 12, 1, 7); r(3, 3, 10, 17, 0)
  r(4, 3, 8, 15, shade); r(4, 3, 6, 14, light); r(5, 18, 6, 2, shade); r(6, 20, 4, 1, 0)
  r(5, 4, 1, 12, 14); r(10, 4, 1, 12, 14); r(7, 7, 2, 5, 14); r(6, 9, 4, 1, 14)
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
  r(6, 0, 5, 3, 0); r(7, 1, 3, 1, 7)
  for (let y = 3; y < 17; y += 4) { r(6, y, 4, 5, 0); r(6, y, 3, 1, 7); r(6, y + 1, 1, 3, 6) }
  r(4, 17, 8, 6, 0); r(5, 17, 6, 1, 7); r(4, 18, 1, 4, 6); r(11, 18, 1, 4, 5)
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
const sheet = Array.from({ length: 96 }, () => Array(144).fill(-1))
assets.forEach(({ pixels }, i) => {
  const ox = i % 6 * 24, oy = Math.floor(i / 6) * 24
  pixels.forEach((row, y) => row.forEach((c, x) => { sheet[oy + y][ox + x] = c }))
})
render('environment', sheet)
renameSync('public/art/environment.png', `${root}/previews/environment.png`)
writeFileSync(`${root}/manifest.json`, JSON.stringify(assets.map(({ name, pixels }) => ({ name, width: pixels[0].length, height: pixels.length })), null, 2) + '\n')
console.log(`Rendered and linted ${assets.length} room/effect assets with ritmo-tools.`)
