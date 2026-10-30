import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Fix the generated draft, then render editable, exact-size sprite sources.
const palette = JSON.parse(readFileSync('pixel.config.json', 'utf8')).palette
const symbols = 'KBSWIHFDRMOYPUCG'
const run = (args, report, allowDraft = false) => {
  const result = spawnSync('pnpm', ['exec', 'ritmo-tools', 'pixel', ...args], { encoding: 'utf8' })
  writeFileSync(`assets/art/reports/${report}.json`, result.stdout)
  if (result.status !== 0 && !(allowDraft && result.status === 4)) throw new Error(result.stdout + result.stderr)
}
mkdirSync('public/art', { recursive: true })
mkdirSync('assets/art/previews', { recursive: true })
run(['fix', 'assets/art/source/characters-generated-v2.png', '--cell', '21.3333333333', '--offset', '0,0', '--remove-background', '--cleanup', '1', '-o', 'assets/art/characters-fixed'], 'draft-fix', true)
const draft = JSON.parse(readFileSync('assets/art/characters-fixed.json', 'utf8'))
const names = ['player', 'gunner', 'archer', 'thrower', 'brute', 'runner']
const sprites = []
function render(name, pixels) {
  const text = `palette\n. transparent\n${palette.map((c, i) => `${symbols[i]} ${c}`).join('\n')}\n\npixels\n${pixels.map(row => row.map(c => c < 0 ? '.' : symbols[c]).join('')).join('\n')}\n`
  const path = `assets/art/source/${name}.sprite.txt`
  writeFileSync(path, text)
  run(['render', path, '--out', `public/art/${name}`, '--scale', '8'], name)
  run(['lint', `public/art/${name}.png`], `${name}-lint`)
  for (const suffix of ['@8x.png', '.svg', '.preview.png']) renameSync(`public/art/${name}${suffix}`, `assets/art/previews/${name}${suffix}`)
}
for (let i = 0; i < names.length; i++) {
  // The thrower's knife extends two draft pixels beyond its nominal cell.
  // Its empty left margin lets us recover it without shrinking the sprite.
  const left = (i % 3) * 24 + (i === 3 ? 2 : 0)
  let pixels = Array.from({ length: 24 }, (_, y) => draft.pixels[y + Math.floor(i / 3) * 24].slice(left, left + 24))
  if (i === 4) {
    for (const row of pixels) {
      row.fill(-1, 0, 2) // Remove the neighbouring thrower's knife tip.
      for (let x = 0; x < 24; x++) if (row[x] === 14) row[x] = 3
    }
  }
  // Shared feet anchor at (12,23); no invented animation or resampling.
  const occupied = pixels.flatMap((row, y) => row.some(c => c >= 0) ? [y] : [])
  const shift = 22 - Math.max(...occupied)
  pixels = Array.from({ length: 24 }, (_, y) => pixels[y - shift] ?? Array(24).fill(-1))
  if (i === 0) {
    for (const y of [13, 14]) for (const x of [11, 14]) pixels[y][x] = 14
  }
  sprites.push(pixels)
  render(names[i], pixels)
  // Combat bodies have empty hands. The rig supplies one short held weapon,
  // with its grip and recoil, rather than drawing over the baked-in blade/gun.
  const body = pixels.map(row => [...row])
  if (i === 1) for (let y = 12; y < 23; y++) body[y].fill(-1, y < 17 ? 17 : 18)
  if (i === 2) for (let y = 9; y < 23; y++) body[y].fill(-1, y < 13 ? 20 : y < 17 ? 18 : 17)
  if (i === 3) for (let y = 14; y < 23; y++) body[y].fill(-1, y < 17 ? 19 : 17)
  if (i === 4) for (let y = 9; y < 23; y++) body[y].fill(-1, 19)
  // Remove disconnected ink left by the cropped prop, keeping the actor's
  // largest eight-connected silhouette. Color islands such as eyes stay intact.
  const seen = new Set(), components = []
  for (let at = 0; at < 576; at++) {
    if (seen.has(at) || body[Math.floor(at / 24)][at % 24] < 0) continue
    const stack = [at], component = new Set()
    while (stack.length > 0) {
      const n = stack.pop(), x = n % 24, y = Math.floor(n / 24)
      if (seen.has(n)) continue
      seen.add(n); component.add(n)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx >= 0 && x + dx < 24 && y + dy >= 0 && y + dy < 24 && body[y + dy][x + dx] >= 0 && !seen.has(n + dy * 24 + dx)) stack.push(n + dy * 24 + dx)
      }
    }
    components.push(component)
  }
  const silhouette = components.sort((a, b) => b.size - a.size)[0]
  if (silhouette !== undefined) for (let at = 0; at < 576; at++) if (!silhouette.has(at)) body[Math.floor(at / 24)][at % 24] = -1
  render(`${names[i]}-body`, body)
}
const atlas = Array.from({ length: 48 }, (_, y) => Array.from({ length: 72 }, (_, x) => sprites[Math.floor(y / 24) * 3 + Math.floor(x / 24)][y % 24][x % 24]))
render('characters', atlas)

