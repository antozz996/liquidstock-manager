-- Sprint 3: controlled order lifecycle, immutable supplier snapshots,
-- manual receipts, and a transactional Price Sentinel outbox.
-- This migration never reads or updates products.current_stock.

begin;

set local statement_timeout = '120s';
set local lock_timeout = '15s';

do $$
begin
  if to_regclass('public.purchase_orders') is null
     or to_regclass('public.purchase_order_items') is null
     or to_regclass('public.supplier_order_dispatches') is null
     or to_regprocedure('public.has_order_permission(uuid,text)') is null then
    raise exception 'order_lifecycle_requires_sprint_1_and_2';
  end if;
end $$;

-- Price Sentinel currently uses integer identifiers. Text keeps the bridge
-- explicit and versionable without pretending that the external IDs are UUIDs.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='suppliers'
      and column_name='price_sentinel_supplier_id'
      and data_type='uuid'
  ) then
    alter table public.suppliers
      alter column price_sentinel_supplier_id type text
      using price_sentinel_supplier_id::text;
  end if;
end $$;

alter table public.products
  add column if not exists price_sentinel_product_id text;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status in ('draft','sent','partially_received','received','cancelled'));

create table if not exists public.supplier_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null,
  venue_id uuid not null,
  supplier_id uuid not null,
  status text not null default 'pending'
    check (status in (
      'pending',
      'whatsapp_opened',
      'sent_confirmed',
      'partially_received',
      'received',
      'cancelled'
    )),
  order_version integer check (order_version is null or order_version > 0),
  venue_name_snapshot text,
  supplier_name_snapshot text,
  requested_delivery_date_snapshot date,
  sent_at timestamptz,
  confirmed_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_order_id,supplier_id),
  unique (id,venue_id),
  foreign key (purchase_order_id,venue_id)
    references public.purchase_orders(id,venue_id) on delete cascade,
  foreign key (supplier_id,venue_id)
    references public.suppliers(id,venue_id) on delete restrict
);

create table if not exists public.supplier_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  supplier_purchase_order_id uuid not null,
  venue_id uuid not null,
  source_purchase_order_item_id uuid,
  product_id uuid,
  price_sentinel_product_id text,
  product_name_snapshot text not null check (btrim(product_name_snapshot) <> ''),
  quantity numeric not null check (quantity > 0),
  unit text not null check (btrim(unit) <> ''),
  package_note text,
  supplier_name_snapshot text not null check (btrim(supplier_name_snapshot) <> ''),
  supplier_note text,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (source_purchase_order_item_id),
  unique (supplier_purchase_order_id,position),
  unique (id,venue_id),
  foreign key (supplier_purchase_order_id,venue_id)
    references public.supplier_purchase_orders(id,venue_id) on delete cascade,
  foreign key (product_id,venue_id)
    references public.products(id,venue_id) on delete restrict
);

alter table public.supplier_purchase_order_items
  drop constraint if exists supplier_purchase_order_items_source_purchase_order_item_i_fkey;
alter table public.supplier_purchase_order_items
  drop constraint if exists supplier_purchase_order_items_source_item_fkey;
alter table public.supplier_purchase_order_items
  alter column source_purchase_order_item_id drop not null;
alter table public.supplier_purchase_order_items
  add constraint supplier_purchase_order_items_source_item_fkey
  foreign key (source_purchase_order_item_id)
  references public.purchase_order_items(id) on delete set null;

create table if not exists public.supplier_order_receipts (
  id uuid primary key default gen_random_uuid(),
  supplier_purchase_order_id uuid not null,
  venue_id uuid not null,
  idempotency_key uuid not null,
  order_version integer not null check (order_version > 0),
  status text not null check (status in ('partial','complete')),
  declared_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (supplier_purchase_order_id,idempotency_key),
  unique (id,venue_id),
  foreign key (supplier_purchase_order_id,venue_id)
    references public.supplier_purchase_orders(id,venue_id) on delete cascade
);

create table if not exists public.supplier_order_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null,
  venue_id uuid not null,
  supplier_purchase_order_item_id uuid not null,
  ordered_quantity_snapshot numeric not null check (ordered_quantity_snapshot > 0),
  received_quantity numeric not null check (received_quantity >= 0),
  missing_quantity numeric not null check (missing_quantity >= 0),
  note text,
  line_status text not null
    check (line_status in ('not_delivered','partial','received','over_received')),
  created_at timestamptz not null default now(),
  unique (receipt_id,supplier_purchase_order_item_id),
  foreign key (receipt_id,venue_id)
    references public.supplier_order_receipts(id,venue_id) on delete cascade,
  constraint supplier_order_receipt_items_snapshot_fkey
  foreign key (supplier_purchase_order_item_id,venue_id)
    references public.supplier_purchase_order_items(id,venue_id) on delete cascade
);

alter table public.supplier_order_receipt_items
  drop constraint if exists supplier_order_receipt_items_supplier_purchase_order_item__fkey;
