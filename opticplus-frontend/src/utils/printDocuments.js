export function escapePrintHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function openPrintDocumentWindow() {
  return window.open('', '_blank', 'noopener=false,width=900,height=720')
}

export function writePrintDocumentWindow(printWindow, title, pages) {
  if (!printWindow || printWindow.closed) return false
  const pageMarkup = pages.map((page, index) => `
    <main class="print-page${page.includes('certificate-of-honour-print') ? ' certificate-print-page' : ''}${index < pages.length - 1 ? ' page-break' : ''}">
      <header class="brand-header">
        <img src="${escapePrintHtml(`${window.location.origin}/bealet-logo.png`)}" alt="Bealet Optical Center" />
        <div>HEAD OFFICE: FIRE STONE BUILDING, MADINA RD, GHANA<br />PHONE: +233553998962 | EMAIL: BEALETOPTICALCENTER@GMAIL.COM</div>
      </header>
      ${page}
      <footer>BEALET OPTICAL CENTER <span>${escapePrintHtml(title)}</span></footer>
    </main>`).join('')

  printWindow.document.open()
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8" /><title>${escapePrintHtml(title)}</title>
    <style>
      @page { size: A4 portrait; margin: 15mm 16mm 17mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111; background: #fff; font: 11pt Arial, Helvetica, sans-serif; }
      .print-page { position: relative; min-height: 265mm; padding-bottom: 18mm; break-inside: avoid; page-break-inside: avoid; }
      .page-break { page-break-after: always; break-after: page; }
      .brand-header { display: flex; min-height: 29mm; flex-direction: column; justify-content: flex-end; gap: 3mm; border-bottom: 1px solid #222; padding-bottom: 3mm; }
      .brand-header img { width: 43mm; height: 17mm; object-fit: contain; object-position: left center; }
      .brand-header div { font-size: 7.2pt; line-height: 1.4; letter-spacing: .02em; }
      h1 { margin: 5mm 0 2mm; font-size: 24pt; font-weight: 400; letter-spacing: -.03em; }
      .doc-kicker { margin: 0; color: #555; font-size: 8pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
      .doc-reference { margin: 0; text-align: right; font-size: 8pt; }
      .doc-topline { display: flex; align-items: end; justify-content: space-between; gap: 8mm; }
      .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm 9mm; margin: 10mm 0 8mm; }
      .detail-line { display: flex; align-items: end; gap: 3mm; min-height: 7mm; border-bottom: 1px dotted #777; }
      .detail-line b { flex: 0 0 auto; font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; }
      .detail-line span { overflow-wrap: anywhere; font-size: 9pt; }
      .record-table { width: 100%; margin: 8mm 0; border-collapse: collapse; }
      .record-table th { padding: 3mm; background: #111; color: #fff; text-align: left; font-size: 8pt; font-weight: 500; letter-spacing: .05em; text-transform: uppercase; }
      .record-table td { height: 16mm; padding: 3mm; border: 1px solid #777; vertical-align: top; font-size: 9pt; }
      .record-table .amount { width: 32mm; text-align: right; white-space: nowrap; }
      .declaration { margin: 8mm 0; padding: 5mm; border: 1px solid #999; line-height: 1.6; }
      .totals { width: 70mm; margin: 6mm 0 0 auto; }
      .totals div { display: flex; justify-content: space-between; padding: 2mm 0; border-bottom: 1px solid #aaa; }
      .totals .grand { margin-top: 2mm; border-top: 1px solid #111; border-bottom: 0; font-size: 15pt; font-weight: 800; }
      .approval-note { margin-top: 7mm; padding: 4mm; background: #f4f4f4; line-height: 1.5; }
      .memo-body { margin-top: 8mm; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
      .memo-subject { margin: 9mm 0 2mm; font-size: 12pt; font-weight: 700; }
      .signature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; margin-top: 16mm; }
      .signature { min-height: 25mm; display: flex; flex-direction: column; justify-content: end; border-bottom: 1px solid #333; }
      .signature img { max-width: 52mm; max-height: 18mm; object-fit: contain; object-position: left bottom; }
      .signature strong { margin-top: 2mm; font-size: 9pt; }
      .signature span { margin-top: 1mm; color: #555; font-size: 8pt; }
      .approval-stamp { display: inline-block; padding: 2mm 4mm; border: 1px solid #111; font-size: 9pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      .certificate-print-page { padding-bottom: 8mm; }
      .certificate-print-page footer { margin-top: 8mm; }
      .certificate-of-honour-print { font-size: 9.2pt; }
      .certificate-of-honour-print .doc-topline h1 { font-size: 21pt; }
      .certificate-of-honour-print .details-grid { gap: 2mm 7mm; margin: 5mm 0; }
      .certificate-of-honour-print .record-table { margin: 4mm 0; }
      .certificate-of-honour-print .record-table td { height: 12mm; }
      .certificate-of-honour-print .declaration { margin: 5mm 0; padding: 4mm; line-height: 1.45; }
      .certificate-of-honour-print .totals { margin-top: 3mm; }
      .certificate-of-honour-print .signature-row { gap: 12mm; margin-top: 8mm; }
      .certificate-of-honour-print .signature { min-height: 22mm; }
      .certificate-of-honour-print .signature img { max-height: 14mm; }
      .certificate-of-honour-print .signature em { color: #555; font-size: 8pt; }
      .certificate-of-honour-print .approval-note { margin-top: 4mm; padding: 3mm; font-size: 8.5pt; }
      footer { display: flex; justify-content: space-between; margin-top: 16mm; border-top: 1px solid #aaa; padding-top: 3mm; color: #555; font-size: 7pt; letter-spacing: .06em; }
      @media print { .print-page { break-inside: avoid; page-break-inside: avoid; } }
      @media screen { body { background: #e8edf2; padding: 12px; } .print-page { width: 210mm; min-height: 297mm; margin: 0 auto 14px; padding: 15mm 16mm 22mm; background: white; box-shadow: 0 3px 18px #0002; } }
    </style></head><body>${pageMarkup}
    <script>window.addEventListener('load', function(){ Promise.all(Array.from(document.images).map(function(i){ return i.decode ? i.decode().catch(function(){}) : Promise.resolve(); })).then(function(){ setTimeout(function(){ window.print(); }, 250); }); });</script>
    </body></html>`)
  printWindow.document.close()
  return true
}