function tile(name, size, paint) {
  const pixels = Array.from({ length: size }, () => Array(size).fill(-1))
  const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pixels[j][i] = c }
  paint(rect)
  render(name, pixels)
}
tile('floor', 16, r => {
  r(0, 0, 16, 16, 1); r(0, 0, 16, 1, 0); r(0, 0, 1, 16, 0)
  r(13, 13, 2, 1, 0)
})
tile('stone', 24, r => {
  r(1, 1, 22, 22, 0); r(2, 2, 20, 13, 2); r(3, 3, 18, 1, 3)
  r(3, 4, 1, 10, 3); r(2, 15, 20, 7, 1); r(3, 16, 18, 1, 2)
  r(8, 17, 1, 5, 0); r(16, 17, 1, 5, 0); r(15, 7, 5, 1, 1); r(14, 8, 1, 3, 1)
})
tile('slab', 16, r => {
  r(0, 0, 16, 16, 2); r(0, 0, 16, 1, 3); r(0, 1, 1, 15, 3)
  r(0, 15, 16, 1, 1); r(15, 0, 1, 16, 1)
  r(10, 4, 3, 1, 1); r(9, 5, 1, 2, 1)
})
tile('gate', 24, r => {
  r(0, 1, 24, 22, 0); r(1, 2, 22, 20, 2); r(2, 3, 20, 1, 3)
  r(3, 5, 18, 16, 0)
  for (let x = 4; x < 22; x += 4) { r(x, 5, 2, 16, 3); r(x + 1, 5, 1, 16, 2) }
  r(2, 17, 20, 2, 2); r(2, 17, 20, 1, 3)
})
tile('crown', 16, r => {
  r(2, 5, 12, 8, 0); r(1, 3, 3, 3, 0); r(6, 1, 3, 5, 0); r(12, 3, 3, 3, 0)
  r(3, 6, 10, 6, 10); r(2, 4, 1, 3, 11); r(7, 2, 1, 6, 11); r(13, 4, 1, 3, 11)
  r(3, 8, 10, 3, 11); r(7, 9, 2, 2, 8)
})
tile('key', 16, r => {
  r(1, 4, 7, 7, 0); r(2, 3, 5, 9, 0); r(2, 5, 5, 5, 14); r(3, 4, 3, 7, 14)
  r(3, 6, 3, 3, 0); r(7, 6, 8, 4, 0); r(7, 7, 7, 1, 14)
  r(10, 8, 2, 4, 0); r(13, 8, 2, 4, 0); r(10, 8, 1, 3, 14); r(13, 8, 1, 3, 14)
})
tile('exit', 16, r => {
  r(0, 0, 16, 16, 1); r(0, 0, 16, 1, 15); r(0, 15, 16, 1, 15); r(0, 0, 1, 16, 15); r(15, 0, 1, 16, 15)
  for (let k = 0; k < 2; k++) for (let x = 0; x < 5; x++) { r(3 + x, 7 - x + k * 5, 1, 2, 15); r(8 + x, 3 + x + k * 5, 1, 2, 15) }
})
writeFileSync('public/art/atlas.json', JSON.stringify({ image: 'characters.png', frameSize: [24, 24], anchor: [12, 23], frames: Object.fromEntries(names.map((name, i) => [name, { x: (i % 3) * 24, y: Math.floor(i / 3) * 24, w: 24, h: 24 }])) }, null, 2) + '\n')
console.log('Rendered and linted 6 characters, 6 empty-hand combat bodies, a character atlas, and 7 tiles/icons with ritmo-tools.')
