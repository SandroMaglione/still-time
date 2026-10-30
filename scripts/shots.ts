/**
 * Phone-size screenshots of the running page (`pnpm dev` first), into
 * output/, and any console errors. Usage: node scripts/shots.ts [baseUrl]
 */
import { mkdirSync } from "node:fs"
import { chromium } from "playwright"

const base = process.argv[2] ?? "http://localhost:5301"
const shots: ReadonlyArray<{ readonly name: string; readonly room: number; readonly hold?: string; readonly ms: number }> = [
  { name: "duel", room: 1, ms: 600 },
  { name: "gatehouse", room: 5, ms: 600 },
  { name: "throne", room: 6, hold: "ArrowUp", ms: 900 },
  { name: "thief", room: 7, hold: "ArrowUp", ms: 1200 },
  { name: "shieldwall", room: 10, hold: "ArrowUp", ms: 900 },
  { name: "watchtower", room: 11, hold: "ArrowUp", ms: 1500 },
  { name: "fortress", room: 12, ms: 600 }
]

mkdirSync("output", { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors: Array<string> = []
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()) })
page.on("pageerror", (e) => errors.push(String(e)))
for (const shot of shots) {
  await page.goto(`${base}/?room=${shot.room}`)
  await page.waitForTimeout(300)
  if (shot.hold !== undefined) await page.keyboard.down(shot.hold)
  await page.waitForTimeout(shot.ms)
  if (shot.hold !== undefined) await page.keyboard.up(shot.hold)
  await page.screenshot({ path: `output/${shot.name}.png` })
}
await browser.close()
console.log(errors.length === 0 ? "no console errors" : errors.join("\n"))
