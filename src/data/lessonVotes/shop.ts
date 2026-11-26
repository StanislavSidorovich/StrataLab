// Vote questions on the demo shop (`#lesson=sql&plan=shop`, items d1..d6): the first lesson for a class that knows no business
// terms. Tables: demo.customers, demo.orders, demo.order_items, demo.products (src/data/demo.ts, fixed seed, 200 customers,
// 1,500 orders). Same shape as the warm-up questions, so the slide and the click-to-run work the same way.
//
// Checked against the data: every customer has at least one order and no demo column holds NULL, so the "NULL" cases come from a
// LEFT JOIN that matches only returned orders (74 of the 200 customers never returned one). tests/lessonShop.test.ts runs every
// option: the right one answers, each wrong one fails or answers differently, and the numbers the questions state are the data's.
import type { WarmQuestion } from '../../core/lesson'
import { MSG_147, MSG_8120 } from './warmup'
import { BASICS_VOTES } from './basics'

/** Orders per customer; `where`, `groupBy`, `having` and `orderBy` are what the question is about. */
const deliveredBy = (where: string, groupBy: string, having: string, orderBy = 'customer_id') =>
  `SELECT customer_id, COUNT(*) AS orders\nFROM demo.orders${where ? `\nWHERE ${where}` : ''}\nGROUP BY ${groupBy}${having ? `\nHAVING ${having}` : ''}\nORDER BY ${orderBy};`

/** Each customer with how many returned orders they have: the join and the counted expression change. */
const returnedBy = (join: string, count = 'COUNT(o.order_id)') =>
  `SELECT c.customer_id, c.full_name, ${count} AS returned_orders\nFROM demo.customers AS c\n${join} demo.orders AS o ON o.customer_id = c.customer_id AND o.status = 'returned'\nGROUP BY c.customer_id, c.full_name\nORDER BY returned_orders, c.customer_id;`

/** Customers with no returned order, the status test placed in different ways. */
const noReturns = (on: string, where: string, join = 'LEFT JOIN') =>
  `SELECT c.customer_id, c.full_name\nFROM demo.customers AS c\n${join} demo.orders AS o ON ${on}${where ? `\nWHERE ${where}` : ''}\nORDER BY c.customer_id;`

const ordersWithName = (groupBy: string) =>
  `SELECT c.full_name, COUNT(*) AS orders\nFROM demo.customers AS c\nJOIN demo.orders AS o ON o.customer_id = c.customer_id${groupBy ? `\nGROUP BY ${groupBy}` : ''}\nORDER BY c.full_name, orders;`

const countDelivered = (expr: string) => `SELECT ${expr} AS answer\nFROM demo.orders\nWHERE status = 'delivered';`

