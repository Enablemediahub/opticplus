import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const inventoryTabs = ['Stock Overview', 'Lens Tracker & Lens Spec']

export default function InventorySection(props) {
  const [activeTab, setActiveTab] = useState(props.initialTab ?? 'Stock Overview')
  const [lensDrafts, setLensDrafts] = useState({})
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  useEffect(() => {
    if (!props.initialTab) return
    setActiveTab(props.initialTab)
  }, [props.initialTab])

  useEffect(() => {
    const nextDrafts = {}
    for (const record of props.inventoryLensData?.records ?? []) {
      nextDrafts[record.billing_id] = {
        cost_price: record.cost_price ?? '',
        selling_price: record.selling_price ?? '',
      }
    }
    setLensDrafts((current) => (areLensDraftsEqual(current, nextDrafts) ? current : nextDrafts))
  }, [props.inventoryLensData])

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Inventory</p>
          <h3>Track stock, lens sales, and prescription-linked profitability</h3>
          <p className="header-copy">Built around live frame inventory, the legacy lens tracker workflow, and Lens Spec visibility in one products area.</p>
        </div>
      </div>

      {props.inventoryError ? <div className="message-banner error">{props.inventoryError}</div> : null}
      {props.inventorySuccess ? <div className="message-banner success">{props.inventorySuccess}</div> : null}

      {props.showTabs !== false ? (
        <div className="finance-tabs">
          {inventoryTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={tab === activeTab ? 'nav-item finance-tab active' : 'nav-item finance-tab'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      ) : null}

      {activeTab === 'Stock Overview' ? (
        <StockOverviewTab
          {...props}
          isEditModalOpen={isEditModalOpen}
          setIsEditModalOpen={setIsEditModalOpen}
        />
      ) : (
        <LensTrackerTab
          {...props}
          lensDrafts={lensDrafts}
          setLensDrafts={setLensDrafts}
        />
      )}
    </section>
  )
}

function StockOverviewTab(props) {
  const canManageInventory = Boolean(props.session?.is_admin || ['manager', 'accountant', 'ceo'].includes(props.session?.role))
  const movementTrackingEnabled = Boolean(props.inventoryData?.movement_tracking_enabled)
  const inventoryRecords = props.inventoryData?.records ?? []
  const movementFeed = props.inventoryData?.movement_feed ?? []
  const frameSalesBreakdown = props.inventoryData?.frame_sales_breakdown ?? []
  const hasSalesRange = Boolean(props.inventoryFilters.date_from || props.inventoryFilters.date_to)
  const salesRangeLabel = hasSalesRange ? 'the selected date range' : 'all recorded time'

  function startEdit(record) {
    props.setInventoryForm({
      id: record.id,
      code: record.code ?? '',
      name: record.name ?? '',
      category: record.category ?? 'Frames',
      grade: record.grade ?? '',
      stock: String(record.stock ?? ''),
      min_price: String(record.min_price ?? ''),
      max_price: String(record.max_price ?? ''),
    })
    props.setIsEditModalOpen(true)
  }

  function resetForm() {
    props.setInventoryForm({
      id: null,
      code: '',
      name: '',
      category: 'Frames',
      grade: '',
      stock: '',
      min_price: '',
      max_price: '',
    })
  }

  function closeEditModal() {
    props.setIsEditModalOpen(false)
    resetForm()
  }

  async function handleDelete(record) {
    const confirmed = window.confirm(`Delete ${record.name}? This cannot be undone.`)
    if (!confirmed) return

    try {
      await props.deleteInventoryProduct(record.id)
    } catch {}
  }

  function openInventoryReport(mode = 'print') {
    if (!inventoryRecords.length) return

    const reportWindow = window.open('', '_blank', 'width=1280,height=900')
    if (!reportWindow) return

    const html = createInventoryReportHtml({
      branchName: props.inventoryData?.branch_name ?? 'Inventory',
      filters: props.inventoryFilters,
      stats: props.inventoryData?.stats ?? {},
      records: inventoryRecords,
      movementFeed,
      movementTrackingEnabled,
      generatedBy: props.session?.name || props.session?.username || 'Portal user',
    })

    reportWindow.document.open()
    reportWindow.document.write(html)
    reportWindow.document.close()
    reportWindow.document.title = `Inventory Audit Report - ${props.inventoryData?.branch_name ?? 'Branch'}`
    reportWindow.focus()

    setTimeout(() => {
      reportWindow.print()
    }, 300)
  }

  function setAsOfNow() {
    const now = new Date()
    const pad = (value) => String(value).padStart(2, '0')
    const localValue = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
    props.setInventoryFilters((current) => ({ ...current, as_of_at: localValue }))
  }

  return (
    <section className="finance-layout">
      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Product Lines" value={props.inventoryData?.stats.product_lines ?? '...'} note="Items registered for the active branch" icon="layers" className="total" />
        <StatWidget label="Units In Stock" value={props.inventoryData?.stats.stock_units ?? '...'} note="Total stock units across product lines" icon="inventory" className="seen" />
        <StatWidget label="Low Stock" value={props.inventoryData?.stats.low_stock ?? '...'} note="Lines with ten units or fewer left" icon="alert" className="pending" />
        <StatWidget label="Inventory Floor Value" value={currency.format(Number(props.inventoryData?.stats.inventory_floor_value ?? 0))} note="Based on minimum selling price and stock on hand" icon="money" className="today" />
      </section>

      {canManageInventory ? (
        <article className="panel patient-form-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Add Inventory</p>
              <h3>Add a new inventory item</h3>
            </div>
            <span className="panel-tag">Inventory control access</span>
          </div>

          <form
            className="patient-form-grid"
            onSubmit={async (event) => {
              event.preventDefault()
              try {
                await props.saveInventoryProduct(props.inventoryForm)
                resetForm()
              } catch {}
            }}
          >
            <label>
              Product code
              <input
                value={props.inventoryForm.code}
                onChange={(event) => props.setInventoryForm((current) => ({ ...current, code: event.target.value }))}
                placeholder="BOC-F0001-A"
                required
              />
            </label>
            <label>
              Product name
              <input
                value={props.inventoryForm.name}
                onChange={(event) => props.setInventoryForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Classic acetate frame"
                required
              />
            </label>
            <label>
              Category
              <select
                value={props.inventoryForm.category}
                onChange={(event) => props.setInventoryForm((current) => ({ ...current, category: event.target.value }))}
              >
                <option value="Frames">Frames</option>
                <option value="Lens">Lens</option>
                <option value="Accessories">Accessories</option>
                {(props.inventoryData?.categories ?? [])
                  .filter((category) => !['Frames', 'Lens', 'Accessories'].includes(category))
                  .map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
              </select>
            </label>
            <label>
              Grade
              <input
                value={props.inventoryForm.grade}
                onChange={(event) => props.setInventoryForm((current) => ({ ...current, grade: event.target.value }))}
                placeholder="Premium / A / Economy"
              />
            </label>
            <label>
              Stock units
              <input
                type="number"
                min="0"
                value={props.inventoryForm.stock}
                onChange={(event) => props.setInventoryForm((current) => ({ ...current, stock: event.target.value }))}
                required
              />
            </label>
            <label>
              Min price
              <input
                type="number"
                min="0"
                step="0.01"
                value={props.inventoryForm.min_price}
                onChange={(event) => props.setInventoryForm((current) => ({ ...current, min_price: event.target.value }))}
                required
              />
            </label>
            <label>
              Max price
              <input
                type="number"
                min="0"
                step="0.01"
                value={props.inventoryForm.max_price}
                onChange={(event) => props.setInventoryForm((current) => ({ ...current, max_price: event.target.value }))}
                required
              />
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button" disabled={props.isSavingInventoryProduct}>
                {props.isSavingInventoryProduct ? 'Saving...' : 'Add Inventory Item'}
              </button>
              <button type="button" className="ghost-button" onClick={resetForm}>
                Clear form
              </button>
            </div>
          </form>
        </article>
      ) : null}

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stock Filter</p>
            <h3>Search branch inventory</h3>
          </div>
          <span className="panel-tag">{props.inventoryData?.branch_name ?? 'Inventory'}</span>
        </div>

        <form
          className="patient-filter-grid"
          onSubmit={(event) => {
            event.preventDefault()
            props.setInventoryQuery((current) => ({ ...current, ...props.inventoryFilters, page: 1 }))
          }}
        >
          <label>
            Search
            <input
              value={props.inventoryFilters.search}
              onChange={(event) => props.setInventoryFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Code, name, grade"
            />
          </label>
          <label>
            Category
            <select
              value={props.inventoryFilters.category}
              onChange={(event) => props.setInventoryFilters((current) => ({ ...current, category: event.target.value }))}
            >
              <option value="all">All categories</option>
              {(props.inventoryData?.categories ?? []).map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Date from
            <input
              type="date"
              value={props.inventoryFilters.date_from}
              onChange={(event) => props.setInventoryFilters((current) => ({ ...current, date_from: event.target.value }))}
            />
          </label>
          <label>
            Date to
            <input
              type="date"
              value={props.inventoryFilters.date_to}
              onChange={(event) => props.setInventoryFilters((current) => ({ ...current, date_to: event.target.value }))}
            />
          </label>
          <label className="full-span">
            Stock as of
            <input
              type="datetime-local"
              value={props.inventoryFilters.as_of_at}
              onChange={(event) => props.setInventoryFilters((current) => ({ ...current, as_of_at: event.target.value }))}
            />
          </label>
          <p className="muted-copy full-span">
            Use <strong>Date from</strong> and <strong>Date to</strong> to measure sold frames and stock movement across a period.
            Use <strong>Stock as of</strong> to see what your stock looked like at one exact date and time.
          </p>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button">Apply filters</button>
            <button type="button" className="ghost-button" onClick={setAsOfNow}>
              Use current time
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => props.setInventoryFilters((current) => ({ ...current, as_of_at: '' }))}
            >
              Clear snapshot
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const defaults = { search: '', category: 'all', date_from: '', date_to: '', as_of_at: '', page: 1, per_page: 15 }
                props.setInventoryFilters(defaults)
                props.setInventoryQuery(defaults)
              }}
            >
              Reset
            </button>
          </div>
        </form>

        <div className="report-export-box">
          <strong>Auditor report</strong>
          <p>Generate a printable inventory report from the current branch, date range, search, and stock snapshot filters.</p>
          <div className="filter-actions-row">
            <button
              type="button"
              className="primary-button"
              disabled={!inventoryRecords.length}
              onClick={() => openInventoryReport('pdf')}
            >
              Export PDF
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!inventoryRecords.length}
              onClick={() => openInventoryReport('print')}
            >
              Print report
            </button>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stock Table</p>
            <h3>{props.inventoryFilters.as_of_at ? 'Products with snapshot balances' : 'Products and price bands'}</h3>
          </div>
          <span className="panel-tag">{props.inventoryData?.pagination?.total ?? 0} records</span>
        </div>

        {props.isLoadingInventory && !props.inventoryData ? <p className="muted-copy">Loading inventory...</p> : null}

        <div className="manager-overview-grid">
          <MetricCard
            label={props.inventoryFilters.as_of_at ? 'Units At Snapshot' : 'Live Units'}
            value={props.inventoryData?.stats.stock_units}
            helper={props.inventoryFilters.as_of_at ? `Balance as at ${formatDateTime(props.inventoryFilters.as_of_at)}` : 'Current stock on hand'}
            tone="info"
            raw
          />
          <MetricCard
            label="Frames Sold"
            value={String(props.inventoryData?.stats.frames_sold_in_range ?? 0)}
            helper={`Frames sold in ${salesRangeLabel}`}
            tone="success"
            raw
          />
          <MetricCard
            label="Frame Sales Value"
            value={props.inventoryData?.stats.frame_sales_value_in_range ?? 0}
            helper={`Frame sales value in ${salesRangeLabel}`}
            tone="today"
          />
          <MetricCard
            label="Sold Product Lines"
            value={String(props.inventoryData?.stats.frame_lines_sold_in_range ?? 0)}
            helper={`Distinct frame lines sold in ${salesRangeLabel}`}
            tone="warning"
            raw
          />
          <MetricCard
            label="Net Change In Range"
            value={movementTrackingEnabled ? formatSignedNumber(props.inventoryData?.stats.range_net_change ?? 0) : '--'}
            helper={movementTrackingEnabled ? `${props.inventoryData?.stats.range_movement_count ?? 0} stock movements in the selected period` : 'Enable inventory movements to audit stock changes by period'}
            tone="warning"
            raw
          />
          <MetricCard
            label="Low Stock Lines"
            value={String(props.inventoryData?.stats.low_stock ?? 0)}
            helper="Products with ten units or fewer"
            tone="danger"
            raw
          />
          <MetricCard
            label="Out Of Stock"
            value={String(props.inventoryData?.stats.out_of_stock ?? 0)}
            helper="Lines currently at zero or below snapshot balance"
            tone="success"
            raw
          />
        </div>

        <div className="table-shell">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Grade</th>
                <th>Live Stock</th>
                <th>Stock At Snapshot</th>
                <th>Frames Sold</th>
                <th>Range Change</th>
                <th>Last Movement</th>
                <th>Min Price</th>
                <th>Max Price</th>
                {canManageInventory ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {(props.inventoryData?.records ?? []).map((record) => (
                <tr key={record.id}>
                  <td>{record.code}</td>
                  <td>{record.name}</td>
                  <td>{record.category}</td>
                  <td>{record.grade || 'N/A'}</td>
                  <td>{record.current_stock ?? record.stock}</td>
                  <td>{record.stock_at_snapshot ?? record.stock}</td>
                  <td>{record.sold_in_range ?? 0}</td>
                  <td>{formatSignedNumber(record.net_change ?? 0)}</td>
                  <td>{record.last_movement_at ? formatDateTime(record.last_movement_at) : 'No movement log'}</td>
                  <td>{currency.format(Number(record.min_price ?? 0))}</td>
                  <td>{currency.format(Number(record.max_price ?? 0))}</td>
                  {canManageInventory ? (
                    <td>
                      <div className="filter-actions-row">
                        <button type="button" className="mini-action" onClick={() => startEdit(record)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="mini-action danger"
                          disabled={props.isSavingInventoryProduct}
                          onClick={() => handleDelete(record)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          pagination={props.inventoryData?.pagination}
          onPageChange={(page) => props.setInventoryQuery((current) => ({ ...current, page }))}
        />
      </article>

      {movementTrackingEnabled ? (
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Movement Timeline</p>
              <h3>Inventory stock movements for the selected range</h3>
            </div>
            <span className="panel-tag">{props.inventoryData?.movement_feed?.length ?? 0} recent entries</span>
          </div>

          {(props.inventoryData?.movement_feed ?? []).length ? (
            <div className="table-shell">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Reference</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(props.inventoryData?.movement_feed ?? []).map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.movement_at)}</td>
                      <td>
                        <strong>{entry.product_name}</strong>
                        <div className="table-inline-meta">{entry.product_code} · {entry.product_category}</div>
                      </td>
                      <td>{formatMovementType(entry.movement_type)}</td>
                      <td>{formatSignedNumber(entry.quantity_change)}</td>
                      <td>{entry.stock_before ?? 'N/A'}</td>
                      <td>{entry.stock_after ?? 'N/A'}</td>
                      <td>{entry.reference_table ? `${entry.reference_table} #${entry.reference_id ?? ''}` : 'Manual'}</td>
                      <td>{entry.notes || 'No note'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-copy">No stock movements were found for the selected filters yet.</p>
          )}
        </article>
      ) : (
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Movement Timeline</p>
              <h3>Inventory movement tracking is not available yet</h3>
            </div>
          </div>
          <p className="muted-copy">
            Run your `inventory_movements` SQL first, then reopen this page to start viewing stock history and snapshot balances.
          </p>
        </article>
      )}

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Frame Sales</p>
            <h3>How many frames sold in {salesRangeLabel}</h3>
          </div>
          <span className="panel-tag">{frameSalesBreakdown.length} product lines</span>
        </div>

        {frameSalesBreakdown.length ? (
          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Grade</th>
                  <th>Sold</th>
                  <th>Sales Value</th>
                  <th>Last Sold</th>
                </tr>
              </thead>
              <tbody>
                {frameSalesBreakdown.map((record) => (
                  <tr key={`frame-sales-${record.product_id}`}>
                    <td>{record.product_code}</td>
                    <td>{record.product_name}</td>
                    <td>{record.product_category}</td>
                    <td>{record.product_grade || 'N/A'}</td>
                    <td>{record.sold_count}</td>
                    <td>{currency.format(Number(record.sold_value ?? 0))}</td>
                    <td>{record.last_sold_at ? formatDateTime(record.last_sold_at) : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-copy">
            No frame sales were found for this branch in {salesRangeLabel}. Set a date range if you want to inspect a specific period.
          </p>
        )}
      </article>

      {props.isEditModalOpen ? (
        <div className="modal-overlay" onClick={closeEditModal}>
          <article className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Edit Inventory</p>
                <h3>Update a product line</h3>
              </div>
              <button type="button" className="ghost-button" onClick={closeEditModal}>
                Close
              </button>
            </div>

            <form
              className="patient-form-grid"
              onSubmit={async (event) => {
                event.preventDefault()
                try {
                  await props.saveInventoryProduct(props.inventoryForm)
                  closeEditModal()
                } catch {}
              }}
            >
              <label>
                Product code
                <input
                  value={props.inventoryForm.code}
                  onChange={(event) => props.setInventoryForm((current) => ({ ...current, code: event.target.value }))}
                  placeholder="BOC-F0001-A"
                  required
                />
              </label>
              <label>
                Product name
                <input
                  value={props.inventoryForm.name}
                  onChange={(event) => props.setInventoryForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Classic acetate frame"
                  required
                />
              </label>
              <label>
                Category
                <select
                  value={props.inventoryForm.category}
                  onChange={(event) => props.setInventoryForm((current) => ({ ...current, category: event.target.value }))}
                >
                  <option value="Frames">Frames</option>
                  <option value="Lens">Lens</option>
                  <option value="Accessories">Accessories</option>
                  {(props.inventoryData?.categories ?? [])
                    .filter((category) => !['Frames', 'Lens', 'Accessories'].includes(category))
                    .map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                </select>
              </label>
              <label>
                Grade
                <input
                  value={props.inventoryForm.grade}
                  onChange={(event) => props.setInventoryForm((current) => ({ ...current, grade: event.target.value }))}
                  placeholder="Premium / A / Economy"
                />
              </label>
              <label>
                Stock units
                <input
                  type="number"
                  min="0"
                  value={props.inventoryForm.stock}
                  onChange={(event) => props.setInventoryForm((current) => ({ ...current, stock: event.target.value }))}
                  required
                />
              </label>
              <label>
                Min price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={props.inventoryForm.min_price}
                  onChange={(event) => props.setInventoryForm((current) => ({ ...current, min_price: event.target.value }))}
                  required
                />
              </label>
              <label>
                Max price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={props.inventoryForm.max_price}
                  onChange={(event) => props.setInventoryForm((current) => ({ ...current, max_price: event.target.value }))}
                  required
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={closeEditModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={props.isSavingInventoryProduct}>
                  {props.isSavingInventoryProduct ? 'Saving...' : 'Update Inventory Item'}
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
    </section>
  )
}

function LensTrackerTab(props) {
  const canOverrideTracked = Boolean(props.session?.is_admin || ['manager', 'accountant', 'ceo'].includes(props.session?.role))
  const records = props.inventoryLensData?.records ?? []
  const stats = props.inventoryLensData?.stats ?? {}

  return (
    <section className="finance-layout">
      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Total Lenses" value={stats.total_lenses ?? '...'} note="Lens bills in the selected range" icon="glasses" className="total" />
        <StatWidget label="Tracked" value={stats.tracked_count ?? '...'} note="Rows with recorded cost prices" icon="check-badge" className="seen" />
        <StatWidget label="Untracked" value={stats.untracked_count ?? '...'} note="Rows still waiting for lens cost entry" icon="alert" className="pending" />
        <StatWidget label="Total Profit" value={currency.format(Number(stats.total_profit ?? 0))} note="Profit from tracked lens rows" icon="trend" className="today" />
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Lens Tracker</p>
            <h3>Track lens cost, profit, and Lens Spec details</h3>
          </div>
          <span className="panel-tag">{props.inventoryLensData?.branch_name ?? 'Inventory'}</span>
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
              placeholder="Folder ID, patient, receipt, phone"
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

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Lens Profit Table</p>
            <h3>Save cost price and review prescription-linked lens specs</h3>
          </div>
          <span className="panel-tag">
            {stats.tracked_count ?? 0} tracked / {stats.pending_count ?? 0} pending
          </span>
        </div>

        {props.isLoadingLensTracker && !props.inventoryLensData ? <p className="muted-copy">Loading lens tracker...</p> : null}

        <div className="table-shell">
          <table className="portal-table inventory-table-wide">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Folder ID</th>
                <th>Receipt</th>
                <th>Insurance</th>
                <th>Lens Spec</th>
                <th>Selling Price</th>
                <th>Cost Price</th>
                <th>Profit</th>
                <th>Margin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const draft = props.lensDrafts[record.billing_id] ?? { cost_price: '', selling_price: record.selling_price ?? '' }
                const isLocked = record.tracked && !canOverrideTracked
                const cost = Number(draft.cost_price || 0)
                const selling = Number(draft.selling_price || record.selling_price || 0)
                const profit = selling - cost
                const margin = selling > 0 ? (profit / selling) * 100 : 0

                return (
                  <tr key={record.billing_id}>
                    <td>
                      <strong>{record.patient_display_name || record.patient_name || record.customer_name || 'N/A'}</strong>
                      <div className="table-inline-meta">{record.billing_date || record.date || 'Date unavailable'}</div>
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
                          props.setLensDrafts((current) => ({
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
                          props.setLensDrafts((current) => ({
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
                        <span className="status-pill status-seen">Locked</span>
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

        <p className="muted-copy">
          Saved lens costs become locked for reception. Only the General Manager, CEO, or Accountant can update an already tracked row.
        </p>

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

function formatSignedNumber(value) {
  const numeric = Number(value ?? 0)
  return `${numeric > 0 ? '+' : ''}${numeric}`
}

function formatDateTime(value) {
  if (!value) return 'N/A'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)

  return parsed.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMovementType(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function createInventoryReportHtml({
  branchName,
  filters,
  stats,
  records,
  movementFeed,
  movementTrackingEnabled,
  generatedBy,
}) {
  const generatedAt = new Date().toLocaleString()
  const movementRange = filters?.date_from || filters?.date_to
    ? `${filters?.date_from || 'Start'} to ${filters?.date_to || 'End'}`
    : 'No movement range selected'
  const snapshotScope = filters?.as_of_at ? formatDateTime(filters.as_of_at) : 'Live stock view'
  const searchScope = filters?.search ? filters.search : 'No search filter'
  const categoryScope = filters?.category && filters.category !== 'all' ? filters.category : 'All categories'

  const inventoryRows = records.map((record, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(record.code)}</td>
      <td>${escapeHtml(record.name)}</td>
      <td>${escapeHtml(record.category)}</td>
      <td>${escapeHtml(record.grade || 'N/A')}</td>
      <td>${escapeHtml(record.current_stock ?? record.stock)}</td>
      <td>${escapeHtml(record.stock_at_snapshot ?? record.stock)}</td>
      <td>${escapeHtml(formatSignedNumber(record.net_change ?? 0))}</td>
      <td>${escapeHtml(record.last_movement_at ? formatDateTime(record.last_movement_at) : 'No movement log')}</td>
      <td>${escapeHtml(currency.format(Number(record.min_price ?? 0)))}</td>
      <td>${escapeHtml(currency.format(Number(record.max_price ?? 0)))}</td>
    </tr>
  `).join('')

  const movementRows = movementFeed.map((entry, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(formatDateTime(entry.movement_at))}</td>
      <td>${escapeHtml(entry.product_code || '')}</td>
      <td>${escapeHtml(entry.product_name || '')}</td>
      <td>${escapeHtml(formatMovementType(entry.movement_type))}</td>
      <td>${escapeHtml(formatSignedNumber(entry.quantity_change ?? 0))}</td>
      <td>${escapeHtml(entry.stock_before ?? 'N/A')}</td>
      <td>${escapeHtml(entry.stock_after ?? 'N/A')}</td>
      <td>${escapeHtml(entry.reference_table ? `${entry.reference_table} #${entry.reference_id ?? ''}` : 'Manual')}</td>
      <td>${escapeHtml(entry.notes || 'No note')}</td>
    </tr>
  `).join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(`Inventory Audit Report - ${branchName}`)}</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; margin: 24px; color: #132238; }
        h1, h2, h3, p { margin: 0; }
        .header { text-align: center; margin-bottom: 22px; }
        .header p { margin-top: 6px; color: #516072; }
        .meta, .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
        .meta-card, .summary-card { border: 1px solid #c8d7e3; border-radius: 12px; padding: 12px 14px; background: #f8fbfd; }
        .meta-card strong, .summary-card strong { display: block; margin-top: 8px; font-size: 18px; }
        .meta-card span, .summary-card span, .summary-card p { color: #56667a; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
        th, td { border: 1px solid #c8d7e3; padding: 8px 10px; vertical-align: top; font-size: 12px; text-align: left; }
        th { background: #e8f2f9; }
        .section-title { margin: 24px 0 12px; }
        .empty { padding: 16px; border: 1px dashed #c8d7e3; border-radius: 12px; color: #5d6d7f; }
        @media print {
          body { margin: 16px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>BEALET OPTICAL CENTER</h1>
        <h2>Inventory Audit Report</h2>
        <p>${escapeHtml(branchName)} | Generated ${escapeHtml(generatedAt)}</p>
      </div>

      <div class="meta">
        <div class="meta-card">
          <span>Movement range</span>
          <strong>${escapeHtml(movementRange)}</strong>
        </div>
        <div class="meta-card">
          <span>Stock snapshot</span>
          <strong>${escapeHtml(snapshotScope)}</strong>
        </div>
        <div class="meta-card">
          <span>Category / Search</span>
          <strong>${escapeHtml(categoryScope)}</strong>
          <p>${escapeHtml(searchScope)}</p>
        </div>
        <div class="meta-card">
          <span>Prepared by</span>
          <strong>${escapeHtml(generatedBy)}</strong>
        </div>
      </div>

      <div class="summary">
        <div class="summary-card">
          <span>Product lines</span>
          <strong>${escapeHtml(stats.product_lines ?? 0)}</strong>
          <p>Registered products in this branch scope</p>
        </div>
        <div class="summary-card">
          <span>${escapeHtml(filters?.as_of_at ? 'Units At Snapshot' : 'Live Units')}</span>
          <strong>${escapeHtml(stats.stock_units ?? 0)}</strong>
          <p>${escapeHtml(filters?.as_of_at ? 'Balance at selected time' : 'Current units on hand')}</p>
        </div>
        <div class="summary-card">
          <span>Low stock lines</span>
          <strong>${escapeHtml(stats.low_stock ?? 0)}</strong>
          <p>Products with ten units or fewer</p>
        </div>
        <div class="summary-card">
          <span>Net range change</span>
          <strong>${escapeHtml(formatSignedNumber(stats.range_net_change ?? 0))}</strong>
          <p>${escapeHtml(`${stats.range_movement_count ?? 0} movement entries in range`)}</p>
        </div>
      </div>

      <h3 class="section-title">Inventory Stock Table</h3>
      <table>
        <thead>
          <tr>
            <th>SN</th>
            <th>Code</th>
            <th>Name</th>
            <th>Category</th>
            <th>Grade</th>
            <th>Live Stock</th>
            <th>Stock At Snapshot</th>
            <th>Range Change</th>
            <th>Last Movement</th>
            <th>Min Price</th>
            <th>Max Price</th>
          </tr>
        </thead>
        <tbody>${inventoryRows}</tbody>
      </table>

      <h3 class="section-title">Movement Timeline</h3>
      ${movementTrackingEnabled
        ? movementFeed.length
          ? `
            <table>
              <thead>
                <tr>
                  <th>SN</th>
                  <th>When</th>
                  <th>Code</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Reference</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>${movementRows}</tbody>
            </table>
          `
          : `<div class="empty">No stock movements were found for the selected date range.</div>`
        : `<div class="empty">Inventory movement tracking is not enabled yet for this database.</div>`}
    </body>
  </html>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
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

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.total_pages <= 1) return null

  return (
    <div className="pagination-bar">
      <span>Page {pagination.page} of {Math.max(pagination.total_pages, 1)}</span>
      <div className="pagination-actions">
        <button
          type="button"
          className="ghost-button"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={pagination.page >= pagination.total_pages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}
