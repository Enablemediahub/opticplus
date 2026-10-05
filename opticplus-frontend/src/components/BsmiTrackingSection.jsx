import { useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const recordsPerPageOptions = [25, 50, 100, 200]

export default function BsmiTrackingSection(props) {
  const [searchType, setSearchType] = useState('all')
  const [frameFilter, setFrameFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [recordsPerPage, setRecordsPerPage] = useState(50)

  const allRecords = props.bsmiData?.records ?? []
  const stats = props.bsmiData?.stats ?? {}
  const breakdowns = props.bsmiData?.breakdowns ?? {}
  const searchTerm = props.lensTrackerFilters.search?.trim().toLowerCase() ?? ''

  const filteredRecords = useMemo(() => {
    return allRecords.filter((record) => {
      const patientName = String(record.patient_display_name || record.patient_name || record.customer_name || '').toLowerCase()
      const folderId = String(record.folder_id || '').toLowerCase()
      const frameCode = String(record.frame_code_id || '').toLowerCase()
      const cashier = String(record.entered_by_name || '').toLowerCase()
      const receipt = String(record.receipt_number || '').toLowerCase()

      const searchMatches = (() => {
        if (!searchTerm) return true
        if (searchType === 'folder_id') return folderId.includes(searchTerm)
        if (searchType === 'frame_code') return frameCode.includes(searchTerm)
        if (searchType === 'name') return patientName.includes(searchTerm) || cashier.includes(searchTerm)
        return [patientName, folderId, frameCode, cashier, receipt].some((value) => value.includes(searchTerm))
      })()

      const frameMatches = frameFilter === 'all'
        ? true
        : String(record.frame_code_id || 'Unassigned') === frameFilter

      return searchMatches && frameMatches
    })
  }, [allRecords, frameFilter, searchTerm, searchType])

  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * recordsPerPage
    return filteredRecords.slice(start, start + recordsPerPage)
  }, [filteredRecords, page, recordsPerPage])

  const totalPages = Math.max(Math.ceil(filteredRecords.length / recordsPerPage), 1)
  const frameOptions = useMemo(() => {
    return Array.from(new Set(allRecords.map((record) => String(record.frame_code_id || 'Unassigned')))).sort()
  }, [allRecords])

  const topFrames = (breakdowns.frames ?? []).slice(0, 5)
  const topStaff = (breakdowns.entered_by ?? []).slice(0, 5)
  const branchBreakdown = breakdowns.branches ?? []
  const paymentDistribution = breakdowns.payment_distribution ?? []
  const averageSurplus = filteredRecords.length
    ? filteredRecords.reduce((sum, record) => sum + Number(record.profit ?? 0), 0) / filteredRecords.length
    : 0
  const topFrame = topFrames[0]
  const cashToSalesRatio = Number(stats.total_sales ?? 0) > 0
    ? (Number(stats.immediate_cash ?? 0) / Number(stats.total_sales ?? 0)) * 100
    : 0
  const averageCashPerSale = filteredRecords.length
    ? Number(stats.immediate_cash ?? 0) / filteredRecords.length
    : 0

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">BSMI Tracking</p>
          <h3>Accountant view over frame surplus allocation for cash and mobile money purchases</h3>
          <p className="header-copy">
            Built from the live `bsmi_transactions` table so the tracker reflects frame surplus above each category base price and the four pool allocations for cash-backed sales only.
          </p>
        </div>
      </div>

      {props.inventoryError ? <div className="message-banner error">{props.inventoryError}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Staff Incentive Pool" value={currency.format(Number(stats.staff_share_total ?? 0))} note="40% apportioned from BSMI surplus" icon="trend" className="total" />
        <StatWidget label="Reinvestment Pool" value={currency.format(Number(stats.reinvestment_total ?? 0))} note="30% apportioned from BSMI surplus" icon="money" className="seen" />
        <StatWidget label="Tax & Statutory Pool" value={currency.format(Number(stats.tax_share_total ?? 0))} note="15% apportioned from BSMI surplus" icon="shield" className="pending" />
        <StatWidget label="Operational Pool" value={currency.format(Number(stats.operational_total ?? 0))} note="15% apportioned from BSMI surplus" icon="finance" className="today" />
      </section>

      <section className="finance-layout sales-legacy-layout">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tracker Filters</p>
              <h3>Period, search mode, and frame filters</h3>
            </div>
            <span className="panel-tag">{props.bsmiData?.branch_name ?? 'BSMI Tracking'}</span>
          </div>

          <form
            className="patient-filter-grid"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(1)
              props.setLensTrackerQuery(props.lensTrackerFilters)
            }}
          >
            <label>
              Date from
              <input
                type="date"
                value={props.lensTrackerFilters.date_from}
                onChange={(event) => props.setLensTrackerFilters((current) => ({ ...current, date_from: event.target.value }))}
              />
            </label>
            <label>
              Date to
              <input
                type="date"
                value={props.lensTrackerFilters.date_to}
                onChange={(event) => props.setLensTrackerFilters((current) => ({ ...current, date_to: event.target.value }))}
              />
            </label>
            <label>
              Search type
              <select value={searchType} onChange={(event) => setSearchType(event.target.value)}>
                <option value="all">All fields</option>
                <option value="folder_id">Folder ID</option>
                <option value="frame_code">Frame code</option>
                <option value="name">Patient / staff</option>
              </select>
            </label>
            <label>
              Search
              <input
                value={props.lensTrackerFilters.search}
                onChange={(event) => props.setLensTrackerFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Folder, frame, patient, receipt..."
              />
            </label>
            <label>
              Frame code
              <select value={frameFilter} onChange={(event) => setFrameFilter(event.target.value)}>
                <option value="all">All frames</option>
                {frameOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Records per page
              <select
                value={recordsPerPage}
                onChange={(event) => {
                  setRecordsPerPage(Number(event.target.value))
                  setPage(1)
                }}
              >
                {recordsPerPageOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Refresh BSMI tracker</button>
            </div>
          </form>

          <div className="payment-summary-row">
            <Metric label="Staff Incentive Pool" percentage="40%" value={stats.staff_share_total} />
            <Metric label="Reinvestment Pool" percentage="30%" value={stats.reinvestment_total} />
            <Metric label="Tax & Statutory Pool" percentage="15%" value={stats.tax_share_total} />
            <Metric label="Operational Pool" percentage="15%" value={stats.operational_total} />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Cash Flow</p>
              <h3>Cash and MoMo collections</h3>
            </div>
            <span className="panel-tag">Insurance excluded</span>
          </div>

          <div className="stack-list">
            <SummaryRow label="Cash & MoMo Collections" value={stats.immediate_cash} helper="Collections tied to cash and mobile money BSMI sales" />
            <SummaryRow label="Cash to Sales Ratio" value={`${cashToSalesRatio.toFixed(1)}%`} helper="Share of tracked selling value already represented as cash-backed collections" raw />
            <SummaryRow label="Average Cash per Sale" value={averageCashPerSale} helper="Average cash-backed selling value across the current BSMI rows" />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Performance Metrics</p>
              <h3>Surplus and frame signals</h3>
            </div>
            <span className="panel-tag">Accountant summary</span>
          </div>

          <div className="stack-list">
            <SummaryRow label="Average Surplus per Sale" value={averageSurplus} helper="Average BSMI surplus across filtered rows" />
            <SummaryRow label="Top Performing Frame" value={topFrame ? `${topFrame.name} (${currency.format(Number(topFrame.total_surplus ?? 0))})` : 'No frame data'} helper="Highest total BSMI surplus among current frame records" raw />
            <SummaryRow label="Tracked Entries" value={String(Number(stats.tracked_count ?? 0))} helper="Rows already captured in the BSMI transaction ledger" raw />
            <SummaryRow label="Untracked Entries" value={String(Number(stats.untracked_count ?? 0))} helper="BSMI rows missing from the ledger" raw />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Payment Distribution</p>
              <h3>Cash-backed settlement mix</h3>
            </div>
            <span className="panel-tag">{paymentDistribution.length} streams</span>
          </div>

          <BarList items={paymentDistribution} total={paymentDistribution.reduce((sum, item) => sum + Number(item.value ?? 0), 0)} />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Entered By</p>
              <h3>Top BSMI surplus contributors</h3>
            </div>
            <span className="panel-tag">{topStaff.length} entries</span>
          </div>

          <div className="stack-list">
            {topStaff.length ? topStaff.map((item) => (
              <div key={item.label} className="stack-item">
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.transactions} BSMI entries</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(item.total_surplus ?? 0))}</strong>
                  <span>Staff share {currency.format(Number(item.staff_share ?? 0))}</span>
                </div>
              </div>
            )) : <p className="muted-copy">No BSMI staff allocation data yet.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Frame Performance</p>
              <h3>Best-performing frame codes</h3>
            </div>
            <span className="panel-tag">{topFrames.length} frames</span>
          </div>

          <div className="stack-list">
            {topFrames.length ? topFrames.map((item) => (
              <div key={item.frame_code} className="stack-item">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.frame_code} | {item.sales} sales</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(item.total_surplus ?? 0))}</strong>
                  <span>Avg {currency.format(Number(item.avg_surplus ?? 0))}</span>
                </div>
              </div>
            )) : <p className="muted-copy">No frame performance data yet.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Branch Breakdown</p>
              <h3>Cash and MoMo by branch</h3>
            </div>
            <span className="panel-tag">{branchBreakdown.length} branches</span>
          </div>

          <div className="stack-list">
            {branchBreakdown.length ? branchBreakdown.map((item) => (
              <div key={item.label} className="stack-item">
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.transactions} transactions</span>
                </div>
                <div className="stack-meta">
                  <strong>{currency.format(Number(item.total_surplus ?? 0))}</strong>
                  <span>{currency.format(Number(item.cash_received ?? 0))} cash now</span>
                </div>
              </div>
            )) : <p className="muted-copy">Branch breakdown appears when merged or multi-branch data is available.</p>}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">BSMI Transactions</p>
              <h3>Frame surplus allocations for cash-backed transactions</h3>
            </div>
            <span className="panel-tag">{filteredRecords.length} matched records</span>
          </div>

          <div className="table-shell">
            <table className="portal-table sales-ledger-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Folder</th>
                  <th>Frame</th>
                  <th>Branch</th>
                  <th>Payment</th>
                  <th>Selling</th>
                  <th>Base Price</th>
                  <th>Surplus</th>
                  <th>Allocations</th>
                  <th>Settlement</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((record) => (
                  <tr key={record.id ?? record.billing_id}>
                    <td>
                      <strong>{record.patient_display_name || record.patient_name || record.customer_name || 'N/A'}</strong>
                      <div className="table-inline-meta">{record.transaction_date || record.billing_date}</div>
                    </td>
                    <td>{record.folder_id || 'N/A'}</td>
                    <td>
                      <strong>{record.product_name || record.frame_code_id || 'Unassigned'}</strong>
                      <div className="table-inline-meta">{record.product_category || 'No category'}{record.product_grade ? ` | ${record.product_grade}` : ''}</div>
                    </td>
                    <td>{record.branch_name || props.bsmiData?.branch_name || 'Branch'}</td>
                    <td>{record.payment_category}</td>
                    <td>{currency.format(Number(record.selling_price ?? 0))}</td>
                    <td>{record.cost_price == null ? 'N/A' : currency.format(Number(record.cost_price ?? 0))}</td>
                    <td>{record.profit == null ? 'N/A' : currency.format(Number(record.profit ?? 0))}</td>
                    <td>
                      {record.profit == null ? 'No allocation' : (
                        <div className="table-inline-meta">
                          Staff {currency.format(Number(record.staff_share ?? 0))}
                          <br />
                          Reinvest {currency.format(Number(record.reinvestment_share ?? 0))}
                          <br />
                          Tax {currency.format(Number(record.tax_share ?? 0))}
                          <br />
                          Ops {currency.format(Number(record.operational_share ?? 0))}
                        </div>
                      )}
                    </td>
                    <td>
                      <strong>{record.payment_category || 'Cash'}</strong>
                      <div className="table-inline-meta">
                        Collected {currency.format(Number(record.immediate_cash ?? 0))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar">
            <span className="muted-copy">
              Showing {filteredRecords.length ? (page - 1) * recordsPerPage + 1 : 0} to {Math.min(page * recordsPerPage, filteredRecords.length)} of {filteredRecords.length} records
            </span>
            <div className="pagination-actions">
              <button type="button" className="mini-action" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>Previous</button>
              <button type="button" className="mini-action" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))}>Next</button>
            </div>
          </div>
        </article>
      </section>
    </section>
  )
}

