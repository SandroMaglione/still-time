/**
 * The menus over the game: the title (continue where you left off, or pick
 * a room), the pause panel (the in-game ☰: resume, restart, rooms, title)
 * and the room select, a grid of every room with its stars and best time.
 * Rooms open one by one: a locked room shows its name dimmed. Every screen
 * reaches the title, and the title's Continue goes back to the room you
 * left. The menus only read the view and call back; the game is paused
 * while one is open (see `main.ts`).
 */
import { continueRoom, totalStars, unlocked, type Best } from "../sim/progress.ts"
import type { FightView } from "../sim/view.ts"
import { ICONS, clockFace, fromHtml, pixelSvg, star } from "./ui-pixels.ts"

export interface MenuActions {
  /** Plays a room (the simulation refuses a locked one). */
  readonly play: (room: number) => void
  /** Closes the menu and goes back to the room as it was. */
  readonly resume: () => void
  /** Closes the menu and starts the room over. */
  readonly restart: () => void
}

type Screen = "title" | "rooms" | "pause"

/**
 * Where Continue picks up: the room you are in (as you left it, or retried
 * after a hit), the next one after a clear, the first not cleared after the
 * last room.
 */
const continueTarget = (view: FightView): number =>
  view.flow === "cleared" ? Math.min(view.room.index + 1, view.roomNames.length - 1)
  : view.flow === "won" ? continueRoom(view.best)
  : view.room.index

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

const button = (className: string, ...children: Array<Node | string>): HTMLButtonElement => {
  const node = el("button", `btn ${className}`)
  node.type = "button"
  node.append(...children)
  return node
}

/** Three star sprites, the earned ones lit. */
const starsOf = (stars: number): HTMLElement => {
  const row = el("span", "room-stars")
  for (let i = 0; i < 3; i++) row.append(fromHtml(star(i < stars)))
  return row
}

const total = (best: Best): HTMLElement => {
  const node = el("span", "total", `${totalStars(best)}/${best.length * 3}`)
  node.prepend(fromHtml(star(true)))
  return node
}

/**
 * The title clock's beat: the hand holds still, then races a few ticks, as
 * time does in the game.
 */
const CLOCK_BEAT = [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1] as const

export class Menu {
  private screen: Screen | null = null
  private readonly root: HTMLElement
  private readonly actions: MenuActions
  private timer: number | undefined

  constructor(parent: HTMLElement, actions: MenuActions) {
    this.actions = actions
    this.root = el("div", "menu")
    this.root.setAttribute("role", "dialog")
    this.root.hidden = true
    parent.append(this.root)
  }

  get isOpen(): boolean {
    return this.screen !== null
  }

  get current(): Screen | null {
    return this.screen
  }

  show(screen: Screen, view: FightView): void {
    this.stopClock()
    const from = this.screen
    this.screen = screen
    this.root.hidden = false
    const page = el("div", screen === "rooms" ? "menu-page list" : "menu-page")
    page.append(screen === "title" ? this.title(view) : screen === "pause" ? this.pause(view) : this.rooms(view, from ?? "game"))
    this.root.replaceChildren(page)
    this.root.scrollTop = 0
    document.body.classList.add("menu-open")
  }

  close(): void {
    this.stopClock()
    this.screen = null
    this.root.hidden = true
    this.root.replaceChildren()
    document.body.classList.remove("menu-open")
  }

  private stopClock(): void {
    window.clearInterval(this.timer)
    this.timer = undefined
  }

