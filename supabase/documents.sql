-- Assistant IA : documents analysés et questions générées.
-- À exécuter APRÈS schema.sql, une seule fois : SQL Editor → New query → coller ce fichier → Run.

-- Documents envoyés par l'utilisateur, avec l'explication produite par l'IA
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  file_name text,
  content text not null,                       -- texte extrait du document
  question_count integer not null default 12 check (question_count between 4 and 30),
  status text not null default 'pending' check (status in ('pending', 'ready', 'error')),
  error text,
  summary text,                                -- résumé
  key_points jsonb,                            -- ["notion clé", …]
  sections jsonb,                              -- [{ "title": …, "content": … }]
  glossary jsonb,                              -- [{ "term": …, "definition": … }]
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index documents_user_idx on public.documents (user_id, created_at desc);

-- Questions générées pour un document
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  position integer not null default 0,
  kind text not null check (kind in ('qcm', 'vrai_faux', 'courte', 'trous', 'ouverte')),
  difficulty text not null default 'moyen' check (difficulty in ('facile', 'moyen', 'difficile')),
  prompt text not null,                        -- l'énoncé
  choices jsonb,                               -- propositions d'un QCM
  correct_choice integer,                      -- indice de la bonne proposition (QCM)
  answer text not null,                        -- la réponse attendue
  explanation text not null,                   -- la solution expliquée
  added_to_flashcards boolean not null default false,
  created_at timestamptz not null default now()
);
create index questions_document_idx on public.questions (document_id, position);

-- Sécurité : chacun ne voit et ne modifie que ses propres documents et questions.
alter table public.documents enable row level security;
alter table public.questions enable row level security;

create policy "Chacun gère ses documents" on public.documents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Chacun gère ses questions" on public.questions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.documents, public.questions to authenticated;
