import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

function hasBalanceDue(amount) {
  return Number(amount ?? 0) > 0.0005
}

export default function BillingSection({
  session,
  billingMeta,
  billingData,
  dailyPayments,
  billingPatientSearch,
  setBillingPatientSearch,
  billingPatientResults,
  isSearchingBillingPatients,
  billingFilters,
  setBillingFilters,
  setBillingQuery,
  billingForm,
  setBillingForm,
  saveBillingRecord,
  isSavingBill,
  isLoadingBilling,
  isLoadingBillingMeta,
  isLoadingPayments,
  selectedPaymentRecordId,
  setSelectedPaymentRecordId,
  paymentDetail,
  isLoadingPaymentDetail,
  openBillingPayment,
  billingError,
  billingSuccess,
  dailyPaymentSearch,
  setDailyPaymentSearch,
  saveBillingPricing,
  exportBillingData,
}) {
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false)
  const [isBillingSummaryOpen, setIsBillingSummaryOpen] = useState(false)
  const [pricingForm, setPricingForm] = useState({
    consultation_price: '100.00',
    existing_consultation_price: '80.00',
    frame_price: '0.00',
    lens_price: '0.00',
    case_price: '0.00',
  })
  const [isSavingPricing, setIsSavingPricing] = useState(false)
  const isManagementView = Boolean(session?.is_admin || ['manager', 'ceo', 'accountant'].includes(session?.role))
  const normalizedFrameItems = useMemo(
    () => normalizeBillingFrameItems(billingForm.frame_items, billingForm.frame_code_id, billingForm.frame_price),
    [billingForm.frame_items, billingForm.frame_code_id, billingForm.frame_price],
  )
  const normalizedLensItems = useMemo(
    () => normalizeBillingLensItems(billingForm.lens_items, billingForm.lens_price),
    [billingForm.lens_items, billingForm.lens_price],
  )
  const frameWarnings = useMemo(
    () => normalizedFrameItems.map((item) => validateFrameItem(item, billingMeta)),
    [normalizedFrameItems, billingMeta],
  )
  const calculation = calculateBillingTotals({
    ...billingForm,
    frame_items: normalizedFrameItems,
    lens_items: normalizedLensItems,
  })
  const isSummaryReady = paymentDetail?.billing?.id === selectedPaymentRecordId
  const selectedFrameProduct = null
  const framePriceWarning = ''
  const setFramePriceWarning = () => {}

  const filteredCandidates = useMemo(() => {
    const query = billingPatientSearch.trim().toLowerCase()
    if (query.length >= 1) return billingPatientResults ?? []
    if (!query) return billingMeta?.patient_candidates ?? []

    return (billingMeta?.patient_candidates ?? []).filter((candidate) =>
      [candidate.name, candidate.folder_id, candidate.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [billingMeta, billingPatientResults, billingPatientSearch])

  useEffect(() => {
    if (billingSuccess) {
      setIsBillingModalOpen(false)
      setBillingPatientSearch('')
    }
  }, [billingSuccess])

  useEffect(() => {
    if (!billingMeta?.standard_prices) return
    setPricingForm({
      consultation_price: String(Number(billingMeta.standard_prices.consultation_price ?? 100).toFixed(2)),
      existing_consultation_price: String(Number(billingMeta.standard_prices.existing_consultation_price ?? 80).toFixed(2)),
      frame_price: String(Number(billingMeta.standard_prices.frame_price ?? 0).toFixed(2)),
      lens_price: String(Number(billingMeta.standard_prices.lens_price ?? 0).toFixed(2)),
      case_price: String(Number(billingMeta.standard_prices.case_price ?? 0).toFixed(2)),
    })
  }, [billingMeta])

  async function submitPricing(event) {
    event.preventDefault()
    setIsSavingPricing(true)
    try {
      await saveBillingPricing(pricingForm)
    } finally {
      setIsSavingPricing(false)
    }
  }

  return (
    <section className="billing-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Billing</p>
          <h3>{isManagementView ? 'Lead billing performance across both branches' : 'Process bills, track balances, and watch daily payments'}</h3>
          <p className="header-copy">
            {isManagementView
              ? 'A general-manager billing workspace with branch-wide oversight, export-ready ledgers, and configurable front-desk pricing.'
              : 'Built from the legacy receptionist billing pages with tax calculation, frame validation, and payment visibility.'}
          </p>
        </div>
      </div>

      {billingError ? <div className="message-banner error">{billingError}</div> : null}
      {billingSuccess ? <div className="message-banner success">{billingSuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        {isManagementView ? (
          <>
            <StatWidget label="Total Bills" value={billingData?.stats.total_bills ?? '...'} note="All billing records in the selected branch view" icon="receipt" className="total" />
            <StatWidget label="Filtered Value" value={currency.format(Number(billingData?.stats.filtered_total_amount ?? 0))} note="Billed amount inside the active manager filters" icon="money" className="seen" />
            <StatWidget label="Collected Value" value={currency.format(Number(billingData?.stats.filtered_collected_amount ?? 0))} note="Already realized from the filtered billing ledger" icon="check-badge" className="seen" />
            <StatWidget
              label="Outstanding"
              value={currency.format(Number(billingData?.stats.filtered_outstanding_amount ?? billingData?.stats.balance_amount ?? 0))}
              note="Still open for recovery"
              icon="finance"
              className="pending"
              valueClassName={hasBalanceDue(billingData?.stats.filtered_outstanding_amount ?? billingData?.stats.balance_amount) ? 'billing-balance-due' : ''}
            />
          </>
        ) : (
          <>
            <StatWidget label="Total Bills" value={billingData?.stats.total_bills ?? '...'} note="Billing records for the active branch" icon="receipt" className="total" />
            <StatWidget label="Total Amount" value={currency.format(Number(billingData?.stats.total_amount ?? 0))} note="Gross billed value" icon="money" className="seen" />
            <StatWidget label="Pending Bills" value={billingData?.stats.pending_bills ?? '...'} note="Pending or balance remaining" icon="clock" className="pending" />
            <StatWidget
              label="Calculated Balance"
              value={currency.format(Number(billingData?.stats.balance_amount ?? 0))}
              note="Based on sales and insurance claims"
              icon="finance"
              className="today"
              valueClassName={hasBalanceDue(billingData?.stats.balance_amount) ? 'billing-balance-due' : ''}
            />
          </>
        )}
      </section>

      {isManagementView ? (
        <ManagerBillingWorkspace
          billingMeta={billingMeta}
          billingData={billingData}
          billingFilters={billingFilters}
          setBillingFilters={setBillingFilters}
          setBillingQuery={setBillingQuery}
          isLoadingBilling={isLoadingBilling}
          setSelectedPaymentRecordId={setSelectedPaymentRecordId}
          setIsBillingSummaryOpen={setIsBillingSummaryOpen}
          openBillingPayment={openBillingPayment}
          setIsBillingModalOpen={setIsBillingModalOpen}
          pricingForm={pricingForm}
          setPricingForm={setPricingForm}
          submitPricing={submitPricing}
          isSavingPricing={isSavingPricing}
          exportBillingData={exportBillingData}
        />
      ) : (
      <>
      <article className="panel billing-workflow-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Reception Workflow</p>
            <h3>Billing comes first, payment comes after</h3>
          </div>
        </div>
        <div className="billing-workflow-grid">
          <div className="billing-workflow-step">
            <strong>1. Create bill</strong>
            <p>Prepare consultation, lenses, frames, tax, and discounts to generate the patient bill.</p>
          </div>
          <div className="billing-workflow-step">
            <strong>2. Review summary</strong>
            <p>Open the billing summary from the ledger to confirm total billed, amount paid, and outstanding balance.</p>
          </div>
          <div className="billing-workflow-step">
            <strong>3. Record payment</strong>
            <p>Once the patient is ready to pay, move to payment capture for cash, MoMo, Paystack, or insurance.</p>
          </div>
        </div>
      </article>

      <section className="billing-ledger-stack">
        <article className="panel patient-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Manage Billing</p>
              <h3>Billing ledger</h3>
            </div>
            <button type="button" className="primary-button" onClick={() => setIsBillingModalOpen(true)}>
              New billing record
            </button>
          </div>

          <form
            className="patient-filter-grid"
            onSubmit={(event) => {
              event.preventDefault()
              setBillingQuery((current) => ({
                ...current,
                ...billingFilters,
                page: 1,
              }))
            }}
          >
            <label>
              Search
              <input
                value={billingFilters.search}
                onChange={(event) => setBillingFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Folder ID, name, receipt, phone"
              />
            </label>
            <label>
              Status
              <select
                value={billingFilters.status}
                onChange={(event) => setBillingFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="balance_remaining">Balance remaining</option>
              </select>
            </label>
            <label>
              Date from
              <input
                type="date"
                value={billingFilters.date_from}
                onChange={(event) => setBillingFilters((current) => ({ ...current, date_from: event.target.value }))}
              />
            </label>
            <label>
              Date to
              <input
                type="date"
                value={billingFilters.date_to}
                onChange={(event) => setBillingFilters((current) => ({ ...current, date_to: event.target.value }))}
              />
            </label>

            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Apply date and status filters</button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const defaults = { status: 'all', search: '', date_from: '', date_to: '', page: 1, per_page: 15 }
                  setBillingFilters(defaults)
                  setBillingQuery(defaults)
                }}
              >
                Reset
              </button>
            </div>
          </form>

          {isLoadingBilling && !billingData ? <p className="muted-copy">Loading billing records...</p> : null}

          {billingData ? (
            <>
              <div className="table-shell">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Folder ID</th>
                      <th>Receipt</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th>Discount</th>
                      <th>Paid</th>
                      <th>Insurance Claimed</th>
                      <th>Balance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingData.records.map((record) => (
                      <tr key={record.id} className={record.id === selectedPaymentRecordId && isBillingSummaryOpen ? 'table-row-active' : ''}>
                        <td>{record.name}</td>
                        <td>{record.folder_id}</td>
                        <td>{record.receipt_number || 'No receipt yet'}</td>
                        <td>{record.date}</td>
                        <td>
                          <span className={`status-pill status-${String(record.status).toLowerCase().replaceAll(' ', '-')}`}>
                            {record.status}
                          </span>
                        </td>
                        <td>{currency.format(Number(record.total_amount ?? 0))}</td>
                        <td>{currency.format(Number(record.discount ?? 0))}</td>
                        <td>{currency.format(Number(record.total_paid ?? 0))}</td>
                        <td>{currency.format(Number(record.insurance_claimed ?? 0))}</td>
                        <td className={hasBalanceDue(record.calculated_balance) ? 'billing-balance-due' : undefined}>
                          {currency.format(Number(record.calculated_balance ?? 0))}
                        </td>
                        <td>
                          <div className="billing-row-actions">
                            <button
                              type="button"
                              className="mini-action"
                              onClick={() => {
                                setSelectedPaymentRecordId(record.id)
                                setIsBillingSummaryOpen(true)
                              }}
                            >
                              View summary
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination-bar">
                <span>Page {billingData.pagination.page} of {Math.max(billingData.pagination.total_pages, 1)}</span>
                <div className="pagination-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={billingData.pagination.page <= 1}
                    onClick={() => setBillingQuery((current) => ({ ...current, page: current.page - 1 }))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={billingData.pagination.page >= billingData.pagination.total_pages}
                    onClick={() => setBillingQuery((current) => ({ ...current, page: current.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </article>
      </section>

      <article className="panel patient-list-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Daily Payments</p>
            <h3>Transactions collected today</h3>
          </div>
        </div>

        <div className="filter-actions-row">
          <input
            className="billing-search-inline"
            value={dailyPaymentSearch}
            onChange={(event) => setDailyPaymentSearch(event.target.value)}
            placeholder="Search patient, folder, or sale ID"
          />
        </div>

        {isLoadingPayments && !dailyPayments ? <p className="muted-copy">Loading daily payments...</p> : null}

        {dailyPayments ? (
          <>
            <div className="payment-summary-row">
              <span>Total collected: {currency.format(Number(dailyPayments.stats.total_collected ?? 0))}</span>
              <span>Transactions: {dailyPayments.stats.transaction_count}</span>
              <span>Average: {currency.format(Number(dailyPayments.stats.average_transaction ?? 0))}</span>
            </div>
            <div className="patient-records">
              {dailyPayments.payments.map((payment) => (
                <article key={payment.id} className="patient-record">
                  <div className="patient-record-top">
                    <div>
                      <strong>{payment.name || 'No patient name'}</strong>
                      <span>Sale #{payment.id} - {payment.folder_id}</span>
                    </div>
                    <span className="status-pill status-paid">{payment.payment_method}</span>
                  </div>
                  <div className="patient-record-meta">
                    <span>Amount: {currency.format(Number(payment.amount_paid ?? 0))}</span>
                    <span>Created: {payment.created_at}</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </article>
      </>
      )}

      {isBillingModalOpen ? (
        <div className="modal-overlay" onClick={() => setIsBillingModalOpen(false)}>
          <article className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Create Bill</p>
                <h3>New billing record</h3>
              </div>
              <div className="modal-actions">
                <span className="panel-tag">{billingForm.folder_id || 'Billing form'}</span>
                <button type="button" className="ghost-button" onClick={() => setIsBillingModalOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <form className="billing-form-grid" onSubmit={saveBillingRecord}>
              <label className="full-span">
                Search patient
                <input
                  value={billingPatientSearch}
                  onChange={(event) => setBillingPatientSearch(event.target.value)}
                  placeholder="Search any patient by name, folder ID, phone, or email"
                />
              </label>
              {billingPatientSearch.trim().length >= 1 ? (
                <p className="muted-copy full-span">Search results update as you type from the patient database.</p>
              ) : (
                <p className="muted-copy full-span">Start typing to search the patient database, or pick from recent patient candidates below.</p>
              )}
              {billingPatientSearch.trim().length >= 1 && isSearchingBillingPatients ? (
                <p className="muted-copy full-span">Searching patient records...</p>
              ) : null}
              <label className="full-span">
                Patient / folder
                <select
                  value={billingForm.patient_id ? String(billingForm.patient_id) : ''}
                  onChange={(event) => {
                    const selected = filteredCandidates.find(
                      (candidate) => String(candidate.id) === event.target.value,
                    )
                    setBillingForm((current) => ({
                      ...current,
                      patient_id: selected?.id ?? '',
                      folder_id: selected?.folder_id ?? '',
                      name: selected?.name ?? '',
                      prescription_id: selected?.prescription_id ?? '',
                      consultation_customer_type: selected?.is_existing_customer ? 'existing' : 'new',
                      frame_code_id: '',
                      frame_price: '0.00',
                      frame_items: [createBlankFrameItem()],
                      lens_price: Number(selected?.lens_price ?? billingMeta?.standard_prices?.lens_price ?? 0).toFixed(2),
                      lens_items: [{ amount: Number(selected?.lens_price ?? billingMeta?.standard_prices?.lens_price ?? 0).toFixed(2) }],
                      consultation_price: String(resolveConsultationPrice(selected, billingMeta)),
                    }))
                  }}
                  required
                >
                  <option value="">Select patient</option>
                  {filteredCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} - {candidate.folder_id}
                    </option>
                  ))}
                </select>
              </label>
              {billingPatientSearch && filteredCandidates.length === 0 ? (
                <p className="muted-copy full-span">No patients match that search in the patient database yet.</p>
              ) : null}

              <label>
                Billing date
                <input
                  type="date"
                  value={billingForm.date}
                  onChange={(event) => setBillingForm((current) => ({ ...current, date: event.target.value }))}
                  required
                />
              </label>
              <label>
                Patient name
                <input
                  value={billingForm.name}
                  onChange={(event) => setBillingForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>
              <label>
                Consultation type
                <select
                  value={billingForm.consultation_customer_type}
                  onChange={(event) =>
                    setBillingForm((current) => ({
                      ...current,
                      consultation_customer_type: event.target.value,
                      consultation_price:
                        event.target.value === 'existing'
                          ? Number(billingMeta?.standard_prices?.existing_consultation_price ?? 80).toFixed(2)
                          : Number(billingMeta?.standard_prices?.consultation_price ?? 100).toFixed(2),
                    }))
                  }
                >
                  <option value="new">New customer</option>
                  <option value="existing">Existing customer</option>
                </select>
              </label>
              <label>
                Consultation
                <input
                  type="number"
                  step="0.01"
                  value={billingForm.consultation_price}
                  onChange={(event) =>
                    setBillingForm((current) => ({ ...current, consultation_price: event.target.value }))
                  }
                />
              </label>
              <div className="full-span billing-line-items-block">
                <div className="billing-line-items-header">
                  <div>
                    <strong>Lens entries</strong>
                    <p className="muted-copy">Add one or more lens charges. The database will keep them as one combined lens total for this bill.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      setBillingForm((current) => ({
                        ...current,
                        lens_items: [...normalizeBillingLensItems(current.lens_items, current.lens_price), createBlankLensItem()],
                      }))
                    }
                  >
                    Add lens
                  </button>
                </div>
                <div className="billing-line-items-list">
                  {normalizedLensItems.map((item, index) => (
                    <div key={`lens-item-${index}`} className="billing-line-item-row">
                      <label>
                        Lens {index + 1}
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount}
                          onChange={(event) =>
                            setBillingForm((current) => ({
                              ...current,
                              lens_items: normalizeBillingLensItems(current.lens_items, current.lens_price).map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, amount: event.target.value } : entry,
                              ),
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="mini-action"
                        onClick={() =>
                          setBillingForm((current) => ({
                            ...current,
                            lens_items: removeLensItem(current, index),
                          }))
                        }
                        disabled={normalizedLensItems.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="billing-line-items-total">
                  <span>Lens total</span>
                  <strong>{currency.format(sumLensItems(normalizedLensItems))}</strong>
                </div>
              </div>
              <label>
                Case
                <input
                  type="number"
                  step="0.01"
                  value={billingForm.case_price}
                  onChange={(event) =>
                    setBillingForm((current) => ({ ...current, case_price: event.target.value }))
                  }
                />
              </label>
              <label>
                Discount
                <input
                  type="number"
                  step="0.01"
                  value={billingForm.discount}
                  onChange={(event) =>
                    setBillingForm((current) => ({ ...current, discount: event.target.value }))
                  }
                />
              </label>
              <label>
                Insurance
                <select
                  value={billingForm.health_insurance}
                  onChange={(event) =>
                    setBillingForm((current) => ({ ...current, health_insurance: event.target.value }))
                  }
                >
                  {(billingMeta?.insurance_options ?? ['NONE']).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              {false ? (
              <>
              <label>
                Frame code legacy
                <select
                  value={billingForm.frame_code_id}
                  onChange={(event) => {
                    const nextCode = event.target.value
                    const nextFramePrice = resolveFramePrice(nextCode, billingMeta)
                    const nextForm = {
                      ...billingForm,
                      frame_code_id: nextCode,
                      frame_price: nextFramePrice,
                    }
                    setBillingForm(nextForm)
                    setFramePriceWarning(validateFramePrice(nextForm, billingMeta))
                  }}
                >
                  <option value="">No frame</option>
                  {(billingMeta?.frame_products ?? []).map((product) => (
                    <option key={product.code} value={product.code}>
                      {formatFrameOptionLabel(product)}
                    </option>
                  ))}
                </select>
                {selectedFrameProduct ? (
                  <small className="billing-field-note">
                    {selectedFrameProduct.name} • {selectedFrameProduct.stock} in stock • Allowed range: {formatFrameRange(selectedFrameProduct)}
                  </small>
                ) : null}
              </label>
              <label>
                Frame price
                <input
                  type="number"
                  step="0.01"
                  className={framePriceWarning ? 'billing-field-error' : ''}
                  aria-invalid={framePriceWarning ? 'true' : 'false'}
                  value={billingForm.frame_price}
                  onChange={(event) => {
                    const nextForm = { ...billingForm, frame_price: event.target.value }
                    setBillingForm(nextForm)
                    setFramePriceWarning(validateFramePrice(nextForm, billingMeta))
                  }}
                  onBlur={() => {
                    setFramePriceWarning(validateFramePrice(billingForm, billingMeta))
                  }}
                />
                {framePriceWarning ? <small className="billing-field-warning">Frame price error: {framePriceWarning}</small> : null}
              </label>
              </>
              ) : (
              <div className="full-span billing-line-items-block">
                <div className="billing-line-items-header">
                  <div>
                    <strong>Frame entries</strong>
                    <p className="muted-copy">Select one or more frames. Each frame will still be stored in the existing frame-link table.</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      setBillingForm((current) => ({
                        ...current,
                        frame_items: [...normalizeBillingFrameItems(current.frame_items, current.frame_code_id, current.frame_price), createBlankFrameItem()],
                      }))
                    }
                  >
                    Add frame
                  </button>
                </div>
                <div className="billing-line-items-list">
                  {normalizedFrameItems.map((item, index) => {
                    const selectedFrameProductForRow = findFrameProduct(item.frame_code_id, billingMeta)
                    const warning = frameWarnings[index]

                    return (
                      <div key={`frame-item-${index}`} className="billing-line-item-row billing-line-item-row-frame">
                        <label>
                          Frame code
                          <select
                            value={item.frame_code_id}
                            onChange={(event) =>
                              setBillingForm((current) => ({
                                ...current,
                                frame_items: normalizeBillingFrameItems(current.frame_items, current.frame_code_id, current.frame_price).map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, frame_code_id: event.target.value, frame_price: resolveFramePrice(event.target.value, billingMeta) }
                                    : entry,
                                ),
                              }))
                            }
                          >
                            <option value="">No frame</option>
                            {(billingMeta?.frame_products ?? []).map((product) => (
                              <option key={`${product.code}-${index}`} value={product.code}>
                                {formatFrameOptionLabel(product)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Frame price
                          <input
                            type="number"
                            step="0.01"
                            className={warning ? 'billing-field-error' : ''}
                            aria-invalid={warning ? 'true' : 'false'}
                            value={item.frame_price}
                            onChange={(event) =>
                              setBillingForm((current) => ({
                                ...current,
                                frame_items: normalizeBillingFrameItems(current.frame_items, current.frame_code_id, current.frame_price).map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, frame_price: event.target.value } : entry,
                                ),
                              }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="mini-action"
                          onClick={() =>
                            setBillingForm((current) => ({
                              ...current,
                              frame_items: removeFrameItem(current, index),
                            }))
                          }
                          disabled={normalizedFrameItems.length <= 1}
                        >
                          Remove
                        </button>
                        {selectedFrameProductForRow ? (
                          <small className="billing-field-note full-span">
                            {selectedFrameProductForRow.name} • {selectedFrameProductForRow.stock} in stock • Allowed range: {formatFrameRange(selectedFrameProductForRow)}
                          </small>
                        ) : null}
                        {warning ? <small className="billing-field-warning full-span">Frame price error: {warning}</small> : null}
                      </div>
                    )
                  })}
                </div>
                <div className="billing-line-items-total">
                  <span>Frame total</span>
                  <strong>{currency.format(sumFrameItems(normalizedFrameItems))}</strong>
                </div>
              </div>
              )}

              <div className="billing-breakdown full-span">
                <div><span>Base amount</span><strong>{currency.format(calculation.baseAmount)}</strong></div>
                <div><span>NHIL</span><strong>{currency.format(calculation.nhil)}</strong></div>
                <div><span>GETFund</span><strong>{currency.format(calculation.getfund)}</strong></div>
                <div><span>VAT</span><strong>{currency.format(calculation.vat)}</strong></div>
                <div><span>Tax total</span><strong>{currency.format(calculation.tax)}</strong></div>
                <div><span>Grand total</span><strong>{currency.format(calculation.totalAmount)}</strong></div>
              </div>

              <button type="submit" className="primary-button full-span" disabled={isSavingBill || isLoadingBillingMeta}>
                {isSavingBill ? 'Submitting bill...' : 'Submit bill'}
              </button>
            </form>
          </article>
        </div>
      ) : null}

      {isBillingSummaryOpen ? (
        <div
          className="modal-overlay"
          onClick={() => {
            setIsBillingSummaryOpen(false)
          }}
        >
          <article className="modal-panel billing-summary-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Billing Summary</p>
                <h3>{paymentDetail?.billing?.name || 'Loading selected bill...'}</h3>
              </div>
              <div className="modal-actions">
                <span className="panel-tag">{paymentDetail?.billing?.folder_id || 'Summary'}</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setIsBillingSummaryOpen(false)
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            {isLoadingPaymentDetail ? <p className="muted-copy">Loading billing summary...</p> : null}

            {isSummaryReady ? (
              <div className="billing-summary-stack">
                <div className="billing-summary-note">
                  <strong>Billing breakdown</strong>
                  <p>See how this bill was composed before reviewing payments and outstanding balance.</p>
                </div>

                <div className="billing-summary-grid">
                  <SummaryMetric label="Consultation" value={paymentDetail.billing.consultation_price} />
                  <SummaryMetric label="Frame" value={paymentDetail.billing.frame_price} />
                  <SummaryMetric label="Lens" value={paymentDetail.billing.lens_price} />
                  <SummaryMetric label="Case" value={paymentDetail.billing.case_price} />
                  <SummaryMetric label="Discount" value={paymentDetail.billing.discount} />
                  <SummaryMetric label="Total bill" value={paymentDetail.billing.total_amount} />
                </div>

                <div className="billing-summary-grid">
                  <SummaryMetric label="Paid so far" value={paymentDetail.billing.total_paid} />
                  <SummaryMetric label="Cash paid" value={paymentDetail.billing.cash_paid} />
                  <SummaryMetric label="MoMo paid" value={paymentDetail.billing.mobile_paid} />
                  <SummaryMetric label="Paystack paid" value={paymentDetail.billing.paystack_paid} />
                  <SummaryMetric label="Insurance claimed" value={paymentDetail.billing.insurance_claimed} />
                  <SummaryMetric label="Outstanding" value={paymentDetail.billing.calculated_balance} balanceHighlight />
                </div>

                <div className="billing-summary-note">
                  <strong>Billing summary</strong>
                  <p>This bill has already been created. Use payment capture next to collect or log the patient payment.</p>
                </div>

                <div className="table-shell">
                  <table className="portal-table">
                    <thead>
                      <tr>
                        <th>Entry</th>
                        <th>Method</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(paymentDetail.recent_transactions ?? []).map((transaction) => (
                        <tr key={`${transaction.entry_type}-${transaction.id}`}>
                          <td>{transaction.entry_label || transaction.entry_type || 'Payment'}</td>
                          <td>{transaction.payment_method}</td>
                          <td>{transaction.date}</td>
                          <td>{currency.format(Number(transaction.amount_paid ?? 0))}</td>
                          <td>{transaction.reference || transaction.transaction_id || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="billing-summary-note">
                  <strong>Previous billing payments</strong>
                  <p>
                    Earlier payments recorded for this patient&apos;s older bills:{' '}
                    {currency.format(Number(paymentDetail.previous_billing_summary?.total_paid ?? 0))} across{' '}
                    {Number(paymentDetail.previous_billing_summary?.transaction_count ?? 0)} entries.
                  </p>
                </div>

                <div className="table-shell">
                  <table className="portal-table">
                    <thead>
                      <tr>
                        <th>Previous bill</th>
                        <th>Entry</th>
                        <th>Method</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(paymentDetail.previous_billing_transactions ?? []).length ? (
                        (paymentDetail.previous_billing_transactions ?? []).map((transaction) => (
                          <tr key={`previous-${transaction.entry_type}-${transaction.id}-${transaction.billing_id}`}>
                            <td>{transaction.billing_receipt_number || transaction.billing_folder_id || `Billing #${transaction.billing_id}`}</td>
                            <td>{transaction.entry_label || transaction.entry_type || 'Payment'}</td>
                            <td>{transaction.payment_method}</td>
                            <td>{transaction.date}</td>
                            <td>{currency.format(Number(transaction.amount_paid ?? 0))}</td>
                            <td>{transaction.reference || transaction.transaction_id || 'N/A'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6">
                            <p className="muted-copy">No earlier payments were found for previous billing records linked to this patient.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => printBillingSummarySlip(paymentDetail, billingMeta)}
                  >
                    Thermal print
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      setIsBillingSummaryOpen(false)
                      openBillingPayment(paymentDetail.billing.id)
                    }}
                  >
                    Continue to payment
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted-copy">{selectedPaymentRecordId ? 'Preparing billing summary...' : 'Select a billing record to view its summary.'}</p>
            )}
          </article>
        </div>
      ) : null}
    </section>
  )
}

function ManagerBillingWorkspace({
  billingMeta,
  billingData,
  billingFilters,
  setBillingFilters,
  setBillingQuery,
  isLoadingBilling,
  setSelectedPaymentRecordId,
  setIsBillingSummaryOpen,
  openBillingPayment,
  setIsBillingModalOpen,
  pricingForm,
  setPricingForm,
  submitPricing,
  isSavingPricing,
  exportBillingData,
}) {
  const stats = billingData?.stats ?? {}

  return (
    <section className="manager-billing-shell">
      <article className="panel manager-billing-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Manager Dashboard</p>
            <h3>Billing performance, branch flow, and ledger control</h3>
            <p className="muted-copy">
              Monitor billing across the selected branch scope, export the ledger, and guide front-desk pricing from one place.
            </p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={() => exportBillingData('summary')}>Export summary</button>
            <button type="button" className="ghost-button" onClick={() => exportBillingData('ledger')}>Export ledger CSV</button>
            <button type="button" className="primary-button" onClick={() => setIsBillingModalOpen(true)}>New billing record</button>
          </div>
        </div>

        <div className="patient-manager-hero">
          <div>
            <span className="patient-intake-kicker">Billing Oversight</span>
            <strong>Use the billing desk as an operations view for revenue capture, branch mix, insurance load, and pricing control.</strong>
          </div>
          <div className="patient-intake-highlights">
            <span>Branch-aware ledger</span>
            <span>Export-ready records</span>
            <span>Reception pricing control</span>
          </div>
        </div>

        <form
          className="patient-filter-grid"
          onSubmit={(event) => {
            event.preventDefault()
            setBillingQuery((current) => ({
              ...current,
              ...billingFilters,
              page: 1,
            }))
          }}
        >
          <label>
            Search
            <input
              value={billingFilters.search}
              onChange={(event) => setBillingFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Patient, folder, receipt, phone"
            />
          </label>
          <label>
            Status
            <select
              value={billingFilters.status}
              onChange={(event) => setBillingFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="balance_remaining">Balance remaining</option>
              <option value="insurance_pending">Insurance pending</option>
            </select>
          </label>
          <label>
            Date from
            <input type="date" value={billingFilters.date_from} onChange={(event) => setBillingFilters((current) => ({ ...current, date_from: event.target.value }))} />
          </label>
          <label>
            Date to
            <input type="date" value={billingFilters.date_to} onChange={(event) => setBillingFilters((current) => ({ ...current, date_to: event.target.value }))} />
          </label>
          <label>
            Rows per page
            <select value={billingFilters.per_page} onChange={(event) => setBillingFilters((current) => ({ ...current, per_page: Number(event.target.value) }))}>
              {[15, 25, 50].map((size) => <option key={size} value={size}>{size} rows</option>)}
            </select>
          </label>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button">Apply manager filters</button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const defaults = { status: 'all', search: '', date_from: '', date_to: '', page: 1, per_page: 15 }
                setBillingFilters(defaults)
                setBillingQuery(defaults)
              }}
            >
              Reset
            </button>
          </div>
        </form>

        <div className="finance-chip-row patient-manager-chip-row">
          <div className="finance-chip">
            <span>Average Bill</span>
            <strong>{currency.format(Number(stats.average_bill_value ?? 0))}</strong>
          </div>
          <div className="finance-chip">
            <span>Collection Rate</span>
            <strong>{formatPercent(stats.collection_rate ?? 0)}</strong>
          </div>
          <div className="finance-chip">
            <span>Insured Bills</span>
            <strong>{stats.insured_bill_count ?? 0} bills</strong>
          </div>
          <div className="finance-chip">
            <span>Insurance Value</span>
            <strong>{currency.format(Number(stats.insured_bill_value ?? 0))}</strong>
          </div>
        </div>
      </article>

      <div className="patient-manager-insights-grid">
        <article className="patient-insight-card tone-blue">
          <div className="patient-insight-card-header"><strong>Collection Health</strong></div>
          <div className="patient-insight-card-body">
            <InsightMetric label="Filtered Bills" value={billingData?.pagination?.total ?? 0} />
            <InsightMetric label="Pending Bills" value={stats.pending_bills ?? 0} />
            <InsightMetric label="Paid Bills" value={stats.paid_bills ?? 0} />
            <InsightMetric label="Today Bills" value={stats.today_bills ?? 0} />
          </div>
        </article>

        <article className="patient-insight-card tone-amber">
          <div className="patient-insight-card-header"><strong>Status Mix</strong></div>
          <div className="patient-insight-card-body">
            <BillingBreakdownList items={stats.status_breakdown} amountFormatter={currency.format} emptyLabel="No billing statuses yet" />
          </div>
        </article>

        <article className="patient-insight-card tone-teal">
          <div className="patient-insight-card-header"><strong>Branch Mix</strong></div>
          <div className="patient-insight-card-body">
            <BillingBreakdownList items={stats.branch_breakdown} amountFormatter={currency.format} emptyLabel="No branch mix yet" />
          </div>
        </article>
      </div>

      <article className="panel manager-billing-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Consultation Pricing</p>
            <h3>Control the prices reception can select</h3>
            <p className="muted-copy">
              Set different consultation prices for new and existing customers, plus default billing values for frames, lenses, and case items.
            </p>
          </div>
          <span className="panel-tag">{billingMeta?.branch_name ?? 'Billing settings'}</span>
        </div>

        <form className="patient-filter-grid" onSubmit={submitPricing}>
          <label>
            New customer consultation
            <input type="number" step="0.01" value={pricingForm.consultation_price} onChange={(event) => setPricingForm((current) => ({ ...current, consultation_price: event.target.value }))} />
          </label>
          <label>
            Existing customer consultation
            <input type="number" step="0.01" value={pricingForm.existing_consultation_price} onChange={(event) => setPricingForm((current) => ({ ...current, existing_consultation_price: event.target.value }))} />
          </label>
          <label>
            Default frame price
            <input type="number" step="0.01" value={pricingForm.frame_price} onChange={(event) => setPricingForm((current) => ({ ...current, frame_price: event.target.value }))} />
          </label>
          <label>
            Default lens price
            <input type="number" step="0.01" value={pricingForm.lens_price} onChange={(event) => setPricingForm((current) => ({ ...current, lens_price: event.target.value }))} />
          </label>
          <label>
            Default case price
            <input type="number" step="0.01" value={pricingForm.case_price} onChange={(event) => setPricingForm((current) => ({ ...current, case_price: event.target.value }))} />
          </label>
          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button" disabled={isSavingPricing}>
              {isSavingPricing ? 'Saving pricing...' : 'Save pricing'}
            </button>
          </div>
        </form>
      </article>

      <article className="panel manager-billing-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Billing Ledger</p>
            <h3>Comprehensive billing table</h3>
            <p className="muted-copy">Review branch, consultation split, insurance context, paid value, and outstanding balances in one export-ready ledger.</p>
          </div>
          <span className="panel-tag">{billingData?.pagination?.total ?? 0} rows in view</span>
        </div>

        {isLoadingBilling && !billingData ? <p className="muted-copy">Loading manager billing ledger...</p> : null}

        {billingData ? (
          <>
            <div className="table-shell">
              <table className="portal-table manager-billing-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Branch</th>
                    <th>Folder ID</th>
                    <th>Date</th>
                    <th>Receipt</th>
                    <th>Consultation</th>
                    <th>Frame</th>
                    <th>Lens</th>
                    <th>Case</th>
                    <th>Discount</th>
                    <th>Insurance</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billingData.records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <div className="patient-table-primary">
                          <strong>{record.name}</strong>
                          <span>{record.patient_phone || record.customer_phone || 'No contact'}</span>
                        </div>
                      </td>
                      <td>{record.branch_name}</td>
                      <td>{record.folder_id}</td>
                      <td>{record.date}</td>
                      <td>{record.receipt_number || 'Pending'}</td>
                      <td>{currency.format(Number(record.consultation_price ?? 0))}</td>
                      <td>{currency.format(Number(record.frame_price ?? 0))}</td>
                      <td>{currency.format(Number(record.lens_price ?? 0))}</td>
                      <td>{currency.format(Number(record.case_price ?? 0))}</td>
                      <td>{currency.format(Number(record.discount ?? 0))}</td>
                      <td>{record.health_insurance || 'NONE'}</td>
                      <td>{currency.format(Number(record.total_amount ?? 0))}</td>
                      <td>{currency.format(Number(record.total_paid ?? 0))}</td>
                      <td className={hasBalanceDue(record.calculated_balance) ? 'billing-balance-due' : undefined}>
                        {currency.format(Number(record.calculated_balance ?? 0))}
                      </td>
                      <td><span className={`status-pill status-${String(record.status).toLowerCase().replaceAll(' ', '-')}`}>{record.status}</span></td>
                      <td>
                        <div className="billing-row-actions">
                          <button
                            type="button"
                            className="mini-action"
                            onClick={() => {
                              setSelectedPaymentRecordId(record.id)
                              setIsBillingSummaryOpen(true)
                            }}
                          >
                            Summary
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination-bar">
              <span>Page {billingData.pagination.page} of {Math.max(billingData.pagination.total_pages, 1)}</span>
              <div className="pagination-actions">
                <button type="button" className="ghost-button" disabled={billingData.pagination.page <= 1} onClick={() => setBillingQuery((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
                <button type="button" className="ghost-button" disabled={billingData.pagination.page >= billingData.pagination.total_pages} onClick={() => setBillingQuery((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
              </div>
            </div>
          </>
        ) : null}
      </article>
    </section>
  )
}

function InsightMetric({ label, value }) {
  return (
    <div className="patient-insight-metric inline-metric-card">
      <span>{label}:</span>
      <strong>{value}</strong>
    </div>
  )
}

function BillingBreakdownList({ items, amountFormatter, emptyLabel }) {
  if (!items?.length) return <p className="muted-copy">{emptyLabel}</p>
  const total = items.reduce((sum, item) => sum + Number(item.count ?? 0), 0)

  return (
    <div className="patient-breakdown-list">
      {items.map((item) => (
        <div key={item.label} className="patient-breakdown-row">
          <div>
            <strong>{item.label}</strong>
            <span>{formatPercent(total > 0 ? (Number(item.count ?? 0) / total) * 100 : 0)} • {amountFormatter(Number(item.amount ?? 0))}</span>
          </div>
          <span>{item.count}</span>
        </div>
      ))}
    </div>
  )
}

function createBlankFrameItem() {
  return {
    frame_code_id: '',
    frame_price: '0.00',
  }
}

function createBlankLensItem() {
  return {
    amount: '0.00',
  }
}

function normalizeBillingFrameItems(items, legacyCode = '', legacyPrice = '0.00') {
  const normalized = Array.isArray(items)
    ? items.map((item) => ({
        frame_code_id: String(item?.frame_code_id || '').trim(),
        frame_price: item?.frame_price ?? '0.00',
      }))
    : []

  if (normalized.length > 0) {
    return normalized
  }

  const legacyFrameCode = String(legacyCode || '').trim()
  return legacyFrameCode ? [{ frame_code_id: legacyFrameCode, frame_price: legacyPrice ?? '0.00' }] : [createBlankFrameItem()]
}

function normalizeBillingLensItems(items, legacyLensPrice = '0.00') {
  const normalized = Array.isArray(items)
    ? items.map((item) => ({
        amount: item?.amount ?? '0.00',
      }))
    : []

  if (normalized.length > 0) {
    return normalized
  }

  return [{ amount: legacyLensPrice ?? '0.00' }]
}

function removeFrameItem(form, indexToRemove) {
  const remaining = normalizeBillingFrameItems(form.frame_items, form.frame_code_id, form.frame_price).filter((_, index) => index !== indexToRemove)
  return remaining.length > 0 ? remaining : [createBlankFrameItem()]
}

function removeLensItem(form, indexToRemove) {
  const remaining = normalizeBillingLensItems(form.lens_items, form.lens_price).filter((_, index) => index !== indexToRemove)
  return remaining.length > 0 ? remaining : [createBlankLensItem()]
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function sumFrameItems(items) {
  return roundMoney(items.reduce((sum, item) => sum + Number(item?.frame_price || 0), 0))
}

function sumLensItems(items) {
  return roundMoney(items.reduce((sum, item) => sum + Number(item?.amount || 0), 0))
}

function calculateBillingTotals(form) {
  const consultation = roundMoney(form.consultation_price || 0)
  const frame = sumFrameItems(normalizeBillingFrameItems(form.frame_items, form.frame_code_id, form.frame_price))
  const lens = sumLensItems(normalizeBillingLensItems(form.lens_items, form.lens_price))
  const billingCase = roundMoney(form.case_price || 0)
  const discount = roundMoney(form.discount || 0)
  const subtotal = roundMoney(consultation + frame + lens + billingCase)
  const baseAmount = subtotal > 0 ? roundMoney(subtotal / 1.2) : 0
  const nhil = roundMoney(baseAmount * 0.025)
  const getfund = roundMoney(baseAmount * 0.025)
  const vat = roundMoney(Math.max(subtotal - baseAmount - nhil - getfund, 0))
  const tax = roundMoney(nhil + getfund + vat)
  const totalAmount = roundMoney(Math.max(subtotal - discount, 0))

  return { subtotal, baseAmount, nhil, getfund, vat, tax, totalAmount }
}

function resolveConsultationPrice(candidate, meta) {
  const standard = Number(meta?.standard_prices?.consultation_price ?? 100)
  const existing = Number(meta?.standard_prices?.existing_consultation_price ?? 80)
  if (!candidate) return standard.toFixed(2)
  return Number(candidate.is_existing_customer ? existing : standard).toFixed(2)
}

function resolveFramePrice(code, meta) {
  if (!code) return '0.00'
  const product = findFrameProduct(code, meta)
  return Number(product?.min_price ?? 0).toFixed(2)
}

function findFrameProduct(code, meta) {
  if (!code) return null
  return (meta?.frame_products ?? []).find((item) => item.code === code) ?? null
}

function formatFrameRange(product) {
  const min = Number(product?.min_price ?? 0)
  const max = Number(product?.max_price ?? 0)
  if (String(product?.grade || '').toUpperCase() === 'A') {
    return `${currency.format(min)} and above`
  }

  return `${currency.format(min)} - ${currency.format(max)}`
}

function formatFrameOptionLabel(product) {
  const shortName = String(product?.name ?? '').trim()
  const compactName = shortName.length > 26 ? `${shortName.slice(0, 26).trimEnd()}...` : shortName
  return `${product.code} - ${compactName} (${formatFrameRange(product)})`
}

function validateFrameItem(item, meta) {
  const product = findFrameProduct(item.frame_code_id, meta)
  if (!product) return ''

  const value = Number(item.frame_price || 0)
  const min = Number(product.min_price ?? 0)
  const max = Number(product.max_price ?? 0)
  const grade = String(product.grade || '').toUpperCase()

  if (value < min) {
    return `Frame price is below the allowed range for ${product.code}. Expected ${formatFrameRange(product)}.`
  }

  if (grade !== 'A' && value > max) {
    return `Frame price is above the allowed range for ${product.code}. Expected ${formatFrameRange(product)}.`
  }

  return ''
}

function validateFramePrice(form, meta) {
  return validateFrameItem(
    {
      frame_code_id: form?.frame_code_id,
      frame_price: form?.frame_price,
    },
    meta,
  )
}

function printBillingSummarySlip(paymentDetail, billingMeta) {
  const billing = paymentDetail?.billing
  if (!billing) return

  const printWindow = window.open('', '_blank', 'width=420,height=900')
  if (!printWindow) {
    window.alert('Unable to open the print window. Please allow popups and try again.')
    return
  }

  const safe = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  const money = (value) => currency.format(Number(value ?? 0))
  const lineItems = [
    ['Consultation', billing.consultation_price],
    ['Frame', billing.frame_price],
    ['Lens', billing.lens_price],
    ['Case', billing.case_price],
    ['Discount', billing.discount],
  ]
    .filter(([, value]) => Number(value ?? 0) !== 0)
    .map(([label, value]) => `<div class="row"><span>${safe(label)}</span><strong>${safe(money(value))}</strong></div>`)
    .join('')

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Billing Estimate ${safe(billing.folder_id || billing.id)}</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #eef2f7;
            color: #000;
            font-family: "Segoe UI", Arial, sans-serif;
          }
          .page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px 12px;
          }
          .thermal {
            width: 302px;
            padding: 18px 16px 22px;
            background: #fff;
            border: 1px solid #d1d5db;
            box-shadow: 0 20px 45px rgba(15, 23, 42, 0.18);
          }
          .brand, .center, .footnote { text-align: center; }
          h1 {
            margin: 0;
            font-size: 18px;
            text-transform: uppercase;
          }
          p, .meta, .footnote {
            margin: 5px 0 0;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.5;
          }
          .divider {
            margin: 14px 0;
            border-top: 1px dashed #000;
          }
          .kicker {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .amount {
            margin: 7px 0 2px;
            font-size: 27px;
            font-weight: 700;
          }
          .summary, .meta-grid {
            display: grid;
            gap: 8px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            align-items: flex-start;
            font-size: 12px;
            font-weight: 700;
          }
          .row strong { text-align: right; }
          .total-row {
            padding-top: 8px;
            border-top: 1px dashed #000;
          }
          .notice {
            margin-top: 14px;
            padding: 8px;
            border: 1px solid #000;
            font-size: 10px;
            font-weight: 700;
            text-align: center;
            text-transform: uppercase;
          }
          .footnote { margin-top: 14px; }
          @media print {
            body { background: #fff; }
            .page { padding: 0; }
            .thermal {
              width: 80mm;
              border: none;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <section class="thermal">
            <div class="brand">
              <h1>Bealet Optical Center</h1>
              <p>${safe(paymentDetail?.branch_name || billingMeta?.branch_name || '')}</p>
              <p>Professional Eye Care and Optical Services</p>
            </div>
            <div class="divider"></div>
            <div class="center">
              <div class="kicker">Billing Estimate</div>
              <div class="amount">${safe(money(billing.total_amount))}</div>
              <div class="meta">Total billing before payment</div>
            </div>
            <div class="divider"></div>
            <div class="summary">
              ${lineItems}
              <div class="row total-row"><span>Total bill</span><strong>${safe(money(billing.total_amount))}</strong></div>
              <div class="row"><span>Paid so far</span><strong>${safe(money(billing.total_paid))}</strong></div>
              <div class="row total-row"><span>Amount due</span><strong>${safe(money(billing.calculated_balance))}</strong></div>
            </div>
            <div class="divider"></div>
            <div class="meta-grid">
              <div class="row"><span>Patient</span><strong>${safe(billing.name)}</strong></div>
              <div class="row"><span>Folder ID</span><strong>${safe(billing.folder_id)}</strong></div>
              <div class="row"><span>Billing ID</span><strong>${safe(billing.id)}</strong></div>
              <div class="row"><span>Bill date</span><strong>${safe(billing.date)}</strong></div>
              <div class="row"><span>Insurance</span><strong>${safe(billing.health_insurance || 'NONE')}</strong></div>
              <div class="row"><span>Printed</span><strong>${safe(new Date().toLocaleString())}</strong></div>
            </div>
            <div class="notice">Billing estimate only - not proof of payment</div>
            <div class="footnote">
              Please present this slip at the payment desk.<br />
              Generated from the OPTICPLUS billing desk.
            </div>
          </section>
        </div>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

function SummaryMetric({ label, value, balanceHighlight = false }) {
  const amount = Number(value ?? 0)
  const owing = balanceHighlight && hasBalanceDue(amount)
  return (
    <div className="billing-summary-metric inline-metric-card">
      <span>{label}:</span>
      <strong className={owing ? 'billing-balance-due' : undefined}>{currency.format(amount)}</strong>
    </div>
  )
}

function formatPercent(value) {
  return `${Number(value ?? 0).toFixed(1)}%`
}
