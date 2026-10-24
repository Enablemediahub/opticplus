import { useEffect, useMemo, useRef, useState } from 'react'
import StatWidget from './StatWidget.jsx'
import { escapePrintHtml, openPrintDocumentWindow, writePrintDocumentWindow } from '../utils/printDocuments.js'

const currency = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 })
const defaultFilters = () => ({ search: '', status: 'all', category: 'all', scope: 'workspace', page: 1, per_page: 12 })
const asList = (value) => Array.isArray(value) ? value : []
const defaultForm = (session) => ({
  subject: '',
  memo_to: 'General Manager',
  memo_from: session?.name ?? '',
  memo_date: todayIso(),
  reference: buildMemoReference(todayIso()),
  category: 'finance',
  priority: 'medium',
  cc: '',
  body: `Seeking approval for the disbursement of funds. The amount in total to be disbursed is GH₵ [amount]. This payment is to settle the [purpose/reason] for the [period/description]. The payment will be made through [cash / bank / both].

Thank you for your cooperation.`,
  requires_approval: true,
  attachments: [],
})
const defaultTemplateBuilder = () => ({
  amount: '',
  purpose: '',
  period: '',
  paymentMethod: 'bank',
})

function buildMemoBody(templateData) {
  if (!templateData.amount && !templateData.purpose && !templateData.period && !templateData.paymentMethod) {
    return `Seeking approval for the disbursement of funds. The amount in total to be disbursed is GH₵ [amount]. This payment is to settle the [purpose/reason] for the [period/description]. The payment will be made through [cash / bank / both].

Thank you for your cooperation.`
  }
  
  const amount = templateData.amount || '[amount]'
  const purpose = templateData.purpose || '[purpose/reason]'
  const period = templateData.period || '[period/description]'
  const method = templateData.paymentMethod || '[cash / bank / both]'
  
  return `Seeking approval for the disbursement of funds. The amount in total to be disbursed is GH₵ ${amount}. This payment is to settle the ${purpose} for the ${period}. The payment will be made through ${method}.

Thank you for your cooperation.`
}
const defaultDecisionForm = () => ({ decision: 'approved', approval_notes: '' })

function buildMemoReference(memoDate = todayIso()) {
  const parsed = new Date(`${memoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  const month = parsed.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  const year = parsed.getFullYear()
  return `MEMO-${month}-${year}-01`
}

function resolveAssetUrl(url) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const base = (import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`)
    .replace(/\/api\/v1\/?$/i, '')
    .replace(/\/$/, '')
  return `${base}/${trimmed.replace(/^\//, '')}`
}

