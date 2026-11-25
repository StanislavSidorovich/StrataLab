// The phone's fill-the-gaps pad (#vote=<code>, question key f1 / f2) at 375x812 on the production build. The Supabase calls are
// answered here (page.route): no real room is touched. Choose mode: tap and drag both fill the gaps (mouse-driven drag in every
// engine, a real touch drag through the Chrome DevTools protocol in Chromium). Type mode: inputs, trimmed answers.
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

const CODE = 'K7M2P'

/** Answers the room and the cast function; `casts` holds what the phone sent. */
async function mockRoom(page: Page, key: 'f1' | 'f2', opts: { cast?: 'ok' | 'missing' } = {}) {
  const casts: unknown[] = []
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const fn = new URL(route.request().url()).pathname.split('/').pop()
    if (fn === 'lesson_room_state') return route.fulfill({ json: { q_key: key, q_label: 'Step 8 of 10', open: true, counts: { A: 0, B: 0, C: 0, D: 0 }, total: 0 } })
    if (fn === 'lesson_cast_fill') {
      casts.push(JSON.parse(route.request().postData() ?? '{}'))
      if (opts.cast === 'missing') return route.fulfill({ status: 404, body: '{"code":"PGRST202","message":"Could not find the function"}' })
      return route.fulfill({ json: 'ok' })
    }
    return route.fulfill({ json: null })
  })
  return casts
}

const text = async (page: Page, id: string) => ((await page.getByTestId(id).textContent()) ?? '').trim()
const gaps = async (page: Page) => [await text(page, 'fill-gap-1'), await text(page, 'fill-gap-2'), await text(page, 'fill-gap-3')]
// bank of f1: ORDER BY, HAVING, ON, WHERE, GROUP BY
const CHIP = { orderBy: 0, having: 1, on: 2, where: 3, groupBy: 4 }

test('choose: a tap fills the first empty gap, a tap on a gap takes the word out, Send waits for every gap', async ({ page }) => {
  const casts = await mockRoom(page, 'f1')
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('fill-pad')).toBeVisible()
  const send = page.getByTestId('fill-send')
  await expect(send).toBeDisabled()

  await page.getByTestId(`fill-chip-${CHIP.where}`).tap()
  await page.getByTestId(`fill-chip-${CHIP.groupBy}`).tap()
  expect(await gaps(page)).toEqual(['WHERE', 'GROUP BY', ''])
  await expect(send).toBeDisabled()
  await expect(page.getByTestId(`fill-chip-${CHIP.where}`)).toBeDisabled() // a used word is greyed out

  await page.getByTestId('fill-gap-2').tap() // takes GROUP BY back
  expect(await gaps(page)).toEqual(['WHERE', '', ''])
  await expect(page.getByTestId(`fill-chip-${CHIP.groupBy}`)).toBeEnabled()
  await page.getByTestId(`fill-chip-${CHIP.having}`).tap() // goes to the first empty gap, the second
  await page.getByTestId(`fill-chip-${CHIP.groupBy}`).tap()
  expect(await gaps(page)).toEqual(['WHERE', 'HAVING', 'GROUP BY'])
  await expect(send).toBeEnabled()
  await page.getByTestId(`fill-chip-${CHIP.orderBy}`).tap({ trial: true }) // a full pad takes no more words (no error)

  // targets are at least 44 px, and nothing scrolls sideways
  for (const id of ['fill-gap-1', 'fill-gap-2', 'fill-gap-3', 'fill-chip-0', 'fill-chip-1', 'fill-send']) {
    const box = (await page.getByTestId(id).boundingBox())!
    expect(box.height, id).toBeGreaterThanOrEqual(44)
    expect(box.width, id).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // Send: once, even when tapped twice quickly; then it can be changed and sent again
  await send.dblclick()
  await expect(page.getByTestId('fill-received')).toBeVisible()
  expect(casts).toHaveLength(1)
  expect(casts[0]).toMatchObject({ p_code: CODE, p_q_key: 'f1', p_answers: ['WHERE', 'HAVING', 'GROUP BY'] })
  await page.getByTestId('fill-gap-3').tap()
  await page.getByTestId(`fill-chip-${CHIP.on}`).tap()
  await expect(send).toContainText('Send again')
  await send.click()
  await expect.poll(() => casts.length).toBe(2)
  expect(casts[1]).toMatchObject({ p_answers: ['WHERE', 'HAVING', 'ON'] })
})

