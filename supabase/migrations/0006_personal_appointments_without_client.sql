-- RDV perso hors fichier clientes
-- À exécuter dans Supabase > SQL Editor après 0005_service_counts_in_stats.sql.
--
-- Un RDV composé uniquement de prestations hors statistiques (ex. « Perso ») n'est
-- plus rattaché à une cliente : son nom (« RDV coiffeur »…) reste sur le RDV mais
-- ne crée plus de fiche cliente. Un RDV dont la cliente a été supprimée reste lui
-- aussi détaché quand on le modifie sans changer le nom.

-- ---------------------------------------------------------------------------
-- save_appointment : même fonction que dans 0002, sans cliente pour un RDV perso
-- ---------------------------------------------------------------------------

create or replace function public.save_appointment(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(payload->>'id', '')::uuid;
  v_client_id uuid := nullif(payload->>'client_id', '')::uuid;
  v_client_name text := btrim(payload->>'client_name');
  v_instagram text := nullif(btrim(coalesce(payload->>'instagram', '')), '');
  v_service_ids uuid[] := coalesce(
    (select array_agg(value::uuid) from jsonb_array_elements_text(payload->'service_ids')),
    '{}'
  );
  v_supplement numeric := coalesce(nullif(payload->>'supplement', '')::numeric, 0);
  -- RDV perso : au moins une prestation, et aucune qui compte dans les stats
  v_personal boolean := cardinality(v_service_ids) > 0
    and not exists (select 1 from services where id = any(v_service_ids) and counts_in_stats);
begin
  if v_client_name is null or v_client_name = '' then
    raise exception 'client_name requis';
  end if;

  if v_personal then
    v_client_id := null;
  else
    -- Cliente : on réutilise celle qui porte ce nom, sinon on la crée
    if v_client_id is null then
      select id into v_client_id from clients where lower(name) = lower(v_client_name);
    end if;
    if v_client_id is null then
      -- Sauf pour un RDV déjà détaché (cliente supprimée) dont le nom n'a pas changé
      if v_id is null or not exists (
        select 1 from appointments
        where id = v_id and client_id is null and lower(client_name) = lower(v_client_name)
      ) then
        insert into clients (name, instagram) values (v_client_name, v_instagram)
        returning id into v_client_id;
      end if;
    elsif v_instagram is not null then
      update clients set instagram = v_instagram where id = v_client_id;
    end if;
  end if;

  if v_id is null then
    insert into appointments (client_id, client_name, start_at, end_at, status_id, payment_method_id, custom_price, supplement, notes)
    values (
      v_client_id, v_client_name,
      (payload->>'start_at')::timestamptz, (payload->>'end_at')::timestamptz,
      nullif(payload->>'status_id', '')::uuid,
      nullif(payload->>'payment_method_id', '')::uuid,
      nullif(payload->>'custom_price', '')::numeric,
      v_supplement,
      nullif(payload->>'notes', '')
    )
    returning id into v_id;
  else
    update appointments set
      client_id = v_client_id,
      client_name = v_client_name,
      start_at = (payload->>'start_at')::timestamptz,
      end_at = (payload->>'end_at')::timestamptz,
      status_id = nullif(payload->>'status_id', '')::uuid,
      payment_method_id = nullif(payload->>'payment_method_id', '')::uuid,
      custom_price = nullif(payload->>'custom_price', '')::numeric,
      supplement = v_supplement,
      notes = nullif(payload->>'notes', ''),
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'rdv introuvable';
    end if;
  end if;

  -- Prestations : on garde le prix figé de celles déjà présentes,
  -- on prend le prix courant pour les nouvelles.
  delete from appointment_services
  where appointment_id = v_id and service_id <> all(v_service_ids);

  insert into appointment_services (appointment_id, service_id, price, position)
  select v_id, s.id, s.price, ord.pos - 1
  from unnest(v_service_ids) with ordinality as ord(sid, pos)
  join services s on s.id = ord.sid
  on conflict (appointment_id, service_id) do update set position = excluded.position;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nettoyage des RDV perso déjà saisis
-- ---------------------------------------------------------------------------

create temporary table personal_appointments as
select a.id, a.client_id
from appointments a
where a.client_id is not null
  and exists (select 1 from appointment_services x where x.appointment_id = a.id)
  and not exists (
    select 1 from appointment_services x join services s on s.id = x.service_id
    where x.appointment_id = a.id and s.counts_in_stats
  );

-- Fiches créées uniquement par des RDV perso (« RDV coiffeur »…) : supprimées
delete from clients c
where c.id in (select client_id from personal_appointments)
  and not exists (
    select 1 from appointments a
    where a.client_id = c.id and a.id not in (select id from personal_appointments)
  );

-- Les autres RDV perso sont détachés de leur cliente
update appointments set client_id = null
where id in (select id from personal_appointments) and client_id is not null;

drop table personal_appointments;
