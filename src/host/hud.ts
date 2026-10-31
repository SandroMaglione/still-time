/**
 * The page's heads-up display over the canvas, in DOM and CSS (cheap next to
 * canvas draws): the clock against par, the pressing order of numbered
 * plates, the room's goal (live: how many are left to cut, or the exit), the
 * room's tip (its number and name, then its hint; it fades once you move),
 * and the messages (a hit, a clear with its stars, the run's end).
 * Every size is a whole number of UI pixels (`--u`), so the pixel font and
 * borders stay crisp.
 */
import type { FightView, HitBy, PlateView, ResultView } from "../sim/view.ts"
import { CLEAR_PANEL_AT, starPopAt, type Presentation } from "./fx.ts"
import { ICONS, fromHtml, pixelSvg, star } from "./ui-pixels.ts"

/** Seconds a tip stays up at most, and the world seconds of moving that dismiss it. */
const TIP_SECONDS = 7
const TIP_MOVED = 0.25

/** The ordered plates in pressing order (door by door), or none: an unordered plate needs no count. */
const orderedPlates = (view: FightView): Array<PlateView> =>
  view.plates.filter((p) => p.order !== null).sort((a, b) => a.door - b.door || (a.order ?? 0) - (b.order ?? 0))

const byId = (id: string): HTMLElement => {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`Still Time: #${id} missing`)
  return found
}

/**
 * One UI pixel in CSS px: a whole number of device pixels, about 2 CSS px on
 * a phone, up to 3 on a big screen.
 */
export const uiPixel = (): number => {
  const dpr = window.devicePixelRatio || 1
  const css = Math.max(1.5, Math.min(3, Math.min(window.innerWidth, window.innerHeight) / 195))
  return Math.max(2, Math.round(css * dpr)) / dpr
}

/** The small UI pixel for sub-labels (the `t0` type step): about ¾ of a UI pixel, still a whole number of device pixels. */
export const smallUiPixel = (): number => {
  const dpr = window.devicePixelRatio || 1
  return Math.max(1, Math.floor((Math.round(uiPixel() * dpr) * 3) / 4)) / dpr
}

type Message =
  | { readonly kind: "none" }
  | { readonly kind: "dead"; readonly canRetry: boolean; readonly by: HitBy | null }
  | { readonly kind: "cleared" | "won"; readonly view: FightView }

/**
 * What the hit screen says, by what hit you: the rule, named at the one moment it is read. (A player who dies without
 * knowing the rule dies again the same way; the hit screen is the most-read screen in the game.)
 */
const LESSON: Record<HitBy, readonly [string, string]> = {
  shot: ["you were moving. so was it.", "stand still: it stops. then step aside"],
  swing: ["you were moving. so was it.", "stand still: read its reach. step off the line, then cut in"],
  hazard: ["you were moving. so was it.", "stand still: it stops. find the gap, then go"],
  blast: ["the fuse burns while you move.", "stand still: read its ring, then get out of it"],
  touch: ["it creeps while you stand still.", "no hesitating near it: rush it at full speed"]
}

/** How long (real s) the clear panel's time takes to count up. */
const COUNT_UP = 0.6

/** The HUD over each page canvas (other canvases, such as review renders, get no messages). */
const huds = new WeakMap<object, Hud>()

/**
 * The messages, called at the end of `draw`: a hit once the fall has shown,
 * a clear once the last enemy has started to fall.
 */
export const messages = (ctx: CanvasRenderingContext2D, view: FightView, presentation: Presentation | null): void => {
  const active = huds.get(ctx.canvas)
  if (active === undefined) return
  // A cutscene has no messages: it carries on (or starts over) by itself.
  if (view.room.scene) { active.message({ kind: "none" }); return }
  const deathAge = presentation?.playerDeathAge ?? -1
  if (view.flow === "dead" && (presentation === null || deathAge >= 0.52)) active.message({ kind: "dead", canRetry: view.canRetry, by: view.death?.by ?? null })
  else if (view.result !== null && (view.flow === "cleared" || view.flow === "won") && (presentation === null || presentation.clearAge < 0 || presentation.clearAge >= CLEAR_PANEL_AT)) active.message({ kind: view.flow, view })
  else active.message({ kind: "none" })
}

