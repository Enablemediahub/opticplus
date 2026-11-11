import './PublicPatientIdCard.css'

function fullName(form) {
  return [form.surname, form.firstname, form.othernames].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ')
}

function formatCardDate(value) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' })
}

export default function PublicPatientIdCard({ form, folderId, issuedAt, photoUrl }) {
  const name = fullName(form) || 'Patient name'
  const branch = Number(form.branch_id) === 1 ? 'Labadi' : Number(form.branch_id) === 2 ? 'Madina' : 'Branch'
  const age = form.age ? `${form.age} years` : form.dob ? `${ageFromDob(form.dob)} years` : '—'

  return (
    <article className="public-patient-id-card" role="img" aria-label={`Bealet Optical Center patient ID card for ${name}, folder ID ${folderId}`}>
      <header className="public-patient-id-header">
        <span className="public-patient-id-logo"><img src="/bealet-logo.png" alt="" /></span>
        <span className="public-patient-id-brand"><strong>BEALET OPTICAL CENTER</strong><small>Your Vision Providers.</small></span>
        <span className="public-patient-id-chip">PATIENT ID</span>
      </header>
      <div className="public-patient-id-main">
        <div className="public-patient-id-photo">
          {photoUrl ? <img src={photoUrl} alt="Patient portrait" /> : <PatientAvatarVector sex={form.sex} />}
        </div>
        <div className="public-patient-id-details">
          <span className="public-patient-id-label">REGISTERED CLIENT</span>
          <h3>{name}</h3>
          <div className="public-patient-id-folder"><small>FOLDER ID</small><strong>{folderId}</strong></div>
          <div className="public-patient-id-stats">
            <span><small>SEX</small><strong>{form.sex || '—'}</strong></span>
            <span><small>AGE</small><strong>{age}</strong></span>
            <span><small>BRANCH</small><strong>{branch}</strong></span>
            <span><small>PHONE</small><strong>{form.phone || '—'}</strong></span>
          </div>
        </div>
      </div>
      <footer className="public-patient-id-footer"><span><small>ISSUED</small><strong>{formatCardDate(issuedAt)}</strong></span><span>Present this card at reception</span><i aria-hidden="true">O+</i></footer>
    </article>
  )
}

export function PatientAvatarVector({ sex }) {
  const female = sex === 'Female'
  return (
    <svg className="public-patient-id-avatar-vector" viewBox="0 0 240 240" role="img" aria-label={sex ? `${sex} silhouette portrait` : 'Silhouette portrait'}>
      <circle cx="120" cy="120" r="112" fill="#f4f6f8" />
      <circle cx="120" cy="120" r="108" fill="none" stroke="#17212b" strokeWidth="7" />
      {female ? <path d="M75 111c-9-52 12-83 45-83 37 0 55 32 45 83l-8 43H83z" fill="#17212b" /> : null}
      <circle cx="120" cy="91" r="34" fill="#17212b" />
      <path d="M45 209c7-41 32-64 75-68 43 4 68 27 75 68-20 16-46 25-75 25s-55-9-75-25z" fill="#17212b" />
      <path d="M94 145h52l-8 21-18 12-18-12z" fill="#f4f6f8" />
      <path d="m108 169 12 9 12-9 11 55h-46z" fill="#17212b" />
    </svg>
  )
}

function ageFromDob(value) {
  const birthDate = new Date(`${value}T00:00:00`)
  if (Number.isNaN(birthDate.getTime())) return '—'
  const now = new Date()
  let age = now.getFullYear() - birthDate.getFullYear()
  if (now.getMonth() < birthDate.getMonth() || (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate())) age -= 1
  return age >= 0 && age <= 150 ? age : '—'
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function roundedPath(context, x, y, width, height, radius) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function fitImage(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) * .35, drawWidth, drawHeight)
}

