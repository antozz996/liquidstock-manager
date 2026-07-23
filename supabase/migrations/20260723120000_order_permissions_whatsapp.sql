-- Sprint 2: venue-scoped order permission administration and WhatsApp-open events.
-- Opening WhatsApp is an operator action, not proof that an order was delivered.
-- This migration never reads or updates products.current_stock.

begin;

do $$
begin
  if to_regclass('public.order_permissions') is null
     or to_regclass('public.purchase_orders') is null
     or to_regclass('public.purchase_order_items') is null
     or to_regclass('public.suppliers') is null
     or to_regprocedure('public.has_order_permission(uuid,text)') is null then
    raise exception 'order_whatsapp_requires_manual_orders';
  end if;
end $$;

create table if not exists public.supplier_order_dispatches (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null,
  venue_id uuid not null,
  supplier_id uuid not null,
  whatsapp_number_snapshot text not null check (btrim(whatsapp_number_snapshot) <> ''),
  message_snapshot text not null check (btrim(message_snapshot) <> ''),
  status text not null default 'whatsapp_opened' check (status = 'whatsapp_opened'),
  order_version integer not null check (order_version > 0),
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (purchase_order_id,venue_id)
    references public.purchase_orders(id,venue_id) on delete cascade,
  foreign key (supplier_id,venue_id)
    references public.suppliers(id,venue_id) on delete restrict
);

create index if not exists idx_supplier_order_dispatches_order
  on public.supplier_order_dispatches(purchase_order_id,opened_at desc);
create index if not exists idx_supplier_order_dispatches_supplier
  on public.supplier_order_dispatches(venue_id,supplier_id,opened_at desc);

create or replace function public.has_order_permission(
  target_venue_id uuid,
  permission_name text
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and (
      (
        public.check_is_super_admin()
        and not exists (
          select 1
          from public.order_permissions disabled
          where disabled.user_id=auth.uid()
            and disabled.venue_id=target_venue_id
            and not disabled.is_active
        )
      )
      or (
        public.has_venue_access(target_venue_id)
        and exists (
          select 1
          from public.order_permissions op
          where op.user_id=auth.uid()
            and op.venue_id=target_venue_id
            and op.is_active
            and case permission_name
              when 'can_create_manual_orders' then op.can_create_manual_orders or op.can_manage_orders
              when 'can_create_stock_orders' then op.can_create_stock_orders or op.can_manage_orders
              when 'can_manage_orders' then op.can_manage_orders
              when 'can_send_whatsapp_orders' then op.can_send_whatsapp_orders or op.can_manage_orders
              when 'can_view_purchase_prices' then op.can_view_purchase_prices or op.can_manage_orders
              else false
            end
        )
      )
    )
$$;

create or replace function public.set_order_permissions(
  p_venue_id uuid,
  p_user_id uuid,
  p_can_create_manual_orders boolean,
  p_can_create_stock_orders boolean,
  p_can_manage_orders boolean,
  p_can_send_whatsapp_orders boolean,
  p_can_view_purchase_prices boolean,
  p_is_active boolean
) returns public.order_permissions
language plpgsql security definer set search_path = ''
as $$
declare
  saved_permissions public.order_permissions%rowtype;
begin
  if auth.uid() is null or not public.can_manage_venue(p_venue_id) then
    raise exception 'order_permission_management_forbidden';
  end if;

  if p_user_id is null or not exists (
    select 1
    from public.venue_access va
    join public.profiles p on p.id=va.user_id
    where va.user_id=p_user_id and va.venue_id=p_venue_id
  ) then
    raise exception 'order_permission_target_not_in_venue';
  end if;

  insert into public.order_permissions(
    venue_id,
    user_id,
    can_create_manual_orders,
    can_create_stock_orders,
    can_manage_orders,
    can_send_whatsapp_orders,
    can_view_purchase_prices,
    is_active
  ) values (
    p_venue_id,
    p_user_id,
    coalesce(p_can_create_manual_orders,false),
    coalesce(p_can_create_stock_orders,false),
    coalesce(p_can_manage_orders,false),
    coalesce(p_can_send_whatsapp_orders,false),
    coalesce(p_can_view_purchase_prices,false),
    coalesce(p_is_active,false)
  )
  on conflict (user_id,venue_id) do update set
    can_create_manual_orders=excluded.can_create_manual_orders,
    can_create_stock_orders=excluded.can_create_stock_orders,
    can_manage_orders=excluded.can_manage_orders,
    can_send_whatsapp_orders=excluded.can_send_whatsapp_orders,
    can_view_purchase_prices=excluded.can_view_purchase_prices,
    is_active=excluded.is_active,
    updated_at=now()
  returning * into saved_permissions;

  return saved_permissions;
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

alter table public.supplier_order_dispatches enable row level security;

drop policy if exists order_permissions_insert on public.order_permissions;
drop policy if exists order_permissions_update on public.order_permissions;
drop policy if exists order_permissions_delete on public.order_permissions;

drop policy if exists supplier_order_dispatches_select on public.supplier_order_dispatches;
create policy supplier_order_dispatches_select
on public.supplier_order_dispatches for select to authenticated
using (public.has_order_permission(venue_id,'can_send_whatsapp_orders'));

revoke insert,update,delete on public.order_permissions from authenticated;
revoke all on public.supplier_order_dispatches from public,anon,authenticated;
revoke all on function public.set_order_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean)
  from public,anon;
revoke all on function public.record_whatsapp_opened(uuid,uuid,uuid,integer,text,text)
  from public,anon;

grant select on public.supplier_order_dispatches to authenticated;
grant execute on function public.set_order_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean)
  to authenticated;
grant execute on function public.record_whatsapp_opened(uuid,uuid,uuid,integer,text,text)
  to authenticated;
grant execute on function public.has_order_permission(uuid,text) to authenticated;

grant all on public.supplier_order_dispatches to service_role;
grant execute on function public.set_order_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean)
  to service_role;
grant execute on function public.record_whatsapp_opened(uuid,uuid,uuid,integer,text,text)
  to service_role;
grant execute on function public.has_order_permission(uuid,text) to service_role;

commit;
