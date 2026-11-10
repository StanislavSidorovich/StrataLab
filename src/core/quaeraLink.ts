// Links back to Quaera (quaera.app) that reuse one window. A click opens the address in the window named `quaera-quaera`, so a
// second "Count it in Quaera" brings the same tab up instead of piling up new ones. The trainer names its window the same
// (`window.name = 'quaera-quaera'`, the name the family switcher gives it too). Where the trick must not run, the plain link does its work:
//  - an installed app window (display-mode: standalone): `window.open` by name from there goes to a tab of the browser,
//    while a plain link is taken by the installed Quaera (launch_handler navigate-existing in its manifest), like the
//    trainer's own links to Lab and Model (quaera `src/labLink.ts`);
//  - a blocked pop-up (`window.open` gives null): the link opens as it always did.
export const QUAERA_WINDOW = 'quaera-quaera'

export interface QuaeraEnv {
  standalone: () => boolean
  open: (url: string, name: string) => { opener: unknown } | null
}

const browserEnv = (): QuaeraEnv => ({
  standalone: () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
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
    const w = env.open(url, QUAERA_WINDOW)
    if (!w) return false
    try {
      // the window may be Quaera's from before: nothing there should reach back into this page
      w.opener = null
    } catch {
      /* a window of another origin may refuse; the link still worked */
    }
    e.preventDefault()
    return true
  } catch {
    return false
  }
}
