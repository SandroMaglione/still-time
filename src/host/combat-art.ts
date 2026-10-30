import type { EnemyView } from "../sim/view.ts"
import { posedSprite, sprite, type Sprite } from "./art.ts"
import type { Death, Impact } from "./fx.ts"
import { emitLight } from "./lighting.ts"
import { decorationHash, pixelArc, pixelLine, pixelPolygon, type Point } from "./pixels.ts"

const INK = "#171c2e", STEEL = "#c6d4df", IVORY = "#f4efda", GOLD = "#edc66c"
const clamp = (n: number): number => Math.max(0, Math.min(1, n))
const smooth = (n: number): number => { const t = clamp(n); return t * t * (3 - 2 * t) }
const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string): void => {
  ctx.fillStyle = colour; ctx.fillRect(Math.round(x), Math.round(y), w, h)
}
/** Every role has its own silhouette, including the three batch-2 bodies. */
const BODIES = {
  player: "player-body", gunner: "gunner-body", archer: "archer-body", thrower: "thrower-body", runner: "runner-body",
  brute: "brute-body", sniper: "sniper-body", knight: "knight-body", shield: "shield-body"
} as const satisfies Record<Death["kind"], Sprite>
export const bodyName = (kind: Death["kind"]): Sprite => BODIES[kind]

