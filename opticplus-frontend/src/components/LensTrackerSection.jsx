import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

export default function LensTrackerSection(props) {
  const [lensDrafts, setLensDrafts] = useState({})
  const canOverrideTracked = Boolean(props.session?.is_admin)
  const records = props.inventoryLensData?.records ?? []
  const stats = props.inventoryLensData?.stats ?? {}

  useEffect(() => {
    const nextDrafts = {}
    for (const record of records) {
      nextDrafts[record.billing_id] = {
        cost_price: record.cost_price ?? '',
        selling_price: record.tracked_selling_price ?? record.selling_price ?? '',
      }
    }
    setLensDrafts((current) => (areLensDraftsEqual(current, nextDrafts) ? current : nextDrafts))
  }, [props.inventoryLensData])

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Lens Tracker</p>
          <h3>Track lens profit, prescriptions, and insurance mix</h3>
          <p className="header-copy">
            Shaped after the legacy lens tracker with tracked vs untracked focus, prescription context, and insurance-aware profit visibility.
          </p>
        </div>
      </div>

      {props.inventoryError ? <div className="message-banner error">{props.inventoryError}</div> : null}
      {props.inventorySuccess ? <div className="message-banner success">{props.inventorySuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Total Lenses" value={String(stats.total_lenses ?? 0)} note="Lens bills in the selected range" icon="glasses" className="total" />
        <StatWidget label="Tracked" value={String(stats.tracked_count ?? 0)} note="Rows with recorded cost prices" icon="check-badge" className="seen" />
        <StatWidget label="Untracked" value={String(stats.untracked_count ?? 0)} note="Rows still waiting for lens cost entry" icon="alert" className="pending" />
        <StatWidget label="Total Profit" value={currency.format(Number(stats.total_profit ?? 0))} note="Profit from tracked lens rows" icon="trend" className="today" />
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tracker Filters</p>
              <h3>Lens sales date range and status</h3>
            </div>
            <span className="panel-tag">{props.inventoryLensData?.branch_name ?? 'Lens Tracker'}</span>
          </div>

          <form
            className="patient-filter-grid"
            onSubmit={(event) => {
              event.preventDefault()
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
              Search
              <input
                value={props.lensTrackerFilters.search}
                onChange={(event) => props.setLensTrackerFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Folder, patient, receipt, customer, phone"
              />
            </label>
            <label>
              Tracking
              <select
                value={props.lensTrackerFilters.tracking}
                onChange={(event) => props.setLensTrackerFilters((current) => ({ ...current, tracking: event.target.value }))}
              >
                <option value="all">All lenses</option>
                <option value="untracked">Untracked only</option>
                <option value="tracked">Tracked only</option>
              </select>
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Refresh tracker</button>
            </div>
          </form>

          <div className="manager-overview-grid">
            <MetricCard label="Insurance Sales" value={stats.insurance_sales} helper={`${stats.insurance_lenses ?? 0} insured rows`} tone="info" />
            <MetricCard label="Cash Sales" value={stats.cash_sales} helper={`${stats.cash_lenses ?? 0} cash rows`} tone="success" />
            <MetricCard label="Total Cost" value={stats.total_cost} helper="Captured from tracked rows" tone="warning" />
            <MetricCard label="Average Margin" value={`${Number(stats.average_margin ?? 0).toFixed(2)}%`} helper="Average tracked margin" tone="danger" raw />
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Lens Profit Table</p>
              <h3>Prescription-aware lens tracking</h3>
            </div>
            <span className="panel-tag">{records.length} rows</span>
          </div>

          <div className="table-shell">
            <table className="portal-table inventory-table-wide">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Folder</th>
                  <th>Receipt</th>
                  <th>Insurance</th>
                  <th>Lens Spec</th>
                  <th>Selling</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>Margin</th>
                  <th>Tracker</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const draft = lensDrafts[record.billing_id] ?? { cost_price: '', selling_price: record.selling_price ?? '' }
                  const isLocked = record.tracked && !canOverrideTracked
                  const cost = Number(draft.cost_price || 0)
                  const selling = Number(draft.selling_price || record.selling_price || 0)
                  const profit = selling - cost
                  const margin = selling > 0 ? (profit / selling) * 100 : 0

                  return (
                    <tr key={record.billing_id}>
                      <td>
                        <strong>{record.patient_display_name || record.patient_name || record.customer_name || 'N/A'}</strong>
                        <div className="table-inline-meta">{record.billing_date}</div>
                      </td>
                      <td>{record.folder_id}</td>
                      <td>{record.receipt_number || 'Pending'}</td>
                      <td>
                        <strong>{record.health_insurance || 'NONE'}</strong>
                        <div className="table-inline-meta">{record.insurance_status || 'Cash sale'}</div>
                      </td>
                      <td>
                        <strong>{record.lens_type || 'Lens pending'}</strong>
                        <div className="table-inline-meta">{formatPrescription(record)}</div>
                      </td>
                      <td>
                        <input
                          className="inventory-inline-input"
                          type="number"
                          step="0.01"
                          value={draft.selling_price}
                          disabled={isLocked}
                          onChange={(event) =>
                            setLensDrafts((current) => ({
                              ...current,
                              [record.billing_id]: {
                                ...current[record.billing_id],
                                cost_price: current[record.billing_id]?.cost_price ?? record.cost_price ?? '',
                                selling_price: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="inventory-inline-input"
                          type="number"
                          step="0.01"
                          value={draft.cost_price}
                          disabled={isLocked}
                          onChange={(event) =>
                            setLensDrafts((current) => ({
                              ...current,
                              [record.billing_id]: {
                                ...current[record.billing_id],
                                selling_price: current[record.billing_id]?.selling_price ?? record.selling_price ?? '',
                                cost_price: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>{draft.cost_price === '' ? (record.profit != null ? currency.format(Number(record.profit)) : 'Pending') : currency.format(profit)}</td>
                      <td>{draft.cost_price === '' ? (record.margin_percentage != null ? `${Number(record.margin_percentage).toFixed(2)}%` : 'Pending') : `${margin.toFixed(2)}%`}</td>
                      <td>
                        {isLocked ? (
                          <div className="table-inline-meta">
                            Locked
                            <br />
                            {record.entered_by_name || 'Manager only'}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mini-action"
                            disabled={props.savingLensBillingId === record.billing_id || draft.cost_price === ''}
                            onClick={() =>
                              props.saveLensCostEntry(record.billing_id, {
                                selling_price: draft.selling_price || record.selling_price,
                                cost_price: draft.cost_price,
                              })
                            }
                          >
                            {props.savingLensBillingId === record.billing_id ? 'Saving...' : record.tracked ? 'Update' : 'Save'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Prescription Notes</p>
            <h3>Lens and patient context</h3>
          </div>
        </div>
        <div className="stack-list">
          {records.slice(0, 8).map((record) => (
            <div key={`note-${record.billing_id}`} className="stack-item">
              <div>
                <strong>{record.patient_display_name || record.patient_name || record.folder_id}</strong>
                <span>{record.folder_id} • {record.lens_material || 'Material pending'}</span>
              </div>
              <div className="stack-meta">
                <strong>{record.prescription_status || 'Prescription pending'}</strong>
                <span>{record.prescription_notes || `${record.color || 'No tint'} • IPD ${record.ipd || 'N/A'}`}</span>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}

function areLensDraftsEqual(current, next) {
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)

  if (currentKeys.length !== nextKeys.length) return false

  return nextKeys.every((key) => (
    current[key]?.cost_price === next[key]?.cost_price &&
    current[key]?.selling_price === next[key]?.selling_price
  ))
}

function MetricCard({ label, value, helper, tone = 'info', raw = false }) {
  return (
    <div className={`manager-metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{raw ? value : currency.format(Number(value ?? 0))}</strong>
      <p className="muted-copy">{helper}</p>
    </div>
  )
}

function formatPrescription(record) {
  const parts = [
    record.lens_material,
    record.color,
    record.sph_od != null || record.sph_os != null ? `SPH ${record.sph_od ?? '-'} / ${record.sph_os ?? '-'}` : '',
  ].filter(Boolean)

  return parts.join(' • ') || 'Prescription details unavailable'
}
