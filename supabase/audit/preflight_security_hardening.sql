-- LiquidStock Sprint 0 production preflight.
-- Run as a privileged PostgreSQL role that can read auth.users and catalogs.
-- The transaction is explicitly READ ONLY; this script performs SELECTs only.
-- Every row in the first two result sets must report PASS.
-- Usage:
--   psql --set=target_state=baseline -f supabase/audit/preflight_security_hardening.sql
--   psql --set=target_state=hardened -f supabase/audit/preflight_security_hardening.sql
--   psql --set=target_state=orders -f supabase/audit/preflight_security_hardening.sql
--   psql --set=target_state=lifecycle -f supabase/audit/preflight_security_hardening.sql
-- target_state defaults to baseline for backwards compatibility.

\if :{?target_state}
\else
\set target_state baseline
\endif

begin transaction read only;

select :'target_state' in ('orders','lifecycle') as is_orders \gset
select :'target_state' = 'lifecycle' as is_lifecycle \gset

-- Data compatibility: all expected counts are zero. Any STOP blocks release.
with checks(check_name, observed_count, expected_count) as (
  select 'auth_users_without_profile', count(*)::bigint, 0::bigint
  from auth.users u left join public.profiles p on p.id=u.id where p.id is null
  union all
  select 'profiles_without_auth_user', count(*)::bigint, 0::bigint
  from public.profiles p left join auth.users u on u.id=p.id where u.id is null
  union all
  select 'profiles_without_venue', count(*)::bigint, 0::bigint
  from public.profiles where venue_id is null
  union all
  select 'auth_users_without_any_venue_access', count(*)::bigint, 0::bigint
  from auth.users u where not exists (select 1 from public.venue_access va where va.user_id=u.id)
  union all
  select 'non_super_primary_venue_access_missing', count(*)::bigint, 0::bigint
  from public.profiles p
  where coalesce(p.role,'staff') <> 'super_admin'
    and not exists (
      select 1 from public.venue_access va
      where va.user_id=p.id and va.venue_id=p.venue_id
    )
  union all
  select 'invalid_profile_roles', count(*)::bigint, 0::bigint
  from public.profiles
  where role is null or role not in ('staff','admin','super_admin','osservatore')
  union all
  select 'venue_access_null_keys', count(*)::bigint, 0::bigint
  from public.venue_access where user_id is null or venue_id is null
  union all
  select 'venue_access_duplicate_pairs', count(*)::bigint, 0::bigint
  from (
    select user_id,venue_id from public.venue_access
    group by user_id,venue_id having count(*)>1
  ) duplicates
  union all
  select 'venue_access_user_orphans', count(*)::bigint, 0::bigint
  from public.venue_access va left join auth.users u on u.id=va.user_id
  where va.user_id is not null and u.id is null
  union all
  select 'venue_access_venue_orphans', count(*)::bigint, 0::bigint
  from public.venue_access va left join public.venues v on v.id=va.venue_id
  where va.venue_id is not null and v.id is null
  union all
  select 'profile_venue_orphans', count(*)::bigint, 0::bigint
  from public.profiles p left join public.venues v on v.id=p.venue_id
  where p.venue_id is not null and v.id is null
  union all
  select 'venue_owner_orphans', count(*)::bigint, 0::bigint
  from public.venues v left join auth.users u on u.id=v.owner_id
  where v.owner_id is not null and u.id is null
  union all
  select 'configs_venue_orphans', count(*)::bigint, 0::bigint
  from public.configs c left join public.venues v on v.id=c.venue_id
  where v.id is null
  union all
  select 'legacy_registration_codes_not_invalidated', count(*)::bigint, 0::bigint
  from public.configs
  where key='registration_code'
    and value !~ '^disabled:[0-9a-f]{64}$'
  union all
  select 'products_without_venue', count(*)::bigint, 0::bigint
  from public.products where venue_id is null
  union all
  select 'product_venue_orphans', count(*)::bigint, 0::bigint
  from public.products p left join public.venues v on v.id=p.venue_id
  where p.venue_id is not null and v.id is null
  union all
  select 'events_without_venue', count(*)::bigint, 0::bigint
  from public.events where venue_id is null
  union all
  select 'event_venue_orphans', count(*)::bigint, 0::bigint
  from public.events e left join public.venues v on v.id=e.venue_id
  where e.venue_id is not null and v.id is null
  union all
  select 'reports_missing_venue_or_event', count(*)::bigint, 0::bigint
  from public.reports where venue_id is null or event_id is null
  union all
  select 'report_venue_orphans', count(*)::bigint, 0::bigint
  from public.reports r left join public.venues v on v.id=r.venue_id
  where r.venue_id is not null and v.id is null
  union all
  select 'report_event_orphans', count(*)::bigint, 0::bigint
  from public.reports r left join public.events e on e.id=r.event_id
  where r.event_id is not null and e.id is null
  union all
  select 'report_event_cross_venue', count(*)::bigint, 0::bigint
  from public.reports r join public.events e on e.id=r.event_id
  where r.venue_id is distinct from e.venue_id
  union all
  select 'event_stocks_missing_parent', count(*)::bigint, 0::bigint
  from public.event_stocks where event_id is null or product_id is null
  union all
  select 'event_stock_event_orphans', count(*)::bigint, 0::bigint
  from public.event_stocks es left join public.events e on e.id=es.event_id
  where es.event_id is not null and e.id is null
  union all
  select 'event_stock_product_orphans', count(*)::bigint, 0::bigint
  from public.event_stocks es left join public.products p on p.id=es.product_id
  where es.product_id is not null and p.id is null
  union all
  select 'event_stock_cross_venue', count(*)::bigint, 0::bigint
  from public.event_stocks es
  join public.events e on e.id=es.event_id
  join public.products p on p.id=es.product_id
  where e.venue_id is distinct from p.venue_id
  union all
  select 'restock_sessions_without_venue', count(*)::bigint, 0::bigint
  from public.restock_sessions where venue_id is null
  union all
  select 'restock_session_venue_orphans', count(*)::bigint, 0::bigint
  from public.restock_sessions rs left join public.venues v on v.id=rs.venue_id
  where rs.venue_id is not null and v.id is null
  union all
  select 'restock_items_missing_parent', count(*)::bigint, 0::bigint
  from public.restock_items where session_id is null or product_id is null
  union all
  select 'restock_item_session_orphans', count(*)::bigint, 0::bigint
  from public.restock_items ri left join public.restock_sessions rs on rs.id=ri.session_id
  where ri.session_id is not null and rs.id is null
  union all
  select 'restock_item_product_orphans', count(*)::bigint, 0::bigint
  from public.restock_items ri left join public.products p on p.id=ri.product_id
  where ri.product_id is not null and p.id is null
  union all
  select 'restock_item_cross_venue', count(*)::bigint, 0::bigint
  from public.restock_items ri
  join public.restock_sessions rs on rs.id=ri.session_id
  join public.products p on p.id=ri.product_id
  where rs.venue_id is distinct from p.venue_id
  union all
  select 'restock_log_missing_product', count(*)::bigint, 0::bigint
  from public.restock_log where product_id is null
  union all
  select 'restock_log_product_orphans', count(*)::bigint, 0::bigint
  from public.restock_log rl left join public.products p on p.id=rl.product_id
  where rl.product_id is not null and p.id is null
  union all
  select 'activity_log_without_venue', count(*)::bigint, 0::bigint
  from public.activity_log where venue_id is null
  union all
  select 'activity_log_venue_orphans', count(*)::bigint, 0::bigint
  from public.activity_log al left join public.venues v on v.id=al.venue_id
  where al.venue_id is not null and v.id is null
  union all
  select 'activity_log_user_orphans', count(*)::bigint, 0::bigint
  from public.activity_log al left join auth.users u on u.id=al.user_id
  where al.user_id is not null and u.id is null
  union all
  select 'report_edit_log_missing_report', count(*)::bigint, 0::bigint
  from public.report_edit_log where report_id is null
  union all
  select 'report_edit_log_report_orphans', count(*)::bigint, 0::bigint
  from public.report_edit_log rel left join public.reports r on r.id=rel.report_id
  where rel.report_id is not null and r.id is null
  union all
  select 'report_edit_log_editor_orphans', count(*)::bigint, 0::bigint
  from public.report_edit_log rel left join auth.users u on u.id=rel.edited_by
  where rel.edited_by is not null and u.id is null
)
select check_name,observed_count,expected_count,
  case when observed_count=expected_count then 'PASS' else 'STOP' end as release_status