test('choose: a drag puts a word into any gap, swaps two gaps, and drags a word out', async ({ page }) => {
  await mockRoom(page, 'f1')
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('fill-pad')).toBeVisible()

  // into the LAST gap first: people place what they remember, then the rest
  await page.getByTestId(`fill-chip-${CHIP.having}`).dragTo(page.getByTestId('fill-gap-3'))
  expect(await gaps(page)).toEqual(['', '', 'HAVING'])
  await page.getByTestId(`fill-chip-${CHIP.where}`).dragTo(page.getByTestId('fill-gap-2'))
  expect(await gaps(page)).toEqual(['', 'WHERE', 'HAVING'])
  await page.getByTestId(`fill-chip-${CHIP.groupBy}`).dragTo(page.getByTestId('fill-gap-1'))
  expect(await gaps(page)).toEqual(['GROUP BY', 'WHERE', 'HAVING'])

  // between gaps they swap
  await page.getByTestId('fill-gap-1').dragTo(page.getByTestId('fill-gap-2'))
  expect(await gaps(page)).toEqual(['WHERE', 'GROUP BY', 'HAVING'])
  await expect(page.getByTestId('fill-send')).toBeEnabled()

  // a word dragged onto a filled gap sends the old one back to the bank
  await page.getByTestId(`fill-chip-${CHIP.on}`).dragTo(page.getByTestId('fill-gap-3'))
  expect(await gaps(page)).toEqual(['WHERE', 'GROUP BY', 'ON'])
  await expect(page.getByTestId(`fill-chip-${CHIP.having}`)).toBeEnabled()

  // out of every gap: back to the bank
  const gap = (await page.getByTestId('fill-gap-2').boundingBox())!
  await page.mouse.move(gap.x + gap.width / 2, gap.y + gap.height / 2)
  await page.mouse.down()
  await page.mouse.move(gap.x + gap.width / 2, gap.y + gap.height / 2 + 140, { steps: 8 })
  await page.mouse.move(20, 700, { steps: 8 })
  await page.mouse.up()
  expect(await gaps(page)).toEqual(['WHERE', '', 'ON'])
  await expect(page.getByTestId(`fill-chip-${CHIP.groupBy}`)).toBeEnabled()
  await expect(page.getByTestId('fill-send')).toBeDisabled()
})

test('choose: a drag with a real finger (touch events through the DevTools protocol) fills a gap and does not scroll the page', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch events by CDP exist only in Chromium')
  await mockRoom(page, 'f1')
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('fill-pad')).toBeVisible()
  const cdp = await page.context().newCDPSession(page)
  const centre = async (id: string) => {
    const b = (await page.getByTestId(id).boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] })
  const from = await centre(`fill-chip-${CHIP.where}`)
  const to = await centre('fill-gap-2')
  const scrollBefore = await page.evaluate(() => window.scrollY)
  await touch('touchStart', from)
  for (let i = 1; i <= 10; i++) await touch('touchMove', { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 })
  await expect(page.locator('.fill-ghost')).toBeVisible() // the word follows the finger
  await touch('touchEnd')
  expect(await gaps(page)).toEqual(['', 'WHERE', ''])
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
})

test('type: an input per gap, Send only when every gap has a word, spaces trimmed, case kept', async ({ page }) => {
  const casts = await mockRoom(page, 'f2')
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('fill-pad')).toHaveAttribute('data-mode', 'type')
  const send = page.getByTestId('fill-send')
  await expect(send).toBeDisabled()
  await page.getByTestId('fill-input-1').fill('  left   join ')
  await expect(send).toBeDisabled()
  await page.getByTestId('fill-input-2').fill('   ')
  await expect(send).toBeDisabled() // blank is no answer
  await page.getByTestId('fill-input-2').fill('C.customer_id')
  await expect(send).toBeEnabled()
  expect(await page.getByTestId('fill-input-1').getAttribute('maxlength')).toBe('30')
  await send.click()
  await expect(page.getByTestId('fill-received')).toBeVisible()
  expect(casts[0]).toMatchObject({ p_q_key: 'f2', p_answers: ['left join', 'C.customer_id'] })
  const box = (await page.getByTestId('fill-input-1').boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44)
})

test('the answers cannot be collected yet (0003 not run): the phone says so and does not break', async ({ page }) => {
  await mockRoom(page, 'f2', { cast: 'missing' })
  await page.goto(`/#vote=${CODE}`)
  await page.getByTestId('fill-input-1').fill('LEFT JOIN')
  await page.getByTestId('fill-input-2').fill('c.customer_id')
  await page.getByTestId('fill-send').click()
  await expect(page.getByTestId('vote-problem')).toContainText('cannot be collected yet')
  await expect(page.getByTestId('fill-send')).toBeEnabled()
})

test('with localStorage unavailable the pad still works, in memory', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('denied') } })
  })
  const casts = await mockRoom(page, 'f1')
  await page.goto(`/#vote=${CODE}`)
  await expect(page.getByTestId('fill-pad')).toBeVisible()
  for (const c of [CHIP.where, CHIP.groupBy, CHIP.having]) await page.getByTestId(`fill-chip-${c}`).tap()
  await page.getByTestId('fill-send').click()
  await expect(page.getByTestId('fill-received')).toBeVisible()
  expect(casts).toHaveLength(1)
})
