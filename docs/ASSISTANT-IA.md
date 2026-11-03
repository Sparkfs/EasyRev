# Assistant IA : expliquer un document et préparer des questions

La page **Documents IA** permet d'envoyer un cours (PDF, Word `.docx`, texte `.txt` ou texte collé).
L'assistant, qui utilise **Google Gemini** (offre gratuite) ou **Azure OpenAI**, produit alors :

- **une explication** : un résumé, les notions clés, une explication partie par partie et un vocabulaire ;
- **des questions corrigées** de 5 types : QCM, vrai/faux, réponse courte, texte à trous et question ouverte
  (ou exercice), chacune avec sa réponse et une explication.

On s'entraîne directement sur la page (QCM et vrai/faux corrigés automatiquement, auto-évaluation pour les
autres), puis on envoie les questions utiles vers les **flashcards**.

---

## Comment ça marche

```
Navigateur                                  Supabase                               Azure
──────────                                  ────────                               ─────
1. Lecture du fichier (pdf.js / mammoth)
   → seul le TEXTE est extrait
2. Enregistrement dans la table documents ─► documents (status = 'pending')
3. Appel de l'Edge Function ───────────────► study-assistant
                                              ├─ vérifie l'utilisateur
                                              ├─ répond « 202 » tout de suite
                                              └─ en arrière-plan :
                                                   explication ───────────────────► Azure OpenAI
                                                   questions   ───────────────────► Azure OpenAI
                                                 enregistre le résultat ◄─────────── (JSON)
                                                 documents.status = 'ready'
4. La page relit le document toutes les 4 s ◄─ jusqu'à 'ready' (ou 'error')
```

| Élément | Fichier |
|---|---|
| Tables `documents` et `questions` (+ règles RLS) | `supabase/documents.sql` |
| Edge Function (appel à Azure OpenAI) | `supabase/functions/study-assistant/index.ts` |
| Lecture des PDF / Word dans le navigateur | `src/lib/extractText.ts` |
| Appel de la fonction, conversion en flashcard | `src/lib/assistant.ts` |
| Pages | `src/pages/Documents.tsx`, `src/pages/DocumentView.tsx` |
| Carte de question interactive | `src/components/QuestionCard.tsx` |
| Conversation avec l'IA sur un document | `src/components/DocumentChat.tsx` (table `document_messages`) |