from checks
order by check_name;

-- Audited schema fingerprint for the requested release state. Drift is a STOP
-- even when it looks safer: review the difference before continuing.
with mode(target_state) as (
  values (:'target_state'::text)
),
snapshot(check_name, observed_count, expected_count) as (
  select 'target_state_valid',
    case when (select target_state from mode) in ('baseline','hardened','orders','lifecycle')
      then 0::bigint else 1::bigint end,
    0::bigint
  union all
  select 'public_table_count', count(*)::bigint,
    case (select target_state from mode)
      when 'baseline' then 13::bigint
      when 'hardened' then 15::bigint
      when 'orders' then 21::bigint
      when 'lifecycle' then 26::bigint
      else -1::bigint end
  from pg_catalog.pg_tables where schemaname='public'
  union all
  select 'public_policy_count', count(*)::bigint,
    case (select target_state from mode)
      when 'baseline' then 35::bigint
      when 'hardened' then 41::bigint
      when 'orders' then 52::bigint
      when 'lifecycle' then 56::bigint
      else -1::bigint end
  from pg_catalog.pg_policies where schemaname='public'
  union all
  select 'public_tables_without_rls', count(*)::bigint,
    case (select target_state from mode)
      when 'baseline' then 3::bigint
      when 'hardened' then 0::bigint
      when 'orders' then 0::bigint
      when 'lifecycle' then 0::bigint
      else -1::bigint end
  from pg_catalog.pg_tables where schemaname='public' and not rowsecurity
  union all
  select 'open_policy_count', count(*)::bigint,
    case (select target_state from mode)
      when 'baseline' then 9::bigint
      when 'hardened' then 0::bigint
      when 'orders' then 0::bigint
      when 'lifecycle' then 0::bigint
      else -1::bigint end
  from pg_catalog.pg_policies
  where schemaname='public'
    and (
      regexp_replace(coalesce(qual,''),'[()[:space:]]','','g')='true'
      or regexp_replace(coalesce(with_check,''),'[()[:space:]]','','g')='true'
    )
  union all
  select 'anon_table_grants', count(*)::bigint,
    case (select target_state from mode)
      when 'baseline' then 91::bigint
      when 'hardened' then 0::bigint
      when 'orders' then 0::bigint
      when 'lifecycle' then 0::bigint
      else -1::bigint end
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
  union all
  select 'unsafe_security_definer_functions', count(*)::bigint,
    case (select target_state from mode)
      when 'baseline' then 4::bigint
      when 'hardened' then 0::bigint
      when 'orders' then 0::bigint
      when 'lifecycle' then 0::bigint
      else -1::bigint end
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig,array[]::text[])) setting
      where setting like 'search_path=%'
    )
  union all
  -- Informational cardinality: one legacy row per venue is valid. Safety is
  -- enforced by the scoped unique-key and orphan checks, not by a global count.
  select 'legacy_registration_code_rows', count(*)::bigint, count(*)::bigint
  from public.configs where key='registration_code'
  union all
  select 'configs_key_venue_unique_key_missing',
    case when exists (
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
    ) then 0::bigint else 1::bigint end,
    0::bigint
)
select mode.target_state,check_name,observed_count,expected_count,
  case when observed_count=expected_count then 'PASS' else 'STOP' end as release_status
