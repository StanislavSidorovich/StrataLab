// Vote questions d7..d11 on the demo shop (plans `basics` and `basics-join`): SELECT … FROM … WHERE, ORDER BY, TOP, GROUP BY, for a class
// that learns T-SQL. Same shape and tone as d1..d6 (shop.ts appends these to SHOP_VOTES). Every option is T-SQL that Lab translates and
// runs on the demo rows; tests/lessonShop.test.ts runs each one and checks the numbers named here.
//
// Checked against the data: 16 products (the five dearest cost 49.00, 34.00, 27.50, 22.00 and 18.50; the sixth 14.50, so no tie); 21 customers
// from Porto or Braga came by email (29 live in Porto, so the missing brackets give 40); orders by status 871 delivered, 220 shipped, 207
// cancelled, 202 returned; email brought the most customers (67), social the fewest (35), ads is first in the alphabet (49).
import type { WarmQuestion } from '../../core/lesson'
import { MSG_207, MSG_8120 } from './warmup'

const customersFrom = (where: string) => `SELECT customer_id, full_name, city, channel\nFROM demo.customers\nWHERE ${where};`

const withTax = (where: string, orderBy = '') =>
  `SELECT product_name, price, price * 1.23 AS price_with_tax\nFROM demo.products${where ? `\nWHERE ${where}` : ''}${orderBy ? `\nORDER BY ${orderBy}` : ''};`

const products = (top: string, orderBy: string) => `SELECT ${top}product_name, price\nFROM demo.products${orderBy ? `\nORDER BY ${orderBy}` : ''};`

const perStatus = (select: string, group: string) => `SELECT ${select}\nFROM demo.orders${group ? `\nGROUP BY ${group}\nORDER BY status` : ''};`

const topChannel = (group: string, orderBy: string) => `SELECT TOP (1) channel, COUNT(*) AS customers\nFROM demo.customers${group ? `\nGROUP BY ${group}` : ''}\nORDER BY ${orderBy};`