alter table public.supplier_order_receipt_items
  drop constraint if exists supplier_order_receipt_items_snapshot_fkey;
alter table public.supplier_order_receipt_items
  add constraint supplier_order_receipt_items_snapshot_fkey
  foreign key (supplier_purchase_order_item_id,venue_id)
  references public.supplier_purchase_order_items(id,venue_id) on delete cascade;

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  aggregate_type text not null check (aggregate_type = 'supplier_purchase_order'),
  aggregate_id uuid not null,
  event_type text not null check (event_type in (
    'supplier_order_confirmed',
    'supplier_order_received',
    'supplier_order_cancelled'
  )),
  integration_version text not null check (integration_version = '1.0'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending','processing','processed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (aggregate_type,aggregate_id,event_type,integration_version),
  foreign key (aggregate_id,venue_id)
    references public.supplier_purchase_orders(id,venue_id) on delete cascade
);

create index if not exists idx_supplier_purchase_orders_order
  on public.supplier_purchase_orders(purchase_order_id,status);
create index if not exists idx_supplier_purchase_orders_venue
  on public.supplier_purchase_orders(venue_id,updated_at desc);
create index if not exists idx_supplier_purchase_order_items_suborder
  on public.supplier_purchase_order_items(supplier_purchase_order_id,position);
create index if not exists idx_supplier_order_receipts_suborder
  on public.supplier_order_receipts(supplier_purchase_order_id,created_at desc);
create index if not exists idx_supplier_order_receipt_items_receipt
  on public.supplier_order_receipt_items(receipt_id);
create index if not exists idx_integration_outbox_pending
  on public.integration_outbox(status,created_at)
  where status in ('pending','failed');

-- Every supplier currently assigned to a draft has a persisted pending
-- sub-order. Draft rewrites may replace this provisional identity; after
-- confirmation the general order is immutable and the identity is permanent.
create or replace function public.sync_pending_supplier_order_from_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid;
begin
  if tg_op in ('DELETE','UPDATE') and old.supplier_id is not null
     and (
       tg_op='DELETE'
       or old.purchase_order_id is distinct from new.purchase_order_id
       or old.venue_id is distinct from new.venue_id
       or old.supplier_id is distinct from new.supplier_id
     )
     and not exists (
       select 1
       from public.purchase_order_items item
       where item.purchase_order_id=old.purchase_order_id
         and item.venue_id=old.venue_id
         and item.supplier_id=old.supplier_id
     ) then
    delete from public.supplier_purchase_orders supplier_order
    where supplier_order.purchase_order_id=old.purchase_order_id
      and supplier_order.venue_id=old.venue_id
      and supplier_order.supplier_id=old.supplier_id
      and supplier_order.status in ('pending','whatsapp_opened');
  end if;

  if tg_op in ('INSERT','UPDATE') and new.supplier_id is not null
     and (
       tg_op='INSERT'
       or old.purchase_order_id is distinct from new.purchase_order_id
       or old.venue_id is distinct from new.venue_id
       or old.supplier_id is distinct from new.supplier_id
     ) then
    select coalesce(auth.uid(),orders.updated_by,orders.created_by)
    into actor_id
    from public.purchase_orders orders
    where orders.id=new.purchase_order_id
      and orders.venue_id=new.venue_id;

    if actor_id is null then
      raise exception 'pending_supplier_order_actor_missing';
    end if;

    insert into public.supplier_purchase_orders(
      purchase_order_id,venue_id,supplier_id,status,updated_by
    ) values (
      new.purchase_order_id,new.venue_id,new.supplier_id,'pending',actor_id
    )
    on conflict (purchase_order_id,supplier_id) do nothing;
  end if;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists purchase_order_items_sync_pending_supplier
  on public.purchase_order_items;
create trigger purchase_order_items_sync_pending_supplier
after insert or delete or update of purchase_order_id,venue_id,supplier_id
on public.purchase_order_items
for each row execute function public.sync_pending_supplier_order_from_item();

do $$
begin
  if exists (
    select 1
    from public.purchase_order_items item
    join public.purchase_orders orders on orders.id=item.purchase_order_id
    where item.supplier_id is not null
      and coalesce(orders.updated_by,orders.created_by) is null
  ) then
    raise exception 'existing_pending_supplier_order_actor_missing';
  end if;
end $$;

insert into public.supplier_purchase_orders(
  purchase_order_id,venue_id,supplier_id,status,updated_by
)
select distinct
  orders.id,
  orders.venue_id,
  item.supplier_id,
  'pending',
  coalesce(orders.updated_by,orders.created_by)
from public.purchase_orders orders
join public.purchase_order_items item on item.purchase_order_id=orders.id
where item.supplier_id is not null
  and orders.status='draft'
on conflict (purchase_order_id,supplier_id) do nothing;

