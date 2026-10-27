-- Prestations hors statistiques
-- À exécuter dans Supabase > SQL Editor après 0004_require_mfa.sql.
--
-- services.counts_in_stats : décoché pour une prestation qui n'est pas du travail
-- facturé (ex. « Perso » à 0 €). Un RDV composé uniquement de ces prestations
-- n'apparaît ni dans les statistiques, ni dans le tableau mensuel, ni dans les
-- compteurs de l'accueil et des fiches clientes.
-- L'app tolère l'absence de la colonne : on peut l'exécuter avant ou après le déploiement.

alter table public.services
  add column counts_in_stats boolean not null default true;

update public.services set counts_in_stats = false where lower(btrim(name)) = 'perso';