export class Hud {
  private readonly root = byId("hud")
  private readonly room = byId("room")
  private readonly clock = byId("clock")
  private readonly clockPanel = byId("clock-panel")
  private readonly clockSub = byId("clock-sub")
  private readonly goalPanel = byId("goal-panel")
  private readonly goal = byId("goal")
  private readonly platesRow = byId("plates-row")
  private readonly plates = byId("plates")
  private readonly pips = byId("pips")
  private readonly tip = byId("tip")
  private readonly msg = byId("message")
  private readonly msgTitle = byId("msg-title")
  private readonly msgStars = byId("msg-stars")
  private readonly msgLines = byId("msg-lines")
  private readonly msgCta = byId("msg-cta")
  private readonly after = byId("msg-buttons")
  private text = new Map<HTMLElement, string>()
  private now = 0
  private attempt = ""
  /** The cleared attempt's real seconds standing still and moving (see `setAttemptTimes`). */
  private times: { readonly still: number; readonly moving: number } | null = null
  private tipAt = 0
  private messageKey = ""
  /** This room's best as the attempt began (the clear panel compares against it: the save already holds the new one). */
  private bestBefore: ResultView | null = null
  /** The clear panel's time, counting up from zero to the time you took. */
  private countUp: { readonly node: HTMLElement; readonly to: number; readonly from: number } | null = null

  constructor(canvas: HTMLCanvasElement) {
    huds.set(canvas, this)
    byId("pause").replaceChildren(fromHtml(pixelSvg(ICONS.menu, { outline: true })))
    byId("restart").replaceChildren(fromHtml(pixelSvg(ICONS.restart, { outline: true })))
    const resize = (): void => {
      document.documentElement.style.setProperty("--u", `${uiPixel()}px`)
      document.documentElement.style.setProperty("--us", `${smallUiPixel()}px`)
    }
    window.addEventListener("resize", resize)
    resize()
  }

  /** Sets text only when it changed: the DOM is touched a few times a second, not every frame. */
  private set(node: HTMLElement, value: string): void {
    if (this.text.get(node) === value) return
    this.text.set(node, value)
    node.textContent = value
  }

  /** The attempt just cleared: real seconds standing still and moving, for the clear card. */
  setAttemptTimes(still: number, moving: number): void {
    this.times = { still, moving }
  }

  update(view: FightView, seconds: number): void {
    this.now += seconds
    if (this.countUp !== null) {
      const k = Math.min(1, (this.now - this.countUp.from) / COUNT_UP)
      this.set(this.countUp.node, `${(this.countUp.to * (1 - (1 - k) ** 3)).toFixed(1)}s`)
      if (k >= 1) this.countUp = null
    }
    this.root.classList.toggle("ended", view.flow !== "playing")
    // The room's name and the hits taken in it, for screen readers and the screenshot scripts that wait on it (not shown:
    // the name shows in the tip as an attempt starts).
    this.set(this.room, view.room.name + (view.hits > 0 ? ` ✕${view.hits}` : ""))
    // The attempt's clock in world seconds against par: it only runs while you move.
    const goal = view.room.goal
    this.set(this.clock, view.world.toFixed(1))
    this.set(this.clockSub, `/${view.room.par}s`)
    this.clockPanel.classList.toggle("over", view.world > view.room.par)
    // The goal, live: how many are left to cut, or the exit.
    const standing = view.enemies.length
    this.set(this.goal, goal.kind === "exit" ? "reach the exit" : standing === 0 ? "all down" : `cut ${standing} more`)
    this.goalPanel.classList.toggle("done", goal.kind === "clear" && standing === 0)

    // Numbered plates: which are pressed and which comes next (the plates themselves can be off screen).
    const ordered = orderedPlates(view)
    const next = ordered.findIndex((p) => !p.down)
    const pips = ordered.map((p, i) => (p.down ? "d" : i === next ? "n" : "u")).join("")
    this.platesRow.hidden = ordered.length === 0
    this.plates.classList.toggle("missed", ordered.some((p) => p.missed))
    if (this.text.get(this.pips) !== pips) {
      this.text.set(this.pips, pips)
      this.pips.replaceChildren(...ordered.map((p, i) => {
        const pip = document.createElement("i")
        pip.className = p.down ? "pip down" : i === next ? "pip next" : "pip"
        pip.textContent = String(p.order)
        return pip
      }))
    }

    // The tip: up on every new attempt, gone once you move or after a few seconds.
    const attempt = `${view.room.index}:${view.player?.id ?? -1}`
    if (attempt !== this.attempt && view.flow === "playing") {
      this.attempt = attempt
      this.bestBefore = view.best[view.room.index] ?? null
      this.tipAt = this.now
      this.tip.replaceChildren(this.tipContent(view))
    }
    const showTip = view.flow === "playing" && view.world < TIP_MOVED && this.now - this.tipAt < TIP_SECONDS
    this.tip.classList.toggle("shown", showTip)
  }

