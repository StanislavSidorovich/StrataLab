import type { PracticeSection } from '../practiceBook'

export const CLEAN_EXPORT: PracticeSection = {
  id: 'clean-export',
  n: 7,
  title: 'Clean a messy export',
  blocks: [
    {
      kind: 'note',
      text: '`raw` is an export nobody tidied: every column is text, and the same thing is written in several ways. Look at the real values first, then fix one column at a time and check the result.',
      syntax: 'raw["sku_code"].value_counts()   raw["sale_date"].sample(10)   raw["units"].isna().sum()',
    },
    {
      kind: 'task',
      id: 'py-clean-export-names',
      title: 'One code, one spelling',
      question: 'After removing stray spaces and making codes upper case, how many different sku_code and how many different customer_name does the export have? One row: skus (sku_code in capitals) and customers (customer_name without the spaces around it).',
      ordered: false,
      hints: ['Compare a column\'s value_counts() before and after cleaning.', 'str.strip() removes spaces at both ends, str.upper() makes capitals.', 'pd.DataFrame({"skus": [raw["sku_code"].str.strip().str.upper().nunique()], "customers": [raw["customer_name"].str.strip().nunique()]})'],
      solution: `skus = raw["sku_code"].str.strip().str.upper().nunique()
customers_n = raw["customer_name"].str.strip().nunique()
pd.DataFrame({"skus": [skus], "customers": [customers_n]})`,
    },
    {
      kind: 'note',
      text: 'A decimal comma blocks the conversion to numbers. Change the comma to a point with `str.replace`, then `pd.to_numeric(errors="coerce")` makes a number of each text and NaN of what cannot be read.',
      syntax: 'pd.to_numeric(raw["revenue"].str.replace(",", "."), errors="coerce")',
      trap: 'Removing the comma instead of replacing it turns 392,44 into 39244.',
    },
    {
      kind: 'task',
      id: 'py-clean-export-numbers',
      title: 'Totals of the export',
      question: 'What are the total units and the total revenue of all export rows, as numbers? One row: units and revenue (rounded to 1 decimal). Missing values are skipped, and repeated rows are still in.',
      ordered: false,
      hints: ['Both columns are text, some with a decimal comma and some empty.', 'Replace "," by "." in each, then pd.to_numeric(..., errors="coerce"); sum skips NaN.', 'Put the two sums in pd.DataFrame({"units": [...], "revenue": [round(..., 1)]}).'],
      solution: `units = pd.to_numeric(raw["units"].str.replace(",", "."), errors="coerce")
revenue = pd.to_numeric(raw["revenue"].str.replace(",", "."), errors="coerce")
pd.DataFrame({"units": [units.sum()], "revenue": [round(revenue.sum(), 1)]})`,
      traps: [
        {
          code: `units = pd.to_numeric(raw["units"].str.replace(",", ""), errors="coerce")
revenue = pd.to_numeric(raw["revenue"].str.replace(",", ""), errors="coerce")
pd.DataFrame({"units": [units.sum()], "revenue": [round(revenue.sum(), 1)]})`,
          says: 'Removing the comma makes 392,44 into 39244, a hundred times too large. Replace it with a point.',
        },
      ],
    },
    {
      kind: 'note',
      text: '`sale_date` comes in four forms: 2024-02-19, 2024-5-20, 11.03.2024 and 11/03/2024, the last two with the day first. Bring them to one form, then parse with a fixed `format`.',
      syntax: 'pd.to_datetime(text, format="%d.%m.%Y")',
      trap: '`format="mixed"` guesses each row alone, and `dayfirst=True` also swaps the month and day of 2024-5-20.',
    },
    {
      kind: 'example',
      id: 'py-clean-export-dates-check',
      title: 'Does the parsed date agree with the file name?',
      code: `text = raw["sale_date"].str.replace("/", ".").str.replace(r"^(\\d{4})-(\\d+)-(\\d+)$", r"\\3.\\2.\\1", regex=True)
sale = pd.to_datetime(text, format="%d.%m.%Y")
# export_2024-03.csv should hold dates of March 2024
(sale.dt.strftime("%Y-%m") == raw["source_file"].str[7:14]).mean()`,
    },
    {
      kind: 'task',
      id: 'py-clean-export-months',
      title: 'Rows of the export by month',
      question: 'How many export rows are there in each month from January to June 2024, by the real date of sale_date? Show month_start (the first day, as a date) and rows, the oldest month first. Repeated rows are still in.',
      ordered: true,
      hints: ['Parse the dates by their form: the ones that start with a year are year first, the others day first.', 'Rewrite "2024-5-20" as "20.5.2024" with a regex, change "/" to ".", then pd.to_datetime(format="%d.%m.%Y").', 'Take the month with dt.to_period("M").dt.to_timestamp(), keep those before 2024-07-01, then value_counts().sort_index().rename_axis("month_start").reset_index(name="rows").'],
      solution: `text = raw["sale_date"].str.replace("/", ".").str.replace(r"^(\\d{4})-(\\d+)-(\\d+)$", r"\\3.\\2.\\1", regex=True)
sale = pd.to_datetime(text, format="%d.%m.%Y")
month = sale.dt.to_period("M").dt.to_timestamp()
month[month < "2024-07-01"].value_counts().sort_index().rename_axis("month_start").reset_index(name="rows")`,
      traps: [
        {
          code: `sale = pd.to_datetime(raw["sale_date"], format="mixed", dayfirst=True)
month = sale.dt.to_period("M").dt.to_timestamp()
month[month < "2024-07-01"].value_counts().sort_index().rename_axis("month_start").reset_index(name="rows")`,
          says: 'With `dayfirst=True`, a date such as 2024-6-3 is read as 2024-03-06. Rows land in the wrong months: check against the file name, as in the example.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'Rows can repeat in everything but their id, so `duplicated()` on the whole table finds none. Leave the id out with `subset`.',
      syntax: 'df.drop_duplicates(subset=[c for c in df.columns if c != "raw_id"])',
    },
    {
      kind: 'example',
      id: 'py-clean-export-repeats',
      title: 'The repeated rows',
      code: `keep = raw.drop_duplicates(subset=[c for c in raw.columns if c != "raw_id"])
pd.Series({"rows": len(raw), "without_repeats": len(keep)})`,
    },
    {
      kind: 'task',
      id: 'py-clean-export-clean-table',
      title: 'One customer, clean',
      question: 'Clean the export: capitals for sku_code, no stray spaces in customer_name, real dates and numbers, no repeated rows. Then show the rows of Nagisa #1045 sold in 2025: raw_id, sku_code, sale_date, units and revenue, by sale_date, then sku_code, then raw_id.',
      ordered: true,
      hints: ['Clean every column first, then drop the repeats, and only then filter the customer and the year.', 'Repeats are compared without raw_id: drop_duplicates(subset=[c for c in clean.columns if c != "raw_id"]).', 'The customer name has spaces in the raw table, so filter after str.strip(); sort_values(["sale_date", "sku_code", "raw_id"]) finishes it.'],
      solution: `clean = raw.copy()
clean["sku_code"] = clean["sku_code"].str.strip().str.upper()
clean["customer_name"] = clean["customer_name"].str.strip()
text = clean["sale_date"].str.replace("/", ".").str.replace(r"^(\\d{4})-(\\d+)-(\\d+)$", r"\\3.\\2.\\1", regex=True)
clean["sale_date"] = pd.to_datetime(text, format="%d.%m.%Y")
for col in ["units", "revenue"]:
    clean[col] = pd.to_numeric(clean[col].str.replace(",", "."), errors="coerce")
clean = clean.drop_duplicates(subset=[c for c in clean.columns if c != "raw_id"])
mine = clean[(clean["customer_name"] == "Nagisa #1045") & (clean["sale_date"].dt.year == 2025)]
mine[["raw_id", "sku_code", "sale_date", "units", "revenue"]].sort_values(["sale_date", "sku_code", "raw_id"])`,
      traps: [
        {
          code: `clean = raw.copy()
clean["sku_code"] = clean["sku_code"].str.strip().str.upper()
clean["customer_name"] = clean["customer_name"].str.strip()
text = clean["sale_date"].str.replace("/", ".").str.replace(r"^(\\d{4})-(\\d+)-(\\d+)$", r"\\3.\\2.\\1", regex=True)
clean["sale_date"] = pd.to_datetime(text, format="%d.%m.%Y")
for col in ["units", "revenue"]:
    clean[col] = pd.to_numeric(clean[col].str.replace(",", "."), errors="coerce")
clean = clean.drop_duplicates()
mine = clean[(clean["customer_name"] == "Nagisa #1045") & (clean["sale_date"].dt.year == 2025)]
mine[["raw_id", "sku_code", "sale_date", "units", "revenue"]].sort_values(["sale_date", "sku_code", "raw_id"])`,
          says: '`drop_duplicates()` compares every column, raw_id too, and raw_id is different on every row, so nothing is dropped. Leave raw_id out with `subset`.',
        },
      ],
    },
  ],
}
