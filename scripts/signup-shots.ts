/**
 * The email sign-up on the "all rooms clear" card, from the running game (`pnpm dev` first: in development the form
 * answers itself and sends nothing, and every request to typeonce.games is blocked here as well). Pictures of the card
 * at rest on a phone, a desktop and a phone held sideways, and on the phone an address typed, an error and the
 * success; then its rules checked in the page: the gaps, keys and taps leaving the game alone, the close and the
 * sign-up remembered, the per-room clear card without it.
 * Usage: node scripts/signup-shots.ts [baseUrl] [outDir]
 *
 * The final card is reached as the real one is: Fortress (room 30) cleared, by placing the player on its exit through
 * the live fight (handed to `window` by the capture only, as `itch-shots.ts` does), with a save of the 29 rooms before.
 */
import assert from "node:assert/strict"
import { mkdirSync } from "node:fs"
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright"

import { ROOMS } from "../src/sim/rooms.ts"

const base = process.argv[2] ?? "http://localhost:5301"
const out = process.argv[3] ?? "output/signup"
mkdirSync(out, { recursive: true })

const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
const SIDEWAYS: BrowserContextOptions = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

const errors: Array<string> = []
const sent: Array<string> = []
const browser: Browser = await chromium.launch()

/** A save with every room before Fortress cleared, mostly three stars. */
const save = JSON.stringify({ version: 1, best: Object.fromEntries(ROOMS.slice(0, 29).map((r, i) => [r.name, { stars: i % 4 === 3 ? 2 : 3, world: 4 + (i % 7) }])) })

type Fight = { view: () => { flow: string; room: { index: number } }; runtime: { snapshot: () => { ok: boolean; value: { entities: Array<{ id: number; components: Record<string, unknown> }> } }; restore: (s: unknown) => { ok: boolean } } }

/** Opens `room` (1-based) with the save and `storage` set, the live fight on `window.stillTimeFight`. */
const open = async (device: BrowserContextOptions, room: number, storage: Record<string, string> = {}, extra: Partial<BrowserContextOptions> = {}): Promise<Page> => {
  const context = await browser.newContext({ ...device, ...extra })
  const page = await context.newPage()
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
  // Nothing leaves the machine.
  await page.route(/^https:\/\/([a-z0-9-]+\.)*typeonce\.games\//, (r) => { sent.push(r.request().url()); return r.abort() })
  await page.route("**/src/host/main.ts*", async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, body: `${await response.text()}\n;Object.assign(window, { stillTimeFight: fight });\n` })
  })
  await page.addInitScript(([save, storage]) => {
    if (sessionStorage.getItem("seeded") !== null) return
    sessionStorage.setItem("seeded", "1")
    localStorage.clear()
    localStorage.setItem("still-time/progress", save)
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v)
  }, [save, storage] as const)
  await page.goto(`${base}/?room=${room}`)
  await page.waitForFunction(() => !document.body.classList.contains("loading") && (window as unknown as { stillTimeFight?: unknown }).stillTimeFight !== undefined)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  return page
}

/** Places the player on the room's exit: the room clears as it would by walking there. */
const clearByExit = async (page: Page): Promise<string> => {
  const goal = await page.evaluate(() => {
    const fight = (window as unknown as { stillTimeFight: Fight }).stillTimeFight
    return fight.view().room.index
  })
  const room = ROOMS[goal]!
  assert.equal(room.goal.kind, "exit", `${room.name} has no exit`)
  const g = room.goal as { x: number; y: number; w: number; h: number }
  await page.evaluate(([x, y]) => {
    const fight = (window as unknown as { stillTimeFight: Fight }).stillTimeFight
    const snap = fight.runtime.snapshot()
    if (!snap.ok) throw new Error("snapshot failed")
    const edited = { ...snap.value, entities: snap.value.entities.map((e) => ("Slap/Player" in e.components ? { id: e.id, components: { ...e.components, "Slap/Body": { x, y } } } : e)) }
    if (!fight.runtime.restore(edited).ok) throw new Error("restore failed")
  }, [g.x + g.w / 2, g.y + g.h / 2] as const)
  // (No key: standing on the exit clears the room, and a key on the card would be "go again".)
  await page.waitForFunction(() => { const m = document.getElementById("message")!; return !m.hidden && /cleared|won/.test(m.className) }, null, { timeout: 8000 })
  return page.evaluate(() => document.getElementById("message")!.className)
}

