// Step 3 of the build page: Model v1 (spec 4.1). Lab builds the star from the cleaned tables and shows it with its
// numbers; the learner reads it and continues. Linking the keys by hand is a later version.
import { useEffect, useState } from 'react'
import { ArrowRight, Check, Link2, Loader2 } from 'lucide-react'
import { GOLD_SQL, MODEL_TEXT } from '../../data/build/kaiyoSales'
import { buildStar, type StarFacts } from '../../db/buildRun'
import { checkpoint } from '../../db/engine'
import { enginePort } from '../../db/pipelinePort'
import { refreshCatalog } from '../store'
import { FoldedSql, fmtN } from './BuildTable'
import './dashboard.css'

interface Props {
  ready: boolean
  done: boolean
  onContinue: () => void
}

const DIM_CUSTOMER = ['customer_id', 'customer_name', 'customer_type', 'chain_name', 'region_id', 'city']
const FACT = ['sale_date', 'customer_id', 'product_id', 'units', 'revenue']
const DIM_PRODUCT = ['product_id', 'sku_code', 'product_name', 'brand', 'category']

function Box({ title, cols, keys, lines, testid }: { title: string; cols: string[]; keys: string[]; lines: string[]; testid: string }) {
  return (
    <div className="bm-box" data-testid={testid}>
      <div className="bm-box-title">{title}</div>
      <ul className="bm-cols">
        {cols.map((c) => (
          <li key={c} className={keys.includes(c) ? 'is-key' : undefined}>
            {c}
          </li>
        ))}
      </ul>
      <div className="bm-box-nums">
        {lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </div>
  )
}

export function ModelScreen({ ready, done, onContinue }: Props) {
  const [facts, setFacts] = useState<StarFacts | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    let alive = true
    buildStar(enginePort)
      .then(async (f) => {
        await checkpoint()
        await refreshCatalog()
        if (alive) setFacts(f)
      })
      .catch((e) => alive && setError(String(e instanceof Error ? e.message : e)))
    return () => {
      alive = false
    }
  }, [ready])

  return (
    <div className="space-y-4" data-testid="build-model">
      <p className="build-lead">{MODEL_TEXT.lead}</p>
      {error && <div className="build-error" role="alert">{error}</div>}
      {!facts && !error && (
        <div className="build-muted">
          <Loader2 size={14} className="animate-spin" style={{ display: 'inline', verticalAlign: '-2px' }} /> Building the star…
        </div>
      )}
      {facts && (
        <>
          <div className="bm-star" aria-label="The star: sales in the middle, customers and products around">
            <Box
              title="gold_dim_customer"
              cols={DIM_CUSTOMER}
              keys={['customer_id']}
              lines={[`${fmtN(facts.customers)} customers`, `${fmtN(facts.customersSold)} have sales`]}
              testid="model-customers"
            />
            <div className="bm-link">
              <Link2 size={16} />
              <span>{MODEL_TEXT.link1}</span>
              <b data-testid="model-no-customer">{fmtN(facts.noCustomer)} sales without a customer</b>
            </div>
            <Box title="gold_fact_sales" cols={FACT} keys={['customer_id', 'product_id']} lines={[`${fmtN(facts.fact)} sales`]} testid="model-fact" />
            <div className="bm-link">
              <Link2 size={16} />
              <span>{MODEL_TEXT.link2}</span>
              <b data-testid="model-no-product">{fmtN(facts.noProduct)} sales without a product</b>
            </div>
            <Box
              title="gold_dim_product"
              cols={DIM_PRODUCT}
              keys={['product_id']}
              lines={[`${fmtN(facts.products)} products`, `${fmtN(facts.productsSold)} have sales`]}
              testid="model-products"
            />
          </div>
          <p className="build-muted" style={{ margin: 0 }}>{MODEL_TEXT.note}</p>
          <p className="build-muted" style={{ margin: 0 }}>{MODEL_TEXT.noRegions}</p>
          <FoldedSql summary="Show the SQL that built the star" sql={GOLD_SQL.join(';\n\n') + ';'} />
          {done ? (
            <span className="build-ok">
              <Check size={14} /> Model done
            </span>
          ) : (
            <button className="btn btn-primary" onClick={onContinue} data-testid="model-continue">
              Continue <ArrowRight size={14} />
            </button>
          )}
        </>
      )}
    </div>
  )
}
