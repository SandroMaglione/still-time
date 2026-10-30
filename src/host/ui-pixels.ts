/**
 * Pixel sprites for the page's UI (stars, icons, the title clock), drawn as
 * crisp SVG rectangles from text rows. Each sprite pixel is `--u` CSS px (one
 * UI pixel, a whole number of device pixels, set by the HUD), times `--k`.
 */

export const INK = "#0b0d12"

const PALETTE: Record<string, string> = {
  O: INK,
  W: "#e8ecf4", // light
  w: "#8996b0", // light, shaded
  G: "#edc66c", // gold
  Y: "#fbe7a6", // gold highlight
  D: "#b8873e", // gold shade
  R: "#ce4655", // danger
  r: "#8a2d3d",
  T: "#64b6b3", // player teal
  I: "#c6dcef", // ice
  i: "#7fa6c9",
  S: "#3a4258", // stone
  s: "#2a3044",
  d: "#20263a"
}

/** Rows plus an outline of ink around every filled pixel (4-neighbours), one pixel wider on each side. */
const outlined = (rows: ReadonlyArray<string>): Array<string> => {
  const h = rows.length + 2, w = Math.max(...rows.map((r) => r.length)) + 2
  const at = (x: number, y: number): string => rows[y - 1]?.[x - 1] ?? "."
  const out: Array<string> = []
  for (let y = 0; y < h; y++) {
    let line = ""
    for (let x = 0; x < w; x++) {
      const c = at(x, y)
      if (c !== ".") line += c
      else line += [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => n !== "." && n !== "O") ? "O" : "."
    }
    out.push(line)
  }
  return out
}

/** An SVG of the rows: one rect per run of a colour on a row. */
export const pixelSvg = (rows: ReadonlyArray<string>, opts: { readonly outline?: boolean; readonly k?: number; readonly className?: string; readonly palette?: Record<string, string> } = {}): string => {
  const art = opts.outline === true ? outlined(rows) : [...rows]
  const palette = { ...PALETTE, ...opts.palette }
  const w = Math.max(...art.map((r) => r.length)), h = art.length
  let rects = ""
  art.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]!
      let end = x + 1
      while (end < row.length && row[end] === c) end++
      const fill = palette[c]
      if (c !== "." && fill !== undefined) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`
      x = end
    }
  })
  return `<svg class="px ${opts.className ?? ""}" style="--w:${w};--h:${h}${opts.k === undefined ? "" : `;--k:${opts.k}`}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`
}

/** A node from markup (one root element). */
export const fromHtml = (html: string): Element => {
  const t = document.createElement("template")
  t.innerHTML = html
  return t.content.firstElementChild!
}

const STAR = [
  "....Y....",
  "...YGG...",
  "YYYYGGGGD",
  ".YGGGGGD.",
  "..GGGGD..",
  ".GGGDGGD.",
  ".GD...DD."
]
const EMPTY_STAR = STAR.map((r) => r.replace(/[YG]/g, "S").replace(/D/g, "s"))

/** A star sprite, earned (gold) or not (stone). */
export const star = (lit: boolean, k = 1, className = ""): string => pixelSvg(lit ? STAR : EMPTY_STAR, { outline: true, k, className: `star ${lit ? "lit" : ""} ${className}` })

export const ICONS = {
  menu: [
    "WWWWWWWWW",
    ".........",
    ".........",
    "WWWWWWWWW",
    ".........",
    ".........",
    "WWWWWWWWW"
  ],
  restart: [
    "...WWWW.W",
    "..W....WW",
    ".W....WWW",
    "W........",
    "W........",
    "W.......W",
    ".W.....W.",
    "..W...W..",
    "...WWW..."
  ],
  close: [
    "WW.....WW",
    ".WW...WW.",
    "..WW.WW..",
    "...WWW...",
    "..WW.WW..",
    ".WW...WW.",
    "WW.....WW"
  ],
  lock: [
    ".www.",
    "w...w",
    "w...w",
    "SSSSS",
    "SSdSS",
    "SSdSS",
    "SSSSS"
  ],
  hit: [
    "R...R",
    ".R.R.",
    "..R..",
    ".R.R.",
    "R...R"
  ],
  sound: [
    "...W.....",
    "..WW...W.",
    "WWWW.W..W",
    "WWWW.W..W",
    "WWWW.W..W",
    "..WW...W.",
    "...W....."
  ],
  soundOff: [
    "...W.....",
    "..WW.....",
    "WWWW.R.R.",
    "WWWW..R..",
    "WWWW.R.R.",
    "..WW.....",
    "...W....."
  ],
  music: [
    "...WWWWWW",
    "...WWWWWW",
    "...W....W",
    "...W....W",
    ".WWW..WWW",
    "WWWW.WWWW",
    ".WW...WW."
  ],
  musicOff: [
    "...WWWWWW",
    "...WWWWWW",
    "...W....W",
    "...W..R.W",
    ".WWW.R.WW",
    "WWWWR.WWW",
    ".WW...WW."
  ],
  back: [
    "...W.....",
    "..WW.....",
    ".WWWWWWWW",
    "WWWWWWWWW",
    ".WWWWWWWW",
    "..WW.....",
    "...W....."
  ]
} as const

/** The hourglass: sand above while time runs (frame 0/1 trickle), all of it settled while frozen. */
export const hourglass = (frame: 0 | 1 | 2): string => {
  const sand = frame === 2 ? "I" : "G"
  const frames = [
    ["WWWWWWW", ".w###w.", ".w###w.", "..w#w..", "...#...", "..w.w..", ".w...w.", ".w.#.w.", "WWWWWWW"],
    ["WWWWWWW", ".w...w.", ".w###w.", "..w#w..", "...#...", "..w#w..", ".w...w.", ".w###w.", "WWWWWWW"],
    ["WWWWWWW", ".w...w.", ".w...w.", "..w.w..", "...w...", "..w.w..", ".w###w.", ".w###w.", "WWWWWWW"]
  ]
  return pixelSvg(frames[frame]!.map((r) => r.replace(/#/g, sand)), { className: "hourglass" })
}

/** The title clock: a 15-pixel face with its minute hand at one of 12 positions. */
export const clockFace = (tick: number): string => {
  const n = 17, c = 8
  const grid = Array.from({ length: n }, () => Array.from({ length: n }, () => "."))
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - c, y - c)
    if (d <= 7.5) grid[y]![x] = d > 6.3 ? "S" : y < c - 3 && d > 5.2 ? "W" : "I"
  }
  // Hour marks.
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2
    grid[Math.round(c - Math.cos(a) * 5.2)]![Math.round(c + Math.sin(a) * 5.2)] = h % 3 === 0 ? "s" : "i"
  }
  const hand = (a: number, len: number, colour: string): void => {
    for (let t = 0; t <= len; t += 0.25) grid[Math.round(c - Math.cos(a) * t)]![Math.round(c + Math.sin(a) * t)] = colour
  }
  hand(Math.PI * 2 * (10 / 12), 3, "s")
  hand(((tick % 12) / 12) * Math.PI * 2, 5, "R")
  grid[c]![c] = "G"
  // Two bells on top.
  grid[0]![3] = grid[0]![4] = grid[1]![3] = "G"; grid[0]![13] = grid[0]![12] = grid[1]![13] = "G"
  return pixelSvg(grid.map((r) => r.join("")), { outline: true, className: "clock-face" })
}
