// Edge Function Supabase « study-assistant » : l'assistant IA de « Mes révisions ».
//
// Reçoit { document_id } depuis le site, lit ce document avec les droits de l'utilisateur connecté,
// demande à l'IA (Google Gemini ou Azure OpenAI) une explication et des questions, puis enregistre
// le résultat dans les tables `documents` et `questions` (voir supabase/documents.sql).
//
// Une exécution de la fonction est limitée à 150 secondes. En réflexion approfondie, les questions sont donc
// préparées par séries : chaque étape enregistre sa série, puis la fonction se rappelle elle-même pour la suivante,
// avec { document_id, step, run } et de nouveau 150 secondes.
//
// Secrets à définir dans Supabase (Edge Functions → Secrets) :
//   AI_PROVIDER              « gemini » ou « azure » (facultatif : déduit des secrets présents)
//   AI_REASONING_EFFORT      facultatif : low, medium ou high (temps de réflexion du modèle), utilisé quand le
//                            document n'a pas de réflexion choisie (colonne documents.reasoning_effort)
// Pour Gemini :
//   GEMINI_API_KEY           la clé créée sur Google AI Studio
//   GEMINI_MODEL             facultatif, par défaut gemini-3.8-flash
//   GEMINI_FALLBACK_MODEL    facultatif, modèle de secours si le premier est saturé, par défaut gemini-3.6-flash
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

/** Au-delà, le texte est coupé (environ 160 pages de cours). Même limite que dans le site (extractText.ts). */
const MAX_CHARACTERS = 400_000

/** Réflexion approfondie : nombre maximal de questions par étape, pour rester dans les 150 secondes. */
const MAX_QUESTIONS_PER_STEP_HIGH_EFFORT = 8

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
/** Utilisé si le modèle principal est saturé ou a atteint son quota (génération précédente, souvent moins demandée). */
const DEFAULT_GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash'

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
  let step: unknown = 0
  let run: unknown
  try {
    const body = await req.json()
    documentId = body.document_id
    step = body.step ?? 0
    run = body.run
  } catch {
    // corps absent ou invalide : traité juste en dessous
  }
  if (typeof documentId !== 'string') return json({ error: 'document_id manquant.' }, 400)
  if (!Number.isInteger(step) || (step as number) < 0) return json({ error: 'Étape invalide.' }, 400)
  if ((step as number) > 0 && typeof run !== 'string') return json({ error: 'Analyse non précisée.' }, 400)

  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, title, content, question_count, reasoning_effort, subjects(name)')
    .eq('id', documentId)
    .single()
  if (error?.message.includes('reasoning_effort')) {
    return json({ error: 'La base n’est pas à jour : exécute supabase/mise-a-jour-1-reflexion.sql dans Supabase.' }, 500)
  }
  if (error || !doc) return json({ error: 'Document introuvable.' }, 404)

  let stamp: string | null
  if (step === 0) {
    // Nouvelle analyse : elle remplace les anciennes questions. Son horodatage arrête aussi une analyse encore en cours.
    stamp = new Date().toISOString()
    await supabase
      .from('documents')
      .update({ status: 'pending', error: null, updated_at: stamp })
      .eq('id', doc.id)
    await supabase.from('questions').delete().eq('document_id', doc.id)
  } else {
    stamp = await claimRun(supabase, doc.id, run as string)
    if (!stamp) return json({ ok: true, ignored: true }) // une analyse plus récente a pris le relais
  }

  const next: NextStepRequest = {
    authorization,
    apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? '',
  }

  // L'analyse peut prendre une minute : on répond tout de suite et on continue en arrière-plan.
  // La page du document suit l'avancement grâce à la colonne `status`.
  EdgeRuntime.waitUntil(analyse(supabase, doc as DocumentRow, step as number, stamp, next))
  return json({ ok: true }, 202)
})

interface DocumentRow {
  id: string
  title: string
  content: string
  question_count: number
  reasoning_effort: string | null
  subjects: { name: string } | null
}

const EFFORTS = ['low', 'medium', 'high']

interface NextStepRequest {
  authorization: string
  apikey: string
}

/** Répartit les questions en séries les plus égales possibles (ex. : 30 par 8 → 8, 8, 7, 7). */
function questionBatches(total: number, maxPerBatch: number): number[] {
  const count = Math.ceil(total / maxPerBatch)
  return Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0))
}