function resolveApiEndpoint(path) {
  const base = (import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`).replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function buildMemoPrintPage(memo, attachments = []) {
  const fields = [
    ['To', memo.memo_to],
    ['From', memo.memo_from],
    ['Date', formatDate(memo.memo_date)],
    ['Reference', memo.reference || 'No reference'],
    ['Category', titleize(memo.category)],
    ['Approval status', titleize(memo.approval_status)],
  ]
  if (memo.cc) fields.push(['Cc', memo.cc])
  const signature = (label, signer, url) => `<div class="signature">${url ? `<img src="${escapePrintHtml(resolveAssetUrl(url))}" alt="${escapePrintHtml(label)}" />` : ''}<strong>${escapePrintHtml(signer || label)}</strong><span>${escapePrintHtml(label)}</span></div>`
  return `
    <div class="doc-topline"><div><p class="doc-kicker">Internal correspondence</p><h1>Memorandum</h1></div><span class="approval-stamp">${escapePrintHtml(titleize(memo.approval_status || memo.status))}</span></div>
    <div class="details-grid">${fields.map(([label, value]) => `<div class="detail-line"><b>${escapePrintHtml(label)}:</b><span>${escapePrintHtml(value)}</span></div>`).join('')}</div>
    <div class="memo-subject">Subject: ${escapePrintHtml(memo.subject)}</div>
    <div class="memo-body">${escapePrintHtml(memo.body)}</div>
    ${memo.approval_notes ? `<div class="approval-note"><strong>Management decision note</strong><br />${escapePrintHtml(memo.approval_notes)}</div>` : ''}
    ${attachments.length ? `<div class="approval-note"><strong>Supporting files</strong><br />${attachments.map((item) => escapePrintHtml(item.original_name || item.name || 'Attachment')).join('<br />')}</div>` : ''}
    <div class="signature-row">${signature('Accountant signature', memo.memo_from || memo.created_by || 'Accountant', memo.digital_signature_url)}${signature('Management signature', memo.approved_by || 'General Manager', memo.gm_signature_url)}</div>`
}

function MemoSignatureCard({ label, url, signer, emptyMessage, missingMessage, className = '', imageEndpoint = '', token = '' }) {
  const [isBroken, setIsBroken] = useState(false)
  const [imageDiagnostic, setImageDiagnostic] = useState('')
  const [authenticatedImageUrl, setAuthenticatedImageUrl] = useState('')
  const [authenticatedImageError, setAuthenticatedImageError] = useState('')
  const resolvedUrl = resolveAssetUrl(url)
  const sourceUrl = imageEndpoint ? authenticatedImageUrl : resolvedUrl
  const showImage = Boolean(sourceUrl) && !isBroken

  useEffect(() => {
    setIsBroken(false)
    setImageDiagnostic('')
  }, [url])

  useEffect(() => {
    if (!imageEndpoint || !token) {
      setAuthenticatedImageUrl('')
      setAuthenticatedImageError('')
      return undefined
    }

    let cancelled = false
    let objectUrl = ''
    setAuthenticatedImageUrl('')
    setAuthenticatedImageError('')

    fetch(resolveApiEndpoint(imageEndpoint), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          let message = `Signature image request failed (HTTP ${response.status}).`
          try {
            const payload = await response.json()
            message = payload.message || message
          } catch {
          }
          throw new Error(message)
        }
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.toLowerCase().startsWith('image/')) {
          throw new Error(`The signature endpoint returned “${contentType || 'unknown content type'}” instead of an image. Check that the deployed API route is current.`)
        }
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        if (!blob.size) throw new Error('The signature endpoint returned an empty image file.')
        objectUrl = URL.createObjectURL(blob)
        setAuthenticatedImageUrl(objectUrl)
      })
      .catch((loadError) => {
        if (!cancelled) setAuthenticatedImageError(loadError.message)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageEndpoint, token])

  return (
    <div className={`memo-signature-block ${className}`.trim()}>
      <strong>{label}</strong>
      {signer ? <span className="muted-copy">{signer}</span> : null}
      {showImage ? (
        <img
          src={sourceUrl}
          alt={label}
          className="memo-signature-preview"
          onError={async () => {
            setIsBroken(true)
            const failedUrl = imageEndpoint ? resolveApiEndpoint(imageEndpoint) : resolvedUrl
            try {
              const response = await fetch(failedUrl, {
                headers: imageEndpoint && token ? { Authorization: `Bearer ${token}` } : undefined,
              })
              if (!response.ok) {
                let detail = ''
                try {
                  detail = (await response.json()).message || ''
                } catch {
                }
                setImageDiagnostic(`Image request returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`)
                return
              }
              const contentType = response.headers.get('content-type') || 'unknown content type'
              setImageDiagnostic(contentType.toLowerCase().startsWith('image/')
                ? 'The server returned an image, but this browser could not decode or display it. The file may be damaged or in an unsupported format.'
                : `The server returned ${contentType} instead of an image. Check the file path and server route.`)
            } catch (loadError) {
              setImageDiagnostic(`The browser could not reach the image URL (network or cross-origin access error): ${loadError.message}`)
            }
          }}
        />
      ) : (
        <div className="memo-signature-diagnostic" role="status" aria-live="polite">
          <p className="muted-copy">{authenticatedImageError || imageDiagnostic || (imageEndpoint && !authenticatedImageUrl ? 'Loading saved signature...' : resolvedUrl ? (missingMessage || 'Signature image could not be loaded.') : emptyMessage)}</p>
          {resolvedUrl ? <small>Image path: {url}</small> : null}
        </div>
      )}
    </div>
  )
}

export default function MemosSection({ apiFetch, token, session, selectedBranchId, pushSuccessToast }) {
  const [meta, setMeta] = useState(null)
  const [memoData, setMemoData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [filters, setFilters] = useState(defaultFilters())
  const [query, setQuery] = useState(defaultFilters())
  const [form, setForm] = useState(() => defaultForm(session))
  const [templateBuilder, setTemplateBuilder] = useState(defaultTemplateBuilder())
  const [decisionForm, setDecisionForm] = useState(defaultDecisionForm())
  const [selectedMemoId, setSelectedMemoId] = useState(null)
  const [selectedMemoIds, setSelectedMemoIds] = useState([])
  const [selectedMemoRecords, setSelectedMemoRecords] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeciding, setIsDeciding] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState(null)
  const [existingAttachments, setExistingAttachments] = useState([])
  const [reusableSignature, setReusableSignature] = useState(null)
  const [isSavingReusableSignature, setIsSavingReusableSignature] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const composerRef = useRef(null)
  const reusableSignatureLibraryRef = useRef(null)

  const branchId = session?.is_admin ? selectedBranchId : session?.branch_id
  const canManageMemoSignature = Boolean(session?.is_admin || ['accountant', 'manager', 'ceo'].includes(session?.role))
  // API deployments can temporarily return null or a non-array value for a
  // newly added collection (for example while an older backend is still live).
  // Normalize list payloads before rendering so one unexpected shape cannot
  // take down the entire Memos page.
  const memoRecords = asList(memoData?.memos)
  const pendingApprovalRecords = asList(memoData?.pending_approvals)
  const draftRecords = asList(memoData?.my_drafts)
  const expenseMemoRequests = asList(memoData?.expense_memos)
  const visibleExpenseMemoRequests = expenseMemoRequests.slice(0, 10)
  const currentMemoIds = memoRecords.map((item) => String(item.id))
  const selectedMemos = selectedMemoRecords
  const canApprove = Boolean(['manager', 'ceo'].includes(session?.role))
  const memoRecipientOptions = ['General Manager']
  const scopeOptions = useMemo(() => (
    canApprove
      ? [
          { value: 'workspace', label: 'Workspace' },
          { value: 'approvals', label: 'Approvals (pending + decided)' },
          { value: 'mine', label: 'My memos' },
        ]
      : [
          { value: 'workspace', label: 'Workspace' },
          { value: 'mine', label: 'My memos' },
        ]
  ), [canApprove])

  useEffect(() => {
    setForm((current) => ({ ...current, memo_from: session?.name ?? current.memo_from }))
  }, [session?.name])

  useEffect(() => {
    let cancelled = false
    async function loadReusableSignature() {
      if (!token || !canManageMemoSignature) return
      try {
        const response = await apiFetch(`/memos/signature?branch_id=${branchId}`, { token })
        if (!cancelled) setReusableSignature({ ...response, signature_url: response.signature_path || response.signature_url })
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      }
    }
    loadReusableSignature()
    return () => { cancelled = true }
  }, [apiFetch, branchId, canManageMemoSignature, token])

  useEffect(() => {
    setSelectedMemoIds([])
    setSelectedMemoRecords([])
  }, [branchId])

  useEffect(() => {
    setForm(defaultForm(session))
    setTemplateBuilder(defaultTemplateBuilder())
    setEditingDraftId(null)
    setExistingAttachments([])
  }, [session])

  useEffect(() => {
    setForm((current) => {
      if (String(current.reference || '').trim() !== '') return current
      return { ...current, reference: buildMemoReference(current.memo_date) }
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadMeta() {
      if (!token || !session) return
      try {
        const response = await apiFetch(`/memos/meta?branch_id=${branchId}`, { token })
        if (!cancelled) setMeta(response)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      }
    }

    loadMeta()
    return () => {
      cancelled = true
    }
  }, [apiFetch, branchId, session, token])

  useEffect(() => {
    let cancelled = false

    async function loadMemos() {
      if (!token || !session) return
      setIsLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          branch_id: String(branchId),
          page: String(query.page),
          per_page: String(query.per_page),
          scope: query.scope,
        })
        if (query.search) params.set('search', query.search)
        if (query.status !== 'all') params.set('status', query.status)
        if (query.category !== 'all') params.set('category', query.category)
        const response = await apiFetch(`/memos?${params.toString()}`, { token })
        if (!cancelled) setMemoData(response)
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadMemos()
    return () => {
      cancelled = true
    }
  }, [apiFetch, branchId, query, refreshKey, session, token])

  useEffect(() => {
    if (!memoData?.memos?.length) {
      setSelectedMemoId(null)
      setDetail(null)
      return
    }

    if (!selectedMemoId) {
      setSelectedMemoId(memoData.memos[0].id)
    }
  }, [memoData, selectedMemoId])

  useEffect(() => {
    if (!selectedMemoId || !token) return
    loadDetail(selectedMemoId)
  }, [selectedMemoId, token])

  function openMemoModal(memoId) {
    setSelectedMemoId(memoId)
    setIsViewModalOpen(true)
  }

  function closeMemoModal() {
    setIsViewModalOpen(false)
  }

  async function printMemoRecords(records) {
    if (!records.length) return
    const printWindow = openPrintDocumentWindow()
    if (!printWindow) {
      setError('Allow pop-ups to print or save the memo PDF.')
      return
    }
    setError('')
    try {
      const pages = await Promise.all(records.map(async (record) => {
        if (record.attachments) return buildMemoPrintPage(record.memo ?? record, record.attachments)
        const response = await apiFetch(`/memos/${record.id}?branch_id=${branchId}`, { token })
        return buildMemoPrintPage(response.memo ?? record, response.attachments ?? [])
      }))
      writePrintDocumentWindow(printWindow, 'Bealet Memorandum', pages)
    } catch (printError) {
      printWindow.close()
      setError(printError.message || 'Could not prepare the memo PDF.')
    }
  }

  function toggleMemoSelection(memoId) {
    const id = String(memoId)
    const record = (memoData?.memos ?? []).find((item) => String(item.id) === id)
    setSelectedMemoIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setSelectedMemoRecords((current) => current.some((item) => String(item.id) === id)
      ? current.filter((item) => String(item.id) !== id)
      : record ? [...current, record] : current)
  }

  function toggleCurrentPageMemoSelection() {
    const allSelected = currentMemoIds.length > 0 && currentMemoIds.every((id) => selectedMemoIds.includes(id))
    setSelectedMemoIds((current) => allSelected
      ? current.filter((id) => !currentMemoIds.includes(id))
      : Array.from(new Set([...current, ...currentMemoIds])))
    setSelectedMemoRecords((current) => allSelected
      ? current.filter((memo) => !currentMemoIds.includes(String(memo.id)))
      : [...current.filter((memo) => !currentMemoIds.includes(String(memo.id))), ...(memoData?.memos ?? [])])
  }

  async function loadDetail(memoId) {
    setIsLoadingDetail(true)
    try {
      const response = await apiFetch(`/memos/${memoId}?branch_id=${branchId}`, { token })
      setDetail(response)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function saveReusableSignature(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsSavingReusableSignature(true)
    setError('')
    setSuccess('')
    try {
      const payload = new FormData()
      payload.append('signature', file)
      const response = await apiFetch(`/memos/signature?branch_id=${branchId}`, { method: 'POST', token, body: payload })
      setReusableSignature({ ...response, signature_url: response.signature_path || response.signature_url })
      setSuccess(response.message || 'Reusable signature saved.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsSavingReusableSignature(false)
    }
  }

  async function deleteReusableSignature() {
    if (!reusableSignature?.signature_url) return
    const confirmed = window.confirm('Remove your reusable memo signature? Existing memos keep their attached signatures, but new memos and decisions will require a signature again.')
    if (!confirmed) return
    setIsSavingReusableSignature(true)
    setError('')
    setSuccess('')
    try {
      const response = await apiFetch(`/memos/signature?branch_id=${branchId}`, { method: 'DELETE', token })
      setReusableSignature({ ...response, updated_at: null })
      setSuccess(response.message || 'Reusable signature removed.')
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setIsSavingReusableSignature(false)
    }
  }

  async function reloadListAndDetail(memoId = selectedMemoId) {
    setRefreshKey((current) => current + 1)
    if (memoId) {
      await loadDetail(memoId)
    }
  }

  async function saveMemo(saveAsDraft = false) {
    if (!saveAsDraft && !reusableSignature?.signature_url) {
      window.alert('Upload and save your reusable Accountant signature before sending this memo to the General Manager.')
      reusableSignatureLibraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const payload = new FormData()
      payload.append('subject', form.subject)
      payload.append('memo_to', form.memo_to)
      payload.append('memo_from', form.memo_from)
      payload.append('memo_date', form.memo_date)
      payload.append('reference', form.reference)
      payload.append('category', form.category)
      payload.append('priority', form.priority)
      payload.append('cc', form.cc)
      payload.append('body', form.body)
      payload.append('requires_approval', form.requires_approval ? '1' : '0')
      payload.append('save_as_draft', saveAsDraft ? '1' : '0')
      form.attachments.forEach((file) => payload.append('attachments[]', file))

      const isEditingDraft = Boolean(editingDraftId)
      const response = await apiFetch(isEditingDraft ? `/memos/${editingDraftId}/update?branch_id=${branchId}` : `/memos?branch_id=${branchId}`, {
        method: 'POST',
        token,
        body: payload,
      })

      setSuccess(response.message)
      pushSuccessToast?.(response.message)
      setForm({
        ...defaultForm(session),
        reference: buildMemoReference(todayIso()),
      })
      setTemplateBuilder(defaultTemplateBuilder())
      setEditingDraftId(null)
      setExistingAttachments([])
      setDecisionForm(defaultDecisionForm())
      setSelectedMemoId(response.memo_id ?? null)
      await reloadListAndDetail(response.memo_id)
    } catch (saveError) {
      const savedDetail = await apiFetch(`/memos/${selectedMemoId}?branch_id=${decisionBranchId}`, { token }).catch(() => null)
      if (savedDetail?.memo?.approval_status === decisionForm.decision) {
        const message = `Memo ${decisionForm.decision} successfully.`
        setSuccess(message)
        pushSuccessToast?.(message)
        setDecisionForm(defaultDecisionForm())
        const nextFilters = { ...defaultFilters(), status: 'all', scope: 'workspace', page: 1 }
        setFilters(nextFilters)
        setQuery(nextFilters)
        await reloadListAndDetail(selectedMemoId)
        return
      }

      setError(saveError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function loadDraftIntoComposer(memoId) {
    setError('')
    setSuccess('')

    try {
      const response = await apiFetch(`/memos/${memoId}?branch_id=${branchId}`, { token })
      const draftMemo = response.memo
      setForm({
        subject: draftMemo.subject ?? '',
        memo_to: draftMemo.memo_to ?? 'General Manager',
        memo_from: draftMemo.memo_from ?? (session?.name ?? ''),
        memo_date: draftMemo.memo_date ?? todayIso(),
        reference: draftMemo.reference ?? buildMemoReference(draftMemo.memo_date ?? todayIso()),
        category: draftMemo.category ?? 'finance',
        priority: draftMemo.priority ?? 'medium',
        cc: draftMemo.cc ?? '',
        body: draftMemo.body ?? '',
        requires_approval: Boolean(draftMemo.requires_approval),
        attachments: [],
      })
      setTemplateBuilder(defaultTemplateBuilder())
      setEditingDraftId(draftMemo.id)
      setExistingAttachments(response.attachments ?? [])
      setSelectedMemoId(draftMemo.id)
      setDetail(response)
      closeMemoModal()
      window.setTimeout(() => {
        composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    } catch (loadError) {
      setError(loadError.message)
    }
  }

  function cancelDraftEditing() {
    setEditingDraftId(null)
    setExistingAttachments([])
    setForm({
      ...defaultForm(session),
      reference: buildMemoReference(todayIso()),
    })
    setTemplateBuilder(defaultTemplateBuilder())
  }

  async function submitDecision(event) {
    event.preventDefault()
    if (!selectedMemoId) return
    if (!reusableSignature?.signature_url) {
      window.alert('Upload and save your reusable General Manager signature before approving or rejecting this memo.')
      reusableSignatureLibraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setIsDeciding(true)
    setError('')
    setSuccess('')
    const decisionBranchId = detail?.memo?.branch_id ?? branchId

    try {
      const payload = new FormData()
      payload.append('decision', decisionForm.decision)
      payload.append('approval_notes', decisionForm.approval_notes)

      const response = await apiFetch(`/memos/${selectedMemoId}/decision?branch_id=${decisionBranchId}`, {
        method: 'POST',
        token,
        body: payload,
      })

      setSuccess(response.message)
      pushSuccessToast?.(response.message)
      setDecisionForm(defaultDecisionForm())
      // Return to workspace register so the newly approved/rejected memo stays visible.
      const nextFilters = { ...defaultFilters(), status: 'all', scope: 'workspace', page: 1 }
      setFilters(nextFilters)
      setQuery(nextFilters)
      await reloadListAndDetail(selectedMemoId)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setIsDeciding(false)
    }
  }

  const memo = detail?.memo
  const isPendingApproval = memo?.approval_status === 'pending' && memo?.requires_approval

  return (
    <section className="finance-section">
      <div className="patients-header">
        <div>
          <p className="eyebrow">Memos</p>
          <h3>Draft, sign, and route internal memos for approval</h3>
          <p className="header-copy">Accountants can compose memos with their signature and attachments, then forward them to management for approval or rejection.</p>
        </div>
      </div>

      {error ? <div className="message-banner error">{error}</div> : null}
      {success ? <div className="message-banner success">{success}</div> : null}

      <section className="stats-grid patient-stats-grid">
        <StatWidget label="All Memos" value={String(memoData?.stats?.total ?? 0)} note="Visible in your current workspace" icon="message" className="total" />
        <StatWidget label="Pending Approval" value={String(memoData?.stats?.pending_approval ?? 0)} note="Waiting for management review" icon="briefcase" className="pending" />
        <StatWidget label="Approved" value={String(memoData?.stats?.approved ?? 0)} note="Signed off and archived" icon="shield" className="seen" />
        <StatWidget label="Rejected" value={String(memoData?.stats?.rejected ?? 0)} note="Returned for corrections or closure" icon="alert" className="today" />
      </section>

      {canManageMemoSignature ? (
        <article ref={reusableSignatureLibraryRef} className="panel memo-signature-library">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Reusable Signature</p>
              <h3>Your saved memo signature</h3>
              <p className="muted-copy">
                {session?.role === 'accountant'
                  ? 'Your saved Accountant signature is shown here and stamped on every memo you send to the General Manager.'
                  : 'Your saved General Manager signature is shown here and stamped on every memo decision you submit.'}
              </p>
            </div>
            <span className={`memo-signature-state${reusableSignature?.signature_url ? ' is-ready' : ''}`}>
              {reusableSignature?.signature_url ? 'Signature saved' : 'Signature required'}
            </span>
          </div>
          <div className="memo-signature-library-content">
            {reusableSignature?.signature_url ? (
              <MemoSignatureCard
                label={reusableSignature.signer_role === 'accountant' ? 'Accountant signature' : 'General Manager signature'}
                url={reusableSignature.signature_url}
                signer={reusableSignature.signer_name || session?.name}
                className="memo-signature-library-card"
                imageEndpoint={`/memos/signature/image?branch_id=${branchId}`}
                token={token}
              />
            ) : (
              <p className="muted-copy">No reusable signature has been uploaded for this account. Sending or approving a memo requires a saved signature.</p>
            )}
            <div className="memo-signature-library-actions">
              <label className="memo-signature-upload">
                <input className="hidden-file-input" type="file" accept="image/*" onChange={saveReusableSignature} disabled={isSavingReusableSignature} />
                <span className="memo-upload-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3"/></svg>
                </span>
                <span><strong>{isSavingReusableSignature ? 'Saving signature...' : reusableSignature?.signature_url ? 'Replace saved signature' : 'Upload reusable signature'}</strong><small>PNG, JPG, or another clear image format (up to 4 MB)</small></span>
              </label>
              {reusableSignature?.signature_url ? (
                <button type="button" className="ghost-button memo-signature-delete" onClick={deleteReusableSignature} disabled={isSavingReusableSignature}>
                  Remove reusable signature
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ) : null}

      <section className="memo-page-flow">
        <article ref={composerRef} className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Compose Memo</p>
              <h3>{editingDraftId ? 'Continue and send your saved draft' : 'Prepare the memo for management review'}</h3>
            </div>
            <span className="panel-tag">{editingDraftId ? 'Draft loaded' : (meta?.branch_name ?? 'Branch memo desk')}</span>
          </div>

          {editingDraftId ? (
            <div className="message-banner">
              You are editing draft memo `#{editingDraftId}`. Save it again to keep it as a draft, or send it now for approval.
            </div>
          ) : null}

          <form className="patient-filter-grid" onSubmit={(event) => event.preventDefault()}>
            <label>
              Subject
              <input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Monthly expense approval memo" />
            </label>
            <label>
              Memo to
              <select value={form.memo_to} onChange={(event) => setForm((current) => ({ ...current, memo_to: event.target.value }))}>
                {asList(memoRecipientOptions).map((recipient) => (
                  <option key={recipient} value={recipient}>{recipient}</option>
                ))}
              </select>
            </label>
            <label>
              Memo from
              <input value={form.memo_from} readOnly />
            </label>
            <label>
              Memo date
              <input
                type="date"
                value={form.memo_date}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  memo_date: event.target.value,
                  reference: buildMemoReference(event.target.value),
                }))}
              />
            </label>
            <label>
              Reference
              <input value={form.reference} readOnly placeholder="MEMO-APR-2026-01" />
            </label>
            <label>
              Category
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                {asList(meta?.categories).map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
              </select>
            </label>
            <label>
              Priority
              <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                {asList(meta?.priorities).map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
              </select>
            </label>
            <label>
              CC
              <input value={form.cc} onChange={(event) => setForm((current) => ({ ...current, cc: event.target.value }))} placeholder="CEO, HR, Operations" />
            </label>

            <div className="memo-template-builder full-span">
              <div className="memo-template-heading">
                <p className="eyebrow">Quick Template Builder</p>
                <p className="muted-copy">Fill these fields to automatically generate the memo body.</p>
              </div>
              <div className="memo-template-grid">
                <label>
                  Amount (GH₵)
                  <input
                    type="number"
                    step="0.01"
                    value={templateBuilder.amount}
                    onChange={(event) => {
                      const newTemplate = { ...templateBuilder, amount: event.target.value }
                      setTemplateBuilder(newTemplate)
                      setForm((current) => ({ ...current, body: buildMemoBody(newTemplate) }))
                    }}
                    placeholder="e.g., 5000"
                  />
                </label>
                <label>
                  Purpose/Reason
                  <input
                    type="text"
                    value={templateBuilder.purpose}
                    onChange={(event) => {
                      const newTemplate = { ...templateBuilder, purpose: event.target.value }
                      setTemplateBuilder(newTemplate)
                      setForm((current) => ({ ...current, body: buildMemoBody(newTemplate) }))
                    }}
                    placeholder="e.g., Staff training fees"
                  />
                </label>
                <label>
                  Period/Description
                  <input
                    type="text"
                    value={templateBuilder.period}
                    onChange={(event) => {
                      const newTemplate = { ...templateBuilder, period: event.target.value }
                      setTemplateBuilder(newTemplate)
                      setForm((current) => ({ ...current, body: buildMemoBody(newTemplate) }))
                    }}
                    placeholder="e.g., June 2026"
                  />
                </label>
                <label>
                  Payment Method
                  <select
                    value={templateBuilder.paymentMethod}
                    onChange={(event) => {
                      const newTemplate = { ...templateBuilder, paymentMethod: event.target.value }
                      setTemplateBuilder(newTemplate)
                      setForm((current) => ({ ...current, body: buildMemoBody(newTemplate) }))
                    }}
                  >
                    <option value="">-- Select method --</option>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="mobile money">Mobile Money</option>
                    <option value="both">Both Cash & Bank</option>
                  </select>
                </label>
              </div>
            </div>

            <label className="full-span">
              Memo body
              <textarea rows="8" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Fill in: [amount], [purpose/reason], [period/description], and [cash / bank / both]" />
            </label>
            <div className="memo-upload-grid full-span">
              <div className="memo-upload-field memo-upload-field-signature">
                <span className="memo-upload-label"><span className="memo-upload-label-icon" aria-hidden="true">✍</span> Accountant signature stamp</span>
                {reusableSignature?.signature_url ? (
                  <MemoSignatureCard label="Saved reusable signature" url={reusableSignature.signature_url} signer={reusableSignature.signer_name || session?.name} />
                ) : (
                  <p className="memo-upload-empty">Upload and save your signature in the Reusable Signature section above before sending this memo.</p>
                )}
                <p className="muted-copy">The saved image will be attached automatically when this memo is submitted.</p>
              </div>
            <div className="memo-upload-field">
              <span className="memo-upload-label"><span className="memo-upload-label-icon" aria-hidden="true">▤</span> Supporting documents <span className="memo-upload-optional">Optional</span></span>
              <label className="memo-upload-trigger">
                <input
                  className="hidden-file-input"
                  type="file"
                  multiple
                  onChange={(event) => setForm((current) => ({ ...current, attachments: Array.from(event.target.files ?? []) }))}
                />
                <span className="memo-upload-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3"/></svg>
                </span>
                <span className="memo-upload-copy"><strong>Add supporting files</strong><span>Receipts, schedules, approval notes, or other documents. You can select multiple files.</span></span>
                <span className="memo-upload-action">Browse files</span>
              </label>
              {form.attachments.length ? (
                <div className="memo-file-pill-list">
                  {asList(form.attachments).map((file) => (
                    <span key={`${file.name}-${file.lastModified}`} className="memo-file-pill">
                      {file.name}
                    </span>
                  ))}
                </div>
              ) : existingAttachments.length ? (
                <div className="memo-file-pill-list">
                  {asList(existingAttachments).map((file) => (
                    <span key={file.id} className="memo-file-pill">
                      {file.original_name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="memo-upload-empty"><span aria-hidden="true">○</span> No supporting files selected</p>
              )}
            </div>
            </div>
            <label className="memo-checkbox">
              <input type="checkbox" checked={form.requires_approval} onChange={(event) => setForm((current) => ({ ...current, requires_approval: event.target.checked }))} />
              <span>Route this memo for management approval</span>
            </label>
          </form>

          <div className="header-actions">
            {editingDraftId ? (
              <button type="button" className="ghost-button" disabled={isSaving} onClick={cancelDraftEditing}>
                Cancel Draft Edit
              </button>
            ) : null}
            <button type="button" className="ghost-button" disabled={isSaving} onClick={() => saveMemo(true)}>
              {isSaving ? 'Saving...' : editingDraftId ? 'Update Draft' : 'Save Draft'}
            </button>
            <button type="button" className="primary-button" disabled={isSaving} onClick={() => saveMemo(false)}>
              {isSaving ? 'Saving...' : editingDraftId ? 'Send Draft for Approval' : 'Send for Approval'}
            </button>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Filters</p>
              <h3>Find the right memo fast</h3>
            </div>
            <span className="panel-tag">{memoData?.pagination?.total ?? 0} memos</span>
          </div>

          <form className="memo-filter-bar table-attached-filter" onSubmit={(event) => {
            event.preventDefault()
            setQuery((current) => ({ ...current, ...filters, page: 1 }))
          }}>
            <label className="memo-filter-search">
              Search
              <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Subject, reference, or recipient" />
            </label>
            <label>
              Status
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="all">All statuses</option>
                {asList(meta?.statuses).map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
              </select>
            </label>
            <label>
              Category
              <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
                <option value="all">All categories</option>
                {asList(meta?.categories).map((item) => <option key={item} value={item}>{titleize(item)}</option>)}
              </select>
            </label>
            <label>
              Scope
              <select value={filters.scope} onChange={(event) => setFilters((current) => ({ ...current, scope: event.target.value }))}>
                {asList(scopeOptions).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <div className="memo-filter-actions">
              <button type="submit" className="primary-button">Apply</button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const next = defaultFilters()
                  setFilters(next)
                  setQuery(next)
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{canApprove ? 'Approval Queue' : 'My Drafts'}</p>
              <h3>{canApprove ? 'Needs management action' : 'Continue unfinished memos'}</h3>
            </div>
          </div>

          <div className="stack-list">
            {(canApprove ? pendingApprovalRecords : draftRecords).length ? (canApprove ? pendingApprovalRecords : draftRecords).map((item) => (
              <div key={item.id} className="module-card memo-list-card">
                <strong>{item.subject}</strong>
                <span>{item.memo_from} to {item.memo_to}</span>
                <span>{formatDate(item.memo_date)} | {titleize(item.priority)}</span>
                <div className="header-actions">
                  <button type="button" className="ghost-button" onClick={() => openMemoModal(item.id)}>
                    View
                  </button>
                  {!canApprove ? (
                    <button type="button" className="primary-button" onClick={() => loadDraftIntoComposer(item.id)}>
                      Continue Draft
                    </button>
                  ) : null}
                </div>
              </div>
            )) : (
              <p className="muted-copy">{canApprove ? 'No memos are waiting for approval right now.' : 'No draft memos available.'}</p>
            )}
          </div>
        </article>
      </section>

      <section className="memo-page-flow">
        <article className='panel memo-expense-requests-panel'>
          <div className='panel-heading'>
            <div>
              <p className='eyebrow'>Expense Memos</p>
              <h3>Expense memo requests and decisions</h3>
              <p className='muted-copy'>Memos completed in the Expenses form appear here with the same GM decision and status.</p>
            </div>
            <div className='header-actions'>
              <span className='panel-tag'>{visibleExpenseMemoRequests.length}{expenseMemoRequests.length > 10 ? ` of ${expenseMemoRequests.length}` : ''} latest requests</span>
              <a className='ghost-button' href='#/expenses'>Open Expenses</a>
            </div>
          </div>
          {expenseMemoRequests.length ? (
            <div className='table-shell'>
              <table className='portal-table'>
                <thead>
                  <tr>
                    <th>Subject / Expense</th>
                    <th>Category</th>
                    <th>Expense date</th>
                    <th>Amount</th>
                    <th>Prepared by</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Memo / Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleExpenseMemoRequests.map((request) => {
                    const expenseMemo = request.supporting_document ?? {}
                    return (
                      <tr key={'expense-memo-' + request.id}>
                        <td>
                          <strong>{expenseMemo.memo_subject || ('Expense Memo · ' + request.description)}</strong>
                          <div className='muted-copy'>{request.description}</div>
                        </td>
                        <td>{titleize(request.category)}</td>
                        <td>{formatDate(request.date)}</td>
                        <td><strong>{currency.format(Number(request.amount ?? 0))}</strong></td>
                        <td>{request.submitted_by_name || 'Accountant'}</td>
                        <td>{formatDate(request.submitted_at)}</td>
                        <td><span className={'expense-approval-status is-' + request.status}>{titleize(request.status)}</span></td>
                        <td>
                          <details className='memo-expense-request-details'>
                            <summary>View</summary>
                            <div className='memo-expense-request-expanded'>
                              <strong>Memo body</strong>
                              <p className='memo-expense-request-body'>{expenseMemo.memo_body || 'No memo body was saved.'}</p>
                              {request.reviewed_by_name ? <p className='muted-copy'>Reviewed by {request.reviewed_by_name} · {formatDate(request.reviewed_at)}</p> : null}
                              {request.decision_note ? <p className='memo-expense-request-note'><strong>GM decision note:</strong> {request.decision_note}</p> : null}
                              {request.resulting_expense_id ? <p className='muted-copy'>Recorded as Expense ID {request.resulting_expense_id}</p> : null}
                            </div>
                          </details>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className='muted-copy'>Expense memo requests will appear here when an Accountant submits an above-limit expense.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Memo Register</p>
              <h3>Submitted, approved, and rejected memos</h3>
            </div>
            <div className="header-actions memo-export-actions">
              <button type="button" className="ghost-button" disabled={!currentMemoIds.length} onClick={toggleCurrentPageMemoSelection}>
                {currentMemoIds.length && currentMemoIds.every((id) => selectedMemoIds.includes(id)) ? 'Clear page selection' : 'Select page'}
              </button>
              <button type="button" className="primary-button" disabled={!selectedMemos.length} onClick={() => printMemoRecords(selectedMemos)}>
                Print / Save selected PDF{selectedMemos.length ? ` (${selectedMemos.length})` : ''}
              </button>
            </div>
          </div>

          <div className="table-shell">
            <table className="portal-table">
              <thead>
                <tr>
                  <th aria-label="Select memo">
                    <input type="checkbox" aria-label="Select all memos on this page" checked={currentMemoIds.length > 0 && currentMemoIds.every((id) => selectedMemoIds.includes(id))} onChange={toggleCurrentPageMemoSelection} />
                  </th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Author</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Approval</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan="8">Loading memo register...</td></tr>
                ) : memoRecords.length ? (
                  memoRecords.map((item) => (
                    <tr key={item.id}>
                      <td><input type="checkbox" aria-label={`Select memo ${item.reference || item.subject}`} checked={selectedMemoIds.includes(String(item.id))} onChange={() => toggleMemoSelection(item.id)} /></td>
                      <td>{item.subject}</td>
                      <td>{titleize(item.category)}</td>
                      <td>{item.memo_from}</td>
                      <td>{formatDate(item.memo_date)}</td>
                      <td><span className={`memo-status-pill is-${item.status}`}>{titleize(item.status)}</span></td>
                      <td><span className={`memo-status-pill is-${item.approval_status}`}>{titleize(item.approval_status)}</span></td>
                      <td>
                        <div className="header-actions memo-row-actions">
                          <button type="button" className="ghost-button" onClick={() => openMemoModal(item.id)}>View</button>
                          <button type="button" className="ghost-button" onClick={() => printMemoRecords([item])}>Print / Save PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="8">No memos match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {memoData?.pagination ? (
            <div className="pagination-bar">
              <span>
                Showing {memoData.pagination.total
                  ? (memoData.pagination.page - 1) * memoData.pagination.per_page + 1
                  : 0}
                -{Math.min(memoData.pagination.page * memoData.pagination.per_page, memoData.pagination.total)}
                {' '}of {memoData.pagination.total} memos
              </span>
              <div className="pagination-actions">
                <span>Page {memoData.pagination.page} of {Math.max(memoData.pagination.total_pages, 1)}</span>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isLoading || memoData.pagination.page <= 1}
                  onClick={() => setQuery((current) => ({ ...current, page: memoData.pagination.page - 1 }))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isLoading || memoData.pagination.page >= memoData.pagination.total_pages}
                  onClick={() => setQuery((current) => ({ ...current, page: memoData.pagination.page + 1 }))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Memo Reader</p>
              <h3>Open memos in a popup workspace</h3>
            </div>
            <span className="panel-tag">{memoData?.memos?.length ?? 0} available</span>
          </div>
          <p className="muted-copy">Use the `View` button on any memo row to open a focused reading modal with the full memo, signatures, attachments, and approval controls.</p>
        </article>
      </section>

      {isViewModalOpen ? (
        <div className="modal-overlay" onClick={closeMemoModal}>
          <article className="modal-panel memo-read-modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Memo Detail</p>
                <h3>{memo?.subject ?? 'Loading memo'}</h3>
              </div>
              <div className="header-actions">
                <span className="panel-tag">{memo ? titleize(memo.approval_status) : 'Loading'}</span>
                {memo ? <button type="button" className="primary-button" onClick={() => printMemoRecords([{ memo, attachments: detail?.attachments ?? [] }])}>Print / Save PDF</button> : null}
                <button type="button" className="ghost-button" onClick={closeMemoModal}>Close</button>
              </div>
            </div>

            {isLoadingDetail ? <p className="muted-copy">Loading memo detail...</p> : memo ? (
              <div className="stack-list memo-detail-flow">
                <div className="memo-detail-meta">
                  <div className="memo-detail-chip">
                    <strong>Routing</strong>
                    <span>{memo.memo_from} to {memo.memo_to}</span>
                  </div>
                  <div className="memo-detail-chip">
                    <strong>Memo Date</strong>
                    <span>{formatDate(memo.memo_date)}</span>
                  </div>
                  <div className="memo-detail-chip">
                    <strong>Reference</strong>
                    <span>{memo.reference || 'No reference'}</span>
                  </div>
                  <div className="memo-detail-chip">
                    <strong>Category</strong>
                    <span>{titleize(memo.category)}</span>
                  </div>
                </div>

                <div className="memo-body-card">
                  <strong>Memo body</strong>
                  <p>{memo.body}</p>
                </div>

                <div className="memo-signature-grid">
                  <MemoSignatureCard
                    label="Accountant signature"
                    url={memo.digital_signature_url}
                    signer={memo.memo_from || memo.created_by || 'Accountant'}
                    emptyMessage="No accountant signature was attached to this memo."
                    missingMessage="This legacy accountant signature file is missing from server uploads."
                    imageEndpoint={memo.digital_signature ? `/memos/${memo.id}/signature-image/accountant?branch_id=${memo.branch_id}` : ''}
                    token={token}
                  />
                  <MemoSignatureCard
                    label="Management signature"
                    url={memo.gm_signature_url}
                    signer={memo.approved_by || 'General Manager'}
                    emptyMessage={memo.approval_status === 'pending'
                      ? 'Management has not signed this memo yet.'
                      : memo.approval_status === 'rejected'
                        ? 'This memo was rejected without a management signature image.'
                        : 'No management signature was attached to this memo.'}
                    missingMessage="This legacy management signature file is missing from server uploads."
                    imageEndpoint={memo.gm_signature ? `/memos/${memo.id}/signature-image/gm?branch_id=${memo.branch_id}` : ''}
                    token={token}
                  />
                </div>

                {(detail?.attachments ?? []).length ? (
                  <div className="memo-file-list">
                    <strong>Attachments</strong>
                    {asList(detail.attachments).map((file) => (
                      <a key={file.id} href={file.file_url} target="_blank" rel="noreferrer" className="ghost-button">{file.original_name}</a>
                    ))}
                  </div>
                ) : null}

                {(detail?.approvals ?? []).length ? (
                  <div className="stack-list">
                    {asList(detail.approvals).map((item) => (
                      <div key={item.id} className="stack-item">
                        <div>
                          <strong>{titleize(item.action)}</strong>
                          <span>{item.approver_name} | {titleize(item.approver_role)}</span>
                        </div>
                        <div className="stack-meta">
                          <strong>{formatDateTime(item.created_at)}</strong>
                          <span>{item.notes || 'No note provided'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {!canApprove && memo?.status === 'draft' ? (
                  <div className="header-actions">
                    <button type="button" className="ghost-button" onClick={() => loadDraftIntoComposer(memo.id)}>
                      Continue Draft
                    </button>
                  </div>
                ) : null}

                {canApprove && isPendingApproval ? (
                  <form className="memo-decision-form" onSubmit={submitDecision}>
                    <label className="memo-decision-field">
                      Decision
                      <select value={decisionForm.decision} onChange={(event) => setDecisionForm((current) => ({ ...current, decision: event.target.value }))}>
                        <option value="approved">Approve</option>
                        <option value="rejected">Reject</option>
                      </select>
                    </label>
                    <label className="memo-decision-field">
                      Approval note
                      <textarea rows="4" value={decisionForm.approval_notes} onChange={(event) => setDecisionForm((current) => ({ ...current, approval_notes: event.target.value }))} placeholder="Add the approval reason or rejection note." />
                    </label>
                    <div className="memo-signature-enforcement">
                      {reusableSignature?.signature_url
                        ? `This decision will be stamped with ${reusableSignature.signer_name || session?.name}'s saved signature.`
                        : 'Save your reusable General Manager signature above before submitting this decision.'}
                    </div>
                    <button type="submit" className="primary-button" disabled={isDeciding}>
                      {isDeciding ? 'Saving decision...' : 'Submit Decision'}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : (
              <p className="muted-copy">Choose a memo from the register to review its body, signatures, attachments, and approval trail.</p>
            )}
          </article>
        </div>
      ) : null}
    </section>
  )
}

function titleize(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return 'No date'
  return new Date(value).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
