/**
 * The page's heads-up display over the canvas, in DOM and CSS (cheap next to
 * canvas draws): the room plate, the clock against par (or, in a survive
 * room, the world seconds left to hold out), the time-freeze gauge (how fast
 * the world runs right now), the pressing order of numbered plates, the
 * room's tip (it fades once you move), and the messages (a hit, a clear with
 * its stars, the run's end).
 * Every size is a whole number of UI pixels (`--u`), so the pixel font and
 * borders stay crisp.
 */
import type { FightView, PlateView } from "../sim/view.ts"
import { CLEAR_PANEL_AT, starPopAt, type Presentation } from "./fx.ts"
import { ICONS, fromHtml, hourglass, pixelSvg, star } from "./ui-pixels.ts"

const CELLS = 10
/** The gauge from frozen to full speed: ice, the player's teal, gold, then hot. */
const CELL_COLOURS = ["#8fb8de", "#8fb8de", "#64b6b3", "#64b6b3", "#91c69b", "#edc66c", "#edc66c", "#e98a49", "#e98a49", "#ce4655"]
/** Seconds a tip stays up at most, and the world seconds of moving that dismiss it. */
const TIP_SECONDS = 7
const TIP_MOVED = 0.25
/** World seconds left in a survive room when the countdown turns gold. */
const CLOSING = 3

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
  | { readonly kind: "dead"; readonly canRetry: boolean }
  | { readonly kind: "cleared" | "won"; readonly view: FightView }

/** The HUD over each page canvas (other canvases, such as review renders, get no messages). */
const huds = new WeakMap<object, Hud>()

/**
 * The messages, called at the end of `draw`: a hit once the fall has shown,
 * a clear once the last enemy has started to fall.
 */
export const messages = (ctx: CanvasRenderingContext2D, view: FightView, presentation: Presentation | null): void => {
  const active = huds.get(ctx.canvas)
  if (active === undefined) return
  const deathAge = presentation?.playerDeathAge ?? -1
  if (view.flow === "dead" && (presentation === null || deathAge >= 0.52)) active.message({ kind: "dead", canRetry: view.canRetry })
  else if (view.result !== null && (view.flow === "cleared" || view.flow === "won") && (presentation === null || presentation.clearAge < 0 || presentation.clearAge >= CLEAR_PANEL_AT)) active.message({ kind: view.flow, view })
  else active.message({ kind: "none" })
}

export class Hud {
  private readonly root = byId("hud")
  private readonly roomIndex = byId("room-index")
  private readonly room = byId("room")
  private readonly clock = byId("clock")
  private readonly clockPanel = byId("clock-panel")
  private readonly clockSub = byId("clock-sub")
  private readonly platesRow = byId("plates-row")
  private readonly plates = byId("plates")
  private readonly pips = byId("pips")
  private readonly pace = byId("pace")
  private readonly gauge = byId("gauge")
  private readonly glass = byId("glass")
  private readonly tip = byId("tip")
  private readonly msg = byId("message")
  private readonly msgTitle = byId("msg-title")
  private readonly msgStars = byId("msg-stars")
  private readonly msgLines = byId("msg-lines")
  private readonly msgCta = byId("msg-cta")
  private readonly after = byId("msg-buttons")
  private readonly cells: Array<HTMLElement> = []
  private text = new Map<HTMLElement, string>()
  private lit = -1
  private glassFrame = -1
  private now = 0
  private attempt = ""
  private tipAt = 0
  private messageKey = ""

