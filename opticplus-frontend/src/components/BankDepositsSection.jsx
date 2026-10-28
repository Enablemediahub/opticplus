import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const defaultAccountForm = (branchId) => ({
  branch_id: branchId > 0 ? branchId : 1,
  bank_name: 'Prudential Bank',
  account_suffix: '',
  account_label: '',
})

const bankBrands = [
  { name: 'Ecobank', logo: '/images/banks/ecobank.jpg' },
  { name: 'Prudential Bank', logo: '/images/banks/prudential-bank.png' },
  { name: 'GTBank', logo: '/images/banks/gt-bank.png' },
]

function latestBankBalanceAccount(accounts) {
  return accounts
    .filter((account) => account.is_active && account.reported_balance != null && account.reported_balance_at)
    .sort((left, right) => Date.parse(right.reported_balance_at) - Date.parse(left.reported_balance_at))[0] ?? null
}

export default function BankDepositsSection({ apiFetch, apiBase, token, session, selectedBranchId }) {
  const branchId = session?.is_admin ? selectedBranchId : session?.branch_id
  const isGeneralManager = (session?.normalized_role ?? session?.role) === 'manager'
  const [data, setData] = useState(null)
  const [bankAlerts, setBankAlerts] = useState({ accounts: [], alerts: [], device: null, banks: [] })
  const [depositForm, setDepositForm] = useState(defaultDepositForm())
  const [balanceForm, setBalanceForm] = useState(defaultBalanceForm())
  const [accountForm, setAccountForm] = useState(() => defaultAccountForm(branchId))
  const [deviceToken, setDeviceToken] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
  const refreshInProgress = useRef(false)
  const [isSavingDeposit, setIsSavingDeposit] = useState(false)
  const [isSavingBalance, setIsSavingBalance] = useState(false)
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [isPairingDevice, setIsPairingDevice] = useState(false)

  const loadRegister = useCallback(async ({ silent = false } = {}) => {
    if (!token || !session || refreshInProgress.current) return

    refreshInProgress.current = true
    if (!silent) setIsLoading(true)
    setError('')

    try {
      const [response, alertResponse] = await Promise.all([
        apiFetch(`/payroll/bank-register?branch_id=${branchId}`, { token }),
        apiFetch(`/bank-alerts?branch_id=${branchId}`, { token }),
      ])
      setData(response)
      setBankAlerts(alertResponse)
      setLastRefreshedAt(new Date())
      setDepositForm((current) => ({
        ...current,
        payment_method: current.payment_method || response.payment_methods?.[0] || 'bank_transfer',
      }))
      if (!silent) {
        const latestBalanceAccount = latestBankBalanceAccount(alertResponse.accounts)
        setBalanceForm((current) => ({
          ...current,
          balance: String(Number(latestBalanceAccount?.reported_balance ?? response.current_balance ?? 0)),
        }))
      }
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      refreshInProgress.current = false
      if (!silent) setIsLoading(false)
    }
  }, [apiFetch, branchId, session, token])

  useEffect(() => {
    loadRegister()

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        loadRegister({ silent: true })
      }
    }
    const intervalId = window.setInterval(refreshIfVisible, 30_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [loadRegister])

  useEffect(() => {
    if (branchId > 0) {
      setAccountForm((current) => ({ ...current, branch_id: branchId }))
    }
  }, [branchId])

  const runningSummary = useMemo(() => ({
    current_balance: Number(data?.current_balance ?? 0),
    month_deposits: Number(data?.stats?.month_deposits ?? 0),
    month_withdrawals: Number(data?.stats?.month_withdrawals ?? 0),
    month_adjustments: Number(data?.stats?.month_adjustments ?? 0),
  }), [data])

  const latestReportedAccount = useMemo(() => latestBankBalanceAccount(bankAlerts.accounts), [bankAlerts.accounts])
  const currentDisplayedBalance = latestReportedAccount
    ? Number(latestReportedAccount.reported_balance)
    : runningSummary.current_balance

  const bankCards = useMemo(() => {
    const configuredBanks = [...new Set(bankAlerts.accounts.map((account) => bankBrandFor(account.bank_name)?.name).filter(Boolean))]
    const visibleBanks = Number(branchId) === 0
      ? bankBrands
      : bankBrands.filter((bank) => configuredBanks.includes(bank.name))

    return visibleBanks.map((bank) => ({
      ...bank,
      accounts: bankAlerts.accounts.filter((account) => bankBrandFor(account.bank_name)?.name === bank.name),
    }))
  }, [bankAlerts.accounts, branchId])

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

  async function saveAccount(event) {
    event.preventDefault()
    setIsSavingAccount(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch('/bank-alerts/accounts', {
        method: 'POST',
        token,
        body: accountForm,
      })
      setSuccess(response.message || 'Bank account added.')
      setAccountForm((current) => ({ ...current, account_suffix: '', account_label: '' }))
      await loadRegister()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingAccount(false)
    }
  }

  async function pairDevice() {
    setIsPairingDevice(true)
    setError('')
    setSuccess('')
    setDeviceToken('')

    try {
      const response = await apiFetch('/bank-alerts/devices', {
        method: 'POST',
        token,
        body: {
          label: 'Prudential Android phone',
          branch_id: branchId > 0 ? branchId : accountForm.branch_id,
        },
      })
      setDeviceToken(response.token)
      setSuccess(response.message || 'Android phone paired.')
      await loadRegister()
    } catch (pairError) {
      setError(pairError.message)
    } finally {
      setIsPairingDevice(false)
    }
  }

  async function reviewAlert(alertId, decision) {
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/bank-alerts/${alertId}/review`, {
        method: 'POST',
        token,
        body: { decision },
      })
      setSuccess(response.message || 'Bank alert review saved.')
      await loadRegister()
    } catch (reviewError) {
      setError(reviewError.message)
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

      <section className="stats-grid patient-stats-grid bank-balance-stats-grid">
        <StatWidget
          label="Current Bank Balance"
          value={currency.format(currentDisplayedBalance)}
          note={latestReportedAccount
            ? `Automatically using latest ${bankBrandFor(latestReportedAccount.bank_name)?.name ?? latestReportedAccount.bank_name} SMS •••• ${latestReportedAccount.account_suffix} · ${formatDateTime(latestReportedAccount.reported_balance_at)}`
            : `${data?.branch_name ?? 'Active branch'} bank-register balance · awaiting an SMS balance`}
          icon="finance"
          className="total"
        />
        <StatWidget
          label="Bank Register Balance"
          value={currency.format(runningSummary.current_balance)}
          note={`${data?.branch_name ?? 'Active branch'} ledger balance · manual adjustments and approved transactions`}
          icon="money"
          className="seen"
        />
        <StatWidget label="Deposits This Month" value={currency.format(runningSummary.month_deposits)} note="Positive cash-ins recorded in the current month" icon="money" className="seen" />
        <StatWidget label="Withdrawals This Month" value={currency.format(runningSummary.month_withdrawals)} note="Payroll and other branch withdrawals posted this month" icon="alert" className="pending" />
        <StatWidget label="Adjustments This Month" value={currency.format(runningSummary.month_adjustments)} note={`${Number(data?.stats?.activity_count ?? 0)} bank activity rows in the register`} icon="trend" className="today" />
      </section>
      <p className="muted-copy">
        Balances refresh automatically every 30 seconds while this page is open.
        Current Bank Balance follows the latest SMS-reported account balance; if no SMS balance is available, it falls back to the bank-register balance. SMS is from one account, not a total across accounts. Manual balance entry remains available and updates the bank register.
        {lastRefreshedAt ? ` Last refreshed ${lastRefreshedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}.` : ''}
      </p>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Connected Bank Accounts</p>
            <h3>Branches, bank balances, and SMS alerts</h3>
            <p className="header-copy">SMS balances are reported by the bank. They remain separate from the branch ledger until a manager approves a transaction.</p>
          </div>
          <span className="panel-tag">{Number(branchId) === 0 ? 'All 3 banks' : `${bankCards.length} banks`}</span>
        </div>
        <div className="bank-account-grid">
          {bankCards.map((bank) => (
            <article className="panel bank-account-card" key={bank.name}>
              <div className="bank-card-heading">
                <div className="bank-card-title">
                  <p className="eyebrow">{Number(branchId) === 0 ? 'Merged branches' : branchName(branchId)}</p>
                  <h3>{bank.name}</h3>
                </div>
                <div className="bank-account-brand">
                  <img src={bank.logo} alt={`${bank.name} logo`} />
                </div>
              </div>
              {bank.accounts.length ? bank.accounts.map((account) => (
                <div className="bank-account-detail" key={account.id}>
                  <p className="eyebrow">{branchName(account.branch_id)}</p>
                  <p className="muted-copy">{account.account_label || 'Account'} •••• {account.account_suffix}</p>
                  <strong className="bank-account-balance">
                    {account.reported_balance == null ? 'Awaiting bank SMS' : currency.format(Number(account.reported_balance))}
                  </strong>
                  <p className="muted-copy">
                    {account.reported_balance_at
                      ? `Last SMS balance: ${formatDateTime(account.reported_balance_at)}`
                      : 'Available balance will appear after a matching bank alert.'}
                  </p>
                </div>
              )) : (
                <p className="muted-copy bank-account-empty">No account is configured for this bank yet.</p>
              )}
            </article>
          ))}
          {!bankCards.length ? (
            <p className="muted-copy">No bank accounts are configured for this branch yet.</p>
          ) : null}
        </div>

        {isGeneralManager ? (
          <form className="bank-register-form-grid" onSubmit={saveAccount}>
            <label>
              Branch
              <select
                value={accountForm.branch_id}
                onChange={(event) => setAccountForm((current) => ({ ...current, branch_id: Number(event.target.value) }))}
              >
                <option value={1}>Labadi</option>
                <option value={2}>Madina</option>
              </select>
            </label>
            <label>
              Bank
              <select
                value={accountForm.bank_name}
                onChange={(event) => setAccountForm((current) => ({ ...current, bank_name: event.target.value }))}
              >
                {bankAlerts.banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
              </select>
            </label>
            <label>
              Account last four digits
              <input
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                required
                value={accountForm.account_suffix}
                onChange={(event) => setAccountForm((current) => ({ ...current, account_suffix: event.target.value.replace(/\D/g, '').slice(0, 4) }))}
                placeholder="0017"
              />
            </label>
            <label>
              Account label (optional)
              <input
                value={accountForm.account_label}
                maxLength={80}
                onChange={(event) => setAccountForm((current) => ({ ...current, account_label: event.target.value }))}
                placeholder="Main operating account"
              />
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button" disabled={isSavingAccount}>
                {isSavingAccount ? 'Saving...' : 'Add Bank Account'}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {isGeneralManager ? <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Android SMS Connection</p>
            <h3>{bankAlerts.device ? `${branchName(bankAlerts.device.branch_id)} phone connection is paired` : 'Connect the Prudential Android phone'}</h3>
            <p className="header-copy">
              {bankAlerts.device
                ? `${bankAlerts.device.label} • token ending ${bankAlerts.device.token_hint}${bankAlerts.device.last_used_at ? ` • last synced ${formatDateTime(bankAlerts.device.last_used_at)}` : ' • waiting for first sync'}`
                : 'The app will upload parsed Prudential alerts over HTTPS. The original SMS is not sent.'}
            </p>
          </div>
          {isGeneralManager ? (
            <button type="button" className="ghost-button" disabled={isPairingDevice} onClick={pairDevice}>
              {isPairingDevice ? 'Pairing...' : bankAlerts.device ? 'Create New Pairing Token' : 'Create Pairing Token'}
            </button>
          ) : null}
        </div>
        {deviceToken ? (
          <div className="message-banner warning">
            <strong>Copy this token into the phone now. It is shown only once.</strong>
            <input aria-label="One-time Android pairing token" readOnly value={deviceToken} onFocus={(event) => event.target.select()} />
            <p>Use API URL <code>{apiBase}</code>. Only enter this URL if it uses HTTPS. Creating a new token revokes the previous device token.</p>
          </div>
        ) : null}
        <p className="muted-copy">
          {apiBase?.startsWith('https://')
            ? `Phone API URL: ${apiBase}`
            : 'Configure a public HTTPS API URL before pairing the Android phone. Localhost URLs are not reachable from the phone.'}
        </p>
      </section> : null}

      {isGeneralManager ? <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">SMS Review Queue</p>
            <h3>Prudential alerts awaiting approval</h3>
            <p className="header-copy">Approving posts the signed amount to the branch ledger. Rejecting leaves the ledger unchanged.</p>
          </div>
          <span className="panel-tag">{bankAlerts.alerts.filter((alert) => alert.status === 'pending').length} pending</span>
        </div>
        <div className="table-shell">
          <table className="portal-table">
            <thead>
              <tr><th>Received</th><th>Branch / account</th><th>Type</th><th>Amount</th><th>Available balance</th><th>Reference</th><th>Status</th>{isGeneralManager ? <th>Review</th> : null}</tr>
            </thead>
            <tbody>
              {bankAlerts.alerts.length ? bankAlerts.alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{formatDateTime(alert.received_at)}</td>
                  <td>{alert.bank_name ? `${branchName(alert.branch_id)} • ${alert.bank_name} •••• ${alert.account_suffix}` : `Unmatched account •••• ${alert.account_suffix}`}</td>
                  <td>{titleize(alert.direction)}</td>
                  <td>{currency.format(Number(alert.amount) * (alert.direction === 'debited' ? -1 : 1))}</td>
                  <td>{currency.format(Number(alert.available_balance))}</td>
                  <td>{alert.transaction_reference}</td>
                  <td><span className={`bank-ledger-badge ${alert.status}`}>{titleize(alert.status)}</span></td>
                  {isGeneralManager ? (
                    <td>
                      {alert.status === 'pending' ? (
                        <div className="filter-actions-row">
                          <button type="button" className="primary-button" onClick={() => reviewAlert(alert.id, 'approve')}>Approve</button>
                          <button type="button" className="ghost-button" onClick={() => reviewAlert(alert.id, 'reject')}>Reject</button>
                        </div>
                      ) : 'Configure the matching bank account first'}
                    </td>
                  ) : null}
                </tr>
              )) : (
                <tr><td colSpan={isGeneralManager ? 8 : 7}>No Prudential alerts are waiting for review.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section> : null}

      <section className="bank-register-layout">
        {isGeneralManager ? <article className="panel">
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
        </article> : null}

        {isGeneralManager ? <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Balance Control</p>
              <h3>Set the exact bank balance when needed</h3>
            </div>
          </div>

          <form className="bank-register-form-grid" onSubmit={saveBalance}>
            <label>
              Current bank-register balance
              <input type="text" value={currency.format(runningSummary.current_balance)} readOnly />
            </label>
            <label>
              Manual balance entry
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
        </article> : null}
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

function bankBrandFor(bankName) {
  const normalized = String(bankName ?? '').toLowerCase().replace(/[^a-z]/g, '')
  return bankBrands.find((bank) => {
    const bankKey = bank.name.toLowerCase().replace(/[^a-z]/g, '')
    return normalized === bankKey || (bank.name === 'GTBank' && normalized === 'gtbank')
  }) ?? null
}

function branchName(branchId) {
  return Number(branchId) === 2 ? 'Madina' : Number(branchId) === 1 ? 'Labadi' : 'All branches'
}

function formatDateTime(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
