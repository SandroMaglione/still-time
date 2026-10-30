/** True-size assets; enlargement happens once, on the final canvas. */
const names = ["player-body", "gunner-body", "archer-body", "thrower-body", "brute-body", "runner-body", "sniper-body", "shield-body", "grenadier-body", "clockwork-body", "stalker-body", "crown", "cap", "cover-cap-1", "cover-cap-2", "cover-chip", "crate-cap", "crate-face", "masonry", "iron", "banner-red", "banner-moss", "rubble", "pots", "chain", "shadow", "exit-rune", "bullet", "spark", "floor-0", "floor-1", "floor-2", "floor-3", "floor-4", "floor-5", "floor-cracked", "floor-moss", "floor-drain", "rock-0", "rock-1", "rock-2", "brazier-0", "brazier-1", "plate-up", "plate-down", "plate-missed", "belt-tread", "belt-roller", "blade-bar", "blade-hub", "laser-post-off", "laser-post-warn", "laser-post-on", "bomb-idle", "bomb-0", "bomb-1", "bolt-launcher", "bolt-launcher-fire"] as const
export type Sprite = typeof names[number]
const images = new Map<Sprite, HTMLImageElement>()
const patterns = new WeakMap<CanvasRenderingContext2D, Map<Sprite, CanvasPattern>>()
const pixels = new Map<Sprite, ImageData>()
const flashes = new Map<Sprite, HTMLCanvasElement>()
const rims = new Map<Sprite, HTMLCanvasElement>()

export const loadArt = async (): Promise<void> => {
  await Promise.all(names.map(async (name) => {
    const image = new Image()
    image.src = `${import.meta.env.BASE_URL}art/${name}.png`
    await image.decode()
    images.set(name, image)
    if (name.endsWith("-body")) {
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      ctx.drawImage(image, 0, 0)
      pixels.set(name, ctx.getImageData(0, 0, image.width, image.height))
      const rim = document.createElement("canvas"); rim.width = 26; rim.height = 26
      const rimCtx = rim.getContext("2d", { willReadFrequently: true })!
      for (const [x, y] of [[0, 1], [2, 1], [1, 0], [1, 2]]) rimCtx.drawImage(image, x!, y!)
      rimCtx.globalCompositeOperation = "source-in"; rimCtx.fillStyle = "#c6d4df"; rimCtx.fillRect(0, 0, 26, 26)
      rimCtx.globalCompositeOperation = "destination-out"; rimCtx.drawImage(image, 1, 1)
      rims.set(name, rim)
      ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = "#f4efda"; ctx.fillRect(0, 0, image.width, image.height)
      flashes.set(name, canvas)
    }
  }))
}

export interface Pose {
  readonly flip?: boolean
  readonly lean?: number
  readonly sink?: number
  readonly flash?: boolean
  readonly fall?: number
  readonly dissolve?: number
  readonly seed?: number
}