  constructor(canvas: HTMLCanvasElement) {
    huds.set(canvas, this)
    for (let i = 0; i < CELLS; i++) {
      const cell = document.createElement("i")
      cell.style.setProperty("--c", CELL_COLOURS[i] ?? "#edc66c")
      this.cells.push(cell)
      this.gauge.append(cell)
    }
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

  update(view: FightView, seconds: number): void {
    this.now += seconds
    this.root.classList.toggle("ended", view.flow !== "playing")
    this.set(this.roomIndex, `${view.room.index + 1}`)
    // The name, then the hits taken in this room (✕ is kept for scripts that wait on it; a pixel cross shows instead).
    const hits = view.hits > 0 ? ` ✕${view.hits}` : ""
    if (this.text.get(this.room) !== view.room.name + hits) {
      this.text.set(this.room, view.room.name + hits)
      this.room.replaceChildren(view.room.name)
      if (view.hits > 0) {
        const tag = document.createElement("span")
        tag.className = "hits"
        tag.append(fromHtml(pixelSvg(ICONS.hit, { outline: true })), Object.assign(document.createElement("span"), { className: "sr", textContent: "✕" }), String(view.hits))
        this.room.append(" ", tag)
      }
    }
    // The attempt's clock in world seconds against par: it only runs while you move. A survive room counts down instead.
    const goal = view.room.goal
    const left = goal.kind === "survive" ? Math.max(0, goal.seconds - view.world) : 0
    this.set(this.clock, goal.kind === "survive" ? left.toFixed(1) : view.world.toFixed(1))
    this.set(this.clockSub, goal.kind === "survive" ? "survive" : `/${view.room.par}s`)
    this.clockPanel.classList.toggle("survive", goal.kind === "survive")
    this.clockPanel.classList.toggle("closing", goal.kind === "survive" && left <= CLOSING)
    this.clockPanel.classList.toggle("over", goal.kind !== "survive" && view.world > view.room.par)

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

    // How fast the world runs: from frozen (still) to full speed (full push).
    const t = Math.max(0, Math.min(1, (view.scale - view.slow) / Math.max(1e-6, 1 - view.slow)))
    const lit = t < 0.02 ? 0 : Math.max(1, Math.round(t * CELLS))
    if (lit !== this.lit) {
      this.lit = lit
      this.cells.forEach((c, i) => c.classList.toggle("on", i < lit))
      this.root.classList.toggle("frozen", lit === 0)
      this.root.classList.toggle("fast", lit >= CELLS - 1)
    }
    this.set(this.pace, `×${view.scale < 0.995 ? view.scale.toFixed(2) : "1"}`)
    // The hourglass settles while frozen and trickles while time runs, faster the faster it runs.
    const frame = lit === 0 ? 2 : Math.floor(this.now * (2 + t * 10)) % 2
    if (frame !== this.glassFrame) {
      this.glassFrame = frame
      this.glass.replaceChildren(fromHtml(hourglass(frame as 0 | 1 | 2)))
    }

    // The tip: up on every new attempt, gone once you move or after a few seconds.
    const attempt = `${view.room.index}:${view.player?.id ?? -1}`
    if (attempt !== this.attempt && view.flow === "playing") {
      this.attempt = attempt
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
    const goal = view.room.goal
    line("tip-goal", goal.kind === "exit" ? "reach the exit" : goal.kind === "survive" ? `survive ${goal.seconds} s` : "down every enemy")
    if (view.room.tip !== null) line("tip-text", view.room.tip)
    // (The first two rooms' how-to is the step-by-step lesson under the room, see `lesson.ts`.)
    return frag
  }

  message(m: Message): void {
    const key = m.kind === "none" ? "none" : m.kind === "dead" ? `dead:${m.canRetry}` : `${m.kind}:${m.view.room.index}:${m.view.result?.stars}:${m.view.result?.world}`
    if (key === this.messageKey) return
    this.messageKey = key
    this.msg.className = `message panel ${m.kind}`
    this.msg.hidden = m.kind === "none"
    this.after.hidden = m.kind !== "cleared" && m.kind !== "won"
    this.msgStars.replaceChildren()
    this.msgLines.replaceChildren()
    if (m.kind === "none") return
    if (m.kind === "dead") {
      this.msgTitle.textContent = "hit"
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
    // A survive room ends on its time, so par says nothing there: what you held out, and the hits it cost.
    if (view.room.goal.kind === "survive") {
      add("line", `${view.room.goal.seconds}s`).prepend(small("survived"))
      add("line dim small", view.hits === 0 ? "no hits" : `${view.hits} ${view.hits === 1 ? "hit" : "hits"}`)
    } else {
      const over = result.world > view.room.par
      add(over ? "line over" : "line", `${result.world.toFixed(1)}s`).append(small(`/ par ${view.room.par}s`))
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