/** The final card, its sign-up ready (its entrance played) and the clear's count-up done. */
const finalCard = async (device: BrowserContextOptions, storage: Record<string, string> = {}, extra: Partial<BrowserContextOptions> = {}): Promise<Page> => {
  for (let attempt = 0; ; attempt++) {
    const page = await open(device, 30, storage, extra)
    const cleared = await clearByExit(page).catch(async (e: unknown) => `${String(e).split("\n")[0]} ${JSON.stringify(await state(page))}`)
    if (/won/.test(cleared)) return page
    console.log(`staging again: ${cleared}`)
    await page.context().close()
    if (attempt === 3) throw new Error("could not reach the final card")
  }
}
const ready = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => document.getElementById("signup")?.classList.contains("is-ready"))
  await page.waitForTimeout(1200)
}
const shot = (page: Page, name: string): Promise<Buffer> => page.screenshot({ path: `${out}/${name}.png` })

/** The gaps as the player sees them (CSS px): a button shows 2 UI pixels of drop under its box; the groove is 2 UI pixels; the card's inner edge is the top of its 1 UI-pixel bottom shade. */
const gaps = (page: Page) => page.evaluate(() => {
  const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--u"))
  const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
  const card = r("#message"), form = r("#signup"), field = r("#signup input[name=email]"), send = r("#signup .signup-send"), close = r("#signup .signup-close"), rooms = r("#rooms-after")
  if (!matchMedia("(orientation: landscape)").matches) {
    return { u, roomsToLine: form.top - (rooms.bottom + 2 * u), lineToField: field.top - (form.top + 2 * u), rowToEdge: (card.bottom - u) - (send.bottom + 2 * u), closeHeight: close.height, sendHeight: send.height, closeWidth: close.width }
  }
  const results = [...document.querySelectorAll("#message > :not(#signup)")].map((e) => e.getBoundingClientRect())
  return {
    u, resultsToLine: form.left - Math.max(...results.map((c) => c.right)), lineToSignup: field.left - (form.left + 2 * u), signupToCardEdge: card.right - field.right,
    lineTop: form.top - Math.min(...results.map((c) => c.top)), lineBottom: Math.max(...results.map((c) => c.bottom)) - form.bottom,
    aboveSignup: field.top - card.top, belowSignup: card.bottom - (send.bottom + 2 * u), closeHeight: close.height, sendHeight: send.height
  }
})

/**
 * The portrait gaps read off the picture itself (device px), down one column through the Rooms button and the gold
 * button: the last row of Rooms' ink drop, the groove's two rows, the field's border, the gold button's drop, the
 * card's bottom shade.
 */
