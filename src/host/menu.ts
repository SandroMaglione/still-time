/**
 * The menus over the game: the title (continue where you left off, or pick
 * a room) and the room select, a grid of every room with its stars and best
 * time. Rooms open one by one: a locked room shows its name dimmed. The
 * menus only read the view and call back; the game is paused while one is
 * open (see `main.ts`).
 */
import { continueRoom, totalStars, unlocked, type Best } from "../sim/progress.ts"
import type { FightView } from "../sim/view.ts"

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

/** Three stars as text, the earned ones lit. */
const starsOf = (stars: number): HTMLElement => {
  const row = el("span", "stars")
  for (let i = 0; i < 3; i++) row.append(el("span", i < stars ? "star lit" : "star", "★"))
  return row
}

export class Menu {
  private screen: Screen | null = null
  private readonly root: HTMLElement
  private readonly actions: MenuActions

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
    this.screen = screen
    this.root.hidden = false
    this.root.replaceChildren(screen === "title" ? this.title(view) : this.rooms(view))
  }

  close(): void {
    this.screen = null
    this.root.hidden = true
    this.root.replaceChildren()
  }

  private title(view: FightView): HTMLElement {
    const best: Best = view.best
    const next = continueRoom(best)
    const fresh = best.every((b) => b === null)
    const box = el("div", "title-screen")
    box.append(el("h1", "game-title", "STILL TIME"), el("p", "tagline", "time moves only when you do"))
    const play = el("button", "primary", fresh ? "Play" : `Continue · ${next + 1} ${view.roomNames[next] ?? ""}`)
    play.addEventListener("click", () => this.actions.play(next))
    const rooms = el("button", "", "Rooms")
    rooms.addEventListener("click", () => this.show("rooms", view))
    box.append(play, rooms)
    if (!fresh) box.append(el("p", "total", `★ ${totalStars(best)} / ${best.length * 3}`))
    return box
  }

  private rooms(view: FightView): HTMLElement {
    const box = el("div", "rooms-screen")
    const head = el("div", "rooms-head")
    const back = el("button", "icon", "✕")
    back.setAttribute("aria-label", "Close")
    back.addEventListener("click", () => this.actions.resume())
    head.append(el("h2", "", "Rooms"), el("span", "total", `★ ${totalStars(view.best)} / ${view.best.length * 3}`), back)
    const grid = el("div", "rooms-grid")
    view.roomNames.forEach((name, i) => {
      const best = view.best[i] ?? null
      const open = view.open || unlocked(view.best, i)
      const card = el("button", open ? "room-card" : "room-card locked")
      card.disabled = !open
      const meta = el("span", "room-meta")
      if (!open) meta.append(el("span", "room-best", "locked"))
      else if (best === null) meta.append(el("span", "room-best", i === continueRoom(view.best) ? "next" : "—"))
      else meta.append(starsOf(best.stars), el("span", "room-best", `${best.world.toFixed(1)} s`))
      card.append(el("span", "room-number", String(i + 1)), el("span", "room-name", name), meta)
      if (i === view.room.index) card.classList.add("current")
      card.addEventListener("click", () => this.actions.play(i))
      grid.append(card)
    })
    box.append(head, grid)
    return box
  }
}
