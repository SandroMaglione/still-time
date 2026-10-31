/**
 * The itch.io page assets, from the running game (`pnpm exec vite --port 5310` first):
 * portrait screenshots (720×1280), the cover (630×500), and the Prologue (alert to cut)
 * as a GIF (240×427, the canvas's own pixels).
 * Usage: node scripts/itch-shots.ts [baseUrl] [--only=shots,cover,gif,gif-play] [--shot=cut,...] [--fps=15] [--colours=48]
 *
 * Every moment is staged by reading the live fight (keys held until the view
 * shows the moment, then let go: time freezes on it), so it lands on the same
 * kind of frame however fast the machine runs. A take that ends in a hit is tried again.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { chromium, type Browser, type Page } from "playwright"

const base = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "http://localhost:5310"
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? ["shots", "gif", "cover"]
const assets = "assets/itch", drafts = "output/itch"
const coverPick = process.argv.find((a) => a.startsWith("--cover="))?.slice(8) ?? "a"
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
  // steered by `steer` and frozen by letting go (time stops while you stand). `--shot=a,b` takes only some.
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
    /** Hold `keys` until `until` (a function of the view, as source) holds or the scene leaves play; then let go. */
    const holdUntil = async (page: Page, keys: string, until: string, timeout = 8000): Promise<void> => {
      const list = keys.split("+")
      for (const k of list) await page.keyboard.down(k)
      await page.waitForFunction(`(() => { const v = stillTimeFight.view(); return v.flow !== "playing" || (${until})(v) })()`, undefined, { polling: "raf", timeout })
      for (const k of list) await page.keyboard.up(k)
    }
    // Running: the Belfry's clock rings stacked up while you stood, then a push up the room, shot with the key still held
    // (time runs, so the floor is warm and the bullets stream).
    await shot("1-running-belfry", "Belfry", async (page) => {
      await page.waitForTimeout(8000)
      await page.keyboard.down("ArrowUp")
      await page.waitForTimeout(650)
    })
    // The hit: walk straight at the First Shot's gunner (the charge it is built to punish), the hit card naming the rule.
    if (pick === null || pick.some((p) => "3-hit".includes(p))) {
      const page = await open(browser, at("First Shot"), phone, 2)
      await holdUntil(page, "ArrowUp", "(v) => v.flow === 'dead'")
      await page.waitForFunction("stillTimeFight.view().flow === 'dead'", undefined, { timeout: 4000 })
      await page.waitForTimeout(900)
      await page.screenshot({ path: `${assets}/screenshot-3-hit.png` })
      await page.close()
    }
    // A spearman's thrust: walk straight up between the two; both thrust as you pass, and you let go on the first.
    // (A sniper's locked laser was tried here: its dots read too faint on a still.)
    await shot("4-spear-thrust", "Two Spears", async (page) => {
      await page.keyboard.down("ArrowUp")
      await page.waitForFunction(() => {
        const v = (window as unknown as { stillTimeFight: { view: () => { flow: string; enemies: ReadonlyArray<{ melee: { phase: string; progress: number } | null }> } } }).stillTimeFight.view()
        return v.flow !== "playing" || v.enemies.some((e) => e.melee?.phase === "swing" && e.melee.progress > 0.3)
      }, undefined, { polling: "raf", timeout: 8000 })
      await page.keyboard.up("ArrowUp")
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
    // The rooms: a run part-way through (best stars and times saved), the select over the title's attract loop.
    if (pick === null || pick.some((p) => "6-rooms".includes(p))) {
      const page = await browser.newPage({ viewport: phone, deviceScaleFactor: 2 })
      const best = Object.fromEntries(names.slice(0, 19).map((n, i) => [n, { stars: [3, 3, 2, 3, 3, 1, 3, 2, 3, 3, 3, 2, 3, 3, 2, 3, 1, 3, 2][i] ?? 3, world: 2.1 + ((i * 7) % 9) * 0.73 }]))
      await page.addInitScript((save) => { localStorage.setItem("still-time/progress", save) }, JSON.stringify({ version: 1, best }))
      await page.goto(base)
      await page.waitForSelector(".logo")
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(1200)
      await page.getByRole("button", { name: "Rooms" }).first().click()
      await page.waitForTimeout(800)
      await page.screenshot({ path: `${assets}/screenshot-6-rooms.png` })
      await page.close()
    }
  }

  // The cover (630×500): a real room mid-run (the Prologue is grey by design, and a still frame goes cold), so the
  // floor is warm and the hero leaves teal afterimages. The canvas is read on the frame a shot first comes near
  // you, keys still held, HUD hidden; a crop of it fills the whole cover at a whole-number scale, nearest-neighbour.
  // The title's own logo sits over it, a margin in, on a soft ink gradient (no box). Three drafts go to output/itch;
  // `coverPick` is copied to the store. `crop` is in the canvas's pixels (240 wide), `unit` the logo's pixel.
  if (only.includes("cover")) {
    type Cover = { room: string; keys: string; near: number; wait: number; crop: { x: number; y: number }; scale: number; title: "left" | "top"; unit: number }
    const covers: Record<string, Cover> = {
      // Courtyard, running up and right: a gunner above, its shot on the way down at you, a crate and torches beside.
      a: { room: "Courtyard", keys: "ArrowUp+ArrowRight", near: 3.5, wait: 700, crop: { x: 2, y: 110 }, scale: 3, title: "left", unit: 3 },
      // Belfry, after the clock has stacked its ring: both brutes lunging at you, the title over the dark floor above.
      b: { room: "Belfry", keys: "ArrowUp", near: 5, wait: 8000, crop: { x: 15, y: 98 }, scale: 3, title: "top", unit: 3 },
      // The Courtyard moment again, closer (4×): the hero bigger in the jam's half-size grid.
      c: { room: "Courtyard", keys: "ArrowUp+ArrowRight", near: 3.5, wait: 700, crop: { x: 45, y: 122 }, scale: 4, title: "left", unit: 3 }
    }
    for (const [name, cover] of Object.entries(covers)) {
      const page = await browser.newPage({ viewport: { width: 240, height: 427 }, deviceScaleFactor: 1 })
      page.on("pageerror", (e) => errors.push(String(e)))
      await expose(page)
      await page.goto(at(cover.room))
      await page.waitForFunction(() => (window as unknown as { stillTimeFight?: { view: () => { flow: string } } }).stillTimeFight?.view().flow === "playing")
      await page.addStyleTag({ content: "#hud { display: none !important; }" })
      await page.waitForTimeout(cover.wait)
      const frame = await page.evaluate(async ({ keys, near }) => {
        type Body = { readonly x: number; readonly y: number }
        const fight = (window as unknown as { stillTimeFight: { view: () => { flow: string; player: Body | null; shots: ReadonlyArray<Body> } } }).stillTimeFight
        const canvas = document.querySelector("canvas")!, list = keys.split("+")
        for (const k of list) window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code: k }))
        const began = performance.now()
        const data = await new Promise<string>((resolve) => {
          const tick = (): void => {
            const v = fight.view(), me = v.player
            if (v.flow !== "playing" || me === null || performance.now() - began > 5000) { resolve(""); return }
            if (v.shots.some((s) => Math.hypot(s.x - me.x, s.y - me.y) < near)) { resolve(canvas.toDataURL()); return }
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        for (const k of list) window.dispatchEvent(new KeyboardEvent("keyup", { key: k, code: k }))
        return data
      }, { keys: cover.keys, near: cover.near })
      await page.close()
      assert(frame !== "", `no cover moment in ${cover.room}`)
      writeFileSync(`${drafts}/cover-${name}-frame.png`, Buffer.from(frame.split(",")[1]!, "base64"))
      const w = Math.ceil(630 / cover.scale), h = Math.ceil(500 / cover.scale)
      ffmpeg(["-i", `${drafts}/cover-${name}-frame.png`, "-vf", `crop=${w}:${h}:${cover.crop.x}:${cover.crop.y},scale=${w * cover.scale}:${h * cover.scale}:flags=neighbor,crop=630:500:0:0`, `${drafts}/cover-${name}-scene.png`])
      const scene = readFileSync(`${drafts}/cover-${name}-scene.png`).toString("base64")
      const card = await open(browser, base, { width: 630, height: 500 }, 1)
      await card.evaluate(({ scene, u, title }) => {
        const logo = document.querySelector(".logo")!.cloneNode(true) as HTMLElement
        logo.querySelector(".clock-face")?.remove()
        const left = title === "left"
        const style = document.createElement("style")
        style.textContent = `
          .cover { position: fixed; inset: 0; width: 630px; height: 500px; z-index: 100; background: #0b0d12; overflow: hidden; }
          .cover, .cover *, .cover *::before { animation: none !important; }
          .cover img { position: absolute; left: 0; top: 0; width: 630px; height: 500px; image-rendering: pixelated; }
          .cover .shade { position: absolute; inset: 0; background: ${left
            ? "radial-gradient(ellipse 300px 250px at 215px 225px, #0b0d12f2 0, #0b0d12d0 45%, #0b0d1200 100%), linear-gradient(90deg, #0b0d12a0 0, #0b0d1200 55%)"
            : "radial-gradient(ellipse 380px 180px at 315px 100px, #0b0d12f2 0, #0b0d12d0 45%, #0b0d1200 100%), linear-gradient(#0b0d12b0 0, #0b0d1200 50%)"}; }
          .cover .block { position: absolute; z-index: 2; display: flex; flex-direction: column; ${left ? "left: 72px; top: 92px; align-items: flex-start;" : "left: 0; right: 0; top: 16px; align-items: center;"} }
          .cover .logo { position: relative; margin: 0; align-items: flex-start; --u: ${u}px; }
          .cover .logo-time { margin-top: calc(var(--u) * 6); margin-left: calc(var(--u) * 14); }
          .cover .strap { --u: 2px; margin-top: ${left ? 34 : 6}px; ${left ? "margin-left: 2px;" : "text-align: center;"} color: var(--light); font-size: 23px; line-height: 32px; letter-spacing: 0; text-shadow: 0 2px 0 #0b0d12; }
          .cover .strap b { color: var(--teal); font-weight: 400; }`
        const box = document.createElement("div")
        box.className = "cover"
        box.innerHTML = `<img src="data:image/png;base64,${scene}"><div class="shade"></div><div class="block"><div class="strap">Time moves only<br>when <b>you</b> move</div></div>`
        box.querySelector(".block")!.prepend(logo)
        document.head.append(style); document.body.append(box)
      }, { scene, u: cover.unit, title: cover.title })
      await card.evaluate(() => document.fonts.ready)
      await card.waitForTimeout(300)
      await card.screenshot({ path: `${drafts}/cover-${name}.png`, clip: { x: 0, y: 0, width: 630, height: 500 } })
      await card.close()
    }
    writeFileSync(`${assets}/cover.png`, readFileSync(`${drafts}/cover-${coverPick}.png`))
    assert(statSync(`${assets}/cover.png`).size < 2_900_000, "the cover is over itch's 3 MB")
  }

  // The GIF: the Prologue from the gunner's alert (the freeze lands 2.5 s in, before a judge scrolls past) to the cut,
  // looping back to the alert. The director plays
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
    ffmpeg(["-i", `${frames}/still.png`, "-vf", "scale=720:1281:flags=neighbor,crop=720:1280:0:0", `${assets}/screenshot-2-prologue-stop.png`])
    console.log(`GIF take: ${(span.to - span.from).toFixed(1)} s, ${kept.length} frames`)
    ffmpeg(["-f", "concat", "-safe", "0", "-i", `${frames}/list.txt`, "-vf",
      `trim=start=${(span.hold - span.from - 2.6).toFixed(2)}:end=${(span.to - span.from - HOLD).toFixed(2)},setpts=PTS-STARTPTS,fps=${gifFps},split[s0][s1];[s0]palettegen=max_colors=${gifColours}:stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle`,
      "-loop", "0", `${assets}/still-time.gif`])
    // gifsicle (if installed) trims each frame to what changed; itch takes images up to 3 MB.
    spawnSync("gifsicle", ["-O3", "--batch", `${assets}/still-time.gif`])
    const size = statSync(`${assets}/still-time.gif`).size
    assert(size < 2_900_000, `the GIF is ${(size / 1e6).toFixed(2)} MB: over itch's 3 MB, try --fps= or --colours=`)
  }

  // The play GIF (under 5 s, 360 wide): the Courtyard's flip in one loop. Run up and right under the two gunners
  // (the floor warm, the speed bar gold, their shots streaming), let go among the shots (the frame cold, the bullets
  // hanging), then dash through the gaps and cut the right-hand one. A dry run first, so the take is only recorded
  // once it is known to work. A 240×427 window at 1.5×: the screencast is 360 wide as it comes, HUD included.
  if (only.includes("gif-play")) {
    const frames = `${drafts}/gif-play-frames`, out = `${assets}/still-time-play.gif`
    rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true })
    const url = at("Courtyard")
    const page = await browser.newPage({ viewport: { width: 240, height: 427 }, deviceScaleFactor: 1.5 })
    page.on("pageerror", (e) => errors.push(String(e)))
    await expose(page)
    const ready = async (): Promise<void> => {
      await page.goto(url)
      await page.waitForFunction(() => (window as unknown as { stillTimeFight?: { view: () => { flow: string } } }).stillTimeFight?.view().flow === "playing")
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(700)
    }
    /** Hold `keys` until the world clock reads `until` and `also` (a function of the view, as source) holds. */
    const hold = async (keys: string, until: number, also = "() => true"): Promise<void> => {
      const list = keys.split("+")
      for (const k of list) await page.keyboard.down(k)
      await page.waitForFunction(`(() => { const v = stillTimeFight.view(); return v.flow !== "playing" || (v.world >= ${until} && (${also})(v)) })()`, undefined, { polling: "raf", timeout: 8000 })
      for (const k of list) await page.keyboard.up(k)
    }
    const marks = { stop: 0, cut: 0 }
    // A hit can be tapped away (a key's release retries) before `stage` looks: watch every frame for one.
    const died = (): Promise<boolean> => page.evaluate(() => (window as unknown as { stillTimeDied?: boolean }).stillTimeDied === true)
    const run = async (): Promise<void> => {
      await page.evaluate(() => {
        const w = window as unknown as { stillTimeDied?: boolean; stillTimeFight: { view: () => { flow: string } } }
        w.stillTimeDied = false
        const watch = (): void => { if (w.stillTimeFight.view().flow === "dead") w.stillTimeDied = true; else requestAnimationFrame(watch) }
        watch()
      })
      await hold("ArrowUp", 0.6)
      // Let go with shots in the air near you: the frozen crossfire.
      await hold("ArrowRight", 1.4, "(v) => v.shots.length >= 2")
      marks.stop = Date.now() / 1000
      await page.waitForTimeout(1000)
      const outcome = await steer(page, { x: 11.5, y: 12 })
      if (outcome !== "cut") throw new Error(`the dash ended in a ${outcome.slice(0, 40)}`)
      marks.cut = Date.now() / 1000
      await page.waitForTimeout(700)
      if (await died()) throw new Error("hit after the cut")
    }
    await ready()
    await stage(page, url, run)
    // The take, retried (fresh load) if it ends in a hit after all.
    const cdp = await page.context().newCDPSession(page)
    let captured: Array<{ data: string; at: number }> = []
    cdp.on("Page.screencastFrame", (f) => {
      captured.push({ data: f.data, at: f.metadata.timestamp ?? Date.now() / 1000 })
      void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined)
    })
    let span = { from: 0, to: 0 }
    for (let attempt = 0; ; attempt++) {
      assert(attempt < 6, "could not record the play GIF without a hit")
      await ready()
      captured = []
      await cdp.send("Page.startScreencast", { format: "png", maxWidth: 360, maxHeight: 641, everyNthFrame: 1 })
      await page.waitForTimeout(150)
      const from = Date.now() / 1000
      let failure = ""
      await run().catch((e: unknown) => { failure = String(e) })
      await cdp.send("Page.stopScreencast")
      if (failure === "" && !(await hit(page))) { span = { from, to: Date.now() / 1000 }; break }
      console.log(`retrying the play take: ${failure === "" ? "hit" : failure}`)
    }
    await page.close()
    // Open just before the stop (about 1.3 s of running), close shortly after the cut: under 5 s in all.
    const start = Math.max(span.from, marks.stop - 1.3), end = Math.min(span.to, marks.cut + 0.6, start + 4.9)
    const kept = captured.filter((f) => f.at >= start - 0.1 && f.at <= end)
    assert(kept.length > 20, `only ${kept.length} screencast frames`)
    const list: Array<string> = []
    kept.forEach((f, i) => {
      const file = `${String(i).padStart(4, "0")}.png`
      writeFileSync(`${frames}/${file}`, Buffer.from(f.data, "base64"))
      const next = kept[i + 1]?.at ?? end
      list.push(`file '${file}'`, `duration ${Math.max(0.01, next - f.at).toFixed(3)}`)
    })
    list.push(`file '${String(kept.length - 1).padStart(4, "0")}.png'`)
    writeFileSync(`${frames}/list.txt`, list.join("\n"))
    // The take opens 0.9 s in (the room's tip chip fades out over that long), the HUD row is cropped off (its text is
    // unreadable at the canvas's own pixels), and the frames come back to the canvas's pixels (3 device px each) then
    // doubled, nearest-neighbour, so every game pixel stays a crisp 2×2.
    ffmpeg(["-f", "concat", "-safe", "0", "-i", `${frames}/list.txt`, "-vf",
      `trim=start=${Math.max(0, start - kept[0]!.at + 0.9).toFixed(2)}:end=${(end - kept[0]!.at).toFixed(2)},setpts=PTS-STARTPTS,fps=15,scale=240:427:flags=neighbor,crop=240:320:0:54,scale=480:640:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle`,
      "-loop", "0", out])
    spawnSync("gifsicle", ["-O3", "--batch", out])
    const size = statSync(out).size
    assert(size < 2_900_000, `the play GIF is ${(size / 1e6).toFixed(2)} MB: over itch's 3 MB`)
    console.log(`play GIF: ${(end - start).toFixed(1)} s, stop at ${(marks.stop - start).toFixed(1)} s, cut at ${(marks.cut - start).toFixed(1)} s`)
  }
} finally {
  await browser.close()
}

const files = readdirSync(assets).filter((f) => f.endsWith(".png") || f.endsWith(".gif"))
for (const f of files) console.log(`${assets}/${f}  ${(statSync(`${assets}/${f}`).size / 1024).toFixed(0)} KB`)
console.log(errors.length === 0 ? "no console errors" : errors.join("\n"))
