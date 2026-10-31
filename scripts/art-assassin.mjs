// Review 7: shared-palette, native 24px art. Sources are canonical; studies stay in output/.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const config = JSON.parse(readFileSync('pixel.config.json', 'utf8'))
const palette = config.palette, keys = 'ABCDEFGHIJKLMNOP', exports = []
const root = 'output/review-7'
mkdirSync(`${root}/sources`, { recursive: true })
mkdirSync(`${root}/reports`, { recursive: true })
const encode = pixels => `palette\n. transparent\n${palette.map((c, i) => `${keys[i]} ${c}`).join('\n')}\n\npixels\n${pixels.map(row => row.map(c => c < 0 ? '.' : keys[c]).join('')).join('\n')}\n`
function make(name, paint, canonical = true) {
  const pixels = Array.from({ length: 24 }, () => Array(24).fill(-1))
  const r = (x, y, w, h, c) => {
    for (let yy = Math.max(0, y); yy < Math.min(24, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(24, x + w); xx++) pixels[yy][xx] = c
  }
  const p = (points, c) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      let inside = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j]
        if ((a[1] > y + 0.5) !== (b[1] > y + 0.5) && x + 0.5 < (b[0] - a[0]) * (y + 0.5 - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
      }
      if (inside) pixels[y][x] = c
    }
  }
  paint(r, p)
  const source = canonical ? `assets/art/source/${name}.sprite.txt` : `${root}/sources/${name}.sprite.txt`
  writeFileSync(source, encode(pixels)); exports.push({ name, source, canonical })
  return pixels
}

// All three have a covered face, an adult torso, a single scarf accent and a low knife.
function assassin(name, variant) {
  return make(name, (r, p) => {
    // Fitted tunic, separated boots, bent elbows. No face or hair colours.
    p([[8, 11], [16, 11], [19, 16], [18, 20], [7, 20], [5, 16]], 0)
    p([[8, 12], [15, 12], [17, 16], [16, 19], [8, 19], [7, 15]], 1)
    r(8, 13, 2, 4, 2); r(14, 15, 3, 4, 0)
    r(7, 19, 5, 4, 0); r(14, 19, 5, 4, 0)
    r(8, 20, 3, 2, 1); r(15, 20, 2, 2, 1); r(8, 22, 3, 1, 2)
    r(6, 15, 3, 4, 0); r(7, 15, 2, 3, 2)
    r(16, 15, 4, 4, 0); r(17, 15, 2, 3, 1); r(18, 18, 2, 2, 2)
    r(8, 17, 9, 2, 0); r(9, 17, 3, 1, 2)
    // Reverse-grip knife is below the hand, edged in ivory, with a dark border.
    p([[19, 17], [22, 18], [21, 23], [18, 21]], 0)
    r(19, 19, 2, 3, 5); r(19, 19, 1, 3, 4); r(18, 18, 4, 1, 2)
    if (variant === 0) {
      // A / Needle hood: an off-centre point, narrow mask and short sash.
      p([[13, 0], [17, 4], [19, 10], [16, 13], [6, 13], [5, 8], [8, 3]], 0)
      p([[12, 2], [16, 5], [17, 10], [15, 12], [7, 12], [6, 8], [9, 4]], 1)
      p([[12, 2], [13, 4], [9, 7], [8, 11], [6, 10], [7, 6]], 2)
      r(9, 7, 7, 4, 0); r(10, 8, 2, 1, 14); r(14, 8, 1, 1, 14)
      r(9, 10, 7, 2, 1); r(9, 10, 4, 1, 2)
      r(9, 12, 8, 2, 0); r(10, 12, 6, 1, 14)
      p([[8, 12], [11, 13], [8, 18], [4, 19], [5, 15]], 0)
      p([[8, 13], [10, 13], [7, 17], [5, 18], [6, 15]], 14)
    } else if (variant === 1) {
      // B / Split cowl: broad brow, masked slit, and one long swept scarf tail.
      p([[10, 1], [15, 2], [18, 5], [19, 10], [17, 13], [7, 13], [5, 10], [6, 5]], 0)
      p([[10, 2], [14, 3], [17, 5], [18, 10], [16, 12], [8, 12], [6, 9], [7, 5]], 1)
      p([[10, 2], [12, 3], [9, 5], [8, 8], [7, 10], [6, 8], [8, 4]], 2)
      r(9, 6, 8, 5, 0); r(9, 6, 5, 1, 2)
      r(10, 8, 2, 1, 14); r(14, 8, 2, 1, 14)
      p([[8, 10], [17, 10], [16, 13], [9, 13]], 1)
      r(9, 10, 6, 1, 2)
      p([[8, 11], [10, 13], [7, 16], [2, 15], [0, 12], [4, 13]], 0)
      p([[8, 12], [9, 13], [6, 15], [3, 14], [2, 13], [5, 14]], 14)
      r(8, 12, 8, 2, 0); r(9, 12, 7, 1, 14)
    } else {
      // C / Ash veil: a wrapped cowl and an ivory cloth mask, single teal sash.
      p([[8, 2], [16, 2], [18, 5], [18, 12], [6, 12], [5, 7]], 0)
      p([[9, 3], [15, 3], [17, 5], [17, 11], [7, 11], [6, 7]], 1)
      r(8, 3, 7, 2, 2); r(7, 6, 9, 1, 2)
      r(8, 7, 9, 3, 0); r(10, 8, 2, 1, 5); r(14, 8, 1, 1, 5)
      p([[7, 10], [17, 9], [17, 12], [12, 14], [7, 12]], 0)
      p([[8, 10], [16, 10], [16, 12], [12, 13], [8, 12]], 5)
      r(9, 10, 5, 1, 4)
      p([[7, 14], [10, 14], [16, 18], [14, 19]], 14)
      p([[6, 13], [8, 14], [6, 18], [3, 18], [4, 15]], 0)
      p([[6, 14], [7, 14], [5, 17], [4, 17]], 14)
    }
  }, false)
}
const choices = [assassin('assassin-a', 0), assassin('assassin-b', 1), assassin('assassin-c', 2)]
writeFileSync('assets/art/source/player-body.sprite.txt', encode(choices[1]))
writeFileSync('assets/art/player-body.pixel.config.json', JSON.stringify({ palette, sizes: ['24x24'], maxColors: 16 }, null, 2) + '\n')
exports.push({ name: 'player-body', source: 'assets/art/source/player-body.sprite.txt', canonical: true })

