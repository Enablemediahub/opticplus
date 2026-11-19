import { useCallback, useEffect, useState } from 'react'
import './HRSpaceAdminPanel.css'

const initialLetter = { employee_id: '', target_role: '', title: '', body: '' }
const initialCommunication = { employee_id: '', title: '', message: '' }
const initialRule = { title: '', description: '', target_value: '', full_score_allowance: '', active: true }
const initialScore = { employee_id: '', rule_id: '', period: new Date().toISOString().slice(0, 7), score: '', notes: '' }
const initialScorecardItem = { title: '', description: '', weight: '', target_description: '', target_value: '', target_unit: '', direction: 'quality' }
const initialScorecard = { role_title: '', branch: '*', max_monthly_allowance: '0', active: true, items: [{ ...initialScorecardItem, weight: '100' }] }
const initialAssessment = { employee_id: '', scorecard_id: '', period: new Date().toISOString().slice(0, 7), targets_confirmed: false, summary_notes: '', items: [] }
const hrSections = ['letters', 'requests', 'leave', 'people', 'performance']
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const needsAnnualLeaveNoticeReview = (request) => {
  if (!request.start_date) return false
  const daysUntil = (new Date(`${request.start_date}T00:00:00`).getTime() - Date.now()) / 86400000
  return daysUntil >= 0 && daysUntil < 30
}

