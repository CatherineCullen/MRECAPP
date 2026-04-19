import 'server-only'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// Server-side PDF renderer for a signed waiver. We keep it intentionally
// simple — no markdown parser. Admin writes waiver text as plain paragraphs
// (markdown bold renders as-is). A future v2 can bring proper markdown
// rendering if the aesthetics matter, but for a legal document that archives
// exactly what the signer saw, plaintext is fine and far more predictable.
//
// Strategy: strip markdown emphasis to plain text, word-wrap by line width,
// paginate on overflow, then append a signature section with:
//   * printed name
//   * signature PNG
//   * date
//   * (for minors) "signed on behalf of child: <name>"

type RenderArgs = {
  bodyMarkdown:       string
  templateVersion:    number
  riderName:          string
  riderDob:           string | null
  address:            string | null
  phone:              string | null
  email:              string | null
  emergencyName:      string | null
  emergencyPhone:     string | null
  signerPrintedName:  string       // parent if minor, else rider
  isMinor:            boolean
  signedAtIso:        string       // ISO timestamp
  signaturePngBytes:  Uint8Array   // raw PNG bytes from canvas
}

const PAGE_W = 612     // letter
const PAGE_H = 792
const MARGIN = 54
const BODY_FONT_SIZE = 10
const LINE_GAP = 3

function stripMd(s: string): string {
  // Drop **bold** markers; keep their content. Keep everything else as-is.
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\r\n/g, '\n')
}

function wrapLine(line: string, font: any, size: number, maxW: number): string[] {
  if (!line.trim()) return ['']
  const words = line.split(' ')
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(trial, size) <= maxW) {
      cur = trial
    } else {
      if (cur) out.push(cur)
      cur = w
    }
  }
  if (cur) out.push(cur)
  return out
}

export async function renderSignedWaiverPdf(args: RenderArgs): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  const contentW = PAGE_W - 2 * MARGIN
  const lineH = BODY_FONT_SIZE + LINE_GAP

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN

  function ensureSpace(h: number) {
    if (y - h < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
  }

  // Header
  page.drawText('Marlboro Ridge Equestrian Center', { x: MARGIN, y, size: 12, font: fontBold })
  y -= 18
  page.drawText(`Waiver template v${args.templateVersion}`, { x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) })
  y -= 18

  // Body
  const paragraphs = stripMd(args.bodyMarkdown).split('\n')
  for (const raw of paragraphs) {
    const lines = wrapLine(raw, font, BODY_FONT_SIZE, contentW)
    for (const line of lines) {
      ensureSpace(lineH)
      page.drawText(line, { x: MARGIN, y, size: BODY_FONT_SIZE, font })
      y -= lineH
    }
    y -= 4 // paragraph break
  }

  // Signer / rider info block
  ensureSpace(180)
  y -= 10
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5, color: rgb(0.5, 0.5, 0.5),
  })
  y -= 14

  const lines: Array<[string, string]> = [
    ['Rider:',             args.riderName],
    ['Rider DOB:',         args.riderDob ?? '—'],
    ['Address:',           args.address ?? '—'],
    ['Phone:',             args.phone ?? '—'],
    ['Email:',             args.email ?? '—'],
    ['Emergency contact:', args.emergencyName ? `${args.emergencyName}${args.emergencyPhone ? ` — ${args.emergencyPhone}` : ''}` : '—'],
  ]
  if (args.isMinor) lines.push(['Signed by guardian:', args.signerPrintedName])

  for (const [label, val] of lines) {
    ensureSpace(lineH)
    page.drawText(label, { x: MARGIN, y, size: BODY_FONT_SIZE, font: fontBold })
    page.drawText(val, { x: MARGIN + 120, y, size: BODY_FONT_SIZE, font })
    y -= lineH + 1
  }

  // Signature
  ensureSpace(120)
  y -= 8
  page.drawText('Signature:', { x: MARGIN, y, size: BODY_FONT_SIZE, font: fontBold })
  y -= 10

  try {
    const img = await doc.embedPng(args.signaturePngBytes)
    const scale = Math.min(260 / img.width, 80 / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    ensureSpace(h + 4)
    page.drawImage(img, { x: MARGIN, y: y - h, width: w, height: h })
    y -= h + 4
  } catch {
    // If the PNG is unreadable, fall back to a typed marker so the record
    // still generates rather than losing the whole submission.
    page.drawText('[signature image could not be embedded]', {
      x: MARGIN, y, size: BODY_FONT_SIZE, font, color: rgb(0.7, 0, 0),
    })
    y -= lineH
  }

  const signedAtReadable = new Date(args.signedAtIso).toLocaleString('en-US', {
    dateStyle: 'long', timeStyle: 'short',
  })
  ensureSpace(lineH * 2)
  page.drawText(`Printed name: ${args.signerPrintedName}`, { x: MARGIN, y, size: BODY_FONT_SIZE, font })
  y -= lineH
  page.drawText(`Signed: ${signedAtReadable}`, { x: MARGIN, y, size: BODY_FONT_SIZE, font })

  return await doc.save()
}
