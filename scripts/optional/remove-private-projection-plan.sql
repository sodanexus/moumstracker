-- Nettoyage OPTIONNEL de l’ancien plan patrimonial privé abandonné.
-- Ce script n’est jamais exécuté par Moobank.
-- Il ne touche ni aux comptes, ni aux positions, ni aux transactions,
-- ni aux prélèvements, ni aux objectifs, ni à l’historique patrimonial.

BEGIN;

DROP TABLE IF EXISTS public.private_projection_plan;
DROP FUNCTION IF EXISTS public.set_private_projection_plan_updated_at();

COMMIT;
