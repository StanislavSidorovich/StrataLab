import type { PracticeSection } from './types'

export const DATA_MAP: PracticeSection = {
  id: 'data',
  n: 0,
  title: 'The data',
  blocks: [
    {
      kind: 'note',
      text: 'Kaiyo Trading is a distributor of food and over-the-counter medicine in Japan, with data from January 2024 to June 2026. Kaiyo ships to distributors (sell-in), and outlets sell to shoppers (sell-out): most questions are about one or the other, so read which one is asked.',
      syntax: 'SELECT … FROM quaera.fact_sellout  -- every table is in the schema quaera',
    },
    {
      kind: 'tables',
      tables: [
        { name: 'fact_sellout', row: 'an outlet sold a product in a week', columns: ['week_start', 'customer_id', 'product_id', 'units', 'revenue', 'avg_price', 'promo_id'] },
        { name: 'fact_sellin', row: 'Kaiyo shipped a product to a distributor', columns: ['order_date', 'ship_date', 'month_start', 'distributor_id', 'product_id', 'units', 'gross_amount', 'discount_amount', 'net_amount'] },
        { name: 'fact_stock', row: 'a distributor’s stock of a product at month end', columns: ['month_start', 'distributor_id', 'product_id', 'units_on_hand', 'units_in_transit'] },
        { name: 'fact_target', row: 'a rep’s monthly plan for a division', columns: ['month_start', 'rep_id', 'division', 'target_units', 'target_revenue'] },
        { name: 'fact_price', row: 'a product’s price in a month', columns: ['month_start', 'product_id', 'list_price', 'promo_price'] },
        { name: 'fact_forecast_snapshot', row: 'a forecast made in one month for a later one', columns: ['snapshot_month', 'month_start', 'lag_months', 'product_id', 'forecast_units'] },
        { name: 'dim_product', row: 'a product', columns: ['product_id', 'sku_code', 'product_name', 'brand', 'category', 'division', 'list_price'] },
        { name: 'dim_customer', row: 'an outlet or a distributor', columns: ['customer_id', 'customer_name', 'channel', 'chain_name', 'region_id', 'city', 'served_by_distributor_id', 'rep_id'] },
        { name: 'dim_region', row: 'a region', columns: ['region_id', 'region_name', 'macro_region', 'population', 'tier'] },
        { name: 'dim_rep', row: 'a sales rep or a manager', columns: ['rep_id', 'rep_name', 'team', 'role', 'region_id', 'manager_id'] },
        { name: 'dim_promo', row: 'a promotion', columns: ['promo_id', 'promo_name', 'brand', 'mechanic', 'start_date', 'end_date', 'discount_pct', 'channel'] },
        { name: 'dim_date', row: 'a day', columns: ['date_id', 'year', 'quarter', 'month', 'month_start', 'week_start', 'day_name', 'is_weekend'] },
      ],
    },
    {
      kind: 'example',
      id: 'data-first-look',
      title: 'A first look at a table',
      sql: `-- The first Run loads the dataset and the T-SQL translator, once.
SELECT TOP (5) *
FROM quaera.fact_sellout
ORDER BY week_start, sellout_id;`,
    },
  ],
}
