// Recall on the practice pages: the warm-up at the top of a section, "where was it" search, and a hint link.
// Fails on any console error or uncaught page error.
import { expect, test, type Page } from '@playwright/test'

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // Pyodide's own start-up in Firefox (the page starts it on open) logs its failure to find its files here, where
    // public/pyodide/ is not built; the Python tabs themselves are not under test. Nothing else is allowed.
    if (/encodings|Python runtime state|Current thread|no Python frame|pythonWorker|^$/.test(m.text())) return
    errors.push(`console.error: ${m.text()}`)
  })
  return () => expect(errors, 'console errors and page errors').toEqual([])
}

for (const [kind, at, term] of [['sql', 'group-by', 'max'], ['python', 'groupby', 'merge']] as const) {
  test(`${kind} practice: warm-up, search and hint links`, async ({ page }) => {
    const expectNoErrors = watchErrors(page)
    await page.goto(`/#practice=${kind}&at=${at}`)
    const section = page.locator(`#section-${at}`)
    const warm = section.getByTestId('warm-up')
    await expect(warm).toBeVisible()
    await expect(warm.locator('[id^="warm-task-"]')).toHaveCount(2)

    // folded (that it stays folded after a reload is the store's job, checked by hand: a reload in the middle of the engine's start logs errors in Firefox and WebKit)
    await warm.locator('.warmup-head').click()
    await expect(warm.locator('[id^="warm-task-"]')).toHaveCount(0)

    // the search finds the term and jumps to the note that teaches it
    await page.locator('#recall-rail').fill(term)
    const hit = page.locator('.recall-results:visible button').first()
    await expect(hit).toContainText(term, { ignoreCase: true })
    await page.locator('#recall-rail').press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.locator('#recall-rail')).toHaveValue('')

    // a hint names a term of an earlier section as a link
    const hints = section.locator('button:has-text("Hint")')
    for (let round = 0; round < 3; round++) for (let i = 0; i < (await hints.count()); i++) if (await hints.nth(i).isEnabled()) await hints.nth(i).click()
    await expect(section.locator('.recall-link').first()).toBeVisible()
    expectNoErrors()
  })
}
