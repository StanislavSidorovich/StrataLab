// The answers of the fill questions (src/data/lessonFill.ts): for each gap the accepted spellings, the first one is shown and run.
// Case, extra spaces and a trailing `;` do not matter (normalizeAnswer). Projector only: the phone bundle never imports this.

export const FILL_ANSWERS: Record<string, string[][]> = {
  f1: [['WHERE'], ['GROUP BY'], ['HAVING']],
  f2: [['LEFT JOIN', 'LEFT OUTER JOIN'], ['c.customer_id']],
  f3: [['WHERE'], ['GROUP BY'], ['ORDER BY']],
  f4: [['TOP'], ['DESC']],
}

/** One sentence after Reveal: why the right words are right, for a first-year student. */
export const FILL_WHY: Record<string, string> = {
  f1: 'WHERE filters single orders before they are grouped, GROUP BY makes one group per customer, HAVING filters the groups by their count.',
  f2: 'LEFT JOIN keeps every customer, ON says which order belongs to which customer: the order’s customer_id equals the customer’s own customer_id.',
  f3: 'WHERE keeps the products over 7 before anything is counted, GROUP BY makes one group per category, ORDER BY COUNT(*) DESC puts the biggest group first, and TOP (3) keeps three.',
  f4: 'TOP (5) keeps the first five rows, and ORDER BY price DESC puts the dearest first. Without DESC the order runs from the cheapest.',
}
