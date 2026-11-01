-- Schéma de la base de données « Mes révisions ».
-- À exécuter une seule fois dans Supabase : SQL Editor → New query → coller ce fichier → Run.

-- Matières (ex. : Mathématiques, Histoire…)
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#2a78d6',
  created_at timestamptz not null default now()
);
create index subjects_user_idx on public.subjects (user_id);

-- Flashcards, avec leur état de répétition espacée (voir src/lib/srs.ts)
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  front text not null,
  back text not null,
  repetitions integer not null default 0,
  interval_days integer not null default 0,
  ease real not null default 2.5,
  due_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index flashcards_user_due_idx on public.flashcards (user_id, due_date);

-- Tâches du planning de révision
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_user_idx on public.tasks (user_id);

-- Séances Pomodoro terminées (pour mesurer le temps d'étude)
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  minutes integer not null check (minutes > 0),
  completed_at timestamptz not null default now()
);
create index study_sessions_user_date_idx on public.study_sessions (user_id, completed_at);

-- Sécurité (Row Level Security) : chaque utilisateur ne voit et ne modifie que ses propres données.
alter table public.subjects enable row level security;
alter table public.flashcards enable row level security;
alter table public.tasks enable row level security;
alter table public.study_sessions enable row level security;

create policy "Chacun gère ses matières" on public.subjects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Chacun gère ses flashcards" on public.flashcards
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Chacun gère ses tâches" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Chacun gère ses séances" on public.study_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.subjects, public.flashcards, public.tasks, public.study_sessions
  to authenticated;