/** A compact rig: grip and cuff meet the torso, with the weapon layered around the hands. */
export const combatActor = (ctx: CanvasRenderingContext2D, enemy: EnemyView, ground: Point, fired: number): void => {
  const m = enemy.melee
  const flip = Math.cos(enemy.aim) < 0, side = flip ? -1 : 1
  const recoil = fired >= 0 && fired < 0.16 ? Math.sin(Math.PI * clamp(fired / 0.16)) : 0
  const windup = m?.phase === "windup" ? m.progress : 0
  const swinging = m?.phase === "swing"
  const lean = m?.phase === "stagger" ? (Math.floor(m.progress * 10) % 2 === 0 ? -2 : 2) : Math.round((swinging ? Math.sin(m.progress * Math.PI) * 2 : -windup) * side - Math.cos(enemy.aim) * recoil)
  const sink = m?.phase === "windup" ? 1 : 0
  const screenAngle = Math.atan2(Math.sin(enemy.aim) * 0.78, Math.cos(enemy.aim))
  let angle = screenAngle
  if (m !== null) angle += (m.phase === "windup" ? -1.5 * smooth(m.progress) : m.phase === "swing" ? -1.5 + 2.8 * smooth(m.progress) : m.phase === "recover" ? 1.3 * (1 - smooth(m.progress)) : 0.45) * side
  const follow = enemy.kind === "thrower" && fired >= 0 && fired < 0.15 ? Math.sin(fired / 0.15 * Math.PI) * 3 : 0
  const knifeRaise = enemy.kind === "thrower" && enemy.charge > 0.7 ? -3 : 0
  const hold = { x: ground.x + side * 5 - Math.cos(screenAngle) * recoil * 2 + lean + Math.cos(screenAngle) * follow, y: ground.y - 6 + sink - Math.sin(screenAngle) * recoil + knifeRaise + Math.sin(screenAngle) * follow }
  const point = (distance: number, across = 0): Point => ({ x: hold.x + Math.cos(angle) * distance - Math.sin(angle) * across, y: hold.y + Math.sin(angle) * distance + Math.cos(angle) * across })
  const stroke = (a: Point, b: Point, colour: string, width = 1): void => {
    pixelLine(ctx, a, b, INK, width + 2); pixelLine(ctx, a, b, colour, width)
  }
  const weapon = (): void => {
    if (enemy.kind === "runner") return
    if (m !== null) {
      stroke(point(-2), point(2), "#947058", 2)
      stroke(point(1, -3), point(1, 3), GOLD)
      stroke(point(2), point(11), STEEL, 2)
      pixelLine(ctx, point(3, -1), point(11, -1), IVORY)
      if (swinging) {
        // The blade is short; its fast crescent describes the sweep rather than a long rigid pole.
        const start = angle - 0.8 * side
        pixelArc(ctx, hold, 17, 13, start, angle, INK, 4)
        pixelArc(ctx, hold, 17, 13, start + 0.1 * side, angle, IVORY, 2)
        pixelArc(ctx, hold, 14, 10, start + 0.2 * side, angle - 0.1 * side, "#8996b0")
      }
    } else if (enemy.kind === "gunner" || enemy.kind === "sniper") {
      stroke(point(-3), point(2), "#947058", 3)
      // A sniper's barrel runs long.
      const barrel = enemy.kind === "sniper" ? 13 : 8
      stroke(point(1), point(barrel), "#465477", 2)
      pixelLine(ctx, point(2, -1), point(barrel, -1), STEEL)
      stroke(point(barrel, -1), point(barrel, 1), "#8996b0")
      if (enemy.kind === "sniper") {
        // A raised optic changes the rifle's silhouette at any aim angle.
        stroke(point(2, -3), point(7, -3), "#8996b0", 2)
        pixelLine(ctx, point(4, -2), point(4, 0), INK, 2)
        pixelLine(ctx, point(7, -3), point(7, -3), "#64b6b3", 2)
      }
      if (fired >= 0 && fired < 0.065) muzzle(ctx, point(barrel + 2), angle, fired / 0.065)
      if (fired >= 0 && fired < 0.22) {
        const casing = point(-1, -3)
        rect(ctx, casing.x - side * Math.round(fired * 12), casing.y - Math.round(Math.sin(fired / 0.22 * Math.PI) * 3), 2, 1, GOLD)
      }
    } else if (enemy.kind === "archer") {
      const bend = 0.8 + enemy.charge * 0.4
      let previous = point(4, -5)
      for (let i = 1; i <= 10; i++) {
        const a = -Math.PI / 2 + i / 10 * Math.PI
        const next = point(4 + Math.cos(a) * 3, Math.sin(a) * 5)
        stroke(previous, next, "#947058"); previous = next
      }
      const top = point(4, -5), bottom = point(4, 5), pull = point(1 - bend)
      pixelLine(ctx, top, pull, STEEL); pixelLine(ctx, pull, bottom, STEEL)
      if (fired < 0 || fired > 0.12) stroke(point(-1), point(7), IVORY)
    } else {
      if (fired < 0 || fired >= 0.15) stroke(point(0), point(5), STEEL, 2)
    }
    // Hands cover the grip; the short sleeve connects visibly to the torso.
    const sleeve = { x: ground.x + side * 3 + lean, y: ground.y - 5 + sink }
    pixelLine(ctx, sleeve, hold, INK, 4)
    pixelLine(ctx, sleeve, hold, m !== null ? "#8996b0" : enemy.kind === "archer" ? "#91a37b" : enemy.kind === "gunner" ? "#ce4655" : "#9a638e", 2)
    rect(ctx, hold.x - 1, hold.y - 1, 3, 3, m !== null ? STEEL : "#e3af86")
    if (enemy.kind === "gunner" || enemy.kind === "sniper") { const fore = point(3); rect(ctx, fore.x - 1, fore.y - 1, 2, 2, "#e3af86") }
  }
  sprite(ctx, "shadow", ground.x + 2, ground.y + 3)
  const behind = Math.sin(screenAngle) < -0.3
  const towerShield = (): void => {
    if (m?.shield !== true) return
    const front = screenAngle, guarding = m.guarding
    const cx = ground.x + Math.cos(front) * 7 + side * 2
    const cy = ground.y - 8 + Math.sin(front) * 3 + (guarding ? 0 : 5)
    const half = Math.round((4 + Math.abs(Math.sin(front)) * 8) / 2), tilt = Math.round(Math.cos(front) * 2)
    const shape = (inset: number): Array<Point> => [
      { x: cx - half + inset, y: cy - 10 + inset }, { x: cx + half - inset, y: cy - 10 + tilt + inset },
      { x: cx + half - inset, y: cy + 6 + tilt - inset }, { x: cx, y: cy + 10 - inset }, { x: cx - half + inset, y: cy + 6 - inset }
    ]
    pixelPolygon(ctx, shape(0), INK)
    pixelPolygon(ctx, shape(1), guarding ? STEEL : "#8996b0")
    pixelPolygon(ctx, shape(2), "#29334b")
    pixelLine(ctx, { x: cx, y: cy - 6 }, { x: cx, y: cy + 5 }, guarding ? GOLD : "#8996b0", 2)
    pixelLine(ctx, { x: cx - Math.max(1, half - 3), y: cy - 2 }, { x: cx + Math.max(1, half - 3), y: cy - 2 }, guarding ? GOLD : "#8996b0", 2)
    pixelLine(ctx, shape(1)[0]!, shape(1)[1]!, IVORY)
  }
  if (behind) weapon()
  if (behind) towerShield()
  posedSprite(ctx, bodyName(enemy.kind), ground.x, ground.y, { flip, lean, sink })
  if (!behind) weapon()
  if (!behind) towerShield()
  if (m?.phase === "stagger") {
    for (const sign of [-1, 1]) {
      const at = { x: ground.x + sign * 12, y: ground.y - 23 + Math.round(Math.sin(m.progress * 10 + sign) * 2) }
      pixelLine(ctx, { x: at.x - 2, y: at.y }, { x: at.x + 2, y: at.y }, INK, 3)
      pixelLine(ctx, { x: at.x, y: at.y - 2 }, { x: at.x, y: at.y + 2 }, INK, 3)
      pixelLine(ctx, { x: at.x - 2, y: at.y }, { x: at.x + 2, y: at.y }, GOLD)
      pixelLine(ctx, { x: at.x, y: at.y - 2 }, { x: at.x, y: at.y + 2 }, IVORY)
    }
  }
}

