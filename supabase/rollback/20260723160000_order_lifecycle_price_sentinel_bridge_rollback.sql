-- Roll back Sprint 3 before operational lifecycle data exists.
-- This rollback never reads or updates products.current_stock.

begin;

set local statement_timeout = '120s';
set local lock_timeout = '15s';

do $$
begin
  if exists (
    select 1
    from public.purchase_orders
    where status<>'draft'
  ) then
    raise exception 'lifecycle_rollback_requires_all_orders_to_be_draft';
  end if;

  if exists (
    select 1
    from public.suppliers
    where price_sentinel_supplier_id is not null
      and price_sentinel_supplier_id !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  ) then
    raise exception 'lifecycle_rollback_external_supplier_ids_are_not_uuid';
  end if;
end $$;

revoke all on function public.confirm_supplier_order_sent(uuid,uuid,uuid,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.record_supplier_order_receipt(uuid,uuid,integer,jsonb,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.cancel_supplier_order(uuid,uuid,uuid,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.cancel_purchase_order(uuid,uuid,integer)
  from public,anon,authenticated,service_role;

drop function if exists public.confirm_supplier_order_sent(uuid,uuid,uuid,integer);
drop function if exists public.record_supplier_order_receipt(uuid,uuid,integer,jsonb,uuid);
drop function if exists public.cancel_supplier_order(uuid,uuid,uuid,integer);
drop function if exists public.cancel_purchase_order(uuid,uuid,integer);

drop function if exists public.record_whatsapp_opened(uuid,uuid,uuid,integer,text,text);
drop function if exists public.enqueue_supplier_order_event(uuid,text);
drop function if exists public.build_supplier_order_payload(uuid,text);
drop function if exists public.ensure_supplier_order_snapshot(uuid);
drop function if exists public.recalculate_purchase_order_status(uuid,uuid);

drop trigger if exists purchase_order_items_sync_pending_supplier
  on public.purchase_order_items;
drop function if exists public.sync_pending_supplier_order_from_item();

drop trigger if exists supplier_purchase_order_status_guard
  on public.supplier_purchase_orders;
drop trigger if exists supplier_purchase_orders_set_updated_at
  on public.supplier_purchase_orders;
drop function if exists public.supplier_purchase_order_status_guard();

drop trigger if exists purchase_order_status_guard on public.purchase_orders;
drop function if exists public.purchase_order_status_guard();

drop table if exists public.supplier_order_receipt_items;
drop table if exists public.supplier_order_receipts;
drop table if exists public.integration_outbox;
drop table if exists public.supplier_purchase_order_items;
drop table if exists public.supplier_purchase_orders;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status='draft');

alter table public.products
  drop column if exists price_sentinel_product_id;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='suppliers'
      and column_name='price_sentinel_supplier_id'
      and data_type='text'
  ) then
    alter table public.suppliers
      alter column price_sentinel_supplier_id type uuid
      using nullif(price_sentinel_supplier_id,'')::uuid;
  end if;
end $$;

create or replace function public.record_whatsapp_opened(
  p_purchase_order_id uuid,
  p_venue_id uuid,
  p_supplier_id uuid,
  p_order_version integer,
  p_whatsapp_number_snapshot text,
  p_message_snapshot text
) returns public.supplier_order_dispatches
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid:=auth.uid();
  recorded_event public.supplier_order_dispatches%rowtype;
begin
  if caller_id is null
     or not public.has_order_permission(p_venue_id,'can_send_whatsapp_orders') then
    raise exception 'whatsapp_order_forbidden';
  end if;

  if p_order_version is null or not exists (
    select 1
    from public.purchase_orders po
    where po.id=p_purchase_order_id
      and po.venue_id=p_venue_id
      and po.status='draft'
      and po.version=p_order_version
  ) then
    raise exception 'whatsapp_order_version_conflict';
  end if;

  if not exists (
    select 1
    from public.suppliers s
    where s.id=p_supplier_id and s.venue_id=p_venue_id and s.is_active
  ) or not exists (
    select 1
    from public.purchase_order_items poi
    where poi.purchase_order_id=p_purchase_order_id
      and poi.venue_id=p_venue_id
      and poi.supplier_id=p_supplier_id
  ) then
    raise exception 'whatsapp_supplier_not_in_order';
  end if;

  if nullif(btrim(p_whatsapp_number_snapshot),'') is null
     or nullif(btrim(p_message_snapshot),'') is null
     or length(p_message_snapshot)>10000 then
    raise exception 'invalid_whatsapp_snapshot';
  end if;

  insert into public.supplier_order_dispatches(
    purchase_order_id,
    venue_id,
    supplier_id,
    whatsapp_number_snapshot,
    message_snapshot,
    order_version,
    opened_by
  ) values (
    p_purchase_order_id,
    p_venue_id,
    p_supplier_id,
    btrim(p_whatsapp_number_snapshot),
    p_message_snapshot,
    p_order_version,
    caller_id
  )
  returning * into recorded_event;

  return recorded_event;
end $$;

revoke all on function public.record_whatsapp_opened(uuid,uuid,uuid,integer,text,text)
  from public,anon;
grant execute on function public.record_whatsapp_opened(uuid,uuid,uuid,integer,text,text)
  to authenticated,service_role;

commit;
