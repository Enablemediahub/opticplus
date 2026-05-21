import { useEffect, useMemo, useState } from 'react'
import PortalIcon from './PortalIcon.jsx'
import StatWidget from './StatWidget.jsx'

export default function OptometristPrescriptionsSection({
  dashboard,
  patientData,
  fetchGlassesPrescriptions,
  fetchFormPrescriptionSearch,
  companyProfile,
}) {
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 15,
    total: 0,
    total_pages: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedPrescription, setSelectedPrescription] = useState(null)

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
        const query = search.trim()
        const response = query.length >= 2
          ? await fetchFormPrescriptionSearch(query)
          : await fetchGlassesPrescriptions({
              search: query,
              page: pagination.page,
              perPage: pagination.per_page,
            })

        if (!cancelled) {
          const nextRecords = response.records ?? response.prescriptions ?? []
          setRecords(nextRecords)
          setPagination((current) => query.length >= 2
            ? {
                ...current,
                page: 1,
                total: nextRecords.length,
                total_pages: 1,
              }
            : {
                ...current,
                ...(response.pagination ?? {}),
              })
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
  }, [fetchFormPrescriptionSearch, fetchGlassesPrescriptions, pagination.page, pagination.per_page, search])

  const resultCountLabel = useMemo(() => {
    if (isLoading) return 'Loading...'
    return `${pagination.total ?? 0} total`
  }, [isLoading, pagination.total])

  function onSearchChange(value) {
    setSearch(value)
    setPagination((current) => ({
      ...current,
      page: 1,
    }))
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

          <label className="patient-search-shell">
            <span className="patient-search-icon" aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by folder ID or patient name"
            />
            <span className="patient-search-hint">live search</span>
          </label>

          {loadError ? <p className="muted-copy">{loadError}</p> : null}

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
                  {records.map((record) => (
                    <tr key={`${record.prescription_id || record.id}-${record.patient_id || record.id}-${record.date || record.latest_form_updated_at || 'nodate'}`}>
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
                        <span className={`status-pill status-${String(record.status || '').toLowerCase().replaceAll(' ', '-')}`}>
                          {record.latest_form_status || record.status || 'pending'}
                        </span>
                      </td>
                      <td>{record.source === 'exam_form' ? `Exam Form${record.latest_form_version ? ` V${record.latest_form_version}` : (record.form_version ? ` V${record.form_version}` : '')}` : 'Glasses Table'}</td>
                      <td>
                        <button type="button" className="ghost-button" onClick={() => setSelectedPrescription(record)}>
                          Prescription
                        </button>
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
          onClose={() => setSelectedPrescription(null)}
        />
      ) : null}
    </section>
  )
}

function PrescriptionModal({ prescription, companyProfile, onClose }) {
  function handlePrint() {
    window.print()
  }

  function handleExportPdf() {
    window.print()
  }

  const patientName = formatPatientName(prescription)
  const dateValue = formatDate(prescription.date || prescription.latest_form_updated_at)
  const status = prescription.latest_form_status || prescription.status || 'pending'
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
            <button type="button" className="ghost-button" onClick={onClose}>Close</button>
          </div>
        </header>

        <section className="prescription-sheet" aria-label="Prescription sheet">
          <header className="prescription-sheet-header">
            <div>
              <h5>{companyName}</h5>
              <p>Professional Spectacle Prescription</p>
            </div>
            <div className="prescription-sheet-meta">
              <strong>Status: {status}</strong>
              <span>Source: {prescription.source === 'exam_form' ? 'Exam Form' : 'Glasses Table'}</span>
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
      </article>
    </div>
  )
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
