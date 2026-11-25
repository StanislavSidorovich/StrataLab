// The projector's fill-the-gaps slide (`#lesson=sql&plan=...f1...`) on the production build, with the room's calls answered here
// (page.route): the count of phones, Reveal with the shares and the most common wrong answer, "No answers yet", "Run supabase/0003",
// the phones-only message, the results slide, and the filled query run on the demo shop.
import { expect, test, type Page } from '@playwright/test'

const SECRET = '11111111-2222-4333-8444-555555555555'

interface Mock {
  rows: unknown[] | 'missing'
  revealed: string[]
}

async function mockRoom(page: Page, mock: Mock) {
  let q: { key: string | null; label: string | null; open: boolean } = { key: null, label: null, open: false }
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const fn = new URL(route.request().url()).pathname.split('/').pop()
    const body = JSON.parse(route.request().postData() ?? '{}')
    switch (fn) {
      case 'lesson_create_room':
        return route.fulfill({ json: { code: 'K7M2P', secret: SECRET } })
      case 'lesson_set_question':
        q = { key: body.p_q_key, label: body.p_q_label, open: !mock.revealed.includes(body.p_q_key) }
        return route.fulfill({ json: 'ok' })
      case 'lesson_reveal':
        mock.revealed.push(body.p_q_key)
        q.open = false
        return route.fulfill({ json: 'ok' })
      case 'lesson_room_state':
        return route.fulfill({ json: { q_key: q.key, q_label: q.label, open: q.open, counts: { A: 0, B: 0, C: 0, D: 0 }, total: 0 } })
      case 'lesson_room_summary':
        return route.fulfill({ json: [] })
      case 'lesson_fill_read':
        if (mock.rows === 'missing') return route.fulfill({ status: 404, body: '{"code":"PGRST202","message":"Could not find the function"}' })
        return route.fulfill({ json: body.p_q_key ? (mock.rows as { q_key: string }[]).filter((r) => r.q_key === body.p_q_key) : mock.rows })
    }
    return route.fulfill({ json: null })
  })
}

const row = (answers: string[], n: number, q_key = 'f1') => ({ q_key, answers: answers.map((a) => a.toLowerCase()), sample: answers, n })

test('Reveal shows who got what right: shares, the most common wrong answer, the filled query and its rows', async ({ page }) => {
  await mockRoom(page, { revealed: [], rows: [row(['WHERE', 'GROUP BY', 'HAVING'], 50), row(['HAVING', 'GROUP BY', 'HAVING'], 38), row(['WHERE', 'ORDER BY', 'WHERE'], 12)] })
  await page.goto('/#lesson=sql&plan=f1')
  await page.getByTestId('room-start').click()
  await expect(page.getByTestId('room-code')).toHaveText('K7M2P')
  await expect(page.getByTestId('fill-total')).toHaveText('100 phones answered')
  await expect(page.getByTestId('fill-code')).toBeVisible()
  await expect(page.getByTestId('fill-stats')).toHaveCount(0) // nothing before Reveal
  await page.getByTestId('fill-reveal').click()
  await expect(page.getByTestId('fill-fully')).toContainText('50%')
  await expect(page.getByTestId('fill-stat-1')).toContainText('62% right')
  await expect(page.getByTestId('fill-wrong-1')).toHaveText('38% put HAVING')
  await expect(page.getByTestId('fill-wrong-2')).toHaveText('12% put ORDER BY')
  await expect(page.getByTestId('fill-gap-1')).toHaveText('WHERE')
  await expect(page.getByTestId('fill-gap-3')).toHaveText('HAVING')
  await page.getByTestId('fill-run').click()
  await expect(page.getByTestId('fill-run-rows')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('fill-run-error')).toHaveCount(0)
})

test('0 answers: "No answers yet", no percentages', async ({ page }) => {
  await mockRoom(page, { revealed: [], rows: [] })
  await page.goto('/#lesson=sql&plan=f1')
  await page.getByTestId('room-start').click()
  await expect(page.getByTestId('fill-total')).toHaveText('0 phones answered')
  await page.getByTestId('fill-reveal').click()
  await expect(page.getByTestId('fill-noanswers')).toHaveText('No answers yet.')
  await expect(page.getByTestId('fill-stats')).toHaveCount(0)
  await expect(page.getByText('NaN')).toHaveCount(0)
  await expect(page.getByTestId('fill-run')).toBeVisible() // the answer is still shown and runs
})

