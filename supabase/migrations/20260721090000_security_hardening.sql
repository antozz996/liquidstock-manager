-- LiquidStock Sprint 0 - deny-by-default multi-venue security hardening.
-- Production prerequisite: run the approved remediation, then require an all-PASS
-- audit/preflight_security_hardening.sql result.

begin;

-- Abort before constraints/backfills when the hosted data is incompatible.
do $$
declare
  problems text[] := array[]::text[];
begin
  if exists (select 1 from public.products where venue_id is null) then problems := array_append(problems, 'products.venue_id NULL'); end if;
  if exists (select 1 from public.events where venue_id is null) then problems := array_append(problems, 'events.venue_id NULL'); end if;
  if exists (select 1 from public.reports where venue_id is null or event_id is null) then problems := array_append(problems, 'reports missing venue/event'); end if;
  if exists (select 1 from public.restock_sessions where venue_id is null) then problems := array_append(problems, 'restock_sessions.venue_id NULL'); end if;
  if exists (select 1 from public.activity_log where venue_id is null) then problems := array_append(problems, 'activity_log.venue_id NULL'); end if;
  if exists (select 1 from public.venue_access where user_id is null or venue_id is null) then problems := array_append(problems, 'venue_access NULL key'); end if;
  if exists (select 1 from public.venue_access group by user_id, venue_id having count(*) > 1) then problems := array_append(problems, 'venue_access duplicate pair'); end if;
  if exists (select 1 from public.restock_log where product_id is null) then problems := array_append(problems, 'restock_log.product_id NULL'); end if;
  if exists (select 1 from public.event_stocks where event_id is null or product_id is null) then problems := array_append(problems, 'event_stocks missing parent'); end if;
  if exists (select 1 from public.restock_items where session_id is null or product_id is null) then problems := array_append(problems, 'restock_items missing parent'); end if;
  if exists (select 1 from public.report_edit_log where report_id is null) then problems := array_append(problems, 'report_edit_log.report_id NULL'); end if;
  if exists (select 1 from public.profiles where role is null or role not in ('staff','admin','super_admin','osservatore')) then problems := array_append(problems, 'invalid profile role'); end if;
  if exists (
    select 1 from public.configs c
    left join public.venues v on v.id=c.venue_id
    where c.key='registration_code' and (c.venue_id is null or v.id is null)
  ) then problems := array_append(problems, 'registration_code invalid venue'); end if;
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid='public.configs'::regclass
      and c.contype in ('p','u')
      and (
        select array_agg(a.attname order by key_position.ordinality)
        from unnest(c.conkey) with ordinality key_position(attnum,ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid=c.conrelid and a.attnum=key_position.attnum
      ) = array['key','venue_id']::name[]
  ) then problems := array_append(problems, 'configs missing unique (key, venue_id)'); end if;
  if exists (
    select 1 from public.event_stocks es
    join public.events e on e.id=es.event_id join public.products p on p.id=es.product_id
    where e.venue_id is distinct from p.venue_id
  ) then problems := array_append(problems, 'event_stocks cross venue'); end if;
  if exists (
    select 1 from public.restock_items ri
    join public.restock_sessions rs on rs.id=ri.session_id join public.products p on p.id=ri.product_id
    where rs.venue_id is distinct from p.venue_id
  ) then problems := array_append(problems, 'restock_items cross venue'); end if;
  if exists (
    select 1 from public.reports r join public.events e on e.id=r.event_id
    where r.venue_id is distinct from e.venue_id
  ) then problems := array_append(problems, 'reports cross venue'); end if;
  if array_length(problems, 1) is not null then
    raise exception 'SECURITY_HARDENING_PREFLIGHT_FAILED: %', array_to_string(problems, ', ');
  end if;
end $$;

-- Invalidate every venue-scoped legacy signup code. Multiple rows are valid;
-- values stay hash-like random markers and are never returned to the client.
update public.configs
set value='disabled:'||encode(extensions.gen_random_bytes(32),'hex'),
    updated_at=timezone('utc',now())
where key='registration_code'
  and value !~ '^disabled:[0-9a-f]{64}$';