from snapshot cross join mode
order by check_name;

-- Exact objects behind the security counters; no row values are returned.
select tablename,policyname,cmd,roles
from pg_catalog.pg_policies
where schemaname='public'
  and (
    regexp_replace(coalesce(qual,''),'[()[:space:]]','','g')='true'
    or regexp_replace(coalesce(with_check,''),'[()[:space:]]','','g')='true'
  )
order by tablename,policyname;

select n.nspname as schema_name,p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig,array[]::text[])) setting
    where setting like 'search_path=%'
  )
order by function_name,arguments;

\if :is_orders
-- Sprint 1/2 structural and data consistency checks. These statements are
-- parsed only in orders mode so baseline/hardened remain usable before the
-- order tables exist.
with required_tables(table_name) as (
  values
    ('departments'),
    ('suppliers'),
    ('order_permissions'),
    ('purchase_orders'),
    ('purchase_order_items'),
    ('supplier_order_dispatches')
),
checks(check_name,observed_count,expected_count) as (
  select 'orders_required_tables_missing',count(*)::bigint,0::bigint
  from required_tables rt
  where to_regclass('public.'||rt.table_name) is null
  union all
  select 'orders_required_rls_disabled',count(*)::bigint,0::bigint
  from required_tables rt
  left join pg_catalog.pg_class c on c.oid=to_regclass('public.'||rt.table_name)
  where c.oid is null or not c.relrowsecurity
  union all
  select 'orders_anon_grants',count(*)::bigint,0::bigint
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
    and table_name in (select table_name from required_tables)
  union all
  select 'orders_open_policies',count(*)::bigint,0::bigint
  from pg_catalog.pg_policies
  where schemaname='public'
    and tablename in (select table_name from required_tables)
    and (
      regexp_replace(coalesce(qual,''),'[()[:space:]]','','g')='true'
      or regexp_replace(coalesce(with_check,''),'[()[:space:]]','','g')='true'
    )
  union all
  select 'orders_unsafe_security_definer_functions',count(*)::bigint,0::bigint
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and p.proname in (
      'has_order_permission',
      'save_purchase_order_draft',
      'set_order_permissions',
      'record_whatsapp_opened',
      'confirm_supplier_order_sent',
      'record_supplier_order_receipt',
      'cancel_supplier_order',
      'cancel_purchase_order',
      'ensure_supplier_order_snapshot',
      'build_supplier_order_payload',
      'enqueue_supplier_order_event',
      'recalculate_purchase_order_status'
    )
    and not exists (
      select 1 from unnest(coalesce(p.proconfig,array[]::text[])) setting
      where setting like 'search_path=%'
    )
)
select check_name,observed_count,expected_count,
  case when observed_count=expected_count then 'PASS' else 'STOP' end as release_status