function drawAvatar(context, sex, x, y, width, height) {
  const female = sex === 'Female'
  const scale = Math.min(width, height) / 240
  context.save()
  context.translate(x, y)
  context.scale(scale, scale)
  context.fillStyle = '#f4f6f8'; context.beginPath(); context.arc(120, 120, 112, 0, Math.PI * 2); context.fill()
  context.strokeStyle = '#17212b'; context.lineWidth = 7; context.beginPath(); context.arc(120, 120, 108, 0, Math.PI * 2); context.stroke()
  context.fillStyle = '#17212b'
  if (female) { context.beginPath(); context.moveTo(75, 111); context.bezierCurveTo(66, 59, 87, 28, 120, 28); context.bezierCurveTo(157, 28, 175, 60, 165, 111); context.lineTo(157, 154); context.lineTo(83, 154); context.closePath(); context.fill() }
  context.beginPath(); context.arc(120, 91, 34, 0, Math.PI * 2); context.fill()
  context.beginPath(); context.moveTo(45, 209); context.bezierCurveTo(52, 168, 77, 145, 120, 141); context.bezierCurveTo(163, 145, 188, 168, 195, 209); context.bezierCurveTo(175, 225, 149, 234, 120, 234); context.bezierCurveTo(91, 234, 65, 225, 45, 209); context.closePath(); context.fill()
  context.fillStyle = '#f4f6f8'; context.beginPath(); context.moveTo(94, 145); context.lineTo(146, 145); context.lineTo(138, 166); context.lineTo(120, 178); context.lineTo(102, 166); context.closePath(); context.fill()
  context.fillStyle = '#17212b'; context.beginPath(); context.moveTo(108, 169); context.lineTo(120, 178); context.lineTo(132, 169); context.lineTo(143, 224); context.lineTo(97, 224); context.closePath(); context.fill()
  context.restore()
}

async function renderPatientCardJpeg({ form, folderId, issuedAt, photoUrl }) {
  const width = 1200
  const height = 756
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'; context.fillRect(0, 0, width, height)
  context.save(); roundedPath(context, 0, 0, width, height, 42); context.clip()
  const header = context.createLinearGradient(0, 0, width, 0); header.addColorStop(0, '#102f50'); header.addColorStop(.68, '#1d5486'); header.addColorStop(1, '#2b72b8')
  context.fillStyle = header; context.fillRect(0, 0, width, 174)
  context.globalAlpha = .1; context.fillStyle = '#fff'; context.beginPath(); context.arc(1110, 18, 230, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1
  try { const logo = await loadImage('/bealet-logo.png'); context.drawImage(logo, 45, 45, 84, 84) } catch { context.fillStyle = '#fff'; context.beginPath(); context.arc(87, 87, 42, 0, Math.PI * 2); context.fill() }
  context.fillStyle = '#fff'; context.textBaseline = 'alphabetic'; context.font = '700 34px Arial'; context.fillText('BEALET OPTICAL CENTER', 153, 83)
  context.fillStyle = '#dbeaff'; context.font = '500 20px Arial'; context.fillText('Your Vision Providers.', 155, 116)
  context.fillStyle = '#eaf3ff'; context.textAlign = 'right'; context.font = '700 17px Arial'; context.fillText('PATIENT ID', 1148, 99); context.textAlign = 'left'
  context.strokeStyle = 'rgba(255,255,255,.25)'; context.lineWidth = 2; context.beginPath(); context.moveTo(54, 173); context.lineTo(1146, 173); context.stroke()

  const photoX = 58, photoY = 246, photoSize = 250
  context.save(); context.beginPath(); context.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2); context.clip()
  try { if (photoUrl) fitImage(context, await loadImage(photoUrl), photoX, photoY, photoSize, photoSize); else drawAvatar(context, form.sex, photoX, photoY, photoSize, photoSize) }
  catch { drawAvatar(context, form.sex, photoX, photoY, photoSize, photoSize) }
  context.restore()
  context.strokeStyle = '#d6e0e9'; context.lineWidth = 4; context.beginPath(); context.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2 - 2, 0, Math.PI * 2); context.stroke()

  const textX = 350
  context.fillStyle = '#4a7ca9'; context.font = '700 15px Arial'; context.fillText('REGISTERED CLIENT', textX, 231)
  context.fillStyle = '#14334f'; context.font = '700 42px Arial'
  const name = fullName(form) || 'Patient name'
  context.fillText(name.length > 30 ? `${name.slice(0, 28)}…` : name, textX, 286, 790)
  context.fillStyle = '#f3f7fb'; roundedPath(context, textX, 312, 785, 62, 12); context.fill()
  context.strokeStyle = '#dce8f3'; context.lineWidth = 2; roundedPath(context, textX, 312, 785, 62, 12); context.stroke()
  context.fillStyle = '#72869a'; context.font = '700 13px Arial'; context.fillText('FOLDER ID', textX + 16, 337)
  context.fillStyle = '#1d5b91'; context.font = '700 24px Arial'; context.fillText(folderId, textX + 16, 361, 745)

  const branch = Number(form.branch_id) === 1 ? 'Labadi' : Number(form.branch_id) === 2 ? 'Madina' : '—'
  const age = form.age ? `${form.age} yrs` : form.dob ? `${ageFromDob(form.dob)} yrs` : '—'
  const items = [
    ['SEX', form.sex || '—'], ['AGE', age], ['BRANCH', branch],
    ['PHONE', form.phone || '—'], ['PATIENT TYPE', form.patient_type === 'old' ? 'Returning' : form.patient_type === 'new' ? 'New patient' : '—'],
  ]
  context.strokeStyle = '#e5ebf1'; context.lineWidth = 2; context.beginPath(); context.moveTo(textX, 399); context.lineTo(1144, 399); context.stroke()
  const positions = [[textX, 440], [textX + 255, 440], [textX + 510, 440], [textX, 524], [textX + 300, 524]]
  items.forEach(([label, value], index) => {
    const [x, y] = positions[index]
    context.fillStyle = '#8293a2'; context.font = '700 13px Arial'; context.fillText(label, x, y)
    context.fillStyle = '#233f57'; context.font = '700 18px Arial'; context.fillText(String(value), x, y + 27, 225)
  })

  context.fillStyle = '#f5f8fb'; context.fillRect(0, 635, width, 121)
  context.strokeStyle = '#e3eaf1'; context.lineWidth = 2; context.beginPath(); context.moveTo(0, 635); context.lineTo(width, 635); context.stroke()
  context.fillStyle = '#8091a1'; context.font = '700 13px Arial'; context.fillText('ISSUED', 55, 681)
  context.fillStyle = '#173b5d'; context.font = '700 22px Arial'; context.fillText(formatCardDate(issuedAt), 55, 716)
  context.fillStyle = '#62788d'; context.font = '500 16px Arial'; context.textAlign = 'right'; context.fillText('Please present this card at reception', 1094, 703); context.textAlign = 'left'
  context.fillStyle = '#286ba8'; context.beginPath(); context.arc(1145, 696, 25, 0, Math.PI * 2); context.fill()
  context.fillStyle = '#fff'; context.textAlign = 'center'; context.font = '800 13px Arial'; context.fillText('O+', 1145, 701); context.textAlign = 'left'
  context.restore()
  return { width, height, bytes: dataUrlToBytes(canvas.toDataURL('image/jpeg', .94)) }
}

