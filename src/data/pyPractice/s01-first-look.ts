import type { PracticeSection } from '../practiceBook'

export const FIRST_LOOK: PracticeSection = {
  id: 'first-look',
  n: 1,
  title: 'A first look',
  blocks: [
    {
      kind: 'note',
      text: 'Before any question, find out how big a table is, what its columns hold, and whether their types are what you expect. `shape` and `dtypes` are attributes, so they take no brackets, and `len(df)` gives just the number of rows.',
      syntax: 'df.shape   len(df)   df.dtypes   df.info()   df.describe()',
    },
    {
      kind: 'example',
      id: 'py-first-look-shape',
      title: 'Size and types of the sales table',
      code: `print(sellout.shape)
sellout.dtypes`,
    },
    {
      kind: 'task',
      id: 'py-first-look-products',
      title: 'How many products',
      question: 'How many rows does products have? Give the number.',
      ordered: false,
      hints: ['A DataFrame’s length is its number of rows.', 'len(df), or the first part of df.shape.', 'len(products)'],
      solution: `len(products)`,
    },
    {
      kind: 'note',
      text: 'One column is a Series, and a list of columns is a DataFrame. `nunique` counts different values, and `unique` lists them.',
      syntax: 'df["brand"]   df[["brand", "category"]]   df["brand"].nunique()',
      trap: '`df["brand", "category"]` with one pair of brackets looks for one column with that double name: a list of columns needs two pairs.',
    },
    {
      kind: 'example',
      id: 'py-first-look-divisions',
      title: 'The divisions in the catalogue',
      code: `products["division"].unique()`,
    },
    {
      kind: 'task',
      id: 'py-first-look-brands',
      title: 'How many brands',
      question: 'How many different brands does Kaiyo carry? Give the number.',
      ordered: false,
      hints: ['One column of products.', 'Count different values, not rows.', 'products["brand"].nunique()'],
      solution: `products["brand"].nunique()`,
      traps: [{ code: `products["brand"].count()`, says: '`count` counts the rows that have a brand, not different brands. `nunique` counts different ones.' }],
    },
    {
      kind: 'note',
      text: '`describe` gives the spread of the numbers in one line of code, which is the quickest way to spot a strange value. `min` and `max` on a date column show the period a table covers.',
      syntax: 'df["units"].describe()   df["week_start"].min()',
    },
    {
      kind: 'example',
      id: 'py-first-look-describe',
      title: 'The spread of units sold',
      code: `sellout["units"].describe()`,
    },
    {
      kind: 'task',
      id: 'py-first-look-biggest-line',
      title: 'The biggest single line',
      question: 'What is the highest revenue on a single row of sellout? Give the number.',
      ordered: false,
      hints: ['One column, one number.', 'Series have a max method.', 'sellout["revenue"].max()'],
      solution: `sellout["revenue"].max()`,
    },
    {
      kind: 'task',
      id: 'py-first-look-period',
      title: 'The last week in the data',
      question: 'What is the last week_start in sellout? Give the date.',
      ordered: false,
      hints: ['Dates have a maximum too.', 'The column is week_start.', 'sellout["week_start"].max()'],
      solution: `sellout["week_start"].max()`,
    },
  ],
}
