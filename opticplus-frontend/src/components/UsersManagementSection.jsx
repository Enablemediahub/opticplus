import { useEffect, useState } from 'react'
import StatWidget from './StatWidget.jsx'

const defaultFilters = () => ({
  search: '',
  role: 'all',
  status: 'all',
  page: 1,
  per_page: 12,
})

const defaultForm = () => ({
  id: null,
  name: '',
  username: '',
  password: '',
  role: 'receptionist',
  employee_status: 'active',
  phone: '',
  email: '',
  profile_image_url: '',
})

const defaultResetPasswordForm = () => ({
  userId: null,
  userName: '',
  password: '',
  password_confirmation: '',
})

export default function UsersManagementSection({ token, selectedBranchId, apiFetch, onHeaderProfileChange = () => {} }) {
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState(defaultFilters())
  const [query, setQuery] = useState(defaultFilters())
  const [form, setForm] = useState(defaultForm())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [busyUserId, setBusyUserId] = useState(null)
  const [profileImageFile, setProfileImageFile] = useState(null)
  const [profileImagePreview, setProfileImagePreview] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [resetPasswordForm, setResetPasswordForm] = useState(defaultResetPasswordForm())
  const [isResetPasswordVisible, setIsResetPasswordVisible] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadUsers() {
      setIsLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          branch_id: String(selectedBranchId),
          page: String(query.page),
          per_page: String(query.per_page),
        })

        if (query.search) params.set('search', query.search)
        if (query.role && query.role !== 'all') params.set('role', query.role)
        if (query.status && query.status !== 'all') params.set('status', query.status)

        const response = await apiFetch(`/manager/users?${params.toString()}`, { token })
        if (!cancelled) setData(response)
      } catch (nextError) {
        if (!cancelled) setError(nextError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadUsers()
    return () => {
      cancelled = true
    }
  }, [apiFetch, query, selectedBranchId, token])

  useEffect(() => () => {
    onHeaderProfileChange(null)
  }, [onHeaderProfileChange])

  function openCreateModal() {
    setForm(defaultForm())
    setProfileImageFile(null)
    setProfileImagePreview('')
    setIsPasswordVisible(false)
    onHeaderProfileChange(null)
    setIsModalOpen(true)
  }

  function syncUserRecord(record) {
    if (!record) return

    setData((current) => {
      if (!current) return current

      const nextRecords = (current.records ?? []).map((item) => (
        item.id === record.id ? { ...item, ...record } : item
      ))

      return { ...current, records: nextRecords }
    })
  }

  function openEditModal(record) {
    setForm({ ...record, password: '' })
    setProfileImageFile(null)
    setProfileImagePreview(record.profile_image_url || '')
    setIsPasswordVisible(false)
    onHeaderProfileChange(record)
    setIsModalOpen(true)
  }

  function closeModal(nextHeroRecord = null) {
    setIsModalOpen(false)
    setProfileImageFile(null)
    setProfileImagePreview('')
    setIsPasswordVisible(false)
    if (nextHeroRecord) {
      onHeaderProfileChange(nextHeroRecord)
    } else {
      onHeaderProfileChange(null)
    }
  }

  function openResetPasswordModal(record) {
    setResetPasswordForm({
      userId: record.id,
      userName: record.name || record.username || 'this user',
      password: '',
      password_confirmation: '',
    })
    setIsResetPasswordVisible(false)
  }

  function closeResetPasswordModal() {
    setResetPasswordForm(defaultResetPasswordForm())
    setIsResetPasswordVisible(false)
  }

  function handleProfileImageChange(event) {
    const file = event.target.files?.[0] ?? null
    setProfileImageFile(file)

    if (!file) {
      setProfileImagePreview(form.profile_image_url || '')
      onHeaderProfileChange(form.id ? { ...form, profile_image_url: form.profile_image_url || '' } : null)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const preview = typeof reader.result === 'string' ? reader.result : ''
      setProfileImagePreview(preview)
      if (form.id) {
        onHeaderProfileChange({ ...form, profile_image_url: preview })
      }
    }
    reader.readAsDataURL(file)
  }

  async function submitUser(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        name: form.name,
        username: form.username,
        role: form.role,
        employee_status: form.employee_status,
        phone: form.phone,
        email: form.email,
      }

      if (form.id) {
        const body = new FormData()
        body.append('name', payload.name)
        body.append('username', payload.username)
        body.append('role', payload.role)
        body.append('employee_status', payload.employee_status)
        body.append('phone', payload.phone || '')
        body.append('email', payload.email || '')
        if (form.password.trim()) body.append('password', form.password)
        if (profileImageFile) body.append('profile_image', profileImageFile)

        const response = await apiFetch(`/manager/users/${form.id}?branch_id=${selectedBranchId}`, {
          method: 'POST',
          token,
          body,
        })
        const nextRecord = response?.record ?? null
        if (nextRecord) {
          syncUserRecord(nextRecord)
          onHeaderProfileChange(nextRecord)
        }
        setSuccess(response?.message || 'User updated successfully.')
        closeModal(nextRecord)
      } else {
        const response = await apiFetch(`/manager/users?branch_id=${selectedBranchId}`, {
          method: 'POST',
          token,
          body: { ...payload, password: form.password },
        })
        setSuccess(response?.message || 'User added successfully.')
        closeModal()
      }
      setForm(defaultForm())
      setProfileImageFile(null)
      setProfileImagePreview('')
      setQuery((current) => ({ ...current }))
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function performAction(userId, action, promptMessage = '') {
    if (promptMessage && !window.confirm(promptMessage)) return

    setBusyUserId(userId)
    setError('')
    setSuccess('')

    try {
      let response
      if (action === 'toggle') {
        response = await apiFetch(`/manager/users/${userId}/toggle-status?branch_id=${selectedBranchId}`, {
          method: 'PATCH',
          token,
        })
      } else if (action === 'delete') {
        response = await apiFetch(`/manager/users/${userId}?branch_id=${selectedBranchId}`, {
          method: 'DELETE',
          token,
        })
      }

      setSuccess(response?.message || 'Action completed successfully.')
      setQuery((current) => ({ ...current }))
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusyUserId(null)
    }
  }

  async function submitResetPassword(event) {
    event.preventDefault()
    setBusyUserId(resetPasswordForm.userId)
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(
        `/manager/users/${resetPasswordForm.userId}/reset-password?branch_id=${selectedBranchId}`,
        {
          method: 'PATCH',
          token,
          body: {
            password: resetPasswordForm.password,
            password_confirmation: resetPasswordForm.password_confirmation,
          },
        },
      )

      setSuccess(response?.message || 'Password reset successfully.')
      closeResetPasswordModal()
      setQuery((current) => ({ ...current }))
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Users</p>
          <h3>Manage portal access, roles, and account status</h3>
          <p className="header-copy">General manager controls for creating users, editing permissions, resetting passwords, and retiring access.</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="Total Users" value={data?.stats.total ?? '...'} note="Accounts in the selected branch" icon="settings" className="total" />
        <StatWidget label="Active" value={data?.stats.active ?? '...'} note="Currently enabled accounts" icon="check-badge" className="seen" />
        <StatWidget label="Inactive" value={data?.stats.inactive ?? '...'} note="Disabled or incomplete access" icon="alert" className="pending" />
        <StatWidget label="Roles" value={data?.roles?.length ?? '...'} note="Role groups in use" icon="layers" className="today" />
      </section>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h3>User management</h3>
          </div>
          <button type="button" className="primary-button" onClick={openCreateModal}>
            Add user
          </button>
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
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Name, username, email" />
          </label>
          <label>
            Role
            <select value={filters.role} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}>
              <option value="all">All roles</option>
              {(data?.roles ?? []).map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <div className="filter-actions-row">
            <button type="submit" className="primary-button">Apply</button>
            <button type="button" className="ghost-button" onClick={() => { const reset = defaultFilters(); setFilters(reset); setQuery(reset) }}>
              Reset
            </button>
          </div>
        </form>

        <div className="table-shell">
          <table className="portal-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Staff</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !data ? (
                <tr><td colSpan="6">Loading users...</td></tr>
              ) : (
                (data?.records ?? []).map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.name}</strong>
                      <div className="muted-copy">{record.username}</div>
                    </td>
                    <td>{record.role}</td>
                    <td>
                      <strong>{record.staff_id || 'Unlinked'}</strong>
                      <div className="muted-copy">{record.job_title || record.department || 'No employee link yet'}</div>
                    </td>
                    <td>
                      <span className={`status-pill status-${record.employee_status}`}>{record.employee_status}</span>
                    </td>
                    <td>
                      <div>{record.email || 'No email'}</div>
                      <div className="muted-copy">{record.phone || 'No phone'}</div>
                    </td>
                    <td>
                      <div className="manager-action-row">
                        <button type="button" className="mini-action" onClick={() => openEditModal(record)}>Edit</button>
                        <button type="button" className="mini-action" disabled={busyUserId === record.id} onClick={() => performAction(record.id, 'toggle', `Change status for ${record.name}?`)}>
                          {record.employee_status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" className="mini-action" disabled={busyUserId === record.id} onClick={() => openResetPasswordModal(record)}>
                          Reset password
                        </button>
                        <button type="button" className="mini-action" disabled={busyUserId === record.id} onClick={() => performAction(record.id, 'delete', `Delete ${record.name}? This cannot be undone.`)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {isModalOpen ? (
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{form.id ? 'Edit User' : 'New User'}</p>
                <h3>{form.id ? 'Update access account' : 'Create portal account'}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={closeModal}>Close</button>
            </div>

            <form className="settings-grid" onSubmit={submitUser}>
              {error ? <div className="message-banner error full-span">{error}</div> : null}
              {form.id ? (
                <div className="full-span settings-avatar-block">
                  <div className="settings-avatar-frame staff-profile-avatar">
                    {profileImagePreview ? (
                      <img src={profileImagePreview} alt={`${form.name} profile`} className="settings-avatar-image" />
                    ) : (
                      <span className="settings-avatar-fallback">{String(form.name || 'PR').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <label className="staff-photo-upload">
                    <span>Upload profile image</span>
                    <input type="file" accept="image/*" onChange={handleProfileImageChange} />
                  </label>
                </div>
              ) : null}
              <label>
                Full name
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label>
                Username
                <input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} required />
              </label>
              <label>
                Email
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label>
                Phone
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label>
                Role
                <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
                  <option value="manager">manager</option>
                  <option value="accountant">accountant</option>
                  <option value="optometrist">optometrist</option>
                  <option value="receptionist">receptionist</option>
                  <option value="technician">technician</option>
                  <option value="sales">sales</option>
                  <option value="inventory-manager">inventory-manager</option>
                </select>
              </label>
              <label>
                Status
                <select value={form.employee_status} onChange={(event) => setForm((current) => ({ ...current, employee_status: event.target.value }))}>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
              <label className="full-span">
                {form.id ? 'Password' : 'Password'}
                <div className="password-field">
                  <input
                    type={isPasswordVisible ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    required={!form.id}
                    placeholder={form.id ? 'Leave blank to keep current password' : 'Enter password'}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setIsPasswordVisible((current) => !current)}
                    aria-label={isPasswordVisible ? 'Conceal password' : 'Reveal password'}
                  >
                    {isPasswordVisible ? 'Conceal' : 'Reveal'}
                  </button>
                </div>
                {form.id ? <span className="field-hint">Leave blank to keep the current password, or enter a new one for this user.</span> : null}
              </label>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving...' : form.id ? 'Update user' : 'Create user'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {resetPasswordForm.userId ? (
        <div className="modal-overlay">
          <div className="modal-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Reset Password</p>
                <h3>Set a new password for {resetPasswordForm.userName}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={closeResetPasswordModal}>Close</button>
            </div>

            <form className="settings-grid" onSubmit={submitResetPassword}>
              {error ? <div className="message-banner error full-span">{error}</div> : null}
              <label className="full-span">
                New password
                <div className="password-field">
                  <input
                    type={isResetPasswordVisible ? 'text' : 'password'}
                    value={resetPasswordForm.password}
                    onChange={(event) => setResetPasswordForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Enter new password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setIsResetPasswordVisible((current) => !current)}
                    aria-label={isResetPasswordVisible ? 'Conceal password' : 'Reveal password'}
                  >
                    {isResetPasswordVisible ? 'Conceal' : 'Reveal'}
                  </button>
                </div>
              </label>
              <label className="full-span">
                Confirm new password
                <input
                  type={isResetPasswordVisible ? 'text' : 'password'}
                  value={resetPasswordForm.password_confirmation}
                  onChange={(event) => setResetPasswordForm((current) => ({ ...current, password_confirmation: event.target.value }))}
                  placeholder="Confirm new password"
                  required
                />
                <span className="field-hint">The user will sign in with this new password and can change it later from Settings.</span>
              </label>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button" disabled={busyUserId === resetPasswordForm.userId}>
                  {busyUserId === resetPasswordForm.userId ? 'Resetting...' : 'Set new password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