  private tipContent(view: FightView): DocumentFragment {
    const frag = document.createDocumentFragment()
    const line = (cls: string, text: string): void => {
      const span = document.createElement("span")
      span.className = cls
      span.textContent = text
      frag.append(span)
    }
    line("tip-room", `${view.room.index + 1} · ${view.room.name}`)
    // (The goal is in the top bar, live.)
    if (view.room.tip !== null) line("tip-text", view.room.tip)
    // (The first rooms' how-to is the guide's caption over the scene, see `guide.ts`.)
    return frag
  }

  message(m: Message): void {
    const key = m.kind === "none" ? "none" : m.kind === "dead" ? `dead:${m.canRetry}:${m.by}` : `${m.kind}:${m.view.room.index}:${m.view.result?.stars}:${m.view.result?.world}`
    if (key === this.messageKey) return
    this.messageKey = key
    this.msg.className = `message panel ${m.kind}`
    this.msg.hidden = m.kind === "none"
    this.after.hidden = m.kind !== "cleared" && m.kind !== "won"
    this.msgStars.replaceChildren()
    this.msgLines.replaceChildren()
    this.countUp = null
    if (m.kind === "none") return
    if (m.kind === "dead") {
      this.msgTitle.textContent = "hit"
      // What the rule was, named: the shot that took you hangs frozen on the scene behind this.
      const lesson = m.by === null ? null : LESSON[m.by]
      if (lesson !== null) {
        this.msgLines.append(Object.assign(document.createElement("span"), { className: "line lesson", textContent: lesson[0] }))
        this.msgLines.append(Object.assign(document.createElement("span"), { className: "line lesson dim small", textContent: lesson[1] }))
      }
      this.set(this.msgCta, m.canRetry ? "tap to retry" : "")
      return
    }
    const view = m.view, result = view.result!
    const won = m.kind === "won"
    this.msgTitle.textContent = won ? "all rooms clear" : "clear"
    for (let i = 0; i < 3; i++) {
      const s = fromHtml(star(i < result.stars, won ? 4 : 3, "pop"))
      ;(s as SVGElement).style.animationDelay = `${(starPopAt(i) - CLEAR_PANEL_AT).toFixed(2)}s`
      this.msgStars.append(s)
    }
    const add = (cls: string, text: string): HTMLElement => {
      const span = document.createElement("span")
      span.className = cls
      span.textContent = text
      this.msgLines.append(span)
      return span
    }
    const small = (text: string): HTMLElement => Object.assign(document.createElement("span"), { className: "dim small", textContent: text })
    {
      const over = result.world > view.room.par
      // The time counts up as the stars pop in.
      const time = Object.assign(document.createElement("span"), { textContent: "0.0s" })
      this.text.set(time, "0.0s")
      add(over ? "line over" : "line", "").append(time, small(`/ par ${view.room.par}s`))
      this.countUp = { node: time, to: result.world, from: this.now }
    }
    // How you spent it: the real seconds you stood still (looking, the world frozen) and the ones you moved.
    if (this.times !== null) {
      const t = this.times
      add("line dim small", `${t.still.toFixed(1)}s standing still · ${t.moving.toFixed(1)}s moving`)
    }
    // Against your best before this clear: a new best says so; otherwise the best to beat.
    const before = this.bestBefore
    if (before !== null) {
      const better = result.stars > before.stars || result.world < before.world - 0.05
      if (better) add("line best", "new best!").style.animationDelay = `${COUNT_UP.toFixed(2)}s`
      else add("line dim small", `best ${before.world.toFixed(1)}s`)
    }
    if (won) {
      const stars = view.best.reduce((n, b) => n + (b?.stars ?? 0), 0)
      const total = add("line", ` ${stars}/${view.best.length * 3}`)
      total.prepend(fromHtml(star(true)))
      add("line dim small", `${view.deaths} ${view.deaths === 1 ? "death" : "deaths"}`)
    }
    this.set(this.msgCta, won ? "tap to go again" : "tap for next room")
  }
}
