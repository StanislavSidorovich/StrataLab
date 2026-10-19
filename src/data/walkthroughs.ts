// A whole analysis in Python for each dataset, as one tab of `# %%` cells that runs from top to
// bottom without edits: get to know the data → clean it → prepare it (merge, new columns) →
// analyse (groupby, pivot_table, shares) → a chart → what it says, in words, and lab.save.
// Written for someone learning pandas: every cell says in plain words what it does and why.
// tests/guides.test.ts runs each one on the real data.

export interface Walkthrough {
  /** a dataset id from src/data/datasets.ts, or `demo` for the demo shop */
  id: string
  title: string
  /** one line: the question the walkthrough answers */
  question: string
  code: string
}

const HOW = `# Run one cell with Shift+Enter: it runs and the cursor moves to the next one.
# Ctrl+Enter runs every cell from the top. Each cell's output appears under Output;
# "Open in DataFrame view" under a table shows the whole of it on the pane.`

export const WALKTHROUGHS: Walkthrough[] = [
  {
    id: 'demo',
    title: 'Demo shop',
    question: 'Which products and channels bring the shop its money, month by month?',
    code: `# %% [markdown]
# # Demo shop: a first analysis in pandas
# A small coffee shop: customers, products, orders and the lines of each order.
# We go the usual way of an analyst: get to know the data, clean it, put the tables
# together, answer questions, draw a chart, and write down what we found.
${HOW}

# %% [markdown]
# ## 1. Exploration (EDA)
# What it is: look at the data before you change it: its size, columns, types, gaps and the most common values.
# What it gives you: you know what you have, and which problems (wrong types, gaps, odd values) to fix next.
# Typical commands here: .shape, .head(), .dtypes, .isna().sum(), .describe(), .value_counts().

# %%
# pandas is the library for tables in Python; "pd" is the short name everyone uses.
# matplotlib draws charts; "plt" is its usual short name.
import pandas as pd
import matplotlib.pyplot as plt

# lab.table("name") reads a table of this browser's database into a DataFrame (a table in pandas).
customers = lab.table("demo.customers")
products = lab.table("demo.products")
orders = lab.table("demo.orders")
items = lab.table("demo.order_items")

# .shape is (rows, columns). print() writes text into the output.
print("customers  ", customers.shape)
print("products   ", products.shape)
print("orders     ", orders.shape)
print("order_items", items.shape)

# %%
# .head() shows the first 5 rows: the quickest way to see what a table looks like.
orders.head()

# %%
# .dtypes is the type of each column: int (whole numbers), float (decimals), str (text),
# datetime (dates and times). Wrong types are the most common reason a calculation fails.
orders.dtypes

# %%
# .isna() is True where a value is missing; .sum() counts the True values in each column.
# Zero everywhere means no gaps to deal with.
customers.isna().sum()

# %%
# .describe() gives count, mean, min, max and quartiles of the numeric columns at once.
# A quick check for odd values: negative prices or a quantity of 1,000 would show here.
items.merge(products, on="product_id")[["quantity", "price"]].describe()

# %%
# .value_counts() counts how often each value appears: here, how orders ended.
# display() shows a value in the output, as the last line of a cell does.
display(orders["status"].value_counts())
display(customers["channel"].value_counts())

# %% [markdown]
# ## 2. Preprocessing: cleaning
# What it is: fix what the first look found: duplicates, gaps, wrong types, stray spaces and spellings.
# What it gives you: a table you can trust, so that later totals and joins do not quietly go wrong.
# Typical commands here: .duplicated(), .str.strip(), .dt.to_period().
#
# This shop's data is tidy, but we still check, because real data rarely is.

# %%
# Duplicates: .duplicated() is True for a row that repeats an earlier one exactly.
print("duplicate orders:", orders.duplicated().sum())
print("duplicate order lines:", items.duplicated(subset=["order_id", "line_no"]).sum())

# Dates: ordered_at has a time too. .dt.to_period("M") keeps only the month, which we group by later.
orders["month"] = orders["ordered_at"].dt.to_period("M").dt.to_timestamp()

# Text: .str.strip() removes spaces around a value, so " Lisbon" and "Lisbon" become one city.
customers["city"] = customers["city"].str.strip()

orders.head()

# %% [markdown]
# ## 3. Preparation: joins and new columns
# What it is: put the tables together and add the columns the questions need (a total, a month, a flag).
# What it gives you: one wide table where every row has everything the analysis asks for.
# Typical commands here: .merge(), a new column: df["new"] = a * b, .isin().

# %%
# merge() joins two tables on a column they share, like JOIN in SQL.
# An order line knows only product_id; after the merge it also has the product's name, category and price.
lines = items.merge(products, on="product_id")

# A new column from other columns: what the line cost.
lines["revenue"] = lines["quantity"] * lines["price"]

# Then each line gets its order's status and month, and the customer's channel and city.
lines = lines.merge(orders[["order_id", "customer_id", "status", "month"]], on="order_id")
lines = lines.merge(customers[["customer_id", "channel", "city"]], on="customer_id")

lines.head()

# %%
# Cancelled and returned orders brought no money: keep the delivered and shipped ones.
# .isin([...]) is True when the value is one of the list (IN in SQL).
sold = lines[lines["status"].isin(["delivered", "shipped"])]
print("lines in total:", len(lines), " lines that brought money:", len(sold))

# %% [markdown]
# ## 4. Analysis
# What it is: answer the business questions: group, add up, compare, rank.
# What it gives you: the numbers behind the conclusions, in small tables you can read at a glance.
# Typical commands here: .groupby(), .agg(), .sum(), .nunique(), .sort_values(), .pivot_table().

# %%
# Revenue by category: groupby() splits the rows by category, sum() adds up each group.
by_category = sold.groupby("category")["revenue"].sum().sort_values(ascending=False)

# A share: each category's revenue divided by the total, in per cent.
share = (100 * by_category / by_category.sum()).round(1)

# pd.DataFrame({...}) builds a table from columns that share the same index (the categories).
pd.DataFrame({"revenue": by_category.round(2), "share_pct": share})

# %%
# Where do customers come from, and how much do they spend? One row per channel.
by_channel = sold.groupby("channel").agg(
    customers=("customer_id", "nunique"),   # nunique: how many different customers
    revenue=("revenue", "sum"),
)
# Revenue per customer: one column divided by another, row by row.
by_channel["per_customer"] = (by_channel["revenue"] / by_channel["customers"]).round(2)
by_channel.sort_values("revenue", ascending=False)

# %%
# pivot_table: months down the side, categories across the top, revenue in the cells.
monthly = sold.pivot_table(index="month", columns="category", values="revenue", aggfunc="sum", fill_value=0)
monthly.round(0)

# %% [markdown]
# ## 5. Visualization
# What it is: draw the main result as a chart.
# What it gives you: a pattern you can see at once, which a table of numbers hides.
# Typical commands here: .plot(), plt.show(), .set_xlabel(), .set_ylabel().

# %%
# A DataFrame draws itself: .plot() puts the index (months) on the x axis and a line per column.
# figsize is the size in inches; plt.show() puts the chart into the output.
ax = monthly.plot(figsize=(9, 4), title="Revenue by category and month")
ax.set_xlabel("")
ax.set_ylabel("revenue")
plt.show()

# %% [markdown]
# ## 6. Conclusions and saving
# What it is: say in words what the numbers mean, and save the result you want to keep.
# What it gives you: an answer someone else can read, and a table you can come back to from a SQL tab.
# Typical commands here: lab.save(), .reset_index(), print().
#
# - Equipment (moka pots, grinders, presses) brings almost 60 % of the money, coffee about 15 %:
#   a few expensive items carry the shop, so a stock-out there hurts most.
# - Email brings the most customers and the most revenue, but customers who came from a friend
#   spend the most each (about 356 against 287 to 313 for the other channels).
# - Cancelled and returned orders are more than a quarter of all orders (409 of 1,500): worth a look.
# - The chart shows no strong season; Equipment peaks in July and August.
#
# The monthly table is worth keeping: lab.save writes it as a table, for SQL tabs or another day.

# %%
# reset_index() turns the months from the index back into an ordinary column before saving.
lab.save(monthly.reset_index(), "demo_monthly_revenue")
print("Saved as the table demo_monthly_revenue (see My tables when the cell has finished).")
`,
  },
  {
    id: 'quaera',
    title: 'Kaiyo Trading',
    question: 'Clean a raw sales export, then see which brands, channels and months sell.',
    code: `# %% [markdown]
# # Kaiyo Trading: from a raw export to an answer
# Kaiyo Trading sells drinks, snacks and medicines to shops across Japan. Shops send their sales
# as files, and the files are messy: dates in different formats, commas for decimals, extra spaces.
# staging_raw_sellout holds those rows as they came, all as text. We clean them, join them to the
# product and customer tables, and see what sells.
${HOW}

# %% [markdown]
# ## 1. Exploration (EDA)
# What it is: look at the data before you change it: its size, columns, types, gaps and the most common values.
# What it gives you: you know what you have, and which problems (wrong types, gaps, odd values) to fix next.
# Typical commands here: .shape, .head(), .dtypes, .isna().sum(), .value_counts().

# %%
import pandas as pd
import matplotlib.pyplot as plt

# Tables of a sample dataset are read as "schema.table".
raw = lab.table("quaera.staging_raw_sellout")
products = lab.table("quaera.dim_product")
customers = lab.table("quaera.dim_customer")

print("raw rows and columns:", raw.shape)
raw.head(10)

# %%
# Every column is text (str), even dates and numbers: we can't add up text, so we will convert.
raw.dtypes

# %%
# How many values are missing in each column? Some rows have no units or no revenue.
raw.isna().sum()

# %%
# .sample() picks random rows; random_state fixes which ones, so you see the same rows each time.
# Look at sale_date (three or more formats), revenue ("621,01" with a comma) and customer_name (spaces).
raw.sample(8, random_state=1)

# %%
# value_counts on the file name: how many rows each monthly file brought.
raw["source_file"].value_counts().head(10)

# %% [markdown]
# ## 2. Preprocessing: cleaning
# What it is: fix what the first look found: duplicates, gaps, wrong types, stray spaces and spellings.
# What it gives you: a table you can trust, so that later totals and joins do not quietly go wrong.
# Typical commands here: .duplicated(), .drop_duplicates(), .str.strip(), .str.replace(), pd.to_datetime(), .dropna().

# %%
# Start from a copy, so raw stays as it was and we can compare.
df = raw.copy()

# Text: remove spaces around names, and write SKU codes in capitals, as in dim_product ("kros003" → "KROS003").
df["customer_name"] = df["customer_name"].str.strip()
df["sku_code"] = df["sku_code"].str.strip().str.upper()

# Numbers: a comma as the decimal mark becomes a point, then to_numeric turns text into numbers.
# errors="coerce" gives NaN (missing) instead of an error for anything that is not a number.
df["units"] = pd.to_numeric(df["units"].str.replace(",", "."), errors="coerce")
df["revenue"] = pd.to_numeric(df["revenue"].str.replace(",", "."), errors="coerce")

df[["customer_name", "sku_code", "units", "revenue"]].head()

# %%
# Do the cleaned names match the customer table? isin() is True when a name is in that list,
# and ~ turns True into False: so this keeps the names the customer table does NOT know.
unknown = df.loc[~df["customer_name"].isin(customers["customer_name"]), "customer_name"]
print("rows with a shop name the customer table doesn't know:", len(unknown))
unknown.value_counts()

# %%
# They are all "Itiba": the chain the customer table writes "Ichiba" (two ways to spell the same
# Japanese word in Latin letters). str.replace() fixes the spelling in every name.
df["customer_name"] = df["customer_name"].str.replace("Itiba", "Ichiba", regex=False)
print("unknown names left:", (~df["customer_name"].isin(customers["customer_name"])).sum())

# %%
# Dates come in several formats: 2024-05-20, 2026-2-9, 18.03.2024 and 26/08/2024.
# We read each format on its own; a date that doesn't fit a format gives NaT (missing date),
# and fillna() takes the value from the next attempt.
d = df["sale_date"]
dates = pd.to_datetime(d.str.replace("/", ".", regex=False), format="%d.%m.%Y", errors="coerce")
# "2026-2-9" has no leading zeros, which a format string doesn't accept: split it at "-" into
# three columns (year, month, day) and build the date from numbers.
parts = d.str.split("-", expand=True)
iso_dates = pd.to_datetime(
    dict(
        year=pd.to_numeric(parts[0], errors="coerce"),
        month=pd.to_numeric(parts[1], errors="coerce"),
        day=pd.to_numeric(parts[2], errors="coerce"),
    ),
    errors="coerce",
)
df["sale_date"] = dates.fillna(iso_dates)

print("dates we could not read:", df["sale_date"].isna().sum())
df["sale_date"].describe()

# %%
# Duplicates: the same sale sent twice (often in two files). raw_id and source_file differ,
# so we compare only the columns that describe the sale.
key = ["sale_date", "customer_name", "sku_code", "units", "revenue"]
print("duplicate rows:", df.duplicated(subset=key).sum())
df = df.drop_duplicates(subset=key)

# Missing units or revenue: we can't guess them, so those rows go.
# Negative units are returns: they stay, so totals are net of returns.
print("rows without units or revenue:", df[["units", "revenue"]].isna().any(axis=1).sum())
df = df.dropna(subset=["units", "revenue"])
print("returns (units below 0):", (df["units"] < 0).sum())
print("clean rows:", len(df))

# %% [markdown]
# ## 3. Preparation: joins and new columns
# What it is: put the tables together and add the columns the questions need (a total, a month, a flag).
# What it gives you: one wide table where every row has everything the analysis asks for.
# Typical commands here: .merge(), a new column: df["new"] = a * b, .dt.to_period().

# %%
# how="left" keeps every sale even when no product matches; the product columns are then empty.
# Checking how many stayed empty tells us whether our cleaning of names and codes worked.
df = df.merge(products[["sku_code", "brand", "category", "division"]], on="sku_code", how="left")
df = df.merge(customers[["customer_name", "channel", "city"]], on="customer_name", how="left")

print("sales without a product:", df["brand"].isna().sum())
print("sales without a customer:", df["channel"].isna().sum())

# New columns for grouping: the month of each sale, and the price of one unit.
df["month"] = df["sale_date"].dt.to_period("M").dt.to_timestamp()
df["unit_price"] = (df["revenue"] / df["units"]).round(2)
df.head()

# %% [markdown]
# ## 4. Analysis
# What it is: answer the business questions: group, add up, compare, rank.
# What it gives you: the numbers behind the conclusions, in small tables you can read at a glance.
# Typical commands here: .groupby(), .agg(), .sum(), .sort_values(), .pivot_table(), .round().

# %%
# Revenue and units by brand, the biggest first, with each brand's share of the total.
brands = df.groupby("brand").agg(units=("units", "sum"), revenue=("revenue", "sum"))
brands["share_pct"] = (100 * brands["revenue"] / brands["revenue"].sum()).round(1)
brands.sort_values("revenue", ascending=False).round(0)

# %%
# Which channel sells which division? pivot_table with channels down the side and divisions across.
# margins=True adds an "All" row and column with the totals.
pd.pivot_table(df, index="channel", columns="division", values="revenue", aggfunc="sum", margins=True).round(0)

# %%
# Revenue per month. groupby on the month gives a Series: one number per month.
monthly = df.groupby("month")["revenue"].sum()

# pct_change() is the change from the month before, as a fraction; × 100 for per cent.
pd.DataFrame({"revenue": monthly.round(0), "change_pct": (100 * monthly.pct_change()).round(1)})

# %% [markdown]
# ## 5. Visualization
# What it is: draw the main result as a chart.
# What it gives you: a pattern you can see at once, which a table of numbers hides.
# Typical commands here: .plot(), plt.show(), .set_xlabel(), plt.tight_layout().

# %%
# Bars read best with short text labels: turn the months into text like "2024-05" first.
# .copy() so the monthly numbers we worked with stay as they are.
to_draw = monthly.copy()
to_draw.index = to_draw.index.strftime("%Y-%m")

# A Series draws itself: kind="bar" for bars, figsize is the size in inches.
ax = to_draw.plot(kind="bar", figsize=(10, 4), title="Sell-out revenue by month (the cleaned export)")
ax.set_xlabel("")
plt.tight_layout()
plt.show()

# %% [markdown]
# ## 6. Conclusions and saving
# What it is: say in words what the numbers mean, and save the result you want to keep.
# What it gives you: an answer someone else can read, and a table you can come back to from a SQL tab.
# Typical commands here: lab.save(), print().
#
# - The export needed real cleaning. Of 3,110 rows, 110 were the same sale sent twice and 253 had
#   no units or no revenue; 2,747 clean rows are left. The 102 rows with negative units are returns
#   and stay in, so the totals are net of returns.
# - Two spellings hid shops: spaces around names, and "Itiba" for the chain "Ichiba". Without the
#   fix those sales would have lost their channel and city at the join; after it, every sale found
#   its product and its customer (both counts above are 0).
# - Fruvia brings about a third of the revenue, Aqualis a fifth: two brands make more than half.
# - This export comes almost only from modern trade (chains) and only FMCG products: it is one
#   source among several, not the whole business.
# - Month to month the revenue swings a lot (January 2026 more than doubled, February halved):
#   look at several months before calling a change a trend.
#
# The cleaned sales go back to the database as a table, for SQL or another notebook.

# %%
# lab.save(DataFrame, "name") writes it as a table in My tables (a table of that name is replaced).
lab.save(df, "kaiyo_sellout_clean")
print("Saved as kaiyo_sellout_clean:", len(df), "rows (see My tables when the cell has finished).")
`,
  },
  {
    id: 'northwind',
    title: 'Northwind',
    question: 'Where do sales come from, and do orders ship on time?',
    code: `# %% [markdown]
# # Northwind: sales and delivery
# Northwind Traders sells food to shops in 21 countries (1996 to 1998). An order has lines
# (product, price, quantity, discount) and three dates: ordered, required by, shipped.
# We look at what sells where, and how often an order ships late.
${HOW}

# %% [markdown]
# ## 1. Exploration (EDA)
# What it is: look at the data before you change it: its size, columns, types, gaps and the most common values.
# What it gives you: you know what you have, and which problems (wrong types, gaps, odd values) to fix next.
# Typical commands here: .shape, .head(), .dtypes, .isna().sum(), .describe(), .value_counts().

# %%
import pandas as pd
import matplotlib.pyplot as plt

orders = lab.table("northwind.Orders")
lines = lab.table("northwind.Order Details")   # a table name with a space works as written
products = lab.table("northwind.Products")
categories = lab.table("northwind.Categories")
customers = lab.table("northwind.Customers")

print("orders:", orders.shape, " lines:", lines.shape, " products:", products.shape)
orders.head()

# %%
# The column types: three dates (datetime), money as float, text as str.
orders.dtypes

# %%
# Missing values per column. ShipRegion is often empty (most countries have no regions),
# ShippedDate is empty for orders that have not shipped yet.
orders.isna().sum()

# %%
# The numbers of the order lines at a glance: price, quantity, discount (0.05 = 5 %).
lines[["UnitPrice", "Quantity", "Discount"]].describe().round(2)

# %%
# Orders per country of delivery, the ten biggest.
orders["ShipCountry"].value_counts().head(10)

# %% [markdown]
# ## 2. Preprocessing: cleaning
# What it is: fix what the first look found: duplicates, gaps, wrong types, stray spaces and spellings.
# What it gives you: a table you can trust, so that later totals and joins do not quietly go wrong.
# Typical commands here: .duplicated(), .fillna(), .notna(), .dt.days / .dt.total_seconds().

# %%
# Duplicates: an order line is unique by order and product.
print("duplicate lines:", lines.duplicated(subset=["OrderID", "ProductID"]).sum())

# Missing ShippedDate means "not shipped yet": we keep those orders but mark them.
# notna() is the opposite of isna(): True where there is a value.
orders["shipped"] = orders["ShippedDate"].notna()
print("orders not shipped yet:", (~orders["shipped"]).sum())

# A missing region is not an error: we write "-" so it shows as a group of its own.
customers["Region"] = customers["Region"].fillna("-")

# Dates minus dates give a duration; .dt.days turns it into a number of days.
orders["days_to_ship"] = (orders["ShippedDate"] - orders["OrderDate"]).dt.days
orders["late"] = orders["ShippedDate"] > orders["RequiredDate"]
orders[["OrderID", "OrderDate", "RequiredDate", "ShippedDate", "days_to_ship", "late"]].head()

# %% [markdown]
# ## 3. Preparation: joins and new columns
# What it is: put the tables together and add the columns the questions need (a total, a month, a flag).
# What it gives you: one wide table where every row has everything the analysis asks for.
# Typical commands here: .merge(), a new column: df["new"] = a * b, .dt.to_period(), .dt.year / .dt.month.

# %%
# Each line gets its product's category, then its order's dates and country.
df = lines.merge(products[["ProductID", "ProductName", "CategoryID"]], on="ProductID")
df = df.merge(categories[["CategoryID", "CategoryName"]], on="CategoryID")
df = df.merge(orders[["OrderID", "OrderDate", "ShipCountry", "late"]], on="OrderID")

# What the line sold for after the discount.
df["sale"] = df["UnitPrice"] * df["Quantity"] * (1 - df["Discount"])
# The year and the quarter of the order, for grouping: dt.year, dt.quarter.
df["year"] = df["OrderDate"].dt.year
df["quarter"] = df["OrderDate"].dt.to_period("Q").astype(str)
df.head()

# %% [markdown]
# ## 4. Analysis
# What it is: answer the business questions: group, add up, compare, rank.
# What it gives you: the numbers behind the conclusions, in small tables you can read at a glance.
# Typical commands here: .groupby(), .agg(), .sum(), .nunique(), .sort_values(), .pivot_table().

# %%
# Sales by category with each one's share of the total.
by_category = df.groupby("CategoryName")["sale"].sum().sort_values(ascending=False)
pd.DataFrame({"sales": by_category.round(0), "share_pct": (100 * by_category / by_category.sum()).round(1)})

# %%
# The top countries by sales, and how many orders each placed.
by_country = df.groupby("ShipCountry").agg(sales=("sale", "sum"), orders=("OrderID", "nunique"))
by_country["per_order"] = (by_country["sales"] / by_country["orders"]).round(0)
by_country.sort_values("sales", ascending=False).head(10).round(0)

# %%
# Late deliveries: the share of shipped orders that left after the required date, by year.
shipped = orders[orders["shipped"]].copy()
shipped["year"] = shipped["OrderDate"].dt.year
late = shipped.groupby("year").agg(orders=("OrderID", "count"), late=("late", "sum"))
late["late_pct"] = (100 * late["late"] / late["orders"]).round(1)
late

# %%
# pivot_table: categories down the side, quarters across, sales in the cells.
# The data stops in early May 1998, so 1998Q2 is not a full quarter.
df.pivot_table(index="CategoryName", columns="quarter", values="sale", aggfunc="sum").round(0)

# %% [markdown]
# ## 5. Visualization
# What it is: draw the main result as a chart.
# What it gives you: a pattern you can see at once, which a table of numbers hides.
# Typical commands here: .plot(), plt.show(), .set_xlabel(), .set_ylabel(), plt.tight_layout().

# %%
# Sales per quarter as bars: the sum of the pivot's columns.
per_quarter = df.groupby("quarter")["sale"].sum()
ax = per_quarter.plot(kind="bar", figsize=(8, 4), title="Northwind sales by quarter (1998Q2 is partial)")
ax.set_xlabel("")
ax.set_ylabel("sales after discount")
plt.tight_layout()
plt.show()

# %% [markdown]
# ## 6. Conclusions and saving
# What it is: say in words what the numbers mean, and save the result you want to keep.
# What it gives you: an answer someone else can read, and a table you can come back to from a SQL tab.
# Typical commands here: lab.save(), .reset_index(), print().
#
# - Beverages sell the most (about 21 % of sales), then dairy (18 %); grains and produce are the smallest.
# - The USA and Germany placed the same number of orders (122 each) and lead in sales; Austria and
#   Ireland order less often but spend the most per order (about 3,200 and 2,600).
# - Few orders ship late: about 5 % in 1996 and 1997, 3 % in 1998; 21 orders had not shipped yet.
# - 1998Q1 is the best quarter so far: the business was growing when the data stops.
#
# The sales by country go back to the database as a table.

# %%
# lab.save(DataFrame, "name") writes it as a table in My tables (a table of that name is replaced).
lab.save(by_country.reset_index(), "northwind_sales_by_country")
print("Saved as northwind_sales_by_country (see My tables when the cell has finished).")
`,
  },
  {
    id: 'chinook',
    title: 'Chinook',
    question: 'What music sells, to whom, and do customers come back?',
    code: `# %% [markdown]
# # Chinook: what sells in a music store
# A digital music store: customers buy tracks, each purchase is an invoice with a line per track.
# We look at genres and countries, and at how often customers come back.
${HOW}

# %% [markdown]
# ## 1. Exploration (EDA)
# What it is: look at the data before you change it: its size, columns, types, gaps and the most common values.
# What it gives you: you know what you have, and which problems (wrong types, gaps, odd values) to fix next.
# Typical commands here: .shape, .head(), .dtypes, .isna().sum(), .describe(), .value_counts().

# %%
import pandas as pd
import matplotlib.pyplot as plt

tracks = lab.table("chinook.Track")
genres = lab.table("chinook.Genre")
invoices = lab.table("chinook.Invoice")
lines = lab.table("chinook.InvoiceLine")
customers = lab.table("chinook.Customer")

for name, table in [("tracks", tracks), ("invoices", invoices), ("lines", lines), ("customers", customers)]:
    print(name, table.shape)   # a loop: the same line for each pair (name, table) in the list

customers.head()

# %%
# The column types of the invoices: InvoiceDate is a date (datetime), Total a number with decimals (float).
invoices.dtypes

# %%
# Missing values: Company is empty for people buying for themselves, State for countries
# without states, Fax for almost everyone.
customers.isna().sum()

# %%
# Prices and quantities of the invoice lines. Every line is one track, so Quantity is 1.
lines[["UnitPrice", "Quantity"]].describe()

# %%
# Track length in milliseconds: describe() shows the spread, from short jingles to hour-long episodes.
tracks["Milliseconds"].describe().round(0)

# %%
# Customers per country.
customers["Country"].value_counts().head(10)

# %% [markdown]
# ## 2. Preprocessing: cleaning
# What it is: fix what the first look found: duplicates, gaps, wrong types, stray spaces and spellings.
# What it gives you: a table you can trust, so that later totals and joins do not quietly go wrong.
# Typical commands here: .duplicated(), .fillna(), .isna().

# %%
# A missing Company means a private buyer: say so in words, then count both kinds.
customers["Company"] = customers["Company"].fillna("(private)")
# A new column: "business" for everyone, then "private" where Company says so.
# .loc[condition, column] = value writes only into the rows where the condition is True.
customers["kind"] = "business"
customers.loc[customers["Company"] == "(private)", "kind"] = "private"
display(customers["kind"].value_counts())

# Composer is missing for many tracks: that is unknown, not an error, so we leave it empty.
print("tracks without a composer:", tracks["Composer"].isna().sum())

# Milliseconds are hard to read: minutes, rounded to one decimal.
tracks["minutes"] = (tracks["Milliseconds"] / 60000).round(1)

# Duplicates: each invoice line has its own id.
print("duplicate invoice lines:", lines["InvoiceLineId"].duplicated().sum())

# %% [markdown]
# ## 3. Preparation: joins and new columns
# What it is: put the tables together and add the columns the questions need (a total, a month, a flag).
# What it gives you: one wide table where every row has everything the analysis asks for.
# Typical commands here: .merge(), a new column: df["new"] = a * b, .rename(), .dt.year / .dt.month.

# %%
# Each invoice line gets its track's genre, and its invoice's date, country and customer.
genres = genres.rename(columns={"Name": "genre"})   # both tables have a column "Name"
df = lines.merge(tracks[["TrackId", "GenreId", "minutes"]], on="TrackId")
df = df.merge(genres, on="GenreId")
df = df.merge(invoices[["InvoiceId", "InvoiceDate", "BillingCountry", "CustomerId"]], on="InvoiceId")

df["revenue"] = df["UnitPrice"] * df["Quantity"]
df["year"] = df["InvoiceDate"].dt.year
df.head()

# %% [markdown]
# ## 4. Analysis
# What it is: answer the business questions: group, add up, compare, rank.
# What it gives you: the numbers behind the conclusions, in small tables you can read at a glance.
# Typical commands here: .groupby(), .agg(), .sum(), .sort_values(), .pivot_table(), .round().

# %%
# Revenue by genre with its share of the total, the ten biggest.
by_genre = df.groupby("genre")["revenue"].sum().sort_values(ascending=False)
share = (100 * by_genre / by_genre.sum()).round(1)
pd.DataFrame({"revenue": by_genre.round(2), "share_pct": share}).head(10)

# %%
# pivot_table: top five genres down the side, years across. .index[:5] are the first five names.
top5 = by_genre.index[:5]
df[df["genre"].isin(top5)].pivot_table(index="genre", columns="year", values="revenue", aggfunc="sum").round(2)

# %%
# Do customers come back? Count the invoices of each customer, then how many customers have 1, 2, 3… invoices.
invoices_per_customer = invoices.groupby("CustomerId")["InvoiceId"].count()
invoices_per_customer.value_counts().sort_index()

# %%
# Private buyers against businesses: how many, how much each spent on average.
spent = invoices.groupby("CustomerId")["Total"].sum().rename("spent").reset_index()
spent = spent.merge(customers[["CustomerId", "kind", "Country"]], on="CustomerId")
spent.groupby("kind").agg(customers=("CustomerId", "count"), avg_spent=("spent", "mean")).round(2)

# %% [markdown]
# ## 5. Visualization
# What it is: draw the main result as a chart.
# What it gives you: a pattern you can see at once, which a table of numbers hides.
# Typical commands here: .plot(), plt.show(), .set_xlabel(), .set_ylabel(), plt.tight_layout(), .sort_values().

# %%
# The ten biggest genres as horizontal bars (kind="barh"), the biggest at the top.
ax = by_genre.head(10).sort_values().plot(kind="barh", figsize=(8, 4), title="Revenue by genre, top 10")
ax.set_xlabel("revenue")
ax.set_ylabel("")
plt.tight_layout()
plt.show()

# %% [markdown]
# ## 6. Conclusions and saving
# What it is: say in words what the numbers mean, and save the result you want to keep.
# What it gives you: an answer someone else can read, and a table you can come back to from a SQL tab.
# Typical commands here: lab.save(), .reset_index(), print().
#
# - Rock alone brings more than a third of the revenue (35.5 %), Latin 16 %, Metal 11 %:
#   four genres make almost three quarters of it.
# - Every customer came back: 58 of 59 bought exactly 7 times, one 6 times. Real stores never look
#   this even, a sign that the sample data was generated.
# - Businesses (10 customers) spend about as much as private buyers (49): around 39 each.
# - Rock's revenue is steady year to year; TV Shows only start in 2022.
#
# The revenue by genre goes back to the database as a table.

# %%
# lab.save(DataFrame, "name") writes it as a table in My tables (a table of that name is replaced).
lab.save(by_genre.reset_index(), "chinook_revenue_by_genre")
print("Saved as chinook_revenue_by_genre (see My tables when the cell has finished).")
`,
  },
  {
    id: 'adventureworks',
    title: 'AdventureWorks LT',
    question: 'Which products earn the margin, and what does the catalogue look like?',
    code: `# %% [markdown]
# # AdventureWorks: products, prices and margin
# Adventure Works makes bicycles, parts, clothing and accessories. The product table is a good
# place to practise missing values: many products have no size, no colour or no weight.
# Then we join the June 2008 orders and see where the margin comes from.
${HOW}

# %% [markdown]
# ## 1. Exploration (EDA)
# What it is: look at the data before you change it: its size, columns, types, gaps and the most common values.
# What it gives you: you know what you have, and which problems (wrong types, gaps, odd values) to fix next.
# Typical commands here: .shape, .head(), .dtypes, .isna().sum(), .describe(), .value_counts().

# %%
import pandas as pd
import matplotlib.pyplot as plt

products = lab.table("adventureworks.Product")
categories = lab.table("adventureworks.ProductCategory")
lines = lab.table("adventureworks.SalesOrderDetail")
orders = lab.table("adventureworks.SalesOrderHeader")

print("products:", products.shape, " order lines:", lines.shape, " orders:", orders.shape)
products.head()

# %%
# Types: prices are float, dates datetime, Size is text because it mixes numbers (58) and letters (M).
products.dtypes

# %%
# Missing values: Size, Color, Weight, SellEndDate (empty = still on sale).
products.isna().sum()

# %%
# Cost and list price of the products: from a few dollars to over three thousand.
products[["StandardCost", "ListPrice", "Weight"]].describe().round(2)

# %%
# value_counts with dropna=False also counts the empty Size: missing values become a group too.
products["Size"].value_counts(dropna=False)

# %% [markdown]
# ## 2. Preprocessing: cleaning
# What it is: fix what the first look found: duplicates, gaps, wrong types, stray spaces and spellings.
# What it gives you: a table you can trust, so that later totals and joins do not quietly go wrong.
# Typical commands here: .fillna(), .isna().

# %%
# Size mixes frame sizes in centimetres (38 to 70) and clothing sizes (S, M, L, XL).
# str.isdigit() is True for text made only of digits: we use it to tell the two kinds apart.
products["size_kind"] = "no size"
products.loc[products["Size"].str.isdigit() == True, "size_kind"] = "number (frame)"
products.loc[products["Size"].isin(["S", "M", "L", "XL"]), "size_kind"] = "letter (clothing)"
display(products["size_kind"].value_counts())

# A missing colour: "no colour", so it shows as its own group in tables and charts.
products["Color"] = products["Color"].fillna("no colour")

# SellEndDate empty means still on sale: a True / False column says it plainly.
products["on_sale"] = products["SellEndDate"].isna()
print("products still on sale:", products["on_sale"].sum(), "of", len(products))

# %% [markdown]
# ## 3. Preparation: joins and new columns
# What it is: put the tables together and add the columns the questions need (a total, a month, a flag).
# What it gives you: one wide table where every row has everything the analysis asks for.
# Typical commands here: .merge(), a new column: df["new"] = a * b, .rename().

# %%
# A product points to a subcategory (Mountain Bikes), which points to its parent (Bikes).
sub = categories[["ProductCategoryID", "ParentProductCategoryID", "Name"]].rename(columns={"Name": "category"})
top = categories[["ProductCategoryID", "Name"]].rename(columns={"ProductCategoryID": "ParentProductCategoryID", "Name": "parent"})
products = products.merge(sub, on="ProductCategoryID").merge(top, on="ParentProductCategoryID", how="left")

# Margin per unit on the list price, and as a share of the price.
products["unit_margin"] = products["ListPrice"] - products["StandardCost"]
products["margin_pct"] = (100 * products["unit_margin"] / products["ListPrice"]).round(1)

# Each order line with its product, and the margin it really made (what was paid minus the cost).
df = lines.merge(products[["ProductID", "Name", "category", "parent", "Color", "StandardCost"]], on="ProductID")
df["margin"] = df["LineTotal"] - df["OrderQty"] * df["StandardCost"]
df[["Name", "OrderQty", "UnitPrice", "UnitPriceDiscount", "LineTotal", "margin"]].head()

# %% [markdown]
# ## 4. Analysis
# What it is: answer the business questions: group, add up, compare, rank.
# What it gives you: the numbers behind the conclusions, in small tables you can read at a glance.
# Typical commands here: .groupby(), .agg(), .sum(), .pivot_table(), .round().

# %%
# The catalogue: how many products, the average list price and margin per top category.
products.groupby("parent").agg(products=("ProductID", "count"), avg_price=("ListPrice", "mean"), avg_margin_pct=("margin_pct", "mean")).round(1)

# %%
# What was sold in June 2008: revenue and margin by top category, with shares of the total.
sold = df.groupby("parent").agg(units=("OrderQty", "sum"), revenue=("LineTotal", "sum"), margin=("margin", "sum"))
sold["revenue_share_pct"] = (100 * sold["revenue"] / sold["revenue"].sum()).round(1)
sold["margin_pct"] = (100 * sold["margin"] / sold["revenue"]).round(1)
sold.round({"revenue": 0, "margin": 0})

# %%
# The ten products with the most margin. nlargest(10, column) = sort by it, keep the top 10.
by_product = df.groupby(["parent", "Name"], as_index=False).agg(units=("OrderQty", "sum"), margin=("margin", "sum"))
by_product.nlargest(10, "margin").round(0)

# %%
# pivot_table: units sold by top category and colour.
df.pivot_table(index="parent", columns="Color", values="OrderQty", aggfunc="sum", fill_value=0)

# %% [markdown]
# ## 5. Visualization
# What it is: draw the main result as a chart.
# What it gives you: a pattern you can see at once, which a table of numbers hides.
# Typical commands here: .plot(), plt.show(), .set_xlabel(), plt.tight_layout().

# %%
# Revenue and margin side by side for each top category: a DataFrame with two columns draws two bars each.
ax = sold[["revenue", "margin"]].plot(kind="bar", figsize=(8, 4), title="June 2008: revenue and margin by top category")
ax.set_xlabel("")
plt.xticks(rotation=0)
plt.tight_layout()
plt.show()

# %% [markdown]
# ## 6. Conclusions and saving
# What it is: say in words what the numbers mean, and save the result you want to keep.
# What it gives you: an answer someone else can read, and a table you can come back to from a SQL tab.
# Typical commands here: lab.save(), print().
#
# - Size mixes two systems: 177 products have a frame size in centimetres, 34 a clothing size,
#   84 none. A text column that looks numeric is worth checking before converting it.
# - Bikes are 81 % of June's revenue but, at standard cost, they made a small loss overall (−4 %);
#   the margin came from components and accessories. Some bikes do earn: the Mountain-200 models
#   top the margin list.
# - On the catalogue (list prices), accessories have the highest margin (about 62 %) and bikes the lowest (40 %):
#   the gap between list price and what resellers paid is where the bikes lose it.
#
# The products with their category and margin go back to the database as a table.

# %%
# Keep the useful columns, then lab.save writes them as a table in My tables.
keep = products[["ProductID", "Name", "parent", "category", "Color", "size_kind", "ListPrice", "StandardCost", "margin_pct", "on_sale"]]
lab.save(keep, "aw_products_margin")
print("Saved as aw_products_margin (see My tables when the cell has finished).")
`,
  },
  {
    id: 'sakila',
    title: 'Sakila',
    question: 'Which films earn, and how often are rentals returned late?',
    code: `# %% [markdown]
# # Sakila: rentals, returns and revenue
# A DVD rental chain with two stores. A customer rents a copy of a film for a set number of days
# (rental_duration) and pays. We look at late returns and at which categories earn.
${HOW}

# %% [markdown]
# ## 1. Exploration (EDA)
# What it is: look at the data before you change it: its size, columns, types, gaps and the most common values.
# What it gives you: you know what you have, and which problems (wrong types, gaps, odd values) to fix next.
# Typical commands here: .shape, .head(), .dtypes, .isna().sum(), .describe(), .value_counts().

# %%
import pandas as pd
import matplotlib.pyplot as plt

rentals = lab.table("sakila.rental")
payments = lab.table("sakila.payment")
inventory = lab.table("sakila.inventory")
films = lab.table("sakila.film")
film_category = lab.table("sakila.film_category")
categories = lab.table("sakila.category")
customers = lab.table("sakila.customer")

print("rentals:", rentals.shape, " payments:", payments.shape, " films:", films.shape)
rentals.head()

# %%
# Types: rental_date and return_date are dates with a time; customer.active is text ("1" or "0").
customers.dtypes

# %%
# return_date is empty for copies never brought back.
rentals.isna().sum()

# %%
# Films: length in minutes, how many days a rental lasts, price per rental, cost to replace a lost copy.
films[["length", "rental_duration", "rental_rate", "replacement_cost"]].describe().round(2)

# %%
# How many films of each age rating (G is for everyone, NC-17 adults only).
films["rating"].value_counts()

# %% [markdown]
# ## 2. Preprocessing: cleaning
# What it is: fix what the first look found: duplicates, gaps, wrong types, stray spaces and spellings.
# What it gives you: a table you can trust, so that later totals and joins do not quietly go wrong.
# Typical commands here: .duplicated(), .notna(), .dt.days / .dt.total_seconds().

# %%
# active is text: compare it with "1" to get True / False, then count.
customers["active"] = customers["active"] == "1"
print("active customers:", customers["active"].sum(), "of", len(customers))

# Rentals never returned: we keep them, but they can't be on time or late, so we mark them.
rentals["returned"] = rentals["return_date"].notna()
print("not returned:", (~rentals["returned"]).sum())

# How long each rental lasted, in days with decimals: the time difference in seconds / 86,400.
rentals["days_out"] = ((rentals["return_date"] - rentals["rental_date"]).dt.total_seconds() / 86400).round(1)

# Duplicates: a rental id appears once.
print("duplicate rentals:", rentals["rental_id"].duplicated().sum())
rentals[["rental_id", "rental_date", "return_date", "days_out"]].head()

# %% [markdown]
# ## 3. Preparation: joins and new columns
# What it is: put the tables together and add the columns the questions need (a total, a month, a flag).
# What it gives you: one wide table where every row has everything the analysis asks for.
# Typical commands here: .merge(), a new column: df["new"] = a * b, .dt.to_period(), .rename().

# %%
# Each rental gets its film (through the copy in inventory), the film's category and rental_duration.
film_info = films[["film_id", "title", "rental_duration", "rental_rate"]].merge(film_category[["film_id", "category_id"]], on="film_id")
film_info = film_info.merge(categories[["category_id", "name"]].rename(columns={"name": "category"}), on="category_id")

df = rentals.merge(inventory[["inventory_id", "film_id", "store_id"]], on="inventory_id")
df = df.merge(film_info, on="film_id")

# Late: kept longer than the film's rental_duration. Only for returned copies.
df["late"] = df["returned"] & (df["days_out"] > df["rental_duration"])
df["month"] = df["rental_date"].dt.to_period("M").dt.to_timestamp()
df[["title", "category", "rental_duration", "days_out", "late"]].head()

# %% [markdown]
# ## 4. Analysis
# What it is: answer the business questions: group, add up, compare, rank.
# What it gives you: the numbers behind the conclusions, in small tables you can read at a glance.
# Typical commands here: .groupby(), .sum(), .sort_values(), .pivot_table(), .round().

# %%
# The share of late returns, by category: the mean of a True / False column is the share of True.
late = df[df["returned"]].groupby("category")["late"].mean().mul(100).round(1).sort_values(ascending=False)
late.rename("late_pct")

# %%
# Revenue by category: payments joined to the rentals they paid for.
paid = payments.merge(df[["rental_id", "category"]], on="rental_id")
revenue = paid.groupby("category")["amount"].sum().sort_values(ascending=False)
pd.DataFrame({"revenue": revenue.round(2), "share_pct": (100 * revenue / revenue.sum()).round(1)})

# %%
# Rentals per month and store: months down the side, the two stores across.
by_month = df.pivot_table(index="month", columns="store_id", values="rental_id", aggfunc="count", fill_value=0)
by_month

# %% [markdown]
# ## 5. Visualization
# What it is: draw the main result as a chart.
# What it gives you: a pattern you can see at once, which a table of numbers hides.
# Typical commands here: .plot(), plt.show(), .set_xlabel(), plt.tight_layout().

# %%
# The late share by category as bars, highest first.
ax = late.plot(kind="bar", figsize=(9, 4), title="Share of rentals returned late, by film category (%)")
ax.set_xlabel("")
plt.tight_layout()
plt.show()

# %% [markdown]
# ## 6. Conclusions and saving
# What it is: say in words what the numbers mean, and save the result you want to keep.
# What it gives you: an answer someone else can read, and a table you can come back to from a SQL tab.
# Typical commands here: lab.save(), print().
#
# - About half of the returned rentals came back after their rental period: late returns are the rule
#   here, not the exception (54 % for Sports, 42 % for Travel, the lowest).
# - Revenue is spread evenly: no category brings more than 8 %; Sports leads.
# - The two stores rent almost exactly the same amounts every month.
# - The data has gaps: rentals jump from August 2005 to a few days of February 2006, so monthly
#   trends here need care. 183 copies were never returned.
#
# Every rental with its film, category and lateness goes back to the database as a table.

# %%
# lab.save(DataFrame, "name") writes it as a table in My tables (a table of that name is replaced).
lab.save(df[["rental_id", "rental_date", "store_id", "title", "category", "rental_duration", "days_out", "late"]], "sakila_rentals_late")
print("Saved as sakila_rentals_late (see My tables when the cell has finished).")
`,
  },
]

export function walkthroughById(id: string): Walkthrough | undefined {
  return WALKTHROUGHS.find((w) => w.id === id)
}
