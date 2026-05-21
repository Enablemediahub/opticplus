import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const defaultFilters = () => ({ search: '', status: 'all', type: 'all', page: 1, per_page: 12 })
const defaultDebtForm = () => ({
  debtor_name: 'BEALET OC',
  debt_type: 'loan',
  category: '',
  description: '',
  principal_amount: '',
  interest_rate: '',
  interest_type: 'fixed',
  lender_name: '',
  lender_contact: '',
  lender_phone: '',
  lender_email: '',
  start_date: todayIso(),
  due_date: '',
  term_months: '',
  payment_frequency: 'monthly',
  collateral: '',
  notes: '',
})
const defaultPaymentForm = () => ({ payment_date: todayIso(), amount: '', payment_method: 'cash', reference_number: '', notes: '' })
const defaultRestructureForm = () => ({ new_term_months: '', new_interest_rate: '', notes: '' })
const debtFormFromRecord = (debt) => ({
  debtor_name: debt?.debtor_name ?? 'BEALET OC',
  debt_type: debt?.debt_type ?? 'loan',
  category: debt?.category ?? '',
  description: debt?.description ?? '',
  principal_amount: debt?.principal_amount != null ? String(debt.principal_amount) : '',
  interest_rate: debt?.interest_rate != null ? String(debt.interest_rate) : '',
  interest_type: debt?.interest_type ?? 'fixed',
  lender_name: debt?.lender_name ?? '',
  lender_contact: debt?.lender_contact ?? '',
  lender_phone: debt?.lender_phone ?? '',
  lender_email: debt?.lender_email ?? '',
  start_date: debt?.start_date ?? todayIso(),
  due_date: debt?.due_date ?? '',
  term_months: debt?.term_months != null ? String(debt.term_months) : '',
  payment_frequency: debt?.payment_frequency ?? 'monthly',
  collateral: debt?.collateral ?? '',
  notes: debt?.notes ?? '',
})

