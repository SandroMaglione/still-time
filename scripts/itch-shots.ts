/**
 * The itch.io page assets, from the running game (`pnpm dev` first):
 * portrait screenshots (720×1280), three cover options (630×500, the picked
 * one copied to the page), and the mechanic GIF (360 px wide).
 * Usage: node scripts/itch-shots.ts [baseUrl] [--only=shots,covers,gif]
 *
 * Every moment is staged with keys held until the HUD's world clock reaches a
 * mark, so it lands on the same frame however fast the machine runs. A staged
 * moment that ends in a hit is tried again.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { chromium, type Browser, type Page } from "playwright"

const base = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "http://localhost:5301"
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? ["shots", "covers", "gif"]
const assets = "assets/itch", drafts = "output/itch"
const pickedCover = "cover-a"
mkdirSync(assets, { recursive: true })
mkdirSync(drafts, { recursive: true })

/** A held step: these keys down until the world clock reads `until` seconds. */
type Step = readonly [keys: string, until: number]
/** Run up and right under the Courtyard's two gunners: they open fire behind you. */
const courtyardRun: ReadonlyArray<Step> = [["ArrowUp", 0.6], ["ArrowRight", 1.4]]
/** From the Courtyard freeze: up and right, past the shots (the frozen-crossfire frame). */
const courtyardDash: ReadonlyArray<Step> = [["ArrowUp+ArrowRight", 0.35], ["ArrowUp", 0.95]]

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

const clock = (page: Page): Promise<number> => page.evaluate(() => Number(document.querySelector("#clock")?.textContent ?? 0))
/** The hit message is up (not a clear's). */
const hit = (page: Page): Promise<boolean> => page.evaluate(() => document.querySelector("#message.dead:not([hidden])") !== null)

/** Hold each step's keys until the clock passes its mark (relative to the clock when the steps begin). */
const play = async (page: Page, steps: ReadonlyArray<Step>): Promise<void> => {
  const start = await clock(page)
  for (const [keys, until] of steps) {
    const list = keys.split("+")
    for (const k of list) await page.keyboard.down(k)
    await page.waitForFunction(
      (t) => Number(document.querySelector("#clock")?.textContent ?? 0) >= t || document.querySelector("#message.dead:not([hidden])") !== null,
      start + until, { polling: "raf", timeout: 10_000 })
    for (const k of list) await page.keyboard.up(k)
  }
}

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
    await route.fulfill({ response, body: `${await response.text()}\n;Object.assign(window, { stillTimeFight: fight });\n` })
  })
}

/**
 * Steer at full push (eight key directions) to the enemy nearest `target`
 * until it falls, circling at range while its gun is loaded, preferring the heading closest to it that no shot in flight
 * comes near within the next 0.6 s (else the one with the most room). Resolves "cut", "hit" or "timeout".
 */
