import type { PracticeSection } from '../practiceBook'

export const DATA_MAP: PracticeSection = {
  id: 'data',
  n: 0,
  part: 'Explore',
  title: 'The data',
  blocks: [
    {
      kind: 'note',
      text: 'Kaiyo Trading is a distributor of food and over-the-counter medicine in Japan, with data from January 2024 to June 2026. Kaiyo ships to distributors (sell-in), and outlets sell to shoppers (sell-out): most questions are about one or the other, so read which one is asked.',
      syntax: 'sellout.head()  # every table is a variable, ready in every cell',
    },
    {
      kind: 'note',
      text: 'There are 13 tables and you do not need them all at once. The first sections use `sellout` and `products`; each later section says which table it adds.',
    },
    {
      kind: 'tables',
      tables: [
        { name: 'fact_sellout', alias: 'sellout', row: 'an outlet sold a product in a week', columns: ['sellout_id', 'week_start', 'customer_id', 'product_id', 'units', 'revenue', 'avg_price', 'promo_id'] },
        { name: 'fact_sellin', alias: 'sellin', row: 'Kaiyo shipped a product to a distributor', columns: ['sellin_id', 'order_date', 'ship_date', 'month_start', 'distributor_id', 'product_id', 'units', 'gross_amount', 'discount_amount', 'net_amount'] },
        { name: 'fact_stock', alias: 'stock', row: 'a distributor’s stock of a product at month end', columns: ['stock_id', 'month_start', 'month_end', 'distributor_id', 'product_id', 'units_on_hand', 'units_in_transit'] },
        { name: 'fact_target', alias: 'targets', row: 'a rep’s monthly plan for a division', columns: ['target_id', 'month_start', 'rep_id', 'division', 'target_units', 'target_revenue'] },
        { name: 'fact_price', alias: 'prices', row: 'a product’s price in a month', columns: ['price_id', 'month_start', 'product_id', 'list_price', 'promo_price'] },
        { name: 'fact_forecast_snapshot', alias: 'forecasts', row: 'a forecast made in one month for a later one', columns: ['forecast_id', 'snapshot_month', 'month_start', 'lag_months', 'product_id', 'forecast_units'] },
        { name: 'dim_product', alias: 'products', row: 'a product', columns: ['product_id', 'sku_code', 'product_name', 'brand', 'category', 'subcategory', 'division', 'pack_size', 'unit', 'list_price', 'launch_date'] },
        { name: 'dim_customer', alias: 'customers', row: 'an outlet or a distributor', columns: ['customer_id', 'customer_name', 'customer_type', 'channel', 'chain_name', 'region_id', 'city', 'opened_date', 'is_active', 'served_by_distributor_id', 'rep_id'] },
        { name: 'dim_region', alias: 'regions', row: 'a region', columns: ['region_id', 'region_name', 'macro_region', 'population', 'tier'] },
        { name: 'dim_rep', alias: 'reps', row: 'a sales rep or a manager', columns: ['rep_id', 'rep_name', 'team', 'role', 'region_id', 'hired_date', 'manager_id'] },
        { name: 'dim_promo', alias: 'promos', row: 'a promotion', columns: ['promo_id', 'promo_name', 'brand', 'mechanic', 'start_date', 'end_date', 'discount_pct', 'channel'] },
        { name: 'dim_date', alias: 'dates', row: 'a day', columns: ['date_id', 'year', 'quarter', 'month', 'month_name', 'month_start', 'week_start', 'iso_week', 'day_of_week', 'day_name', 'is_weekend'] },
        { name: 'staging_raw_sellout', alias: 'raw', row: 'a line of an unclean sales export', columns: ['raw_id', 'sale_date', 'customer_name', 'sku_code', 'units', 'revenue', 'source_file'] },
      ],
    },
    {
      kind: 'example',
      id: 'py-data-first-look',
      title: 'The first rows of a table',
      code: `# The first Run loads the tables once. The last line is what the cell shows.
sellout.head()`,
    },
  ],
}
