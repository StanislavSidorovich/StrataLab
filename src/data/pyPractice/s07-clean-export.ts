import type { PracticeSection } from '../practiceBook'

export const CLEAN_EXPORT: PracticeSection = {
  id: 'clean-export',
  n: 7,
  title: 'Clean a messy export',
  blocks: [
    {
      kind: 'note',
      text: '`raw` is an export nobody tidied: every column is text, and the same thing is written in several ways. Look at the real values first, then fix one column at a time. `str.upper` makes capitals and `str.lower` makes small letters, so two spellings of one code become one.',
      syntax: 'raw["sku_code"].value_counts()   raw["sale_date"].sample(10)   raw["units"].isna().sum()   raw["sku_code"].str.upper()',
    },
    {
      kind: 'task',
      id: 'py-clean-export-sku-case',
      title: 'Codes without the case',
      question: 'How many different sku_code values does the export have when capitals and small letters are not told apart? Give the number.',
      ordered: false,
      skills: ['clean-text'],
      hints: ['Count the distinct codes of the column, after the case is the same everywhere.', 'str.upper() (or str.lower()) makes every code one case, then nunique() counts.', 'raw["sku_code"].str.upper().nunique()'],
      solution: `raw["sku_code"].str.upper().nunique()`,
    },
    {
      kind: 'note',
      text: 'Names can carry spaces at the start or the end, and then one customer looks like two. `str.strip` removes the spaces at both ends of every value.',
      syntax: 'raw["customer_name"].str.strip()',
    },
    {
      kind: 'task',
      id: 'py-clean-export-spaces',
      title: 'Customers without the spaces',
      question: 'How many different customer_name values does the export have once the spaces around the names are removed? Give the number.',
      ordered: false,
      skills: ['clean-text'],
      hints: ['The names with a space at the end count as extra values now.', 'str.strip() on the column, then nunique().', 'raw["customer_name"].str.strip().nunique()'],
      solution: `raw["customer_name"].str.strip().nunique()`,
      traps: [
        {
          code: `raw["customer_name"].nunique()`,
          says: 'Without `str.strip`, a name and the same name with a space at the end are two values, so the count is too high.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'py-clean-export-names',
      title: 'One code, one spelling',
      question: 'After removing stray spaces and making codes upper case, how many different sku_code and how many different customer_name does the export have? One row: skus (sku_code in capitals) and customers (customer_name without the spaces around it).',
      ordered: false,
      skills: ['clean-text', 'distinct'],
      hints: ['Compare a column\'s value_counts() before and after cleaning.', 'str.strip() removes spaces at both ends, str.upper() makes capitals.', 'pd.DataFrame({"skus": [raw["sku_code"].str.strip().str.upper().nunique()], "customers": [raw["customer_name"].str.strip().nunique()]})'],
      solution: `skus = raw["sku_code"].str.strip().str.upper().nunique()
customers_n = raw["customer_name"].str.strip().nunique()
pd.DataFrame({"skus": [skus], "customers": [customers_n]})`,
    },
    {
      kind: 'note',
      text: 'A decimal comma, as in 392,44, is not a number to Python. `str.replace` changes a piece of the text in every value, here the comma into a point.',
      syntax: 'raw["revenue"].str.replace(",", ".")',
      trap: 'Removing the comma instead of replacing it turns 392,44 into 39244.',
    },
    {
      kind: 'task',
      id: 'py-clean-export-comma',
      title: 'Revenue with a point',
      question: 'Show the first 8 revenue values of the export with every decimal comma changed to a point, still as text.',
      ordered: false,
      skills: ['replace-text'],
      hints: ['One column, and a piece of its text to change.', 'str.replace(",", ".") on raw["revenue"], then the first rows.', 'raw["revenue"].str.replace(",", ".").head(8)'],
      solution: `raw["revenue"].str.replace(",", ".").head(8)`,
    },
    {
      kind: 'note',
      text: '`pd.to_numeric` makes a number of each text. With `errors="coerce"` what cannot be read becomes NaN instead of stopping the work.',
      syntax: 'pd.to_numeric(raw["units"], errors="coerce")',
    },
    {
      kind: 'task',
      id: 'py-clean-export-unreadable',
      title: 'Units that are not numbers yet',
      question: 'How many export rows have a units value that cannot be read as a number as it is written? Empty values count, and so do values with a decimal comma. Give the number.',
      ordered: false,
      skills: ['to-numeric'],
      hints: ['Turn the text into numbers and see what is left empty.', 'pd.to_numeric(..., errors="coerce") gives NaN for what cannot be read; isna() marks them.', 'pd.to_numeric(raw["units"], errors="coerce").isna().sum()'],
      solution: `pd.to_numeric(raw["units"], errors="coerce").isna().sum()`,
    },
    {
      kind: 'task',
      id: 'py-clean-export-numbers',
      title: 'Totals of the export',
      question: 'What are the total units and the total revenue of all export rows, as numbers? One row: units and revenue (rounded to 1 decimal). Missing values are skipped, and repeated rows are still in.',
      ordered: false,
      skills: ['replace-text', 'to-numeric', 'one-number'],
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
      text: '`sale_date` comes in four forms: 2024-02-19, 2024-5-20, 11.03.2024 and 11/03/2024, the last two with the day first. `pd.to_datetime` with a fixed `format` makes real dates of one form, and with `errors="coerce"` the rows of other forms become NaT.',
      syntax: 'pd.to_datetime(raw["sale_date"], format="%d.%m.%Y", errors="coerce")',
    },
    {
      kind: 'task',
      id: 'py-clean-export-dot-dates',
      title: 'Dates with dots',
      question: 'How many export rows have sale_date written as day.month.year, like 11.03.2024? Give the number.',
      ordered: false,
      skills: ['parse-dates'],
      hints: ['Parse with the one form, and see which rows could be read.', 'format="%d.%m.%Y" with errors="coerce": the others become NaT; notna() marks the read ones.', 'pd.to_datetime(raw["sale_date"], format="%d.%m.%Y", errors="coerce").notna().sum()'],
      solution: `pd.to_datetime(raw["sale_date"], format="%d.%m.%Y", errors="coerce").notna().sum()`,
    },
    {
      kind: 'task',
      id: 'py-clean-export-day-first',
      title: 'Both day-first forms',
      question: 'How many export rows have the day first, written either as 11.03.2024 or as 11/03/2024? Give the number.',
      ordered: false,
      skills: ['parse-dates', 'replace-text'],
      hints: ['The slash form is the dot form with another separator.', 'Change "/" to "." in the text, then parse with format="%d.%m.%Y" and errors="coerce".', 'pd.to_datetime(raw["sale_date"].str.replace("/", "."), format="%d.%m.%Y", errors="coerce").notna().sum()'],
      solution: `pd.to_datetime(raw["sale_date"].str.replace("/", "."), format="%d.%m.%Y", errors="coerce").notna().sum()`,
      traps: [
        {
          code: `pd.to_datetime(raw["sale_date"], format="%d.%m.%Y", errors="coerce").notna().sum()`,
          says: 'This reads only the dot form: the rows with a slash become NaT and are not counted.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'To read all four forms, bring them to one form first: the slash becomes a dot, and a year-first date is turned around with a regular expression. Then one fixed `format` reads every row.',
      syntax: 'text.str.replace(r"^(\\d{4})-(\\d+)-(\\d+)$", r"\\3.\\2.\\1", regex=True)',
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
      skills: ['parse-dates', 'replace-text', 'month-start', 'count-values'],
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
      text: '`drop_duplicates` keeps one row of each set of rows that are the same in every column, and it also works on a few columns picked out.',
      syntax: 'raw[["sku_code", "customer_name"]].drop_duplicates()',
    },
    {
      kind: 'task',
      id: 'py-clean-export-pairs',
      title: 'Customer and code pairs',
      question: 'How many different combinations of customer_name and sku_code, as they are written, does the export have? Give the number.',
      ordered: false,
      skills: ['drop-duplicates'],
      hints: ['Two columns, and each combination counts once.', 'Pick the two columns, drop the repeated rows, count what is left.', 'len(raw[["customer_name", "sku_code"]].drop_duplicates())'],
      solution: `len(raw[["customer_name", "sku_code"]].drop_duplicates())`,
    },
    {
      kind: 'note',
      text: 'Whole rows can repeat in everything but their id, so `drop_duplicates()` on the whole table finds none. Leave the id out with `subset`, and work on `df.copy()` when you change several columns.',
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
      id: 'py-clean-export-units-no-repeats',
      title: 'Units without the repeats',
      question: 'What are the total units of the export once its repeated rows (the same in everything but raw_id) are dropped? Give the number; missing values are skipped.',
      ordered: false,
      skills: ['replace-text', 'to-numeric', 'drop-duplicates'],
      hints: ['Units must be numbers, and the repeats must go before the total.', 'Make units a number, then drop_duplicates(subset=...) without raw_id, then sum.', 'raw.assign(units=pd.to_numeric(raw["units"].str.replace(",", "."), errors="coerce")).drop_duplicates(subset=[c for c in raw.columns if c != "raw_id"])["units"].sum()'],
      solution: `u = pd.to_numeric(raw["units"].str.replace(",", "."), errors="coerce")
keep = raw.assign(units=u).drop_duplicates(subset=[c for c in raw.columns if c != "raw_id"])
keep["units"].sum()`,
      traps: [
        {
          code: `u = pd.to_numeric(raw["units"].str.replace(",", "."), errors="coerce")
raw.assign(units=u).drop_duplicates()["units"].sum()`,
          says: '`drop_duplicates()` compares raw_id too, which is different on every row, so no repeat is dropped and the total stays too large.',
        },
      ],
    },
    {
      kind: 'task',
      id: 'py-clean-export-clean-table',
      title: 'One customer, clean',
      question: 'Clean the export: capitals for sku_code, no stray spaces in customer_name, real dates and numbers, no repeated rows. Then show the rows of Nagisa #1045 sold in 2025: raw_id, sku_code, sale_date, units and revenue, by sale_date, then sku_code, then raw_id.',
      ordered: true,
      skills: ['clean-text', 'replace-text', 'to-numeric', 'parse-dates', 'drop-duplicates'],
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
