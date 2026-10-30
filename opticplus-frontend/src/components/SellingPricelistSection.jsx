import { Fragment, useEffect, useMemo, useState } from 'react'

const emptyEntry = {
  category: '',
  lens_type: '',
  index: '',
  sph_min: '',
  sph_max: '',
  cyl_min: '',
  cyl_max: '',
  add_min: '',
  add_max: '',
  price_label: '',
  selling_price: '',
  notes: '',
}

function splitRange(value) {
  const parts = String(value ?? '').split(/\s+to\s+/i)
  return { min: parts[0] ?? '', max: parts[1] ?? '' }
}

function rangeValue(min, max) {
  if (!min && !max) return ''
  if (!max || min === max) return min
  if (!min) return max
  return `${min} to ${max}`
}

const priceLabels = ['AR', 'BC', 'HC', 'HMC', 'PROG', 'SV', 'Other']

export default function SellingPricelistSection({
  session,
  fetchHistoricalSellingPrices,
  fetchSellingPriceRequests,
  fetchSellingPriceRules,
  fetchSellingPriceSettings,
  updateSellingPriceSettings,
  approveSellingPriceRequest,
  bootstrapSellingPriceRules,
  saveSellingPriceRule,
  deleteSellingPriceRule,
}) {
  const isGeneralManager = session?.role === 'manager'
  const [entries, setEntries] = useState([])
  const [priceRequests, setPriceRequests] = useState([])
  const [draft, setDraft] = useState(emptyEntry)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [requestSearch, setRequestSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [priceFilter, setPriceFilter] = useState('all')
  const [page, setPage] = useState({ rules: 1, requests: 1 })
  const [pageSize, setPageSize] = useState(20)
  const [overrideAllowed, setOverrideAllowed] = useState(false)
  const [isSavingOverrideSetting, setIsSavingOverrideSetting] = useState(false)
  const [inlinePrices, setInlinePrices] = useState({})
  const [savingInlinePriceId, setSavingInlinePriceId] = useState(null)
  const [approvingRequestId, setApprovingRequestId] = useState(null)

  async function reloadRules() {
    const response = await fetchSellingPriceRules()
    const records = (response.records ?? []).map((record) => {
      const sph = splitRange(record.sph_range)
      const cyl = splitRange(record.cyl_range)
      const add = splitRange(record.add_range)
      return {
        ...record,
        index: record.index ?? record.lens_index ?? '',
        sph_min: sph.min,
        sph_max: sph.max,
        cyl_min: cyl.min,
        cyl_max: cyl.max,
        add_min: add.min,
        add_max: add.max,
      }
    })
    setEntries(records)
    setInlinePrices(Object.fromEntries(records.map((record) => [record.id, record.selling_price == null ? '' : String(record.selling_price)])))
    return records
  }

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase()
    return entries.filter((entry) => (!categoryFilter || entry.category === categoryFilter) && (priceFilter === 'all' || (priceFilter === 'priced' ? entry.selling_price != null : entry.selling_price == null)) && (!query || Object.values(entry).some((value) => String(value).toLowerCase().includes(query))))
  }, [categoryFilter, entries, priceFilter, search])
  const paginatedEntries = filteredEntries.slice((page.rules - 1) * pageSize, page.rules * pageSize)
  const groupedEntries = useMemo(() => {
    const groups = new Map()
    paginatedEntries.forEach((entry) => {
      const category = entry.category || 'Other'
      if (!groups.has(category)) groups.set(category, [])
      groups.get(category).push(entry)
    })
    return [...groups.entries()]
  }, [paginatedEntries])
  const filteredRequests = useMemo(() => {
    const query = requestSearch.trim().toLowerCase()
    return priceRequests.filter((entry) => !query || Object.values(entry).some((value) => String(value).toLowerCase().includes(query)))
  }, [priceRequests, requestSearch])
  const paginate = (items, key) => {
    const currentPage = page[key]
    return items.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }
  const pageCount = (items) => Math.max(1, Math.ceil(items.length / pageSize))

  useEffect(() => {
    reloadRules()
      .then(async (records) => {
        if (records.length === 0) {
          await bootstrapSellingPriceRules()
          await reloadRules()
        }
      })
      .catch((error) => setStatusMessage(error.message || 'Unable to load approved selling-price rules.'))
  }, [bootstrapSellingPriceRules, fetchSellingPriceRules])

  useEffect(() => {
    let cancelled = false
    fetchSellingPriceRequests()
      .then((response) => { if (!cancelled) setPriceRequests(response.records ?? []) })
      .catch(() => { if (!cancelled) setPriceRequests([]) })
    return () => { cancelled = true }
  }, [fetchSellingPriceRequests])

  useEffect(() => {
    fetchSellingPriceSettings()
      .then((response) => setOverrideAllowed(Boolean(Number(response.receptionist_override_allowed ?? 0))))
      .catch((error) => setStatusMessage(error.message || 'Unable to load override setting.'))
  }, [fetchSellingPriceSettings])

  async function changeOverrideSetting(event) {
    const enabled = event.target.checked
    setOverrideAllowed(enabled)
    setIsSavingOverrideSetting(true)
    try {
      await updateSellingPriceSettings({ receptionist_override_allowed: enabled })
      setStatusMessage(`Receptionist price override is now ${enabled ? 'allowed' : 'locked'} for all lens prices.`)
    } catch (error) {
      setOverrideAllowed(!enabled)
      setStatusMessage(error.message || 'Unable to update override setting.')
    } finally {
      setIsSavingOverrideSetting(false)
    }
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function resetForm() {
    setDraft(emptyEntry)
    setEditingId(null)
  }

  async function saveEntry(event) {
    event.preventDefault()
    if (!draft.category.trim() || !draft.lens_type.trim()) {
      setStatusMessage('Category and lens type are required.')
      return
    }

    try {
      await saveSellingPriceRule({
        ...draft,
        lens_index: draft.index,
        sph_range: rangeValue(draft.sph_min, draft.sph_max),
        cyl_range: rangeValue(draft.cyl_min, draft.cyl_max),
        add_range: rangeValue(draft.add_min, draft.add_max),
      }, editingId)
      await reloadRules()
      setStatusMessage(draft.selling_price ? (editingId ? 'Selling price entry updated.' : 'Selling price entry approved.') : 'Unpriced catalogue entry saved.')
      resetForm()
      setIsEditorOpen(false)
    } catch (error) {
      setStatusMessage(error.message || 'Unable to save selling-price entry.')
    }
  }

  function editEntry(entry) {
    const entryFields = { ...entry }
    delete entryFields.receptionist_override_allowed
    setDraft({ ...emptyEntry, ...entryFields, index: entry.index ?? entry.lens_index ?? '' })
    setEditingId(entry.id)
    setStatusMessage('')
    setIsEditorOpen(true)
  }

  function openCreateModal() {
    resetForm()
    setStatusMessage('')
    setIsEditorOpen(true)
  }

  async function deleteEntry(id) {
    if (!window.confirm('Delete this approved selling-price range?')) return
    try {
      await deleteSellingPriceRule(id)
      await reloadRules()
      setStatusMessage('Selling price entry deleted.')
    } catch (error) {
      setStatusMessage(error.message || 'Unable to delete selling-price entry.')
    }

    async function saveInlinePrice(entry) {
      const value = inlinePrices[entry.id] ?? ''
      try {
        setSavingInlinePriceId(entry.id)
        await saveSellingPriceRule({
          ...entry,
          lens_index: entry.index ?? entry.lens_index ?? '',
          selling_price: value === '' ? null : value,
        }, entry.id)
        await reloadRules()
        setStatusMessage(value === '' ? 'Entry saved without an approved price.' : 'Selling price saved and approved.')
      } catch (error) {
        setStatusMessage(error.message || 'Unable to save selling price.')
      } finally {
        setSavingInlinePriceId(null)
      }
    }
  }

  async function approveRequest(requestId) {
    try {
      setApprovingRequestId(requestId)
      await approveSellingPriceRequest(requestId)
      const response = await fetchSellingPriceRequests()
      setPriceRequests(response.records ?? [])
      await reloadRules()
      setStatusMessage('Selling-price request approved and added to the catalogue.')
    } catch (error) {
      setStatusMessage(error.message || 'Unable to approve selling-price request.')
    } finally {
      setApprovingRequestId(null)
    }
  }

  return (
    <section className="module-section selling-pricelist-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Selling prices</p>
          <h3>Lens Selling Pricelist</h3>
          <p className="header-copy">
            Maintain Bealet customer-facing lens prices in GHS. The supplier document format guides the categories and prescription ranges; no supplier prices are imported here.
          </p>
        </div>
        <span className="panel-tag">Technician / GM</span>
      </div>

      <div className="selling-pricelist-notice">
        <strong>Approval control</strong>
        <span>Entries saved here are approved customer-facing prices. This page does not change Lens Tracker cost prices.</span>
      </div>

      <div className="selling-pricelist-toolbar">
        <button type="button" className="primary-button" onClick={openCreateModal}>Add to pricelist</button>
        {isGeneralManager ? (
          <label className="selling-pricelist-global-toggle">
            <input type="checkbox" checked={overrideAllowed} onChange={changeOverrideSetting} disabled={isSavingOverrideSetting} />
            Allow receptionist overrides for all fetched lens prices
          </label>
        ) : null}
      </div>

      <article className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Approval queue</p><h4>Manual selling-price requests</h4></div><span className="panel-tag">{priceRequests.length} records</span></div>
        {statusMessage ? <p className="selling-pricelist-feedback">{statusMessage}</p> : null}
        <label className="patient-search-shell selling-pricelist-search"><span className="patient-search-icon" aria-hidden="true">⌕</span><input value={requestSearch} onChange={(event) => { setRequestSearch(event.target.value); setPage((current) => ({ ...current, requests: 1 })) }} placeholder="Search requests" /></label>
        {filteredRequests.length === 0 ? <p className="muted-copy">No manual selling-price requests found.</p> : (
          <div className="table-shell"><table className="portal-table inventory-table-wide"><thead><tr><th>Requested price (GHS)</th><th>Lens type</th><th>Material</th><th>Prescription</th><th>Status</th><th>Action</th></tr></thead><tbody>{paginate(filteredRequests, 'requests').map((request) => <tr key={request.id}><td>{request.requested_price == null ? '—' : Number(request.requested_price).toFixed(2)}</td><td>{request.lens_type || '—'}</td><td>{request.lens_material || '—'}</td><td><small>OD {request.sph_od || '—'} / {request.cyl_od || '—'} / {request.add_od || '—'}</small><br /><small>OS {request.sph_os || '—'} / {request.cyl_os || '—'} / {request.add_os || '—'}</small></td><td><span className="status-pill">{request.status}</span></td><td>{request.status === 'pending' ? <button type="button" className="primary-button selling-pricelist-approve-button" onClick={() => approveRequest(request.id)} disabled={approvingRequestId === request.id}>{approvingRequestId === request.id ? 'Approving...' : 'Approve & add to catalogue'}</button> : '—'}</td></tr>)}</tbody></table></div>
        )}
        <PricelistPagination page={page.requests} pages={pageCount(filteredRequests)} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage({ rules: 1, requests: 1 }) }} onChange={(value) => setPage((current) => ({ ...current, requests: value }))} />
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Price ranges</p><h4>Lens selling-price catalogue</h4></div>
          <span className="panel-tag">{filteredEntries.length} entries</span>
        </div>
        <form className="patient-filter-grid table-attached-filter" onSubmit={(event) => event.preventDefault()}>
          <label>Search<input value={search} onChange={(event) => { setSearch(event.target.value); setPage((current) => ({ ...current, rules: 1 })) }} placeholder="Category, lens type, index, range" /></label>
          <label>Category<select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage((current) => ({ ...current, rules: 1 })) }}><option value="">All categories</option>{[...new Set(entries.map((entry) => entry.category).filter(Boolean))].sort().map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>Price status<select value={priceFilter} onChange={(event) => { setPriceFilter(event.target.value); setPage((current) => ({ ...current, rules: 1 })) }}><option value="all">Priced and unpriced</option><option value="priced">Priced</option><option value="unpriced">Unpriced</option></select></label>
          <div className="filter-actions-row"><button type="button" className="ghost-button" onClick={() => setSearch('')}>Reset</button></div>
        </form>
        <div className="table-shell">
          <table className="portal-table inventory-table-wide">
            <thead><tr><th>Category</th><th>Lens type</th><th>Index</th><th>SPH</th><th>CYL</th><th>ADD</th><th>Prescription count</th><th>Price label</th><th>Selling price (GHS)</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{groupedEntries.length === 0 ? <tr><td colSpan="11" className="selling-pricelist-empty">No catalogue ranges found.</td></tr> : groupedEntries.map(([category, categoryEntries]) => (
              <Fragment key={category}>
                <tr className="selling-pricelist-category-row"><th colSpan="11" scope="rowgroup">{category}<span>{categoryEntries.length} {categoryEntries.length === 1 ? 'entry' : 'entries'}</span></th></tr>
                {categoryEntries.map((entry) => (
                  <tr key={entry.id}><td>{entry.category || '—'}</td><td><strong>{entry.lens_type}</strong></td><td>{entry.index || '—'}</td><td>{entry.sph_range || '—'}</td><td>{entry.cyl_range || '—'}</td><td>{entry.add_range || '—'}</td><td>{entry.prescription_count ?? entry.prescription_examples?.length ?? 0}</td><td>{entry.price_label || '—'}</td><td><div className="selling-pricelist-inline-price-cell"><input className="selling-pricelist-inline-price" type="number" min="0" step="0.01" value={inlinePrices[entry.id] ?? ''} onChange={(event) => setInlinePrices((current) => ({ ...current, [entry.id]: event.target.value }))} placeholder="Enter price" aria-label={`Selling price for ${entry.lens_type}`} /><button type="button" className="ghost-button" onClick={() => saveInlinePrice(entry)} disabled={savingInlinePriceId === entry.id}>{savingInlinePriceId === entry.id ? 'Saving...' : 'Save'}</button></div></td><td><span className="status-pill">{entry.status === 'pending_price' ? 'Pending price' : entry.status}</span></td><td><div className="selling-pricelist-row-actions"><button type="button" className="ghost-button" onClick={() => editEntry(entry)}>Edit details</button><button type="button" className="ghost-button" onClick={() => deleteEntry(entry.id)}>Delete</button></div></td></tr>
                ))}
              </Fragment>
            ))}</tbody>
          </table>
        </div>
        <PricelistPagination page={page.rules} pages={pageCount(filteredEntries)} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage({ rules: 1, requests: 1 }) }} onChange={(value) => setPage((current) => ({ ...current, rules: value }))} />
      </article>

      {isEditorOpen ? <div className="modal-overlay" onClick={() => setIsEditorOpen(false)}>
        <div className="modal-panel selling-pricelist-editor-modal" onClick={(event) => event.stopPropagation()}>
          <div className="panel-heading"><div><p className="eyebrow">{editingId ? 'Edit entry' : 'Add entry'}</p><h4>{editingId ? 'Update selling-price range' : 'Create a selling-price range'}</h4></div><button type="button" className="icon-button" onClick={() => setIsEditorOpen(false)} aria-label="Close">×</button></div>
          <form className="selling-pricelist-form" onSubmit={saveEntry}>
          <div className="selling-pricelist-form-section selling-pricelist-form-wide"><strong>Lens identification</strong><span>Define which lens family this catalogue entry represents.</span></div>
          <label>Category<input value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} placeholder="e.g. Digital RX Lenses" /></label>
          <label>Lens type<input value={draft.lens_type} onChange={(event) => updateDraft('lens_type', event.target.value)} placeholder="e.g. Progressive White" /></label>
          <label>Index<input value={draft.index} onChange={(event) => updateDraft('index', event.target.value)} placeholder="e.g. 1.56" /></label>
          <label>Price-column label<select value={draft.price_label} onChange={(event) => updateDraft('price_label', event.target.value)}><option value="">Select label</option>{priceLabels.map((label) => <option key={label} value={label}>{label}</option>)}</select></label>
          <div className="selling-pricelist-form-section selling-pricelist-form-wide"><strong>Prescription ranges</strong><span>Enter the minimum and maximum prescription values covered by this entry.</span></div>
          <RangeFields label="SPH range" min={draft.sph_min} max={draft.sph_max} onMin={(value) => updateDraft('sph_min', value)} onMax={(value) => updateDraft('sph_max', value)} />
          <RangeFields label="CYL range" min={draft.cyl_min} max={draft.cyl_max} onMin={(value) => updateDraft('cyl_min', value)} onMax={(value) => updateDraft('cyl_max', value)} />
          <RangeFields label="ADD range" min={draft.add_min} max={draft.add_max} onMin={(value) => updateDraft('add_min', value)} onMax={(value) => updateDraft('add_max', value)} />
          <div className="selling-pricelist-form-section selling-pricelist-form-wide"><strong>Customer price</strong><span>Leave blank when the price is not yet approved.</span></div>
          <label>Selling price (GHS)<input type="number" min="0" step="0.01" value={draft.selling_price ?? ''} onChange={(event) => updateDraft('selling_price', event.target.value)} placeholder="Enter approved price or leave blank" /></label>
          <label className="selling-pricelist-form-wide">Notes<textarea rows="2" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Optional approval or matching note" /></label>
          <div className="selling-pricelist-form-actions">
            <button type="submit" className="primary-button">{editingId ? 'Update entry' : 'Add to pricelist'}</button>
            {editingId ? <button type="button" className="ghost-button" onClick={resetForm}>Cancel edit</button> : null}
            {statusMessage ? <span className="muted-copy">{statusMessage}</span> : null}
          </div>
          </form>
        </div>
      </div> : null}

    </section>
  )
}

function RangeFields({ label, min, max, onMin, onMax }) {
  return (
    <div className="selling-pricelist-range-field">
      <span>{label}</span>
      <div><input value={min} onChange={(event) => onMin(event.target.value)} placeholder="Minimum" aria-label={`${label} minimum value`} /><b>to</b><input value={max} onChange={(event) => onMax(event.target.value)} placeholder="Maximum" aria-label={`${label} maximum value`} /></div>
    </div>
  )
}

function PricelistPagination({ page, pages, pageSize, onPageSizeChange, onChange }) {
  return (
    <div className="pagination-bar">
      <div className="pagination-summary"><span>Page {page} of {pages}</span></div>
      <label className="pagination-size-control">Rows
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {[20, 40, 60, 80].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="pagination-actions">
        <button type="button" className="mini-action" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <button type="button" className="mini-action" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  )
}
