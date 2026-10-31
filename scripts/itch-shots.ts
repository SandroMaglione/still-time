/**
 * The itch.io page assets, from the running game (`pnpm exec vite --port 5310` first):
 * portrait screenshots (720×1280), the cover (630×500), and the whole Prologue
 * as a GIF (240×427, the canvas's own pixels).
 * Usage: node scripts/itch-shots.ts [baseUrl] [--only=shots,cover,gif] [--shot=cut,...] [--fps=15] [--colours=48]
 *
 * Every moment is staged by reading the live fight (keys held until the view
 * shows the moment, then let go: time freezes on it), so it lands on the same
 * kind of frame however fast the machine runs. A take that ends in a hit is tried again.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { chromium, type Browser, type Page } from "playwright"

const base = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "http://localhost:5310"
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? ["shots", "gif", "cover"]
const assets = "assets/itch", drafts = "output/itch"
const coverCrop = { x: 88, y: 188 }
const coverUnit = Number(process.argv.find((a) => a.startsWith("--unit="))?.slice(7) ?? 3)
const clearRoom = process.argv.find((a) => a.startsWith("--clear="))?.slice(8) ?? "Watchtower"
const clearTargets = [{ x: 8, y: 2.5 }]
const clearWait = Number(process.argv.find((a) => a.startsWith("--wait="))?.slice(7) ?? 3500)
const gifFps = Number(process.argv.find((a) => a.startsWith("--fps="))?.slice(6) ?? 15)
const gifColours = Number(process.argv.find((a) => a.startsWith("--colours="))?.slice(10) ?? 48)
mkdirSync(assets, { recursive: true })
mkdirSync(drafts, { recursive: true })

const errors: Array<string> = []

const open = async (browser: Browser, url: string, size: { width: number; height: number }, scale: number): Promise<Page> => {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: scale })
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
  await expose(page)
  await page.goto(url)
  await page.waitForFunction(() => (document.querySelector("#room")?.textContent ?? "").length > 0 || document.querySelector(".logo") !== null)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
  return page
}

/** You are down (the hit card is drawn on the canvas, so the view says it). */
const hit = (page: Page): Promise<boolean> => page.evaluate(() => (window as unknown as { stillTimeFight?: { view: () => { flow: string } } }).stillTimeFight?.view().flow === "dead")

/** Stage a moment from a fresh load until it ends alive (a few tries; the shots are real time underneath). */
const stage = async (page: Page, url: string, run: () => Promise<void>): Promise<void> => {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) { await page.goto(url); await page.waitForTimeout(600) }
    let failure = ""
    await run().catch((e: unknown) => { failure = String(e) })
    if (failure === "" && !(await hit(page))) return
    console.log(`retrying ${url}: ${failure === "" ? "hit" : failure}`)
  }
  throw new Error(`could not stage ${url} without a hit`)
}

const ffmpeg = (args: Array<string>): void => {
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
}

/** Let the capture read the live fight: the page's entry module, as served, also hands `fight` to `window`. */
const expose = async (page: Page): Promise<void> => {
  await page.route("**/src/host/main.ts*", async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: `${await response.text()}\n;Object.assign(window, { stillTimeFight: fight, stillTimeScene: scene });\n` })
  })
}

/**
 * Steer at full push (eight key directions) to the enemy nearest `target`
 * until it falls, circling at range while its gun is loaded, preferring the heading closest to it that no shot in flight
 * comes near within the next 0.6 s (else the one with the most room). With `stop` (a function of the view, as source),
 * let go the moment it holds: the world freezes on that frame. Resolves "stop", "cut", "hit" or "timeout".
 */
