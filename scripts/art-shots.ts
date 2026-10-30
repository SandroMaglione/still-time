/** Live viewport checks plus labelled render fixtures for hard-to-capture effect phases. */
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { chromium } from "playwright"
import type { FightView } from "../src/sim/view.ts"

const base = process.argv[2] ?? "http://localhost:5302"
mkdirSync("output", { recursive: true })
const browser = await chromium.launch()
const errors: Array<string> = []
const measurements: Array<unknown> = []
try {
  for (const viewport of [
    { name: "phone", width: 390, height: 844, dpr: 2 },
    { name: "desktop", width: 1280, height: 800, dpr: 1 },
    { name: "landscape", width: 844, height: 390, dpr: 2 }
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.dpr })
    page.on("pageerror", e => errors.push(String(e)))
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
    await page.goto(`${base}/?room=7`)
    await page.waitForFunction(() => document.querySelector("#room")?.textContent?.includes("Thief"))
    await page.keyboard.down("ArrowUp"); await page.waitForTimeout(1200); await page.keyboard.up("ArrowUp")
    await page.waitForTimeout(150)
    await page.screenshot({ path: `output/art-room-${viewport.name}.png` })
    const grid = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#view")!
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
      const scale = Math.max(1, Math.floor(canvas.width / 240))
      let checked = 0, mismatches = 0
      for (let y = 0; y + scale <= canvas.height; y += scale * 7) {
        for (let x = 0; x + scale <= canvas.width; x += scale * 7) {
          const first = (y * canvas.width + x) * 4
          for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
            const at = ((y + dy) * canvas.width + x + dx) * 4
            if ([0, 1, 2, 3].some(c => pixels[first + c] !== pixels[at + c])) mismatches++
          }
          checked++
        }
      }
      return { scale, checked, mismatches }
    })
    assert.equal(grid.mismatches, 0, `${viewport.name}: enlarged pixels must remain uniform`)
    measurements.push({ viewport: viewport.name, ...grid })
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 1040, height: 900 }, deviceScaleFactor: 1 })
  page.on("pageerror", e => errors.push(String(e)))
  await page.goto(base)
  await page.waitForFunction(() => document.querySelector("#room")?.textContent?.includes("Duel"))
  const fixtures = await page.evaluate(async () => {
    const renderer = "/src/host/draw.ts", simulation = "/src/sim/simulation.ts", assets = "/src/host/art.ts"
    const { draw, Camera } = await import(renderer)
    const { createFight, IDLE_THUMB } = await import(simulation)
    await (await import(assets)).loadArt()
    const original: FightView = createFight(0, { snapshot: () => IDLE_THUMB }).view()
    const brute = original.enemies[0]!
    const sheet = document.createElement("section")
    sheet.id = "art-review"
    sheet.style.cssText = "position:absolute;z-index:100;inset:0 auto auto 0;display:grid;grid-template-columns:480px 480px;gap:12px;padding:16px;background:#171c2e;color:#f4efda;font:14px monospace"
    document.body.appendChild(sheet)
    const results = []
    for (const [phase, label] of [
      ["windup", "Committed wind-up: danger stays below the actors"],
      ["swing", "Swing: ivory edge, gold stipple, separate projectiles"],
      ["recover", "Recovery and hit crescent: open gold guard"],
      ["cover", "Cover: feet anchor, cast shadow, occlusion brackets"]
    ] as const) {
      const figure = document.createElement("figure"); figure.style.margin = "0"
      const caption = document.createElement("figcaption"); caption.textContent = label; caption.style.cssText = "height:32px;line-height:16px"
      const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 180
      canvas.style.cssText = "position:static;width:480px;height:360px;image-rendering:pixelated;display:block"
      figure.append(caption, canvas); sheet.appendChild(figure)
      const view: FightView = {
        ...original, world: 1, scale: 0.04,
        room: { ...original.room, index: 5, w: 10, h: 8, pillars: [{ x: 0, y: 1.5, w: 3.5, h: 0.6 }, { x: 6.5, y: 1.5, w: 3.5, h: 0.6 }, { x: 1.5, y: 4, w: 1.2, h: 1.2 }, { x: 7, y: 4, w: 1.2, h: 1.2 }], goal: { kind: "exit", x: 4, y: 0.2, w: 2, h: 1 } },
        player: { ...original.player!, x: phase === "cover" ? 7.5 : 4.3, y: phase === "cover" ? 4.4 : 5.3, vx: 0, vy: 0 },
        enemies: [{ ...brute, x: 5.7, y: 5, aim: 2.9, melee: { ...brute.melee!, phase: phase === "cover" ? "idle" : phase, locked: true, progress: 0.7 } }],
        shots: [{ id: 101, kind: "bullet", x: 3.3, y: 3, vx: 9, vy: 2, radius: 0.12 }, { id: 102, kind: "arrow", x: 5, y: 3, vx: 0, vy: 18, radius: 0.09 }, { id: 103, kind: "knife", x: 6.5, y: 3, vx: -8, vy: 8, radius: 0.1 }],
        slashes: phase === "recover" ? [{ born: 1, x: 5.4, y: 5, age: 0.2, angle: 0.3, blocked: false }] : []
      }
      const camera = new Camera(); camera.x = 5; camera.y = 4
      const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false
      draw(ctx, 240, 180, view, null, camera)
      const first = ctx.getImageData(0, 0, 240, 180).data
      draw(ctx, 240, 180, view, null, camera)
      const second = ctx.getImageData(0, 0, 240, 180).data
      const deterministic = first.every((c, i) => second[i] === c)
      const start = performance.now()
      for (let n = 0; n < 60; n++) draw(ctx, 240, 180, view, null, camera)
      results.push({ phase, deterministic, meanRenderMs: (performance.now() - start) / 60 })
    }
    return results
  })
  for (const fixture of fixtures) assert.ok(fixture.deterministic, `${fixture.phase}: stable decoration and rendering`)
  await page.locator("#art-review").screenshot({ path: "output/art-effects-review.png" })
  measurements.push({ fixtures })
  assert.deepEqual(errors, [])
  writeFileSync("output/art-validation.json", JSON.stringify(measurements, null, 2) + "\n")
  console.log(JSON.stringify(measurements, null, 2))
  console.log("No console errors; integer pixel scaling and deterministic render fixtures passed.")
} finally {
  await browser.close()
}
