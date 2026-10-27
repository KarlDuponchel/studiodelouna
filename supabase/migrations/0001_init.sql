-- Studio de Louna : schéma initial
-- À exécuter dans Supabase > SQL Editor (ou via `supabase db push`).
--
-- Sécurité : chaque ligne porte user_id = auth.uid() et les règles RLS
-- n'exposent une ligne qu'à son propriétaire. Les inscriptions sont désactivées
-- côté Supabase (Auth > Sign In / Providers > "Allow new users to sign up" = off)
-- et le compte unique est créé à la main dans le dashboard.

-- ---------------------------------------------------------------------------
-- Tables de paramétrage
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0 check (price >= 0),
  duration_min integer check (duration_min is null or duration_min > 0),
  color text not null default '#b4566e',
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  color text not null default '#8a8a8a',
  counts_in_revenue boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.days_off (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  start_date date not null,
  end_date date not null,
  label text not null default 'Fermé',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Clientes (enregistrées automatiquement à la première saisie)
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  instagram text,
  created_at timestamptz not null default now()
);

create unique index clients_user_name_key on public.clients (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- Rendez-vous
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  client_id uuid references public.clients on delete set null,
  client_name text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status_id uuid references public.statuses on delete restrict,
  payment_method_id uuid references public.payment_methods on delete restrict,
  custom_price numeric(10,2) check (custom_price is null or custom_price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index appointments_user_start_idx on public.appointments (user_id, start_at);

-- Prestations d'un RDV, avec le prix figé au moment de la saisie
create table public.appointment_services (
  appointment_id uuid not null references public.appointments on delete cascade,
  service_id uuid not null references public.services on delete restrict,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  price numeric(10,2) not null check (price >= 0),
  position integer not null default 0,
  primary key (appointment_id, service_id)
);

-- ---------------------------------------------------------------------------
-- RLS : chaque table n'est visible que par son propriétaire
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['services','statuses','payment_methods','days_off','clients','appointments','appointment_services']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Valeurs par défaut (appelé par l'app à la première connexion)
-- ---------------------------------------------------------------------------

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
    insert into statuses (name, color, counts_in_revenue, is_default, sort_order) values
      ('Prévu',   '#6b8fd6', true,  true,  0),
      ('Réalisé', '#4f9d6e', true,  false, 1),
      ('Annulé',  '#9a9a9a', false, false, 2),
      ('Absente', '#d0703c', false, false, 3);
  end if;

  if not exists (select 1 from payment_methods) then
    insert into payment_methods (name, sort_order) values
      ('CB', 0), ('Espèces', 1), ('Virement', 2);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enregistrement atomique d'un RDV (+ cliente + prestations)
-- payload : {
--   id?, client_id?, client_name, instagram?, start_at, end_at, status_id,
--   payment_method_id?, custom_price?, notes?, service_ids: uuid[]
-- }
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
    insert into appointments (client_id, client_name, start_at, end_at, status_id, payment_method_id, custom_price, notes)
    values (
      v_client_id, v_client_name,
      (payload->>'start_at')::timestamptz, (payload->>'end_at')::timestamptz,
      nullif(payload->>'status_id', '')::uuid,
      nullif(payload->>'payment_method_id', '')::uuid,
      nullif(payload->>'custom_price', '')::numeric,
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
-- Ping pour le maintien en éveil (projet gratuit mis en pause après 7 j)
-- Appelé chaque jour par .github/workflows/keepalive.yml
-- ---------------------------------------------------------------------------

create or replace function public.ping()
returns timestamptz
language sql
stable
as $$ select now() $$;

revoke execute on function public.ensure_defaults() from anon, public;
revoke execute on function public.save_appointment(jsonb) from anon, public;
grant execute on function public.ensure_defaults() to authenticated;
grant execute on function public.save_appointment(jsonb) to authenticated;
grant execute on function public.ping() to anon, authenticated;