from checks
order by check_name;

with checks(check_name,observed_count,expected_count) as (
  select 'departments_venue_orphans',count(*)::bigint,0::bigint
  from public.departments d left join public.venues v on v.id=d.venue_id
  where v.id is null
  union all
  select 'suppliers_venue_orphans',count(*)::bigint,0::bigint
  from public.suppliers s left join public.venues v on v.id=s.venue_id
  where v.id is null
  union all
  select 'order_permissions_missing_profile_or_access',count(*)::bigint,0::bigint
  from public.order_permissions op
  left join public.profiles p on p.id=op.user_id
  left join public.venue_access va on va.user_id=op.user_id and va.venue_id=op.venue_id
  where p.id is null or va.user_id is null
  union all
  select 'purchase_orders_department_cross_venue',count(*)::bigint,0::bigint
  from public.purchase_orders po
  left join public.departments d on d.id=po.department_id
  where d.id is null or d.venue_id is distinct from po.venue_id
  union all
  select 'purchase_order_items_order_cross_venue',count(*)::bigint,0::bigint
  from public.purchase_order_items poi
  left join public.purchase_orders po on po.id=poi.purchase_order_id
  where po.id is null or po.venue_id is distinct from poi.venue_id
  union all
  select 'purchase_order_items_product_cross_venue',count(*)::bigint,0::bigint
  from public.purchase_order_items poi
  join public.products p on p.id=poi.product_id
  where p.venue_id is distinct from poi.venue_id
  union all
  select 'purchase_order_items_supplier_cross_venue',count(*)::bigint,0::bigint
  from public.purchase_order_items poi
  join public.suppliers s on s.id=poi.supplier_id
  where s.venue_id is distinct from poi.venue_id
  union all
  select 'dispatch_order_cross_venue_or_version_ahead',count(*)::bigint,0::bigint
  from public.supplier_order_dispatches sod
  left join public.purchase_orders po on po.id=sod.purchase_order_id
  where po.id is null
     or po.venue_id is distinct from sod.venue_id
     or sod.order_version>po.version
  union all
  select 'dispatch_supplier_cross_venue',count(*)::bigint,0::bigint
  from public.supplier_order_dispatches sod
  left join public.suppliers s on s.id=sod.supplier_id
  where s.id is null
     or s.venue_id is distinct from sod.venue_id
  union all
  select 'dispatch_user_orphans',count(*)::bigint,0::bigint
  from public.supplier_order_dispatches sod
  left join auth.users u on u.id=sod.opened_by
  where u.id is null
)
select check_name,observed_count,expected_count,
  case when observed_count=expected_count then 'PASS' else 'STOP' end as release_status