for (const state of ['up', 'down', 'missed']) make(`plate-${state}`, r => {
  // A stone slab with a coloured rim and nothing in the middle: raised (a front lip under its top) while it waits,
  // gold; sunk flush with the floor once pressed, teal; a wrong press, red. The top's centre is at (12, 10) raised and
  // (12, 13) sunk: the page draws it 3 px higher while it stands proud.
  const down = state === 'down', y = down ? 5 : 2, rim = state === 'missed' ? 8 : down ? 14 : 11
  r(1, y, 22, down ? 18 : 21, 0)
  r(2, y + 1, 20, 15, down ? 1 : 3)
  if (down) r(2, y + 1, 20, 1, 0)
  else { r(2, y + 1, 20, 1, 5); r(2, y + 16, 20, 1, 1); r(2, y + 17, 20, 2, 2) }
  r(4, y + 3, 16, 1, rim); r(4, y + 13, 16, 1, rim); r(4, y + 3, 1, 11, rim); r(19, y + 3, 1, 11, rim)
  const bottom = y + (down ? 17 : 20)
  for (const [cx, cy] of [[1, y], [22, y], [1, bottom], [22, bottom]]) r(cx, cy, 1, 1, -1)
})

make('belt-tread', r => {
  r(0, 0, 24, 24, 0)
  for (let y = 0; y < 24; y += 8) {
    r(0, y + 1, 24, 6, 1); r(1, y + 1, 22, 1, 2)
    r(0, y + 2, 2, 3, 2); r(22, y + 3, 2, 3, 2)
    r(4, y + 3, 4, 2, 2); r(16, y + 3, 4, 2, 2)
  }
  // One chunky up-chevron per 24px repeat, surrounded by real tread slats.
  r(11, 5, 2, 2, 11); r(9, 7, 2, 2, 11); r(13, 7, 2, 2, 11)
  r(7, 9, 2, 2, 11); r(15, 9, 2, 2, 11)
})
make('belt-roller', r => {
  r(0, 0, 24, 8, 0); r(0, 1, 24, 5, 2); r(0, 1, 24, 1, 5)
  for (let x = 0; x < 24; x += 6) { r(x, 2, 2, 4, 0); r(x + 2, 2, 3, 2, 3) }
  r(0, 6, 24, 1, 1)
})
make('blade-bar', (r, p) => {
  r(0, 9, 24, 7, 0); r(0, 10, 24, 5, 2); r(0, 10, 24, 2, 5)
  r(0, 11, 24, 1, 4); r(0, 14, 24, 1, 8)
  for (let x = 0; x < 24; x += 8) {
    p([[x + 1, 10], [x + 5, 6], [x + 6, 10]], 0)
    p([[x + 2, 10], [x + 5, 8], [x + 5, 10]], 5)
    p([[x + 2, 15], [x + 3, 18], [x + 6, 15]], 0)
    r(x + 3, 15, 2, 2, 8)
    r(x + 5, 12, 2, 2, 1)
  }
})
make('blade-hub', (r, p) => {
  p([[8, 5], [16, 5], [20, 9], [20, 16], [16, 20], [8, 20], [4, 16], [4, 9]], 0)
  p([[8, 6], [16, 6], [19, 9], [19, 15], [16, 18], [8, 18], [5, 15], [5, 9]], 2)
  r(8, 6, 8, 2, 5); r(5, 9, 2, 6, 3)
  r(8, 9, 8, 7, 0); r(9, 10, 6, 5, 8); r(10, 10, 4, 2, 10)
  r(11, 11, 2, 3, 0); r(11, 11, 2, 1, 5)
})

