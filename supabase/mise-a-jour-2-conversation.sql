-- Mise à jour n° 2 : conversation avec l'IA sur chaque document.
-- À exécuter UNE fois si tu avais déjà exécuté documents.sql avant cette mise à jour :
-- SQL Editor → New query → coller ce fichier → Run. Sans danger si elle a déjà été appliquée.

create table if not exists public.document_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists document_messages_document_idx on public.document_messages (document_id, created_at);

alter table public.document_messages enable row level security;

drop policy if exists "Chacun gère ses messages" on public.document_messages;
create policy "Chacun gère ses messages" on public.document_messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.document_messages to authenticated;
