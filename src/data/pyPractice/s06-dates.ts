import type { PracticeSection } from '../practiceBook'

export const DATES: PracticeSection = {
  id: 'dates',
  n: 6,
  title: 'Dates',
  blocks: [
    {
      kind: 'note',
      text: 'Date columns are real dates, and `.dt` reads their parts: `year`, `month`, `quarter`, `day_name()`. A period such as 2026 or the second quarter is a filter on those parts.',
      syntax: 'df[df["order_date"].dt.year == 2026]   df["order_date"].dt.day_name()   df["order_date"].dt.dayofweek  # Monday is 0',
      trap: '`dt.quarter == 2` alone takes the second quarter of every year: add the year.',
    },
    {
      kind: 'example',
      id: 'py-dates-weekday',
      title: 'The weekday of a shipment',
      code: `sellin.assign(weekday=sellin["order_date"].dt.day_name())[["sellin_id", "order_date", "weekday"]].head()`,
    },
    {
      kind: 'task',
      id: 'py-dates-promo-start-days',
      title: 'Promotion start days',
      question: 'On which weekday did each promotion start? Give the weekday name for every promotion in promos, from start_date.',
      ordered: false,
      skills: ['weekday'],
      hints: ['The weekday is a part of the date column start_date.', 'start_date.dt has a method that gives the name of the day.', 'promos["start_date"].dt.day_name()'],
      solution: `promos["start_date"].dt.day_name()`,
    },
    {
      kind: 'task',
      id: 'py-dates-sunday-orders',
      title: 'Orders on a Sunday',
      question: 'How many sell-in shipments were ordered on a Sunday? Give the number.',
      ordered: false,
      skills: ['weekday', 'size'],
      hints: ['The weekday number of order_date, with Monday as 0.', 'Sunday is 6: dt.dayofweek == 6 keeps those rows.', 'len(sellin[sellin["order_date"].dt.dayofweek == 6])'],
      solution: `len(sellin[sellin["order_date"].dt.dayofweek == 6])`,
    },
    {
      kind: 'task',
      id: 'py-dates-weekdays',
      title: 'Orders through the week',
      question: 'How many sell-in shipments were ordered on each weekday in 2025 (order_date in 2025)? Show weekday (the full name, Monday first) and shipments, in weekday order from Monday to Sunday.',
      ordered: true,
      skills: ['weekday', 'date-part', 'pick-columns', 'count-values', 'name-counts', 'map-values', 'add-column'],
      hints: ['Count the orders of 2025 by the weekday number of order_date, with Monday as 0.', 'w.dt.dayofweek.value_counts().sort_index() counts in calendar order, with the number as index.', 'Turn the number into a name with .map({0: "Monday", 1: "Tuesday", ...}) on the column after rename_axis("weekday").reset_index(name="shipments").'],
      solution: `w = sellin.loc[sellin["order_date"].dt.year == 2025, "order_date"]
t = w.dt.dayofweek.value_counts().sort_index().rename_axis("weekday").reset_index(name="shipments")
t["weekday"] = t["weekday"].map({0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday"})
t`,
    },
    {
      kind: 'note',
      text: 'A month is made with `dt.to_period("M")` and, to get back a date, `.dt.to_timestamp()`. The `month_start` column of `sellin` is the month of `order_date`, so the month of `ship_date` has to be made.',
      syntax: 'df["ship_date"].dt.to_period("M").dt.to_timestamp()',
      trap: '`sellin["month_start"]` is the order month: it is not the month a shipment left.',
    },
    {
      kind: 'task',
      id: 'py-dates-sellout-months',
      title: 'Months with sales',
      question: 'In how many different months does sellout have weeks? A week belongs to the month of its week_start. Give the number.',
      ordered: false,
      skills: ['month-start', 'distinct'],
      hints: ['Turn each week_start into its month, then count the different ones.', 'dt.to_period("M") gives the month of a date.', 'sellout["week_start"].dt.to_period("M").nunique()'],
      solution: `sellout["week_start"].dt.to_period("M").nunique()`,
    },
    {
      kind: 'task',
      id: 'py-dates-lines-per-month',
      title: 'Sell-out lines by month in 2025',
      question: 'How many sellout lines are there in each month of 2025 only (week_start from 2025-01-01 to 2025-12-31)? Show month_start (the first day of the month, as a date) and lines, the oldest month first.',
      ordered: true,
      skills: ['date-part', 'month-start', 'count-values', 'name-counts'],
      hints: ['Keep the weeks of 2025, and turn week_start into a month.', 'dt.to_period("M").dt.to_timestamp() gives the first day of the month as a date.', 'Count with value_counts().sort_index().rename_axis("month_start").reset_index(name="lines").'],
      solution: `y = sellout[sellout["week_start"].dt.year == 2025]
y["week_start"].dt.to_period("M").dt.to_timestamp().value_counts().sort_index().rename_axis("month_start").reset_index(name="lines")`,
    },
    {
      kind: 'task',
      id: 'py-dates-ship-months',
      title: 'Shipments by the month they left',
      question: 'How many sell-in shipments left in each month, counting only those with ship_date from 2026-01-01? Show month_start (the first day of the month, as a date) and shipments, the oldest month first.',
      ordered: true,
      skills: ['month-start', 'pick-columns', 'count-values', 'name-counts', 'filter'],
      hints: ['Keep the shipments with ship_date from 2026-01-01, and turn ship_date into a month.', 'dt.to_period("M").dt.to_timestamp() gives the first day of the month as a date.', 'Count with value_counts().sort_index().rename_axis("month_start").reset_index(name="shipments").'],
      solution: `m = sellin.loc[sellin["ship_date"] >= "2026-01-01", "ship_date"].dt.to_period("M").dt.to_timestamp()
m.value_counts().sort_index().rename_axis("month_start").reset_index(name="shipments")`,
      traps: [
        {
          code: `sellin[sellin["ship_date"] >= "2026-01-01"]["month_start"].value_counts().sort_index().rename_axis("month_start").reset_index(name="shipments")`,
          says: '`month_start` in `sellin` is the month of the order. Shipments that left in January after an order in December are counted in December, and none appear in July.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'Subtracting two dates gives a time difference, and `.dt.days` turns it into whole days. The difference is a column like any other: compare it, average it, count it.',
      syntax: '(df["ship_date"] - df["order_date"]).dt.days',
    },
    {
      kind: 'example',
      id: 'py-dates-days-to-ship',
      title: 'Days from order to shipment',
      code: `days = (sellin["ship_date"] - sellin["order_date"]).dt.days
days.describe()`,
    },
    {
      kind: 'task',
      id: 'py-dates-longest-wait',
      title: 'The longest wait',
      question: 'What is the longest time, in days, from order_date to ship_date in sellin? Give the number.',
      ordered: false,
      skills: ['date-gap', 'one-number'],
      hints: ['The gap between two date columns, row by row.', 'ship_date minus order_date, then .dt.days.', '(sellin["ship_date"] - sellin["order_date"]).dt.days.max()'],
      solution: `(sellin["ship_date"] - sellin["order_date"]).dt.days.max()`,
    },
    {
      kind: 'task',
      id: 'py-dates-slow-shipments',
      title: 'Shipments that took over a week',
      question: 'How many sell-in shipments left more than 7 days after the order? Give the number.',
      ordered: false,
      skills: ['date-gap', 'size'],
      hints: ['The days from order_date to ship_date, as a column.', 'Keep the rows where the days are above 7.', 'len(sellin[(sellin["ship_date"] - sellin["order_date"]).dt.days > 7])'],
      solution: `len(sellin[(sellin["ship_date"] - sellin["order_date"]).dt.days > 7])`,
      traps: [
        {
          code: `len(sellin[(sellin["ship_date"] - sellin["order_date"]).dt.days >= 7])`,
          says: '`>= 7` counts the shipments that took exactly 7 days too. "More than 7" is `> 7`.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`pd.DataFrame` with a dict of one-item lists builds a one-row answer from several numbers.',
      syntax: 'pd.DataFrame({"shipments": [10], "avg_days": [2.5]})',
    },
    {
      kind: 'task',
      id: 'py-dates-shipment-totals',
      title: 'Shipments and units in one row',
      question: 'Give one row with shipments (the number of sell-in shipments) and units (their total units).',
      ordered: false,
      skills: ['one-row-table', 'size', 'one-number'],
      hints: ['Two numbers side by side in one row.', 'A dict of one-item lists: the name, then the number in a list.', 'pd.DataFrame({"shipments": [len(sellin)], "units": [sellin["units"].sum()]})'],
      solution: `pd.DataFrame({"shipments": [len(sellin)], "units": [sellin["units"].sum()]})`,
    },
    {
      kind: 'task',
      id: 'py-dates-q2-speed',
      title: 'Shipping speed in the second quarter of 2026',
      question: 'For the shipments ordered from 2026-04-01 to 2026-06-30, give one row with shipments (how many), avg_days (average days from order_date to ship_date, 1 decimal) and within_week_pct (the percentage shipped within 7 days, 7 included, 1 decimal).',
      ordered: false,
      skills: ['date-gap', 'one-row-table', 'filter', 'filter-and', 'size', 'one-number', 'share'],
      hints: ['Filter the second quarter of 2026 first, then take ship_date minus order_date in days.', 'Average days: days.mean(). The share within a week is the mean of (days <= 7).', 'pd.DataFrame({"shipments": [len(q)], "avg_days": [round(days.mean(), 1)], "within_week_pct": [round((days <= 7).mean() * 100, 1)]})'],
      solution: `q = sellin[(sellin["order_date"] >= "2026-04-01") & (sellin["order_date"] <= "2026-06-30")]
days = (q["ship_date"] - q["order_date"]).dt.days
pd.DataFrame({"shipments": [len(q)], "avg_days": [round(days.mean(), 1)], "within_week_pct": [round((days <= 7).mean() * 100, 1)]})`,
      traps: [
        {
          code: `q = sellin[sellin["order_date"].dt.quarter == 2]
days = (q["ship_date"] - q["order_date"]).dt.days
pd.DataFrame({"shipments": [len(q)], "avg_days": [round(days.mean(), 1)], "within_week_pct": [round((days <= 7).mean() * 100, 1)]})`,
          says: '`dt.quarter == 2` takes the second quarter of 2024, 2025 and 2026 together. Filter the year too, or use the two dates.',
        },
      ],
    },
  ],
}