/**
 * Renouvelle l'horodatage de l'analyse, seulement si `run` est toujours le sien.
 * Renvoie le nouvel horodatage, ou `null` si une analyse plus récente a pris le relais.
 * Le renouveler à chaque étape indique aussi à la page que l'analyse progresse.
 */
async function claimRun(supabase: SupabaseClient, documentId: string, run: string): Promise<string | null> {
  const stamp = new Date().toISOString()
  const { data, error } = await supabase
    .from('documents')
    .update({ updated_at: stamp })
    .eq('id', documentId)
    .eq('status', 'pending')
    .eq('updated_at', run)
    .select('id')
  if (error) throw new Error(`Erreur base de données : ${error.message}`)
  return data && data.length > 0 ? stamp : null
}

async function analyse(
  supabase: SupabaseClient,
  doc: DocumentRow,
  step: number,
  startStamp: string,
  next: NextStepRequest,
) {
  let stamp = startStamp
  try {
    // Réflexion choisie pour ce document, sinon le réglage par défaut (secret AI_REASONING_EFFORT).
    const effort = EFFORTS.includes(doc.reasoning_effort ?? '')
      ? doc.reasoning_effort!
      : Deno.env.get('AI_REASONING_EFFORT') || undefined

    const batches = questionBatches(
      doc.question_count,
      effort === 'high' ? MAX_QUESTIONS_PER_STEP_HIGH_EFFORT : doc.question_count,
    )
    if (step >= batches.length) throw new Error('Étape d’analyse inconnue. Relance l’analyse.')

    const context = [
      `Matière : ${doc.subjects?.name ?? 'non précisée'}`,
      `Titre : ${doc.title}`,
      '',
      '--- DÉBUT DU DOCUMENT ---',
      doc.content.slice(0, MAX_CHARACTERS),
      '--- FIN DU DOCUMENT ---',
    ].join('\n')

    // Pour ne pas reposer les mêmes questions d'une série à l'autre.
    let alreadyAsked: string[] = []
    if (step > 0) {
      const { data, error } = await supabase
        .from('questions')
        .select('prompt')
        .eq('document_id', doc.id)
        .order('position')
      if (error) throw new Error(`Erreur base de données : ${error.message}`)
      alreadyAsked = data.map((q) => q.prompt)
    }

    const askQuestions = askModel(
      questionsInstructions(batches[step], step, batches.length, alreadyAsked),
      context,
      'questions',
      QUESTIONS_SCHEMA,
      effort,
    ) as Promise<{ questions: GeneratedQuestion[] }>
    // Première étape : l'explication en parallèle, c'est deux fois plus rapide qu'une seule grosse demande.
    const [explanation, quiz] = await Promise.all([
      step === 0
        ? (askModel(EXPLANATION_INSTRUCTIONS, context, 'explication', EXPLANATION_SCHEMA, effort) as Promise<Explanation>)
        : null,
      askQuestions,
    ])

    const questions = quiz.questions
      .slice(0, batches[step])
      .map(normalizeQuestion)
      .filter((q) => q !== null)
    if (questions.length === 0) throw new Error("L'IA n'a produit aucune question exploitable. Réessaie.")

    // Relancée entre-temps ? Cette analyse s'arrête sans rien écrire.
    const claimed = await claimRun(supabase, doc.id, stamp)
    if (!claimed) return
    stamp = claimed

    const firstPosition = batches.slice(0, step).reduce((sum, size) => sum + size, 0)
    await check(
      supabase
        .from('questions')
        .insert(questions.map((q, i) => ({ ...q, document_id: doc.id, position: firstPosition + i }))),
    )

    const isLastStep = step === batches.length - 1
    await check(
      supabase
        .from('documents')
        .update({
          status: isLastStep ? 'ready' : 'pending',
          error: null,
          updated_at: stamp,
          ...(explanation
            ? {
                summary: explanation.summary,
                key_points: explanation.key_points,
                sections: explanation.sections,
                glossary: explanation.glossary,
              }
            : {}),
        })
        .eq('id', doc.id),
    )

    if (!isLastStep) {
      const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/study-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: next.authorization, apikey: next.apikey },
        body: JSON.stringify({ document_id: doc.id, step: step + 1, run: stamp }),
      })
      if (!response.ok) {
        throw new Error(`Impossible de lancer la suite de l’analyse (erreur ${response.status}). Relance l’analyse.`)
      }
    }
  } catch (e) {
    console.error(e)
    const message = e instanceof Error ? e.message : String(e)
    await supabase
      .from('documents')
      .update({ status: 'error', error: message.slice(0, 600), updated_at: new Date().toISOString() })
      .eq('id', doc.id)
      .eq('updated_at', stamp)
  }
}

