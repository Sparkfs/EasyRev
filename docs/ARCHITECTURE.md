# Architecture de « Mes révisions »

Ce document explique **comment le site est construit** : les technologies utilisées, le rôle de chaque fichier,
le chemin des données, la sécurité et les choix techniques.
Il s'adresse à toute personne qui veut comprendre, modifier ou faire évoluer le code.

Pour **installer et lancer** le projet, voir le [README](../README.md).

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Technologies](#2-technologies)
3. [Organisation des fichiers](#3-organisation-des-fichiers)
4. [Démarrage de l'application](#4-démarrage-de-lapplication)
5. [Le chemin des données](#5-le-chemin-des-données)
6. [Modèle de données](#6-modèle-de-données)
7. [Sécurité](#7-sécurité)
8. [Modules clés](#8-modules-clés)
9. [Interface et style](#9-interface-et-style)
10. [Qualité : types, linter, tests](#10-qualité--types-linter-tests)
11. [Du code au site en ligne](#11-du-code-au-site-en-ligne)
12. [Choix techniques et limites](#12-choix-techniques-et-limites)
13. [Recette : ajouter une fonctionnalité](#13-recette--ajouter-une-fonctionnalité)
14. [Glossaire](#14-glossaire)

---

## 1. Vue d'ensemble

Le site est composé de **deux parties seulement**. Il n'y a pas de serveur programmé « maison ».

```
┌──────────────────────── Navigateur de l'utilisateur ────────────────────────┐
│                                                                             │
│   Application React  (tout le code de src/)                                 │
│                                                                             │
│   pages/  ──►  lib/  (logique : dates, répétition espacée…)                 │
│     │                                                                       │
│     └──►  supabase-js  (bibliothèque qui dialogue avec Supabase)            │
│                                                                             │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │  requêtes HTTPS
                                   │  + jeton de connexion (JWT)
┌──────────────────────────────────▼──────────────── Supabase (cloud) ────────┐
│                                                                             │
│   Auth  (/auth/v1)            API REST  (/rest/v1)                          │
│   comptes, mots de passe,     générée automatiquement                       │
│   jetons de connexion         à partir des tables                           │
│                                      │                                      │
│                       PostgreSQL + règles de sécurité (RLS)                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Partie | Ce qu'elle fait | Où se trouve son code |
|---|---|---|
| **Front-end** (l'interface) | Affiche les pages, réagit aux clics, fait les calculs (prochaine révision, temps d'étude…) | `src/`, exécuté dans le navigateur |
| **Back-end** (comptes et stockage) | Gère les comptes, stocke les données, vérifie les droits d'accès | Fourni par Supabase ; on écrit seulement `supabase/schema.sql` |

Ce modèle s'appelle **SPA + Backend-as-a-Service** :

- **SPA** (*Single Page Application*) : le navigateur télécharge le site une seule fois, puis change de page sans
  recharger (c'est React Router qui s'en charge).
- **Backend-as-a-Service** : le serveur, la base de données et la gestion des comptes sont un service prêt à
  l'emploi (Supabase), qu'on configure au lieu de le programmer.

---

## 2. Technologies

| Technologie | Version | Rôle | Fichiers concernés |
|---|---|---|---|
| **TypeScript** | 7 | Langage : JavaScript + types, pour détecter les erreurs avant l'exécution | tous les `.ts` / `.tsx`, `tsconfig*.json` |
| **React** | 19 | Construire l'interface en composants | `src/pages/`, `src/components/` |
| **React Router** | 8 | Associer une adresse (`/planning`…) à une page | `src/App.tsx`, `src/components/Layout.tsx` |
| **Vite** | 8 | Serveur de développement et fabrication de la version finale | `vite.config.ts`, `index.html` |
| **Supabase** (`@supabase/supabase-js`) | 2 | Comptes, base PostgreSQL, API | `src/lib/supabase.ts`, `supabase/schema.sql` |
| **CSS** (sans framework) | — | Apparence, mode sombre, version téléphone | `src/index.css` |
| **Vitest** | 5 | Tests automatiques | `src/lib/srs.test.ts` |
| **oxlint** | 1 | Linter : repère les erreurs courantes | `.oxlintrc.json` |
| **npm** / **Node.js** | 11 / 24 | Installer les bibliothèques, lancer les commandes | `package.json`, `package-lock.json` |

### TypeScript

TypeScript ajoute des **types** à JavaScript. Par exemple, `src/lib/types.ts` décrit la forme d'une flashcard :

```ts
export interface Flashcard {
  id: string
  subject_id: string
  front: string
  back: string
  due_date: string
  // …
}
```

Si on écrit `card.frnt` au lieu de `card.front`, ou qu'on oublie qu'une échéance peut être vide (`null`),
TypeScript le signale **avant** que le site ne soit lancé. Le navigateur ne comprend pas TypeScript :
Vite le convertit en JavaScript.

### React

React découpe l'interface en **composants** : des fonctions qui reçoivent des données et renvoient ce qu'il faut
afficher, écrit en **JSX** (du HTML dans du JavaScript).

```tsx
export default function SubjectTag({ subject }: { subject: Subject | undefined }) {
  if (!subject) return null
  return (
    <span className="chip">
      <span className="dot" style={{ background: subject.color }} />
      {subject.name}
    </span>
  )
}
```

Les notions React utilisées dans le projet :

| Notion | À quoi elle sert | Exemple dans le code |
|---|---|---|
| **Props** | Données passées d'un composant parent à un enfant | `<SubjectTag subject={…} />` |
| **`useState`** | Mémoriser une valeur qui, quand elle change, met l'écran à jour | la liste des tâches dans `Planning.tsx` |
| **`useEffect`** | Lancer une action après l'affichage (charger des données, démarrer un minuteur) | chargement des cartes dans `Flashcards.tsx` |
| **`useRef`** | Garder une référence vers un élément HTML | remettre le curseur dans le champ « Question » |
| **Context** | Partager un état entre des composants éloignés | le minuteur Pomodoro (`src/pomodoro/`) |
| **Hook personnalisé** | Regrouper une logique réutilisable | `useSubjects()`, `useSession()` |

### React Router

Il fait correspondre l'adresse affichée dans le navigateur à une page, **sans recharger le site**.
Les liens du menu utilisent `<NavLink>`, qui ajoute automatiquement la classe `active` au lien de la page en cours.

### Vite

- `npm run dev` : lance un serveur local (<http://localhost:5173>) qui recharge la page à chaque modification.
- `npm run build` : vérifie les types, puis assemble tout le code en **trois fichiers** (HTML, JS, CSS) dans `dist/`.

### Supabase

Supabase regroupe plusieurs services :

| Service | Rôle dans le projet |
|---|---|
| **Auth** | Inscription, connexion, jetons de connexion (JWT) |
| **PostgreSQL** | La base de données (4 tables, voir [section 6](#6-modèle-de-données)) |
| **API REST** (PostgREST) | Crée automatiquement une API pour chaque table : pas besoin d'écrire de serveur |
| **Row Level Security** | Règles qui garantissent que chacun ne voit que ses propres données |

Dans le code, on n'écrit pas les requêtes HTTP soi-même : la bibliothèque `supabase-js` les fabrique.

```ts
supabase.from('flashcards').select('*').lte('due_date', today())
// devient : GET https://<projet>.supabase.co/rest/v1/flashcards?select=*&due_date=lte.2026-11-01
```

### Vitest et oxlint

- **Vitest** lance les tests (`npm test`) : de petits programmes qui vérifient automatiquement qu'une fonction
  donne le bon résultat.
- **oxlint** (`npm run lint`) relit le code et signale les erreurs fréquentes, par exemple une mauvaise
  utilisation des hooks React.

---

## 3. Organisation des fichiers

```
site-etude/
├── index.html                  Page HTML de départ (charge src/main.tsx)
├── package.json                Bibliothèques utilisées et commandes npm
├── vite.config.ts              Configuration de Vite
├── tsconfig*.json              Configuration de TypeScript
├── .oxlintrc.json              Configuration du linter
├── .env.example                Modèle du fichier de configuration Supabase
├── .env.local                  (à créer) URL et clé Supabase, jamais envoyé sur GitHub
├── vercel.json                 Réglage pour l'hébergement sur Vercel
├── public/
│   ├── favicon.svg             Icône de l'onglet
│   └── _redirects              Réglage pour l'hébergement sur Netlify
├── supabase/
│   └── schema.sql              Tables + règles de sécurité (à exécuter dans Supabase)
├── docs/
│   └── ARCHITECTURE.md         Ce document
└── src/
    ├── main.tsx                Point d'entrée : affiche <App /> dans la page
    ├── App.tsx                 Choix de l'écran (aide / connexion / site) et liste des routes
    ├── index.css               Toute l'apparence du site
    ├── env.d.ts                Types des variables d'environnement
    ├── components/             Morceaux d'interface réutilisés
    │   ├── Layout.tsx          En-tête, menu, bouton Déconnexion, mini-minuteur
    │   ├── SubjectSelect.tsx   Liste déroulante des matières
    │   └── SubjectTag.tsx      Étiquette colorée d'une matière
    ├── pages/                  Un fichier par écran
    │   ├── Dashboard.tsx       Tableau de bord
    │   ├── Subjects.tsx        Matières
    │   ├── Flashcards.tsx      Création et liste des flashcards
    │   ├── Review.tsx          Séance de révision
    │   ├── Planning.tsx        Tâches
    │   ├── Pomodoro.tsx        Minuteur
    │   ├── Login.tsx           Connexion / inscription
    │   └── SetupMissing.tsx    Aide affichée si Supabase n'est pas configuré
    ├── pomodoro/
    │   ├── PomodoroProvider.tsx  Le moteur du minuteur (état + décompte)
    │   └── usePomodoro.ts        Accès au minuteur depuis n'importe quelle page
    └── lib/                    Logique sans affichage
        ├── supabase.ts         Connexion à Supabase
        ├── useSession.ts       Qui est connecté ?
        ├── useSubjects.ts      Chargement des matières
        ├── srs.ts              Algorithme de répétition espacée
        ├── srs.test.ts         Tests de srs.ts et dates.ts
        ├── dates.ts            Calcul et affichage des dates
        ├── colors.ts           Couleurs proposées pour les matières
        └── types.ts            Forme des données de chaque table
```

**Règle de rangement** : les `pages/` affichent et réagissent aux actions, les `components/` sont des morceaux
réutilisés par plusieurs pages, et `lib/` contient la logique qui n'affiche rien. Cette séparation permet de
tester `lib/` sans navigateur.

---

## 4. Démarrage de l'application

```
index.html
  └─► src/main.tsx        charge index.css et affiche <App />
        └─► src/App.tsx
              │
              ├─ Supabase non configuré (.env.local absent) ──► SetupMissing (écran d'aide)
              │
              ├─ useSession() en cours de chargement ─────────► « Chargement… »
              ├─ personne n'est connecté ─────────────────────► Login
              │
              └─ utilisateur connecté
                    └─► BrowserRouter          (gestion des adresses)
                          └─► PomodoroProvider (minuteur partagé)
                                └─► Layout     (en-tête + menu)
                                      └─► la page correspondant à l'adresse
```

### Les routes

| Adresse | Page | Fichier |
|---|---|---|
| `/` | Tableau de bord | `pages/Dashboard.tsx` |
| `/matieres` | Matières | `pages/Subjects.tsx` |
| `/flashcards` | Flashcards | `pages/Flashcards.tsx` |
| `/reviser` | Révision (toutes les matières) | `pages/Review.tsx` |
| `/reviser?matiere=<id>` | Révision d'une seule matière | `pages/Review.tsx` |
| `/planning` | Planning | `pages/Planning.tsx` |
| `/pomodoro` | Pomodoro | `pages/Pomodoro.tsx` |
| toute autre adresse | redirection vers `/` | `App.tsx` |

`Layout` affiche l'en-tête, puis la page en cours à l'emplacement de `<Outlet />`.

### La session de connexion

`useSession()` (dans `lib/useSession.ts`) s'abonne à `supabase.auth.onAuthStateChange`. Supabase prévient
l'application au démarrage (session retrouvée ou non), à la connexion et à la déconnexion. `App.tsx` change
d'écran automatiquement.

---

## 5. Le chemin des données

Toutes les pages suivent le même schéma : **charger** au démarrage, **garder en mémoire** avec `useState`,
**modifier** dans Supabase puis mettre à jour la mémoire.

### 5.1 Lire

Exemple tiré de `lib/useSubjects.ts` :

```ts
useEffect(() => {
  let ignore = false
  supabase
    .from('subjects')
    .select('*')
    .order('name')
    .then(({ data, error }) => {
      if (ignore) return            // la page a été quittée entre-temps : on ne fait rien
      if (error) setError(error.message)
      else setSubjects(data)
      setLoading(false)
    })
  return () => {
    ignore = true                   // exécuté quand la page disparaît
  }
}, [])                              // [] = une seule fois, à l'arrivée sur la page
```

- Chaque réponse Supabase contient `data` (le résultat) **ou** `error` (le problème).
- Le drapeau `ignore` évite de mettre à jour une page qui n'est plus affichée. En développement, React lance
  volontairement chaque `useEffect` deux fois (mode `StrictMode`) pour faire ressortir ce genre d'oubli.

### 5.2 Écrire

Exemple tiré de `pages/Planning.tsx` :

```ts
const { data, error } = await supabase
  .from('tasks')
  .insert({ title: trimmed, subject_id: subjectId || null, due_date: dueDate || null })
  .select()      // demande à Supabase de renvoyer la ligne créée…
  .single()      // …sous forme d'un seul objet
if (error) {
  setError(error.message)
  return
}
setTasks([...tasks, data])   // on ajoute la nouvelle tâche à la liste déjà affichée
```

On ne recharge pas toute la liste après chaque modification : on met à jour la copie locale avec la ligne
renvoyée par Supabase. C'est plus rapide et l'écran ne clignote pas.

### 5.3 Exemple complet : noter une flashcard « Bien »

```
Utilisateur         Review.tsx                 lib/srs.ts + dates.ts      Supabase
    │  clic « Bien »     │                              │                     │
    │───────────────────►│ schedule(carte, 'good')      │                     │
    │                    │─────────────────────────────►│                     │
    │                    │◄──── { interval_days: 6, … } │                     │
    │                    │ addDays(today(), 6)          │                     │
    │                    │─────────────────────────────►│                     │
    │                    │◄──────────── '2026-11-07'    │                     │
    │ carte suivante     │                              │                     │
    │◄───────────────────│ (affichage immédiat)         │                     │
    │                    │ update(...).eq('id', …)      │                     │
    │                    │───────────────────────────────────────────────────►│
    │                    │                              │  vérifie la règle   │
    │                    │                              │  RLS puis enregistre│
    │                    │◄───────────────────────────────────── ok / erreur  │
    │ (message si erreur)│                              │                     │
```

Ici, l'écran passe à la carte suivante **avant** la réponse de Supabase (mise à jour « optimiste »),
pour que la révision reste fluide. En cas d'échec, un message s'affiche.

### 5.4 Un état partagé : le minuteur Pomodoro

La plupart des données appartiennent à une seule page. Le minuteur, lui, doit **continuer à tourner quand on
change de page**. Il vit donc dans un **Context** React placé au-dessus de toutes les pages :

```
PomodoroProvider   ← possède l'état (phase, temps restant, en marche ?)
  └─ Layout        ← lit l'état pour afficher le mini-minuteur dans l'en-tête
       └─ Pomodoro ← lit l'état et appelle start(), pause(), reset()…
```

N'importe quel composant situé en dessous peut y accéder avec `usePomodoro()`.

---

## 6. Modèle de données

### Les tables

**`subjects`**, les matières

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid | Identifiant unique |
| `user_id` | uuid | Propriétaire (rempli automatiquement) |
| `name` | text | Nom, 1 à 80 caractères |
| `color` | text | Couleur, ex. `#2a78d6` |
| `created_at` | timestamptz | Date de création |

**`flashcards`**, les cartes

| Colonne | Type | Rôle |
|---|---|---|
| `id`, `user_id`, `created_at` | | comme ci-dessus |
| `subject_id` | uuid | Matière (obligatoire) |
| `front` / `back` | text | Question / réponse |
| `repetitions` | integer | Bonnes réponses d'affilée |
| `interval_days` | integer | Jours avant la prochaine révision |
| `ease` | real | Facilité (2,5 au départ, jamais sous 1,3) |
| `due_date` | date | Date de la prochaine révision |

**`tasks`**, les tâches du planning

| Colonne | Type | Rôle |
|---|---|---|
| `id`, `user_id`, `created_at` | | comme ci-dessus |
| `subject_id` | uuid, facultatif | Matière |
| `title` | text | Intitulé, 1 à 200 caractères |
| `due_date` | date, facultative | Échéance |
| `done` | boolean | Terminée ou non |

**`study_sessions`**, les séances Pomodoro terminées

| Colonne | Type | Rôle |
|---|---|---|
| `id`, `user_id` | | comme ci-dessus |
| `subject_id` | uuid, facultatif | Matière étudiée |
| `minutes` | integer | Durée (> 0) |
| `completed_at` | timestamptz | Fin de la séance |

### Les liens entre tables

```
auth.users (comptes Supabase)
   │ 1
   │
   │ n          1        n
   ├───────► subjects ───────► flashcards       suppression d'une matière ⇒ ses cartes sont supprimées
   │              │  1     n
   │              ├──────────► tasks            suppression d'une matière ⇒ ses tâches sont supprimées
   │              │  1     n
   │              └──────────► study_sessions   suppression d'une matière ⇒ séances conservées, « Sans matière »
   │
   └── chaque table a aussi un user_id ; supprimer un compte supprime toutes ses données
```

### Les dates

- `due_date` est une **date sans heure** (`AAAA-MM-JJ`), calculée dans le **fuseau horaire de l'utilisateur**.
- `created_at` et `completed_at` sont des **instants précis** (avec heure et fuseau).

---

## 7. Sécurité

### Comptes

- Connexion par **email + mot de passe** (6 caractères minimum), gérée par Supabase Auth.
- Après connexion, Supabase fournit un **jeton d'accès (JWT)**, valable environ une heure, et un **jeton de
  renouvellement**. `supabase-js` les garde dans le `localStorage` du navigateur et renouvelle le premier
  automatiquement.
- Chaque requête vers la base envoie le jeton d'accès : la base sait ainsi **qui** fait la demande.

### Les clés

| Clé | Où | Peut-elle être publique ? |
|---|---|---|
| **publishable** (ou ancienne **anon**) | `.env.local`, puis incluse dans le site | **Oui**, elle ne donne aucun droit à elle seule |
| **secret** (ou **service_role**) | jamais dans ce projet | **Non !** Elle contourne toutes les règles |

`.env.local` n'est jamais envoyé sur GitHub : il est exclu par la ligne `*.local` du `.gitignore`.

### Row Level Security (RLS)

Puisque la clé est publique, la protection est assurée **par la base elle-même**. Chaque table a une règle :

```sql
create policy "Chacun gère ses tâches" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

- `auth.uid()` est l'identifiant de l'utilisateur, lu dans son jeton.
- `using` : on ne peut **lire, modifier ou supprimer** que les lignes dont on est propriétaire.
- `with check` : on ne peut **créer** une ligne qu'à son propre nom.
- Un visiteur non connecté n'a accès à rien.

Le site n'envoie **jamais** lui-même `user_id` : la colonne a pour valeur par défaut `auth.uid()`.
Impossible, donc, de créer des données au nom de quelqu'un d'autre.

---

## 8. Modules clés

### 8.1 Répétition espacée (`lib/srs.ts`)

L'algorithme s'inspire de **SM-2**, celui d'Anki. Principe : plus une carte est connue, moins on la revoit.

Chaque carte garde trois nombres : `repetitions`, `interval_days` et `ease` (facilité).
La fonction `schedule(carte, note)` calcule les nouvelles valeurs :

| Note | Facilité | Nouvel intervalle |
|---|---|---|
| **À revoir** | −0,20 | 0 : la carte revient en fin de séance ; `repetitions` repart à 0 |
| **Difficile** | −0,15 | intervalle de base × 0,5 |
| **Bien** | inchangée | intervalle de base |
| **Facile** | +0,15 | intervalle de base × 1,5 |

**Intervalle de base** : 1 jour après la 1ʳᵉ réussite, 6 jours après la 2ᵉ, puis
*intervalle précédent × facilité*. La facilité ne descend jamais sous **1,3**, et l'intervalle est toujours
d'au moins **1 jour** (sauf « À revoir »).

Exemple d'une carte toujours notée « Bien » : **1 → 6 → 15 → 38 → 95 jours**.

`schedule()` est une **fonction pure** : elle ne lit ni n'écrit rien d'autre que ses paramètres. C'est
ce qui la rend facile à tester (`srs.test.ts`) et à modifier sans risque.

### 8.2 Minuteur Pomodoro (`pomodoro/PomodoroProvider.tsx`)

- Le minuteur ne décompte pas seconde par seconde : il retient **l'heure de fin** (`endsAt`) et compare
  avec l'horloge toutes les 250 ms. Il reste ainsi exact même si le navigateur ralentit un onglet en arrière-plan.
- À la fin d'une phase de **concentration** : un son est joué, la séance est enregistrée dans `study_sessions`,
  et la **pause démarre automatiquement**.
- À la fin d'une **pause** : le minuteur attend un clic sur « Démarrer ». On n'enregistre donc pas de faux temps
  d'étude si l'utilisateur s'est absenté.
- Pendant le décompte, le temps restant s'affiche dans le **titre de l'onglet** et dans l'en-tête du site.
- Limite : l'état est gardé en mémoire. Recharger la page (F5) remet le minuteur à zéro.

### 8.3 Dates (`lib/dates.ts`)

La méthode JavaScript `toISOString()` donne la date en **UTC**. En France (UTC+1), à 00 h 30, elle
renverrait donc la date de la veille. `toISODate()` construit la date à partir de l'heure **locale** pour éviter
ce piège. Toutes les comparaisons d'échéances (`due_date <= today()`) se font sur ces chaînes `AAAA-MM-JJ`,
qui se comparent correctement dans l'ordre alphabétique.

---

## 9. Interface et style

- **Un seul fichier CSS** (`src/index.css`), sans framework, organisé par sections : couleurs, base, structure,
  blocs, texte, boutons, formulaires, listes, tableau de bord, révision, Pomodoro.
- **Variables CSS** (`--bg`, `--text`, `--accent`…) définies en haut du fichier. Les composants n'utilisent que
  ces variables, jamais de couleur en dur.
- **Mode sombre automatique** : `@media (prefers-color-scheme: dark)` redéfinit les variables selon le réglage
  du système.
- **Version téléphone** : sous 760 px de large, le menu passe sur sa propre ligne et les formulaires s'empilent ;
  sous 560 px, les boutons de notation passent sur deux lignes.
- **Accessibilité** :
  - chaque champ a une étiquette (`<label>`) ;
  - le contour du focus est visible au clavier ;
  - les informations importantes ne reposent pas que sur la couleur (« ⚠ En retard » a une icône et un texte) ;
  - les couleurs des matières ont été choisies pour rester distinctes pour les personnes daltoniennes ;
  - la révision et le minuteur s'utilisent au clavier.

---

## 10. Qualité : types, linter, tests

| Commande | Ce qu'elle vérifie |
|---|---|
| `npm run build` | Les **types** (`tsc -b`), puis la fabrication du site |
| `npm run lint` | Les **erreurs courantes** (oxlint) |
| `npm test` | Les **tests automatiques** (Vitest) |

Les tests (`src/lib/srs.test.ts`) couvrent :

- les intervalles de la répétition espacée (1 → 6 → 15 jours avec « Bien ») ;
- la remise à zéro avec « À revoir » ;
- l'effet de « Difficile » et « Facile » ;
- le minimum de facilité (1,3) et d'intervalle (1 jour) ;
- les calculs de dates : changement de mois et d'année, lundi de la semaine en cours, durées, tri par échéance.

Les pages elles-mêmes ne sont pas testées automatiquement : elles se vérifient à la main dans le navigateur.

**Bonne habitude** : lancer ces trois commandes avant chaque mise en ligne.

---

## 11. Du code au site en ligne

```
         développement                               production
src/ ──► npm run dev ──► localhost:5173      src/ ──► npm run build ──► dist/
         (rechargement automatique)                   (index.html + 1 JS + 1 CSS)
                                                                │
                                                       hébergement statique
                                                       (Vercel, Netlify…)
```

- **Variables d'environnement** : seules celles qui commencent par `VITE_` sont accessibles au site
  (`import.meta.env.VITE_SUPABASE_URL`). Vite les **inscrit dans le code au moment du build**. Conséquences :
  - après une modification de `.env.local`, il faut relancer `npm run dev` ;
  - chez l'hébergeur, il faut définir les variables **avant** de lancer le build.
- **Redirections** : sur un hébergeur, une adresse comme `/planning` ne correspond à aucun fichier réel.
  `public/_redirects` (Netlify) et `vercel.json` (Vercel) indiquent de renvoyer `index.html` ; React Router
  affiche ensuite la bonne page.

---

## 12. Choix techniques et limites

### Ce qui a été choisi, et ce qui ne l'a pas été

| Choix | Alternative écartée | Pourquoi |
|---|---|---|
| Supabase | Serveur maison (Node.js + Express + base) | Pas de code serveur à écrire ni à héberger ; comptes et sécurité fournis ; offre gratuite |
| Supabase | Firebase | Vraie base SQL (PostgreSQL), règles de sécurité écrites en SQL, données faciles à exporter |
| React + Vite (SPA) | Next.js | Le rendu côté serveur sert surtout au référencement Google, inutile pour un outil personnel protégé par une connexion |
| `useState` + Context | Redux, Zustand… | Suffisant pour cette taille de projet ; une notion de moins à apprendre |
| CSS simple | Tailwind, Bootstrap | Plus lisible pour apprendre, aucune dépendance |
| Types écrits à la main (`types.ts`) | Types générés par Supabase | Plus simple au départ (voir les améliorations possibles) |

### Limites connues

- **La logique est dans le navigateur.** Un utilisateur un peu technique pourrait modifier *ses propres*
  données à la main (par exemple la date d'une carte), mais jamais celles des autres, grâce à la RLS.
- **Pas de mode hors ligne.** Sans connexion internet, les données ne se chargent pas.
- **Pas de synchronisation en direct.** Si le site est ouvert sur deux appareils, il faut recharger la page
  pour voir les changements faits sur l'autre.
- **Le minuteur Pomodoro** est remis à zéro si on recharge la page.

### Améliorations possibles

- Générer `types.ts` automatiquement : `npx supabase gen types typescript`.
- Rendre le site installable et utilisable hors ligne (PWA).
- Activer *Supabase Realtime* pour synchroniser plusieurs appareils en direct.
- Ajouter des tests de pages (React Testing Library) ou de bout en bout (Playwright).

---

## 13. Recette : ajouter une fonctionnalité

Exemple : une page **« Notes »** pour écrire ses notes de cours.

**1. Créer la table dans Supabase** (SQL Editor) en recopiant le modèle des autres tables :

```sql
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now()
);
alter table public.notes enable row level security;
create policy "Chacun gère ses notes" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.notes to authenticated;
```

Ajoute aussi ce code à la fin de `supabase/schema.sql`, pour que le fichier reste complet.

**2. Décrire le type** dans `src/lib/types.ts` :

```ts
export interface Note {
  id: string
  subject_id: string | null
  title: string
  content: string
  created_at: string
}
```

**3. Créer la page** `src/pages/Notes.tsx` en s'inspirant de `Subjects.tsx` (chargement dans `useEffect`,
formulaire d'ajout, liste avec bouton Supprimer).

**4. Déclarer la route** dans `src/App.tsx` :

```tsx
<Route path="notes" element={<Notes />} />
```

**5. Ajouter le lien au menu** dans `src/components/Layout.tsx` :

```ts
{ to: '/notes', label: 'Notes' },
```

**6. Vérifier** : `npm run build`, `npm run lint`, `npm test`, puis essayer la page dans le navigateur.

---

## 14. Glossaire

| Terme | Définition |
|---|---|
| **API REST** | Façon de dialoguer avec un serveur par des adresses web : `GET` pour lire, `POST` pour créer, `PATCH` pour modifier, `DELETE` pour supprimer |
| **Backend-as-a-Service** | Service en ligne qui fournit un back-end prêt à l'emploi (base, comptes, API) |
| **Build** | Transformation du code source en fichiers optimisés prêts à être mis en ligne |
| **Composant** | Fonction React qui renvoie un morceau d'interface |
| **Context** | Mécanisme React pour partager un état avec tous les composants situés en dessous |
| **Front-end / back-end** | Partie qui tourne dans le navigateur / partie qui tourne sur un serveur |
| **Hook** | Fonction React dont le nom commence par `use` (`useState`, `useEffect`…) |
| **JSX** | Syntaxe qui permet d'écrire du HTML dans du JavaScript |
| **JWT** | *JSON Web Token* : jeton signé qui prouve l'identité de l'utilisateur |
| **Linter** | Outil qui relit le code à la recherche d'erreurs courantes |
| **Props** | Paramètres passés à un composant |
| **RLS** | *Row Level Security* : règles PostgreSQL qui filtrent les lignes selon l'utilisateur |
| **Route** | Association entre une adresse (`/planning`) et une page |
| **SPA** | *Single Page Application* : site chargé une fois, qui change de page sans rechargement |
| **State (état)** | Donnée mémorisée par un composant ; quand elle change, l'affichage se met à jour |
| **Variable d'environnement** | Réglage fourni de l'extérieur du code (ici l'URL et la clé Supabase) |
