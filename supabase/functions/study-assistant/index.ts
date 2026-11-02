// Edge Function Supabase « study-assistant » : l'assistant IA de « Mes révisions ».
//
// Reçoit { document_id } depuis le site, lit ce document avec les droits de l'utilisateur connecté,
// demande à l'IA (Google Gemini ou Azure OpenAI) une explication et des questions, puis enregistre
// le résultat dans les tables `documents` et `questions` (voir supabase/documents.sql).
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   AI_PROVIDER              « gemini » ou « azure » (facultatif : déduit des secrets présents)
//   AI_REASONING_EFFORT      facultatif : low, medium ou high (temps de réflexion du modèle)
// Pour Gemini :
//   GEMINI_API_KEY           la clé créée sur Google AI Studio
//   GEMINI_MODEL             facultatif, par défaut gemini-3.8-flash
// Pour Azure OpenAI :
//   AZURE_OPENAI_ENDPOINT    ex. https://mon-ressource.openai.azure.com
//   AZURE_OPENAI_API_KEY     la clé de la ressource Azure (KEY 1)
//   AZURE_OPENAI_DEPLOYMENT  le nom du déploiement du modèle, ex. gpt-6-1-terra

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Au-delà, le texte est coupé (environ 25 pages de cours). */
const MAX_CHARACTERS = 60_000

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

/** Fournisseur choisi : AI_PROVIDER s'il est défini, sinon Gemini dès qu'une clé Gemini existe. */
function provider(): 'gemini' | 'azure' {
  const chosen = Deno.env.get('AI_PROVIDER')?.trim().toLowerCase()
  if (chosen === 'gemini' || chosen === 'azure') return chosen
  return Deno.env.get('GEMINI_API_KEY') ? 'gemini' : 'azure'
}

const REQUIRED_SECRETS = {
  gemini: ['GEMINI_API_KEY'],
  azure: ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)

  const missing = REQUIRED_SECRETS[provider()].filter((name) => !Deno.env.get(name))
  if (missing.length > 0) {
    return json({ error: `Secrets manquants dans Supabase (Edge Functions → Secrets) : ${missing.join(', ')}.` }, 500)
  }

  // Client Supabase « au nom de l'utilisateur » : les règles RLS s'appliquent comme sur le site.
  const authorization = req.headers.get('Authorization') ?? ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? '',
    { global: { headers: { Authorization: authorization } } },
  )
  const { data: userData } = await supabase.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
  if (!userData.user) return json({ error: 'Connexion requise.' }, 401)

  let documentId: unknown
  try {
    documentId = (await req.json()).document_id
  } catch {
    // corps absent ou invalide : traité juste en dessous
  }
  if (typeof documentId !== 'string') return json({ error: 'document_id manquant.' }, 400)

  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, title, content, question_count, subjects(name)')
    .eq('id', documentId)
    .single()
  if (error || !doc) return json({ error: 'Document introuvable.' }, 404)

  await supabase
    .from('documents')
    .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
    .eq('id', doc.id)

  // L'analyse peut prendre une minute : on répond tout de suite et on continue en arrière-plan.
  // La page du document suit l'avancement grâce à la colonne `status`.
  EdgeRuntime.waitUntil(analyse(supabase, doc as DocumentRow))
  return json({ ok: true }, 202)
})

interface DocumentRow {
  id: string
  title: string
  content: string
  question_count: number
  subjects: { name: string } | null
}

