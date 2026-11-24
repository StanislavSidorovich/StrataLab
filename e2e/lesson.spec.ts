// A lesson link never meets the first-visit welcome dialog, and does not mark it as seen.
import { expect, test } from '@playwright/test'

const WELCOME = 'Welcome to Quaera Lab'
const SEEN = 'stratalab.welcome-seen'

for (const link of ['#lesson=sql', '#lesson=sql&plan=w1,w2', '#lesson=sql&set=warmup&q=3', '#lesson=sql&set=inner-join&mode=vote&q=1']) {
  test(`no welcome on ${link}, a later normal visit still gets it`, async ({ page }) => {
    await page.goto(`/${link}`)
    await expect(page.getByTestId('lesson')).toBeVisible()
    await expect(page.getByRole('dialog', { name: WELCOME })).toHaveCount(0)
    expect(await page.evaluate((k) => localStorage.getItem(k), SEEN)).toBeNull()
    // the same profile, an ordinary visit
    await page.goto('/#')
    await page.reload()
    await expect(page.getByRole('dialog', { name: WELCOME })).toBeVisible()
  })
}

test('a tab opened normally, then given a lesson link: the dialog goes, and is not marked seen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: WELCOME })).toBeVisible()
  await page.evaluate(() => {
    location.hash = '#lesson=sql'
  })
  await expect(page.getByTestId('lesson')).toBeVisible()
  await expect(page.getByRole('dialog', { name: WELCOME })).toHaveCount(0)
  expect(await page.evaluate((k) => localStorage.getItem(k), SEEN)).toBeNull()
})

test('with localStorage unavailable a lesson link still shows no dialog', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('denied') } })
  })
  await page.goto('/#lesson=sql')
  await expect(page.getByTestId('lesson')).toBeVisible()
  await expect(page.getByRole('dialog', { name: WELCOME })).toHaveCount(0)
})
