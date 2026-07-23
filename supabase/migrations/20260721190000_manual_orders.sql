-- Sprint 1: manual, multi-supplier purchase-order drafts.
-- This migration never reads or updates products.current_stock.

begin;

set local statement_timeout = '120s';
set local lock_timeout = '15s';

do $$
begin
  if to_regprocedure('public.has_venue_access(uuid)') is null
     or to_regprocedure('public.can_manage_venue(uuid)') is null then
    raise exception 'manual_orders_requires_security_hardening';
  end if;
end $$;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id,name),
  unique (id,venue_id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  contact_name text,
  whatsapp_number text,
  is_active boolean not null default true,
  price_sentinel_supplier_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id,name),
  unique (id,venue_id)
);

create table public.order_permissions (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_create_manual_orders boolean not null default false,
  can_create_stock_orders boolean not null default false,
  can_manage_orders boolean not null default false,
  can_send_whatsapp_orders boolean not null default false,
  can_view_purchase_prices boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,venue_id),
  foreign key (user_id,venue_id)
    references public.venue_access(user_id,venue_id) on delete cascade
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null check (btrim(order_code) <> ''),
  venue_id uuid not null references public.venues(id) on delete cascade,
  department_id uuid not null,
  mode text not null default 'manual' check (mode = 'manual'),
  status text not null default 'draft' check (status = 'draft'),
  general_notes text,
  requested_delivery_date date,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id,order_code),
  unique (id,venue_id),
  foreign key (department_id,venue_id)
    references public.departments(id,venue_id) on delete restrict
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.products'::regclass
      and conname='products_id_venue_id_key'
  ) then
    alter table public.products
      add constraint products_id_venue_id_key unique (id,venue_id);
  end if;
end $$;

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null,
  venue_id uuid not null,
  product_id uuid,
  product_name_snapshot text not null check (btrim(product_name_snapshot) <> ''),
  quantity numeric not null check (quantity > 0),
  unit text not null check (btrim(unit) <> ''),
  package_note text,
  supplier_id uuid,
  supplier_name_snapshot text,
  supplier_note text,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_order_id,position),
  foreign key (purchase_order_id,venue_id)
    references public.purchase_orders(id,venue_id) on delete cascade,
  foreign key (product_id,venue_id)
    references public.products(id,venue_id) on delete restrict,
  foreign key (supplier_id,venue_id)
    references public.suppliers(id,venue_id) on delete restrict
);

create index idx_departments_venue_active on public.departments(venue_id,is_active,name);
create index idx_suppliers_venue_active on public.suppliers(venue_id,is_active,name);
create index idx_order_permissions_venue on public.order_permissions(venue_id,user_id) where is_active;
create index idx_purchase_orders_venue_status_updated on public.purchase_orders(venue_id,status,updated_at desc);
create index idx_purchase_order_items_order on public.purchase_order_items(purchase_order_id,position);
create index idx_purchase_order_items_supplier on public.purchase_order_items(venue_id,supplier_id);

create or replace function public.orders_set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at=now();
  return new;
end $$;

create trigger departments_set_updated_at before update on public.departments
for each row execute function public.orders_set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function public.orders_set_updated_at();
create trigger order_permissions_set_updated_at before update on public.order_permissions
for each row execute function public.orders_set_updated_at();
create trigger purchase_orders_set_updated_at before update on public.purchase_orders
for each row execute function public.orders_set_updated_at();
create trigger purchase_order_items_set_updated_at before update on public.purchase_order_items
for each row execute function public.orders_set_updated_at();

