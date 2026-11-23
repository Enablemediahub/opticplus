import { useCallback, useEffect, useRef, useState } from 'react'
import './StaffSpace.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`).replace(/\/+$/, '')
const TOKEN_KEY = 'bealet-staff-token'
const EMPLOYEE_KEY = 'bealet-staff-employee'
const CHANGE_KEY = 'bealet-staff-must-change-password'
const SECTION_KEY = 'bealet-staff-section'
const STAFF_SECTIONS = ['overview', 'communications', 'letters', 'signature', 'payroll', 'requests', 'kpi', 'security']
const newRequestForm = () => ({ request_type: 'leave', start_date: '', end_date: '', leave_type: 'annual', other_leave_type: '', handover_person: '', outstanding_duties: '', absence_reason: 'illness', other_absence_reason: '', notified_date: '', reason: '', confirmation: false })
const money = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' })
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const getSavedStaffSection = (employeeId) => {
  const savedSection = employeeId ? localStorage.getItem(`${SECTION_KEY}:${employeeId}`) : null
  return STAFF_SECTIONS.includes(savedSection) ? savedSection : 'overview'
}
const getInitialStaffSection = () => {
  try {
    const employee = JSON.parse(localStorage.getItem(EMPLOYEE_KEY) || 'null')
    return getSavedStaffSection(employee?.id)
  } catch {
    return 'overview'
  }
}
const formatLeaveType = (value) => {
  const leaveType = String(value || '').trim().toLowerCase().replaceAll('_', ' ')
  const labels = { annual: 'ANNUAL', sick: 'SICK', maternity: 'MATERNITY', compassionate: 'COMPASSIONATE', unpaid: 'UNPAID', other: 'OTHER' }
  return labels[leaveType] || leaveType.toUpperCase()
}
const formatRequestReason = (record) => record.request_type === 'leave'
  ? String(record.reason || '').replace(/^(Leave type:\s*)([^\r\n]+)/mi, (_, prefix, value) => `${prefix}${formatLeaveType(value)}`)
  : record.reason
function countWorkingDays(startDate, endDate, weekdays = [1, 2, 3, 4, 5, 6], holidays = []) {
  if (!startDate || !endDate) return 0
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  const activeWeekdays = weekdays.map(Number)
  const excludedDates = new Set(holidays.map((item) => String(item.holiday_date || item).slice(0, 10)))
  let count = 0
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    if (day.getDay() !== 0 && activeWeekdays.includes(day.getDay()) && !excludedDates.has(dateKey)) count += 1
  }
  return count
}

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || 'The request could not be completed.')
    error.status = response.status
    throw error
  }
  return data
}