test('one phone is "1 phone answered"', async ({ page }) => {
  await mockRoom(page, { revealed: [], rows: [row(['WHERE', 'GROUP BY', 'HAVING'], 1)] })
  await page.goto('/#lesson=sql&plan=f1')
  await page.getByTestId('room-start').click()
  await expect(page.getByTestId('fill-total')).toHaveText('1 phone answered')
})

test('0003 not run: the projector says so instead of breaking', async ({ page }) => {
  await mockRoom(page, { revealed: [], rows: 'missing' })
  await page.goto('/#lesson=sql&plan=f1')
  await page.getByTestId('room-start').click()
  await expect(page.getByTestId('fill-missing')).toHaveText('Run supabase/0003 to collect fill answers.')
  await page.getByTestId('fill-reveal').click()
  await expect(page.getByTestId('fill-offline')).toBeVisible()
  await expect(page.getByTestId('fill-run')).toBeVisible()
})

test('no room: phones are needed, and Reveal still shows the answer', async ({ page }) => {
  await page.goto('/#lesson=sql&plan=f1')
  await expect(page.getByTestId('fill-need-phones')).toBeVisible()
  await page.getByTestId('fill-reveal').click()
  await expect(page.getByTestId('fill-offline')).toBeVisible()
  await expect(page.getByTestId('fill-gap-2')).toHaveText('GROUP BY')
  await expect(page.getByTestId('hands-fold')).toHaveCount(0) // no hand count for gaps
})

test('the type question accepts its right answer and shows the typed wrong one', async ({ page }) => {
  await mockRoom(page, { revealed: [], rows: [row(['left outer join', 'C.customer_id'], 3, 'f2'), row(['inner join', 'c.customer_id'], 2, 'f2'), row(['left join', 'customer_id'], 1, 'f2')] })
  await page.goto('/#lesson=sql&plan=f2')
  await page.getByTestId('room-start').click()
  await expect(page.getByTestId('fill-total')).toHaveText('6 phones answered')
  await page.getByTestId('fill-reveal').click()
  await expect(page.getByTestId('fill-fully')).toContainText('50%') // 3 of 6: "left outer join" and "C.customer_id" are accepted spellings
  await expect(page.getByTestId('fill-wrong-1')).toHaveText('33% put inner join')
  await expect(page.getByTestId('fill-wrong-2')).toHaveText('17% put customer_id')
})

test('the results slide counts the fill questions, and says 0003 is missing when it is', async ({ page }) => {
  const mock: Mock = { revealed: [], rows: [row(['WHERE', 'GROUP BY', 'HAVING'], 3), row(['WHERE', 'ORDER BY', 'HAVING'], 1)] }
  await mockRoom(page, mock)
  await page.goto('/#lesson=sql&plan=f1,r&i=1')
  await page.getByTestId('room-start').click()
  await expect(page.getByTestId('fill-total')).toHaveText('4 phones answered')
  await page.goto('/#lesson=sql&plan=f1,r&i=2')
  await expect(page.getByTestId('results-slide')).toBeVisible()
  await expect(page.getByTestId('result-votes-f1')).toContainText('4 phones')
  await expect(page.getByTestId('result-f1')).toContainText('75%')
  mock.rows = 'missing'
  await expect(page.getByTestId('results-fill-note')).toHaveText('Run supabase/0003 to collect fill answers.')
})

test('the shop plan opens on the schema slide of the four demo tables', async ({ page }) => {
  await page.goto('/#lesson=sql&plan=shop')
  await expect(page.getByTestId('lesson-position')).toHaveText('Step 1 of 10')
  for (const t of ['customers', 'orders', 'order_items', 'products']) await expect(page.getByTestId(`schema-${t}`)).toBeVisible()
  await page.goto('/#lesson=sql&plan=shop&i=8')
  await expect(page.getByTestId('fill-code')).toBeVisible()
  await expect(page.getByTestId('lesson-position')).toHaveText('Step 8 of 10')
})