export default function DebtManagementSection(props) {
  const [debtMeta, setDebtMeta] = useState(null)
  const [debtData, setDebtData] = useState(null)
  const [filters, setFilters] = useState(defaultFilters())
  const [query, setQuery] = useState(defaultFilters())
  const [debtForm, setDebtForm] = useState(defaultDebtForm())
  const [paymentForm, setPaymentForm] = useState(defaultPaymentForm())
  const [restructureForm, setRestructureForm] = useState(defaultRestructureForm())
  const [selectedDebt, setSelectedDebt] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSavingDebt, setIsSavingDebt] = useState(false)
  const [isSavingPayment, setIsSavingPayment] = useState(false)
  const [isSavingRestructure, setIsSavingRestructure] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [isRestructureOpen, setIsRestructureOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const branchId = props.session?.is_admin ? props.selectedBranchId : props.session?.branch_id
  const debtServicingReadOnly = branchId === 0

  function canRecordDebtPayment(debt) {
    if (debtServicingReadOnly) return false
    if (String(debt?.status).toLowerCase() === 'paid') return false
    const balance = Number(debt?.balance ?? 0)
    return balance > 0.009
  }

  function openRecordPaymentModal(debt) {
    setSelectedDebt(debt)
    setPaymentForm((current) => ({
      ...current,
      amount: Number(debt.next_payment_amount ?? debt.monthly_payment ?? debt.balance ?? 0).toFixed(2),
    }))
    loadDetail(debt.id, 'payment')
  }

  useEffect(() => {
    let cancelled = false

    async function loadMeta() {
      if (!props.token || !props.session) return
      try {
        const response = await props.apiFetch(`/debts/meta?branch_id=${branchId}`, { token: props.token })
        if (!cancelled) setDebtMeta(response)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      }
    }

    loadMeta()
    return () => {
      cancelled = true
    }
  }, [branchId, props.apiFetch, props.session, props.token])

  useEffect(() => {
    let cancelled = false

    async function loadDebts() {
      if (!props.token || !props.session) return
      setIsLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ branch_id: String(branchId), page: String(query.page), per_page: String(query.per_page) })
        if (query.search) params.set('search', query.search)
        if (query.status !== 'all') params.set('status', query.status)
        if (query.type !== 'all') params.set('type', query.type)
        const response = await props.apiFetch(`/debts?${params.toString()}`, { token: props.token })
        if (!cancelled) setDebtData(response)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadDebts()
    return () => {
      cancelled = true
    }
  }, [branchId, props.apiFetch, props.session, props.token, query])

  async function refreshDebtData() {
    setQuery((current) => ({ ...current }))
    if (selectedDebt?.id) {
      await loadDetail(selectedDebt.id)
    }
  }

  async function loadDetail(debtId, modal = '') {
    setIsLoadingDetail(true)
    setError('')
    try {
      const response = await props.apiFetch(`/debts/${debtId}?branch_id=${branchId}`, { token: props.token })
      setSelectedDebt(response.debt)
      setDetail(response)
      if (modal === 'details') setIsDetailOpen(true)
      if (modal === 'payment') setIsPaymentOpen(true)
      if (modal === 'restructure') setIsRestructureOpen(true)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function saveDebt(event) {
    event.preventDefault()
    setIsSavingDebt(true)
    setError('')
    setSuccess('')
    try {
      await props.apiFetch(`/debts?branch_id=${branchId}`, {
        method: 'POST',
        token: props.token,
        body: {
          ...debtForm,
          principal_amount: Number(debtForm.principal_amount || 0),
          interest_rate: debtForm.interest_rate === '' ? null : Number(debtForm.interest_rate),
          term_months: debtForm.term_months === '' ? null : Number(debtForm.term_months),
        },
      })
      setDebtForm(defaultDebtForm())
      setIsCreateOpen(false)
      setSuccess('Debt record added successfully.')
      await refreshDebtData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingDebt(false)
    }
  }

  async function updateDebt(event) {
    event.preventDefault()
    if (!selectedDebt?.id) return
    setIsSavingDebt(true)
    setError('')
    setSuccess('')
    try {
      await props.apiFetch(`/debts/${selectedDebt.id}?branch_id=${branchId}`, {
        method: 'PUT',
        token: props.token,
        body: {
          ...debtForm,
          principal_amount: Number(debtForm.principal_amount || 0),
          interest_rate: debtForm.interest_rate === '' ? null : Number(debtForm.interest_rate),
          term_months: debtForm.term_months === '' ? null : Number(debtForm.term_months),
        },
      })
      setIsEditOpen(false)
      setSuccess('Debt record updated successfully.')
      await refreshDebtData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingDebt(false)
    }
  }

  async function savePayment(event) {
    event.preventDefault()
    if (!selectedDebt?.id) return
    setIsSavingPayment(true)
    setError('')
    setSuccess('')
    try {
      await props.apiFetch(`/debts/${selectedDebt.id}/payments?branch_id=${branchId}`, {
        method: 'POST',
        token: props.token,
        body: {
          ...paymentForm,
          amount: Number(paymentForm.amount || 0),
        },
      })
      setPaymentForm(defaultPaymentForm())
      setIsPaymentOpen(false)
      setSuccess('Debt payment recorded successfully.')
      await refreshDebtData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingPayment(false)
    }
  }

  async function saveRestructure(event) {
    event.preventDefault()
    if (!selectedDebt?.id) return
    setIsSavingRestructure(true)
    setError('')
    setSuccess('')
    try {
      await props.apiFetch(`/debts/${selectedDebt.id}/restructure?branch_id=${branchId}`, {
        method: 'POST',
        token: props.token,
        body: {
          new_term_months: Number(restructureForm.new_term_months || 0),
          new_interest_rate: restructureForm.new_interest_rate === '' ? null : Number(restructureForm.new_interest_rate),
          notes: restructureForm.notes,
        },
      })
      setRestructureForm(defaultRestructureForm())
      setIsRestructureOpen(false)
      setSuccess('Debt restructured successfully.')
      await refreshDebtData()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingRestructure(false)
    }
  }

  async function updateDebtStatus(debtId, status) {
    setError('')
    setSuccess('')
    try {
      await props.apiFetch(`/debts/${debtId}/status?branch_id=${branchId}`, {
        method: 'PATCH',
        token: props.token,
        body: { status },
      })
      setSuccess('Debt status updated successfully.')
      await refreshDebtData()
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  return (
    <section className="finance-section debt-management-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Debt Management</p>
          <h3>Track loans, credit lines, and company payment schedules</h3>
          <p className="header-copy">Built from the legacy debt management page and connected to the company debt database.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="primary-button" onClick={() => setIsCreateOpen(true)}>Add new debt</button>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Total Balance" value={currency.format(Number(debtData?.stats?.total_balance ?? 0))} note={`${debtData?.stats?.active_count ?? 0} active debts`} icon="finance" className="total" />
        <StatWidget label="Overdue Debts" value={String(Number(debtData?.stats?.overdue_count ?? 0))} note="Past due and needing immediate action" icon="alert" className="pending" />
        <StatWidget label="Due in 30 Days" value={currency.format(Number(debtData?.stats?.next_30_days ?? 0))} note={`${debtData?.upcoming_payments?.length ?? 0} scheduled payments`} icon="calendar" className="today" />
        <StatWidget label="Monthly Obligation" value={currency.format(Number(debtData?.stats?.total_monthly_payment ?? 0))} note="Current recurring debt commitment" icon="receipt" className="seen" />
      </section>

      <section className="finance-layout debt-management-layout">
        <article className="panel debt-control-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Filters</p>
              <h3>Search the debt register</h3>
            </div>
            <span className="panel-tag">{debtData?.branch_name ?? debtMeta?.branch_name ?? 'Debt register'}</span>
          </div>

          <form className="patient-filter-grid" onSubmit={(event) => {
            event.preventDefault()
            setQuery((current) => ({ ...current, ...filters, page: 1 }))
          }}>
            <label>
              Search
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Debtor, lender, category, description" />
            </label>
            <label>
              Status
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="all">All</option>
                {(debtMeta?.statuses ?? []).map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
              </select>
            </label>
            <label>
              Type
              <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
                <option value="all">All</option>
                {(debtMeta?.debt_types ?? []).map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}
              </select>
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Apply filters</button>
              <button type="button" className="ghost-button" onClick={() => {
                const defaults = defaultFilters()
                setFilters(defaults)
                setQuery(defaults)
              }}>Reset</button>
            </div>
          </form>
        </article>

        <article className="panel debt-alert-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Overdue Debts</p>
              <h3>Urgent follow-up</h3>
            </div>
            <span className="panel-tag">{debtData?.overdue_debts?.length ?? 0} overdue</span>
          </div>
          <div className="debt-alert-stack">
            {(debtData?.overdue_debts ?? []).length ? debtData.overdue_debts.map((debt) => (
              <button key={`overdue-${debt.id}`} type="button" className="debt-alert-card overdue" onClick={() => loadDetail(debt.id, 'details')}>
                <div><strong>{debt.category}</strong><span>{debt.lender_name || debt.debtor_name}</span></div>
                <div className="debt-alert-copy"><strong>{currency.format(Number(debt.balance ?? 0))}</strong><span>Due {debt.due_date}</span></div>
              </button>
            )) : <p className="muted-copy">No overdue debts. Great job.</p>}
          </div>
        </article>

        <article className="panel debt-alert-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Upcoming Payments</p>
              <h3>Next 30 days</h3>
            </div>
            <span className="panel-tag">{debtData?.upcoming_payments?.length ?? 0} scheduled</span>
          </div>
          <div className="debt-alert-stack">
            {(debtData?.upcoming_payments ?? []).length ? debtData.upcoming_payments.map((debt) => (
              <button key={`upcoming-${debt.id}`} type="button" className="debt-alert-card upcoming" onClick={() => loadDetail(debt.id, 'payment')}>
                <div><strong>{debt.category}</strong><span>{debt.lender_name || debt.debtor_name}</span></div>
                <div className="debt-alert-copy"><strong>{currency.format(Number(debt.next_payment_amount ?? 0))}</strong><span>{debt.next_payment_date || 'Not scheduled'}</span></div>
              </button>
            )) : <p className="muted-copy">No upcoming payments in the next 30 days.</p>}
          </div>
        </article>

        <article className="panel debt-register-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">All Debts</p>
              <h3>Company debt ledger</h3>
              <p className="muted-copy panel-subcopy">
                Each servicing payment is stored in <code>debt_payments</code> and updates balances on the debt record. Use Record payment per row to log installments.
              </p>
            </div>
            <span className="panel-tag">{debtData?.pagination?.total ?? 0} debts</span>
          </div>
          <div className="table-shell">
            <table className="portal-table debt-register-table">
              <thead>
                <tr>
                  <th>Debtor / Category</th>
                  <th>Type</th>
                  <th>Lender</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Next Payment</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Debt servicing</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && !debtData ? (
                  <tr><td colSpan="11">Loading debt register...</td></tr>
                ) : (debtData?.debts ?? []).length ? (
                  debtData.debts.map((debt) => (
                    <tr key={debt.id}>
                      <td><div className="patient-table-primary"><strong>{debt.debtor_name}</strong><span>{debt.category}</span></div></td>
                      <td>{formatLabel(debt.debt_type)}</td>
                      <td>{debt.lender_name || debt.lender_contact || 'N/A'}</td>
                      <td>{currency.format(Number(debt.total_amount ?? 0))}</td>
                      <td>{currency.format(Number(debt.amount_paid ?? 0))}</td>
                      <td>{currency.format(Number(debt.balance ?? 0))}</td>
                      <td><div className="patient-table-primary"><strong>{currency.format(Number(debt.next_payment_amount ?? 0))}</strong><span>{debt.next_payment_date || 'Not scheduled'}</span></div></td>
                      <td>{debt.due_date}</td>
                      <td><span className={`status-pill status-${String(debt.status).toLowerCase().replaceAll('_', '-')}`}>{formatLabel(debt.status)}</span></td>
                      <td className="debt-servicing-cell">
                        <button
                          type="button"
                          className="primary-button debt-record-payment-btn"
                          disabled={!canRecordDebtPayment(debt)}
                          title={
                            debtServicingReadOnly
                              ? 'Switch from merged branches to a single branch to record payments.'
                              : !canRecordDebtPayment(debt)
                                ? 'No balance left to service, or debt is already marked paid.'
                                : 'Log a payment against this debt (saved to debt_payments).'
                          }
                          onClick={() => openRecordPaymentModal(debt)}
                        >
                          Record payment
                        </button>
                      </td>
                      <td>
                        <div className="billing-row-actions">
                          <button type="button" className="mini-action" onClick={() => loadDetail(debt.id, 'details')}>Details</button>
                          <button type="button" className="mini-action" onClick={() => {
                            setSelectedDebt(debt)
                            setDebtForm(debtFormFromRecord(debt))
                            setIsEditOpen(true)
                          }}>Edit</button>
                          <button type="button" className="mini-action" onClick={() => loadDetail(debt.id, 'restructure')}>Restructure</button>
                        </div>
                        <div className="billing-row-actions debt-status-actions">
                          {debt.status !== 'active' ? <button type="button" className="mini-action" onClick={() => updateDebtStatus(debt.id, 'active')}>Set active</button> : null}
                          {debt.status !== 'defaulted' ? <button type="button" className="mini-action" onClick={() => updateDebtStatus(debt.id, 'defaulted')}>Defaulted</button> : null}
                          {debt.status !== 'paid' ? <button type="button" className="mini-action" onClick={() => updateDebtStatus(debt.id, 'paid')}>Mark paid</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="11">No debts match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination pagination={debtData?.pagination} onPageChange={(page) => setQuery((current) => ({ ...current, page }))} />
        </article>

        <article className="panel debt-history-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent Payments</p>
              <h3>Latest debt servicing activity</h3>
            </div>
            <span className="panel-tag">{debtData?.recent_payments?.length ?? 0} entries</span>
          </div>
          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Debtor</th>
                  <th>Category</th>
                  <th>Lender</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {(debtData?.recent_payments ?? []).length ? debtData.recent_payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.payment_date}</td>
                    <td>{payment.debtor_name}</td>
                    <td>{payment.category}</td>
                    <td>{payment.lender_name || 'N/A'}</td>
                    <td>{formatLabel(payment.payment_method)}</td>
                    <td>{currency.format(Number(payment.amount ?? 0))}</td>
                    <td>{payment.reference_number || 'N/A'}</td>
                  </tr>
                )) : <tr><td colSpan="7">No debt payments recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {isCreateOpen ? (
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <article className="modal-panel debt-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div><p className="eyebrow">Add New Debt</p><h3>Create company debt record</h3></div>
              <button type="button" className="ghost-button" onClick={() => setIsCreateOpen(false)}>Close</button>
            </div>
            <form className="patient-form-grid debt-form-grid" onSubmit={saveDebt}>
              <label><span>Debtor name</span><input value={debtForm.debtor_name} onChange={(event) => setDebtForm((current) => ({ ...current, debtor_name: event.target.value }))} required /></label>
              <label><span>Debt type</span><select value={debtForm.debt_type} onChange={(event) => setDebtForm((current) => ({ ...current, debt_type: event.target.value }))}>{(debtMeta?.debt_types ?? []).map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}</select></label>
              <label><span>Category</span><input value={debtForm.category} onChange={(event) => setDebtForm((current) => ({ ...current, category: event.target.value }))} required /></label>
              <label><span>Lender name</span><input value={debtForm.lender_name} onChange={(event) => setDebtForm((current) => ({ ...current, lender_name: event.target.value }))} /></label>
              <label className="full-span"><span>Description</span><textarea rows="3" value={debtForm.description} onChange={(event) => setDebtForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label><span>Principal amount</span><input type="number" min="0" step="0.01" value={debtForm.principal_amount} onChange={(event) => setDebtForm((current) => ({ ...current, principal_amount: event.target.value }))} required /></label>
              <label><span>Interest rate (%)</span><input type="number" min="0" step="0.01" value={debtForm.interest_rate} onChange={(event) => setDebtForm((current) => ({ ...current, interest_rate: event.target.value }))} /></label>
              <label><span>Interest type</span><select value={debtForm.interest_type} onChange={(event) => setDebtForm((current) => ({ ...current, interest_type: event.target.value }))}>{(debtMeta?.interest_types ?? []).map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}</select></label>
              <label><span>Term (months)</span><input type="number" min="1" value={debtForm.term_months} onChange={(event) => setDebtForm((current) => ({ ...current, term_months: event.target.value }))} /></label>
              <label><span>Start date</span><input type="date" value={debtForm.start_date} onChange={(event) => setDebtForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
              <label><span>Due date</span><input type="date" value={debtForm.due_date} onChange={(event) => setDebtForm((current) => ({ ...current, due_date: event.target.value }))} required /></label>
              <label><span>Payment frequency</span><select value={debtForm.payment_frequency} onChange={(event) => setDebtForm((current) => ({ ...current, payment_frequency: event.target.value }))}>{(debtMeta?.payment_frequencies ?? []).map((frequency) => <option key={frequency} value={frequency}>{formatLabel(frequency)}</option>)}</select></label>
              <label><span>Lender contact</span><input value={debtForm.lender_contact} onChange={(event) => setDebtForm((current) => ({ ...current, lender_contact: event.target.value }))} /></label>
              <label><span>Lender phone</span><input value={debtForm.lender_phone} onChange={(event) => setDebtForm((current) => ({ ...current, lender_phone: event.target.value }))} /></label>
              <label><span>Lender email</span><input value={debtForm.lender_email} onChange={(event) => setDebtForm((current) => ({ ...current, lender_email: event.target.value }))} /></label>
              <label className="full-span"><span>Collateral</span><textarea rows="2" value={debtForm.collateral} onChange={(event) => setDebtForm((current) => ({ ...current, collateral: event.target.value }))} /></label>
              <label className="full-span"><span>Notes</span><textarea rows="3" value={debtForm.notes} onChange={(event) => setDebtForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <div className="filter-actions-row full-span"><button type="submit" className="primary-button" disabled={isSavingDebt}>{isSavingDebt ? 'Saving debt...' : 'Save debt'}</button></div>
            </form>
          </article>
        </div>
      ) : null}

      {isEditOpen ? (
        <div className="modal-overlay" onClick={() => setIsEditOpen(false)}>
          <article className="modal-panel debt-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div><p className="eyebrow">Edit Debt</p><h3>{selectedDebt?.category || 'Update debt record'}</h3></div>
              <button type="button" className="ghost-button" onClick={() => setIsEditOpen(false)}>Close</button>
            </div>
            <form className="patient-form-grid debt-form-grid" onSubmit={updateDebt}>
              <label><span>Debtor name</span><input value={debtForm.debtor_name} onChange={(event) => setDebtForm((current) => ({ ...current, debtor_name: event.target.value }))} required /></label>
              <label><span>Debt type</span><select value={debtForm.debt_type} onChange={(event) => setDebtForm((current) => ({ ...current, debt_type: event.target.value }))}>{(debtMeta?.debt_types ?? []).map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}</select></label>
              <label><span>Category</span><input value={debtForm.category} onChange={(event) => setDebtForm((current) => ({ ...current, category: event.target.value }))} required /></label>
              <label><span>Lender name</span><input value={debtForm.lender_name} onChange={(event) => setDebtForm((current) => ({ ...current, lender_name: event.target.value }))} /></label>
              <label className="full-span"><span>Description</span><textarea rows="3" value={debtForm.description} onChange={(event) => setDebtForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label><span>Principal amount</span><input type="number" min="0" step="0.01" value={debtForm.principal_amount} onChange={(event) => setDebtForm((current) => ({ ...current, principal_amount: event.target.value }))} required /></label>
              <label><span>Interest rate (%)</span><input type="number" min="0" step="0.01" value={debtForm.interest_rate} onChange={(event) => setDebtForm((current) => ({ ...current, interest_rate: event.target.value }))} /></label>
              <label><span>Interest type</span><select value={debtForm.interest_type} onChange={(event) => setDebtForm((current) => ({ ...current, interest_type: event.target.value }))}>{(debtMeta?.interest_types ?? []).map((type) => <option key={type} value={type}>{formatLabel(type)}</option>)}</select></label>
              <label><span>Term (months)</span><input type="number" min="1" value={debtForm.term_months} onChange={(event) => setDebtForm((current) => ({ ...current, term_months: event.target.value }))} /></label>
              <label><span>Start date</span><input type="date" value={debtForm.start_date} onChange={(event) => setDebtForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
              <label><span>Due date</span><input type="date" value={debtForm.due_date} onChange={(event) => setDebtForm((current) => ({ ...current, due_date: event.target.value }))} required /></label>
              <label><span>Payment frequency</span><select value={debtForm.payment_frequency} onChange={(event) => setDebtForm((current) => ({ ...current, payment_frequency: event.target.value }))}>{(debtMeta?.payment_frequencies ?? []).map((frequency) => <option key={frequency} value={frequency}>{formatLabel(frequency)}</option>)}</select></label>
              <label><span>Lender contact</span><input value={debtForm.lender_contact} onChange={(event) => setDebtForm((current) => ({ ...current, lender_contact: event.target.value }))} /></label>
              <label><span>Lender phone</span><input value={debtForm.lender_phone} onChange={(event) => setDebtForm((current) => ({ ...current, lender_phone: event.target.value }))} /></label>
              <label><span>Lender email</span><input value={debtForm.lender_email} onChange={(event) => setDebtForm((current) => ({ ...current, lender_email: event.target.value }))} /></label>
              <label className="full-span"><span>Collateral</span><textarea rows="2" value={debtForm.collateral} onChange={(event) => setDebtForm((current) => ({ ...current, collateral: event.target.value }))} /></label>
              <label className="full-span"><span>Notes</span><textarea rows="3" value={debtForm.notes} onChange={(event) => setDebtForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <div className="filter-actions-row full-span"><button type="submit" className="primary-button" disabled={isSavingDebt}>{isSavingDebt ? 'Updating debt...' : 'Update debt'}</button></div>
            </form>
          </article>
        </div>
      ) : null}

      {isPaymentOpen ? (
        <div className="modal-overlay" onClick={() => setIsPaymentOpen(false)}>
          <article className="modal-panel debt-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div><p className="eyebrow">Record Payment</p><h3>{selectedDebt?.category || 'Debt payment'}</h3></div>
              <button type="button" className="ghost-button" onClick={() => setIsPaymentOpen(false)}>Close</button>
            </div>
            {isLoadingDetail ? <p className="muted-copy">Loading debt details...</p> : null}
            <div className="payment-summary-hero">
              <div className="payment-summary-total"><span className="payment-summary-kicker">Current balance</span><strong>{currency.format(Number(selectedDebt?.balance ?? 0))}</strong><p>Lender: {selectedDebt?.lender_name || 'N/A'} | Monthly payment: {currency.format(Number(selectedDebt?.monthly_payment ?? 0))}</p></div>
              <div className="payment-summary-grid">
                <Metric label="Total Amount" value={selectedDebt?.total_amount} />
                <Metric label="Amount Paid" value={selectedDebt?.amount_paid} />
                <Metric label="Next Payment" value={selectedDebt?.next_payment_amount} />
                <Metric label="Payments Made" value={selectedDebt?.payment_count} raw />
              </div>
            </div>
            <form className="patient-form-grid" onSubmit={savePayment}>
              <label><span>Payment date</span><input type="date" value={paymentForm.payment_date} onChange={(event) => setPaymentForm((current) => ({ ...current, payment_date: event.target.value }))} required /></label>
              <label><span>Amount</span><input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} required /></label>
              <label><span>Payment method</span><select value={paymentForm.payment_method} onChange={(event) => setPaymentForm((current) => ({ ...current, payment_method: event.target.value }))}>{(debtMeta?.payment_methods ?? []).map((method) => <option key={method} value={method}>{formatLabel(method)}</option>)}</select></label>
              <label><span>Reference number</span><input value={paymentForm.reference_number} onChange={(event) => setPaymentForm((current) => ({ ...current, reference_number: event.target.value }))} /></label>
              <label className="full-span"><span>Notes</span><textarea rows="3" value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <div className="filter-actions-row full-span"><button type="submit" className="primary-button" disabled={isSavingPayment}>{isSavingPayment ? 'Recording...' : 'Record payment'}</button></div>
            </form>
          </article>
        </div>
      ) : null}

      {isRestructureOpen ? (
        <div className="modal-overlay" onClick={() => setIsRestructureOpen(false)}>
          <article className="modal-panel debt-modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div><p className="eyebrow">Restructure Debt</p><h3>{selectedDebt?.category || 'Debt restructure'}</h3></div>
              <button type="button" className="ghost-button" onClick={() => setIsRestructureOpen(false)}>Close</button>
            </div>
            <form className="patient-form-grid" onSubmit={saveRestructure}>
              <label><span>New term (months)</span><input type="number" min="1" value={restructureForm.new_term_months} onChange={(event) => setRestructureForm((current) => ({ ...current, new_term_months: event.target.value }))} required /></label>
              <label><span>New interest rate (%)</span><input type="number" min="0" step="0.01" value={restructureForm.new_interest_rate} onChange={(event) => setRestructureForm((current) => ({ ...current, new_interest_rate: event.target.value }))} /></label>
              <label className="full-span"><span>Restructuring notes</span><textarea rows="4" value={restructureForm.notes} onChange={(event) => setRestructureForm((current) => ({ ...current, notes: event.target.value }))} /></label>
              <div className="filter-actions-row full-span"><button type="submit" className="primary-button" disabled={isSavingRestructure}>{isSavingRestructure ? 'Updating...' : 'Restructure debt'}</button></div>
            </form>
          </article>
        </div>
      ) : null}

      {isDetailOpen ? (
        <div className="modal-overlay" onClick={() => setIsDetailOpen(false)}>
          <article className="modal-panel debt-modal-panel debt-details-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div><p className="eyebrow">Debt Details</p><h3>{selectedDebt?.category || 'Debt details'}</h3></div>
              <button type="button" className="ghost-button" onClick={() => setIsDetailOpen(false)}>Close</button>
            </div>
            {isLoadingDetail ? <p className="muted-copy">Loading debt details...</p> : null}
            <div className="debt-detail-grid">
              <div className="debt-detail-card">
                <h4>Debt information</h4>
                <DetailRow label="Debtor" value={selectedDebt?.debtor_name} />
                <DetailRow label="Type" value={formatLabel(selectedDebt?.debt_type)} />
                <DetailRow label="Category" value={selectedDebt?.category} />
                <DetailRow label="Status" value={formatLabel(selectedDebt?.status)} />
              </div>
              <div className="debt-detail-card">
                <h4>Financial details</h4>
                <DetailRow label="Principal" value={currency.format(Number(selectedDebt?.principal_amount ?? 0))} />
                <DetailRow label="Total amount" value={currency.format(Number(selectedDebt?.total_amount ?? 0))} />
                <DetailRow label="Amount paid" value={currency.format(Number(selectedDebt?.amount_paid ?? 0))} />
                <DetailRow label="Balance" value={currency.format(Number(selectedDebt?.balance ?? 0))} />
              </div>
              <div className="debt-detail-card">
                <h4>Lender and schedule</h4>
                <DetailRow label="Lender" value={selectedDebt?.lender_name || 'N/A'} />
                <DetailRow label="Start date" value={selectedDebt?.start_date} />
                <DetailRow label="Due date" value={selectedDebt?.due_date} />
                <DetailRow label="Next payment" value={selectedDebt?.next_payment_date || 'Not scheduled'} />
              </div>
              <div className="debt-detail-card full-span">
                <h4>Payment history</h4>
                <div className="table-shell">
                  <table className="portal-table">
                    <thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Reference</th><th>Notes</th></tr></thead>
                    <tbody>
                      {(detail?.payments ?? []).length ? detail.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{payment.payment_date}</td>
                          <td>{formatLabel(payment.payment_method)}</td>
                          <td>{currency.format(Number(payment.amount ?? 0))}</td>
                          <td>{payment.reference_number || 'N/A'}</td>
                          <td>{payment.notes || 'N/A'}</td>
                        </tr>
                      )) : <tr><td colSpan="5">No payments recorded yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  )
}

function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null
  return (
    <div className="pagination-bar">
      <span className="muted-copy">Page {pagination.page ?? 1} of {pagination.total_pages || 1}</span>
      <div className="pagination-actions">
        <button type="button" className="mini-action" disabled={(pagination.page ?? 1) <= 1} onClick={() => onPageChange(Math.max((pagination.page ?? 1) - 1, 1))}>Previous</button>
        <button type="button" className="mini-action" disabled={(pagination.page ?? 1) >= (pagination.total_pages || 1)} onClick={() => onPageChange(Math.min((pagination.page ?? 1) + 1, pagination.total_pages || 1))}>Next</button>
      </div>
    </div>
  )
}

function Metric({ label, value, raw = false }) {
  return <div className="summary-metric inline-metric-card"><span>{label}:</span><strong>{raw ? String(Number(value ?? 0)) : currency.format(Number(value ?? 0))}</strong></div>
}

function DetailRow({ label, value }) {
  return <div className="debt-detail-row"><span>{label}</span><strong>{value || 'N/A'}</strong></div>
}

function formatLabel(value) {
  return String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