const pictureGaps = async (page: Page, png: Buffer) => page.evaluate(async (data) => {
  const img = new Image()
  img.src = `data:image/png;base64,${data}`
  await img.decode()
  const c = document.createElement("canvas")
  c.width = img.width; c.height = img.height
  const g = c.getContext("2d")!
  g.drawImage(img, 0, 0)
  const dpr = img.width / window.innerWidth
  const px = (x: number, y: number) => { const d = g.getImageData(Math.round(x), y, 1, 1).data; return `#${[d[0], d[1], d[2]].map((v) => v!.toString(16).padStart(2, "0")).join("")}` }
  const rooms = document.getElementById("rooms-after")!.getBoundingClientRect()
  const send = document.querySelector("#signup .signup-send")!.getBoundingClientRect()
  const card = document.getElementById("message")!.getBoundingClientRect()
  const x = (rooms.left + 6) * dpr, xs = (send.left + 10) * dpr
  const ink = "#0b0d12", lo = "#1d2233", hi = "#465070", stone = "#2a3044"
  // Down from Rooms' box bottom: its drop is ink; then card stone; the groove (lo then hi); stone; the field's border (hi).
  let y = Math.round(rooms.bottom * dpr)
  while (px(x, y) === ink || px(x, y) === lo) y++
  const dropEnd = y
  while (px(x, y) === stone) y++
  const grooveTop = y
  while (px(x, y) === lo || px(x, y) === hi) y++
  const grooveEnd = y
  while (px(x, y) === stone) y++
  const fieldTop = y
  // Down from the gold button's box bottom: its drop (ink); then stone; the card's bottom shade (lo).
  y = Math.round(send.bottom * dpr)
  while (px(xs, y) === ink || px(xs, y) === "#b8873e") y++
  const sendDropEnd = y
  while (px(xs, y) === stone) y++
  const shadeTop = y
  return { dpr, roomsToLine: (grooveTop - dropEnd) / dpr, lineToField: (fieldTop - grooveEnd) / dpr, rowToEdge: (shadeTop - sendDropEnd) / dpr, colours: { atField: px(x, fieldTop), atShade: px(xs, shadeTop) }, cardBottomCss: card.bottom, shadeTopCss: shadeTop / dpr }
}, png.toString("base64"))

const state = (page: Page) => page.evaluate(() => {
  const fight = (window as unknown as { stillTimeFight: Fight }).stillTimeFight
  const form = document.getElementById("signup")!
  return { flow: fight.view().flow, room: fight.view().room.index, menu: document.body.classList.contains("menu-open"), signup: form.hidden ? "hidden" : form.className, focused: document.activeElement?.getAttribute("name") ?? document.activeElement?.tagName }
})

const report: Record<string, unknown> = {}

// --- The phone: at rest, typed, an error, the success.
{
  const page = await finalCard(PHONE)
  await ready(page)
  const png = await shot(page, "phone_rest")
  report["phone gaps (layout, CSS px)"] = await gaps(page)
  report["phone gaps (picture, CSS px)"] = await pictureGaps(page, png)
  await page.tap("#signup input[name=email]")
  await page.keyboard.type("player@example.com", { delay: 15 })
  await shot(page, "phone_typed")
  // Typing played nothing: the card is still up, the run where it was.
  const typed = await state(page)
  assert.deepEqual([typed.flow, typed.room, typed.menu, typed.focused], ["won", 29, false, "email"], JSON.stringify(typed))
  assert.equal(await page.inputValue("#signup input[name=email]"), "player@example.com", "the address is kept as typed")
  await page.context().close()
}
{
  const page = await finalCard(PHONE)
  await ready(page)
  const before = await page.evaluate(() => document.getElementById("message")!.getBoundingClientRect().toJSON())
  await page.tap("#signup input[name=email]")
  await page.keyboard.type("player.example.com", { delay: 15 })
  await page.tap("#signup .signup-send")
  await page.waitForFunction(() => document.getElementById("signup")!.classList.contains("is-error"))
  await page.waitForTimeout(200)
  await shot(page, "phone_error")
  const error = await page.evaluate(() => {
    const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--u"))
    const e = document.querySelector(".signup-error")!.getBoundingClientRect(), f = document.getElementById("signup")!.getBoundingClientRect(), i = document.querySelector("#signup input[name=email]")!.getBoundingClientRect()
    return { text: document.querySelector(".signup-error")!.textContent, lineToError: e.top - (f.top + 2 * u), errorToField: i.top - e.bottom, card: document.getElementById("message")!.getBoundingClientRect().toJSON(), fits: e.left >= f.left && e.right <= f.right }
  })
  assert.equal(error.text, "That address does not look right.")
  assert.deepEqual(error.card, before, "the error moves nothing")
  report["phone error line"] = error
  // Editing the address clears it.
  await page.tap("#signup input[name=email]")
  await page.keyboard.press("End")
  await page.keyboard.type("x")
  assert.ok(!(await page.evaluate(() => document.getElementById("signup")!.classList.contains("is-error"))), "an edit clears the error")
  await page.context().close()
}
{
  const page = await finalCard(PHONE)
  await ready(page)
  const before = await page.evaluate(() => document.getElementById("message")!.getBoundingClientRect().toJSON())
  await page.tap("#signup input[name=email]")
  await page.keyboard.type("player@example.com", { delay: 15 })
  // Enter in the field submits it.
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.getElementById("signup")!.classList.contains("is-done"))
  await page.waitForTimeout(200)
  await shot(page, "phone_success")
  const done = await page.evaluate(() => ({ card: document.getElementById("message")!.getBoundingClientRect().toJSON(), stored: localStorage.getItem("still-time/signup.done"), active: document.activeElement?.tagName }))
  assert.deepEqual(done.card, before, "the success keeps the card's height")
  assert.equal(done.stored, "1")
  assert.equal(done.active, "BODY", "focus goes back to the game")
  await page.context().close()
}

