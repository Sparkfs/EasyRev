// Lecture du texte d'un fichier, directement dans le navigateur :
// le fichier lui-même n'est envoyé nulle part, seul son texte est enregistré.

export const ACCEPTED_FILES = '.pdf,.docx,.txt,.md'

/** Au-delà, le texte est coupé (environ 25 pages de cours). Même limite que dans l'Edge Function. */
export const MAX_CHARACTERS = 60_000

/** En dessous, il n'y a pas assez de matière pour l'IA (souvent un PDF scanné, donc une image). */
export const MIN_CHARACTERS = 200

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return cleanText(await extractPdf(file))
  if (name.endsWith('.docx')) return cleanText(await extractDocx(file))
  if (name.endsWith('.txt') || name.endsWith('.md')) return cleanText(await file.text())
  throw new Error('Format non pris en charge : utilise un PDF, un fichier Word (.docx) ou un texte (.txt).')
}

async function extractPdf(file: File): Promise<string> {
  // Bibliothèques chargées seulement quand on en a besoin, pour ne pas alourdir le reste du site.
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
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
