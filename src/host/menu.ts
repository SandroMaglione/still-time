/**
 * The menus over the game: the title (continue where you left off, or pick
 * a room) and the room select, a grid of every room with its stars and best
 * time. Rooms open one by one: a locked room shows its name dimmed. The
 * menus only read the view and call back; the game is paused while one is
 * open (see `main.ts`).
 */
import { continueRoom, totalStars, unlocked, type Best } from "../sim/progress.ts"
import type { FightView } from "../sim/view.ts"
import { ICONS, clockFace, fromHtml, pixelSvg, star } from "./ui-pixels.ts"

export interface MenuActions {
  /** Plays a room (the simulation refuses a locked one). */
  readonly play: (room: number) => void
  /** Closes the menu and goes back to the room as it was. */
  readonly resume: () => void
}

type Screen = "title" | "rooms"

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
    this.root.hidden = true
    parent.append(this.root)
  }

  get isOpen(): boolean {
    return this.screen !== null
  }

  show(screen: Screen, view: FightView): void {
    this.stopClock()
    this.screen = screen
    this.root.hidden = false
    this.root.replaceChildren(screen === "title" ? this.title(view) : this.rooms(view))
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
    const next = continueRoom(best)
    const fresh = best.every((b) => b === null)
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

  private rooms(view: FightView): HTMLElement {
    const box = el("div", "rooms-screen")
    const head = el("div", "rooms-head panel glass")
    const back = button("square", fromHtml(pixelSvg(ICONS.close, { outline: true })))
    back.setAttribute("aria-label", "Close")
    back.addEventListener("click", () => this.actions.resume())
    head.append(el("h2", "", "Rooms"), total(view.best), back)
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
