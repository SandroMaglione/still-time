import type { BombView, EnemyView } from "../sim/view.ts"
import { posedSprite, sprite, type Sprite } from "./art.ts"
import { SPLINTER_LIFE, type Death, type Impact, type Splinter } from "./fx.ts"
import { emitLight } from "./lighting.ts"
import { feelSettings } from "./feel.ts"
import { decorationHash, pixelArc, pixelLine, pixelPolygon, type Point } from "./pixels.ts"
import type { Projection } from "./room-art.ts"

const INK = "#171c2e", STEEL = "#c6d4df", IVORY = "#f4efda", GOLD = "#edc66c"
const clamp = (n: number): number => Math.max(0, Math.min(1, n))
const smooth = (n: number): number => { const t = clamp(n); return t * t * (3 - 2 * t) }
const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string): void => {
  ctx.fillStyle = colour; ctx.fillRect(Math.round(x), Math.round(y), w, h)
}
/** Every role has its own silhouette, including the three batch-2 bodies. */
const BODIES = {
  player: "player-body", gunner: "gunner-body", archer: "archer-body", thrower: "thrower-body", runner: "runner-body",
  brute: "brute-body", sniper: "sniper-body", shield: "shield-body", grenadier: "grenadier-body",
  clockwork: "clockwork-body", stalker: "stalker-body"
} as const satisfies Record<Death["kind"], Sprite>
export const bodyName = (kind: Death["kind"]): Sprite => BODIES[kind]

/** A compact rig: grip and cuff meet the torso, with the weapon layered around the hands. */
/**
 * The clockwork's dial, floating over it: twelve ticks and a hand sweeping round as its next burst charges (`charge`
 * 0 to 1), on its own real-time clock; the face reddens as the hand comes round to twelve. Centred on (x, y).
 */
const clockFace = (ctx: CanvasRenderingContext2D, x: number, y: number, charge: number): void => {
  const cx = Math.round(x), cy = Math.round(y), hot = charge > 0.8
  pixelArc(ctx, { x: cx, y: cy }, 7, 7, 0, Math.PI * 2, INK, 3)
  pixelArc(ctx, { x: cx, y: cy }, 6, 6, 0, Math.PI * 2, hot ? "#ff4055" : GOLD, 1)
  for (let r = 5; r > 0; r--) pixelArc(ctx, { x: cx, y: cy }, r, r, 0, Math.PI * 2, hot ? "#f4c3b8" : IVORY, 1)
  for (let i = 0; i < 12; i += 3) {
    const a = (i / 12) * Math.PI * 2
    rect(ctx, cx + Math.round(Math.cos(a) * 4), cy + Math.round(Math.sin(a) * 4), 1, 1, INK)
  }
  const a = -Math.PI / 2 + Math.max(0, Math.min(1, charge)) * Math.PI * 2
  pixelLine(ctx, { x: cx, y: cy }, { x: cx + Math.cos(a) * 4, y: cy + Math.sin(a) * 4 }, hot ? "#ce4655" : INK, 1)
  rect(ctx, cx, cy, 1, 1, INK)
}

