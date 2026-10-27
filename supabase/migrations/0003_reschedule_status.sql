-- Statuts qui reprogramment
-- À exécuter dans Supabase > SQL Editor après 0002_supplements.sql.
--
-- statuses.reschedule : sur l'accueil, ce statut ouvre la reprogrammation du RDV
-- (nouvelle date, retour au statut par défaut) au lieu de le clôturer.

alter table public.statuses
  add column reschedule boolean not null default false;

update public.statuses set reschedule = true where lower(name) like 'absen%';

-- ensure_defaults : même fonction que dans 0001, « Absente » reprogramme par défaut
create or replace function public.ensure_defaults()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from statuses) then
    insert into statuses (name, color, counts_in_revenue, is_default, reschedule, sort_order) values
      ('Prévu',   '#6b8fd6', true,  true,  false, 0),
      ('Réalisé', '#4f9d6e', true,  false, false, 1),
      ('Annulé',  '#9a9a9a', false, false, false, 2),
      ('Absente', '#d0703c', false, false, true,  3);
  end if;

  if not exists (select 1 from payment_methods) then
    insert into payment_methods (name, sort_order) values
      ('CB', 0), ('Espèces', 1), ('Virement', 2);
  end if;
end;
$$;
