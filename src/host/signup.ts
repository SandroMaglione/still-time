/**
 * The email sign-up for new games from Typeonce Games: the last section of the "all rooms clear" card (`#signup` in
 * index.html), never on any other card. It shows only on a typeonce.games address (the endpoint refuses every other
 * origin, so the itch.io build never shows it), and in `vite dev`, where it answers itself and sends nothing.
 *
 * Signing up hides it for good on the device; its close ("×") hides it for a day. Nothing is sent until the player
 * submits, and only the address as typed (the font has no lowercase: what shows in capitals is sent as typed).
 *
 * The rule for when it may show, and how an answer from the endpoint reads, are plain functions (tested in
 * `test/signup.test.ts`); the `Signup` class is the form on the page.
 */
import { ICONS, fromHtml, pixelSvg } from "./ui-pixels.ts"

/** The studio's sign-up endpoint: it sends the confirmation email itself, and takes requests from typeonce.games origins only. */
const ENDPOINT = "https://typeonce.games/api/subscribe"
/** The tag this game's sign-ups get. */
const GAME = "still-time"

/** Keys under the game's prefix (itch.io shares local storage between games): signed up, and when it was last closed (ms). */
export const SIGNUP_KEYS = { done: "still-time/signup.done", closedAt: "still-time/signup.closedAt" } as const
/** How long the close hides it. */
export const CLOSED_FOR_MS = 24 * 60 * 60 * 1000

/** What the device remembers of the sign-up. */
export interface SignupMemory {
  /** The player signed up here: it never shows again. */
  readonly done: boolean
  /** When (ms since the epoch) it was last closed, if ever. */
  readonly closedAt: number | null
}

/** Whether the page is on a typeonce.games address (the domain itself or one of its subdomains). */
export const onTypeonceGames = (hostname: string): boolean => hostname === "typeonce.games" || hostname.endsWith(".typeonce.games")

/**
 * Whether the final card offers the sign-up: on typeonce.games (or in development, where it fakes its answer), unless
 * the player signed up on this device or closed it less than a day ago.
 */
export const signupShows = (where: { readonly hostname: string; readonly dev: boolean }, memory: SignupMemory, now: number): boolean => {
  if (!where.dev && !onTypeonceGames(where.hostname)) return false
  if (memory.done) return false
  if (memory.closedAt === null) return true
  const since = now - memory.closedAt
  return !(since >= 0 && since < CLOSED_FOR_MS)
}

/** Reads what the device remembers; storage that cannot be read remembers nothing (so it shows again next time). */
export const readMemory = (load: (key: string) => string | null): SignupMemory => {
  const closed = Number(load(SIGNUP_KEYS.closedAt) ?? Number.NaN)
  return { done: load(SIGNUP_KEYS.done) !== null, closedAt: Number.isFinite(closed) && closed > 0 ? closed : null }
}

export type Outcome = "ok" | "invalid_email" | "rate_limited" | "unavailable"

/** What the player reads after a submit. This font is wide, so two are shorter than on the studio's homepage. */
export const MESSAGES: Record<Outcome, string> = {
  ok: "Check your inbox to confirm.",
  invalid_email: "That address does not look right.",
  rate_limited: "Too many tries. Wait a minute.",
  unavailable: "Did not go through. Try again."
}

/** How the endpoint's answer reads: any error it does not name (`invalid_request`, a broken body) is "unavailable". */
export const outcomeOf = (ok: boolean, body: unknown): Outcome => {
  if (ok) return "ok"
  const error = typeof body === "object" && body !== null ? (body as { readonly error?: unknown }).error : undefined
  return error === "invalid_email" || error === "rate_limited" ? error : "unavailable"
}

/** `vite dev` sends nothing: the form answers itself after a beat. No "@" is invalid; "limit@" and "down@" show those errors. */
const fake = async (email: string): Promise<Outcome> => {
  await new Promise((resolve) => setTimeout(resolve, 600))
  if (!email.includes("@")) return "invalid_email"
  if (email.startsWith("limit@")) return "rate_limited"
  if (email.startsWith("down@")) return "unavailable"
  return "ok"
}

const send = async (email: string): Promise<Outcome> => {
  if (import.meta.env.DEV) return fake(email)
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `website` is the endpoint's bot trap: always empty.
      body: JSON.stringify({ email, game: GAME, referrer: window.location.href, website: "" })
    })
    if (response.ok) return "ok"
    return outcomeOf(false, await response.json().catch(() => null))
  } catch {
    return "unavailable"
  }
}

const load = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
const keep = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage refused: it shows again next time.
  }
}

const part = <T extends Element>(root: ParentNode, selector: string): T => {
  const found = root.querySelector<T>(selector)
  if (found === null) throw new Error(`Still Time: sign-up ${selector} missing`)
  return found
}

/**
 * The form on the final card. Its space is part of the card from its first frame (nothing above it ever moves); its
 * content comes in once, a beat after the card (see `.signup` in index.html), and takes taps only from then on.
 */
