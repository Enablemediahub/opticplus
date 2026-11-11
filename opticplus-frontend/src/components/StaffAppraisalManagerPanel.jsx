import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const plusDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const mondayOf = (date) => plusDays(date, -((date.getDay() + 6) % 7))
const periodDefaults = (type = 'weekly') => {
  const today = new Date()
  const start = type === 'monthly' ? new Date(today.getFullYear(), today.getMonth(), 1) : type === 'weekly' ? mondayOf(today) : today
  const end = type === 'monthly' ? new Date(today.getFullYear(), today.getMonth() + 1, 0) : type === 'weekly' ? plusDays(start, 6) : start
  return { period_type: type, start_date: dateValue(start), end_date: dateValue(end) }
}
const blankTask = () => ({ title: '', description: '', measurement: 'checklist', target_value: '', unit: '', weight: '1', assigned_user_ids: [] })
const uniqueUserIds = (ids = []) => [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() || 'ST'

function StaffAvatar({ staff }) {
  const [imageFailed, setImageFailed] = useState(false)
  return <span className="staff-appraisal-avatar">{staff.photo_url && !imageFailed ? <img src={staff.photo_url} alt={`${staff.name} profile`} onError={() => setImageFailed(true)} /> : <span>{initials(staff.name)}</span>}</span>
}

export default function StaffAppraisalManagerPanel({ apiFetch, token, branchId, onOverallScoreChange }) {
  const [data, setData] = useState(null)
  const [form, setForm] = useState(() => ({ title: '', ...periodDefaults(), tasks: [blankTask()] }))
  const [formBranchId, setFormBranchId] = useState(Number(branchId) || 0)
  const [reviews, setReviews] = useState({})
  const [editingPeriodId, setEditingPeriodId] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [scorePeriod, setScorePeriod] = useState('month')
  const [hiddenStaffIds, setHiddenStaffIds] = useState([])
  const [showHiddenStaff, setShowHiddenStaff] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState(null)

  useEffect(() => {
    if (!token || branchId === null || branchId === undefined) return undefined
    let cancelled = false
    setData(null)
    setError('')
    apiFetch(`/staff-appraisals/manage?branch_id=${branchId}`, { token })
      .then((response) => { if (!cancelled) setData(response) })
      .catch((nextError) => { if (!cancelled) setError(nextError.message) })
    return () => { cancelled = true }
  }, [apiFetch, branchId, refresh, token])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`opticplus-appraisal-hidden-staff-${branchId}`)
      setHiddenStaffIds(stored ? uniqueUserIds(JSON.parse(stored)) : [])
    } catch {
      setHiddenStaffIds([])
    }
  }, [branchId])

  async function toggleEnabled() {
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch(`/staff-appraisals/settings?branch_id=${branchId}`, {
        method: 'PUT', token, body: { enabled: !data?.enabled },
      })
      setData((current) => ({ ...current, enabled: response.enabled }))
      setNotice(response.enabled ? 'Staff appraisals are now active for this branch.' : 'Staff appraisal prompts are paused. Past results remain saved.')
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }

  function changePeriodType(type) {
    setForm((current) => ({ ...current, ...periodDefaults(type) }))
  }

  function assignTaskToStaff(staff) {
    setSelectedStaffId(Number(staff.id))
    setEditingPeriodId(null)
    setFormBranchId(staff.assignment_scope === 'Merged branches' ? 0 : Number(branchId))
    setForm({ title: '', ...periodDefaults('weekly'), tasks: [{ ...blankTask(), assigned_user_ids: [Number(staff.id)] }] })
    setError('')
    setNotice('')
    setIsFormOpen(true)
  }

  function setStaffHidden(staffId, hidden) {
    const nextIds = hidden
      ? uniqueUserIds([...hiddenStaffIds, staffId])
      : hiddenStaffIds.filter((id) => id !== Number(staffId))
    setHiddenStaffIds(nextIds)
    try { window.localStorage.setItem(`opticplus-appraisal-hidden-staff-${branchId}`, JSON.stringify(nextIds)) } catch { /* Keep the current view even when browser storage is unavailable. */ }
  }

  async function createPeriod(event) {
    event.preventDefault()
    const taskWithMissingFields = form.tasks.findIndex((task) => (
      !task.title.trim()
      || !(task.assigned_user_ids ?? []).length
      || (task.measurement === 'target' && !(Number(task.target_value) > 0))
      || !(Number(task.weight) > 0)
    ))
    if (!form.title.trim()) {
      setError('Enter a name for this appraisal period.')
      return
    }
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) {
      setError('Choose valid start and end dates for this appraisal period.')
      return
    }
    if (taskWithMissingFields >= 0) {
      const task = form.tasks[taskWithMissingFields]
      const message = !task.title.trim()
        ? `Enter a title for task ${taskWithMissingFields + 1}.`
        : !(task.assigned_user_ids ?? []).length
          ? `Select at least one staff member for task ${taskWithMissingFields + 1}.`
          : task.measurement === 'target' && !(Number(task.target_value) > 0)
            ? `Enter a target greater than zero for task ${taskWithMissingFields + 1}.`
            : `Enter a valid weight for task ${taskWithMissingFields + 1}.`
      setError(message)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiFetch(`/staff-appraisals/periods${editingPeriodId ? `/${editingPeriodId}?branch_id=${branchId}` : `?branch_id=${formBranchId}`}`, {
        method: editingPeriodId ? 'PUT' : 'POST', token,
        body: {
          ...form,
          branch_id: formBranchId,
          tasks: form.tasks.map((task) => ({
            ...task,
            ...(task.id ? { id: Number(task.id) } : {}),
            assigned_user_ids: uniqueUserIds(task.assigned_user_ids),
            assigned_role: null,
            target_value: task.measurement === 'target' ? Number(task.target_value) : null,
            weight: Number(task.weight),
          })),
        },
      })
      setForm({ title: '', ...periodDefaults(form.period_type), tasks: [blankTask()] })
      setSelectedStaffId(null)
      setFormBranchId(Number(branchId))
      setIsFormOpen(false)
      setEditingPeriodId(null)
      setNotice(editingPeriodId ? 'Appraisal period updated.' : 'Appraisal period created and tasks assigned.')
      setRefresh((current) => current + 1)
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }

  function editPeriod(period) {
    setSelectedStaffId(null)
    setEditingPeriodId(period.id)
    setFormBranchId(Number(period.branch_id))
    setForm({
      title: period.title,
      period_type: period.period_type,
      start_date: period.start_date,
      end_date: period.end_date,
      tasks: period.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description ?? '',
        measurement: task.measurement,
        target_value: task.target_value ?? '',
        unit: task.unit ?? '',
        weight: String(task.weight),
        assigned_user_ids: uniqueUserIds(task.assignments.map((assignment) => assignment.user_id)),
      })),
    })
    setIsFormOpen(true)
    setError('')
  }

  async function deletePeriod(period) {
    if (!window.confirm(`Delete “${period.title}” and all its task progress and reviews?`)) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/staff-appraisals/periods/${period.id}?branch_id=${branchId}`, { method: 'DELETE', token })
      setNotice(`${period.title} deleted.`)
      if (editingPeriodId === period.id) {
        setEditingPeriodId(null)
        setIsFormOpen(false)
      }
      setRefresh((current) => current + 1)
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }

  async function saveReview(assignment) {
    const review = reviews[assignment.id] ?? {}
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/staff-appraisals/assignments/${assignment.id}/review?branch_id=${branchId}`, {
        method: 'PATCH', token,
        body: {
          manager_score: review.score === '' ? null : Number(review.score ?? assignment.manager_score ?? assignment.earned_percent),
          manager_note: review.note ?? assignment.manager_note ?? '',
        },
      })
      setNotice(`Review saved for ${assignment.name}.`)
      setRefresh((current) => current + 1)
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }

  async function finalize(period) {
    if (!window.confirm(`Finalize “${period.title}”? Staff scores will become final.`)) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/staff-appraisals/periods/${period.id}/finalize?branch_id=${branchId}`, { method: 'POST', token, body: {} })
      setNotice(`${period.title} finalized.`)
      setRefresh((current) => current + 1)
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }

  async function reopen(period) {
    if (!window.confirm(`Reopen “${period.title}”? Existing scores and review notes will be kept, and staff will be able to update their progress again.`)) return
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/staff-appraisals/periods/${period.id}/reopen?branch_id=${branchId}`, { method: 'POST', token, body: {} })
      setNotice(`${period.title} is active again. Existing progress and reviews were kept.`)
      setRefresh((current) => current + 1)
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }

  const changeTask = (index, key, value) => setForm((current) => ({
    ...current,
    tasks: current.tasks.map((task, taskIndex) => taskIndex === index ? { ...task, [key]: value } : task),
  }))
  const periods = data?.periods ?? []
  const activePeriods = periods.filter((period) => period.status === 'active')
  const allTasks = periods.flatMap((period) => period.tasks ?? [])
  const assignedStaff = new Set(allTasks.flatMap((task) => (task.assignments ?? []).map((assignment) => Number(assignment.user_id))))
  const pendingReviews = allTasks.flatMap((task) => task.assignments ?? []).filter((assignment) => !assignment.reviewed_at && (assignment.status === 'completed' || Number(assignment.achieved_value ?? 0) > 0)).length
  const staffOptions = [...new Map((data?.staff ?? []).map((staff) => [Number(staff.id), staff])).values()]
  const selectedStaff = staffOptions.find((staff) => Number(staff.id) === selectedStaffId)
  const visibleStaff = staffOptions.filter((staff) => !hiddenStaffIds.includes(Number(staff.id)))
  const hiddenStaff = staffOptions.filter((staff) => hiddenStaffIds.includes(Number(staff.id)))
  const selectedScores = data?.score_summary?.[scorePeriod] ?? {}
  const scoreLabel = scorePeriod === 'week' ? 'This week' : scorePeriod === 'year' ? 'This year' : 'This month'
  const scoredStaff = Object.values(selectedScores).filter((score) => Number(score?.total_weight) > 0)
  const totalScoreWeight = scoredStaff.reduce((total, score) => total + Number(score.total_weight), 0)
  const overallScore = totalScoreWeight > 0
    ? scoredStaff.reduce((total, score) => total + Number(score.weighted_points ?? 0), 0) / totalScoreWeight
    : null
  const branchLabel = Number(branchId) === 1 ? 'Labadi branch' : Number(branchId) === 2 ? 'Madina branch' : 'both branches'

  useEffect(() => {
    onOverallScoreChange?.({
      score: overallScore,
      label: 'Team overall',
      period: scoreLabel,
      scope: 'team',
    })
  }, [onOverallScoreChange, overallScore, scoreLabel])

  return (
    <section className="panel staff-appraisal-manager-panel staff-appraisal-command-center">
      <div className="staff-appraisal-people-hero">
        <div className="staff-appraisal-hero-orb staff-appraisal-hero-orb-one" />
        <div className="staff-appraisal-hero-orb staff-appraisal-hero-orb-two" />
        <div className="staff-appraisal-people-identity">
          <span className="staff-appraisal-people-mark" aria-hidden="true"><span>✦</span></span>
          <div>
            <p className="staff-appraisal-hero-kicker"><span />People & Performance</p>
            <h3>Grow people. Recognize progress.</h3>
            <p>Set clear goals, support your team, and keep performance moving across {branchLabel}.</p>
          </div>
        </div>
        <div className="staff-appraisal-hero-overall">
          <div className="staff-appraisal-hero-overall-heading">
            <span>Team overall</span>
            <strong>{overallScore === null ? '—' : `${overallScore.toFixed(1)}%`}</strong>
          </div>
          <span className="staff-appraisal-hero-overall-caption">{scoreLabel} · {scoredStaff.length} {scoredStaff.length === 1 ? 'staff member' : 'staff members'}</span>
          <div className="staff-appraisal-score-period staff-appraisal-hero-score-period" role="group" aria-label="Overall score period">
            {[['week', 'Week'], ['month', 'Month'], ['year', 'Year']].map(([value, label]) => <button type="button" key={value} className={scorePeriod === value ? 'is-selected' : ''} onClick={() => setScorePeriod(value)} aria-pressed={scorePeriod === value}>{label}</button>)}
          </div>
        </div>
        <div className="staff-appraisal-hero-status">
          <span className="staff-appraisal-hero-status-label">{Number(branchId) === 0 ? 'Merged appraisal programme' : 'Branch appraisal programme'}</span>
          <button type="button" className={'appraisal-feature-toggle staff-appraisal-feature-control' + (data?.enabled ? ' is-enabled' : '')} onClick={toggleEnabled} disabled={busy || !data} aria-pressed={Boolean(data?.enabled)}>
            <span className="appraisal-toggle-dot" />{data?.enabled ? 'Active' : 'Paused'}<span className="staff-appraisal-feature-chevron">⌄</span>
          </button>
          <small>{data?.enabled ? `Staff can view and update goals for ${branchLabel}` : `Turn on appraisals for ${branchLabel}`}</small>
        </div>
      </div>
      {Number(branchId) === 0 ? <p className="message-banner">Merged branch view: accountant and technician assignments can be created once and shared across Labadi and Madina. The switch controls merged cycles; branch-specific cycles keep their own settings.</p> : null}
      {Number(branchId) > 0 && periods.some((period) => Number(period.branch_id) === 0) ? <p className="message-banner">Merged-branch appraisal cycles are shared with the other branch and use one progress record per staff member.</p> : null}
      {error ? <p className="message-banner error">{error}</p> : null}
      {notice ? <p className="message-banner">{notice}</p> : null}

      <div className="staff-appraisal-command-stats">
        <article className="staff-appraisal-command-stat"><span className="staff-appraisal-command-stat-icon is-cycles">◷</span><div><strong>{activePeriods.length}</strong><span>Active cycles</span></div><small>currently running</small></article>
        <article className="staff-appraisal-command-stat"><span className="staff-appraisal-command-stat-icon is-goals">✧</span><div><strong>{allTasks.length}</strong><span>Goals set</span></div><small>across all cycles</small></article>
        <article className="staff-appraisal-command-stat"><span className="staff-appraisal-command-stat-icon is-people">♙</span><div><strong>{assignedStaff.size}</strong><span>Staff assigned</span></div><small>with individual goals</small></article>
        <article className="staff-appraisal-command-stat"><span className="staff-appraisal-command-stat-icon is-review">◎</span><div><strong>{pendingReviews}</strong><span>Ready to review</span></div><small>completed submissions</small></article>
      </div>

      <section className="staff-appraisal-team-overview" aria-labelledby="staff-appraisal-team-title">
        <div className="staff-appraisal-team-heading">
          <div><p className="staff-appraisal-section-kicker">Your people</p><h4 id="staff-appraisal-team-title">Team performance</h4><p>Choose a person to start an appraisal task. Scores update from submitted progress and your reviews.</p></div>
        </div>
        <div className="staff-appraisal-team-period-note"><span className="staff-appraisal-period-live-dot" /> Individual scores · {scoreLabel}</div>
        {visibleStaff.length ? <div className="staff-appraisal-staff-grid">
          {visibleStaff.map((staff) => {
            const score = selectedScores[staff.id]
            const percentage = score && Number(score.total_weight) > 0 ? Math.round(Number(score.weighted_points) / Number(score.total_weight)) : null
            const goalCount = Number(score?.goal_count ?? 0)
            const completedCount = Number(score?.completed_count ?? 0)
            return <article className="staff-appraisal-person-card" key={staff.id}>
              <button type="button" className="staff-appraisal-person-main" onClick={() => assignTaskToStaff(staff)} disabled={busy || !data} aria-label={`Assign a task to ${staff.name}`}>
                <StaffAvatar staff={staff} />
                <span className="staff-appraisal-person-copy"><strong>{staff.name}</strong><span>{staff.job_title || staff.role}</span><small>{staff.assignment_scope}</small></span>
                <span className={'staff-appraisal-person-score' + (percentage === null ? ' is-empty' : '')}><strong>{percentage === null ? '—' : `${percentage}%`}</strong><small>{percentage === null ? 'No score yet' : 'overall'}</small></span>
                <span className="staff-appraisal-person-progress"><span><i style={{ width: `${percentage ?? 0}%` }} /></span><small>{goalCount ? `${completedCount} of ${goalCount} goals complete` : 'No goals in this period'}</small></span>
                <span className="staff-appraisal-person-assign">Assign a task <i aria-hidden="true">↗</i></span>
              </button>
              <button type="button" className="staff-appraisal-person-hide" onClick={() => setStaffHidden(staff.id, true)} aria-label={`Hide ${staff.name} from this overview`} title="Hide from overview">◉</button>
            </article>
          })}
        </div> : <div className="staff-appraisal-team-empty"><span>◎</span><div><strong>No staff are displayed</strong><p>Show a team member below to bring them back to this overview.</p></div></div>}
        {hiddenStaff.length ? <div className="staff-appraisal-hidden-team">
          <button type="button" className="staff-appraisal-hidden-toggle" aria-expanded={showHiddenStaff} onClick={() => setShowHiddenStaff((shown) => !shown)}><span>Hidden from overview</span><strong>{hiddenStaff.length}</strong><i>{showHiddenStaff ? '−' : '+'}</i></button>
          {showHiddenStaff ? <div className="staff-appraisal-hidden-list">{hiddenStaff.map((staff) => <div key={staff.id}><StaffAvatar staff={staff} /><span><strong>{staff.name}</strong><small>{staff.job_title || staff.role}</small></span><button type="button" onClick={() => setStaffHidden(staff.id, false)}>Show</button></div>)}</div> : null}
        </div> : null}
      </section>

      <div className="staff-appraisal-cycle-toolbar">
        <div><p className="staff-appraisal-section-kicker">Performance planning</p><h4>Appraisal cycles</h4><p>Create a focused daily, weekly, or monthly plan for your team.</p></div>
      <button
        type="button"
        className="primary-button staff-appraisal-open-editor"
        onClick={() => {
          setSelectedStaffId(null)
          setEditingPeriodId(null)
          setFormBranchId(Number(branchId))
          setForm({ title: '', ...periodDefaults(), tasks: [blankTask()] })
          setError('')
          setIsFormOpen(true)
        }}
        disabled={busy || !data}
      >
        <span aria-hidden="true">＋</span>New appraisal cycle
      </button>
      </div>

      {isFormOpen ? createPortal(
        <div className="modal-overlay appraisal-modal-overlay" onClick={() => { if (!busy) { setIsFormOpen(false); setEditingPeriodId(null); setSelectedStaffId(null) } }}>
          <section className="modal-panel staff-appraisal-modal staff-appraisal-manager-modal" role="dialog" aria-modal="true" aria-labelledby="staff-appraisal-editor-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div><p className="eyebrow">People & Performance</p><h2 id="staff-appraisal-editor-title">{editingPeriodId ? 'Edit appraisal' : 'Create appraisal'}</h2><p className="header-copy">Set the period, tasks, assigned staff, and branch coverage.</p></div>
              <button type="button" className="ghost-button" onClick={() => { setIsFormOpen(false); setEditingPeriodId(null); setSelectedStaffId(null) }} disabled={busy}>Close</button>
            </div>
            {error ? <p className="message-banner error">{error}</p> : null}
            <form noValidate onSubmit={createPeriod}>
          <div className="staff-appraisal-form-grid">
            <label>Period name<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Week 32 performance" required /></label>
            <label>Period<select value={form.period_type} onChange={(event) => changePeriodType(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
            <label>Applies to<select value={formBranchId} onChange={(event) => setFormBranchId(Number(event.target.value))}><option value={0}>Merged branches</option><option value={1}>Labadi only</option><option value={2}>Madina only</option></select><small>Accountant and technician assignments default to merged branches.</small></label>
            <label>Starts<input type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} required /></label>
            <label>Ends<input type="date" min={form.start_date} value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} required /></label>
          </div>
          <div className="staff-appraisal-task-editor">
            {form.tasks.map((task, index) => (
              <article className="staff-appraisal-task-draft" key={index}>
                <div className="staff-appraisal-task-draft-heading"><span className="staff-appraisal-task-number">{String(index + 1).padStart(2, '0')}</span><strong>Task details</strong>{form.tasks.length > 1 ? <button type="button" className="staff-appraisal-remove-task" onClick={() => setForm((current) => ({ ...current, tasks: current.tasks.filter((_, taskIndex) => taskIndex !== index) }))}>Remove</button> : null}</div>
                <div className="staff-appraisal-form-grid">
                  <label className="staff-appraisal-task-title-field">Task<input value={task.title} onChange={(event) => changeTask(index, 'title', event.target.value)} placeholder="Confirm tomorrow’s appointments" required /></label>
                  {selectedStaffId === null ? <label className="staff-appraisal-user-picker">Assign users<select multiple size="4" value={uniqueUserIds(task.assigned_user_ids).map(String)} onChange={(event) => changeTask(index, 'assigned_user_ids', uniqueUserIds(Array.from(event.target.selectedOptions, (option) => option.value)))} required aria-label={`Staff assigned to task ${index + 1}`}>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name} · {staff.role} · {staff.assignment_scope}</option>)}</select><small>Use Ctrl (Windows) or Command (Mac) to select more than one person.</small></label> : <div className="staff-appraisal-fixed-assignee"><span>Assigned to</span>{selectedStaff ? <div><StaffAvatar staff={selectedStaff} /><span><strong>{selectedStaff.name}</strong><small>{selectedStaff.job_title || selectedStaff.role} · {selectedStaff.assignment_scope}</small></span><b>Selected from team</b></div> : <strong>This task is assigned to the selected team member.</strong>}</div>}
                  <label>Measure<select value={task.measurement} onChange={(event) => changeTask(index, 'measurement', event.target.value)}><option value="checklist">Complete / not complete</option><option value="target">Numeric target</option></select></label>
                  {task.measurement === 'target' ? <><label>Target<input type="number" min="0.01" step="0.01" value={task.target_value} onChange={(event) => changeTask(index, 'target_value', event.target.value)} required /></label><label>Unit<input value={task.unit} onChange={(event) => changeTask(index, 'unit', event.target.value)} placeholder="orders, records" /></label></> : null}
                  <label>Weight<input type="number" min="0.1" max="100" step="0.1" value={task.weight} onChange={(event) => changeTask(index, 'weight', event.target.value)} required /></label>
                  <label className="appraisal-description-field">Description<textarea rows="2" value={task.description} onChange={(event) => changeTask(index, 'description', event.target.value)} placeholder="Describe what good completion looks like" /></label>
                </div>
                <div className="staff-appraisal-assignee-preview"><span>Assigned to</span><strong>{staffOptions.filter((staff) => uniqueUserIds(task.assigned_user_ids).includes(Number(staff.id))).map((staff) => `${staff.name} · ${staff.role} · ${staff.assignment_scope}`).join(', ') || 'Select one or more staff members above'}</strong></div>
              </article>
            ))}
          </div>
          <div className="staff-appraisal-form-actions"><button type="button" className="staff-appraisal-add-task" onClick={() => setForm((current) => ({ ...current, tasks: [...current.tasks, { ...blankTask(), ...(selectedStaffId !== null ? { assigned_user_ids: [selectedStaffId] } : {}) }] }))} disabled={form.tasks.length >= 40}><span>＋</span><span><strong>Add another task</strong><small>{selectedStaffId !== null ? 'The selected team member will be assigned to each task' : 'Build a clear, weighted goal for this appraisal'}</small></span></button><div className="staff-appraisal-primary-actions"><button type="button" className="secondary-button" onClick={() => { setEditingPeriodId(null); setSelectedStaffId(null); setIsFormOpen(false); setForm({ title: '', ...periodDefaults(), tasks: [blankTask()] }) }} disabled={busy}>Cancel</button><button type="submit" className="primary-button staff-appraisal-submit" disabled={busy || !data}><span>{busy ? '◌' : '✓'}</span>{busy ? 'Saving appraisal…' : editingPeriodId ? 'Save appraisal changes' : 'Create appraisal'}</button></div></div>
          {!data && !error ? <small className="staff-appraisal-loading-note">Loading staff and branch settings…</small> : null}
        </form>
          </section>
        </div>,
        document.body,
      ) : null}

      <div className="staff-appraisal-period-list">
        {periods.length ? periods.map((period) => {
          const periodStaffCount = new Set((period.tasks ?? []).flatMap((task) => (task.assignments ?? []).map((assignment) => Number(assignment.user_id)))).size
          const periodBranchLabel = Number(period.branch_id) === 0 ? 'Merged branches' : Number(period.branch_id) === 1 ? 'Labadi' : 'Madina'
          return (
          <div className="staff-appraisal-period-row" key={period.id}>
          <details className="staff-appraisal-period">
            <summary>
              <span className="staff-appraisal-cycle-summary">
                <span className="staff-appraisal-cycle-glyph" aria-hidden="true">{period.period_type === 'monthly' ? '▦' : period.period_type === 'daily' ? '◷' : '↗'}</span>
                <span className="staff-appraisal-cycle-copy">
                  <strong>{period.title}</strong>
                  <span className="staff-appraisal-cycle-meta"><span>{period.period_type} cycle</span><i />{period.start_date} to {period.end_date}<i /><span>{periodBranchLabel}</span><i /><span>{period.tasks.length} {period.tasks.length === 1 ? 'goal' : 'goals'}</span><i /><span>{periodStaffCount} {periodStaffCount === 1 ? 'staff member' : 'staff members'}</span></span>
                </span>
              </span>
              <span className={'staff-appraisal-cycle-status ' + (period.status === 'finalized' ? 'is-final' : 'is-active')}><i />{period.status === 'finalized' ? 'Finalized' : 'Active'}</span>
            </summary>
            <div className="staff-appraisal-period-body">
              {(() => {
                const totals = new Map()
                period.tasks.forEach((task) => task.assignments.forEach((assignment) => {
                  const score = Number(assignment.manager_score ?? (task.measurement === 'target' ? Math.min(Number(assignment.achieved_value ?? 0) / Number(task.target_value) * 100, 100) : assignment.status === 'completed' ? 100 : assignment.status === 'in_progress' ? 50 : 0))
                  const total = totals.get(assignment.user_id) ?? { name: assignment.name, role: assignment.role_snapshot, weighted: 0, weight: 0, reviewed: 0, acknowledged: 0 }
                  total.weighted += Number(task.weight) * score
                  total.weight += Number(task.weight)
                  total.reviewed += assignment.reviewed_at ? 1 : 0
                  total.acknowledged += assignment.acknowledged_at ? 1 : 0
                  totals.set(assignment.user_id, total)
                }))
                return totals.size ? <div className="staff-appraisal-scoreboard">{[...totals.values()].map((employee) => <article key={employee.name}><span>{employee.name} · {employee.role}</span><strong>{employee.weight ? (employee.weighted / employee.weight).toFixed(1) : '0.0'}%</strong><small>{employee.acknowledged} acknowledged · {employee.reviewed} reviewed</small></article>)}</div> : null
              })()}
              {period.tasks.map((task) => (
                <article className="staff-appraisal-review-task" key={task.id}>
                  <div className="staff-appraisal-review-heading"><div><strong>{task.title}</strong><small>{task.weight} weight points · {task.measurement === 'target' ? `Target ${task.target_value} ${task.unit ?? ''}` : 'Completion task'}</small></div></div>
                  <div className="staff-appraisal-assignee-preview"><span>Assigned to</span><strong>{task.assignments.map((assignment) => `${assignment.name} · ${assignment.role_snapshot}`).join(', ') || 'No active users are assigned. Edit this appraisal and select the correct staff members.'}</strong></div>
                  {task.description ? <p>{task.description}</p> : null}
                  {!task.assignments.length ? <p className="muted-copy">Edit this appraisal to apply the correct role assignment. Global staff accounts are included for both branches.</p> : task.assignments.map((assignment) => {
                    const calculatedScore = task.measurement === 'target'
                      ? Math.min(Number(assignment.achieved_value ?? 0) / Number(task.target_value) * 100, 100)
                      : assignment.status === 'completed' ? 100 : assignment.status === 'in_progress' ? 50 : 0
                    const managerScore = assignment.manager_score === null || assignment.manager_score === undefined || assignment.manager_score === ''
                      ? null
                      : Number(assignment.manager_score)
                    const scoreValue = managerScore !== null && Number.isFinite(managerScore) ? managerScore : calculatedScore
                    const currentScore = Number.isFinite(Number(scoreValue)) ? Math.max(0, Math.min(100, Number(scoreValue))) : 0
                    return <div className="staff-appraisal-assignment" key={assignment.id}>
                      <div><strong>{assignment.name} · {assignment.role_snapshot}</strong><small>{assignment.status.replace('_', ' ')}{task.measurement === 'target' ? ` · achieved ${assignment.achieved_value ?? 0} / ${task.target_value} ${task.unit ?? ''}` : ''} · provisional {currentScore.toFixed(0)}%</small>{assignment.staff_note ? <small>Staff note: {assignment.staff_note}</small> : null}</div>
                      <div className="staff-appraisal-review-controls"><label>Final score %<input type="number" min="0" max="100" step="1" value={reviews[assignment.id]?.score ?? assignment.manager_score ?? currentScore} onChange={(event) => setReviews((current) => ({ ...current, [assignment.id]: { ...current[assignment.id], score: event.target.value } }))} /></label><label>Review note<input value={reviews[assignment.id]?.note ?? assignment.manager_note ?? ''} onChange={(event) => setReviews((current) => ({ ...current, [assignment.id]: { ...current[assignment.id], note: event.target.value } }))} placeholder="Optional feedback" /></label><button type="button" className="mini-action" onClick={() => saveReview(assignment)} disabled={busy}>Save review</button></div>
                    </div>
                  })}
                </article>
              ))}
              {period.status === 'active' ? <button type="button" className="primary-button" onClick={() => finalize(period)} disabled={busy}>Finalize period</button> : null}
            </div>
          </details>
          <div className="staff-appraisal-period-actions">
            {period.status === 'active' ? <button type="button" className="staff-appraisal-edit-period" onClick={() => editPeriod(period)} disabled={busy}><span aria-hidden="true">✎</span>Edit appraisal</button> : <button type="button" className="staff-appraisal-reopen-period" onClick={() => reopen(period)} disabled={busy}><span aria-hidden="true">↺</span>Reopen appraisal</button>}
            <button type="button" className="staff-appraisal-delete-period" onClick={() => deletePeriod(period)} disabled={busy}>Delete</button>
          </div>
          </div>
          )
        }) : <div className="staff-appraisal-no-cycles"><span aria-hidden="true">✧</span><div><strong>No appraisal cycles yet</strong><p>Start with one clear goal and build a consistent rhythm of feedback for your team.</p></div></div>}
      </div>
    </section>
  )
}
