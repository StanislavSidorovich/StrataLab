// The demo shop's tables as the lesson slides and the phone's "Tables" list describe them (what a row is, the columns, the key).
// Metadata only, no rows and no engine: the phone page imports this and must stay small. The tables themselves are src/data/demo.ts
// (tests/lessonShop.test.ts keeps the two lists equal).
import type { PracticeTable } from './practiceBook'

export const SHOP_TABLES: PracticeTable[] = [
  { name: 'customers', row: 'one customer of the shop', columns: ['customer_id', 'full_name', 'city', 'signup_date', 'channel'] },
  { name: 'orders', row: 'one order a customer placed', columns: ['order_id', 'customer_id', 'ordered_at', 'status'] },
  { name: 'order_items', row: 'one line of an order: one product, how many', columns: ['order_id', 'line_no', 'product_id', 'quantity'] },
  { name: 'products', row: 'one product the shop sells', columns: ['product_id', 'product_name', 'category', 'price'] },
]

/** Links the `<x>_id` rule cannot find: order_items starts with order_id, which is the key of orders, not its own. */
export const SHOP_KEYS = ['order_items.order_id → orders.order_id']
