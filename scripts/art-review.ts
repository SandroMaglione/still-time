/** Native hero choices and 4× crops from the production renderer, under the live lighting. */
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { chromium } from "playwright"
import type { FightView } from "../src/sim/view.ts"

const base = process.argv[2] ?? "http://localhost:5350"
const root = "output/review-4"
mkdirSync(root, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const errors: Array<string> = []
  page.on("pageerror", e => errors.push(String(e)))
  await page.goto(`${base}/?room=1&all`)
  const files = await page.evaluate(async () => {
    const renderer = "/src/host/draw.ts", simulation = "/src/sim/simulation.ts", assets = "/src/host/art.ts"
    const { draw, Camera } = await import(renderer), { createFight, IDLE_THUMB } = await import(simulation)
    await (await import(assets)).loadArt()
    const original: FightView = createFight(0, { snapshot: () => IDLE_THUMB }).view()
    const result: Record<string, string> = {}
    const png = (canvas: HTMLCanvasElement): string => canvas.toDataURL("image/png").split(",")[1]!
    const options = document.createElement("canvas"); options.width = 480; options.height = 240
    const oc = options.getContext("2d")!; oc.imageSmoothingEnabled = false
    oc.fillStyle = "#303638"; oc.fillRect(0, 0, 480, 240)
    for (const [i, name] of ["scarf", "hat", "visor"].entries()) {
      const image = new Image(); image.src = `/art/hero-${name}.png`; await image.decode()
      oc.fillStyle = "#f4efda"; oc.font = "13px monospace"
      oc.fillText(["A / Split scarf", "B / Swept hat", "C / Visor"][i]!, i * 160 + 12, 22)
      oc.font = "11px monospace"; oc.fillText("1x", i * 160 + 15, 59)
      oc.drawImage(image, i * 160 + 68, 42)
      oc.fillText("4x", i * 160 + 15, 90); oc.drawImage(image, i * 160 + 32, 100, 96, 96)
      if (name === "hat") { oc.fillStyle = "#91c69b"; oc.fillText("SELECTED", i * 160 + 51, 222) }
    }
    result["player-options"] = png(options)
    const brute = original.enemies[0]!
    const view: FightView = {
      ...original, world: 1, scale: 0.04,
      room: { ...original.room, w: 10, h: 8, pillars: [{ x: 1.5, y: 3, w: 1.2, h: 1.2 }, { x: 7.5, y: 3, w: 1.2, h: 1.2 }], goal: { kind: "clear" } },
      player: { ...original.player!, x: 5, y: 6.2, vx: 0, vy: 0 },
      enemies: [{ ...brute, x: 6.8, y: 6.2, aim: 0.5, melee: { ...brute.melee!, phase: "idle", guarding: false } }],
      doors: [], keys: [], shots: [], slashes: []
    }
    const scene = document.createElement("canvas"); scene.width = 240; scene.height = 240
    const sc = scene.getContext("2d")!, camera = new Camera(); camera.x = 5; camera.y = 4
    draw(sc, 240, 240, view, null, camera)
    const pixels = sc.getImageData(0, 0, 240, 240).data
    draw(sc, 240, 240, view, null, camera)
    const again = sc.getImageData(0, 0, 240, 240).data
    if (!pixels.every((n, i) => n === again[i])) throw new Error("Renderer changed a frozen fixture")
    result["detail-scene"] = png(scene)
    const sheet = document.createElement("canvas"); sheet.width = 964; sheet.height = 544
    const dc = sheet.getContext("2d")!; dc.imageSmoothingEnabled = false
    dc.fillStyle = "#171c2e"; dc.fillRect(0, 0, sheet.width, sheet.height)
    for (const lit of [true, false]) {
      draw(sc, 240, 240, view, null, camera, null, lit)
      let offset = 12
      const top = lit ? 0 : 272
      for (const [name, x, y, w, h] of [
        ["Floor", 20, 140, 64, 40], ["Crate", 176, 78, 40, 56],
        ["Cover", 32, 78, 40, 56], ["Hero / brute", 102, 132, 82, 40]
      ] as const) {
        const crop = document.createElement("canvas"); crop.width = w * 4; crop.height = h * 4
        const cc = crop.getContext("2d")!; cc.imageSmoothingEnabled = false; cc.drawImage(scene, x, y, w, h, 0, 0, w * 4, h * 4)
        result[`crop-${name.toLowerCase().replaceAll(" / ", "-")}-4x${lit ? "" : "-nolight"}`] = png(crop)
        dc.fillStyle = "#f4efda"; dc.font = "14px monospace"; dc.fillText(`${name} / ${lit ? "lit" : "unlit"} 4x`, offset, top + 22)
        dc.drawImage(crop, offset, top + 36); offset += w * 4 + 12
      }
    }
    result["details-4x"] = png(sheet)
    draw(sc, 240, 240, view, null, camera, null, false)
    result["detail-scene-nolight"] = png(scene)
    return result
  })
  for (const [name, data] of Object.entries(files)) writeFileSync(`${root}/${name}.png`, Buffer.from(data, "base64"))
  assert.deepEqual(errors, [])
  console.log("Saved hero options at 1x/4x, lit scene crops at 4x and the unlit comparison; frozen rendering is stable.")
} finally { await browser.close() }