// --- The desktop and the phone held sideways.
for (const [name, device] of [["desktop", DESKTOP], ["landscape-phone", SIDEWAYS]] as const) {
  const page = await finalCard(device)
  await ready(page)
  await shot(page, `${name}_rest`)
  report[`${name} gaps (layout, CSS px)`] = await gaps(page)
  // The error line, just above the field, inside the column.
  await page.click("#signup input[name=email]")
  await page.keyboard.type("player.example.com")
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => document.getElementById("signup")!.classList.contains("is-error"))
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${out}/check_${name}_error.png` })
  report[`${name} error line`] = await page.evaluate(() => {
    const e = document.querySelector(".signup-error")!.getBoundingClientRect(), f = document.getElementById("signup")!.getBoundingClientRect(), i = document.querySelector("#signup input[name=email]")!.getBoundingClientRect()
    return { insideColumn: e.left >= f.left - 0.5 && e.right <= f.right + 0.5, gapToField: i.top - e.bottom, height: e.height }
  })
  await page.context().close()
}

// --- Keys while typing play nothing; Escape leaves the field and the game's keys work again.
{
  const page = await finalCard(DESKTOP)
  await ready(page)
  await page.click("#signup input[name=email]")
  await page.keyboard.type("wasd rm 1234567890 []", { delay: 10 })
  // (Enter submits: checked on the phone.)
  for (const key of ["Space", "ArrowUp", "ArrowLeft"]) await page.keyboard.press(key)
  const typing = await state(page)
  assert.deepEqual([typing.flow, typing.room, typing.menu], ["won", 29, false], `typing played the game: ${JSON.stringify(typing)}`)
  // (An email field drops a space at either end.)
  assert.equal(await page.inputValue("#signup input[name=email]"), "wasd rm 1234567890 []")
  await page.keyboard.press("Escape")
  const left = await state(page)
  assert.deepEqual([left.flow, left.menu, left.focused], ["won", false, "BODY"], `Escape: ${JSON.stringify(left)}`)
  await page.keyboard.press("Escape")
  assert.ok((await state(page)).menu, "a second Escape pauses, as before")
  await page.context().close()
}

// --- A tap on the game while the field has focus only leaves the field; a tap on the sign-up is not "go again".
{
  const page = await finalCard(PHONE)
  await ready(page)
  // Taps on the sign-up's own surface (by the groove, between its rows), not on its controls.
  const spots = await page.evaluate(() => {
    const f = document.getElementById("signup")!.getBoundingClientRect(), a = document.querySelector("#signup .signup-actions")!.getBoundingClientRect()
    return [{ x: f.left + 4, y: f.top + 10 }, { x: a.left + 120, y: a.top - 3 }]
  })
  for (const spot of spots) await page.touchscreen.tap(spot.x, spot.y)
  assert.equal((await state(page)).flow, "won", "a tap on the sign-up went through to the game")
  await page.tap("#signup input[name=email]")
  await page.touchscreen.tap(195, 60)
  const first = await state(page)
  assert.deepEqual([first.flow, first.focused], ["won", "BODY"], `the first tap: ${JSON.stringify(first)}`)
  await page.touchscreen.tap(195, 60)
  await page.waitForTimeout(200)
  const second = await state(page)
  assert.deepEqual([second.flow, second.room], ["playing", 0], `the second tap goes again: ${JSON.stringify(second)}`)
  await page.context().close()
}

// --- Before its entrance has played, a tap there is the game's, as before.
{
  const page = await finalCard(PHONE)
  await page.waitForFunction(() => !document.getElementById("signup")!.hidden)
  const early = await page.evaluate(() => document.getElementById("signup")!.classList.contains("is-ready"))
  assert.equal(early, false, "ready at once")
  await page.context().close()
}

// --- The close hides it for a day; signing up for good; the clock moving on brings it back.
{
  const page = await finalCard(PHONE)
  await ready(page)
  const before = await page.evaluate(() => document.getElementById("message")!.getBoundingClientRect().toJSON())
  await page.tap("#signup .signup-close")
  const closed = await page.evaluate(() => ({ card: document.getElementById("message")!.getBoundingClientRect().toJSON(), at: Number(localStorage.getItem("still-time/signup.closedAt")), visibility: getComputedStyle(document.querySelector("#signup .signup-send")!).visibility }))
  assert.deepEqual(closed.card, before, "the close moves nothing on the card")
  assert.equal(closed.visibility, "hidden")
  assert.ok(Math.abs(closed.at - Date.now()) < 60_000)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { stillTimeFight?: unknown }).stillTimeFight !== undefined)
  await clearByExit(page)
  await page.waitForTimeout(1500)
  assert.equal((await state(page)).signup, "hidden", "closed a moment ago: hidden")
  await page.context().close()
}
for (const [storage, shows] of [
  [{ "still-time/signup.closedAt": String(Date.now() - 25 * 3600_000) }, true],
  [{ "still-time/signup.closedAt": String(Date.now() - 23 * 3600_000) }, false],
  [{ "still-time/signup.done": "1" }, false]
] as const) {
  const page = await finalCard(PHONE, storage)
  await page.waitForTimeout(1500)
  const s = (await state(page)).signup
  assert.equal(s !== "hidden", shows, `${JSON.stringify(storage)}: ${s}`)
  await page.context().close()
}

// --- Reduced motion: it simply appears.
{
  const page = await finalCard(PHONE, {}, { reducedMotion: "reduce" })
  await page.waitForFunction(() => !document.getElementById("signup")!.hidden)
  const s = await page.evaluate(() => ({ ready: document.getElementById("signup")!.classList.contains("is-ready"), animations: document.getElementById("signup")!.getAnimations().length }))
  assert.deepEqual(s, { ready: true, animations: 0 })
  await page.context().close()
}

// --- A phone held sideways with its keyboard up: the window shrinks under the focused field, which stays in sight.
{
  const page = await finalCard(SIDEWAYS)
  await ready(page)
  await page.tap("#signup input[name=email]")
  for (const height of [200, 160, 130]) {
    await page.setViewportSize({ width: 844, height })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/check_keyboard_${height}.png` })
    const seen = await page.evaluate(() => {
      const f = document.querySelector("#signup input[name=email]")!.getBoundingClientRect()
      return { focused: document.activeElement?.getAttribute("name"), top: f.top, bottom: f.bottom, window: window.innerHeight, u: getComputedStyle(document.documentElement).getPropertyValue("--u") }
    })
    report[`sideways keyboard at ${height}px`] = seen
    assert.ok(seen.focused === "email" && seen.top >= 0 && seen.bottom <= seen.window, `the field is off screen: ${JSON.stringify(seen)}`)
  }
  await page.context().close()
}

// --- The per-room clear card has no sign-up.
{
  const throne = ROOMS.findIndex((r) => r.name === "Throne") + 1
  const page = await open(PHONE, throne)
  assert.match(await clearByExit(page), /cleared/)
  await page.waitForTimeout(1500)
  assert.equal((await state(page)).signup, "hidden", "the per-room clear card")
  await page.context().close()
}

await browser.close()
console.log(JSON.stringify(report, null, 2))
console.log(sent.length === 0 ? "nothing sent to typeonce.games" : `SENT: ${sent.join(", ")}`)
console.log(errors.length === 0 ? "no page errors" : errors.join("\n"))
