/**
 * The page's icons, from the title's pixel clock (`clockFace` in `src/host/ui-pixels.ts`): an SVG favicon and the
 * PNG app icons (home screen, install), on the game's darkest ink. Writes `public/icons/`.
 * Usage: node scripts/icons.ts
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { chromium } from "playwright"
import { INK, clockFace } from "../src/host/ui-pixels.ts"

const out = "public/icons"
mkdirSync(out, { recursive: true })

// The hand at two o'clock, like the logo at rest.
const face = clockFace(2).replace(/<svg [^>]*viewBox="0 0 (\d+) (\d+)"[^>]*>/, (_, w: string, h: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`)
const size = Number(/viewBox="0 0 (\d+)/.exec(face)?.[1] ?? 19)

/** The clock centred on an ink square, `pad` pixels of the art's grid round it. */
const square = (pad: number): string => {
  const n = size + pad * 2
  const inner = face.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${INK}"/><g transform="translate(${pad} ${pad})">${inner}</g></svg>`
}

// The favicon: tight, so it reads at 16 px. The app icons: room round it, as home screens crop to a rounded mask.
writeFileSync(`${out}/favicon.svg`, square(1))
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, px, pad] of [["icon-192.png", 192, 4], ["icon-512.png", 512, 4], ["apple-touch-icon.png", 180, 3], ["favicon-32.png", 32, 1]] as const) {
  await page.setViewportSize({ width: px, height: px })
  await page.setContent(`<html><body style="margin:0;background:${INK}">${square(pad).replace("<svg ", `<svg width="${px}" height="${px}" `)}</body></html>`)
  await page.screenshot({ path: `${out}/${name}`, omitBackground: false })
}
await browser.close()
console.log(`icons written to ${out}/`)
