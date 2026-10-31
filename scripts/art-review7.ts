/** Review-7 fixtures/captures. No simulation files or live drawing hooks are patched. */
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { chromium } from "playwright"

const base = process.argv[2] ?? "http://127.0.0.1:5350"
const root = "output/review-7"
mkdirSync(root, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const errors: Array<string> = []
  page.on("pageerror", e => errors.push(String(e)))
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
  let option: string | null = null
  await page.route("**/art/player-body.png", route => option === null ? route.continue() : route.fulfill({ contentType: "image/png", body: readFileSync(`${root}/assassin-${option}.png`) }))
  const open = async (): Promise<void> => {
    await page.goto(`${base}/?room=1&all`)
    await page.waitForFunction(() => document.querySelector("#room")?.textContent?.toLowerCase().includes("duel"))
    await page.waitForTimeout(450)
  }
  for (const name of ["a", "b", "c"]) {
    option = name
    await open()
    await page.screenshot({ path: `${root}/player-${name}-room-1.png` })
  }
  option = null
  await open()
  await page.screenshot({ path: `${root}/chosen-standing.png` })
  const encoded = ["a", "b", "c"].map(n => readFileSync(`${root}/assassin-${n}.png`).toString("base64"))
  const files = await page.evaluate(async (options) => {
    const artPath = "/src/host/art.ts", roomPath = "/src/host/room-art.ts", combatPath = "/src/host/combat-art.ts", lightPath = "/src/host/lighting.ts"
    const art = await import(artPath), room = await import(roomPath), combat = await import(combatPath), light = await import(lightPath)
    await art.loadArt()
    const create = (w: number, h: number): HTMLCanvasElement => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c }
    const context = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext("2d", { willReadFrequently: true })!
    const png = (c: HTMLCanvasElement): string => c.toDataURL("image/png").split(",")[1]!
    const output: Record<string, string> = {}
    const c = create(96, 80), rc = context(c)
    const render = (pose: object, dy = 0): Uint8ClampedArray => {
      rc.clearRect(0, 0, 96, 80); art.posedSprite(rc, "player-body", 40, 48 + dy, pose)
      return rc.getImageData(0, 0, 96, 80).data
    }
    const right = render({}), left = render({ flip: true })
    const original = create(24, 24), oc = context(original); oc.drawImage(art.spriteImage("player-body"), 0, 0)
    const pixels = oc.getImageData(0, 0, 24, 24).data
    let bodyPixels = 0, rimPixels = 0
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const from = (y * 24 + x) * 4, to = ((y + 25) * 96 + x + 28) * 4
      if (pixels[from + 3]) {
        bodyPixels++
        for (let k = 0; k < 4; k++) if (pixels[from + k] !== right[to + k]) throw new Error("Player palette or 12,23 anchor changed")
      }
    }
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
      const r = (y * 96 + x) * 4, l = (y * 96 + 79 - x) * 4
      for (let k = 0; k < 4; k++) if (right[r + k] !== left[l + k]) throw new Error("Player flip is not a pixel-exact mirror")
      if (right[r] === 198 && right[r + 1] === 212 && right[r + 2] === 223 && right[r + 3]) rimPixels++
    }
    if (rimPixels === 0) throw new Error("Player rim missing")
    for (const dy of [-1, 1]) {
      const bob = render({}, dy)
      for (let y = 1; y < 79; y++) for (let x = 0; x < 96; x++) for (let k = 0; k < 4; k++) if (right[(y * 96 + x) * 4 + k] !== bob[((y + dy) * 96 + x) * 4 + k]) throw new Error("Run bob does not preserve the body")
    }
    const flash = render({ flash: true }); let flashPixels = 0
    for (let i = 0; i < flash.length; i += 4) if (flash[i + 3]) {
      flashPixels++
      if (flash[i] !== 244 || flash[i + 1] !== 239 || flash[i + 2] !== 218) throw new Error("Player flash changed")
    }
    if (flashPixels !== bodyPixels) throw new Error("Flash dropped body pixels")
    const dissolve = [0, 0.4, 0.8, 1].map(d => render({ fall: 1, dissolve: d, seed: 1 }).filter((value, i) => i % 4 === 3 && value > 0).length)
    if (!(dissolve[0]! > dissolve[1]! && dissolve[1]! > dissolve[2]! && dissolve[2]! > dissolve[3]! && dissolve[3] === 0)) throw new Error("Player fall/dissolve failed")
    output["checks"] = JSON.stringify({ bodyPixels, rimPixels, dissolve, anchor: [12, 23], flip: "exact", bob: "exact", flash: "exact" }, null, 2)
    const study = create(504, 226), sc = context(study)
    sc.imageSmoothingEnabled = false; sc.fillStyle = "#303638"; sc.fillRect(0, 0, study.width, study.height)
    for (let i = 0; i < options.length; i++) {
      const image = new Image(); image.src = `data:image/png;base64,${options[i]}`; await image.decode()
      sc.fillStyle = "#f4efda"; sc.font = "12px monospace"
      sc.fillText(["A / Needle hood", "B / Split cowl", "C / Ash veil"][i]!, i * 168 + 12, 22)
      sc.drawImage(image, i * 168 + 72, 40)
      sc.drawImage(image, i * 168 + 36, 85, 96, 96)
      sc.fillStyle = "#c6d4df"; sc.fillText("1x", i * 168 + 12, 55); sc.fillText("4x", i * 168 + 12, 125)
      if (i === 1) { sc.fillStyle = "#64b6b3"; sc.fillText("SELECTED", i * 168 + 54, 211) }
    }
    output["player-options"] = png(study)

    // Every sheet cell is a 24px image enlarged exactly four times.
    const cells = ["plate-up", "plate-down", "plate-missed", "ordered-up", "ordered-down", "ordered-missed", "belt-tread", "belt-roller", "blade-bar", "blade-hub", "laser-post-off", "laser-post-warn", "laser-post-on", "bomb-idle", "bomb-0", "bomb-1", "stalker-dormant", "stalker-awake", "grenadier-body", "clockwork-body"]
    const sheet = create(720, 600), dc = context(sheet)
    dc.imageSmoothingEnabled = false; dc.fillStyle = "#303638"; dc.fillRect(0, 0, sheet.width, sheet.height)
    for (const [i, name] of cells.entries()) {
      const c = create(24, 24), cc = context(c)
      if (name.startsWith("ordered")) {
        room.pressurePlate(cc, (x: number, y: number) => ({ x: x + 12, y: y + 12 }), { x: 0, y: 0, radius: 0.55, down: name.endsWith("down"), missed: name.endsWith("missed"), order: 2, door: 0 })
      } else if (name.startsWith("stalker")) {
        combat.combatActor(cc, { id: 8, kind: "stalker", aim: 0, charge: name.endsWith("awake") ? 1 : 0, x: 0, y: 0, radius: 0.3, sees: true, sealed: false, captain: false, key: null, melee: null, laser: null }, { x: 12, y: 23 }, -1)
      } else art.tile(cc, name, 0, 0)
      light.discardLights(cc)
      const x = (i % 5) * 144, y = Math.floor(i / 5) * 150
      dc.drawImage(c, x + 24, y + 14, 96, 96)
      dc.fillStyle = "#f4efda"; dc.font = "11px monospace"; dc.fillText(name, x + 8, y + 132)
    }
    output["new-art-4x"] = png(sheet)

    // Native assembled fixtures exercise the real adapters before the draw.ts owner wires them.
    const detail = create(200, 176), cc = context(detail)
    const P = (x: number, y: number, z = 0): { x: number; y: number } => ({ x: x * 26, y: y * 20 - z * 17 })
    for (let y = 0; y < detail.height; y += 24) for (let x = 0; x < detail.width; x += 24) art.tile(cc, "floor-2", x, y)
    room.conveyorBelt(cc, P, { x: 0.3, y: 0.5, w: 1.6, h: 7.6, dx: 0, dy: -1, run: 0.2 })
    for (const [i, state] of ["up", "down", "missed"].entries()) room.pressurePlate(cc, P, { x: 3.1 + i * 1.5, y: 1.4, radius: 0.55, down: state === "down", missed: state === "missed", order: i + 1, door: 0 })
    const hz = { ax: 2.5, ay: 4.1, bx: 6.8, by: 5.6, kind: "blade", state: "on", live: true }
    room.spinningBlade(cc, P, hz)
    room.laserPost(cc, P, 3.1, 3.2, "on"); room.laserPost(cc, P, 6.5, 3.2, "warn")
    combat.bombActor(cc, P, { id: 4, x: 3.1, y: 7.1, target: null, fuse: 0.6, radius: 1.9 }, 1.5)
    const ambient: readonly [number, number, number] = [100, 115, 140]
    light.emitLight(cc, { x: 140, y: 130, radius: 3.5, colour: [255, 176, 96], intensity: 0.8, shadows: false })
    light.applyLighting(cc, { P, u: 26, squash: 20 / 26, toFloor: (x: number, y: number) => ({ x: x / 26, y: y / 20 }), blockers: [], blockerHeight: 1.2, backWall: 1.6, room: { w: 8, h: 9 }, ambient }, null)
    const enlarged = create(detail.width * 4, detail.height * 4), ec = context(enlarged); ec.imageSmoothingEnabled = false; ec.drawImage(detail, 0, 0, enlarged.width, enlarged.height)
    output["assembled-lit-4x"] = png(enlarged)

    // Reverse grip stays on the original 12,23 anchor through all existing poses.
    const poseSheet = create(640, 160), pc = context(poseSheet); pc.imageSmoothingEnabled = false
    pc.fillStyle = "#303638"; pc.fillRect(0, 0, 640, 160)
    for (const [i, [label, pose]] of ([["Idle", {}], ["Flip", { flip: true }], ["Flash", { flash: true }], ["Fall", { fall: 1 }], ["Dissolve", { fall: 1, dissolve: 0.6, seed: 1 }]] as const).entries()) {
      const c = create(64, 48), rc = context(c)
      art.posedSprite(rc, "player-body", 24, 28, pose)
      pc.drawImage(c, 0, 0, 64, 48, i * 128, 20, 128, 96)
      pc.fillStyle = "#f4efda"; pc.font = "12px monospace"; pc.fillText(label, i * 128 + 4, 145)
    }
    output["poses"] = png(poseSheet)
    return output
  }, encoded)
  for (const [name, data] of Object.entries(files)) {
    if (name === "checks") writeFileSync(`${root}/pose-check.json`, data)
    else writeFileSync(`${root}/${name}.png`, Buffer.from(data, "base64"))
  }
  await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(320)
  await page.screenshot({ path: `${root}/chosen-running.png` }); await page.keyboard.up("ArrowLeft")
  await open()
  await page.evaluate(async () => {
    const path = performance.getEntriesByType("resource").find(e => e.name.includes("/src/host/fx.ts"))?.name ?? "/src/host/fx.ts"
    const { Presentation } = await import(path)
    const observe = Presentation.prototype.observe, advance = Presentation.prototype.advance
    const capture = { flow: "", age: -1 }
    Object.assign(window, { artDeathCapture: capture })
    Presentation.prototype.observe = function(view: { flow: string }): void { observe.call(this, view); capture.flow = view.flow }
    Presentation.prototype.advance = function(dt: number): void { advance.call(this, dt); capture.age = this.playerDeathAge }
  })
  await page.keyboard.down("ArrowUp")
  await page.waitForFunction(() => (window as unknown as { artDeathCapture: { flow: string } }).artDeathCapture.flow === "dead", undefined, { timeout: 10000 })
  await page.keyboard.up("ArrowUp"); await page.waitForTimeout(160)
  await page.screenshot({ path: `${root}/chosen-death.png` })
  assert.deepEqual(errors, [])
  console.log("Three lit phone options, selected live player/run/death, native 4x asset sheet and assembled lit adapter fixtures saved to output/review-7.")
} finally { await browser.close() }
