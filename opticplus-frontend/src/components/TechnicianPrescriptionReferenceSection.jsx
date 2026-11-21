import { useEffect, useMemo, useState } from 'react'
import { escapePrintHtml, openPrintDocumentWindow, writePrintDocumentWindow } from '../utils/printDocuments.js'

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

export default function TechnicianPrescriptionReferenceSection({
  fetchGlassesPrescriptions,
  fetchGlassesPrescriptionDemand,
  session,
  selectedBranchId,
}) {
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState([])
  const [referencePage, setReferencePage] = useState(1)
  const [referencePagination, setReferencePagination] = useState({ total: 0, total_pages: 1 })
  const [referenceBranchName, setReferenceBranchName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [demandFilters, setDemandFilters] = useState({ dateFrom: '', dateTo: '' })
  const [demand, setDemand] = useState(null)
  const [isLoadingDemand, setIsLoadingDemand] = useState(false)
  const [demandError, setDemandError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadRecords() {
      setIsLoading(true)
      setError('')

      try {
        const response = await fetchGlassesPrescriptions({ search, page: referencePage, perPage: 50 })
        if (!cancelled) {
          const nextRecords = Array.isArray(response?.prescriptions) ? response.prescriptions : Array.isArray(response?.records) ? response.records : []
          setRecords(nextRecords.map(normalizeRow))
          setReferencePagination({
            total: Number(response?.pagination?.total ?? nextRecords.length),
            total_pages: Math.max(1, Number(response?.pagination?.total_pages ?? 1)),
          })
          setReferenceBranchName(response?.branch_name || '')
        }
      } catch (loadError) {
        if (!cancelled) {
          setRecords([])
          setReferencePagination({ total: 0, total_pages: 1 })
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
  }, [fetchGlassesPrescriptions, referencePage, search, selectedBranchId, session?.branch_id])

  const resultLabel = useMemo(
    () => `${referencePagination.total} record${referencePagination.total === 1 ? '' : 's'}`,
    [referencePagination.total],
  )
  const demandGroups = Array.isArray(demand?.groups) ? demand.groups : []
  const rangeLabel = demandFilters.dateFrom || demandFilters.dateTo
    ? `${demandFilters.dateFrom || 'Beginning'} to ${demandFilters.dateTo || 'Today'}`
    : 'All dates'

  useEffect(() => {
    setReferencePage(1)
  }, [selectedBranchId, session?.branch_id])

  useEffect(() => {
    let cancelled = false

    async function loadDemand() {
      setIsLoadingDemand(true)
      setDemandError('')

      try {
        const response = await fetchGlassesPrescriptionDemand(demandFilters)
        if (!cancelled) setDemand(response)
      } catch (loadError) {
        if (!cancelled) {
          setDemand(null)
          setDemandError(loadError?.message || 'Unable to load lens stock planning data.')
        }
      } finally {
        if (!cancelled) setIsLoadingDemand(false)
      }
    }

    loadDemand()
    return () => {
      cancelled = true
    }
  }, [demandFilters, fetchGlassesPrescriptionDemand, selectedBranchId, session?.branch_id])

  function printSupplierDemand() {
    const printWindow = openPrintDocumentWindow()
    if (!printWindow) {
      setDemandError('Allow pop-ups for this site to print or save the supplier PDF.')
      return
    }

    const groupsPerPage = 8
    const chunks = []
    for (let index = 0; index < demandGroups.length; index += groupsPerPage) {
      chunks.push(demandGroups.slice(index, index + groupsPerPage))
    }
    const generatedAt = new Date().toLocaleDateString()
    const pages = chunks.map((groupChunk, pageIndex) => {
      const rows = groupChunk.map((group) => `
        <tr>
          <td>${escapePrintHtml(group.category)}</td>
          <td>${escapePrintHtml(group.lens_type)}${group.features?.length ? ` (${escapePrintHtml(group.features.join(', '))})` : ''}</td>
          <td>${escapePrintHtml(group.lens_material)}</td>
          <td>${escapePrintHtml(group.sph_range || '—')}</td>
          <td>${escapePrintHtml(group.cyl_range || '—')}</td>
          <td>${escapePrintHtml(group.add_range || '—')}</td>
          <td class="amount">${escapePrintHtml(group.prescription_count)}</td>
        </tr>`).join('')

      return `
        <p class="doc-kicker">OpticPlus • Supplier planning</p>
        <div class="doc-topline">
          <div>
            <h1>Lens stock profile</h1>
            <p>Prescription range summary • ${escapePrintHtml(demand?.branch_name || 'All branches')}</p>
          </div>
          <p class="doc-reference">Generated ${escapePrintHtml(generatedAt)}<br />${escapePrintHtml(rangeLabel)}</p>
        </div>
        ${pageIndex === 0 ? `
          <div class="approval-note">
            <strong>${escapePrintHtml(demand?.total_prescriptions || 0)} current prescriptions</strong> summarized by lens type and recorded material.
            Counts are prescriptions on file, not confirmed sales or order quantities. No patient names, folder IDs, or customer prices are included.
            Actual acquisition cost remains recorded per bill in Lens Tracker.
          </div>` : ''}
        <table class="record-table">
          <thead>
            <tr>
              <th>Catalogue family</th><th>Lens type / features</th><th>Material</th>
              <th>Observed SPH</th><th>Observed CYL</th><th>Observed ADD</th><th>Rx count</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`
    })

    if (!writePrintDocumentWindow(printWindow, 'Lens stock profile for supplier', pages)) {
      setDemandError('The supplier PDF window could not be opened. Allow pop-ups and try again.')
    }
  }

  return (
    <section className="module-section">
      <article className="panel" style={{ marginBottom: '1.25rem' }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stock planning database</p>
            <h3>Anonymized lens demand profile</h3>
            <p className="muted-copy">
              Current completed prescriptions are grouped into supplier-list families with observed SPH, CYL, and ADD ranges.
              Counts are not sales quantities; index and treatment details should be confirmed with the supplier.
            </p>
          </div>
          <span className="panel-tag">{demand?.total_prescriptions || 0} prescriptions</span>
        </div>

        <div className="patient-filter-grid" style={{ marginBottom: '1rem' }}>
          <label>
            <span>From</span>
            <input
              type="date"
              value={demandFilters.dateFrom}
              onChange={(event) => setDemandFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={demandFilters.dateTo}
              onChange={(event) => setDemandFilters((current) => ({ ...current, dateTo: event.target.value }))}
            />
          </label>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setDemandFilters({ dateFrom: '', dateTo: '' })}
          >
            All dates
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={printSupplierDemand}
            disabled={demandGroups.length === 0 || isLoadingDemand}
          >
            Print / Save supplier PDF
          </button>
        </div>

        {demandError ? <p className="muted-copy" style={{ color: '#b91c1c' }}>{demandError}</p> : null}
        {isLoadingDemand ? (
          <p className="muted-copy">Loading lens stock planning data...</p>
        ) : demandGroups.length === 0 ? (
          <div className="empty-state-panel">
            <h3>No matching prescription ranges</h3>
            <p className="muted-copy">Try another date range or check that completed prescriptions are available for this branch.</p>
          </div>
        ) : (
          <div className="table-shell">
            <table className="portal-table inventory-table-wide">
              <thead>
                <tr>
                  <th>Catalogue family</th>
                  <th>Lens type</th>
                  <th>Material</th>
                  <th>Features</th>
                  <th>Observed SPH range</th>
                  <th>Observed CYL range</th>
                  <th>Observed ADD range</th>
                  <th>Rx count</th>
                </tr>
              </thead>
              <tbody>
                {demandGroups.map((group) => (
                  <tr key={`${group.category}-${group.lens_type}-${group.lens_material}`}>
                    <td>{group.category}</td>
                    <td>{group.lens_type}</td>
                    <td>{group.lens_material}</td>
                    <td>{group.features?.join(', ') || '—'}</td>
                    <td>{group.sph_range || '—'}</td>
                    <td>{group.cyl_range || '—'}</td>
                    <td>{group.add_range || '—'}</td>
                    <td>{group.prescription_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted-copy" style={{ marginTop: '0.75rem' }}>
          Reference prices from the supplier list are not treated as actual cost. Lens Tracker remains the source for each bill's actual cost,
          and the Selling Pricelist remains the customer-price source. Supplier PDFs omit both.
        </p>
        <p className="muted-copy">
          The supplier PDF includes the complete selected branch scope. Selecting Merged combines Labadi and Madina.
        </p>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Database reference</p>
            <h3>Optometrist prescription list</h3>
          </div>
          <span className="panel-tag">{referenceBranchName ? `${referenceBranchName} · ` : ''}{resultLabel}</span>
        </div>

        <label className="patient-search-shell" style={{ marginBottom: '1rem' }}>
          <span className="patient-search-icon" aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setReferencePage(1)
            }}
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
        {referencePagination.total_pages > 1 ? (
          <div className="filter-actions-row" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
            <span className="muted-copy">Page {referencePage} of {referencePagination.total_pages}</span>
            <div className="filter-actions-row">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setReferencePage((page) => Math.max(1, page - 1))}
                disabled={referencePage <= 1 || isLoading}
              >
                Previous
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setReferencePage((page) => Math.min(referencePagination.total_pages, page + 1))}
                disabled={referencePage >= referencePagination.total_pages || isLoading}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  )
}
