import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 })
const types = [
  ['trade_creditors', 'Trade Creditors'],
  ['staff_creditors', 'Staff Creditors'],
  ['accrued_expenses', 'Accrued Expenses'],
  ['other_actuals', 'Other Actuals'],
]
const typeLabel = Object.fromEntries(types)

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function defaultForm() {
  return { as_of_date: todayIso(), liability_type: 'trade_creditors', description: '', amount: '', notes: '' }
}

export default function WorkingCapitalLiabilitiesSection(props) {
  const branchId = props.session?.is_admin ? props.selectedBranchId : props.session?.branch_id
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [data, setData] = useState(null)
  const [form, setForm] = useState(defaultForm())
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function loadData() {
    setError('')
    try {
      const params = new URLSearchParams({ branch_id: String(branchId), year: String(year) })
      if (month) params.set('month', month)
      const response = await props.apiFetch(`/working-capital-liabilities?${params.toString()}`, { token: props.token })
      setData(response)
    } catch (loadError) {
      setError(loadError.message)
    }
  }

  useEffect(() => {
    if (props.token && props.session && branchId != null) loadData()
  }, [branchId, year, month, props.session, props.token])

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  function startEdit(record) {
    setEditingId(record.id)
    setForm({
      as_of_date: record.as_of_date ?? todayIso(),
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

  const totals = data?.totals ?? {}

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Working Capital</p>
          <h3>Record month-end current liabilities</h3>
          <p className="header-copy">Maintain the unpaid balances used by the Monthly Working Capital Statement.</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        {types.map(([key, label], index) => (
          <StatWidget key={key} label={label} value={currency.format(Number(totals[key] ?? 0))} note={`Selected ${year}${month ? `-${String(month).padStart(2, '0')}` : ''}`} icon="finance" className={['total', 'seen', 'pending', 'today'][index]} />
        ))}
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Liability Register</p>
            <h3>{editingId ? 'Edit liability balance' : 'Add liability balance'}</h3>
          </div>
          <span className="panel-tag">{data?.branch_name ?? 'Branch'}</span>
        </div>
        <form className="patient-form-grid" onSubmit={save}>
          <label>
            Month-end date
            <input type="date" value={form.as_of_date} onChange={(event) => updateField('as_of_date', event.target.value)} required />
          </label>
          <label>
            Liability type
            <select value={form.liability_type} onChange={(event) => updateField('liability_type', event.target.value)}>
              {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Creditor or description
            <input value={form.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Supplier, staff member, or accrual" required />
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
            <button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving...' : editingId ? 'Update liability' : 'Add liability'}</button>
            {editingId ? <button type="button" className="ghost-button" onClick={resetForm}>Cancel edit</button> : null}
          </div>
        </form>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Saved Balances</p>
            <h3>Liabilities for {year}{month ? `-${String(month).padStart(2, '0')}` : ''}</h3>
          </div>
          <span className="panel-tag">{currency.format(Number(data?.total ?? 0))}</span>
        </div>
        <div className="patient-filter-grid">
          <label>
            Year
            <input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>
          <label>
            Month
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="">All months</option>
              {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2000, index, 1).toLocaleString('en-GH', { month: 'long' })}</option>)}
            </select>
          </label>
        </div>
        <div className="table-shell">
          <table className="portal-table">
            <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>
              {(data?.records ?? []).map((record) => (
                <tr key={record.id}>
                  <td>{record.as_of_date}</td>
                  <td>{typeLabel[record.liability_type] ?? record.liability_type}</td>
                  <td>{record.description}</td>
                  <td>{currency.format(Number(record.amount ?? 0))}</td>
                  <td>{record.notes || 'N/A'}</td>
                  <td><div className="filter-actions-row"><button type="button" className="mini-action" onClick={() => startEdit(record)}>Edit</button><button type="button" className="mini-action danger" onClick={() => remove(record)}>Delete</button></div></td>
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