async function analyse(supabase: SupabaseClient, doc: DocumentRow) {
  try {
    const context = [
      `Matière : ${doc.subjects?.name ?? 'non précisée'}`,
      `Titre : ${doc.title}`,
      '',
      '--- DÉBUT DU DOCUMENT ---',
      doc.content.slice(0, MAX_CHARACTERS),
      '--- FIN DU DOCUMENT ---',
    ].join('\n')

    // Deux demandes en parallèle : c'est deux fois plus rapide qu'une seule grosse demande.
    const [explanation, quiz] = await Promise.all([
      askModel(EXPLANATION_INSTRUCTIONS, context, 'explication', EXPLANATION_SCHEMA) as Promise<Explanation>,
      askModel(questionsInstructions(doc.question_count), context, 'questions', QUESTIONS_SCHEMA) as Promise<{
        questions: GeneratedQuestion[]
      }>,
    ])

    const questions = quiz.questions.map(normalizeQuestion).filter((q) => q !== null)
    if (questions.length === 0) throw new Error("L'IA n'a produit aucune question exploitable. Réessaie.")

    await check(supabase.from('questions').delete().eq('document_id', doc.id))
    await check(
      supabase.from('questions').insert(questions.map((q, position) => ({ ...q, document_id: doc.id, position }))),
    )
    await check(
      supabase
        .from('documents')
        .update({
          status: 'ready',
          error: null,
          summary: explanation.summary,
          key_points: explanation.key_points,
          sections: explanation.sections,
          glossary: explanation.glossary,
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id),
    )
  } catch (e) {
    console.error(e)
    const message = e instanceof Error ? e.message : String(e)
    await supabase
      .from('documents')
      .update({ status: 'error', error: message.slice(0, 600), updated_at: new Date().toISOString() })
      .eq('id', doc.id)
  }
}

// ---------- Appel à l'IA ----------
// Gemini et Azure OpenAI acceptent tous deux le format « chat completions » d'OpenAI :
// seuls l'adresse et la clé changent.

async function askModel(instructions: string, content: string, name: string, schema: object): Promise<unknown> {
  const reasoningEffort = Deno.env.get('AI_REASONING_EFFORT')
  const body = {
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content },
    ],
    // « Structured outputs » : le modèle doit répondre exactement au format JSON décrit par `schema`.
    response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    // Facultatif, pour les modèles qui « réfléchissent » : low, medium, high…
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  }
  const response = provider() === 'gemini' ? await callGemini(body) : await callAzure(body)
  const data = await response.json()
  const choice = data.choices?.[0]
  if (choice?.message?.refusal) throw new Error(`L'IA a refusé de répondre : ${choice.message.refusal}`)
  if (choice?.finish_reason === 'length') {
    throw new Error("La réponse de l'IA a été coupée (trop longue). Essaie avec moins de questions.")
  }
  if (choice?.finish_reason === 'content_filter') {
    throw new Error("Le filtre de contenu du fournisseur d'IA a bloqué la réponse.")
  }
  if (typeof choice?.message?.content !== 'string') throw new Error("Réponse de l'IA vide ou inattendue.")
  return JSON.parse(choice.message.content)
}

async function callGemini(body: object): Promise<Response> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('GEMINI_API_KEY')}` },
    body: JSON.stringify({ model: Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL, ...body }),
  })
  if (!response.ok) {
    throw new Error(`Gemini a répondu ${response.status} : ${(await response.text()).slice(0, 400)}`)
  }
  return response
}

async function callAzure(body: object): Promise<Response> {
  const endpoint = new URL(Deno.env.get('AZURE_OPENAI_ENDPOINT')!).origin
  const deployment = Deno.env.get('AZURE_OPENAI_DEPLOYMENT')!
  const headers = { 'Content-Type': 'application/json', 'api-key': Deno.env.get('AZURE_OPENAI_API_KEY')! }

  // Adresse récente (API « v1 ») ; si la ressource ne la connaît pas, on essaie l'adresse classique.
  let response = await fetch(`${endpoint}/openai/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: deployment, ...body }),
  })
  if (response.status === 404) {
    response = await fetch(
      `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-10-21`,
      { method: 'POST', headers, body: JSON.stringify(body) },
    )
  }
  if (!response.ok) {
    throw new Error(`Azure OpenAI a répondu ${response.status} : ${(await response.text()).slice(0, 400)}`)
  }
  return response
}

// ---------- Ce qu'on demande à l'IA ----------

interface Explanation {
  summary: string
  key_points: string[]
  sections: { title: string; content: string }[]
  glossary: { term: string; definition: string }[]
}

