const XLSX = require('xlsx')

// ── Column indices (0-based) for annual P&L ────────────────────────────────
// Source: P&L Analytique, row 8 in Excel (index 7): FY21A=D(3), FY22A=Q(16)...
const ANNUAL_COLS = [
  { label: 'FY21A', idx: 3  },
  { label: 'FY22A', idx: 16 },
  { label: 'FY23A', idx: 29 },
  { label: 'FY24A', idx: 42 },
  { label: 'FY25E', idx: 55 },
  { label: 'FY26E', idx: 68 },
]

// ── Row indices (0-based) in P&L Analytique ───────────────────────────────
const PL_METRICS = [
  { key: 'revenue',     row: 9,  label: 'Revenue',      isHeader: true,  isPositiveGood: true  },
  { key: 'grossMargin', row: 15, label: 'Gross Margin',  isHeader: false, isPositiveGood: true  },
  { key: 'staffCosts',  row: 17, label: 'Staff costs',   isHeader: false, isPositiveGood: false },
  { key: 'sga',         row: 29, label: 'SG&A',          isHeader: false, isPositiveGood: false },
  { key: 'ebitda',      row: 43, label: 'EBITDA',        isHeader: true,  isPositiveGood: true  },
  { key: 'netResult',   row: 79, label: 'Net result',    isHeader: true,  isPositiveGood: true  },
  { key: 'aum',         row: 83, label: 'AuM (M\u20ac)', isHeader: false, isPositiveGood: true  },
  { key: 'arr',         row: 84, label: 'ARR (k\u20ac)', isHeader: false, isPositiveGood: true  },
]

function cellVal(sheet, row, col) {
  const ref = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = sheet[ref]
  if (!cell) return null
  if (cell.t === 'n') return cell.v
  if (cell.t === 's') {
    const s = cell.v.toString().trim()
    const neg = s.startsWith('(') && s.endsWith(')')
    const n = parseFloat(s.replace(/[(), ]/g, ''))
    return !isNaN(n) ? (neg ? -n : n) : null
  }
  return null
}

function formatMonth(cell) {
  if (!cell) return null
  // Date serial number (Excel dates)
  if (cell.t === 'n') {
    try {
      const d = XLSX.SSF.parse_date_code(cell.v)
      if (d) {
        const months = ['jan','fev','mar','avr','mai','jun','jul','aou','sep','oct','nov','dec']
        return `${months[d.m - 1]}-${String(d.y).slice(-2)}`
      }
    } catch (_) {}
  }
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v
    const months = ['jan','fev','mar','avr','mai','jun','jul','aou','sep','oct','nov','dec']
    return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`
  }
  if (cell.t === 's') return cell.v.replace('.-', '-').replace('.', '')
  return null
}

module.exports = function parseDatabook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  // ── P&L Analytique ────────────────────────────────────────────────────
  const plSheet = wb.Sheets['P&L Analytique']
  if (!plSheet) throw new Error('Feuille "P&L Analytique" introuvable')

  const years = ANNUAL_COLS.map(c => c.label)

  const pl = PL_METRICS.map(metric => ({
    key:             metric.key,
    label:           metric.label,
    isHeader:        metric.isHeader,
    isPositiveGood:  metric.isPositiveGood,
    values:          ANNUAL_COLS.map(col => cellVal(plSheet, metric.row, col.idx)),
  }))

  // ── Trésorerie mensuelle ───────────────────────────────────────────────
  const tresoSheetName = Object.keys(wb.Sheets).find(n =>
    n.toLowerCase().includes('volution') && n.toLowerCase().includes('tr')
  )
  const tresoSheet = tresoSheetName ? wb.Sheets[tresoSheetName] : null

  const treso = []
  if (tresoSheet) {
    for (let col = 3; col <= 70; col++) {
      const mCell = tresoSheet[XLSX.utils.encode_cell({ r: 6,  c: col })]
      const cCell = tresoSheet[XLSX.utils.encode_cell({ r: 11, c: col })]
      if (!mCell) break
      const month = formatMonth(mCell)
      const cash  = cCell ? cellVal(tresoSheet, 11, col) : null
      if (month) treso.push({ month, cash: typeof cash === 'number' ? cash : null })
    }
  }

  // ── P&L par entite ────────────────────────────────────────────────────
  const entitySheetName = Object.keys(wb.Sheets).find(n =>
    n.toLowerCase().includes('analytique') && n.toLowerCase().includes('entit')
  )
  const entitySheet = entitySheetName ? wb.Sheets[entitySheetName] : null

  // Same structure as P&L Analytique — extract Revenue & EBITDA per entity
  const entities = []
  if (entitySheet) {
    // Row 6 (idx 5) has entity names starting around col 3+
    // Try to detect entity columns by reading row 6
    for (let col = 3; col <= 80; col++) {
      const nameCell = entitySheet[XLSX.utils.encode_cell({ r: 5, c: col })]
      if (!nameCell || !nameCell.v) continue
      const name = String(nameCell.v).trim()
      if (!name || name.match(/^\d{4}$/) || name.match(/^FY/)) continue
      // Check if this looks like an entity name (not a year/label)
      if (name.length > 2 && name.length < 30) {
        const revRow  = 9
        const ebitRow = 43
        const rev  = cellVal(entitySheet, revRow,  col)
        const ebit = cellVal(entitySheet, ebitRow, col)
        if (rev !== null || ebit !== null) {
          entities.push({ name, revenue: rev, ebitda: ebit })
        }
      }
    }
  }

  // ── Derived KPIs ──────────────────────────────────────────────────────
  const fy25idx = 4 // index of FY25E
  const fy24idx = 3 // index of FY24A

  const getVal = (key, idx) => pl.find(m => m.key === key)?.values[idx] ?? null

  const kpis = {
    revenue:     { fy25: getVal('revenue',     fy25idx), fy24: getVal('revenue',     fy24idx) },
    grossMargin: { fy25: getVal('grossMargin', fy25idx), fy24: getVal('grossMargin', fy24idx) },
    ebitda:      { fy25: getVal('ebitda',      fy25idx), fy24: getVal('ebitda',      fy24idx) },
    netResult:   { fy25: getVal('netResult',   fy25idx), fy24: getVal('netResult',   fy24idx) },
    aum:         { fy25: getVal('aum',         fy25idx), fy24: getVal('aum',         fy24idx) },
    arr:         { fy25: getVal('arr',         fy25idx), fy24: getVal('arr',         fy24idx) },
    latestCash:  treso.filter(t => t.cash !== null).pop()?.cash ?? null,
  }

  return { years, pl, treso, entities, kpis, lastUpdated: new Date().toISOString() }
}
