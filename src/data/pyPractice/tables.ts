// The tables of the Python practice page, by the variable that holds them in every cell.
export const BOOK_TABLES: Record<string, string> = {
  sellout: 'quaera.fact_sellout',
  sellin: 'quaera.fact_sellin',
  stock: 'quaera.fact_stock',
  targets: 'quaera.fact_target',
  prices: 'quaera.fact_price',
  forecasts: 'quaera.fact_forecast_snapshot',
  products: 'quaera.dim_product',
  customers: 'quaera.dim_customer',
  regions: 'quaera.dim_region',
  reps: 'quaera.dim_rep',
  promos: 'quaera.dim_promo',
  dates: 'quaera.dim_date',
  raw: 'quaera.staging_raw_sellout',
}

/** The book's tables a cell's code names, for a Python tab, where they are not variables yet. */
export const aliasesIn = (code: string) => Object.keys(BOOK_TABLES).filter((a) => new RegExp(`(^|[^\\w.'"])${a}\\b`).test(code))