const EXPLANATION_INSTRUCTIONS = `Tu es un professeur bienveillant et très pédagogue. On te donne un document de cours.
Explique-le à un élève qui le découvre, pour qu'il le comprenne vraiment.

- Rédige en français, avec des phrases simples, précises et sans jargon inutile.
- Appuie-toi sur le contenu du document. Si tu ajoutes une précision utile qui n'y figure pas, signale-le par « En complément : ».
- summary : 4 à 6 phrases qui disent de quoi parle le document et ce qu'il faut absolument en retenir.
- key_points : 4 à 8 notions essentielles, une phrase chacune.
- sections : 3 à 7 parties qui suivent la logique du document. Pour chacune, explique les idées avec des exemples concrets
  ou des analogies. Tu peux écrire plusieurs paragraphes séparés par une ligne vide. Pas de Markdown (ni #, ni **).
- glossary : les termes techniques importants avec une définition courte (liste vide s'il n'y en a pas).

Le texte peut contenir des défauts dus à l'extraction (mots coupés, numéros ou en-têtes de page) : ignore-les.`

const EXPLANATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'key_points', 'sections', 'glossary'],
  properties: {
    summary: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'content'],
        properties: { title: { type: 'string' }, content: { type: 'string' } },
      },
    },
    glossary: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'definition'],
        properties: { term: { type: 'string' }, definition: { type: 'string' } },
      },
    },
  },
}

const KINDS = ['qcm', 'vrai_faux', 'courte', 'trous', 'ouverte'] as const
const DIFFICULTIES = ['facile', 'moyen', 'difficile'] as const

interface GeneratedQuestion {
  kind: string
  difficulty: string
  prompt: string
  choices: string[]
  correct_choice: number
  answer: string
  explanation: string
}

function questionsInstructions(count: number): string {
  return `Tu es un professeur qui prépare un entraînement pour un élève à partir d'un document de cours.
Crée exactement ${count} questions variées qui couvrent l'ensemble du document, classées de la plus facile à la plus difficile.

Utilise ces cinq types (au moins une question de chaque type) :
- "qcm" : 4 propositions plausibles dans "choices", une seule correcte. "correct_choice" est l'indice (0 à 3) de la bonne
  proposition et "answer" recopie la bonne proposition.
- "vrai_faux" : une affirmation dans "prompt" ; "answer" vaut exactement "Vrai" ou "Faux".
- "courte" : une question qui appelle une réponse de quelques mots ou d'une phrase.
- "trous" : une phrase importante du cours où les mots clés sont remplacés par "____" ; "answer" donne les mots manquants
  dans l'ordre, séparés par " ; ".
- "ouverte" : une question de réflexion ou un exercice d'application (calcul, analyse, cas concret) ; "answer" est un
  corrigé complet et rédigé, étape par étape.

Pour tous les types sauf "qcm" : "choices" est une liste vide et "correct_choice" vaut -1.
"explanation" explique pourquoi la réponse est juste en s'appuyant sur le document ; pour un QCM, explique aussi
pourquoi les autres propositions sont fausses.
"difficulty" vaut "facile", "moyen" ou "difficile".

Rédige en français (si le document sert à apprendre une langue étrangère, les questions peuvent utiliser cette langue).
Ne pose que des questions dont la réponse se trouve dans le document ou s'en déduit. Pas de Markdown.`
}

const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'difficulty', 'prompt', 'choices', 'correct_choice', 'answer', 'explanation'],
        properties: {
          kind: { type: 'string', enum: KINDS },
          difficulty: { type: 'string', enum: DIFFICULTIES },
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          correct_choice: { type: 'integer' },
          answer: { type: 'string' },
          explanation: { type: 'string' },
        },
      },
    },
  },
}

/** Vérifie une question produite par l'IA ; renvoie `null` si elle est inutilisable. */
function normalizeQuestion(q: GeneratedQuestion) {
  if (!(KINDS as readonly string[]).includes(q.kind) || !q.prompt?.trim() || !q.answer?.trim()) return null
  const isQcm = q.kind === 'qcm'
  const choices = isQcm ? q.choices.map((c) => c.trim()).filter(Boolean) : null
  if (isQcm && (choices!.length < 2 || q.correct_choice < 0 || q.correct_choice >= choices!.length)) return null
  return {
    kind: q.kind,
    difficulty: (DIFFICULTIES as readonly string[]).includes(q.difficulty) ? q.difficulty : 'moyen',
    prompt: q.prompt.trim(),
    choices,
    correct_choice: isQcm ? q.correct_choice : null,
    answer: q.answer.trim(),
    explanation: q.explanation?.trim() ?? '',
  }
}

// ---------- Petits utilitaires ----------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function check(query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query
  if (error) throw new Error(`Erreur base de données : ${error.message}`)
}