  private title(view: FightView): HTMLElement {
    const best: Best = view.best
    const next = continueTarget(view)
    const fresh = best.every((b) => b === null) && next === 0
    const box = el("div", "title-screen")

    const logo = el("h1", "logo")
    logo.setAttribute("aria-label", "Still Time")
    const clock = el("span", "logo-clock")
    let tick = 0, beat = 0
    clock.replaceChildren(fromHtml(clockFace(tick)))
    this.timer = window.setInterval(() => {
      beat = (beat + 1) % CLOCK_BEAT.length
      if (CLOCK_BEAT[beat] === 0) return
      tick++
      clock.replaceChildren(fromHtml(clockFace(tick)))
    }, 140)
    const still = el("span", "logo-word logo-still", "Still")
    for (const [x, y, delay] of [[8, 18, 0], [86, 4, 0.7], [62, 22, 1.5]] as const) {
      const frost = el("i", "frost")
      frost.style.cssText = `left: calc(var(--u) * ${x}); top: calc(var(--u) * ${y}); animation-delay: ${delay}s`
      still.append(frost)
    }
    logo.append(clock, still, el("span", "logo-word logo-time", "Time"))
    const tagline = el("p", "tagline")
    tagline.append("time moves only", el("br", ""), "when ", el("b", "", "you"), " move")
    box.append(logo, tagline)

    const play = fresh
      ? button("gold big", "Play")
      : button("gold big continue", "Continue", el("span", "sub", `${next + 1} · ${view.roomNames[next] ?? ""}`))
    play.addEventListener("click", () => this.actions.play(next))
    const rooms = button("", "Rooms")
    rooms.addEventListener("click", () => this.show("rooms", view))
    box.append(play, rooms)
    if (!fresh) box.append(total(best))
    return box
  }

  /** The in-game ☰: the room you are in, then back to it, over again, another room, or the title. */
  private pause(view: FightView): HTMLElement {
    const box = el("div", "pause-screen")
    const head = el("div", "pause-head")
    head.append(el("h2", "", "Paused"), el("span", "dim small", `${view.room.index + 1} · ${view.room.name}`))
    const resume = button("gold big", "Resume")
    resume.addEventListener("click", () => this.actions.resume())
    const restart = button("", "Restart")
    restart.addEventListener("click", () => this.actions.restart())
    const rooms = button("", "Rooms")
    rooms.addEventListener("click", () => this.show("rooms", view))
    const title = button("back", fromHtml(pixelSvg(ICONS.back, { outline: true })), "Title")
    title.addEventListener("click", () => this.show("title", view))
    box.append(head, resume, restart, rooms, title)
    return box
  }

  /** The room select: Title on the left, and a close back to the game when it was opened from there. */
  private rooms(view: FightView, from: Screen | "game"): HTMLElement {
    const box = el("div", "rooms-screen")
    const head = el("div", "rooms-head panel")
    const title = button("back", fromHtml(pixelSvg(ICONS.back, { outline: true })), "Title")
    title.addEventListener("click", () => this.show("title", view))
    const heading = el("div", "rooms-title")
    heading.append(el("h2", "", "Rooms"), total(view.best))
    head.append(title, heading)
    if (from !== "title") {
      const close = button("square", fromHtml(pixelSvg(ICONS.close, { outline: true })))
      close.setAttribute("aria-label", "Back to the game")
      close.addEventListener("click", () => this.actions.resume())
      head.append(close)
    }
    const grid = el("div", "rooms-grid")
    view.roomNames.forEach((name, i) => {
      const best = view.best[i] ?? null
      const open = view.open || unlocked(view.best, i)
      const card = button(open ? "room-card" : "room-card locked")
      card.disabled = !open
      const meta = el("span", "room-meta")
      if (!open) meta.append(fromHtml(pixelSvg(ICONS.lock, { outline: true })))
      else if (best === null) meta.append(i === continueRoom(view.best) ? el("span", "next", "next") : el("span", "room-best", "—"))
      else meta.append(starsOf(best.stars), el("span", "room-best", `${best.world.toFixed(1)}s`))
      card.append(el("span", "room-number", String(i + 1)), el("span", "room-name", name), meta)
      if (i === view.room.index) card.classList.add("current")
      card.addEventListener("click", () => this.actions.play(i))
      grid.append(card)
    })
    box.append(head, grid)
    return box
  }
}
