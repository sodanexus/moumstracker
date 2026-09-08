-- Moobank 2.5 — ajoute des libellés de livrets sans modifier les comptes existants.
-- À exécuter une seule fois dans l'éditeur SQL Supabase de la base existante.

BEGIN;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_type_check CHECK (type IN (
    'PEA', 'CTO', 'PEE', 'PER', 'AV', 'Crypto',
    'Livret', 'Livret A', 'LDDS', 'Autre livret',
    'Immo', 'Autre'
  ));

COMMIT;
