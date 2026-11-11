import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const scoreCopy = (score) => {
  if (score >= 90) return 'Excellent progress'
  if (score >= 75) return 'Strong progress'
  if (score >= 50) return 'Building momentum'
  return 'Room to grow'
}

const taskStatus = (task) => {
  if (Number(task.earned_percent) >= 100) return { label: 'Completed', tone: 'complete' }
  if (task.status === 'in_progress' || Number(task.earned_percent) > 0) return { label: 'In progress', tone: 'progress' }
  return { label: 'Not started', tone: 'pending' }
}

const daysRemaining = (endDate) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(String(endDate) + 'T00:00:00')
  return Number.isNaN(end.getTime()) ? null : Math.max(0, Math.ceil((end - today) / 86400000))
}

export default function StaffAppraisalPanel({ apiFetch, token, session, showCard = true, onOverallScoreChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [open, setOpen] = useState(false)
  const [openPeriodId, setOpenPeriodId] = useState(null)
  const [drafts, setDrafts] = useState({})
  const promptInteracted = useRef(false)
  const promptToken = useRef(token)
  const role = session?.normalized_role ?? session?.role
  const staffRole = ['receptionist', 'accountant', 'technician'].includes(role)

  useEffect(() => {
    if (!token || !staffRole) return undefined
    if (promptToken.current !== token) {
      promptToken.current = token
      promptInteracted.current = false
    }
    let cancelled = false
    apiFetch('/staff-appraisals/mine', { token })
      .then((response) => {
        if (cancelled) return
        setData(response)
        const firstActivePeriod = response.enabled
          ? (response.periods ?? []).find((period) => period.status === 'active')
          : null
        if (firstActivePeriod) {
          setOpenPeriodId(firstActivePeriod.id)
          if (!promptInteracted.current) setOpen(true)
        }
      })
      .catch((nextError) => { if (!cancelled) setError(nextError.message) })
    return () => { cancelled = true }
  }, [apiFetch, refresh, staffRole, token])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        promptInteracted.current = true
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const activePeriods = useMemo(() => (data?.periods ?? []).filter((period) => period.status === 'active'), [data])
  const currentPeriod = useMemo(() => activePeriods.find((period) => Number(period.id) === Number(openPeriodId)) ?? activePeriods[0] ?? null, [activePeriods, openPeriodId])
  const displayPeriods = useMemo(() => activePeriods.length ? activePeriods : (data?.periods ?? []).slice(0, 1), [activePeriods, data])
  const heroPeriod = displayPeriods[0] ?? null
  const reminderPeriod = activePeriods.find((period) => period.tasks.some((task) => !task.acknowledged_at || taskStatus(task).tone !== 'complete')) ?? currentPeriod
  const reminderCount = activePeriods.reduce((total, period) => total + period.tasks.filter((task) => !task.acknowledged_at || taskStatus(task).tone !== 'complete').length, 0)
  const shouldShowReminder = Boolean(data?.enabled && reminderCount > 0)

  useEffect(() => {
    onOverallScoreChange?.(heroPeriod ? {
      score: Number(heroPeriod.score) || 0,
      label: 'Your appraisal',
      period: heroPeriod.period_type ? `${heroPeriod.period_type.charAt(0).toUpperCase()}${heroPeriod.period_type.slice(1)} review` : 'Current period',
      scope: 'personal',
    } : null)
  }, [heroPeriod, onOverallScoreChange])

  if (!staffRole) return null

  function valuesFor(task) {
    return drafts[task.assignment_id] ?? { status: task.status, achieved_value: task.achieved_value ?? '', staff_note: task.staff_note ?? '' }
  }

  async function saveTask(task, acknowledge = false) {
    const draft = valuesFor(task)
    setBusy(true)
    setError('')
    try {
      await apiFetch('/staff-appraisals/assignments/' + task.assignment_id, {
        method: 'PATCH', token,
        body: {
          status: draft.status,
          ...(draft.achieved_value !== '' ? { achieved_value: Number(draft.achieved_value) } : {}),
          staff_note: draft.staff_note,
          ...(acknowledge ? { acknowledge: true } : {}),
        },
      })
      promptInteracted.current = true
      setOpen(false)
      setRefresh((value) => value + 1)
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }

  async function acknowledgeAll() {
    if (!currentPeriod) return
    setBusy(true)
    setError('')
    try {
      const pending = currentPeriod.tasks.filter((task) => !task.acknowledged_at)
      await Promise.all(pending.map((task) => {
        const draft = valuesFor(task)
        return apiFetch('/staff-appraisals/assignments/' + task.assignment_id, {
          method: 'PATCH', token,
          body: { status: draft.status, ...(draft.achieved_value !== '' ? { achieved_value: Number(draft.achieved_value) } : {}), acknowledge: true },
        })
      }))
      const nextUnseenPeriod = activePeriods.find((period) => Number(period.id) !== Number(currentPeriod.id) && period.tasks.some((task) => !task.acknowledged_at))
      if (nextUnseenPeriod) setOpenPeriodId(nextUnseenPeriod.id)
      promptInteracted.current = true
      setOpen(false)
      setRefresh((value) => value + 1)
    } catch (nextError) { setError(nextError.message) } finally { setBusy(false) }
  }

  const updateModal = open && currentPeriod?.status === 'active' ? createPortal(
    <div className="staff-appraisal-top-layer" onClick={() => { promptInteracted.current = true; setOpen(false) }}>
      <section className="staff-appraisal-top-notch" role="dialog" aria-modal="false" aria-labelledby="staff-appraisal-modal-title" onClick={(event) => event.stopPropagation()}>
        <span className="staff-appraisal-top-notch-handle" aria-hidden="true" />
        <header className="staff-appraisal-top-header">
          <div className="staff-appraisal-top-heading">
            <span className="staff-appraisal-top-symbol" aria-hidden="true">✦</span>
            <div><p className="eyebrow">People &amp; Performance <span>·</span> {currentPeriod.period_type} review</p><h2 id="staff-appraisal-modal-title">Welcome back, {session?.name || 'team member'}</h2><p>Your goals for {currentPeriod.title} <span>·</span> {currentPeriod.start_date} — {currentPeriod.end_date}</p></div>
          </div>
          <div className="staff-appraisal-top-score"><strong>{(Number(currentPeriod.score) || 0).toFixed(1)}%</strong><span>{currentPeriod.is_final ? 'Final overall score' : 'Overall appraisal score'}</span></div>
          <button type="button" className="staff-appraisal-top-minimize" aria-label="Minimize appraisal reminder" onClick={() => { promptInteracted.current = true; setOpen(false) }}>⌃</button>
        </header>
        {error ? <div className="message-banner error staff-appraisal-top-error">{error}</div> : null}
        <div className="staff-appraisal-top-tasks">
          {currentPeriod.tasks.map((task, index) => {
            const draft = valuesFor(task)
            const status = taskStatus(task)
            return <article className="staff-appraisal-modal-task staff-appraisal-modal-task-premium staff-appraisal-top-task" key={task.assignment_id}>
              <div className="staff-appraisal-modal-task-heading">
                <div className="staff-appraisal-task-title-row"><span className="staff-appraisal-task-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{task.title}</strong><small>{task.weight} weight points · {status.label}</small>{task.description ? <p>{task.description}</p> : null}</div></div>
                <span className="staff-appraisal-task-score">{(Number(task.earned_percent) || 0).toFixed(0)}%</span>
              </div>
              {task.measurement === 'target'
                ? <label>Achievement <span>Target {task.target_value} {task.unit ?? ''}</span><input type="number" min="0" step="0.01" value={draft.achieved_value} onChange={(event) => setDrafts((current) => ({ ...current, [task.assignment_id]: { ...draft, achieved_value: event.target.value } }))} disabled={currentPeriod.status !== 'active'} /></label>
                : <label>Task status<select value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [task.assignment_id]: { ...draft, status: event.target.value } }))}><option value="pending">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></label>}
              <label>Note for your manager<textarea rows="2" value={draft.staff_note} onChange={(event) => setDrafts((current) => ({ ...current, [task.assignment_id]: { ...draft, staff_note: event.target.value } }))} placeholder="Add context or a progress update" /></label>
              {task.manager_note ? <div className="staff-appraisal-manager-feedback"><span>Manager feedback</span><p>{task.manager_note}</p></div> : null}
              <div className="staff-appraisal-task-actions"><span>{task.acknowledged_at ? 'Goal acknowledged' : 'New goal'}{task.reviewed_at ? ' · manager reviewed' : ''}</span><button type="button" className="mini-action" onClick={() => saveTask(task)} disabled={busy}>{busy ? 'Saving…' : 'Save progress'}</button></div>
            </article>
          })}
        </div>
        <footer className="staff-appraisal-top-footer"><span>Scores remain provisional until reviewed by the General Manager.</span><button type="button" className="primary-button" onClick={acknowledgeAll} disabled={busy}>{busy ? 'Saving…' : 'I’ve seen my goals'} <span aria-hidden="true">→</span></button></footer>
      </section>
    </div>,
    document.body,
  ) : null

  const reminderToast = !open && shouldShowReminder && reminderPeriod ? createPortal(
    <button type="button" className="staff-appraisal-reminder-toast" onClick={() => { promptInteracted.current = true; setOpenPeriodId(reminderPeriod.id); setOpen(true) }}>
      <span className="staff-appraisal-reminder-pulse" aria-hidden="true" />
      <span className="staff-appraisal-reminder-copy"><strong>Your appraisal is ready</strong><small>{reminderCount} {reminderCount === 1 ? 'goal' : 'goals'} to review or update</small></span>
      <span className="staff-appraisal-reminder-score"><strong>{(Number(reminderPeriod.score) || 0).toFixed(1)}%</strong><small>overall</small></span>
      <span className="staff-appraisal-reminder-action">View goals <b aria-hidden="true">↗</b></span>
      <span key={reminderCount} className="staff-appraisal-reminder-count" aria-label={`${reminderCount} goals to review or update`}>{reminderCount}</span>
    </button>,
    document.body,
  ) : null

  return (
    <>
      {error ? <div className="message-banner error staff-appraisal-error">Appraisal: {error}</div> : null}
      {showCard && displayPeriods.length ? displayPeriods.map((period) => {
        const score = Math.max(0, Math.min(100, Number(period.score) || 0))
        const completed = period.tasks.filter((task) => taskStatus(task).tone === 'complete').length
        const inProgress = period.tasks.filter((task) => taskStatus(task).tone === 'progress').length
        const remaining = daysRemaining(period.end_date)
        const periodLabel = period.period_type ? period.period_type.charAt(0).toUpperCase() + period.period_type.slice(1) + ' review' : 'Performance review'
        return (
          <section className="panel staff-appraisal-staff-card" key={period.id}>
            <div className="staff-appraisal-hub-header">
              <div className="staff-appraisal-hub-copy">
                <span className="staff-appraisal-hub-icon" aria-hidden="true">✦</span>
                <div><p className="eyebrow">My performance</p><h3>{period.title}</h3><p>{periodLabel} <span>·</span> {period.start_date} to {period.end_date}{Number(period.branch_id) === 0 ? ' · Merged branches' : ''}</p></div>
              </div>
              <span className={'staff-appraisal-period-badge ' + (period.status === 'finalized' ? 'is-final' : 'is-active')}><i />{period.status === 'finalized' ? 'Finalized' : 'In progress'}</span>
            </div>

            <div className="staff-appraisal-overview">
              <div className="staff-appraisal-score-panel">
                <div className="staff-appraisal-score-ring" style={{ '--score-angle': String(score * 3.6) + 'deg' }}><div><strong>{score.toFixed(1)}%</strong><span>weighted score</span></div></div>
                <div className="staff-appraisal-score-copy"><span>{period.is_final ? 'Final result' : 'Current standing'}</span><strong>{scoreCopy(score)}</strong><small>Updated as progress is recorded</small></div>
              </div>
              <div className="staff-appraisal-stat-grid">
                <article><span className="staff-appraisal-stat-icon is-complete">✓</span><div><strong>{completed}<small> / {period.tasks.length}</small></strong><span>Goals completed</span></div></article>
                <article><span className="staff-appraisal-stat-icon is-progress">↗</span><div><strong>{inProgress}</strong><span>In progress</span></div></article>
                <article><span className="staff-appraisal-stat-icon is-time">◷</span><div><strong>{remaining === null ? '—' : remaining}</strong><span>{remaining === 1 ? 'Day remaining' : 'Days remaining'}</span></div></article>
              </div>
            </div>

            <div className="staff-appraisal-goals-heading"><div><p className="eyebrow">Your objectives</p><h4>Goals and progress</h4></div><span>{period.tasks.length} {period.tasks.length === 1 ? 'goal' : 'goals'}</span></div>
            <div className="staff-appraisal-progress-list">
              {period.tasks.map((task, index) => {
                const status = taskStatus(task)
                const earned = Math.max(0, Math.min(100, Number(task.earned_percent) || 0))
                return <article className="staff-appraisal-progress-item" key={task.assignment_id}>
                  <div className="staff-appraisal-progress-item-top"><span className="staff-appraisal-task-index">{String(index + 1).padStart(2, '0')}</span><span className={'staff-appraisal-task-status is-' + status.tone}>{status.label}</span></div>
                  <strong>{task.title}</strong>
                  <span className="staff-appraisal-progress-description">{task.measurement === 'target' ? 'Target ' + task.target_value + ' ' + (task.unit ?? '') + ' · achieved ' + (task.achieved_value ?? 0) + ' ' + (task.unit ?? '') : task.weight + ' weight points'}</span>
                  <div className="staff-appraisal-task-progress"><div><i style={{ width: String(earned) + '%' }} /></div><span>{earned.toFixed(0)}%</span></div>
                  {task.manager_note ? <div className="staff-appraisal-feedback-preview"><span>Manager feedback</span><p>{task.manager_note}</p></div> : null}
                </article>
              })}
            </div>
            {period.status === 'active' ? <div className="staff-appraisal-hub-footer"><span>Keep your progress up to date. Your manager can review your notes and results.</span><button type="button" className="primary-button staff-appraisal-update-button" onClick={() => { promptInteracted.current = true; setOpenPeriodId(period.id); setOpen(true) }}>Review goals <span aria-hidden="true">→</span></button></div> : null}
          </section>
        )
      }) : null}

      {showCard && !displayPeriods.length && !error && data ? (
        <section className="panel staff-appraisal-empty-state">
          <span className="staff-appraisal-empty-icon" aria-hidden="true">✦</span>
          <p className="eyebrow">My performance</p>
          <h3>No appraisal assigned yet</h3>
          <p>Your appraisal goals and score will appear here when your General Manager assigns them to you.</p>
        </section>
      ) : null}
      {showCard && !data && !error ? <section className="panel staff-appraisal-empty-state is-loading"><span className="staff-appraisal-empty-icon" aria-hidden="true">◷</span><p className="eyebrow">My performance</p><h3>Loading your appraisal</h3><p>Your current goals and progress are on the way.</p></section> : null}
      {updateModal}
      {reminderToast}
    </>
  )
}
