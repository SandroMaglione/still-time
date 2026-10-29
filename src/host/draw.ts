/**
 * Drawing the fight view onto a 2D canvas in a projected, standing-up view:
 * the floor and decals flat on the ground, crates and walls as boxes, people
 * as small cylinders, all painted back to front. The simulation stays flat
 * 2D; only this file knows about height.
 */
import type { Pillar } from "../sim/rooms.ts"
import type { FightView } from "../sim/view.ts"

export interface Stick { ox: number; oy: number; x: number; y: number; reach: number }

const TOP = 44, BOTTOM = 64
const PILLAR_HEIGHT = 1.2
const BACK_WALL = 1.6

/**
 * How world metres land on screen. `iso` turns the room 45° (2:1 dimetric);
 * `tilt` keeps it upright and leans the camera back (a 3/4 view).
 */
export type ProjectionId = "iso" | "tilt"
export const PROJECTION_IDS: ReadonlyArray<ProjectionId> = ["iso", "tilt"]

interface Projection {
  /** Screen offset in px of a world point (metres, z up) for unit u. */
  readonly at: (x: number, y: number, z: number, u: number) => { readonly x: number; readonly y: number }
  /** Pixels per unit for this canvas width. */
  readonly unit: (cw: number) => number
  /** Screen semi-axes in px of a ground circle of 1 m radius. */
  readonly ellipse: (u: number) => { readonly rx: number; readonly ry: number }
  /** A screen direction turned into the world direction that looks the same. */
  readonly toWorld: (dx: number, dy: number) => { readonly x: number; readonly y: number }
  /** Larger is nearer the viewer. */
  readonly depth: (x: number, y: number) => number
  /** Is a point on the ground in front of a box (drawn after it)? */
  readonly inFront: (x: number, y: number, p: Pillar) => boolean
  /** The box faces the viewer sees, as corner lists on the ground. */
  readonly faces: (p: Pillar) => ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]>
  /** The room edges drawn as tall back walls. */
  readonly backEdges: (w: number, h: number) => ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]>
}

export const PROJECTIONS: Record<ProjectionId, Projection> = {
  iso: {
    at: (x, y, z, u) => ({ x: (x - y) * u, y: (x + y) * u * 0.5 - z * u * 1.15 }),
    unit: (cw) => cw / 14,
    ellipse: (u) => ({ rx: u * Math.SQRT2, ry: (u * Math.SQRT2) / 2 }),
    toWorld: (dx, dy) => ({ x: dx / 2 + dy, y: dy - dx / 2 }),
    depth: (x, y) => x + y,
    inFront: (x, y, p) => x >= p.x + p.w || y >= p.y + p.h,
    faces: (p) => [
      [[p.x, p.y + p.h], [p.x + p.w, p.y + p.h]],
      [[p.x + p.w, p.y], [p.x + p.w, p.y + p.h]]
    ],
    backEdges: (w, h) => [[[0, h], [0, 0]], [[0, 0], [w, 0]]]
  },
  tilt: {
    at: (x, y, z, u) => ({ x: x * u, y: y * u * 0.72 - z * u * 0.8 }),
    unit: (cw) => cw / 10,
    ellipse: (u) => ({ rx: u, ry: u * 0.72 }),
    toWorld: (dx, dy) => ({ x: dx, y: dy / 0.72 }),
    depth: (_x, y) => y,
    inFront: (_x, y, p) => y >= p.y + p.h,
    faces: (p) => [[[p.x, p.y + p.h], [p.x + p.w, p.y + p.h]]],
    backEdges: (w) => [[[0, 0], [w, 0]]]
  }
}

/** Where the camera looks on the floor, eased toward the player: page state, not world state. */
export class Camera {
  x = 0
  y = 0
  private placed = false

  follow(view: FightView, dt: number): void {
    const p = view.player
    if (p === null) return
    // A little lead in the direction you move, so you see where you are going.
    const tx = Math.max(0, Math.min(view.room.w, p.x + p.vx * 0.25))
    const ty = Math.max(0, Math.min(view.room.h, p.y + p.vy * 0.25))
    if (!this.placed) {
      this.x = tx
      this.y = ty
      this.placed = true
      return
    }
    const k = 1 - Math.exp(-dt * 8)
    this.x += (tx - this.x) * k
    this.y += (ty - this.y) * k
  }

  /** Snaps to the player next frame: on a new room. */
  reset(): void {
    this.placed = false
  }
}

