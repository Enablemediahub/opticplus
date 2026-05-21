import { useEffect, useMemo, useState } from 'react'
import StatWidget from './StatWidget.jsx'

export const patientFormDefaults = {
  surname: '',
  firstname: '',
  othernames: '',
  sex: '',
  dob: '',
  age: '',
  email: '',
  phone: '',
  address: '',
  residence: '',
  purpose: 'Consultation',
  comment: '',
  appointment_date: todayIso(),
}

const CANONICAL_PATIENT_PURPOSES = [
  'Consultation',
  'Lens',
  'Frame',
  'Repairs',
  'Consultation + Lens',
  'Consultation + Frame',
  'Consultation + Repairs',
  'Lens + Frame',
  'Lens + Repairs',
  'Frame + Repairs',
  'Consultation + Lens + Frame',
  'Consultation + Lens + Repairs',
  'Consultation + Frame + Repairs',
  'Lens + Frame + Repairs',
  'Consultation + Lens + Frame + Repairs',
]

const EXAM_LEARNED_VALUES_KEY = 'opticplus-exam-learned-values-v1'

export function defaultPatientFilters(isManagementView = false) {
  return {
    search: '',
    status: 'all',
    sex: 'all',
    purpose: 'all',
    date_from: '',
    date_to: '',
    page: 1,
    per_page: isManagementView ? 15 : 10,
  }
}

export function patientFiltersForView({ activeView, role, isAdmin }) {
  const isManagementView =
    Boolean(isAdmin || ['manager', 'ceo'].includes(role)) || activeView === 'Patient Management'

  if (activeView === 'Patients') {
    return defaultPatientFilters(true)
  }

  if (role === 'optometrist' && activeView !== 'Patient Management') {
    return {
      ...defaultPatientFilters(false),
      status: 'pending',
      date_from: isoDaysAgo(7),
      date_to: todayIso(),
    }
  }

  return defaultPatientFilters(isManagementView)
}

