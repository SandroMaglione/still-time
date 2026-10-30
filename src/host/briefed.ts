/**
 * Whether this device has done the briefing: in local storage under `still-time/briefed`, or for this session
 * when storage is blocked. Set only when the briefing completes (after the cut), never on opening or skipping it.
 * The tutorial rooms read it to keep their hints quiet for a briefed player and full for one who skipped.
 */
const KEY = "still-time/briefed"
let thisSession = false
let stored: boolean | null = null

export const isBriefed = (): boolean => {
  if (thisSession) return true
  if (stored === null) {
    try { stored = window.localStorage.getItem(KEY) === "1" } catch { stored = false }
  }
  return stored
}

export const markBriefed = (): void => {
  thisSession = true
  try { window.localStorage.setItem(KEY, "1") } catch { /* blocked storage: this session remembers */ }
}