const mix = (a: readonly [number, number, number], b: readonly [number, number, number], t: number, alpha = 1): string =>
  `rgba(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)},${alpha})`

const SHOOTER_COLOURS = { gunner: "#e8484a", archer: "#ff7a3d", thrower: "#d24a9a", brute: "#b8323a" } as const

export const draw = (ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, stick: Stick | null, camera: Camera, projection: ProjectionId): void => {
  const proj = PROJECTIONS[projection]
  const u = proj.unit(cw)
  const { rx: erx, ry: ery } = proj.ellipse(u)
  const { w, h } = view.room
  const centre = proj.at(camera.x, camera.y, 0, u)
  // Keep the room's on-screen box (floor and back walls, plus a small margin) covering the view
  // where it can, so the camera never shows void past the room's edge; centre it when it is smaller.
  const corners = [[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0], [0, 0, BACK_WALL], [w, 0, BACK_WALL], [0, h, BACK_WALL]] as const
  const sx = corners.map(([x, y, z]) => proj.at(x, y, z, u).x), sy = corners.map(([x, y, z]) => proj.at(x, y, z, u).y)
  const margin = u * 0.6
  const fit = (want: number, lo: number, hi: number, min: number, max: number): number => {
    const from = hi - max + margin, to = lo - min - margin
    return from > to ? (from + to) / 2 : Math.max(from, Math.min(to, want))
  }
  const cx = fit(cw / 2 - centre.x, 0, cw, Math.min(...sx), Math.max(...sx))
  const cy = fit(TOP + (ch - TOP - BOTTOM) / 2 - centre.y, TOP, ch - BOTTOM, Math.min(...sy), Math.max(...sy))
  const P = (x: number, y: number, z = 0): { x: number; y: number } => {
    const p = proj.at(x, y, z, u)
    return { x: cx + p.x, y: cy + p.y }
  }
  const moveTo = (x: number, y: number, z = 0): void => { const p = P(x, y, z); ctx.moveTo(p.x, p.y) }
  const lineTo = (x: number, y: number, z = 0): void => { const p = P(x, y, z); ctx.lineTo(p.x, p.y) }
  /** A world arc on the ground (or at height z), optionally closed through its centre as a wedge. */
  const arcPath = (x: number, y: number, r: number, a0: number, a1: number, wedge: boolean, z = 0): void => {
    ctx.beginPath()
    if (wedge) moveTo(x, y, z)
    const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * 10))
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n
      if (i === 0 && !wedge) moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r, z)
      else lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r, z)
    }
    if (wedge) ctx.closePath()
  }
  // 0 when time is frozen, 1 at real time.
  const live = Math.max(0, Math.min(1, (view.scale - view.slow) / (1 - view.slow)))

  ctx.fillStyle = "#06070a"
  ctx.fillRect(0, 0, cw, ch)

  // Back walls, then the floor and its grid: cold when frozen, warm when moving.
  for (const [[ax, ay], [bx, by]] of proj.backEdges(w, h)) {
    ctx.beginPath(); moveTo(ax, ay); lineTo(bx, by); lineTo(bx, by, BACK_WALL); lineTo(ax, ay, BACK_WALL); ctx.closePath()
    ctx.fillStyle = mix([30, 40, 60], [56, 40, 36], live)
    ctx.fill()
  }
  ctx.beginPath(); moveTo(0, 0); lineTo(w, 0); lineTo(w, h); lineTo(0, h); ctx.closePath()
  ctx.fillStyle = mix([22, 30, 46], [44, 30, 28], live)
  ctx.fill()
  ctx.strokeStyle = mix([60, 84, 120], [110, 70, 60], live, 0.25)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 1; i < w; i++) { moveTo(i, 0); lineTo(i, h) }
  for (let j = 1; j < h; j++) { moveTo(0, j); lineTo(w, j) }
  ctx.stroke()
  ctx.strokeStyle = mix([120, 160, 220], [240, 150, 110], live, 0.7)
  ctx.lineWidth = 3
  ctx.beginPath(); moveTo(0, 0); lineTo(w, 0); lineTo(w, h); lineTo(0, h); ctx.closePath(); ctx.stroke()

  // Ground decals: where shots will pass, what each enemy covers, your reach.
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 6])
  for (const shot of view.shots) {
    ctx.strokeStyle = `rgba(255,90,90,${0.45 * (1 - live) + 0.08})`
    ctx.beginPath(); moveTo(shot.x, shot.y); lineTo(shot.x + shot.vx, shot.y + shot.vy); ctx.stroke()
  }
  ctx.setLineDash([])
  for (const shot of view.shots) {
    const p = P(shot.x, shot.y)
    ctx.fillStyle = "#00000060"
    ctx.beginPath(); ctx.ellipse(p.x, p.y, shot.radius * erx, shot.radius * ery, 0, 0, Math.PI * 2); ctx.fill()
  }
  for (const e of view.enemies) {
    const m = e.melee
    if (m === null) {
      // The reload ring on the floor.
      ctx.strokeStyle = `rgba(255,80,80,${0.25 + e.charge * 0.6})`
      ctx.lineWidth = 3
      arcPath(e.x, e.y, e.radius + 0.18, -Math.PI / 2, -Math.PI / 2 + e.charge * Math.PI * 2, false)
      ctx.stroke()
      continue
    }
    const lockStart = 1 - m.lockShare
    if (m.phase === "windup" && !m.locked) {
      arcPath(e.x, e.y, m.reach, e.aim - m.arc, e.aim + m.arc, true)
      ctx.fillStyle = "rgba(255,60,60,0.1)"; ctx.fill()
      ctx.strokeStyle = "rgba(255,90,90,0.8)"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([])
    } else if (m.phase === "windup") {
      const k = (m.progress - lockStart) / (1 - lockStart)
      arcPath(e.x, e.y, m.reach, e.aim - m.arc, e.aim + m.arc, true)
      ctx.fillStyle = `rgba(255,60,60,${0.2 + 0.35 * k})`; ctx.fill()
      ctx.strokeStyle = "rgba(255,90,90,0.9)"; ctx.lineWidth = 2; ctx.stroke()
      arcPath(e.x, e.y, m.reach * k, e.aim - m.arc, e.aim + m.arc, true)
      ctx.fillStyle = "rgba(255,60,60,0.35)"; ctx.fill()
    } else if (m.phase === "swing") {
      arcPath(e.x, e.y, m.reach, e.aim - m.arc, e.aim + m.arc, true)
      ctx.fillStyle = "rgba(255,240,240,0.85)"; ctx.fill()
    } else if (m.phase === "recover") {
      arcPath(e.x, e.y, m.reach, e.aim - m.arc, e.aim + m.arc, true)
      ctx.fillStyle = `rgba(200,200,220,${0.15 * (1 - m.progress)})`; ctx.fill()
    } else {
      arcPath(e.x, e.y, m.reach, e.aim - m.arc, e.aim + m.arc, true)
      ctx.strokeStyle = m.phase === "chase" ? "rgba(255,90,90,0.25)" : "rgba(255,90,90,0.12)"
      ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([])
    }
    // Guarded front (steel) and weak back (gold), as rings on the floor.
    ctx.lineWidth = 4
    ctx.strokeStyle = m.phase === "recover" ? "#8a94a8" : "#dfe8ff"
    arcPath(e.x, e.y, e.radius + 0.12, e.aim - m.guard, e.aim + m.guard, false); ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = "#ffd25a"
    arcPath(e.x, e.y, e.radius + 0.12, e.aim + m.guard, e.aim + Math.PI * 2 - m.guard, false); ctx.stroke()
  }
  if (view.player !== null) {
    ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 1; ctx.setLineDash([3, 5])
    arcPath(view.player.x, view.player.y, view.player.attackRange, 0, Math.PI * 2, false); ctx.stroke()
    ctx.setLineDash([])
  }

  // Everything standing, painted back to front; crates and walls by the box rule.
  type Thing = { readonly x: number; readonly y: number; readonly paint: () => void }
  const actors: Array<Thing> = []
  /** A standing cylinder: shadow, body, lighter top. */
  const cylinder = (x: number, y: number, r: number, height: number, body: string, top: string): void => {
    const g = P(x, y), t = P(x, y, height)
    ctx.fillStyle = "#00000070"
    ctx.beginPath(); ctx.ellipse(g.x, g.y, r * erx * 1.1, r * ery * 1.1, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.ellipse(g.x, g.y, r * erx, r * ery, 0, 0, Math.PI)
    ctx.lineTo(t.x - r * erx, t.y)
    ctx.ellipse(t.x, t.y, r * erx, r * ery, 0, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = top
    ctx.beginPath(); ctx.ellipse(t.x, t.y, r * erx, r * ery, 0, 0, Math.PI * 2); ctx.fill()
  }
  /** A line held at height z from (x, y) toward angle a. */
  const held = (x: number, y: number, a: number, from: number, to: number, z: number, colour: string, width: number): void => {
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = "round"
    ctx.beginPath(); moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from, z); lineTo(x + Math.cos(a) * to, y + Math.sin(a) * to, z); ctx.stroke()
    ctx.lineCap = "butt"
  }
  for (const e of view.enemies) {
    actors.push({
      x: e.x, y: e.y, paint: () => {
        const m = e.melee
        const height = m === null ? 0.95 : 1.15
        const colour = SHOOTER_COLOURS[e.kind]
        cylinder(e.x, e.y, e.radius, height, colour, "#ffffff30")
        // What each kind wears on top: gunner a flat cap, archer a point, thrower a band.
        const t = P(e.x, e.y, height)
        if (e.kind === "archer") {
          const tip = P(e.x, e.y, height + 0.35)
          ctx.fillStyle = colour
          ctx.beginPath(); ctx.moveTo(t.x - e.radius * erx * 0.7, t.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(t.x + e.radius * erx * 0.7, t.y); ctx.fill()
        } else if (e.kind === "thrower") {
          ctx.strokeStyle = "#ffffffb0"; ctx.lineWidth = 2
          const b = P(e.x, e.y, height * 0.75)
          ctx.beginPath(); ctx.ellipse(b.x, b.y, e.radius * erx, e.radius * ery, 0, 0, Math.PI); ctx.stroke()
        }
        if (m === null) {
          held(e.x, e.y, e.aim, e.radius * 0.6, e.radius + 0.35, 0.6, e.sees ? "#ffffffdd" : "#ffffff40", 3)
        } else {
          const bladeAngle = m.phase === "windup" ? -m.arc * m.progress : m.phase === "swing" ? -m.arc + 2 * m.arc * m.progress : m.phase === "recover" ? m.arc : 0
          held(e.x, e.y, e.aim + bladeAngle, e.radius * 0.8, m.reach * 0.85, m.phase === "recover" ? 0.25 : 0.7, "#f4f6ff", 3)
        }
      }
    })
  }
  for (const shot of view.shots) {
    actors.push({
      x: shot.x, y: shot.y, paint: () => {
        const a = Math.atan2(shot.vy, shot.vx)
        const z = 0.6
        if (shot.kind === "bullet") {
          held(shot.x, shot.y, a + Math.PI, 0, 0.5, z, "#ffd25a50", shot.radius * erx * 1.2)
          const p = P(shot.x, shot.y, z)
          ctx.fillStyle = "#ffd25a"
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, shot.radius * erx), 0, Math.PI * 2); ctx.fill()
        } else if (shot.kind === "arrow") {
          held(shot.x, shot.y, a + Math.PI, 0, 0.55, z, "#cfe8ff", 2)
          held(shot.x, shot.y, a, 0, 0.12, z, "#ffffff", 4)
        } else {
          held(shot.x, shot.y, a, -0.12, 0.2, z, "#e6e6e6", 4)
        }
      }
    })
  }
  if (view.player !== null) {
    const p = view.player
    actors.push({
      x: p.x, y: p.y, paint: () => {
        const speed = Math.hypot(p.vx, p.vy)
        if (speed > 0) held(p.x, p.y, Math.atan2(-p.vy, -p.vx), 0, speed * 0.06, 0.5, "#ffffff40", p.radius * erx * 1.4)
        cylinder(p.x, p.y, p.radius, 1, view.flow === "dead" ? "#ff5050" : "#e4e8f4", "#ffffff")
      }
    })
  }
  const boxes = [...view.room.pillars].sort((a, b) => proj.depth(a.x + a.w, a.y + a.h) - proj.depth(b.x + b.w, b.y + b.h))
  // Each actor goes right after the last box it stands in front of.
  const slots: Array<Array<Thing>> = boxes.map(() => [])
  const first: Array<Thing> = []
  for (const a of actors) {
    let slot = -1
    boxes.forEach((b, i) => { if (proj.inFront(a.x, a.y, b)) slot = i })
    ;(slot === -1 ? first : slots[slot] ?? first).push(a)
  }
  const paintAll = (things: Array<Thing>): void => {
    for (const t of things.sort((a, b) => proj.depth(a.x, a.y) - proj.depth(b.x, b.y))) t.paint()
  }
  paintAll(first)
  boxes.forEach((b, i) => {
    for (const [[ax, ay], [bx, by]] of proj.faces(b)) {
      ctx.beginPath(); moveTo(ax, ay); lineTo(bx, by); lineTo(bx, by, PILLAR_HEIGHT); lineTo(ax, ay, PILLAR_HEIGHT); ctx.closePath()
      ctx.fillStyle = ax === bx ? "#14161e" : "#1b1e28"
      ctx.fill()
    }
    ctx.beginPath(); moveTo(b.x, b.y, PILLAR_HEIGHT); lineTo(b.x + b.w, b.y, PILLAR_HEIGHT); lineTo(b.x + b.w, b.y + b.h, PILLAR_HEIGHT); lineTo(b.x, b.y + b.h, PILLAR_HEIGHT); ctx.closePath()
    ctx.fillStyle = "#2c3140"; ctx.fill()
    ctx.strokeStyle = "#ffffff28"; ctx.lineWidth = 1; ctx.stroke()
    paintAll(slots[i] ?? [])
  })

  // You, always visible: an outline over anything that hides you.
  if (view.player !== null) {
    const p = view.player
    const g = P(p.x, p.y), t = P(p.x, p.y, 1)
    ctx.strokeStyle = "#ffffff70"; ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(g.x, g.y, p.radius * erx, p.radius * ery, 0, 0, Math.PI)
    ctx.lineTo(t.x - p.radius * erx, t.y)
    ctx.ellipse(t.x, t.y, p.radius * erx, p.radius * ery, 0, Math.PI, Math.PI * 2)
    ctx.closePath(); ctx.stroke()
  }

  // Cuts, at chest height.
  for (const c of view.slashes) {
    const t = c.age / 0.35
    const len = 0.6 + t * 0.6
    const a = c.angle + 0.8
    ctx.strokeStyle = `rgba(255,255,255,${1 - t})`; ctx.lineWidth = 3
    ctx.beginPath(); moveTo(c.x - Math.cos(a) * len, c.y - Math.sin(a) * len, 0.6); lineTo(c.x + Math.cos(a) * len, c.y + Math.sin(a) * len, 0.6); ctx.stroke()
  }

  // Enemies off screen: a marker at the edge, bright when it can see you.
  const pad = 14
  const midX = cw / 2, midY = TOP + (ch - TOP - BOTTOM) / 2
  for (const e of view.enemies) {
    const sp = P(e.x, e.y, 0.6)
    if (sp.x >= 0 && sp.x <= cw && sp.y >= TOP && sp.y <= ch - BOTTOM) continue
    const dx = sp.x - midX, dy = sp.y - midY
    const k = Math.min((cw / 2 - pad) / Math.abs(dx || 1e-6), ((ch - TOP - BOTTOM) / 2 - pad) / Math.abs(dy || 1e-6))
    ctx.save()
    ctx.translate(midX + dx * k, midY + dy * k)
    ctx.rotate(Math.atan2(dy, dx))
    ctx.fillStyle = e.sees ? `rgba(255,70,70,${0.55 + e.charge * 0.45})` : "rgba(255,120,120,0.3)"
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill()
    ctx.restore()
  }

  // Frozen-time vignette.
  if (live < 1) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7)
    g.addColorStop(0, "rgba(40,80,160,0)")
    g.addColorStop(1, `rgba(40,80,160,${0.35 * (1 - live)})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, cw, ch)
  }

  // The thumb-stick, faint.
  if (stick !== null) {
    ctx.strokeStyle = "#ffffff30"; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, stick.reach, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = "#ffffff30"
    ctx.beginPath(); ctx.arc(stick.x, stick.y, 18, 0, Math.PI * 2); ctx.fill()
  }

  // Messages.
  const message = view.flow === "dead" ? ["HIT", view.canRetry ? "tap to retry the room" : ""]
    : view.flow === "cleared" ? ["CLEAR", "tap for the next room"]
    : view.flow === "won" ? ["ALL ROOMS CLEAR", `${view.deaths} deaths · tap to go again`]
    : null
  if (message !== null) {
    ctx.fillStyle = "#000000a0"
    ctx.fillRect(0, ch / 2 - 60, cw, 120)
    ctx.fillStyle = view.flow === "dead" ? "#ff6060" : "#9effa8"
    ctx.textAlign = "center"
    ctx.font = "bold 34px ui-monospace, Menlo, monospace"
    ctx.fillText(message[0] ?? "", cw / 2, ch / 2)
    ctx.fillStyle = "#e8ecf4"
    ctx.font = "14px ui-monospace, Menlo, monospace"
    ctx.fillText(message[1] ?? "", cw / 2, ch / 2 + 30)
  }
}