export default function PatientsSection({
  activeView,
  setActiveView,
  session,
  companyProfile,
  patientMeta,
  patientData,
  patientStats,
  patientFilters,
  setPatientFilters,
  setPatientQuery,
  patientForm,
  setPatientForm,
  savePatientRecord,
  isSavingPatient,
  patientLookupSearch,
  setPatientLookupSearch,
  patientLookupResults,
  isSearchingPatientLookup,
  patientError,
  patientSuccess,
  isLoadingPatients,
  changePatientPage,
  rowAssignments,
  setRowAssignments,
  rowBusyId,
  markAsSeen,
  assignOptometrist,
  updatePatientDetails,
  fetchPatientPrescriptions,
  addPatientPrescription,
  fetchMedicalReport,
  fetchPatientExamForm,
  savePatientExamForm,
  fetchPatientDocuments,
  uploadPatientDocuments,
}) {
  const isManagementView = Boolean(session?.is_admin || ['manager', 'ceo'].includes(session?.role))
  const isOptometristView = session?.role === 'optometrist'
  const defaultFilters = patientFiltersForView({
    activeView,
    role: session?.role,
    isAdmin: session?.is_admin,
  })
  const [selectedPatientId, setSelectedPatientId] = useState(null)
  const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const records = patientData?.records ?? []
  const pendingRecords = records.filter((record) => record.status === 'pending')

  useEffect(() => {
    if (!records.length) {
      setSelectedPatientId(null)
      return
    }

    const stillExists = records.some((record) => String(record.id) === String(selectedPatientId))
    if (stillExists) return

    const preferred = pendingRecords[0] ?? records[0]
    setSelectedPatientId(preferred?.id ?? null)
  }, [records, pendingRecords, selectedPatientId])

  const selectedPatient = useMemo(
    () => records.find((record) => String(record.id) === String(selectedPatientId)) ?? pendingRecords[0] ?? records[0] ?? null,
    [pendingRecords, records, selectedPatientId],
  )

  if (isOptometristView) {
    return (
        <OptometristPatientsWorkspace
        activeView={activeView}
        setActiveView={setActiveView}
          companyProfile={companyProfile}
        patientData={patientData}
        patientStats={patientStats}
        patientFilters={patientFilters}
        setPatientFilters={setPatientFilters}
        setPatientQuery={setPatientQuery}
        isLoadingPatients={isLoadingPatients}
        changePatientPage={changePatientPage}
        patientMeta={patientMeta}
        rowAssignments={rowAssignments}
        setRowAssignments={setRowAssignments}
        rowBusyId={rowBusyId}
        markAsSeen={markAsSeen}
        assignOptometrist={assignOptometrist}
        updatePatientDetails={updatePatientDetails}
          fetchPatientPrescriptions={fetchPatientPrescriptions}
          addPatientPrescription={addPatientPrescription}
          fetchMedicalReport={fetchMedicalReport}
          fetchPatientExamForm={fetchPatientExamForm}
          savePatientExamForm={savePatientExamForm}
          fetchPatientDocuments={fetchPatientDocuments}
          uploadPatientDocuments={uploadPatientDocuments}
        patientLookupSearch={patientLookupSearch}
        setPatientLookupSearch={setPatientLookupSearch}
        patientLookupResults={patientLookupResults}
        isSearchingPatientLookup={isSearchingPatientLookup}
        selectedPatient={selectedPatient}
        selectedPatientId={selectedPatientId}
        setSelectedPatientId={setSelectedPatientId}
        defaultFilters={defaultFilters}
      />
    )
  }

  if (!isManagementView) {
    return (
      <section className="patients-section">
        <div className="patients-header">
          <div>
            <p className="eyebrow">Patient Management</p>
            <h3>Manage intake, queue, and patient records</h3>
            <p className="header-copy">
              Built from the legacy receptionist pages: full registration, queue control, and optometrist assignment.
            </p>
          </div>
        </div>

        {patientError ? <div className="message-banner error">{patientError}</div> : null}
        {patientSuccess ? <div className="message-banner success">{patientSuccess}</div> : null}

        <section className="stats-grid patient-stats-grid">
          {patientStats.map((stat) => (
            <StatWidget
              key={stat.label}
              label={stat.label}
              value={stat.value}
              note={stat.note}
              icon={patientIconFor(stat.label, stat.className)}
              className={stat.className}
            />
          ))}
        </section>

        <ReceptionistPatientsWorkspace
          patientMeta={patientMeta}
          patientData={patientData}
          patientFilters={patientFilters}
          setPatientFilters={setPatientFilters}
          setPatientQuery={setPatientQuery}
          patientForm={patientForm}
          setPatientForm={setPatientForm}
          savePatientRecord={savePatientRecord}
          isSavingPatient={isSavingPatient}
          patientLookupSearch={patientLookupSearch}
          setPatientLookupSearch={setPatientLookupSearch}
          patientLookupResults={patientLookupResults}
          isSearchingPatientLookup={isSearchingPatientLookup}
          isLoadingPatients={isLoadingPatients}
          changePatientPage={changePatientPage}
          rowAssignments={rowAssignments}
          setRowAssignments={setRowAssignments}
          rowBusyId={rowBusyId}
          markAsSeen={markAsSeen}
          assignOptometrist={assignOptometrist}
          updatePatientDetails={updatePatientDetails}
          defaultFilters={defaultFilters}
          isIntakeModalOpen={isIntakeModalOpen}
          setIsIntakeModalOpen={setIsIntakeModalOpen}
          editingRecord={editingRecord}
          setEditingRecord={setEditingRecord}
          isSavingEdit={isSavingEdit}
          setIsSavingEdit={setIsSavingEdit}
        />
      </section>
    )
  }

  return (
    <section className="patients-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Patient Management</p>
          <h3>{isManagementView ? 'Review the patient database with manager insight' : 'Manage intake, queue, and patient records'}</h3>
          <p className="header-copy">
            {isManagementView
              ? 'A general-manager workspace for filtering the database, reading patient trends, and acting on operational follow-up.'
              : 'Built from the legacy receptionist pages: full registration, queue control, and optometrist assignment.'}
          </p>
        </div>
      </div>

      {patientError ? <div className="message-banner error">{patientError}</div> : null}
      {patientSuccess ? <div className="message-banner success">{patientSuccess}</div> : null}

      <section className="stats-grid patient-stats-grid">
        {patientStats.map((stat) => (
          <StatWidget
            key={stat.label}
            label={stat.label}
            value={stat.value}
            note={stat.note}
            icon={patientIconFor(stat.label, stat.className)}
            className={stat.className}
          />
        ))}
      </section>

      {isManagementView ? (
        <ManagerPatientsWorkspace
          patientMeta={patientMeta}
          patientData={patientData}
          patientFilters={patientFilters}
          setPatientFilters={setPatientFilters}
          setPatientQuery={setPatientQuery}
          isLoadingPatients={isLoadingPatients}
          changePatientPage={changePatientPage}
          rowAssignments={rowAssignments}
          setRowAssignments={setRowAssignments}
          rowBusyId={rowBusyId}
          markAsSeen={markAsSeen}
          assignOptometrist={assignOptometrist}
          defaultFilters={defaultFilters}
        />
      ) : (
      <section className="patients-grid">
        <article className="panel patient-form-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Patient Intake</p>
              <h3>Full registration</h3>
              <p className="muted-copy">
                Capture core identity, contact details, and visit context before sending the patient into the queue.
              </p>
            </div>
          </div>

          <div className="patient-intake-hero">
            <div>
              <span className="patient-intake-kicker">Front Desk Intake</span>
              <strong>Register walk-ins quickly with a calmer, structured layout.</strong>
            </div>
            <div className="patient-intake-highlights">
              <span>Identity</span>
              <span>Contact</span>
              <span>Visit plan</span>
            </div>
          </div>

          <form className="patient-form-grid" onSubmit={savePatientRecord}>
            <div className="patient-form-section full-span">
              <div className="patient-form-section-header">
                <span className="patient-form-section-step">01</span>
                <div>
                  <strong>Patient identity</strong>
                  <p>Start with the person’s official and demographic details.</p>
                </div>
              </div>
              <div className="patient-form-grid patient-form-grid-nested">
                <Field label="Surname" required>
                  <input
                    value={patientForm.surname}
                    onChange={(event) => setPatientForm((current) => ({ ...current, surname: event.target.value }))}
                    placeholder="Enter surname"
                    required
                  />
                </Field>
                <Field label="First name" required>
                  <input
                    value={patientForm.firstname}
                    onChange={(event) => setPatientForm((current) => ({ ...current, firstname: event.target.value }))}
                    placeholder="Enter first name"
                    required
                  />
                </Field>
                <Field label="Other names">
                  <input
                    value={patientForm.othernames}
                    onChange={(event) => setPatientForm((current) => ({ ...current, othernames: event.target.value }))}
                    placeholder="Middle or additional names"
                  />
                </Field>
                <Field label="Sex" required>
                  <select
                    value={patientForm.sex}
                    onChange={(event) => setPatientForm((current) => ({ ...current, sex: event.target.value }))}
                    required
                  >
                    <option value="">Select sex</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </Field>
                <Field label="Date of birth">
                  <input
                    type="date"
                    value={patientForm.dob}
                    onChange={(event) =>
                      setPatientForm((current) => ({
                        ...current,
                        dob: event.target.value,
                        age: event.target.value ? String(calculateAge(event.target.value)) : '',
                      }))
                    }
                  />
                </Field>
                <Field label="Age">
                  <input
                    type="number"
                    value={patientForm.age}
                    onChange={(event) => setPatientForm((current) => ({ ...current, age: event.target.value }))}
                    placeholder="Auto or manual"
                  />
                </Field>
              </div>
            </div>

            <div className="patient-form-section full-span">
              <div className="patient-form-section-header">
                <span className="patient-form-section-step">02</span>
                <div>
                  <strong>Contact details</strong>
                  <p>Keep the most useful front-desk and follow-up information together.</p>
                </div>
              </div>
              <div className="patient-form-grid patient-form-grid-nested">
                <Field label="Phone" required>
                  <input
                    value={patientForm.phone}
                    onChange={(event) => setPatientForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Primary phone number"
                    required
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={patientForm.email}
                    onChange={(event) => setPatientForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="Email address"
                  />
                </Field>
                <Field label="Address">
                  <input
                    value={patientForm.address}
                    list="address-options"
                    onChange={(event) => setPatientForm((current) => ({ ...current, address: event.target.value }))}
                    placeholder="Street or location"
                  />
                </Field>
                <Field label="Residence">
                  <input
                    value={patientForm.residence}
                    list="residence-options"
                    onChange={(event) => setPatientForm((current) => ({ ...current, residence: event.target.value }))}
                    placeholder="Town or residential area"
                  />
                </Field>
              </div>
            </div>

            <div className="patient-form-section full-span">
              <div className="patient-form-section-header">
                <span className="patient-form-section-step">03</span>
                <div>
                  <strong>Visit details</strong>
                  <p>Document why the patient is here and when they should be seen.</p>
                </div>
              </div>
              <div className="patient-form-grid patient-form-grid-nested">
                <Field label="Visit purpose" required>
                  <select
                    value={patientForm.purpose}
                    onChange={(event) => setPatientForm((current) => ({ ...current, purpose: event.target.value }))}
                    required
                  >
                    {(patientMeta?.purposes ?? ['Consultation']).map((purpose) => (
                      <option key={purpose} value={purpose}>
                        {purpose}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Appointment date">
                  <input
                    type="date"
                    value={patientForm.appointment_date}
                    onChange={(event) =>
                      setPatientForm((current) => ({ ...current, appointment_date: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Notes / comment" className="full-span">
                  <textarea
                    rows="3"
                    value={patientForm.comment}
                    onChange={(event) => setPatientForm((current) => ({ ...current, comment: event.target.value }))}
                    placeholder="Walk-in note, symptoms, or front desk remark"
                  />
                </Field>
              </div>
            </div>
            <button className="primary-button full-span" type="submit" disabled={isSavingPatient}>
              {isSavingPatient ? 'Saving patient...' : 'Save patient record'}
            </button>
          </form>

          <datalist id="address-options">
            {(patientMeta?.addresses ?? []).map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <datalist id="residence-options">
            {(patientMeta?.residences ?? []).map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </article>

        <article className="panel patient-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Queue Control</p>
              <h3>Manage patient database</h3>
            </div>
            <span className="panel-tag">{patientData?.branch_name ?? patientMeta?.branch_name ?? 'Patients'}</span>
          </div>

          <div className="patient-lookup-panel">
            <div className="patient-lookup-header">
              <div>
                <p className="eyebrow">Existing Patient Lookup</p>
                <h3>Search the branch database live</h3>
                <p className="muted-copy">
                  Type at least 2 characters to find an existing patient and assign an optometrist without creating a new record.
                </p>
              </div>
              <span className="patient-lookup-status patient-lookup-status-live">
                <span className="patient-lookup-status-dot" />
                Live branch search
              </span>
            </div>

            <label className="patient-search-shell">
              <span className="patient-search-icon" aria-hidden="true">⌕</span>
              <input
                value={patientLookupSearch}
                onChange={(event) => setPatientLookupSearch(event.target.value)}
                placeholder="Search by folder ID, patient name, phone, or email"
              />
              <span className="patient-search-hint">min 2 chars</span>
            </label>

            {patientLookupSearch.trim().length >= 2 ? (
              isSearchingPatientLookup ? (
                <p className="muted-copy">Searching existing patients...</p>
              ) : patientLookupResults.length ? (
                <div className="patient-records compact-records">
                  {patientLookupResults.map((record) => (
                    <article key={`lookup-${record.id}`} className="patient-record">
                      <div className="patient-record-top">
                        <div>
                          <strong>{record.name}</strong>
                          <span>{record.folder_id} • {record.sex} • {record.age || 'N/A'} years</span>
                        </div>
                        <span className={`status-pill status-${record.status}`}>{record.status}</span>
                      </div>

                      <div className="patient-record-meta">
                        <span>Phone: {record.phone}</span>
                        <span>Last visit: {record.date}</span>
                        <span>Purpose: {record.purpose}</span>
                        <span>Assigned: {record.assigned_optometrist_name || 'Not assigned yet'}</span>
                      </div>

                      <div className="assign-grid">
                        <Field label="Assign optometrist">
                          <select
                            value={rowAssignments[record.id]?.assigned_optometrist_id ?? ''}
                            onChange={(event) =>
                              setRowAssignments((current) => ({
                                ...current,
                                [record.id]: {
                                  ...current[record.id],
                                  assigned_optometrist_id: Number(event.target.value),
                                },
                              }))
                            }
                          >
                            <option value="">Select optometrist</option>
                            {(patientMeta?.optometrists ?? []).map((optometrist) => (
                              <option key={optometrist.id} value={optometrist.id}>
                                {optometrist.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Appointment date">
                          <input
                            type="date"
                            value={rowAssignments[record.id]?.appointment_date ?? todayIso()}
                            onChange={(event) =>
                              setRowAssignments((current) => ({
                                ...current,
                                [record.id]: {
                                  ...current[record.id],
                                  appointment_date: event.target.value,
                                },
                              }))
                            }
                          />
                        </Field>
                        <button
                          type="button"
                          className="primary-button assign-button"
                          disabled={rowBusyId === record.id}
                          onClick={() => assignOptometrist(record.id)}
                        >
                          Assign
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No existing patients matched this search in the selected branch.</p>
              )
            ) : (
              <p className="muted-copy">Start typing to search the existing patient database live.</p>
            )}
          </div>

          <form
            className="patient-filter-grid"
            onSubmit={(event) => {
              event.preventDefault()
              setPatientQuery((current) => ({
                ...current,
                ...patientFilters,
                page: 1,
              }))
            }}
          >
            <Field label="Search">
              <input
                value={patientFilters.search}
                onChange={(event) => setPatientFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Folder ID, name, phone, email"
              />
            </Field>
            <Field label="Status">
              <select
                value={patientFilters.status}
                onChange={(event) => setPatientFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="all">All</option>
                {(patientMeta?.statuses ?? ['pending', 'seen']).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sex">
              <select
                value={patientFilters.sex}
                onChange={(event) => setPatientFilters((current) => ({ ...current, sex: event.target.value }))}
              >
                <option value="all">All</option>
                {(patientMeta?.sexes ?? ['Male', 'Female']).map((sex) => (
                  <option key={sex} value={sex}>
                    {sex}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Purpose">
              <select
                value={patientFilters.purpose}
                onChange={(event) => setPatientFilters((current) => ({ ...current, purpose: event.target.value }))}
              >
                <option value="all">All</option>
                {(patientMeta?.purposes ?? []).map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date from">
              <input
                type="date"
                value={patientFilters.date_from}
                onChange={(event) => setPatientFilters((current) => ({ ...current, date_from: event.target.value }))}
              />
            </Field>
            <Field label="Date to">
              <input
                type="date"
                value={patientFilters.date_to}
                onChange={(event) => setPatientFilters((current) => ({ ...current, date_to: event.target.value }))}
              />
            </Field>

            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Apply filters</button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const defaults = defaultFilters
                  setPatientFilters(defaults)
                  setPatientQuery(defaults)
                }}
              >
                Reset
              </button>
            </div>
          </form>

          {isLoadingPatients && !patientData ? <p className="muted-copy">Loading patient records...</p> : null}

          {patientData ? (
            <>
              <div className="patient-records">
                {patientData.records.map((record) => (
                  <article
                    key={record.id}
                    className={record.is_today_pending ? 'patient-record today-pending' : 'patient-record'}
                  >
                    <div className="patient-record-top">
                      <div>
                        <strong>{record.name}</strong>
                        <span>{record.folder_id} • {record.sex} • {record.age || 'N/A'} years</span>
                      </div>
                      <span className={`status-pill status-${record.status}`}>{record.status}</span>
                    </div>

                    <div className="patient-record-meta">
                      <span>Phone: {record.phone}</span>
                      <span>Purpose: {record.purpose}</span>
                      <span>Date: {record.date}</span>
                      <span>Residence: {record.residence || 'Not set'}</span>
                    </div>

                    <div className="patient-record-actions">
                      <button
                        type="button"
                        className="mini-action success"
                        disabled={rowBusyId === record.id || record.status === 'seen'}
                        onClick={() => markAsSeen(record.id, 'seen')}
                      >
                        Mark seen
                      </button>
                      <button
                        type="button"
                        className="mini-action"
                        disabled={rowBusyId === record.id || record.status === 'pending'}
                        onClick={() => markAsSeen(record.id, 'pending')}
                      >
                        Reopen
                      </button>
                    </div>

                    <div className="assign-grid">
                      <Field label="Assign optometrist">
                        <select
                          value={rowAssignments[record.id]?.assigned_optometrist_id ?? ''}
                          onChange={(event) =>
                            setRowAssignments((current) => ({
                              ...current,
                              [record.id]: {
                                ...current[record.id],
                                assigned_optometrist_id: Number(event.target.value),
                              },
                            }))
                          }
                        >
                          <option value="">Select optometrist</option>
                          {(patientMeta?.optometrists ?? []).map((optometrist) => (
                            <option key={optometrist.id} value={optometrist.id}>
                              {optometrist.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Appointment date">
                        <input
                          type="date"
                          value={rowAssignments[record.id]?.appointment_date ?? todayIso()}
                          onChange={(event) =>
                            setRowAssignments((current) => ({
                              ...current,
                              [record.id]: {
                                ...current[record.id],
                                appointment_date: event.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                      <button
                        type="button"
                        className="primary-button assign-button"
                        disabled={rowBusyId === record.id}
                        onClick={() => assignOptometrist(record.id)}
                      >
                        Assign
                      </button>
                    </div>

                    {record.comment ? <p className="patient-comment">{record.comment}</p> : null}
                    <p className="patient-assignee">
                      Assigned: {record.assigned_optometrist_name || 'Not assigned yet'}
                    </p>
                  </article>
                ))}
              </div>

              <div className="pagination-bar">
                <span>
                  Page {patientData.pagination.page} of {Math.max(patientData.pagination.total_pages, 1)}
                </span>
                <div className="pagination-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={patientData.pagination.page <= 1}
                    onClick={() => changePatientPage(patientData.pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={patientData.pagination.page >= patientData.pagination.total_pages}
                    onClick={() => changePatientPage(patientData.pagination.page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </article>
      </section>
      )}
    </section>
  )
}

function ReceptionistPatientsWorkspace({
  patientMeta,
  patientData,
  patientFilters,
  setPatientFilters,
  setPatientQuery,
  patientForm,
  setPatientForm,
  savePatientRecord,
  isSavingPatient,
  patientLookupSearch,
  setPatientLookupSearch,
  patientLookupResults,
  isSearchingPatientLookup,
  isLoadingPatients,
  changePatientPage,
  rowAssignments,
  setRowAssignments,
  rowBusyId,
  markAsSeen,
  assignOptometrist,
  updatePatientDetails,
  defaultFilters,
  isIntakeModalOpen,
  setIsIntakeModalOpen,
  editingRecord,
  setEditingRecord,
  isSavingEdit,
  setIsSavingEdit,
}) {
  const purposeOptions = useMemo(() => {
    const source = Array.isArray(patientMeta?.purposes) ? patientMeta.purposes : []
    return Array.from(new Set([...CANONICAL_PATIENT_PURPOSES, ...source])).filter(Boolean)
  }, [patientMeta?.purposes])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPatientQuery((current) => {
        const next = { ...current, ...patientFilters, page: 1 }
        const keys = ['search', 'status', 'sex', 'purpose', 'date_from', 'date_to', 'per_page']
        const unchanged = keys.every((key) => String(current[key] ?? '') === String(next[key] ?? '')) && current.page === 1
        return unchanged ? current : next
      })
    }, patientFilters.search ? 180 : 0)

    return () => window.clearTimeout(timer)
  }, [patientFilters, setPatientQuery])

  async function submitEdit(event) {
    event.preventDefault()
    if (!editingRecord) return

    setIsSavingEdit(true)
    try {
      await updatePatientDetails(editingRecord.id, editingRecord)
      setEditingRecord(null)
    } finally {
      setIsSavingEdit(false)
    }
  }

  return (
    <>
      <section className="patient-reception-shell">
        <article className="panel patient-reception-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Patient Intake</p>
              <h3>Reception desk workspace</h3>
              <p className="muted-copy">
                Register new patients in a popup, search the branch database live, and work through past entries from one table-first screen.
              </p>
            </div>
            <div className="patient-reception-actions">
              <span className="panel-tag">{patientData?.branch_name ?? patientMeta?.branch_name ?? 'Patients'}</span>
              <button
                type="button"
                className="primary-button"
                onClick={() => setIsIntakeModalOpen(true)}
              >
                Register Patient
              </button>
            </div>
          </div>

          <div className="patient-intake-hero patient-reception-hero">
            <div>
              <span className="patient-intake-kicker">Single Workspace</span>
              <strong>Live search, live filters, and editable history without a two-column display.</strong>
            </div>
            <div className="patient-intake-highlights">
              <span>Popup registration</span>
              <span>One search bar</span>
              <span>Past entry edits</span>
            </div>
          </div>

          <div className="patient-lookup-panel patient-reception-lookup">
            <div className="patient-lookup-header">
              <div>
                <p className="eyebrow">Search And Filters</p>
                <h3>Use one search bar for live lookup and history</h3>
                <p className="muted-copy">
                  Search once to check duplicates and narrow the past-entry table, then refine with the filters beside it.
                </p>
              </div>
              <span className="patient-lookup-status patient-lookup-status-live">
                <span className="patient-lookup-status-dot" />
                Live lookup + table filter
              </span>
            </div>

            <label className="patient-search-shell patient-reception-searchbar">
              <span className="patient-search-icon" aria-hidden="true">⌕</span>
              <input
                value={patientFilters.search}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setPatientFilters((current) => ({ ...current, search: nextValue }))
                  setPatientLookupSearch(nextValue)
                }}
                placeholder="Search by folder ID, patient name, phone, or email"
              />
              <span className="patient-search-hint">min 2 chars</span>
            </label>

            <div className="patient-filter-grid patient-reception-filters">
              <Field label="Status">
                <select
                  value={patientFilters.status}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="all">All</option>
                  {(patientMeta?.statuses ?? ['pending', 'seen']).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sex">
                <select
                  value={patientFilters.sex}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, sex: event.target.value }))}
                >
                  <option value="all">All</option>
                  {(patientMeta?.sexes ?? ['Male', 'Female']).map((sex) => (
                    <option key={sex} value={sex}>
                      {sex}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Purpose">
                <select
                  value={patientFilters.purpose}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, purpose: event.target.value }))}
                >
                  <option value="all">All</option>
                  {purposeOptions.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date from">
                <input
                  type="date"
                  value={patientFilters.date_from}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, date_from: event.target.value }))}
                />
              </Field>
              <Field label="Date to">
                <input
                  type="date"
                  value={patientFilters.date_to}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, date_to: event.target.value }))}
                />
              </Field>
              <Field label="Rows">
                <select
                  value={patientFilters.per_page}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, per_page: Number(event.target.value) }))}
                >
                  {[10, 15, 25, 50].map((size) => (
                    <option key={size} value={size}>
                      {size} rows
                    </option>
                  ))}
                </select>
              </Field>
              <div className="filter-actions-row full-span">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setPatientFilters(defaultFilters)
                    setPatientQuery(defaultFilters)
                    setPatientLookupSearch(defaultFilters.search)
                  }}
                >
                  Reset filters
                </button>
              </div>
            </div>

            {patientFilters.search.trim().length >= 2 ? (
              isSearchingPatientLookup ? (
                <p className="muted-copy">Searching existing patients...</p>
              ) : patientLookupResults.length ? (
                <div className="patient-records compact-records">
                  {patientLookupResults.map((record) => (
                    <article key={`lookup-${record.id}`} className="patient-record">
                      <div className="patient-record-top">
                        <div>
                          <strong>{record.name}</strong>
                          <span>{record.folder_id} • {record.sex} • {record.age || 'N/A'} years</span>
                        </div>
                        <span className={`status-pill status-${record.status}`}>{record.status}</span>
                      </div>
                      <div className="patient-record-meta">
                        <span>Phone: {record.phone}</span>
                        <span>Last visit: {record.date}</span>
                        <span>Purpose: {record.purpose}</span>
                        <span>Assigned: {record.assigned_optometrist_name || 'Not assigned yet'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No existing patients matched this search in the selected branch.</p>
              )
            ) : (
              <p className="muted-copy">Start typing to search the existing patient database live.</p>
            )}
          </div>

          {isLoadingPatients && !patientData ? <p className="muted-copy">Loading patient records...</p> : null}

          {patientData ? (
            <>
              <div className="patient-table-summary">
                <strong>{patientData.pagination.total ?? patientData.records.length} past entries</strong>
                <span>Search and filters update this history table live.</span>
              </div>
              <div className="patient-history-table-shell">
                <table className="portal-table patient-history-table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Contact</th>
                      <th>Visit</th>
                      <th>Status</th>
                      <th>Assignment</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientData.records.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <div className="patient-table-primary">
                            <strong>{record.name}</strong>
                            <span>{record.folder_id}</span>
                          </div>
                        </td>
                        <td>
                          <div className="patient-table-stack">
                            <span>{record.phone || 'No phone'}</span>
                            <span>{record.sex || 'N/A'} • {record.age || 'N/A'} yrs</span>
                          </div>
                        </td>
                        <td>
                          <div className="patient-table-stack">
                            <span>{record.purpose || 'Consultation'}</span>
                            <span>{record.date}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill status-${record.status}`}>{record.status}</span>
                        </td>
                        <td>
                          <div className="patient-table-assignment">
                            <select
                              value={rowAssignments[record.id]?.assigned_optometrist_id ?? ''}
                              onChange={(event) =>
                                setRowAssignments((current) => ({
                                  ...current,
                                  [record.id]: {
                                    ...current[record.id],
                                    assigned_optometrist_id: Number(event.target.value),
                                  },
                                }))
                              }
                          >
                            <option value="">Select optometrist</option>
                            {(patientMeta?.optometrists ?? []).map((optometrist) => (
                              <option key={optometrist.id} value={optometrist.id}>
                                {optometrist.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={rowAssignments[record.id]?.appointment_date ?? todayIso()}
                            onChange={(event) =>
                              setRowAssignments((current) => ({
                                ...current,
                                [record.id]: {
                                  ...current[record.id],
                                  appointment_date: event.target.value,
                                },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="mini-action"
                            disabled={rowBusyId === record.id}
                            onClick={() => assignOptometrist(record.id)}
                          >
                            Assign
                          </button>
                        </div>
                        </td>
                        <td>
                          <div className="patient-table-actions">
                            <button
                              type="button"
                              className="mini-action"
                              onClick={() =>
                                setEditingRecord({
                                  id: record.id,
                                  surname: record.surname || '',
                                  firstname: record.firstname || '',
                                  othernames: record.othernames || '',
                                  sex: record.sex || '',
                                  dob: record.dob || '',
                                  age: record.age || '',
                                  email: record.email || '',
                                  phone: record.phone || '',
                                  address: record.address || '',
                                  residence: record.residence || '',
                                  purpose: record.purpose || 'Consultation',
                                  comment: record.comment || '',
                                  appointment_date: record.appointment_date || '',
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="mini-action success"
                              disabled={rowBusyId === record.id || record.status === 'seen'}
                              onClick={() => markAsSeen(record.id, 'seen')}
                            >
                              Mark seen
                            </button>
                            <button
                              type="button"
                              className="mini-action"
                              disabled={rowBusyId === record.id || record.status === 'pending'}
                              onClick={() => markAsSeen(record.id, 'pending')}
                            >
                              Reopen
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-bar">
                <span>
                  Page {patientData.pagination.page} of {Math.max(patientData.pagination.total_pages, 1)}
                </span>
                <div className="pagination-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={patientData.pagination.page <= 1}
                    onClick={() => changePatientPage(patientData.pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={patientData.pagination.page >= patientData.pagination.total_pages}
                    onClick={() => changePatientPage(patientData.pagination.page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </article>
      </section>

      {isIntakeModalOpen ? (
        <PatientIntakeModal
          title="Register patient"
          form={patientForm}
          setForm={setPatientForm}
          patientMeta={patientMeta}
          isSaving={isSavingPatient}
          onClose={() => setIsIntakeModalOpen(false)}
          onSubmit={async (event) => {
            const ok = await savePatientRecord(event)
            if (ok) setIsIntakeModalOpen(false)
          }}
          submitLabel={isSavingPatient ? 'Saving patient...' : 'Save patient record'}
        />
      ) : null}

      {editingRecord ? (
        <PatientIntakeModal
          title="Edit patient"
          form={editingRecord}
          setForm={setEditingRecord}
          patientMeta={patientMeta}
          isSaving={isSavingEdit}
          onClose={() => setEditingRecord(null)}
          onSubmit={submitEdit}
          submitLabel={isSavingEdit ? 'Saving changes...' : 'Save changes'}
        />
      ) : null}
    </>
  )
}

export function PatientIntakeModal({ title, form, setForm, patientMeta, isSaving, onClose, onSubmit, submitLabel }) {
  const purposeOptions = useMemo(() => {
    const source = Array.isArray(patientMeta?.purposes) ? patientMeta.purposes : []
    return Array.from(new Set([...CANONICAL_PATIENT_PURPOSES, ...source])).filter(Boolean)
  }, [patientMeta?.purposes])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel patient-intake-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Patient Intake</p>
            <h3>{title}</h3>
            <p className="muted-copy">Capture identity, contact, and visit details in one focused popup.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>Close</button>
          </div>
        </div>

        <form className="patient-form-grid" onSubmit={onSubmit}>
          <div className="patient-form-section full-span">
            <div className="patient-form-section-header">
              <span className="patient-form-section-step">01</span>
              <div>
                <strong>Patient identity</strong>
                <p>Start with the patient's official and demographic details.</p>
              </div>
            </div>
            <div className="patient-form-grid patient-form-grid-nested">
              <Field label="Surname" required>
                <input
                  value={form.surname}
                  onChange={(event) => setForm((current) => ({ ...current, surname: event.target.value }))}
                  placeholder="Enter surname"
                  required
                />
              </Field>
              <Field label="First name" required>
                <input
                  value={form.firstname}
                  onChange={(event) => setForm((current) => ({ ...current, firstname: event.target.value }))}
                  placeholder="Enter first name"
                  required
                />
              </Field>
              <Field label="Other names">
                <input
                  value={form.othernames}
                  onChange={(event) => setForm((current) => ({ ...current, othernames: event.target.value }))}
                  placeholder="Middle or additional names"
                />
              </Field>
              <Field label="Sex" required>
                <select
                  value={form.sex}
                  onChange={(event) => setForm((current) => ({ ...current, sex: event.target.value }))}
                  required
                >
                  <option value="">Select sex</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </Field>
              <Field label="Date of birth">
                <input
                  type="date"
                  value={form.dob}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dob: event.target.value,
                      age: event.target.value ? String(calculateAge(event.target.value)) : '',
                    }))
                  }
                />
              </Field>
              <Field label="Age">
                <input
                  type="number"
                  value={form.age}
                  onChange={(event) => setForm((current) => ({ ...current, age: event.target.value }))}
                  placeholder="Auto or manual"
                />
              </Field>
            </div>
          </div>

          <div className="patient-form-section full-span">
            <div className="patient-form-section-header">
              <span className="patient-form-section-step">02</span>
              <div>
                <strong>Contact details</strong>
                <p>Keep the most useful front-desk and follow-up information together.</p>
              </div>
            </div>
            <div className="patient-form-grid patient-form-grid-nested">
              <Field label="Phone" required>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Primary phone number"
                  required
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Email address"
                />
              </Field>
              <Field label="Address">
                <input
                  value={form.address}
                  list="patient-intake-address-options"
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Street or location"
                />
              </Field>
              <Field label="Residence">
                <input
                  value={form.residence}
                  list="patient-intake-residence-options"
                  onChange={(event) => setForm((current) => ({ ...current, residence: event.target.value }))}
                  placeholder="Town or residential area"
                />
              </Field>
            </div>
          </div>

          <div className="patient-form-section full-span">
            <div className="patient-form-section-header">
              <span className="patient-form-section-step">03</span>
              <div>
                <strong>Visit details</strong>
                <p>Document why the patient is here and when they should be seen.</p>
              </div>
            </div>
            <div className="patient-form-grid patient-form-grid-nested">
              <Field label="Visit purpose" required>
                <select
                  value={form.purpose}
                  onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))}
                  required
                >
                  {purposeOptions.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Appointment date">
                <input
                  type="date"
                  value={form.appointment_date}
                  onChange={(event) => setForm((current) => ({ ...current, appointment_date: event.target.value }))}
                />
              </Field>
              <Field label="Notes / comment" className="full-span">
                <textarea
                  rows="3"
                  value={form.comment}
                  onChange={(event) => setForm((current) => ({ ...current, comment: event.target.value }))}
                  placeholder="Walk-in note, symptoms, or front desk remark"
                />
              </Field>
            </div>
          </div>

          <div className="modal-actions full-span">
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit" disabled={isSaving}>
              {submitLabel}
            </button>
          </div>
        </form>

        <datalist id="patient-intake-address-options">
          {(patientMeta?.addresses ?? []).map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <datalist id="patient-intake-residence-options">
          {(patientMeta?.residences ?? []).map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </article>
    </div>
  )
}

function ManagerPatientsWorkspace({
  patientMeta,
  patientData,
  patientFilters,
  setPatientFilters,
  setPatientQuery,
  isLoadingPatients,
  changePatientPage,
  rowAssignments,
  setRowAssignments,
  rowBusyId,
  markAsSeen,
  assignOptometrist,
  defaultFilters,
}) {
  const stats = patientData?.stats ?? {}
  const activeDateRange = patientFilters.date_from || patientFilters.date_to
    ? `${patientFilters.date_from || 'Start'} to ${patientFilters.date_to || 'Today'}`
    : 'All dates'

  return (
    <section className="patient-manager-shell">
      <article className="panel patient-manager-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Database View</p>
            <h3>Patient database analytics and filters</h3>
            <p className="muted-copy">
              Filter the branch database, compare workload mix, and surface patients that need follow-up or assignment.
            </p>
          </div>
          <span className="panel-tag">{patientData?.branch_name ?? patientMeta?.branch_name ?? 'Patients'}</span>
        </div>

        <div className="patient-manager-hero">
          <div>
            <span className="patient-intake-kicker">General Manager View</span>
            <strong>Use this page as a decision desk for patient flow, assignment coverage, and demographic mix.</strong>
          </div>
          <div className="patient-intake-highlights">
            <span>Database-wide visibility</span>
            <span>Operational trends</span>
            <span>Actionable patient table</span>
          </div>
        </div>

        <form
          className="patient-filter-grid"
          onSubmit={(event) => {
            event.preventDefault()
            setPatientQuery((current) => ({
              ...current,
              ...patientFilters,
              page: 1,
            }))
          }}
        >
          <Field label="Search">
            <input
              value={patientFilters.search}
              onChange={(event) => setPatientFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Folder ID, name, phone, email"
            />
          </Field>
          <Field label="Status">
            <select
              value={patientFilters.status}
              onChange={(event) => setPatientFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">All</option>
              {(patientMeta?.statuses ?? ['pending', 'seen']).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sex">
            <select
              value={patientFilters.sex}
              onChange={(event) => setPatientFilters((current) => ({ ...current, sex: event.target.value }))}
            >
              <option value="all">All</option>
              {(patientMeta?.sexes ?? ['Male', 'Female']).map((sex) => (
                <option key={sex} value={sex}>
                  {sex}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Purpose">
            <select
              value={patientFilters.purpose}
              onChange={(event) => setPatientFilters((current) => ({ ...current, purpose: event.target.value }))}
            >
              <option value="all">All</option>
              {(patientMeta?.purposes ?? []).map((purpose) => (
                <option key={purpose} value={purpose}>
                  {purpose}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date from">
            <input
              type="date"
              value={patientFilters.date_from}
              onChange={(event) => setPatientFilters((current) => ({ ...current, date_from: event.target.value }))}
            />
          </Field>
          <Field label="Date to">
            <input
              type="date"
              value={patientFilters.date_to}
              onChange={(event) => setPatientFilters((current) => ({ ...current, date_to: event.target.value }))}
            />
          </Field>
          <Field label="Rows per page">
            <select
              value={patientFilters.per_page}
              onChange={(event) => setPatientFilters((current) => ({ ...current, per_page: Number(event.target.value) }))}
            >
              {[10, 15, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </select>
          </Field>

          <div className="filter-actions-row full-span">
            <button type="submit" className="primary-button">Apply manager filters</button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setPatientFilters(defaultFilters)
                setPatientQuery(defaultFilters)
              }}
            >
              Reset
            </button>
          </div>
        </form>

        <div className="finance-chip-row patient-manager-chip-row">
          <div className="finance-chip">
            <span>Database Size</span>
            <strong>{stats.database_total_count ?? 0} patients</strong>
          </div>
          <div className="finance-chip">
            <span>Filtered Results</span>
            <strong>{stats.total_count ?? 0} matches</strong>
          </div>
          <div className="finance-chip">
            <span>Seen Rate</span>
            <strong>{formatPercent(stats.seen_rate)} completion</strong>
          </div>
          <div className="finance-chip">
            <span>Active Window</span>
            <strong>{activeDateRange}</strong>
          </div>
        </div>
      </article>

      <div className="patient-manager-insights-grid">
        <InsightCard title="Operational Snapshot" tone="blue">
          <InsightMetric label="Assigned" value={stats.assigned_count ?? 0} />
          <InsightMetric label="Unassigned" value={stats.unassigned_count ?? 0} />
          <InsightMetric label="Appointments Today" value={stats.appointment_due_today_count ?? 0} />
          <InsightMetric label="Today Pending" value={stats.today_pending_count ?? 0} />
        </InsightCard>

        <InsightCard title="New Patient Cadence" tone="amber">
          <InsightMetric label="Today" value={stats.new_today_count ?? 0} />
          <InsightMetric label="This Week" value={stats.new_week_count ?? 0} />
          <InsightMetric label="This Month" value={stats.new_month_count ?? 0} />
          <InsightMetric label="Pending Total" value={stats.pending_count ?? 0} />
        </InsightCard>

        <InsightCard title="Status Mix" tone="slate">
          <BreakdownList items={stats.status_breakdown} emptyLabel="No status data yet" />
        </InsightCard>

        <InsightCard title="Gender Mix" tone="teal">
          <BreakdownList items={stats.sex_breakdown} emptyLabel="No sex data yet" />
        </InsightCard>

        <InsightCard title="Visit Purposes" tone="violet">
          <BreakdownList items={stats.purpose_breakdown} emptyLabel="No purpose data yet" />
        </InsightCard>

        <InsightCard title="Client Residences" tone="blue">
          <BreakdownList items={stats.residence_breakdown} emptyLabel="No residence data yet" />
        </InsightCard>
      </div>

      <article className="panel patient-database-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Patient Table</p>
            <h3>Management view of the patient database</h3>
            <p className="muted-copy">Filter, review, and act on patient records directly from this table.</p>
          </div>
          <span className="panel-tag">{patientData?.pagination?.total ?? 0} rows in view</span>
        </div>

        {isLoadingPatients && !patientData ? <p className="muted-copy">Loading patient records...</p> : null}

        {patientData ? (
          <>
            <div className="table-shell">
              <table className="portal-table patient-database-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Folder ID</th>
                    <th>Visit Date</th>
                    <th>Demographics</th>
                    <th>Contact</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th>Assigned</th>
                    <th>Appointment</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {patientData.records.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <div className="patient-table-primary">
                          <strong>{record.name}</strong>
                          <span>{record.residence || record.address || 'Location not set'}</span>
                        </div>
                      </td>
                      <td>{record.folder_id}</td>
                      <td>{record.date}</td>
                      <td>{record.sex} / {record.age || 'N/A'} yrs</td>
                      <td>
                        <div className="patient-table-primary">
                          <strong>{record.phone || 'No phone'}</strong>
                          <span>{record.email || 'No email'}</span>
                        </div>
                      </td>
                      <td>{record.purpose}</td>
                      <td>
                        <span className={`status-pill status-${record.status}`}>{record.status}</span>
                      </td>
                      <td>{record.assigned_optometrist_name || 'Unassigned'}</td>
                      <td>{record.appointment_date || 'Not booked'}</td>
                      <td>{record.comment || 'No notes'}</td>
                      <td>
                        <div className="patient-table-actions">
                          <button
                            type="button"
                            className="mini-action success"
                            disabled={rowBusyId === record.id || record.status === 'seen'}
                            onClick={() => markAsSeen(record.id, 'seen')}
                          >
                            Seen
                          </button>
                          <button
                            type="button"
                            className="mini-action"
                            disabled={rowBusyId === record.id || record.status === 'pending'}
                            onClick={() => markAsSeen(record.id, 'pending')}
                          >
                            Reopen
                          </button>
                          <select
                            value={rowAssignments[record.id]?.assigned_optometrist_id ?? ''}
                            onChange={(event) =>
                              setRowAssignments((current) => ({
                                ...current,
                                [record.id]: {
                                  ...current[record.id],
                                  assigned_optometrist_id: Number(event.target.value),
                                },
                              }))
                            }
                          >
                            <option value="">Assign optometrist</option>
                            {(patientMeta?.optometrists ?? []).map((optometrist) => (
                              <option key={optometrist.id} value={optometrist.id}>
                                {optometrist.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={rowAssignments[record.id]?.appointment_date ?? todayIso()}
                            onChange={(event) =>
                              setRowAssignments((current) => ({
                                ...current,
                                [record.id]: {
                                  ...current[record.id],
                                  appointment_date: event.target.value,
                                },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="primary-button assign-button"
                            disabled={rowBusyId === record.id}
                            onClick={() => assignOptometrist(record.id)}
                          >
                            Save
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar">
              <span>
                Page {patientData.pagination.page} of {Math.max(patientData.pagination.total_pages, 1)}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={patientData.pagination.page <= 1}
                  onClick={() => changePatientPage(patientData.pagination.page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={patientData.pagination.page >= patientData.pagination.total_pages}
                  onClick={() => changePatientPage(patientData.pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
      </article>
    </section>
  )
}

function OptometristPatientsWorkspace({
  activeView,
  setActiveView,
  companyProfile,
  patientData,
  patientStats,
  patientFilters,
  setPatientFilters,
  setPatientQuery,
  isLoadingPatients,
  changePatientPage,
  patientMeta,
  rowAssignments,
  setRowAssignments,
  rowBusyId,
  markAsSeen,
  assignOptometrist,
  updatePatientDetails,
  fetchPatientPrescriptions,
  addPatientPrescription,
  fetchMedicalReport,
  fetchPatientExamForm,
  savePatientExamForm,
  fetchPatientDocuments,
  uploadPatientDocuments,
  patientLookupSearch,
  setPatientLookupSearch,
  patientLookupResults,
  isSearchingPatientLookup,
  selectedPatient,
  selectedPatientId,
  setSelectedPatientId,
  defaultFilters,
}) {
  const records = patientData?.records ?? []
  const queueRecords = records.filter((record) => patientFilters.status === 'all' || record.status === patientFilters.status)
  const selectedStatusTone = selectedPatient?.status === 'seen' ? 'seen' : 'pending'
  const [examModalPatient, setExamModalPatient] = useState(null)
  const [examModalFormId, setExamModalFormId] = useState(null)
  const [examPageBackView, setExamPageBackView] = useState('Patient Management')
  const [prescriptionModalPatient, setPrescriptionModalPatient] = useState(null)
  const [reviewModalPatient, setReviewModalPatient] = useState(null)
  const [uploadsModalPatient, setUploadsModalPatient] = useState(null)
  const [recordsModalPatient, setRecordsModalPatient] = useState(null)
  const [managementModalPatient, setManagementModalPatient] = useState(null)
  const [referenceModalPatient, setReferenceModalPatient] = useState(null)
  const openExamModal = (patient, options = {}) => {
    if (!patient) return
    setSelectedPatientId(patient.id)
    setExamModalPatient(patient)
    setExamModalFormId(options.formId ?? null)
  }
  const openPatientWorkspace = (patient, view) => {
    if (!patient) return
    setSelectedPatientId(patient.id)
    if (view === 'Patient Form') {
      setExamPageBackView(activeView === 'Patient Form' ? 'Patient Management' : activeView)
    }
    setActiveView(view)
  }
  const openExamWorkspace = (patient, originView = activeView) => {
    if (!patient) return
    setSelectedPatientId(patient.id)
    setExamPageBackView(originView || 'Patient Management')
    setActiveView('Patient Form')
  }
  const openPrescriptionModal = (patient) => {
    if (!patient) return
    setSelectedPatientId(patient.id)
    setPrescriptionModalPatient(patient)
  }
  const openReviewModal = (patient) => {
    if (!patient) return
    setSelectedPatientId(patient.id)
    setReviewModalPatient(patient)
  }
  const openUploadsModal = (patient) => {
    if (!patient) return
    setSelectedPatientId(patient.id)
    setUploadsModalPatient(patient)
  }
  const openManagementModal = (patient) => {
    if (!patient) return
    setSelectedPatientId(patient.id)
    setManagementModalPatient(patient)
  }
  const openReferenceModal = (patient) => {
    if (!patient) return
    setSelectedPatientId(patient.id)
    setReferenceModalPatient(patient)
  }
  const headerMap = {
    'Patient Management': {
      eyebrow: 'Patient Management',
      title: 'Work through the branch patient database',
      copy: 'Search the branch live, edit patient details, and review older prescriptions from one clean management surface.',
    },
    'Prescription Reference': {
      eyebrow: 'Prescription Reference',
      title: 'Review saved prescription references for the selected patient',
      copy: 'Open the patient-specific prescription history directly from the branch patient database without losing your current workspace.',
    },
    Prescriptions: {
      eyebrow: 'Prescriptions',
      title: 'Review all saved prescriptions for the selected patient',
      copy: 'Open the prescription list for one patient, inspect each saved record, and jump into the full prescription workspace when needed.',
    },
    Prescription: {
      eyebrow: 'Prescription',
      title: 'Prepare, print, and save a prescription for the selected patient',
      copy: 'Use the selected patient record to review history, fill a fresh prescription, and manage supporting uploads in one page.',
    },
    'Patient Review': {
      eyebrow: 'Patient Review',
      title: 'Review the selected patient in a full clinical summary',
      copy: 'Use one wide review surface for identity, visit context, contact details, and stored notes.',
    },
    'Patient Form': {
      eyebrow: 'Patient Form',
      title: 'Standard optometry patient form',
      copy: 'A comprehensive optometry form standard designed around the fields your patient database already supports.',
    },
    'Patient Records': {
      eyebrow: 'Patient Records',
      title: 'Patient records and branch history',
      copy: 'Open a full-width record sheet for the selected patient instead of working from a narrow side panel.',
    },
    'Patient Uploads': {
      eyebrow: 'Patient Uploads',
      title: 'Upload files for the selected patient',
      copy: 'Attach x-rays, referral sheets, scans, and phone camera captures directly to the active patient record.',
    },
  }
  const header = headerMap[activeView] ?? headerMap['Patient Management']

  if (activeView === 'Patient Form') {
    return (
      <>
        <section className="patients-section">
          <div className="patients-header">
            <div>
              <p className="eyebrow">{header.eyebrow}</p>
              <h3>{header.title}</h3>
              <p className="header-copy">{header.copy}</p>
            </div>
          </div>

          {!selectedPatient ? (
            <article className="panel optometrist-patient-focus">
              <div className="empty-state-panel">
                <p className="eyebrow">No patient selected</p>
                <h3>Choose a patient from Patient Management first</h3>
                <p className="muted-copy">The full patient form opens here once a patient has been selected from the branch patient directory.</p>
              </div>
            </article>
          ) : (
            <section className="optometrist-form-page optometrist-form-page-full">
              <PatientExamWorkspace
                patient={selectedPatient}
                fetchPatientExamForm={fetchPatientExamForm}
                savePatientExamForm={savePatientExamForm}
                mode="page"
                onBack={() => setActiveView(examPageBackView || 'Patient Management')}
              />
            </section>
          )}
        </section>
        {examModalPatient ? (
          <PatientExamModal
            patient={examModalPatient}
            initialFormId={examModalFormId}
            onClose={() => {
              setExamModalPatient(null)
              setExamModalFormId(null)
            }}
            fetchPatientExamForm={fetchPatientExamForm}
            savePatientExamForm={savePatientExamForm}
          />
        ) : null}
      </>
    )
  }

  if (activeView === 'Patient Management') {
    return (
      <>
        <section className="patients-section">
          <div className="patients-header">
            <div>
              <p className="eyebrow">{header.eyebrow}</p>
              <h3>{header.title}</h3>
              <p className="header-copy">{header.copy}</p>
            </div>
          </div>

          <section className="stats-grid patient-stats-grid">
            {patientStats.map((stat) => (
              <StatWidget
                key={stat.label}
                label={stat.label}
                value={stat.value}
                note={stat.note}
                icon={patientIconFor(stat.label, stat.className)}
                className={stat.className}
              />
            ))}
          </section>

          <article className="panel optometrist-patient-directory">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Patient Management</p>
                <h3>Branch patient directory</h3>
                <p className="muted-copy">
                  Use the action buttons on each entry to open patient management, prescription reference, review, uploads, and examination tools.
                </p>
              </div>
              <span className="panel-tag">{patientData?.pagination?.total ?? records.length} patients</span>
            </div>

            <form
              className="patient-filter-grid"
              onSubmit={(event) => {
                event.preventDefault()
                setPatientQuery((current) => ({ ...current, ...patientFilters, page: 1 }))
              }}
            >
              <Field label="Search">
                <input
                  value={patientFilters.search}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Live search by folder ID, name, phone, or email"
                />
              </Field>
              <Field label="Status">
                <select
                  value={patientFilters.status}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="all">All</option>
                  {(patientMeta?.statuses ?? ['pending', 'seen']).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Purpose">
                <select
                  value={patientFilters.purpose}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, purpose: event.target.value }))}
                >
                  <option value="all">All purposes</option>
                  {(patientMeta?.purposes ?? []).map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button">Apply filters</button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setPatientFilters(defaultFilters)
                    setPatientQuery(defaultFilters)
                  }}
                >
                  Reset
                </button>
              </div>
            </form>

            {isLoadingPatients && !patientData ? <p className="muted-copy">Loading patient workspace...</p> : null}

            <div className="optometrist-patient-list">
              {queueRecords.map((record) => (
                <article key={record.id} className="optometrist-patient-card">
                  <div className="optometrist-patient-card-main">
                    <div className="optometrist-patient-card-top">
                      <div>
                        <strong>{record.patient_name || record.name}</strong>
                        <span>{record.folder_id}</span>
                      </div>
                      <span className={`status-pill status-${record.status}`}>{record.status}</span>
                    </div>
                    <div className="patient-record-meta">
                      <span>{record.sex || 'N/A'} / {record.age || 'N/A'} yrs</span>
                      <span>{record.phone || 'No phone'}</span>
                      <span>{record.purpose || 'Consultation'}</span>
                      <span>{record.appointment_date || 'No appointment'}</span>
                    </div>
                  </div>
                  <div className="optometrist-patient-card-actions">
                    <button
                      type="button"
                      className="ghost-button patient-management-action-button"
                      onClick={() => openManagementModal(record)}
                    >
                      Patient Management
                    </button>
                    <button
                      type="button"
                      className="ghost-button patient-management-action-button"
                      onClick={() => openPatientWorkspace(record, 'Patient Form')}
                    >
                      Patient Form
                    </button>
                    <button
                      type="button"
                      className="ghost-button patient-management-action-button"
                      onClick={() => openReferenceModal(record)}
                    >
                      Prescription Reference
                    </button>
                    <button
                      type="button"
                      className="ghost-button patient-management-action-button"
                      onClick={() => openPrescriptionModal(record)}
                    >
                      Prescription
                    </button>
                    <button
                      type="button"
                      className="ghost-button patient-management-action-button"
                      onClick={() => openUploadsModal(record)}
                    >
                      Uploads
                    </button>
                    <button
                      type="button"
                      className="ghost-button patient-management-action-button"
                      onClick={() => openReviewModal(record)}
                    >
                      Patient Review
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {patientData ? (
              <div className="pagination-bar">
                <span>
                  Page {patientData.pagination.page} of {Math.max(patientData.pagination.total_pages, 1)}
                </span>
                <div className="pagination-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={patientData.pagination.page <= 1}
                    onClick={() => changePatientPage(patientData.pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={patientData.pagination.page >= patientData.pagination.total_pages}
                    onClick={() => changePatientPage(patientData.pagination.page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        </section>
        {managementModalPatient ? (
          <PatientManagementModal
            patient={managementModalPatient}
            onClose={() => setManagementModalPatient(null)}
            setActiveView={(view) => {
              setActiveView(view)
              setManagementModalPatient(null)
            }}
            openExamModal={(patient) => {
              setManagementModalPatient(null)
              openExamModal(patient)
            }}
            updatePatientDetails={updatePatientDetails}
            fetchPatientPrescriptions={fetchPatientPrescriptions}
          />
        ) : null}
        {referenceModalPatient ? (
          <PrescriptionReferenceModal
            patient={referenceModalPatient}
            onClose={() => setReferenceModalPatient(null)}
            fetchPatientPrescriptions={fetchPatientPrescriptions}
          />
        ) : null}
        {examModalPatient ? (
          <PatientExamModal
            patient={examModalPatient}
            initialFormId={examModalFormId}
            onClose={() => {
              setExamModalPatient(null)
              setExamModalFormId(null)
            }}
            fetchPatientExamForm={fetchPatientExamForm}
            savePatientExamForm={savePatientExamForm}
          />
        ) : null}
        {prescriptionModalPatient ? (
          <PatientPrescriptionModal
            patient={prescriptionModalPatient}
            onClose={() => setPrescriptionModalPatient(null)}
            companyProfile={companyProfile}
            fetchPatientPrescriptions={fetchPatientPrescriptions}
            fetchPatientExamForm={fetchPatientExamForm}
            addPatientPrescription={addPatientPrescription}
            fetchPatientDocuments={fetchPatientDocuments}
            uploadPatientDocuments={uploadPatientDocuments}
          />
        ) : null}
        {reviewModalPatient ? (
          <PatientReviewModal
            patient={reviewModalPatient}
            onClose={() => setReviewModalPatient(null)}
            setActiveView={setActiveView}
            setSelectedPatientId={setSelectedPatientId}
            patientLookupSearch={patientLookupSearch}
            setPatientLookupSearch={setPatientLookupSearch}
            patientLookupResults={patientLookupResults}
            isSearchingPatientLookup={isSearchingPatientLookup}
            fetchPatientPrescriptions={fetchPatientPrescriptions}
            addPatientPrescription={addPatientPrescription}
            fetchMedicalReport={fetchMedicalReport}
            openExamModal={openExamModal}
          />
        ) : null}
        {uploadsModalPatient ? (
          <PatientUploadsModal
            patient={uploadsModalPatient}
            onClose={() => setUploadsModalPatient(null)}
            fetchPatientDocuments={fetchPatientDocuments}
            uploadPatientDocuments={uploadPatientDocuments}
          />
        ) : null}
      </>
    )
  }

  if (activeView === 'Patient Records') {
    return (
      <>
        <section className="patients-section">
          <div className="patients-header">
            <div>
              <p className="eyebrow">{header.eyebrow}</p>
              <h3>{header.title}</h3>
              <p className="header-copy">{header.copy}</p>
            </div>
          </div>

          <section className="stats-grid patient-stats-grid">
            {patientStats.map((stat) => (
              <StatWidget
                key={stat.label}
                label={stat.label}
                value={stat.value}
                note={stat.note}
                icon={patientIconFor(stat.label, stat.className)}
                className={stat.className}
              />
            ))}
          </section>

          <article className="panel optometrist-records-directory-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Patient Records</p>
                <h3>Branch records table</h3>
                <p className="muted-copy">
                  Browse the current branch in table form and open the full patient record in a popup modal by clicking any row.
                </p>
              </div>
              <span className="panel-tag">{patientData?.pagination?.total ?? records.length} records</span>
            </div>

            <form
              className="patient-filter-grid"
              onSubmit={(event) => {
                event.preventDefault()
                setPatientQuery((current) => ({ ...current, ...patientFilters, page: 1 }))
              }}
            >
              <Field label="Search">
                <input
                  value={patientFilters.search}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Live search by folder ID, name, phone, or email"
                />
              </Field>
              <Field label="Status">
                <select
                  value={patientFilters.status}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="all">All</option>
                  {(patientMeta?.statuses ?? ['pending', 'seen']).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Purpose">
                <select
                  value={patientFilters.purpose}
                  onChange={(event) => setPatientFilters((current) => ({ ...current, purpose: event.target.value }))}
                >
                  <option value="all">All purposes</option>
                  {(patientMeta?.purposes ?? []).map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="filter-actions-row full-span">
                <button type="submit" className="primary-button">Apply filters</button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setPatientFilters(defaultFilters)
                    setPatientQuery(defaultFilters)
                  }}
                >
                  Reset
                </button>
              </div>
            </form>

            {isLoadingPatients && !patientData ? <p className="muted-copy">Loading patient records...</p> : null}

            <div className="table-shell optometrist-records-table-shell">
              <table className="portal-table optometrist-records-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Folder ID</th>
                    <th>Phone</th>
                    <th>Purpose</th>
                    <th>Appointment</th>
                    <th>Assigned Optometrist</th>
                    <th>Status</th>
                    <th>Visit Date</th>
                  </tr>
                </thead>
                <tbody>
                  {queueRecords.length ? (
                    queueRecords.map((record) => (
                      <tr
                        key={record.id}
                        className="clickable-table-row"
                        onClick={() => {
                          setSelectedPatientId(record.id)
                          setRecordsModalPatient(record)
                        }}
                      >
                        <td>
                          <div className="patient-table-primary">
                            <strong>{record.patient_name || record.name}</strong>
                            <span>{record.sex || 'N/A'} / {record.age || 'N/A'} yrs</span>
                          </div>
                        </td>
                        <td>{record.folder_id}</td>
                        <td>{record.phone || 'No phone'}</td>
                        <td>{record.purpose || 'Consultation'}</td>
                        <td>{record.appointment_date || 'Not scheduled'}</td>
                        <td>{record.assigned_optometrist_name || 'Not assigned'}</td>
                        <td><span className={`status-pill status-${record.status}`}>{record.status}</span></td>
                        <td>{record.date || 'Not captured'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8">
                        <p className="muted-copy">No patient records matched the current filters.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {patientData ? (
              <div className="pagination-bar">
                <span>
                  Page {patientData.pagination.page} of {Math.max(patientData.pagination.total_pages, 1)}
                </span>
                <div className="pagination-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={patientData.pagination.page <= 1}
                    onClick={() => changePatientPage(patientData.pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={patientData.pagination.page >= patientData.pagination.total_pages}
                    onClick={() => changePatientPage(patientData.pagination.page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        </section>
        {recordsModalPatient ? (
          <PatientRecordsModal
            patient={recordsModalPatient}
            onClose={() => setRecordsModalPatient(null)}
            setActiveView={(view) => {
              setActiveView(view)
              setRecordsModalPatient(null)
            }}
            openExamModal={(patient) => {
              setRecordsModalPatient(null)
              openExamModal(patient)
            }}
            openExamWorkspace={(patient, originView) => {
              setRecordsModalPatient(null)
              openExamWorkspace(patient, originView)
            }}
            fetchPatientPrescriptions={fetchPatientPrescriptions}
            fetchPatientExamForm={fetchPatientExamForm}
          />
        ) : null}
        {examModalPatient ? (
          <PatientExamModal
            patient={examModalPatient}
            initialFormId={examModalFormId}
            onClose={() => {
              setExamModalPatient(null)
              setExamModalFormId(null)
            }}
            fetchPatientExamForm={fetchPatientExamForm}
            savePatientExamForm={savePatientExamForm}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <section className="patients-section">
        <div className="patients-header">
          <div>
            <p className="eyebrow">{header.eyebrow}</p>
            <h3>{header.title}</h3>
            <p className="header-copy">{header.copy}</p>
          </div>
        </div>

        <section className="stats-grid patient-stats-grid">
          {patientStats.map((stat) => (
            <StatWidget
              key={stat.label}
              label={stat.label}
              value={stat.value}
              note={stat.note}
              icon={patientIconFor(stat.label, stat.className)}
              className={stat.className}
            />
          ))}
        </section>

        <div className="optometrist-patient-layout">
        <article className="panel optometrist-patient-directory">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Patient Browser</p>
              <h3>{activeView === 'Patient Records' ? 'Record directory' : 'Branch patient directory'}</h3>
              <p className="muted-copy">
                {activeView === 'Patient Management'
                  ? 'Search updates live across every patient record in the current branch.'
                  : 'Choose a patient first, then continue in the full workspace below.'}
              </p>
            </div>
            <span className="panel-tag">{patientData?.pagination?.total ?? records.length} patients</span>
          </div>

          <form
            className="patient-filter-grid"
            onSubmit={(event) => {
              event.preventDefault()
              setPatientQuery((current) => ({ ...current, ...patientFilters, page: 1 }))
            }}
          >
            <Field label="Search">
              <input
                value={patientFilters.search}
                onChange={(event) => {
                  const nextSearch = event.target.value
                  setPatientFilters((current) => ({ ...current, search: nextSearch }))
                  if (activeView === 'Patient Review') {
                    setPatientQuery((current) => ({ ...current, ...patientFilters, search: nextSearch, page: 1 }))
                  }
                }}
                placeholder="Live search by folder ID, name, phone, or email"
              />
            </Field>
            {activeView !== 'Patient Review' ? (
            <Field label="Status">
              <select
                value={patientFilters.status}
                onChange={(event) => setPatientFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="all">All</option>
                {(patientMeta?.statuses ?? ['pending', 'seen']).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            ) : null}
            {activeView !== 'Patient Review' ? (
            <Field label="Purpose">
              <select
                value={patientFilters.purpose}
                onChange={(event) => setPatientFilters((current) => ({ ...current, purpose: event.target.value }))}
              >
                <option value="all">All purposes</option>
                {(patientMeta?.purposes ?? []).map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </Field>
            ) : null}
            {activeView !== 'Patient Review' ? (
            <div className="filter-actions-row full-span">
              <button type="submit" className="primary-button">Apply filters</button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setPatientFilters(defaultFilters)
                  setPatientQuery(defaultFilters)
                }}
              >
                Reset
              </button>
            </div>
            ) : null}
          </form>

          {isLoadingPatients && !patientData ? <p className="muted-copy">Loading patient workspace...</p> : null}

          <div className="optometrist-patient-list">
            {queueRecords.map((record) => {
              const isSelected = String(record.id) === String(selectedPatientId)
              return (
                <article
                  key={record.id}
                  className={`optometrist-patient-card ${isSelected ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="optometrist-patient-card-main"
                    onClick={() => {
                      if (activeView === 'Patient Review') {
                        openReviewModal(record)
                        return
                      }
                      if (activeView === 'Patient Uploads') {
                        openUploadsModal(record)
                        return
                      }
                      setSelectedPatientId(record.id)
                    }}
                  >
                    <div className="optometrist-patient-card-top">
                      <div>
                        <strong>{record.patient_name || record.name}</strong>
                        <span>{record.folder_id}</span>
                      </div>
                      <span className={`status-pill status-${record.status}`}>{record.status}</span>
                    </div>
                    <div className="patient-record-meta">
                      <span>{record.sex || 'N/A'} / {record.age || 'N/A'} yrs</span>
                      <span>{record.phone || 'No phone'}</span>
                      <span>{record.purpose || 'Consultation'}</span>
                      <span>{record.appointment_date || 'No appointment'}</span>
                    </div>
                  </button>
                  {activeView === 'Patient Management' ? (
                    <div className="optometrist-patient-card-actions">
                      <button
                        type="button"
                        className="ghost-button patient-management-action-button"
                        onClick={() => openPrescriptionModal(record)}
                      >
                        Prescriptions
                      </button>
                      <button
                        type="button"
                        className="ghost-button patient-management-action-button"
                        onClick={() => openPrescriptionModal(record)}
                      >
                        Prescription
                      </button>
                      <button
                        type="button"
                        className="ghost-button patient-management-action-button"
                        onClick={() => {
                          openUploadsModal(record)
                        }}
                      >
                        Uploads
                      </button>
                      <button
                        type="button"
                        className="ghost-button patient-management-action-button"
                        onClick={() => {
                          openReviewModal(record)
                        }}
                      >
                        Patient Review
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>

          {patientData ? (
            <div className="pagination-bar">
              <span>
                Page {patientData.pagination.page} of {Math.max(patientData.pagination.total_pages, 1)}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={patientData.pagination.page <= 1}
                  onClick={() => changePatientPage(patientData.pagination.page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={patientData.pagination.page >= patientData.pagination.total_pages}
                  onClick={() => changePatientPage(patientData.pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel optometrist-patient-focus">
          {activeView === 'Patient Review' ? (
            <div className="empty-state-panel">
              <p className="eyebrow">Patient Review</p>
              <h3>Click any patient card to open the review popup</h3>
              <p className="muted-copy">The selected patient will open directly in the full review modal for focused clinical review.</p>
            </div>
          ) : activeView === 'Patient Uploads' ? (
            <div className="empty-state-panel">
              <p className="eyebrow">Patient Uploads</p>
              <h3>Click any patient card to open the uploads popup</h3>
              <p className="muted-copy">The clicked patient will open in the uploads modal so you can add or review files immediately.</p>
            </div>
          ) : !selectedPatient ? (
            <div className="empty-state-panel">
              <p className="eyebrow">No patient selected</p>
              <h3>Pick a patient from the list</h3>
              <p className="muted-copy">The selected route opens here as a full-width workspace once a patient is chosen.</p>
            </div>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{activeView}</p>
                  <h3>{selectedPatient.patient_name || selectedPatient.name}</h3>
                  <p className="muted-copy">{selectedPatient.folder_id} • {selectedPatient.phone || 'No phone on file'}</p>
                </div>
                <span className={`status-pill status-${selectedStatusTone}`}>{selectedPatient.status}</span>
              </div>

              <div className="optometrist-patient-summary">
                <div className="summary-tile">
                  <span>Purpose</span>
                  <strong>{selectedPatient.purpose || 'Consultation'}</strong>
                </div>
                <div className="summary-tile">
                  <span>Appointment</span>
                  <strong>{selectedPatient.appointment_date || 'Not scheduled'}</strong>
                </div>
                <div className="summary-tile">
                  <span>Assigned Optometrist</span>
                  <strong>{selectedPatient.assigned_optometrist_name || 'Not assigned'}</strong>
                </div>
                <div className="summary-tile">
                  <span>Visit Date</span>
                  <strong>{selectedPatient.date || 'No visit date'}</strong>
                </div>
              </div>

              {activeView === 'Patient Management' ? (
                <OptometristManagementView
                  record={selectedPatient}
                  setActiveView={setActiveView}
                  openPatientWorkspace={openPatientWorkspace}
                  openExamModal={openExamModal}
                  updatePatientDetails={updatePatientDetails}
                  fetchPatientPrescriptions={fetchPatientPrescriptions}
                />
              ) : null}

              {activeView === 'Prescription Reference' ? (
                <PatientPrescriptionReferenceView
                  record={selectedPatient}
                  fetchPatientPrescriptions={fetchPatientPrescriptions}
                />
              ) : null}

              {activeView === 'Prescriptions' ? (
                <PatientPrescriptionsView
                  record={selectedPatient}
                  setActiveView={setActiveView}
                  fetchPatientPrescriptions={fetchPatientPrescriptions}
                />
              ) : null}

              {activeView === 'Prescription' ? (
                <PatientPrescriptionWorkspace
                  patient={selectedPatient}
                  companyProfile={companyProfile}
                  fetchPatientPrescriptions={fetchPatientPrescriptions}
                  fetchPatientExamForm={fetchPatientExamForm}
                  addPatientPrescription={addPatientPrescription}
                  fetchPatientDocuments={fetchPatientDocuments}
                  uploadPatientDocuments={uploadPatientDocuments}
                />
              ) : null}

              {activeView === 'Patient Review' ? (
                <OptometristReviewView
                  record={selectedPatient}
                  setActiveView={setActiveView}
                  setSelectedPatientId={setSelectedPatientId}
                  patientLookupSearch={patientLookupSearch}
                  setPatientLookupSearch={setPatientLookupSearch}
                  patientLookupResults={patientLookupResults}
                  isSearchingPatientLookup={isSearchingPatientLookup}
                  fetchPatientPrescriptions={fetchPatientPrescriptions}
                  addPatientPrescription={addPatientPrescription}
                  fetchMedicalReport={fetchMedicalReport}
                  openExamModal={openExamModal}
                />
              ) : null}

              {activeView === 'Patient Form' ? (
                <OptometristFormView
                  record={selectedPatient}
                  setActiveView={setActiveView}
                  setSelectedPatientId={setSelectedPatientId}
                  patientLookupSearch={patientLookupSearch}
                  setPatientLookupSearch={setPatientLookupSearch}
                  patientLookupResults={patientLookupResults}
                  isSearchingPatientLookup={isSearchingPatientLookup}
                  openExamModal={openExamModal}
                />
              ) : null}

              {activeView === 'Patient Records' ? (
                <OptometristRecordsView
                  record={selectedPatient}
                  setActiveView={setActiveView}
                  openExamModal={openExamModal}
                  openExamWorkspace={openExamWorkspace}
                  fetchPatientPrescriptions={fetchPatientPrescriptions}
                  fetchPatientExamForm={fetchPatientExamForm}
                />
              ) : null}

              {activeView === 'Patient Uploads' ? (
                <OptometristUploadsView
                  record={selectedPatient}
                  fetchPatientDocuments={fetchPatientDocuments}
                  uploadPatientDocuments={uploadPatientDocuments}
                />
              ) : null}
            </>
          )}
        </article>
        </div>
      </section>
      {examModalPatient ? (
        <PatientExamModal
          patient={examModalPatient}
          initialFormId={examModalFormId}
          onClose={() => {
            setExamModalPatient(null)
            setExamModalFormId(null)
          }}
          fetchPatientExamForm={fetchPatientExamForm}
          savePatientExamForm={savePatientExamForm}
        />
      ) : null}
      {prescriptionModalPatient ? (
        <PatientPrescriptionModal
          patient={prescriptionModalPatient}
          onClose={() => setPrescriptionModalPatient(null)}
          companyProfile={companyProfile}
          fetchPatientPrescriptions={fetchPatientPrescriptions}
          fetchPatientExamForm={fetchPatientExamForm}
          addPatientPrescription={addPatientPrescription}
          fetchPatientDocuments={fetchPatientDocuments}
          uploadPatientDocuments={uploadPatientDocuments}
        />
      ) : null}
      {reviewModalPatient ? (
        <PatientReviewModal
          patient={reviewModalPatient}
          onClose={() => setReviewModalPatient(null)}
          setActiveView={setActiveView}
          setSelectedPatientId={setSelectedPatientId}
          patientLookupSearch={patientLookupSearch}
          setPatientLookupSearch={setPatientLookupSearch}
          patientLookupResults={patientLookupResults}
          isSearchingPatientLookup={isSearchingPatientLookup}
          fetchPatientPrescriptions={fetchPatientPrescriptions}
          addPatientPrescription={addPatientPrescription}
          fetchMedicalReport={fetchMedicalReport}
          openExamModal={openExamModal}
        />
      ) : null}
      {uploadsModalPatient ? (
        <PatientUploadsModal
          patient={uploadsModalPatient}
          onClose={() => setUploadsModalPatient(null)}
          fetchPatientDocuments={fetchPatientDocuments}
          uploadPatientDocuments={uploadPatientDocuments}
        />
      ) : null}
    </>
  )
}

function OptometristManagementView({
  record,
  setActiveView,
  openPatientWorkspace,
  openExamModal,
  updatePatientDetails,
  fetchPatientPrescriptions,
  showReference = true,
}) {
  const [editForm, setEditForm] = useState(() => createPatientEditForm(record))
  const [isSaving, setIsSaving] = useState(false)
  const [prescriptions, setPrescriptions] = useState([])
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(false)
  const [localMessage, setLocalMessage] = useState('')

  useEffect(() => {
    setEditForm(createPatientEditForm(record))
    setLocalMessage('')
  }, [record])

  useEffect(() => {
    let cancelled = false
    setIsLoadingPrescriptions(true)

    fetchPatientPrescriptions(record.id)
      .then((response) => {
        if (!cancelled) {
          setPrescriptions(response.prescriptions ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPrescriptions([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPrescriptions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [fetchPatientPrescriptions, record.id])

  async function handleSave(event) {
    event.preventDefault()
    setIsSaving(true)
    setLocalMessage('')

    try {
      await updatePatientDetails(record.id, editForm)
      setLocalMessage('Patient details updated.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="optometrist-workspace-stack">
      <form className="optometrist-workspace-card optometrist-management-form" onSubmit={handleSave}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Patient Management</p>
            <h4>Edit patient details</h4>
            <p className="muted-copy">Update the core patient profile here, then jump straight into review or examination.</p>
          </div>
          <span className="panel-tag">{record.folder_id}</span>
        </div>

        <div className="optometrist-inline-actions">
          <button
            type="button"
            className="ghost-button patient-management-action-button"
            onClick={() => (openPatientWorkspace ? openPatientWorkspace(record, 'Prescriptions') : setActiveView('Prescriptions'))}
          >
            Prescriptions
          </button>
          <button
            type="button"
            className="ghost-button patient-management-action-button"
            onClick={() => (openPatientWorkspace ? openPatientWorkspace(record, 'Patient Form') : setActiveView('Patient Form'))}
          >
            Patient Form
          </button>
          <button
            type="button"
            className="ghost-button patient-management-action-button"
            onClick={() => (openPatientWorkspace ? openPatientWorkspace(record, 'Patient Review') : setActiveView('Patient Review'))}
          >
            Patient Review
          </button>
        </div>

        <div className="optometrist-exam-grid">
          <Field label="Surname">
            <input value={editForm.surname} onChange={(e) => setEditForm((current) => ({ ...current, surname: e.target.value }))} />
          </Field>
          <Field label="First Name">
            <input value={editForm.firstname} onChange={(e) => setEditForm((current) => ({ ...current, firstname: e.target.value }))} />
          </Field>
          <Field label="Other Names">
            <input value={editForm.othernames} onChange={(e) => setEditForm((current) => ({ ...current, othernames: e.target.value }))} />
          </Field>
          <Field label="Sex">
            <select value={editForm.sex} onChange={(e) => setEditForm((current) => ({ ...current, sex: e.target.value }))}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </Field>
          <Field label="Date Of Birth">
            <input type="date" value={editForm.dob} onChange={(e) => setEditForm((current) => ({ ...current, dob: e.target.value }))} />
          </Field>
          <Field label="Age">
            <input type="number" value={editForm.age} onChange={(e) => setEditForm((current) => ({ ...current, age: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <input value={editForm.phone} onChange={(e) => setEditForm((current) => ({ ...current, phone: e.target.value }))} />
          </Field>
          <Field label="Email">
            <input value={editForm.email} onChange={(e) => setEditForm((current) => ({ ...current, email: e.target.value }))} />
          </Field>
          <Field label="Address">
            <input value={editForm.address} onChange={(e) => setEditForm((current) => ({ ...current, address: e.target.value }))} />
          </Field>
          <Field label="Residence">
            <input value={editForm.residence} onChange={(e) => setEditForm((current) => ({ ...current, residence: e.target.value }))} />
          </Field>
          <Field label="Purpose">
            <input value={editForm.purpose} onChange={(e) => setEditForm((current) => ({ ...current, purpose: e.target.value }))} />
          </Field>
          <Field label="Appointment Date">
            <input type="date" value={editForm.appointment_date} onChange={(e) => setEditForm((current) => ({ ...current, appointment_date: e.target.value }))} />
          </Field>
          <Field label="Notes" className="full-span">
            <textarea rows="4" value={editForm.comment} onChange={(e) => setEditForm((current) => ({ ...current, comment: e.target.value }))} />
          </Field>
        </div>

        <div className="optometrist-inline-actions">
          <button type="submit" className="primary-button" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Patient Details'}
          </button>
          {localMessage ? <span className="panel-tag">{localMessage}</span> : null}
        </div>
      </form>

      {showReference ? (
        <PrescriptionReferencePanel
          prescriptions={prescriptions}
          isLoadingPrescriptions={isLoadingPrescriptions}
        />
      ) : null}
    </div>
  )
}

function PrescriptionReferencePanel({ prescriptions, isLoadingPrescriptions }) {
  return (
    <div className="optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Prescription Reference</p>
            <h4>Older prescriptions for this patient</h4>
          </div>
          <span className="panel-tag">{prescriptions.length} found</span>
        </div>
        {isLoadingPrescriptions ? (
          <p className="muted-copy">Loading prescription history...</p>
        ) : prescriptions.length ? (
          <div className="optometrist-prescription-history">
            {prescriptions.map((item) => (
              <article key={`${item.prescription_id}-${item.patient_id}`} className="optometrist-prescription-card">
                <div className="patient-record-top">
                  <div>
                    <strong>{item.date || 'No date'}</strong>
                    <span>{item.lens_type || 'Lens type not set'} • {item.status || 'pending'}</span>
                  </div>
                  <span className="status-pill status-seen">{item.prescription_id}</span>
                </div>
                <div className="patient-record-meta">
                  <span>OD: {item.sph_od || 'Plano'} / {item.cyl_od || '0.00'} x {item.axis_od || '-'}</span>
                  <span>OS: {item.sph_os || 'Plano'} / {item.cyl_os || '0.00'} x {item.axis_os || '-'}</span>
                  <span>Add: {item.add_od || '-'} / {item.add_os || '-'}</span>
                  <span>IPD: {item.ipd || 'N/A'}</span>
                </div>
                <p className="muted-copy">{item.notes || 'No prescription notes saved.'}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No older prescriptions were found for this patient in the current branch.</p>
        )}
      </div>
  )
}

function PatientPrescriptionReferenceView({ record, fetchPatientPrescriptions }) {
  const [prescriptions, setPrescriptions] = useState([])
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoadingPrescriptions(true)

    fetchPatientPrescriptions(record.id)
      .then((response) => {
        if (!cancelled) {
          setPrescriptions(response.prescriptions ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPrescriptions([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPrescriptions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [fetchPatientPrescriptions, record.id])

  return (
    <PrescriptionReferencePanel
      prescriptions={prescriptions}
      isLoadingPrescriptions={isLoadingPrescriptions}
    />
  )
}

function PatientPrescriptionsView({ record, setActiveView, fetchPatientPrescriptions }) {
  const [prescriptions, setPrescriptions] = useState([])
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoadingPrescriptions(true)

    fetchPatientPrescriptions(record.id)
      .then((response) => {
        if (!cancelled) {
          setPrescriptions(response.prescriptions ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPrescriptions([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPrescriptions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [fetchPatientPrescriptions, record.id])

  const sortedPrescriptions = useMemo(
    () => [...prescriptions].sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime()),
    [prescriptions],
  )

  return (
    <div className="optometrist-workspace-stack">
      <div className="optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Prescriptions</p>
            <h4>Saved prescriptions for this patient</h4>
            <p className="muted-copy">Review the patient&apos;s saved prescription history, then jump into the full prescription workspace when you need to print, edit, or upload attachments.</p>
          </div>
          <div className="optometrist-inline-actions">
            <span className="panel-tag">{sortedPrescriptions.length} records</span>
            <button type="button" className="primary-button" onClick={() => setActiveView('Prescription')}>
              Open Prescription Workspace
            </button>
          </div>
        </div>

        {isLoadingPrescriptions ? (
          <p className="muted-copy">Loading saved prescriptions...</p>
        ) : sortedPrescriptions.length ? (
          <div className="optometrist-prescription-history">
            {sortedPrescriptions.map((item) => (
              <article key={`${item.prescription_id}-${item.date}-${item.patient_id}`} className="optometrist-prescription-card">
                <div className="patient-record-top">
                  <div>
                    <strong>{item.date || 'No date'}</strong>
                    <span>{item.lens_type || 'Lens type not set'} • {item.status || 'pending'}</span>
                  </div>
                  <span className="status-pill status-seen">{item.prescription_id || 'Saved'}</span>
                </div>
                <div className="patient-record-meta">
                  <span>OD: {item.sph_od || 'Plano'} / {item.cyl_od || '0.00'} x {item.axis_od || '-'}</span>
                  <span>OS: {item.sph_os || 'Plano'} / {item.cyl_os || '0.00'} x {item.axis_os || '-'}</span>
                  <span>Add: {item.add_od || '-'} / {item.add_os || '-'}</span>
                  <span>IPD: {item.ipd || 'N/A'}</span>
                </div>
                <p className="muted-copy">{item.notes || 'No prescription notes saved.'}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No saved prescriptions were found for this patient yet.</p>
        )}
      </div>

      <PrescriptionReferencePanel
        prescriptions={sortedPrescriptions}
        isLoadingPrescriptions={isLoadingPrescriptions}
      />
    </div>
  )
}

function PrescriptionReferenceModal({ patient, onClose, fetchPatientPrescriptions }) {
  const [prescriptions, setPrescriptions] = useState([])
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoadingPrescriptions(true)

    fetchPatientPrescriptions(patient.id)
      .then((response) => {
        if (!cancelled) {
          setPrescriptions(response.prescriptions ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPrescriptions([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPrescriptions(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [fetchPatientPrescriptions, patient.id])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel patient-management-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Prescription Reference</p>
            <h3>{patient.patient_name || patient.name}</h3>
            <p className="muted-copy">{patient.folder_id} â€¢ {patient.phone || 'No phone on file'}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <PrescriptionReferencePanel
          prescriptions={prescriptions}
          isLoadingPrescriptions={isLoadingPrescriptions}
        />
      </article>
    </div>
  )
}

function PatientManagementModal({
  patient,
  onClose,
  setActiveView,
  openExamModal,
  updatePatientDetails,
  fetchPatientPrescriptions,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel patient-management-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Patient Management</p>
            <h3>{patient.patient_name || patient.name}</h3>
            <p className="muted-copy">{patient.folder_id} â€¢ {patient.phone || 'No phone on file'}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <OptometristManagementView
          record={patient}
          setActiveView={setActiveView}
          openExamModal={openExamModal}
          updatePatientDetails={updatePatientDetails}
          fetchPatientPrescriptions={fetchPatientPrescriptions}
          showReference={false}
        />
      </article>
    </div>
  )
}

function OptometristReviewView({
  record,
  setActiveView,
  setSelectedPatientId,
  patientLookupSearch,
  setPatientLookupSearch,
  patientLookupResults,
  isSearchingPatientLookup,
  fetchPatientPrescriptions,
  addPatientPrescription,
  fetchMedicalReport,
  openExamModal,
  showPatientLookup = true,
}) {
  const [prescriptions, setPrescriptions] = useState([])
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(false)
  const [medicalReport, setMedicalReport] = useState(null)
  const [isLoadingMedicalReport, setIsLoadingMedicalReport] = useState(false)
  const [newPrescription, setNewPrescription] = useState(defaultNewPrescription())
  const [isSavingPrescription, setIsSavingPrescription] = useState(false)
  const [localMessage, setLocalMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setIsLoadingPrescriptions(true)
    setIsLoadingMedicalReport(true)
    setLocalMessage('')
    setNewPrescription(defaultNewPrescription())

    fetchPatientPrescriptions(record.id)
      .then((response) => {
        if (!cancelled) {
          setPrescriptions(response.prescriptions ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) setPrescriptions([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPrescriptions(false)
      })

    fetchMedicalReport(record.id)
      .then((response) => {
        if (!cancelled) {
          setMedicalReport(response)
        }
      })
      .catch(() => {
        if (!cancelled) setMedicalReport(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMedicalReport(false)
      })

    return () => {
      cancelled = true
    }
  }, [fetchMedicalReport, fetchPatientPrescriptions, record.id])

  async function handleAddPrescription(event) {
    event.preventDefault()
    setLocalMessage('')
    setIsSavingPrescription(true)

    try {
      await addPatientPrescription(record.id, newPrescription)
      const refreshed = await fetchPatientPrescriptions(record.id)
      setPrescriptions(refreshed.prescriptions ?? [])
      setNewPrescription(defaultNewPrescription())
      setLocalMessage('New prescription saved successfully.')
    } catch (error) {
      setLocalMessage(error.message || 'Could not save prescription.')
    } finally {
      setIsSavingPrescription(false)
    }
  }

  return (
    <div className="optometrist-workspace-stack">
      {showPatientLookup ? (
      <div className="optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Live Patient Search</p>
            <h4>Switch to any existing patient instantly</h4>
          </div>
        </div>
        <label className="patient-search-shell">
          <span className="patient-search-icon" aria-hidden="true">⌕</span>
          <input
            value={patientLookupSearch}
            onChange={(event) => setPatientLookupSearch(event.target.value)}
            placeholder="Search by folder ID, patient name, phone, or email"
          />
          <span className="patient-search-hint">live search</span>
        </label>
        {patientLookupSearch.trim().length >= 2 ? (
          isSearchingPatientLookup ? (
            <p className="muted-copy">Searching existing patients...</p>
          ) : patientLookupResults.length ? (
            <div className="optometrist-modal-search-results">
              {patientLookupResults.slice(0, 8).map((candidate) => (
                <button
                  key={`review-switch-${candidate.id}`}
                  type="button"
                  className="optometrist-modal-search-card"
                  onClick={() => {
                    setSelectedPatientId(candidate.id)
                    setPatientLookupSearch('')
                  }}
                >
                  <div>
                    <strong>{candidate.patient_name || candidate.name}</strong>
                    <span>{candidate.folder_id}</span>
                  </div>
                  <div className="stack-meta">
                    <strong>{candidate.phone || 'No phone'}</strong>
                    <span>{candidate.status || 'pending'}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No matching patient found in this branch.</p>
          )
        ) : null}
      </div>
      ) : null}

      <div className="optometrist-workspace-card">
        <p className="eyebrow">Review Snapshot</p>
        <h4>Clinical context before continuing care</h4>
        <div className="optometrist-checklist">
          <div><span>Status</span><strong>{record.status}</strong></div>
          <div><span>Purpose</span><strong>{record.purpose || 'Consultation'}</strong></div>
          <div><span>Last visit</span><strong>{record.date || 'Not recorded'}</strong></div>
          <div><span>Assigned</span><strong>{record.assigned_optometrist_name || 'Not assigned'}</strong></div>
        </div>
      </div>

      <div className="optometrist-details-grid">
        <div className="optometrist-workspace-card">
          <p className="eyebrow">Identity And Access</p>
          <h4>Patient and contact sheet</h4>
          <div className="optometrist-checklist">
            <div><span>Folder ID</span><strong>{record.folder_id}</strong></div>
            <div><span>Phone</span><strong>{record.phone || 'No phone'}</strong></div>
            <div><span>Email</span><strong>{record.email || 'No email'}</strong></div>
            <div><span>Residence</span><strong>{record.residence || record.address || 'Not recorded'}</strong></div>
          </div>
        </div>
        <div className="optometrist-workspace-card">
          <p className="eyebrow">Stored Notes</p>
          <h4>Database comment field</h4>
          <div className="optometrist-note-sheet">
            <pre>{record.comment?.trim() || 'No clinical or intake notes have been stored for this patient yet.'}</pre>
          </div>
        </div>
      </div>

      <div className="optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Past Medical Records</p>
            <h4>Latest form and previous versions</h4>
          </div>
        </div>
        {isLoadingMedicalReport ? (
          <p className="muted-copy">Loading medical record history...</p>
        ) : medicalReport?.form_versions?.length ? (
          <div className="optometrist-prescription-history">
            {medicalReport.form_versions.map((version) => (
              <article key={`medical-version-${version.version}`} className="optometrist-prescription-card">
                <div className="patient-record-top">
                  <div>
                    <strong>Version {version.version}</strong>
                    <span>{version.updated_at || 'No update date'}</span>
                  </div>
                  <span className={`status-pill status-${String(version.status || '').toLowerCase()}`}>{version.status || 'draft'}</span>
                </div>
                <p className="muted-copy"><strong>Chief Complaint:</strong> {version.summary?.chief_complaint || 'N/A'}</p>
                <p className="muted-copy"><strong>Diagnosis:</strong> {version.summary?.diagnosis || 'N/A'}</p>
                <div className="optometrist-inline-actions">
                  <button type="button" className="ghost-button" onClick={() => openExamModal?.(record, { formId: version.id })}>
                    Use As Reference
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No saved medical form versions were found for this patient.</p>
        )}
      </div>

      <div className="optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Prescription History</p>
            <h4>Past prescriptions for this patient</h4>
          </div>
          <span className="panel-tag">{prescriptions.length} records</span>
        </div>
        {isLoadingPrescriptions ? (
          <p className="muted-copy">Loading prescription history...</p>
        ) : prescriptions.length ? (
          <div className="optometrist-prescription-history">
            {prescriptions.map((item) => (
              <article key={`${item.prescription_id}-${item.patient_id}`} className="optometrist-prescription-card">
                <div className="patient-record-top">
                  <div>
                    <strong>{item.date || 'No date'}</strong>
                    <span>{item.lens_type || 'Lens type not set'} • {item.status || 'pending'}</span>
                  </div>
                  <span className="status-pill status-seen">{item.prescription_id}</span>
                </div>
                <div className="patient-record-meta">
                  <span>OD: {item.sph_od || 'Plano'} / {item.cyl_od || '0.00'} x {item.axis_od || '-'}</span>
                  <span>OS: {item.sph_os || 'Plano'} / {item.cyl_os || '0.00'} x {item.axis_os || '-'}</span>
                  <span>Add: {item.add_od || '-'} / {item.add_os || '-'}</span>
                  <span>IPD: {item.ipd || 'N/A'}</span>
                </div>
                <p className="muted-copy">{item.notes || 'No prescription notes saved.'}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No older prescriptions were found for this patient in the current branch.</p>
        )}
      </div>

      <form className="optometrist-workspace-card optometrist-management-form" onSubmit={handleAddPrescription}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Add New Prescription</p>
            <h4>Save a new glasses prescription from review</h4>
          </div>
        </div>
        <div className="optometrist-exam-grid">
          <Field label="Date" required>
            <input
              type="date"
              value={newPrescription.date}
              onChange={(event) => setNewPrescription((current) => ({ ...current, date: event.target.value }))}
              required
            />
          </Field>
          <Field label="IPD">
            <input value={newPrescription.ipd} onChange={(event) => setNewPrescription((current) => ({ ...current, ipd: event.target.value }))} />
          </Field>
          <Field label="OD SPH"><input value={newPrescription.sph_od} onChange={(event) => setNewPrescription((current) => ({ ...current, sph_od: event.target.value }))} /></Field>
          <Field label="OD CYL"><input value={newPrescription.cyl_od} onChange={(event) => setNewPrescription((current) => ({ ...current, cyl_od: event.target.value }))} /></Field>
          <Field label="OD AXIS"><input value={newPrescription.axis_od} onChange={(event) => setNewPrescription((current) => ({ ...current, axis_od: event.target.value }))} /></Field>
          <Field label="OD ADD"><input value={newPrescription.add_od} onChange={(event) => setNewPrescription((current) => ({ ...current, add_od: event.target.value }))} /></Field>
          <Field label="OS SPH"><input value={newPrescription.sph_os} onChange={(event) => setNewPrescription((current) => ({ ...current, sph_os: event.target.value }))} /></Field>
          <Field label="OS CYL"><input value={newPrescription.cyl_os} onChange={(event) => setNewPrescription((current) => ({ ...current, cyl_os: event.target.value }))} /></Field>
          <Field label="OS AXIS"><input value={newPrescription.axis_os} onChange={(event) => setNewPrescription((current) => ({ ...current, axis_os: event.target.value }))} /></Field>
          <Field label="OS ADD"><input value={newPrescription.add_os} onChange={(event) => setNewPrescription((current) => ({ ...current, add_os: event.target.value }))} /></Field>
          <Field label="Lens Type">
            <select value={newPrescription.lens_type} onChange={(event) => setNewPrescription((current) => ({ ...current, lens_type: event.target.value }))}>
              <option value="">Select lens type</option>
              {LENS_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="Lens Material">
            <select value={newPrescription.lens_material} onChange={(event) => setNewPrescription((current) => ({ ...current, lens_material: event.target.value }))}>
              <option value="">Select lens material</option>
              {LENS_MATERIAL_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="Color">
            <select value={newPrescription.color} onChange={(event) => setNewPrescription((current) => ({ ...current, color: event.target.value }))}>
              <option value="">Select color</option>
              {FRAME_COLOR_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="full-span">
            <textarea rows="3" value={newPrescription.notes} onChange={(event) => setNewPrescription((current) => ({ ...current, notes: event.target.value }))} />
          </Field>
        </div>
        <div className="optometrist-inline-actions">
          <button type="submit" className="primary-button" disabled={isSavingPrescription}>
            {isSavingPrescription ? 'Saving...' : 'Save Prescription'}
          </button>
          {localMessage ? <span className="panel-tag">{localMessage}</span> : null}
        </div>
      </form>

      <div className="optometrist-inline-actions">
        <button type="button" className="primary-button" onClick={() => setActiveView('Patient Form')}>
          Continue to Patient Form
        </button>
        <button type="button" className="ghost-button patient-management-action-button" onClick={() => setActiveView('Patient Records')}>
          View Patient Record
        </button>
        <button type="button" className="ghost-button patient-management-action-button" onClick={() => setActiveView('Medical Report')}>
          Open Medical Report
        </button>
      </div>
    </div>
  )
}

function OptometristFormView({
  record,
  setActiveView,
  setSelectedPatientId,
  patientLookupSearch,
  setPatientLookupSearch,
  patientLookupResults,
  isSearchingPatientLookup,
  openExamModal,
}) {
  return (
    <div className="optometrist-workspace-stack">
      <div className="optometrist-workspace-card">
        <p className="eyebrow">Patient Form</p>
        <h4>Search a patient and launch the examination popup immediately</h4>
        <p className="muted-copy">
          Start typing a patient name and open the tabbed exam form without scrolling through the page. The search runs live against the current branch database.
        </p>
        <label className="patient-search-shell">
          <span className="patient-search-icon" aria-hidden="true">⌕</span>
          <input
            value={patientLookupSearch}
            onChange={(event) => setPatientLookupSearch(event.target.value)}
            placeholder="Type patient name, folder ID, phone, or email"
          />
          <span className="patient-search-hint">live search</span>
        </label>

        {patientLookupSearch.trim() ? (
          <div className="optometrist-modal-search-results">
            {isSearchingPatientLookup ? (
              <p className="muted-copy">Searching patients in this branch...</p>
            ) : patientLookupResults.length ? (
              patientLookupResults.map((candidate) => (
                <button
                  key={`exam-launch-${candidate.id}`}
                  type="button"
                  className="optometrist-modal-search-card"
                  onClick={() => {
                    openExamModal(candidate)
                  }}
                >
                  <div>
                    <strong>{candidate.patient_name || candidate.name}</strong>
                    <span>{candidate.folder_id}</span>
                  </div>
                  <div className="stack-meta">
                    <strong>{candidate.purpose || 'Consultation'}</strong>
                    <span>{candidate.phone || 'No phone'}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="muted-copy">No matching patient found in this branch.</p>
            )}
          </div>
        ) : null}
      </div>
      {record ? (
        <div className="optometrist-patient-summary top-gap">
          <div className="summary-tile">
            <span>Current patient</span>
            <strong>{record.patient_name || record.name}</strong>
          </div>
          <div className="summary-tile">
            <span>Folder</span>
            <strong>{record.folder_id}</strong>
          </div>
          <div className="summary-tile">
            <span>Appointment</span>
            <strong>{record.appointment_date || 'Walk-in / unscheduled'}</strong>
          </div>
          <div className="summary-tile">
            <span>Queue state</span>
            <strong>{record.status}</strong>
          </div>
        </div>
      ) : null}
      <div className="optometrist-inline-actions">
        <button type="button" className="primary-button" onClick={() => setActiveView('Patient Review')}>
          Back to Review
        </button>
        <button type="button" className="ghost-button" onClick={() => setActiveView('Patient Records')}>
          Open Patient Record
        </button>
      </div>
    </div>
  )
}

function OptometristRecordsView({ record, setActiveView, openExamModal, openExamWorkspace, fetchPatientPrescriptions, fetchPatientExamForm }) {
  const [prescriptions, setPrescriptions] = useState([])
  const [formVersions, setFormVersions] = useState([])
  const [isLoadingFormVersions, setIsLoadingFormVersions] = useState(false)
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoadingPrescriptions(true)
    setIsLoadingFormVersions(true)

    Promise.allSettled([
      fetchPatientPrescriptions(record.id),
      fetchPatientExamForm(record.id),
    ]).then(([prescriptionResult, formResult]) => {
      if (cancelled) return

      setPrescriptions(prescriptionResult.status === 'fulfilled' ? (prescriptionResult.value.prescriptions ?? []) : [])
      setFormVersions(formResult.status === 'fulfilled' ? (formResult.value.form_versions ?? []) : [])
    }).finally(() => {
      if (!cancelled) {
        setIsLoadingPrescriptions(false)
        setIsLoadingFormVersions(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [fetchPatientExamForm, fetchPatientPrescriptions, record.id])

  return (
    <div className="optometrist-workspace-stack">
      <div className="optometrist-details-grid">
        <div className="optometrist-workspace-card">
          <p className="eyebrow">Patient Record</p>
          <h4>Identity and contact profile</h4>
          <div className="optometrist-checklist">
            <div><span>Full name</span><strong>{record.patient_name || record.name}</strong></div>
            <div><span>Folder ID</span><strong>{record.folder_id}</strong></div>
            <div><span>Phone</span><strong>{record.phone || 'No phone'}</strong></div>
            <div><span>Residence</span><strong>{record.residence || record.address || 'Not set'}</strong></div>
            <div><span>Email</span><strong>{record.email || 'No email'}</strong></div>
            <div><span>Date of birth</span><strong>{record.dob || 'Not recorded'}</strong></div>
          </div>
        </div>
        <div className="optometrist-workspace-card">
          <p className="eyebrow">Visit Control</p>
          <h4>Current operational details</h4>
          <div className="optometrist-checklist">
            <div><span>Status</span><strong>{record.status}</strong></div>
            <div><span>Purpose</span><strong>{record.purpose || 'Consultation'}</strong></div>
            <div><span>Appointment date</span><strong>{record.appointment_date || 'Not scheduled'}</strong></div>
            <div><span>Assigned optometrist</span><strong>{record.assigned_optometrist_name || 'Not assigned'}</strong></div>
            <div><span>Created visit date</span><strong>{record.date || 'Not captured'}</strong></div>
            <div><span>Age / sex</span><strong>{record.age || 'N/A'} yrs / {record.sex || 'N/A'}</strong></div>
          </div>
        </div>
      </div>

      <div className="optometrist-details-grid">
        <div className="optometrist-workspace-card">
          <p className="eyebrow">Examination Versions</p>
          <h4>Clinical record status</h4>
          <div className="optometrist-prescription-history">
            {isLoadingFormVersions ? (
              <p className="muted-copy">Loading examination versions...</p>
            ) : formVersions.length ? formVersions.map((version) => (
              <article key={`record-form-version-${version.id}`} className="optometrist-prescription-card">
                <div className="patient-record-top">
                  <div>
                    <strong>Version {version.version}</strong>
                    <span>{version.updated_at || 'No update date'}</span>
                  </div>
                  <span className={`status-pill status-${String(version.status || '').toLowerCase()}`}>{version.status || 'draft'}</span>
                </div>
                <p className="muted-copy"><strong>Chief Complaint:</strong> {version.summary?.chief_complaint || 'N/A'}</p>
                <p className="muted-copy"><strong>Diagnosis:</strong> {version.summary?.diagnosis || 'N/A'}</p>
                <div className="optometrist-inline-actions">
                  <button type="button" className="ghost-button" onClick={() => openExamModal(record, { formId: version.id })}>
                    Use As Reference
                  </button>
                  <button type="button" className="primary-button" onClick={() => openExamModal(record)}>
                    New From Latest
                  </button>
                </div>
              </article>
            )) : (
              <article className="optometrist-prescription-card">
                <div className="patient-record-top">
                  <div>
                    <strong>No saved examination versions yet</strong>
                    <span>Start the first full examination record for this patient.</span>
                  </div>
                  <span className={`status-pill status-${record.status}`}>{record.status}</span>
                </div>
                <div className="patient-record-meta">
                  <span>Folder: {record.folder_id}</span>
                  <span>Visit date: {record.date || 'Not captured'}</span>
                  <span>Appointment: {record.appointment_date || 'Not scheduled'}</span>
                  <span>Assigned: {record.assigned_optometrist_name || 'Not assigned'}</span>
                </div>
              </article>
            )}
          </div>
        </div>
        <div className="optometrist-workspace-card">
          <p className="eyebrow">Document Cabinet</p>
          <h4>Uploads and supporting files</h4>
          <div className="optometrist-prescription-history">
            <article className="optometrist-prescription-card">
              <strong>Clinical attachments</strong>
              <p className="muted-copy">
                X-rays, referral letters, older prescriptions, and related files can be added from the examination form uploads tab.
              </p>
              <div className="patient-record-meta">
                <span>Folder ID: {record.folder_id}</span>
                <span>Ready for upload workflow</span>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div className="optometrist-workspace-card">
        <p className="eyebrow">Clinical Record Lens</p>
        <h4>Stored notes and reference prescription history</h4>
        <div className="optometrist-note-sheet">
          <pre>{record.comment?.trim() || 'No structured note has been saved for this patient yet.'}</pre>
        </div>
        <div className="optometrist-records-split">
          <div>
            <p className="eyebrow">Previous Prescriptions</p>
            {isLoadingPrescriptions ? (
              <p className="muted-copy">Loading older prescriptions...</p>
            ) : prescriptions.length ? (
              <div className="optometrist-prescription-history">
                {prescriptions.slice(0, 4).map((item) => (
                  <article key={`${item.prescription_id}-${item.patient_id}`} className="optometrist-prescription-card">
                    <div className="patient-record-top">
                      <div>
                        <strong>{item.date || 'No date'}</strong>
                        <span>{item.lens_type || 'Lens type not set'}</span>
                      </div>
                      <span className="panel-tag">{item.prescription_id}</span>
                    </div>
                    <div className="patient-record-meta">
                      <span>OD: {item.sph_od || 'Plano'} / {item.cyl_od || '0.00'} x {item.axis_od || '-'}</span>
                      <span>OS: {item.sph_os || 'Plano'} / {item.cyl_os || '0.00'} x {item.axis_os || '-'}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-copy">No older prescriptions were found for this patient.</p>
            )}
          </div>
          <div>
            <p className="eyebrow">Record Guidance</p>
            <ul className="optometrist-bullet-list">
              <li>Verify folder ID, appointment date, and contact information before finalizing findings.</li>
              <li>Use the full examination page to keep history, findings, diagnosis, and uploads together.</li>
              <li>Open prescriptions for older spectacle reference before issuing a new correction.</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="optometrist-inline-actions">
        <button type="button" className="ghost-button patient-management-action-button" onClick={() => setActiveView('Glasses Prescriptions')}>
          Open Prescriptions
        </button>
        <button type="button" className="primary-button" onClick={() => setActiveView('Patient Review')}>
          Review Patient
        </button>
        <button type="button" className="ghost-button patient-management-action-button" onClick={() => (openExamWorkspace ? openExamWorkspace(record, 'Patient Records') : openExamModal(record))}>
          Open Examination Form
        </button>
      </div>
    </div>
  )
}

function PatientRecordsModal({ patient, onClose, setActiveView, openExamModal, openExamWorkspace, fetchPatientPrescriptions, fetchPatientExamForm }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel patient-records-modal" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Patient Records</p>
            <h3>{patient.patient_name || patient.name}</h3>
            <p className="muted-copy">{patient.folder_id} • {patient.phone || 'No phone on file'}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <OptometristRecordsView
          record={patient}
          setActiveView={setActiveView}
          openExamModal={openExamModal}
          openExamWorkspace={openExamWorkspace}
          fetchPatientPrescriptions={fetchPatientPrescriptions}
          fetchPatientExamForm={fetchPatientExamForm}
        />
      </article>
    </div>
  )
}

function OptometristUploadsView({ record, fetchPatientDocuments, uploadPatientDocuments }) {
  const [documents, setDocuments] = useState([])
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false)
  const [documentType, setDocumentType] = useState('Clinical Attachment')
  const [documentNotes, setDocumentNotes] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setIsLoadingDocuments(true)
    setMessage('')
    setSelectedFiles([])

    fetchPatientDocuments(record.id)
      .then((response) => {
        if (cancelled) return
        setDocuments(response.documents ?? [])
      })
      .catch((error) => {
        if (cancelled) return
        setMessage(error.message || 'Could not load patient documents.')
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDocuments(false)
      })

    return () => {
      cancelled = true
    }
  }, [fetchPatientDocuments, record.id])

  function appendFiles(fileList) {
    const incoming = Array.from(fileList ?? [])
    if (!incoming.length) return
    setSelectedFiles((current) => [...current, ...incoming])
  }

  async function handleUploadDocuments(event) {
    event.preventDefault()
    if (!selectedFiles.length) {
      setMessage('Please choose at least one file to upload.')
      return
    }

    setIsUploadingDocuments(true)
    setMessage('')
    try {
      const formData = new FormData()
      selectedFiles.forEach((file) => formData.append('files[]', file))
      formData.append('document_type', documentType)
      formData.append('notes', documentNotes)

      await uploadPatientDocuments(record.id, formData)
      const refreshed = await fetchPatientDocuments(record.id)
      setDocuments(refreshed.documents ?? [])
      setSelectedFiles([])
      setDocumentNotes('')
      setMessage('Documents uploaded successfully.')
    } catch (error) {
      setMessage(error.message || 'Could not upload selected documents.')
    } finally {
      setIsUploadingDocuments(false)
    }
  }

  return (
    <div className="optometrist-workspace-stack">
      <div className="optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Patient Uploads</p>
            <h4>{record.patient_name || record.name}</h4>
            <p className="muted-copy">{record.folder_id}</p>
          </div>
          <span className="panel-tag">{documents.length} files</span>
        </div>

        {message ? <div className="message-banner success">{message}</div> : null}

        <form className="optometrist-management-form" onSubmit={handleUploadDocuments}>
          <div className="optometrist-exam-grid">
            <Field label="Document Type">
              <input value={documentType} onChange={(event) => setDocumentType(event.target.value)} />
            </Field>
            <Field label="Notes">
              <input value={documentNotes} onChange={(event) => setDocumentNotes(event.target.value)} placeholder="Optional upload notes" />
            </Field>
            <Field label="Choose Files" className="full-span">
              <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => appendFiles(event.target.files)} />
            </Field>
            <Field label="Camera Capture (Mobile)" className="full-span">
              <input type="file" accept="image/*" capture="environment" multiple onChange={(event) => appendFiles(event.target.files)} />
            </Field>
          </div>

          {selectedFiles.length ? (
            <div className="optometrist-upload-list">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${file.size}-${index}`} className="optometrist-upload-item">
                  <strong>{file.name}</strong>
                  <span>{formatFileSize(file.size)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No files selected yet.</p>
          )}

          <div className="optometrist-inline-actions">
            <button type="submit" className="primary-button" disabled={isUploadingDocuments}>
              {isUploadingDocuments ? 'Uploading...' : 'Upload Files'}
            </button>
          </div>
        </form>
      </div>

      <div className="optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stored Documents</p>
            <h4>Existing patient attachments</h4>
          </div>
        </div>

        {isLoadingDocuments ? (
          <p className="muted-copy">Loading patient documents...</p>
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
                <span>{document.document_type || 'Attachment'}{document.file_size ? ` - ${formatFileSize(document.file_size)}` : ''}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No uploaded files found for this patient.</p>
        )}
      </div>
    </div>
  )
}

function PatientReviewModal({
  patient,
  onClose,
  setActiveView,
  setSelectedPatientId,
  patientLookupSearch,
  setPatientLookupSearch,
  patientLookupResults,
  isSearchingPatientLookup,
  fetchPatientPrescriptions,
  addPatientPrescription,
  fetchMedicalReport,
  openExamModal,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel optometrist-exam-modal" onClick={(event) => event.stopPropagation()}>
        <header className="panel-heading">
          <div>
            <p className="eyebrow">Patient Review</p>
            <h3>{patient.patient_name || patient.name}</h3>
            <p className="muted-copy">{patient.folder_id}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <OptometristReviewView
          record={patient}
          setActiveView={setActiveView}
          setSelectedPatientId={setSelectedPatientId}
          patientLookupSearch={patientLookupSearch}
          setPatientLookupSearch={setPatientLookupSearch}
          patientLookupResults={patientLookupResults}
          isSearchingPatientLookup={isSearchingPatientLookup}
          fetchPatientPrescriptions={fetchPatientPrescriptions}
          addPatientPrescription={addPatientPrescription}
          fetchMedicalReport={fetchMedicalReport}
          openExamModal={openExamModal}
          showPatientLookup={false}
        />
      </article>
    </div>
  )
}

function PatientUploadsModal({ patient, onClose, fetchPatientDocuments, uploadPatientDocuments }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel optometrist-exam-modal" onClick={(event) => event.stopPropagation()}>
        <header className="panel-heading">
          <div>
            <p className="eyebrow">Patient Uploads</p>
            <h3>{patient.patient_name || patient.name}</h3>
            <p className="muted-copy">{patient.folder_id}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <OptometristUploadsView
          record={patient}
          fetchPatientDocuments={fetchPatientDocuments}
          uploadPatientDocuments={uploadPatientDocuments}
        />
      </article>
    </div>
  )
}

function PatientPrescriptionWorkspace({
  patient,
  companyProfile,
  fetchPatientPrescriptions,
  fetchPatientExamForm,
  addPatientPrescription,
  fetchPatientDocuments,
  uploadPatientDocuments,
}) {
  const [prescriptions, setPrescriptions] = useState([])
  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingPrescription, setIsSavingPrescription] = useState(false)
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false)
  const [newPrescription, setNewPrescription] = useState(defaultNewPrescription())
  const [documentType, setDocumentType] = useState('Clinical Attachment')
  const [documentNotes, setDocumentNotes] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [message, setMessage] = useState('')
  const featuredPrescription = useMemo(() => {
    if (!prescriptions.length) return null
    return [...prescriptions]
      .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())[0]
  }, [prescriptions])
  const hasDraftPrescriptionValues = useMemo(
    () => Object.values(newPrescription || {}).some((value) => String(value ?? '').trim() !== ''),
    [newPrescription],
  )
  const printablePrescription = featuredPrescription || (hasDraftPrescriptionValues
    ? {
        ...newPrescription,
        date: newPrescription.date || todayIso(),
      }
    : null)
  const companyName = String(companyProfile?.company_name || 'BEALET OPTICAL CENTER').toUpperCase()
  const companyTagline = companyProfile?.tagline || 'Professional Eye Care and Optical Services'
  const phonePrimary = companyProfile?.company_phone_primary || 'N/A'
  const phoneSecondary = companyProfile?.company_phone_secondary || ''
  const companyEmail = companyProfile?.company_email || 'N/A'
  const branchAddress = companyProfile?.madina_address || companyProfile?.labadi_address || 'Address not provided'
  const phoneLabel = phoneSecondary ? `${phonePrimary} | ${phoneSecondary}` : phonePrimary

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setMessage('')

    Promise.all([
      fetchPatientPrescriptions(patient.id),
      fetchPatientExamForm(patient.id),
      fetchPatientDocuments(patient.id),
    ])
      .then(([prescriptionResponse, examFormResponse, documentResponse]) => {
        if (cancelled) return
        setPrescriptions(prescriptionResponse.prescriptions ?? [])
        setNewPrescription(buildPrefilledPrescriptionFromExamForm(examFormResponse))
        setDocuments(documentResponse.documents ?? [])
      })
      .catch((error) => {
        if (cancelled) return
        setMessage(error.message || 'Could not load patient prescription details.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fetchPatientDocuments, fetchPatientExamForm, fetchPatientPrescriptions, patient.id])

  async function handleSavePrescription(event) {
    event.preventDefault()
    setIsSavingPrescription(true)
    setMessage('')
    try {
      await addPatientPrescription(patient.id, newPrescription)
      const refreshed = await fetchPatientPrescriptions(patient.id)
      setPrescriptions(refreshed.prescriptions ?? [])
      const refreshedExamForm = await fetchPatientExamForm(patient.id)
      setNewPrescription(buildPrefilledPrescriptionFromExamForm(refreshedExamForm))
      setMessage('Prescription saved successfully.')
    } catch (error) {
      setMessage(error.message || 'Could not save prescription.')
    } finally {
      setIsSavingPrescription(false)
    }
  }

  async function handleUploadDocuments(event) {
    event.preventDefault()
    if (!selectedFiles.length) {
      setMessage('Please choose at least one file to upload.')
      return
    }

    setIsUploadingDocuments(true)
    setMessage('')
    try {
      const formData = new FormData()
      selectedFiles.forEach((file) => formData.append('files[]', file))
      formData.append('document_type', documentType)
      formData.append('notes', documentNotes)

      await uploadPatientDocuments(patient.id, formData)
      const refreshed = await fetchPatientDocuments(patient.id)
      setDocuments(refreshed.documents ?? [])
      setSelectedFiles([])
      setDocumentNotes('')
      setMessage('Documents uploaded successfully.')
    } catch (error) {
      setMessage(error.message || 'Could not upload selected documents.')
    } finally {
      setIsUploadingDocuments(false)
    }
  }

  function appendFiles(fileList) {
    const incoming = Array.from(fileList ?? [])
    if (!incoming.length) return
    setSelectedFiles((current) => [...current, ...incoming])
  }

  function handlePrintPrescription() {
    if (!printablePrescription) {
      setMessage('Add at least one prescription value before printing.')
      return
    }
    window.print()
  }

  function handleExportPrescriptionPdf() {
    if (!printablePrescription) {
      setMessage('Add at least one prescription value before exporting PDF.')
      return
    }
    window.print()
  }

  return (
    <>
      {message ? <div className="message-banner success">{message}</div> : null}

      {isLoading ? (
        <p className="muted-copy">Loading patient prescriptions and files...</p>
      ) : (
        <div className="optometrist-workspace-stack">
            <div className="optometrist-workspace-card prescription-sheet-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Prescription Sheet</p>
                  <h4>Professional print-ready format</h4>
                </div>
                <div className="optometrist-inline-actions">
                  <button type="button" className="ghost-button" onClick={handlePrintPrescription}>
                    Print
                  </button>
                  <button type="button" className="primary-button" onClick={handleExportPrescriptionPdf}>
                    Export PDF
                  </button>
                </div>
              </div>
              {printablePrescription ? (
                <section className="prescription-sheet" aria-label="Prescription sheet">
                  <header className="prescription-sheet-header">
                    <div>
                      <h5>{companyName}</h5>
                      <p>Professional Spectacle Prescription</p>
                    </div>
                    <div className="prescription-sheet-meta">
                      <strong>{featuredPrescription ? 'Prescription' : 'Draft Prescription'}</strong>
                      <span>Date: {formatDateDisplay(printablePrescription.date) || 'Not captured'}</span>
                    </div>
                  </header>
                  <div className="prescription-sheet-patient">
                    <span><strong>Patient:</strong> {patient.patient_name || patient.name || 'N/A'}</span>
                    <span><strong>Folder ID:</strong> {patient.folder_id || 'N/A'}</span>
                    <span><strong>Phone:</strong> {patient.phone || 'N/A'}</span>
                    <span><strong>Age/Sex:</strong> {patient.age || 'N/A'} / {patient.sex || 'N/A'}</span>
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
                          <td>{printablePrescription.sph_od || 'Plano'}</td>
                          <td>{printablePrescription.cyl_od || '0.00'}</td>
                          <td>{printablePrescription.axis_od || '-'}</td>
                          <td>{printablePrescription.add_od || '-'}</td>
                        </tr>
                        <tr>
                          <td>OS (Left)</td>
                          <td>{printablePrescription.sph_os || 'Plano'}</td>
                          <td>{printablePrescription.cyl_os || '0.00'}</td>
                          <td>{printablePrescription.axis_os || '-'}</td>
                          <td>{printablePrescription.add_os || '-'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="prescription-sheet-footer">
                    <span><strong>IPD:</strong> {printablePrescription.ipd || 'N/A'}</span>
                    <span><strong>Lens Type:</strong> {printablePrescription.lens_type || 'N/A'}</span>
                    <span><strong>Lens Material:</strong> {printablePrescription.lens_material || 'N/A'}</span>
                    <span><strong>Tint/Color:</strong> {printablePrescription.color || 'N/A'}</span>
                  </div>
                  <p className="prescription-sheet-notes">
                    <strong>Notes:</strong> {printablePrescription.notes || 'No additional notes.'}
                  </p>
                  <div className="prescription-sheet-contact">
                    <strong>{companyName}</strong>
                    <span>{branchAddress}</span>
                    <span>{companyTagline}</span>
                    <span>{phoneLabel}</span>
                    <span>{companyEmail}</span>
                  </div>
                </section>
              ) : (
                <p className="muted-copy">Enter prescription values below to generate a printable sheet.</p>
              )}
            </div>
            <div className="optometrist-workspace-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Prescription History</p>
                  <h4>Existing prescriptions</h4>
                </div>
                <span className="panel-tag">{prescriptions.length} records</span>
              </div>
              {prescriptions.length ? (
                <div className="optometrist-prescription-history">
                  {prescriptions.map((item) => (
                    <article key={`${item.prescription_id}-${item.date}`} className="optometrist-prescription-card">
                      <div className="patient-record-top">
                        <div>
                          <strong>{item.date || 'No date'}</strong>
                          <span>{item.lens_type || 'Lens type not set'} • {item.status || 'pending'}</span>
                        </div>
                      </div>
                      <div className="patient-record-meta">
                        <span>OD: {item.sph_od || 'Plano'} / {item.cyl_od || '0.00'} x {item.axis_od || '-'}</span>
                        <span>OS: {item.sph_os || 'Plano'} / {item.cyl_os || '0.00'} x {item.axis_os || '-'}</span>
                        <span>ADD: {item.add_od || '-'} / {item.add_os || '-'}</span>
                        <span>IPD: {item.ipd || 'N/A'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No prescriptions saved yet.</p>
              )}
            </div>

            <form className="optometrist-workspace-card optometrist-management-form" onSubmit={handleSavePrescription}>
              <p className="eyebrow">Add Prescription</p>
              <div className="optometrist-exam-grid">
                <Field label="Date"><input type="date" value={newPrescription.date} onChange={(event) => setNewPrescription((current) => ({ ...current, date: event.target.value }))} /></Field>
                <Field label="IPD"><input value={newPrescription.ipd} onChange={(event) => setNewPrescription((current) => ({ ...current, ipd: event.target.value }))} /></Field>
                <Field label="OD SPH"><input value={newPrescription.sph_od} onChange={(event) => setNewPrescription((current) => ({ ...current, sph_od: event.target.value }))} /></Field>
                <Field label="OD CYL"><input value={newPrescription.cyl_od} onChange={(event) => setNewPrescription((current) => ({ ...current, cyl_od: event.target.value }))} /></Field>
                <Field label="OD AXIS"><input value={newPrescription.axis_od} onChange={(event) => setNewPrescription((current) => ({ ...current, axis_od: event.target.value }))} /></Field>
                <Field label="OD ADD"><input value={newPrescription.add_od} onChange={(event) => setNewPrescription((current) => ({ ...current, add_od: event.target.value }))} /></Field>
                <Field label="OS SPH"><input value={newPrescription.sph_os} onChange={(event) => setNewPrescription((current) => ({ ...current, sph_os: event.target.value }))} /></Field>
                <Field label="OS CYL"><input value={newPrescription.cyl_os} onChange={(event) => setNewPrescription((current) => ({ ...current, cyl_os: event.target.value }))} /></Field>
                <Field label="OS AXIS"><input value={newPrescription.axis_os} onChange={(event) => setNewPrescription((current) => ({ ...current, axis_os: event.target.value }))} /></Field>
                <Field label="OS ADD"><input value={newPrescription.add_os} onChange={(event) => setNewPrescription((current) => ({ ...current, add_os: event.target.value }))} /></Field>
                <Field label="Lens Type">
                  <select value={newPrescription.lens_type} onChange={(event) => setNewPrescription((current) => ({ ...current, lens_type: event.target.value }))}>
                    <option value="">Select lens type</option>
                    {LENS_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Lens Material">
                  <select value={newPrescription.lens_material} onChange={(event) => setNewPrescription((current) => ({ ...current, lens_material: event.target.value }))}>
                    <option value="">Select lens material</option>
                    {LENS_MATERIAL_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Color">
                  <select value={newPrescription.color} onChange={(event) => setNewPrescription((current) => ({ ...current, color: event.target.value }))}>
                    <option value="">Select color</option>
                    {FRAME_COLOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Notes" className="full-span">
                  <textarea rows="3" value={newPrescription.notes} onChange={(event) => setNewPrescription((current) => ({ ...current, notes: event.target.value }))} />
                </Field>
              </div>
              <div className="optometrist-inline-actions">
                <button type="submit" className="primary-button" disabled={isSavingPrescription}>
                  {isSavingPrescription ? 'Saving...' : 'Save Prescription'}
                </button>
              </div>
            </form>

            <form className="optometrist-workspace-card optometrist-management-form" onSubmit={handleUploadDocuments}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Patient Documents</p>
                  <h4>Upload x-rays, lab results, or folder scans</h4>
                </div>
                <span className="panel-tag">{documents.length} files</span>
              </div>
              <div className="optometrist-exam-grid">
                <Field label="Document Type">
                  <input value={documentType} onChange={(event) => setDocumentType(event.target.value)} />
                </Field>
                <Field label="Notes">
                  <input value={documentNotes} onChange={(event) => setDocumentNotes(event.target.value)} placeholder="Optional upload notes" />
                </Field>
                <Field label="Choose Files" className="full-span">
                  <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={(event) => appendFiles(event.target.files)} />
                </Field>
                <Field label="Camera Capture (Mobile)" className="full-span">
                  <input type="file" accept="image/*" capture="environment" multiple onChange={(event) => appendFiles(event.target.files)} />
                </Field>
              </div>
              {selectedFiles.length ? (
                <div className="optometrist-upload-list">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${file.size}-${index}`} className="optometrist-upload-item">
                      <strong>{file.name}</strong>
                      <span>{formatFileSize(file.size)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="optometrist-inline-actions">
                <button type="submit" className="primary-button" disabled={isUploadingDocuments}>
                  {isUploadingDocuments ? 'Uploading...' : 'Upload Files'}
                </button>
              </div>
              {documents.length ? (
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
                      <span>{document.document_type || 'Attachment'}{document.file_size ? ` • ${formatFileSize(document.file_size)}` : ''}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">No documents uploaded for this patient yet.</p>
              )}
            </form>
        </div>
      )}
    </>
  )
}

function PatientPrescriptionModal({
  patient,
  onClose,
  companyProfile,
  fetchPatientPrescriptions,
  fetchPatientExamForm,
  addPatientPrescription,
  fetchPatientDocuments,
  uploadPatientDocuments,
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel optometrist-exam-modal" onClick={(event) => event.stopPropagation()}>
        <header className="panel-heading">
          <div>
            <p className="eyebrow">Prescription & Attachments</p>
            <h3>{patient.patient_name || patient.name}</h3>
            <p className="muted-copy">{patient.folder_id}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <PatientPrescriptionWorkspace
          patient={patient}
          companyProfile={companyProfile}
          fetchPatientPrescriptions={fetchPatientPrescriptions}
          fetchPatientExamForm={fetchPatientExamForm}
          addPatientPrescription={addPatientPrescription}
          fetchPatientDocuments={fetchPatientDocuments}
          uploadPatientDocuments={uploadPatientDocuments}
        />
      </article>
    </div>
  )
}

const examTabs = [
  { id: 'patient', label: 'Patient Info' },
  { id: 'history', label: 'Medical History' },
  { id: 'case', label: 'Case History' },
  { id: 'va', label: 'Visual Acuity' },
  { id: 'prelim', label: 'Preliminary Tests' },
  { id: 'ophthal', label: 'Ophthalmoscopy' },
  { id: 'tonometry', label: 'Tonometry' },
  { id: 'colour', label: 'Colour Vision' },
  { id: 'field', label: 'Visual Field' },
  { id: 'refraction', label: 'Refraction' },
  { id: 'oldsrx', label: 'Old SRx' },
  { id: 'rx', label: 'Spectacle Rx' },
  { id: 'uploads', label: 'Uploads' },
  { id: 'diagnosis', label: 'Diagnosis' },
]

function PatientExamWorkspace({
  patient,
  initialFormId = null,
  fetchPatientExamForm,
  savePatientExamForm,
  mode = 'modal',
  onClose = null,
  onBack = null,
}) {
  const [activeTab, setActiveTab] = useState('patient')
  const [formState, setFormState] = useState(() => createExamFormState(patient))
  const [learnedValues, setLearnedValues] = useState(() => loadLearnedExamValues())
  const [selectedFormId, setSelectedFormId] = useState(initialFormId)
  const [formVersions, setFormVersions] = useState([])
  const [formVersion, setFormVersion] = useState(null)
  const [formStatus, setFormStatus] = useState('')
  const [formUpdatedAt, setFormUpdatedAt] = useState('')
  const [isLoadingSavedForm, setIsLoadingSavedForm] = useState(false)
  const [isSavingForm, setIsSavingForm] = useState(false)
  const [saveAction, setSaveAction] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saveTone, setSaveTone] = useState('idle')
  const activeTabIndex = Math.max(
    examTabs.findIndex((tab) => tab.id === activeTab),
    0,
  )
  const previousTab = activeTabIndex > 0 ? examTabs[activeTabIndex - 1] : null
  const nextTab = activeTabIndex < examTabs.length - 1 ? examTabs[activeTabIndex + 1] : null

  useEffect(() => {
    const baseState = createExamFormState(patient)
    let cancelled = false

    setFormState(baseState)
    setActiveTab('patient')
    setSelectedFormId(initialFormId)
    setFormVersions([])
    setFormVersion(null)
    setFormStatus('')
    setFormUpdatedAt('')
    setSaveAction('')
    setSaveMessage('')
    setSaveTone('idle')
    setIsLoadingSavedForm(true)

    fetchPatientExamForm(patient.id, initialFormId ? { formId: initialFormId } : {})
      .then((response) => {
        if (cancelled) return

        const selectedForm = response.selected_form ?? response.latest_form
        const savedState = selectedForm?.form_data
        const nextState = savedState ? mergeExamFormState(baseState, savedState) : baseState
        const prescriptionValue = nextState.diagnosis?.prescription || buildPrescriptionSummaryFromState(nextState)

        setFormState(updateNestedValue(nextState, 'diagnosis.prescription', prescriptionValue))
        setSelectedFormId(selectedForm?.id ?? null)
        setFormVersions(response.form_versions ?? [])
        setFormVersion(selectedForm?.version ?? null)
        setFormStatus(selectedForm?.status ?? '')
        setFormUpdatedAt(selectedForm?.updated_at ?? '')
      })
      .catch(() => {
        if (!cancelled) {
          setFormState(baseState)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSavedForm(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [fetchPatientExamForm, initialFormId, patient])

  const setField = (path, value) => {
    setFormState((current) => updateExamField(current, path, value))
  }

  async function persistForm(status) {
    setIsSavingForm(true)
    setSaveAction(status)
    setSaveMessage('')
    setSaveTone('idle')

    try {
      const response = await savePatientExamForm(patient.id, {
        status,
        form_data: formState,
      })
      const savedState = response.form?.form_data
      const nextState = savedState ? mergeExamFormState(createExamFormState(patient), savedState) : formState
      const prescriptionValue = nextState.diagnosis?.prescription || buildPrescriptionSummaryFromState(nextState)
      setFormState(updateNestedValue(nextState, 'diagnosis.prescription', prescriptionValue))
      setSelectedFormId(response.form?.id ?? null)
      setFormVersion(response.form?.version ?? null)
      setFormStatus(response.form?.status ?? status)
      setFormUpdatedAt(response.form?.updated_at ?? '')
      setSaveMessage(response.message || (status === 'draft' ? 'Examination draft saved successfully.' : 'Examination saved successfully.'))
      setSaveTone('success')
      const nextLearnedValues = mergeLearnedExamValues(learnedValues, collectLearnedExamValues(nextState))
      setLearnedValues(nextLearnedValues)
      storeLearnedExamValues(nextLearnedValues)
    } catch (error) {
      setSaveMessage(error.message || 'Could not save examination form.')
      setSaveTone('error')
    } finally {
      setIsSavingForm(false)
      setSaveAction('')
    }
  }

  return (
    <div className={`optometrist-exam-workspace ${mode === 'page' ? 'is-page' : ''}`}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Examination Form</p>
            <h3>{patient.patient_name || patient.name}</h3>
            <p className="muted-copy">{patient.folder_id} • {patient.phone || 'No phone on file'}</p>
          </div>
          <div className="modal-actions">
            {mode === 'page' ? (
              <button type="button" className="ghost-button" onClick={() => onBack?.()}>
                Back to Patient Management
              </button>
            ) : (
              <button type="button" className="ghost-button" onClick={() => onClose?.()}>
                Close
              </button>
            )}
          </div>
        </div>

        <div className="optometrist-exam-tabs" role="tablist" aria-label="Examination sections">
          {examTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`optometrist-exam-tab ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="optometrist-exam-body">
          {formVersions.length ? (
            <div className="optometrist-workspace-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Saved Versions</p>
                  <h4>Load an older examination as reference</h4>
                </div>
                <span className="panel-tag">{formVersions.length} saved</span>
              </div>
              <div className="optometrist-prescription-history">
                {formVersions.map((version) => (
                  <article key={`exam-version-${version.id}`} className="optometrist-prescription-card">
                    <div className="patient-record-top">
                      <div>
                        <strong>Version {version.version}</strong>
                        <span>{version.updated_at || 'No update date'}</span>
                      </div>
                      <span className={`status-pill status-${String(version.status || '').toLowerCase()}`}>{version.status || 'draft'}</span>
                    </div>
                    <p className="muted-copy"><strong>Chief Complaint:</strong> {version.summary?.chief_complaint || 'N/A'}</p>
                    <p className="muted-copy"><strong>Diagnosis:</strong> {version.summary?.diagnosis || 'N/A'}</p>
                    <div className="optometrist-inline-actions">
                      <button
                        type="button"
                        className={selectedFormId === version.id ? 'primary-button' : 'ghost-button'}
                        disabled={isLoadingSavedForm}
                        onClick={() => {
                          if (selectedFormId === version.id) return
                          setSelectedFormId(version.id)
                          setIsLoadingSavedForm(true)
                          setSaveMessage('')
                          fetchPatientExamForm(patient.id, { formId: version.id })
                            .then((response) => {
                              const selectedForm = response.selected_form ?? response.latest_form
                              const savedState = selectedForm?.form_data
                              const baseState = createExamFormState(patient)
                              const nextState = savedState ? mergeExamFormState(baseState, savedState) : baseState
                              const prescriptionValue = nextState.diagnosis?.prescription || buildPrescriptionSummaryFromState(nextState)
                              setFormState(updateNestedValue(nextState, 'diagnosis.prescription', prescriptionValue))
                              setFormVersions(response.form_versions ?? [])
                              setSelectedFormId(selectedForm?.id ?? version.id)
                              setFormVersion(selectedForm?.version ?? null)
                              setFormStatus(selectedForm?.status ?? '')
                              setFormUpdatedAt(selectedForm?.updated_at ?? '')
                            })
                            .catch((error) => {
                              setSaveMessage(error.message || 'Could not load the selected examination version.')
                              setSaveTone('error')
                            })
                            .finally(() => setIsLoadingSavedForm(false))
                        }}
                      >
                        {selectedFormId === version.id ? 'Loaded' : 'Use As Reference'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          {isLoadingSavedForm ? <p className="muted-copy">Loading saved examination form...</p> : null}
          {activeTab === 'patient' ? <PatientInfoTab formState={formState} setField={setField} patient={patient} learnedValues={learnedValues} /> : null}
          {activeTab === 'history' ? <MedicalHistoryTab formState={formState} setField={setField} /> : null}
          {activeTab === 'case' ? <CaseHistoryTab formState={formState} setField={setField} /> : null}
          {activeTab === 'va' ? <VisualAcuityTab formState={formState} setField={setField} learnedValues={learnedValues} /> : null}
          {activeTab === 'prelim' ? <PreliminaryTestsTab formState={formState} setField={setField} /> : null}
          {activeTab === 'ophthal' ? <OphthalmoscopyTab formState={formState} setField={setField} learnedValues={learnedValues} /> : null}
          {activeTab === 'tonometry' ? <TonometryTab formState={formState} setField={setField} learnedValues={learnedValues} /> : null}
          {activeTab === 'colour' ? <ColourVisionTab formState={formState} setField={setField} learnedValues={learnedValues} /> : null}
          {activeTab === 'field' ? <VisualFieldTab formState={formState} setField={setField} learnedValues={learnedValues} /> : null}
          {activeTab === 'refraction' ? <RefractionTab formState={formState} setField={setField} learnedValues={learnedValues} /> : null}
          {activeTab === 'oldsrx' ? <OldSrxTab formState={formState} setField={setField} learnedValues={learnedValues} /> : null}
          {activeTab === 'rx' ? <SpectacleRxTab formState={formState} setField={setField} learnedValues={learnedValues} /> : null}
          {activeTab === 'uploads' ? <UploadsTab formState={formState} setField={setField} /> : null}
          {activeTab === 'diagnosis' ? <DiagnosisTab formState={formState} setField={setField} /> : null}
        </div>

        <div className="optometrist-exam-nav">
          <button
            type="button"
            className="ghost-button"
            disabled={!previousTab}
            onClick={() => previousTab && setActiveTab(previousTab.id)}
          >
            Previous
          </button>
          <div className="optometrist-exam-nav-status">
            <span>Section {activeTabIndex + 1} of {examTabs.length}</span>
            <strong>{examTabs[activeTabIndex]?.label}</strong>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={!nextTab}
            onClick={() => nextTab && setActiveTab(nextTab.id)}
          >
            Next
          </button>
        </div>

        <div className="optometrist-exam-footer">
          <div className="optometrist-exam-save-state">
            <span>
              {formVersion ? `Version ${formVersion}` : 'Unsaved form'}
              {formStatus ? ` • ${labelize(formStatus)}` : ''}
            </span>
            <strong>{formUpdatedAt ? `Last saved ${formatExamTimestamp(formUpdatedAt)}` : 'No saved version yet'}</strong>
            {saveMessage ? (
              <p className={saveTone === 'error' ? 'form-feedback error' : 'form-feedback success'}>
                {saveMessage}
              </p>
            ) : null}
          </div>
          <div className="optometrist-note-sheet">
            <pre>{buildExamSummary(formState)}</pre>
          </div>
          <div className="optometrist-inline-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={isSavingForm || isLoadingSavedForm}
              onClick={() => persistForm('draft')}
            >
              {isSavingForm && saveAction === 'draft' ? 'Saving Draft...' : 'Save As Draft'}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={isSavingForm || isLoadingSavedForm}
              onClick={() => persistForm('completed')}
            >
              {isSavingForm && saveAction === 'completed' ? 'Saving...' : 'Complete Examination'}
            </button>
          </div>
        </div>
    </div>
  )
}

function PatientExamModal({ patient, initialFormId = null, onClose, fetchPatientExamForm, savePatientExamForm }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="modal-panel optometrist-exam-modal" onClick={(event) => event.stopPropagation()}>
        <PatientExamWorkspace
          patient={patient}
          initialFormId={initialFormId}
          fetchPatientExamForm={fetchPatientExamForm}
          savePatientExamForm={savePatientExamForm}
          mode="modal"
          onClose={onClose}
        />
      </article>
    </div>
  )
}

function PatientInfoTab({ formState, setField, patient, learnedValues }) {
  return (
    <div className="optometrist-exam-stack">
      <div className="optometrist-workspace-card optometrist-prefill-card">
        <p className="eyebrow">Patient Snapshot</p>
        <div className="optometrist-exam-grid">
          <Field label="Patient Name">
            <input value={patient.patient_name || patient.name || ''} readOnly className="optometrist-prefilled-field" />
          </Field>
          <Field label="Folder ID">
            <input value={patient.folder_id || ''} readOnly className="optometrist-prefilled-field" />
          </Field>
          <Field label="Sex">
            <input value={patient.sex || ''} readOnly className="optometrist-prefilled-field" />
          </Field>
          <Field label="Age">
            <input value={patient.age || ''} readOnly className="optometrist-prefilled-field" />
          </Field>
          <Field label="Purpose">
            <input value={patient.purpose || ''} readOnly className="optometrist-prefilled-field" />
          </Field>
          <Field label="Appointment Date">
            <input value={patient.appointment_date || ''} readOnly className="optometrist-prefilled-field" />
          </Field>
        </div>
      </div>
      <div className="optometrist-exam-grid">
        <Field label="Occupation">
          <LearnedInput path="patient_info.occupation" value={formState.patient_info.occupation} onChange={(e) => setField('patient_info.occupation', e.target.value)} learnedValues={learnedValues} />
        </Field>
        <Field label="Phone">
          <LearnedInput path="patient_info.phone" value={formState.patient_info.phone} onChange={(e) => setField('patient_info.phone', e.target.value)} learnedValues={learnedValues} placeholder={patient.phone || ''} />
        </Field>
        <Field label="Address" className="full-span">
          <LearnedInput path="patient_info.address" value={formState.patient_info.address} onChange={(e) => setField('patient_info.address', e.target.value)} learnedValues={learnedValues} placeholder={patient.address || patient.residence || ''} />
        </Field>
      </div>
    </div>
  )
}

function MedicalHistoryTab({ formState, setField }) {
  return (
    <div className="optometrist-exam-stack">
      <CheckboxMatrix
        title="Past Medical History"
        prefix="medical_history.pmhx"
        values={formState.medical_history.pmhx}
        setField={setField}
        items={['dm', 'hpt', 'sc', 'asthma']}
      />
      <CheckboxMatrix
        title="Family Medical History"
        prefix="medical_history.fmhx"
        values={formState.medical_history.fmhx}
        setField={setField}
        items={['dm', 'hpt', 'sc', 'asthma']}
      />
      <CheckboxMatrix
        title="Family Ocular History"
        prefix="medical_history.fohx"
        values={formState.medical_history.fohx}
        setField={setField}
        items={['spectacle', 'glaucoma', 'cataract', 'blindness', 'surgery']}
      />
      <CheckboxMatrix
        title="Past Ocular History"
        prefix="medical_history.pohx"
        values={formState.medical_history.pohx}
        setField={setField}
        items={['cataract', 'glaucoma', 'surgery']}
      />
      <div className="optometrist-exam-grid">
        <Field label="Allergies">
          <textarea rows="3" value={formState.medical_history.allergies} onChange={(e) => setField('medical_history.allergies', e.target.value)} />
        </Field>
        <Field label="Drug History">
          <textarea rows="3" value={formState.medical_history.drughx} onChange={(e) => setField('medical_history.drughx', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}

function CaseHistoryTab({ formState, setField }) {
  return (
    <div className="optometrist-exam-stack">
      <div className="optometrist-workspace-card">
        <p className="eyebrow">Chief Complaint</p>
        <Field label="Chief Complaint" className="full-span">
          <textarea rows="3" value={formState.case_history.cc} onChange={(e) => setField('case_history.cc', e.target.value)} />
        </Field>
      </div>
      <CheckboxMatrix
        title="Ocular Disturbance Questionnaire"
        prefix="case_history.symptoms"
        values={formState.case_history.symptoms}
        setField={setField}
        items={['itching', 'tearing', 'headache', 'floaters', 'discharge', 'pain', 'photophobia', 'burning']}
      />
      <div className="optometrist-workspace-card">
        <Field label="Additional Notes" className="full-span">
          <textarea rows="4" value={formState.case_history.additional_notes} onChange={(e) => setField('case_history.additional_notes', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}

function VisualAcuityTab({ formState, setField, learnedValues }) {
  return (
    <TwoEyeGrid
      od={<SimpleEyeFields prefix="visual_acuity.od" data={formState.visual_acuity.od} setField={setField} fields={['unaided', 'aided', 'ph']} learnedValues={learnedValues} />}
      os={<SimpleEyeFields prefix="visual_acuity.os" data={formState.visual_acuity.os} setField={setField} fields={['unaided', 'aided', 'ph']} learnedValues={learnedValues} />}
    />
  )
}

function PreliminaryTestsTab({ formState, setField }) {
  return (
    <div className="optometrist-exam-stack">
      <div className="optometrist-workspace-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Preliminary External Tests</p>
            <h4>Performed checks with OD and OS result capture</h4>
          </div>
        </div>
        <div className="table-shell preliminary-table-shell">
          <table className="portal-table preliminary-tests-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Performed</th>
                <th>OD (Right) Results</th>
                <th>OS (Left) Results</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>External Tests</strong></td>
                <td>
                  <div className="preliminary-performed-stack">
                    {['penlight_inspection', 'trans_illumination', 'shadow'].map((item) => (
                      <label key={item} className="optometrist-check-option">
                        <input
                          type="checkbox"
                          checked={Boolean(formState.preliminary_tests.external_tests?.[item])}
                          onChange={(e) => setField(`preliminary_tests.external_tests.${item}`, e.target.checked)}
                        />
                        <span>{labelize(item)}</span>
                      </label>
                    ))}
                  </div>
                </td>
                <td>
                  <PreliminarySelectColumn
                    basePath="preliminary_tests.external_tests.od"
                    values={formState.preliminary_tests.external_tests?.od}
                    setField={setField}
                    fields={PRELIMINARY_EXTERNAL_TEST_FIELDS}
                  />
                </td>
                <td>
                  <PreliminarySelectColumn
                    basePath="preliminary_tests.external_tests.os"
                    values={formState.preliminary_tests.external_tests?.os}
                    setField={setField}
                    fields={PRELIMINARY_EXTERNAL_TEST_FIELDS}
                  />
                </td>
              </tr>
              <tr>
                <td><strong>Pupillary Reflex</strong></td>
                <td>
                  <label className="optometrist-check-option">
                    <input
                      type="checkbox"
                      checked={Boolean(formState.preliminary_tests.pupillary_reflex_test?.performed)}
                      onChange={(e) => setField('preliminary_tests.pupillary_reflex_test.performed', e.target.checked)}
                    />
                    <span>Performed</span>
                  </label>
                </td>
                <td>
                  <PreliminarySelectColumn
                    basePath="preliminary_tests.pupillary_reflex_test.od"
                    values={formState.preliminary_tests.pupillary_reflex_test?.od}
                    setField={setField}
                    fields={PRELIMINARY_PUPILLARY_FIELDS}
                  />
                </td>
                <td>
                  <PreliminarySelectColumn
                    basePath="preliminary_tests.pupillary_reflex_test.os"
                    values={formState.preliminary_tests.pupillary_reflex_test?.os}
                    setField={setField}
                    fields={PRELIMINARY_PUPILLARY_FIELDS}
                  />
                </td>
              </tr>
              {PRELIMINARY_TEXT_TESTS.map((test) => (
                <tr key={test.key}>
                  <td><strong>{test.label}</strong></td>
                  <td>
                    <label className="optometrist-check-option">
                      <input
                        type="checkbox"
                        checked={Boolean(formState.preliminary_tests[test.key]?.performed)}
                        onChange={(e) => setField(`preliminary_tests.${test.key}.performed`, e.target.checked)}
                      />
                      <span>Performed</span>
                    </label>
                  </td>
                  <td>
                    <Field label="Result">
                      <input
                        value={formState.preliminary_tests[test.key]?.od?.result ?? ''}
                        onChange={(e) => setField(`preliminary_tests.${test.key}.od.result`, e.target.value)}
                      />
                    </Field>
                  </td>
                  <td>
                    <Field label="Result">
                      <input
                        value={formState.preliminary_tests[test.key]?.os?.result ?? ''}
                        onChange={(e) => setField(`preliminary_tests.${test.key}.os.result`, e.target.value)}
                      />
                    </Field>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function OphthalmoscopyTab({ formState, setField, learnedValues }) {
  return (
    <TwoEyeGrid
      od={<LongEyeForm prefix="ophthalmoscopy.od" data={formState.ophthalmoscopy.od} setField={setField} fields={['lens', 'vitreous', 'disc', 'elsc_type', 'cd_ratio', 'depth_of_cup', 'colour', 'lamina', 'margin', 'retinal_vessels', 'calibre_ratio', 'course', 'av_crossing', 'spontaneous_venous_pulse', 'macular_area', 'fovea_reflex', 'periphery', 'notes']} learnedValues={learnedValues} />}
      os={<LongEyeForm prefix="ophthalmoscopy.os" data={formState.ophthalmoscopy.os} setField={setField} fields={['lens', 'vitreous', 'disc', 'elsc_type', 'cd_ratio', 'depth_of_cup', 'colour', 'lamina', 'margin', 'retinal_vessels', 'calibre_ratio', 'course', 'av_crossing', 'spontaneous_venous_pulse', 'macular_area', 'fovea_reflex', 'periphery', 'notes']} learnedValues={learnedValues} />}
    />
  )
}

function TonometryTab({ formState, setField, learnedValues }) {
  return (
    <TwoEyeGrid
      od={<SimpleEyeFields prefix="tonometry.od" data={formState.tonometry.od} setField={setField} fields={['method', 'iop', 'time', 'notes']} learnedValues={learnedValues} />}
      os={<SimpleEyeFields prefix="tonometry.os" data={formState.tonometry.os} setField={setField} fields={['method', 'iop', 'time', 'notes']} learnedValues={learnedValues} />}
    />
  )
}

function ColourVisionTab({ formState, setField, learnedValues }) {
  return (
    <TwoEyeGrid
      od={<SimpleEyeFields prefix="colour_vision.od" data={formState.colour_vision.od} setField={setField} fields={['test', 'plates_correct', 'result', 'notes']} learnedValues={learnedValues} />}
      os={<SimpleEyeFields prefix="colour_vision.os" data={formState.colour_vision.os} setField={setField} fields={['test', 'plates_correct', 'result', 'notes']} learnedValues={learnedValues} />}
    />
  )
}

function VisualFieldTab({ formState, setField, learnedValues }) {
  return (
    <TwoEyeGrid
      od={<SimpleEyeFields prefix="visual_field.od" data={formState.visual_field.od} setField={setField} fields={['method', 'result', 'notes']} learnedValues={learnedValues} />}
      os={<SimpleEyeFields prefix="visual_field.os" data={formState.visual_field.os} setField={setField} fields={['method', 'result', 'notes']} learnedValues={learnedValues} />}
    />
  )
}

function RefractionTab({ formState, setField, learnedValues }) {
  return (
    <div className="optometrist-exam-stack">
      <div className="refraction-compare-grid">
        <div className="optometrist-workspace-card refraction-compact-card">
          <p className="eyebrow">Objective Refraction</p>
          <TwoEyeGrid
            compact
            od={<SimpleEyeFields prefix="refraction.objective.od" data={formState.refraction.objective.od} setField={setField} fields={['sphere', 'cylinder', 'axis']} learnedValues={learnedValues} />}
            os={<SimpleEyeFields prefix="refraction.objective.os" data={formState.refraction.objective.os} setField={setField} fields={['sphere', 'cylinder', 'axis']} learnedValues={learnedValues} />}
          />
        </div>
        <div className="optometrist-workspace-card refraction-compact-card">
          <p className="eyebrow">Subjective Refraction</p>
          <TwoEyeGrid
            compact
            od={<SimpleEyeFields prefix="refraction.subjective.od" data={formState.refraction.subjective.od} setField={setField} fields={['sphere', 'cylinder', 'axis', 'va', 'add']} learnedValues={learnedValues} />}
            os={<SimpleEyeFields prefix="refraction.subjective.os" data={formState.refraction.subjective.os} setField={setField} fields={['sphere', 'cylinder', 'axis', 'va', 'add']} learnedValues={learnedValues} />}
          />
        </div>
      </div>
    </div>
  )
}

function OldSrxTab({ formState, setField, learnedValues }) {
  return (
    <TwoEyeGrid
      od={<SimpleEyeFields prefix="old_srx.od" data={formState.old_srx.od} setField={setField} fields={['sphere', 'cylinder', 'axis', 'add', 'va']} learnedValues={learnedValues} />}
      os={<SimpleEyeFields prefix="old_srx.os" data={formState.old_srx.os} setField={setField} fields={['sphere', 'cylinder', 'axis', 'add', 'va']} learnedValues={learnedValues} />}
    />
  )
}

function SpectacleRxTab({ formState, setField, learnedValues }) {
  return (
    <TwoEyeGrid
      od={<SimpleEyeFields prefix="spectacle_rx.od" data={formState.spectacle_rx.od} setField={setField} fields={['sphere', 'cylinder', 'axis', 'add', 'va', 'lens_type']} learnedValues={learnedValues} />}
      os={<SimpleEyeFields prefix="spectacle_rx.os" data={formState.spectacle_rx.os} setField={setField} fields={['sphere', 'cylinder', 'axis', 'add', 'va', 'lens_type']} learnedValues={learnedValues} />}
    />
  )
}

function UploadsTab({ formState, setField }) {
  return (
    <div className="optometrist-exam-stack">
      <div className="optometrist-workspace-card">
        <p className="eyebrow">Attachments</p>
        <h4>Add supporting files for the examination</h4>
        <label className="settings-upload">
          Upload X-rays, older prescriptions, referral letters, or scans
          <input
            type="file"
            multiple
            onChange={(event) =>
              setField(
                'uploads.files',
                Array.from(event.target.files ?? []).map((file) => ({
                  name: file.name,
                  size: file.size,
                  type: file.type,
                })),
              )
            }
          />
        </label>
      </div>
      <div className="optometrist-workspace-card">
        <p className="eyebrow">Attachment Notes</p>
        <h4>What was added for reference</h4>
        <Field label="File Notes" className="full-span">
          <textarea rows="4" value={formState.uploads.notes} onChange={(e) => setField('uploads.notes', e.target.value)} />
        </Field>
        <div className="optometrist-upload-list">
          {(formState.uploads.files ?? []).length ? (
            formState.uploads.files.map((file) => (
              <div key={`${file.name}-${file.size}`} className="optometrist-upload-item">
                <strong>{file.name}</strong>
                <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
              </div>
            ))
          ) : (
            <p className="muted-copy">No files selected yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function DiagnosisTab({ formState, setField }) {
  return (
    <div className="optometrist-exam-grid">
      {['diagnosis', 'management_plan', 'prescription', 'followup_notes'].map((field) => (
        <Field key={field} label={labelize(field)} className="full-span">
          <textarea rows="4" value={formState.diagnosis[field]} onChange={(e) => setField(`diagnosis.${field}`, e.target.value)} />
        </Field>
      ))}
      <Field label="Followup Date">
        <input type="date" value={formState.diagnosis.followup_date} onChange={(e) => setField('diagnosis.followup_date', e.target.value)} />
      </Field>
    </div>
  )
}

function PreliminarySelectColumn({ basePath, values = {}, setField, fields }) {
  return (
    <div className="preliminary-select-column">
      {fields.map((field) => (
        <Field key={field.key} label={field.label}>
          <select
            value={values?.[field.key] ?? ''}
            onChange={(e) => setField(`${basePath}.${field.key}`, e.target.value)}
          >
            <option value="">Select</option>
            {field.options.map((option) => (
              <option key={`${field.key}-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      ))}
    </div>
  )
}

function TwoEyeGrid({ od, os, compact = false }) {
  return (
    <div className={`optometrist-eye-grid ${compact ? 'is-compact' : ''}`}>
      <div className={`optometrist-workspace-card ${compact ? 'is-compact' : ''}`}>
        <p className="eyebrow">OD</p>
        <h4>Right Eye</h4>
        {od}
      </div>
      <div className={`optometrist-workspace-card ${compact ? 'is-compact' : ''}`}>
        <p className="eyebrow">OS</p>
        <h4>Left Eye</h4>
        {os}
      </div>
    </div>
  )
}

function SimpleEyeFields({ prefix, data, setField, fields, learnedValues }) {
  return (
    <div className="optometrist-exam-grid">
      {fields.map((field) => (
        <Field key={field} label={labelize(field)} className={field === 'notes' ? 'full-span' : ''}>
          {field === 'notes' ? (
            <textarea rows="3" value={data[field] ?? ''} onChange={(e) => setField(`${prefix}.${field}`, e.target.value)} />
          ) : (
            <ExamFieldControl
              path={`${prefix}.${field}`}
              value={data[field] ?? ''}
              onChange={(e) => setField(`${prefix}.${field}`, e.target.value)}
              learnedValues={learnedValues}
            />
          )}
        </Field>
      ))}
    </div>
  )
}

function LongEyeForm({ prefix, data, setField, fields, learnedValues }) {
  return (
    <div className="optometrist-exam-grid">
      {fields.map((field) => (
        <Field key={field} label={labelize(field)} className={field === 'notes' ? 'full-span' : ''}>
          {field === 'notes' ? (
            <textarea rows="3" value={data[field] ?? ''} onChange={(e) => setField(`${prefix}.${field}`, e.target.value)} />
          ) : (
            <ExamFieldControl
              path={`${prefix}.${field}`}
              value={data[field] ?? ''}
              onChange={(e) => setField(`${prefix}.${field}`, e.target.value)}
              learnedValues={learnedValues}
            />
          )}
        </Field>
      ))}
    </div>
  )
}

function ExamFieldControl({ path, value, onChange, learnedValues }) {
  const options = getExamSelectOptions(path)
  if (options.length) {
    return (
      <select value={value ?? ''} onChange={onChange}>
        <option value="">Select option</option>
        {options.map((option) => (
          <option key={`${path}-${option}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  return (
    <LearnedInput
      path={path}
      value={value}
      onChange={onChange}
      learnedValues={learnedValues}
    />
  )
}

function LearnedInput({ path, value, onChange, learnedValues, placeholder = '', type = 'text' }) {
  const options = Array.isArray(learnedValues?.[path]) ? learnedValues[path] : []
  const datalistId = options.length && type !== 'date' ? `exam-learned-${path.replace(/[^a-z0-9]+/gi, '-')}` : undefined

  return (
    <>
      <input
        type={type}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        list={datalistId}
      />
      {datalistId ? (
        <datalist id={datalistId}>
          {options.map((option) => (
            <option key={`${path}-${option}`} value={option} />
          ))}
        </datalist>
      ) : null}
    </>
  )
}

function CheckboxMatrix({ title, prefix, values, setField, items }) {
  return (
    <div className="optometrist-workspace-card">
      <p className="eyebrow">{title}</p>
      <div className="optometrist-exam-grid">
        {items.map((item) => (
          <label key={item} className="optometrist-check-option">
            <input
              type="checkbox"
              checked={Boolean(values[item])}
              onChange={(e) => setField(`${prefix}.${item}`, e.target.checked)}
            />
            <span>{labelize(item)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function getExamSelectOptions(path) {
  if (EXAM_SELECT_OPTION_SUFFIXES[path]) {
    return EXAM_SELECT_OPTION_SUFFIXES[path]
  }

  const match = Object.entries(EXAM_SELECT_OPTION_SUFFIXES).find(([suffix]) => path.endsWith(suffix))
  return match ? match[1] : []
}

function createExamFormState(patient) {
  return {
    patient_info: {
      occupation: '',
      phone: patient.phone || '',
      address: patient.address || patient.residence || '',
    },
    medical_history: {
      pmhx: { dm: false, hpt: false, sc: false, asthma: false },
      fmhx: { dm: false, hpt: false, sc: false, asthma: false },
      fohx: { spectacle: false, glaucoma: false, cataract: false, blindness: false, surgery: false },
      pohx: { cataract: false, glaucoma: false, surgery: false },
      allergies: '',
      drughx: '',
    },
    case_history: {
      cc: patient.purpose || '',
      symptoms: { itching: false, tearing: false, headache: false, floaters: false, discharge: false, pain: false, photophobia: false, burning: false },
      additional_notes: 'No additional ocular complaints reported.',
    },
    visual_acuity: { od: { unaided: '6/6', aided: '6/6', ph: '6/6' }, os: { unaided: '6/6', aided: '6/6', ph: '6/6' } },
    preliminary_tests: {
      external_tests: {
        penlight_inspection: true,
        trans_illumination: true,
        shadow: true,
        od: {
          general_appearance: 'Normal',
          lids_margins: 'Normal',
          bulbar_conj: 'Clear',
          palpebral_conj: 'Clear',
          limbus: 'Normal',
          cornea: 'Clear',
          iris: 'Normal',
          ac_angle: 'Open',
          pupil_shape: 'Round',
          pupil_size: 'Normal',
        },
        os: {
          general_appearance: 'Normal',
          lids_margins: 'Normal',
          bulbar_conj: 'Clear',
          palpebral_conj: 'Clear',
          limbus: 'Normal',
          cornea: 'Clear',
          iris: 'Normal',
          ac_angle: 'Open',
          pupil_shape: 'Round',
          pupil_size: 'Normal',
        },
      },
      pupillary_reflex_test: {
        performed: true,
        od: { direct: 'Normal', consensual: 'Normal', near: 'Normal' },
        os: { direct: 'Normal', consensual: 'Normal', near: 'Normal' },
      },
      keratoscopy: { performed: true, od: { result: 'Normal' }, os: { result: 'Normal' } },
      munson_sign: { performed: true, od: { result: 'Normal' }, os: { result: 'Normal' } },
      ocular_palpation: { performed: true, od: { result: 'Normal' }, os: { result: 'Normal' } },
    },
    ophthalmoscopy: blankEyeLongForm(),
    tonometry: {
      od: { method: 'Applanation', iop: '16', time: '', notes: 'Within normal limits' },
      os: { method: 'Applanation', iop: '16', time: '', notes: 'Within normal limits' },
    },
    colour_vision: {
      od: { test: 'Ishihara', plates_correct: '24', result: 'Normal', notes: 'Normal colour vision' },
      os: { test: 'Ishihara', plates_correct: '24', result: 'Normal', notes: 'Normal colour vision' },
    },
    visual_field: {
      od: { method: 'Confrontation', result: 'Normal', notes: 'Full visual fields' },
      os: { method: 'Confrontation', result: 'Normal', notes: 'Full visual fields' },
    },
    refraction: {
      objective: { od: { sphere: '', cylinder: '', axis: '' }, os: { sphere: '', cylinder: '', axis: '' } },
      subjective: { od: { sphere: '', cylinder: '', axis: '', va: '', add: '' }, os: { sphere: '', cylinder: '', axis: '', va: '', add: '' } },
    },
    old_srx: { od: { sphere: '', cylinder: '', axis: '', add: '', va: '' }, os: { sphere: '', cylinder: '', axis: '', add: '', va: '' } },
    spectacle_rx: { od: { sphere: '', cylinder: '', axis: '', add: '', va: '', lens_type: '' }, os: { sphere: '', cylinder: '', axis: '', add: '', va: '', lens_type: '' } },
    uploads: { files: [], notes: '' },
    diagnosis: {
      diagnosis: 'No abnormal ocular findings detected.',
      management_plan: 'Routine eye care review advised.',
      prescription: 'No corrective prescription indicated at this time.',
      followup_date: '',
      followup_notes: 'Review at the next routine eye examination or earlier if symptoms develop.',
    },
  }
}

function blankEyeLongForm() {
  const blank = {
    lens: 'Clear',
    vitreous: 'Clear',
    disc: 'Normal',
    elsc_type: '',
    cd_ratio: '0.3',
    depth_of_cup: 'Normal',
    colour: 'Pink',
    lamina: 'Visible',
    margin: 'Sharp',
    retinal_vessels: 'Normal',
    calibre_ratio: '',
    course: 'Straight',
    av_crossing: 'Normal',
    spontaneous_venous_pulse: 'Present',
    macular_area: 'Normal',
    fovea_reflex: 'Present',
    periphery: 'Normal',
    notes: 'Healthy ocular findings.',
  }

  return { od: { ...blank }, os: { ...blank } }
}

function updateNestedValue(source, path, value) {
  const keys = path.split('.')
  const next = structuredClone(source)
  let cursor = next

  for (let index = 0; index < keys.length - 1; index += 1) {
    cursor = cursor[keys[index]]
  }

  cursor[keys.at(-1)] = value
  return next
}

function updateExamField(source, path, value) {
  const previousAutoPrescription = buildPrescriptionSummaryFromState(source)
  let next = updateNestedValue(source, path, value)
  next = syncLinkedRefractionFields(next, path, value)
  next = syncLinkedDiagnosisPrescription(next, source, path, previousAutoPrescription)
  return next
}

function syncLinkedRefractionFields(source, path, value) {
  const subjectiveMatch = path.match(/^refraction\.subjective\.(od|os)\.(sphere|cylinder|axis|add|va)$/)
  if (subjectiveMatch) {
    return updateNestedValue(source, `spectacle_rx.${subjectiveMatch[1]}.${subjectiveMatch[2]}`, value)
  }

  const spectacleMatch = path.match(/^spectacle_rx\.(od|os)\.(sphere|cylinder|axis|add|va)$/)
  if (spectacleMatch) {
    return updateNestedValue(source, `refraction.subjective.${spectacleMatch[1]}.${spectacleMatch[2]}`, value)
  }

  return source
}

function syncLinkedDiagnosisPrescription(source, previousSource, path, previousAutoPrescription) {
  const isRefractionPath = /^refraction\.subjective\.(od|os)\.(sphere|cylinder|axis|add|va)$/.test(path)
    || /^spectacle_rx\.(od|os)\.(sphere|cylinder|axis|add|va)$/.test(path)

  if (!isRefractionPath) {
    return source
  }

  const currentPrescription = String(previousSource?.diagnosis?.prescription ?? '').trim()
  if (currentPrescription && currentPrescription !== previousAutoPrescription) {
    return source
  }

  return updateNestedValue(source, 'diagnosis.prescription', buildPrescriptionSummaryFromState(source))
}

function buildPrescriptionSummaryFromState(formState) {
  const lines = []

  ;[['od', 'OD'], ['os', 'OS']].forEach(([key, label]) => {
    const spectacleEye = formState?.spectacle_rx?.[key] ?? {}
    const subjectiveEye = formState?.refraction?.subjective?.[key] ?? {}
    const eyeHasValues = (eye) => [eye.sphere, eye.cylinder, eye.axis, eye.add, eye.va].some((value) => String(value || '').trim())
    const eye = eyeHasValues(spectacleEye) ? spectacleEye : subjectiveEye
    const parts = [
      eye.sphere || '',
      eye.cylinder || '',
      eye.axis ? `x ${eye.axis}` : '',
      eye.add ? `ADD ${eye.add}` : '',
      eye.va ? `VA ${eye.va}` : '',
    ].filter(Boolean)

    if (parts.length) {
      lines.push(`${label}: ${parts.join(' ')}`)
    }
  })

  return lines.join('\n')
}

function mergeExamFormState(baseState, savedState) {
  if (!savedState || typeof savedState !== 'object' || Array.isArray(savedState)) {
    return baseState
  }

  const next = structuredClone(baseState)
  mergeIntoTarget(next, savedState)
  return next
}

function mergeIntoTarget(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    if (!(key in target)) {
      target[key] = value
      return
    }

    if (Array.isArray(value)) {
      target[key] = value
      return
    }

    if (value && typeof value === 'object' && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      mergeIntoTarget(target[key], value)
      return
    }

    target[key] = value
  })
}

function loadLearnedExamValues() {
  try {
    if (typeof window === 'undefined') return {}
    const raw = window.localStorage.getItem(EXAM_LEARNED_VALUES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function storeLearnedExamValues(values) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(EXAM_LEARNED_VALUES_KEY, JSON.stringify(values))
  } catch {
    // no-op
  }
}

function collectLearnedExamValues(formState) {
  const bucket = {}
  collectLearnedLeaves(formState, '', bucket)
  return bucket
}

function collectLearnedLeaves(value, path, bucket) {
  if (Array.isArray(value)) {
    return
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      collectLearnedLeaves(child, path ? `${path}.${key}` : key, bucket)
    })
    return
  }

  if (typeof value !== 'string') {
    return
  }

  const normalized = value.trim()
  if (!normalized || normalized.length > 80 || path.endsWith('.notes') || path.endsWith('.additional_notes')) {
    return
  }

  bucket[path] = Array.from(new Set([...(bucket[path] ?? []), normalized])).slice(-12)
}

function mergeLearnedExamValues(currentValues, nextValues) {
  const merged = { ...(currentValues ?? {}) }

  Object.entries(nextValues ?? {}).forEach(([path, values]) => {
    merged[path] = Array.from(new Set([...(merged[path] ?? []), ...values])).slice(-12)
  })

  return merged
}

function formatExamTimestamp(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function buildExamSummary(formState) {
  return [
    `Chief Complaint: ${formState.case_history.cc || ''}`,
    `Additional Notes: ${formState.case_history.additional_notes || ''}`,
    `Distance VA OD/OS: ${formState.visual_acuity.od.unaided || ''} / ${formState.visual_acuity.os.unaided || ''}`,
    `Tonometry OD/OS: ${formState.tonometry.od.iop || ''} / ${formState.tonometry.os.iop || ''}`,
    `Subjective Refraction OD: ${formState.refraction.subjective.od.sphere || ''} ${formState.refraction.subjective.od.cylinder || ''} x ${formState.refraction.subjective.od.axis || ''}`,
    `Subjective Refraction OS: ${formState.refraction.subjective.os.sphere || ''} ${formState.refraction.subjective.os.cylinder || ''} x ${formState.refraction.subjective.os.axis || ''}`,
    `Diagnosis: ${formState.diagnosis.diagnosis || ''}`,
    `Management Plan: ${formState.diagnosis.management_plan || ''}`,
    `Prescription: ${formState.diagnosis.prescription || buildPrescriptionSummaryFromState(formState)}`,
    `Follow-up Date: ${formState.diagnosis.followup_date || ''}`,
  ].join('\n')
}

function defaultNewPrescription() {
  return {
    date: todayIso(),
    sph_od: '',
    sph_os: '',
    cyl_od: '',
    cyl_os: '',
    axis_od: '',
    axis_os: '',
    add_od: '',
    add_os: '',
    ipd: '',
    lens_type: '',
    lens_material: '',
    color: '',
    notes: '',
  }
}

const LENS_TYPE_OPTIONS = [
  'Single Vision',
  'Bifocal',
  'Progressive',
  'Photochromic',
  'Blue Cut',
  'Anti-Reflective',
  'Office Lens',
]

const LENS_MATERIAL_OPTIONS = [
  'Plastic',
  'Polycarbonate',
  'Hi-Index',
  'Trivex',
  'Glass',
]

const FRAME_COLOR_OPTIONS = [
  'Black',
  'Brown',
  'Gold',
  'Silver',
  'Blue',
  'Red',
  'Green',
  'Transparent',
  'Tortoiseshell',
]

const EXAM_SELECT_OPTION_SUFFIXES = {
  '.lens': ['Clear', 'NSI', 'NC', 'Pseudo', 'Cataract'],
  '.vitreous': ['Clear', 'Hazy', 'Cells', 'Opacities'],
  '.disc': ['Normal', 'Pale', 'Swollen', 'Other'],
  '.elsc_type': ['Type 1', 'Type 2', 'Type 3', 'Other'],
  '.depth_of_cup': ['Shallow', 'Normal', 'Deep', 'Other'],
  '.colour': ['Pink', 'Pale', 'Other'],
  '.lamina': ['Visible', 'Obscured', 'Other'],
  '.margin': ['Sharp', 'Blurred', 'Other'],
  '.retinal_vessels': ['Normal', 'Tortuous', 'Other'],
  '.course': ['Straight', 'Tortuous', 'Other'],
  '.av_crossing': ['Normal', 'Abnormal', 'Other'],
  '.spontaneous_venous_pulse': ['Present', 'Absent', 'Other'],
  '.macular_area': ['Normal', 'Abnormal', 'Other'],
  '.fovea_reflex': ['Present', 'Absent', 'Other'],
  '.periphery': ['Normal', 'Abnormal', 'Other'],
  '.method': ['Applanation', 'Non-Contact', 'Digital'],
  '.test': ['Ishihara', 'Other'],
  '.result': ['Normal', 'Protanopia', 'Deuteranopia', 'Tritanopia', 'Other'],
  'visual_field.od.method': ['Confrontation', 'Automated Perimetry', 'Other'],
  'visual_field.os.method': ['Confrontation', 'Automated Perimetry', 'Other'],
  'visual_field.od.result': ['Normal', 'Defect', 'Other'],
  'visual_field.os.result': ['Normal', 'Defect', 'Other'],
  'spectacle_rx.od.lens_type': ['Single Vision', 'Bifocal', 'Progressive', 'Other'],
  'spectacle_rx.os.lens_type': ['Single Vision', 'Bifocal', 'Progressive', 'Other'],
}

const PRELIMINARY_EXTERNAL_TEST_FIELDS = [
  { key: 'general_appearance', label: 'General Appearance', options: ['Normal', 'Abnormal', 'Other'] },
  { key: 'lids_margins', label: 'Lids & Margins', options: ['Normal', 'Swollen', 'Everted', 'Other'] },
  { key: 'bulbar_conj', label: 'Bulbar Conj.', options: ['Clear', 'Injected', 'Other'] },
  { key: 'palpebral_conj', label: 'Palpebral Conj.', options: ['Clear', 'Injected', 'Other'] },
  { key: 'limbus', label: 'Limbus', options: ['Normal', 'Abnormal', 'Other'] },
  { key: 'cornea', label: 'Cornea', options: ['Clear', 'Hazy', 'Scarred', 'Other'] },
  { key: 'iris', label: 'Iris', options: ['Normal', 'Abnormal', 'Other'] },
  { key: 'ac_angle', label: 'AC Angle', options: ['Open', 'Narrow', 'Closed', 'Other'] },
  { key: 'pupil_shape', label: 'Pupil Shape', options: ['Round', 'Irregular', 'Other'] },
  { key: 'pupil_size', label: 'Pupil Size', options: ['Normal', 'Dilated', 'Constricted', 'Other'] },
]

const PRELIMINARY_PUPILLARY_FIELDS = [
  { key: 'direct', label: 'Direct', options: ['Normal', 'Sluggish', 'Absent', 'Other'] },
  { key: 'consensual', label: 'Consensual', options: ['Normal', 'Sluggish', 'Absent', 'Other'] },
  { key: 'near', label: 'Near', options: ['Normal', 'Sluggish', 'Absent', 'Other'] },
]

const PRELIMINARY_TEXT_TESTS = [
  { key: 'keratoscopy', label: 'Keratoscopy' },
  { key: 'munson_sign', label: 'Munson Sign' },
  { key: 'ocular_palpation', label: 'Ocular Palpation' },
]

function buildPrefilledPrescriptionFromExamForm(response) {
  const selectedForm = response?.selected_form ?? response?.latest_form
  const formData = selectedForm?.form_data
  if (!formData || typeof formData !== 'object') {
    return defaultNewPrescription()
  }

  const subjective = formData.refraction?.subjective ?? {}
  const spectacle = formData.spectacle_rx ?? {}
  const diagnosis = formData.diagnosis ?? {}
  const pickEye = (eyeKey) => {
    const spectacleEye = spectacle?.[eyeKey] ?? {}
    const subjectiveEye = subjective?.[eyeKey] ?? {}
    const hasSpectacle = [spectacleEye.sphere, spectacleEye.cylinder, spectacleEye.axis, spectacleEye.add, spectacleEye.va]
      .some((value) => String(value || '').trim())
    return hasSpectacle ? spectacleEye : subjectiveEye
  }

  const od = pickEye('od')
  const os = pickEye('os')

  return {
    ...defaultNewPrescription(),
    date: selectedForm?.updated_at ? String(selectedForm.updated_at).slice(0, 10) : todayIso(),
    sph_od: od?.sphere || '',
    sph_os: os?.sphere || '',
    cyl_od: od?.cylinder || '',
    cyl_os: os?.cylinder || '',
    axis_od: od?.axis || '',
    axis_os: os?.axis || '',
    add_od: od?.add || '',
    add_os: os?.add || '',
    lens_type: od?.lens_type || os?.lens_type || '',
    notes: diagnosis?.prescription || '',
  }
}

function createPatientEditForm(record) {
  return {
    surname: record.surname || '',
    firstname: record.firstname || '',
    othernames: record.othernames || '',
    sex: record.sex || 'Male',
    dob: record.dob || '',
    age: record.age || '',
    email: record.email || '',
    phone: record.phone || '',
    address: record.address || '',
    residence: record.residence || '',
    purpose: record.purpose || 'Consultation',
    comment: record.comment || '',
    appointment_date: record.appointment_date || '',
  }
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0)
  if (!value) return '0 KB'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateDisplay(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function labelize(value) {
  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function patientIconFor(label, className) {
  if (label.toLowerCase().includes('today')) return 'calendar'
  if (className === 'pending') return 'clock'
  if (className === 'seen') return 'check-badge'
  return 'patients'
}

function Field({ label, children, className = '', required = false }) {
  return (
    <label className={className}>
      {label}{required ? ' *' : ''}
      {children}
    </label>
  )
}

function InsightCard({ title, tone = 'slate', children }) {
  return (
    <article className={`patient-insight-card tone-${tone}`}>
      <div className="patient-insight-card-header">
        <strong>{title}</strong>
      </div>
      <div className="patient-insight-card-body">{children}</div>
    </article>
  )
}

function InsightMetric({ label, value }) {
  return (
    <div className="patient-insight-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function BreakdownList({ items, emptyLabel }) {
  if (!items?.length) {
    return <p className="muted-copy">{emptyLabel}</p>
  }

  const total = items.reduce((sum, item) => sum + Number(item.count ?? 0), 0)

  return (
    <div className="patient-breakdown-list">
      {items.map((item) => (
        <div key={item.label} className="patient-breakdown-row">
          <div>
            <strong>{item.label}</strong>
            <span>{formatPercent(total > 0 ? (Number(item.count ?? 0) / total) * 100 : 0)}</span>
          </div>
          <span>{item.count}</span>
        </div>
      ))}
    </div>
  )
}

function formatPercent(value) {
  return `${Number(value ?? 0).toFixed(1)}%`
}

function calculateAge(dob) {
  const dobDate = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - dobDate.getFullYear()
  const monthDiff = today.getMonth() - dobDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
    age -= 1
  }

  return age
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

function isoDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().split('T')[0]
}