export default function StaffSpace() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [employee, setEmployee] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EMPLOYEE_KEY) || 'null') } catch { return null }
  })
  const [mustChange, setMustChange] = useState(() => localStorage.getItem(CHANGE_KEY) === 'true')
  const [staffId, setStaffId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [companyProfile, setCompanyProfile] = useState(null)
  const [section, setSectionState] = useState(getInitialStaffSection)
  const setSection = useCallback((nextSection) => {
    if (!STAFF_SECTIONS.includes(nextSection)) return
    setSectionState(nextSection)
    if (employee?.id) localStorage.setItem(`${SECTION_KEY}:${employee.id}`, nextSection)
  }, [employee?.id])
  const [letters, setLetters] = useState([])
  const [managerLetterSignature, setManagerLetterSignature] = useState('')
  const [communications, setCommunications] = useState([])
  const [unreadCommunicationCount, setUnreadCommunicationCount] = useState(0)
  const [communicationPopupOpen, setCommunicationPopupOpen] = useState(false)
  const [communicationPopupItems, setCommunicationPopupItems] = useState([])
  const [requestNotificationItems, setRequestNotificationItems] = useState([])
  const [communicationPreview, setCommunicationPreview] = useState(null)
  const [communicationPreviewLoading, setCommunicationPreviewLoading] = useState(false)
  const notifiedCommunicationIds = useRef(new Set())
  const notifiedRequestDecisions = useRef(new Set())
  const requestStatuses = useRef(new Map())
  const markingCommunicationIds = useRef(new Set())
  const refreshingCommunications = useRef(false)
  const refreshingRequests = useRef(false)
  const [selectedPayrollIds, setSelectedPayrollIds] = useState([])
  const [payroll, setPayroll] = useState([])
  const [currentSalary, setCurrentSalary] = useState(null)
  const [kpiAllowances, setKpiAllowances] = useState([])
  const [requests, setRequests] = useState([])
  const [kpiResults, setKpiResults] = useState([])
  const [kpiAssessments, setKpiAssessments] = useState([])
  const [kpiCommentDrafts, setKpiCommentDrafts] = useState({})
  const [leaveTracking, setLeaveTracking] = useState(null)
  const [signatureData, setSignatureData] = useState('')
  const [useSavedSignature, setUseSavedSignature] = useState(false)
  const [requestForm, setRequestForm] = useState(newRequestForm)
  const [attachment, setAttachment] = useState(null)
  const staffBranchHero = Number(employee?.branch_id) === 1
    ? companyProfile?.labadi_dashboard_hero_image_url || companyProfile?.dashboard_hero_image_url
    : Number(employee?.branch_id) === 2
      ? companyProfile?.madina_dashboard_hero_image_url || companyProfile?.dashboard_hero_image_url
      : companyProfile?.dashboard_hero_image_url

  useEffect(() => {
    if (employee?.id) setSectionState(getSavedStaffSection(employee.id))
  }, [employee?.id])

  const signOutLocal = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMPLOYEE_KEY)
    localStorage.removeItem(CHANGE_KEY)
    setToken('')
    setEmployee(null)
    setMustChange(false)
    setLetters([])
    setManagerLetterSignature('')
    setCommunications([])
    setRequests([])
    setUnreadCommunicationCount(0)
    setCommunicationPopupOpen(false)
    setCommunicationPopupItems([])
    setRequestNotificationItems([])
    setCommunicationPreview(null)
    setCommunicationPreviewLoading(false)
    notifiedCommunicationIds.current.clear()
    notifiedRequestDecisions.current.clear()
    requestStatuses.current.clear()
    markingCommunicationIds.current.clear()
    setSelectedPayrollIds([])
    setKpiAssessments([])
    setKpiCommentDrafts({})
    setSignatureData('')
    setUseSavedSignature(false)
  }, [])

  useEffect(() => {
    request('/company-profile')
      .then((data) => setCompanyProfile(data.profile || null))
      .catch(() => setCompanyProfile(null))
  }, [])

  useEffect(() => {
    if (!token || mustChange) return
    request('/staff/me', { token })
      .then((data) => {
        setEmployee(data.employee)
        localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(data.employee))
      })
      .catch((nextError) => {
        if (nextError.status === 423) {
          setMustChange(true)
          localStorage.setItem(CHANGE_KEY, 'true')
        } else {
          signOutLocal()
        }
      })
  }, [token, mustChange, signOutLocal])

  const receiveCommunications = useCallback((response) => {
    const items = response.communications || []
    const freshItems = items.filter((item) => !item.read_at && !notifiedCommunicationIds.current.has(item.id))
    freshItems.forEach((item) => notifiedCommunicationIds.current.add(item.id))
    const itemsById = new Map(items.map((item) => [item.id, item]))
    setCommunicationPopupItems((previous) => {
      const currentUnreadItems = previous
        .map((item) => itemsById.get(item.id))
        .filter((item) => item && !item.read_at)
      const freshIds = new Set(freshItems.map((item) => item.id))
      return [...freshItems, ...currentUnreadItems.filter((item) => !freshIds.has(item.id))]
    })
    if (freshItems.length) {
      setCommunicationPopupOpen(true)
    }
    setCommunications(items)
    setUnreadCommunicationCount(Number(response.unread_count || 0))
  }, [])

  const receiveRequests = useCallback((items, notifyChanges = false) => {
    const newDecisions = []
    items.forEach((item) => {
      const requestId = String(item.id)
      const previousStatus = requestStatuses.current.get(requestId)
      const notificationKey = `${requestId}:${item.status}:${item.reviewed_at || ''}`
      if (notifyChanges && previousStatus === 'pending' && item.status !== 'pending' && !notifiedRequestDecisions.current.has(notificationKey)) {
        newDecisions.push(item)
        notifiedRequestDecisions.current.add(notificationKey)
      }
      requestStatuses.current.set(requestId, item.status)
    })
    setRequests(items)
    if (newDecisions.length) {
      setRequestNotificationItems((previous) => {
        const newIds = new Set(newDecisions.map((item) => String(item.id)))
        return [...newDecisions, ...previous.filter((item) => !newIds.has(String(item.id)))]
      })
      setCommunicationPopupOpen(true)
    }
  }, [])

  const refreshCommunications = useCallback(async () => {
    if (refreshingCommunications.current) return
    refreshingCommunications.current = true
    try {
      const response = await request('/staff/communications', { token })
      receiveCommunications(response)
    } finally {
      refreshingCommunications.current = false
    }
  }, [receiveCommunications, token])

  const refreshRequests = useCallback(async () => {
    if (refreshingRequests.current) return
    refreshingRequests.current = true
    try {
      const response = await request('/staff/requests', { token })
      receiveRequests(response.requests || [], true)
    } finally {
      refreshingRequests.current = false
    }
  }, [receiveRequests, token])

  const refreshKpiAssessments = useCallback(async () => {
    const response = await request('/staff/kpi', { token })
    setKpiResults(response.results || [])
    setKpiAssessments(response.assessments || [])
  }, [token])

  const loadPortalData = useCallback(async () => {
    const [letterData, payrollData, requestData, kpiData, leaveData, signatureResult, communicationData] = await Promise.all([
      request('/staff/letters', { token }), request('/staff/payroll', { token }),
      request('/staff/requests', { token }), request('/staff/kpi', { token }), request('/staff/leave', { token }), request('/staff/signature', { token }),
      request('/staff/communications', { token }),
    ])
    setLetters(letterData.letters || [])
    setManagerLetterSignature(letterData.manager_signature || '')
    setPayroll(payrollData.payroll || [])
    setCurrentSalary(payrollData.current_salary)
    setKpiAllowances(payrollData.kpi_allowances || [])
    receiveRequests(requestData.requests || [], requestStatuses.current.size > 0)
    setKpiResults(kpiData.results || [])
    setKpiAssessments(kpiData.assessments || [])
    setLeaveTracking(leaveData)
    setSignatureData(signatureResult.signature || '')
    setUseSavedSignature(Boolean(signatureResult.signature))
    receiveCommunications(communicationData)
  }, [receiveCommunications, receiveRequests, token])

  useEffect(() => {
    if (!token || mustChange) return undefined
    const intervalId = window.setInterval(() => {
      refreshCommunications().catch((nextError) => setError(nextError.message))
      refreshRequests().catch((nextError) => setError(nextError.message))
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [mustChange, refreshCommunications, refreshRequests, token])

  useEffect(() => {
    if (!token || mustChange) return undefined
    const refreshVisibleUpdates = () => {
      if (document.visibilityState === 'visible') {
        refreshCommunications().catch((nextError) => setError(nextError.message))
        refreshRequests().catch((nextError) => setError(nextError.message))
      }
    }
    window.addEventListener('focus', refreshVisibleUpdates)
    window.addEventListener('online', refreshVisibleUpdates)
    document.addEventListener('visibilitychange', refreshVisibleUpdates)
    return () => {
      window.removeEventListener('focus', refreshVisibleUpdates)
      window.removeEventListener('online', refreshVisibleUpdates)
      document.removeEventListener('visibilitychange', refreshVisibleUpdates)
    }
  }, [mustChange, refreshCommunications, refreshRequests, token])

  useEffect(() => {
    if (!token || mustChange) return undefined
    const intervalId = window.setInterval(() => {
      refreshKpiAssessments().catch((nextError) => setError(nextError.message))
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [mustChange, refreshKpiAssessments, token])

  useEffect(() => {
    if (!token || mustChange) return undefined
    const intervalId = window.setInterval(() => {
      request('/staff/letters', { token })
        .then((letterData) => {
          setLetters(letterData.letters || [])
          setManagerLetterSignature(letterData.manager_signature || '')
        })
        .catch((nextError) => setError(nextError.message))
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [mustChange, token])

  useEffect(() => {
    if (!communicationPreview?.url) return undefined
    return () => URL.revokeObjectURL(communicationPreview.url)
  }, [communicationPreview?.url])

  const requestedWorkingDays = countWorkingDays(
    requestForm.start_date,
    requestForm.end_date,
    leaveTracking?.working_days || [1, 2, 3, 4, 5, 6],
    leaveTracking?.public_holidays || [],
  )
  const requestableAnnualDays = Math.max(0, Number(leaveTracking?.days_available || 0))
  const requestFormTitle = { leave: 'Staff Leave Application', excuse_duty: 'Excuse / Absence Notification', medical_report: 'Medical Report Submission' }[requestForm.request_type]
  const requestPreviewReason = requestForm.request_type === 'leave'
    ? requestForm.reason
    : requestForm.request_type === 'excuse_duty'
      ? requestForm.reason
      : requestForm.reason || 'Medical report attached for HR review.'
  const requestPreviewRows = [
    ['Employee', employee?.name || '—'],
    ['Staff ID', employee?.staff_id || '—'],
    ['Position / branch', `${employee?.job_title || '—'} · ${employee?.branch || '—'}`],
    ['Dates covered', `${requestForm.start_date || 'Start date'} – ${requestForm.end_date || 'Return / end date'}`],
    ...(requestForm.request_type === 'leave' ? [['Leave type', formatLeaveType(requestForm.leave_type === 'other' ? requestForm.other_leave_type || 'other' : requestForm.leave_type)], ['Working days', requestForm.leave_type === 'annual' ? String(requestedWorkingDays) : 'To be reviewed']] : []),
    ...(requestForm.request_type === 'excuse_duty' ? [['Absence reason', requestForm.absence_reason === 'other' ? requestForm.other_absence_reason || 'Other' : requestForm.absence_reason.replaceAll('_', ' ')], ['Management notified', requestForm.notified_date || '—']] : []),
    ['Reason / note', requestPreviewReason || 'Your explanation will appear here as you type.'],
    ...(requestForm.request_type === 'leave' ? [['Handover person', requestForm.handover_person || '—'], ['Outstanding duties', requestForm.outstanding_duties || '—']] : []),
    ['Supporting document', attachment?.name || (requestForm.request_type === 'medical_report' ? 'Required before submission' : 'None attached')],
  ]

  useEffect(() => {
    if (token && !mustChange) loadPortalData().catch((nextError) => setError(nextError.message))
  }, [token, mustChange, loadPortalData])

  async function signIn(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await request('/staff/login', { method: 'POST', body: { staff_id: staffId.trim(), password } })
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(data.employee))
      localStorage.setItem(CHANGE_KEY, String(data.must_change_password))
      setToken(data.token)
      setEmployee(data.employee)
      setMustChange(data.must_change_password)
      setPassword('')
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusy(false)
    }
  }

  async function updatePassword(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const data = await request('/staff/password', {
        token,
        method: 'PUT',
        body: { current_password: password, password: newPassword, password_confirmation: confirmPassword },
      })
      localStorage.setItem(CHANGE_KEY, 'false')
      setMustChange(false)
      setPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice(data.message)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    try { await request('/staff/logout', { token, method: 'POST' }) } catch { /* Local sign-out still clears the session. */ }
    signOutLocal()
  }

  async function saveStaffSignature(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setError('Signature image must be 2 MB or smaller.')
      event.target.value = ''
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    const body = new FormData()
    body.append('signature', file)
    try {
      const result = await request('/staff/signature', { token, method: 'POST', body })
      setSignatureData(result.signature || '')
      setUseSavedSignature(Boolean(result.signature))
      setNotice('Your signature is saved privately and ready to use on required letters and form PDFs.')
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  async function removeStaffSignature() {
    setBusy(true)
    try {
      const result = await request('/staff/signature', { token, method: 'DELETE' })
      setSignatureData(result.signature || '')
      setUseSavedSignature(false)
      setNotice(result.message)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitHrRequest(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (requestForm.request_type === 'medical_report' && !attachment) {
      setError('Attach your medical report before submitting this request.')
      return
    }
    setBusy(true)
    const body = new FormData()
    body.append('request_type', requestForm.request_type)
    body.append('start_date', requestForm.start_date)
    body.append('end_date', requestForm.end_date)
    if (requestForm.request_type === 'leave') {
      body.append('leave_type', requestForm.leave_type)
      if (requestForm.leave_type === 'annual') body.append('working_days_requested', String(requestedWorkingDays))
      if (requestForm.handover_person) body.append('handover_person', requestForm.handover_person)
      if (requestForm.outstanding_duties) body.append('outstanding_duties', requestForm.outstanding_duties)
    }
    if (requestForm.request_type === 'excuse_duty') body.append('notification_date', requestForm.notified_date)
    const reasonDetails = requestForm.request_type === 'leave'
      ? [
          `Leave type: ${formatLeaveType(requestForm.leave_type === 'other' ? requestForm.other_leave_type : requestForm.leave_type)}`,
          `Working days requested: ${requestedWorkingDays}`,
          `Reason for leave: ${requestForm.reason}`,
          requestForm.handover_person && `Handover person: ${requestForm.handover_person}`,
          requestForm.outstanding_duties && `Outstanding duties: ${requestForm.outstanding_duties}`,
        ].filter(Boolean).join('\n')
      : requestForm.request_type === 'excuse_duty'
        ? [
            `Absence reason: ${requestForm.absence_reason === 'other' ? requestForm.other_absence_reason : requestForm.absence_reason.replace(/\b\w/g, (letter) => letter.toUpperCase())}`,
            `Explanation: ${requestForm.reason}`,
            `Date management was notified: ${requestForm.notified_date}`,
            `Supporting documents attached: ${attachment ? 'Yes' : 'No'}`,
          ].join('\n')
        : `Medical report submission\nDates covered: ${requestForm.start_date} to ${requestForm.end_date}\nNote to HR: ${requestForm.reason}\nSupporting medical report: attached`
    body.append('reason', reasonDetails)
    if (attachment) body.append('attachment', attachment)
    try {
      const result = await request('/staff/requests', { token, method: 'POST', body })
      setNotice(result.message)
      setRequestForm(newRequestForm())
      setAttachment(null)
      await loadPortalData()
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusy(false)
    }
  }

  async function downloadAttachment(requestId, fileName) {
    try {
      const response = await fetch(`${API_BASE}/staff/requests/${requestId}/attachment`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Attachment is unavailable.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = fileName || 'hr-attachment'
      link.click()
      URL.revokeObjectURL(url)
    } catch (nextError) { setError(nextError.message) }
  }

  async function downloadLetterAttachment(letterId, fileName) {
    try {
      const response = await fetch(`${API_BASE}/staff/letters/${letterId}/attachment`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Letter attachment is unavailable.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = fileName || 'hr-letter'
      link.click()
      URL.revokeObjectURL(url)
    } catch (nextError) { setError(nextError.message) }
  }

  async function markCommunicationRead(item) {
    if (item.read_at || markingCommunicationIds.current.has(item.id)) return
    markingCommunicationIds.current.add(item.id)
    try {
      const response = await request(`/staff/communications/${item.id}/read`, { token, method: 'POST' })
      const readAt = response.read_at || new Date().toISOString()
      setCommunications((previous) => previous.map((current) => current.id === item.id ? { ...current, read_at: readAt } : current))
      setCommunicationPopupItems((previous) => previous.map((current) => current.id === item.id ? { ...current, read_at: readAt } : current))
      setUnreadCommunicationCount((previous) => Math.max(0, previous - 1))
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      markingCommunicationIds.current.delete(item.id)
    }
  }

  function openCommunicationNotifications() {
    setCommunicationPopupItems(communications.filter((item) => !item.read_at))
    setCommunicationPopupOpen(true)
  }

  async function downloadCommunicationAttachment(item) {
    try {
      const response = await fetch(`${API_BASE}/staff/communications/${item.id}/attachment`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('This PDF is unavailable.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = item.attachment_name || 'staff-document.pdf'
      link.click()
      URL.revokeObjectURL(url)
    } catch (nextError) {
      setError(nextError.message)
    }
  }

  async function viewCommunicationAttachment(item) {
    setCommunicationPopupOpen(false)
    setCommunicationPreview({ item, url: '' })
    setCommunicationPreviewLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/staff/communications/${item.id}/view`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('This PDF is unavailable.')
      if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/pdf')) {
        throw new Error('The requested document is not a PDF.')
      }
      const url = URL.createObjectURL(await response.blob())
      setCommunicationPreview({ item, url })
      void markCommunicationRead(item)
    } catch (nextError) {
      setCommunicationPreview(null)
      setError(nextError.message)
    } finally {
      setCommunicationPreviewLoading(false)
    }
  }

  async function commentOnKpiAssessment(assessment, event) {
    event.preventDefault()
    const employeeComment = kpiCommentDrafts[assessment.id] ?? assessment.employee_comment ?? ''
    try {
      const response = await request(`/staff/kpi-assessments/${assessment.id}/comment`, {
        token,
        method: 'POST',
        body: { employee_comment: employeeComment },
      })
      const commentAt = new Date().toISOString()
      setKpiAssessments((previous) => previous.map((item) => item.id === assessment.id
        ? { ...item, employee_comment: employeeComment, employee_comment_at: commentAt }
        : item))
      setError('')
      setNotice(response.message)
    } catch (nextError) {
      setError(nextError.message)
    }
  }

  async function signLetter(letter) {
    if (!signatureData) {
      setError('Save your reusable signature in My signature before signing this letter.')
      setSection('signature')
      return
    }
    if (!window.confirm(`Submit your saved signature to HR for “${letter.title}”? This records your acknowledgement.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await request(`/staff/letters/${letter.id}/signature`, { token, method: 'POST' })
      setLetters((previous) => previous.map((item) => item.id === letter.id
        ? { ...item, signed_at: response.signed_at, signed_signature: response.signed_signature }
        : item))
      setNotice(response.message)
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setBusy(false)
    }
  }

  function renderLetterCard(letter) {
    return <article key={letter.id}>
      <div>
        <strong>{letter.title}</strong>
        <small>Published {letter.published_at ? new Date(letter.published_at).toLocaleDateString() : ''}{letter.attachment_name ? ` · ${letter.attachment_name}` : ''}</small>
        {letter.requires_signature && <small>{letter.signed_at ? `Signed and submitted ${new Date(letter.signed_at).toLocaleString()}` : 'Signature required'}</small>}
      </div>
      <div className="staff-space-record-actions">
        <button type="button" className="staff-space-secondary" onClick={() => printLetter(letter)}>View / Print letter</button>
        {letter.attachment_name && <button type="button" className="staff-space-secondary" onClick={() => downloadLetterAttachment(letter.id, letter.attachment_name)}>Download attachment</button>}
        {letter.requires_signature && !letter.signed_at && <button type="button" className="staff-space-secondary" onClick={() => signLetter(letter)} disabled={busy || !signatureData}>{busy ? 'Submitting…' : 'Sign & submit to HR'}</button>}
        {letter.requires_signature && !signatureData && !letter.signed_at && <label className="staff-space-signature-upload">Upload signature<input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={saveStaffSignature} disabled={busy} /></label>}
      </div>
    </article>
  }

  function renderSignatureManager(includeFormPdfToggle = false) {
    return <div className="staff-space-signature-manager">
      <div>
        <h3>Reusable signature</h3>
        <p>Upload a clear PNG, JPG or WebP image (up to 2 MB). It stays private to your staff account.</p>
        <label className="staff-space-signature-upload">{signatureData ? 'Replace saved signature' : 'Upload my signature'}<input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={saveStaffSignature} disabled={busy} /></label>
        {signatureData && includeFormPdfToggle && <label className="staff-space-signature-toggle"><input type="checkbox" checked={useSavedSignature} onChange={(event) => setUseSavedSignature(event.target.checked)} />Include my saved signature on form PDFs</label>}
        {signatureData && <button type="button" className="staff-space-signature-remove" onClick={removeStaffSignature} disabled={busy}>Remove saved signature</button>}
      </div>
      {signatureData && <img className="staff-space-signature-thumbnail" src={signatureData} alt="Your saved signature preview" />}
    </div>
  }

  function printLetter(letter) {
    const popup = window.open('', '_blank', 'width=900,height=1100')
    if (!popup) { setError('Allow pop-ups to print or save this letter as PDF.'); return }
    const safeTitle = escapeHtml(letter.title)
    const safeBody = escapeHtml(letter.body).replace(/\n/g, '<br>')
    const signature = managerLetterSignature
      ? `<img class="signature-image" src="${escapeHtml(managerLetterSignature)}" alt="General Manager signature">`
      : ''
    const employeeSignature = letter.signed_signature
      ? `<img class="signature-image" src="${escapeHtml(letter.signed_signature)}" alt="Employee signature"><div>Employee acknowledgement · ${escapeHtml(employee?.name || '')}</div><div>Submitted ${escapeHtml(new Date(letter.signed_at).toLocaleString())}</div>`
      : ''
    popup.document.write(`<!doctype html><html><head><title>${safeTitle}</title><style>@page{size:letter;margin:56mm 22mm 30mm}*{box-sizing:border-box}html,body{margin:0;width:216mm;min-height:279mm;font-family:Arial,sans-serif;color:#202020}.letterhead{position:fixed;z-index:0;inset:0;width:216mm;height:279mm;object-fit:fill}.content{position:relative;z-index:1;font-size:11pt;line-height:1.55;white-space:normal}.content h1{font-size:15pt;margin:0 0 10mm;color:#17324f}.signatures{display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:12mm;margin-top:12mm;break-inside:avoid;page-break-inside:avoid}.signature-block{min-width:0;font-size:9pt;line-height:1.35}.signature-image{display:block;max-width:48mm;max-height:16mm;object-fit:contain;object-position:left bottom;margin:0 0 2mm}.signature-block strong{display:block;margin-top:2mm}.toolbar{position:fixed;right:20px;top:20px;z-index:2}@media screen{body{padding:56mm 22mm 30mm}.letterhead{position:absolute}}@media print{html,body{width:auto;min-height:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}}</style></head><body><img class="letterhead" src="/bealet-letterhead.png" alt=""><article class="content"><h1>${safeTitle}</h1>${safeBody}<div class="signatures"><div class="signature-block">${signature}<div>General Manager</div><strong>For Bealet Optical Centre Limited</strong></div>${employeeSignature ? `<div class="signature-block">${employeeSignature}</div>` : '<div></div>'}</div></article><button class="toolbar" onclick="window.print()">Print / Save as PDF</button></body></html>`)
    popup.document.close()
  }

  function printRequestPdf(record, isDraft = false) {
    const popup = window.open('', '_blank', 'width=900,height=1100')
    if (!popup) { setError('Allow pop-ups to download or print this filled HR form as a PDF.'); return }
    const formLabels = { leave: 'Staff Leave Application', excuse_duty: 'Excuse / Absence Notification', medical_report: 'Medical Report Submission' }
    const lines = String(formatRequestReason(record) || '').split('\n').filter(Boolean)
    const details = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
    const attachmentRow = record.attachment_name ? `<tr><th>Supporting document</th><td>${escapeHtml(record.attachment_name)}</td></tr>` : ''
    const signatureText = isDraft ? 'Draft preview — not yet submitted' : `Electronically submitted by ${escapeHtml(employee?.name || 'Staff member')} on ${escapeHtml(record.submitted_at ? new Date(record.submitted_at).toLocaleString() : 'the date shown in HR request history')}`
    const signatureMarkup = useSavedSignature && signatureData ? `<img class="signature-image" src="${escapeHtml(signatureData)}" alt="Employee signature">` : ''
    const leaveTypeRow = record.request_type === 'leave' ? `<tr><th>Leave type</th><td>${escapeHtml(formatLeaveType(record.leave_type))}</td></tr>` : ''
    const gmApproval = !isDraft && record.request_type === 'leave' && record.status === 'approved'
    const managerSignatureMarkup = gmApproval && managerLetterSignature
      ? `<img class="signature-image" src="${escapeHtml(managerLetterSignature)}" alt="General Manager signature">`
      : ''
    const managerDecision = gmApproval
      ? managerLetterSignature
        ? `Approved by the General Manager${record.reviewed_at ? ` on ${new Date(record.reviewed_at).toLocaleString()}` : ''}`
        : 'Approved by the General Manager · No saved GM signature is available'
      : 'General Manager decision / signature'
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(formLabels[record.request_type] || 'HR Request')}</title><style>@page{size:letter;margin:48mm 23mm 29mm}*{box-sizing:border-box}html,body{margin:0;width:216mm;min-height:279mm;font-family:Arial,sans-serif;color:#202a35}.letterhead{position:fixed;z-index:0;inset:0;width:216mm;height:279mm;object-fit:fill}.content{position:relative;z-index:1;font-size:10.5pt;line-height:1.5}.content h1{margin:0 0 5mm;color:#17324f;font-size:17pt}.content .sub{margin:0 0 8mm;color:#52677a;font-size:10pt}.content table{width:100%;border-collapse:collapse;margin:0 0 8mm}.content th,.content td{padding:8px 10px;border:1px solid #cbd5e1;text-align:left;vertical-align:top}.content th{width:34%;background:#edf5ff;color:#34526f}.content h2{margin:7mm 0 3mm;color:#17324f;font-size:12pt}.content p{margin:0 0 2mm;white-space:pre-wrap}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:18mm}.signature-line{border-top:1px solid #52677a;padding-top:3mm;font-size:9pt;color:#52677a}.signature-image{display:block;max-width:55mm;max-height:20mm;object-fit:contain;margin:0 0 2mm}.toolbar{position:fixed;right:20px;top:20px;z-index:2;border:0;border-radius:8px;padding:11px 15px;background:#176fc2;color:#fff;font:600 13px Arial;cursor:pointer}@media screen{body{padding:48mm 23mm 29mm}.letterhead{position:absolute}}@media print{html,body{width:auto;min-height:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}}</style></head><body><img class="letterhead" src="/bealet-letterhead.png" alt=""><main class="content"><h1>${escapeHtml(formLabels[record.request_type] || 'HR Request')}</h1><p class="sub">Bealet Optical Centre Limited · Staff HR Space</p><table><tr><th>Employee name</th><td>${escapeHtml(employee?.name || '')}</td></tr><tr><th>Staff ID</th><td>${escapeHtml(employee?.staff_id || '')}</td></tr><tr><th>Position / branch</th><td>${escapeHtml(employee?.job_title || '')} · ${escapeHtml(employee?.branch || '')}</td></tr><tr><th>Dates requested</th><td>${escapeHtml(record.start_date || '')} – ${escapeHtml(record.end_date || '')}</td></tr>${leaveTypeRow}${record.working_days_requested != null ? `<tr><th>Working days requested</th><td>${escapeHtml(record.working_days_requested)}</td></tr>` : ''}<tr><th>Submission status</th><td>${escapeHtml(isDraft ? 'Draft preview' : record.status || 'Pending')}</td></tr>${attachmentRow}</table><h2>Request details</h2>${details}<p style="margin-top:10mm;font-size:9pt;color:#52677a">${signatureText}</p><div class="signatures"><div>${signatureMarkup}<div class="signature-line">Employee acknowledgement · ${escapeHtml(employee?.name || '')}</div></div><div>${managerSignatureMarkup}<div class="signature-line">${escapeHtml(managerDecision)}</div></div></div></main><button class="toolbar" onclick="window.print()">Download / Save as PDF</button></body></html>`)
    popup.document.close()
  }

  function printDraftRequestPdf() {
    const reason = requestForm.request_type === 'leave'
      ? [`Leave type: ${formatLeaveType(requestForm.leave_type === 'other' ? requestForm.other_leave_type : requestForm.leave_type)}`, `Working days requested: ${requestedWorkingDays}`, `Reason for leave: ${requestForm.reason}`, requestForm.handover_person && `Handover person: ${requestForm.handover_person}`, requestForm.outstanding_duties && `Outstanding duties: ${requestForm.outstanding_duties}`].filter(Boolean).join('\n')
      : requestForm.request_type === 'excuse_duty'
        ? [`Absence reason: ${requestForm.absence_reason === 'other' ? requestForm.other_absence_reason : requestForm.absence_reason}`, `Explanation: ${requestForm.reason}`, `Date management was notified: ${requestForm.notified_date}`, `Supporting documents attached: ${attachment ? 'Yes' : 'No'}`].join('\n')
        : `Medical report submission\nNote to HR: ${requestForm.reason}\nMedical report: ${attachment?.name || 'Not attached yet'}`
    printRequestPdf({ request_type: requestForm.request_type, start_date: requestForm.start_date, end_date: requestForm.end_date, working_days_requested: requestForm.request_type === 'leave' && requestForm.leave_type === 'annual' ? requestedWorkingDays : null, reason, status: 'Draft' }, true)
  }

  function printPayslip(row) {
    const popup = window.open('', '_blank', 'width=900,height=1100')
    if (!popup) { setError('Allow pop-ups to print or save this payslip as PDF.'); return }
    const period = new Date(Number(row.pay_year), Number(row.pay_month) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })
    const parts = [
      ['Employee', employee?.name], ['Staff ID', employee?.staff_id], ['Designation', employee?.job_title],
      ['Pay period', period], ['Payment date', row.payment_date ? new Date(row.payment_date).toLocaleDateString() : '—'],
      ['Gross salary', money.format(Number(row.declared_salary ?? row.gross_salary))],
      ['Allowance', money.format(Number(row.allowance_amount || 0))],
      ['Advance deduction', money.format(Number(row.advance_deduction || 0))],
      ['Net salary', money.format(Number(row.net_salary || 0))], ['Payment method', row.payment_method || '—'],
    ]
    const rows = parts.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')
    popup.document.write(`<!doctype html><html><head><title>Payslip ${escapeHtml(period)}</title><style>@page{size:letter;margin:56mm 22mm 30mm}*{box-sizing:border-box}html,body{margin:0;width:216mm;min-height:279mm;font-family:Arial,sans-serif;color:#202020}.letterhead{position:fixed;z-index:0;inset:0;width:216mm;height:279mm;object-fit:fill}.content{position:relative;z-index:1;font-size:10pt;line-height:1.35}.content h1{font-size:16pt;margin:0 0 8mm;color:#17324f}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;border:1px solid #cbd5d1;text-align:left}th{width:40%;background:#edf5ff}.toolbar{position:fixed;right:20px;top:20px;z-index:2}@media screen{body{padding:56mm 22mm 30mm}.letterhead{position:absolute}}@media print{html,body{width:auto;min-height:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}}</style></head><body><img class="letterhead" src="/bealet-letterhead.png" alt=""><main class="content"><h1>PAYSLIP · ${escapeHtml(period)}</h1><table>${rows}</table></main><button class="toolbar" onclick="window.print()">Print / Save as PDF</button></body></html>`)
    popup.document.close()
  }

  const selectedPayrollRows = payroll.filter((row) => selectedPayrollIds.includes(row.id))
  const allPayrollSelected = payroll.length > 0 && selectedPayrollRows.length === payroll.length

  function togglePayrollSelection(id) {
    setSelectedPayrollIds((previous) => previous.includes(id)
      ? previous.filter((selectedId) => selectedId !== id)
      : [...previous, id])
  }

  function printSelectedPayslips() {
    if (!selectedPayrollRows.length) {
      setError('Select at least one payslip to print or save as PDF.')
      return
    }
    const popup = window.open('', '_blank', 'width=900,height=1100')
    if (!popup) {
      setError('Allow pop-ups to print or save these payslips as a PDF.')
      return
    }
    const pages = selectedPayrollRows.map((row) => {
      const period = new Date(Number(row.pay_year), Number(row.pay_month) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })
      const parts = [
        ['Employee', employee?.name], ['Staff ID', employee?.staff_id], ['Designation', employee?.job_title],
        ['Pay period', period], ['Payment date', row.payment_date ? new Date(row.payment_date).toLocaleDateString() : '—'],
        ['Gross salary', money.format(Number(row.declared_salary ?? row.gross_salary))],
        ['Allowance', money.format(Number(row.allowance_amount || 0))],
        ['Advance deduction', money.format(Number(row.advance_deduction || 0))],
        ['Net salary', money.format(Number(row.net_salary || 0))], ['Payment method', row.payment_method || '—'],
      ]
      const rows = parts.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')
      return `<main class="content payslip-page"><h1>PAYSLIP · ${escapeHtml(period)}</h1><table>${rows}</table></main>`
    }).join('')
    popup.document.write(`<!doctype html><html><head><title>Selected payslips</title><style>@page{size:letter;margin:56mm 22mm 30mm}*{box-sizing:border-box}html,body{margin:0;width:216mm;min-height:279mm;font-family:Arial,sans-serif;color:#202020}.letterhead{position:fixed;z-index:0;inset:0;width:216mm;height:279mm;object-fit:fill}.content{position:relative;z-index:1;font-size:10pt;line-height:1.35}.content h1{font-size:16pt;margin:0 0 8mm;color:#17324f}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;border:1px solid #cbd5d1;text-align:left}th{width:40%;background:#edf5ff}.payslip-page{min-height:180mm;break-after:page;page-break-after:always}.payslip-page:last-of-type{break-after:auto;page-break-after:auto}.toolbar{position:fixed;right:20px;top:20px;z-index:2}@media screen{body{padding:56mm 22mm 30mm}.letterhead{position:absolute}}@media print{html,body{width:auto;min-height:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}}</style></head><body><img class="letterhead" src="/bealet-letterhead.png" alt="">${pages}<button class="toolbar" onclick="window.print()">Print / Save selected PDF</button></body></html>`)
    popup.document.close()
  }

  return (
    <main className={`staff-space${!token ? ' staff-space-auth-shell' : ''}`}>
      {token && <header className="staff-space-header">
        <a className="staff-space-brand" href="/staff" aria-label="Bealet HR Space home">
          <img src="/bealet-logo.png" alt="Bealet Optical Center" className="staff-space-header-logo" />
          <span><strong>BEALET</strong><small>HR SPACE</small></span>
        </a>
        {token && <div className="staff-space-header-actions"><button className="staff-space-quiet staff-space-notification-trigger" onClick={openCommunicationNotifications}>Updates{unreadCommunicationCount + requestNotificationItems.length > 0 && <span className="staff-space-notification-badge">{unreadCommunicationCount + requestNotificationItems.length}</span>}</button><button className="staff-space-quiet" onClick={() => loadPortalData().catch((nextError) => setError(nextError.message))}>Refresh</button><button className="staff-space-quiet" onClick={signOut}>Sign out</button></div>}
      </header>}

      {token && communicationPopupOpen && <div className="staff-space-notification-overlay">
        <section className="staff-space-notification-popup" role="dialog" aria-modal="true" aria-labelledby="staff-space-notification-title">
          <div className="staff-space-notification-heading"><div><p className="staff-space-eyebrow">GENERAL MANAGER · HR</p><h2 id="staff-space-notification-title">New HR updates</h2><p>{unreadCommunicationCount} unread message{unreadCommunicationCount === 1 ? '' : 's'} or document{unreadCommunicationCount === 1 ? '' : 's'} · {requestNotificationItems.length} request decision{requestNotificationItems.length === 1 ? '' : 's'}.</p></div><button type="button" className="staff-space-quiet" onClick={() => setCommunicationPopupOpen(false)} aria-label="Close updates">Close</button></div>
          {communicationPopupItems.length > 0 && <div className="staff-space-notification-list">{communicationPopupItems.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.published_at ? new Date(item.published_at).toLocaleString() : ''}</small>{item.message && <p>{item.message}</p>}</div><div className="staff-space-record-actions">{item.attachment_name && <><button type="button" className="staff-space-secondary" onClick={() => viewCommunicationAttachment(item)}>View PDF</button><button type="button" className="staff-space-secondary" onClick={() => downloadCommunicationAttachment(item)}>Download PDF</button></>}{!item.read_at && <button type="button" className="staff-space-secondary" onClick={() => markCommunicationRead(item)}>Mark as read</button>}</div></article>)}</div>}
          {requestNotificationItems.length > 0 && <div className="staff-space-notification-list">{requestNotificationItems.map((item) => <article key={`request-${item.id}`}><div><strong>{item.request_type === 'leave' ? formatLeaveType(item.leave_type) : item.request_type.replace('_', ' ')}</strong><small>{item.start_date || 'Date not set'}{item.end_date ? ` – ${item.end_date}` : ''} · {item.status}{item.reviewed_at ? ` · ${new Date(item.reviewed_at).toLocaleString()}` : ''}</small>{item.review_note && <p>GM note: {item.review_note}</p>}</div><button type="button" className="staff-space-secondary" onClick={() => { setCommunicationPopupOpen(false); setSection('requests'); setRequestNotificationItems([]) }}>View request</button></article>)}</div>}
          {communicationPopupItems.length === 0 && requestNotificationItems.length === 0 && <p className="staff-space-empty">You’re all caught up. Open GM updates anytime to review earlier messages and documents.</p>}
          <div className="staff-space-notification-actions"><button type="button" className="staff-space-primary" onClick={() => { setCommunicationPopupOpen(false); setSection('communications') }}>Open messages</button><button type="button" className="staff-space-secondary" onClick={() => { setCommunicationPopupOpen(false); setSection('requests'); setRequestNotificationItems([]) }}>Open requests</button><button type="button" className="staff-space-secondary" onClick={() => setCommunicationPopupOpen(false)}>Dismiss</button></div>
        </section>
      </div>}

      {token && communicationPreview && <div className="staff-space-document-viewer-overlay">
        <section className="staff-space-document-viewer" role="dialog" aria-modal="true" aria-labelledby="staff-space-document-title">
          <header><div><h2 id="staff-space-document-title">{communicationPreview.item.title}</h2><p>{communicationPreview.item.attachment_name}</p></div><div className="staff-space-document-viewer-actions"><button type="button" className="staff-space-secondary" onClick={() => downloadCommunicationAttachment(communicationPreview.item)}>Download PDF</button>{communicationPreview.url && <a className="staff-space-secondary" href={communicationPreview.url} target="_blank" rel="noreferrer">Open in new tab</a>}<button type="button" className="staff-space-quiet" onClick={() => setCommunicationPreview(null)} aria-label="Close PDF viewer">Close</button></div></header>
          {communicationPreviewLoading || !communicationPreview.url ? <p className="staff-space-document-viewer-loading">Loading PDF…</p> : <iframe title={`PDF preview: ${communicationPreview.item.title}`} src={communicationPreview.url} />}
        </section>
      </div>}

      {!token ? (
        <section className="staff-space-login-layout" style={companyProfile?.staff_login_wallpaper_url ? { '--staff-login-wallpaper': `url("${companyProfile.staff_login_wallpaper_url}")` } : undefined}>
          <div className="staff-space-brand-panel">
            <div className="staff-space-brand-copy">
              <img src="/opticplus-login-logo.png" alt="Opticplus" className="staff-space-opticplus-logo" />
              <p className="staff-space-brand-kicker">EMPLOYEE SELF SERVICE</p>
              <h1>BEALET<br />HR SPACE</h1>
              <p>People, support and workplace services for the Bealet team.</p>
            </div>
            <footer className="staff-space-login-footer"><span>© {new Date().getFullYear()} {companyProfile?.company_name || 'BEALET OPTICAL CENTER'}</span><span>Developed and Designed by DALE QUIST [Enable Technologies]</span></footer>
          </div>
          <section className="staff-space-login-card">
            <div className="staff-space-login-heading"><p className="staff-space-eyebrow">SECURE EMPLOYEE ACCESS</p><h2>Welcome back</h2><p className="staff-space-muted">Sign in to your {companyProfile?.company_name || 'Bealet'} employee space.</p></div>
            <div className="staff-space-company-brand"><strong>{companyProfile?.company_name || 'BEALET OPTICAL CENTER'}</strong><span>{companyProfile?.tagline || 'Professional Eye Care and Optical Services'}</span></div>
            <form onSubmit={signIn} className="staff-space-form">
              <label>Staff ID<input autoComplete="username" value={staffId} onChange={(event) => setStaffId(event.target.value.toUpperCase())} placeholder="BOCSTAFF001" required /></label>
              <label>PIN or password<span className="staff-space-password-wrap"><input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="staff-space-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide PIN or password' : 'Show PIN or password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button></span></label>
              {error && <p className="staff-space-error" role="alert">{error}</p>}
              <button className="staff-space-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to HR Space'}</button>
            </form>
            <p className="staff-space-help">Need access or a PIN reset? Contact your General Manager.</p>
            <div className="staff-space-login-mobile-footer">© {new Date().getFullYear()} {companyProfile?.company_name || 'BEALET OPTICAL CENTER'}<br />Developed and Designed by DALE QUIST [Enable Technologies]</div>
          </section>
        </section>
      ) : mustChange ? (
        <section className="staff-space-login-card">
          <p className="staff-space-eyebrow">SECURE YOUR ACCOUNT</p>
          <h1>Choose a private password</h1>
          <p className="staff-space-muted">Your temporary PIN must be changed before you can use the portal. Choose at least 6 characters; numbers, letters, or a mix are accepted.</p>
          <form onSubmit={updatePassword} className="staff-space-form">
            <label>Current temporary PIN<input autoComplete="current-password" type="password" maxLength="128" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label>New password<input autoComplete="new-password" type="password" minLength="6" maxLength="128" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
            <label>Confirm new password<input autoComplete="new-password" type="password" minLength="6" maxLength="128" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
            {error && <p className="staff-space-error" role="alert">{error}</p>}
            <button className="staff-space-primary" disabled={busy}>{busy ? 'Updating…' : 'Set my password'}</button>
          </form>
        </section>
      ) : (
        <section className="staff-space-dashboard">
          <div className="staff-space-welcome staff-space-dashboard-hero" style={staffBranchHero ? { '--staff-dashboard-hero': `url("${staffBranchHero}")` } : undefined}>
            <div className="staff-space-dashboard-hero-copy"><p className="staff-space-eyebrow">{employee?.branch ? `${employee.branch} BRANCH` : 'YOUR EMPLOYEE SPACE'}</p><h1>Hello, {employee?.name?.split(' ')[0] || 'there'}</h1><p>Your Bealet HR services and personal updates in one place.</p><span>{employee?.job_title || 'Team member'} · {employee?.staff_id}</span></div>
            <div className="staff-space-hero-portrait">{employee?.photo_url ? <img src={employee.photo_url} alt={`${employee?.name || 'Staff member'} profile`} /> : <span>{employee?.name?.slice(0, 1) || 'B'}</span>}</div>
          </div>
          {notice && <p className="staff-space-notice" role="status">{notice}</p>}
          {error && <p className="staff-space-error" role="alert">{error}</p>}
          <nav className="staff-space-tabs" aria-label="HR Space sections">
            {[['overview', 'Overview'], ['communications', 'GM updates'], ['letters', 'Letters'], ['signature', 'My signature'], ['payroll', 'Payroll'], ['requests', 'HR requests'], ['kpi', 'KPI & allowances'], ['security', 'Password']].map(([key, label]) => <button key={key} className={section === key ? 'is-active' : ''} onClick={() => { setSection(key); if (key === 'requests') setRequestNotificationItems([]) }}>{label}{key === 'communications' && unreadCommunicationCount > 0 && <span className="staff-space-tab-badge">{unreadCommunicationCount}</span>}{key === 'requests' && requestNotificationItems.length > 0 && <span className="staff-space-tab-badge">{requestNotificationItems.length}</span>}</button>)}
          </nav>
          {section === 'overview' && <div className="staff-space-grid">
            <article className="staff-space-panel staff-space-profile-panel"><span className="staff-space-panel-icon">◎</span><h2>My profile</h2><p>Employment details connected to your Opticplus staff record.</p><dl><div><dt>Department</dt><dd>{employee?.department || '—'}</dd></div><div><dt>Location</dt><dd>{employee?.branch || '—'}</dd></div><div><dt>Employment since</dt><dd>{employee?.date_employed || '—'}</dd></div><div><dt>Work email</dt><dd>{employee?.email || '—'}</dd></div></dl></article>
            <article className="staff-space-panel"><span className="staff-space-panel-icon">▤</span><h2>My letters</h2><p>{letters.length} published letter{letters.length === 1 ? '' : 's'} available to view and print.</p><button className="staff-space-link" onClick={() => setSection('letters')}>Open letters →</button></article>
            <article className="staff-space-panel"><span className="staff-space-panel-icon">✉</span><h2>GM updates</h2><p>{unreadCommunicationCount ? `${unreadCommunicationCount} unread update${unreadCommunicationCount === 1 ? '' : 's'}` : 'Read messages and staff documents from the General Manager.'}</p><button className="staff-space-link" onClick={() => setSection('communications')}>Open updates →</button></article>
            <article className="staff-space-panel"><span className="staff-space-panel-icon">✍</span><h2>My signature</h2><p>{signatureData ? 'Your reusable signature is saved privately.' : 'Upload a signature to use on letters that require your acknowledgement.'}</p><button className="staff-space-link" onClick={() => setSection('signature')}>{signatureData ? 'Manage signature →' : 'Set up signature →'}</button></article>
            <article className="staff-space-panel"><span className="staff-space-panel-icon">GHS</span><h2>Payroll</h2><p>Current salary: {currentSalary == null ? '—' : money.format(currentSalary)} · {payroll.length} payroll record{payroll.length === 1 ? '' : 's'} · {kpiAllowances.length} published KPI allowance{ kpiAllowances.length === 1 ? '' : 's'}.</p><button className="staff-space-link" onClick={() => setSection('payroll')}>Open payroll →</button></article>
            <article className="staff-space-panel"><span className="staff-space-panel-icon">＋</span><h2>HR requests</h2><p>{requests.filter((item) => item.status === 'pending').length} request{requests.filter((item) => item.status === 'pending').length === 1 ? '' : 's'} awaiting review.</p><button className="staff-space-link" onClick={() => setSection('requests')}>Open requests →</button></article>
          </div>}
          {section === 'security' && <section className="staff-space-panel">
            <h2>Change password</h2>
            <p>Choose at least 6 characters. Numbers, letters, or a mix are accepted.</p>
            <form onSubmit={updatePassword} className="staff-space-form">
              <label>Current password<input autoComplete="current-password" type="password" maxLength="128" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              <label>New password<input autoComplete="new-password" type="password" minLength="6" maxLength="128" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
              <label>Confirm new password<input autoComplete="new-password" type="password" minLength="6" maxLength="128" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
              <button className="staff-space-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
            </form>
          </section>}
          {section === 'signature' && <section className="staff-space-panel">
            <h2>My reusable signature</h2>
            <p>Manage the private signature image used when you sign a required HR letter. Form PDFs include it only when you enable that option.</p>
            {renderSignatureManager(true)}
          </section>}
          {section === 'communications' && <section className="staff-space-panel"><h2>Messages & staff documents</h2><p>Updates from the General Manager / HR. Messages and attached PDFs remain available here after you’ve read them. Published letters assigned to you also appear here.</p>{communications.length > 0 && <div className="staff-space-record-list">{communications.map((item) => <article key={item.id} className={item.read_at ? '' : 'staff-space-communication-unread'}><div><strong>{item.title}</strong><small>{item.published_at ? new Date(item.published_at).toLocaleString() : ''} · {item.read_at ? 'Read' : 'Unread'}</small>{item.message && <p>{item.message}</p>}</div><div className="staff-space-record-actions">{item.attachment_name && <><button type="button" className="staff-space-secondary" onClick={() => viewCommunicationAttachment(item)}>View PDF</button><button type="button" className="staff-space-secondary" onClick={() => downloadCommunicationAttachment(item)}>Download PDF</button></>}{!item.read_at && <button type="button" className="staff-space-secondary" onClick={() => markCommunicationRead(item)}>Mark as read</button>}</div></article>)}</div>}{letters.length > 0 && <><h3>Published letters</h3><div className="staff-space-record-list">{letters.map(renderLetterCard)}</div></>}{communications.length === 0 && letters.length === 0 && <p className="staff-space-empty">There are no messages or staff documents yet.</p>}</section>}
          {section === 'letters' && <section className="staff-space-panel"><h2>My letters</h2><p>Published HR letters assigned to you. Print / Save PDF opens your browser's print dialog.</p>{letters.length ? <div className="staff-space-record-list">{letters.map(renderLetterCard)}</div> : <p className="staff-space-empty">No letters have been published for you yet.</p>}</section>}
          {section === 'payroll' && <section className="staff-space-panel"><h2>My payroll</h2><div className="staff-space-salary">Current salary <strong>{currentSalary == null ? '—' : money.format(currentSalary)}</strong></div>{kpiAllowances.length > 0 && <><h3>Published KPI allowances</h3><div className="staff-space-table-wrap"><table className="staff-space-table"><thead><tr><th>KPI</th><th>Period</th><th>Score</th><th>Allowance approved</th></tr></thead><tbody>{kpiAllowances.map((item) => <tr key={`${item.title}-${item.period}`}><td>{item.title}</td><td>{item.period}</td><td>{Number(item.score)}%</td><td><strong>{money.format(Number(item.calculated_allowance))}</strong></td></tr>)}</tbody></table></div><p className="staff-space-help">Published KPI allowances are shown separately from posted payroll until the GM confirms payroll reconciliation.</p></>}{payroll.length ? <><div className="staff-space-payroll-bulk-actions"><label><input type="checkbox" checked={allPayrollSelected} onChange={(event) => setSelectedPayrollIds(event.target.checked ? payroll.map((row) => row.id) : [])} />Select all {payroll.length} payroll records</label><span>{selectedPayrollRows.length} selected</span><button type="button" className="staff-space-secondary" onClick={printSelectedPayslips} disabled={!selectedPayrollRows.length}>Print / Save selected PDF</button></div><div className="staff-space-table-wrap"><h3>Processed payroll</h3><table className="staff-space-table"><thead><tr><th>Select</th><th>Pay period</th><th>Gross</th><th>Allowance</th><th>Advance deduction</th><th>Net</th><th>Payment date</th><th>Payslip</th></tr></thead><tbody>{payroll.map((row) => <tr key={row.id}><td><input type="checkbox" aria-label={`Select payslip for ${new Date(Number(row.pay_year), Number(row.pay_month) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}`} checked={selectedPayrollIds.includes(row.id)} onChange={() => togglePayrollSelection(row.id)} /></td><td>{new Date(Number(row.pay_year), Number(row.pay_month) - 1).toLocaleString('en', { month: 'long', year: 'numeric' })}</td><td>{money.format(Number(row.declared_salary ?? row.gross_salary))}</td><td>{money.format(Number(row.allowance_amount || 0))}</td><td>{money.format(Number(row.advance_deduction || 0))}</td><td><strong>{money.format(Number(row.net_salary || 0))}</strong></td><td>{row.payment_date ? new Date(row.payment_date).toLocaleDateString() : '—'}</td><td><button className="staff-space-link" onClick={() => printPayslip(row)}>Print / Save PDF</button></td></tr>)}</tbody></table></div></> : <p className="staff-space-empty">No processed payroll records are available yet.</p>}</section>}
          {section === 'requests' && <div className="staff-space-request-layout">
            <section className="staff-space-panel">
              <h2>Submit an HR request</h2>
              <p>Choose a Bealet form below. Your name, staff ID, position and branch are linked from your staff record. Submissions are sent to the General Manager for review.</p>
              {leaveTracking && <div className="staff-space-leave-balance"><div><span>Annual leave balance · {leaveTracking.year}</span><strong>{Number(leaveTracking.days_available).toFixed(2)} days</strong></div><small>{Number(leaveTracking.days_used).toFixed(2)} used · {Number(leaveTracking.pending_days).toFixed(2)} pending</small><small>Annual leave is allocated by calendar year. Sick leave is recorded separately and is not deducted from this balance. Annual days count your configured workdays, excluding Sundays and public holidays entered by the General Manager.</small></div>}
              <form className="staff-space-form" onSubmit={submitHrRequest}>
                <label>Request form<select value={requestForm.request_type} onChange={(event) => { setAttachment(null); setRequestForm({ ...newRequestForm(), request_type: event.target.value }) }}><option value="leave">Staff leave application</option><option value="excuse_duty">Excuse / absence notification</option><option value="medical_report">Medical report submission</option></select></label>

                <div className="staff-space-date-row">
                  <label>{requestForm.request_type === 'leave' ? 'Leave commencement date' : 'First date covered'}<input type="date" value={requestForm.start_date} onChange={(event) => setRequestForm({ ...requestForm, start_date: event.target.value })} required /></label>
                  <label>{requestForm.request_type === 'leave' ? 'Expected return date' : 'Last date covered'}<input type="date" min={requestForm.start_date || undefined} value={requestForm.end_date} onChange={(event) => setRequestForm({ ...requestForm, end_date: event.target.value })} required /></label>
                </div>

                {requestForm.request_type === 'leave' && requestForm.leave_type === 'annual' && <div className="staff-space-leave-estimate"><span>Working days requested</span><strong>{requestedWorkingDays}</strong><small>Calculated using your work schedule and the GM's public-holiday calendar.</small>{requestedWorkingDays > requestableAnnualDays && <small className="staff-space-leave-warning">This is more than your available balance after pending requests ({requestableAnnualDays.toFixed(2)} days).</small>}</div>}

                {requestForm.request_type === 'leave' && <>
                  <label>Leave type<select value={requestForm.leave_type} onChange={(event) => setRequestForm({ ...requestForm, leave_type: event.target.value })}><option value="annual">ANNUAL</option><option value="sick">SICK</option><option value="maternity">MATERNITY</option><option value="compassionate">COMPASSIONATE</option><option value="unpaid">UNPAID</option><option value="other">OTHER</option></select></label>
                  {requestForm.leave_type === 'other' && <label>Specify leave type<input maxLength="150" value={requestForm.other_leave_type} onChange={(event) => setRequestForm({ ...requestForm, other_leave_type: event.target.value })} required /></label>}
                  <label>Number of working days requested<input type="number" min="1" step="1" value={requestForm.working_days} onChange={(event) => setRequestForm({ ...requestForm, working_days: event.target.value })} required /></label>
                  <label>Handover person (if applicable)<input value={requestForm.handover_person} onChange={(event) => setRequestForm({ ...requestForm, handover_person: event.target.value })} /></label>
                  <label>Outstanding duties<textarea rows="3" maxLength="1200" value={requestForm.outstanding_duties} onChange={(event) => setRequestForm({ ...requestForm, outstanding_duties: event.target.value })} /></label>
                  <label>Reason for leave<textarea rows="4" maxLength="2500" value={requestForm.reason} onChange={(event) => setRequestForm({ ...requestForm, reason: event.target.value })} required /></label>
                </>}

                {requestForm.request_type === 'excuse_duty' && <>
                  <label>Reason for absence<select value={requestForm.absence_reason} onChange={(event) => setRequestForm({ ...requestForm, absence_reason: event.target.value })}><option value="illness">Illness</option><option value="family_emergency">Family emergency</option><option value="personal_emergency">Personal emergency</option><option value="transport_difficulties">Transport difficulties</option><option value="other">Other</option></select></label>
                  {requestForm.absence_reason === 'other' && <label>Specify reason<input maxLength="150" value={requestForm.other_absence_reason} onChange={(event) => setRequestForm({ ...requestForm, other_absence_reason: event.target.value })} required /></label>}
                  <label>Date management was notified<input type="date" max={new Date().toISOString().slice(0, 10)} value={requestForm.notified_date} onChange={(event) => setRequestForm({ ...requestForm, notified_date: event.target.value })} required /></label>
                  <label>Explanation<textarea rows="4" maxLength="3000" value={requestForm.reason} onChange={(event) => setRequestForm({ ...requestForm, reason: event.target.value })} required /></label>
                </>}

                {requestForm.request_type === 'medical_report' && <>
                  <p className="staff-space-confidential-note">Medical information is confidential. Add only a brief note for HR and attach the relevant medical report; avoid entering unnecessary diagnosis details here.</p>
                  <label>Brief note for HR<textarea rows="4" maxLength="2000" value={requestForm.reason} onChange={(event) => setRequestForm({ ...requestForm, reason: event.target.value })} placeholder="For example: medical report attached for the dates above." required /></label>
                </>}

                <label>{requestForm.request_type === 'medical_report' ? 'Medical report (required, PDF or image, up to 10 MB)' : 'Supporting documents (optional, PDF or image, up to 10 MB)'}<input type="file" accept=".pdf,.jpg,.jpeg,.png" required={requestForm.request_type === 'medical_report'} onChange={(event) => setAttachment(event.target.files?.[0] || null)} /></label>
                {attachment && <small className="staff-space-file-selected">Selected file: {attachment.name}</small>}
                <label className="staff-space-consent"><input type="checkbox" checked={requestForm.confirmation} onChange={(event) => setRequestForm({ ...requestForm, confirmation: event.target.checked })} required /><span>I confirm the information in this form is accurate. My authenticated staff account records my identity. Any saved signature is included in the PDF only when I enable that option.</span></label>
                <div className="staff-space-form-actions"><button className="staff-space-primary" disabled={busy || (requestForm.request_type === 'leave' && requestForm.leave_type === 'annual' && (requestedWorkingDays < 1 || requestedWorkingDays > requestableAnnualDays))}>{busy ? 'Submitting…' : requestForm.request_type === 'leave' ? 'Submit leave application' : requestForm.request_type === 'excuse_duty' ? 'Submit absence notification' : 'Submit medical report'}</button><button type="button" className="staff-space-secondary" onClick={printDraftRequestPdf}>Download / Print filled form PDF</button></div>
              </form>
            </section>
            <section className="staff-space-panel staff-space-live-preview-panel">
              <div className="staff-space-preview-title"><div><h2>Live form preview</h2><p>Updates as you fill in the form. Download or print this copy for your records.</p></div><span>BEALET LETTERHEAD</span></div>
              {renderSignatureManager(true)}
              <article className="staff-space-live-document" aria-live="polite">
                <header><h3>{requestFormTitle}</h3><p>Bealet Optical Centre Limited · Staff HR Space</p></header>
                <table><tbody>{requestPreviewRows.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>
                <div className="staff-space-live-document-signatures"><div>{useSavedSignature && signatureData && <img src={signatureData} alt="Employee signature" />}<span>Employee acknowledgement</span><small>{employee?.name || 'Employee name'}</small></div><div><span>General Manager decision / signature</span></div></div>
              </article>
              <button type="button" className="staff-space-primary staff-space-preview-download" onClick={printDraftRequestPdf}>Download / Print this PDF</button>
            </section>
            <section className="staff-space-panel staff-space-request-history"><h2>My request history</h2>{requests.length ? <div className="staff-space-record-list">{requests.map((item) => <article key={item.id}><div><strong>{item.request_type === 'leave' ? 'LEAVE' : item.request_type.replace('_', ' ')}</strong>{item.request_type === 'leave' && <small>Leave type: {formatLeaveType(item.leave_type)}</small>}<small>{item.start_date || 'Date not set'}{item.end_date ? ` – ${item.end_date}` : ''} · <span className={`staff-space-status status-${item.status}`}>{item.status}</span>{item.working_days_approved != null ? ` · ${Number(item.working_days_approved).toFixed(2)} days approved` : ''}</small><p>{formatRequestReason(item)}</p>{item.review_note && <small>GM note: {item.review_note}</small>}<div className="staff-space-record-actions"><button className="staff-space-secondary" onClick={() => printRequestPdf(item)}>Download / Print PDF</button>{item.attachment_name && <button className="staff-space-secondary" onClick={() => downloadAttachment(item.id, item.attachment_name)}>Download attachment</button>}</div></div></article>)}</div> : <p className="staff-space-empty">No requests submitted yet.</p>}</section>
          </div>}
          {section === 'kpi' && <section className="staff-space-panel"><h2>KPI & allowances</h2><p>Published monthly role scorecards, rating evidence and the applicable performance allowance. These calculations are shown separately and do not automatically post to payroll.</p>{kpiAssessments.length ? <div className="staff-space-kpi-assessments">{kpiAssessments.map((assessment) => <article key={assessment.id}>
            <header><div><strong>{assessment.role_title_snapshot} · {assessment.period}</strong><small>{assessment.branch_snapshot || 'All branches'} · Published {assessment.published_at ? new Date(assessment.published_at).toLocaleDateString() : ''} · Targets confirmed {assessment.targets_confirmed_at ? new Date(assessment.targets_confirmed_at).toLocaleDateString() : 'date unavailable'}</small></div><div className="staff-space-kpi-score"><strong>{Number(assessment.total_score)}/100</strong><small>{Number(assessment.allowance_percent)}% allowance</small></div></header>
            <div className="staff-space-kpi-allowance"><span>Approved maximum</span><strong>{money.format(Number(assessment.max_monthly_allowance))}</strong><span>Calculated allowance</span><strong>{money.format(Number(assessment.calculated_allowance))}</strong></div>
            {assessment.summary_notes && <p className="staff-space-kpi-summary">{assessment.summary_notes}</p>}
            <details><summary>View criteria, targets and evidence</summary><div className="staff-space-kpi-criteria">{assessment.items.map((item) => <article key={item.id}><strong>{item.title_snapshot} · {item.weight} points</strong><small>Rating {item.rating}/5 · earned {Number(item.earned_points)} points</small>{item.description_snapshot && <p>{item.description_snapshot}</p>}<small>Target: {item.target_description_snapshot}{item.target_value_snapshot != null ? ` · ${item.target_value_snapshot}${item.target_unit_snapshot ? ` ${item.target_unit_snapshot}` : ''}` : ''} · {item.direction_snapshot}</small>{item.evidence && <p><b>Evidence:</b> {item.evidence}</p>}{item.notes && <p><b>Manager note:</b> {item.notes}</p>}</article>)}</div></details>
            <div className="staff-space-kpi-comment"><strong>Your comment or request for review</strong>{assessment.employee_comment && <p className="staff-space-kpi-submitted-comment">Submitted {assessment.employee_comment_at ? new Date(assessment.employee_comment_at).toLocaleString() : ''}: {assessment.employee_comment}</p>}
              <form onSubmit={(event) => commentOnKpiAssessment(assessment, event)}><label htmlFor={`kpi-comment-${assessment.id}`}>Add or update a comment for the General Manager</label><textarea id={`kpi-comment-${assessment.id}`} rows="3" maxLength="5000" value={kpiCommentDrafts[assessment.id] ?? assessment.employee_comment ?? ''} onChange={(event) => setKpiCommentDrafts((previous) => ({ ...previous, [assessment.id]: event.target.value }))} required /><button type="submit" className="staff-space-secondary">Send comment</button></form>
            </div>
            {assessment.manager_response && <div className="staff-space-kpi-manager-response"><strong>General Manager response</strong><p>{assessment.manager_response}</p></div>}
          </article>)}</div> : null}
          {kpiResults.length > 0 && <details className="staff-space-kpi-legacy"><summary>Older KPI entries</summary><div className="staff-space-record-list">{kpiResults.map((result) => <article key={result.id}><div><strong>{result.title} · {result.period}</strong><small>Score {Number(result.score)}% · Allowance {money.format(Number(result.calculated_allowance))}{result.target_value != null ? ` · Target ${Number(result.target_value)}` : ''}</small><p>{result.description}</p></div></article>)}</div></details>}
          {!kpiAssessments.length && !kpiResults.length && <p className="staff-space-empty">No KPI results have been published for you.</p>}</section>}
        </section>
      )}
      <footer className="staff-space-footer">Developed and Designed by DALE QUIST [Enable Technologies]</footer>
    </main>
  )
}
