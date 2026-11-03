import { useEffect, useRef, useState } from 'react'
import './PublicRegistrationPage.css'
import PublicPatientIdCard, { downloadPatientIdCardPdf } from './PublicPatientIdCard.jsx'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`
).replace(/\/+$/, '')

const PURPOSES = [
  'Consultation', 'Lens', 'Frame', 'Repairs', 'Consultation + Lens', 'Consultation + Frame',
  'Consultation + Repairs', 'Lens + Frame', 'Lens + Repairs', 'Frame + Repairs',
  'Consultation + Lens + Frame', 'Consultation + Lens + Repairs', 'Consultation + Frame + Repairs',
  'Lens + Frame + Repairs', 'Consultation + Lens + Frame + Repairs',
]

function todayIso() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function freshForm() {
  return {
    branch_id: '', surname: '', firstname: '', othernames: '', sex: '', dob: '', age: '',
    email: '', phone: '', address: '', residence: '', patient_type: '', purpose: 'Consultation',
    appointment_date: todayIso(), comment: '', privacy_consent: false, website: '',
  }
}

function calculateAge(dateValue) {
  const birthDate = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(birthDate.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1
  return age >= 0 && age <= 150 ? String(age) : ''
}

function newIdempotencyKey() {
  return window.crypto?.randomUUID?.() ?? `public-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function patientInitials(form) {
  return [form.surname, form.firstname, form.othernames]
    .map((value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase())
    .filter(Boolean).join('').slice(0, 3) || 'PT'
}

function resolveCompanyHeroUrl(value) {
  if (!value) return ''
  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.pathname.includes('/uploads/company-profile/')) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}`
    }
    return parsed.href
  } catch {
    return ''
  }
}

export default function PublicRegistrationPage() {
  const [form, setForm] = useState(freshForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)
  const [companyProfile, setCompanyProfile] = useState(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [showCardPreview, setShowCardPreview] = useState(false)
  const [isDownloadingCard, setIsDownloadingCard] = useState(false)
  const [isIssuingFolderId, setIsIssuingFolderId] = useState(false)
  const [folderAllocation, setFolderAllocation] = useState(null)
  const idempotencyKey = useRef(newIdempotencyKey())
  const folderId = success?.folderId || folderAllocation?.folderId || ''
  const issuedAt = success?.issuedAt || folderAllocation?.issuedAt || todayIso()
  const cardDetails = { form, folderId: success?.folderId || folderId, issuedAt, photoUrl }
  const branchProfileKey = form.branch_id === '1' ? 'labadi' : form.branch_id === '2' ? 'madina' : ''
  const mergedHeroImage = companyProfile?.dashboard_hero_image_url || companyProfile?.dashboard_hero_image
  const selectedBranchHeroImage = branchProfileKey
    ? (companyProfile?.[`${branchProfileKey}_dashboard_hero_image_url`] || companyProfile?.[`${branchProfileKey}_dashboard_hero_image`])
    : ''
  const branchHeroImage = resolveCompanyHeroUrl(selectedBranchHeroImage || mergedHeroImage)
  const heroPositionX = branchProfileKey
    ? (companyProfile?.[`${branchProfileKey}_dashboard_hero_position_x`] ?? companyProfile?.dashboard_hero_position_x ?? 50)
    : (companyProfile?.dashboard_hero_position_x ?? 50)
  const heroPositionY = branchProfileKey
    ? (companyProfile?.[`${branchProfileKey}_dashboard_hero_position_y`] ?? companyProfile?.dashboard_hero_position_y ?? 50)
    : (companyProfile?.dashboard_hero_position_y ?? 50)
  const heroStyle = branchHeroImage ? {
    backgroundImage: `linear-gradient(90deg, rgba(12, 39, 69, .88), rgba(16, 63, 111, .48)), url("${branchHeroImage}")`,
    backgroundPosition: `center, ${heroPositionX}% ${heroPositionY}%`,
  } : undefined

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Patient Registration | Bealet Optical Center'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/company-profile`, { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (!cancelled) setCompanyProfile(payload?.profile ?? null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl) }, [photoUrl])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    if (error) setError('')
  }

  async function getFolderId() {
    const initials = patientInitials(form)
    if (folderAllocation?.initials === initials && folderAllocation.folderId) return folderAllocation.folderId

    const response = await fetch(`${API_BASE}/public/folder-ids`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Idempotency-Key': newIdempotencyKey(),
      },
      body: JSON.stringify({ initials, website: form.website }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const firstValidationError = Object.values(payload?.errors ?? {}).flat?.()?.[0]
      throw new Error(payload?.message || firstValidationError || 'We could not prepare a folder ID. Please try again.')
    }
    const nextAllocation = {
      folderId: payload.folder_id,
      initials,
      issuedAt: payload.issued_at || todayIso(),
    }
    setFolderAllocation(nextAllocation)
    return nextAllocation.folderId
  }

  async function previewCard() {
    if (!form.branch_id || !form.surname.trim() || !form.firstname.trim() || !form.sex) {
      setError('Enter your branch, surname, first name, and sex before previewing your ID card.')
      return
    }
    setError('')
    setIsIssuingFolderId(true)
    try {
      await getFolderId()
      setShowCardPreview(true)
    } catch (issueError) {
      setError(issueError.message || 'We could not prepare your ID card. Please try again.')
    } finally {
      setIsIssuingFolderId(false)
    }
  }

  function selectPhoto(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image for your card photo.')
      event.target.value = ''
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Choose an image smaller than 4 MB.')
      event.target.value = ''
      return
    }
    setPhotoUrl(URL.createObjectURL(file))
    setError('')
  }

  async function downloadCard() {
    setIsDownloadingCard(true)
    setError('')
    try { await downloadPatientIdCardPdf(cardDetails) }
    catch { setError('We could not prepare the PDF on this device. Please try again.') }
    finally { setIsDownloadingCard(false) }
  }

  async function submitRegistration(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const issuedFolderId = await getFolderId()
      const response = await fetch(`${API_BASE}/public/registrations`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({
          ...form,
          branch_id: Number(form.branch_id),
          age: form.age === '' ? null : Number(form.age),
          folder_id: issuedFolderId,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 409) setFolderAllocation(null)
        const firstValidationError = Object.values(payload?.errors ?? {}).flat?.()?.[0]
        throw new Error(payload?.message || firstValidationError || 'We could not submit your registration. Please try again.')
      }
      setSuccess({ message: payload.message || 'Your registration has been received.', folderId: payload.folder_id ?? issuedFolderId, issuedAt: payload.issued_at ?? folderAllocation?.issuedAt ?? todayIso() })
      setShowCardPreview(false)
      idempotencyKey.current = newIdempotencyKey()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (submitError) {
      setError(submitError.message || 'We could not submit your registration. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function registerAnother() {
    setForm(freshForm())
    setSuccess(null)
    setError('')
    setFolderAllocation(null)
    setPhotoUrl('')
    idempotencyKey.current = newIdempotencyKey()
  }

  return (
    <main className="public-registration-page">
      <div className="public-registration-shell">
        <header className="public-registration-brandbar">
          <a className="public-registration-brand" href="/" aria-label="Bealet Optical Center home">
            <span className="public-registration-logo"><img src="/bealet-logo.png" alt="" /></span>
            <span><strong>Bealet Optical Center</strong><small>Your Vision Providers.</small></span>
          </a>
          <span className="public-registration-availability"><i /> Labadi <b>·</b> Madina</span>
        </header>

        <section className={'public-registration-intro' + (branchHeroImage ? ' has-branch-hero' : '')} style={heroStyle}>
          <span className="public-registration-kicker"><i /> PATIENT REGISTRATION</span>
          <h1>Start your visit<br /><em>with confidence.</em></h1>
          <p>Complete this short form while you wait. Our team will have your details ready when it’s your turn.</p>
          {form.branch_id ? <span className="public-registration-branch-badge">{form.branch_id === '1' ? 'Labadi branch' : 'Madina branch'} <i /> {branchHeroImage ? 'Your selected branch' : 'Branch selected'}</span> : null}
          <div className="public-registration-steps" aria-label="Registration takes three steps">
            <span><b>01</b> Your details</span><i /><span><b>02</b> Contact</span><i /><span><b>03</b> Visit</span>
          </div>
        </section>

        {success ? (
          <section className="public-registration-success" role="status" aria-live="polite">
            <span className="public-registration-success-mark" aria-hidden="true">✓</span>
            <p className="public-registration-kicker">REGISTRATION RECEIVED</p>
            <h2>You’re all set.</h2>
            <p>{success.message} Your ID card is ready to download.</p>
            <div className="public-registration-card-result"><PublicPatientIdCard {...cardDetails} /></div>
            <button type="button" className="public-registration-submit" onClick={downloadCard} disabled={isDownloadingCard}>{isDownloadingCard ? 'Preparing your PDF…' : 'Download ID card PDF'} <span aria-hidden="true">↓</span></button>
            <button type="button" className="public-registration-submit" onClick={registerAnother}>Register another person <span aria-hidden="true">→</span></button>
          </section>
        ) : (
          <form className="public-registration-form" onSubmit={submitRegistration}>
            <div className="public-registration-form-heading">
              <span className="public-registration-form-icon" aria-hidden="true">✦</span>
              <div><p className="public-registration-kicker">WELCOME</p><h2>Your registration</h2><p>Fields marked with <b>*</b> are required.</p></div>
            </div>

            {error ? <div className="public-registration-error" role="alert">{error}</div> : null}

            <div className="public-registration-fields">
              <label className="public-registration-field"><span>Choose a branch <b>*</b></span><select value={form.branch_id} onChange={(event) => updateField('branch_id', event.target.value)} required><option value="">Select where you’re visiting</option><option value="1">Labadi</option><option value="2">Madina</option></select></label>
              <label className="public-registration-field"><span>Patient type <b>*</b></span><select value={form.patient_type} onChange={(event) => updateField('patient_type', event.target.value)} required><option value="">Select patient type</option><option value="new">New patient</option><option value="old">Returning patient</option></select></label>

              <div className="public-registration-section-title"><span>01</span><div><strong>About you</strong><small>Enter your name as it appears on your ID.</small></div></div>
              <label className="public-registration-field"><span>Surname <b>*</b></span><input autoComplete="family-name" value={form.surname} onChange={(event) => updateField('surname', event.target.value)} placeholder="e.g. Arthur" maxLength="100" required /></label>
              <label className="public-registration-field"><span>First name <b>*</b></span><input autoComplete="given-name" value={form.firstname} onChange={(event) => updateField('firstname', event.target.value)} placeholder="e.g. Caleb" maxLength="100" required /></label>
              <label className="public-registration-field"><span>Other names</span><input autoComplete="additional-name" value={form.othernames} onChange={(event) => updateField('othernames', event.target.value)} placeholder="Middle or additional names" maxLength="100" /></label>
              <label className="public-registration-field"><span>Sex <b>*</b></span><select value={form.sex} onChange={(event) => updateField('sex', event.target.value)} required><option value="">Select sex</option><option value="Female">Female</option><option value="Male">Male</option></select></label>
              <label className="public-registration-field"><span>Date of birth</span><input type="date" autoComplete="bday" max={todayIso()} value={form.dob} onChange={(event) => { const dob = event.target.value; setForm((current) => ({ ...current, dob, age: dob ? calculateAge(dob) : '' })); setError('') }} /></label>
              <label className="public-registration-field"><span>Age</span><input type="number" min="0" max="150" inputMode="numeric" value={form.age} onChange={(event) => updateField('age', event.target.value)} placeholder="Auto-filled from date of birth" /></label>
              <label className="public-registration-field public-registration-photo-field"><span>Photo for your ID card <small>Optional</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} /><small>JPG, PNG or WebP up to 4 MB. Used for your card only; no photo is saved to your patient record.</small></label>

              <div className="public-registration-section-title"><span>02</span><div><strong>How we can reach you</strong><small>Your contact details help us follow up on your visit.</small></div></div>
              <label className="public-registration-field"><span>Phone number <b>*</b></span><input type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} placeholder="e.g. 024 000 0000" maxLength="20" required /></label>
              <label className="public-registration-field"><span>Email address</span><input type="email" autoComplete="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="you@example.com" maxLength="100" /></label>
              <label className="public-registration-field"><span>Address</span><input autoComplete="street-address" value={form.address} onChange={(event) => updateField('address', event.target.value)} placeholder="Street or location" maxLength="255" /></label>
              <label className="public-registration-field"><span>Town / residence</span><input autoComplete="address-level2" value={form.residence} onChange={(event) => updateField('residence', event.target.value)} placeholder="e.g. Osu" maxLength="255" /></label>

              <div className="public-registration-section-title"><span>03</span><div><strong>About your visit</strong><small>Tell us what you need help with.</small></div></div>
              <label className="public-registration-field"><span>Visit purpose <b>*</b></span><select value={form.purpose} onChange={(event) => updateField('purpose', event.target.value)} required>{PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}</select></label>
              <label className="public-registration-field"><span>Appointment date</span><input type="date" min={todayIso()} value={form.appointment_date} onChange={(event) => updateField('appointment_date', event.target.value)} /></label>
              <label className="public-registration-field public-registration-full"><span>Anything you’d like us to know?</span><textarea rows="3" value={form.comment} onChange={(event) => updateField('comment', event.target.value)} placeholder="Optional note for our reception and care team" /></label>
            </div>

            <label className="public-registration-honeypot" aria-hidden="true" tabIndex="-1">Leave this field empty<input name="website" autoComplete="off" tabIndex="-1" value={form.website} onChange={(event) => updateField('website', event.target.value)} /></label>

            <button type="button" className="public-registration-preview-button" onClick={previewCard} disabled={isIssuingFolderId}>{isIssuingFolderId ? 'Preparing your ID card…' : 'Preview your patient ID card'} <span aria-hidden="true">↗</span></button>
            <label className="public-registration-consent"><input type="checkbox" checked={form.privacy_consent} onChange={(event) => updateField('privacy_consent', event.target.checked)} required /><span>I agree to provide this information to Bealet Optical Center for patient registration and care coordination.</span></label>

            <button type="submit" className="public-registration-submit" disabled={submitting}>{submitting ? 'Sending your registration…' : 'Submit registration'} <span aria-hidden="true">→</span></button>
            <p className="public-registration-privacy">Your details are submitted securely to our clinic and are not displayed publicly.</p>
          </form>
        )}

        <footer className="public-registration-footer"><span>Bealet Optical Center <i>Your Vision Providers.</i></span><span>Developed and Designed by DALE QUIST [Enable Technologies]</span></footer>
      </div>
      {showCardPreview && !success ? <div className="public-registration-preview-backdrop" role="presentation" onClick={() => setShowCardPreview(false)}><section className="public-registration-preview-modal" role="dialog" aria-modal="true" aria-labelledby="public-registration-preview-title" onClick={(event) => event.stopPropagation()}><button type="button" className="public-registration-preview-close" aria-label="Close ID card preview" onClick={() => setShowCardPreview(false)}>×</button><p className="public-registration-kicker">CARD PREVIEW</p><h2 id="public-registration-preview-title">Your patient ID card</h2><p>Review the details below. Your folder ID will be saved with this registration.</p><PublicPatientIdCard {...cardDetails} /><button type="button" className="public-registration-submit" onClick={() => setShowCardPreview(false)}>Back to registration <span aria-hidden="true">←</span></button></section></div> : null}
    </main>
  )
}
