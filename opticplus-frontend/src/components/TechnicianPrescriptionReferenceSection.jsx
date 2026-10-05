import { useEffect, useMemo, useState } from 'react'

function formatPatientName(record) {
  if (record?.name) return record.name
  const parts = [record?.surname, record?.firstname, record?.othernames].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Unknown patient'
}

function formatPrescription(record) {
  const od = [record?.sph_od, record?.cyl_od, record?.axis_od ? `x ${record.axis_od}` : '', record?.add_od ? `ADD ${record.add_od}` : ''].filter(Boolean)
  const os = [record?.sph_os, record?.cyl_os, record?.axis_os ? `x ${record.axis_os}` : '', record?.add_os ? `ADD ${record.add_os}` : ''].filter(Boolean)
  const summary = []
  if (od.length) summary.push(`OD: ${od.join(' ')}`)
  if (os.length) summary.push(`OS: ${os.join(' ')}`)
  if (record?.ipd) summary.push(`IPD: ${record.ipd}`)
  return summary.join(' | ') || 'Prescription details not available'
}

function normalizeRow(record, index) {
  const patientName = formatPatientName(record)
  return {
    key: `${record?.folder_id || record?.patient_id || 'row'}-${record?.date || 'nodate'}-${index}`,
    patientName,
    folderId: record?.folder_id || 'N/A',
    date: record?.date || record?.created_at || '—',
    lensType: record?.lens_type || '—',
    source: record?.source || 'glasses_table',
    prescription: formatPrescription(record),
    status: record?.latest_form_status || record?.status || 'pending',
  }
}

export default function TechnicianPrescriptionReferenceSection({ fetchGlassesPrescriptions, session, selectedBranchId }) {
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadRecords() {
      setIsLoading(true)
      setError('')

      try {
        const response = await fetchGlassesPrescriptions({ search, page: 1, perPage: 50 })
        if (!cancelled) {
          const nextRecords = Array.isArray(response?.prescriptions) ? response.prescriptions : Array.isArray(response?.records) ? response.records : []
          setRecords(nextRecords.map(normalizeRow))
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'Unable to load prescription reference records.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    const timeout = window.setTimeout(loadRecords, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [fetchGlassesPrescriptions, search, selectedBranchId, session?.branch_id])

  const resultLabel = useMemo(() => `${records.length} record${records.length === 1 ? '' : 's'}`, [records.length])

  return (
    <section className="module-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Reference</p>
          <h3>Prescription Reference Table</h3>
          <p className="header-copy">A complete technician-facing record of optometrist prescriptions for review and reference.</p>
        </div>
      </div>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Database reference</p>
            <h3>Optometrist prescription list</h3>
          </div>
          <span className="panel-tag">{resultLabel}</span>
        </div>

        <label className="patient-search-shell" style={{ marginBottom: '1rem' }}>
          <span className="patient-search-icon" aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by patient or folder ID"
          />
        </label>

        {error ? <p className="muted-copy" style={{ color: '#b91c1c' }}>{error}</p> : null}

        {isLoading ? (
          <p className="muted-copy">Loading prescription references...</p>
        ) : records.length === 0 ? (
          <div className="empty-state-panel">
            <h3>No prescription records</h3>
            <p className="muted-copy">No prescriptions are available for the active branch search.</p>
          </div>
        ) : (
          <div className="table-shell">
            <table className="portal-table inventory-table-wide">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Folder ID</th>
                  <th>Prescription</th>
                  <th>Lens Type</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.key}>
                    <td>{record.date}</td>
                    <td><strong>{record.patientName}</strong></td>
                    <td>{record.folderId}</td>
                    <td>{record.prescription}</td>
                    <td>{record.lensType}</td>
                    <td>{record.source}</td>
                    <td>
                      <span className={`status-pill status-${String(record.status).toLowerCase().replaceAll(' ', '-')}`}>
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}