function dataUrlToBytes(dataUrl) {
  const binary = window.atob(dataUrl.split(',')[1])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function makePdfBytes(image) {
  const encoder = new TextEncoder()
  const parts = []
  const offsets = [0]
  let length = 0
  const push = (part) => { const bytes = typeof part === 'string' ? encoder.encode(part) : part; parts.push(bytes); length += bytes.length }
  const pageWidth = 242.65
  const pageHeight = 153.07
  push('%PDF-1.4\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  ]
  objects.forEach((object, index) => { offsets[index + 1] = length; push(`${index + 1} 0 obj\n${object}\nendobj\n`) })
  offsets[4] = length
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`)
  push(image.bytes)
  push('\nendstream\nendobj\n')
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`
  offsets[5] = length
  push(`5 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`)
  const xrefOffset = length
  push('xref\n0 6\n0000000000 65535 f \n')
  for (let index = 1; index <= 5; index += 1) push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
  const output = new Uint8Array(length)
  let cursor = 0
  for (const part of parts) { output.set(part, cursor); cursor += part.length }
  return output
}

export async function createPatientIdCardPdf(card) {
  const image = await renderPatientCardJpeg(card)
  return new Blob([makePdfBytes(image)], { type: 'application/pdf' })
}

export async function downloadPatientIdCardPdf(card) {
  const blob = await createPatientIdCardPdf(card)
  const blobUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = blobUrl
  anchor.download = `bealet-patient-card-${String(card.folderId).replaceAll('/', '-')}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500)
}