export default function HRSpaceAdminPanel({ token, apiFetch, visible, onClose }) {
  const [data, setData] = useState({ letters: [], templates: [], requests: [], employees: [], rules: [], results: [], scorecards: [], assessments: [], payoutBands: [], kpiFrameworkReady: null, leaveEntitlements: [], publicHolidays: [], communications: [], communicationsReady: null, leaveYear: new Date().getFullYear(), leaveTrackingReady: null })
  const [letter, setLetter] = useState(initialLetter)
  const [rule, setRule] = useState(initialRule)
  const [score, setScore] = useState(initialScore)
  const [scorecardForm, setScorecardForm] = useState(initialScorecard)
  const [editingScorecardId, setEditingScorecardId] = useState(null)
  const [payoutBandsForm, setPayoutBandsForm] = useState([])
  const [assessmentForm, setAssessmentForm] = useState(initialAssessment)
  const [editingAssessmentId, setEditingAssessmentId] = useState(null)
  const [managerResponseForms, setManagerResponseForms] = useState({})
  const [editingTemplateId, setEditingTemplateId] = useState(null)
  const [reviewNotes, setReviewNotes] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeSection, setActiveSection] = useState(() => {
    const match = window.location.hash.match(/^#\/hr-space\/(letters|requests|leave|people|performance)$/)
    return match?.[1] || 'people'
  })
  const [search, setSearch] = useState('')
  const [letterAttachment, setLetterAttachment] = useState(null)
  const [communication, setCommunication] = useState(initialCommunication)
  const [communicationFile, setCommunicationFile] = useState(null)
  const [managerSignature, setManagerSignature] = useState('')
  const [managerSignatureUpdatedAt, setManagerSignatureUpdatedAt] = useState(null)
  const [managerSignatureFile, setManagerSignatureFile] = useState(null)
  const [managerSignatureError, setManagerSignatureError] = useState('')
  const [isSavingManagerSignature, setIsSavingManagerSignature] = useState(false)
  const [reviewLeavePayments, setReviewLeavePayments] = useState({})
  const [entitlementForm, setEntitlementForm] = useState({ employee_id: '', leave_year: String(new Date().getFullYear()), entitlement_days: '15', carried_forward_days: '0', working_days: [1, 2, 3, 4, 5, 6], adjustment_note: '' })
  const [holidayForm, setHolidayForm] = useState({ holiday_date: '', name: '', notes: '' })
  const [interruptionForms, setInterruptionForms] = useState({})
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(() => {
    const match = window.location.hash.match(/^#\/hr-space\/staff\/(\d+)$/)
    return match ? Number(match[1]) : null
  })

  const reload = useCallback(async () => {
    const response = await apiFetch('/manager/hr-space', { token })
    setData(response)
  }, [apiFetch, token])

  const loadManagerSignature = useCallback(async () => {
    try {
      const response = await apiFetch('/manager/hr-space/letter-signature', { token })
      setManagerSignature(response.signature || '')
      setManagerSignatureUpdatedAt(response.updated_at || null)
      setManagerSignatureError('')
    } catch (nextError) {
      setManagerSignatureError(nextError.message)
    }
  }, [apiFetch, token])

  useEffect(() => {
    if (visible) reload().catch((nextError) => setError(nextError.message))
  }, [visible, reload])

  useEffect(() => {
    setPayoutBandsForm(data.payoutBands.map((band) => ({
      minimum_score: String(band.minimum_score),
      payout_percent: String(band.payout_percent),
      label: band.label,
    })))
  }, [data.payoutBands])

  useEffect(() => {
    if (visible) loadManagerSignature()
  }, [visible, loadManagerSignature])

  useEffect(() => {
    const syncWorkspaceRoute = () => {
      const match = window.location.hash.match(/^#\/hr-space\/staff\/(\d+)$/)
      setSelectedEmployeeId(match ? Number(match[1]) : null)
      const sectionMatch = window.location.hash.match(/^#\/hr-space\/(letters|requests|leave|people|performance)$/)
      if (sectionMatch) setActiveSection(sectionMatch[1])
      else if (window.location.hash === '#/hr-space') setActiveSection('people')
    }
    window.addEventListener('hashchange', syncWorkspaceRoute)
    return () => window.removeEventListener('hashchange', syncWorkspaceRoute)
  }, [])

  function navigateSection(section) {
    if (!hrSections.includes(section)) return
    setSelectedEmployeeId(null)
    setActiveSection(section)
    window.location.hash = `#/hr-space/${section}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function perform(action, successMessage = '') {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await action()
      setNotice(response?.message || successMessage)
      await reload()
      return response
    } catch (nextError) {
      setError(nextError.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  function saveLetter(event) {
    event.preventDefault()
    const payload = new FormData()
    payload.append('employee_id', letter.employee_id || '')
    payload.append('target_role', letter.target_role || '')
    payload.append('title', letter.title)
    payload.append('body', letter.body)
    if (letterAttachment) payload.append('attachment', letterAttachment)
    perform(() => apiFetch('/manager/hr-space/letters', { method: 'POST', token, body: payload }), 'Draft letter created.')
      .then((response) => { if (response) { setLetter(initialLetter); setLetterAttachment(null) } })
  }

  function saveTemplate(event) {
    event?.preventDefault()
    if (!letter.title.trim() || !letter.body.trim()) {
      setError('Enter a letter title and body before saving a reusable template.')
      return
    }
    const existingTemplate = data.templates.find((item) => item.id === editingTemplateId)
    perform(() => apiFetch(editingTemplateId ? `/manager/hr-space/letter-templates/${editingTemplateId}` : '/manager/hr-space/letter-templates', {
      method: editingTemplateId ? 'PUT' : 'POST', token, body: { title: letter.title, body: letter.body, active: existingTemplate?.active ?? true },
    }), 'Reusable letter template saved.').then((response) => { if (response) { setEditingTemplateId(null); setLetter(initialLetter) } })
  }

  async function toggleLetter(item) {
    await perform(() => apiFetch(`/manager/hr-space/letters/${item.id}/publish`, { method: 'PATCH', token }), 'Letter status updated.')
  }

  async function saveManagerSignature() {
    if (!managerSignatureFile) {
      setManagerSignatureError('Choose a PNG, JPG or WebP signature image first.')
      return
    }
    setIsSavingManagerSignature(true)
    setManagerSignatureError('')
    try {
      const body = new FormData()
      body.append('signature', managerSignatureFile)
      const response = await apiFetch('/manager/hr-space/letter-signature', {
        method: 'POST',
        token,
        body,
      })
      setManagerSignature(response.signature || '')
      setManagerSignatureUpdatedAt(response.updated_at || null)
      setManagerSignatureFile(null)
      setNotice(response.message || 'Reusable letter signature saved.')
    } catch (nextError) {
      setManagerSignatureError(nextError.message)
    } finally {
      setIsSavingManagerSignature(false)
    }
  }

  async function deleteManagerSignature() {
    if (!window.confirm('Remove the reusable General Manager signature? It will no longer appear on staff letters.')) return
    setIsSavingManagerSignature(true)
    setManagerSignatureError('')
    try {
      const response = await apiFetch('/manager/hr-space/letter-signature', {
        method: 'DELETE',
        token,
      })
      setManagerSignature('')
      setManagerSignatureUpdatedAt(null)
      setManagerSignatureFile(null)
      setNotice(response.message || 'Reusable letter signature removed.')
    } catch (nextError) {
      setManagerSignatureError(nextError.message)
    } finally {
      setIsSavingManagerSignature(false)
    }
  }

  function saveCommunication(event) {
    event.preventDefault()
    if (!communication.message.trim() && !communicationFile) {
      setError('Add a message or attach a PDF before publishing.')
      return
    }
    const body = new FormData()
    body.append('employee_id', communication.employee_id)
    body.append('title', communication.title)
    body.append('message', communication.message)
    if (communicationFile) body.append('attachment', communicationFile)
    perform(() => apiFetch('/manager/hr-space/communications', {
      method: 'POST',
      token,
      body,
    }), 'Staff update published.').then((response) => {
      if (response) {
        setCommunication(initialCommunication)
        setCommunicationFile(null)
      }
    })
  }

  function deleteCommunication(item) {
    if (!window.confirm(`Remove "${item.title}" from staff updates?`)) return
    perform(() => apiFetch(`/manager/hr-space/communications/${item.id}`, {
      method: 'DELETE',
      token,
    }), 'Staff update removed.')
  }

  async function editLetter(item) {
    if (item.status === 'published') {
      setError('Unpublish the letter before changing its content.')
      return
    }
    setLetter({ employee_id: item.employee_id || '', target_role: item.target_role || '', title: item.title, body: item.body })
    setLetterAttachment(null)
    setError('Editing this draft: make changes below and use Save draft.')
    setNotice('')
    setEditingLetterId(item.id)
  }

  function previewSavedLetter(item) {
    setLetter({ employee_id: item.employee_id || '', target_role: item.target_role || '', title: item.title, body: item.body })
    setEditingLetterId(null)
    setEditingTemplateId(null)
    setError('Previewing the saved letter. Changes here are not saved unless you choose a save action.')
    setNotice('')
    document.querySelector('.staff-hr-letter-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const [editingLetterId, setEditingLetterId] = useState(null)
  async function saveEditedLetter(event) {
    event.preventDefault()
    const payload = new FormData()
    payload.append('_method', 'PUT')
    payload.append('employee_id', letter.employee_id || '')
    payload.append('target_role', letter.target_role || '')
    payload.append('title', letter.title)
    payload.append('body', letter.body)
    if (letterAttachment) payload.append('attachment', letterAttachment)
    const response = await perform(() => apiFetch(`/manager/hr-space/letters/${editingLetterId}`, {
      method: 'POST', token, body: payload,
    }), 'Draft letter updated.')
    if (response) { setEditingLetterId(null); setLetter(initialLetter); setLetterAttachment(null) }
  }

  async function downloadLetter(item) {
    try {
      const base = (import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`).replace(/\/+$/, '')
      const response = await fetch(`${base}/manager/hr-space/letters/${item.id}/attachment`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Letter attachment is unavailable.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = item.attachment_name || 'hr-letter'
      link.click()
      URL.revokeObjectURL(url)
    } catch (nextError) { setError(nextError.message) }
  }

  function deleteLetter(item) {
    if (item.status === 'published' || !window.confirm(`Delete the draft “${item.title}”?`)) return
    perform(() => apiFetch(`/manager/hr-space/letters/${item.id}`, { method: 'DELETE', token }), 'Draft letter deleted.')
  }

  function deleteTemplate(item) {
    if (!window.confirm(`Delete the reusable template “${item.title}”?`)) return
    perform(() => apiFetch(`/manager/hr-space/letter-templates/${item.id}`, { method: 'DELETE', token }), 'Letter template deleted.')
  }

  const query = search.trim().toLowerCase()
  const matches = (item) => !query || [item.title, item.role_title, item.role_title_snapshot, item.employee_name, item.staff_id, item.ghana_card_name, item.job_title, item.employee_branch, item.branch, item.department, item.request_type, item.status, item.rule_title, item.name].some((value) => String(value || '').toLowerCase().includes(query))
  const filteredLetters = data.letters.filter(matches)
  const filteredRequests = data.requests.filter(matches)
  const filteredEmployees = data.employees.filter(matches)
  const filteredRules = data.rules.filter(matches)
  const filteredResults = data.results.filter(matches)
  const filteredScorecards = data.scorecards.filter(matches)
  const filteredAssessments = data.assessments.filter(matches)
  const roleOptions = [...new Set(data.employees.map((item) => item.job_title).filter(Boolean))].sort((left, right) => left.localeCompare(right))
  const branchOptions = [...new Set(data.employees.map((item) => item.branch).filter(Boolean))].sort((left, right) => left.localeCompare(right))
  const selectedEmployee = data.employees.find((item) => String(item.id) === String(selectedEmployeeId))
  const selectedResults = selectedEmployee ? data.results.filter((item) => String(item.employee_id) === String(selectedEmployee.id)) : []
  const selectedAssessments = selectedEmployee ? data.assessments.filter((item) => String(item.employee_id) === String(selectedEmployee.id)) : []
  const selectedRequests = selectedEmployee ? data.requests.filter((item) => String(item.employee_id) === String(selectedEmployee.id)) : []
  const selectedLetters = selectedEmployee ? data.letters.filter((item) => (
    String(item.employee_id || '') === String(selectedEmployee.id)
    || (!item.employee_id && (!item.target_role || item.target_role.trim().toLowerCase() === String(selectedEmployee.job_title || '').trim().toLowerCase()))
  )) : []
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const selectedPublishedResults = selectedResults.filter((item) => item.status === 'published')
  const selectedPublishedAssessments = selectedAssessments.filter((item) => item.status === 'published')
  const selectedPeriodAllowance = [
    ...selectedPublishedResults,
    ...selectedPublishedAssessments,
  ].filter((item) => item.period === currentPeriod)
    .reduce((total, item) => total + Number(item.calculated_allowance || 0), 0)
  const selectedLatestResult = [
    ...selectedPublishedResults.map((item) => ({ period: item.period, score: item.score })),
    ...selectedPublishedAssessments.map((item) => ({ period: item.period, score: item.total_score })),
  ].sort((left, right) => String(right.period).localeCompare(String(left.period)))[0]
  const sectionTitles = { letters: 'Letters & templates', requests: 'Employee requests', leave: 'Leave tracking', people: 'Staff directory', performance: 'KPI & allowances' }
  const previewEmployee = data.employees.find((item) => String(item.id) === String(letter.employee_id))
    || data.employees.find((item) => letter.target_role && item.job_title === letter.target_role)
    || data.employees[0]
  const previewBody = letter.body
    .replaceAll('{employee_name}', previewEmployee?.ghana_card_name || 'Employee name')
    .replaceAll('{staff_id}', previewEmployee?.staff_id || 'Staff ID')
    .replaceAll('{job_title}', previewEmployee?.job_title || 'Position')
    .replaceAll('{department}', previewEmployee?.department || 'Department')
    .replaceAll('{date}', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
  const assessmentScorecard = data.scorecards.find((item) => String(item.id) === String(assessmentForm.scorecard_id))
  const assessmentScore = Number(assessmentForm.items.reduce((total, item) => (
    total + (item.rating === '' || item.rating == null ? 0 : Number(item.weight) * Number(item.rating) / 5)
  ), 0).toFixed(2))
  const assessmentBand = [...data.payoutBands]
    .sort((left, right) => Number(right.minimum_score) - Number(left.minimum_score))
    .find((item) => Number(item.minimum_score) <= assessmentScore)
  const assessmentAllowance = Number(assessmentScorecard?.max_monthly_allowance || 0) * Number(assessmentBand?.payout_percent || 0) / 100

  function printLetterPreview() {
    const popup = window.open('', '_blank', 'width=900,height=1100')
    if (!popup) { setError('Allow pop-ups to print or save this letter preview as PDF.'); return }
    const title = escapeHtml(letter.title || 'Letter preview')
    const body = escapeHtml(previewBody || '').replace(/\n/g, '<br>')
    const signature = managerSignature
      ? `<img class="signature-image" src="${escapeHtml(managerSignature)}" alt="General Manager signature">`
      : ''
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{size:letter;margin:56mm 22mm 30mm}*{box-sizing:border-box}html,body{margin:0;width:216mm;min-height:279mm;font-family:Arial,sans-serif;color:#202020}.letterhead{position:fixed;z-index:0;inset:0;width:216mm;height:279mm;object-fit:fill}.content{position:relative;z-index:1;font-size:11pt;line-height:1.55}.content h1{font-size:15pt;margin:0 0 10mm;color:#17324f}.signature{margin-top:24mm;font-size:10pt}.signature-image{display:block;max-width:48mm;max-height:22mm;object-fit:contain;object-position:left bottom}.signature strong{display:block;margin-top:3mm}.toolbar{position:fixed;right:20px;top:20px;z-index:2;border:0;border-radius:8px;padding:11px 15px;background:#176fc2;color:#fff;font:600 13px Arial;cursor:pointer}@media screen{body{padding:56mm 22mm 30mm}.letterhead{position:absolute}}@media print{html,body{width:auto;min-height:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}}</style></head><body><img class="letterhead" src="/bealet-letterhead.png" alt=""><article class="content"><h1>${title}</h1>${body}<div class="signature">${signature}<div>General Manager</div><strong>For Bealet Optical Centre Limited</strong></div></article><button class="toolbar" onclick="window.print()">Download / Save as PDF</button></body></html>`)
    popup.document.close()
  }

  function openEmployeeProfile(employee) {
    setSelectedEmployeeId(employee.id)
    window.location.hash = `#/hr-space/staff/${employee.id}`
    setScore({ ...initialScore, employee_id: String(employee.id), period: currentPeriod })
    setError('')
    setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function reviewRequest(item, status) {
    perform(() => apiFetch(`/manager/hr-space/requests/${item.id}/decision`, {
      method: 'PATCH', token, body: { status, review_note: reviewNotes[item.id] || '', ...(status === 'approved' && item.request_type === 'leave' && item.leave_type === 'annual' ? { leave_remuneration: reviewLeavePayments[item.id] } : {}) },
    }), 'Request decision recorded.')
  }

  function saveLeaveEntitlement(event) {
    event.preventDefault()
    perform(() => apiFetch('/manager/hr-space/leave-entitlements', {
      method: 'POST', token, body: { ...entitlementForm, leave_year: Number(entitlementForm.leave_year), entitlement_days: Number(entitlementForm.entitlement_days), carried_forward_days: Number(entitlementForm.carried_forward_days || 0) },
    }), 'Annual leave entitlement and work schedule saved.')
  }

  function savePublicHoliday(event) {
    event.preventDefault()
    perform(() => apiFetch('/manager/hr-space/public-holidays', { method: 'POST', token, body: holidayForm }), 'Public holiday added to the leave calendar.')
      .then((response) => { if (response) setHolidayForm({ holiday_date: '', name: '', notes: '' }) })
  }

  function saveLeaveInterruption(item) {
    const values = interruptionForms[item.id] || {}
    perform(() => apiFetch(`/manager/hr-space/requests/${item.id}/interruption`, {
      method: 'PATCH', token, body: { interrupted_working_days: values.days ?? item.interrupted_working_days ?? 0, interruption_note: values.note || '' },
    }), 'Leave interruption recorded and unused days restored.')
  }

  async function downloadAttachment(item) {
    try {
      const response = await fetch(`${(import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`).replace(/\/+$/, '')}/manager/hr-space/requests/${item.id}/attachment`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Attachment is unavailable.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = item.attachment_name || 'hr-attachment'
      link.click()
      URL.revokeObjectURL(url)
    } catch (nextError) { setError(nextError.message) }
  }

  function saveRule(event) {
    event.preventDefault()
    perform(() => apiFetch('/manager/hr-space/kpi-rules', {
      method: 'POST', token, body: { ...rule, target_value: rule.target_value || null },
    }), 'KPI rule created.').then((response) => { if (response) setRule(initialRule) })
  }

  async function toggleRule(item) {
    await perform(() => apiFetch(`/manager/hr-space/kpi-rules/${item.id}`, {
      method: 'PUT', token, body: { ...item, active: !item.active },
    }), 'KPI rule status updated.')
  }

  function saveScore(event) {
    event.preventDefault()
    perform(() => apiFetch('/manager/hr-space/kpi-results', { method: 'POST', token, body: score }), 'KPI score saved.')
      .then((response) => { if (response) setScore(initialScore) })
  }

  function applicableScorecards(employeeId) {
    const employee = data.employees.find((item) => String(item.id) === String(employeeId))
    if (!employee) return []
    return data.scorecards
      .filter((item) => item.active
        && item.role_title.trim().toLowerCase() === String(employee.job_title || '').trim().toLowerCase()
        && (item.branch === '*' || item.branch.trim().toLowerCase() === String(employee.branch || '').trim().toLowerCase()))
      .sort((left, right) => Number(left.branch === '*') - Number(right.branch === '*'))
  }

  function buildAssessmentItems(scorecard) {
    return (scorecard?.items || [])
      .filter((item) => item.active)
      .map((item) => ({
        scorecard_item_id: item.id,
        title_snapshot: item.title,
        description_snapshot: item.description || '',
        weight: Number(item.weight),
        target_description_snapshot: item.target_description || '',
        target_value_snapshot: item.target_value,
        target_unit_snapshot: item.target_unit || '',
        direction_snapshot: item.direction || 'quality',
        rating: '',
        evidence: '',
        notes: '',
      }))
  }

  function startKpiAssessment(employeeId = '', preferredScorecardId = '') {
    const cards = applicableScorecards(employeeId)
    const scorecard = cards.find((item) => String(item.id) === String(preferredScorecardId)) || cards[0]
    setAssessmentForm({
      ...initialAssessment,
      employee_id: String(employeeId || ''),
      period: currentPeriod,
      scorecard_id: scorecard ? String(scorecard.id) : '',
      targets_confirmed: false,
      items: buildAssessmentItems(scorecard),
    })
    setEditingAssessmentId(null)
  }

  function changeAssessmentEmployee(employeeId) {
    startKpiAssessment(employeeId)
  }

  function changeAssessmentScorecard(scorecardId) {
    const scorecard = data.scorecards.find((item) => String(item.id) === String(scorecardId))
    setAssessmentForm((previous) => ({
      ...previous,
      scorecard_id: scorecardId,
      items: buildAssessmentItems(scorecard),
    }))
    setEditingAssessmentId(null)
  }

  function editKpiScorecard(item) {
    setScorecardForm({
      role_title: item.role_title,
      branch: item.branch,
      max_monthly_allowance: String(item.max_monthly_allowance),
      active: Boolean(item.active),
      items: item.items.filter((criterion) => criterion.active).map((criterion) => ({
        id: criterion.id,
        title: criterion.title,
        description: criterion.description || '',
        weight: String(criterion.weight),
        target_description: criterion.target_description || '',
        target_value: criterion.target_value == null ? '' : String(criterion.target_value),
        target_unit: criterion.target_unit || '',
        direction: criterion.direction || 'quality',
      })),
    })
    setEditingScorecardId(item.id)
    document.getElementById('hr-kpi-scorecard-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function saveKpiScorecard(event) {
    event.preventDefault()
    const payload = {
      ...scorecardForm,
      branch: scorecardForm.branch || '*',
      max_monthly_allowance: Number(scorecardForm.max_monthly_allowance || 0),
      items: scorecardForm.items.map((item) => ({
        ...item,
        weight: Number(item.weight),
        target_value: item.target_value === '' ? null : Number(item.target_value),
      })),
    }
    const path = editingScorecardId
      ? `/manager/hr-space/kpi-scorecards/${editingScorecardId}`
      : '/manager/hr-space/kpi-scorecards'
    perform(() => apiFetch(path, {
      method: editingScorecardId ? 'PUT' : 'POST',
      token,
      body: payload,
    }), 'Role scorecard saved.')
      .then((response) => {
        if (response) {
          setScorecardForm(initialScorecard)
          setEditingScorecardId(null)
        }
      })
  }

  function toggleKpiScorecard(item) {
    perform(() => apiFetch(`/manager/hr-space/kpi-scorecards/${item.id}`, {
      method: 'PUT',
      token,
      body: {
        ...item,
        active: !item.active,
        items: item.items.filter((criterion) => criterion.active).map((criterion) => ({
          ...criterion,
          target_value: criterion.target_value == null ? null : Number(criterion.target_value),
        })),
      },
    }), `Role scorecard ${item.active ? 'deactivated' : 'activated'}.`)
  }

  function updateScorecardItem(index, key, value) {
    setScorecardForm((previous) => ({
      ...previous,
      items: previous.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
  }

  function addScorecardItem() {
    setScorecardForm((previous) => ({ ...previous, items: [...previous.items, { ...initialScorecardItem }] }))
  }

  function removeScorecardItem(index) {
    setScorecardForm((previous) => ({
      ...previous,
      items: previous.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  function editKpiAssessment(item) {
    setAssessmentForm({
      employee_id: String(item.employee_id),
      scorecard_id: String(item.scorecard_id),
      period: item.period,
      targets_confirmed: Boolean(item.targets_confirmed_at),
      summary_notes: item.summary_notes || '',
      items: item.items.map((criterion) => ({
        scorecard_item_id: criterion.scorecard_item_id,
        title_snapshot: criterion.title_snapshot,
        description_snapshot: criterion.description_snapshot || '',
        weight: Number(criterion.weight),
        target_description_snapshot: criterion.target_description_snapshot || '',
        target_value_snapshot: criterion.target_value_snapshot,
        target_unit_snapshot: criterion.target_unit_snapshot || '',
        direction_snapshot: criterion.direction_snapshot || 'quality',
        rating: criterion.rating == null ? '' : String(criterion.rating),
        evidence: criterion.evidence || '',
        notes: criterion.notes || '',
      })),
    })
    setEditingAssessmentId(item.id)
    document.getElementById('hr-kpi-assessment-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function saveKpiAssessment(event) {
    event.preventDefault()
    const payload = {
      ...assessmentForm,
      employee_id: Number(assessmentForm.employee_id),
      scorecard_id: Number(assessmentForm.scorecard_id),
      items: assessmentForm.items.map((item) => ({
        ...item,
        scorecard_item_id: Number(item.scorecard_item_id),
        rating: item.rating === '' ? null : Number(item.rating),
      })),
    }
    const path = editingAssessmentId
      ? `/manager/hr-space/kpi-assessments/${editingAssessmentId}`
      : '/manager/hr-space/kpi-assessments'
    perform(() => apiFetch(path, {
      method: editingAssessmentId ? 'PUT' : 'POST',
      token,
      body: payload,
    }), 'KPI assessment saved as a draft.')
      .then((response) => {
        if (response) {
          setAssessmentForm(initialAssessment)
          setEditingAssessmentId(null)
        }
      })
  }

  function reviewKpiAssessment(item, status) {
    perform(() => apiFetch(`/manager/hr-space/kpi-assessments/${item.id}/review`, {
      method: 'PATCH',
      token,
      body: { status },
    }), `KPI assessment ${status}.`)
  }

  function respondToKpiAssessment(item, event) {
    event.preventDefault()
    perform(() => apiFetch(`/manager/hr-space/kpi-assessments/${item.id}/response`, {
      method: 'PATCH',
      token,
      body: { manager_response: managerResponseForms[item.id] ?? item.manager_response ?? '' },
    }), 'Response saved for the employee.')
  }

  function saveKpiAllowanceBands(event) {
    event.preventDefault()
    perform(() => apiFetch('/manager/hr-space/kpi-allowance-bands', {
      method: 'PUT',
      token,
      body: {
        bands: payoutBandsForm.map((band) => ({
          ...band,
          minimum_score: Number(band.minimum_score),
          payout_percent: Number(band.payout_percent),
        })),
      },
    }), 'KPI payout bands saved.')
  }

  return (
    <section className="panel staff-hr-admin-panel staff-hr-admin-workspace">
      <header className="staff-hr-workspace-header"><div><p className="eyebrow">GENERAL MANAGER · PEOPLE OPERATIONS</p><h1>Bealet HR Space</h1><p>Manage staff records, letters, requests and performance allowances.</p></div><button type="button" className="secondary-button" onClick={onClose}>Back to Home</button></header>
      {error && <div className="message-banner error">{error}</div>}{notice && <div className="message-banner success">{notice}</div>}
      {data.leaveTrackingReady === false && <div className="staff-hr-schema-notice" role="status"><strong>Leave tracking database setup is pending.</strong><span>The staff directory and other HR pages remain available. Run the leave tracking SQL in phpMyAdmin to activate leave balances and the holiday calendar.</span></div>}

      {!selectedEmployee && activeSection === 'people' && <div className="staff-hr-summary-grid"><article><span>Active staff</span><strong>{data.employees.length}</strong></article><article><span>Published letters</span><strong>{data.letters.filter((item) => item.status === 'published').length}</strong></article><article><span>Requests to review</span><strong>{data.requests.filter((item) => item.status === 'pending').length}</strong></article><article><span>Published KPI results</span><strong>{data.results.filter((item) => item.status === 'published').length}</strong></article></div>}
      <nav className="staff-hr-workspace-tabs" aria-label="HR workspace pages">{hrSections.map((id) => <button type="button" key={id} className={activeSection === id && !selectedEmployee ? 'is-active' : ''} aria-current={activeSection === id && !selectedEmployee ? 'page' : undefined} onClick={() => navigateSection(id)}>{sectionTitles[id]}</button>)}</nav>
      <label className="staff-hr-search">Search all HR records<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by staff name, ID, title or status" /></label>

      {selectedEmployee ? <section className="staff-hr-person-page">
        <div className="staff-hr-person-page-header">
          <button type="button" className="secondary-button" onClick={() => { setSelectedEmployeeId(null); window.location.hash = '#/hr-space' }}>← HR overview</button>
          <div className="staff-hr-person-identity">
            <div className="staff-hr-person-avatar-large">{selectedEmployee.photo_url ? <img src={selectedEmployee.photo_url} alt={`${selectedEmployee.ghana_card_name} profile`} /> : <span>{selectedEmployee.ghana_card_name?.slice(0, 1) || 'B'}</span>}</div>
            <div><p className="eyebrow">INDIVIDUAL STAFF PROFILE</p><h2>{selectedEmployee.ghana_card_name}</h2><p>{selectedEmployee.job_title || 'Team member'} · {selectedEmployee.department || 'Bealet Optical Centre'}</p><small>{selectedEmployee.staff_id} · {selectedEmployee.branch || 'Branch not assigned'}</small></div>
          </div>
        </div>

        <div className="staff-hr-summary-grid staff-hr-person-summary">
          <article><span>Published KPIs</span><strong>{selectedPublishedResults.length + selectedPublishedAssessments.length}</strong><small>Visible in the employee portal</small></article>
          <article><span>Latest published score</span><strong>{selectedLatestResult ? `${Number(selectedLatestResult.score)}%` : '—'}</strong><small>{selectedLatestResult?.period || 'No published score yet'}</small></article>
          <article><span>Published allowance · {currentPeriod}</span><strong>GH₵{selectedPeriodAllowance.toFixed(2)}</strong><small>Matches this employee’s HR Space</small></article>
          <article><span>Current monthly salary</span><strong>GH₵{Number(selectedEmployee.salary || 0).toFixed(2)}</strong><small>Current employee record</small></article>
          <article><span>Open HR requests</span><strong>{selectedRequests.filter((item) => item.status === 'pending').length}</strong><small>{selectedRequests.length} total requests</small></article>
        </div>

        <div className="staff-hr-person-columns">
          <section className="staff-hr-admin-block staff-hr-person-results">
            <div className="staff-hr-block-heading"><div><h4>Monthly scorecards and allowances</h4><p>Drafts and approved assessments remain manager-only until published.</p></div><button type="button" className="primary-button" onClick={() => { startKpiAssessment(selectedEmployee.id); setSelectedEmployeeId(null); setActiveSection('performance'); window.location.hash = '#/hr-space/performance' }}>Assess this employee</button></div>
            {selectedAssessments.length ? <div className="staff-hr-record-list">{selectedAssessments.map((item) => <article key={item.id}><div><strong>{item.role_title_snapshot} · {item.period}</strong><small>Score {Number(item.total_score)}/100 · allowance GH₵{Number(item.calculated_allowance).toFixed(2)} of GH₵{Number(item.max_monthly_allowance).toFixed(2)} · {item.status}</small>{item.summary_notes && <p>{item.summary_notes}</p>}{item.employee_comment && <p>Employee comment: {item.employee_comment}</p>}</div></article>)}</div> : <p className="muted-copy">No role-based monthly assessments have been recorded for this employee.</p>}
            {selectedResults.length > 0 && <details className="staff-kpi-legacy"><summary>Older single-score KPI entries</summary><div className="staff-hr-record-list">{selectedResults.map((item) => <article key={item.id}><div><strong>{item.rule_title}</strong><small>{item.period} · score {Number(item.score)}% · allowance GH₵{Number(item.calculated_allowance).toFixed(2)} · {item.status}</small>{item.notes && <p>{item.notes}</p>}</div></article>)}</div></details>}
          </section>

          <section className="staff-hr-admin-block">
            <h4>Employee requests</h4>
            {selectedRequests.length ? <div className="staff-hr-record-list">{selectedRequests.map((item) => <article key={item.id}><div><strong>{item.request_type.replace('_', ' ')}</strong><small>{item.start_date || 'No date'}{item.end_date ? ` – ${item.end_date}` : ''} · {item.status}{item.working_days_requested != null ? ` · ${Number(item.working_days_requested).toFixed(2)} working days` : ''}</small><p>{item.reason}</p>{item.review_note && <small>Manager note: {item.review_note}</small>}</div>{item.status === 'pending' && <div className="staff-hr-review">{item.leave_type === 'annual' && <label className="staff-hr-inline-field">Leave remuneration paid (GHS)<input type="number" min="0.01" step="0.01" value={reviewLeavePayments[item.id] || ''} onChange={(event) => setReviewLeavePayments({ ...reviewLeavePayments, [item.id]: event.target.value })} /></label>}<div className="modal-actions"><button className="primary-button" onClick={() => reviewRequest(item, 'approved')} disabled={busy || (item.leave_type === 'annual' && !Number(reviewLeavePayments[item.id]))}>Approve</button><button className="secondary-button" onClick={() => reviewRequest(item, 'rejected')} disabled={busy}>Reject</button></div></div>}</article>)}</div> : <p className="muted-copy">No HR requests from this employee.</p>}
          </section>

          <section className="staff-hr-admin-block">
            <h4>Letters for this employee</h4>
            {selectedLetters.length ? <div className="staff-hr-record-list">{selectedLetters.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.target_role || (item.employee_id ? 'Direct to employee' : 'All staff')} · {item.status}</small><details><summary>Preview letter</summary><p>{item.body}</p></details></div><div className="modal-actions">{item.attachment_name && <button className="secondary-button" onClick={() => downloadLetter(item)}>Attachment</button>}<button className="secondary-button" onClick={() => toggleLetter(item)}>{item.status === 'published' ? 'Unpublish' : 'Publish'}</button></div></article>)}</div> : <p className="muted-copy">No letters currently target this employee.</p>}
          </section>
        </div>
      </section> : <>
      {activeSection === 'people' && <section className="staff-hr-directory-panel">
        <div className="staff-hr-directory-heading"><div><p className="eyebrow">YOUR TEAM</p><h2>Staff directory</h2><p>Choose a staff member to review their individual HR profile, KPI scores, allowance and requests.</p></div><span>{filteredEmployees.length} staff</span></div>
        {filteredEmployees.length ? <div className="staff-hr-avatar-directory">{filteredEmployees.map((item) => <button type="button" key={item.id} className="staff-hr-avatar-card" onClick={() => openEmployeeProfile(item)} aria-label={`Open ${item.ghana_card_name}'s HR profile`}>
          <span className="staff-hr-avatar-circle">{item.photo_url ? <img src={item.photo_url} alt="" loading="lazy" /> : <span>{item.ghana_card_name?.slice(0, 1) || 'B'}</span>}</span><strong>{item.ghana_card_name}</strong><small>{item.job_title || 'Team member'}</small><span className="staff-hr-avatar-open">View profile <span aria-hidden="true">→</span></span>
        </button>)}</div> : <p className="muted-copy">No staff match your search.</p>}
      </section>}

      <div className="staff-hr-page-content">
        {activeSection === 'letters' && <section id="hr-workspace-letters" className="staff-hr-admin-block staff-hr-letter-page">
          {data.communicationsReady === false ? <div className="staff-hr-schema-notice" role="status"><strong>Staff messages and document uploads need a one-time database upgrade.</strong><span>Run database/manual_sql/hr_staff_communications.sql in phpMyAdmin, then reload HR Space.</span></div> : <section className="staff-hr-admin-block staff-hr-communications">
            <div className="staff-hr-block-heading"><div><h4>Staff documents & messages</h4><p>Publish a message, attach a PDF manual, or do both. Updates appear in the staff dashboard and notify the selected audience.</p></div></div>
            <form className="patient-filter-grid" onSubmit={saveCommunication}>
              <label>Title<input maxLength="180" required value={communication.title} onChange={(event) => setCommunication({ ...communication, title: event.target.value })} placeholder="e.g. Bealet staff manual" /></label>
              <label>Send to<select value={communication.employee_id} onChange={(event) => setCommunication({ ...communication, employee_id: event.target.value })}><option value="">All active staff</option>{data.employees.map((item) => <option key={item.id} value={item.id}>{item.ghana_card_name} · {item.staff_id}</option>)}</select></label>
              <label className="staff-hr-wide">Message (optional if a PDF is attached)<textarea rows="3" maxLength="10000" value={communication.message} onChange={(event) => setCommunication({ ...communication, message: event.target.value })} placeholder="Add context or instructions for staff." /></label>
              <label className="staff-hr-wide">Attach PDF (optional, up to 20 MB)<input key={communicationFile?.name || 'communication-empty'} type="file" accept="application/pdf,.pdf" onChange={(event) => setCommunicationFile(event.target.files?.[0] || null)} /></label>
              {communicationFile && <small className="staff-hr-wide">Selected: {communicationFile.name}</small>}
              <button className="primary-button staff-hr-wide" disabled={busy}>Publish update</button>
            </form>
            {data.communications.length ? <div className="staff-hr-record-list">{data.communications.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.employee_id ? (item.employee_name || item.staff_id || `Staff #${item.employee_id}`) : 'All active staff'} · Published {item.published_at ? new Date(item.published_at).toLocaleString() : ''}{item.attachment_name ? ` · ${item.attachment_name}` : ''}</small>{item.message && <p>{item.message}</p>}</div><button type="button" className="secondary-button staff-hr-danger-button" onClick={() => deleteCommunication(item)} disabled={busy}>Remove</button></article>)}</div> : <p className="muted-copy">No staff messages or documents have been published.</p>}
          </section>}
          <div className="staff-hr-letter-grid">
          <div className="staff-hr-letter-editor">
          <h4>{editingLetterId ? 'Edit draft letter' : 'Create a staff letter'}</h4>
          <div className="staff-hr-manager-signature">
            <div>
              <strong>Reusable General Manager signature</strong>
              <p>Privately stored and appended to letters shown to staff. PNG, JPG or WebP, up to 2 MB.</p>
              {managerSignatureUpdatedAt && <small>Last updated {new Date(managerSignatureUpdatedAt).toLocaleString()}</small>}
            </div>
            {managerSignature && <img src={managerSignature} alt="Current General Manager signature" />}
            <label>Upload or replace signature<input key={managerSignatureFile?.name || 'signature-empty'} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setManagerSignatureFile(event.target.files?.[0] || null); setManagerSignatureError('') }} /></label>
            <div className="modal-actions">
              <button type="button" className="primary-button" disabled={!managerSignatureFile || isSavingManagerSignature} onClick={saveManagerSignature}>{isSavingManagerSignature ? 'Saving…' : 'Save signature'}</button>
              {managerSignature && <button type="button" className="secondary-button staff-hr-danger-button" disabled={isSavingManagerSignature} onClick={deleteManagerSignature}>Remove signature</button>}
            </div>
            {managerSignatureError && <p className="staff-hr-signature-error" role="alert">{managerSignatureError}</p>}
          </div>
          <form className="patient-filter-grid" onSubmit={editingLetterId ? saveEditedLetter : editingTemplateId ? saveTemplate : saveLetter}>
            <label className="staff-hr-wide">Use reusable template<select value="" onChange={(event) => { const item = data.templates.find((template) => String(template.id) === event.target.value); if (item) setLetter({ ...letter, title: item.title, body: item.body }) }}><option value="">Start from a blank letter</option>{data.templates.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label>Specific employee (optional)<select value={letter.employee_id} onChange={(event) => setLetter({ ...letter, employee_id: event.target.value, target_role: '' })}><option value="">No individual employee</option>{data.employees.map((item) => <option key={item.id} value={item.id}>{item.ghana_card_name} · {item.staff_id}</option>)}</select></label>
            <label>Target role (optional)<select value={letter.target_role} disabled={Boolean(letter.employee_id)} onChange={(event) => setLetter({ ...letter, target_role: event.target.value })}><option value="">All staff</option>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
            <label>Letter title<input value={letter.title} onChange={(event) => setLetter({ ...letter, title: event.target.value })} maxLength="180" required /></label>
            <label className="staff-hr-wide">Letter body<textarea rows="5" value={letter.body} onChange={(event) => setLetter({ ...letter, body: event.target.value })} required /></label>
            <label className="staff-hr-wide">Attach a letter or supporting file (PDF, Word or image, up to 15 MB)<input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => setLetterAttachment(event.target.files?.[0] || null)} /></label>
            <div className="staff-hr-wide modal-actions"><button className="primary-button" disabled={busy}>{editingLetterId ? 'Save draft' : editingTemplateId ? 'Save template changes' : 'Create draft'}</button>{!editingTemplateId && <button type="button" className="secondary-button" onClick={saveTemplate} disabled={busy}>Save as reusable template</button>}{(editingLetterId || editingTemplateId) && <button type="button" className="secondary-button" onClick={() => { setEditingLetterId(null); setEditingTemplateId(null); setLetter(initialLetter); setError('') }}>Cancel edit</button>}</div>
          </form>
          </div>
          <aside className="staff-hr-document-preview-panel" aria-live="polite">
            <div className="staff-hr-preview-heading"><div><h4>Live document preview</h4><p>Updates as you edit. Template fields are filled from the selected employee.</p></div><span>BEALET LETTERHEAD</span></div>
            <div className="staff-hr-document-preview">
              <div className="staff-hr-document-preview-content">
                <h2>{letter.title || 'Letter title'}</h2>
                <div className="staff-hr-document-preview-body">{previewBody || 'Your letter text will appear here as you type.'}</div>
                <div className="staff-hr-document-preview-signature">
                  {managerSignature && <img src={managerSignature} alt="General Manager signature" />}
                  <span>General Manager</span>
                  <strong>For Bealet Optical Centre Limited</strong>
                </div>
              </div>
            </div>
            {previewEmployee && <p className="staff-hr-preview-recipient">Preview recipient: {previewEmployee.ghana_card_name} · {previewEmployee.staff_id}</p>}
            <button type="button" className="primary-button staff-hr-preview-print" onClick={printLetterPreview}>Download / Print letter PDF</button>
          </aside>
          </div>
          <p className="muted-copy">Template variables: {'{employee_name}'}, {'{staff_id}'}, {'{job_title}'}, {'{department}'}, {'{date}'}. Enter any individual figures directly into the letter before publishing.</p>
          {data.templates.length > 0 && <div className="staff-hr-record-list">{data.templates.filter(matches).map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>Reusable template · {item.active ? 'Active' : 'Inactive'}</small></div><div className="modal-actions"><button className="secondary-button" onClick={() => { setEditingLetterId(null); setEditingTemplateId(item.id); setLetter({ employee_id: '', target_role: '', title: item.title, body: item.body }); setError('Editing reusable template.') }}>Edit</button><button className="secondary-button" onClick={() => perform(() => apiFetch(`/manager/hr-space/letter-templates/${item.id}`, { method: 'PUT', token, body: { ...item, active: !item.active } }), 'Template status updated.')}>{item.active ? 'Deactivate' : 'Activate'}</button><button className="secondary-button staff-hr-danger-button" onClick={() => deleteTemplate(item)}>Delete</button></div></article>)}</div>}
          <div className="staff-hr-record-list">{filteredLetters.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.employee_name || item.target_role || 'All staff'} · {item.status}{item.attachment_name ? ` · ${item.attachment_name}` : ''}</small></div><div className="modal-actions"><button className="secondary-button" onClick={() => previewSavedLetter(item)}>Preview</button>{item.attachment_name && <button className="secondary-button" onClick={() => downloadLetter(item)}>Download</button>}<button className="secondary-button" onClick={() => editLetter(item)}>Edit</button><button className="secondary-button" onClick={() => toggleLetter(item)}>{item.status === 'published' ? 'Unpublish' : 'Publish'}</button>{item.status !== 'published' && <button className="secondary-button staff-hr-danger-button" onClick={() => deleteLetter(item)}>Delete</button>}</div></article>)}</div>
        </section>}

        {activeSection === 'requests' && <section id="hr-workspace-requests" className="staff-hr-admin-block">
          <h4>Employee HR requests</h4>
          {filteredRequests.length ? <div className="staff-hr-record-list">{filteredRequests.map((item) => <article key={item.id} className="staff-hr-request-row"><div><strong>{item.employee_name} · {item.request_type.replace('_', ' ')}</strong><small>{item.staff_id} · {item.start_date || 'No date'}{item.end_date ? ` – ${item.end_date}` : ''} · {item.status}{item.working_days_requested != null ? ` · ${Number(item.working_days_requested).toFixed(2)} working days` : ''}</small>{item.leave_type === 'annual' && needsAnnualLeaveNoticeReview(item) && <small className="staff-hr-notice-warning">Requested dates are less than 30 days away. Section 27 says notice should be given at least 30 days beforehand as far as possible; review the circumstances.</small>}<p>{item.reason}</p>{item.leave_type === 'annual' && <small>Annual entitlement year {item.leave_year} · Leave remuneration recorded: GHS {Number(item.leave_remuneration || 0).toFixed(2)}{Number(item.interrupted_working_days || 0) ? ` · ${Number(item.interrupted_working_days).toFixed(2)} interrupted days restored` : ''}</small>}{item.attachment_name && <button className="secondary-button" onClick={() => downloadAttachment(item)}>Download {item.attachment_name}</button>}</div>{item.status === 'pending' && <div className="staff-hr-review">{item.request_type === 'leave' && item.leave_type === 'annual' && <label className="staff-hr-inline-field">Normal remuneration paid for this leave (GHS)<input type="number" min="0.01" step="0.01" value={reviewLeavePayments[item.id] || ''} onChange={(event) => setReviewLeavePayments({ ...reviewLeavePayments, [item.id]: event.target.value })} required /></label>}<input placeholder="Decision note (optional)" value={reviewNotes[item.id] || ''} onChange={(event) => setReviewNotes({ ...reviewNotes, [item.id]: event.target.value })} /><div className="modal-actions"><button className="primary-button" onClick={() => reviewRequest(item, 'approved')} disabled={busy || (item.leave_type === 'annual' && !Number(reviewLeavePayments[item.id]))}>Approve</button><button className="secondary-button" onClick={() => reviewRequest(item, 'rejected')} disabled={busy}>Reject</button></div></div>}</article>)}</div> : <p className="muted-copy">No employee requests match your search.</p>}
        </section>}

        {activeSection === 'leave' && (data.leaveTrackingReady === false ? <section className="staff-hr-admin-block"><h4>Annual leave tracking</h4><p>The leave tracking tables or request columns are missing. The rest of HR Space is available. Run <code>staff_leave_tracking_upgrade.sql</code> once in phpMyAdmin, then reload this page.</p></section> : <section id="hr-workspace-leave" className="staff-hr-admin-block staff-hr-leave-block">
          <h4>Annual leave tracking · {data.leaveYear}</h4>
          <p className="muted-copy">The Labour Act baseline is 15 working days with full pay in a calendar year of continuous service. Sundays and configured public holidays are excluded from date calculations. Check each employee’s actual work pattern; any entitlement adjustment below 15 requires a recorded review note.</p>
          <form className="patient-filter-grid" onSubmit={saveLeaveEntitlement}>
            <label className="staff-hr-wide">Employee<select required value={entitlementForm.employee_id} onChange={(event) => { const existing = data.leaveEntitlements.find((item) => String(item.employee_id) === event.target.value); setEntitlementForm({ ...entitlementForm, employee_id: event.target.value, leave_year: String(data.leaveYear), entitlement_days: String(existing?.entitlement_days ?? 15), carried_forward_days: String(existing?.carried_forward_days ?? 0), working_days: existing?.working_days || [1, 2, 3, 4, 5, 6], adjustment_note: existing?.adjustment_note || '' }) }}><option value="">Select staff member</option>{data.employees.map((item) => <option key={item.id} value={item.id}>{item.ghana_card_name} · {item.staff_id} · {item.job_title}</option>)}</select></label>
            <label>Leave year<input type="number" min="2020" max="2100" value={entitlementForm.leave_year} onChange={(event) => setEntitlementForm({ ...entitlementForm, leave_year: event.target.value })} required /></label>
            <label>Annual entitlement (working days)<input type="number" min="0" max="366" step="0.5" value={entitlementForm.entitlement_days} onChange={(event) => setEntitlementForm({ ...entitlementForm, entitlement_days: event.target.value })} required /></label>
            <label>Carry-forward days<input type="number" min="0" max="366" step="0.5" value={entitlementForm.carried_forward_days} onChange={(event) => setEntitlementForm({ ...entitlementForm, carried_forward_days: event.target.value })} /></label>
            <div className="staff-hr-wide staff-hr-weekday-picker"><strong>Employee's scheduled working days (Sundays are excluded from annual-leave counting)</strong><div>{[['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]].map(([label, day]) => <label key={day}><input type="checkbox" checked={entitlementForm.working_days.includes(day)} onChange={(event) => setEntitlementForm({ ...entitlementForm, working_days: event.target.checked ? [...entitlementForm.working_days, day].sort() : entitlementForm.working_days.filter((value) => value !== day) })} />{label}</label>)}</div></div>
            <label className="staff-hr-wide">Adjustment / schedule note (required for entitlement below 15)<textarea rows="2" maxLength="1500" value={entitlementForm.adjustment_note} onChange={(event) => setEntitlementForm({ ...entitlementForm, adjustment_note: event.target.value })} /></label>
            <button className="primary-button staff-hr-wide" disabled={busy || !entitlementForm.working_days.length}>Save leave entitlement and work schedule</button>
          </form>

          <h4 className="staff-hr-subheading">Employee leave balances</h4>
          <div className="staff-hr-record-list">{data.leaveEntitlements.map((item) => <article key={`${item.employee_id}-${item.leave_year}`}><div><strong>{item.employee_name} · {item.staff_id}</strong><small>{item.leave_year} · entitlement {Number(item.entitlement_days).toFixed(2)} + carry-forward {Number(item.carried_forward_days).toFixed(2)} · used {Number(item.days_used).toFixed(2)} · pending {Number(item.days_pending).toFixed(2)} · available {Number(item.days_available).toFixed(2)} days</small><small>Workdays: {(item.working_days || []).map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')}{item.adjustment_note ? ` · ${item.adjustment_note}` : ''}</small></div><button className="secondary-button" onClick={() => setEntitlementForm({ employee_id: String(item.employee_id), leave_year: String(item.leave_year), entitlement_days: String(item.entitlement_days), carried_forward_days: String(item.carried_forward_days), working_days: item.working_days || [1, 2, 3, 4, 5, 6], adjustment_note: item.adjustment_note || '' })}>Edit</button></article>)}</div>

          <h4 className="staff-hr-subheading">Leave dates and remuneration register</h4>
          <p className="muted-copy">Annual leave can be recorded in separate approved periods. If urgent recall interrupts approved leave, record the unused working days here; they are restored to the employee’s balance for rescheduling. For termination, update the calendar-year entitlement to the accrued amount and document the calculation in its adjustment note.</p>
          {data.requests.filter((item) => item.request_type === 'leave').length ? <div className="staff-hr-record-list">{data.requests.filter((item) => item.request_type === 'leave').map((item) => <article key={item.id}><div><strong>{item.employee_name} · {item.leave_type || 'Leave'} · {item.status}</strong><small>{item.staff_id} · {item.start_date} – {item.end_date} · requested {Number(item.working_days_requested || 0).toFixed(2)} · approved {Number(item.working_days_approved || 0).toFixed(2)} working days · remuneration GH₵{Number(item.leave_remuneration || 0).toFixed(2)}</small><p>{item.reason}</p>{item.review_note && <small>Review note: {item.review_note}</small>}{item.status === 'approved' && item.leave_type === 'annual' && <div className="staff-hr-interruption-form"><label className="staff-hr-inline-field">Total interrupted days to restore<input type="number" min="0" max={Number(item.working_days_approved || 0)} step="0.5" value={interruptionForms[item.id]?.days ?? String(item.interrupted_working_days || 0)} onChange={(event) => setInterruptionForms({ ...interruptionForms, [item.id]: { ...(interruptionForms[item.id] || {}), days: event.target.value } })} /></label><label className="staff-hr-inline-field">Urgent interruption and rescheduling note<input value={interruptionForms[item.id]?.note ?? ''} onChange={(event) => setInterruptionForms({ ...interruptionForms, [item.id]: { ...(interruptionForms[item.id] || {}), note: event.target.value } })} placeholder="Explain the recall and planned rescheduling" /></label><button className="secondary-button" onClick={() => saveLeaveInterruption(item)} disabled={busy}>Record interruption</button></div>}</div></article>)}</div> : <p className="muted-copy">No leave requests have been recorded yet.</p>}

          <h4 className="staff-hr-subheading">Public-holiday calendar</h4>
          <form className="patient-filter-grid" onSubmit={savePublicHoliday}><label>Holiday date<input type="date" value={holidayForm.holiday_date} onChange={(event) => setHolidayForm({ ...holidayForm, holiday_date: event.target.value })} required /></label><label>Holiday name<input maxLength="180" value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} required /></label><label className="staff-hr-wide">Notes (optional)<input value={holidayForm.notes} onChange={(event) => setHolidayForm({ ...holidayForm, notes: event.target.value })} /></label><button className="primary-button staff-hr-wide" disabled={busy}>Add public holiday</button></form>
          {data.publicHolidays.length ? <div className="staff-hr-record-list">{data.publicHolidays.map((holiday) => <article key={holiday.id}><div><strong>{holiday.name}</strong><small>{holiday.holiday_date}{holiday.notes ? ` · ${holiday.notes}` : ''}</small></div><button className="secondary-button staff-hr-danger-button" onClick={() => perform(() => apiFetch(`/manager/hr-space/public-holidays/${holiday.id}`, { method: 'DELETE', token }), 'Public holiday removed.')}>Remove</button></article>)}</div> : <p className="muted-copy">No public holidays are entered yet. Add each official holiday so annual leave-day estimates exclude it.</p>}
        </section>)}

        {activeSection === 'performance' && <div id="hr-workspace-performance" className="staff-hr-page-content">
          {data.kpiFrameworkReady === false && <div className="staff-hr-schema-notice" role="status"><strong>KPI scorecard database setup is pending.</strong><span>Apply <code>database/manual_sql/hr_kpi_scorecard_framework.sql</code> to enable editable scorecards and assessments.</span></div>}
          {data.kpiFrameworkReady && <>
            <section id="hr-kpi-scorecard-editor" className="staff-hr-admin-block">
              <div className="staff-hr-block-heading"><div><h4>{editingScorecardId ? 'Edit role scorecard' : 'Create role scorecard'}</h4><p>Role and branch-specific criteria. Weights must total exactly 100; set a measurable target before each assessment month.</p></div></div>
              <form className="patient-filter-grid staff-kpi-form" onSubmit={saveKpiScorecard}>
                <label>Role title<input list="staff-kpi-role-options" maxLength="180" value={scorecardForm.role_title} onChange={(event) => setScorecardForm({ ...scorecardForm, role_title: event.target.value })} required /><datalist id="staff-kpi-role-options">{roleOptions.map((roleTitle) => <option key={roleTitle} value={roleTitle} />)}</datalist></label>
                <label>Branch target<select value={scorecardForm.branch} onChange={(event) => setScorecardForm({ ...scorecardForm, branch: event.target.value })}><option value="*">All branches</option>{branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>
                <label>Maximum monthly allowance (GHS)<input type="number" min="0" max="1000000" step="0.01" value={scorecardForm.max_monthly_allowance} onChange={(event) => setScorecardForm({ ...scorecardForm, max_monthly_allowance: event.target.value })} required /><small>Starter scorecards are GH₵0 until Management sets an approved cap.</small></label>
                <div className="staff-hr-wide staff-kpi-criteria-list">
                  <strong>Criteria · {scorecardForm.items.reduce((total, item) => total + Number(item.weight || 0), 0)}/100 points</strong>
                  {scorecardForm.items.map((item, index) => <article className="staff-kpi-criterion-editor" key={item.id || `new-${index}`}>
                    <div className="staff-kpi-criterion-heading"><strong>Criterion {index + 1}</strong><button type="button" className="secondary-button" onClick={() => removeScorecardItem(index)} disabled={scorecardForm.items.length <= 1}>Remove</button></div>
                    <label>Criterion<input maxLength="180" value={item.title} onChange={(event) => updateScorecardItem(index, 'title', event.target.value)} required /></label>
                    <label>Responsibilities measured<textarea rows="2" maxLength="3000" value={item.description} onChange={(event) => updateScorecardItem(index, 'description', event.target.value)} /></label>
                    <div className="staff-kpi-target-grid">
                      <label>Weight (points)<input type="number" min="1" max="100" step="1" value={item.weight} onChange={(event) => updateScorecardItem(index, 'weight', event.target.value)} required /></label>
                      <label>Target direction<select value={item.direction} onChange={(event) => updateScorecardItem(index, 'direction', event.target.value)}><option value="higher">Higher achievement is better</option><option value="lower">Lower result is better</option><option value="quality">Qualitative / evidence-based</option></select></label>
                      <label>Numeric target (optional)<input type="number" min="0" step="0.01" value={item.target_value} onChange={(event) => updateScorecardItem(index, 'target_value', event.target.value)} /></label>
                      <label>Target unit (optional)<input maxLength="40" value={item.target_unit} onChange={(event) => updateScorecardItem(index, 'target_unit', event.target.value)} placeholder="%, days, reports…" /></label>
                    </div>
                    <label>Monthly target and evidence<textarea rows="2" maxLength="3000" value={item.target_description} onChange={(event) => updateScorecardItem(index, 'target_description', event.target.value)} placeholder="Define the approved target, evidence source and any relevant exceptions." required /></label>
                  </article>)}
                  <button type="button" className="secondary-button" onClick={addScorecardItem} disabled={scorecardForm.items.length >= 20}>Add criterion</button>
                </div>
                <div className="staff-hr-wide modal-actions"><button className="primary-button" disabled={busy || scorecardForm.items.reduce((total, item) => total + Number(item.weight || 0), 0) !== 100}>{editingScorecardId ? 'Save scorecard changes' : 'Create scorecard'}</button>{editingScorecardId && <button type="button" className="secondary-button" onClick={() => { setEditingScorecardId(null); setScorecardForm(initialScorecard) }}>Cancel edit</button>}</div>
              </form>
            </section>

            <section className="staff-hr-admin-block">
              <h4>Role and branch scorecards</h4>
              <div className="staff-hr-record-list">{filteredScorecards.map((item) => <article key={item.id}><div><strong>{item.role_title} · {item.branch === '*' ? 'All branches' : item.branch}</strong><small>Maximum allowance GH₵{Number(item.max_monthly_allowance).toFixed(2)} · {item.items.length} criteria · {item.active ? 'Active' : 'Inactive'}</small><p>{item.items.map((criterion) => `${criterion.title} (${criterion.weight})`).join(' · ')}</p></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => editKpiScorecard(item)}>Edit</button><button type="button" className="secondary-button" onClick={() => toggleKpiScorecard(item)} disabled={busy}>{item.active ? 'Deactivate' : 'Activate'}</button></div></article>)}</div>
            </section>

            <section className="staff-hr-admin-block">
              <h4>Allowance payout bands</h4>
              <p className="muted-copy">The score is the sum of criterion weight × whole-number rating ÷ 5. The matching threshold sets the percentage of the role’s maximum monthly allowance.</p>
              <form className="staff-kpi-bands-form" onSubmit={saveKpiAllowanceBands}>
                {payoutBandsForm.map((band, index) => <div className="staff-kpi-band-row" key={`band-${index}`}>
                  <label>Minimum score<input type="number" min="0" max="100" step="0.01" value={band.minimum_score} onChange={(event) => setPayoutBandsForm((previous) => previous.map((entry, entryIndex) => entryIndex === index ? { ...entry, minimum_score: event.target.value } : entry))} required /></label>
                  <label>Allowance percent<input type="number" min="0" max="100" step="0.01" value={band.payout_percent} onChange={(event) => setPayoutBandsForm((previous) => previous.map((entry, entryIndex) => entryIndex === index ? { ...entry, payout_percent: event.target.value } : entry))} required /></label>
                  <label>Rating label<input maxLength="80" value={band.label} onChange={(event) => setPayoutBandsForm((previous) => previous.map((entry, entryIndex) => entryIndex === index ? { ...entry, label: event.target.value } : entry))} required /></label>
                  <button type="button" className="secondary-button staff-hr-danger-button" onClick={() => setPayoutBandsForm((previous) => previous.filter((_, entryIndex) => entryIndex !== index))} disabled={payoutBandsForm.length <= 1}>Remove</button>
                </div>)}
                <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPayoutBandsForm((previous) => [...previous, { minimum_score: '', payout_percent: '', label: '' }])} disabled={payoutBandsForm.length >= 20}>Add payout band</button><button className="primary-button" disabled={busy || !payoutBandsForm.some((band) => Number(band.minimum_score) === 0)}>Save payout bands</button></div>
              </form>
            </section>

            <section id="hr-kpi-assessment-editor" className="staff-hr-admin-block">
              <div className="staff-hr-block-heading"><div><h4>{editingAssessmentId ? 'Edit monthly assessment draft' : 'Assess an employee'}</h4><p>Record evidence and whole-number ratings from 0 to 5. Every criterion needs a rating and supporting evidence before approval.</p></div></div>
              <form className="patient-filter-grid staff-kpi-form" onSubmit={saveKpiAssessment}>
                <label>Employee<select required value={assessmentForm.employee_id} onChange={(event) => changeAssessmentEmployee(event.target.value)}><option value="">Select staff</option>{data.employees.map((item) => <option key={item.id} value={item.id}>{item.ghana_card_name} · {item.staff_id} · {item.job_title || 'No role'}</option>)}</select></label>
                <label>Assessment month<input type="month" required value={assessmentForm.period} onChange={(event) => setAssessmentForm({ ...assessmentForm, period: event.target.value })} disabled={editingAssessmentId !== null} /></label>
                <label>Role scorecard<select required value={assessmentForm.scorecard_id} onChange={(event) => changeAssessmentScorecard(event.target.value)} disabled={!assessmentForm.employee_id || editingAssessmentId !== null}><option value="">Select applicable scorecard</option>{applicableScorecards(assessmentForm.employee_id).map((item) => <option key={item.id} value={item.id}>{item.role_title} · {item.branch === '*' ? 'All branches' : item.branch}</option>)}{assessmentScorecard && !applicableScorecards(assessmentForm.employee_id).some((item) => String(item.id) === String(assessmentScorecard.id)) && <option value={assessmentScorecard.id}>{assessmentScorecard.role_title} · original assessment scorecard</option>}</select></label>
                {assessmentForm.items.map((item, index) => <article className="staff-kpi-assessment-item staff-hr-wide" key={`${item.scorecard_item_id}-${index}`}>
                  <div className="staff-kpi-criterion-heading"><strong>{item.title_snapshot} · {item.weight} points</strong><span>{Number(item.weight) * (Number(item.rating) || 0) / 5} earned</span></div>
                  {item.description_snapshot && <p>{item.description_snapshot}</p>}
                  <small>Target: {item.target_description_snapshot}{item.target_value_snapshot != null ? ` · ${item.target_value_snapshot}${item.target_unit_snapshot ? ` ${item.target_unit_snapshot}` : ''}` : ''} · {item.direction_snapshot}</small>
                  <div className="staff-kpi-target-grid"><label>Rating<select required={false} value={item.rating} onChange={(event) => setAssessmentForm((previous) => ({ ...previous, items: previous.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, rating: event.target.value } : entry) }))}><option value="">Not rated</option>{[0, 1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} · {['Not achieved / serious failure', 'Poor achievement', 'Partially achieved', 'Mostly achieved', 'Fully achieved', 'Outstanding achievement'][rating]}</option>)}</select></label><label>Evidence source<textarea rows="2" maxLength="5000" value={item.evidence} onChange={(event) => setAssessmentForm((previous) => ({ ...previous, items: previous.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, evidence: event.target.value } : entry) }))} /></label><label>Criterion note<textarea rows="2" maxLength="3000" value={item.notes} onChange={(event) => setAssessmentForm((previous) => ({ ...previous, items: previous.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, notes: event.target.value } : entry) }))} /></label></div>
                </article>)}
                <label className="staff-hr-wide">Overall review note<textarea rows="3" maxLength="5000" value={assessmentForm.summary_notes} onChange={(event) => setAssessmentForm({ ...assessmentForm, summary_notes: event.target.value })} /></label>
                <label className="staff-kpi-target-confirmation staff-hr-wide"><input type="checkbox" checked={assessmentForm.targets_confirmed} onChange={(event) => setAssessmentForm({ ...assessmentForm, targets_confirmed: event.target.checked })} disabled={Boolean(editingAssessmentId && assessmentForm.targets_confirmed)} required /><span>I confirm these measurable targets were agreed and communicated before this assessment month began. Saving the draft snapshots them for this period.</span></label>
                <div className="staff-kpi-assessment-total staff-hr-wide"><strong>Provisional score: {assessmentScore}/100</strong><span>{assessmentBand?.label || 'No matching payout band'} · {Number(assessmentBand?.payout_percent || 0)}% · allowance GH₵{assessmentAllowance.toFixed(2)}</span><small>Calculated against the selected scorecard’s maximum GH₵{Number(assessmentScorecard?.max_monthly_allowance || 0).toFixed(2)}. Draft only; this does not post to payroll.</small></div>
                <div className="staff-hr-wide modal-actions"><button className="primary-button" disabled={busy || !assessmentForm.employee_id || !assessmentForm.scorecard_id || !assessmentForm.items.length || !assessmentForm.targets_confirmed}>{editingAssessmentId ? 'Save draft changes' : 'Save as draft'}</button>{editingAssessmentId && <button type="button" className="secondary-button" onClick={() => { setAssessmentForm(initialAssessment); setEditingAssessmentId(null) }}>Cancel edit</button>}</div>
              </form>
            </section>

            <section className="staff-hr-admin-block">
              <h4>Monthly scorecards · {filteredAssessments.length}</h4>
              {filteredAssessments.length ? <div className="staff-hr-record-list">{filteredAssessments.map((item) => <article className="staff-kpi-assessment-record" key={item.id}>
                <div><strong>{item.employee_name} · {item.role_title_snapshot}</strong><small>{item.period} · {item.employee_branch || 'No branch'} · {item.status} · score {Number(item.total_score)}/100 · {Number(item.allowance_percent)}% · GH₵{Number(item.calculated_allowance).toFixed(2)} of GH₵{Number(item.max_monthly_allowance).toFixed(2)}</small><small>Targets confirmed {item.targets_confirmed_at ? new Date(item.targets_confirmed_at).toLocaleString() : 'not confirmed'}</small>
                  {item.summary_notes && <p>{item.summary_notes}</p>}
                  <details><summary>Review criteria, evidence and employee feedback</summary><div className="staff-kpi-assessment-detail-list">{item.items.map((criterion) => <div key={criterion.id}><strong>{criterion.title_snapshot} · {criterion.weight} points</strong><small>Rating {criterion.rating ?? 'Not rated'} · earned {Number(criterion.earned_points)} points · target: {criterion.target_description_snapshot}{criterion.target_value_snapshot != null ? ` · ${criterion.target_value_snapshot}${criterion.target_unit_snapshot ? ` ${criterion.target_unit_snapshot}` : ''}` : ''}</small>{criterion.evidence && <p>Evidence: {criterion.evidence}</p>}{criterion.notes && <p>Note: {criterion.notes}</p>}</div>)}</div>
                    {item.employee_comment && <div className="staff-kpi-comment"><strong>Employee comment · {item.employee_comment_at ? new Date(item.employee_comment_at).toLocaleString() : ''}</strong><p>{item.employee_comment}</p></div>}
                    {item.status === 'published' && <form className="staff-kpi-response-form" onSubmit={(event) => respondToKpiAssessment(item, event)}><label>GM response to employee comment<textarea rows="2" maxLength="5000" value={managerResponseForms[item.id] ?? item.manager_response ?? ''} onChange={(event) => setManagerResponseForms((previous) => ({ ...previous, [item.id]: event.target.value }))} /></label><button className="secondary-button" disabled={busy}>Save response</button></form>}
                  </details>
                </div><div className="modal-actions">{item.status === 'draft' && <><button type="button" className="secondary-button" onClick={() => editKpiAssessment(item)}>Edit draft</button><button type="button" className="primary-button" onClick={() => reviewKpiAssessment(item, 'approved')} disabled={busy || item.items.some((criterion) => criterion.rating == null || !String(criterion.evidence || '').trim())}>Approve</button></>}{item.status === 'approved' && <button type="button" className="primary-button" onClick={() => reviewKpiAssessment(item, 'published')} disabled={busy}>Publish to staff</button>}{['approved', 'published'].includes(item.status) && <button type="button" className="secondary-button" onClick={() => perform(() => apiFetch(`/manager/hr-space/kpi-assessments/${item.id}/reopen`, { method: 'PATCH', token }), 'KPI assessment returned to draft.')}>Reopen</button>}</div>
              </article>)}</div> : <p className="muted-copy">No monthly scorecards match this search.</p>}
            </section>

            <details className="staff-hr-admin-block staff-kpi-legacy"><summary>Older single-score KPI entries</summary><p className="muted-copy">Existing entries remain available for reference. New assessments should use the weighted role scorecards above.</p><div className="staff-hr-record-list">{filteredResults.map((item) => <article key={item.id}><div><strong>{item.employee_name} · {item.rule_title}</strong><small>{item.period} · score {Number(item.score)}% · allowance GH₵{Number(item.calculated_allowance).toFixed(2)} · {item.status}</small><p>{item.notes}</p></div></article>)}</div><div className="staff-hr-record-list">{filteredRules.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>Legacy full-score amount GH₵{Number(item.full_score_allowance).toFixed(2)} · {item.active ? 'Active' : 'Inactive'}</small><p>{item.description}</p></div><button type="button" className="secondary-button" onClick={() => toggleRule(item)} disabled={busy}>{item.active ? 'Deactivate' : 'Activate'}</button></article>)}</div><form className="patient-filter-grid" onSubmit={saveRule}><label>Legacy rule title<input value={rule.title} onChange={(event) => setRule({ ...rule, title: event.target.value })} required /></label><label>Full-score allowance (GHS)<input type="number" min="0" step="0.01" value={rule.full_score_allowance} onChange={(event) => setRule({ ...rule, full_score_allowance: event.target.value })} required /></label><label>Target value<input type="number" min="0" step="0.01" value={rule.target_value} onChange={(event) => setRule({ ...rule, target_value: event.target.value })} /></label><label className="staff-hr-wide">Description<textarea rows="2" value={rule.description} onChange={(event) => setRule({ ...rule, description: event.target.value })} /></label><button className="primary-button staff-hr-wide" disabled={busy}>Add legacy rule</button></form><form className="patient-filter-grid" onSubmit={saveScore}><label>Employee<select required value={score.employee_id} onChange={(event) => setScore({ ...score, employee_id: event.target.value })}><option value="">Select staff</option>{data.employees.map((item) => <option key={item.id} value={item.id}>{item.ghana_card_name} · {item.staff_id}</option>)}</select></label><label>KPI rule<select required value={score.rule_id} onChange={(event) => setScore({ ...score, rule_id: event.target.value })}><option value="">Select KPI</option>{data.rules.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Period<input type="month" required value={score.period} onChange={(event) => setScore({ ...score, period: event.target.value })} /></label><label>Score (%)<input type="number" min="0" max="100" step="0.01" required value={score.score} onChange={(event) => setScore({ ...score, score: event.target.value })} /></label><label className="staff-hr-wide">Evaluation note<textarea rows="2" value={score.notes} onChange={(event) => setScore({ ...score, notes: event.target.value })} /></label><button className="primary-button staff-hr-wide" disabled={busy}>Save legacy score as draft</button></form></details>
          </>}
        </div>}
      </div>
      </>}
    </section>
  )
}