from checks
order by check_name;
\endif

\if :is_lifecycle
-- Sprint 3 lifecycle, immutable snapshot, receipt, and outbox checks.
with required_tables(table_name) as (
  values
    ('supplier_purchase_orders'),
    ('supplier_purchase_order_items'),
    ('supplier_order_receipts'),
    ('supplier_order_receipt_items'),
    ('integration_outbox')
),
checks(check_name,observed_count,expected_count) as (
  select 'lifecycle_required_tables_missing',count(*)::bigint,0::bigint
  from required_tables rt
  where to_regclass('public.'||rt.table_name) is null
  union all
  select 'lifecycle_required_rls_disabled',count(*)::bigint,0::bigint
  from required_tables rt
  left join pg_catalog.pg_class c on c.oid=to_regclass('public.'||rt.table_name)
  where c.oid is null or not c.relrowsecurity
  union all
  select 'lifecycle_anon_grants',count(*)::bigint,0::bigint
  from information_schema.role_table_grants
  where table_schema='public' and grantee='anon'
    and table_name in (select table_name from required_tables)
  union all
  select 'lifecycle_open_policies',count(*)::bigint,0::bigint
  from pg_catalog.pg_policies
  where schemaname='public'
    and tablename in (select table_name from required_tables)
    and (
      regexp_replace(coalesce(qual,''),'[()[:space:]]','','g')='true'
      or regexp_replace(coalesce(with_check,''),'[()[:space:]]','','g')='true'
    )
  union all
  select 'lifecycle_unsafe_security_definer_functions',count(*)::bigint,0::bigint
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and p.proname in (
      'confirm_supplier_order_sent',
      'record_supplier_order_receipt',
      'cancel_supplier_order',
      'cancel_purchase_order',
      'ensure_supplier_order_snapshot',
      'build_supplier_order_payload',
      'enqueue_supplier_order_event',
      'recalculate_purchase_order_status'
    )
    and not exists (
      select 1 from unnest(coalesce(p.proconfig,array[]::text[])) setting
      where setting like 'search_path=%'
    )
)
select check_name,observed_count,expected_count,
  case when observed_count=expected_count then 'PASS' else 'STOP' end as release_status
from checks
order by check_name;

