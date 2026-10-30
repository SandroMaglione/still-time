/** Five motion studies plus impacts, and a real fatal Duel/retry captured separately. */
import { mkdirSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import assert from "node:assert/strict"
import { chromium } from "playwright"
import type { EnemyView } from "../src/sim/view.ts"

const base = process.argv[2] ?? "http://localhost:5302"
mkdirSync("output/fx-frames", { recursive: true })
const browser = await chromium.launch()
const errors: Array<string> = []
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 512 }, deviceScaleFactor: 1 })
  page.on("pageerror", e => errors.push(String(e)))
  await page.goto(base)
  await page.waitForFunction(() => document.querySelector("#room")?.textContent?.includes("Duel"))
  await page.evaluate(async () => {
    const artPath = "/src/host/art.ts", combatPath = "/src/host/combat-art.ts"
    const art = await import(artPath), combat = await import(combatPath)
    await art.loadArt()
    const canvas = document.createElement("canvas"); canvas.id = "fx-record"
    canvas.width = 480; canvas.height = 256
    canvas.style.cssText = "position:fixed;inset:0;width:960px;height:512px;z-index:100;image-rendering:pixelated"
    document.body.appendChild(canvas)
    const ctx = canvas.getContext("2d")!; ctx.imageSmoothingEnabled = false
    const enemy = (kind: EnemyView["kind"], aim = 0): EnemyView => ({ id: 10, kind, x: 0, y: 0, radius: 0.4, charge: 0.9, aim, sees: true, sealed: false, captain: false, key: null, laser: null, melee: kind === "brute" ? { phase: "idle", progress: 0, locked: true, lockShare: 0.7, reach: 2, arc: 1, guardArc: 1.2, guarding: false, shield: false } : null })
    const panel = (index: number, title: string, subtitle: string, draw: () => void): void => {
      const x = index % 3 * 160, y = Math.floor(index / 3) * 128
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, 160, 128); ctx.clip(); ctx.translate(x, y)
      ctx.fillStyle = "#3c4848"; ctx.fillRect(1, 1, 158, 126)
      for (let yy = 16; yy < 110; yy += 16) for (let xx = 0; xx < 160; xx += 24) art.tile(ctx, (xx + yy) % 5 === 0 ? "floor-2" : "floor-0", xx, yy)
      ctx.fillStyle = "#171c2e"; ctx.fillRect(0, 0, 160, 20); ctx.fillRect(0, 108, 160, 20)
      ctx.textAlign = "left"; ctx.font = "bold 8px monospace"; ctx.fillStyle = "#f4efda"; ctx.fillText(title, 7, 12)
      ctx.font = "6px monospace"; ctx.fillStyle = "#b3c0b2"; ctx.fillText(subtitle, 6, 120)
      draw(); ctx.restore()
    }
    const render = (time: number): string => {
      ctx.fillStyle = "#171c2e"; ctx.fillRect(0, 0, 480, 256)
      panel(0, "01  GRIP / RECOIL", "Three aim directions, two hands", () => {
        for (const [i, aim] of [0, Math.PI / 2, -2.4].entries()) {
          const fired = (time + i * 0.25) % 0.85
          combat.combatActor(ctx, enemy("gunner", aim), { x: 30 + i * 49, y: 79 }, fired)
          if (fired < 0.32) {
            const distance = 15 + fired * 55
            art.sprite(ctx, "bullet", 30 + i * 49 + Math.cos(aim) * distance, 79 - 6 + Math.sin(aim) * distance * 0.78 + 8)
          }
        }
      })
      panel(1, "02  BRACE / SWEEP", "Raise, cut, follow through, recover", () => {
        const t = time % 1.8, original = enemy("brute", Math.PI)
        const e: EnemyView = { ...original, melee: { ...original.melee!, phase: t < 0.55 ? "windup" : t < 0.7 ? "swing" : t < 1.45 ? "recover" : "idle", progress: t < 0.55 ? t / 0.55 : t < 0.7 ? (t - 0.55) / 0.15 : t < 1.45 ? (t - 0.7) / 0.75 : 0 } }
        combat.combatActor(ctx, e, { x: 86, y: 79 }, -1)
        combat.attackWave(ctx, e, { x: 86, y: 72 }, 43, 34)
      })
      panel(2, "03  PLAYER / SHATTER", "Flash > fall > floor pose > motes", () => {
        const age = time % 1.7 - 0.15
        if (age < 0) { art.sprite(ctx, "shadow", 76, 82); art.posedSprite(ctx, "player-body", 74, 79, {}) }
        else if (age < 1.05) {
          combat.dyingActor(ctx, { id: 1, kind: "player", x: 0, y: 0, aim: 0, angle: 0, born: 0 }, { x: 68, y: 79 }, age)
          if (age < 0.42) combat.impactBurst(ctx, { x: 0, y: 0, angle: 0, born: 0, seed: 3, kind: "player" }, { x: 68, y: 69 }, age)
        }
      })
      panel(3, "04  ENEMIES / FALL", "Same timing, each keeps its colors", () => {
        for (const [i, kind] of (["gunner", "thrower", "brute"] as const).entries()) {
          const age = (time + i * 0.2) % 1.7 - 0.15, ground = { x: 25 + i * 46, y: 78 }
          if (age < 0) combat.combatActor(ctx, enemy(kind), ground, -1)
          else if (age < 1.05) combat.dyingActor(ctx, { id: 10 + i, kind, x: 0, y: 0, aim: 0, angle: 0, born: 0 }, ground, age)
        }
      })
      panel(4, "05  FIRE / WORLD TIME", "Live flame             Frozen time", () => {
        art.texture(ctx, "masonry", 9, 35, 142, 60)
        combat.torchFire(ctx, 43, 84, time, 2)
        combat.torchFire(ctx, 116, 84, time * 0.04, 2)
      })
      panel(5, "06  CONTACT / DEBRIS", "Stone chip     Cut arc     Shot hit", () => {
        for (const [i, kind] of (["stone", "cut", "shot"] as const).entries()) {
          const age = (time + i * 0.15) % 0.9
          if (age < 0.42) combat.impactBurst(ctx, { x: 0, y: 0, angle: -0.7, born: 0, seed: i + 7, kind }, { x: 28 + i * 48, y: 72 }, age)
        }
      })
      return canvas.toDataURL("image/png").split(",")[1]!
    }
    // Only this isolated review surface exposes its clock to the capture script.
    Object.assign(window, { renderFxStudy: render })
  })
  for (let frame = 0; frame < 90; frame++) {
    const data = await page.evaluate((time) => {
      const record = window as unknown as { renderFxStudy: (t: number) => string }
      return record.renderFxStudy(time)
    }, frame / 15)
    writeFileSync(`output/fx-frames/${String(frame).padStart(3, "0")}.png`, Buffer.from(data, "base64"))
  }
  await page.close()

  // Real game capture: trigger a fatal guarded-front approach, wait for the
  // visible fall, then retry and verify that the attempt resets.
  const live = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, recordVideo: { dir: "output/fx-video", size: { width: 390, height: 844 } } })
  live.on("pageerror", e => errors.push(String(e)))
  live.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
  await live.goto(`${base}/?room=1`)
  await live.waitForFunction(() => document.querySelector("#room")?.textContent?.includes("Duel"))
  await live.keyboard.down("ArrowUp")
  await live.waitForFunction(() => document.querySelector("#room")?.textContent?.includes("✕1"), undefined, { timeout: 8000 })
  await live.keyboard.up("ArrowUp")
  await live.waitForTimeout(160); await live.screenshot({ path: "output/fx-live-fall.png" })
  await live.waitForTimeout(260); await live.screenshot({ path: "output/fx-live-floor.png" })
  await live.waitForTimeout(750); await live.screenshot({ path: "output/fx-live-dead.png" })
  await live.keyboard.press("Space"); await live.waitForTimeout(250)
  await live.screenshot({ path: "output/fx-live-retry.png" })
  const video = live.video()!
  await live.close(); await video.saveAs("output/fx-live.webm")
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
const encode = (args: Array<string>): void => {
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
}
encode(["-framerate", "15", "-i", "output/fx-frames/%03d.png", "-vf", "scale=960:512:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=64:reserve_transparent=0[p];[s1][p]paletteuse=dither=none", "-loop", "0", "output/fx-motion-review.gif"])
encode(["-framerate", "15", "-i", "output/fx-frames/%03d.png", "-vf", "scale=1440:768:flags=neighbor", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-movflags", "+faststart", "output/fx-motion-review.mp4"])
console.log("Saved six labelled motion studies and a real Duel death/retry capture; no console errors.")
