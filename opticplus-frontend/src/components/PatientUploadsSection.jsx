import { useEffect, useMemo, useRef, useState } from 'react'

export default function PatientUploadsSection({
  lookupPatients,
  fetchPatientDocuments,
  uploadPatientDocuments,
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [documents, setDocuments] = useState([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [documentType, setDocumentType] = useState('Folder Scan')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const filePickerRef = useRef(null)
  const cameraPickerRef = useRef(null)

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

  async function loadDocuments(record) {
    setSelectedPatient(record)
    setMessage('')
    setError('')
    setIsLoadingDocuments(true)
    try {
      const response = await fetchPatientDocuments(record.id)
      setDocuments(response.documents ?? [])
    } catch (nextError) {
      setDocuments([])
      setError(nextError.message || 'Could not load patient documents.')
    } finally {
      setIsLoadingDocuments(false)
    }
  }

  function appendFiles(fileList) {
    const incoming = Array.from(fileList ?? [])
    if (!incoming.length) return
    setSelectedFiles((current) => [...current, ...incoming])
  }

  function removeSelectedFile(indexToRemove) {
    setSelectedFiles((current) => current.filter((_, index) => index !== indexToRemove))
  }

  async function handleUpload(event) {
    event.preventDefault()
    if (!selectedPatient) return
    if (!selectedFiles.length) {
      setError('Select at least one file first.')
      return
    }

    setIsUploading(true)
    setMessage('')
    setError('')

    try {
      const formData = new FormData()
      selectedFiles.forEach((file) => formData.append('files[]', file))
      formData.append('document_type', documentType)
      formData.append('notes', notes)

      await uploadPatientDocuments(selectedPatient.id, formData)
      const refreshed = await fetchPatientDocuments(selectedPatient.id)
      setDocuments(refreshed.documents ?? [])
      setSelectedFiles([])
      setNotes('')
      setMessage('Patient files uploaded successfully.')
    } catch (nextError) {
      setError(nextError.message || 'Upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  const selectedName = useMemo(() => {
    if (!selectedPatient) return ''
    return (
      selectedPatient.patient_name ||
      selectedPatient.name ||
      [selectedPatient.surname, selectedPatient.firstname, selectedPatient.othernames].filter(Boolean).join(' ')
    )
  }, [selectedPatient])

  return (
    <section className="patients-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Patient Uploads</p>
          <h3>Scan, capture, and attach documents to patient folders</h3>
          <p className="header-copy">
            Use live search to select a patient, then upload x-rays, lab results, referral sheets, or hardcopy folder photos from desktop or mobile camera.
          </p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {message ? <div className="message-banner success">{message}</div> : null}

      <div className="optometrist-workspace-stack">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live Search</p>
              <h3>Find existing patient</h3>
            </div>
          </div>
          <label className="patient-search-shell">
            <span className="patient-search-icon" aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by folder ID, name, phone, or email"
            />
            <span className="patient-search-hint">min 2 chars</span>
          </label>

          {search.trim().length >= 2 ? (
            isSearching ? (
              <p className="muted-copy">Searching patients...</p>
            ) : results.length ? (
              <div className="optometrist-modal-search-results">
                {results.map((record) => (
                  <button
                    key={`upload-search-${record.id}`}
                    type="button"
                    className="optometrist-modal-search-card"
                    onClick={() => loadDocuments(record)}
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
              <p className="muted-copy">No matching patient was found in this branch.</p>
            )
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Uploads Workspace</p>
              <h3>{selectedName || 'Choose a patient to begin'}</h3>
              <p className="muted-copy">{selectedPatient ? selectedPatient.folder_id : 'No patient selected yet'}</p>
            </div>
            {selectedPatient ? <span className="panel-tag">{documents.length} files</span> : null}
          </div>

          {selectedPatient ? (
            <form className="optometrist-management-form" onSubmit={handleUpload}>
              <div className="optometrist-exam-grid">
                <Field label="Document Type">
                  <input
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                    placeholder="e.g. X-ray, Lab Result, Folder Scan"
                  />
                </Field>
                <Field label="Notes">
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Optional notes about this upload"
                  />
                </Field>
                <Field label="Add Files" className="full-span">
                  <div className="upload-action-panel">
                    <div className="optometrist-inline-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => filePickerRef.current?.click()}
                      >
                        Choose Files
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => cameraPickerRef.current?.click()}
                      >
                        Take Picture
                      </button>
                    </div>
                    <p className="muted-copy upload-action-copy">
                      On a smartphone, use <strong>Take Picture</strong> to open the phone camera and attach live photos straight into the patient folder.
                    </p>
                    <input
                      ref={filePickerRef}
                      className="hidden-file-input"
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      onChange={(event) => appendFiles(event.target.files)}
                    />
                    <input
                      ref={cameraPickerRef}
                      className="hidden-file-input"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={(event) => appendFiles(event.target.files)}
                    />
                  </div>
                </Field>
              </div>

              {selectedFiles.length ? (
                <div className="optometrist-upload-list">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${index}`} className="optometrist-upload-item">
                      <div className="optometrist-upload-meta">
                        <strong>{file.name}</strong>
                        <span>{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        type="button"
                        className="ghost-button optometrist-upload-remove"
                        onClick={() => removeSelectedFile(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No files selected yet.</p>
              )}

              <div className="optometrist-inline-actions">
                <button type="submit" className="primary-button" disabled={isUploading}>
                  {isUploading ? 'Uploading...' : 'Upload To Patient Folder'}
                </button>
              </div>
            </form>
          ) : (
            <p className="muted-copy">Search and select a patient first.</p>
          )}

          {selectedPatient ? (
            <div className="optometrist-workspace-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Stored Documents</p>
                  <h4>Existing patient attachments</h4>
                </div>
              </div>
              {isLoadingDocuments ? (
                <p className="muted-copy">Loading patient files...</p>
              ) : documents.length ? (
                <div className="optometrist-upload-list">
                  {documents.map((document) => (
                    <a
                      key={document.id}
                      href={document.file_url || '#'}
                      className="optometrist-upload-item"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>{document.original_name || document.file_name || 'Document'}</strong>
                      <span>
                        {document.document_type || 'Attachment'}
                        {document.file_size ? ` - ${formatFileSize(document.file_size)}` : ''}
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No uploaded files found for this patient.</p>
              )}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  )
}

function Field({ label, children, className = '' }) {
  return (
    <label className={className}>
      {label}
      {children}
    </label>
  )
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0)
  if (!value) return '0 KB'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
