import type { PracticeSection } from './types'

export const WHERE: PracticeSection = {
  id: 'where',
  n: 2,
  title: 'WHERE',
  blocks: [
    {
      kind: 'note',
      text: '`AND` binds tighter than `OR`, so a condition that mixes them needs brackets to say what you mean. `IN (…)` is a short `OR` on one column.',
      syntax: "WHERE channel = 'pharmacy' AND (city = 'Osaka' OR city = 'Tokyo')",
      trap: '`a AND b OR c` is read as `(a AND b) OR c`: the OR branch ignores the rest of the condition.',
    },
    {
      kind: 'example',
      id: 'where-chains-in-two-cities',
      title: 'Chain outlets in two cities',
      sql: `SELECT customer_name, channel, city
FROM quaera.dim_customer
WHERE channel IN ('modern_trade', 'ecom')
  AND (city = 'Kobe' OR city = 'Sendai');`,
    },
    {
      kind: 'task',
      id: 'where-pharmacies-two-cities',
      title: 'Pharmacies in Osaka or Tokyo',
      question: 'Which pharmacies are in Osaka or in Tokyo? Show customer_name, city and chain_name. A pharmacy is a customer whose channel is pharmacy.',
      ordered: false,
      hints: ['The channel and the city are both columns of dim_customer.', 'Two conditions joined by AND, and the second one is itself an OR.', "WHERE channel = 'pharmacy' AND (city = 'Osaka' OR city = 'Tokyo')."],
      solution: `SELECT customer_name, city, chain_name
FROM quaera.dim_customer
WHERE channel = 'pharmacy'
  AND (city = 'Osaka' OR city = 'Tokyo');`,
      traps: [
        {
          sql: `SELECT customer_name, city, chain_name
FROM quaera.dim_customer
WHERE channel = 'pharmacy' AND city = 'Osaka' OR city = 'Tokyo';`,
          says: 'Without brackets this is (pharmacy AND Osaka) OR Tokyo, so every customer in Tokyo comes in, whatever its channel.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'where-single-channel-promos',
      title: 'Promotions aimed at one channel',
      question: "Which promotions with the mechanic '2+1' or 'Discount 30%' ran in a single channel, not in all of them? Show promo_name, channel, start_date and discount_pct. A promotion for every channel has channel 'all'.",
      ordered: false,
      hints: ['dim_promo has the mechanic and the channel.', "IN takes the two mechanics; the channel is a separate condition, not equal to 'all'.", "WHERE mechanic IN ('2+1', 'Discount 30%') AND channel <> 'all'."],
      solution: `SELECT promo_name, channel, start_date, discount_pct
FROM quaera.dim_promo
WHERE mechanic IN ('2+1', 'Discount 30%')
  AND channel <> 'all';`,
    },
    {
      kind: 'note',
      text: '`BETWEEN a AND b` includes both ends. `LIKE` matches a pattern, where `%` stands for any run of characters and `_` for exactly one, and the letters must have the case the data has.',
      syntax: "WHERE units BETWEEN 100 AND 150 AND product_name LIKE 'Fruvia%'",
      trap: "`LIKE '%kids%'` finds nothing when the data says `Kids`.",
    },
    {
      kind: 'example',
      id: 'where-fruvia-mid-price',
      title: 'Mid-priced Fruvia products',
      sql: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE list_price BETWEEN 100 AND 145
  AND product_name LIKE 'Fruvia%';`,
    },
    {
      kind: 'task',
      id: 'where-mid-size-shipments',
      title: 'Mid-size shipments of early 2026',
      question: 'Which sell-in shipments ordered from 2026-01-01 to 2026-03-31, both days included, had between 100 and 150 units, both numbers included? Show sellin_id, order_date, distributor_id, product_id and units.',
      ordered: false,
      hints: ['fact_sellin has order_date and units.', 'Two BETWEEN conditions joined by AND; both ends are included.', "WHERE order_date BETWEEN '2026-01-01' AND '2026-03-31' AND units BETWEEN 100 AND 150."],
      solution: `SELECT sellin_id, order_date, distributor_id, product_id, units
FROM quaera.fact_sellin
WHERE order_date BETWEEN '2026-01-01' AND '2026-03-31'
  AND units BETWEEN 100 AND 150;`,
      traps: [
        {
          sql: `SELECT sellin_id, order_date, distributor_id, product_id, units
FROM quaera.fact_sellin
WHERE order_date BETWEEN '2026-01-01' AND '2026-03-31'
  AND units > 100 AND units < 150;`,
          says: 'BETWEEN keeps both ends, but > and < drop them: shipments of exactly 100 or 150 units are missing.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'where-kids-or-ten-pack',
      title: 'Kids lines and small packs in Pharma',
      question: "Which Pharma products have 'Kids' in their name, or a name ending in 'x10'? Show product_name and list_price. Pharma is the division of the product.",
      ordered: false,
      hints: ['The division is one condition; the two name patterns are alternatives to each other.', "Patterns: '%Kids%' (anywhere in the name) and '%x10' (at the end); write them with the case of the data.", "WHERE division = 'Pharma' AND (product_name LIKE '%Kids%' OR product_name LIKE '%x10')."],
      solution: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE division = 'Pharma'
  AND (product_name LIKE '%Kids%' OR product_name LIKE '%x10');`,
      traps: [
        {
          sql: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE division = 'Pharma'
  AND (product_name LIKE '%kids%' OR product_name LIKE '%x10');`,
          says: "The pattern '%kids%' is lowercase, but the data says 'Kids', so only the x10 packs match.",
        },
      ],
    },
  ],
}
