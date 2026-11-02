// « Pont » avec un abonnement Claude (claude.ai) : le site fournit une consigne à copier dans Claude
// avec le document, puis lit la réponse (un objet JSON) que l'utilisateur recolle dans le site.
// Aucun appel automatique : l'abonnement Claude ne fournit pas de clé pour une application.

import type { Question, QuestionKind } from './types'

export const CLAUDE_URL = 'https://claude.ai/new'

const KINDS: QuestionKind[] = ['qcm', 'vrai_faux', 'courte', 'trous', 'ouverte']
const DIFFICULTIES: Question['difficulty'][] = ['facile', 'moyen', 'difficile']

/** La consigne à coller dans Claude, avec le document joint. */
export function buildClaudePrompt(questionCount: number): string {
  return `Tu es un professeur bienveillant et très pédagogue. Le document joint est un cours que je dois réviser.

1. Explique-le-moi pour que je le comprenne vraiment.
2. Prépare exactement ${questionCount} questions d'entraînement corrigées qui couvrent tout le document, de la plus facile à la plus difficile.

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte avant ou après), au format suivant :

{
  "summary": "4 à 6 phrases : de quoi parle le document et ce qu'il faut absolument retenir",
  "key_points": ["4 à 10 notions essentielles, une phrase chacune"],
  "sections": [{ "title": "Titre de la partie", "content": "Explication avec exemples concrets ; paragraphes séparés par une ligne vide (\\n\\n)" }],
  "glossary": [{ "term": "Terme technique", "definition": "Définition courte" }],
  "questions": [{
    "kind": "qcm | vrai_faux | courte | trous | ouverte",
    "difficulty": "facile | moyen | difficile",
    "prompt": "L'énoncé",
    "choices": ["4 propositions pour un qcm, sinon liste vide"],
    "correct_choice": 0,
    "answer": "La réponse attendue",
    "explanation": "Pourquoi c'est la bonne réponse"
  }]
}

Règles :
- sections : une partie par chapitre ou grande notion du document, dans son ordre (3 à 12 parties selon sa longueur).
- Si le document est long, répartis les questions entre tous ses chapitres.
- Utilise les cinq types de questions, au moins une fois chacun :
  - "qcm" : 4 propositions plausibles, une seule correcte ; "correct_choice" = indice (0 à 3) de la bonne ; "answer" recopie la bonne proposition.
  - "vrai_faux" : une affirmation ; "answer" vaut exactement "Vrai" ou "Faux".
  - "courte" : réponse de quelques mots ou d'une phrase.
  - "trous" : une phrase clé du cours où les mots importants sont remplacés par "____" ; "answer" = les mots manquants dans l'ordre, séparés par " ; ".
  - "ouverte" : question de réflexion ou exercice d'application (calcul, dimensionnement, analyse) ; "answer" = corrigé complet, étape par étape.
- Pour tous les types sauf "qcm" : "choices" = [] et "correct_choice" = -1.
- Pour un QCM, "explanation" dit aussi pourquoi les autres propositions sont fausses.
- Écris les formules en texte lisible (ex. : σ = F / S, x², √2, ∫ f(x) dx), sans LaTeX ni Markdown.
- Rédige en français. Appuie-toi sur le document ; si tu ajoutes une précision qui n'y figure pas, commence-la par « En complément : ».`
}

export interface ImportedQuestion {
  kind: QuestionKind
  difficulty: Question['difficulty']
  prompt: string
  choices: string[] | null
  correct_choice: number | null
  answer: string
  explanation: string
}

export interface ImportedAnalysis {
  summary: string
  key_points: string[]
  sections: { title: string; content: string }[]
  glossary: { term: string; definition: string }[]
  questions: ImportedQuestion[]
}

/** Lit la réponse collée depuis Claude. Lève une erreur (en français) si elle est inutilisable. */
export function parseClaudeAnswer(text: string): ImportedAnalysis {
  // Claude entoure parfois le JSON de ```json … ``` ou d'une phrase : on garde du premier « { » au dernier « } ».
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('Je ne trouve pas de JSON dans ce texte. Copie bien toute la réponse de Claude.')
  }
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error(
      'La réponse de Claude est incomplète ou mal formée. Vérifie que tu as tout copié ; sinon, demande à Claude : ' +
        '« Redonne uniquement le JSON complet et valide ».',
    )
  }

  const questions = asArray(data.questions)
    .map(normalizeQuestion)
    .filter((q) => q !== null)
  if (questions.length === 0) throw new Error('La réponse ne contient aucune question exploitable.')

  return {
    summary: asString(data.summary),
    key_points: asArray(data.key_points).map(asString).filter(Boolean),
    sections: asArray(data.sections)
      .map((s) => ({ title: asString(field(s, 'title')), content: asString(field(s, 'content')) }))
      .filter((s) => s.title || s.content),
    glossary: asArray(data.glossary)
      .map((g) => ({ term: asString(field(g, 'term')), definition: asString(field(g, 'definition')) }))
      .filter((g) => g.term),
    questions,
  }
}

/** Vérifie une question ; renvoie `null` si elle est inutilisable (même règles que l'Edge Function). */
function normalizeQuestion(raw: unknown): ImportedQuestion | null {
  const kind = asString(field(raw, 'kind')) as QuestionKind
  const prompt = asString(field(raw, 'prompt'))
  const answer = asString(field(raw, 'answer'))
  if (!KINDS.includes(kind) || !prompt || !answer) return null

  const difficulty = asString(field(raw, 'difficulty')) as Question['difficulty']
  const isQcm = kind === 'qcm'
  const choices = isQcm ? asArray(field(raw, 'choices')).map(asString).filter(Boolean) : null
  const correct = Number(field(raw, 'correct_choice'))
  if (isQcm && (choices!.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= choices!.length)) {
    return null
  }
  return {
    kind,
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'moyen',
    prompt,
    choices,
    correct_choice: isQcm ? correct : null,
    answer,
    explanation: asString(field(raw, 'explanation')),
  }
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}
