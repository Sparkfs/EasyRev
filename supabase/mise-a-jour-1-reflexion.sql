-- Mise à jour n° 1 : niveau de réflexion de l'IA choisi pour chaque document.
-- À exécuter UNE fois si tu avais déjà exécuté documents.sql avant cette mise à jour :
-- SQL Editor → New query → coller ce fichier → Run. Sans danger si la colonne existe déjà.

alter table public.documents
  add column if not exists reasoning_effort text
  check (reasoning_effort in ('low', 'medium', 'high'));