export const muzzle = (ctx: CanvasRenderingContext2D, at: Point, angle: number, progress: number): void => {
  // The flash lights the floor around the shooter for a moment.
  emitLight(ctx, { x: at.x, y: at.y + 6, radius: 2.6, colour: [255, 214, 140], intensity: 1 - progress, shadows: false, halo: { lift: 6, radius: 0.7, strength: 0.5 * (1 - progress) } })
  const length = progress < 0.5 ? 11 : 6
  const to = { x: at.x + Math.cos(angle) * length, y: at.y + Math.sin(angle) * length }
  pixelLine(ctx, at, to, INK, progress < 0.5 ? 9 : 6)
  pixelLine(ctx, at, to, "#ff6845", progress < 0.5 ? 7 : 4)
  pixelLine(ctx, at, to, GOLD, progress < 0.5 ? 5 : 2)
  pixelLine(ctx, at, { x: at.x + Math.cos(angle) * (length - 2), y: at.y + Math.sin(angle) * (length - 2) }, IVORY)
  for (const side of [-1, 1]) pixelLine(ctx, at, { x: at.x + Math.cos(angle + side * 0.8) * 4, y: at.y + Math.sin(angle + side * 0.8) * 4 }, GOLD)
}

/** A travelling cut edge reaches the actual attack boundary while the held blade stays compact. */
export const attackWave = (ctx: CanvasRenderingContext2D, enemy: EnemyView, centre: Point, rx: number, ry: number): void => {
  const m = enemy.melee
  if (m?.phase !== "swing") return
  const side = Math.cos(enemy.aim) < 0 ? -1 : 1
  const edge = enemy.aim + (m.progress * 2 - 1) * m.arc * side
  const tail = edge - 0.65 * side
  pixelArc(ctx, centre, rx, ry, tail, edge, INK, 4)
  pixelArc(ctx, centre, rx, ry, tail + 0.12 * side, edge, IVORY, 2)
  pixelArc(ctx, centre, rx - 3, ry - 2, tail + 0.25 * side, edge - 0.1 * side, STEEL)
}

/** Flash, recoil, a hinged fall, a brief floor pose, then clustered dissolution. */
export const dyingActor = (ctx: CanvasRenderingContext2D, death: Death, ground: Point, age: number): void => {
  const direction = Math.cos(death.angle) < 0 ? -1 : 1
  const fall = smooth((age - 0.12) / 0.32) * direction
  const dissolve = clamp((age - 0.58) / 0.43)
  const knock = Math.round(smooth(age / 0.2) * 4)
  if (age < 0.72) sprite(ctx, "shadow", ground.x + direction * (2 + Math.round(Math.abs(fall) * 9)), ground.y + 3)
  posedSprite(ctx, bodyName(death.kind), ground.x + direction * knock, ground.y + Math.round(Math.sin(clamp(age / 0.3) * Math.PI) * -3), {
    flip: Math.cos(death.aim) < 0, flash: age < 0.065, fall, dissolve, seed: death.id
  })
  if (age > 0.32 && age < 0.56) {
    const t = (age - 0.32) / 0.24
    pixelArc(ctx, { x: ground.x + direction * 11, y: ground.y + 2 }, 5 + t * 7, 2 + t * 3, 0, Math.PI * 2, "#899692", 1, true)
  }
  if (age > 0.56) {
    const tint = death.kind === "player" || death.kind === "shield" ? "#64b6b3" : death.kind === "runner" ? GOLD : death.kind === "thrower" || death.kind === "sniper" ? "#9a638e" : "#ce4655"
    for (let i = 0; i < 8; i++) {
      const hash = decorationHash(i, death.id, 1), t = clamp((age - 0.56 - (hash % 8) * 0.012) / 0.45)
      if (t <= 0 || t >= 1) continue
      const x = ground.x + direction * (4 + (hash % 17)) + Math.sin(i * 2.4) * t * 5
      const y = ground.y - 2 - t * (8 + hash % 11)
      rect(ctx, x, y, t < 0.5 ? 2 : 1, t < 0.5 ? 2 : 1, t < 0.25 ? IVORY : tint)
    }
  }
}