create or replace function public.purchase_order_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and not (
       (old.status='draft' and new.status in ('sent','cancelled'))
       or (old.status='sent' and new.status in ('partially_received','received','cancelled'))
       or (old.status='partially_received' and new.status in ('received','cancelled'))
     ) then
    raise exception 'invalid_purchase_order_status_transition:%->%',old.status,new.status;
  end if;

  if old.status<>'draft' and (
    old.department_id is distinct from new.department_id
    or old.mode is distinct from new.mode
    or old.general_notes is distinct from new.general_notes
    or old.requested_delivery_date is distinct from new.requested_delivery_date
    or old.version is distinct from new.version
    or old.created_by is distinct from new.created_by
  ) then
    raise exception 'non_draft_order_is_immutable';
  end if;

  return new;
end $$;

drop trigger if exists purchase_order_status_guard on public.purchase_orders;
create trigger purchase_order_status_guard
before update on public.purchase_orders
for each row execute function public.purchase_order_status_guard();

create or replace function public.supplier_purchase_order_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('received','cancelled') then
    raise exception 'terminal_supplier_order_is_immutable';
  end if;

  if old.status is distinct from new.status
     and not (
       (old.status='pending' and new.status in ('whatsapp_opened','sent_confirmed','cancelled'))
       or (old.status='whatsapp_opened' and new.status in ('sent_confirmed','cancelled'))
       or (old.status='sent_confirmed' and new.status in ('partially_received','received','cancelled'))
       or (old.status='partially_received' and new.status in ('received','cancelled'))
     ) then
    raise exception 'invalid_supplier_order_status_transition:%->%',old.status,new.status;
  end if;

  if old.status in ('sent_confirmed','partially_received') and (
    old.purchase_order_id is distinct from new.purchase_order_id
    or old.venue_id is distinct from new.venue_id
    or old.supplier_id is distinct from new.supplier_id
    or old.order_version is distinct from new.order_version
    or old.venue_name_snapshot is distinct from new.venue_name_snapshot
    or old.supplier_name_snapshot is distinct from new.supplier_name_snapshot
    or old.requested_delivery_date_snapshot is distinct from new.requested_delivery_date_snapshot
    or old.confirmed_at is distinct from new.confirmed_at
    or old.confirmed_by is distinct from new.confirmed_by
    or old.created_at is distinct from new.created_at
  ) then
    raise exception 'confirmed_supplier_order_snapshot_is_immutable';
  end if;

  return new;
end $$;

drop trigger if exists supplier_purchase_order_status_guard
  on public.supplier_purchase_orders;
create trigger supplier_purchase_order_status_guard
before update on public.supplier_purchase_orders
for each row execute function public.supplier_purchase_order_status_guard();

drop trigger if exists supplier_purchase_orders_set_updated_at
  on public.supplier_purchase_orders;
create trigger supplier_purchase_orders_set_updated_at
before update on public.supplier_purchase_orders
for each row execute function public.orders_set_updated_at();