alter table public.products alter column venue_id set not null;
alter table public.events alter column venue_id set not null;
alter table public.reports alter column venue_id set not null;
alter table public.reports alter column event_id set not null;
alter table public.restock_sessions alter column venue_id set not null;
alter table public.activity_log alter column venue_id set not null;
alter table public.venue_access alter column user_id set not null;
alter table public.venue_access alter column venue_id set not null;
alter table public.event_stocks alter column event_id set not null;
alter table public.event_stocks alter column product_id set not null;
alter table public.restock_items alter column session_id set not null;
alter table public.restock_items alter column product_id set not null;
alter table public.restock_log alter column product_id set not null;
alter table public.report_edit_log alter column report_id set not null;

alter table public.restock_log add column if not exists venue_id uuid;
update public.restock_log rl set venue_id = p.venue_id
from public.products p where p.id = rl.product_id and rl.venue_id is null;
alter table public.restock_log alter column venue_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='restock_log_venue_id_fkey' and conrelid='public.restock_log'::regclass) then
    alter table public.restock_log add constraint restock_log_venue_id_fkey foreign key (venue_id) references public.venues(id) on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_role_check' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_role_check check (role in ('staff','admin','super_admin','osservatore'));
  end if;
end $$;

create index if not exists idx_products_venue_id on public.products(venue_id);
create index if not exists idx_events_venue_id on public.events(venue_id);
create index if not exists idx_reports_venue_id on public.reports(venue_id);
create index if not exists idx_restock_sessions_venue_id on public.restock_sessions(venue_id);
create index if not exists idx_activity_log_venue_id on public.activity_log(venue_id);
create index if not exists idx_restock_log_venue_id on public.restock_log(venue_id);
create index if not exists idx_event_stocks_event_id on public.event_stocks(event_id);
create index if not exists idx_restock_items_session_id on public.restock_items(session_id);

create table if not exists public.registration_invites (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or revoked_at is null)
);
alter table public.registration_invites add column if not exists reservation_id uuid;
alter table public.registration_invites add column if not exists reserved_at timestamptz;
alter table public.registration_invites add column if not exists reservation_expires_at timestamptz;
create index if not exists idx_registration_invites_venue_active
  on public.registration_invites(venue_id, expires_at)
  where used_at is null and revoked_at is null;
create unique index if not exists idx_registration_invites_reservation
  on public.registration_invites(reservation_id) where reservation_id is not null;

create table if not exists public.registration_rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null check (bucket in ('ip','email','token')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default now()
);
create index if not exists idx_registration_rate_limits_lookup
  on public.registration_rate_limits(bucket,key_hash,attempted_at desc);

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = auth.uid() $$;

create or replace function public.check_is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_user_role() = 'super_admin', false) $$;

create or replace function public.has_venue_access(target_venue_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.venue_access va
    where va.user_id = auth.uid() and va.venue_id = target_venue_id
  )
$$;