**Deux fournisseurs possibles.** Gemini et Azure OpenAI acceptent le même format de demande (« chat
completions » d'OpenAI) : la fonction n'a qu'à changer d'adresse et de clé. Le secret `AI_PROVIDER` choisit
lequel utiliser. Sur le schéma ci-dessus, « Azure OpenAI » peut donc être remplacé par « Gemini ».

**Pourquoi une Edge Function ?** La clé de l'IA donne accès à ton compte (et à tes crédits) : elle ne doit **jamais** se trouver
dans le navigateur. L'Edge Function tourne chez Supabase, garde la clé dans ses « secrets » et n'accepte que
les utilisateurs connectés.

**Pourquoi deux demandes à l'IA ?** L'explication et les questions sont demandées **en parallèle** : c'est
environ deux fois plus rapide qu'une seule grosse demande.

**Structured outputs** : on impose à l'IA un format JSON précis (`response_format: json_schema`). Le site reçoit
toujours des données bien rangées, jamais du texte libre à déchiffrer.

**Limites** : jusqu'à 400 000 caractères par analyse (~160 pages ; constante `MAX_CHARACTERS`, la même dans
`src/lib/extractText.ts` et dans l'Edge Function). Pour un PDF, on peut choisir une **plage de pages** (par exemple
un chapitre) : c'est conseillé pour un gros polycopié, les explications et les questions sont plus précises.
Le modèle accepterait bien plus (≈ 1 million de tokens pour gemini-3.8-flash) ; les vraies limites sont la qualité,
le temps de la fonction (150 s sur l'offre gratuite de Supabase, surtout consommé par la rédaction des réponses)
et le **quota gratuit de Gemini** (tokens par minute) : le document est envoyé deux fois (explication + questions),
donc un très gros document peut provoquer une erreur 429 ; il suffit alors d'attendre une minute ou de réduire
la plage de pages. Un PDF **scanné** (une image) ne contient pas de
texte : il faut alors coller le texte dans l'onglet « Coller du texte ».

---

## Installation (une seule fois)

### Étape 1 : créer les tables

Supabase → **SQL Editor** → **New query** → coller tout le contenu de `supabase/documents.sql` → **Run**.
Les tables `documents` et `questions` apparaissent dans **Table Editor**.

**Mises à jour** : si tu avais exécuté `documents.sql` avant l'une d'elles, exécute aussi, une fois, les fichiers
`supabase/mise-a-jour-*.sql` (par ordre de numéro). Ils sont sans danger s'ils ont déjà été appliqués.

- `mise-a-jour-1-reflexion.sql` : colonne `reasoning_effort` (réflexion de l'IA choisie pour chaque document).
- `mise-a-jour-2-conversation.sql` : table `document_messages` (conversation avec l'IA sur chaque document).

### Étape 2 (option A, conseillée) : obtenir une clé Google Gemini gratuite

1. Va sur <https://aistudio.google.com> et connecte-toi avec un compte Google.
2. Clique sur **Get API key** (ou **Obtenir une clé API**) → **Create API key**.
3. Si on te le demande, crée ou choisis un projet Google Cloud (le nom importe peu).
4. Copie la clé (elle commence souvent par `AIza…`) et **garde-la pour toi**.

L'offre gratuite a des limites (nombre de demandes par minute et par jour, visibles dans AI Studio) ; elles
suffisent largement pour un usage personnel. Pour les offres gratuites, Google peut utiliser les contenus
envoyés pour améliorer ses produits : n'envoie pas de documents confidentiels.

Modèle utilisé par défaut : **`gemini-3.8-flash`** (le plus performant des modèles « Flash »). Pour en changer,
définis le secret `GEMINI_MODEL` (liste : <https://ai.google.dev/gemini-api/docs/models>).

Passe ensuite directement à l'**étape 3**.

### Étape 2 (option B) : créer le modèle d'IA sur Azure

> ⚠️ Avec un abonnement **Azure for Students**, le quota des modèles de texte est souvent à **0**
> (page **Quota** de Foundry). Dans ce cas, utilise l'option A, et fais une demande de quota (« Request quota »).

> Les noms des menus d'Azure changent souvent ; l'idée reste la même.

1. Va sur <https://portal.azure.com> et vérifie ton abonnement et tes crédits (**Abonnements** / **Cost Management**).
2. **Créer une ressource** → cherche **Azure OpenAI** (ou **Azure AI Foundry**) → **Créer** :
   - **Abonnement** : celui qui a tes crédits ;
   - **Groupe de ressources** : crée-en un, par ex. `rg-mes-revisions` ;
   - **Région** : une région qui propose le modèle choisi (ex. *Sweden Central*, *East US*) ;
   - **Nom** : par ex. `mes-revisions-ia` ;
   - **Niveau tarifaire** : *Standard S0*.
3. Une fois la ressource créée, ouvre **Azure AI Foundry** (bouton « Explorer / Accéder au portail Foundry »).
4. **Déploiements** → **Déployer un modèle** → choisis un modèle économique et efficace, par exemple
   **gpt-4.1-mini** (ou **gpt-4o-mini**) → type **Global Standard** → donne un **nom de déploiement**
   (par ex. `gpt-4-1-mini`) et **note-le**.
5. Dans la ressource Azure : **Clés et point de terminaison** (*Keys and Endpoint*) → copie le **point de
   terminaison** (`https://….openai.azure.com/`) et la **KEY 1**.

Si Azure refuse de créer la ressource ou le déploiement (selon le type d'abonnement, par ex. *Azure for
Students*, certains modèles ou régions ne sont pas disponibles), essaie une autre région ou un autre modèle.

💡 Crée une **alerte de budget** : **Cost Management** → **Budgets** → par ex. 10 € par mois.

### Étape 3 : déployer l'Edge Function dans Supabase

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nomme la fonction exactement **`study-assistant`**.
3. Remplace le code d'exemple par **tout** le contenu de `supabase/functions/study-assistant/index.ts`.
4. Clique sur **Deploy function**.
5. Dans les réglages de la fonction (**Details** / **Settings**), **désactive « Verify JWT »**
   (*Enforce JWT verification*) et enregistre. La fonction vérifie elle-même l'utilisateur connecté ;
   ce réglage évite un refus avec les nouvelles clés Supabase.

Avec la ligne de commande, c'est équivalent :
`npx supabase functions deploy study-assistant --project-ref <id-du-projet> --no-verify-jwt`.

### Étape 4 : donner la clé de l'IA à la fonction (secrets)

Supabase → **Edge Functions** → **Secrets** (ou **Project Settings → Edge Functions**) → ajoute :

**Avec Gemini (option A) :**

| Nom | Valeur |
|---|---|
| `AI_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | ta clé Google AI Studio |
| `GEMINI_MODEL` | *facultatif*, par défaut `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODEL` | *facultatif*, modèle de secours si le premier est saturé ou a atteint son quota, par défaut `gemini-3.6-flash` |

En cas de surcharge passagère de Google (erreurs 500/503), la fonction réessaie toute seule après 2 puis
5 secondes, puis passe au modèle de secours ; en cas de quota atteint (429), elle passe directement au modèle de
secours.

**Avec Azure OpenAI (option B) :**

| Nom | Valeur |
|---|---|
| `AI_PROVIDER` | `azure` |
| `AZURE_OPENAI_ENDPOINT` | le point de terminaison Azure, ex. `https://easyrev.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | la **KEY 1** d'Azure |
| `AZURE_OPENAI_DEPLOYMENT` | le **nom du déploiement**, ex. `gpt-6-1-terra` |

**Dans les deux cas, facultatif :**

| Nom | Valeur |
|---|---|
| `AI_REASONING_EFFORT` | `low`, `medium` ou `high` : réflexion **par défaut**, utilisée seulement quand un document n'a pas de réflexion choisie (le site en enregistre une pour chaque nouveau document). Seulement pour les modèles qui « réfléchissent » (Gemini 3.x, gpt-5/6…), pas pour gpt-4.1 |

**Réflexion par document.** Le formulaire de la page Documents IA propose « Réflexion de l'IA » : *Rapide* (`low`),
*Équilibrée* (`medium`, par défaut) ou *Approfondie* (`high`). Le choix est enregistré dans
`documents.reasoning_effort` et réutilisé par « Relancer l'analyse », qui permet aussi de le changer (utile si
l'analyse a manqué de temps). Avec *Approfondie*, viser 16 questions au plus : au-delà, l'IA risque de dépasser les
150 secondes de l'Edge Function.

Pour passer d'un fournisseur à l'autre plus tard, il suffit de changer `AI_PROVIDER` (et d'avoir ses clés).

⚠️ Ces valeurs vont **uniquement** dans les secrets Supabase, jamais dans `.env.local` ni dans le code.

### Étape 5 : essayer

Sur le site → **Documents IA** → envoie un petit cours → **Analyser avec l'IA**.
Après 30 secondes à 2 minutes, l'explication et les questions apparaissent.

---

## Poser des questions à l'IA sur un document

L'onglet **« Demander à l'IA »** de la page d'un document ouvre une conversation. Les boutons **« Je ne comprends pas
cette partie »** (sur l'explication) et **« Je ne comprends pas ce corrigé »** (sur les questions) ouvrent cet onglet
avec une question déjà préparée, que l'on peut compléter avant de l'envoyer.

- **Ce que reçoit l'IA** : le texte du document, l'explication déjà donnée, les 10 derniers messages et la question.
  Chaque question renvoie donc le document entier à l'IA, ce qui compte dans le quota de Gemini : un très long
  document consomme plus de quota à chaque question.
- **Réponse immédiate** : contrairement à l'analyse, la fonction attend la réponse de l'IA avant de répondre au site
  (`{ ask_document_id, question }` → `{ messages }`). La réflexion utilisée est celle du document.
- **Conversation enregistrée** : la question et la réponse sont ajoutées à `document_messages` une fois la réponse
  obtenue. En cas d'erreur, rien n'est enregistré et le site rend la question pour pouvoir réessayer.
- **Documents analysés dans claude.ai** : leur texte n'est pas dans le site, l'IA ne connaît donc que leur explication.
- **La clé `ask_document_id`** est volontairement différente de `document_id` : si la fonction déployée n'est pas à
  jour, elle refuse la demande (et le site affiche « redéploie la fonction ») au lieu de relancer toute l'analyse.

---

## Variante sans clé : avec un abonnement Claude (claude.ai)

Un abonnement Claude (Pro, Max…) ne fournit **pas** de clé API : le site ne peut pas appeler Claude tout seul.
L'onglet **« Avec mon abonnement Claude »** de la page Documents IA permet quand même de s'en servir, à la main :

1. choisir la matière et le nombre de questions, puis **Copier la consigne** (`buildClaudePrompt`) ;
2. sur claude.ai, joindre le cours (PDF, Word…), coller la consigne et envoyer ;
3. copier **toute** la réponse de Claude (un objet JSON) et la coller dans le site → **Importer**.

Le site lit le JSON (`parseClaudeAnswer`, dans `src/lib/claudeImport.ts`, testé dans `claudeImport.test.ts`),
vérifie chaque question avec les mêmes règles que l'Edge Function, puis crée directement le document (statut
`ready`) et ses questions. Aucune Edge Function ni clé n'est nécessaire.

Avantages : aucun frais en plus de l'abonnement, et Claude lit directement le PDF (formules et schémas
compris). Le texte du document n'est pas importé dans le site.

---

## En cas de problème

Le message d'erreur s'affiche sur la page du document, avec un bouton **Relancer l'analyse**.

| Message | Cause probable | Solution |
|---|---|---|
| « L'assistant IA n'est pas encore installé » | Fonction absente ou mal nommée | Étape 3, nom exact `study-assistant` |
| « Supabase a refusé l'accès… Verify JWT » | Vérification JWT activée | Étape 3, point 5 |
| « Secrets manquants… » | Un secret oublié ou mal nommé | Étape 4 |
| « Azure OpenAI a répondu 401 » | Mauvaise clé | Recopie la KEY 1 dans `AZURE_OPENAI_API_KEY` |
| « Azure OpenAI a répondu 404 » | Mauvais nom de déploiement ou d'adresse | Vérifie `AZURE_OPENAI_DEPLOYMENT` et `AZURE_OPENAI_ENDPOINT` |
| « Azure OpenAI a répondu 429 » | Quota dépassé (trop de demandes) | Attends une minute, ou augmente le quota du déploiement dans Foundry |
| « Gemini a répondu 400 / 403 » + « API key » | Clé Gemini invalide | Recopie la clé dans `GEMINI_API_KEY` |
| « Gemini a répondu 404 » | Nom de modèle inconnu | Vérifie `GEMINI_MODEL` (ou supprime-le pour garder le modèle par défaut) |
| « Limite de l'offre gratuite de Gemini atteinte » (429) | Quota gratuit épuisé sur les deux modèles (par minute ou par jour) | Attends une minute, ou le lendemain ; analyse moins de pages |
| « Les serveurs de Gemini sont saturés » (500 / 503) | Surcharge passagère chez Google, même après les nouveaux essais et le modèle de secours | Relance dans quelques minutes |
| « …400… response_format… » | Le modèle ne gère pas les *structured outputs* | Déploie un modèle récent (gpt-4.1-mini, gpt-4o-mini…) |
| « La réponse de l'IA a été coupée » | Trop de questions demandées | Choisis moins de questions |

Les journaux détaillés sont dans Supabase → **Edge Functions** → `study-assistant` → **Logs**.

---

## Sécurité et coûts

- La clé de l'IA (Gemini ou Azure) reste dans les secrets Supabase ; le navigateur ne la voit jamais.
- La fonction refuse les visiteurs non connectés et lit le document **avec les droits de l'utilisateur** :
  les règles RLS empêchent d'analyser le document de quelqu'un d'autre.
- **Chaque analyse consomme tes crédits Azure** : deux appels au modèle par document, de l'ordre de quelques
  centimes avec un modèle « mini ». Une fois ton site en ligne, n'importe qui pourrait créer un compte et
  utiliser l'assistant : désactive les inscriptions (Supabase → **Authentication** → **Sign In / Providers** →
  **Allow new users to sign up**) quand tous tes utilisateurs ont leur compte.
