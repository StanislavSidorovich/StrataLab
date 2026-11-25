// The "Tables used" strip on the projector (`#lesson=sql&plan=shop`, steps 2 and 8) at 1366x768 in Board mode, on the production build:
// folded by default, opens with the rows of the demo shop, no sideways scroll of the page, the choice is kept on the next step.
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 1366, height: 768 } })

const noPageScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.body.scrollWidth <= document.documentElement.clientWidth)

test('Tables used: folded, opens with rows, fits the board, remembered', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#lesson=sql&plan=shop&i=2')
  await page.getByLabel('Board mode').check()
  const strip = page.getByTestId('tables-used')
  await expect(strip).toBeVisible()
  await expect(strip.locator('summary')).toContainText('Tables used (')
  expect(await strip.evaluate((d: HTMLDetailsElement) => d.open)).toBe(false) // folded by default
  await expect(page.getByTestId('opt-A')).toBeVisible()
  await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/step2-folded.png` : undefined })

  await strip.locator('summary').click()
  await expect(strip.locator('details[data-table]').first()).toBeVisible()
  await expect(strip.locator('.lesson-col.key').first()).toContainText('key')
  // the first rows are read live: at most 3 data rows per table, at least one table with rows
  await expect(strip.locator('details[data-table] .rounded-md').first()).toBeVisible() // the grid of rows (drawn, not a DOM table)
  expect(await noPageScroll(page)).toBe(true)
  await expect(page.getByTestId('opt-A')).toBeVisible()
  await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/step2-open.png` : undefined })

  // step 8 is the fill question: the open choice is remembered
  await page.goto('/#lesson=sql&plan=shop&i=8')
  await page.reload()
  const strip8 = page.getByTestId('tables-used')
  await expect(strip8).toBeVisible()
  expect(await strip8.evaluate((d: HTMLDetailsElement) => d.open)).toBe(true)
  await expect(strip8.locator('details[data-table] .rounded-md').first()).toBeVisible()
  await expect(page.getByTestId('fill-code')).toBeVisible()
  expect(await noPageScroll(page)).toBe(true)
  await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/step8-open.png` : undefined })
  expect(errors).toEqual([])
})
