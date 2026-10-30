// Sprite text is canonical. Drafts, intermediate fixes and review exports stay in ignored output/.
import { readdirSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import './batch2-art.mjs'

const out = 'output/art'
for (const folder of ['previews', 'reports']) mkdirSync(`${out}/${folder}`, { recursive: true })
mkdirSync('public/art', { recursive: true })
for (const file of readdirSync('assets/art/source').filter(name => name.endsWith('.sprite.txt'))) {
  const name = file.replace('.sprite.txt', '')
  for (const [label, args] of [
    [name, ['render', `assets/art/source/${file}`, '--out', `public/art/${name}`, '--scale', '8']],
    [`${name}-lint`, ['lint', `public/art/${name}.png`]]
  ]) {
    const result = spawnSync('pnpm', ['exec', 'ritmo-tools', 'pixel', ...args], { encoding: 'utf8' })
    writeFileSync(`${out}/reports/${label}.json`, result.stdout)
    if (result.status !== 0) throw new Error(result.stdout + result.stderr)
  }
  for (const suffix of ['@8x.png', '.svg', '.preview.png']) renameSync(`public/art/${name}${suffix}`, `${out}/previews/${name}${suffix}`)
}
console.log('Rendered and linted canonical character sprites; previews and reports are in output/art/.')