const steer = (page: Page, target: { x: number; y: number }, stop: string | null = null, limit = 4000, orbit = 0): Promise<string> => page.evaluate(async ({ target, stop, limit, orbit }) => {
  type Body = { readonly x: number; readonly y: number; readonly radius: number }
  type Shot = Body & { readonly vx: number; readonly vy: number }
  type View = { readonly flow: string; readonly player: Body | null; readonly enemies: ReadonlyArray<Body & { readonly charge: number }>; readonly shots: ReadonlyArray<Shot> }
  const fight = (window as unknown as { stillTimeFight: { view: () => View } }).stillTimeFight
  // eslint-disable-next-line no-new-func
  const done = stop === null ? null : (new Function("view", `return (${stop})(view)`) as (view: View) => boolean)
  const start = fight.view().enemies
  const prey = start.reduce((a, e) => Math.hypot(e.x - target.x, e.y - target.y) < Math.hypot(a.x - target.x, a.y - target.y) ? e : a)
  const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const
  const held = new Set<string>()
  const press = (want: ReadonlyArray<string>): void => {
    for (const k of held) if (!want.includes(k)) { held.delete(k); window.dispatchEvent(new KeyboardEvent("keyup", { key: k, code: k })) }
    for (const k of want) if (!held.has(k)) { held.add(k); window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: k })) }
  }
  const headings: Array<ReadonlyArray<keyof typeof keys>> = [["ArrowUp"], ["ArrowDown"], ["ArrowLeft"], ["ArrowRight"],
    ["ArrowUp", "ArrowLeft"], ["ArrowUp", "ArrowRight"], ["ArrowDown", "ArrowLeft"], ["ArrowDown", "ArrowRight"]]
  const began = performance.now(), trail: Array<string> = []
  return await new Promise<string>((resolve) => {
    const tick = (): void => {
      const view = fight.view(), me = view.player
      if (view.flow === "dead" || me === null) { press([]); resolve(`hit ${trail.slice(-6).join(" ")}`); return }
      if (done !== null && done(view)) { press([]); resolve("stop"); return }
      const alive = view.enemies.some((e) => Math.hypot(e.x - prey.x, e.y - prey.y) < 2.5 && view.enemies.length === start.length)
      if (!alive) { press([]); resolve("cut"); return }
      if (performance.now() - began > limit) { press([]); resolve("timeout"); return }
      const goal = view.enemies.reduce((a, e) => Math.hypot(e.x - prey.x, e.y - prey.y) < Math.hypot(a.x - prey.x, a.y - prey.y) ? e : a)
      // Close in only on a spent gun: while it is reloaded, circle at range to draw its shot.
      const tx = goal.x - me.x, ty = goal.y - me.y, d = Math.hypot(tx, ty)
      // (With `orbit`, circle it at that range instead: to draw a spearman's thrust rather than cut it.)
      const wait = orbit > 0 ? d < orbit : goal.charge > 0.9 && d < 4 && d > 1.5, out = orbit > 0 ? (d < orbit - 0.4 ? 0.8 : 0) : d < 3.2 ? 0.6 : 0
      const gx = wait ? -ty - tx * out : tx, gy = wait ? tx - ty * out : ty, gl = Math.hypot(gx, gy)
      // The closest any shot in flight comes to you over the next 0.6 s on a heading (world time runs at full push).
      const clearance = (dx: number, dy: number): number => {
        let least = Infinity
        for (let t = 0; t <= 0.6; t += 0.02) {
          const px = me.x + dx * 5 * t, py = me.y + dy * 5 * t
          for (const s of view.shots) least = Math.min(least, Math.hypot(s.x + s.vx * t - px, s.y + s.vy * t - py) - s.radius - me.radius)
        }
        return least
      }
      let best: ReadonlyArray<string> = [], score = -Infinity
      for (const h of headings) {
        const dx0 = h.reduce((a, k) => a + keys[k][0], 0), dy0 = h.reduce((a, k) => a + keys[k][1], 0), l = Math.hypot(dx0, dy0)
        const dx = dx0 / l, dy = dy0 / l, room = clearance(dx, dy)
        const value = (dx * gx + dy * gy) / gl + (room > 0.35 ? 4 : room)
        if (value > score) { score = value; best = h }
      }
      press(best)
      trail.push(`[${me.x.toFixed(1)},${me.y.toFixed(1)} ${best.join("+")} ${view.shots.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(";")}]`)
      requestAnimationFrame(tick)
    }
    tick()
  })
}, { target, stop, limit, orbit })

