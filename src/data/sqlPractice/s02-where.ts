import type { PracticeSection } from '../practiceBook'

export const WHERE: PracticeSection = {
  id: 'where',
  n: 2,
  title: 'WHERE',
  blocks: [
    {
      kind: 'note',
      text: '`WHERE` keeps only the rows that meet a condition, so a report shows the part of the table that was asked for. Compare a column with `=`, `<>`, `<`, `>`, `<=` or `>=`; text goes in quotes and must have the case the data has.',
      syntax: "WHERE channel = 'pharmacy'",
      trap: "`WHERE division = 'pharma'` finds nothing when the data says `Pharma`.",
    },
    {
      kind: 'example',
      id: 'where-pricey-pharma',
      title: 'Products over 400',
      code: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE list_price > 400
ORDER BY list_price DESC, product_id;`,
    },
    {
      kind: 'task',
      id: 'where-yellow-tag-promos',
      title: 'Yellow tag promotions',
      question: "Which promotions used the mechanic 'Yellow tag'? Show promo_name, brand, start_date and discount_pct.",
      ordered: false,
      skills: ['where'],
      hints: ['The mechanic is a column of dim_promo.', 'One condition: the column equals a text, written in quotes.', "WHERE mechanic = 'Yellow tag'."],
      solution: `SELECT promo_name, brand, start_date, discount_pct
FROM quaera.dim_promo
WHERE mechanic = 'Yellow tag';`,
    },
    {
      kind: 'task',
      id: 'where-big-regions',
      title: 'Regions over five million people',
      question: 'Which regions have more than 5,000,000 people? Show region_name, macro_region and population.',
      ordered: false,
      skills: ['where'],
      hints: ['The population is a column of dim_region.', 'A number needs no quotes; compare with >.', 'WHERE population > 5000000.'],
      solution: `SELECT region_name, macro_region, population
FROM quaera.dim_region
WHERE population > 5000000;`,
    },
    {
      kind: 'note',
      text: '`AND` keeps the rows that meet both conditions, and `OR` the rows that meet either one. `AND` binds tighter than `OR`, so a condition that mixes them needs brackets to say what you mean.',
      syntax: "WHERE division = 'FMCG' AND (list_price < 50 OR list_price > 140)",
      trap: '`a AND b OR c` is read as `(a AND b) OR c`: the OR branch ignores the rest of the condition.',
    },
    {
      kind: 'example',
      id: 'where-fmcg-cheap-or-dear',
      title: 'FMCG products at the two ends of the price list',
      code: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE division = 'FMCG'
  AND (list_price < 50 OR list_price > 140);`,
    },
    {
      kind: 'task',
      id: 'where-pharma-over-300',
      title: 'Pharma products over 300',
      question: 'Which Pharma products have a list_price over 300? Show product_name, brand and list_price.',
      ordered: false,
      skills: ['where', 'where-and-or'],
      hints: ['The division and the price are both columns of dim_product.', 'Two conditions that must both hold, joined by AND.', "WHERE division = 'Pharma' AND list_price > 300."],
      solution: `SELECT product_name, brand, list_price
FROM quaera.dim_product
WHERE division = 'Pharma'
  AND list_price > 300;`,
    },
    {
      kind: 'task',
      id: 'where-kansai-or-kyushu',
      title: 'Kansai and Kyushu regions',
      question: 'Which regions belong to the macro region Kansai or to Kyushu? Show region_name and macro_region.',
      ordered: false,
      skills: ['where', 'where-and-or'],
      hints: ['macro_region is a column of dim_region.', 'Two conditions on the same column, either of which may hold: OR.', "WHERE macro_region = 'Kansai' OR macro_region = 'Kyushu'."],
      solution: `SELECT region_name, macro_region
FROM quaera.dim_region
WHERE macro_region = 'Kansai'
  OR macro_region = 'Kyushu';`,
    },
    {
      kind: 'task',
      id: 'where-pharmacies-two-cities',
      title: 'Pharmacies in Osaka or Tokyo',
      question: 'Which pharmacies are in Osaka or in Tokyo? Show customer_name, city and chain_name. A pharmacy is a customer whose channel is pharmacy.',
      ordered: false,
      skills: ['where', 'where-and-or'],
      hints: ['The channel and the city are both columns of dim_customer.', 'Two conditions joined by AND, and the second one is itself an OR.', "WHERE channel = 'pharmacy' AND (city = 'Osaka' OR city = 'Tokyo')."],
      solution: `SELECT customer_name, city, chain_name
FROM quaera.dim_customer
WHERE channel = 'pharmacy'
  AND (city = 'Osaka' OR city = 'Tokyo');`,
      traps: [
        {
          code: `SELECT customer_name, city, chain_name
FROM quaera.dim_customer
WHERE channel = 'pharmacy' AND city = 'Osaka' OR city = 'Tokyo';`,
          says: 'Without brackets this is (pharmacy AND Osaka) OR Tokyo, so every customer in Tokyo comes in, whatever its channel.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`IN (…)` is a short `OR` on one column: it keeps the rows whose value is any of the listed ones. Use it when the list is longer than two.',
      syntax: "WHERE brand IN ('Aqualis', 'Fruvia', 'Krosti')",
    },
    {
      kind: 'example',
      id: 'where-chains-in-two-cities',
      title: 'Chain outlets in two cities',
      code: `SELECT customer_name, channel, city
FROM quaera.dim_customer
WHERE channel IN ('modern_trade', 'ecom')
  AND (city = 'Kobe' OR city = 'Sendai');`,
    },
    {
      kind: 'task',
      id: 'where-three-brands',
      title: 'Three brands of the range',
      question: 'Which products belong to the brands Nettora, Milvara or Krosti? Show product_name, brand and list_price.',
      ordered: false,
      skills: ['where', 'where-in'],
      hints: ['The brand is a column of dim_product.', 'One column, three possible values: IN with a list.', "WHERE brand IN ('Nettora', 'Milvara', 'Krosti')."],
      solution: `SELECT product_name, brand, list_price
FROM quaera.dim_product
WHERE brand IN ('Nettora', 'Milvara', 'Krosti');`,
    },
    {
      kind: 'task',
      id: 'where-single-channel-promos',
      title: 'Promotions aimed at one channel',
      question: "Which promotions with the value '2+1' or 'Discount 30%' in the mechanic column ran in a single channel, not in all of them? Show promo_name, channel, start_date and discount_pct. A promotion for every channel has channel 'all'.",
      ordered: false,
      skills: ['where', 'where-in', 'where-and-or'],
      hints: ['dim_promo has the mechanic and the channel.', "IN takes the two mechanics; the channel is a separate condition, not equal to 'all'.", "WHERE mechanic IN ('2+1', 'Discount 30%') AND channel <> 'all'."],
      solution: `SELECT promo_name, channel, start_date, discount_pct
FROM quaera.dim_promo
WHERE mechanic IN ('2+1', 'Discount 30%')
  AND channel <> 'all';`,
    },
    {
      kind: 'note',
      text: "`BETWEEN a AND b` keeps the values from a to b, both ends included, which is the natural way to ask for a period or a range. A date is written in quotes, year first: `'2026-01-31'`.",
      syntax: "WHERE order_date BETWEEN '2026-01-01' AND '2026-01-31'",
      trap: '`> a AND < b` drops the rows that sit exactly on a or on b.',
    },
    {
      kind: 'task',
      id: 'where-promos-first-half-2025',
      title: 'Promotions started in early 2025',
      question: 'Which promotions started from 2025-01-01 to 2025-06-30, both days included? Show promo_name, mechanic and start_date.',
      ordered: false,
      skills: ['where', 'where-between'],
      hints: ['start_date is a column of dim_promo.', 'One BETWEEN with the two dates in quotes; both ends are included.', "WHERE start_date BETWEEN '2025-01-01' AND '2025-06-30'."],
      solution: `SELECT promo_name, mechanic, start_date
FROM quaera.dim_promo
WHERE start_date BETWEEN '2025-01-01' AND '2025-06-30';`,
    },
    {
      kind: 'task',
      id: 'where-mid-size-shipments',
      title: 'Mid-size shipments of early 2026',
      question: 'Which sell-in shipments ordered from 2026-01-01 to 2026-03-31, both days included, had between 100 and 150 units, both numbers included? Show sellin_id, order_date, distributor_id, product_id and units.',
      ordered: false,
      skills: ['where', 'where-between', 'where-and-or'],
      hints: ['fact_sellin has order_date and units.', 'Two BETWEEN conditions joined by AND; both ends are included, and the dates go in quotes.', "WHERE order_date BETWEEN '2026-01-01' AND '2026-03-31' AND units BETWEEN 100 AND 150."],
      solution: `SELECT sellin_id, order_date, distributor_id, product_id, units
FROM quaera.fact_sellin
WHERE order_date BETWEEN '2026-01-01' AND '2026-03-31'
  AND units BETWEEN 100 AND 150;`,
      traps: [
        {
          code: `SELECT sellin_id, order_date, distributor_id, product_id, units
FROM quaera.fact_sellin
WHERE order_date BETWEEN '2026-01-01' AND '2026-03-31'
  AND units > 100 AND units < 150;`,
          says: 'BETWEEN keeps both ends, but > and < drop them: shipments of exactly 100 or 150 units are missing.',
        },
      ],
    },
    {
      kind: 'note',
      text: "`LIKE` matches a pattern, which finds names when you only remember a part of them. `%` stands for any run of characters and `_` for exactly one, and the letters must have the case the data has.",
      syntax: "WHERE product_name LIKE 'Fruvia%'",
      trap: "`LIKE '%kids%'` finds nothing when the data says `Kids`.",
    },
    {
      kind: 'example',
      id: 'where-fruvia-mid-price',
      title: 'Mid-priced Fruvia products',
      code: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE list_price BETWEEN 100 AND 145
  AND product_name LIKE 'Fruvia%';`,
    },
    {
      kind: 'task',
      id: 'where-trading-companies',
      title: 'Customers with Trading in the name',
      question: "Which customers have 'Trading' somewhere in their customer_name? Show customer_name, channel and city.",
      ordered: false,
      skills: ['where', 'where-like'],
      hints: ['The name is a column of dim_customer.', "The word can sit anywhere, so put % on both sides of it.", "WHERE customer_name LIKE '%Trading%'."],
      solution: `SELECT customer_name, channel, city
FROM quaera.dim_customer
WHERE customer_name LIKE '%Trading%';`,
    },
    {
      kind: 'task',
      id: 'where-store-promos-2025',
      title: 'Store promotions of 2025',
      question: "Which promotions started in 2025, from 2025-01-01 to 2025-12-31, and ran in the channel 'modern_trade' or in 'traditional_trade'? Show promo_name, channel and start_date.",
      ordered: false,
      skills: ['where', 'where-in', 'where-between', 'where-and-or'],
      hints: ['dim_promo has the channel and the start date.', 'One IN for the two channels, one BETWEEN for the year, joined by AND.', "WHERE channel IN ('modern_trade', 'traditional_trade') AND start_date BETWEEN '2025-01-01' AND '2025-12-31'."],
      solution: `SELECT promo_name, channel, start_date
FROM quaera.dim_promo
WHERE channel IN ('modern_trade', 'traditional_trade')
  AND start_date BETWEEN '2025-01-01' AND '2025-12-31';`,
    },
    {
      kind: 'task',
      id: 'where-kids-or-ten-pack',
      title: 'Kids lines and small packs in Pharma',
      question: "Which Pharma products have 'Kids' in their name, or a name ending in 'x10'? Show product_name and list_price. Pharma is the division of the product.",
      ordered: false,
      skills: ['where', 'where-and-or', 'where-like'],
      hints: ['The division is one condition; the two name patterns are alternatives to each other.', "Patterns: '%Kids%' (anywhere in the name) and '%x10' (at the end); write them with the case of the data.", "WHERE division = 'Pharma' AND (product_name LIKE '%Kids%' OR product_name LIKE '%x10')."],
      solution: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE division = 'Pharma'
  AND (product_name LIKE '%Kids%' OR product_name LIKE '%x10');`,
      traps: [
        {
          code: `SELECT product_name, list_price
FROM quaera.dim_product
WHERE division = 'Pharma'
  AND (product_name LIKE '%kids%' OR product_name LIKE '%x10');`,
          says: "The pattern '%kids%' is lowercase, but the data says 'Kids', so only the x10 packs match.",
        },
      ],
    },
  ],
}
