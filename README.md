# Mes révisions

Un site pour organiser ses révisions :

- **Tableau de bord** : cartes à réviser, tâches du jour et en retard, temps d'étude de la semaine par matière.
- **Matières** : chaque matière a sa couleur ; flashcards et tâches y sont rattachées.
- **Flashcards** avec **répétition espacée** : le site te repropose chaque carte au bon moment (comme Anki).
- **Planning** : tâches avec échéance, regroupées en « En retard », « Aujourd'hui », « À venir ».
- **Pomodoro** : minuteur concentration/pause qui continue quand tu changes de page ; chaque séance terminée est comptée dans ton temps d'étude.

Tes données sont enregistrées en ligne (Supabase) : tu les retrouves sur ton ordinateur comme sur ton téléphone, après connexion avec ton compte.

**Technologies** : React 19 + TypeScript + Vite pour l'interface, Supabase (base PostgreSQL + comptes utilisateurs), React Router pour les pages, Vitest pour les tests.

📘 **Pour comprendre comment le site est construit** (architecture, technologies, sécurité, modèle de données,
ajout d'une fonctionnalité), lis [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 1. Créer la base de données (une seule fois)

1. Crée un compte gratuit sur [supabase.com](https://supabase.com/dashboard), puis **New project**.
   Choisis un nom, un mot de passe pour la base (note-le quelque part) et la région la plus proche de chez toi.
2. Quand le projet est prêt, ouvre **SQL Editor** → **New query**, colle tout le contenu de
   [supabase/schema.sql](supabase/schema.sql) et clique sur **Run**.
   Les 4 tables (`subjects`, `flashcards`, `tasks`, `study_sessions`) apparaissent dans **Table Editor**.
3. Récupère l'adresse et la clé du projet : bouton **Connect** en haut de la page, ou **Project Settings → API Keys**.
   Il te faut la **Project URL** et la clé **publishable** (`sb_publishable_…`) — ou, sur un ancien projet, la clé **anon**.
   ⚠️ N'utilise jamais la clé *secret* / *service_role* dans le site.
4. Dans **Authentication → URL Configuration**, mets `http://localhost:5173` comme **Site URL** : c'est là que
   renvoie le lien de confirmation envoyé par email à l'inscription.
   Pour tester plus vite, tu peux aussi désactiver la confirmation par email dans
   **Authentication → Sign In / Providers → Email** (option *Confirm email*).

> Les noms des menus de Supabase peuvent légèrement changer avec le temps ; l'idée reste la même.

## 2. Lancer le site sur ton ordinateur

Dans un terminal (PowerShell), depuis le dossier du projet :

```powershell
Copy-Item .env.example .env.local
```

Ouvre `.env.local`, colle ton URL et ta clé, enregistre, puis :

```powershell
npm run dev
```

Ouvre <http://localhost:5173>, clique sur « Inscris-toi » et crée ton compte.

| Commande | À quoi elle sert |
|---|---|
| `npm run dev` | Lance le site en mode développement (il se recharge à chaque modification du code) |
| `npm test` | Lance les tests (répétition espacée, calculs de dates) |
| `npm run lint` | Cherche les erreurs courantes dans le code |
| `npm run build` | Vérifie les types et prépare la version finale dans `dist/` |

## 3. Comment le code est organisé

```
supabase/schema.sql     Tables de la base + règles de sécurité (chacun ne voit que ses données)
src/
  App.tsx               Écran de connexion et liste des pages (routes)
  index.css             Tout le style : couleurs, mode sombre automatique, version téléphone
  components/           Menu (Layout), sélecteur et étiquette de matière
  pages/                Un fichier par page : Dashboard, Subjects, Flashcards, Review, Planning, Pomodoro, Login
  pomodoro/             Le minuteur, partagé entre toutes les pages
  lib/
    supabase.ts         Connexion à Supabase
    srs.ts              Algorithme de répétition espacée (testé dans srs.test.ts)
    dates.ts            Calculs et affichage des dates
    types.ts            Forme des données de chaque table
```

## 4. La répétition espacée, en bref

Après avoir vu la réponse, tu notes la carte de 1 à 4 (aussi au clavier) :

| Note | Effet |
|---|---|
| **À revoir** | La carte repart de zéro et revient tout de suite, en fin de séance |
| **Difficile** | Elle revient plus tôt que prévu, et grandira moins vite ensuite |
| **Bien** | 1 jour, puis 6 jours, puis environ ×2,5 à chaque fois (15 j, 38 j…) |
| **Facile** | Elle revient encore plus tard |

Tu peux modifier ces réglages dans [src/lib/srs.ts](src/lib/srs.ts) ; relance `npm test` ensuite.

## 5. Mettre le site en ligne (gratuit)

1. Mets le projet sur GitHub.
2. Sur [Vercel](https://vercel.com) ou [Netlify](https://netlify.com), importe le dépôt. Commande de build : `npm run build`,
   dossier publié : `dist`.
3. Ajoute les deux variables d'environnement `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` dans les réglages
   du site.
4. Dans Supabase, **Authentication → URL Configuration** : remplace la *Site URL* par l'adresse de ton site en ligne
   (et ajoute `http://localhost:5173` dans *Redirect URLs* pour continuer à travailler en local).

Les fichiers `public/_redirects` (Netlify) et `vercel.json` (Vercel) sont déjà prêts pour que les adresses comme
`/planning` fonctionnent quand on recharge la page.

## Idées pour la suite

- Importer des flashcards depuis un fichier CSV ou depuis Anki
- Statistiques de réussite par matière
- Renommer une matière, ou changer sa couleur
- Pages de notes de cours en Markdown
- Rendre le site installable sur téléphone (PWA)
- Générer automatiquement `types.ts` avec `npx supabase gen types typescript`
