// The build page walked end to end as a learner does it (`#build=kaiyo-sales`): Connect, Clean, Model, Dashboard, Answer.
// Every step goes through the UI (no demo Fill buttons). The test fails on any console error or uncaught page error.
import { expect, test, type Page } from '@playwright/test'

/** The three answers of spec section 7 (src/data/build/kaiyoSales.ts, ANSWERS). */
const A1 = '314906.13'
const KPI_SHOWN = '314,906.13'

/** Collects what the page logs as errors; `expectNoErrors` is called at the end of the walk. */
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // Allow-list: none so far. Add a pattern here only with a comment saying why the error is not the app's.
    errors.push(`console.error: ${m.text()}`)
  })
  return () => expect(errors, 'console errors and page errors').toEqual([])
}

test('build it by hand: Connect to Answer', async ({ page }) => {
  const expectNoErrors = watchErrors(page)
  await page.goto('/#build=kaiyo-sales')
  await expect(page.getByTestId('build')).toBeVisible()
  const step = (name: string) => page.getByRole('button', { name, exact: false }).filter({ has: page.locator('.build-chip-label') })

  // ---- Connect
  await expect(page.getByTestId('build-step-connect')).toBeVisible()
  for (const id of ['sales', 'customers', 'products', 'regions']) {
    const card = page.getByTestId(`build-source-${id}`)
    await card.getByRole('button', { name: 'Connect' }).click()
    await expect(card.getByText(/Connected as/)).toBeVisible()
  }
  await expect(page.getByTestId('quick-kpi')).toBeVisible()

  // ---- Clean
  await step('Clean').click()
  const clean = page.getByTestId('build-clean')
  const toolbar = clean.getByRole('group', { name: 'Buttons' })
  const column = clean.getByLabel('Column to trim, uppercase or extract the number from')
  const stepRows = clean.getByTestId('build-step')
  const passed = async (id: string) => {
    await clean.getByTestId(`clean-check-${id}`).click()
    await expect(clean.getByTestId('clean-line')).toContainText('Passed')
    await clean.getByTestId(`clean-pass-${id}`).click()
  }

  // W: watch the Osaka-twice problem, five presses
  await clean.getByTestId('watch-next').click()
  for (let i = 0; i < 4; i++) {
    await expect(clean.getByTestId('watch-next')).toBeEnabled()
    await clean.getByTestId('watch-next').click()
  }
  await clean.getByTestId('watch-now-you').click()

  // P1: Trim then Uppercase on products.sku_code
  await expect(clean.getByTestId('clean-card-P1')).toHaveClass(/is-open/)
  await expect(column).toHaveValue('sku_code')
  await toolbar.getByRole('button', { name: 'Trim', exact: true }).click()
  await expect(stepRows).toHaveCount(1)
  await toolbar.getByRole('button', { name: 'Uppercase', exact: true }).click()
  await expect(stepRows).toHaveCount(2)
  await passed('P1')

  // P2: the blank of the sales step
  await clean.getByLabel('The blank: what makes two rows the same sale').fill('sale_date, customer_name, sku_code')
  await clean.getByTestId('clean-apply-P2').click()
  await expect(clean.getByTestId('clean-line')).toContainText('Passed')
  await clean.getByTestId('clean-pass-P2').click()

  // P3: Keep latest row per key, customer_id, updated_at, newest (the defaults)
  await expect(clean.getByTestId('clean-card-P3')).toHaveClass(/is-open/)
  await toolbar.getByRole('button', { name: 'Keep latest row per key' }).click()
  await expect(stepRows).toHaveCount(1)
  await passed('P3')

  // P5: Change type of sale_date to Date fails, then the format of the slash dates
  await expect(clean.getByTestId('clean-card-P5')).toHaveClass(/is-open/)
  await clean.getByTestId('build-change-type').click()
  await expect(clean.getByTestId('clean-p5-failed')).toBeVisible()
  await clean.getByLabel('The blank: the format of the slash dates').fill('%d/%m/%Y')
  await clean.getByTestId('clean-apply-P5').click()
  await expect(clean.getByTestId('clean-line')).toContainText('Passed')
  await clean.getByTestId('clean-pass-P5').click()

  // P6: revenue to Decimal and units to Whole number, decimal separator comma
  await expect(clean.getByTestId('clean-card-P6')).toHaveClass(/is-open/)
  const typeColumn = clean.getByLabel('Column to change the type of')
  await typeColumn.selectOption('revenue')
  await clean.getByLabel('Decimal separator', { exact: true }).selectOption('comma')
  await clean.getByTestId('build-change-type').click()
  await typeColumn.selectOption('units')
  await clean.getByLabel('Decimal separator', { exact: true }).selectOption('comma')
  await clean.getByTestId('build-change-type').click()
  await clean.getByTestId('clean-check-P6').click()
  await expect(clean.getByTestId('clean-line')).toContainText('Passed')
  await clean.getByTestId('clean-pass-P6').click()
  await expect(clean.getByTestId('clean-done')).toBeVisible()

  // ---- Model
  await step('Model').click()
  const model = page.getByTestId('build-model')
  const link = async (many: string, one: string) => {
    await model.getByTestId(`link-col-${many}`).click()
    await model.getByTestId(`link-col-${one}`).click()
  }
  const create = async () => {
    await expect(model.getByTestId('link-line')).toHaveAttribute('data-key', 'pass')
    await model.getByTestId('link-create').click()
  }

  // L1 by name: the names do not match yet, so the screen sends the learner back to Clean (P4)
  await link('clean_sales-customer_name', 'clean_customers-customer_name')
  await expect(model.getByTestId('link-fix')).toBeVisible()
  await model.getByTestId('link-fix').click()
  await expect(clean.getByTestId('clean-card-P4')).toBeVisible()
  await expect(column).toHaveValue('customer_name')
  await toolbar.getByRole('button', { name: 'Trim', exact: true }).click()
  await clean.getByLabel('Find', { exact: true }).fill('Itiba')
  await clean.getByLabel('Replace with').fill('Ichiba')
  await clean.getByTestId('build-replace').click()
  await clean.getByTestId('clean-check-P4').click()
  await expect(clean.getByTestId('clean-card-P4').getByTestId('clean-line')).toContainText('Passed')
  await clean.getByTestId('clean-back-model').click()
  await link('clean_sales-customer_name', 'clean_customers-customer_name')
  await create()

  // L2 by SKU
  await link('clean_sales-sku_code', 'clean_products-sku_code')
  await create()

  // L3: region_id is R-03 on one side and 3 on the other, so Clean again (P7)
  await link('clean_customers-region_id', 'clean_regions-region_id')
  await model.getByTestId('link-fix').click()
  await expect(clean.getByTestId('clean-card-P7')).toBeVisible()
  await column.selectOption('region_id')
  await toolbar.getByRole('button', { name: 'Extract number' }).click()
  await clean.getByTestId('clean-check-P7').click()
  await expect(clean.getByTestId('clean-card-P7').getByTestId('clean-line')).toContainText('Passed')
  await clean.getByTestId('clean-card-P7').getByTestId('clean-back-model').click()
  await link('clean_customers-region_id', 'clean_regions-region_id')
  await create()

  // the star, then its two links by id
  await model.getByTestId('link-build').click()
  await expect(model.getByRole('tab', { name: 'Star' })).toHaveAttribute('aria-selected', 'true')
  await link('gold_fact_sales-customer_id', 'gold_dim_customer-customer_id')
  await create()
  await link('gold_fact_sales-product_id', 'gold_dim_product-product_id')
  await create()
  await model.getByTestId('model-continue').click()

  // ---- Dashboard
  const dash = page.getByTestId('build-dashboard')
  const tile = async (id: string, blank: string, label: string) => {
    await dash.getByLabel(`The blank of the ${label} tile`).fill(blank)
    await dash.getByTestId(`tile-run-${id}`).click()
    await expect(dash.getByTestId(`tile-${id}`)).toContainText('Passed')
  }
  await expect(dash).toBeVisible()
  await tile('kpi', 'SUM(revenue)', 'Revenue, January to June 2026')
  await expect(dash.getByTestId('tile-kpi-value')).toHaveText(KPI_SHOWN)
  await tile('line', "date_trunc('month', sale_date)", 'Revenue by month')
  await tile('chains', 'customer_id', 'Revenue by chain, January to June 2026')
  await expect(dash.getByTestId('dashboard-done')).toBeVisible()

  // ---- Answer
  await step('Answer').click()
  const answer = page.getByTestId('build-answer')
  await answer.getByTestId('answer-number-A1').fill(A1)
  await answer.getByTestId('answer-check-A1').click()
  await answer.getByTestId('answer-pick-A2').selectOption('2025-08')
  await answer.getByTestId('answer-number-A2').fill('64592.75')
  await answer.getByTestId('answer-check-A2').click()
  await answer.getByTestId('answer-pick-A3').selectOption('Minori')
  await answer.getByTestId('answer-number-A3').fill('90829.5')
  await answer.getByTestId('answer-check-A3').click()
  await expect(answer.getByTestId('answer-done')).toBeVisible()
  await expect(answer.getByTestId('answer-A1')).toContainText('Right')

  expectNoErrors()
})
