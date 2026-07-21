-- Sprint 0 Security Hardening - read-only preflight.
-- Run with a database role that can read auth.users and every public table.
-- This script does not modify data or schema.

begin transaction read only;

select 'profiles_without_venue' as check_name, count(*) as issue_count
from public.profiles where venue_id is null
union all
select 'users_without_profile', count(*)
from auth.users u left join public.profiles p on p.id = u.id where p.id is null
union all
select 'non_super_profiles_without_venue_access', count(*)
from public.profiles p
where coalesce(p.role, 'staff') <> 'super_admin'
  and not exists (
    select 1 from public.venue_access va
    where va.user_id = p.id and va.venue_id = p.venue_id
  )
union all
select 'venue_access_null_user', count(*) from public.venue_access where user_id is null
union all
select 'venue_access_null_venue', count(*) from public.venue_access where venue_id is null
union all
select 'venue_access_duplicate_pairs', count(*)
from (
  select user_id, venue_id from public.venue_access
  group by user_id, venue_id having count(*) > 1
) d
union all
select 'products_without_venue', count(*) from public.products where venue_id is null
union all
select 'events_without_venue', count(*) from public.events where venue_id is null
union all
select 'reports_without_venue', count(*) from public.reports where venue_id is null
union all
select 'restock_sessions_without_venue', count(*) from public.restock_sessions where venue_id is null
union all
select 'activity_log_without_venue', count(*) from public.activity_log where venue_id is null
union all
select 'restock_log_without_product', count(*) from public.restock_log where product_id is null
union all
select 'event_stocks_without_parent', count(*) from public.event_stocks where event_id is null or product_id is null
union all
select 'restock_items_without_parent', count(*) from public.restock_items where session_id is null or product_id is null
union all
select 'reports_without_event', count(*) from public.reports where event_id is null
union all
select 'report_edit_log_without_report', count(*) from public.report_edit_log where report_id is null
union all
select 'invalid_profile_roles', count(*)
from public.profiles
where role is null or role not in ('staff', 'admin', 'super_admin', 'osservatore')
order by check_name;

select 'event_stock_cross_venue' as check_name, count(*) as issue_count
from public.event_stocks es
join public.events e on e.id = es.event_id
join public.products p on p.id = es.product_id
where e.venue_id is distinct from p.venue_id
union all
select 'restock_item_cross_venue', count(*)
from public.restock_items ri
join public.restock_sessions rs on rs.id = ri.session_id
join public.products p on p.id = ri.product_id
where rs.venue_id is distinct from p.venue_id
union all
select 'report_event_cross_venue', count(*)
from public.reports r join public.events e on e.id = r.event_id
where r.venue_id is distinct from e.venue_id
union all
select 'profile_venue_orphan', count(*)
from public.profiles p left join public.venues v on v.id = p.venue_id
where p.venue_id is not null and v.id is null
union all
select 'venue_access_user_orphan', count(*)
from public.venue_access va left join auth.users u on u.id = va.user_id
where va.user_id is not null and u.id is null
union all
select 'venue_access_venue_orphan', count(*)
from public.venue_access va left join public.venues v on v.id = va.venue_id
where va.venue_id is not null and v.id is null
order by check_name;

rollback;
