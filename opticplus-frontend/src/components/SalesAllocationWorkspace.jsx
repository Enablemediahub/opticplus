import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const dateIso = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const defaultPeriod = () => ({
  date_from: dateIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  date_to: dateIso(new Date()),
})

const emptyItem = () => ({
  name: '',
  allocation_percent: '',
  target_amount: '',
  target_start_date: '',
  target_date: '',
  treatment: 'savings',
})

const monthlyContributions = (entries = [], schedule = []) => {
  const months = new Map()
  const getMonthDay = (date) => {
    const month = String(date).slice(0, 7)
    const current = months.get(month) ?? {
      amount: 0,
      days: new Map(),
      required: 0,
      available: 0,
      lensReserve: 0,
      frameReserve: 0,
      unpricedLensSales: 0,
      unpricedFrameSales: 0,
      costsAvailable: true,
      unrecordedDays: 0,
    }
    const day = current.days.get(date) ?? { date, amount: 0 }
    current.days.set(date, day)
    months.set(month, current)
    return { current, day }
  }
  entries.forEach((entry) => {
    const { current, day } = getMonthDay(entry.date)
    day.amount += Number(entry.amount ?? 0)
    current.amount += Number(entry.amount ?? 0)
  })
  schedule.forEach((entry) => {
    const { current, day } = getMonthDay(entry.date)
    Object.assign(day, entry)
    current.required += Number(entry.required_rent_savings ?? 0)
    current.available += Number(entry.available_for_allocations ?? 0)
    current.lensReserve += Number(entry.lens_cost_to_set_aside ?? 0)
    current.frameReserve += Number(entry.frame_cost_to_set_aside ?? 0)
    current.unpricedLensSales += Number(entry.unpriced_lens_sales ?? 0)
    current.unpricedFrameSales += Number(entry.unpriced_frame_sales ?? 0)
    current.unrecordedDays += entry.sales_recorded ? 0 : 1
    current.costsAvailable = current.costsAvailable && entry.cost_tracking_available
  })
  return [...months.entries()].map(([month, data]) => ({
    month,
    ...data,
    days: [...data.days.values()].sort((left, right) => left.date.localeCompare(right.date)),
  }))
}

const formatMonth = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GH', {
  month: 'long',
  year: 'numeric',
})

const formatDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export default function SalesAllocationWorkspace({ apiFetch, token, branchId, branchName, isMerged }) {
  const [period, setPeriod] = useState(defaultPeriod)
  const [appliedPeriod, setAppliedPeriod] = useState(defaultPeriod)
  const [allocationData, setAllocationData] = useState(null)
  const [form, setForm] = useState(emptyItem)
  const [editingId, setEditingId] = useState(null)
  const [editingPercent, setEditingPercent] = useState(0)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savingDayKey, setSavingDayKey] = useState('')
  const [savingDrafts, setSavingDrafts] = useState({})
  const [isRemoving, setIsRemoving] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const params = useMemo(() => new URLSearchParams({
    branch_id: String(branchId),
    date_from: appliedPeriod.date_from,
    date_to: appliedPeriod.date_to,
  }), [appliedPeriod, branchId])

  useEffect(() => {
    if (isMerged || !token) return undefined
    let cancelled = false

    async function loadAllocationData() {
      setIsLoading(true)
      setError('')
      try {
        const response = await apiFetch(`/debts/sales-allocations?${params.toString()}`, { token })
        if (!cancelled) setAllocationData(response)
      } catch (loadError) {
        if (!cancelled) {
          setAllocationData(null)
          setError(loadError.message)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadAllocationData()
    return () => {
      cancelled = true
    }
  }, [apiFetch, isMerged, params, refreshKey, token])

  const remainingPercent = Math.max(100 - Number(allocationData?.summary?.total_percent ?? 0), 0)
  const summary = allocationData?.summary
  const today = dateIso(new Date())
  const weekStartDate = new Date()
  weekStartDate.setDate(weekStartDate.getDate() - ((weekStartDate.getDay() + 6) % 7))
  const weekStart = dateIso(weekStartDate)
  const currentMonth = today.slice(0, 7)
  const savingsTargets = (allocationData?.items ?? [])
    .filter((item) => item.treatment === 'savings' && item.target_amount != null)
    .map((item) => ({
      ...item,
      monthlyContributions: monthlyContributions(item.daily_contributions, item.daily_savings_schedule),
    }))

  function openCreateForm() {
    setEditingId(null)
    setEditingPercent(0)
    setForm(emptyItem())
    setError('')
    setIsFormOpen(true)
  }

  function openEditForm(item) {
    setEditingId(item.id)
    setEditingPercent(Number(item.allocation_percent))
    setForm({
      name: item.name,
      allocation_percent: String(item.allocation_percent),
      target_amount: item.target_amount == null ? '' : String(item.target_amount),
      target_start_date: item.target_start_date ?? '',
      target_date: item.target_date ?? '',
      treatment: item.treatment,
    })
    setError('')
    setIsFormOpen(true)
  }

  async function saveAllocation(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      await apiFetch(`/debts/sales-allocations${editingId ? `/${editingId}` : ''}?branch_id=${branchId}`, {
        method: editingId ? 'PUT' : 'POST',
        token,
        body: {
          ...form,
          allocation_percent: Number(form.allocation_percent),
          target_amount: form.target_amount === '' ? null : Number(form.target_amount),
          target_start_date: form.target_start_date || null,
          target_date: form.target_date || null,
        },
      })
      setIsFormOpen(false)
      setSuccess(editingId ? 'Allocation updated.' : 'Allocation added.')
      setRefreshKey((current) => current + 1)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function removeAllocation(item) {
    if (!window.confirm(`Remove "${item.name}" from this allocation plan?`)) return
    setIsRemoving(item.id)
    setError('')
    setSuccess('')
    try {
      await apiFetch(`/debts/sales-allocations/${item.id}?branch_id=${branchId}`, {
        method: 'DELETE',
        token,
      })
      setSuccess(`${item.name} removed from the allocation plan.`)
      setRefreshKey((current) => current + 1)
    } catch (removeError) {
      setError(removeError.message)
    } finally {
      setIsRemoving(null)
    }
  }

  function applyPeriod(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setAppliedPeriod({ ...period })
  }

  async function recordDailySaving(event, item, targetDay) {
    event.preventDefault()
    const key = `${item.id}-${targetDay.date}`
    const draft = savingDrafts[key] ?? {}
    const amount = Number(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero to record these savings.')
      return
    }

    setSavingDayKey(key)
    setError('')
    setSuccess('')
    try {
      const response = await apiFetch(`/debts/sales-allocations/${item.id}/savings?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: {
          target_date: targetDay.date,
          set_aside_date: draft.set_aside_date || today,
          amount,
        },
      })
      setSuccess(`${currency.format(amount)} recorded as a ${item.name} expense${response.expense_id ? ` (#${response.expense_id})` : ''}.`)
      setSavingDrafts((current) => ({ ...current, [key]: { ...current[key], amount: '' } }))
      setRefreshKey((current) => current + 1)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSavingDayKey('')
    }
  }

  if (isMerged) {
    return (
      <article className="panel allocation-empty-state">
        <p className="eyebrow">Choose a branch</p>
        <h3>Allocation plans are branch-specific</h3>
        <p>Select Madina or Labadi in the branch selector to review or edit its sales allocation plan.</p>
      </article>
    )
  }

  return (
    <div className="sales-allocation-workspace">
      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <article className="panel allocation-intro-panel">
        <div>
          <p className="eyebrow">Cash planning · {branchName}</p>
          <h3>Plan what collected money should do</h3>
          <p>
            Set a daily target for each savings goal and review what has actually been recorded by day and month.
            The sales percentage is a separate estimate; it does not move money or change actual balances.
          </p>
        </div>
        <form className="allocation-period-form" onSubmit={applyPeriod}>
          <label>
            From
            <input type="date" value={period.date_from} max={period.date_to} onChange={(event) => setPeriod((current) => ({ ...current, date_from: event.target.value }))} required />
          </label>
          <label>
            To
            <input type="date" value={period.date_to} min={period.date_from} onChange={(event) => setPeriod((current) => ({ ...current, date_to: event.target.value }))} required />
          </label>
          <button type="submit" className="primary-button">Update period</button>
        </form>
      </article>

      <div className="allocation-collection-note">
        <strong>Sales period estimate</strong>
        <span>Uses non-insurance collections less lens/frame costs and recorded Other expenses. Sales without a product cost are held out until tracked.</span>
        <span>{allocationData?.filters?.date_from ?? appliedPeriod.date_from} to {allocationData?.filters?.date_to ?? appliedPeriod.date_to}</span>
      </div>

      {summary && !summary.product_cost_tracking_available ? (
        <div className="allocation-refund-note">
          Lens/frame cost tracking is unavailable, so the system cannot calculate rent-available sales. Complete the required cost tracking setup before using these figures.
        </div>
      ) : null}

      {Number(summary?.existing_set_aside_amount ?? 0) > 0 ? (
        <div className="allocation-existing-savings">
          <div className="allocation-existing-savings__icon" aria-hidden="true">✓</div>
          <div>
            <strong>{currency.format(Number(summary.existing_set_aside_amount))} already recorded toward savings</strong>
            <span>Matched from branch expenses whose category matches an active savings item. These amounts are counted toward the target, not deducted again from this period's bank transfer.</span>
          </div>
        </div>
      ) : null}

      <section className="stats-grid patient-stats-grid allocation-summary-grid">
        <StatWidget label="Non-insurance cash collected" value={currency.format(Number(summary?.net_collections ?? 0))} note="Selected period, after refunds" icon="money" className="total" />
        <StatWidget label="Lens costs to reserve" value={currency.format(Number(summary?.lens_costs_to_set_aside ?? 0))} note="Tracked lens costs for this period" icon="inventory" className="pending" />
        <StatWidget label="Frame costs to reserve" value={currency.format(Number(summary?.frame_costs_to_set_aside ?? 0))} note={`${currency.format(Number(summary?.unpriced_product_sales_held ?? 0))} untracked product sales held out`} icon="inventory" className="pending" />
        <StatWidget label="Recorded expenses" value={currency.format(Number(summary?.recorded_expenses ?? 0))} note="All recorded branch expenses for this period" icon="receipt" className="pending" />
        <StatWidget label="Available after costs and expenses" value={currency.format(Number(summary?.allocation_base ?? 0))} note="Basis for savings allocations and the bank estimate" icon="finance" className="today" />
        <StatWidget label="Planned percentage allocations" value={currency.format(Number(summary?.savings_amount ?? 0))} note="Planning estimate only; not actual savings" icon="finance" className="pending" />
        <StatWidget label="Remaining for bank" value={currency.format(Number(summary?.bank_transfer_amount ?? 0))} note="After product costs, Other expenses, and savings allocations" icon="finance" className="seen" />
        <StatWidget label="Percent allocated" value={`${Number(summary?.total_percent ?? 0).toFixed(2)}%`} note={`${remainingPercent.toFixed(2)}% remains unassigned`} icon="receipt" className="today" />
      </section>

      <section className="panel allocation-savings-tracker">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Actual savings tracker</p>
            <h3>Savings goals by Purpose</h3>
            <p>Each workday is Monday to Saturday (Sundays excluded). The available amount is non-insurance cash collected less known lens/frame costs and all recorded branch expenses; sales with missing costs are held out. Actual savings count only when recorded in Expenses under the matching category.</p>
          </div>
        </div>
        {savingsTargets.length ? (
          <div className="allocation-savings-goals">
            {savingsTargets.map((item) => {
              const savedByPeriod = (item.daily_contributions ?? []).reduce((totals, contribution) => {
                const date = String(contribution.date ?? '')
                const amount = Number(contribution.amount ?? 0)
                if (date === today) totals.today += amount
                if (date >= weekStart && date <= today) totals.week += amount
                if (date.startsWith(currentMonth)) totals.month += amount
                return totals
              }, { today: 0, week: 0, month: 0 })

              return (
              <details className="allocation-savings-goal" key={item.id}>
                <summary className="allocation-savings-goal__header">
                  <div>
                    <h4>{item.name}</h4>
                    <span>
                      Target {currency.format(Number(item.target_amount))} · save from {item.target_start_date ? formatDate(item.target_start_date) : 'today'}
                      {item.target_date ? ` · deadline ${formatDate(item.target_date)}` : ''}
                    </span>
                  </div>
                  <div className="allocation-savings-goal__saved">
                    <strong>{currency.format(Number(item.existing_set_aside_amount ?? 0))}</strong>
                    <span>recorded saved</span>
                    <small>{currency.format(Number(item.arrears_total ?? 0))} in daily arrears</small>
                  </div>
                  <div className="allocation-savings-goal__period-totals" aria-label={`${item.name} savings totals`}>
                    <div><small>Today</small><strong>{currency.format(savedByPeriod.today)}</strong></div>
                    <div><small>This week</small><strong>{currency.format(savedByPeriod.week)}</strong></div>
                    <div><small>This month</small><strong>{currency.format(savedByPeriod.month)}</strong></div>
                  </div>
                </summary>
                <div className="allocation-savings-goal__daily">
                  {Number(item.remaining_to_target ?? 0) <= 0 ? (
                    <strong>Target reached</strong>
                  ) : item.required_daily_savings != null ? (
                    <>
                      <strong>Put aside at least {currency.format(Number(item.required_daily_savings))} per day</strong>
                      <span>{currency.format(Number(item.remaining_to_target))} remaining across {item.working_days_remaining} working days (Sundays excluded)</span>
                    </>
                  ) : item.target_deadline_passed ? (
                    <strong>Target date has passed; {currency.format(Number(item.remaining_to_target))} remains.</strong>
                  ) : !item.target_date ? (
                    <strong>Add a target date to calculate the daily amount.</strong>
                  ) : (
                    <strong>No remaining working days before the deadline; {currency.format(Number(item.remaining_to_target))} remains.</strong>
                  )}
                </div>
                <div className="allocation-monthly-tracker">
                  <h5>Saved by month</h5>
                  {item.monthlyContributions.length ? item.monthlyContributions.map((month) => (
                    <details className="allocation-month" key={month.month}>
                      <summary>
                        <span>{formatMonth(month.month)}</span>
                        <strong>{currency.format(month.amount)} saved</strong>
                      </summary>
                      <div className="allocation-month__details">
                        {month.required > 0 ? (
                          <>
                            <div className="allocation-month__summary">
                              <span>{item.name} target for these working days: {currency.format(month.required)}</span>
                        <span>Available after costs and all recorded expenses on recorded days: {month.costsAvailable ? currency.format(month.available) : 'unavailable'}</span>
                              {month.unrecordedDays > 0 ? <span>{month.unrecordedDays} future working days not recorded yet</span> : null}
                            </div>
                            <div className="allocation-month__reserve-widgets">
                              <article className="allocation-reserve-widget allocation-reserve-widget--lens">
                                <span>Lens cost reserve</span>
                                <strong>{currency.format(month.lensReserve)}</strong>
                                <small>From recorded sales this month</small>
                                {month.unpricedLensSales > 0 ? (
                                  <small className="allocation-reserve-widget__warning">
                                    {currency.format(month.unpricedLensSales)} held out · {month.days.reduce((total, day) => total + Number(day.missing_lens_cost_count ?? 0), 0)} missing costs
                                  </small>
                                ) : null}
                              </article>
                              <article className="allocation-reserve-widget allocation-reserve-widget--frame">
                                <span>Frame cost reserve</span>
                                <strong>{currency.format(month.frameReserve)}</strong>
                                <small>From recorded sales this month</small>
                                {month.unpricedFrameSales > 0 ? (
                                  <small className="allocation-reserve-widget__warning">
                                    {currency.format(month.unpricedFrameSales)} held out · {month.days.reduce((total, day) => total + Number(day.missing_frame_cost_count ?? 0), 0)} missing costs
                                  </small>
                                ) : null}
                              </article>
                            </div>
                          </>
                        ) : null}
                        <div className="allocation-month__table-wrap">
                          <table className="allocation-month__table">
                            <thead>
                              <tr>
                                <th scope="col">Workday</th>
                                <th scope="col">Cash collected</th>
                                <th scope="col">Daily target</th>
                                <th scope="col">Lens reserve</th>
                                <th scope="col">Frame reserve</th>
                                <th scope="col">All expenses</th>
                                <th scope="col">After costs and expenses</th>
                                <th scope="col">Estimated bank deposit</th>
                                <th scope="col">Actually saved</th>
                                <th scope="col">Still due</th>
                                <th scope="col">Record savings</th>
                              </tr>
                            </thead>
                            <tbody>
                              {month.days.map((entry) => {
                                const dayKey = `${item.id}-${entry.date}`
                                const remaining = Number(entry.remaining_for_day ?? 0)
                                const canRecord = entry.required_rent_savings != null
                                  && remaining > 0
                                const savingDraft = savingDrafts[dayKey] ?? {}

                                return (
                                  <tr key={entry.date}>
                                    <th scope="row">
                                      <strong>{formatDate(entry.date)}</strong>
                                      {!entry.sales_recorded && entry.required_rent_savings != null ? <small>Sales not recorded</small> : null}
                                    </th>
                                    <td>{entry.sales_recorded ? currency.format(Number(entry.eligible_collections ?? 0)) : '—'}</td>
                                    <td>{entry.required_rent_savings == null ? '—' : currency.format(Number(entry.required_rent_savings))}</td>
                                    <td className="allocation-month__cost-cell allocation-month__cost-cell--lens">
                                      {entry.required_rent_savings == null ? '—' : currency.format(Number(entry.lens_cost_to_set_aside ?? 0))}
                                      {Number(entry.unpriced_lens_sales ?? 0) > 0 ? (
                                        <small>{currency.format(Number(entry.unpriced_lens_sales))} held · {Number(entry.missing_lens_cost_count ?? 0)} missing</small>
                                      ) : null}
                                    </td>
                                    <td className="allocation-month__cost-cell allocation-month__cost-cell--frame">
                                      {entry.required_rent_savings == null ? '—' : currency.format(Number(entry.frame_cost_to_set_aside ?? 0))}
                                      {Number(entry.unpriced_frame_sales ?? 0) > 0 ? (
                                        <small>{currency.format(Number(entry.unpriced_frame_sales))} held · {Number(entry.missing_frame_cost_count ?? 0)} missing</small>
                                      ) : null}
                                    </td>
                                    <td>{entry.sales_recorded ? currency.format(Number(entry.recorded_expenses ?? 0)) : '—'}</td>
                                    <td>
                                      {entry.available_for_allocations == null ? '—' : (
                                        <>
                                          <strong>{currency.format(Number(entry.available_for_allocations))}</strong>
                                          {entry.required_share_percent != null ? (
                                            <small className="allocation-month__table-note">
                                              Target uses {Number(entry.required_share_percent).toFixed(2)}%
                                            </small>
                                          ) : null}
                                          {Number(entry.shortfall_after_costs ?? 0) > 0 ? (
                                            <small className="allocation-month__table-warning">
                                              Short by {currency.format(Number(entry.shortfall_after_costs))}
                                            </small>
                                          ) : null}
                                        </>
                                      )}
                                    </td>
                                    <td>{entry.estimated_bank_deposit == null ? '—' : currency.format(Number(entry.estimated_bank_deposit))}</td>
                                    <td className="allocation-month__saved-cell">
                                      <strong>{currency.format(Number(entry.actual_rent_saved ?? entry.amount ?? 0))}</strong>
                                      {entry.saving_entries?.length ? (
                                        <small>
                                          {entry.saving_entries.map((savingEntry) => (
                                            <span key={savingEntry.expense_id}>
                                              {currency.format(Number(savingEntry.amount))} expense on {formatDate(savingEntry.set_aside_date)} (#{savingEntry.expense_id})
                                            </span>
                                          ))}
                                        </small>
                                      ) : null}
                                    </td>
                                    <td>
                                      {entry.required_rent_savings == null ? '—' : remaining > 0
                                        ? <strong className={entry.is_due ? 'allocation-day-arrears' : 'allocation-day-current'}>
                                            {entry.is_due ? 'Arrears: ' : ''}{currency.format(remaining)}
                                          </strong>
                                        : <strong className="allocation-day-current">Met</strong>}
                                    </td>
                                    <td>
                                      {canRecord ? (
                                        <form className="allocation-day-saving-form allocation-day-saving-form--table" onSubmit={(event) => recordDailySaving(event, item, entry)}>
                                            <label>
                                              Amount
                                              <input
                                                aria-label={`Savings amount for ${formatDate(entry.date)}`}
                                                type="number"
                                                min="0.01"
                                                max={remaining}
                                                step="0.01"
                                                value={savingDraft.amount ?? ''}
                                                onChange={(event) => setSavingDrafts((current) => ({
                                                  ...current,
                                                  [dayKey]: { ...current[dayKey], amount: event.target.value },
                                                }))}
                                                placeholder={`Up to ${remaining.toFixed(2)}`}
                                                required
                                              />
                                            </label>
                                            <label>
                                              Set-aside date
                                              <input
                                                aria-label={`Actual set-aside date for ${formatDate(entry.date)}`}
                                                type="date"
                                                max={today}
                                                value={savingDraft.set_aside_date ?? today}
                                                onChange={(event) => setSavingDrafts((current) => ({
                                                  ...current,
                                                  [dayKey]: { ...current[dayKey], set_aside_date: event.target.value },
                                                }))}
                                                required
                                              />
                                            </label>
                                            <button type="submit" className="mini-action" disabled={savingDayKey === dayKey}>
                                              {savingDayKey === dayKey ? 'Saving...' : 'Save'}
                                            </button>
                                        </form>
                                      ) : <span className="allocation-month__no-action">—</span>}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </details>
                  )) : (
                    <p className="muted-copy">No matching savings entries have been recorded yet.</p>
                  )}
                  <small>Monthly “saved” totals are actual expense entries; daily targets and post-cost sales are shown separately.</small>
                </div>
              </details>
              )
            })}
          </div>
        ) : (
          <p className="muted-copy">Add a savings item with a target amount to see its daily goal and monthly progress here.</p>
        )}
      </section>

      {Number(summary?.refund_reversals ?? 0) > 0 ? (
        <div className="allocation-refund-note">
          Recorded refund reversals of {currency.format(Number(summary.refund_reversals))} reduced the eligible collections in this period.
        </div>
      ) : null}

      <article className="panel allocation-plan-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Allocation plan</p>
            <h3>{allocationData?.items?.length ?? 0} active items · {Number(summary?.total_percent ?? 0).toFixed(2)}% of collections</h3>
          </div>
          <button type="button" className="primary-button" onClick={openCreateForm} disabled={isLoading}>
            Add allocation item
          </button>
        </div>

        <div className="allocation-bank-summary">
          <div>
            <span>Bank-bound allocations</span>
            <strong>{currency.format(Number(summary?.bank_allocated_amount ?? 0))}</strong>
            <small>Includes salary allocations that remain in the bank</small>
          </div>
          <div>
            <span>Unassigned bank amount</span>
            <strong>{currency.format(Number(summary?.unallocated_bank_amount ?? 0))}</strong>
            <small>After product costs, all recorded expenses, savings, and named bank allocations</small>
          </div>
        </div>

        <div className="table-shell">
          <table className="portal-table allocation-table">
            <thead>
              <tr>
                <th>Purpose</th>
                <th>Share</th>
                <th>Planned this period</th>
                <th>Destination</th>
                <th>Target progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6">Calculating allocation plan...</td></tr>
              ) : allocationData?.items?.length ? allocationData.items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{Number(item.allocation_percent).toFixed(2)}%</td>
                  <td>{currency.format(Number(item.period_allocation ?? 0))}</td>
                  <td><span className={`allocation-treatment allocation-treatment--${item.treatment}`}>{item.treatment === 'bank' ? 'Bank-bound' : 'Savings reserve'}</span></td>
                  <td>
                    {item.target_amount != null ? (
                      <div className="allocation-target">
                        <div className="allocation-target__labels">
                          <strong>{currency.format(Number(item.projected_total ?? 0))} recorded</strong>
                          <span>of {currency.format(Number(item.target_amount))}</span>
                        </div>
                        <div className="allocation-target__track">
                          <span style={{ width: `${Number(item.target_progress_percent ?? 0)}%` }} />
                        </div>
                        <small>
                          {currency.format(Number(item.remaining_to_target ?? 0))} still needed
                          {Number(item.period_allocation ?? 0) > 0 ? ` · ${currency.format(Number(item.period_allocation))} is the separate estimate for this period` : ''}
                        </small>
                      </div>
                    ) : <span className="muted-copy">No target</span>}
                  </td>
                  <td>
                    <div className="billing-row-actions">
                      <button type="button" className="mini-action" onClick={() => openEditForm(item)}>Edit</button>
                      <button type="button" className="mini-action" onClick={() => removeAllocation(item)} disabled={isRemoving === item.id}>
                        {isRemoving === item.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="6">No allocation items yet. Add rent, salary, supplier reserves, or any other purpose to start planning.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="allocation-footnote">
          Daily and monthly savings progress comes from recorded expenses. Planned amounts use the selected sales period and are not counted as saved until recorded.
        </p>
      </article>

      {isFormOpen ? (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <article className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="allocation-form-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{editingId ? 'Edit allocation' : 'New allocation'}</p>
                <h3 id="allocation-form-title">{editingId ? 'Update this purpose' : 'Add a purpose to the plan'}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setIsFormOpen(false)}>Close</button>
            </div>
            <form className="patient-form-grid" onSubmit={saveAllocation}>
              <label>
                Purpose
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={100} placeholder="e.g. Madina rent reserve" required />
              </label>
              <label>
                Share of eligible collections
                <div className="allocation-percent-input">
                  <input type="number" min="0" max={editingPercent + remainingPercent} step="0.01" value={form.allocation_percent} onChange={(event) => setForm((current) => ({ ...current, allocation_percent: event.target.value }))} required />
                  <span>%</span>
                </div>
                <small>{remainingPercent.toFixed(2)}% remains unassigned before this change.</small>
              </label>
              <label>
                Target amount (optional)
                <input type="number" min="0.01" step="0.01" value={form.target_amount} onChange={(event) => setForm((current) => ({ ...current, target_amount: event.target.value }))} placeholder="e.g. 60000.00" />
              </label>
              <label>
                Start saving date (optional)
                <input type="date" value={form.target_start_date} onChange={(event) => setForm((current) => ({ ...current, target_start_date: event.target.value }))} />
              </label>
              <label>
                Target date (optional)
                <input type="date" value={form.target_date} onChange={(event) => setForm((current) => ({ ...current, target_date: event.target.value }))} />
                <small>This is the due date; the last saving day is the working day before it.</small>
              </label>
              <label>
                Where should this allocation go?
                <select value={form.treatment} onChange={(event) => setForm((current) => ({ ...current, treatment: event.target.value }))}>
                  <option value="savings">Savings reserve — hold back from bank transfer</option>
                  <option value="bank">Bank-bound — remains part of bank transfer</option>
                </select>
                <small>Use bank-bound for payroll; use savings reserve for rent or suppliers you want to accumulate.</small>
              </label>
              <div className="modal-actions full-span">
                <button type="button" className="ghost-button" onClick={() => setIsFormOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={isSaving}>
                  {isSaving ? 'Saving...' : editingId ? 'Save changes' : 'Add to plan'}
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
    </div>
  )
}