const browser = await chromium.launch()
// Rooms by name, so the captures survive rooms being added or reordered.
const names = await (async () => {
  const page = await browser.newPage()
  await expose(page)
  await page.goto(`${base}/?all&room=1`)
  await page.waitForFunction(() => "stillTimeFight" in window)
  const list = await page.evaluate(() => (window as unknown as { stillTimeFight: { view: () => { roomNames: ReadonlyArray<string> } } }).stillTimeFight.view().roomNames)
  await page.close()
  return list
})()
const at = (room: string): string => {
  const index = names.indexOf(room)
  assert(index >= 0, `no room named ${room} (rooms: ${names.join(", ")})`)
  return `${base}/?all&room=${index + 1}`
}
try {
  // Screenshots: the jam's portrait target, 360×640 CSS at 2× (3 device px to the canvas's pixel). Each moment is
  // steered by `steer` and frozen by letting go (time runs at ×0.04 while you stand). `--shot=a,b` takes only some.
  if (only.includes("shots")) {
    const pick = process.argv.find((a) => a.startsWith("--shot="))?.slice(7).split(",") ?? null
    const phone = { width: 360, height: 640 }
    const shot = async (name: string, room: string, run: (page: Page) => Promise<void>): Promise<void> => {
      if (pick !== null && !pick.some((p) => name.includes(p))) return
      const url = at(room)
      const page = await open(browser, url, phone, 2)
      await stage(page, url, () => run(page))
      await page.screenshot({ path: `${assets}/screenshot-${name}.png` })
      await page.close()
    }
    /** Steer at `target` until `stop` holds, then stand: the frame freezes. Anything else is a failed take. */
    const freeze = async (page: Page, target: { x: number; y: number }, stop: string, settle = 350, limit = 6000, orbit = 0): Promise<void> => {
      const outcome = await steer(page, target, stop, limit, orbit)
      if (outcome !== "stop") throw new Error(`ended in a ${outcome.slice(0, 40)}`)
      await page.waitForTimeout(settle)
    }
    const near = (r: number, n: number): string => `(v) => v.shots.filter((s) => Math.hypot(s.x - v.player.x, s.y - v.player.y) < ${r}).length >= ${n} && v.shots.every((s) => Math.hypot(s.x - v.player.x, s.y - v.player.y) > 0.75)`
    /** Hold `keys` until `until` (a function of the view, as source) holds or the scene leaves play; then let go. */
    const holdUntil = async (page: Page, keys: string, until: string, timeout = 8000): Promise<void> => {
      const list = keys.split("+")
      for (const k of list) await page.keyboard.down(k)
      await page.waitForFunction(`(() => { const v = stillTimeFight.view(); return v.flow !== "playing" || (${until})(v) })()`, undefined, { polling: "raf", timeout })
      for (const k of list) await page.keyboard.up(k)
    }
    const nearest = "(v) => Math.min(99, ...v.shots.map((s) => Math.hypot(s.x - v.player.x, s.y - v.player.y)))"
    // A spearman's thrust: walk straight up between the two; both thrust as you pass, and you let go on the first.
    await shot("2-spear-thrust", "Two Spears", async (page) => {
      await page.keyboard.down("ArrowUp")
      await page.waitForFunction(() => {
        const v = (window as unknown as { stillTimeFight: { view: () => { flow: string; enemies: ReadonlyArray<{ melee: { phase: string; progress: number } | null }> } } }).stillTimeFight.view()
        return v.flow !== "playing" || v.enemies.some((e) => e.melee?.phase === "swing" && e.melee.progress > 0.3)
      }, undefined, { polling: "raf", timeout: 8000 })
      await page.keyboard.up("ArrowUp")
      await page.waitForTimeout(350)
    })
    // The cut: the slash still on the air, the gunner going down.
    await shot("3-cut", "Powder Room", (page) => freeze(page, { x: 3, y: 4 }, `(v) => v.slashes.some((s) => s.age < 0.15 && !s.blocked)`, 120))
    // A busy room, bullets frozen mid-air: the Belfry's clock tower and its two spearmen; its rings stack up while you stand, then you walk
    // in between the spears and let go as one winds up.
    await shot("4-busy-belfry", "Belfry", async (page) => {
      await page.waitForTimeout(8000)
      await holdUntil(page, "ArrowUp", `(v) => v.enemies.some((e) => e.melee?.phase === "windup" && e.melee.progress > 0.6)`)
      await page.waitForTimeout(350)
    })
    // The clear: the room cut clean, the clear card over your run replayed behind it.
    await shot("5-clear-replay", clearRoom, async (page) => {
      for (const target of clearTargets) {
        const outcome = await steer(page, target, null, 8000)
        if (outcome !== "cut") throw new Error(`clear ended in a ${outcome.slice(0, 40)}`)
      }
      await page.waitForFunction("stillTimeFight.view().flow === 'cleared'", undefined, { timeout: 8000 })
      await page.waitForTimeout(clearWait)
    })
  }

  // The cover (630×500): the Prologue's first beat, from the GIF's take, at 5× nearest-neighbour (a bullet stopped
  // in the gold ring, the hero a step short of it) on the right, fading into the game's ink; the
  // title's own logo, big, on the left, on the HUD panels' navy (the page round itch's grid is near black: the
  // ink would melt into it). One frozen moment, dark and sparse, against a grid of busy painted art.
  // (Run after the GIF: it reads the take's still.)
  if (only.includes("cover")) {
    const still = `${drafts}/gif-frames/still.png`
    assert(existsSync(still), "no Prologue still: run --only=gif first")
    // 64×100 of the canvas's pixels round the ring and the hero, at 5×.
    ffmpeg(["-i", still, "-vf", `crop=64:100:${coverCrop.x}:${coverCrop.y},scale=320:500:flags=neighbor`, `${drafts}/cover-scene.png`])
    const scene = readFileSync(`${drafts}/cover-scene.png`).toString("base64")
    const page = await open(browser, base, { width: 630, height: 500 }, 1)
    await page.evaluate(({ scene, u }) => {
      const logo = document.querySelector(".logo")!.cloneNode(true) as HTMLElement
      logo.querySelector(".clock-face")?.remove()
      const style = document.createElement("style")
      style.textContent = `
        .cover { position: fixed; inset: 0; width: 630px; height: 500px; z-index: 100; background: #171c2e; overflow: hidden; }
        .cover, .cover *, .cover *::before { animation: none !important; }
        .cover img { position: absolute; right: 0; top: 0; width: 320px; height: 500px; image-rendering: pixelated; }
        .cover .fade { position: absolute; right: 0; top: 0; width: 320px; height: 500px;
          background: linear-gradient(90deg, #171c2e 0, #171c2e00 34%), linear-gradient(#171c2e90 0, #171c2e00 18%, #171c2e00 82%, #171c2ea0 100%); }
        .cover .logo { position: absolute; left: 34px; top: 100px; margin: 0; align-items: flex-start; --u: ${u}px; z-index: 2; }
        .cover .logo-time { margin-top: calc(var(--u) * 6); margin-left: calc(var(--u) * 14); }
        .cover .strap { position: absolute; z-index: 2; left: 36px; top: 340px; --u: 2px; color: var(--light); font-size: 23px; line-height: 32px; letter-spacing: 0; }
        .cover .strap b { color: var(--teal); font-weight: 400; }`
      const box = document.createElement("div")
      box.className = "cover"
      box.innerHTML = `<img src="data:image/png;base64,${scene}"><div class="fade"></div><div class="strap">Time moves only<br><b>when you move</b></div>`
      box.prepend(logo)
      document.head.append(style); document.body.append(box)
    }, { scene, u: coverUnit })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${assets}/cover.png`, clip: { x: 0, y: 0, width: 630, height: 500 } })
    await page.close()
  }

  // The GIF: the whole Prologue, from the hero appearing to "now it's your turn" after the cut. The director plays
  // it; each beat with words is tapped through once it has been up long enough to read.
  // Frames come from the DevTools screencast, each kept for as long as it was on screen, at the canvas's own pixels
  // (240×427): doubled, 20 s would be over 3 MB.
  if (only.includes("gif")) {
    const frames = `${drafts}/gif-frames`
    rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true })
    const url = at("Prologue")
    // A 240×427 window at 1×: the canvas is the same 240×427 a phone's is, one screen pixel to each of its pixels.
    const page = await browser.newPage({ viewport: { width: 240, height: 427 }, deviceScaleFactor: 1 })
    page.on("pageerror", (e) => errors.push(String(e)))
    await expose(page)
    const cdp = await page.context().newCDPSession(page)
    const captured: Array<{ data: string; at: number }> = []
    cdp.on("Page.screencastFrame", (f) => {
      captured.push({ data: f.data, at: f.metadata.timestamp ?? Date.now() / 1000 })
      void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined)
    })
    await cdp.send("Page.startScreencast", { format: "png", maxWidth: 240, maxHeight: 427, everyNthFrame: 1 })
    await page.goto(url)
    // The take: read the scene each frame, tap a held beat once its words have stood READ s, stop HOLD s after the
    // last words come up. Returns the page clock (epoch s) at the scene's first frame and at the end.
    const READ = 1.9, HOLD = 2.4
    const span = await page.evaluate(async ({ READ, HOLD }) => {
      type Scene = { cue: { waiting: boolean; ready: boolean; line: readonly [string, string] | null } | null; age: number }
      const w = window as unknown as { stillTimeScene?: Scene; stillTimeFight?: { view: () => { flow: string; room: { scene: boolean } } } }
      while (w.stillTimeScene?.cue == null) await new Promise((r) => requestAnimationFrame(r))
      const from = Date.now() / 1000
      return await new Promise<{ from: number; to: number; hold: number }>((resolve) => {
        let turnAt = 0, firstHold = 0
        const tick = (): void => {
          const scene = w.stillTimeScene!, cue = scene.cue!, flow = w.stillTimeFight!.view().flow
          if (flow === "cleared" || flow === "won") {
            if (turnAt === 0 && cue.line !== null) turnAt = performance.now()
            if (turnAt > 0 && performance.now() - turnAt > HOLD * 1000) { resolve({ from, to: Date.now() / 1000, hold: firstHold }); return }
          } else if (cue.waiting && cue.ready && firstHold === 0) firstHold = Date.now() / 1000
          if (flow !== "cleared" && flow !== "won" && cue.waiting && cue.ready && scene.age >= READ) {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX" }))
            window.dispatchEvent(new KeyboardEvent("keyup", { key: "x", code: "KeyX" }))
          }
          requestAnimationFrame(tick)
        }
        tick()
      })
    }, { READ, HOLD })
    await cdp.send("Page.stopScreencast")
    await page.close()
    const kept = captured.filter((f) => f.at >= span.from - 0.05 && f.at <= span.to)
    assert(kept.length > 40, `only ${kept.length} screencast frames`)
    const list: Array<string> = []
    kept.forEach((f, i) => {
      const file = `${String(i).padStart(4, "0")}.png`
      writeFileSync(`${frames}/${file}`, Buffer.from(f.data, "base64"))
      const next = kept[i + 1]?.at ?? span.to
      list.push(`file '${file}'`, `duration ${Math.max(0.01, next - f.at).toFixed(3)}`)
    })
    list.push(`file '${String(kept.length - 1).padStart(4, "0")}.png'`)
    writeFileSync(`${frames}/list.txt`, list.join("\n"))
    // The first beat, as a screenshot: the bullet stopped in its gold ring, "when you stop, time stops."
    const still = kept.reduce((a, f) => Math.abs(f.at - span.hold - 1) < Math.abs(a.at - span.hold - 1) ? f : a)
    writeFileSync(`${frames}/still.png`, Buffer.from(still.data, "base64"))
    ffmpeg(["-i", `${frames}/still.png`, "-vf", "scale=720:1281:flags=neighbor,crop=720:1280:0:0", `${assets}/screenshot-1-prologue-stop.png`])
    console.log(`GIF take: ${(span.to - span.from).toFixed(1)} s, ${kept.length} frames`)
    ffmpeg(["-f", "concat", "-safe", "0", "-i", `${frames}/list.txt`, "-vf",
      `fps=${gifFps},split[s0][s1];[s0]palettegen=max_colors=${gifColours}:stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle`,
      "-loop", "0", `${assets}/still-time.gif`])
    // gifsicle (if installed) trims each frame to what changed; itch takes images up to 3 MB.
    spawnSync("gifsicle", ["-O3", "--batch", `${assets}/still-time.gif`])
    const size = statSync(`${assets}/still-time.gif`).size
    assert(size < 2_900_000, `the GIF is ${(size / 1e6).toFixed(2)} MB: over itch's 3 MB, try --fps= or --colours=`)
  }
} finally {
  await browser.close()
}

const files = readdirSync(assets).filter((f) => f.endsWith(".png") || f.endsWith(".gif"))
for (const f of files) console.log(`${assets}/${f}  ${(statSync(`${assets}/${f}`).size / 1024).toFixed(0)} KB`)
console.log(errors.length === 0 ? "no console errors" : errors.join("\n"))