/** Integer row poses and an inverse-sampled fall keep the original sprite's pixels. */
export const posedSprite = (ctx: CanvasRenderingContext2D, name: Sprite, x: number, y: number, pose: Pose): void => {
  const source = pixels.get(name), image = pose.flash ? flashes.get(name) : images.get(name)
  if (image === undefined || source === undefined) return
  const lean = Math.round(pose.lean ?? 0), sink = Math.round(pose.sink ?? 0)
  const fall = pose.fall ?? 0, dissolve = pose.dissolve ?? 0
  if (fall === 0 && dissolve === 0) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y + sink))
    if (pose.flip) ctx.scale(-1, 1)
    const rim = pose.flash ? undefined : rims.get(name)
    if (rim !== undefined) for (let row = 0; row < 26; row++) ctx.drawImage(rim, 0, row, 26, 1, -13 + Math.round(lean * (1 - (row - 1) / 24)), row - 24, 26, 1)
    for (let row = 0; row < 24; row++) ctx.drawImage(image, 0, row, 24, 1, -12 + Math.round(lean * (1 - row / 24)), row - 23, 24, 1)
    ctx.restore(); return
  }
  const angle = Math.round(Math.min(1, Math.abs(fall)) * 8) / 8 * Math.PI / 2 * Math.sign(fall)
  const c = Math.cos(angle), s = Math.sin(angle), squash = 1 - Math.abs(s) * 0.4
  for (let dy = -28; dy <= 13; dy++) for (let dx = -28; dx <= 28; dx++) {
    let sx = Math.round(c * dx + s * dy / squash) + 12
    const sy = Math.round(-s * dx + c * dy / squash) + 23
    if (pose.flip) sx = 23 - sx
    if (sx < 0 || sx >= 24 || sy < 0 || sy >= 24) continue
    const at = (sy * 24 + sx) * 4
    if (source.data[at + 3] === 0) continue
    const group = (Math.imul(Math.floor(sx / 2) + 17, 374761393) ^ Math.imul(Math.floor(sy / 2) + (pose.seed ?? 0), 668265263)) >>> 0
    if (dissolve > 0 && group % 101 < dissolve * 101) continue
    ctx.fillStyle = pose.flash ? "#f4efda" : `rgb(${source.data[at]},${source.data[at + 1]},${source.data[at + 2]})`
    ctx.fillRect(Math.round(x) + dx, Math.round(y) + dy + sink, 1, 1)
  }
}

/** The loaded image of a sprite, for effects that recolour it (afterimages, auras); undefined before `loadArt`. */
export const spriteImage = (name: Sprite): HTMLImageElement | undefined => images.get(name)

export const sprite = (ctx: CanvasRenderingContext2D, name: Sprite, x: number, y: number, flip = false): void => {
  const image = images.get(name)
  if (image === undefined) return
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  if (flip) ctx.scale(-1, 1)
  ctx.drawImage(image, -Math.floor(image.width / 2), -image.height + 1)
  ctx.restore()
}

/** Top-left anchor for native-size tiles, without stretching source pixels. */
export const tile = (ctx: CanvasRenderingContext2D, name: Sprite, x: number, y: number): void => {
  const image = images.get(name)
  if (image !== undefined) ctx.drawImage(image, Math.round(x), Math.round(y))
}

/** Nine-slice panel. Every centre and edge repeats source texels; none are stretched. */
export const panel = (ctx: CanvasRenderingContext2D, name: Sprite, x: number, y: number, width: number, height: number, border = 4): void => {
  const image = images.get(name)
  if (image === undefined) return
  x = Math.round(x); y = Math.round(y); width = Math.round(width); height = Math.round(height)
  const b = Math.min(border, Math.floor(width / 2), Math.floor(height / 2))
  if (b < 1) return
  const sourceX = [0, b, image.width - b], sourceY = [0, b, image.height - b]
  const targetX = [x, x + b, x + width - b], targetY = [y, y + b, y + height - b]
  const sourceW = [b, image.width - b * 2, b], sourceH = [b, image.height - b * 2, b]
  const targetW = [b, width - b * 2, b], targetH = [b, height - b * 2, b]
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    for (let dy = 0; dy < targetH[row]!; dy += sourceH[row]!) for (let dx = 0; dx < targetW[col]!; dx += sourceW[col]!) {
      const w = Math.min(sourceW[col]!, targetW[col]! - dx), h = Math.min(sourceH[row]!, targetH[row]! - dy)
      ctx.drawImage(image, sourceX[col]!, sourceY[row]!, w, h, targetX[col]! + dx, targetY[row]! + dy, w, h)
    }
  }
}

export const texture = (ctx: CanvasRenderingContext2D, name: Sprite, x: number, y: number, w: number, h: number): void => {
  const image = images.get(name)
  if (image === undefined) return
  let cache = patterns.get(ctx)
  if (cache === undefined) { cache = new Map(); patterns.set(ctx, cache) }
  let pattern = cache.get(name)
  if (pattern === undefined) {
    const created = ctx.createPattern(image, "repeat")
    if (created === null) return
    pattern = created; cache.set(name, pattern)
  }
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, Math.ceil(w), Math.ceil(h))
  ctx.restore()
}