function Metric({ label, percentage, value, raw = false }) {
  return (
    <div className="inline-metric-card">
      <span>{label}:</span>
      <strong>{raw ? value : currency.format(Number(value ?? 0))}</strong>
      {percentage ? <small className="muted-copy">{percentage} apportioned</small> : null}
    </div>
  )
}

function SummaryRow({ label, value, helper, raw = false }) {
  return (
    <div className="stack-item">
      <div>
        <strong>{label}</strong>
        <span>{helper}</span>
      </div>
      <div className="stack-meta">
        <strong>{raw ? value : currency.format(Number(value ?? 0))}</strong>
      </div>
    </div>
  )
}

function BarList({ items, total }) {
  if (!items.length) {
    return <p className="muted-copy">No payment-distribution data yet.</p>
  }

  return (
    <div className="stack-list">
      {items.map((item) => {
        const percent = total > 0 ? Math.max((Number(item.value ?? 0) / total) * 100, 2) : 0
        return (
          <div key={item.label} className="stack-item">
            <div style={{ width: '100%' }}>
              <div className="panel-top">
                <strong>{item.label}</strong>
                <span className="chart-value">{currency.format(Number(item.value ?? 0))}</span>
              </div>
              <div className="chart-track">
                <div className="chart-bar tone-info" style={{ width: `${Math.min(percent, 100)}%` }} />
              </div>
              <span className="muted-copy">{percent.toFixed(1)}% of current BSMI cashflow view</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
