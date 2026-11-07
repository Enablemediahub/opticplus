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
  { name: 'MTN MoMo', logo: '/images/banks/mtn-momo.jpeg' },
]

const executiveBranches = [
  {
    id: 1,
    name: 'Labadi',
    banks: [banks[0], banks[3], banks[2]],
  },
  {
    id: 2,
    name: 'Madina',
    banks: [banks[1], banks[3], banks[2]],
  },
]

export default function BankBalanceCards({
  apiFetch,
  token,
  branchId,
  endpoint = '/bank-alerts',
  executiveBranchLayout = false,
}) {
  const [accounts, setAccounts] = useState([])
  const [error, setError] = useState('')

  const loadAccounts = useCallback(async () => {
    if (!token) return
    try {
      const response = await apiFetch(`${endpoint}?branch_id=${branchId}`, { token })
      setAccounts(response.accounts ?? [])
      setError('')
    } catch (loadError) {
      setError(loadError.message)
    }
  }, [apiFetch, branchId, endpoint, token])

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
  const selectedExecutiveBranch = Number(branchId)
  const visibleExecutiveBranches = selectedExecutiveBranch === 0
    ? executiveBranches
    : executiveBranches.filter((branch) => branch.id === selectedExecutiveBranch)

  if (executiveBranchLayout) {
    return (
      <section className="panel bank-balance-overview">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Bank &amp; MoMo Accounts</p>
            <h3>{selectedExecutiveBranch === 0 ? 'Latest balances by branch' : `Latest ${branchName(selectedExecutiveBranch)} balances`}</h3>
            <p className="header-copy">Balances come from the latest matching SMS received for each configured account.</p>
          </div>
          <span className="panel-tag">Refreshes every 30 seconds</span>
        </div>
        {error ? <div className="message-banner error">{error}</div> : null}
        <div className="bank-account-branch-groups">
          {visibleExecutiveBranches.map((branch) => (
            <section className="bank-account-branch-group" key={branch.id} aria-labelledby={`bank-branch-${branch.id}`}>
              <div className="bank-account-branch-heading">
                <p className="eyebrow">Branch</p>
                <h4 id={`bank-branch-${branch.id}`}>{branch.name}</h4>
              </div>
              <div className="bank-account-grid">
                {branch.banks.map((bank) => {
                  const bankAccounts = accountsForExecutiveBranch(accounts, branch.id, bank.name)
                  return (
                    <BankCard
                      key={bank.name}
                      bank={bank}
                      accounts={bankAccounts}
                      branchName={branch.name}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    )
  }

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
          <BankCard
            key={bank.name}
            bank={bank}
            accounts={bank.accounts}
            branchName={Number(branchId) === 0 ? 'All branches' : branchName(branchId)}
            showAccountBranch
          />
        ))}
      </div>
    </section>
  )
}

function BankCard({ bank, accounts: bankAccounts, branchName: cardBranchName, showAccountBranch = false }) {
  return (
    <article className="panel bank-account-card">
      <div className="bank-card-heading">
        <div className="bank-card-title">
          <p className="eyebrow">{cardBranchName}</p>
          <h3>{bank.name}</h3>
        </div>
        <div className="bank-account-brand">
          <img src={bank.logo} alt={`${bank.name} logo`} />
        </div>
      </div>
      {bankAccounts.length ? bankAccounts.map((account) => (
        <div className="bank-account-detail" key={`${account.id}-${account.branch_id}`}>
          {account.isSharedBalance ? <p className="eyebrow">Shared account · configured under {branchName(account.branch_id)}</p> : null}
          {showAccountBranch ? <p className="eyebrow">{branchName(account.branch_id)}</p> : null}
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
        <p className="muted-copy bank-account-empty">
          {bank.name === 'MTN MoMo' && cardBranchName === 'Labadi'
            ? 'Labadi’s MoMo account has not been configured yet.'
            : 'No account is configured for this branch yet.'}
        </p>
      )}
    </article>
  )
}

function accountsForExecutiveBranch(accounts, branchId, bankName) {
  const bankAccounts = accounts.filter((account) => (
    normalizeBankName(account.bank_name) === normalizeBankName(bankName)
  ))
  const branchAccounts = bankAccounts.filter((account) => Number(account.branch_id) === branchId)
  if (branchAccounts.length || normalizeBankName(bankName) !== 'gtbank') return branchAccounts

  return bankAccounts.map((account) => ({ ...account, isSharedBalance: true }))
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
