/**
 * Frame times with a real GPU, the way players run it: headless browsers raster canvases on the CPU and hide
 * GPU-canvas costs. Opens a window. `pnpm perf [url] [cpu-slowdown]`; the slowdown (default 4) stands in for a phone.
 */
import { chromium } from "playwright"

const base = process.argv[2] ?? "http://localhost:5301"
const slowdown = Number(process.argv[3] ?? 4)
const browser = await chromium.launch({ headless: false, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=metal"] })
try {
  for (const [name, w, h, dpr] of [["phone", 390, 844, 3], ["desktop", 1440, 900, 2], ["landscape", 844, 390, 3]] as const) {
    for (const q of ["", "&nolight"]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
      const cdp = await page.context().newCDPSession(page)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: slowdown })
      await page.goto(`${base}/?room=4${q}`)
      await page.waitForTimeout(1000)
      await page.keyboard.down("ArrowUp")
      const result = await page.evaluate(() => new Promise<string>((done) => {
        const times: Array<number> = []
        let last = performance.now()
        const frame = (): void => {
          const t = performance.now(); times.push(t - last); last = t
          if (times.length < 90) { requestAnimationFrame(frame); return }
          const sorted = times.slice(10).sort((a, b) => a - b)
          done(`avg ${(sorted.reduce((a, b) => a + b) / sorted.length).toFixed(1)} ms, p95 ${sorted[Math.floor(sorted.length * 0.95)]!.toFixed(1)} ms`)
        }
        requestAnimationFrame(frame)
      }))
      console.log(`${name.padEnd(9)} ${(q === "" ? "lit" : "unlit").padEnd(5)} ${result}`)
      await page.close()
    }
  }
} finally {
  await browser.close()
}
