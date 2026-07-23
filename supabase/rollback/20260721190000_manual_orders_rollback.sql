-- Roll back Sprint 1 manual orders. Existing inventory tables and stock values
-- are not changed, except for removal of the supporting composite unique key.

begin;

drop function if exists public.save_purchase_order_draft(uuid,uuid,jsonb,text,date,uuid,integer);

drop table if exists public.purchase_order_items;
drop table if exists public.purchase_orders;
drop table if exists public.order_permissions;
drop table if exists public.suppliers;
drop table if exists public.departments;

drop function if exists public.has_order_permission(uuid,text);
drop function if exists public.orders_set_updated_at();
alter table public.products drop constraint if exists products_id_venue_id_key;

commit;
