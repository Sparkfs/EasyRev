// Lecture du texte d'un fichier, directement dans le navigateur :
// le fichier lui-même n'est envoyé nulle part, seul son texte est enregistré.

export const ACCEPTED_FILES = '.pdf,.docx,.txt,.md'

/**
 * Taille maximale d'un document analysé (environ 160 pages de cours). Même limite que dans l'Edge Function.
 * Le modèle accepterait bien plus ; c'est surtout la qualité (et le quota gratuit) qui baisse au-delà.
 */
export const MAX_CHARACTERS = 400_000
export const APPROX_MAX_PAGES = 160

/** En dessous, il n'y a pas assez de matière pour l'IA (souvent un PDF scanné, donc une image). */
export const MIN_CHARACTERS = 200

/** Pages à lire dans un PDF (numérotées à partir de 1, bornes incluses). */
export interface PageRange {
  from: number
  to: number
}

export function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf')
}

export async function extractText(file: File, pages?: PageRange): Promise<string> {
  const name = file.name.toLowerCase()
  if (isPdf(file)) return cleanText(await extractPdf(file, pages))
  if (name.endsWith('.docx')) return cleanText(await extractDocx(file))
  if (name.endsWith('.txt') || name.endsWith('.md')) return cleanText(await file.text())
  throw new Error('Format non pris en charge : utilise un PDF, un fichier Word (.docx) ou un texte (.txt).')
}

/** Nombre de pages d'un PDF, pour proposer de n'en analyser qu'une partie. */
export async function countPdfPages(file: File): Promise<number> {
  return (await openPdf(file)).numPages
}

async function openPdf(file: File) {
  // Bibliothèques chargées seulement quand on en a besoin, pour ne pas alourdir le reste du site.
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
}

async function extractPdf(file: File, range?: PageRange): Promise<string> {
  const pdf = await openPdf(file)
  const first = Math.max(1, range?.from ?? 1)
  const last = Math.min(pdf.numPages, range?.to ?? pdf.numPages)
  const pages: string[] = []
  for (let i = first; i <= last; i++) {
    const content = await (await pdf.getPage(i)).getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join(''))
  }
  return pages.join('\n\n')
}

async function extractDocx(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value
}

/** Nettoie le texte extrait : espaces en trop, lignes vides multiples. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