create or replace function public.can_access_venue(target_venue_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.check_is_super_admin() or public.has_venue_access(target_venue_id) $$;

create or replace function public.can_manage_venue(target_venue_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.check_is_super_admin()
    or (public.current_user_role() = 'admin' and public.has_venue_access(target_venue_id))
$$;

create or replace function public.can_write_venue(target_venue_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.check_is_super_admin()
    or (public.current_user_role() in ('admin','staff') and public.has_venue_access(target_venue_id))
$$;

create or replace function public.create_registration_invite_record(
  p_user_id uuid,
  p_venue_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
) returns table(id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare caller_role text;
begin
  select p.role into caller_role from public.profiles p where p.id=p_user_id;
  if caller_role is null or not (
    caller_role='super_admin' or (
      caller_role='admin' and exists (
        select 1 from public.venue_access va where va.user_id=p_user_id and va.venue_id=p_venue_id
      )
    )
  ) then raise exception 'invite_creation_forbidden'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at <= now() or p_expires_at > now()+interval '7 days' then
    raise exception 'invalid_invite_parameters';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('invite-create:'||p_user_id::text,0));
  if (select count(*) from public.registration_invites ri where ri.created_by=p_user_id and ri.created_at > now()-interval '1 hour') >= 20 then
    raise exception 'invite_creation_rate_limited';
  end if;
  return query insert into public.registration_invites(venue_id,token_hash,expires_at,created_by)
    values(p_venue_id,p_token_hash,p_expires_at,p_user_id)
    returning registration_invites.id,registration_invites.expires_at;
end $$;

create or replace function public.revoke_registration_invite_record(
  p_user_id uuid,
  p_venue_id uuid,
  p_invite_id uuid
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare caller_role text;
begin
  select p.role into caller_role from public.profiles p where p.id=p_user_id;
  if caller_role is null or not (
    caller_role='super_admin' or (
      caller_role='admin' and exists (
        select 1 from public.venue_access va where va.user_id=p_user_id and va.venue_id=p_venue_id
      )
    )
  ) then raise exception 'invite_revocation_forbidden'; end if;
  update public.registration_invites set revoked_at=now(),reservation_id=null,reserved_at=null,reservation_expires_at=null
  where id=p_invite_id and venue_id=p_venue_id and used_at is null and revoked_at is null;
  return found;
end $$;

create or replace function public.enforce_registration_rate_limit(
  p_ip_hash text,
  p_email_hash text,
  p_token_hash text
) returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_key';
  end if;
  -- Fixed lock order makes the count+insert decision safe under concurrent attempts.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('registration-ip:'||p_ip_hash,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('registration-email:'||p_email_hash,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('registration-token:'||p_token_hash,0));
  delete from public.registration_rate_limits where attempted_at < now()-interval '24 hours';
  if (select count(*) from public.registration_rate_limits where bucket='ip' and key_hash=p_ip_hash and attempted_at>now()-interval '15 minutes') >= 60
     or (select count(*) from public.registration_rate_limits where bucket='email' and key_hash=p_email_hash and attempted_at>now()-interval '15 minutes') >= 5
     or (select count(*) from public.registration_rate_limits where bucket='token' and key_hash=p_token_hash and attempted_at>now()-interval '15 minutes') >= 5 then
    raise exception 'registration_rate_limited';
  end if;
  insert into public.registration_rate_limits(bucket,key_hash) values
    ('ip',p_ip_hash),('email',p_email_hash),('token',p_token_hash);
  return true;
end $$;

create or replace function public.begin_registration_invite(p_token_hash text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare invite public.registration_invites%rowtype; new_reservation uuid:=gen_random_uuid();
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'registration_unavailable'; end if;
  select * into invite from public.registration_invites where token_hash=p_token_hash for update;
  if invite.id is null or invite.used_at is not null or invite.revoked_at is not null or invite.expires_at<=now()
     or (invite.reservation_id is not null and invite.reservation_expires_at>now()) then
    raise exception 'registration_unavailable';
  end if;
  update public.registration_invites set reservation_id=new_reservation,reserved_at=now(),reservation_expires_at=now()+interval '5 minutes'
  where id=invite.id;
  return new_reservation;
end $$;

create or replace function public.release_registration_reservation(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  update public.registration_invites set reservation_id=null,reserved_at=null,reservation_expires_at=null
  where reservation_id=p_reservation_id and used_at is null;
  return found;
end $$;

create or replace function public.get_my_accessible_venues()
returns table(id uuid, name text, address text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.name, v.address, v.created_at
  from public.venues v
  where public.check_is_super_admin()
     or exists (select 1 from public.venue_access va where va.user_id=auth.uid() and va.venue_id=v.id)
  order by v.name
$$;

create or replace function public.remove_user_from_venue(p_user_id uuid, p_venue_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare target_role text;
begin
  if auth.uid() is null or auth.uid()=p_user_id or not public.can_manage_venue(p_venue_id) then
    raise exception 'venue_user_removal_forbidden';
  end if;
  select role into target_role from public.profiles where id=p_user_id;
  if target_role in ('admin','super_admin') and not public.check_is_super_admin() then
    raise exception 'cannot_remove_privileged_user';
  end if;
  delete from public.venue_access where user_id=p_user_id and venue_id=p_venue_id;
  return found;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare reservation uuid; invite public.registration_invites%rowtype;
begin
  begin reservation:=nullif(new.raw_user_meta_data->>'registration_attempt_id','')::uuid;
  exception when others then raise exception 'invalid_registration_reservation'; end;
  if reservation is not null then
    select * into invite from public.registration_invites
      where reservation_id=reservation for update;
    if invite.id is null or invite.used_at is not null or invite.revoked_at is not null
       or invite.expires_at<=now() or invite.reservation_expires_at<=now() then
      raise exception 'invalid_registration_reservation';
    end if;
    insert into public.profiles(id,role,venue_id,full_name)
      values(new.id,'staff',invite.venue_id,nullif(trim(new.raw_user_meta_data->>'full_name'),''));
    insert into public.venue_access(user_id,venue_id) values(new.id,invite.venue_id);
    update public.registration_invites set used_at=now(),used_by=new.id,reservation_id=null,reserved_at=null,reservation_expires_at=null
      where id=invite.id;
  else
    insert into public.profiles(id,role,venue_id,full_name)
      values(new.id,'staff',null,nullif(trim(new.raw_user_meta_data->>'full_name'),''))
    on conflict(id) do update set
      full_name=coalesce(excluded.full_name,public.profiles.full_name),
      role=case when public.profiles.role in ('staff','admin','super_admin','osservatore') then public.profiles.role else 'staff' end;
  end if;
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)
    -'registration_attempt_id'-'registration_code'-'role'-'venue'-'venue_id'
    where id=new.id;
  return new;
end $$;

create or replace function public.strip_untrusted_auth_metadata()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.raw_user_meta_data=coalesce(new.raw_user_meta_data,'{}'::jsonb)
    -'registration_attempt_id'-'registration_code'-'role'-'venue'-'venue_id';
  return new;
end $$;

create or replace function public.handle_user_delete()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.users where id=old.id;
  return old;
end $$;

create or replace function public.sync_name_to_auth_metadata()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update auth.users set raw_user_meta_data=
    coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name',new.full_name)
  where id=new.id;
  return new;
end $$;

drop function if exists public.consume_registration_invite(text,uuid,text);

create or replace function public.enforce_profile_update_security()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.check_is_super_admin() then return new; end if;
  if auth.uid() <> old.id then raise exception 'profile_update_forbidden'; end if;
  if new.id is distinct from old.id or new.role is distinct from old.role or new.venue_id is distinct from old.venue_id then
    raise exception 'role_and_venue_are_server_managed';
  end if;
  return new;
end $$;

create or replace function public.enforce_product_update_security()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_user_role() in ('admin','super_admin') then return new; end if;
  if public.current_user_role() <> 'staff' then raise exception 'product_update_forbidden'; end if;
  if new.id is distinct from old.id or new.name is distinct from old.name or new.category is distinct from old.category
     or new.unit is distinct from old.unit or new.cost_price is distinct from old.cost_price
     or new.selling_price is distinct from old.selling_price or new.min_threshold is distinct from old.min_threshold
     or new.created_at is distinct from old.created_at or new.is_active is distinct from old.is_active
     or new.venue_id is distinct from old.venue_id then
    raise exception 'staff_can_only_update_stock';
  end if;
  return new;
end $$;

create or replace function public.enforce_child_venue_security()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare parent_venue uuid; product_venue uuid;
begin
  if tg_table_name='event_stocks' then
    select venue_id into parent_venue from public.events where id=new.event_id;
  else
    select venue_id into parent_venue from public.restock_sessions where id=new.session_id;
  end if;
  select venue_id into product_venue from public.products where id=new.product_id;
  if parent_venue is null or product_venue is null or parent_venue <> product_venue then
    raise exception 'cross_venue_child_reference';
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
drop trigger if exists trg_strip_untrusted_auth_metadata on auth.users;
create trigger trg_strip_untrusted_auth_metadata before update of raw_user_meta_data on auth.users
for each row execute function public.strip_untrusted_auth_metadata();
drop trigger if exists trg_enforce_profile_update_security on public.profiles;
create trigger trg_enforce_profile_update_security before update on public.profiles
for each row execute function public.enforce_profile_update_security();
drop trigger if exists trg_enforce_product_update_security on public.products;
create trigger trg_enforce_product_update_security before update on public.products
for each row execute function public.enforce_product_update_security();
drop trigger if exists trg_event_stocks_same_venue on public.event_stocks;
create trigger trg_event_stocks_same_venue before insert or update on public.event_stocks
for each row execute function public.enforce_child_venue_security();
drop trigger if exists trg_restock_items_same_venue on public.restock_items;
create trigger trg_restock_items_same_venue before insert or update on public.restock_items
for each row execute function public.enforce_child_venue_security();

-- Remove every legacy permissive policy, including all USING (true) policies.
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public'
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

alter table public.activity_log enable row level security;
alter table public.configs enable row level security;
alter table public.event_stocks enable row level security;
alter table public.events enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.report_edit_log enable row level security;
alter table public.reports enable row level security;
alter table public.restock_items enable row level security;
alter table public.restock_log enable row level security;
alter table public.restock_sessions enable row level security;
alter table public.venue_access enable row level security;
alter table public.venues enable row level security;
alter table public.registration_invites enable row level security;
alter table public.registration_rate_limits enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (
  id=auth.uid()
  or public.check_is_super_admin()
  or public.has_venue_access(venue_id)
  or exists (
    select 1 from public.venue_access team_access
    where team_access.user_id=profiles.id
      and public.can_manage_venue(team_access.venue_id)
  )
);
create policy profiles_update_self_or_super on public.profiles for update to authenticated
using (id=auth.uid() or public.check_is_super_admin())
with check (id=auth.uid() or public.check_is_super_admin());
create policy profiles_delete_super on public.profiles for delete to authenticated
using (public.check_is_super_admin());

create policy venue_access_select on public.venue_access for select to authenticated
using (user_id=auth.uid() or public.check_is_super_admin() or public.can_manage_venue(venue_id));
create policy venue_access_insert_super on public.venue_access for insert to authenticated
with check (public.check_is_super_admin());
create policy venue_access_delete_super on public.venue_access for delete to authenticated
using (public.check_is_super_admin());

create policy venues_select on public.venues for select to authenticated
using (public.can_access_venue(id));
create policy venues_insert_super on public.venues for insert to authenticated
with check (public.check_is_super_admin());
create policy venues_update_super on public.venues for update to authenticated
using (public.check_is_super_admin()) with check (public.check_is_super_admin());
create policy venues_delete_super on public.venues for delete to authenticated
using (public.check_is_super_admin());

create policy products_select on public.products for select to authenticated using (public.can_access_venue(venue_id));
create policy products_insert on public.products for insert to authenticated with check (public.can_manage_venue(venue_id));
create policy products_update on public.products for update to authenticated using (public.can_write_venue(venue_id)) with check (public.can_write_venue(venue_id));
create policy products_delete on public.products for delete to authenticated using (public.can_manage_venue(venue_id));

create policy events_select on public.events for select to authenticated using (public.can_access_venue(venue_id));
create policy events_insert on public.events for insert to authenticated with check (public.can_write_venue(venue_id));
create policy events_update on public.events for update to authenticated using (public.can_write_venue(venue_id)) with check (public.can_write_venue(venue_id));
create policy events_delete on public.events for delete to authenticated using (public.can_manage_venue(venue_id));

create policy event_stocks_select on public.event_stocks for select to authenticated using (
  exists (select 1 from public.events e where e.id=event_id and public.can_access_venue(e.venue_id))
);
create policy event_stocks_insert on public.event_stocks for insert to authenticated with check (
  exists (select 1 from public.events e where e.id=event_id and public.can_write_venue(e.venue_id))
);
create policy event_stocks_update on public.event_stocks for update to authenticated using (
  exists (select 1 from public.events e where e.id=event_id and public.can_write_venue(e.venue_id))
) with check (exists (select 1 from public.events e where e.id=event_id and public.can_write_venue(e.venue_id)));
create policy event_stocks_delete on public.event_stocks for delete to authenticated using (
  exists (select 1 from public.events e where e.id=event_id and public.can_manage_venue(e.venue_id))
);

create policy reports_select on public.reports for select to authenticated using (public.can_access_venue(venue_id));
create policy reports_insert on public.reports for insert to authenticated with check (public.can_write_venue(venue_id));
create policy reports_update on public.reports for update to authenticated using (public.can_manage_venue(venue_id)) with check (public.can_manage_venue(venue_id));
create policy reports_delete on public.reports for delete to authenticated using (public.can_manage_venue(venue_id));

create policy report_edit_log_select on public.report_edit_log for select to authenticated using (
  exists (select 1 from public.reports r where r.id=report_id and public.can_access_venue(r.venue_id))
);
create policy report_edit_log_insert on public.report_edit_log for insert to authenticated with check (
  exists (select 1 from public.reports r where r.id=report_id and public.can_manage_venue(r.venue_id))
);

create policy restock_sessions_select on public.restock_sessions for select to authenticated using (public.can_access_venue(venue_id));
create policy restock_sessions_insert on public.restock_sessions for insert to authenticated with check (public.can_write_venue(venue_id));
create policy restock_sessions_update on public.restock_sessions for update to authenticated using (public.can_write_venue(venue_id)) with check (public.can_write_venue(venue_id));
create policy restock_sessions_delete on public.restock_sessions for delete to authenticated using (public.can_manage_venue(venue_id));

create policy restock_items_select on public.restock_items for select to authenticated using (
  exists (select 1 from public.restock_sessions rs where rs.id=session_id and public.can_access_venue(rs.venue_id))
);
create policy restock_items_insert on public.restock_items for insert to authenticated with check (
  exists (select 1 from public.restock_sessions rs where rs.id=session_id and public.can_write_venue(rs.venue_id))
);
create policy restock_items_update on public.restock_items for update to authenticated using (
  exists (select 1 from public.restock_sessions rs where rs.id=session_id and public.can_write_venue(rs.venue_id))
) with check (exists (select 1 from public.restock_sessions rs where rs.id=session_id and public.can_write_venue(rs.venue_id)));
create policy restock_items_delete on public.restock_items for delete to authenticated using (
  exists (select 1 from public.restock_sessions rs where rs.id=session_id and public.can_manage_venue(rs.venue_id))
);

create policy restock_log_select on public.restock_log for select to authenticated using (public.can_access_venue(venue_id));
create policy restock_log_insert on public.restock_log for insert to authenticated with check (
  public.can_write_venue(venue_id) and exists (select 1 from public.products p where p.id=product_id and p.venue_id=venue_id)
);

create policy activity_log_select on public.activity_log for select to authenticated using (public.can_access_venue(venue_id));
create policy activity_log_insert on public.activity_log for insert to authenticated with check (
  public.can_write_venue(venue_id) and (user_id is null or user_id=auth.uid())
);
create policy activity_log_update on public.activity_log for update to authenticated using (public.can_manage_venue(venue_id)) with check (public.can_manage_venue(venue_id));

-- Explicit ACL: anonymous users receive no application data or executable helpers.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from public, anon;
revoke all on public.configs, public.registration_invites from authenticated;
revoke all on all functions in schema public from authenticated;

grant select on public.profiles, public.venue_access, public.venues, public.products, public.events,
  public.event_stocks, public.reports, public.report_edit_log, public.restock_sessions,
  public.restock_items, public.restock_log, public.activity_log to authenticated;
grant update, delete on public.profiles to authenticated;
grant insert, update, delete on public.venue_access, public.venues, public.products, public.events,
  public.event_stocks, public.reports, public.restock_sessions, public.restock_items to authenticated;
grant insert on public.report_edit_log, public.restock_log, public.activity_log to authenticated;
grant update on public.activity_log to authenticated;
grant usage on all sequences in schema public to authenticated;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.check_is_super_admin() to authenticated;
grant execute on function public.has_venue_access(uuid) to authenticated;
grant execute on function public.can_access_venue(uuid) to authenticated;
grant execute on function public.can_manage_venue(uuid) to authenticated;
grant execute on function public.can_write_venue(uuid) to authenticated;
grant execute on function public.get_my_accessible_venues() to authenticated;
grant execute on function public.remove_user_from_venue(uuid,uuid) to authenticated;
grant execute on function public.create_registration_invite_record(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.revoke_registration_invite_record(uuid,uuid,uuid) to service_role;
grant execute on function public.enforce_registration_rate_limit(text,text,text) to service_role;
grant execute on function public.begin_registration_invite(text) to service_role;
grant execute on function public.release_registration_reservation(uuid) to service_role;

grant all on public.registration_invites to service_role;
grant all on public.registration_rate_limits to service_role;

commit;