for (const state of ['off', 'warn', 'on']) make(`laser-post-${state}`, (r, p) => {
  p([[7, 4], [15, 4], [18, 7], [18, 21], [16, 23], [6, 23], [4, 21], [4, 7]], 0)
  r(6, 8, 10, 13, 1); r(6, 8, 2, 12, 2); r(8, 19, 8, 2, 2)
  p([[7, 5], [14, 5], [16, 7], [16, 10], [6, 10], [6, 7]], 2)
  r(8, 5, 6, 1, 5); r(6, 7, 2, 2, 3)
  r(8, 10, 8, 7, 0); r(9, 11, 6, 4, state === 'on' ? 8 : state === 'warn' ? 10 : 2)
  if (state !== 'off') { r(10, 12, 4, 2, state === 'on' ? 4 : 11) }
  r(8, 18, 2, 2, 0); r(13, 18, 2, 2, 0)
  r(6, 21, 11, 1, 2)
})

for (const frame of ['idle', '0', '1']) make(`bomb-${frame}`, (r, p) => {
  p([[9, 12], [15, 12], [18, 15], [18, 20], [15, 23], [9, 23], [6, 20], [6, 15]], 0)
  p([[9, 13], [14, 13], [17, 15], [17, 20], [14, 22], [9, 22], [7, 20], [7, 15]], 1)
  r(9, 13, 5, 2, 3); r(8, 15, 2, 3, 2); r(10, 20, 5, 1, 2)
  r(14, 16, 3, 4, 9); r(15, 17, 2, 2, 8)
  r(10, 10, 5, 3, 0); r(11, 11, 3, 2, 2)
  r(13, 8, 2, 3, 0); r(14, 7, 3, 2, 0); r(14, 8, 2, 2, 11)
  if (frame !== 'idle') {
    r(frame === '0' ? 15 : 14, frame === '0' ? 4 : 5, 4, 4, 0)
    r(frame === '0' ? 16 : 15, frame === '0' ? 4 : 5, 2, 4, 10)
    r(frame === '0' ? 15 : 14, frame === '0' ? 5 : 6, 4, 2, 11)
    r(frame === '0' ? 16 : 15, frame === '0' ? 5 : 6, 2, 2, 4)
  }
})

const stalker = make('stalker-body', (r, p) => {
  // A low predatory head, arched shoulders, planted claws. The eyes are 14px above its feet.
  p([[8, 2], [11, 4], [15, 3], [19, 6], [20, 12], [23, 16], [23, 21], [18, 21], [16, 17], [9, 18], [6, 22], [1, 22], [1, 17], [4, 12], [5, 6]], 0)
  p([[8, 4], [11, 5], [15, 4], [18, 7], [19, 13], [22, 17], [21, 20], [19, 19], [16, 15], [8, 16], [5, 21], [2, 21], [3, 17], [6, 12], [6, 7]], 13)
  p([[8, 4], [10, 5], [8, 8], [7, 13], [4, 17], [3, 20], [2, 20], [3, 16], [5, 12], [6, 6]], 12)
  p([[16, 6], [19, 9], [20, 14], [17, 13]], 1)
  p([[8, 7], [17, 7], [18, 11], [15, 14], [9, 13], [7, 11]], 0)
  r(9, 9, 2, 1, 14); r(14, 9, 2, 1, 14)
  r(11, 12, 4, 1, 13)
  r(9, 14, 7, 2, 12); r(12, 15, 5, 2, 13)
  r(3, 19, 3, 2, 1); r(19, 18, 3, 2, 1)
  r(2, 21, 2, 1, 5); r(5, 20, 2, 1, 5)
  r(20, 20, 2, 1, 5); r(18, 19, 2, 1, 5)
})
writeFileSync('assets/art/source/stalker.sprite.txt', encode(stalker))
exports.push({ name: 'stalker', source: 'assets/art/source/stalker.sprite.txt', canonical: true })

// Invoking this script renders just this pass. The bulk art script imports it before its render loop.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const { name, source, canonical } of exports) {
    const out = canonical ? `public/art/${name}` : `${root}/${name}`
    for (const args of [
      ['render', source, '--out', out, '--scale', '4'],
      ['lint', `${out}.png`]
    ]) {
      const result = spawnSync('pnpm', ['exec', 'ritmo-tools', 'pixel', ...args], { encoding: 'utf8' })
      writeFileSync(`${root}/reports/${name}-${args[0]}.json`, result.stdout)
      if (result.status !== 0) throw new Error(result.stdout + result.stderr)
    }
    if (canonical) for (const suffix of ['@4x.png', '.svg', '.preview.png']) {
      const { renameSync } = await import('node:fs')
      renameSync(`${out}${suffix}`, `${root}/${name}${suffix}`)
    }
  }
  console.log(`Rendered and linted ${exports.length} native 24px sprites; studies/reports in ${root}.`)
}
