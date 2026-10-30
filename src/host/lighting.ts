/**
 * Pixel-art lighting for the scene buffer. Anything that glows calls
 * `emitLight` while it draws; after the world is painted, `applyLighting`
 * builds a light map at the buffer's native resolution: each light, with
 * walls and cover casting shadows, cut into a few hard bands with an ordered
 * dither, over a flat ambient; then multiplies the scene by it. Emissive pixels
 * (telegraphs, shots, flames) are masked to full light so threats never sink
 * into the dark.
 *
 * Lights are host state for one frame: collected per context and drained by
 * `applyLighting`, never stored in the simulation.
 */
import type { Pillar } from "../sim/rooms.ts"

export type Rgb = readonly [number, number, number]

export interface Light {
  /** Scene-buffer pixels of the light's footprint on the floor (under a torch, not its flame). */
  readonly x: number
  readonly y: number
  /** Reach in metres on the floor. */
  readonly radius: number
  readonly colour: Rgb
  /** 0 to 1: how much of `colour` it adds at its centre. */
  readonly intensity: number
  /** Casts shadows from walls and cover (default true). Small flashes can skip it. */
  readonly shadows?: boolean
}

const pending = new WeakMap<CanvasRenderingContext2D, Array<Light>>()

/** Registers a light for this frame on this context; drawn when the frame's lighting is applied. */
export const emitLight = (ctx: CanvasRenderingContext2D, light: Light): void => {
  let list = pending.get(ctx)
  if (list === undefined) { list = []; pending.set(ctx, list) }
  list.push(light)
}

/** Drops this frame's lights unused (lighting turned off). */
export const discardLights = (ctx: CanvasRenderingContext2D): void => { pending.set(ctx, []) }

/** How the lighting pass maps between the scene buffer and the floor. */
export interface LightingFrame {
  /** Scene-buffer px of a floor point (metres, z up). */
  readonly P: (x: number, y: number, z?: number) => { readonly x: number; readonly y: number }
  /** Floor metres of a scene-buffer px on the ground. */
  readonly toFloor: (sx: number, sy: number) => { readonly x: number; readonly y: number }
  /** Pixels per metre, and the floor's depth squash. */
  readonly u: number
  readonly squash: number
  /** What blocks light: pillars and shut doors, with their drawn height in metres. */
  readonly blockers: ReadonlyArray<Pillar>
  readonly blockerHeight: number
  /** The back wall's height in metres and the room's size: the wall face is lit, never shadowed. */
  readonly backWall: number
  readonly room: { readonly w: number; readonly h: number }
  /** Light with no source: dim and cool while time is frozen, warmer while it runs. */
  readonly ambient: Rgb
}

/** 4×4 Bayer thresholds, 0 to 1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16)
/** Light steps per channel: few enough to read as painted bands. */
const LEVELS = 5

interface Buffers { light: HTMLCanvasElement; layer: HTMLCanvasElement }
const buffers = new WeakMap<CanvasRenderingContext2D, Buffers>()

const canvasOf = (w: number, h: number, old?: HTMLCanvasElement): HTMLCanvasElement => {
  const c = old ?? document.createElement("canvas")
  if (c.width !== w) c.width = w
  if (c.height !== h) c.height = h
  return c
}

