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
  date_of_birth: '',
  date_employed: '',
  ssnit_number: '',
  tin_number: '',
  salary: '',
  qualification: '',
  institution: '',
}

const emptyCreateForm = {
  name: '',
  email: '',
  phone: '',
  job_title: '',
  department: '',
  date_of_birth: '',
  gender: 'Other',
  marital_status: 'Single',
  residential_address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  employment_type: 'Full-Time',
  date_employed: '',
  ssnit_number: '',
  tin_number: '',
  bank_name: '',
  bank_branch: '',
  bank_other: '',
  account_name: '',
  account_number: '',
  salary: '',
  qualification: '',
  institution: '',
  year_completed: '',
  professional_license: '',
  status: 'active',
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
  const [modalMode, setModalMode] = useState('view')
  const [isSaving, setIsSaving] = useState(false)
  const [editForm, setEditForm] = useState(emptyEditForm)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
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
  const isEditing = modalMode === 'edit'
  const isCreating = modalMode === 'create'

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
    setModalMode('view')
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
      date_of_birth: nextEmployee.date_of_birth ?? '',
      date_employed: nextEmployee.date_employed ?? '',
      ssnit_number: nextEmployee.ssnit_number ?? '',
      tin_number: nextEmployee.tin_number ?? '',
      salary: nextEmployee.salary ?? '',
      qualification: nextEmployee.qualification ?? '',
      institution: nextEmployee.institution ?? '',
    })
  }

  function resetCreateForm() {
    setCreateForm(emptyCreateForm)
  }

  async function openEmployeeModal(employeeId) {
    setSelectedEmployeeId(employeeId)
    setIsModalOpen(true)
    setModalMode('view')
    setSuccess('')
    setError('')
    setDetail(null)
    setPhotoFile(null)
    setPhotoPreview('')
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

  function openCreateModal() {
    setIsModalOpen(true)
    setModalMode('create')
    setSelectedEmployeeId(null)
    setDetail(null)
    setSuccess('')
    setError('')
    setPhotoFile(null)
    setPhotoPreview('')
    resetCreateForm()
  }

  function closeModal() {
    setIsModalOpen(false)
    setModalMode('view')
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
      if (!isCreating) {
        emitHeaderProfile(employee ?? null)
      }
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const nextPreview = typeof reader.result === 'string' ? reader.result : ''
      setPhotoPreview(nextPreview)
      if (!isCreating) {
        emitHeaderProfile(employee ?? null, nextPreview)
      }
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
      body.append('date_of_birth', editForm.date_of_birth)
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

  async function submitCreate(event) {
    event.preventDefault()

    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const body = new FormData()
      body.append('name', createForm.name)
      body.append('email', createForm.email)
      body.append('phone', createForm.phone)
      body.append('job_title', createForm.job_title)
      body.append('department', createForm.department)
      body.append('date_of_birth', createForm.date_of_birth)
      body.append('gender', createForm.gender)
      body.append('marital_status', createForm.marital_status)
      body.append('residential_address', createForm.residential_address)
      body.append('emergency_contact_name', createForm.emergency_contact_name)
      body.append('emergency_contact_phone', createForm.emergency_contact_phone)
      body.append('employment_type', createForm.employment_type)
      body.append('date_employed', createForm.date_employed)
      body.append('ssnit_number', createForm.ssnit_number)
      body.append('tin_number', createForm.tin_number)
      body.append('bank_name', createForm.bank_name)
      body.append('bank_branch', createForm.bank_branch)
      body.append('bank_other', createForm.bank_other)
      body.append('account_name', createForm.account_name)
      body.append('account_number', createForm.account_number)
      body.append('salary', createForm.salary === '' ? '' : String(createForm.salary))
      body.append('qualification', createForm.qualification)
      body.append('institution', createForm.institution)
      body.append('year_completed', createForm.year_completed)
      body.append('professional_license', createForm.professional_license)
      body.append('status', createForm.status)
      body.append('branch_id', String(selectedBranchId))
      if (photoFile) body.append('photo', photoFile)

      const response = await apiFetch('/manager/employees', {
        method: 'POST',
        token,
        body,
      })

      const createdDetail = response.employee ? { ...response, employee: normalizeEmployee(response.employee) } : response
      setDetail(createdDetail)
      setSelectedEmployeeId(createdDetail.employee?.id ?? null)
      emitHeaderProfile(createdDetail.employee ?? null)
      resetEditor(createdDetail, { clearPreview: true })
      setModalMode('view')
      setSuccess(response.message || 'Staff profile created successfully.')
      setQuery((current) => ({ ...current, page: 1 }))
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
          <div className="modal-actions">
            <span className="panel-tag">
              {(data?.branch_name ?? 'Branch')} | {pagination?.total ?? 0} records
            </span>
            <button
              type="button"
              className="primary-button"
              onClick={openCreateModal}
              disabled={selectedBranchId === 0}
              title={selectedBranchId === 0 ? 'Switch to a branch before creating staff profiles.' : 'Register a new staff profile'}
            >
              New Staff
            </button>
          </div>
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
                <p className="eyebrow">
                  {isCreating ? 'Register Staff' : isEditing ? 'Edit Profile' : 'Staff Profile'}
                </p>
                <h3>{isCreating ? 'New staff registration' : employee?.name || 'Loading staff profile'}</h3>
              </div>
              <div className="modal-actions">
                {employee && !isCreating ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      if (isEditing) {
                        resetEditor()
                        return
                      }
                      resetEditor()
                      setModalMode('edit')
                    }}
                  >
                    {isEditing ? 'Cancel edit' : 'Edit profile'}
                  </button>
                ) : null}
                {isCreating ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      resetCreateForm()
                      setPhotoFile(null)
                      setPhotoPreview('')
                    }}
                  >
                    Reset form
                  </button>
                ) : null}
                <button type="button" className="ghost-button" onClick={closeModal}>Close</button>
              </div>
            </div>

            {isLoadingDetail ? (
              <p className="muted-copy">Loading staff profile...</p>
            ) : isCreating ? (
              <div className="staff-profile-modal-body">
                {error ? <div className="message-banner error">{error}</div> : null}
                {success ? <div className="message-banner success">{success}</div> : null}

                <section className="staff-profile-hero">
                  <div className="settings-avatar-block">
                    <div className="settings-avatar-frame staff-profile-avatar">
                      {photoPreview ? (
                        <img src={photoPreview} alt="New staff preview" className="settings-avatar-image" />
                      ) : createForm.name ? (
                        <span className="settings-avatar-fallback">{createForm.name.slice(0, 2).toUpperCase()}</span>
                      ) : (
                        <span className="settings-avatar-fallback">NS</span>
                      )}
                    </div>
                    <div className="settings-avatar-copy">
                      <strong>{createForm.name || 'New staff profile'}</strong>
                      <span>Staff ID will be assigned automatically</span>
                      <span>{data?.branch_name ?? 'Selected branch'}</span>
                    </div>
                  </div>

                  <label className="staff-photo-upload">
                    <span>Photo</span>
                    <input type="file" accept="image/*" onChange={handlePhotoChange} />
                  </label>
                </section>

                <form className="staff-edit-grid" onSubmit={submitCreate}>
                  <label>
                    Full name
                    <input value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} required />
                  </label>
                  <label>
                    Email
                    <input type="email" value={createForm.email} onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))} />
                  </label>
                  <label>
                    Phone
                    <input value={createForm.phone} onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))} required />
                  </label>
                  <label>
                    Job title
                    <input value={createForm.job_title} onChange={(event) => setCreateForm((current) => ({ ...current, job_title: event.target.value }))} />
                  </label>
                  <label>
                    Department
                    <input value={createForm.department} onChange={(event) => setCreateForm((current) => ({ ...current, department: event.target.value }))} />
                  </label>
                  <label>
                    Status
                    <select value={createForm.status} onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))}>
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </label>
                  <label>
                    Date of birth
                    <input type="date" value={createForm.date_of_birth} onChange={(event) => setCreateForm((current) => ({ ...current, date_of_birth: event.target.value }))} />
                  </label>
                  <label>
                    Gender
                    <select value={createForm.gender} onChange={(event) => setCreateForm((current) => ({ ...current, gender: event.target.value }))}>
                      <option value="Other">Other</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </label>
                  <label>
                    Marital status
                    <select value={createForm.marital_status} onChange={(event) => setCreateForm((current) => ({ ...current, marital_status: event.target.value }))}>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Divorced">Divorced</option>
                      <option value="Widowed">Widowed</option>
                    </select>
                  </label>
                  <label className="staff-edit-grid-span">
                    Residential address
                    <input value={createForm.residential_address} onChange={(event) => setCreateForm((current) => ({ ...current, residential_address: event.target.value }))} />
                  </label>
                  <label>
                    Emergency contact name
                    <input value={createForm.emergency_contact_name} onChange={(event) => setCreateForm((current) => ({ ...current, emergency_contact_name: event.target.value }))} />
                  </label>
                  <label>
                    Emergency contact phone
                    <input value={createForm.emergency_contact_phone} onChange={(event) => setCreateForm((current) => ({ ...current, emergency_contact_phone: event.target.value }))} />
                  </label>
                  <label>
                    Employment type
                    <select value={createForm.employment_type} onChange={(event) => setCreateForm((current) => ({ ...current, employment_type: event.target.value }))}>
                      <option value="Full-Time">Full-Time</option>
                      <option value="Part-Time">Part-Time</option>
                      <option value="Contract">Contract</option>
                    </select>
                  </label>
                  <label>
                    Date employed
                    <input type="date" value={createForm.date_employed} onChange={(event) => setCreateForm((current) => ({ ...current, date_employed: event.target.value }))} />
                  </label>
                  <label>
                    SSNIT number
                    <input value={createForm.ssnit_number} onChange={(event) => setCreateForm((current) => ({ ...current, ssnit_number: event.target.value }))} />
                  </label>
                  <label>
                    TIN number
                    <input value={createForm.tin_number} onChange={(event) => setCreateForm((current) => ({ ...current, tin_number: event.target.value }))} />
                  </label>
                  <label>
                    Bank name
                    <input value={createForm.bank_name} onChange={(event) => setCreateForm((current) => ({ ...current, bank_name: event.target.value }))} />
                  </label>
                  <label>
                    Bank branch
                    <input value={createForm.bank_branch} onChange={(event) => setCreateForm((current) => ({ ...current, bank_branch: event.target.value }))} />
                  </label>
                  <label>
                    Other bank info
                    <input value={createForm.bank_other} onChange={(event) => setCreateForm((current) => ({ ...current, bank_other: event.target.value }))} />
                  </label>
                  <label>
                    Account name
                    <input value={createForm.account_name} onChange={(event) => setCreateForm((current) => ({ ...current, account_name: event.target.value }))} />
                  </label>
                  <label>
                    Account number
                    <input value={createForm.account_number} onChange={(event) => setCreateForm((current) => ({ ...current, account_number: event.target.value }))} />
                  </label>
                  <label>
                    Salary
                    <input type="number" step="0.01" value={createForm.salary} onChange={(event) => setCreateForm((current) => ({ ...current, salary: event.target.value }))} />
                  </label>
                  <label>
                    Qualification
                    <input value={createForm.qualification} onChange={(event) => setCreateForm((current) => ({ ...current, qualification: event.target.value }))} />
                  </label>
                  <label>
                    Institution
                    <input value={createForm.institution} onChange={(event) => setCreateForm((current) => ({ ...current, institution: event.target.value }))} />
                  </label>
                  <label>
                    Year completed
                    <input type="number" min="1900" max="2100" value={createForm.year_completed} onChange={(event) => setCreateForm((current) => ({ ...current, year_completed: event.target.value }))} />
                  </label>
                  <label className="staff-edit-grid-span">
                    Professional license
                    <input value={createForm.professional_license} onChange={(event) => setCreateForm((current) => ({ ...current, professional_license: event.target.value }))} />
                  </label>
                  <div className="modal-actions staff-edit-actions staff-edit-grid-span">
                    <button type="button" className="ghost-button" onClick={closeModal}>
                      Cancel
                    </button>
                    <button type="submit" className="primary-button" disabled={isSaving}>
                      {isSaving ? 'Creating staff...' : 'Register staff'}
                    </button>
                  </div>
                </form>
              </div>
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
                      Date of birth
                      <input type="date" value={editForm.date_of_birth} onChange={(event) => setEditForm((current) => ({ ...current, date_of_birth: event.target.value }))} />
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
                    <InfoCard label="Date of Birth" value={employee.date_of_birth || 'N/A'} />
                    <InfoCard label="Age" value={employee.age ?? 'N/A'} />
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
