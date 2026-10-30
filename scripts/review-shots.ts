/** Matched renderer fixtures, requested phone views, and a real simulated wind-up. */
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { chromium } from "playwright"
import type { EnemyView, FightView } from "../src/sim/view.ts"

const base = process.argv[2] ?? "http://localhost:5350"
const before = process.argv.includes("--before")
const round2 = process.argv.includes("--round-2")
const round3 = process.argv.includes("--round-3")
const root = `output/review-${round3 ? 3 : round2 ? 2 : 1}`
const dir = `${root}/${before ? "before" : "after"}`
mkdirSync(dir, { recursive: true })
const browser = await chromium.launch()
const errors: Array<string> = []
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  page.on("pageerror", e => errors.push(String(e)))
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
  if (!before) for (const room of round2 || round3 ? [1, 4, 9, 11, 12] : [4, 9, 11, 12]) {
    await page.goto(`${base}/?room=${room}&all`)
    await page.waitForFunction(() => document.querySelector("#room")!.textContent!.length > 0)
    await page.waitForTimeout(800)
    await page.keyboard.down("ArrowUp"); await page.waitForTimeout(900); await page.keyboard.up("ArrowUp")
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${dir}/room-${room}.png` })
  }
  await page.goto(`${base}/?room=1&all`)
  await page.waitForFunction(() => document.querySelector("#room")!.textContent!.includes("Duel"))
  const frames = await page.evaluate(async () => {
    const renderer = "/src/host/draw.ts", simulation = "/src/sim/simulation.ts", artPath = "/src/host/art.ts"
    const { draw, Camera } = await import(renderer), { createFight, IDLE_THUMB } = await import(simulation)
    await (await import(artPath)).loadArt()
    const original: FightView = createFight(0, { snapshot: () => IDLE_THUMB }).view()
    const brute = original.enemies[0]!
    const camera = new Camera(); camera.x = 5; camera.y = 4.5
    const room = { ...original.room, w: 10, h: 8, pillars: [{ x: 1, y: 3, w: 1.2, h: 1.2 }, { x: 7.5, y: 3, w: 1.2, h: 1.2 }], goal: { kind: "clear" as const } }
    const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 160
    const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false
    const result: Record<string, string> = {}
    const melee = brute.melee!
    for (const category of ["floor", "telegraph", "enemies"] as const) {
      const enemies: Array<EnemyView> = category === "floor" ? [] : category === "telegraph" ? [
        { ...brute, x: 6, y: 4.5, aim: 2.8, melee: { ...melee, phase: "chase" } },
        { ...brute, id: 80, kind: "gunner", x: 3.4, y: 2.8, melee: null, laser: null, charge: 0.7, aim: Math.PI / 2 }
      ] : [
        { ...brute, kind: "knight", x: 3.2, y: 4.8, aim: 0, melee: { ...melee, phase: "chase", hp: 3, maxHp: 3 } },
        { ...brute, id: 81, kind: "shield", x: 5.2, y: 4.8, aim: Math.PI / 2, melee: { ...melee, phase: "chase", shield: true, guarding: true } },
        { ...brute, id: 82, kind: "sniper", x: 7.3, y: 4.8, aim: Math.PI / 2, melee: null, laser: null }
      ]
      const view: FightView = { ...original, world: 1, room, player: null, enemies, doors: [], keys: [], shots: category === "telegraph" ? [
        { id: 100, kind: "bullet", x: 3.4, y: 4.3, radius: 0.12, vx: 0, vy: 9 },
        { id: 101, kind: "arrow", x: 4.5, y: 3.4, radius: 0.09, vx: 8, vy: 12 }
      ] : [] }
      draw(ctx, 240, 160, view, null, camera)
      result[category] = canvas.toDataURL("image/png").split(",")[1]!
    }
    let push = { x: 0, y: -1 }
    const fight = createFight(0, { snapshot: () => ({ ...push, tap: false }) })
    for (let i = 0; i < 900; i++) {
      const view: FightView = fight.view(), e = view.enemies[0]!
      if (e.melee?.phase === "windup" && e.melee.progress > 0.35) break
      const p = view.player!, dx = e.x - p.x, dy = e.y - p.y, length = Math.hypot(dx, dy)
      push = { x: dx / length, y: dy / length }; fight.tick()
    }
    push = { x: 0, y: 0 }
    const frozen: FightView = fight.view()
    if (frozen.enemies[0]?.melee?.phase !== "windup") throw new Error("Could not capture a living wind-up")
    const large = document.createElement("canvas"); large.width = 780; large.height = 1688
    const scene = document.createElement("canvas"); scene.width = 260; scene.height = 563
    const frozenCamera = new Camera(); frozenCamera.x = frozen.player!.x; frozenCamera.y = frozen.player!.y
    draw(scene.getContext("2d")!, 260, 563, { ...frozen, scale: 0.04 }, null, frozenCamera)
    const largeCtx = large.getContext("2d")!; largeCtx.imageSmoothingEnabled = false; largeCtx.drawImage(scene, 0, 0, 780, 1689)
    largeCtx.fillStyle = "#f4efda"; largeCtx.font = "24px monospace"; largeCtx.fillText("Frozen wind-up / simulation capture", 24, 48)
    result.windup = large.toDataURL("image/png").split(",")[1]!
    return result
  })
  for (const [name, data] of Object.entries(frames)) writeFileSync(`${dir}/${name}.png`, Buffer.from(data, "base64"))
  if (!before) {
    const baseline = round3 ? "output/review-2/after" : `output/review-1/${round2 ? "after" : "before"}`
    const pairs = (round2 ? ["floor", "telegraph"] : ["floor", "telegraph", "enemies"]).map(name => ({ name, before: `data:image/png;base64,${readFileSync(`${baseline}/${name}.png`).toString("base64")}`, after: `data:image/png;base64,${readFileSync(`${dir}/${name}.png`).toString("base64")}` }))
    const comparison = await page.evaluate(async pairs => {
      const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = pairs.length * 352
      const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false
      ctx.fillStyle = "#171c2e"; ctx.fillRect(0, 0, 960, canvas.height)
      for (let row = 0; row < pairs.length; row++) {
        const pair = pairs[row]!
        for (const [col, source] of [pair.before, pair.after].entries()) {
          const image = new Image(); image.src = source; await image.decode()
          ctx.fillStyle = "#f4efda"; ctx.font = "18px monospace"
          ctx.fillText(`${pair.name.toUpperCase()} / ${col === 0 ? "BEFORE" : "AFTER"}`, col * 480 + 12, row * 352 + 23)
          ctx.drawImage(image, col * 480, row * 352 + 32, 480, 320)
        }
      }
      return canvas.toDataURL("image/png").split(",")[1]!
    }, pairs)
    writeFileSync(`${root}/comparison.png`, Buffer.from(comparison, "base64"))
  }
  assert.deepEqual(errors, [])
  console.log(`Saved ${before ? "baseline fixtures" : `${round2 || round3 ? 5 : 4} phone screenshots, frozen wind-up and before/after comparison`}; no console errors.`)
} finally { await browser.close() }
