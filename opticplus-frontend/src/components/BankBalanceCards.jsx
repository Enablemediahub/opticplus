import { useCallback, useEffect, useState } from 'react'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const banks = [
  { name: 'Ecobank', logo: '/images/banks/ecobank.jpg' },
  { name: 'Prudential Bank', logo: '/images/banks/prudential-bank.png' },
  { name: 'GTBank', logo: '/images/banks/gt-bank.png' },
]

export default function BankBalanceCards({ apiFetch, token, branchId }) {
  const [accounts, setAccounts] = useState([])
  const [error, setError] = useState('')

  const loadAccounts = useCallback(async () => {
    if (!token) return
    try {
      const response = await apiFetch(`/bank-alerts?branch_id=${branchId}`, { token })
      setAccounts(response.accounts ?? [])
      setError('')
    } catch (loadError) {
      setError(loadError.message)
    }
  }, [apiFetch, branchId, token])

  useEffect(() => {
    const initialLoadId = window.setTimeout(loadAccounts, 0)

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') loadAccounts()
    }
    const intervalId = window.setInterval(refreshIfVisible, 30_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)

    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [loadAccounts])

  const visibleBanks = banks.map((bank) => ({
    ...bank,
    accounts: accounts.filter((account) => normalizeBankName(account.bank_name) === normalizeBankName(bank.name)),
  }))

  return (
    <section className="panel bank-balance-overview">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Bank Accounts</p>
          <h3>Latest bank-reported balances</h3>
          <p className="header-copy">These are per-account balances reported by SMS, not the branch bank-register total.</p>
        </div>
        <span className="panel-tag">Refreshes every 30 seconds</span>
      </div>
      {error ? <div className="message-banner error">{error}</div> : null}
      <div className="bank-account-grid">
        {visibleBanks.map((bank) => (
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
      </div>
    </section>
  )
}

function normalizeBankName(value) {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z]/g, '')
  return normalized === 'guarantytrustbank' ? 'gtbank' : normalized
}

function branchName(branchId) {
  return Number(branchId) === 2 ? 'Madina' : Number(branchId) === 1 ? 'Labadi' : 'All branches'
}

function formatDateTime(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