create or replace function public.has_order_permission(
  target_venue_id uuid,
  permission_name text
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and (
      public.check_is_super_admin()
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

create or replace function public.save_purchase_order_draft(
  p_venue_id uuid,
  p_department_id uuid,
  p_items jsonb,
  p_general_notes text default null,
  p_requested_delivery_date date default null,
  p_order_id uuid default null,
  p_expected_version integer default null
) returns public.purchase_orders
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid:=auth.uid();
  saved_order public.purchase_orders%rowtype;
  existing_order public.purchase_orders%rowtype;
  item_record record;
  resolved_product_name text;
  resolved_supplier_name text;
  new_order_id uuid;
begin
  if caller_id is null or not public.has_order_permission(p_venue_id,'can_create_manual_orders') then
    raise exception 'manual_order_forbidden';
  end if;
  if p_venue_id is null or p_department_id is null
     or not exists (
       select 1 from public.departments d
       where d.id=p_department_id and d.venue_id=p_venue_id and (d.is_active or p_order_id is not null)
     ) then
    raise exception 'invalid_department_for_venue';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'manual_order_requires_items';
  end if;

  if p_order_id is null then
    new_order_id:=gen_random_uuid();
    insert into public.purchase_orders(
      id,order_code,venue_id,department_id,general_notes,requested_delivery_date,created_by,updated_by
    ) values (
      new_order_id,
      'ORD-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(new_order_id::text,'-',''),1,8)),
      p_venue_id,p_department_id,nullif(btrim(p_general_notes),''),p_requested_delivery_date,caller_id,caller_id
    ) returning * into saved_order;
  else
    select po.* into existing_order
    from public.purchase_orders po
    where po.id=p_order_id
    for update;
    if not found or existing_order.venue_id<>p_venue_id or existing_order.status<>'draft' then
      raise exception 'draft_not_available';
    end if;
    if existing_order.created_by is distinct from caller_id
       and not public.has_order_permission(p_venue_id,'can_manage_orders') then
      raise exception 'draft_update_forbidden';
    end if;
    if p_expected_version is null or existing_order.version<>p_expected_version then
      raise exception 'order_version_conflict';
    end if;
    update public.purchase_orders po
    set department_id=p_department_id,
        general_notes=nullif(btrim(p_general_notes),''),
        requested_delivery_date=p_requested_delivery_date,
        version=po.version+1,
        updated_by=caller_id,
        updated_at=now()
    where po.id=p_order_id
    returning * into saved_order;
    delete from public.purchase_order_items poi where poi.purchase_order_id=p_order_id;
  end if;

  for item_record in
    select
      nullif(item.value->>'product_id','')::uuid as product_id,
      item.value->>'product_name_snapshot' as product_name_snapshot,
      nullif(item.value->>'quantity','')::numeric as quantity,
      item.value->>'unit' as unit,
      item.value->>'package_note' as package_note,
      nullif(item.value->>'supplier_id','')::uuid as supplier_id,
      item.value->>'supplier_name_snapshot' as supplier_name_snapshot,
      item.value->>'supplier_note' as supplier_note,
      (item.ordinality-1)::integer as position
    from jsonb_array_elements(p_items) with ordinality item(value,ordinality)
  loop
    if item_record.quantity is null or item_record.quantity<=0 then
      raise exception 'invalid_item_quantity';
    end if;
    if nullif(btrim(item_record.unit),'') is null then
      raise exception 'invalid_item_unit';
    end if;

    if item_record.product_id is not null then
      select p.name into resolved_product_name
      from public.products p
      where p.id=item_record.product_id and p.venue_id=p_venue_id;
      if not found then raise exception 'invalid_product_for_venue'; end if;
    else
      resolved_product_name:=nullif(btrim(item_record.product_name_snapshot),'');
      if resolved_product_name is null then raise exception 'free_item_requires_name'; end if;
    end if;

    if item_record.supplier_id is not null then
      select s.name into resolved_supplier_name
      from public.suppliers s
      where s.id=item_record.supplier_id and s.venue_id=p_venue_id;
      if not found then raise exception 'invalid_supplier_for_venue'; end if;
    else
      resolved_supplier_name:=nullif(btrim(item_record.supplier_name_snapshot),'');
    end if;

    insert into public.purchase_order_items(
      purchase_order_id,venue_id,product_id,product_name_snapshot,quantity,unit,
      package_note,supplier_id,supplier_name_snapshot,supplier_note,position
    ) values (
      saved_order.id,p_venue_id,item_record.product_id,resolved_product_name,item_record.quantity,btrim(item_record.unit),
      nullif(btrim(item_record.package_note),''),item_record.supplier_id,resolved_supplier_name,
      nullif(btrim(item_record.supplier_note),''),item_record.position
    );
  end loop;

  return saved_order;
end $$;

insert into public.departments(venue_id,name)
select v.id,'Generale' from public.venues v
on conflict (venue_id,name) do nothing;

insert into public.order_permissions(
  venue_id,user_id,can_create_manual_orders,can_manage_orders,is_active
)
select va.venue_id,va.user_id,true,true,true
from public.venue_access va
join public.profiles p on p.id=va.user_id
where p.role in ('admin','super_admin')
on conflict (user_id,venue_id) do update set
  can_create_manual_orders=true,
  can_manage_orders=true,
  is_active=true,
  updated_at=now();

alter table public.departments enable row level security;
alter table public.suppliers enable row level security;
alter table public.order_permissions enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

create policy departments_select on public.departments for select to authenticated
using (public.has_order_permission(venue_id,'can_create_manual_orders'));
create policy departments_manage on public.departments for all to authenticated
using (public.can_manage_venue(venue_id)) with check (public.can_manage_venue(venue_id));

create policy suppliers_select on public.suppliers for select to authenticated
using (public.has_order_permission(venue_id,'can_create_manual_orders'));
create policy suppliers_insert on public.suppliers for insert to authenticated
with check (public.has_order_permission(venue_id,'can_create_manual_orders'));
create policy suppliers_update on public.suppliers for update to authenticated
using (public.has_order_permission(venue_id,'can_manage_orders'))
with check (public.has_order_permission(venue_id,'can_manage_orders'));
create policy suppliers_delete on public.suppliers for delete to authenticated
using (public.has_order_permission(venue_id,'can_manage_orders'));

create policy order_permissions_select on public.order_permissions for select to authenticated
using (user_id=auth.uid() or public.can_manage_venue(venue_id));
create policy order_permissions_insert on public.order_permissions for insert to authenticated
with check (public.can_manage_venue(venue_id));
create policy order_permissions_update on public.order_permissions for update to authenticated
using (public.can_manage_venue(venue_id)) with check (public.can_manage_venue(venue_id));
create policy order_permissions_delete on public.order_permissions for delete to authenticated
using (public.can_manage_venue(venue_id));

create policy purchase_orders_select on public.purchase_orders for select to authenticated
using (public.has_order_permission(venue_id,'can_create_manual_orders'));
create policy purchase_orders_delete on public.purchase_orders for delete to authenticated
using (
  status='draft'
  and public.has_order_permission(venue_id,'can_create_manual_orders')
  and (created_by=auth.uid() or public.has_order_permission(venue_id,'can_manage_orders'))
);

create policy purchase_order_items_select on public.purchase_order_items for select to authenticated
using (
  public.has_order_permission(venue_id,'can_create_manual_orders')
  and exists (
    select 1 from public.purchase_orders po
    where po.id=purchase_order_id and po.venue_id=purchase_order_items.venue_id
  )
);

revoke all on public.departments,public.suppliers,public.order_permissions,
  public.purchase_orders,public.purchase_order_items from public,anon;
revoke all on function public.has_order_permission(uuid,text) from public,anon;
revoke all on function public.save_purchase_order_draft(uuid,uuid,jsonb,text,date,uuid,integer) from public,anon;

grant select on public.departments,public.suppliers,public.order_permissions,
  public.purchase_orders,public.purchase_order_items to authenticated;
grant insert,update,delete on public.departments,public.suppliers,public.order_permissions to authenticated;
grant delete on public.purchase_orders to authenticated;
grant execute on function public.has_order_permission(uuid,text) to authenticated;
grant execute on function public.save_purchase_order_draft(uuid,uuid,jsonb,text,date,uuid,integer) to authenticated;

grant all on public.departments,public.suppliers,public.order_permissions,
  public.purchase_orders,public.purchase_order_items to service_role;
grant execute on function public.has_order_permission(uuid,text) to service_role;
grant execute on function public.save_purchase_order_draft(uuid,uuid,jsonb,text,date,uuid,integer) to service_role;

commit;
