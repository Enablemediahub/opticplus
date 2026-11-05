import { useEffect, useMemo, useState } from 'react'
import PortalIcon from './PortalIcon.jsx'
import StatWidget from './StatWidget.jsx'

export default function OptometristPrescriptionsSection({
  dashboard,
  patientData,
  fetchGlassesPrescriptions,
  deleteGlassesPrescriptions,
  updatePatientPrescription,
  fetchPatientExamForm,
  savePatientExamForm,
  companyProfile,
}) {
  const [filters, setFilters] = useState({ search: '', date_from: '', date_to: '' })
  const [query, setQuery] = useState({ search: '', date_from: '', date_to: '' })
  const [records, setRecords] = useState([])
  const [selectedRecords, setSelectedRecords] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 15,
    total: 0,
    total_pages: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedPrescription, setSelectedPrescription] = useState(null)
  const sortedRecords = useMemo(
    () => [...records].sort(comparePrescriptionRecency),
    [records],
  )
  const selectedKeys = useMemo(
    () => new Set(selectedRecords.map((record) => getPrescriptionRowKey(record))),
    [selectedRecords],
  )
  const pageKeys = sortedRecords.map((record) => getPrescriptionRowKey(record))
  const allPageSelected = pageKeys.length > 0 && pageKeys.every((key) => selectedKeys.has(key))

  const stats = [
    {
      label: 'Completed Prescriptions',
      value: dashboard?.stats?.completed_prescriptions ?? 0,
      note: 'Marked completed in the branch',
      icon: 'glasses',
      className: 'seen',
    },
    {
      label: 'Pending Patients',
      value: patientData?.stats?.pending_count ?? 0,
      note: 'Patients still moving through examination',
      icon: 'alert',
      className: 'pending',
    },
    {
      label: 'Database Patients',
      value: patientData?.stats?.database_total_count ?? patientData?.stats?.total_count ?? 0,
      note: 'Available for prescription reference',
      icon: 'patients',
      className: 'total',
    },
  ]

  useEffect(() => {
    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetchGlassesPrescriptions({
          search: query.search,
          page: pagination.page,
          perPage: pagination.per_page,
          dateFrom: query.date_from,
          dateTo: query.date_to,
        })

        if (!cancelled) {
          const nextRecords = response.records ?? response.prescriptions ?? []
          setRecords(nextRecords)
          setPagination((current) => ({
            ...current,
            ...(response.pagination ?? {}),
          }))
        }
      } catch (error) {
        if (!cancelled) {
          setRecords([])
          setLoadError(error.message || 'Could not load prescriptions right now.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [fetchGlassesPrescriptions, pagination.page, pagination.per_page, query, refreshKey])

  const resultCountLabel = useMemo(() => {
    if (isLoading) return 'Loading...'
    return `${pagination.total ?? 0} total`
  }, [isLoading, pagination.total])

  function applyFilters(event) {
    event.preventDefault()
    setPagination((current) => ({ ...current, page: 1 }))
    setQuery({ ...filters })
    setSelectedRecords([])
    setSuccessMessage('')
  }

  function resetFilters() {
    const cleared = { search: '', date_from: '', date_to: '' }
    setFilters(cleared)
    setQuery(cleared)
    setPagination((current) => ({ ...current, page: 1 }))
    setSelectedRecords([])
    setSuccessMessage('')
  }

  function toggleRecord(record) {
    const key = getPrescriptionRowKey(record)
    if (!selectedKeys.has(key) && selectedRecords.length >= 100) {
      setLoadError('You can delete up to 100 prescriptions in one bulk action.')
      return
    }

    setLoadError('')
    setSelectedRecords((current) => current.some((item) => getPrescriptionRowKey(item) === key)
      ? current.filter((item) => getPrescriptionRowKey(item) !== key)
      : [...current, record])
  }

  function togglePageSelection() {
    if (!allPageSelected) {
      const currentKeys = new Set(selectedRecords.map((item) => getPrescriptionRowKey(item)))
      const newSelectionCount = sortedRecords.filter((item) => !currentKeys.has(getPrescriptionRowKey(item))).length
      if (selectedRecords.length + newSelectionCount > 100) {
        setLoadError('You can delete up to 100 prescriptions in one bulk action.')
        return
      }
    }

    setLoadError('')
    setSelectedRecords((current) => {
      if (allPageSelected) {
        return current.filter((item) => !pageKeys.includes(getPrescriptionRowKey(item)))
      }

      const currentKeys = new Set(current.map((item) => getPrescriptionRowKey(item)))
      return [...current, ...sortedRecords.filter((item) => !currentKeys.has(getPrescriptionRowKey(item)))]
    })
  }

  async function deleteSelected(recordsToDelete) {
    if (!recordsToDelete.length) return
    if (recordsToDelete.length > 100) {
      setLoadError('You can delete up to 100 prescriptions in one bulk action.')
      return
    }
    const countLabel = recordsToDelete.length === 1 ? 'this prescription' : `${recordsToDelete.length} prescriptions`
    if (!window.confirm(`Delete ${countLabel}? Deleted prescriptions are hidden from the list, and the deletion will be recorded in Audit Log.`)) return

    setIsLoading(true)
    setLoadError('')
    setSuccessMessage('')
    try {
      await deleteGlassesPrescriptions(recordsToDelete.map(toPrescriptionReference))
      setSelectedRecords([])
      setRefreshKey((current) => current + 1)
      setSuccessMessage(`${recordsToDelete.length} prescription${recordsToDelete.length === 1 ? '' : 's'} deleted. The action is recorded in Audit Log.`)
    } catch (error) {
      setLoadError(error.message || 'Could not delete the selected prescriptions.')
    } finally {
      setIsLoading(false)
    }
  }

  async function savePrescriptionEdit(record, editForm) {
    if (record.source === 'exam_form') {
      const response = await fetchPatientExamForm(record.patient_id, { formId: record.form_id })
      const selectedForm = response.selected_form ?? response.latest_form
      if (!selectedForm?.form_data) {
        throw new Error('The saved examination form could not be loaded.')
      }

      const isDraft = selectedForm.status === 'draft'
      const latestForm = response.latest_form
      if (isDraft && String(selectedForm.id) !== String(latestForm?.id)) {
        throw new Error('This draft is not the latest version. Open the examination history to edit it safely.')
      }

      const formData = structuredClone(selectedForm.form_data)
      formData.spectacle_rx ??= {}
      formData.spectacle_rx.od ??= {}
      formData.spectacle_rx.os ??= {}
      for (const [field, formField] of [
        ['sph_od', 'sphere'],
        ['cyl_od', 'cylinder'],
        ['axis_od', 'axis'],
        ['add_od', 'add'],
        ['sph_os', 'sphere'],
        ['cyl_os', 'cylinder'],
        ['axis_os', 'axis'],
        ['add_os', 'add'],
      ]) {
        const eye = field.endsWith('_od') ? 'od' : 'os'
        formData.spectacle_rx[eye][formField] = editForm[field]
      }
      formData.spectacle_rx.od.lens_type = editForm.lens_type
      formData.spectacle_rx.os.lens_type = editForm.lens_type
      formData.diagnosis ??= {}
      formData.diagnosis.prescription = editForm.notes

      const payload = {
        status: isDraft ? 'draft' : 'completed',
        form_data: formData,
        ...(!isDraft ? { create_new_version: true } : {}),
      }
      try {
        await savePatientExamForm(record.patient_id, payload)
      } catch (error) {
        if (!error.data?.requires_order_replacement_confirmation || !window.confirm(
          'A lens order has already been placed for the current prescription. Saving this revision will mark that order as superseded. Continue?',
        )) {
          throw error
        }
        await savePatientExamForm(record.patient_id, { ...payload, replace_placed_order: true })
      }
    } else {
      if (!record.row_id) {
        throw new Error('This prescription is missing its row identifier and cannot be edited.')
      }
      await updatePatientPrescription(record.patient_id, record.row_id, editForm)
    }

    setRefreshKey((current) => current + 1)
    setSuccessMessage(record.source === 'exam_form'
      ? 'Prescription updated. Completed exam-form edits are saved as a new version, and the change is recorded in Audit Log.'
      : 'Prescription updated successfully. The change is recorded in Audit Log.')
    setSelectedPrescription(null)
  }

  function changePage(nextPage) {
    setPagination((current) => ({
      ...current,
      page: nextPage,
    }))
  }

  return (
    <section className="module-section prescriptions-module-section">
      <div className="panel-heading prescriptions-module-heading">
        <div>
          <p className="eyebrow">Prescriptions</p>
          <h3>Glasses prescriptions from the branch database</h3>
          <p className="header-copy">
            Search by folder ID or patient name, then review prescription data sourced from the saved examination forms, with the legacy glasses table still available as fallback history.
          </p>
        </div>
      </div>

      <section className="stats-grid patient-stats-grid prescriptions-module-stats">
        {stats.map((stat) => (
          <StatWidget
            key={stat.label}
            label={stat.label}
            value={stat.value}
            note={stat.note}
            icon={stat.icon}
            className={stat.className}
          />
        ))}
      </section>

      <div className="optometrist-workspace-stack prescriptions-module-list">
        <article className="panel optometrist-workspace-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Prescription List</p>
              <h3>Search and review saved prescriptions</h3>
            </div>
            <span className="panel-tag">{resultCountLabel}</span>
          </div>

          <form className="patient-filter-grid table-attached-filter" onSubmit={applyFilters}>
            <label>
              Search
              <input
                value={filters.search}
                onChange={(event) => {
                  const search = event.target.value
                  setFilters((current) => ({ ...current, search }))
                  setQuery((current) => ({ ...current, search }))
                  setPagination((current) => ({ ...current, page: 1 }))
                  setSelectedRecords([])
                }}
                placeholder="Folder ID or patient name"
              />
            </label>
            <label>
              Date from
              <input
                type="date"
                value={filters.date_from}
                onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))}
              />
            </label>
            <label>
              Date to
              <input
                type="date"
                value={filters.date_to}
                onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))}
              />
            </label>
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button" disabled={isLoading}>Apply filters</button>
              <button type="button" className="ghost-button" onClick={resetFilters} disabled={isLoading}>Reset</button>
            </div>
          </form>

          {loadError ? <p className="muted-copy">{loadError}</p> : null}
          {successMessage ? <p className="muted-copy" role="status">{successMessage}</p> : null}
          {selectedRecords.length > 0 ? (
            <div className="optometrist-inline-actions">
              <span className="panel-tag">{selectedRecords.length} selected</span>
              <button type="button" className="ghost-button" onClick={() => deleteSelected(selectedRecords)} disabled={isLoading}>
                Delete selected
              </button>
            </div>
          ) : null}

          {isLoading ? (
            <p className="muted-copy">Loading prescriptions...</p>
          ) : records.length === 0 ? (
            <div className="empty-state-panel">
              <PortalIcon name="glasses" className="module-icon" />
              <h3>No prescriptions found</h3>
              <p className="muted-copy">Try another patient name or folder ID.</p>
            </div>
          ) : (
            <div className="table-shell">
              <table className="portal-table inventory-table-wide">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all prescriptions on this page"
                        checked={allPageSelected}
                        onChange={togglePageSelection}
                      />
                    </th>
                    <th>Date</th>
                    <th>Patient</th>
                    <th>Folder ID</th>
                    <th>OD / OS Prescription</th>
                    <th>IPD</th>
                    <th>Lens Type</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((record, index) => (
                    <tr key={getPrescriptionRowKey(record, index)}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select prescription for ${formatPatientName(record)}`}
                          checked={selectedKeys.has(getPrescriptionRowKey(record, index))}
                          onChange={() => toggleRecord(record)}
                        />
                      </td>
                      <td>{formatDate(record.date)}</td>
                      <td><strong>{formatPatientName(record)}</strong></td>
                      <td>{record.folder_id || 'N/A'}</td>
                      <td>
                        <div className="optometrist-prescription-history">
                          <small>OD: {formatEye(record.sph_od, record.cyl_od, record.axis_od, record.add_od)}</small>
                          <small>OS: {formatEye(record.sph_os, record.cyl_os, record.axis_os, record.add_os)}</small>
                        </div>
                      </td>
                      <td>{record.ipd || 'N/A'}</td>
                      <td>{record.lens_type || 'N/A'}</td>
                      <td>
                        <span className={`status-pill status-${String(getPatientSeenStatus(record) || '').toLowerCase().replaceAll(' ', '-')}`}>
                          {getPatientSeenStatus(record)}
                        </span>
                      </td>
                      <td>
                        {record.source === 'exam_form'
                          ? `Exam Form${record.latest_form_version ? ` V${record.latest_form_version}` : (record.form_version ? ` V${record.form_version}` : '')} • ${
                              record.prescription_state === 'active'
                                ? 'Current'
                                : record.prescription_state === 'superseded'
                                  ? 'Superseded'
                                  : 'Draft'
                            }`
                          : 'Glasses Table'}
                      </td>
                      <td>
                        <div className="optometrist-inline-actions">
                          <button type="button" className="ghost-button" onClick={() => setSelectedPrescription(record)}>
                            Prescription
                          </button>
                          <button type="button" className="ghost-button" onClick={() => deleteSelected([record])} disabled={isLoading}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pagination.total_pages > 1 ? (
            <div className="pagination-bar">
              <span className="muted-copy">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="mini-action"
                  onClick={() => changePage(pagination.page - 1)}
                  disabled={pagination.page <= 1 || isLoading}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="mini-action"
                  onClick={() => changePage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages || isLoading}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </div>
      {selectedPrescription ? (
        <PrescriptionModal
          prescription={selectedPrescription}
          companyProfile={companyProfile}
          onSave={savePrescriptionEdit}
          onClose={() => setSelectedPrescription(null)}
        />
      ) : null}
    </section>
  )
}

function PrescriptionModal({
  prescription,
  companyProfile,
  onSave,
  onClose,
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState(() => createPrescriptionEditForm(prescription))
  const [isSaving, setIsSaving] = useState(false)
  const [editMessage, setEditMessage] = useState('')

  function beginEditing() {
    setEditForm(createPrescriptionEditForm(prescription))
    setEditMessage('')
    setIsEditing(true)
  }

  async function saveEdit(event) {
    event.preventDefault()
    setIsSaving(true)
    setEditMessage('')

    try {
      await onSave(prescription, editForm)
      setIsEditing(false)
    } catch (error) {
      setEditMessage(error.message || 'Could not update prescription.')
    } finally {
      setIsSaving(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  function handleExportPdf() {
    window.print()
  }

  const patientName = formatPatientName(prescription)
  const dateValue = formatDate(prescription.date || prescription.latest_form_updated_at)
  const status = getPatientSeenStatus(prescription)
  const companyName = String(companyProfile?.company_name || 'BEALET OPTICAL CENTER').toUpperCase()
  const companyTagline = companyProfile?.tagline || 'Professional Eye Care and Optical Services'
  const phonePrimary = companyProfile?.company_phone_primary || 'N/A'
  const phoneSecondary = companyProfile?.company_phone_secondary || ''
  const companyEmail = companyProfile?.company_email || 'N/A'
  const branchAddress = companyProfile?.madina_address || companyProfile?.labadi_address || 'Address not provided'
  const phoneLabel = phoneSecondary ? `${phonePrimary} | ${phoneSecondary}` : phonePrimary

  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel optometrist-exam-modal" onClick={(event) => event.stopPropagation()}>
        <header className="panel-heading">
          <div>
            <p className="eyebrow">Prescription</p>
            <h3>{patientName}</h3>
            <p className="muted-copy">{prescription.folder_id || 'No folder ID'} • {dateValue}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={handlePrint}>Print</button>
            <button type="button" className="primary-button" onClick={handleExportPdf}>Export PDF</button>
            {prescription.patient_id ? (
              <button type="button" className="ghost-button" onClick={beginEditing}>Edit Prescription</button>
            ) : null}
            <button type="button" className="ghost-button" onClick={onClose}>Close</button>
          </div>
          {prescription.edited_by_name ? (
            <p className="muted-copy">Edited by {prescription.edited_by_name}{prescription.edited_by_role ? ` (${prescription.edited_by_role})` : ''}{prescription.edited_at ? ` on ${formatDate(prescription.edited_at)}` : ''}</p>
          ) : null}
        </header>

        <section className="prescription-sheet" aria-label="Prescription sheet">
          <header className="prescription-sheet-header">
            <div>
              <h5>{companyName}</h5>
              <p>Professional Spectacle Prescription</p>
            </div>
            <div className="prescription-sheet-meta">
              <strong>Status: {status}</strong>
              <span>
                Source: {prescription.source === 'exam_form'
                  ? `Exam Form V${prescription.form_version ?? prescription.latest_form_version ?? '—'} • ${
                      prescription.prescription_state === 'active'
                        ? 'Current'
                        : prescription.prescription_state === 'superseded'
                          ? 'Superseded'
                          : 'Draft'
                    }`
                  : 'Glasses Table'}
              </span>
            </div>
          </header>

          <div className="prescription-sheet-patient">
            <span><strong>Patient:</strong> {patientName}</span>
            <span><strong>Folder ID:</strong> {prescription.folder_id || 'N/A'}</span>
            <span><strong>Date:</strong> {dateValue}</span>
            <span><strong>IPD:</strong> {fallbackValue(prescription.ipd)}</span>
          </div>

          <div className="prescription-table-shell">
            <table className="prescription-table">
              <thead>
                <tr>
                  <th>Eye</th>
                  <th>SPH</th>
                  <th>CYL</th>
                  <th>AXIS</th>
                  <th>ADD</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>OD (Right)</td>
                  <td>{fallbackValue(prescription.sph_od)}</td>
                  <td>{fallbackValue(prescription.cyl_od)}</td>
                  <td>{fallbackValue(prescription.axis_od)}</td>
                  <td>{fallbackValue(prescription.add_od)}</td>
                </tr>
                <tr>
                  <td>OS (Left)</td>
                  <td>{fallbackValue(prescription.sph_os)}</td>
                  <td>{fallbackValue(prescription.cyl_os)}</td>
                  <td>{fallbackValue(prescription.axis_os)}</td>
                  <td>{fallbackValue(prescription.add_os)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="prescription-sheet-footer">
            <span><strong>Lens Type:</strong> {fallbackValue(prescription.lens_type)}</span>
            <span><strong>Material:</strong> {fallbackValue(prescription.lens_material)}</span>
            <span><strong>Color:</strong> {fallbackValue(prescription.color)}</span>
          </div>
          <p className="prescription-sheet-notes">
            <strong>Notes:</strong> {fallbackValue(prescription.notes)}
          </p>
          <div className="prescription-sheet-contact">
            <strong>{companyName}</strong>
            <span>{branchAddress}</span>
            <span>{companyTagline}</span>
            <span>{phoneLabel}</span>
            <span>{companyEmail}</span>
          </div>
        </section>
        {isEditing ? (
          <form className="optometrist-workspace-card optometrist-management-form" onSubmit={saveEdit}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Edit Prescription</p>
                <h4>{prescription.source === 'exam_form' ? 'Update exam-form prescription' : 'Update saved glasses prescription'}</h4>
                {prescription.source === 'exam_form' ? (
                  <p className="muted-copy">
                    Completed edits are saved as a new version so prior examination history is retained.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="optometrist-exam-grid">
              {(prescription.source === 'exam_form'
                ? ['sph_od', 'cyl_od', 'axis_od', 'add_od', 'sph_os', 'cyl_os', 'axis_os', 'add_os', 'lens_type']
                : ['date', 'ipd', 'sph_od', 'cyl_od', 'axis_od', 'add_od', 'sph_os', 'cyl_os', 'axis_os', 'add_os', 'lens_type', 'lens_material', 'color']
              ).map((field) => (
                <label key={field}>
                  {field.replaceAll('_', ' ').toUpperCase()}
                  <input type={field === 'date' ? 'date' : 'text'} value={editForm[field] || ''} onChange={(event) => setEditForm((current) => ({ ...current, [field]: event.target.value }))} />
                </label>
              ))}
              <label className="full-span">
                Notes
                <textarea rows="3" value={editForm.notes || ''} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <div className="optometrist-inline-actions">
              <button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Saving...' : 'Update Prescription'}</button>
              <button type="button" className="ghost-button" onClick={() => setIsEditing(false)}>Cancel Edit</button>
              {editMessage ? <span className="panel-tag">{editMessage}</span> : null}
            </div>
          </form>
        ) : null}
      </article>
    </div>
  )
}

function createPrescriptionEditForm(prescription) {
  return {
    date: prescription?.date || '',
    ipd: prescription?.ipd || '',
    sph_od: prescription?.sph_od || '',
    cyl_od: prescription?.cyl_od || '',
    axis_od: prescription?.axis_od || '',
    add_od: prescription?.add_od || '',
    sph_os: prescription?.sph_os || '',
    cyl_os: prescription?.cyl_os || '',
    axis_os: prescription?.axis_os || '',
    add_os: prescription?.add_os || '',
    lens_type: prescription?.lens_type || '',
    lens_material: prescription?.lens_material || '',
    color: prescription?.color || '',
    notes: prescription?.notes || '',
  }
}

function formatPatientName(record) {
  return record.name || [record.surname, record.firstname, record.othernames].filter(Boolean).join(' ') || 'Unknown Patient'
}

function formatDate(dateValue) {
  if (!dateValue) return 'N/A'
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatEye(sph, cyl, axis, add) {
  return `${fallbackValue(sph)} / ${fallbackValue(cyl)} x ${fallbackValue(axis)} Add ${fallbackValue(add)}`
}

function fallbackValue(value) {
  if (value === null || value === undefined || value === '') return 'N/A'
  return String(value)
}

function getPatientSeenStatus(record) {
  if (record?.patient_status === 'pending') return 'pending'
  if (record?.patient_status === 'seen') return 'seen'
  return record?.latest_form_status || record?.status || 'pending'
}

function comparePrescriptionRecency(left, right) {
  const leftDate = buildPrescriptionRecencyStamp(left)
  const rightDate = buildPrescriptionRecencyStamp(right)
  return rightDate.localeCompare(leftDate)
}

function buildPrescriptionRecencyStamp(record) {
  return [
    String(record?.date || record?.latest_form_updated_at || record?.updated_at || record?.created_at || ''),
    String(record?.created_at || record?.latest_form_updated_at || record?.updated_at || ''),
    String(record?.prescription_id || record?.form_id || record?.billing_id || ''),
  ].join('|')
}

function getPrescriptionRowKey(record, index = 0) {
  const source = record?.source === 'exam_form' ? 'exam_form' : 'legacy'
  const directKey = meaningfulKeyPart(record?.row_id)
    || meaningfulKeyPart(record?.form_id)
    || meaningfulKeyPart(record?.prescription_id)
    || meaningfulKeyPart(record?.billing_id)
  if (directKey) {
    return `${source}-${directKey}`
  }

  return [
    source,
    meaningfulKeyPart(record?.patient_id) || meaningfulKeyPart(record?.id) || 'patient',
    meaningfulKeyPart(record?.folder_id) || 'folder',
    meaningfulKeyPart(record?.date) || meaningfulKeyPart(record?.latest_form_updated_at) || meaningfulKeyPart(record?.created_at) || 'nodate',
    meaningfulKeyPart(record?.created_at) || meaningfulKeyPart(record?.latest_form_updated_at) || `row-${index}`,
  ].join('-')
}

function toPrescriptionReference(record) {
  return {
    source: record.source === 'exam_form' ? 'exam_form' : 'legacy',
    patient_id: Number(record.patient_id),
    ...(record.source === 'exam_form'
      ? { form_id: Number(record.form_id) }
      : { row_id: Number(record.row_id) }),
  }
}

function meaningfulKeyPart(value) {
  if (value === null || value === undefined) return ''
  const stringValue = String(value).trim()
  return stringValue && stringValue !== '0' ? stringValue : ''
}
