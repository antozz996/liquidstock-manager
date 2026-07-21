-- Remediation for the three approved production preflight blockers only.
-- Run in maintenance mode immediately before the Sprint 0 migration.
-- No config value is returned or logged.

\set ON_ERROR_STOP on

-- Initial preview: counts and identifiers only, no names, emails or secrets.
select 'auth_users_without_any_venue_access' as check_name,count(*)::bigint as issue_count
from auth.users u
where not exists (select 1 from public.venue_access va where va.user_id=u.id)
union all
select 'non_super_primary_venue_access_missing',count(*)::bigint
from public.profiles p
where coalesce(p.role,'staff') <> 'super_admin'
  and not exists (
    select 1 from public.venue_access va
    where va.user_id=p.id and va.venue_id=p.venue_id
  )
union all
select 'all_primary_venue_access_missing',count(*)::bigint
from public.profiles p
where not exists (
  select 1 from public.venue_access va
  where va.user_id=p.id and va.venue_id=p.venue_id
)
union all
select 'legacy_registration_code_rows',count(*)::bigint
from public.configs where key='registration_code'
order by check_name;

begin;

-- STOP on ambiguous or invalid backfill candidates.
do $$
begin
  if exists (
    select 1
    from auth.users u
    left join public.profiles p on p.id=u.id
    where not exists (select 1 from public.venue_access va where va.user_id=u.id)
      and p.id is null
  ) then
    raise exception 'remediation_stop_auth_user_without_profile';
  end if;

  if exists (
    select 1 from public.profiles p
    where not exists (
      select 1 from public.venue_access va
      where va.user_id=p.id and va.venue_id=p.venue_id
    )
      and p.venue_id is null
  ) then
    raise exception 'remediation_stop_missing_primary_venue';
  end if;

  if exists (
    select 1 from public.profiles p
    left join auth.users u on u.id=p.id
    left join public.venues v on v.id=p.venue_id
    where not exists (
      select 1 from public.venue_access va
      where va.user_id=p.id and va.venue_id=p.venue_id
    )
      and (u.id is null or v.id is null)
  ) then
    raise exception 'remediation_stop_invalid_user_or_venue_reference';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.venue_access'::regclass
      and c.contype in ('p','u')
      and (
        select array_agg(a.attname order by key_position.ordinality)
        from unnest(c.conkey) with ordinality key_position(attnum,ordinality)
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key_position.attnum
      ) = array['user_id','venue_id']::name[]
  ) then
    raise exception 'remediation_stop_missing_venue_access_unique_key';
  end if;

  if exists (
    select 1 from public.configs c
    left join public.venues v on v.id=c.venue_id
    where c.key='registration_code' and (c.venue_id is null or v.id is null)
  ) then
    raise exception 'remediation_stop_invalid_registration_code_venue';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.configs'::regclass
      and c.contype in ('p','u')
      and (
        select array_agg(a.attname order by key_position.ordinality)
        from unnest(c.conkey) with ordinality key_position(attnum,ordinality)
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=key_position.attnum
      ) = array['key','venue_id']::name[]
  ) then
    raise exception 'remediation_stop_missing_configs_unique_key';
  end if;
end $$;

with inserted as (
  insert into public.venue_access(user_id,venue_id)
  select p.id,p.venue_id
  from public.profiles p
  join auth.users u on u.id=p.id
  join public.venues v on v.id=p.venue_id
  where not exists (
    select 1 from public.venue_access va
    where va.user_id=p.id and va.venue_id=p.venue_id
  )
  on conflict (user_id,venue_id) do nothing
  returning 1
)
select count(*)::bigint as venue_access_rows_inserted from inserted;

with rotated as (
  update public.configs
  set value='disabled:'||encode(extensions.gen_random_bytes(32),'hex'),
      updated_at=timezone('utc',now())
  where key='registration_code'
    and value !~ '^disabled:[0-9a-f]{64}$'
  returning 1
)
select count(*)::bigint as registration_code_rows_invalidated from rotated;

-- Final verification inside the same transaction. Any remaining issue aborts.
do $$
begin
  if exists (
    select 1 from auth.users u
    where not exists (select 1 from public.venue_access va where va.user_id=u.id)
  ) then
    raise exception 'remediation_stop_users_still_without_venue_access';
  end if;

  if exists (
    select 1 from public.profiles p
    where not exists (
      select 1 from public.venue_access va
      where va.user_id=p.id and va.venue_id=p.venue_id
    )
  ) then
    raise exception 'remediation_stop_primary_access_still_missing';
  end if;

  if exists (
    select 1 from public.configs
    where key='registration_code'
      and value !~ '^disabled:[0-9a-f]{64}$'
  ) then
    raise exception 'remediation_stop_legacy_code_not_invalidated';
  end if;
end $$;

select 'auth_users_without_any_venue_access' as check_name,count(*)::bigint as issue_count
from auth.users u
where not exists (select 1 from public.venue_access va where va.user_id=u.id)
union all
select 'non_super_primary_venue_access_missing',count(*)::bigint
from public.profiles p
where coalesce(p.role,'staff') <> 'super_admin'
  and not exists (
    select 1 from public.venue_access va
    where va.user_id=p.id and va.venue_id=p.venue_id
  )
union all
select 'all_primary_venue_access_missing',count(*)::bigint
from public.profiles p
where not exists (
  select 1 from public.venue_access va
  where va.user_id=p.id and va.venue_id=p.venue_id
)
union all
select 'legacy_registration_codes_not_invalidated',count(*)::bigint
from public.configs
where key='registration_code' and value !~ '^disabled:[0-9a-f]{64}$'
order by check_name;

commit;