// ---------- Appel à l'IA ----------
// Gemini et Azure OpenAI acceptent tous deux le format « chat completions » d'OpenAI :
// seuls l'adresse et la clé changent.

async function askModel(
  instructions: string,
  content: string,
  name: string,
  schema: object,
  reasoningEffort: string | undefined,
): Promise<unknown> {
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

/**
 * Appelle Gemini en résistant aux surcharges passagères de Google :
 * - serveurs saturés (500, 503) : nouvel essai après 2 puis 5 secondes ;
 * - toujours saturés, ou quota du modèle atteint (429) : on passe au modèle de secours.
 * Les autres erreurs (clé invalide, modèle inconnu…) sont signalées tout de suite.
 */
async function callGemini(body: object): Promise<Response> {
  const models = [
    ...new Set([
      Deno.env.get('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL,
      Deno.env.get('GEMINI_FALLBACK_MODEL') || DEFAULT_GEMINI_FALLBACK_MODEL,
    ]),
  ]
  let lastStatus = 0
  let lastDetail = ''

  for (const model of models) {
    for (const delay of [0, 2000, 5000]) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('GEMINI_API_KEY')}` },
        body: JSON.stringify({ model, ...body }),
      })
      if (response.ok) return response

      lastStatus = response.status
      lastDetail = (await response.text()).slice(0, 300)
      console.warn(`Gemini (${model}) a répondu ${lastStatus}`)
      if (lastStatus === 429) break // quota de ce modèle : réessayer tout de suite ne sert à rien
      if (lastStatus !== 500 && lastStatus !== 503) {
        throw new Error(`Gemini a répondu ${lastStatus} : ${lastDetail}`)
      }
    }
  }

  if (lastStatus === 429) {
    throw new Error(
      'Limite de l’offre gratuite de Gemini atteinte (trop de demandes en peu de temps, ou quota du jour épuisé). ' +
        'Relance dans une minute ; si ça persiste, réessaie demain ou analyse moins de pages.',
    )
  }
  throw new Error(
    'Les serveurs de Gemini sont saturés en ce moment : le problème vient de Google, pas de toi. ' +
      `Relance l’analyse dans quelques minutes. (Détail : erreur ${lastStatus})`,
  )
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
- key_points : 4 à 10 notions essentielles, une phrase chacune.
- sections : une partie par chapitre ou grande notion du document, dans son ordre (de 3 parties pour un document
  court à 12 au maximum pour un long polycopié). Pour chacune, explique les idées avec des exemples concrets ou des
  analogies ; plus le document est long, plus chaque partie reste synthétique. Tu peux écrire plusieurs paragraphes
  séparés par une ligne vide. Pas de Markdown (ni #, ni **).
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

/** Consigne propre à une série, quand les questions sont préparées en plusieurs fois. */
function batchInstructions(batch: number, batchCount: number, alreadyAsked: string[]): string {
  if (batchCount === 1) return ''
  const asked = alreadyAsked.length > 0
    ? `\nQuestions déjà posées, à ne pas répéter ni reformuler :\n${alreadyAsked.map((q) => `- ${q}`).join('\n')}\n`
    : ''
  return `
L'entraînement est préparé en ${batchCount} séries et tu rédiges la série ${batch + 1}. Découpe mentalement le document
en ${batchCount} parties égales et concentre-toi sur la partie ${batch + 1}. Le niveau monte d'une série à l'autre :
adapte la difficulté à cette position dans l'entraînement.
${asked}`
}

function questionsInstructions(count: number, batch = 0, batchCount = 1, alreadyAsked: string[] = []): string {
  return `Tu es un professeur qui prépare un entraînement pour un élève à partir d'un document de cours.
Crée exactement ${count} questions variées, classées de la plus facile à la plus difficile. Elles doivent couvrir
l'ensemble du document, du début à la fin : si le document est long, répartis-les entre ses chapitres.
${batchInstructions(batch, batchCount, alreadyAsked)}

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
