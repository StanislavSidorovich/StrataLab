// Links back to Quaera (quaera.app) that reuse one window, so a second "Count it in Quaera" brings the same tab up instead
// of piling up new ones. Two ways, in this order:
//  1. Lab was opened from Quaera (the trainer's `openInApp` keeps `window.opener`, and `document.referrer` is quaera.app):
//     the opener is sent to the address and focused. A named `window.open` cannot do this: by the HTML rules a window
//     may target another one by name only if it is "familiar" with it, and an opened Lab is not familiar with the
//     trainer that opened it (checked live 2026-11-10: the name `quaera-quaera` from Lab opened a third tab).
//  2. Otherwise `window.open(url, 'quaera-quaera')`: finds a Quaera tab this Lab opened before (it is Lab's auxiliary,
//     so the name works), or opens one with that name. The trainer and the family switcher name its window the same.
// Where the trick must not run, the plain link does its work:
//  - an installed app window (display-mode: standalone): `window.open` from there goes to a tab of the browser, while a
//    plain link is taken by the installed Quaera (launch_handler navigate-existing in its manifest), like the trainer's
//    own links to Lab and Model (quaera `src/labLink.ts`);
//  - a blocked pop-up (`window.open` gives null): the link opens as it always did.
export const QUAERA_WINDOW = 'quaera-quaera'
export const QUAERA_ORIGIN = 'https://quaera.app'

/** The part of a window this helper touches; the opener is of another origin, so only its location and focus. */
export interface QuaeraWindow {
  closed?: boolean
  location: { href: string }
  focus: () => void
}

export interface QuaeraEnv {
  standalone: () => boolean
  /** The window that opened Lab, when that was Quaera (by `document.referrer`); null otherwise. */
  quaeraOpener: () => QuaeraWindow | null
  open: (url: string, name: string) => unknown | null
}

const browserEnv = (): QuaeraEnv => ({
  standalone: () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  quaeraOpener: () => {
    const o = window.opener as QuaeraWindow | null
    if (!o || o.closed) return null
    try {
      return new URL(document.referrer).origin === QUAERA_ORIGIN ? o : null
    } catch {
      return null
    }
  },
  open: (url, name) => window.open(url, name),
})

/**
 * onClick of an `<a href>` that leads to Quaera. Returns true when it handled the click (and stopped the plain link).
 * Modified clicks (new tab, new window, middle button) are left to the browser.
 */
export function followQuaeraLink(e: { preventDefault: () => void; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; button?: number }, url: string, env: QuaeraEnv = browserEnv()): boolean {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || (e.button ?? 0) !== 0) return false
  try {
    if (env.standalone()) return false
    const opener = env.quaeraOpener()
    if (opener) {
      try {
        opener.location.href = url
        try {
          opener.focus()
        } catch {
          /* the tab is updated even where focus is refused */
        }
        e.preventDefault()
        return true
      } catch {
        /* the opener went away between the check and the click: fall through to the named window */
      }
    }
    if (!env.open(url, QUAERA_WINDOW)) return false
    e.preventDefault()
    return true
  } catch {
    return false
  }
}
