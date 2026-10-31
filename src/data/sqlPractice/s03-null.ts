import type { PracticeSection } from '../practiceBook'

export const NULL: PracticeSection = {
  id: 'null',
  n: 3,
  title: 'NULL',
  blocks: [
    {
      kind: 'note',
      text: "NULL means no value, and a comparison with no value is never true, so `= NULL` and `<> 'x'` both skip those rows. Ask with `IS NULL` or `IS NOT NULL`.",
      syntax: 'WHERE manager_id IS NULL',
      trap: "`chain_name = NULL` returns no rows at all, and `chain_name <> 'Prima'` quietly drops the customers with no chain.",
    },
    {
      kind: 'example',
      id: 'null-reps-without-manager',
      title: 'People with no manager',
      code: `SELECT rep_name, team, role
FROM quaera.dim_rep
WHERE manager_id IS NULL;`,
    },
    {
      kind: 'task',
      id: 'null-customers-without-rep',
      title: 'Customers with no sales rep',
      question: 'Which customers have no sales rep assigned? Show customer_name, channel and city.',
      ordered: false,
      skills: ['is-null'],
      hints: ['The rep is the column rep_id of dim_customer.', 'No rep means the column holds NULL; = NULL never matches.', 'WHERE rep_id IS NULL.'],
      solution: `SELECT customer_name, channel, city
FROM quaera.dim_customer
WHERE rep_id IS NULL;`,
      traps: [
        {
          code: `SELECT customer_name, channel, city
FROM quaera.dim_customer
WHERE rep_id = NULL;`,
          says: 'Nothing equals NULL, not even NULL, so this finds no rows. Use IS NULL.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'null-reps-with-manager',
      title: 'People who report to a manager',
      question: 'Which people on the sales team report to a manager? Show rep_name, team and manager_id.',
      ordered: false,
      skills: ['is-null'],
      hints: ['The manager of a person is the column manager_id of dim_rep.', 'Reporting to someone means the column is not empty.', 'WHERE manager_id IS NOT NULL.'],
      solution: `SELECT rep_name, team, manager_id
FROM quaera.dim_rep
WHERE manager_id IS NOT NULL;`,
    },
    {
      kind: 'task',
      id: 'null-independent-pharmacies',
      title: 'Independent pharmacies',
      question: 'Which pharmacies do not belong to any chain? Show customer_name and city. A pharmacy is a customer whose channel is pharmacy, and an independent one has no chain_name.',
      ordered: false,
      skills: ['is-null', 'where-and-or'],
      hints: ['An independent pharmacy has NULL in chain_name.', 'Two conditions: the channel, and the missing chain.', "WHERE channel = 'pharmacy' AND chain_name IS NULL."],
      solution: `SELECT customer_name, city
FROM quaera.dim_customer
WHERE channel = 'pharmacy'
  AND chain_name IS NULL;`,
      traps: [
        {
          code: `SELECT customer_name, city
FROM quaera.dim_customer
WHERE channel = 'pharmacy'
  AND chain_name = NULL;`,
          says: 'Nothing equals NULL, not even NULL, so this finds no rows. Use IS NULL.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`ISNULL(x, y)` and `COALESCE(x, y, …)` give y when x is NULL, so a gap can be shown as a word or counted as a zero. `COALESCE` is the standard one and takes any number of arguments.',
      syntax: "COALESCE(chain_name, 'Independent') AS chain",
    },
    {
      kind: 'example',
      id: 'null-pharmacy-chain-label',
      title: 'A label for every pharmacy',
      code: `SELECT customer_name, ISNULL(chain_name, 'No chain') AS chain
FROM quaera.dim_customer
WHERE channel = 'pharmacy';`,
    },
    {
      kind: 'task',
      id: 'null-boss-of-everyone',
      title: 'Who each person answers to',
      question: "Who does each person on the sales team answer to? Show rep_name and boss_id, where boss_id is the manager_id, or the person's own rep_id when there is no manager.",
      ordered: false,
      skills: ['coalesce'],
      hints: ['dim_rep has rep_id and manager_id; managers have no manager_id.', 'COALESCE takes the first value that is not NULL, in the order you list them.', 'SELECT rep_name, COALESCE(manager_id, rep_id) AS boss_id.'],
      solution: `SELECT rep_name, COALESCE(manager_id, rep_id) AS boss_id
FROM quaera.dim_rep;`,
    },
    {
      kind: 'task',
      id: 'null-pharmacies-outside-farmalux',
      title: 'Pharmacies outside Farmalux',
      question: "Which pharmacies are not part of the Farmalux chain? Independents count: they are not in Farmalux either. Show customer_name and chain, where chain is the chain_name, or 'Independent' when there is none.",
      ordered: false,
      skills: ['is-null', 'coalesce', 'where-and-or'],
      hints: ['Not Farmalux includes the pharmacies with no chain at all.', "A test like chain_name <> 'Farmalux' is not true for NULL, so add the missing chain as an alternative, in brackets.", "WHERE channel = 'pharmacy' AND (chain_name <> 'Farmalux' OR chain_name IS NULL), and COALESCE(chain_name, 'Independent') AS chain."],
      solution: `SELECT customer_name, COALESCE(chain_name, 'Independent') AS chain
FROM quaera.dim_customer
WHERE channel = 'pharmacy'
  AND (chain_name <> 'Farmalux' OR chain_name IS NULL);`,
      traps: [
        {
          code: `SELECT customer_name, COALESCE(chain_name, 'Independent') AS chain
FROM quaera.dim_customer
WHERE channel = 'pharmacy'
  AND chain_name <> 'Farmalux';`,
          says: "For an independent pharmacy the test chain_name <> 'Farmalux' is not true but unknown, so those rows are dropped. Add OR chain_name IS NULL.",
        },
      ],
    },
  ],
}
