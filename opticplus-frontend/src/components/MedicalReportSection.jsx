import { useEffect, useMemo, useState } from 'react'
import PortalIcon from './PortalIcon.jsx'

export default function MedicalReportSection({
  lookupPatients,
  fetchPatientPrescriptions,
  fetchMedicalReport,
  companyProfile,
  currentUserName,
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [report, setReport] = useState(null)
  const [prescriptions, setPrescriptions] = useState([])
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) {
      setResults([])
      setIsSearching(false)
      return undefined
    }

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true)
      try {
        const response = await lookupPatients(query)
        if (!cancelled) setResults(response.records ?? [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [lookupPatients, search])

  async function loadMedicalReport(record) {
    setSelectedRecord(record)
    setError('')
    setIsLoadingReport(true)

    try {
      const [reportResponse, prescriptionsResponse] = await Promise.all([
        fetchMedicalReport(record.id),
        fetchPatientPrescriptions(record.id),
      ])
      setReport(reportResponse)
      setPrescriptions(prescriptionsResponse.prescriptions ?? [])
    } catch (nextError) {
      setReport(null)
      setPrescriptions([])
      setError(nextError.message || 'Could not load this medical report.')
    } finally {
      setIsLoadingReport(false)
    }
  }

  const patientName = useMemo(() => {
    if (!selectedRecord) return ''
    return selectedRecord.patient_name || selectedRecord.name || [selectedRecord.surname, selectedRecord.firstname, selectedRecord.othernames].filter(Boolean).join(' ')
  }, [selectedRecord])

  const branchAddress = useMemo(() => {
    if (!selectedRecord) return ''
    const label = String(report?.branch_name || selectedRecord?.branch_name || '').toLowerCase()
    if (selectedRecord.branch_id === 2 || label.includes('madina')) return companyProfile?.madina_address || ''
    return companyProfile?.labadi_address || ''
  }, [companyProfile?.labadi_address, companyProfile?.madina_address, report?.branch_name, selectedRecord])

  function openDedicatedReportDocument(mode = 'print') {
    if (!report || !selectedRecord) return

    const targetWindow = window.open('', '_blank', 'width=980,height=980')
    if (!targetWindow) return

    const safe = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const reportDate = new Date().toLocaleDateString()
    const rows = prescriptions.length
      ? prescriptions.map((item) => `
          <tr>
            <td>${safe(item.date || 'N/A')}</td>
            <td>${safe(formatEye(item.sph_od, item.cyl_od, item.axis_od, item.add_od))}</td>
            <td>${safe(formatEye(item.sph_os, item.cyl_os, item.axis_os, item.add_os))}</td>
            <td>${safe(item.lens_type || 'N/A')}</td>
            <td>${safe(item.ipd || 'N/A')}</td>
            <td>${safe(item.status || 'pending')}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="6">No prescriptions found for this patient.</td></tr>'

    const versionCards = (report.form_versions ?? []).length
      ? (report.form_versions ?? []).map((version) => `
          <div class="version-row">
            <div><strong>Version ${safe(version.version)}</strong> • ${safe(version.updated_at || 'N/A')}</div>
            <div>Status: ${safe(version.status || 'draft')}</div>
            <div>Chief Complaint: ${safe(version.summary?.chief_complaint || 'N/A')}</div>
            <div>Diagnosis: ${safe(version.summary?.diagnosis || 'N/A')}</div>
          </div>
        `).join('')
      : '<div class="version-row">No medical form versions found for this patient.</div>'

    targetWindow.document.open()
    targetWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Medical Report - ${safe(patientName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #f3f4f6; font-family: "Segoe UI", Arial, sans-serif; color: #111827; }
            .page { max-width: 980px; margin: 24px auto; background: #fff; padding: 28px; border: 1px solid #d1d5db; }
            .head { display: grid; grid-template-columns: 84px 1fr auto; gap: 16px; align-items: center; border-bottom: 2px solid #d1d5db; padding-bottom: 14px; }
            .head img { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; border: 1px solid #d1d5db; }
            h1 { margin: 0; font-size: 22px; }
            h2 { margin: 0; font-size: 18px; }
            p { margin: 4px 0; line-height: 1.45; }
            .muted { color: #4b5563; }
            .section { margin-top: 18px; padding: 14px; border: 1px solid #e5e7eb; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; font-size: 13px; }
            th { background: #f3f4f6; }
            .version-row { border: 1px solid #d1d5db; padding: 10px; margin-top: 8px; font-size: 13px; }
            .signature { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
            .line { border-top: 1px solid #111827; margin-top: 34px; padding-top: 6px; font-size: 12px; color: #374151; }
            @media print {
              body { background: #fff; }
              .page { margin: 0; border: 0; max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <header class="head">
              <img src="${safe(window.location.origin)}/bealet-logo.png" alt="Bealet Optical Center Logo" />
              <div>
                <h1>${safe(companyProfile?.company_name || 'Bealet Optical Center')}</h1>
                <p class="muted">${safe(branchAddress)}</p>
                <p class="muted">${safe(companyProfile?.company_phone_primary || '')}${companyProfile?.company_phone_secondary ? ` | ${safe(companyProfile.company_phone_secondary)}` : ''}</p>
                <p class="muted">${safe(companyProfile?.company_email || '')}</p>
                <p class="muted">${safe(companyProfile?.tagline || 'Professional Eye Care and Optical Services')}</p>
              </div>
              <div><strong>${safe(reportDate)}</strong></div>
            </header>

            <section class="section">
              <h2>Medical Report</h2>
              <p><strong>Patient:</strong> ${safe(patientName)}</p>
              <p><strong>Folder ID:</strong> ${safe(selectedRecord.folder_id)}</p>
            </section>

            <section class="section">
              <h2>Patient Information</h2>
              <div class="grid">
                <p><strong>Phone:</strong> ${safe(selectedRecord.phone || 'N/A')}</p>
                <p><strong>Email:</strong> ${safe(selectedRecord.email || 'N/A')}</p>
                <p><strong>Sex / Age:</strong> ${safe(selectedRecord.sex || 'N/A')} / ${safe(selectedRecord.age || 'N/A')}</p>
                <p><strong>Residence:</strong> ${safe(selectedRecord.residence || selectedRecord.address || 'N/A')}</p>
                <p><strong>Purpose:</strong> ${safe(selectedRecord.purpose || 'Consultation')}</p>
                <p><strong>Status:</strong> ${safe(selectedRecord.status || 'pending')}</p>
              </div>
            </section>

            <section class="section">
              <h2>Latest Clinical Summary</h2>
              <div class="grid">
                <p><strong>Chief Complaint:</strong> ${safe(report.latest_form?.summary?.chief_complaint || 'N/A')}</p>
                <p><strong>Diagnosis:</strong> ${safe(report.latest_form?.summary?.diagnosis || 'N/A')}</p>
                <p><strong>Management Plan:</strong> ${safe(report.latest_form?.summary?.management_plan || 'N/A')}</p>
                <p><strong>Prescription Note:</strong> ${safe(report.latest_form?.summary?.prescription || 'N/A')}</p>
                <p><strong>Follow-up Date:</strong> ${safe(report.latest_form?.summary?.followup_date || 'N/A')}</p>
                <p><strong>Follow-up Notes:</strong> ${safe(report.latest_form?.summary?.followup_notes || 'N/A')}</p>
              </div>
            </section>

            <section class="section">
              <h2>Prescription History</h2>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>OD</th><th>OS</th><th>Lens Type</th><th>IPD</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </section>

            <section class="section">
              <h2>Past Medical Record Versions</h2>
              ${versionCards}
            </section>

            <section class="signature">
              <div>
                <div class="line">Optometrist Signature</div>
              </div>
              <div>
                <div class="line">Optometrist Name: ${safe(currentUserName || '')}</div>
              </div>
            </section>
          </div>
        </body>
      </html>
    `)
    targetWindow.document.close()
    targetWindow.focus()
    targetWindow.print()
  }

  return (
    <section className="module-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Medical Report</p>
          <h3>Search patients and generate a printable medical report</h3>
          <p className="header-copy">
            Built as a professional report sheet with company branding, patient profile, form-history summaries, and prescription records.
          </p>
        </div>
      </div>

      <article className="panel optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Patient Search</p>
            <h4>Find patient by folder ID or name</h4>
          </div>
          <span className="panel-tag">{results.length} matched</span>
        </div>

        <label className="patient-search-shell">
          <span className="patient-search-icon" aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by folder ID, patient name, phone, or email"
          />
          <span className="patient-search-hint">live search</span>
        </label>

        {search.trim().length >= 2 ? (
          isSearching ? (
            <p className="muted-copy">Searching patients...</p>
          ) : results.length ? (
            <div className="optometrist-modal-search-results">
              {results.map((record) => (
                <button
                  key={`medical-report-${record.id}`}
                  type="button"
                  className="optometrist-modal-search-card"
                  onClick={() => loadMedicalReport(record)}
                >
                  <div>
                    <strong>{record.patient_name || record.name}</strong>
                    <span>{record.folder_id}</span>
                  </div>
                  <div className="stack-meta">
                    <strong>{record.phone || 'No phone'}</strong>
                    <span>{record.status || 'pending'}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No matching patient found in this branch.</p>
          )
        ) : (
          <p className="muted-copy">Type at least 2 characters to begin searching.</p>
        )}
      </article>

      {error ? <div className="message-banner error">{error}</div> : null}

      {isLoadingReport ? (
        <article className="panel">
          <p className="muted-copy">Loading medical report...</p>
        </article>
      ) : null}

      {!isLoadingReport && report && selectedRecord ? (
        <>
          <article className="panel medical-report-toolbar no-print-area">
            <div>
              <p className="eyebrow">Report Ready</p>
              <h4>{patientName}</h4>
              <p className="muted-copy">{selectedRecord.folder_id}</p>
            </div>
            <div className="optometrist-inline-actions">
              <button type="button" className="ghost-button" onClick={() => openDedicatedReportDocument('print')}>
                Print Report
              </button>
              <button type="button" className="primary-button" onClick={() => openDedicatedReportDocument('pdf')}>
                Export PDF
              </button>
            </div>
          </article>

          <article className="panel medical-report-sheet report-print-area">
            <header className="medical-report-header">
              <img src="/bealet-logo.png" alt="Bealet Optical Center" className="medical-report-logo" />
              <div>
                <h2>{companyProfile?.company_name || 'Bealet Optical Center'}</h2>
                <p>{branchAddress}</p>
                <p>{companyProfile?.company_phone_primary || ''}{companyProfile?.company_phone_secondary ? ` | ${companyProfile.company_phone_secondary}` : ''}</p>
                <p>{companyProfile?.company_email || ''}</p>
                <p>{companyProfile?.tagline || 'Professional Eye Care and Optical Services'}</p>
                <p>Medical Report</p>
              </div>
              <div className="medical-report-date">
                <strong>{new Date().toLocaleDateString()}</strong>
              </div>
            </header>

            <section className="medical-report-block">
              <h3>Patient Information</h3>
              <div className="medical-report-grid">
                <p><strong>Name:</strong> {patientName}</p>
                <p><strong>Folder ID:</strong> {selectedRecord.folder_id}</p>
                <p><strong>Phone:</strong> {selectedRecord.phone || 'N/A'}</p>
                <p><strong>Email:</strong> {selectedRecord.email || 'N/A'}</p>
                <p><strong>Sex / Age:</strong> {selectedRecord.sex || 'N/A'} / {selectedRecord.age || 'N/A'}</p>
                <p><strong>Residence:</strong> {selectedRecord.residence || selectedRecord.address || 'N/A'}</p>
                <p><strong>Purpose:</strong> {selectedRecord.purpose || 'Consultation'}</p>
                <p><strong>Status:</strong> {selectedRecord.status || 'pending'}</p>
              </div>
            </section>

            <section className="medical-report-block">
              <h3>Latest Clinical Summary</h3>
              <div className="medical-report-grid">
                <p><strong>Chief Complaint:</strong> {report.latest_form?.summary?.chief_complaint || 'N/A'}</p>
                <p><strong>Diagnosis:</strong> {report.latest_form?.summary?.diagnosis || 'N/A'}</p>
                <p><strong>Management Plan:</strong> {report.latest_form?.summary?.management_plan || 'N/A'}</p>
                <p><strong>Prescription Note:</strong> {report.latest_form?.summary?.prescription || 'N/A'}</p>
                <p><strong>Follow-up Date:</strong> {report.latest_form?.summary?.followup_date || 'N/A'}</p>
                <p><strong>Follow-up Notes:</strong> {report.latest_form?.summary?.followup_notes || 'N/A'}</p>
              </div>
            </section>

            <section className="medical-report-block">
              <h3>Prescription History</h3>
              {prescriptions.length ? (
                <div className="table-shell">
                  <table className="portal-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>OD</th>
                        <th>OS</th>
                        <th>Lens Type</th>
                        <th>IPD</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prescriptions.map((item) => (
                        <tr key={`report-rx-${item.prescription_id}-${item.date}`}>
                          <td>{item.date || 'N/A'}</td>
                          <td>{formatEye(item.sph_od, item.cyl_od, item.axis_od, item.add_od)}</td>
                          <td>{formatEye(item.sph_os, item.cyl_os, item.axis_os, item.add_os)}</td>
                          <td>{item.lens_type || 'N/A'}</td>
                          <td>{item.ipd || 'N/A'}</td>
                          <td>{item.status || 'pending'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted-copy">No prescriptions found for this patient.</p>
              )}
            </section>

            <section className="medical-report-block">
              <h3>Past Medical Record Versions</h3>
              {report.form_versions?.length ? (
                <div className="medical-report-version-list">
                  {report.form_versions.map((version) => (
                    <article key={`version-${version.version}`} className="optometrist-prescription-card">
                      <div className="patient-record-top">
                        <div>
                          <strong>Version {version.version}</strong>
                          <span>Updated: {version.updated_at || 'N/A'}</span>
                        </div>
                        <span className={`status-pill status-${String(version.status || '').toLowerCase()}`}>{version.status || 'draft'}</span>
                      </div>
                      <p className="muted-copy"><strong>Chief Complaint:</strong> {version.summary?.chief_complaint || 'N/A'}</p>
                      <p className="muted-copy"><strong>Diagnosis:</strong> {version.summary?.diagnosis || 'N/A'}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No medical form versions found for this patient.</p>
              )}
            </section>

            <footer className="medical-report-footer">
              <p>This report was generated electronically by OPTICPLUS for {companyProfile?.company_name || 'Bealet Optical Center'}.</p>
              <p>Optometrist signature is required before filing.</p>
            </footer>
          </article>
        </>
      ) : null}

      {!report && !isLoadingReport ? (
        <article className="panel">
          <div className="empty-state-panel">
            <PortalIcon name="reports" className="module-icon" />
            <h3>Select a patient to generate report</h3>
            <p className="muted-copy">Search above and choose a patient to load printable and PDF-ready medical details.</p>
          </div>
        </article>
      ) : null}
    </section>
  )
}

function formatEye(sph, cyl, axis, add) {
  return `${fallbackValue(sph)} / ${fallbackValue(cyl)} x ${fallbackValue(axis)} Add ${fallbackValue(add)}`
}

function fallbackValue(value) {
  if (value === null || value === undefined || value === '') return 'N/A'
  return String(value)
}
