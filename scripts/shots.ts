/**
 * Phone-size screenshots of the running page (`pnpm dev` first), into
 * output/, and any console errors. Usage: node scripts/shots.ts [baseUrl]
 */
import { mkdirSync } from "node:fs"
import { chromium } from "playwright"

import { ROOMS } from "../src/sim/rooms.ts"

const base = process.argv[2] ?? "http://localhost:5301"
const shots: ReadonlyArray<{ readonly name: string; readonly room: string; readonly hold?: string; readonly ms: number }> = [
  { name: "duel", room: "Duel", ms: 600 },
  { name: "gatehouse", room: "Gatehouse", ms: 600 },
  { name: "throne", room: "Throne", hold: "ArrowUp", ms: 900 },
  { name: "thief", room: "Thief", hold: "ArrowUp", ms: 1200 },
  { name: "shieldwall", room: "Shieldwall", hold: "ArrowUp", ms: 900 },
  { name: "watchtower", room: "Watchtower", hold: "ArrowUp", ms: 1500 },
  { name: "powder-room", room: "Powder Room", hold: "ArrowUp", ms: 900 },
  { name: "combination", room: "Combination", hold: "ArrowUp", ms: 900 },
  { name: "mill", room: "Mill", hold: "ArrowUp", ms: 900 },
  { name: "conveyor", room: "Conveyor", ms: 900 },
  { name: "fortress", room: "Fortress", ms: 600 }
]

mkdirSync("output", { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors: Array<string> = []
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()) })
page.on("pageerror", (e) => errors.push(String(e)))
for (const shot of shots) {
  // Rooms by name, so adding a room never shifts the shots onto the wrong ones.
  const room = ROOMS.findIndex((r) => r.name === shot.room) + 1
  if (room === 0) throw new Error(`no room named ${shot.room}`)
  await page.goto(`${base}/?room=${room}`)
  await page.waitForTimeout(300)
  if (shot.hold !== undefined) await page.keyboard.down(shot.hold)
  await page.waitForTimeout(shot.ms)
  if (shot.hold !== undefined) await page.keyboard.up(shot.hold)
  await page.screenshot({ path: `output/${shot.name}.png` })
}
await browser.close()
console.log(errors.length === 0 ? "no console errors" : errors.join("\n"))