export class Signup {
  private readonly form: HTMLFormElement
  private readonly email: HTMLInputElement
  private readonly note: HTMLElement
  private readonly submit: HTMLButtonElement
  private readonly close: HTMLButtonElement
  private readonly allowed = { hostname: window.location.hostname, dev: import.meta.env.DEV }
  private shown = false

  constructor() {
    const form = document.getElementById("signup")
    if (!(form instanceof HTMLFormElement)) throw new Error("Still Time: #signup missing")
    this.form = form
    this.email = part<HTMLInputElement>(form, "input[name=email]")
    this.note = part<HTMLElement>(form, ".signup-error")
    this.submit = part<HTMLButtonElement>(form, ".signup-send")
    this.close = part<HTMLButtonElement>(form, ".signup-close")
    this.close.replaceChildren(fromHtml(pixelSvg(ICONS.close, { outline: true })))
    part<HTMLElement>(form, ".signup-done").textContent = MESSAGES.ok

    // A tap leaves no focus on the buttons: the game's keys (space, arrows) work again at once.
    for (const b of [this.submit, this.close]) b.addEventListener("pointerup", () => queueMicrotask(() => b.blur()))
    // Usable once its entrance has played: until then a tap there falls through to the game, as before.
    form.addEventListener("animationend", (e) => { if (e.target === form) form.classList.add("is-ready") })
    // The focused field stays in view: a phone held sideways has little room once its keyboard is up, and the card
    // rescales with the window (see `uiPixel`), so it scrolls the field back into view.
    this.email.addEventListener("focus", () => this.reveal())
    window.addEventListener("resize", () => this.reveal())
    window.visualViewport?.addEventListener("resize", () => this.reveal())
    // An error lasts until the address is edited.
    this.email.addEventListener("input", () => this.clearError())
    this.close.addEventListener("click", () => {
      keep(SIGNUP_KEYS.closedAt, String(Date.now()))
      this.email.blur()
      this.close.blur()
      // Its space stays until the card goes, so nothing on the card moves.
      form.classList.add("is-closed")
    })
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      void this.send()
    })
  }

  /** Whether a key event's target is in the sign-up: typing there is typing, not playing. */
  owns(target: EventTarget | null): boolean {
    return target instanceof Node && this.form.contains(target)
  }

  /** Whether the address field has focus (on a phone, the keyboard is up). */
  focused(): boolean {
    return document.activeElement === this.email
  }

  /** Leaves the field or button that has focus in the sign-up (on a phone, closes the keyboard). */
  leave(): void {
    const active = document.activeElement
    if (active instanceof HTMLElement && this.form.contains(active)) active.blur()
  }

  /** The card now showing: the final card offers the sign-up, unless it may not show; every other card hides it. */
  place(finalCard: boolean): void {
    const show = finalCard && signupShows(this.allowed, readMemory(load), Date.now())
    if (show === this.shown) return
    this.shown = show
    this.email.blur()
    this.clearError()
    this.form.className = "signup"
    this.form.hidden = !show
    // Reduced motion: no entrance, so nothing to wait for.
    if (show && window.matchMedia("(prefers-reduced-motion: reduce)").matches) this.form.classList.add("is-ready")
  }

  /**
   * Scrolls the card (only the card: the page itself never scrolls) so the field and its buttons are in sight, or at
   * least the field, within the part of the window the keyboard leaves. Next frame: the HUD sets the new UI pixel first.
   */
  private reveal(): void {
    if (!this.focused()) return
    requestAnimationFrame(() => {
      const card = this.form.closest<HTMLElement>(".message")
      if (card === null || !this.focused()) return
      const view = window.visualViewport
      const box = card.getBoundingClientRect()
      const top = Math.max(box.top, view?.offsetTop ?? 0)
      const bottom = Math.min(box.bottom, view === null || view === undefined ? window.innerHeight : view.offsetTop + view.height)
      const rows = part<HTMLElement>(this.form, ".signup-body").getBoundingClientRect()
      const want = rows.height <= bottom - top ? rows : this.email.getBoundingClientRect()
      if (want.bottom > bottom) card.scrollTop += want.bottom - bottom
      else if (want.top < top) card.scrollTop -= top - want.top
    })
  }

  private clearError(): void {
    if (!this.form.classList.contains("is-error")) return
    this.form.classList.remove("is-error")
    this.email.removeAttribute("aria-invalid")
    this.note.textContent = ""
  }

  private async send(): Promise<void> {
    const form = this.form
    if (form.classList.contains("is-sending") || form.classList.contains("is-done")) return
    this.clearError()
    form.classList.add("is-sending")
    this.submit.disabled = true
    const outcome = await send(this.email.value)
    form.classList.remove("is-sending")
    this.submit.disabled = false
    if (outcome === "ok") {
      keep(SIGNUP_KEYS.done, "1")
      // Focus goes back to the game, so its keys work again.
      this.email.blur()
      form.classList.add("is-done")
      return
    }
    this.note.textContent = MESSAGES[outcome]
    form.classList.add("is-error")
    if (outcome === "invalid_email") this.email.setAttribute("aria-invalid", "true")
  }
}