create or replace function public.ensure_supplier_order_snapshot(
  p_supplier_purchase_order_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.supplier_purchase_orders%rowtype;
begin
  select * into target_order
  from public.supplier_purchase_orders
  where id=p_supplier_purchase_order_id
  for update;

  if not found or target_order.order_version is null then
    raise exception 'supplier_order_snapshot_header_missing';
  end if;

  if exists (
    select 1
    from public.supplier_purchase_order_items
    where supplier_purchase_order_id=target_order.id
  ) then
    return;
  end if;

  insert into public.supplier_purchase_order_items(
    supplier_purchase_order_id,
    venue_id,
    source_purchase_order_item_id,
    product_id,
    price_sentinel_product_id,
    product_name_snapshot,
    quantity,
    unit,
    package_note,
    supplier_name_snapshot,
    supplier_note,
    position
  )
  select
    target_order.id,
    poi.venue_id,
    poi.id,
    poi.product_id,
    p.price_sentinel_product_id,
    poi.product_name_snapshot,
    poi.quantity,
    poi.unit,
    poi.package_note,
    coalesce(target_order.supplier_name_snapshot,poi.supplier_name_snapshot),
    poi.supplier_note,
    poi.position
  from public.purchase_order_items poi
  left join public.products p
    on p.id=poi.product_id and p.venue_id=poi.venue_id
  where poi.purchase_order_id=target_order.purchase_order_id
    and poi.venue_id=target_order.venue_id
    and poi.supplier_id=target_order.supplier_id
  order by poi.position;

  if not found then
    raise exception 'supplier_order_has_no_items';
  end if;
end $$;

create or replace function public.build_supplier_order_payload(
  p_supplier_purchase_order_id uuid,
  p_event_type text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplier_order public.supplier_purchase_orders%rowtype;
  latest_receipt public.supplier_order_receipts%rowtype;
  payload jsonb;
begin
  select * into supplier_order
  from public.supplier_purchase_orders
  where id=p_supplier_purchase_order_id;
  if not found then
    raise exception 'supplier_order_not_found';
  end if;

  payload:=jsonb_build_object(
    'integration_version','1.0',
    'event_type',p_event_type,
    'liquidstock_order_id',supplier_order.purchase_order_id,
    'liquidstock_supplier_order_id',supplier_order.id,
    'venue_id',supplier_order.venue_id,
    'venue_name_snapshot',supplier_order.venue_name_snapshot,
    'supplier_id',supplier_order.supplier_id,
    'price_sentinel_supplier_id',(
      select s.price_sentinel_supplier_id
      from public.suppliers s
      where s.id=supplier_order.supplier_id
        and s.venue_id=supplier_order.venue_id
    ),
    'supplier_name_snapshot',supplier_order.supplier_name_snapshot,
    'sent_at',supplier_order.confirmed_at,
    'requested_delivery_date',supplier_order.requested_delivery_date_snapshot,
    'order_version',supplier_order.order_version,
    'rows',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id',snapshot.product_id,
          'price_sentinel_product_id',snapshot.price_sentinel_product_id,
          'product_name_snapshot',snapshot.product_name_snapshot,
          'quantity',snapshot.quantity,
          'unit',snapshot.unit,
          'package_note',snapshot.package_note,
          'supplier_note',snapshot.supplier_note
        )
        order by snapshot.position
      )
      from public.supplier_purchase_order_items snapshot
      where snapshot.supplier_purchase_order_id=supplier_order.id
    ),'[]'::jsonb)
  );

  if p_event_type='supplier_order_received' then
    select * into latest_receipt
    from public.supplier_order_receipts receipt
    where receipt.supplier_purchase_order_id=supplier_order.id
      and receipt.status='complete'
    order by receipt.created_at desc
    limit 1;

    payload:=payload||jsonb_build_object(
      'received_at',supplier_order.received_at,
      'receipt',jsonb_build_object(
        'status',latest_receipt.status,
        'items',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'supplier_order_item_id',item.supplier_purchase_order_item_id,
              'ordered_quantity',item.ordered_quantity_snapshot,
              'received_quantity',item.received_quantity,
              'missing_quantity',item.missing_quantity,
              'line_status',item.line_status,
              'note',item.note
            )
            order by snapshot.position
          )
          from public.supplier_order_receipt_items item
          join public.supplier_purchase_order_items snapshot
            on snapshot.id=item.supplier_purchase_order_item_id
          where item.receipt_id=latest_receipt.id
        ),'[]'::jsonb)
      )
    );
  elsif p_event_type='supplier_order_cancelled' then
    payload:=payload||jsonb_build_object(
      'cancelled_at',supplier_order.cancelled_at
    );
  end if;

  return payload;
end $$;

