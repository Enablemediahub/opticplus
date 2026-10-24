import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const defaultReportSections = () => ({
  simple_summary: true,
  provider_breakdown: true,
  package_breakdown: true,
  organization_breakdown: true,
  manual_remittances: true,
  claim_detail: true,
})

export default function InsuranceSection(props) {
  const [activeClaim, setActiveClaim] = useState(null)
  const [insuranceReport, setInsuranceReport] = useState(null)
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [providerName, setProviderName] = useState('')
  const [claimsTab, setClaimsTab] = useState('ledger')
  const [paymentsYear, setPaymentsYear] = useState(new Date().getFullYear())
  const [paymentsData, setPaymentsData] = useState(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentsSaving, setPaymentsSaving] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ insurance_provider: '', amount_paid: '', date: '', reference: '', notes: '', allocations: [{ claim_month: `${new Date().getFullYear()}-01-01`, amount_paid: '' }] })
  const [selectedClaimIds, setSelectedClaimIds] = useState([])
  const [reportSections, setReportSections] = useState(defaultReportSections)
  const [remittanceForm, setRemittanceForm] = useState({
    insurance_provider: '',
    amount_paid: '',
    date: '',
    reference: '',
    notes: '',
  })
  const [editForm, setEditForm] = useState({
    insurance_provider: '',
    insurance_number: '',
    insurance_package: '',
    patient_organization: '',
    amount_paid: '',
    date: '',
  })

  const eyebrow = props.pageEyebrow ?? 'Insurance'
  const title = props.pageTitle ?? 'Manage claims, balances, and insurer follow-up'
  const copy =
    props.pageCopy ??
    'Built from the legacy insurance claims and balance workflow, with provider-specific claim capture and claim settlement.'
  const isReadOnly = Boolean(props.readOnly)
  const canManageProviders = Boolean((props.session?.is_admin || props.session?.role === 'manager') && !isReadOnly)
  const canEditClaims = Boolean((props.session?.is_admin || ['manager', 'accountant'].includes(props.session?.role)) && !isReadOnly)
  const canRecordRemittances = ['manager', 'accountant'].includes(props.session?.role) && !isReadOnly
  const providerCatalog = props.insuranceProviderCatalog?.length
    ? props.insuranceProviderCatalog
    : (props.insuranceMeta?.providers ?? []).map((provider, index) => ({ id: `${provider}-${index}`, name: provider }))
  const filteredStats = props.insuranceData?.filtered_stats
  const showClaimCreationPanel = eyebrow !== 'Insurance Claims'
  const selectableClaims = (props.insuranceData?.claims ?? []).filter((claim) => ['pending', 'claimed'].includes(String(claim.status).toLowerCase()))
  const selectedCurrentClaims = selectedClaimIds.filter((id) => selectableClaims.some((claim) => Number(claim.id) === Number(id)))

  useEffect(() => {
    setSelectedClaimIds([])
  }, [props.insuranceData?.pagination?.page, props.insuranceFilters?.provider, props.insuranceFilters?.status, props.insuranceFilters?.date_from, props.insuranceFilters?.date_to, props.insuranceFilters?.search])

  async function updateSelectedSubmissionStatus(submissionStatus) {
    if (!selectedCurrentClaims.length || !props.bulkUpdateInsuranceSubmission) return
    const didUpdate = await props.bulkUpdateInsuranceSubmission(selectedCurrentClaims, submissionStatus)
    if (didUpdate) setSelectedClaimIds([])
  }
  const paymentMonthGroups = Object.values((paymentsData?.rows ?? []).reduce((groups, row) => {
    const monthKey = row.claim_month?.slice(0, 7) ?? 'unknown'
    groups[monthKey] ??= { monthKey, rows: [], claimed: 0, allocated: 0, difference: 0 }
    groups[monthKey].rows.push(row)
    groups[monthKey].claimed += Number(row.claimed ?? 0)
    groups[monthKey].allocated += Number(row.allocated ?? 0)
    groups[monthKey].difference += Number(row.difference ?? 0)
    return groups
  }, {})).sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  function monthLabel(value) {
    if (!value || value === 'unknown') return 'Unknown month'
    return new Intl.DateTimeFormat('en-GH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
  }

  useEffect(() => {
    if (eyebrow !== 'Insurance Claims' || !canRecordRemittances || !props.apiFetch) return
    let cancelled = false
    setPaymentsLoading(true)
    props.apiFetch(`/insurance/payments?branch_id=${encodeURIComponent(props.selectedBranchId ?? 0)}&year=${paymentsYear}`, { token: props.token })
      .then((data) => { if (!cancelled) setPaymentsData(data) })
      .catch((error) => { if (!cancelled) props.onPaymentsError?.(error.message) })
      .finally(() => { if (!cancelled) setPaymentsLoading(false) })
    return () => { cancelled = true }
  }, [eyebrow, canRecordRemittances, props.apiFetch, props.selectedBranchId, props.token, paymentsYear, paymentsSaving])

  async function saveInsurancePayment(event) {
    event.preventDefault()
    setPaymentsSaving(true)
    try {
      await props.apiFetch(`/insurance/payments?branch_id=${encodeURIComponent(props.selectedBranchId ?? 0)}`, { method: 'POST', token: props.token, body: paymentForm })
      setPaymentForm((current) => ({ ...current, amount_paid: '', reference: '', notes: '', allocations: [{ claim_month: current.allocations[0]?.claim_month ?? `${paymentsYear}-01-01`, amount_paid: '' }] }))
      setPaymentsYear(Number(paymentForm.date.slice(0, 4)) || paymentsYear)
    } catch (error) {
      props.onPaymentsError?.(error.message)
    } finally { setPaymentsSaving(false) }
  }

  useEffect(() => {
    if (!activeClaim) return
    setEditForm({
      insurance_provider: activeClaim.insurance_provider ?? '',
      insurance_number: activeClaim.insurance_number ?? '',
      insurance_package: activeClaim.insurance_package ?? '',
      patient_organization: activeClaim.patient_organization ?? '',
      amount_paid:
        activeClaim.amount_paid === null || activeClaim.amount_paid === undefined
          ? ''
          : Number(activeClaim.amount_paid).toFixed(2),
      date: activeClaim.date ?? '',
    })
  }, [activeClaim])

  const closeClaimModal = () => setActiveClaim(null)
  const closeReportModal = () => setIsReportOpen(false)

  async function handleSaveProvider(event) {
    event.preventDefault()
    const trimmed = providerName.trim()
    if (!trimmed) return

    const saved = await props.saveInsuranceProvider?.(trimmed)
    if (saved !== false) {
      setProviderName('')
      props.setInsuranceForm?.((current) => ({
        ...current,
        insurance_provider: trimmed,
      }))
    }
  }

  async function handleUpdateClaim(event) {
    event.preventDefault()
    if (!activeClaim) return

    const didSave = await props.updateInsuranceClaim(activeClaim.id, {
      insurance_provider: editForm.insurance_provider,
      insurance_number: editForm.insurance_number,
      insurance_package: editForm.insurance_package,
      patient_organization: editForm.patient_organization,
      amount_paid: editForm.amount_paid,
      date: editForm.date,
    }, activeClaim.branch_id)

    if (didSave) {
      setActiveClaim((current) =>
        current
          ? {
              ...current,
              insurance_provider: editForm.insurance_provider,
              insurance_number: editForm.insurance_number,
              insurance_package: editForm.insurance_package,
              patient_organization: editForm.patient_organization,
              amount_paid: editForm.amount_paid,
              date: editForm.date,
            }
          : current,
      )
    }
  }

  async function handleDeleteClaim() {
    if (!activeClaim) return

    const didDelete = await props.deleteInsuranceClaim(activeClaim.id, activeClaim.branch_id)
    if (didDelete) {
      closeClaimModal()
    }
  }

  async function handleGenerateReport() {
    setIsLoadingReport(true)

    try {
      const report = await props.generateInsuranceReport()
      setInsuranceReport(report)
      setReportSections(defaultReportSections())
      setIsReportOpen(true)
    } finally {
      setIsLoadingReport(false)
    }
  }

  async function handleSaveRemittance(event) {
    event.preventDefault()
    const saved = await props.saveInsuranceRemittance?.(remittanceForm)
    if (saved !== false) {
      setRemittanceForm({
        insurance_provider: '',
        amount_paid: '',
        date: '',
        reference: '',
        notes: '',
      })
    }
  }

  function handleExportReportExcel() {
    if (!insuranceReport) return

    const html = createInsuranceReportHtml(insuranceReport, reportSections)
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `insurance-claims-report-${slugify(insuranceReport.branch_name)}-${insuranceReport.generated_at?.slice(0, 10) ?? 'report'}.xls`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  function handlePrintReport() {
    if (!insuranceReport) return

    const html = createInsuranceReportHtml(insuranceReport, reportSections)
    const printWindow = window.open('', '_blank', 'width=1280,height=920')
    if (!printWindow) return
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.document.title = `Insurance Claims Report - ${insuranceReport.branch_name ?? 'Branch'}`
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <p className="header-copy">{copy}</p>
        </div>
      </div>

      {props.insuranceError ? <div className="message-banner error">{props.insuranceError}</div> : null}
      {props.insuranceSuccess ? <div className="message-banner success">{props.insuranceSuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget
          label="Total Insurance Billing"
          value={currency.format(Number(filteredStats?.total_amount ?? props.insuranceData?.stats.total_claimed ?? 0))}
          note="Insurance portions recorded against patient billing"
          icon="shield"
          className="total"
        />
        <StatWidget
          label="Submitted Externally"
          value={currency.format(Number(filteredStats?.claimed_amount ?? props.insuranceData?.stats.claimed_not_paid ?? 0))}
          note="Marked after submission through your external insurer platform"
          icon="receipt"
          className="pending"
        />
        <StatWidget
          label="Not Submitted"
          value={currency.format(Number(filteredStats?.pending_amount ?? props.insuranceData?.stats.pending_claims ?? 0))}
          note="Insurance billing not yet marked as externally submitted"
          icon="clock"
          className="today"
        />
        <StatWidget
          label="Insurance Received"
          value={currency.format(Number(props.insuranceData?.remittance_summary?.total_amount ?? 0))}
          note="Insurer receipts recorded for the current filters"
          icon="check-badge"
          className="seen"
        />
      </section>

      <section className="finance-layout insurance-layout">
        {showClaimCreationPanel ? (
        <article className="panel patient-form-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{isReadOnly ? 'Insurance Visibility' : 'New Claim'}</p>
              <h3>{isReadOnly ? 'Read insurer exposure and settlement activity' : 'Create insurance claim'}</h3>
            </div>
            <span className="panel-tag">
              {props.insuranceData?.branch_name ?? props.insuranceMeta?.branch_name ?? 'Insurance'}
            </span>
          </div>

          {canManageProviders ? (
            <div className="insurance-provider-manager">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Provider Catalog</p>
                  <h3>Add a new insurance company</h3>
                </div>
                <span className="panel-tag">{providerCatalog.length} providers</span>
              </div>

              <form className="settings-inline-form" onSubmit={handleSaveProvider}>
                <label className="full-span">
                  Insurance company name
                  <input
                    value={providerName}
                    onChange={(event) => setProviderName(event.target.value)}
                    placeholder="e.g. GLICO, ACACIA, STAR, OTHER"
                  />
                </label>
                <div className="filter-actions-row full-span">
                  <button type="submit" className="primary-button" disabled={props.isSavingInsuranceProvider || !providerName.trim()}>
                    {props.isSavingInsuranceProvider ? 'Saving...' : 'Add insurance company'}
                  </button>
                </div>
              </form>

              <div className="insurance-provider-list">
                {providerCatalog.map((provider) => (
                  <div key={provider.id ?? provider.name} className="settings-catalog-item">
                    <div>
                      <strong>{provider.name}</strong>
                      <span>{provider.created_at ? `Added ${new Date(provider.created_at).toLocaleDateString()}` : 'Available for claims'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {canRecordRemittances ? (
            <div className="insurance-provider-manager">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Manual Insurance Receipt</p>
                  <h3>Record insurer money not yet mapped to patients</h3>
                </div>
                <span className="panel-tag">{props.insuranceData?.remittance_summary?.record_count ?? 0} entries</span>
              </div>

              <form className="patient-form-grid" onSubmit={handleSaveRemittance}>
                <label>
                  Insurance company
                  <select
                    value={remittanceForm.insurance_provider}
                    onChange={(event) => setRemittanceForm((current) => ({ ...current, insurance_provider: event.target.value }))}
                    required
                  >
                    <option value="">Select provider</option>
                    {providerCatalog.map((provider) => (
                      <option key={provider.id ?? provider.name} value={provider.name}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount paid
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={remittanceForm.amount_paid}
                    onChange={(event) => setRemittanceForm((current) => ({ ...current, amount_paid: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Payment date
                  <input
                    type="date"
                    value={remittanceForm.date}
                    onChange={(event) => setRemittanceForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Reference
                  <input
                    value={remittanceForm.reference}
                    onChange={(event) => setRemittanceForm((current) => ({ ...current, reference: event.target.value }))}
                    placeholder="Bank reference, cheque no, transfer note"
                  />
                </label>
                <label className="full-span">
                  Notes
                  <textarea
                    rows="3"
                    value={remittanceForm.notes}
                    onChange={(event) => setRemittanceForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Optional note about how this insurer payment should be allocated later"
                  />
                </label>
                <button type="submit" className="primary-button full-span" disabled={props.isSavingInsuranceRemittance}>
                  {props.isSavingInsuranceRemittance ? 'Recording receipt...' : 'Record insurance receipt'}
                </button>
              </form>

              {props.insuranceData?.remittance_summary ? (
                <div className="insurance-report-strip">
                  <div className="finance-chip">
                    <span>Manual paid total</span>
                    <strong>{currency.format(Number(props.insuranceData.remittance_summary.total_amount ?? 0))}</strong>
                  </div>
                  <div className="finance-chip">
                    <span>Entries recorded</span>
                    <strong>{props.insuranceData.remittance_summary.record_count ?? 0}</strong>
                  </div>
                  <div className="finance-chip">
                    <span>Average receipt</span>
                    <strong>{currency.format(Number(props.insuranceData.remittance_summary.average_amount ?? 0))}</strong>
                  </div>
                </div>
              ) : null}

              <div className="insurance-provider-list">
                {(props.insuranceData?.remittances ?? []).length ? (props.insuranceData?.remittances ?? []).map((entry) => (
                  <div key={`remittance-${entry.id}`} className="settings-catalog-item">
                    <div>
                      <strong>{entry.insurance_provider}</strong>
                      <span>{entry.date} | {currency.format(Number(entry.amount_paid ?? 0))}</span>
                      {entry.reference ? <span>Ref: {entry.reference}</span> : null}
                      {entry.notes ? <span>{entry.notes}</span> : null}
                    </div>
                  </div>
                )) : (
                  <p className="muted-copy">No manual insurer remittances have been recorded yet.</p>
                )}
              </div>
            </div>
          ) : null}

          {isReadOnly ? (
            <div className="message-banner">
              Directors and the CEO can review insurance claims, pending balances, and settlement status here, but creating, editing, and deleting claims is disabled.
            </div>
          ) : (
          <form className="patient-form-grid" onSubmit={props.saveInsuranceClaim}>
            <label className="full-span">
              Billing / patient
              <select
                value={props.insuranceForm.billing_id}
                onChange={(event) => {
                  const selected = (props.insuranceData?.billing_candidates ?? []).find(
                    (candidate) => String(candidate.id) === event.target.value,
                  )
                  props.setInsuranceForm((current) => ({
                    ...current,
                    billing_id: event.target.value,
                    patient_id: selected?.patient_id ?? '',
                    folder_id: selected?.folder_id ?? '',
                    patient_name: selected?.name ?? '',
                    insurance_provider: selected?.health_insurance ?? current.insurance_provider,
                    amount_paid: selected?.balance ? Number(selected.balance).toFixed(2) : current.amount_paid,
                  }))
                }}
                required
              >
                <option value="">Select billing record</option>
                {(props.insuranceData?.billing_candidates ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} - {candidate.folder_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Folder ID
              <input value={props.insuranceForm.folder_id} readOnly />
            </label>
            <label>
              Patient
              <input value={props.insuranceForm.patient_name} readOnly />
            </label>
            <label>
              Insurance provider
              <select
                value={props.insuranceForm.insurance_provider}
                onChange={(event) =>
                  props.setInsuranceForm((current) => ({ ...current, insurance_provider: event.target.value }))
                }
                required
              >
                <option value="">Select provider</option>
                {(props.insuranceMeta?.providers ?? []).map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Insurance number
              <input
                value={props.insuranceForm.insurance_number}
                onChange={(event) =>
                  props.setInsuranceForm((current) => ({ ...current, insurance_number: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Package
              <input
                list="insurance-package-options"
                value={props.insuranceForm.insurance_package}
                onChange={(event) =>
                  props.setInsuranceForm((current) => ({ ...current, insurance_package: event.target.value }))
                }
              />
            </label>
            <label>
              Organization
              <input
                list="insurance-organization-options"
                value={props.insuranceForm.patient_organization}
                onChange={(event) =>
                  props.setInsuranceForm((current) => ({ ...current, patient_organization: event.target.value }))
                }
              />
            </label>
            <label>
              Insurance billing amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={props.insuranceForm.amount_paid}
                onChange={(event) =>
                  props.setInsuranceForm((current) => ({ ...current, amount_paid: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Claim date
              <input
                type="date"
                value={props.insuranceForm.date}
                onChange={(event) => props.setInsuranceForm((current) => ({ ...current, date: event.target.value }))}
                required
              />
            </label>

            <button type="submit" className="primary-button full-span" disabled={props.isSavingInsuranceClaim}>
              {props.isSavingInsuranceClaim ? 'Saving claim...' : 'Save insurance claim'}
            </button>
          </form>
          )}

          <datalist id="insurance-package-options">
            {(props.insuranceMeta?.package_options?.[props.insuranceForm.insurance_provider] ?? []).map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <datalist id="insurance-organization-options">
            {(props.insuranceMeta?.organization_options ?? []).map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </article>
        ) : null}

        {eyebrow === 'Insurance Claims' && canRecordRemittances ? (
          <div className="finance-tabs insurance-view-tabs" role="tablist" aria-label="Insurance claims views">
            <button type="button" role="tab" aria-selected={claimsTab === 'ledger'} className={`finance-tab insurance-view-tab ${claimsTab === 'ledger' ? 'active' : ''}`} onClick={() => setClaimsTab('ledger')}>
              <span className="insurance-view-tab__icon" aria-hidden="true">▤</span><span>Claims Ledger</span>
              <span className="insurance-view-tab__count">{props.insuranceData?.pagination?.total ?? 0}</span>
            </button>
            <button type="button" role="tab" aria-selected={claimsTab === 'payments'} className={`finance-tab insurance-view-tab ${claimsTab === 'payments' ? 'active' : ''}`} onClick={() => setClaimsTab('payments')}>
              <span className="insurance-view-tab__icon" aria-hidden="true">◉</span><span>Insurance Payments</span>
              <span className="insurance-view-tab__count">{paymentsData?.receipts?.length ?? 0}</span>
            </button>
          </div>
        ) : null}

        {claimsTab === 'payments' && eyebrow === 'Insurance Claims' && canRecordRemittances ? (
          <>
            <article className="panel">
              <div className="panel-heading"><div><p className="eyebrow">Insurer reconciliation</p><h3>Record a receipt and match it to claim months</h3></div></div>
              <p className="muted-copy">Enter the total received, then split it across the months the insurer paid for. The receipt date feeds Insurance Received in financial reports; allocations show which claim months it settles.</p>
              <form className="patient-filter-grid" onSubmit={saveInsurancePayment}>
                <label>Insurance company<select required value={paymentForm.insurance_provider} onChange={(e) => setPaymentForm((v) => ({ ...v, insurance_provider: e.target.value }))}><option value="">Select provider</option>{(props.insuranceMeta?.providers ?? []).map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
                <label>Receipt date<input required type="date" value={paymentForm.date} onChange={(e) => setPaymentForm((v) => ({ ...v, date: e.target.value }))} /></label>
                <label>Total received (GHS)<input required min="0.01" step="0.01" type="number" value={paymentForm.amount_paid} onChange={(e) => setPaymentForm((v) => ({ ...v, amount_paid: e.target.value }))} /></label>
                <label>Bank/payment reference<input value={paymentForm.reference} onChange={(e) => setPaymentForm((v) => ({ ...v, reference: e.target.value }))} /></label>
                <label className="full-span">Notes<input value={paymentForm.notes} onChange={(e) => setPaymentForm((v) => ({ ...v, notes: e.target.value }))} /></label>
                <div className="full-span">
                  <strong>Allocate receipt across claim months</strong>
                  {paymentForm.allocations.map((allocation, index) => <div className="patient-filter-grid" key={index}>
                    <label>Claim month<input type="month" required value={allocation.claim_month.slice(0, 7)} onChange={(e) => setPaymentForm((v) => ({ ...v, allocations: v.allocations.map((a, i) => i === index ? { ...a, claim_month: `${e.target.value}-01` } : a) }))} /></label>
                    <label>Amount allocated (GHS)<input type="number" min="0.01" step="0.01" required value={allocation.amount_paid} onChange={(e) => setPaymentForm((v) => ({ ...v, allocations: v.allocations.map((a, i) => i === index ? { ...a, amount_paid: e.target.value } : a) }))} /></label>
                    {paymentForm.allocations.length > 1 ? <button type="button" className="mini-action" onClick={() => setPaymentForm((v) => ({ ...v, allocations: v.allocations.filter((_, i) => i !== index) }))}>Remove month</button> : null}
                  </div>)}
                  <button type="button" className="mini-action" onClick={() => setPaymentForm((v) => ({ ...v, allocations: [...v.allocations, { claim_month: `${paymentsYear}-01-01`, amount_paid: '' }] }))}>Add claim month</button>
                </div>
                <button className="primary-button full-span" disabled={paymentsSaving}>{paymentsSaving ? 'Saving receipt...' : 'Save receipt and allocations'}</button>
              </form>
            </article>
            <article className="panel patient-list-panel">
              <div className="panel-heading"><div><p className="eyebrow">Monthly reconciliation</p><h3>Claims, payments, and remaining difference</h3></div><label>Year<select value={paymentsYear} onChange={(e) => setPaymentsYear(Number(e.target.value))}>{[paymentsYear + 1, paymentsYear, paymentsYear - 1, paymentsYear - 2].map((year) => <option key={year}>{year}</option>)}</select></label></div>
              <p className="muted-copy">Difference = Total Insurance Billing for the month minus insurer receipts allocated to that month. A negative amount means allocated payments exceeded billing.</p>
              {paymentsLoading ? <p className="muted-copy">Loading insurance reconciliation…</p> : <div className="table-shell insurance-reconciliation-table-wrap"><table className="portal-table insurance-reconciliation-table"><thead><tr><th>Insurance company</th><th>Records</th><th>Total Insurance Billing</th><th>Received allocated</th><th>Remaining difference</th></tr></thead><tbody>{paymentMonthGroups.flatMap((group) => [
                <tr className="insurance-reconciliation-month" key={`month-${group.monthKey}`}><th>{monthLabel(group.monthKey)} <span>{group.rows.length} {group.rows.length === 1 ? 'insurance company' : 'insurance companies'}</span></th><td>{group.rows.reduce((total, row) => total + Number(row.claim_count ?? 0), 0)}</td><td>{currency.format(group.claimed)}</td><td>{currency.format(group.allocated)}</td><td>{currency.format(group.difference)}</td></tr>,
                ...group.rows.map((row) => <tr className="insurance-reconciliation-company" key={`${row.insurance_provider}-${row.claim_month}`}><td>{row.insurance_provider}</td><td>{row.claim_count}</td><td>{currency.format(Number(row.claimed))}</td><td>{currency.format(Number(row.allocated))}</td><td className={Number(row.difference) < 0 ? 'insurance-difference-overpaid' : ''}>{currency.format(Number(row.difference))}</td></tr>),
              ])}{!paymentMonthGroups.length ? <tr><td colSpan="5">No claims or allocations in this year.</td></tr> : null}</tbody></table></div>}
            </article>
            <article className="panel patient-list-panel"><div className="panel-heading"><div><p className="eyebrow">Cash receipts</p><h3>Insurance payments received in {paymentsYear}</h3></div></div><div className="table-shell"><table className="portal-table"><thead><tr><th>Receipt date</th><th>Insurance company</th><th>Amount received</th><th>Reference</th><th>Applied to claim months</th></tr></thead><tbody>{(paymentsData?.receipts ?? []).map((receipt) => <tr key={receipt.id}><td>{receipt.date}</td><td>{receipt.insurance_provider}</td><td>{currency.format(Number(receipt.amount_paid))}</td><td>{receipt.reference || '—'}</td><td>{(receipt.allocations ?? []).map((a) => `${a.claim_month.slice(0, 7)}: ${currency.format(Number(a.amount_paid))}`).join(' · ') || 'Unallocated legacy receipt'}</td></tr>)}{!paymentsData?.receipts?.length ? <tr><td colSpan="5">No receipts recorded for this year.</td></tr> : null}</tbody></table></div></article>
          </>
        ) : null}

        {claimsTab === 'ledger' ? <article className="panel patient-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Claims Ledger</p>
              <h3>Review and settle insurance claims</h3>
            </div>
            <span className="panel-tag">{props.insuranceData?.pagination?.total ?? 0} rows in view</span>
          </div>

          {filteredStats ? (
            <div className="insurance-report-strip">
              <div className="finance-chip">
                <span>Filtered claim value</span>
                <strong>{currency.format(Number(filteredStats.total_amount ?? 0))}</strong>
              </div>
              <div className="finance-chip">
                <span>Open exposure</span>
                <strong>{currency.format(Number(filteredStats.open_amount ?? 0))}</strong>
              </div>
              <div className="finance-chip">
                <span>Paid from this filter</span>
                <strong>{currency.format(Number(filteredStats.paid_amount ?? 0))}</strong>
              </div>
              <div className="finance-chip">
                <span>Claims matched</span>
                <strong>{filteredStats.claim_count ?? 0}</strong>
              </div>
            </div>
          ) : null}

          <form
            className="patient-filter-grid"
            onSubmit={(event) => {
              event.preventDefault()
              props.setInsuranceQuery((current) => ({
                ...current,
                ...props.insuranceFilters,
                page: 1,
              }))
            }}
          >
            <label>
              Search
              <input
                value={props.insuranceFilters.search}
                onChange={(event) =>
                  props.setInsuranceFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="Patient, folder, insurance number"
              />
            </label>
            <label>
              Provider
              <select
                value={props.insuranceFilters.provider}
                onChange={(event) =>
                  props.setInsuranceFilters((current) => ({ ...current, provider: event.target.value }))
                }
              >
                <option value="all">All</option>
                {(props.insuranceMeta?.providers ?? []).map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={props.insuranceFilters.status}
                onChange={(event) =>
                  props.setInsuranceFilters((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="all">All</option>
                <option value="claimed">Submitted externally</option>
                <option value="pending">Not submitted</option>
                <option value="paid">Legacy paid status</option>
              </select>
            </label>
            <label>
              Date from
              <input
                type="date"
                value={props.insuranceFilters.date_from}
                onChange={(event) =>
                  props.setInsuranceFilters((current) => ({ ...current, date_from: event.target.value }))
                }
              />
            </label>
            <label>
              Date to
              <input
                type="date"
                value={props.insuranceFilters.date_to}
                onChange={(event) =>
                  props.setInsuranceFilters((current) => ({ ...current, date_to: event.target.value }))
                }
              />
            </label>

            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">
                Apply filters
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleGenerateReport}
                disabled={isLoadingReport || props.isLoadingInsuranceData}
              >
                {isLoadingReport ? 'Generating report...' : 'Insurance Report'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const defaults = {
                    search: '',
                    provider: 'all',
                    status: 'all',
                    date_from: '',
                    date_to: '',
                    page: 1,
                    per_page: 12,
                  }
                  props.setInsuranceFilters(defaults)
                  props.setInsuranceQuery(defaults)
                }}
              >
                Reset
              </button>
            </div>
          </form>

          {canEditClaims ? (
            <div className="insurance-bulk-submission-bar">
              <div>
                <strong>{selectedCurrentClaims.length} selected</strong>
                <span>Choose insurance billing rows on this page</span>
              </div>
              <button type="button" className="primary-button" disabled={!selectedCurrentClaims.length || props.claimBusyId === 'bulk-insurance-submission'} onClick={() => updateSelectedSubmissionStatus('submitted')}>
                Mark selected submitted externally
              </button>
              <button type="button" className="ghost-button" disabled={!selectedCurrentClaims.length || props.claimBusyId === 'bulk-insurance-submission'} onClick={() => updateSelectedSubmissionStatus('not_submitted')}>
                Revert selected to not submitted
              </button>
            </div>
          ) : null}

          {props.insuranceData?.claims?.length ? (
            <div className="table-shell">
              <table className="portal-table insurance-claims-table">
                <thead>
                  <tr>
                    <th className="insurance-select-column">
                      {canEditClaims ? <input type="checkbox" aria-label="Select all eligible insurance billing rows on this page" checked={selectableClaims.length > 0 && selectableClaims.every((claim) => selectedCurrentClaims.includes(Number(claim.id)))} onChange={(event) => setSelectedClaimIds(event.target.checked ? selectableClaims.map((claim) => Number(claim.id)) : [])} /> : null}
                    </th>
                    <th>Patient</th>
                    <th>Folder ID</th>
                    <th>Provider</th>
                    <th>Policy No</th>
                    <th>Package</th>
                    <th>Organization</th>
                    <th>Billing ID</th>
                    <th>Claim Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(props.insuranceData?.claims ?? []).map((claim) => {
                    const claimStatus = String(claim.status).toLowerCase()

                    return (
                      <tr key={claim.id}>
                        <td className="insurance-select-column">
                          {canEditClaims && ['pending', 'claimed'].includes(claimStatus) ? <input type="checkbox" aria-label={`Select ${claim.patient_name || claim.folder_id || 'insurance billing record'}`} checked={selectedCurrentClaims.includes(Number(claim.id))} onChange={(event) => setSelectedClaimIds((current) => event.target.checked ? [...new Set([...current, Number(claim.id)])] : current.filter((id) => Number(id) !== Number(claim.id)))} /> : null}
                        </td>
                        <td>
                          <div className="patient-table-primary">
                            <strong>{claim.patient_name || claim.name || 'Unknown patient'}</strong>
                            <span>{claim.insurance_provider || 'No provider'}</span>
                          </div>
                        </td>
                        <td>{claim.folder_id || 'N/A'}</td>
                        <td>{claim.insurance_provider || 'N/A'}</td>
                        <td>{claim.insurance_number || 'N/A'}</td>
                        <td>{claim.insurance_package || 'N/A'}</td>
                        <td>{claim.patient_organization || 'N/A'}</td>
                        <td>{claim.billing_id || 'N/A'}</td>
                        <td>{currency.format(Number(claim.amount_paid ?? 0))}</td>
                        <td>{claim.date || 'N/A'}</td>
                        <td>
                          <span className={`status-pill status-${claimStatus.replaceAll(' ', '-')}`}>
                            {claimStatus === 'claimed' ? 'Submitted externally' : claimStatus === 'pending' ? 'Not submitted' : claimStatus === 'paid' ? 'Legacy paid status' : claim.status}
                          </span>
                        </td>
                        <td>
                          {['pending', 'claimed', 'paid'].includes(claimStatus) ? (
                            <div className="billing-row-actions">
                              <button
                                type="button"
                                className="mini-action"
                                disabled={!claim.billing_id}
                                onClick={() =>
                                  props.printFinanceReceipt({
                                    ...claim,
                                    payment_method: 'Insurance',
                                    amount_paid: claim.amount_paid,
                                    date: claim.date,
                                    reference: claim.receipt_number || claim.insurance_number || claim.folder_id,
                                  })
                                }
                              >
                                Reprint receipt
                              </button>
                              {canEditClaims && claimStatus === 'claimed' ? (
                                <button
                                  type="button"
                                  className="mini-action"
                                  disabled={props.claimBusyId === claim.id}
                                  onClick={() => props.markClaimPending(claim.id, claim.branch_id)}
                                >
                                  {props.claimBusyId === claim.id ? 'Updating...' : 'Mark as not submitted'}
                                </button>
                              ) : null}
                              {canEditClaims && claimStatus === 'pending' ? (
                                <button
                                  type="button"
                                  className="mini-action success"
                                  disabled={props.claimBusyId === claim.id}
                                  onClick={() => props.markClaimSubmittedExternally(claim.id, claim.branch_id)}
                                >
                                  {props.claimBusyId === claim.id ? 'Updating...' : 'Mark submitted externally'}
                                </button>
                              ) : null}
                              {canEditClaims ? (
                                <button
                                  type="button"
                                  className="mini-action"
                                  disabled={props.claimBusyId === claim.id}
                                  onClick={() => setActiveClaim(claim)}
                                >
                                  Edit entry
                                </button>
                              ) : null}
                              {isReadOnly ? <span className="muted-copy">View only</span> : null}
                            </div>
                          ) : (
                            <span className="muted-copy">No actions</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-shell insurance-empty-state">
              <p className="muted-copy">No insurance claims match the current filters.</p>
            </div>
          )}

          {props.insuranceData?.pagination ? (
            <div className="pagination-bar">
              <span className="muted-copy">
                Page {props.insuranceData.pagination.page} of {props.insuranceData.pagination.total_pages || 1}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="mini-action"
                  disabled={props.insuranceData.pagination.page <= 1}
                  onClick={() =>
                    props.setInsuranceQuery((current) => ({ ...current, page: Math.max(current.page - 1, 1) }))
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="mini-action"
                  disabled={props.insuranceData.pagination.page >= props.insuranceData.pagination.total_pages}
                  onClick={() =>
                    props.setInsuranceQuery((current) => ({
                      ...current,
                      page: Math.min(current.page + 1, props.insuranceData.pagination.total_pages || current.page),
                    }))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </article> : null}
      </section>

      {activeClaim ? (
        <div className="modal-overlay" onClick={closeClaimModal}>
          <article className="modal-panel insurance-claim-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Insurance Entry</p>
                <h3>Edit or delete this claim</h3>
              </div>
              <button type="button" className="ghost-button" onClick={closeClaimModal}>
                Close
              </button>
            </div>

            {props.insuranceError ? <div className="message-banner error">{props.insuranceError}</div> : null}
            {props.insuranceSuccess ? <div className="message-banner success">{props.insuranceSuccess}</div> : null}

            <div className="insurance-claim-modal__summary">
              <div className="finance-chip">
                <span>Patient</span>
                <strong>{activeClaim.name || 'Unknown patient'}</strong>
              </div>
              <div className="finance-chip">
                <span>Folder ID</span>
                <strong>{activeClaim.folder_id || 'N/A'}</strong>
              </div>
              <div className="finance-chip">
                <span>Status</span>
                <strong>{activeClaim.status || 'N/A'}</strong>
              </div>
              <div className="finance-chip">
                <span>Billing ID</span>
                <strong>{activeClaim.billing_id || 'N/A'}</strong>
              </div>
            </div>

            <form className="patient-form-grid" onSubmit={handleUpdateClaim}>
              <label>
                Insurance provider
                <select
                  value={editForm.insurance_provider}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, insurance_provider: event.target.value }))
                  }
                  required
                >
                  <option value="">Select provider</option>
                  {providerCatalog.map((provider) => (
                    <option key={provider.id ?? provider.name} value={provider.name}>
                      {provider.name}
                    </option>
                  ))}
                  {activeClaim?.insurance_provider && !providerCatalog.some((provider) => provider.name === activeClaim.insurance_provider) ? (
                    <option value={activeClaim.insurance_provider}>{activeClaim.insurance_provider}</option>
                  ) : null}
                </select>
              </label>
              <label>
                Insurance number
                <input
                  value={editForm.insurance_number}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, insurance_number: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Package
                <input
                  list="insurance-package-options"
                  value={editForm.insurance_package}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, insurance_package: event.target.value }))
                  }
                />
              </label>
              <label>
                Organization
                <input
                  list="insurance-organization-options"
                  value={editForm.patient_organization}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, patient_organization: event.target.value }))
                  }
                />
              </label>
              <label>
                Insurance billing amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.amount_paid}
                  onChange={(event) => setEditForm((current) => ({ ...current, amount_paid: event.target.value }))}
                  required
                />
              </label>
              <label>
                Claim date
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(event) => setEditForm((current) => ({ ...current, date: event.target.value }))}
                  required
                />
              </label>

              <div className="modal-actions full-span insurance-claim-modal__actions">
                <button type="button" className="danger-button" disabled={props.claimBusyId === activeClaim.id} onClick={handleDeleteClaim}>
                  {props.claimBusyId === activeClaim.id ? 'Working...' : 'Delete entry'}
                </button>
                <div className="billing-row-actions">
                  <button type="button" className="ghost-button" onClick={closeClaimModal}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button" disabled={props.claimBusyId === activeClaim.id}>
                    {props.claimBusyId === activeClaim.id ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          </article>
        </div>
      ) : null}

      {insuranceReport && isReportOpen ? (
        <div className="modal-overlay" onClick={closeReportModal}>
          <article className="modal-panel report-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Insurance Report</p>
                <h3>Filtered claims valuation and settlement report</h3>
              </div>
              <div className="modal-actions">
                <span className="panel-tag">{insuranceReport.branch_name}</span>
                <button type="button" className="ghost-button" onClick={handlePrintReport}>
                  Print / Save PDF
                </button>
                <button type="button" className="ghost-button" onClick={handleExportReportExcel}>
                  Export Excel
                </button>
                <button type="button" className="ghost-button" onClick={closeReportModal}>
                  Close
                </button>
              </div>
            </div>

            <article className="panel report-sheet">
              <div className="report-page-header">
                <strong>BEALET OPTICAL CENTER</strong>
                <span>Insurance Claims Report</span>
                <span>{insuranceReport.branch_name} | Generated {formatReportDateTime(insuranceReport.generated_at)}</span>
              </div>

              <div className="insurance-report-filters">
                {describeInsuranceFilters(insuranceReport.filters).map((item) => (
                  <div key={item.label} className="report-summary-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.note}</small>
                  </div>
                ))}
              </div>

              <div className="report-summary-grid">
                <div className="report-summary-card">
                  <span>Total Insurance Billing</span>
                  <strong>{currency.format(Number(insuranceReport.simple_summary?.total_claimed ?? 0))}</strong>
                  <small>Insurance portions recorded against patient billing</small>
                </div>
                <div className="report-summary-card">
                  <span>Submitted Externally</span>
                  <strong>{currency.format(Number(insuranceReport.simple_summary?.claimed_not_paid ?? 0))}</strong>
                  <small>Marked after submission through the external platform</small>
                </div>
                <div className="report-summary-card">
                  <span>Insurance Received</span>
                  <strong>{currency.format(Number(insuranceReport.simple_summary?.total_paid_received ?? 0))}</strong>
                  <small>Insurer receipts entered in Insurance Payments</small>
                </div>
                <div className="report-summary-card">
                  <span>Not Submitted Externally</span>
                  <strong>{currency.format(Number(insuranceReport.simple_summary?.pending_amount ?? 0))}</strong>
                  <small>Insurance billing not yet marked as submitted</small>
                </div>
                <div className="report-summary-card">
                  <span>Claims matched</span>
                  <strong>{insuranceReport.summary?.claim_count ?? 0}</strong>
                  <small>Detailed rows included below</small>
                </div>
                <div className="report-summary-card">
                  <span>Average claim</span>
                  <strong>{currency.format(Number(insuranceReport.summary?.average_claim_amount ?? 0))}</strong>
                  <small>Mean value across the filtered claims</small>
                </div>
              </div>

              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Report Sections</p>
                    <h3>Choose what to include in this report</h3>
                  </div>
                </div>

                <div className="insurance-report-section-grid">
                  {[
                    ['simple_summary', 'Simple Claimed vs Paid'],
                    ['provider_breakdown', 'Insurer View'],
                    ['package_breakdown', 'Package Mix'],
                    ['organization_breakdown', 'Organization Mix'],
                    ['manual_remittances', 'Manual Insurer Receipts'],
                    ['claim_detail', 'Claim Detail'],
                  ].map(([key, label]) => (
                    <label key={key} className="insurance-report-section-option">
                      <input
                        type="checkbox"
                        checked={Boolean(reportSections[key])}
                        onChange={(event) => setReportSections((current) => ({ ...current, [key]: event.target.checked }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </article>

              {reportSections.simple_summary ? (
                <InsuranceSimpleSummarySection summary={insuranceReport.simple_summary} />
              ) : null}
              {reportSections.provider_breakdown ? (
                <InsuranceReportBreakdownTable
                  title="Provider Breakdown"
                  eyebrow="Insurer View"
                  rows={insuranceReport.provider_breakdown}
                />
              ) : null}
              {reportSections.package_breakdown ? (
                <InsuranceReportBreakdownTable
                  title="Package Breakdown"
                  eyebrow="Package Mix"
                  rows={insuranceReport.package_breakdown}
                />
              ) : null}
              {reportSections.organization_breakdown ? (
                <InsuranceReportBreakdownTable
                  title="Organization Breakdown"
                  eyebrow="Organization Mix"
                  rows={insuranceReport.organization_breakdown}
                />
              ) : null}
              {reportSections.manual_remittances ? (
                <InsuranceManualRemittancesSection rows={insuranceReport.manual_remittances} />
              ) : null}

              {reportSections.claim_detail ? (
                <article className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Claim Detail</p>
                    <h3>Every filtered insurance claim in the report</h3>
                  </div>
                  <span className="panel-tag">{insuranceReport.claims?.length ?? 0} entries</span>
                </div>

                <div className="table-shell">
                  <table className="portal-table insurance-claims-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Folder ID</th>
                        <th>Provider</th>
                        <th>Policy No</th>
                        <th>Package</th>
                        <th>Organization</th>
                        <th>Billing ID</th>
                        <th>Claim Amount</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(insuranceReport.claims ?? []).length ? (insuranceReport.claims ?? []).map((claim) => (
                        <tr key={`report-claim-${claim.id}`}>
                          <td>{claim.patient_name || claim.name || 'Unknown patient'}</td>
                          <td>{claim.folder_id || 'N/A'}</td>
                          <td>{claim.insurance_provider || 'N/A'}</td>
                          <td>{claim.insurance_number || 'N/A'}</td>
                          <td>{claim.insurance_package || 'N/A'}</td>
                          <td>{claim.patient_organization || 'N/A'}</td>
                          <td>{claim.billing_id || 'N/A'}</td>
                          <td>{currency.format(Number(claim.amount_paid ?? 0))}</td>
                          <td>{claim.date || 'N/A'}</td>
                          <td>{claim.status || 'N/A'}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="10">No insurance claims matched the current filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
              ) : null}
            </article>
          </article>
        </div>
      ) : null}
    </section>
  )
}

function InsuranceSimpleSummarySection({ summary = {} }) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Simple View</p>
          <h3>Total monies claimed and amount paid</h3>
        </div>
      </div>

      <div className="report-summary-grid">
        <div className="report-summary-card">
          <span>Total Insurance Billing</span>
          <strong>{currency.format(Number(summary.total_claimed ?? 0))}</strong>
          <small>Insurance portions recorded against patient billing</small>
        </div>
        <div className="report-summary-card">
          <span>Submitted Externally</span>
          <strong>{currency.format(Number(summary.claimed_not_paid ?? 0))}</strong>
          <small>Marked after external platform submission</small>
        </div>
        <div className="report-summary-card">
          <span>Insurance Received</span>
          <strong>{currency.format(Number(summary.total_paid_received ?? 0))}</strong>
          <small>Receipts recorded in Insurance Payments</small>
        </div>
        <div className="report-summary-card">
          <span>Not Submitted Externally</span>
          <strong>{currency.format(Number(summary.pending_amount ?? 0))}</strong>
          <small>Insurance billing not yet marked as submitted</small>
        </div>
      </div>
    </article>
  )
}

function InsuranceManualRemittancesSection({ rows = [] }) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Manual Insurer Receipts</p>
          <h3>Payments received without patient-level allocation</h3>
        </div>
        <span className="panel-tag">{rows.length} receipts</span>
      </div>

      <div className="table-shell">
        <table className="portal-table report-table report-simple-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Date</th>
              <th>Amount Paid</th>
              <th>Reference</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={`manual-remittance-${row.id}`}>
                <td>{row.insurance_provider}</td>
                <td>{row.date || 'N/A'}</td>
                <td>{currency.format(Number(row.amount_paid ?? 0))}</td>
                <td>{row.reference || 'N/A'}</td>
                <td>{row.notes || 'N/A'}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5">No manual insurer receipts were recorded for this filter set.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function InsuranceReportBreakdownTable({ eyebrow, title, rows = [] }) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <span className="panel-tag">{rows.length} rows</span>
      </div>

      <div className="table-shell">
        <table className="portal-table report-table report-simple-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Claim Count</th>
              <th>Total Value</th>
              <th>Not Submitted</th>
              <th>Submitted Externally</th>
              <th>Legacy Paid Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={`${title}-${row.label}`}>
                <td>{row.label}</td>
                <td>{row.claim_count}</td>
                <td>{currency.format(Number(row.total_amount ?? 0))}</td>
                <td>{currency.format(Number(row.pending_amount ?? 0))}</td>
                <td>{currency.format(Number(row.claimed_amount ?? 0))}</td>
                <td>{currency.format(Number(row.paid_amount ?? 0))}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="6">No grouped insurance data is available for this section.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function describeInsuranceFilters(filters = {}) {
  return [
    {
      label: 'Search scope',
      value: filters.search || 'All matching claims',
      note: 'Patient, folder ID, provider, organization, package, or policy search',
    },
    {
      label: 'Provider filter',
      value: filters.provider || 'All providers',
      note: 'Insurer scope applied to this report',
    },
    {
      label: 'Status filter',
      value: filters.status || 'All statuses',
      note: 'Pending, claimed, and paid claims included unless narrowed',
    },
    {
      label: 'Date window',
      value: [filters.date_from || 'Beginning', filters.date_to || 'Today'].join(' to '),
      note: 'Claim date range used for the report',
    },
  ]
}

function formatReportDateTime(value) {
  if (!value) return 'just now'
  const parsed = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function slugify(value) {
  return String(value ?? 'report')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function createInsuranceReportHtml(report, sections = defaultReportSections()) {
  const filtersHtml = describeInsuranceFilters(report.filters)
    .map((item) => `
      <div class="summary-card">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.note)}</small>
      </div>
    `)
    .join('')

  const summaryCards = [
    ['Total Insurance Billing', currency.format(Number(report.simple_summary?.total_claimed ?? 0)), 'Insurance portions recorded against patient billing'],
    ['Submitted Externally', currency.format(Number(report.simple_summary?.claimed_not_paid ?? 0)), 'Marked after submission through the external insurer platform'],
    ['Insurance Received', currency.format(Number(report.simple_summary?.total_paid_received ?? 0)), 'Insurer receipts entered in Insurance Payments'],
    ['Not Submitted Externally', currency.format(Number(report.simple_summary?.pending_amount ?? 0)), 'Insurance billing not yet marked as submitted'],
    ['Claims matched', String(report.summary?.claim_count ?? 0), 'Detailed rows included below'],
    ['Average claim', currency.format(Number(report.summary?.average_claim_amount ?? 0)), 'Mean value across the filtered claims'],
  ]
    .map(([label, value, note]) => `
      <div class="summary-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(note)}</small>
      </div>
    `)
    .join('')

  const buildBreakdownSection = (title, rows) => `
    <section class="sheet">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Claim Count</th>
            <th>Total Value</th>
            <th>Not Submitted</th>
            <th>Submitted Externally</th>
            <th>Legacy Paid Status</th>
          </tr>
        </thead>
        <tbody>
          ${(rows ?? []).length ? (rows ?? []).map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${escapeHtml(row.claim_count)}</td>
              <td>${escapeHtml(currency.format(Number(row.total_amount ?? 0)))}</td>
              <td>${escapeHtml(currency.format(Number(row.pending_amount ?? 0)))}</td>
              <td>${escapeHtml(currency.format(Number(row.claimed_amount ?? 0)))}</td>
              <td>${escapeHtml(currency.format(Number(row.paid_amount ?? 0)))}</td>
            </tr>
          `).join('') : `
            <tr><td colspan="6">No grouped insurance data is available for this section.</td></tr>
          `}
        </tbody>
      </table>
    </section>
  `

  const manualRemittanceRows = (report.manual_remittances ?? []).length ? (report.manual_remittances ?? []).map((row) => `
    <tr>
      <td>${escapeHtml(row.insurance_provider || 'N/A')}</td>
      <td>${escapeHtml(row.date || 'N/A')}</td>
      <td>${escapeHtml(currency.format(Number(row.amount_paid ?? 0)))}</td>
      <td>${escapeHtml(row.reference || 'N/A')}</td>
      <td>${escapeHtml(row.notes || 'N/A')}</td>
    </tr>
  `).join('') : '<tr><td colspan="5">No manual insurer receipts were recorded for this filter set.</td></tr>'

  const simpleSummaryCards = [
    ['Total Insurance Billing', currency.format(Number(report.simple_summary?.total_claimed ?? 0)), 'Insurance portions recorded against patient billing'],
    ['Submitted Externally', currency.format(Number(report.simple_summary?.claimed_not_paid ?? 0)), 'Marked after submission through the external insurer platform'],
    ['Insurance Received', currency.format(Number(report.simple_summary?.total_paid_received ?? 0)), 'Insurer receipts recorded in Insurance Payments'],
    ['Not Submitted Externally', currency.format(Number(report.simple_summary?.pending_amount ?? 0)), 'Insurance billing not yet marked as submitted'],
  ].map(([label, value, note]) => `
      <div class="summary-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(note)}</small>
      </div>
    `).join('')

  const claimsRows = (report.claims ?? []).length ? (report.claims ?? []).map((claim) => `
    <tr>
      <td>${escapeHtml(claim.patient_name || claim.name || 'Unknown patient')}</td>
      <td>${escapeHtml(claim.folder_id || 'N/A')}</td>
      <td>${escapeHtml(claim.insurance_provider || 'N/A')}</td>
      <td>${escapeHtml(claim.insurance_number || 'N/A')}</td>
      <td>${escapeHtml(claim.insurance_package || 'N/A')}</td>
      <td>${escapeHtml(claim.patient_organization || 'N/A')}</td>
      <td>${escapeHtml(claim.billing_id || 'N/A')}</td>
      <td>${escapeHtml(currency.format(Number(claim.amount_paid ?? 0)))}</td>
      <td>${escapeHtml(claim.date || 'N/A')}</td>
      <td>${escapeHtml(claim.status || 'N/A')}</td>
    </tr>
  `).join('') : '<tr><td colspan="10">No insurance claims matched the current filters.</td></tr>'

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Insurance Claims Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
        .hero { display: grid; gap: 6px; margin-bottom: 18px; }
        .hero strong { font-size: 22px; }
        .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 16px 0 22px; }
        .summary-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px 14px; background: #f8fafc; }
        .summary-card span { display: block; font-size: 12px; color: #475569; text-transform: uppercase; }
        .summary-card strong { display: block; margin-top: 8px; font-size: 18px; }
        .summary-card small { display: block; margin-top: 8px; color: #64748b; }
        .sheet { margin-top: 22px; }
        h2 { margin: 0 0 12px; font-size: 18px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; font-size: 12px; }
        th { background: #e2e8f0; }
        @media print { body { margin: 12px; } .sheet { break-inside: avoid; } }
      </style>
    </head>
    <body>
      <div class="hero">
        <strong>BEALET OPTICAL CENTER</strong>
        <span>Insurance Claims Report</span>
        <span>${escapeHtml(report.branch_name || 'Branch')} | Generated ${escapeHtml(formatReportDateTime(report.generated_at))}</span>
      </div>

      <div class="grid">${filtersHtml}</div>
      <div class="grid">${summaryCards}</div>

      ${sections.simple_summary ? `<section class="sheet"><h2>Simple Claimed vs Paid View</h2><div class="grid">${simpleSummaryCards}</div></section>` : ''}
      ${sections.provider_breakdown ? buildBreakdownSection('Provider Breakdown', report.provider_breakdown) : ''}
      ${sections.package_breakdown ? buildBreakdownSection('Package Breakdown', report.package_breakdown) : ''}
      ${sections.organization_breakdown ? buildBreakdownSection('Organization Breakdown', report.organization_breakdown) : ''}
      ${sections.manual_remittances ? `
      <section class="sheet">
        <h2>Manual Insurer Receipts</h2>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Date</th>
              <th>Amount Paid</th>
              <th>Reference</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${manualRemittanceRows}</tbody>
        </table>
      </section>` : ''}

      ${sections.claim_detail ? `<section class="sheet">
        <h2>Claim Detail</h2>
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Folder ID</th>
              <th>Provider</th>
              <th>Policy No</th>
              <th>Package</th>
              <th>Organization</th>
              <th>Billing ID</th>
              <th>Claim Amount</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${claimsRows}</tbody>
        </table>
      </section>` : ''}
    </body>
  </html>`
}
