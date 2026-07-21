-- Roll back Sprint 0 to the hosted schema represented by .tmp/hosted_schema.sql.
-- This intentionally restores the insecure legacy policies; use only for controlled rollback.

begin;

do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public'
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

drop trigger if exists trg_enforce_profile_update_security on public.profiles;
drop trigger if exists trg_enforce_product_update_security on public.products;
drop trigger if exists trg_event_stocks_same_venue on public.event_stocks;
drop trigger if exists trg_restock_items_same_venue on public.restock_items;
drop trigger if exists trg_strip_untrusted_auth_metadata on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.strip_untrusted_auth_metadata();

drop function if exists public.remove_user_from_venue(uuid,uuid);
drop function if exists public.get_my_accessible_venues();
drop function if exists public.consume_registration_invite(text,uuid,text);
drop function if exists public.create_registration_invite_record(uuid,uuid,text,timestamptz);
drop function if exists public.revoke_registration_invite_record(uuid,uuid,uuid);
drop function if exists public.enforce_registration_rate_limit(text,text,text);
drop function if exists public.begin_registration_invite(text);
drop function if exists public.release_registration_reservation(uuid);
drop function if exists public.enforce_profile_update_security();
drop function if exists public.enforce_product_update_security();
drop function if exists public.enforce_child_venue_security();
drop function if exists public.can_write_venue(uuid);
drop function if exists public.can_manage_venue(uuid);
drop function if exists public.can_access_venue(uuid);
drop function if exists public.has_venue_access(uuid);
drop function if exists public.current_user_role();
drop table if exists public.registration_rate_limits;
drop table if exists public.registration_invites;

drop index if exists public.idx_products_venue_id;
drop index if exists public.idx_events_venue_id;
drop index if exists public.idx_reports_venue_id;
drop index if exists public.idx_restock_sessions_venue_id;
drop index if exists public.idx_activity_log_venue_id;
drop index if exists public.idx_restock_log_venue_id;
drop index if exists public.idx_event_stocks_event_id;
drop index if exists public.idx_restock_items_session_id;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.restock_log drop constraint if exists restock_log_venue_id_fkey;
alter table public.restock_log drop column if exists venue_id;

alter table public.products alter column venue_id drop not null;
alter table public.events alter column venue_id drop not null;
alter table public.reports alter column venue_id drop not null;
alter table public.reports alter column event_id drop not null;
alter table public.restock_sessions alter column venue_id drop not null;
alter table public.activity_log alter column venue_id drop not null;
alter table public.venue_access alter column user_id drop not null;
alter table public.venue_access alter column venue_id drop not null;
alter table public.event_stocks alter column event_id drop not null;
alter table public.event_stocks alter column product_id drop not null;
alter table public.restock_items alter column session_id drop not null;
alter table public.restock_items alter column product_id drop not null;
alter table public.restock_log alter column product_id drop not null;
alter table public.report_edit_log alter column report_id drop not null;

create or replace function public.check_is_super_admin() returns boolean
language plpgsql security definer as $$
begin
  return exists (select 1 from public.profiles where id=auth.uid() and role='super_admin');
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
declare v_venue_id uuid;
begin
  begin v_venue_id := nullif(new.raw_user_meta_data->>'venue_id','')::uuid;
  exception when others then v_venue_id := null; end;
  insert into public.profiles(id,full_name,role,venue_id)
  values (new.id,coalesce(new.raw_user_meta_data->>'full_name','Nuovo Utente'),
    coalesce(new.raw_user_meta_data->>'role','staff'),v_venue_id);
  return new;
end $$;

create or replace function public.handle_user_delete() returns trigger
language plpgsql security definer as $$
begin
  delete from auth.users where id=old.id;
  return old;
end $$;

create or replace function public.sync_name_to_auth_metadata() returns trigger
language plpgsql security definer as $$
begin
  update auth.users set raw_user_meta_data=
    case when raw_user_meta_data is null then jsonb_build_object('full_name',new.full_name)
      else raw_user_meta_data || jsonb_build_object('full_name',new.full_name) end
  where id=new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create policy "Admin local access" on public.configs to authenticated
