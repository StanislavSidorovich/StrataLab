// Fill-the-gaps questions on the demo shop (plan items f1, f2; `#lesson=sql&plan=shop`). This file is what a PHONE gets: the text, the
// gaps and the word bank, never the answers (they are in lessonFillAnswers.ts, which only the projector imports; tests/lessonFill.test.ts
// holds the two together and runs every filled query on the demo rows). Item prefix `f`; see the list in src/core/lesson.ts.
import type { FillQuestion } from '../core/lessonFill'

export const FILL_QUESTIONS: FillQuestion[] = [
  {
    id: 'f1',
    mode: 'choose',
    topic: 'WHERE, GROUP BY, HAVING',
    level: 'easy',
    question: 'Customers with more than one delivered order. Put the words in the gaps: tap a word or drag it.',
    template: "SELECT customer_id, COUNT(*)\nFROM demo.orders\n___ status = 'delivered'\n___ customer_id\n___ COUNT(*) > 1;",
    bank: ['ORDER BY', 'HAVING', 'ON', 'WHERE', 'GROUP BY'],
  },
  {
    id: 'f2',
    mode: 'type',
    topic: 'LEFT JOIN … ON',
    level: 'easy',
    question: 'Every customer with the number of their orders. Type the missing words.',
    template: 'SELECT c.full_name, COUNT(o.order_id) AS orders\nFROM demo.customers AS c\n___ demo.orders AS o ON o.customer_id = ___\nGROUP BY c.customer_id, c.full_name;',
  },
]