const cutDown = (page: Page, target: { x: number; y: number }): Promise<string> => page.evaluate(async (target) => {
  type Body = { readonly x: number; readonly y: number; readonly radius: number }
  type Shot = Body & { readonly vx: number; readonly vy: number }
  type View = { readonly flow: string; readonly player: Body | null; readonly enemies: ReadonlyArray<Body & { readonly charge: number }>; readonly shots: ReadonlyArray<Shot> }
  const fight = (window as unknown as { stillTimeFight: { view: () => View } }).stillTimeFight
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
      const alive = view.enemies.some((e) => Math.hypot(e.x - prey.x, e.y - prey.y) < 2.5 && view.enemies.length === start.length)
      if (view.flow === "dead" || me === null) { press([]); resolve(`hit ${trail.slice(-6).join(" ")}`); return }
      if (!alive) { press([]); resolve("cut"); return }
      if (performance.now() - began > 4000) { press([]); resolve("timeout"); return }
      const goal = view.enemies.reduce((a, e) => Math.hypot(e.x - prey.x, e.y - prey.y) < Math.hypot(a.x - prey.x, a.y - prey.y) ? e : a)
      // Close in only on a spent gun: while it is reloaded, circle at range to draw its shot.
      const tx = goal.x - me.x, ty = goal.y - me.y, d = Math.hypot(tx, ty)
      const wait = goal.charge > 0.9 && d < 4 && d > 1.5, out = d < 3.2 ? 0.6 : 0
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
}, target)

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
  // Screenshots: the jam's portrait target, 360×640 CSS at 2×.
  if (only.includes("shots")) {
    const phone = { width: 360, height: 640 }
    const shot = async (name: string, room: string | null, run?: (page: Page) => Promise<void>): Promise<void> => {
      const url = room === null ? base : at(room)
      const page = await open(browser, url, phone, 2)
      if (run !== undefined) await stage(page, url, () => run(page))
      await page.screenshot({ path: `${assets}/screenshot-${name}.png` })
      await page.close()
    }
    await shot("1-title", null, async (page) => { await page.waitForTimeout(600) })
    // The Blade: the first freeze, named on screen, the blade stopped in front of you.
    await shot("2-blade-time-stops", "The Blade", async (page) => { await play(page, [["ArrowUp", 0.3]]); await page.waitForTimeout(450) })
    // The Duel: the brute commits its swing, you let go, and time stops on the wedge.
    await shot("3-duel-freeze", "Duel", async (page) => { await play(page, [["ArrowUp", 1.0]]); await page.waitForTimeout(300) })
    // Running: the world at full speed, warm light, afterimages and the shots behind you (taken with the key held).
    await shot("4-running", "Courtyard", async (page) => {
      await play(page, [["ArrowUp", 0.6]])
      await page.keyboard.down("ArrowRight")
      await page.waitForFunction(() => Number(document.querySelector("#clock")?.textContent ?? 0) >= 1.05, undefined, { polling: "raf" })
    })
    // Frozen crossfire: let go under the gunners, three shots hanging around you.
    await shot("5-frozen-crossfire", "Courtyard", async (page) => {
      await play(page, courtyardRun); await page.waitForTimeout(400)
      await play(page, courtyardDash); await page.waitForTimeout(300)
    })
    // The Watchtower: walk up the sniper's lane until its laser locks on you, and let go.
    await shot("6-sniper-lock", "Watchtower", async (page) => {
      await page.keyboard.down("ArrowUp")
      await page.waitForFunction("stillTimeFight.view().enemies.some((e) => e.laser?.locked)", undefined, { polling: "raf", timeout: 10_000 })
      await page.keyboard.up("ArrowUp")
      await page.waitForTimeout(300)
    })
  }

  // Covers: a frame at 3× (viewport 960×540, the hero at its centre), cropped
  // to 630×500 with the hero right of centre, the HUD hidden and the title's
  // own logo stacked at the left. The dressing goes on before the moment is
  // staged, so a running frame is taken with the keys still held.
  if (only.includes("covers")) {
    const title = await open(browser, base, { width: 720, height: 540 }, 1)
    const logo = await title.evaluate(() => document.querySelector(".logo")!.outerHTML)
    await title.close()
    const dress = (page: Page, shade: string, x: number, top: number): Promise<void> => page.evaluate(({ logo, shade, x, top }) => {
      const style = document.createElement("style")
      style.textContent = `
        .hud, .tip, .message, .menu { display: none !important; }
        .cover { position: fixed; left: ${x}px; top: 0; width: 630px; height: 520px; z-index: 50; pointer-events: none; --u: 3px; }
        .cover, .cover *, .cover *::before { animation: none !important; }
        .cover .shade { position: absolute; inset: 0; background: ${shade}; }
        .cover .logo { position: absolute; left: 30px; top: ${top}px; margin: 0; align-items: flex-start; }
        .cover .logo .clock-face { display: none; }
        .cover .logo-time { margin-top: calc(var(--u) * 5); margin-left: calc(var(--u) * 12); }
        .cover .strap { position: absolute; left: 33px; top: ${top + 238}px; --u: 2px; color: var(--light); font-size: calc(var(--u) * 8); line-height: calc(var(--u) * 11);
          text-shadow: var(--u) 0 0 var(--ink), calc(var(--u) * -1) 0 0 var(--ink), 0 var(--u) 0 var(--ink), 0 calc(var(--u) * -1) 0 var(--ink), 0 calc(var(--u) * 2) 0 var(--ink); }
        .cover .strap b { color: var(--teal); font-weight: 400; }`
      const box = document.createElement("div")
      box.className = "cover"
      box.innerHTML = `<div class="shade"></div>${logo}<div class="strap">Time moves only<br><b>when you move</b></div>`
      document.head.append(style); document.body.append(box)
    }, { logo, shade, x, top })
    const leftShade = "linear-gradient(90deg, #0b0d12f0 0, #0b0d12c8 30%, #0b0d1240 52%, #0b0d1200 62%)"
    const cover = async (name: string, room: string, x: number, top: number, run: (page: Page) => Promise<void>): Promise<void> => {
      const url = at(room)
      const page = await open(browser, url, { width: 960, height: 540 }, 1)
      await page.evaluate(() => document.fonts.ready)
      await stage(page, url, async () => { await dress(page, leftShade, x, top); await run(page) })
      if (name !== "cover-c") await page.screenshot({ path: `${drafts}/${name}.png`, clip: { x, y: 20, width: 630, height: 500 } })
      if (process.argv.includes("--full")) await page.screenshot({ path: `${drafts}/${name}-full.png` })
      await page.close()
    }
    // A: frozen crossfire, a muzzle flash and three shots hanging round the hero.
    await cover("cover-a", "Courtyard", 240, 172, async (page) => {
      await play(page, courtyardRun); await page.waitForTimeout(400)
      await play(page, courtyardDash); await page.waitForTimeout(1600)
    })
    // B: the Duel's brute frozen mid-swing (after the TIME STOPS callout fades).
    await cover("cover-b", "Duel", 0, 92, async (page) => { await play(page, [["ArrowUp", 1.0]]); await page.waitForTimeout(2600) })
    // C: running at full speed (afterimages, warm light), taken with the keys held.
    await cover("cover-c", "Courtyard", 0, 92, async (page) => {
      await page.keyboard.down("ArrowUp")
      await page.waitForFunction(() => Number(document.querySelector("#clock")?.textContent ?? 0) >= 1.0, undefined, { polling: "raf" })
      await page.keyboard.down("ArrowRight")
      await page.waitForTimeout(150)
      await page.screenshot({ path: `${drafts}/cover-c.png`, clip: { x: 0, y: 20, width: 630, height: 500 } })
      await page.keyboard.up("ArrowRight"); await page.keyboard.up("ArrowUp")
    })
    copyFileSync(`${drafts}/${pickedCover}.png`, `${assets}/cover.png`)
  }

  // The GIF: run (fast world), let go (frozen, cold), dash through the shots and cut.
  // Frames come from the DevTools screencast, each kept for as long as it was on screen.
  if (only.includes("gif")) {
    const frames = `${drafts}/gif-frames`
    rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true })
    const url = at("Courtyard")
    const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 })
    page.on("pageerror", (e) => errors.push(String(e)))
    await expose(page)
    await page.goto(url); await page.waitForTimeout(800)
    // Run under the gunners, let go among their shots, then cut down the right-hand one.
    const run = async (): Promise<void> => {
      await play(page, courtyardRun); await page.waitForTimeout(700)
      const outcome = await cutDown(page, { x: 11.5, y: 12 })
      if (outcome !== "cut") throw new Error(`the GIF's dash ended in a ${outcome}`)
      await page.waitForTimeout(600)
    }
    // A dry run first, so the take is only recorded once the moment is known to work.
    await stage(page, url, run)
    await page.goto(url); await page.waitForTimeout(800)
    const cdp = await page.context().newCDPSession(page)
    const captured: Array<{ data: string; at: number }> = []
    cdp.on("Page.screencastFrame", (f) => {
      captured.push({ data: f.data, at: f.metadata.timestamp ?? Date.now() / 1000 })
      void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId })
    })
    await cdp.send("Page.startScreencast", { format: "png", maxWidth: 720, maxHeight: 1280, everyNthFrame: 1 })
    await page.waitForTimeout(100)
    await run()
    await cdp.send("Page.stopScreencast")
    await page.close()
    assert(captured.length > 20, `only ${captured.length} screencast frames`)
    // Open mid-run (the first straight steps and the room's tip are skipped), to keep the loop under 5 s.
    const from = captured[0]!.at + 0.85
    const kept = captured.filter((f) => f.at >= from)
    const list: Array<string> = []
    kept.forEach((f, i) => {
      const file = `${String(i).padStart(4, "0")}.png`
      writeFileSync(`${frames}/${file}`, Buffer.from(f.data, "base64"))
      const next = kept[i + 1]?.at ?? f.at + 0.4
      list.push(`file '${file}'`, `duration ${Math.max(0.01, next - f.at).toFixed(3)}`)
    })
    list.push(`file '${String(kept.length - 1).padStart(4, "0")}.png'`)
    writeFileSync(`${frames}/list.txt`, list.join("\n"))
    // The HUD's top row is cropped off: the GIF is about the room. 15 fps, 360 wide (the screencast comes at CSS size).
    ffmpeg(["-f", "concat", "-safe", "0", "-i", `${frames}/list.txt`, "-vf",
      "crop=iw:trunc(ih*0.867/2)*2:0:trunc(ih*0.102),fps=15,scale=360:-2:flags=area,split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle",
      "-loop", "0", `${assets}/still-time.gif`])
  }
} finally {
  await browser.close()
}

const files = readdirSync(assets).filter((f) => f.endsWith(".png") || f.endsWith(".gif"))
for (const f of files) console.log(`${assets}/${f}  ${(statSync(`${assets}/${f}`).size / 1024).toFixed(0)} KB`)
console.log(errors.length === 0 ? "no console errors" : errors.join("\n"))