export const impactBurst = (ctx: CanvasRenderingContext2D, impact: Impact, at: Point, age: number): void => {
  const t = clamp(age / 0.4), strength = impact.kind === "stone" ? 6 : 11
  if (impact.kind === "cut" && age < 0.3) {
    const radius = 10 + t * 12
    pixelArc(ctx, at, radius, radius * 0.78, impact.angle - 1.1 + t, impact.angle + 0.8 + t, INK, age < 0.12 ? 4 : 2)
    pixelArc(ctx, at, radius, radius * 0.78, impact.angle - 1.0 + t, impact.angle + 0.8 + t, age < 0.12 ? IVORY : STEEL, age < 0.12 ? 2 : 1)
  }
  if (age < 0.09) {
    const radius = age < 0.045 ? 7 : 4
    for (const a of [0, Math.PI / 2]) {
      const start = { x: at.x - Math.cos(a) * radius, y: at.y - Math.sin(a) * radius }
      const end = { x: at.x + Math.cos(a) * radius, y: at.y + Math.sin(a) * radius }
      pixelLine(ctx, start, end, INK, 5)
      pixelLine(ctx, start, end, age < 0.045 ? IVORY : "#ff6845", 3)
    }
  }
  for (let i = 0; i < (impact.kind === "stone" ? 5 : 9); i++) {
    const seed = decorationHash(i, impact.seed, 3)
    const angle = impact.angle + (seed % 100 / 100 - 0.5) * 3.2
    const distance = (1 - (1 - t) * (1 - t)) * (strength + seed % 7)
    const x = at.x + Math.cos(angle) * distance
    const y = at.y + Math.sin(angle) * distance * 0.6 - Math.sin(t * Math.PI) * (3 + seed % 5)
    const colour = age < 0.1 ? IVORY : impact.kind === "player" ? "#64b6b3" : impact.kind === "stone" ? "#899692" : GOLD
    const size = age < 0.18 ? 3 : 2
    rect(ctx, x - 1, y - 1, size + 2, size + 2, INK)
    rect(ctx, x, y, size, size, age > 0.3 ? "#8996b0" : colour)
  }
}

/** Quantized flame tongues, drifting embers and low-contrast smoke, all in world time. */
export const torchFire = (ctx: CanvasRenderingContext2D, x: number, y: number, time: number, seed: number): void => {
  const frame = Math.floor(time * 14), wobble = Math.sin(frame * 1.7 + seed)
  // A warm pool on the floor below the flame, flickering with it.
  const flicker = Math.sin(frame * 0.7 + seed)
  emitLight(ctx, { x, y: y + 4, radius: 4.2 + flicker * 0.15, colour: [255, 170, 90], intensity: 1, halo: { lift: 20, radius: 1.3, strength: 0.28 + flicker * 0.03 } })
  rect(ctx, x - 3, y - 10, 7, 10, INK); rect(ctx, x - 2, y - 9, 5, 8, "#465253")
  rect(ctx, x - 1, y - 8, 2, 6, "#899692")
  rect(ctx, x - 5, y - 11, 11, 2, INK); rect(ctx, x - 4, y - 11, 9, 1, "#899692")
  for (let i = 0; i < 3; i++) {
    const t = ((time * 0.65 + i / 3 + (seed % 13) / 13) % 1 + 1) % 1
    if (t > 0.85) continue
    rect(ctx, x + Math.sin(i * 2 + t * 4) * 3 + t * 3, y - 20 - t * 13, 2 + Math.floor(t * 2), 1, "#647373")
  }
  for (let column = -3; column <= 3; column++) {
    const height = Math.round(5 + (1 - Math.abs(column) / 4) * 6 + Math.sin(frame * 0.9 + column * 2 + seed) * 2)
    rect(ctx, x + column + Math.round(wobble), y - 12 - height, 1, height, column < -1 ? "#e98a49" : GOLD)
  }
  rect(ctx, x - 1, y - 17, 3, 5, IVORY)
  rect(ctx, x + Math.round(wobble), y - 20, 1, 4, IVORY)
  for (let i = 0; i < 3; i++) {
    const t = ((time * 1.4 + i * 0.31 + seed * 0.17) % 1 + 1) % 1
    if (t > 0.8) continue
    rect(ctx, x + Math.sin(i + t * 4) * (2 + t * 4), y - 20 - t * 15, 1, t < 0.3 ? 2 : 1, t < 0.35 ? GOLD : "#e98a49")
  }
}
