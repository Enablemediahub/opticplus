import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const defaultDepositForm = () => ({
  amount: '',
  date: todayIso(),
  description: '',
  payment_method: 'bank_transfer',
})

const defaultBalanceForm = () => ({
  balance: '',
  reason: '',
})

export default function BankDepositsSection({ apiFetch, token, session, selectedBranchId }) {
  const branchId = session?.is_admin ? selectedBranchId : session?.branch_id
  const [data, setData] = useState(null)
  const [depositForm, setDepositForm] = useState(defaultDepositForm())
  const [balanceForm, setBalanceForm] = useState(defaultBalanceForm())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingDeposit, setIsSavingDeposit] = useState(false)
  const [isSavingBalance, setIsSavingBalance] = useState(false)

  async function loadRegister() {
    if (!token || !session) return

    setIsLoading(true)
    setError('')

    try {
      const response = await apiFetch(`/payroll/bank-register?branch_id=${branchId}`, { token })
      setData(response)
      setDepositForm((current) => ({
        ...current,
        payment_method: current.payment_method || response.payment_methods?.[0] || 'bank_transfer',
      }))
      setBalanceForm((current) => ({
        ...current,
        balance: String(Number(response.current_balance ?? 0)),
      }))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRegister()
  }, [apiFetch, branchId, session, token])

  const runningSummary = useMemo(() => ({
    current_balance: Number(data?.current_balance ?? 0),
    month_deposits: Number(data?.stats?.month_deposits ?? 0),
    month_withdrawals: Number(data?.stats?.month_withdrawals ?? 0),
    month_adjustments: Number(data?.stats?.month_adjustments ?? 0),
  }), [data])

  async function saveDeposit(event) {
    event.preventDefault()
    setIsSavingDeposit(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/payroll/bank-register/deposits?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: {
          amount: Number(depositForm.amount || 0),
          date: depositForm.date,
          description: depositForm.description,
          payment_method: depositForm.payment_method,
        },
      })

      setSuccess(response.message || 'Bank deposit recorded successfully.')
      setDepositForm(defaultDepositForm())
      await loadRegister()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingDeposit(false)
    }
  }

  async function saveBalance(event) {
    event.preventDefault()
    setIsSavingBalance(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/payroll/bank-register/balance?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: {
          balance: Number(balanceForm.balance || 0),
          reason: balanceForm.reason,
        },
      })

      setSuccess(response.message || 'Bank balance updated successfully.')
      setBalanceForm((current) => ({ ...current, reason: '' }))
      await loadRegister()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingBalance(false)
    }
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Bank Deposits</p>
          <h3>Record deposits, review bank activity, and keep the balance current</h3>
          <p className="header-copy">Built on the same payroll bank ledger so accountant and general manager records stay aligned with payroll withdrawals and manual balance updates.</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Current Bank Balance" value={currency.format(runningSummary.current_balance)} note={data?.branch_name ?? 'Active branch'} icon="finance" className="total" />
        <StatWidget label="Deposits This Month" value={currency.format(runningSummary.month_deposits)} note="Positive cash-ins recorded in the current month" icon="money" className="seen" />
        <StatWidget label="Withdrawals This Month" value={currency.format(runningSummary.month_withdrawals)} note="Payroll and other branch withdrawals posted this month" icon="alert" className="pending" />
        <StatWidget label="Adjustments This Month" value={currency.format(runningSummary.month_adjustments)} note={`${Number(data?.stats?.activity_count ?? 0)} bank activity rows in the register`} icon="trend" className="today" />
      </section>

      <section className="bank-register-layout">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Record Deposit</p>
              <h3>Post money deposited into the bank</h3>
            </div>
          </div>

          <form className="bank-register-form-grid" onSubmit={saveDeposit}>
            <label>
              Deposit amount
              <input type="number" min="0" step="0.01" value={depositForm.amount} onChange={(event) => setDepositForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" />
            </label>
            <label>
              Deposit date
              <input type="date" value={depositForm.date} onChange={(event) => setDepositForm((current) => ({ ...current, date: event.target.value }))} />
            </label>
            <label>
              Payment method
              <select value={depositForm.payment_method} onChange={(event) => setDepositForm((current) => ({ ...current, payment_method: event.target.value }))}>
                {(data?.payment_methods ?? []).map((method) => (
                  <option key={method} value={method}>{titleize(method)}</option>
                ))}
              </select>
            </label>
            <label className="full-span">
              Description
              <input value={depositForm.description} onChange={(event) => setDepositForm((current) => ({ ...current, description: event.target.value }))} placeholder="For example: Cash sales lodged to bank" />
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button" disabled={isSavingDeposit}>
                {isSavingDeposit ? 'Saving...' : 'Record Deposit'}
              </button>
            </div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Balance Control</p>
              <h3>Set the exact bank balance when needed</h3>
            </div>
          </div>

          <form className="bank-register-form-grid" onSubmit={saveBalance}>
            <label>
              Current saved balance
              <input type="text" value={currency.format(runningSummary.current_balance)} readOnly />
            </label>
            <label>
              New balance amount
              <input type="number" min="0" step="0.01" value={balanceForm.balance} onChange={(event) => setBalanceForm((current) => ({ ...current, balance: event.target.value }))} placeholder="0.00" />
            </label>
            <label className="full-span">
              Adjustment reason
              <textarea rows="4" value={balanceForm.reason} onChange={(event) => setBalanceForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Explain why the bank balance is being corrected or updated" />
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="ghost-button" disabled={isSavingBalance}>
                {isSavingBalance ? 'Updating...' : 'Update Bank Balance'}
              </button>
            </div>
          </form>
        </article>
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Bank Activity</p>
            <h3>Recent deposit, withdrawal, and adjustment records</h3>
          </div>
          <span className="panel-tag">{Number(data?.stats?.activity_count ?? 0)} rows</span>
        </div>

        <div className="table-shell">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Payment Method</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="5">Loading bank register...</td></tr>
              ) : (data?.activities ?? []).length ? (
                data.activities.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.created_at || row.date)}</td>
                    <td>
                      <span className={`bank-ledger-badge ${row.type}`}>{titleize(row.type)}</span>
                    </td>
                    <td>{currency.format(Number(row.amount ?? 0))}</td>
                    <td>{titleize(row.payment_method)}</td>
                    <td>{row.description || 'No description'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5">No bank activity has been recorded for this branch yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

function titleize(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatDateTime(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
