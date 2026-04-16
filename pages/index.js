import Head from 'next/head'
import useSWR from 'swr'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const fetcher = url => fetch(url).then(r => r.json())

// ── Formatters ──────────────────────────────────────────────────────────────
const fmtK = (v) => {
  if (v == null) return '—'
  const neg = v < 0
  const s = Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  return neg ? `(${s})` : s
}

const fmtM = (v) => {
  if (v == null) return '—'
  return `${Math.round(v).toLocaleString('fr-FR')} M€`
}

const fmtPct = (v) => {
  if (v == null || !isFinite(v)) return '—'
  const p = (v * 100).toFixed(1)
  return v >= 0 ? `+${p}%` : `${p}%`
}

const growth = (curr, prev) =>
  prev && prev !== 0 ? (curr - prev) / Math.abs(prev) : null

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, pct, pctGoodIfPositive = true }) {
  const isGood = pct == null ? null : (pctGoodIfPositive ? pct >= 0 : pct <= 0)
  const pctColor = isGood === null ? 'text-gray-400' : isGood ? 'text-emerald-600' : 'text-rose-500'
  const pctBg   = isGood === null ? 'bg-gray-100'   : isGood ? 'bg-emerald-50'    : 'bg-rose-50'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-brand-navy">{value}</span>
      {pct != null && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full self-start ${pctColor} ${pctBg}`}>
          {fmtPct(pct)} vs {sub}
        </span>
      )}
      {pct == null && sub && (
        <span className="text-xs text-gray-400">{sub}</span>
      )}
    </div>
  )
}

// ── P&L Table ───────────────────────────────────────────────────────────────
function PLTable({ pl, years }) {
  // Show FY22A → FY26E (skip FY21A index 0)
  const displayYears = years.slice(1)
  const displayIdxs  = [1, 2, 3, 4, 5]

  const varColor = (metric, val) => {
    if (val == null) return 'text-gray-400'
    const good = metric.isPositiveGood ? val > 0 : val < 0
    return good ? 'text-emerald-600' : 'text-rose-500'
  }

  const numColor = (metric, val) => {
    if (val == null) return 'text-gray-300'
    if (metric.key === 'aum' || metric.key === 'arr') return 'text-brand-navy'
    if (val < 0) return 'text-rose-600'
    return 'text-gray-800'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-brand-navy text-white">
            <th className="text-left px-4 py-2.5 rounded-tl-lg font-semibold">Ligne (k€)</th>
            {displayYears.map(y => (
              <th key={y} className="text-right px-4 py-2.5 font-semibold">{y}</th>
            ))}
            <th className="text-right px-4 py-2.5 rounded-tr-lg font-semibold text-brand-light">
              Var 24→25
            </th>
          </tr>
        </thead>
        <tbody>
          {pl.map((metric, i) => {
            const v24 = metric.values[3]
            const v25 = metric.values[4]
            const varVal = growth(v25, v24)
            const isAuM = metric.key === 'aum' || metric.key === 'arr'
            if (isAuM && i > 0 && !pl[i-1].key.includes('aum') && !pl[i-1].key.includes('arr')) {
              // spacer before AuM section
            }
            return (
              <tr
                key={metric.key}
                className={`border-b border-gray-100 ${
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                } ${metric.isHeader ? 'font-semibold' : ''}`}
              >
                <td className={`px-4 py-2 ${metric.isHeader ? 'text-brand-navy' : 'text-gray-600 pl-6'}`}>
                  {metric.label}
                </td>
                {displayIdxs.map(idx => (
                  <td key={idx} className={`text-right px-4 py-2 tabular-nums ${numColor(metric, metric.values[idx])}`}>
                    {metric.values[idx] == null ? '—' : fmtK(metric.values[idx])}
                  </td>
                ))}
                <td className={`text-right px-4 py-2 tabular-nums font-medium ${varColor(metric, varVal)}`}>
                  {varVal != null ? fmtPct(varVal) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Custom Tooltip ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, unit = 'k€' }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex gap-2">
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-medium">{fmtK(p.value)} {unit}</span>
        </p>
      ))}
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data, error, isLoading, mutate } = useSWR('/api/data', fetcher, {
    refreshInterval: 5 * 60 * 1000, // refresh every 5 min
    revalidateOnFocus: true,
  })

  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  // ── Chart data ──────────────────────────────────────────────────────────
  const plChartData = data
    ? data.years.slice(1).map((y, i) => ({
        year: y,
        revenue: data.pl.find(m => m.key === 'revenue')?.values[i + 1] ?? null,
        ebitda:  data.pl.find(m => m.key === 'ebitda')?.values[i + 1] ?? null,
      }))
    : []

  const tresoChartData = data
    ? data.treso
        .filter(t => t.cash !== null)
        .slice(-30) // last 30 months
    : []

  // ── KPI values ──────────────────────────────────────────────────────────
  const K = data?.kpis ?? {}

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Head>
        <title>Ramify — Dashboard Comptable</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* ── Header ── */}
      <header className="bg-brand-navy text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-xl font-bold tracking-tight">RAMIFY</h1>
          <p className="text-xs text-blue-200 mt-0.5">Dashboard Comptable</p>
        </div>
        <div className="flex items-center gap-4">
          {data && (
            <p className="text-xs text-blue-200 hidden sm:block">
              Données du {new Date(data.lastUpdated).toLocaleString('fr-FR')}
            </p>
          )}
          <button
            onClick={() => mutate()}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualiser
          </button>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Error state ── */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm">
            <strong>Erreur de chargement :</strong> {error.message || 'Impossible de lire le fichier OneDrive.'}
            <br /><span className="text-rose-400 text-xs">Vérifiez que ONEDRIVE_SHARE_URL est bien configuré dans Vercel.</span>
          </div>
        )}

        {/* ── Loading state ── */}
        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 h-24 animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard
                label="Revenue FY25E"
                value={`${fmtK(K.revenue?.fy25)} k€`}
                sub="FY24A"
                pct={growth(K.revenue?.fy25, K.revenue?.fy24)}
                pctGoodIfPositive
              />
              <KpiCard
                label="AuM FY25E"
                value={K.aum?.fy25 ? `${K.aum.fy25} M€` : '—'}
                sub="FY24A"
                pct={growth(K.aum?.fy25, K.aum?.fy24)}
                pctGoodIfPositive
              />
              <KpiCard
                label="ARR FY25E"
                value={`${fmtK(K.arr?.fy25)} k€`}
                sub="FY24A"
                pct={growth(K.arr?.fy25, K.arr?.fy24)}
                pctGoodIfPositive
              />
              <KpiCard
                label="EBITDA FY25E"
                value={`${fmtK(K.ebitda?.fy25)} k€`}
                sub="FY24A"
                pct={growth(K.ebitda?.fy25, K.ebitda?.fy24)}
                pctGoodIfPositive={false}
              />
              <KpiCard
                label="Cash (dernière maj)"
                value={`${fmtK(K.latestCash)} k€`}
                sub="Trésorerie disponible"
              />
              <KpiCard
                label="Résultat net FY25E"
                value={`${fmtK(K.netResult?.fy25)} k€`}
                sub="FY24A"
                pct={growth(K.netResult?.fy25, K.netResult?.fy24)}
                pctGoodIfPositive={false}
              />
            </div>

            {/* ── Charts row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Revenue & EBITDA */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-brand-navy mb-4">
                  Revenue & EBITDA annuels (k€)
                </h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={plChartData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="#ccc" />
                    <Bar dataKey="revenue" name="Revenue"  fill="#1E3A5F" radius={[3,3,0,0]} />
                    <Bar dataKey="ebitda"  name="EBITDA"   fill="#C0392B" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Trésorerie mensuelle */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-brand-navy mb-4">
                  Trésorerie mensuelle (k€)
                </h2>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={tresoChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 9 }}
                      interval={Math.floor(tresoChartData.length / 8)}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtK(v)} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      dataKey="cash"
                      name="Trésorerie"
                      stroke="#1E3A5F"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── P&L Table ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-brand-navy">
                  P&amp;L annuel — Résumé consolidé (k€)
                </h2>
                <span className="text-xs text-gray-400">Valeurs en k€ sauf AuM (M€)</span>
              </div>
              <PLTable pl={data.pl} years={data.years} />
            </div>

            {/* ── Trésorerie détaillée ── */}
            {tresoChartData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-brand-navy">
                    Évolution trésorerie mensuelle (k€)
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-brand-light text-brand-navy">
                        <th className="text-left px-4 py-2 font-semibold">Mois</th>
                        <th className="text-right px-4 py-2 font-semibold">Trésorerie (k€)</th>
                        <th className="text-right px-4 py-2 font-semibold">Variation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.treso.filter(t => t.cash !== null).slice(-24).map((t, i, arr) => {
                        const prev = arr[i - 1]?.cash ?? null
                        const diff = prev !== null ? t.cash - prev : null
                        return (
                          <tr key={t.month} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-1.5 font-medium text-gray-600">{t.month}</td>
                            <td className="text-right px-4 py-1.5 tabular-nums font-semibold text-brand-navy">
                              {fmtK(t.cash)}
                            </td>
                            <td className={`text-right px-4 py-1.5 tabular-nums font-medium ${
                              diff == null ? 'text-gray-300' : diff >= 0 ? 'text-emerald-600' : 'text-rose-500'
                            }`}>
                              {diff == null ? '—' : (diff >= 0 ? '+' : '') + fmtK(diff)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="text-center text-xs text-gray-400 py-6 mt-4">
        Ramify Dashboard — Données: Databook saisonnalité.xlsb via OneDrive — Rafraîchissement auto toutes les 5 min
      </footer>
    </div>
  )
}