with checks(check_name,observed_count,expected_count) as (
  select 'lifecycle_invalid_general_status',count(*)::bigint,0::bigint
  from public.purchase_orders
  where status not in ('draft','sent','partially_received','received','cancelled')
  union all
  select 'lifecycle_invalid_supplier_status',count(*)::bigint,0::bigint
  from public.supplier_purchase_orders
  where status not in (
    'pending','whatsapp_opened','sent_confirmed',
    'partially_received','received','cancelled'
  )
  union all
  select 'assigned_suppliers_without_suborder',count(*)::bigint,0::bigint
  from (
    select distinct item.purchase_order_id,item.venue_id,item.supplier_id
    from public.purchase_order_items item
    where item.supplier_id is not null
  ) assigned
  left join public.supplier_purchase_orders spo
    on spo.purchase_order_id=assigned.purchase_order_id
   and spo.venue_id=assigned.venue_id
   and spo.supplier_id=assigned.supplier_id
  where spo.id is null
  union all
  select 'suborders_without_assigned_items',count(*)::bigint,0::bigint
  from public.supplier_purchase_orders spo
  where not exists (
    select 1
    from public.purchase_order_items item
    where item.purchase_order_id=spo.purchase_order_id
      and item.venue_id=spo.venue_id
      and item.supplier_id=spo.supplier_id
  )
  union all
  select 'supplier_orders_cross_venue_or_orphan',count(*)::bigint,0::bigint
  from public.supplier_purchase_orders spo
  left join public.purchase_orders po on po.id=spo.purchase_order_id
  left join public.suppliers s on s.id=spo.supplier_id
  where po.id is null
     or s.id is null
     or po.venue_id is distinct from spo.venue_id
     or s.venue_id is distinct from spo.venue_id
  union all
  select 'supplier_snapshot_cross_venue_or_orphan',count(*)::bigint,0::bigint
  from public.supplier_purchase_order_items snapshot
  left join public.supplier_purchase_orders spo
    on spo.id=snapshot.supplier_purchase_order_id
  left join public.products p on p.id=snapshot.product_id
  where spo.id is null
     or spo.venue_id is distinct from snapshot.venue_id
     or (
       snapshot.product_id is not null
       and (p.id is null or p.venue_id is distinct from snapshot.venue_id)
     )
  union all
  select 'confirmed_supplier_orders_without_snapshot',count(*)::bigint,0::bigint
  from public.supplier_purchase_orders spo
  where spo.status in ('sent_confirmed','partially_received','received')
    and not exists (
      select 1
      from public.supplier_purchase_order_items snapshot
      where snapshot.supplier_purchase_order_id=spo.id
    )
  union all
  select 'supplier_receipts_cross_venue_or_orphan',count(*)::bigint,0::bigint
  from public.supplier_order_receipts receipt
  left join public.supplier_purchase_orders spo
    on spo.id=receipt.supplier_purchase_order_id
  where spo.id is null
     or spo.venue_id is distinct from receipt.venue_id
  union all
  select 'supplier_receipt_items_cross_venue_or_orphan',count(*)::bigint,0::bigint
  from public.supplier_order_receipt_items item
  left join public.supplier_order_receipts receipt on receipt.id=item.receipt_id
  left join public.supplier_purchase_order_items snapshot
    on snapshot.id=item.supplier_purchase_order_item_id
  where receipt.id is null
     or snapshot.id is null
     or receipt.venue_id is distinct from item.venue_id
     or snapshot.venue_id is distinct from item.venue_id
  union all
  select 'received_supplier_orders_without_complete_receipt',count(*)::bigint,0::bigint
  from public.supplier_purchase_orders spo
  where spo.status='received'
    and not exists (
      select 1
      from public.supplier_order_receipts receipt
      where receipt.supplier_purchase_order_id=spo.id
        and receipt.status='complete'
    )
  union all
  select 'integration_outbox_cross_venue_or_orphan',count(*)::bigint,0::bigint
  from public.integration_outbox outbox
  left join public.supplier_purchase_orders spo on spo.id=outbox.aggregate_id
  where spo.id is null
     or spo.venue_id is distinct from outbox.venue_id
  union all
  select 'integration_outbox_payload_mismatch',count(*)::bigint,0::bigint
  from public.integration_outbox outbox
  where outbox.integration_version<>'1.0'
     or outbox.payload->>'integration_version'<>outbox.integration_version
     or outbox.payload->>'event_type'<>outbox.event_type
     or outbox.payload->>'liquidstock_supplier_order_id'<>outbox.aggregate_id::text
     or outbox.payload ? 'price'
     or outbox.payload ? 'purchase_price'
     or outbox.payload ? 'unit_price'
)
select check_name,observed_count,expected_count,
  case when observed_count=expected_count then 'PASS' else 'STOP' end as release_status
from checks
order by check_name;
\endif

rollback;