create or replace function public.enqueue_supplier_order_event(
  p_supplier_purchase_order_id uuid,
  p_event_type text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_venue_id uuid;
begin
  if p_event_type not in (
    'supplier_order_confirmed',
    'supplier_order_received',
    'supplier_order_cancelled'
  ) then
    raise exception 'unsupported_supplier_order_event';
  end if;

  select venue_id into target_venue_id
  from public.supplier_purchase_orders
  where id=p_supplier_purchase_order_id;
  if not found then
    raise exception 'supplier_order_not_found';
  end if;

  insert into public.integration_outbox(
    venue_id,
    aggregate_type,
    aggregate_id,
    event_type,
    integration_version,
    payload
  ) values (
    target_venue_id,
    'supplier_purchase_order',
    p_supplier_purchase_order_id,
    p_event_type,
    '1.0',
    public.build_supplier_order_payload(p_supplier_purchase_order_id,p_event_type)
  )
  on conflict (aggregate_type,aggregate_id,event_type,integration_version)
  do nothing;
end $$;

create or replace function public.recalculate_purchase_order_status(
  p_purchase_order_id uuid,
  p_updated_by uuid
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.purchase_orders%rowtype;
  target_status text;
  assigned_supplier_count integer;
  tracked_supplier_count integer;
  sent_count integer;
  partial_count integer;
  received_count integer;
  cancelled_count integer;
begin
  select * into target_order
  from public.purchase_orders
  where id=p_purchase_order_id
  for update;
  if not found then
    raise exception 'purchase_order_not_found';
  end if;

  if target_order.status in ('received','cancelled') then
    return target_order;
  end if;

  select count(distinct supplier_id) into assigned_supplier_count
  from public.purchase_order_items
  where purchase_order_id=target_order.id
    and supplier_id is not null;

  select
    count(*),
    count(*) filter (where spo.status='sent_confirmed'),
    count(*) filter (where spo.status='partially_received'),
    count(*) filter (where spo.status='received'),
    count(*) filter (where spo.status='cancelled')
  into
    tracked_supplier_count,
    sent_count,
    partial_count,
    received_count,
    cancelled_count
  from public.supplier_purchase_orders spo
  where spo.purchase_order_id=target_order.id
    and exists (
      select 1
      from public.purchase_order_items poi
      where poi.purchase_order_id=target_order.id
        and poi.supplier_id=spo.supplier_id
    );

  if assigned_supplier_count>0
     and tracked_supplier_count=assigned_supplier_count
     and cancelled_count=assigned_supplier_count then
    target_status:='cancelled';
  elsif received_count>0
        and tracked_supplier_count=assigned_supplier_count
        and received_count+cancelled_count=assigned_supplier_count then
    target_status:='received';
  elsif received_count>0 or partial_count>0 then
    target_status:='partially_received';
  elsif sent_count>0 then
    target_status:='sent';
  else
    target_status:='draft';
  end if;

  if target_order.status='sent' and target_status='draft' then
    target_status:='sent';
  elsif target_order.status='partially_received'
        and target_status in ('draft','sent') then
    target_status:='partially_received';
  end if;

  if target_order.status is distinct from target_status then
    update public.purchase_orders
    set status=target_status,
        updated_by=p_updated_by,
        updated_at=now()
    where id=target_order.id
    returning * into target_order;
  end if;

  return target_order;
end $$;

create or replace function public.record_whatsapp_opened(
  p_purchase_order_id uuid,
  p_venue_id uuid,
  p_supplier_id uuid,
  p_order_version integer,
  p_whatsapp_number_snapshot text,
  p_message_snapshot text
) returns public.supplier_order_dispatches
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid:=auth.uid();
  recorded_event public.supplier_order_dispatches%rowtype;
  supplier_order public.supplier_purchase_orders%rowtype;
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
      and po.status in ('draft','sent','partially_received')
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

  insert into public.supplier_purchase_orders(
    purchase_order_id,
    venue_id,
    supplier_id,
    status,
    updated_by
  ) values (
    p_purchase_order_id,
    p_venue_id,
    p_supplier_id,
    'pending',
    caller_id
  )
  on conflict (purchase_order_id,supplier_id) do nothing;

  select * into supplier_order
  from public.supplier_purchase_orders
  where purchase_order_id=p_purchase_order_id
    and venue_id=p_venue_id
    and supplier_id=p_supplier_id
  for update;

  if supplier_order.status not in ('pending','whatsapp_opened') then
    raise exception 'whatsapp_opening_not_allowed_after_confirmation';
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

  update public.supplier_purchase_orders
  set status='whatsapp_opened',
      sent_at=now(),
      updated_by=caller_id,
      updated_at=now()
  where id=supplier_order.id;

  return recorded_event;
end $$;

create or replace function public.confirm_supplier_order_sent(
  p_purchase_order_id uuid,
  p_venue_id uuid,
  p_supplier_id uuid,
  p_expected_version integer
) returns public.supplier_purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid:=auth.uid();
  target_order public.purchase_orders%rowtype;
  supplier_order public.supplier_purchase_orders%rowtype;
begin
  if caller_id is null
     or not public.has_order_permission(p_venue_id,'can_send_whatsapp_orders') then
    raise exception 'supplier_order_confirmation_forbidden';
  end if;

  select * into target_order
  from public.purchase_orders
  where id=p_purchase_order_id
  for update;

  if not found
     or target_order.venue_id<>p_venue_id
     or target_order.status not in ('draft','sent','partially_received')
     or target_order.version<>p_expected_version then
    raise exception 'supplier_order_confirmation_version_conflict';
  end if;

  if not exists (
    select 1
    from public.purchase_order_items
    where purchase_order_id=target_order.id
      and venue_id=p_venue_id
      and supplier_id=p_supplier_id
  ) then
    raise exception 'supplier_not_assigned_to_order';
  end if;

  insert into public.supplier_purchase_orders(
    purchase_order_id,venue_id,supplier_id,status,updated_by
  ) values (
    target_order.id,p_venue_id,p_supplier_id,'pending',caller_id
  )
  on conflict (purchase_order_id,supplier_id) do nothing;

  select * into supplier_order
  from public.supplier_purchase_orders
  where purchase_order_id=target_order.id
    and supplier_id=p_supplier_id
  for update;

  if supplier_order.status in ('sent_confirmed','partially_received','received')
     and supplier_order.order_version=p_expected_version then
    return supplier_order;
  end if;
  if supplier_order.status='cancelled' then
    raise exception 'cancelled_supplier_order_is_terminal';
  end if;

  update public.supplier_purchase_orders spo
  set status='sent_confirmed',
      order_version=target_order.version,
      venue_name_snapshot=v.name,
      supplier_name_snapshot=s.name,
      requested_delivery_date_snapshot=target_order.requested_delivery_date,
      sent_at=coalesce(spo.sent_at,now()),
      confirmed_at=now(),
      confirmed_by=caller_id,
      updated_by=caller_id,
      updated_at=now()
  from public.venues v,public.suppliers s
  where spo.id=supplier_order.id
    and v.id=target_order.venue_id
    and s.id=spo.supplier_id
    and s.venue_id=spo.venue_id
  returning spo.* into supplier_order;

  perform public.ensure_supplier_order_snapshot(supplier_order.id);
  perform public.enqueue_supplier_order_event(
    supplier_order.id,
    'supplier_order_confirmed'
  );
  perform public.recalculate_purchase_order_status(target_order.id,caller_id);

  return supplier_order;
end $$;

create or replace function public.record_supplier_order_receipt(
  p_supplier_purchase_order_id uuid,
  p_venue_id uuid,
  p_order_version integer,
  p_items jsonb,
  p_idempotency_key uuid
) returns public.supplier_order_receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid:=auth.uid();
  supplier_order public.supplier_purchase_orders%rowtype;
  existing_receipt public.supplier_order_receipts%rowtype;
  saved_receipt public.supplier_order_receipts%rowtype;
  item_record record;
  snapshot_count integer;
  submitted_count integer;
  submitted_distinct_count integer;
  is_complete boolean;
begin
  if caller_id is null
     or not public.has_order_permission(p_venue_id,'can_manage_orders') then
    raise exception 'supplier_order_receipt_forbidden';
  end if;
  if p_idempotency_key is null then
    raise exception 'receipt_idempotency_key_required';
  end if;

  select * into supplier_order
  from public.supplier_purchase_orders
  where id=p_supplier_purchase_order_id
    and venue_id=p_venue_id
  for update;
  if not found then
    raise exception 'supplier_order_not_found';
  end if;

  select * into existing_receipt
  from public.supplier_order_receipts
  where supplier_purchase_order_id=supplier_order.id
    and idempotency_key=p_idempotency_key;
  if found then
    return existing_receipt;
  end if;

  if supplier_order.status not in ('sent_confirmed','partially_received')
     or supplier_order.order_version<>p_order_version then
    raise exception 'supplier_order_receipt_version_conflict';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'receipt_items_must_be_array';
  end if;

  select count(*) into snapshot_count
  from public.supplier_purchase_order_items
  where supplier_purchase_order_id=supplier_order.id;

  select
    count(*),
    count(distinct nullif(item.value->>'supplier_order_item_id','')::uuid)
  into submitted_count,submitted_distinct_count
  from jsonb_array_elements(p_items) item(value);

  if snapshot_count=0
     or submitted_count<>snapshot_count
     or submitted_distinct_count<>snapshot_count
     or exists (
       select 1
       from jsonb_array_elements(p_items) item(value)
       left join public.supplier_purchase_order_items snapshot
         on snapshot.id=nullif(item.value->>'supplier_order_item_id','')::uuid
        and snapshot.supplier_purchase_order_id=supplier_order.id
       where snapshot.id is null
          or nullif(item.value->>'received_quantity','')::numeric is null
          or nullif(item.value->>'received_quantity','')::numeric<0
     ) then
    raise exception 'receipt_items_do_not_match_snapshot';
  end if;

  select bool_and(
    nullif(item.value->>'received_quantity','')::numeric>=snapshot.quantity
  ) into is_complete
  from jsonb_array_elements(p_items) item(value)
  join public.supplier_purchase_order_items snapshot
    on snapshot.id=nullif(item.value->>'supplier_order_item_id','')::uuid
   and snapshot.supplier_purchase_order_id=supplier_order.id;

  insert into public.supplier_order_receipts(
    supplier_purchase_order_id,
    venue_id,
    idempotency_key,
    order_version,
    status,
    declared_by
  ) values (
    supplier_order.id,
    p_venue_id,
    p_idempotency_key,
    p_order_version,
    case when is_complete then 'complete' else 'partial' end,
    caller_id
  )
  returning * into saved_receipt;

  for item_record in
    select
      snapshot.id as snapshot_item_id,
      snapshot.quantity as ordered_quantity,
      nullif(item.value->>'received_quantity','')::numeric as received_quantity,
      nullif(btrim(item.value->>'note'),'') as note
    from jsonb_array_elements(p_items) item(value)
    join public.supplier_purchase_order_items snapshot
      on snapshot.id=nullif(item.value->>'supplier_order_item_id','')::uuid
     and snapshot.supplier_purchase_order_id=supplier_order.id
  loop
    insert into public.supplier_order_receipt_items(
      receipt_id,
      venue_id,
      supplier_purchase_order_item_id,
      ordered_quantity_snapshot,
      received_quantity,
      missing_quantity,
      note,
      line_status
    ) values (
      saved_receipt.id,
      p_venue_id,
      item_record.snapshot_item_id,
      item_record.ordered_quantity,
      item_record.received_quantity,
      greatest(item_record.ordered_quantity-item_record.received_quantity,0),
      item_record.note,
      case
        when item_record.received_quantity=0 then 'not_delivered'
        when item_record.received_quantity>item_record.ordered_quantity then 'over_received'
        when item_record.received_quantity=item_record.ordered_quantity then 'received'
        else 'partial'
      end
    );
  end loop;

  update public.supplier_purchase_orders
  set status=case when is_complete then 'received' else 'partially_received' end,
      received_at=case when is_complete then now() else received_at end,
      updated_by=caller_id,
      updated_at=now()
  where id=supplier_order.id;

  if is_complete then
    perform public.enqueue_supplier_order_event(
      supplier_order.id,
      'supplier_order_received'
    );
  end if;
  perform public.recalculate_purchase_order_status(
    supplier_order.purchase_order_id,
    caller_id
  );

  return saved_receipt;
end $$;

create or replace function public.cancel_supplier_order(
  p_purchase_order_id uuid,
  p_venue_id uuid,
  p_supplier_id uuid,
  p_expected_version integer
) returns public.supplier_purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid:=auth.uid();
  target_order public.purchase_orders%rowtype;
  supplier_order public.supplier_purchase_orders%rowtype;
begin
  if caller_id is null
     or not public.has_order_permission(p_venue_id,'can_manage_orders') then
    raise exception 'supplier_order_cancellation_forbidden';
  end if;

  select * into target_order
  from public.purchase_orders
  where id=p_purchase_order_id
  for update;
  if not found
     or target_order.venue_id<>p_venue_id
     or target_order.version<>p_expected_version
     or target_order.status='received' then
    raise exception 'supplier_order_cancellation_version_conflict';
  end if;

  if not exists (
    select 1
    from public.purchase_order_items
    where purchase_order_id=target_order.id
      and venue_id=p_venue_id
      and supplier_id=p_supplier_id
  ) then
    raise exception 'supplier_not_assigned_to_order';
  end if;

  insert into public.supplier_purchase_orders(
    purchase_order_id,venue_id,supplier_id,status,updated_by
  ) values (
    target_order.id,p_venue_id,p_supplier_id,'pending',caller_id
  )
  on conflict (purchase_order_id,supplier_id) do nothing;

  select * into supplier_order
  from public.supplier_purchase_orders
  where purchase_order_id=target_order.id
    and supplier_id=p_supplier_id
  for update;

  if supplier_order.status='cancelled' then
    return supplier_order;
  elsif supplier_order.status='received' then
    raise exception 'received_supplier_order_is_terminal';
  end if;

  update public.supplier_purchase_orders spo
  set order_version=coalesce(spo.order_version,target_order.version),
      venue_name_snapshot=coalesce(spo.venue_name_snapshot,v.name),
      supplier_name_snapshot=coalesce(spo.supplier_name_snapshot,s.name),
      requested_delivery_date_snapshot=coalesce(
        spo.requested_delivery_date_snapshot,
        target_order.requested_delivery_date
      ),
      updated_by=caller_id,
      updated_at=now()
  from public.venues v,public.suppliers s
  where spo.id=supplier_order.id
    and v.id=target_order.venue_id
    and s.id=spo.supplier_id
    and s.venue_id=spo.venue_id
  returning spo.* into supplier_order;

  perform public.ensure_supplier_order_snapshot(supplier_order.id);

  update public.supplier_purchase_orders
  set status='cancelled',
      cancelled_at=now(),
      updated_by=caller_id,
      updated_at=now()
  where id=supplier_order.id
  returning * into supplier_order;

  perform public.enqueue_supplier_order_event(
    supplier_order.id,
    'supplier_order_cancelled'
  );
  perform public.recalculate_purchase_order_status(target_order.id,caller_id);

  return supplier_order;
end $$;

create or replace function public.cancel_purchase_order(
  p_purchase_order_id uuid,
  p_venue_id uuid,
  p_expected_version integer
) returns public.purchase_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid:=auth.uid();
  target_order public.purchase_orders%rowtype;
  supplier_record record;
  supplier_order public.supplier_purchase_orders%rowtype;
begin
  if caller_id is null
     or not public.has_order_permission(p_venue_id,'can_manage_orders') then
    raise exception 'purchase_order_cancellation_forbidden';
  end if;

  select * into target_order
  from public.purchase_orders
  where id=p_purchase_order_id
  for update;
  if not found
     or target_order.venue_id<>p_venue_id
     or target_order.version<>p_expected_version
     or target_order.status='received' then
    raise exception 'purchase_order_cancellation_version_conflict';
  end if;
  if target_order.status='cancelled' then
    return target_order;
  end if;

  for supplier_record in
    select distinct poi.supplier_id
    from public.purchase_order_items poi
    where poi.purchase_order_id=target_order.id
      and poi.supplier_id is not null
  loop
    insert into public.supplier_purchase_orders(
      purchase_order_id,venue_id,supplier_id,status,updated_by
    ) values (
      target_order.id,p_venue_id,supplier_record.supplier_id,'pending',caller_id
    )
    on conflict (purchase_order_id,supplier_id) do nothing;

    select * into supplier_order
    from public.supplier_purchase_orders
    where purchase_order_id=target_order.id
      and supplier_id=supplier_record.supplier_id
    for update;

    if supplier_order.status not in ('received','cancelled') then
      update public.supplier_purchase_orders spo
      set order_version=coalesce(spo.order_version,target_order.version),
          venue_name_snapshot=coalesce(spo.venue_name_snapshot,v.name),
          supplier_name_snapshot=coalesce(spo.supplier_name_snapshot,s.name),
          requested_delivery_date_snapshot=coalesce(
            spo.requested_delivery_date_snapshot,
            target_order.requested_delivery_date
          ),
          updated_by=caller_id,
          updated_at=now()
      from public.venues v,public.suppliers s
      where spo.id=supplier_order.id
        and v.id=target_order.venue_id
        and s.id=spo.supplier_id
        and s.venue_id=spo.venue_id
      returning spo.* into supplier_order;

      perform public.ensure_supplier_order_snapshot(supplier_order.id);

      update public.supplier_purchase_orders
      set status='cancelled',
          cancelled_at=now(),
          updated_by=caller_id,
          updated_at=now()
      where id=supplier_order.id;

      perform public.enqueue_supplier_order_event(
        supplier_order.id,
        'supplier_order_cancelled'
      );
    end if;
  end loop;

  update public.purchase_orders
  set status='cancelled',
      updated_by=caller_id,
      updated_at=now()
  where id=target_order.id
  returning * into target_order;

  return target_order;
end $$;

alter table public.supplier_purchase_orders enable row level security;
alter table public.supplier_purchase_order_items enable row level security;
alter table public.supplier_order_receipts enable row level security;
alter table public.supplier_order_receipt_items enable row level security;
alter table public.integration_outbox enable row level security;

drop policy if exists supplier_purchase_orders_select
  on public.supplier_purchase_orders;
create policy supplier_purchase_orders_select
on public.supplier_purchase_orders for select to authenticated
using (public.has_order_permission(venue_id,'can_create_manual_orders'));

drop policy if exists supplier_purchase_order_items_select
  on public.supplier_purchase_order_items;
create policy supplier_purchase_order_items_select
on public.supplier_purchase_order_items for select to authenticated
using (public.has_order_permission(venue_id,'can_create_manual_orders'));

drop policy if exists supplier_order_receipts_select
  on public.supplier_order_receipts;
create policy supplier_order_receipts_select
on public.supplier_order_receipts for select to authenticated
using (public.has_order_permission(venue_id,'can_create_manual_orders'));

drop policy if exists supplier_order_receipt_items_select
  on public.supplier_order_receipt_items;
create policy supplier_order_receipt_items_select
on public.supplier_order_receipt_items for select to authenticated
using (public.has_order_permission(venue_id,'can_create_manual_orders'));

revoke all on public.supplier_purchase_orders,
  public.supplier_purchase_order_items,
  public.supplier_order_receipts,
  public.supplier_order_receipt_items,
  public.integration_outbox
from public,anon,authenticated;

grant select on public.supplier_purchase_orders,
  public.supplier_purchase_order_items,
  public.supplier_order_receipts,
  public.supplier_order_receipt_items
to authenticated;

grant all on public.supplier_purchase_orders,
  public.supplier_purchase_order_items,
  public.supplier_order_receipts,
  public.supplier_order_receipt_items,
  public.integration_outbox
to service_role;

revoke all on function public.ensure_supplier_order_snapshot(uuid)
  from public,anon,authenticated;
revoke all on function public.build_supplier_order_payload(uuid,text)
  from public,anon,authenticated;
revoke all on function public.enqueue_supplier_order_event(uuid,text)
  from public,anon,authenticated;
revoke all on function public.recalculate_purchase_order_status(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.sync_pending_supplier_order_from_item()
  from public,anon,authenticated;

revoke all on function public.confirm_supplier_order_sent(uuid,uuid,uuid,integer)
  from public,anon;
revoke all on function public.record_supplier_order_receipt(uuid,uuid,integer,jsonb,uuid)
  from public,anon;
revoke all on function public.cancel_supplier_order(uuid,uuid,uuid,integer)
  from public,anon;
revoke all on function public.cancel_purchase_order(uuid,uuid,integer)
  from public,anon;

grant execute on function public.confirm_supplier_order_sent(uuid,uuid,uuid,integer)
  to authenticated,service_role;
grant execute on function public.record_supplier_order_receipt(uuid,uuid,integer,jsonb,uuid)
  to authenticated,service_role;
grant execute on function public.cancel_supplier_order(uuid,uuid,uuid,integer)
  to authenticated,service_role;
grant execute on function public.cancel_purchase_order(uuid,uuid,integer)
  to authenticated,service_role;

commit;
