import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const currency = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 2,
})

const defaultFilters = () => ({
  search: '',
  department: 'all',
  status: 'all',
  page: 1,
  per_page: 12,
})

const emptyEditForm = {
  name: '',
  email: '',
  phone: '',
  job_title: '',
  department: '',
  status: 'active',
  branch: '',
  date_employed: '',
  ssnit_number: '',
  tin_number: '',
  salary: '',
  qualification: '',
  institution: '',
}

function withImageVersion(url, versionKey) {
  if (!url) return ''
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${encodeURIComponent(versionKey)}`
}

export default function StaffProfilesSection({ token, selectedBranchId, apiFetch, onHeaderProfileChange = () => {} }) {
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [filters, setFilters] = useState(defaultFilters())
  const [query, setQuery] = useState(defaultFilters())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editForm, setEditForm] = useState(emptyEditForm)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadEmployees() {
      setIsLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          branch_id: String(selectedBranchId),
          page: String(query.page),
          per_page: String(query.per_page),
        })

        if (query.search) params.set('search', query.search)
        if (query.department && query.department !== 'all') params.set('department', query.department)
        if (query.status && query.status !== 'all') params.set('status', query.status)

        const response = await apiFetch(`/manager/employees?${params.toString()}`, { token })
        if (!cancelled) setData(response)
      } catch (nextError) {
        if (!cancelled) setError(nextError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadEmployees()
    return () => {
      cancelled = true
    }
  }, [apiFetch, query, selectedBranchId, token])

  useEffect(() => () => {
    onHeaderProfileChange(null)
  }, [onHeaderProfileChange])

  const employee = detail?.employee
  const pagination = data?.pagination

  const tableRows = useMemo(() => data?.records ?? [], [data])

  function normalizeEmployee(employee, versionKey = Date.now()) {
    if (!employee) return null
    return {
      ...employee,
      photo_url: employee.photo_url ? withImageVersion(employee.photo_url, versionKey) : '',
    }
  }

  function emitHeaderProfile(employee, overridePhotoUrl = '') {
    if (!employee) {
      onHeaderProfileChange(null)
      return
    }

    onHeaderProfileChange({
      ...employee,
      photo_url: overridePhotoUrl || employee.photo_url || '',
    })
  }

  async function fetchEmployeeDetail(employeeId) {
    const response = await apiFetch(`/manager/employees/${employeeId}?branch_id=${selectedBranchId}`, { token })
    return {
      ...response,
      employee: normalizeEmployee(response.employee),
    }
  }

  function resetEditor(nextDetail = detail, options = {}) {
    const { clearPreview = true } = options
    const nextEmployee = nextDetail?.employee
    setIsEditing(false)
    setPhotoFile(null)
    if (clearPreview) {
      setPhotoPreview('')
    }
    if (!nextEmployee) {
      setEditForm(emptyEditForm)
      return
    }

    setEditForm({
      name: nextEmployee.name ?? '',
      email: nextEmployee.email ?? '',
      phone: nextEmployee.phone ?? '',
      job_title: nextEmployee.job_title ?? '',
      department: nextEmployee.department ?? '',
      status: nextEmployee.status ?? 'active',
      branch: nextEmployee.branch ?? '',
      date_employed: nextEmployee.date_employed ?? '',
      ssnit_number: nextEmployee.ssnit_number ?? '',
      tin_number: nextEmployee.tin_number ?? '',
      salary: nextEmployee.salary ?? '',
      qualification: nextEmployee.qualification ?? '',
      institution: nextEmployee.institution ?? '',
    })
  }

  async function openEmployeeModal(employeeId) {
    setSelectedEmployeeId(employeeId)
    setIsModalOpen(true)
    setIsEditing(false)
    setSuccess('')
    setError('')
    setDetail(null)
    setIsLoadingDetail(true)

    try {
      const response = await fetchEmployeeDetail(employeeId)
      setDetail(response)
      emitHeaderProfile(response.employee ?? null)
      resetEditor(response)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  function closeModal() {
    setIsModalOpen(false)
    setIsEditing(false)
    setSelectedEmployeeId(null)
    setDetail(null)
    emitHeaderProfile(null)
    setPhotoFile(null)
    setPhotoPreview('')
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0] ?? null
    setPhotoFile(file)
    if (!file) {
      setPhotoPreview('')
      emitHeaderProfile(employee ?? null)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const nextPreview = typeof reader.result === 'string' ? reader.result : ''
      setPhotoPreview(nextPreview)
      emitHeaderProfile(employee ?? null, nextPreview)
    }
    reader.readAsDataURL(file)
  }

  async function submitEdit(event) {
    event.preventDefault()
    if (!selectedEmployeeId) return

    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const body = new FormData()
      body.append('name', editForm.name)
      body.append('email', editForm.email)
      body.append('phone', editForm.phone)
      body.append('job_title', editForm.job_title)
      body.append('department', editForm.department)
      body.append('status', editForm.status)
      body.append('branch', editForm.branch)
      body.append('date_employed', editForm.date_employed)
      body.append('ssnit_number', editForm.ssnit_number)
      body.append('tin_number', editForm.tin_number)
      body.append('salary', editForm.salary === '' ? '' : String(editForm.salary))
      body.append('qualification', editForm.qualification)
      body.append('institution', editForm.institution)
      body.append('branch_id', String(selectedBranchId))
      if (photoFile) body.append('photo', photoFile)

      const response = await apiFetch(`/manager/employees/${selectedEmployeeId}`, {
        method: 'POST',
        token,
        body,
      })

      const refreshedDetail = await fetchEmployeeDetail(selectedEmployeeId)
      setDetail(refreshedDetail)
      const persistedPhotoUrl = refreshedDetail.employee?.photo_url || ''
      const effectivePhotoUrl = persistedPhotoUrl || photoPreview || ''
      emitHeaderProfile(refreshedDetail.employee ?? null, effectivePhotoUrl)
      resetEditor(refreshedDetail, { clearPreview: Boolean(persistedPhotoUrl) })
      setSuccess(response.message || 'Staff profile updated successfully.')

      setData((current) => {
        if (!current) return current
        return {
          ...current,
          records: (current.records ?? []).map((record) =>
            record.id === refreshedDetail.employee.id ? refreshedDetail.employee : record,
          ),
        }
      })
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsSaving(false)
    }
  }

  function changePage(nextPage) {
    if (!pagination) return
    if (nextPage < 1 || nextPage > pagination.total_pages) return
    setQuery((current) => ({ ...current, page: nextPage }))
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Staff Profiles</p>
          <h3>Staff directory and profile workspace</h3>
          <p className="header-copy">
            Browse staff in a clean register, then open any entry to review full details,
            attendance, and update profile images or staff information.
          </p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Employees" value={data?.stats.total ?? '...'} note="Profiles in this branch" icon="patients" className="total" />
        <StatWidget label="Active" value={data?.stats.active ?? '...'} note="Currently active staff records" icon="check-badge" className="seen" />
        <StatWidget label="Departments" value={data?.stats.departments ?? '...'} note="Operational groups represented" icon="layers" className="today" />
        <StatWidget label="Listing" value={pagination?.total ?? '...'} note="Records matching the current filters" icon="support" className="pending" />
      </section>

      <article className="panel staff-directory-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h3>Employee register</h3>
          </div>
          <span className="panel-tag">
            {(data?.branch_name ?? 'Branch')} | {pagination?.total ?? 0} records
          </span>
        </div>

        <form
          className="patient-filter-grid"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery({ ...filters, page: 1 })
          }}
        >
          <label>
            Search
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Name, staff ID, email"
            />
          </label>
          <label>
            Department
            <select
              value={filters.department}
              onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}
            >
              <option value="all">All departments</option>
              {(data?.departments ?? []).map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All statuses</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
          <div className="filter-actions-row">
            <button type="submit" className="primary-button">Apply</button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const reset = defaultFilters()
                setFilters(reset)
                setQuery(reset)
              }}
            >
              Reset
            </button>
          </div>
        </form>

        <div className="table-shell">
          <table className="portal-table staff-directory-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Department</th>
                <th>Role / Title</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Branch</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !data ? (
                <tr>
                  <td colSpan="6">Loading staff profiles...</td>
                </tr>
              ) : tableRows.length ? (
                tableRows.map((record) => (
                  <tr
                    key={record.id}
                    className="staff-directory-row"
                    onClick={() => openEmployeeModal(record.id)}
                  >
                    <td>
                      <button type="button" className="staff-row-trigger">
                        <strong>{record.name}</strong>
                        <div className="muted-copy">{record.staff_id || 'No staff ID'}</div>
                      </button>
                    </td>
                    <td>{record.department || 'No department'}</td>
                    <td>{record.job_title || 'No title'}</td>
                    <td>
                      <span className={`status-pill status-${record.status}`}>{record.status}</span>
                    </td>
                    <td>
                      <div>{record.email || 'No email'}</div>
                      <div className="muted-copy">{record.phone || 'No phone'}</div>
                    </td>
                    <td>{record.branch || 'No branch'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6">No staff profiles matched the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="staff-directory-footer">
          <span>
            Page {pagination?.page ?? 1} of {pagination?.total_pages ?? 1}
          </span>
          <div className="modal-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => changePage((pagination?.page ?? 1) - 1)}
              disabled={!pagination || pagination.page <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => changePage((pagination?.page ?? 1) + 1)}
              disabled={!pagination || pagination.page >= pagination.total_pages}
            >
              Next
            </button>
          </div>
        </div>
      </article>

      {isModalOpen ? (
        <div className="modal-overlay" onClick={closeModal}>
          <article className="modal-panel staff-profile-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{isEditing ? 'Edit Profile' : 'Staff Profile'}</p>
                <h3>{employee?.name || 'Loading staff profile'}</h3>
              </div>
              <div className="modal-actions">
                {employee ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      if (isEditing) {
                        resetEditor()
                        return
                      }
                      resetEditor()
                      setIsEditing(true)
                    }}
                  >
                    {isEditing ? 'Cancel edit' : 'Edit profile'}
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={closeModal}>Close</button>
              </div>
            </div>

            {isLoadingDetail ? (
              <p className="muted-copy">Loading staff profile...</p>
            ) : employee ? (
              <div className="staff-profile-modal-body">
                {error ? <div className="message-banner error">{error}</div> : null}
                {success ? <div className="message-banner success">{success}</div> : null}

                <section className="staff-profile-hero">
                  <div className="settings-avatar-block">
                    <div className="settings-avatar-frame staff-profile-avatar">
                      {photoPreview ? (
                        <img src={photoPreview} alt={`${employee.name} preview`} className="settings-avatar-image" />
                      ) : employee.photo_url ? (
                        <img src={employee.photo_url} alt={employee.name} className="settings-avatar-image" />
                      ) : (
                        <span className="settings-avatar-fallback">{employee.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="settings-avatar-copy">
                      <strong>{employee.name}</strong>
                      <span>{employee.staff_id || 'No staff ID'}</span>
                      <span>{employee.job_title || 'No job title'}</span>
                    </div>
                  </div>

                  {isEditing ? (
                    <label className="staff-photo-upload">
                      <span>Change photo</span>
                      <input type="file" accept="image/*" onChange={handlePhotoChange} />
                    </label>
                  ) : (
                    <div className="staff-quick-chips">
                      <div className="finance-chip"><span>Department</span><strong>{employee.department || 'N/A'}</strong></div>
                      <div className="finance-chip"><span>Status</span><strong>{employee.status || 'N/A'}</strong></div>
                      <div className="finance-chip"><span>Branch</span><strong>{employee.branch || 'N/A'}</strong></div>
                    </div>
                  )}
                </section>

                {isEditing ? (
                  <form className="staff-edit-grid" onSubmit={submitEdit}>
                    <label>
                      Full name
                      <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} required />
                    </label>
                    <label>
                      Email
                      <input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
                    </label>
                    <label>
                      Phone
                      <input value={editForm.phone} onChange={(event) => setEditForm((current) => ({ ...current, phone: event.target.value }))} />
                    </label>
                    <label>
                      Job title
                      <input value={editForm.job_title} onChange={(event) => setEditForm((current) => ({ ...current, job_title: event.target.value }))} />
                    </label>
                    <label>
                      Department
                      <input value={editForm.department} onChange={(event) => setEditForm((current) => ({ ...current, department: event.target.value }))} />
                    </label>
                    <label>
                      Status
                      <select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}>
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </label>
                    <label>
                      Branch label
                      <input value={editForm.branch} onChange={(event) => setEditForm((current) => ({ ...current, branch: event.target.value }))} />
                    </label>
                    <label>
                      Date employed
                      <input type="date" value={editForm.date_employed} onChange={(event) => setEditForm((current) => ({ ...current, date_employed: event.target.value }))} />
                    </label>
                    <label>
                      Salary
                      <input type="number" step="0.01" value={editForm.salary} onChange={(event) => setEditForm((current) => ({ ...current, salary: event.target.value }))} />
                    </label>
                    <label>
                      SSNIT number
                      <input value={editForm.ssnit_number} onChange={(event) => setEditForm((current) => ({ ...current, ssnit_number: event.target.value }))} />
                    </label>
                    <label>
                      TIN number
                      <input value={editForm.tin_number} onChange={(event) => setEditForm((current) => ({ ...current, tin_number: event.target.value }))} />
                    </label>
                    <label>
                      Qualification
                      <input value={editForm.qualification} onChange={(event) => setEditForm((current) => ({ ...current, qualification: event.target.value }))} />
                    </label>
                    <label className="staff-edit-grid-span">
                      Institution
                      <input value={editForm.institution} onChange={(event) => setEditForm((current) => ({ ...current, institution: event.target.value }))} />
                    </label>
                    <div className="modal-actions staff-edit-actions staff-edit-grid-span">
                      <button type="submit" className="primary-button" disabled={isSaving}>
                        {isSaving ? 'Saving profile...' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="staff-profile-detail-grid">
                    <InfoCard label="Department" value={employee.department} />
                    <InfoCard label="Branch" value={employee.branch} />
                    <InfoCard label="Status" value={employee.status} />
                    <InfoCard label="Date Employed" value={employee.date_employed || 'N/A'} />
                    <InfoCard label="SSNIT" value={employee.ssnit_number || 'N/A'} />
                    <InfoCard label="TIN" value={employee.tin_number || 'N/A'} />
                    <InfoCard label="Salary" value={employee.salary ? currency.format(Number(employee.salary)) : 'N/A'} />
                    <InfoCard label="Qualification" value={employee.qualification || 'N/A'} />
                    <InfoCard label="Institution" value={employee.institution || 'N/A'} />
                    <InfoCard label="Email" value={employee.email || 'N/A'} />
                    <InfoCard label="Phone" value={employee.phone || 'N/A'} />
                    <InfoCard label="Staff ID" value={employee.staff_id || 'N/A'} />
                  </div>
                )}

                <div className="staff-profile-modal-grid">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">Linked Portal User</p>
                        <h3>{detail?.linked_user?.name || 'No linked account'}</h3>
                      </div>
                    </div>
                    {detail?.linked_user ? (
                      <div className="finance-chip-row">
                        <div className="finance-chip"><span>Username</span><strong>{detail.linked_user.username}</strong></div>
                        <div className="finance-chip"><span>Role</span><strong>{detail.linked_user.role}</strong></div>
                        <div className="finance-chip"><span>Status</span><strong>{detail.linked_user.employee_status}</strong></div>
                      </div>
                    ) : (
                      <p className="muted-copy">This employee does not currently map to a portal login.</p>
                    )}
                  </section>

                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <p className="eyebrow">Attendance</p>
                        <h3>Recent clock activity</h3>
                      </div>
                    </div>
                    <div className="stack-list">
                      {(detail?.attendance ?? []).length ? (
                        detail.attendance.map((item) => (
                          <div key={item.id} className="stack-item">
                            <div>
                              <strong>{item.date}</strong>
                              <span>{item.staff_id || employee.staff_id}</span>
                            </div>
                            <div className="stack-meta">
                              <strong>{item.clock_in_time ? new Date(item.clock_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No clock-in'}</strong>
                              <span>{item.location_verified ? 'Verified' : 'Unverified'}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="muted-copy">No recent attendance records found.</p>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <p className="muted-copy">Unable to load the selected staff profile.</p>
            )}
          </article>
        </div>
      ) : null}
    </section>
  )
}

function InfoCard({ label, value }) {
  return (
    <div className="finance-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