const rgba = (c: Rgb, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`

/** The shadow a box throws away from a light at (lx, ly): the hull of its corners and their far projections. */
const shadowHull = (lx: number, ly: number, b: Pillar, reach: number): Array<{ x: number; y: number }> => {
  const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] as const
  const points: Array<{ x: number; y: number }> = []
  for (const [x, y] of corners) {
    points.push({ x, y })
    const dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy) || 1
    points.push({ x: x + (dx / d) * reach, y: y + (dy / d) * reach })
  }
  // Convex hull (monotone chain).
  points.sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Array<{ x: number; y: number }> = [], upper: Array<{ x: number; y: number }> = []
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * Lights the scene drawn on `ctx` so far. `emissive` holds pixels that must
 * keep full brightness (any non-transparent pixel counts); pass null for none.
 */
export const applyLighting = (ctx: CanvasRenderingContext2D, frame: LightingFrame, emissive: HTMLCanvasElement | null): void => {
  const lights = pending.get(ctx) ?? []
  pending.set(ctx, [])
  const w = ctx.canvas.width, h = ctx.canvas.height
  const old = buffers.get(ctx)
  const b: Buffers = { light: canvasOf(w, h, old?.light), layer: canvasOf(w, h, old?.layer) }
  buffers.set(ctx, b)
  const lc = b.light.getContext("2d", { willReadFrequently: true })!
  const yc = b.layer.getContext("2d")!
  // Sources first, on black: only their light is banded, so unlit floor stays flat instead of dithering everywhere.
  lc.globalCompositeOperation = "source-over"
  lc.fillStyle = "#000"; lc.fillRect(0, 0, w, h)

  const { P, u, squash } = frame
  // Box faces on screen: the top and the front, lit by distance but never shadowed by themselves.
  const faces = frame.blockers.map((p) => {
    const far = P(p.x, p.y, frame.blockerHeight), ground = P(p.x + p.w, p.y + p.h)
    return { x: far.x, y: far.y, w: ground.x - far.x, h: ground.y - far.y }
  })
  const wallTop = P(0, 0, frame.backWall), wallFoot = P(frame.room.w, 0)

  for (const light of lights) {
    const rx = light.radius * u, ry = rx * squash
    if (light.x + rx < 0 || light.x - rx > w || light.y + ry < 0 || light.y - ry > h) continue
    const paint = (): void => {
      yc.save()
      yc.translate(light.x, light.y); yc.scale(1, squash)
      const g = yc.createRadialGradient(0, 0, 0, 0, 0, rx)
      g.addColorStop(0, rgba(light.colour, light.intensity))
      g.addColorStop(0.55, rgba(light.colour, light.intensity * 0.45))
      g.addColorStop(1, rgba(light.colour, 0))
      yc.fillStyle = g
      yc.fillRect(-rx, -rx, rx * 2, rx * 2)
      yc.restore()
    }
    yc.globalCompositeOperation = "source-over"
    yc.clearRect(0, 0, w, h)
    paint()
    if (light.shadows !== false && frame.blockers.length > 0) {
      const at = frame.toFloor(light.x, light.y)
      yc.globalCompositeOperation = "destination-out"
      yc.fillStyle = "#000"
      for (const p of frame.blockers) {
        // A light inside a box (a torch on a pillar) lights its surroundings instead of being swallowed.
        if (at.x > p.x - 0.05 && at.x < p.x + p.w + 0.05 && at.y > p.y - 0.05 && at.y < p.y + p.h + 0.05) continue
        const hull = shadowHull(at.x, at.y, p, light.radius * 2)
        yc.beginPath()
        hull.forEach((q, i) => { const s = P(q.x, q.y); if (i === 0) yc.moveTo(s.x, s.y); else yc.lineTo(s.x, s.y) })
        yc.closePath(); yc.fill()
      }
      // Faces of boxes and the back wall: lit by distance alone.
      yc.globalCompositeOperation = "source-over"
      yc.save()
      yc.beginPath()
      for (const f of faces) yc.rect(f.x, f.y, f.w, f.h)
      yc.rect(wallTop.x - 8, wallTop.y - 8, wallFoot.x - wallTop.x + 16, wallFoot.y - wallTop.y + 8)
      yc.clip()
      yc.clearRect(0, 0, w, h)
      paint()
      yc.restore()
    }
    lc.globalCompositeOperation = "lighter"
    lc.drawImage(b.layer, 0, 0)
  }

  // Hard bands, dithered at their edges: per channel, quantise with a Bayer threshold.
  const image = lc.getImageData(0, 0, w, h)
  const d = image.data
  for (let y = 0; y < h; y++) {
    const row = (y & 3) * 4
    for (let x = 0; x < w; x++) {
      const t = BAYER[row + (x & 3)]!
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(Math.floor((d[i + c]! / 255) * LEVELS + t) / LEVELS * 255))
      d[i + 3] = 255
    }
  }
  lc.putImageData(image, 0, 0)
  lc.globalCompositeOperation = "lighter"
  lc.fillStyle = rgba(frame.ambient); lc.fillRect(0, 0, w, h)

  // Emissive pixels keep full light: their mask, filled white, over the light map.
  if (emissive !== null) {
    yc.globalCompositeOperation = "source-over"
    yc.clearRect(0, 0, w, h)
    yc.drawImage(emissive, 0, 0)
    yc.globalCompositeOperation = "source-in"
    yc.fillStyle = "#fff"; yc.fillRect(0, 0, w, h)
    lc.globalCompositeOperation = "source-over"
    lc.drawImage(b.layer, 0, 0)
  }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = "multiply"
  ctx.drawImage(b.light, 0, 0)
  ctx.restore()
}