export const combatActor = (ctx: CanvasRenderingContext2D, enemy: EnemyView, ground: Point, fired: number): void => {
  const m = enemy.melee
  const flip = Math.cos(enemy.aim) < 0, side = flip ? -1 : 1
  const recoil = fired >= 0 && fired < 0.16 ? Math.sin(Math.PI * clamp(fired / 0.16)) : 0
  const windup = m?.phase === "windup" ? m.progress : 0
  const swinging = m?.phase === "swing"
  const lunge = enemy.kind === "brute" ? (swinging ? 3 : m?.phase === "windup" ? -2 * smooth(m.progress * 1.4) : 0) : null
  const lean = Math.round((lunge !== null ? lunge * Math.cos(enemy.aim) : (swinging ? Math.sin(m.progress * Math.PI) * 2 : -windup) * side) - Math.cos(enemy.aim) * recoil)
  const sink = m?.phase === "windup" ? 1 : 0
  const screenAngle = Math.atan2(Math.sin(enemy.aim) * 0.78, Math.cos(enemy.aim))
  // The spearman's spear points where it faces (no sweep): it thrusts along the line instead.
  const spear = enemy.kind === "brute"
  let angle = screenAngle
  if (m !== null && !spear) angle += (m.phase === "windup" ? -1.5 * smooth(m.progress) : m.phase === "swing" ? -1.5 + 2.8 * smooth(m.progress) : m.phase === "recover" ? 1.3 * (1 - smooth(m.progress)) : 0.45) * side
  const follow = enemy.kind === "thrower" && fired >= 0 && fired < 0.15 ? Math.sin(fired / 0.15 * Math.PI) * 3 : 0
  const knifeRaise = enemy.kind === "thrower" && enemy.charge > 0.7 ? -3 : 0
  const hold = { x: ground.x + side * 5 - Math.cos(screenAngle) * recoil * 2 + lean + Math.cos(screenAngle) * follow, y: ground.y - 6 + sink - Math.sin(screenAngle) * recoil + knifeRaise + Math.sin(screenAngle) * follow }
  const point = (distance: number, across = 0): Point => ({ x: hold.x + Math.cos(angle) * distance - Math.sin(angle) * across, y: hold.y + Math.sin(angle) * distance + Math.cos(angle) * across })
  const stroke = (a: Point, b: Point, colour: string, width = 1): void => {
    pixelLine(ctx, a, b, INK, width + 2); pixelLine(ctx, a, b, colour, width)
  }
  const weapon = (): void => {
    if (enemy.kind === "runner" || enemy.kind === "stalker") return
    if (enemy.kind === "clockwork") { clockFace(ctx, ground.x, ground.y - 30, enemy.charge); return }
    if (m !== null && spear) {
      // A long spear along its facing: drawn back in the wind-up, driven forward in the thrust, eased back after.
      // The load: drawn far back (easing in, so it settles back and holds there); the thrust: snapping out past full
      // length at once (ease-out); the recovery: hauled slowly back to guard.
      const out = (k: number): number => 1 - (1 - clamp(k)) ** 3
      const t = m.phase === "windup" ? -9 * smooth(m.progress * 1.4) : m.phase === "swing" ? -9 + 27 * out(m.progress * 1.6) : m.phase === "recover" ? 18 * (1 - smooth(m.progress)) : 0
      stroke(point(-9 + t), point(17 + t), "#947058", 1)
      stroke(point(16 + t, -2), point(16 + t, 2), STEEL)
      stroke(point(17 + t), point(23 + t), STEEL, 2)
      pixelLine(ctx, point(18 + t, -1), point(23 + t, 0), IVORY)
      pixelLine(ctx, point(-7 + t, 1), point(-5 + t, 1), "#ce4655", 2)
    } else if (m !== null) {
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
    } else if (enemy.kind === "grenadier") {
      // A round charge in hand, gone for a moment after the throw; its fuse sparks as the next throw nears.
      if (fired < 0 || fired > 0.3) {
        const at = point(3)
        const lit = enemy.charge > 0.6
        sprite(ctx, lit ? Math.floor(enemy.charge * 20) % 2 === 0 ? "bomb-0" : "bomb-1" : "bomb-idle", at.x, at.y + 6)
        if (lit) emitLight(ctx, { x: ground.x, y: ground.y, radius: 0.8, colour: [255, 190, 110], intensity: 0.4, shadows: false })
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
    pixelLine(ctx, sleeve, hold, m !== null ? "#8996b0" : enemy.kind === "archer" ? "#91a37b" : enemy.kind === "gunner" ? "#ce4655" : enemy.kind === "grenadier" ? "#e98a49" : "#9a638e", 2)
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
  if (enemy.kind === "stalker") {
    // These native eye pixels line up with draw.ts's existing eye light at ground.y - 14.
    ctx.save(); ctx.translate(Math.round(ground.x), Math.round(ground.y))
    if (flip) ctx.scale(-1, 1)
    ctx.fillStyle = enemy.charge < 0.35 ? "#465477" : enemy.charge < 0.75 ? "#64b6b3" : "#91c69b"
    ctx.fillRect(-3, -14, 2, 1); ctx.fillRect(2, -14, 2, 1)
    ctx.restore()
  }
  if (!behind) weapon()
  if (!behind) towerShield()
}

/** Native bomb and a two-frame fuse; blast reach/fuse telegraphs remain owned by draw.ts. */
export const bombActor = (ctx: CanvasRenderingContext2D, P: Projection, bomb: BombView, world: number): void => {
  const ground = P(bomb.x, bomb.y), at = P(bomb.x, bomb.y, bomb.target !== null ? 0.7 : 0.15)
  sprite(ctx, "shadow", ground.x + 1, ground.y + 3)
  sprite(ctx, Math.floor(world * (bomb.fuse < 0.3 ? 24 : 10)) % 2 === 0 ? "bomb-0" : "bomb-1", at.x, at.y + 5)
  emitLight(ctx, { x: ground.x, y: ground.y, radius: 1.2, colour: [255, 190, 110], intensity: bomb.target !== null ? 0.35 : 0.7, shadows: false, halo: { lift: Math.round(ground.y - at.y + 10), radius: 0.4, strength: 0.18 } })
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
  if (enemy.kind === "brute") {
    // The spear's thrust: a straight streak out to its full reach.
    const end = { x: centre.x + Math.cos(enemy.aim) * rx, y: centre.y + Math.sin(enemy.aim) * ry }
    const from = { x: centre.x + (end.x - centre.x) * 0.25 * m.progress, y: centre.y + (end.y - centre.y) * 0.25 * m.progress }
    pixelLine(ctx, from, end, INK, 4)
    pixelLine(ctx, from, end, IVORY, 2)
    return
  }
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
    flip: Math.cos(death.aim) < 0, flash: age < 0.065 && feelSettings().flash, fall, dissolve, seed: death.id
  })
  if (age > 0.32 && age < 0.56) {
    const t = (age - 0.32) / 0.24
    pixelArc(ctx, { x: ground.x + direction * 11, y: ground.y + 2 }, 5 + t * 7, 2 + t * 3, 0, Math.PI * 2, "#899692", 1, true)
  }
  if (age > 0.56) {
    const tint = death.kind === "player" || death.kind === "shield" ? "#64b6b3" : death.kind === "runner" || death.kind === "grenadier" || death.kind === "clockwork" ? GOLD : death.kind === "stalker" ? "#9a638e" : death.kind === "thrower" || death.kind === "sniper" ? "#9a638e" : "#ce4655"
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

const WOOD = "#8b6b50", WOOD_DARK = "#5d493d", WOOD_LIGHT = "#b19b73", DUST = "#899692"

/**
 * A crate bursting (`age` in real s, up to SPLINTER_LIFE): a white flash of its box, then planks and splinters
 * thrown up and out the way the blow went, falling back to the floor, and a puff of dust. (`light`: whether it lights
 * the room, once per burst however many layers it is painted on.)
 */
export const crateBurst = (ctx: CanvasRenderingContext2D, P: Projection, s: Splinter, height: number, age: number, light = true): void => {
  const mx = s.x + s.w / 2, my = s.y + s.h / 2
  const t = clamp(age / SPLINTER_LIFE)
  // The box itself, for a blink: a flash, then its outline blowing apart.
  if (age < 0.08 && feelSettings().flash) {
    const a = P(s.x, s.y, height), b = P(s.x + s.w, s.y + s.h)
    rect(ctx, a.x - 1, a.y - 1, b.x - a.x + 2, b.y - a.y + 2, INK)
    rect(ctx, a.x, a.y, b.x - a.x, b.y - a.y, age < 0.04 ? IVORY : WOOD_LIGHT)
  }
  if (light && age < 0.06) emitLight(ctx, { ...P(mx, my, height / 2), radius: 2.4, colour: [255, 214, 150], intensity: 0.9 })
  // Dust: low rings spreading on the floor, fading.
  if (t < 0.7) {
    const d = t / 0.7, ground = P(mx, my)
    for (let i = 0; i < 6; i++) {
      const seed = decorationHash(i, s.seed, 7), a = (i / 6) * Math.PI * 2 + (seed % 10) / 10
      const r = (6 + (seed % 5)) + d * (14 + (seed % 9))
      const size = Math.max(1, Math.round((1 - d) * 5))
      rect(ctx, ground.x + Math.cos(a) * r - size / 2, ground.y + Math.sin(a) * r * 0.55 - size / 2 - d * 4, size, size, DUST)
    }
  }
  // Planks and splinters: thrown up and out (mostly the blow's way), spinning, falling back to the floor.
  for (let i = 0; i < 14; i++) {
    const seed = decorationHash(i, s.seed, 5)
    const a = s.angle + ((seed % 100) / 100 - 0.5) * (i < 9 ? 2.2 : 6.2)
    const reach = 0.6 + (seed % 9) / 8
    const fly = 1 - (1 - t) * (1 - t)
    const x = mx + Math.cos(a) * reach * fly, y = my + Math.sin(a) * reach * fly
    const z = Math.max(0, height * 0.6 + Math.sin(Math.min(1, t * 1.6) * Math.PI) * (0.5 + (seed % 5) / 6) - t * height * 0.6)
    const at = P(x, y, z)
    const plank = i % 3 === 0
    const spin = Math.floor(t * (8 + seed % 6) + seed) % 2 === 0
    const w = plank ? (spin ? 7 : 3) : 2, h = plank ? (spin ? 2 : 5) : 2
    rect(ctx, at.x - w / 2 - 1, at.y - h / 2 - 1, w + 2, h + 2, INK)
    rect(ctx, at.x - w / 2, at.y - h / 2, w, h, age < 0.07 ? IVORY : seed % 2 === 0 ? WOOD : WOOD_LIGHT)
  }
}

/** What a burst crate leaves on the floor: broken planks and chips where it stood, scattered the way it went. */
export const crateWreck = (ctx: CanvasRenderingContext2D, P: Projection, s: Splinter): void => {
  const mx = s.x + s.w / 2, my = s.y + s.h / 2
  for (let i = 0; i < 12; i++) {
    const seed = decorationHash(i, s.seed, 11)
    const a = s.angle + ((seed % 100) / 100 - 0.5) * (i < 5 ? 2.2 : 6.2)
    const reach = (0.2 + (seed % 9) / 9) * (i < 5 ? 1.5 : 0.8)
    const at = P(mx + Math.cos(a) * reach, my + Math.sin(a) * reach)
    const plank = i % 2 === 0
    const w = plank ? (seed % 3 === 0 ? 3 : 10) : 3, h = plank ? (seed % 3 === 0 ? 7 : 3) : 2
    rect(ctx, at.x - w / 2 - 1, at.y - h / 2 - 1, w + 2, h + 2, INK)
    rect(ctx, at.x - w / 2, at.y - h / 2, w, h, seed % 2 === 0 ? WOOD : WOOD_LIGHT)
    if (plank && w > h) rect(ctx, at.x - w / 2, at.y + h / 2 - 1, w, 1, WOOD_DARK)
  }
}
