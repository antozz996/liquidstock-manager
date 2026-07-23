-- Roll Sprint 2 back to the exact Sprint 1 permission and order model.

begin;

revoke all on function public.record_whatsapp_opened(uuid,uuid,uuid,integer,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.set_order_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean)
  from public,anon,authenticated,service_role;

drop function if exists public.record_whatsapp_opened(uuid,uuid,uuid,integer,text,text);
drop function if exists public.set_order_permissions(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean);

drop table if exists public.supplier_order_dispatches;

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

drop policy if exists order_permissions_insert on public.order_permissions;
drop policy if exists order_permissions_update on public.order_permissions;
drop policy if exists order_permissions_delete on public.order_permissions;

create policy order_permissions_insert on public.order_permissions for insert to authenticated
with check (public.can_manage_venue(venue_id));
create policy order_permissions_update on public.order_permissions for update to authenticated
using (public.can_manage_venue(venue_id)) with check (public.can_manage_venue(venue_id));
create policy order_permissions_delete on public.order_permissions for delete to authenticated
using (public.can_manage_venue(venue_id));

grant insert,update,delete on public.order_permissions to authenticated;
grant execute on function public.has_order_permission(uuid,text) to authenticated,service_role;

commit;
