// Three original 24px hero silhouettes; the wide-hat traveller is the selected runtime body.
import { readFileSync, writeFileSync } from 'node:fs'
const palette = JSON.parse(readFileSync('pixel.config.json', 'utf8')).palette
const keys = 'ABCDEFGHIJKLMNOP'
const options = []
const encode = pixels => `palette\n. transparent\n${palette.map((c, i) => `${keys[i]} ${c}`).join('\n')}\n\npixels\n${pixels.map(row => row.map(c => c < 0 ? '.' : keys[c]).join('')).join('\n')}\n`
for (const name of ['scarf', 'hat', 'visor']) {
  const pixels = Array.from({ length: 24 }, () => Array(24).fill(-1))
  const r = (x, y, w, h, colour) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && xx < 24 && yy >= 0 && yy < 24) pixels[yy][xx] = colour }
  // Small boots and an ivory travelling coat, deliberately narrower than the headgear.
  r(7, 19, 5, 4, 0); r(14, 19, 5, 4, 0); r(8, 20, 3, 2, 2); r(15, 20, 3, 2, 2)
  r(6, 13, 14, 7, 0); r(7, 14, 12, 5, 5); r(8, 14, 8, 4, 4)
  r(5, 15, 3, 4, 0); r(6, 16, 2, 2, 5); r(18, 15, 3, 4, 0); r(18, 16, 2, 2, 4)
  r(9, 18, 8, 2, 14); r(11, 18, 3, 2, 1)
  if (name === 'scarf') {
    r(2, 11, 7, 4, 0); r(1, 14, 5, 4, 0); r(2, 12, 6, 2, 14); r(2, 14, 3, 3, 14); r(2, 12, 4, 1, 15)
    r(8, 3, 10, 2, 0); r(6, 5, 14, 8, 0); r(7, 5, 12, 7, 5); r(8, 4, 9, 4, 4)
    r(8, 8, 11, 4, 0); r(9, 9, 3, 2, 15); r(15, 9, 3, 2, 14)
    r(7, 12, 12, 3, 0); r(8, 12, 10, 2, 14); r(9, 12, 5, 1, 15)
  } else if (name === 'hat') {
    // A swept ivory crown, wide brim and teal underbrim form one unmistakable silhouette.
    r(8, 8, 11, 6, 0); r(9, 9, 9, 4, 1); r(10, 11, 3, 2, 15); r(15, 11, 2, 2, 14)
    r(5, 2, 6, 3, 0); r(7, 4, 9, 3, 0); r(6, 3, 4, 2, 4); r(8, 4, 7, 3, 4)
    r(6, 6, 12, 3, 0); r(7, 6, 9, 2, 4); r(15, 6, 2, 2, 5)
    r(2, 8, 20, 3, 0); r(3, 8, 17, 1, 4); r(4, 9, 16, 1, 5)
    r(7, 13, 13, 3, 0); r(8, 13, 11, 2, 14); r(9, 13, 5, 1, 15)
    r(3, 14, 5, 3, 0); r(2, 16, 5, 3, 0); r(3, 15, 5, 1, 14); r(3, 16, 3, 2, 14)
    r(7, 5, 1, 1, 4); r(7, 17, 1, 1, 4)
  } else {
    r(7, 2, 12, 2, 0); r(5, 4, 16, 10, 0); r(6, 4, 14, 9, 5); r(7, 3, 11, 4, 4)
    r(7, 7, 13, 5, 0); r(8, 8, 11, 3, 14); r(9, 8, 7, 1, 15)
    r(10, 12, 7, 2, 4); r(3, 7, 3, 5, 0); r(4, 8, 2, 3, 14)
    r(7, 14, 1, 1, 4)
  }
  options.push(pixels)
  writeFileSync(`assets/art/source/hero-${name}.sprite.txt`, encode(pixels))
}
writeFileSync('assets/art/source/hero-options.sprite.txt', encode(Array.from({ length: 24 }, (_, y) => options.flatMap(p => p[y]))))
// Selected hero replaces every final export that contains the old player.
for (const name of ['player-body', 'player']) writeFileSync(`assets/art/source/${name}.sprite.txt`, encode(options[1]))
const atlasPath = 'assets/art/source/characters.sprite.txt'
const atlas = readFileSync(atlasPath, 'utf8').split('pixels\n')[1].trim().split('\n').map(row => [...row])
const original = readFileSync(atlasPath, 'utf8').split('pixels\n')[0]
const oldKeys = new Map(original.split('\n').filter(line => /^[A-Za-z] #/.test(line)).map(line => { const [key, colour] = line.split(' '); return [colour, key] }))
for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) atlas[y][x] = options[1][y][x] < 0 ? '.' : oldKeys.get(palette[options[1][y][x]])
writeFileSync(atlasPath, original + 'pixels\n' + atlas.map(row => row.join('')).join('\n') + '\n')
