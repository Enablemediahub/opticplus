import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 })
const types = [
  ['current_liability', 'Current Liability', [
    ['trade_creditors', 'Trade Creditors'],
    ['staff_creditors', 'Staff Creditors'],
    ['accrued_expenses', 'Accrued Expenses'],
    ['other_actuals', 'Other Actuals'],
  ]],
  ['current_asset', 'Current Asset', [
    ['cash_in_hand', 'Cash in Hand'],
    ['cash_in_momo', 'Cash in MoMo'],
    ['cash_at_bank', 'Cash at Bank'],
  ]],
]
const typeOptions = types.flatMap(([, , options]) => options)
const typeLabel = Object.fromEntries(typeOptions)

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function defaultForm() {
  return { as_of_date: todayIso(), entry_side: 'current_liability', liability_type: 'trade_creditors', description: '', amount: '', notes: '' }
}

export default function WorkingCapitalLiabilitiesSection(props) {
  const branchId = props.session?.is_admin ? props.selectedBranchId : props.session?.branch_id
  const [year, setYear] = useState(new Date().getFullYear())
  const [monthFrom, setMonthFrom] = useState('')
  const [monthTo, setMonthTo] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [form, setForm] = useState(defaultForm())
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isChangingApproval, setIsChangingApproval] = useState(false)
  const isManager = Boolean(props.session?.is_admin || props.session?.role === 'manager')
  const isApproved = Boolean(data?.approval?.approved)

  async function loadData() {
    setError('')
    try {
      const params = new URLSearchParams({ branch_id: String(branchId), year: String(year) })
      if (monthFrom) params.set('month_from', monthFrom)
      if (monthTo) params.set('month_to', monthTo)
      if (search.trim()) params.set('search', search.trim())
      const response = await props.apiFetch(`/working-capital-liabilities?${params.toString()}`, { token: props.token })
      setData(response)
    } catch (loadError) {
      setError(loadError.message)
    }
  }

  useEffect(() => {
    if (props.token && props.session && branchId != null) loadData()
  }, [branchId, year, monthFrom, monthTo, search, props.session, props.token])

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  function startEdit(record) {
    setEditingId(record.id)
    setForm({
      as_of_date: record.as_of_date ?? todayIso(),
      entry_side: record.entry_side ?? 'current_liability',
      liability_type: record.liability_type ?? 'trade_creditors',
      description: record.description ?? '',
      amount: String(record.amount ?? ''),
      notes: record.notes ?? '',
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(defaultForm())
  }

  async function save(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      await props.apiFetch(editingId ? `/working-capital-liabilities/${editingId}?branch_id=${branchId}` : `/working-capital-liabilities?branch_id=${branchId}`, {
        method: editingId ? 'PUT' : 'POST',
        token: props.token,
        body: { ...form, amount: Number(form.amount || 0) },
      })
      setSuccess(editingId ? 'Liability updated.' : 'Liability added.')
      resetForm()
      await loadData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function remove(record) {
    if (!window.confirm(`Delete ${record.description}?`)) return
    setError('')
    try {
      await props.apiFetch(`/working-capital-liabilities/${record.id}?branch_id=${branchId}`, { method: 'DELETE', token: props.token })
      setSuccess('Liability deleted.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  async function changeApproval(approve) {
    if (!monthFrom || !monthTo || monthFrom !== monthTo) {
      setError('Select one month before changing approval status.')
      return
    }

    setIsChangingApproval(true)
    setError('')
    setSuccess('')
    try {
      await props.apiFetch(`/working-capital-liabilities/${approve ? 'approve' : 'reopen'}`, {
        method: 'POST',
        token: props.token,
        body: { branch_id: branchId, year: Number(year), month: Number(monthFrom) },
      })
      setSuccess(approve ? 'Month approved and locked.' : 'Month reopened for editing.')
      await loadData()
    } catch (approvalError) {
      setError(approvalError.message)
    } finally {
      setIsChangingApproval(false)
    }
  }

  const totals = data?.totals ?? {}

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Working Capital</p>
          <h3>Record month-end working capital balances</h3>
          <p className="header-copy">Enter cash assets and unpaid liabilities used by the Monthly Working Capital Statement.</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        {typeOptions.map(([key, label], index) => (
          <StatWidget key={key} label={label} value={currency.format(Number(totals[key] ?? 0))} note={`Selected ${year}${monthFrom || monthTo ? `-${String(monthFrom || monthTo).padStart(2, '0')}${monthFrom !== monthTo && monthTo ? ` to ${String(monthTo).padStart(2, '0')}` : ''}` : ''}`} icon="finance" className={['total', 'seen', 'pending', 'today', 'total', 'seen', 'pending'][index]} />
        ))}
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Working Capital Entries</p>
            <h3>{editingId ? 'Edit working capital entry' : 'Add working capital entry'}</h3>
          </div>
          <span className="panel-tag">{data?.branch_name ?? 'Branch'}</span>
        </div>
        <div className="message-banner">
          {monthFrom && monthTo && monthFrom === monthTo ? (isApproved ? 'This month is approved and locked.' : 'This month is open for Accountant edits.') : 'Select the same month in both fields to approve or reopen a month-end statement.'}
        </div>
        {isManager ? (
          <div className="filter-actions-row">
            <button type="button" className="primary-button" disabled={!monthFrom || !monthTo || monthFrom !== monthTo || isApproved || isChangingApproval} onClick={() => changeApproval(true)}>
              {isChangingApproval ? 'Saving...' : 'Approve month'}
            </button>
            <button type="button" className="ghost-button" disabled={!monthFrom || !monthTo || monthFrom !== monthTo || !isApproved || isChangingApproval} onClick={() => changeApproval(false)}>
              Allow Accountant Editing
            </button>
          </div>
        ) : null}
        {isApproved ? (
          <div className="message-banner">Entries are locked. The General Manager must select "Allow Accountant Editing" before changes can be made.</div>
        ) : (
        <form className="patient-form-grid" onSubmit={save}>
          <label>
            Month-end date
            <input type="date" value={form.as_of_date} onChange={(event) => updateField('as_of_date', event.target.value)} required />
          </label>
          <label>
            Liability type
            <select value={form.entry_side} onChange={(event) => {
              const entrySide = event.target.value
              updateField('entry_side', entrySide)
              updateField('liability_type', entrySide === 'current_asset' ? 'cash_in_hand' : 'trade_creditors')
            }}>
              {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Entry type
            <select value={form.liability_type} onChange={(event) => updateField('liability_type', event.target.value)}>
              {(types.find(([value]) => value === form.entry_side)?.[2] ?? []).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Description
            <input value={form.description} onChange={(event) => updateField('description', event.target.value)} placeholder={form.entry_side === 'current_asset' ? 'Optional description' : 'Optional description'} />
          </label>
          <label>
            Amount outstanding
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => updateField('amount', event.target.value)} required />
          </label>
          <label className="full-span">
            Notes
            <textarea value={form.notes} onChange={(event) => updateField('notes', event.target.value)} rows="2" placeholder="Optional supporting detail" />
          </label>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving...' : editingId ? 'Update entry' : 'Add entry'}</button>
            {editingId ? <button type="button" className="ghost-button" onClick={resetForm}>Cancel edit</button> : null}
          </div>
        </form>
        )}
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Saved Balances</p>
            <h3>Entries for {year}{monthFrom || monthTo ? `-${String(monthFrom || monthTo).padStart(2, '0')}${monthFrom !== monthTo && monthTo ? ` to ${String(monthTo).padStart(2, '0')}` : ''}` : ''}</h3>
          </div>
          <span className="panel-tag">{currency.format(Number(data?.total ?? 0))}</span>
        </div>
        <div className="patient-filter-grid">
          <label>
            Search entries
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Description, notes, or entry type" />
          </label>
          <label>
            Year
            <input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
          <label>
            Month from
            <select value={monthFrom} onChange={(event) => setMonthFrom(event.target.value)}>
              <option value="">Any month</option>
              {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index, 1).toLocaleString('en-GH', { month: 'long' })}</option>)}
            </select>
          </label>
          <label>
            Month to
            <select value={monthTo} onChange={(event) => setMonthTo(event.target.value)}>
              <option value="">Any month</option>
              {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index, 1).toLocaleString('en-GH', { month: 'long' })}</option>)}
            </select>
          </label>
        </div>
        <div className="table-shell">
          <table className="portal-table">
            <thead><tr><th>Date</th><th>Side</th><th>Type</th><th>Description</th><th>Amount</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>
              {(data?.records ?? []).map((record) => (
                <tr key={record.id}>
                  <td>{record.as_of_date}</td>
                  <td>{record.entry_side === 'current_asset' ? 'Current Asset' : 'Current Liability'}</td>
                  <td>{typeLabel[record.liability_type] ?? record.liability_type}</td>
                  <td>{record.description}</td>
                  <td>{currency.format(Number(record.amount ?? 0))}</td>
                  <td>{record.notes || 'N/A'}</td>
                  <td>{isApproved ? <span className="muted-copy">Locked</span> : <div className="filter-actions-row"><button type="button" className="mini-action" onClick={() => startEdit(record)}>Edit</button><button type="button" className="mini-action danger" onClick={() => remove(record)}>Delete</button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.records?.length ? <p className="muted-copy">No liability balances recorded for this period.</p> : null}
      </article>
    </section>
  )
}