export const SHOP_VOTES: WarmQuestion[] = [
  {
    id: 'd1',
    topic: 'WHERE vs HAVING',
    level: 'easy',
    question: 'You count the delivered orders of each customer and want only customers with more than 5 of them. Which clause filters on that count?',
    right: 1,
    why: 'HAVING works on groups, after the counting, so it can use COUNT. WHERE works on single orders, before anything is counted.',
    options: [
      { text: 'WHERE', sql: deliveredBy("status = 'delivered' AND COUNT(*) > 5", 'customer_id', ''), mssql: MSG_147, why: 'Tempting, because WHERE is the filter everyone knows. But when WHERE runs, nothing has been counted yet.' },
      { text: 'HAVING', sql: deliveredBy("status = 'delivered'", 'customer_id', 'COUNT(*) > 5'), why: 'Right. The orders are filtered by WHERE, counted per customer, and HAVING keeps the customers whose count is above 5.' },
      { text: 'GROUP BY', sql: deliveredBy("status = 'delivered'", 'customer_id', ''), why: 'GROUP BY builds the groups (one per customer); it never removes one. Every customer is still there.' },
      { text: 'ORDER BY', sql: deliveredBy("status = 'delivered'", 'customer_id', '', 'orders DESC, customer_id'), why: 'ORDER BY only sorts the rows that come out. The customers with 1 or 2 orders are still listed.' },
    ],
  },
  {
    id: 'd2',
    topic: 'INNER vs LEFT JOIN',
    level: 'easy',
    question: 'List every customer with the number of orders they returned. 74 of the 200 customers never returned anything, and they must still be on the list, with 0. Which join?',
    right: 0,
    why: 'LEFT JOIN keeps every row of the left table (the customers). Where nothing matches, the order columns stay empty (NULL), and the count is 0.',
    options: [
      { text: 'LEFT JOIN', sql: returnedBy('LEFT JOIN'), why: 'Right. All 200 customers are listed; the 74 with no returned order get 0.' },
      { text: 'INNER JOIN', sql: returnedBy('INNER JOIN'), why: 'INNER JOIN keeps only customers that have a match. The 74 who never returned anything disappear from the list.' },
      { text: 'RIGHT JOIN', sql: returnedBy('RIGHT JOIN'), why: 'It keeps all rows of the right table (orders), not all customers. The orders that were not returned pile up in one unnamed row.' },
      {
        text: 'CROSS JOIN',
        sql: `SELECT c.customer_id, c.full_name, COUNT(o.order_id) AS returned_orders\nFROM demo.customers AS c\nCROSS JOIN demo.orders AS o\nWHERE o.status = 'returned'\nGROUP BY c.customer_id, c.full_name\nORDER BY returned_orders, c.customer_id;`,
        why: 'CROSS JOIN pairs every customer with every returned order, so every customer “has” all 202 of them.',
      },
    ],
  },
  {
    id: 'd3',
    topic: 'COUNT(*) vs COUNT(column)',
    level: 'easy',
    question: 'The same list with a LEFT JOIN. A customer with no returned order gets one row where the order columns are empty (NULL). Which expression gives such a customer 0?',
    right: 3,
    why: 'COUNT(column) counts only rows where that column is not NULL. COUNT(*) counts rows, and the empty row is a row too.',
    options: [
      { text: 'COUNT(*)', sql: returnedBy('LEFT JOIN', 'COUNT(*)'), why: 'Tempting: “count the rows”. But a customer with no returned order still has one row (with NULLs), so it shows 1 instead of 0.' },
      { text: 'COUNT(c.customer_id)', sql: returnedBy('LEFT JOIN', 'COUNT(c.customer_id)'), why: 'The customer’s own id is never empty, so this counts the row again: 1 for a customer with no returned order.' },
      { text: 'SUM(o.order_id)', sql: returnedBy('LEFT JOIN', 'SUM(o.order_id)'), why: 'It adds up the order ids. That is not a count, and for a customer with no order it is empty (NULL), not 0.' },
      { text: 'COUNT(o.order_id)', sql: returnedBy('LEFT JOIN'), why: 'Right. order_id is empty in the unmatched row, so it is not counted: 0.' },
    ],
  },
  {
    id: 'd4',
    topic: 'ON vs WHERE in a LEFT JOIN',
    level: 'medium',
    question: "Which customers never returned an order? You LEFT JOIN the orders and keep the customers that found no match. Where does the test `status = 'returned'` go?",
    right: 2,
    why: 'In a LEFT JOIN the ON part decides what counts as a match; WHERE then filters the finished rows. The status belongs to the match, so it goes in ON, and WHERE only asks “was there no match?”.',
    options: [
      {
        text: 'In WHERE, with the empty test',
        sql: noReturns('o.customer_id = c.customer_id', "o.status = 'returned' AND o.order_id IS NULL"),
        why: 'A row with no match has no status, so “status is returned” and “no order” can never both be true: 0 rows.',
      },
      { text: 'In WHERE, as “not returned”', sql: noReturns('o.customer_id = c.customer_id', "o.status <> 'returned'"), why: 'This lists customers that have some order that was not returned, once per order. A customer with a returned order and a delivered one is listed.' },
      { text: 'In ON, then WHERE order_id IS NULL', sql: noReturns("o.customer_id = c.customer_id AND o.status = 'returned'", 'o.order_id IS NULL'), why: 'Right. Only returned orders can match; the customers left with no match are the 74 who never returned one.' },
      { text: 'INNER JOIN, in ON', sql: noReturns("o.customer_id = c.customer_id AND o.status = 'returned'", '', 'JOIN'), why: 'It gives the opposite: INNER JOIN keeps only the customers that did return something, one row per returned order.' },
    ],
  },
  {
    id: 'd5',
    topic: 'GROUP BY with a name',
    level: 'easy',
    question: 'You list each customer’s name with their number of orders, one row per customer. Which GROUP BY works?',
    right: 2,
    why: 'Every column in the SELECT list must be in GROUP BY or inside an aggregate like COUNT. Group by the customer’s id as well as the name, so two customers with the same name stay apart.',
    options: [
      { text: 'GROUP BY c.customer_id', sql: ordersWithName('c.customer_id'), mssql: MSG_8120('full_name'), why: 'Tempting: the id already tells customers apart. But full_name is in the SELECT list and is neither grouped nor counted, so SQL Server refuses.' },
      { text: 'GROUP BY c.full_name', sql: ordersWithName('c.full_name'), why: 'It runs, which is the danger: customers who share a name are merged into one row with their orders added together.' },
      { text: 'GROUP BY c.customer_id, c.full_name', sql: ordersWithName('c.customer_id, c.full_name'), why: 'Right. One group per customer, and the name is in GROUP BY too.' },
      { text: 'No GROUP BY at all', sql: ordersWithName(''), mssql: MSG_8120('full_name'), why: 'COUNT(*) alone would give one number for the whole table, so a name next to it has no single value.' },
    ],
  },
  {
    id: 'd6',
    topic: 'COUNT(DISTINCT)',
    level: 'easy',
    question: 'How many different customers have at least one delivered order? (Some customers have several.)',
    right: 1,
    why: 'DISTINCT inside COUNT counts every customer once, however many orders they have. Without it you count orders.',
    options: [
      { text: 'COUNT(*)', sql: countDelivered('COUNT(*)'), why: 'It counts delivered orders (871), not customers: a customer with 5 orders is counted 5 times.' },
      { text: 'COUNT(DISTINCT customer_id)', sql: countDelivered('COUNT(DISTINCT customer_id)'), why: 'Right. 197 different customers.' },
      { text: 'COUNT(customer_id)', sql: countDelivered('COUNT(customer_id)'), why: 'Tempting, but it counts the rows that have a customer_id: every delivered order, so 871 again.' },
      { text: 'COUNT(DISTINCT status)', sql: countDelivered('COUNT(DISTINCT status)'), why: 'This counts different statuses. Every row here is delivered, so the answer is 1.' },
    ],
  },
  ...BASICS_VOTES,
]