using (venue_id=(select venue_id from public.profiles where id=auth.uid()))
with check (venue_id=(select venue_id from public.profiles where id=auth.uid()));
create policy "Admin può aggiornare configs" on public.configs for update
using (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy "Admin può inserire configs" on public.configs for insert
with check (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy "Aggiornamento Profili" on public.profiles for update
using ((select role from public.profiles where id=auth.uid())='super_admin');
create policy "Aggiornamento profilo personale" on public.profiles for update using (auth.uid()=id);
create policy "Allow All on EditLogs" on public.report_edit_log using (true);
create policy "Allow All on Events" on public.events using (true);
create policy "Allow All on Products" on public.products using (true);
create policy "Allow All on Reports" on public.reports using (true);
create policy "Allow All on Restock" on public.restock_log using (true);
create policy "Cancellazione Profili" on public.profiles for delete using (
  (((select role from public.profiles where id=auth.uid())='admin') and role='staff'
    and venue_id in (select venue_id from public.venue_access where user_id=auth.uid()))
  or (select role from public.profiles where id=auth.uid())='super_admin'
);
create policy "Inserimento profilo personale" on public.profiles for insert with check (auth.uid()=id);
create policy "Isolamento Articoli Arrivi per Locale" on public.restock_items
using (session_id in (select id from public.restock_sessions));
create policy "Isolamento Event Stocks per Locale" on public.event_stocks
using (event_id in (select id from public.events));
create policy "Isolamento Log per Locale" on public.activity_log using (
  venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
  or (select role from public.profiles where id=auth.uid())='super_admin'
);
create policy "Lettura libera configs" on public.configs for select using (true);
create policy "Modifica Eventi per Locale" on public.events using (
  (select role from public.profiles where id=auth.uid()) in ('admin','super_admin','staff')
  and (venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
    or (select role from public.profiles where id=auth.uid())='super_admin')
);
create policy "Modifica Prodotti per Locale" on public.products using (
  (select role from public.profiles where id=auth.uid()) in ('admin','super_admin')
  and (venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
    or (select role from public.profiles where id=auth.uid())='super_admin')
);
create policy "Modifica Report per Locale" on public.reports using (
  (select role from public.profiles where id=auth.uid()) in ('admin','super_admin')
  and (venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
    or (select role from public.profiles where id=auth.uid())='super_admin')
);
create policy "Modifica Sessioni Arrivi per Locale" on public.restock_sessions using (
  (select role from public.profiles where id=auth.uid()) in ('admin','super_admin','staff')
  and (venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
    or (select role from public.profiles where id=auth.uid())='super_admin')
);
create policy "Permetti aggiornamento profilo ai responsabili" on public.profiles for update to authenticated using (
  (select role from public.profiles where id=auth.uid())='super_admin'
  or ((select role from public.profiles where id=auth.uid())='admin'
    and venue_id=(select venue_id from public.profiles where id=auth.uid()))
);
create policy "Profili visibili a tutti" on public.profiles for select using (true);
create policy "Public registration code access" on public.configs for select to authenticated,anon
using (key='registration_code');
create policy "Sblocco Totale" on public.profiles for select using (auth.uid() is not null);
create policy "Super Admin Full Access" on public.profiles to authenticated
using ((select role from public.profiles where id=auth.uid())='super_admin')
with check ((select role from public.profiles where id=auth.uid())='super_admin');
create policy "Super Admin Power" on public.profiles using (public.check_is_super_admin());
create policy "Super admin full access" on public.configs to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and role='super_admin'))
with check (exists(select 1 from public.profiles where id=auth.uid() and role='super_admin'));
create policy "Venues are manageable by super admins" on public.venues to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and role='super_admin'));
create policy "Venues are readable by authenticated users" on public.venues for select to authenticated using (true);
create policy "Venues are readable by everyone" on public.venues for select to authenticated,anon using (true);
create policy "Visualizzazione Eventi per Locale" on public.events for select using (
  venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
  or (select role from public.profiles where id=auth.uid())='super_admin'
);
create policy "Visualizzazione Prodotti per Locale" on public.products for select using (
  venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
  or (select role from public.profiles where id=auth.uid())='super_admin'
);
create policy "Visualizzazione Profili" on public.profiles for select using (
  venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
  or (select role from public.profiles where id=auth.uid())='super_admin'
);
create policy "Visualizzazione Report per Locale" on public.reports for select using (
  venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
  or (select role from public.profiles where id=auth.uid())='super_admin'
);
create policy "Visualizzazione Sessioni Arrivi per Locale" on public.restock_sessions for select using (
  venue_id in (select venue_id from public.venue_access where user_id=auth.uid())
  or (select role from public.profiles where id=auth.uid())='super_admin'
);

alter table public.activity_log enable row level security;
alter table public.configs enable row level security;
alter table public.event_stocks enable row level security;
alter table public.events enable row level security;
alter table public.products enable row level security;
alter table public.profiles disable row level security;
alter table public.report_edit_log enable row level security;
alter table public.reports enable row level security;
alter table public.restock_items disable row level security;
alter table public.restock_log enable row level security;
alter table public.restock_sessions disable row level security;
alter table public.venue_access enable row level security;
alter table public.venues enable row level security;

grant all on all tables in schema public to anon,authenticated,service_role;
grant all on all sequences in schema public to anon,authenticated,service_role;
grant all on all functions in schema public to anon,authenticated,service_role;

commit;
