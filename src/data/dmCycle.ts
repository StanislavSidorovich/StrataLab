// The four-stage data analysis cycle cheat sheet (Exploration -> Preprocessing -> Processing -> Analysis).
// Every example runs self-contained on the Kaiyo Trading (`quaera`) dataset via `lab.table(...)`
// using only pandas, numpy, and matplotlib so it runs cleanly in browser Pyodide.

export type DmStageId = 'exploration' | 'preprocessing' | 'processing' | 'analysis'

export interface DmMethodNote {
  name: string
  whenToUse: string
}

export interface DmExample {
  id: string
  title: string
  why: string
  code: string
}

export interface DmStage {
  id: DmStageId
  number: 1 | 2 | 3 | 4
  title: string
  summary: string
  methods?: DmMethodNote[]
  examples: DmExample[]
}

export const DM_CYCLE_DATASET = 'quaera'

export const DM_STAGES: readonly DmStage[] = [
  {
    id: 'exploration',
    number: 1,
    title: 'Exploration',
    summary:
      'Exploration inspects raw tables before any edits are made. Checking dimensions, column types, missing values, duplicates, and category counts reveals quality issues early. It comes first because every cleaning rule and modeling choice depends on what actually lives in the data.',
    examples: [
      {
        id: 'dm-exp-shape',
        title: 'Shape, column types, and sample rows',
        why: 'Confirm row and column counts, data types, and sample records before joining or aggregating.',
        code: `import pandas as pd

df = lab.table("quaera.fact_sellout")
print("Shape:", df.shape)
df.info()
df.head(5)`,
      },
      {
        id: 'dm-exp-describe',
        title: 'Numeric summary with describe()',
        why: 'Check min, max, quartiles, and spread to spot extreme values or skew.',
        code: `import pandas as pd

df = lab.table("quaera.fact_sellout")
df[["units", "revenue"]].describe().T`,
      },
      {
        id: 'dm-exp-nulls',
        title: 'Missing value counts per column',
        why: 'Find where nulls appear so you know which columns require filtering or imputation.',
        code: `import pandas as pd

raw = lab.table("quaera.staging_raw_sellout")
raw.isna().sum().sort_values(ascending=False)`,
      },
      {
        id: 'dm-exp-dups',
        title: 'Exact and sale-key duplicates',
        why: 'Detect repeated export lines and duplicate natural keys before summing metrics.',
        code: `import pandas as pd

raw = lab.table("quaera.staging_raw_sellout")
pd.Series({
    "exact_rows": int(raw.duplicated().sum()),
    "same_sale_key": int(raw.duplicated(subset=["sale_date", "customer_name", "sku_code"]).sum()),
})`,
      },
      {
        id: 'dm-exp-counts',
        title: 'Category distribution with value_counts()',
        why: 'Check category labels and any missing values before grouping or encoding.',
        code: `import pandas as pd

products = lab.table("quaera.dim_product")
products["category"].value_counts(dropna=False)`,
      },
    ],
  },
  {
    id: 'preprocessing',
    number: 2,
    title: 'Preprocessing',
    summary:
      'Preprocessing repairs the formatting and scale issues uncovered during exploration. It converts decimal-comma strings into numbers, parses mixed date formats explicitly, handles outliers, and encodes or scales features. It follows exploration and precedes processing because grouping, clustering, and rules break on inconsistent inputs.',
    examples: [
      {
        id: 'dm-pre-numbers',
        title: 'Fix decimal-comma strings into floats',
        why: 'Raw exports often store decimals with commas as text, blocking numeric calculations.',
        code: `import pandas as pd

raw = lab.table("quaera.staging_raw_sellout")
has_comma = raw["revenue"].str.contains(",", na=False)
print("Rows with decimal comma in revenue:", int(has_comma.sum()))
clean = pd.DataFrame({
    "units": pd.to_numeric(raw["units"].str.replace(",", ".", regex=False), errors="coerce"),
    "revenue": raw["revenue"].str.replace(",", ".", regex=False).astype(float),
})
clean.dropna().head(8)`,
      },
      {
        id: 'dm-pre-dates',
        title: 'Parse DD.MM.YYYY dates explicitly',
        why: 'Day-first exports are misread by month-first defaults unless matched and parsed with an explicit format.',
        code: `import pandas as pd

raw = lab.table("quaera.staging_raw_sellout")
dot_mask = raw["sale_date"].str.match(r"^\\d{2}\\.\\d{2}\\.\\d{4}$", na=False)
parsed = pd.to_datetime(raw.loc[dot_mask, "sale_date"], format="%d.%m.%Y", errors="coerce")
pd.DataFrame({
    "matched_rows": [int(dot_mask.sum())],
    "parsed_rows": [int(parsed.notna().sum())],
    "min_date": [parsed.min()],
    "max_date": [parsed.max()],
})`,
      },
      {
        id: 'dm-pre-iqr',
        title: 'Detect and clip outliers by IQR',
        why: 'Extreme unit spikes distort averages and distances unless bounded with the interquartile range.',
        code: `import pandas as pd

df = lab.table("quaera.fact_sellout")
q1, q3 = df["units"].quantile([0.25, 0.75])
iqr = q3 - q1
low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
outliers = int(((df["units"] < low) | (df["units"] > high)).sum())
print(f"IQR bounds: [{low:.2f}, {high:.2f}], outliers: {outliers}")
clipped = df["units"].clip(lower=low, upper=high)
pd.DataFrame({"original_units": df["units"], "clipped_units": clipped}).describe().T`,
      },
      {
        id: 'dm-pre-encode',
        title: 'One-hot encode categories',
        why: 'Convert categorical text columns into 0/1 indicator columns for numeric models.',
        code: `import pandas as pd

products = lab.table("quaera.dim_product")
pd.get_dummies(
    products[["product_id", "category", "division"]],
    columns=["category", "division"],
    drop_first=True,
    dtype=int,
).head(5)`,
      },
      {
        id: 'dm-pre-scale',
        title: 'Min-max scale product totals to [0, 1]',
        why: 'Put units and revenue on the same 0 to 1 range so large revenue numbers do not dominate distances.',
        code: `import pandas as pd

df = lab.table("quaera.fact_sellout")
prod = df.groupby("product_id", as_index=False)[["units", "revenue"]].sum()
for col in ["units", "revenue"]:
    span = prod[col].max() - prod[col].min()
    prod[f"{col}_scaled"] = ((prod[col] - prod[col].min()) / span).round(4) if span else 0.0
prod.head(8)`,
      },
    ],
  },
  {
    id: 'processing',
    number: 3,
    title: 'Processing',
    summary:
      'Processing turns clean tables into aggregated metrics, segments, or itemset patterns. It joins facts with dimensions, computes grouped totals, and applies methods like K-means clustering and association rules. It comes after preprocessing because reliable aggregations and distance metrics require clean, scaled values.',
    methods: [
      {
        name: 'Clustering (K-means)',
        whenToUse: 'Use when you want to group products, stores, or customers into k behavioral segments from numeric features without predefined labels.',
      },
      {
        name: 'Association rules',
        whenToUse: 'Use when you want to find items or brands frequently bought together in the same basket or customer-week, ranked by support, confidence, and lift.',
      },
    ],
    examples: [
      {
        id: 'dm-proc-groupby',
        title: 'Join and group by category and brand',
        why: 'Combine sell-out facts with product attributes to summarize volume and revenue per brand.',
        code: `import pandas as pd

df = lab.table("quaera.fact_sellout")
products = lab.table("quaera.dim_product")
merged = df.merge(products[["product_id", "category", "brand"]], on="product_id", how="left")
merged.groupby(["category", "brand"], as_index=False)[["units", "revenue"]].sum().sort_values("revenue", ascending=False)`,
      },
      {
        id: 'dm-proc-kmeans',
        title: 'K-means clustering with NumPy (k = 3)',
        why: 'Segment products into three performance clusters using min-max scaled units and revenue.',
        code: `import numpy as np
import pandas as pd

# In Jupyter with scikit-learn: from sklearn.cluster import KMeans; KMeans(n_clusters=3, n_init="auto", random_state=42).fit_predict(X_scaled)
df = lab.table("quaera.fact_sellout")
prod = df.groupby("product_id", as_index=False)[["units", "revenue"]].sum()
X = prod[["units", "revenue"]].to_numpy(dtype=float)
span = np.where(X.max(axis=0) > X.min(axis=0), X.max(axis=0) - X.min(axis=0), 1.0)
X_scaled = (X - X.min(axis=0)) / span

rng = np.random.default_rng(42)
centroids = X_scaled[rng.choice(len(X_scaled), size=3, replace=False)]
for _ in range(25):
    dists = np.linalg.norm(X_scaled[:, None, :] - centroids[None, :, :], axis=2)
    labels = np.argmin(dists, axis=1)
    updated = np.array([
        X_scaled[labels == k].mean(axis=0) if np.any(labels == k) else centroids[k]
        for k in range(3)
    ])
    if np.allclose(centroids, updated):
        break
    centroids = updated

prod["cluster"] = labels
summary = prod.groupby("cluster", as_index=False).agg(
    products=("product_id", "count"),
    avg_units=("units", "mean"),
    avg_revenue=("revenue", "mean"),
)
summary["centroid_units_scaled"] = centroids[:, 0].round(3)
summary["centroid_rev_scaled"] = centroids[:, 1].round(3)
summary`,
      },
      {
        id: 'dm-proc-rules',
        title: 'Association rules on brand baskets',
        why: 'Measure support, confidence, and lift for brand pairs bought in the same customer-week.',
        code: `import pandas as pd

# In Jupyter with mlxtend: from mlxtend.frequent_patterns import apriori, association_rules
df = lab.table("quaera.fact_sellout")
products = lab.table("quaera.dim_product")
baskets = (
    df.merge(products[["product_id", "brand"]], on="product_id", how="inner")
    .assign(basket_id=lambda d: d["customer_id"].astype(str) + "_" + d["week_start"].astype(str))
    [["basket_id", "brand"]]
    .drop_duplicates()
)
n_baskets = baskets["basket_id"].nunique()
brand_support = baskets.groupby("brand")["basket_id"].nunique() / n_baskets
pairs = baskets.merge(baskets, on="basket_id")
pairs = pairs[pairs["brand_x"] < pairs["brand_y"]]
rules = (
    pairs.groupby(["brand_x", "brand_y"], as_index=False)["basket_id"]
    .nunique()
    .rename(columns={"brand_x": "antecedent", "brand_y": "consequent", "basket_id": "pair_baskets"})
)
rules["support"] = (rules["pair_baskets"] / n_baskets).round(3)
rules["confidence"] = (rules["support"] / rules["antecedent"].map(brand_support)).round(3)
rules["lift"] = (rules["confidence"] / rules["consequent"].map(brand_support)).round(3)
rules[rules["lift"] > 1].sort_values("lift", ascending=False).head(10)`,
      },
    ],
  },
  {
    id: 'analysis',
    number: 4,
    title: 'Analysis',
    summary:
      'Analysis interprets processed outputs to answer business questions and guide decisions. It compares segment profiles against dataset averages, evaluates variable correlations, and presents clear visual rankings. It comes last because valid conclusions depend on cleaned inputs and well-formed groups.',
    methods: [
      {
        name: 'Segment profiling',
        whenToUse: 'Use after grouping or clustering to compare each segment mean against the overall average via z-scores and describe what makes it distinct.',
      },
      {
        name: 'Rule evaluation',
        whenToUse: 'Use after mining co-occurrences to filter by minimum support and lift > 1 so rare coincidences do not look like real cross-sell opportunities.',
      },
    ],
    examples: [
      {
        id: 'dm-ana-profile',
        title: 'Category profile vs overall average',
        why: 'Compare each category mean against the overall mean using z-scores to spot high and low performers.',
        code: `import pandas as pd

df = lab.table("quaera.fact_sellout")
products = lab.table("quaera.dim_product")
merged = df.merge(products[["product_id", "category"]], on="product_id", how="left")
prof = merged.groupby("category", as_index=False)[["units", "revenue"]].mean()
for col in ["units", "revenue"]:
    prof[f"{col}_z"] = ((prof[col] - df[col].mean()) / df[col].std()).round(3)
prof.sort_values("revenue", ascending=False)`,
      },
      {
        id: 'dm-ana-corr',
        title: 'Correlation matrix for numeric metrics',
        why: 'Check how strongly units, revenue, and average price move together across transactions.',
        code: `import pandas as pd

df = lab.table("quaera.fact_sellout")
df[["units", "revenue", "avg_price"]].corr(numeric_only=True).round(3)`,
      },
      {
        id: 'dm-ana-chart',
        title: 'Revenue by brand chart and table',
        why: 'Pair a horizontal bar chart with sorted totals so brand concentration is clear at a glance.',
        code: `import matplotlib.pyplot as plt
import pandas as pd

df = lab.table("quaera.fact_sellout")
products = lab.table("quaera.dim_product")
by_brand = (
    df.merge(products[["product_id", "brand"]], on="product_id", how="left")
    .groupby("brand", as_index=False)["revenue"]
    .sum()
    .sort_values("revenue", ascending=True)
)
fig, ax = plt.subplots(figsize=(7, 4))
ax.barh(by_brand["brand"], by_brand["revenue"])
ax.set_title("Sell-out revenue by brand")
ax.set_xlabel("Revenue")
plt.tight_layout()
plt.show()
by_brand.sort_values("revenue", ascending=False).reset_index(drop=True)`,
      },
    ],
  },
]
