/** Drawing the fight view onto a 2D canvas: shapes only, until there is a look. */
import type { FightView } from "../sim/view.ts"

export interface Stick { ox: number; oy: number; x: number; y: number }

const TOP = 44, BOTTOM = 64

const mix = (a: readonly [number, number, number], b: readonly [number, number, number], t: number, alpha = 1): string =>
  `rgba(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)},${alpha})`

export const draw = (ctx: CanvasRenderingContext2D, cw: number, ch: number, view: FightView, stick: Stick | null): void => {
  const { w, h } = view.room
  const s = Math.min((cw - 16) / w, (ch - TOP - BOTTOM) / h)
  const ox = (cw - w * s) / 2
  const oy = TOP + (ch - TOP - BOTTOM - h * s) / 2
  const X = (x: number): number => ox + x * s
  const Y = (y: number): number => oy + y * s
  // 0 when time is frozen, 1 at real time.
  const live = Math.max(0, Math.min(1, (view.scale - 0.04) / 0.96))

  ctx.fillStyle = "#0b0d12"
  ctx.fillRect(0, 0, cw, ch)

  // Floor and grid: cold when frozen, warm when moving.
  ctx.fillStyle = mix([22, 30, 46], [44, 30, 28], live)
  ctx.fillRect(X(0), Y(0), w * s, h * s)
  ctx.strokeStyle = mix([60, 84, 120], [110, 70, 60], live, 0.25)
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 1; i < w; i++) { ctx.moveTo(X(i), Y(0)); ctx.lineTo(X(i), Y(h)) }
  for (let j = 1; j < h; j++) { ctx.moveTo(X(0), Y(j)); ctx.lineTo(X(w), Y(j)) }
  ctx.stroke()
  ctx.strokeStyle = mix([120, 160, 220], [240, 150, 110], live, 0.7)
  ctx.lineWidth = 2
  ctx.strokeRect(X(0), Y(0), w * s, h * s)

  for (const p of view.room.pillars) {
    ctx.fillStyle = "#07080c"
    ctx.fillRect(X(p.x), Y(p.y), p.w * s, p.h * s)
    ctx.strokeStyle = "#ffffff30"
    ctx.strokeRect(X(p.x), Y(p.y), p.w * s, p.h * s)
  }

  // Where each shot is going: a danger line that fades as time runs.
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 6])
  for (const shot of view.shots) {
    const ahead = 1.4
    ctx.strokeStyle = `rgba(255,90,90,${0.45 * (1 - live) + 0.08})`
    ctx.beginPath()
    ctx.moveTo(X(shot.x), Y(shot.y))
    ctx.lineTo(X(shot.x + shot.vx * ahead), Y(shot.y + shot.vy * ahead))
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Shots.
  for (const shot of view.shots) {
    const a = Math.atan2(shot.vy, shot.vx)
    ctx.save()
    ctx.translate(X(shot.x), Y(shot.y))
    ctx.rotate(a)
    if (shot.kind === "bullet") {
      ctx.fillStyle = "#ffd25a"
      ctx.beginPath(); ctx.arc(0, 0, shot.radius * s, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = "#ffd25a40"
      ctx.fillRect(-shot.radius * s * 5, -shot.radius * s * 0.7, shot.radius * s * 5, shot.radius * s * 1.4)
    } else if (shot.kind === "arrow") {
      ctx.strokeStyle = "#cfe8ff"; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-0.55 * s, 0); ctx.lineTo(0, 0); ctx.stroke()
      ctx.fillStyle = "#cfe8ff"
      ctx.beginPath(); ctx.moveTo(0.14 * s, 0); ctx.lineTo(-0.04 * s, -0.08 * s); ctx.lineTo(-0.04 * s, 0.08 * s); ctx.fill()
    } else {
      ctx.rotate((shot.x + shot.y) * 3)
      ctx.fillStyle = "#e6e6e6"
      ctx.beginPath(); ctx.moveTo(0.22 * s, 0); ctx.lineTo(0, -0.06 * s); ctx.lineTo(-0.12 * s, 0); ctx.lineTo(0, 0.06 * s); ctx.fill()
    }
    ctx.restore()
  }

  // Enemies: a body, the aim, and a ring that fills until the next shot.
  for (const e of view.enemies) {
    const r = e.radius * s
    ctx.save()
    ctx.translate(X(e.x), Y(e.y))
    ctx.strokeStyle = `rgba(255,80,80,${0.25 + e.charge * 0.6})`
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + e.charge * Math.PI * 2); ctx.stroke()
    ctx.rotate(e.aim)
    ctx.fillStyle = e.kind === "gunner" ? "#e8484a" : e.kind === "archer" ? "#ff7a3d" : "#d24a9a"
    ctx.beginPath()
    if (e.kind === "gunner") ctx.rect(-r, -r, r * 2, r * 2)
    else if (e.kind === "archer") { ctx.moveTo(r * 1.2, 0); ctx.lineTo(-r, -r); ctx.lineTo(-r, r); ctx.closePath() }
    else { ctx.moveTo(r * 1.2, 0); ctx.lineTo(0, -r); ctx.lineTo(-r * 1.2, 0); ctx.lineTo(0, r); ctx.closePath() }
    ctx.fill()
    ctx.fillStyle = "#ffffffaa"
    ctx.fillRect(r * 0.6, -2, r * 0.9, 4)
    ctx.restore()
  }

  // The player and their reach.
  if (view.player !== null) {
    const p = view.player
    ctx.strokeStyle = "#ffffff22"
    ctx.lineWidth = 1
    ctx.setLineDash([3, 5])
    ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.attackRange * s, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    const speed = Math.hypot(p.vx, p.vy)
    if (speed > 0) {
      ctx.strokeStyle = "#ffffff40"
      ctx.lineWidth = p.radius * s * 1.6
      ctx.lineCap = "round"
      ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(p.x - p.vx * 0.06), Y(p.y - p.vy * 0.06)); ctx.stroke()
      ctx.lineCap = "butt"
    }
    ctx.fillStyle = view.flow === "dead" ? "#ff5050" : "#f4f6ff"
    ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.radius * s, 0, Math.PI * 2); ctx.fill()
  }

  // Cuts.
  for (const c of view.slashes) {
    const t = c.age / 0.35
    ctx.strokeStyle = `rgba(255,255,255,${1 - t})`
    ctx.lineWidth = 3
    const len = (0.6 + t * 0.6) * s
    ctx.beginPath()
    ctx.moveTo(X(c.x) - Math.cos(c.angle + 0.8) * len, Y(c.y) - Math.sin(c.angle + 0.8) * len)
    ctx.lineTo(X(c.x) + Math.cos(c.angle + 0.8) * len, Y(c.y) + Math.sin(c.angle + 0.8) * len)
    ctx.stroke()
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
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 70, 0, Math.PI * 2); ctx.stroke()
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
