-- Read-only diagnosis for the three known production preflight blockers.
-- No registration code or config value is selected.

begin transaction read only;

with access_counts as (
  select user_id,count(*)::bigint as venue_access_count
  from public.venue_access
  group by user_id
)
select
  u.id as user_id,
  case
    when coalesce(p.full_name,'')='' then '[missing]'
    else left(p.full_name,1)||repeat('*',greatest(length(p.full_name)-1,3))
  end as masked_name,
  case
    when coalesce(u.email,'')='' then '[missing]'
    else left(split_part(u.email,'@',1),1)||'***@'||left(split_part(u.email,'@',2),1)||'***'
  end as masked_email,
  coalesce(p.role,'[missing_profile]') as database_role,
  p.venue_id as primary_venue_id,
  coalesce(ac.venue_access_count,0) as venue_access_count,
  (
    p.id is not null
    and coalesce(p.role,'staff') <> 'super_admin'
    and p.venue_id is not null
    and not exists (
      select 1 from public.venue_access primary_access
      where primary_access.user_id=p.id and primary_access.venue_id=p.venue_id
    )
  ) as overlaps_non_super_primary_access_missing
from auth.users u
left join public.profiles p on p.id=u.id
left join access_counts ac on ac.user_id=u.id
where not exists (
  select 1 from public.venue_access any_access where any_access.user_id=u.id
)
order by overlaps_non_super_primary_access_missing desc,database_role,user_id;

select
  coalesce(to_jsonb(c)->>'id',c.key||':'||c.venue_id::text) as id,
  c.venue_id,
  (c.key='registration_code') as has_registration_code,
  coalesce((
    select array_agg(
      constraint_row.conname||': '||pg_catalog.pg_get_constraintdef(constraint_row.oid)
      order by constraint_row.conname
    )
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid='public.configs'::regclass
      and constraint_row.contype in ('p','u')
  ),array[]::text[]) as unique_keys,
  case when c.key='registration_code'
    then 'legacy signup code scoped to venue; value intentionally omitted'
    else 'other venue configuration; value intentionally omitted'
  end as purpose
from public.configs c
where c.key='registration_code'
order by c.venue_id;

rollback;
