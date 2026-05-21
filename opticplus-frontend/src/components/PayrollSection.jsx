import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const defaultFilters = () => ({
  search: '',
  status: 'all',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
})

const defaultAdvanceForm = () => ({
  employee_id: '',
  amount: '',
  advance_date: todayIso(),
  deduction_month: new Date().getMonth() + 1,
  deduction_year: new Date().getFullYear(),
  payment_method: 'cash',
  notes: '',
  override_balance: false,
})

const PAYROLL_DECLARATION_STORAGE_KEY = 'opticplus-payroll-declarations-v1'

function readPayrollDeclarations() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(PAYROLL_DECLARATION_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export default function PayrollSection({ apiFetch, token, session, selectedBranchId }) {
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState(defaultFilters())
  const [query, setQuery] = useState(defaultFilters())
  const [advanceForm, setAdvanceForm] = useState(defaultAdvanceForm())
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState('bank_transfer')
  const [bulkOverrideBalance, setBulkOverrideBalance] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingAdvance, setIsSavingAdvance] = useState(false)
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [processingEmployeeId, setProcessingEmployeeId] = useState(null)
  const [payrollDeclarations, setPayrollDeclarations] = useState(() => readPayrollDeclarations())
  const [salaryModalEmployee, setSalaryModalEmployee] = useState(null)
  const [salaryDraft, setSalaryDraft] = useState({ declared_salary: '', note: '' })
  const [processModalEmployee, setProcessModalEmployee] = useState(null)
  const [processDraft, setProcessDraft] = useState({
    pay_declared_salary: true,
    pay_allowance: true,
    payment_method: 'bank_transfer',
    override_balance: false,
    notes: '',
  })

  const branchId = session?.is_admin ? selectedBranchId : session?.branch_id

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PAYROLL_DECLARATION_STORAGE_KEY, JSON.stringify(payrollDeclarations))
  }, [payrollDeclarations])

  useEffect(() => {
    let cancelled = false

    async function loadMeta() {
      if (!token || !session) return
      try {
        const response = await apiFetch(`/payroll/meta?branch_id=${branchId}`, { token })
        if (!cancelled) {
          setMeta(response)
          setBulkPaymentMethod(response.payment_methods?.[0] ?? 'bank_transfer')
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      }
    }

    loadMeta()
    return () => {
      cancelled = true
    }
  }, [apiFetch, branchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadPayroll() {
      if (!token || !session) return
      setIsLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({
          branch_id: String(branchId),
          month: String(query.month),
          year: String(query.year),
          status: query.status,
        })
        if (query.search) params.set('search', query.search)
        const response = await apiFetch(`/payroll?${params.toString()}`, { token })
        if (!cancelled) setData(response)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadPayroll()
    return () => {
      cancelled = true
    }
  }, [apiFetch, branchId, query, session, token])

  const selectedEmployee = useMemo(() => (
    (data?.employees ?? []).find((employee) => String(employee.id) === String(advanceForm.employee_id))
  ), [advanceForm.employee_id, data?.employees])

  const employeeDeclarations = useMemo(() => {
    const branchKey = String(branchId ?? '0')
    const periodKey = `${query.year}-${String(query.month).padStart(2, '0')}`
    const declarations = {}

    for (const employee of data?.employees ?? []) {
      const storageKey = payrollDeclarationKey(branchKey, periodKey, employee.id)
      const stored = payrollDeclarations[storageKey] ?? {}
      const grossSalary = Number(employee.salary ?? 0)
      const declaredSalary = clampDeclaredSalary(
        stored.declared_salary == null || stored.declared_salary === ''
          ? Number(employee.declared_salary ?? grossSalary)
          : Number(stored.declared_salary),
        grossSalary,
      )
      const allowanceAmount = Math.max(grossSalary - declaredSalary, 0)

      declarations[employee.id] = {
        declared_salary: declaredSalary,
        allowance_amount: allowanceAmount,
        note: stored.note ?? '',
      }
    }

    return declarations
  }, [branchId, data?.employees, payrollDeclarations, query.month, query.year])

  const payrollSummary = useMemo(() => {
    const employees = data?.employees ?? []
    const unpaidEmployees = employees.filter((employee) => !employee.is_paid)

    return {
      employee_count: unpaidEmployees.length,
      gross_total: unpaidEmployees.reduce((total, employee) => total + Number(employee.salary ?? 0), 0),
      declared_total: unpaidEmployees.reduce((total, employee) => total + Number(employeeDeclarations[employee.id]?.declared_salary ?? employee.salary ?? 0), 0),
      allowance_total: unpaidEmployees.reduce((total, employee) => total + Number(employeeDeclarations[employee.id]?.allowance_amount ?? 0), 0),
      advance_total: unpaidEmployees.reduce((total, employee) => total + Number(employee.pending_advances ?? 0), 0),
      net_total: unpaidEmployees.reduce((total, employee) => total + Number(employee.net_payable ?? 0), 0),
    }
  }, [data?.employees, employeeDeclarations])

  async function refreshPayroll() {
    setQuery((current) => ({ ...current }))
  }

  async function submitAdvance(event) {
    event.preventDefault()
    setIsSavingAdvance(true)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/payroll/advances?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: {
          ...advanceForm,
          employee_id: Number(advanceForm.employee_id),
          amount: Number(advanceForm.amount || 0),
          deduction_month: Number(advanceForm.deduction_month),
          deduction_year: Number(advanceForm.deduction_year),
          override_balance: advanceForm.override_balance,
        },
      })

      setSuccess(response.message)
      setAdvanceForm(defaultAdvanceForm())
      await refreshPayroll()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingAdvance(false)
    }
  }

  async function processSingle() {
    if (!processModalEmployee) return

    setProcessingEmployeeId(processModalEmployee.id)
    setError('')
    setSuccess('')

    try {
      const declaration = employeeDeclarations[processModalEmployee.id]
      const response = await apiFetch(`/payroll/process?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: {
          employee_id: processModalEmployee.id,
          pay_month: Number(query.month),
          pay_year: Number(query.year),
          payment_method: processDraft.payment_method,
          override_balance: processDraft.override_balance,
          declared_salary: declaration?.declared_salary ?? null,
          allowance_amount: declaration?.allowance_amount ?? null,
          pay_declared_salary: processDraft.pay_declared_salary,
          pay_allowance: processDraft.pay_allowance,
          notes: processDraft.notes || declaration?.note || '',
        },
      })

      setSuccess(response.message)
      setProcessModalEmployee(null)
      await refreshPayroll()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setProcessingEmployeeId(null)
    }
  }

  async function processBulk() {
    setIsProcessingBulk(true)
    setError('')
    setSuccess('')

    try {
      const declarations = Object.entries(employeeDeclarations).reduce((collection, [employeeId, declaration]) => {
        collection[employeeId] = {
          declared_salary: Number(declaration.declared_salary ?? 0),
          allowance_amount: Number(declaration.allowance_amount ?? 0),
          notes: declaration.note ?? '',
        }
        return collection
      }, {})

      const response = await apiFetch(`/payroll/process-bulk?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: {
          pay_month: Number(query.month),
          pay_year: Number(query.year),
          payment_method: bulkPaymentMethod,
          override_balance: bulkOverrideBalance,
          declarations,
        },
      })

      setSuccess(response.message)
      await refreshPayroll()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsProcessingBulk(false)
    }
  }

  function openSalaryDeclaration(employee) {
    const declaration = employeeDeclarations[employee.id] ?? {}
    setSalaryModalEmployee(employee)
    setSalaryDraft({
      declared_salary: String(declaration.declared_salary ?? employee.salary ?? 0),
      note: declaration.note ?? '',
    })
  }

  function openProcessModal(employee) {
    const declaration = employeeDeclarations[employee.id] ?? {}
    const remainingDeclared = Math.max(
      Number(declaration.declared_salary ?? employee.salary ?? 0) - Number(employee.declared_paid ?? 0),
      0,
    )
    const remainingAllowance = Math.max(
      Number(declaration.allowance_amount ?? 0) - Number(employee.allowance_paid ?? 0),
      0,
    )

    setProcessModalEmployee(employee)
    setProcessDraft({
      pay_declared_salary: remainingDeclared > 0,
      pay_allowance: remainingAllowance > 0,
      payment_method: bulkPaymentMethod,
      override_balance: bulkOverrideBalance,
      notes: declaration.note ?? '',
    })
  }

  function saveSalaryDeclaration() {
    if (!salaryModalEmployee) return

    const grossSalary = Number(salaryModalEmployee.salary ?? 0)
    const declaredSalary = clampDeclaredSalary(Number(salaryDraft.declared_salary ?? grossSalary), grossSalary)
    const branchKey = String(branchId ?? '0')
    const periodKey = `${query.year}-${String(query.month).padStart(2, '0')}`
    const storageKey = payrollDeclarationKey(branchKey, periodKey, salaryModalEmployee.id)

    setPayrollDeclarations((current) => ({
      ...current,
      [storageKey]: {
        declared_salary: declaredSalary,
        note: salaryDraft.note ?? '',
      },
    }))
    setSalaryModalEmployee(null)
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Payroll</p>
          <h3>Process salaries, manage advances, and track monthly payroll history</h3>
          <p className="header-copy">Built from the legacy payroll workflow using `employees_comprehensive`, `salary_advances`, `payroll_history`, `bank_balance`, and related finance tables.</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Bank Balance" value={currency.format(Number(data?.stats?.bank_balance ?? 0))} note="Available payroll funding in the selected branch" icon="finance" className="total" />
        <StatWidget label="Expected Net Payroll" value={currency.format(Number(data?.stats?.expected_net ?? 0))} note={`${data?.stats?.employee_count ?? 0} staff in the current month view`} icon="money" className="seen" />
        <StatWidget label="Pending Advances" value={String(Number(data?.stats?.pending_advance_count ?? 0))} note={currency.format(Number(data?.stats?.expected_advances ?? 0))} icon="alert" className="pending" />
        <StatWidget label="Processed Staff" value={String(Number(data?.stats?.processed_count ?? 0))} note="Already paid for the selected payroll month" icon="receipt" className="today" />
      </section>

      <section className="content-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Payroll Controls</p>
              <h3>Set the payroll window and processing mode</h3>
            </div>
            <span className="panel-tag">{data?.branch_name ?? meta?.branch_name ?? 'Payroll desk'}</span>
          </div>

          <div className="payroll-controls-layout">
            <form className="patient-filter-grid payroll-filter-grid" onSubmit={(event) => {
              event.preventDefault()
              setQuery((current) => ({ ...current, ...filters }))
            }}>
              <label>
                Search employee
                <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Name, staff ID, email, or job title" />
              </label>
              <label>
                Payroll month
                <select value={filters.month} onChange={(event) => setFilters((current) => ({ ...current, month: Number(event.target.value) }))}>
                  {(meta?.months ?? []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                Payroll year
                <select value={filters.year} onChange={(event) => setFilters((current) => ({ ...current, year: Number(event.target.value) }))}>
                  {(meta?.years ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Status
                <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="all">All staff</option>
                  <option value="unpaid">Unpaid only</option>
                  <option value="paid">Paid only</option>
                </select>
              </label>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button">
                  Apply payroll window
                </button>
                <button type="button" className="ghost-button" onClick={() => setQuery((current) => ({ ...current, ...filters }))}>
                  Refresh
                </button>
              </div>
            </form>

            <div className="payroll-controls-side">
              <div className="payroll-control-summary">
                <div className="payroll-control-summary-card">
                  <span>Declared salary pool</span>
                  <strong>{currency.format(payrollSummary.declared_total)}</strong>
                  <p>Salary portion currently marked as declared for {monthLabel(query.month, query.year)}.</p>
                </div>
                <div className="payroll-control-summary-card">
                  <span>Allowance pool</span>
                  <strong>{currency.format(payrollSummary.allowance_total)}</strong>
                  <p>The remaining payroll value that will be treated as allowance for selected staff.</p>
                </div>
                <div className="payroll-control-summary-card">
                  <span>Net payout after advances</span>
                  <strong>{currency.format(payrollSummary.net_total)}</strong>
                  <p>{payrollSummary.employee_count} unpaid staff in the current payroll batch.</p>
                </div>
              </div>

              <div className="payroll-bulk-bar">
                <label>
                  Bulk payment method
                  <select value={bulkPaymentMethod} onChange={(event) => setBulkPaymentMethod(event.target.value)}>
                    {(meta?.payment_methods ?? []).map((method) => <option key={method} value={method}>{titleize(method)}</option>)}
                  </select>
                </label>
                <label className="memo-checkbox">
                  <input type="checkbox" checked={bulkOverrideBalance} onChange={(event) => setBulkOverrideBalance(event.target.checked)} />
                  <span>Override bank-balance warning</span>
                </label>
                <div className="filter-actions-row">
                  <button type="button" className="primary-button" disabled={isProcessingBulk || !(data?.employees ?? []).some((row) => !row.is_paid)} onClick={processBulk}>
                    {isProcessingBulk ? 'Processing...' : 'Process Bulk Payroll'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Salary Advance</p>
              <h3>Record an advance for later deduction</h3>
            </div>
          </div>

          <form className="stack-list payroll-advance-form" onSubmit={submitAdvance}>
            <label className="payroll-advance-field">
              <span>Employee</span>
              <select value={advanceForm.employee_id} onChange={(event) => setAdvanceForm((current) => ({ ...current, employee_id: event.target.value }))}>
                <option value="">Select employee</option>
                {(data?.employees ?? []).map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.name} | {employee.staff_id || 'No ID'}</option>
                ))}
              </select>
            </label>
            <label className="payroll-advance-field">
              <span>Amount</span>
              <input type="number" min="0" step="0.01" value={advanceForm.amount} onChange={(event) => setAdvanceForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" />
            </label>
            <label className="payroll-advance-field">
              <span>Advance date</span>
              <input type="date" value={advanceForm.advance_date} onChange={(event) => setAdvanceForm((current) => ({ ...current, advance_date: event.target.value }))} />
            </label>
            <label className="payroll-advance-field">
              <span>Deduction month</span>
              <select value={advanceForm.deduction_month} onChange={(event) => setAdvanceForm((current) => ({ ...current, deduction_month: Number(event.target.value) }))}>
                {(meta?.months ?? []).map((item) => <option key={`advance-${item.value}`} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="payroll-advance-field">
              <span>Deduction year</span>
              <select value={advanceForm.deduction_year} onChange={(event) => setAdvanceForm((current) => ({ ...current, deduction_year: Number(event.target.value) }))}>
                {(meta?.years ?? []).map((item) => <option key={`year-${item}`} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="payroll-advance-field">
              <span>Payment method</span>
              <select value={advanceForm.payment_method} onChange={(event) => setAdvanceForm((current) => ({ ...current, payment_method: event.target.value }))}>
                {(meta?.payment_methods ?? []).map((method) => <option key={`pm-${method}`} value={method}>{titleize(method)}</option>)}
              </select>
            </label>
            <label className="payroll-advance-field full-span">
              <span>Notes</span>
              <textarea rows="4" value={advanceForm.notes} onChange={(event) => setAdvanceForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Reason for the advance or repayment note" />
            </label>
            <label className="memo-checkbox payroll-advance-toggle full-span">
              <input type="checkbox" checked={advanceForm.override_balance} onChange={(event) => setAdvanceForm((current) => ({ ...current, override_balance: event.target.checked }))} />
              <span>Override balance warning</span>
            </label>

            {selectedEmployee ? (
              <div className="memo-body-card payroll-advance-summary full-span">
                <strong>{selectedEmployee.name}</strong>
                <p>Gross salary: {currency.format(Number(selectedEmployee.salary ?? 0))}</p>
                <p>Pending advances: {currency.format(Number(selectedEmployee.pending_advances ?? 0))}</p>
                <p>Net payable after deduction: {currency.format(Number(selectedEmployee.net_payable ?? 0))}</p>
              </div>
            ) : null}

            <button type="submit" className="primary-button payroll-advance-submit full-span" disabled={isSavingAdvance}>
              {isSavingAdvance ? 'Saving...' : 'Record Advance'}
            </button>
          </form>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Payroll Candidates</p>
              <h3>Expected payroll for {monthLabel(query.month, query.year)}</h3>
            </div>
            <span className="panel-tag">{(data?.employees ?? []).length} staff</span>
          </div>

          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Branch</th>
                  <th>Department</th>
                  <th>Gross Salary</th>
                  <th>Declared Salary</th>
                  <th>Allowance</th>
                  <th>Advance Deduction</th>
                  <th>Net Payable</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan="10">Loading payroll records...</td></tr>
                ) : (data?.employees ?? []).length ? (
                  data.employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <div className="patient-table-primary payroll-employee-cell">
                          <strong>{employee.name}</strong>
                          <span className="payroll-staff-id">
                            {employee.staff_id ? `Staff ID ${employee.staff_id}` : employee.job_title || 'No staff ID'}
                          </span>
                        </div>
                      </td>
                      <td>{employee.branch || 'Branch'}</td>
                      <td>{employee.department || 'Unassigned'}</td>
                      <td>{currency.format(Number(employee.salary ?? 0))}</td>
                      <td>
                        <div className="patient-table-primary">
                          <strong>{currency.format(Number(employeeDeclarations[employee.id]?.declared_salary ?? employee.salary ?? 0))}</strong>
                          <span>{employeeDeclarations[employee.id]?.note || 'Default declaration'}</span>
                        </div>
                      </td>
                      <td>{currency.format(Number(employeeDeclarations[employee.id]?.allowance_amount ?? 0))}</td>
                      <td>{currency.format(Number(employee.pending_advances ?? 0))}</td>
                      <td>{currency.format(Number(employee.net_payable ?? 0))}</td>
                      <td>{employee.is_paid ? 'Processed' : employee.is_partial ? 'Partially Paid' : 'Pending'}</td>
                      <td>
                        <div className="billing-row-actions payroll-row-actions">
                          <button
                            type="button"
                            className="mini-action"
                            onClick={() => openSalaryDeclaration(employee)}
                          >
                            Declared Split
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            disabled={employee.is_paid || processingEmployeeId === employee.id}
                            onClick={() => openProcessModal(employee)}
                          >
                            {processingEmployeeId === employee.id ? 'Processing...' : employee.is_partial ? 'Continue Process' : 'Process'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="10">No payroll candidates match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Salary Advances</p>
              <h3>Advances queued for deduction</h3>
            </div>
          </div>

          <div className="stack-list">
            {(data?.advances ?? []).length ? data.advances.map((advance) => (
              <div key={advance.id} className="stack-item">
                <div>
                  <strong>{advance.employee_name}</strong>
                  <span>{currency.format(Number(advance.amount ?? 0))} | {titleize(advance.payment_method)}</span>
                </div>
                <div className="stack-meta">
                  <strong>{formatDate(advance.advance_date)}</strong>
                  <span>{titleize(advance.status)}</span>
                </div>
              </div>
            )) : (
              <p className="muted-copy">No salary advances recorded for this payroll month.</p>
            )}
          </div>
        </article>
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Payroll History</p>
            <h3>Processed salaries for {monthLabel(query.month, query.year)}</h3>
          </div>
          <span className="panel-tag">{(data?.history ?? []).length} entries</span>
        </div>

        <div className="table-shell">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Branch</th>
                <th>Gross</th>
                <th>Declared Salary</th>
                <th>Allowance</th>
                <th>Paid So Far</th>
                <th>Advance Deduction</th>
                <th>Net Salary</th>
                <th>Status</th>
                <th>Payment Method</th>
                <th>Paid On</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="12">Loading payroll history...</td></tr>
              ) : (data?.history ?? []).length ? (
                data.history.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.employee_name}</strong>
                      <span>{row.staff_id || 'No staff ID'}</span>
                    </td>
                    <td>{row.branch || 'Branch'}</td>
                    <td>{currency.format(Number(row.gross_salary ?? 0))}</td>
                    <td>{currency.format(Number(row.declared_salary ?? row.gross_salary ?? 0))}</td>
                    <td>{currency.format(Number(row.allowance_amount ?? 0))}</td>
                    <td>{currency.format(Number(row.declared_paid ?? 0) + Number(row.allowance_paid ?? 0))}</td>
                    <td>{currency.format(Number(row.advance_deduction ?? 0))}</td>
                    <td>{currency.format(Number(row.net_salary ?? 0))}</td>
                    <td>{row.is_fully_paid ? 'Settled' : 'Partial'}</td>
                    <td>{titleize(row.payment_method)}</td>
                    <td>{formatDateTime(row.payment_date)}</td>
                    <td>{row.notes || 'No note'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="12">No payroll history exists for the selected month.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {salaryModalEmployee ? (
        <div className="modal-overlay" onClick={() => setSalaryModalEmployee(null)}>
          <article className="modal-panel extract-salary-modal payroll-salary-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Declared Salary</p>
                <h3>{salaryModalEmployee.name}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setSalaryModalEmployee(null)}>
                Close
              </button>
            </div>

            <p className="muted-copy">
              Set the salary portion to be declared for this payroll run. The remaining amount from the employee&apos;s gross salary will automatically be treated as allowance.
            </p>

            <div className="patient-form-grid">
              <label>
                Gross salary
                <input type="text" value={currency.format(Number(salaryModalEmployee.salary ?? 0))} readOnly />
              </label>
              <label>
                Declared salary
                <input
                  type="number"
                  min="0"
                  max={Number(salaryModalEmployee.salary ?? 0)}
                  step="0.01"
                  value={salaryDraft.declared_salary}
                  onChange={(event) => setSalaryDraft((current) => ({ ...current, declared_salary: event.target.value }))}
                />
              </label>
              <label>
                Allowance
                <input
                  type="text"
                  value={currency.format(Math.max(Number(salaryModalEmployee.salary ?? 0) - clampDeclaredSalary(Number(salaryDraft.declared_salary ?? 0), Number(salaryModalEmployee.salary ?? 0)), 0))}
                  readOnly
                />
              </label>
              <label>
                Pending advances
                <input type="text" value={currency.format(Number(salaryModalEmployee.pending_advances ?? 0))} readOnly />
              </label>
              <label className="full-span">
                Payroll note
                <textarea
                  rows="3"
                  value={salaryDraft.note}
                  onChange={(event) => setSalaryDraft((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Optional note to keep with this payroll processing record"
                />
              </label>
            </div>

            <div className="filter-actions-row">
              <button type="button" className="ghost-button" onClick={() => setSalaryModalEmployee(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={saveSalaryDeclaration}>
                Save Declared Salary
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {processModalEmployee ? (
        <div className="modal-overlay" onClick={() => setProcessModalEmployee(null)}>
          <article className="modal-panel extract-salary-modal payroll-process-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Validate Payroll Payment</p>
                <h3>{processModalEmployee.name}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setProcessModalEmployee(null)}>
                Close
              </button>
            </div>

            <p className="muted-copy">
              Confirm whether you are paying salary, allowance, or both for this payroll month. This supports cases where salary is settled first and allowance is given later.
            </p>

            <div className="payroll-process-summary">
              <div className="payroll-process-card">
                <span>Gross salary</span>
                <strong>{currency.format(Number(processModalEmployee.salary ?? 0))}</strong>
              </div>
              <div className="payroll-process-card">
                <span>Declared salary remaining</span>
                <strong>{currency.format(Math.max(Number(employeeDeclarations[processModalEmployee.id]?.declared_salary ?? processModalEmployee.salary ?? 0) - Number(processModalEmployee.declared_paid ?? 0), 0))}</strong>
              </div>
              <div className="payroll-process-card">
                <span>Allowance remaining</span>
                <strong>{currency.format(Math.max(Number(employeeDeclarations[processModalEmployee.id]?.allowance_amount ?? 0) - Number(processModalEmployee.allowance_paid ?? 0), 0))}</strong>
              </div>
              <div className="payroll-process-card">
                <span>Advance deduction</span>
                <strong>{currency.format(Number(processModalEmployee.pending_advances ?? 0))}</strong>
              </div>
            </div>

            <div className="patient-form-grid">
              <label className="memo-checkbox payroll-process-toggle">
                <input
                  type="checkbox"
                  checked={processDraft.pay_declared_salary}
                  disabled={Math.max(Number(employeeDeclarations[processModalEmployee.id]?.declared_salary ?? processModalEmployee.salary ?? 0) - Number(processModalEmployee.declared_paid ?? 0), 0) <= 0}
                  onChange={(event) => setProcessDraft((current) => ({ ...current, pay_declared_salary: event.target.checked }))}
                />
                <span>Pay remaining salary portion</span>
              </label>
              <label className="memo-checkbox payroll-process-toggle">
                <input
                  type="checkbox"
                  checked={processDraft.pay_allowance}
                  disabled={Math.max(Number(employeeDeclarations[processModalEmployee.id]?.allowance_amount ?? 0) - Number(processModalEmployee.allowance_paid ?? 0), 0) <= 0}
                  onChange={(event) => setProcessDraft((current) => ({ ...current, pay_allowance: event.target.checked }))}
                />
                <span>Pay remaining allowance portion</span>
              </label>
              <label>
                Payment method
                <select value={processDraft.payment_method} onChange={(event) => setProcessDraft((current) => ({ ...current, payment_method: event.target.value }))}>
                  {(meta?.payment_methods ?? []).map((method) => <option key={`process-${method}`} value={method}>{titleize(method)}</option>)}
                </select>
              </label>
              <label className="memo-checkbox payroll-process-toggle">
                <input
                  type="checkbox"
                  checked={processDraft.override_balance}
                  onChange={(event) => setProcessDraft((current) => ({ ...current, override_balance: event.target.checked }))}
                />
                <span>Override bank-balance warning</span>
              </label>
              <label className="full-span">
                Payment note
                <textarea
                  rows="3"
                  value={processDraft.notes}
                  onChange={(event) => setProcessDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional note for this salary or allowance payout"
                />
              </label>
            </div>

            <div className="payroll-process-total">
              <span>Current payment total</span>
              <strong>{currency.format(calculatePayrollModalTotal(processModalEmployee, employeeDeclarations[processModalEmployee.id], processDraft))}</strong>
            </div>

            <div className="filter-actions-row">
              <button type="button" className="ghost-button" onClick={() => setProcessModalEmployee(null)}>
                Cancel
              </button>
              <button type="button" className="primary-button" disabled={processingEmployeeId === processModalEmployee.id} onClick={processSingle}>
                {processingEmployeeId === processModalEmployee.id ? 'Processing...' : 'Validate Payment'}
              </button>
            </div>
          </article>
        </div>
      ) : null}
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

function monthLabel(month, year) {
  return new Date(year, month - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })
}

function formatDate(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function payrollDeclarationKey(branchId, periodKey, employeeId) {
  return `${branchId}:${periodKey}:${employeeId}`
}

function clampDeclaredSalary(value, grossSalary) {
  if (!Number.isFinite(value)) return grossSalary
  return Math.min(Math.max(value, 0), Math.max(Number(grossSalary ?? 0), 0))
}

function calculatePayrollModalTotal(employee, declaration, draft) {
  if (!employee) return 0

  const remainingDeclared = Math.max(
    Number(declaration?.declared_salary ?? employee.salary ?? 0) - Number(employee.declared_paid ?? 0),
    0,
  )
  const remainingAllowance = Math.max(
    Number(declaration?.allowance_amount ?? 0) - Number(employee.allowance_paid ?? 0),
    0,
  )

  return Number(draft?.pay_declared_salary ? remainingDeclared : 0) + Number(draft?.pay_allowance ? remainingAllowance : 0)
}
