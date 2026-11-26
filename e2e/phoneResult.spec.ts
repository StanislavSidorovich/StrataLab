// The phone after Reveal (#vote=<code>, a closed question) at 375x812 on the production build: the student's own answer, right or wrong, and why.
// The Supabase calls are answered here (page.route), and what the phone sent is put in localStorage first, so no real room is touched.
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

const CODE = 'K7M2P'

async function closedRoom(page: Page, key: string, opts: { mine?: string; fill?: string[] } = {}) {
  await page.addInitScript(
    ([code, k, mine, fill]) => {
      if (mine) localStorage.setItem('stratalab.vote.mine.v1', JSON.stringify({ [code]: { [k]: mine } }))
      if (fill) localStorage.setItem('stratalab.vote.fill.v1', JSON.stringify({ [code]: { [k]: JSON.parse(fill) } }))
    },
    [CODE, key, opts.mine ?? '', opts.fill ? JSON.stringify(opts.fill) : ''] as const,
  )
  const state = { q_key: key, q_label: 'Step 4 of 10', open: false, counts: { A: 0, B: 0, C: 0, D: 0 }, total: 0 }
  await page.route('**/rest/v1/rpc/**', (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('lesson_room_state') ? state : null }))
}

const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

test('right vote: ✓ Right and why', async ({ page }) => {
  await closedRoom(page, 'd10', { mine: 'D' }) // GROUP BY status
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('phone-verdict')).toHaveText('✓ Right')
  await expect(page.getByTestId('phone-result')).toHaveAttribute('data-outcome', 'right')
  await expect(page.getByTestId('phone-why')).toContainText('One row per status')
  await expect(page.locator('table')).toHaveCount(0) // no result tables on the phone
  expect(await noSideways(page)).toBe(true)
})

test('wrong vote that SQL Server refuses: the letter, its text, why, and Msg 8120', async ({ page }) => {
  await closedRoom(page, 'd10', { mine: 'A' }) // COUNT(*) without GROUP BY
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('phone-verdict')).toHaveText('✗ Not this one')
  await expect(page.getByTestId('phone-err')).toContainText('Msg 8120')
  await expect(page.getByTestId('phone-why')).toContainText('SQL Server refuses the query')
  await expect(page.getByTestId('phone-result')).toContainText('GROUP BY status') // the right option follows
  expect(await noSideways(page)).toBe(true)
})

test('wrong vote that runs: its why, and no SQL Server box', async ({ page }) => {
  await closedRoom(page, 'd10', { mine: 'B' })
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('phone-why')).toContainText('every count is 1')
  await expect(page.getByTestId('phone-err')).toHaveCount(0)
})

test('no answer: the right answer and why', async ({ page }) => {
  await closedRoom(page, 'd9')
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('phone-verdict')).toHaveText('You did not answer')
  await expect(page.getByTestId('phone-result')).toContainText('The right answer: C')
  await expect(page.getByTestId('phone-why')).toContainText('Sorted from the dearest')
})

test('fill, wrong: which gaps were wrong and the right words', async ({ page }) => {
  await closedRoom(page, 'f1', { fill: ['WHERE', 'ORDER BY', 'HAVING'] })
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('phone-verdict')).toHaveText('✗ Not this one')
  const gaps = page.getByTestId('phone-gaps').locator('li')
  await expect(gaps).toHaveCount(3)
  await expect(gaps.nth(0)).toContainText('✓')
  await expect(gaps.nth(1)).toContainText('✗')
  await expect(gaps.nth(1)).toContainText('right: GROUP BY')
  await expect(gaps.nth(2)).toContainText('✓')
  expect(await noSideways(page)).toBe(true)
})

test('fill, right', async ({ page }) => {
  await closedRoom(page, 'f4', { fill: ['top', 'desc'] })
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('phone-verdict')).toHaveText('✓ Right')
})

test('a long option and its message wrap at 375 px, and a question with no known key keeps the plain text', async ({ page }) => {
  await closedRoom(page, 'w3', { mine: 'A' })
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('phone-verdict')).toBeVisible()
  expect(await noSideways(page)).toBe(true)
  const other = await page.context().newPage() // a fresh page: the address change alone would not run the setup again
  await closedRoom(other, 'd99', { mine: 'A' })
  await other.goto(`/#vote=${CODE}`)
  await expect(other.getByText('Closed, look at the screen.')).toBeVisible()
  await expect(other.getByText('Your vote:')).toBeVisible()
})
