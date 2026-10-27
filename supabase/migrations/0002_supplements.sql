-- Suppléments
-- À exécuter dans Supabase > SQL Editor après 0001_init.sql.
--
-- services.supplement_step : montant d'un pas de supplément pour cette pose.
--   La clôture rapide propose 1× et 2× ce montant, puis ±1 € pour ajuster.
-- appointments.supplement : montant des suppléments facturés, ajouté au total du RDV.

alter table public.services
  add column supplement_step numeric(10,2) check (supplement_step is null or supplement_step > 0);

alter table public.appointments
  add column supplement numeric(10,2) not null default 0 check (supplement >= 0);

-- ---------------------------------------------------------------------------
-- save_appointment : même fonction que dans 0001, avec le champ `supplement`
-- payload : { ..., supplement?: number }
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
begin
  if v_client_name is null or v_client_name = '' then
    raise exception 'client_name requis';
  end if;

  -- Cliente : on réutilise celle qui porte ce nom, sinon on la crée
  if v_client_id is null then
    select id into v_client_id from clients where lower(name) = lower(v_client_name);
  end if;
  if v_client_id is null then
    insert into clients (name, instagram) values (v_client_name, v_instagram)
    returning id into v_client_id;
  elsif v_instagram is not null then
    update clients set instagram = v_instagram where id = v_client_id;
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