export const BASICS_VOTES: WarmQuestion[] = [
  {
    id: 'd7',
    topic: 'WHERE with AND / OR',
    level: 'easy',
    question: 'List the customers who live in Porto or in Braga and who came to the shop through the channel `email`. Which WHERE does that?',
    right: 0,
    why: 'AND is applied before OR, like multiplication before addition. To say “(Porto or Braga) and email”, put the OR in brackets.',
    options: [
      { text: "(city = 'Porto' OR city = 'Braga') AND channel = 'email'", sql: customersFrom("(city = 'Porto' OR city = 'Braga') AND channel = 'email'"), why: 'Right. The brackets make the OR happen first: 21 customers, all from Porto or Braga, all from email.' },
      { text: "city = 'Porto' OR city = 'Braga' AND channel = 'email'", sql: customersFrom("city = 'Porto' OR city = 'Braga' AND channel = 'email'"), why: 'Tempting, it reads like the sentence. But AND goes first: this is “Porto, or (Braga and email)”, so every customer from Porto comes through, whatever the channel (40 rows, not 21).' },
      { text: "city = 'Porto' AND city = 'Braga' AND channel = 'email'", sql: customersFrom("city = 'Porto' AND city = 'Braga' AND channel = 'email'"), why: 'A customer has one city. It cannot be Porto and Braga at once, so no row passes: 0 rows.' },
      { text: "city = 'Porto, Braga' AND channel = 'email'", sql: customersFrom("city = 'Porto, Braga' AND channel = 'email'"), why: 'This looks for a city whose name is the text “Porto, Braga”. No such city exists: 0 rows.' },
    ],
  },
  {
    id: 'd8',
    topic: 'Alias in WHERE',
    level: 'medium',
    question: 'The list shows each product with `price * 1.23 AS price_with_tax`. You want only the products whose price with tax is over 30. Which WHERE works in SQL Server?',
    right: 1,
    why: 'In SQL Server, WHERE is read before SELECT, so the alias price_with_tax does not exist yet. Repeat the expression in WHERE. (ORDER BY runs after SELECT, so only there can you use the alias.)',
    options: [
      { text: 'WHERE price_with_tax > 30', sql: withTax('price_with_tax > 30'), mssql: MSG_207('price_with_tax'), mssqlOnly: true, why: 'Tempting: the name is right there in SELECT. But WHERE is read before SELECT gives the new name, so SQL Server refuses it. (DuckDB, which runs it for us here, is more lenient.)' },
      { text: 'WHERE price * 1.23 > 30', sql: withTax('price * 1.23 > 30'), why: 'Right. The expression is written out in WHERE: 3 products cost more than 30 with tax.' },
      { text: 'WHERE price > 30', sql: withTax('price > 30'), why: 'It filters the price without tax: 2 products. The French press at 27.50 costs 33.83 with tax, and it is lost.' },
      { text: 'No WHERE, ORDER BY price_with_tax DESC', sql: withTax('', 'price_with_tax DESC'), why: 'The alias is fine in ORDER BY, but ORDER BY only sorts. All 16 products are still listed, not only those over 30.' },
    ],
  },
  {
    id: 'd9',
    topic: 'TOP with ORDER BY',
    level: 'easy',
    question: 'Show the 5 most expensive products with their prices. Which query?',
    right: 2,
    why: 'TOP takes the first rows of whatever comes out, so the order must be set first: ORDER BY price DESC puts the dearest on top, and TOP (5) keeps five.',
    options: [
      { text: 'TOP (5) alone', sql: products('TOP (5) ', ''), why: 'Without ORDER BY the rows come in no promised order, so “the first 5” are just five products. Here, the first five stored, not the dearest.' },
      { text: 'TOP (5) and ORDER BY price', sql: products('TOP (5) ', 'price'), why: 'ORDER BY alone sorts from the smallest: these are the 5 cheapest.' },
      { text: 'TOP (5) and ORDER BY price DESC', sql: products('TOP (5) ', 'price DESC'), why: 'Right. Sorted from the dearest, then the first 5: Hand grinder, Moka pot, French press, Milk frother, Espresso beans.' },
      { text: 'ORDER BY price DESC alone', sql: products('', 'price DESC'), why: 'The sorting is right, but nothing limits it: all 16 products come back, not five.' },
    ],
  },
  {
    id: 'd10',
    topic: 'GROUP BY',
    level: 'easy',
    question: 'How many orders are there with each status? One row per status, with the number of orders. Which query?',
    right: 3,
    why: 'GROUP BY status makes one group per status, and COUNT(*) counts the orders in each group.',
    options: [
      { text: 'COUNT(*), no GROUP BY', sql: perStatus('status, COUNT(*) AS orders', ''), mssql: MSG_8120('status'), why: 'COUNT(*) alone counts the whole table, so the status next to it has no single value. SQL Server refuses the query.' },
      { text: 'GROUP BY order_id, status', sql: perStatus('status, COUNT(*) AS orders', 'order_id, status'), why: 'It runs, which is the danger: every order has its own id, so every group holds one order and every count is 1 (1,500 rows).' },
      { text: 'COUNT(DISTINCT status)', sql: perStatus('COUNT(DISTINCT status) AS orders', ''), why: 'This counts the different statuses: one number, 4. It does not say how many orders each status has.' },
      { text: 'GROUP BY status', sql: perStatus('status, COUNT(*) AS orders', 'status'), why: 'Right. One row per status: 871 delivered, 220 shipped, 207 cancelled, 202 returned.' },
    ],
  },
  {
    id: 'd11',
    topic: 'TOP, GROUP BY, ORDER BY COUNT(*)',
    level: 'medium',
    question: 'Which channel brought the most customers? Show that one channel and its number of customers.',
    right: 1,
    why: 'Group the customers by channel, count each group, sort by that count from the largest, and keep the first row with TOP (1).',
    options: [
      { text: 'ORDER BY channel', sql: topChannel('channel', 'channel'), why: 'It sorts the channel names A to Z, so the first one is the first in the alphabet: ads, with 49 customers. A name says nothing about how many customers it has.' },
      { text: 'ORDER BY COUNT(*) DESC', sql: topChannel('channel', 'COUNT(*) DESC'), why: 'Right. The biggest count first, and TOP (1) keeps it: email, 67 customers.' },
      { text: 'ORDER BY COUNT(*)', sql: topChannel('channel', 'COUNT(*)'), why: 'The default order is from the smallest, so this is the channel with the fewest customers: social, 35.' },
      { text: 'No GROUP BY', sql: topChannel('', 'COUNT(*) DESC'), mssql: MSG_8120('channel'), why: 'Without GROUP BY the count is one number for the whole table, and the channel next to it has no single value. SQL Server refuses the query.' },
    ],
  },
]
