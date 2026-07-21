-- Run only in the approved production maintenance window, immediately before
-- the Sprint 0 hardening migration. The generated value is never returned.

\set ON_ERROR_STOP on

begin;

do $$
declare
  affected_rows integer;
begin
  update public.configs
  set value = encode(extensions.gen_random_bytes(32), 'hex'),
      updated_at = timezone('utc', now())
  where key = 'registration_code';

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'legacy_registration_code_rotation_expected_1_row_found_%', affected_rows;
  end if;
end $$;

select count(*) as rotated_marker_rows
from public.configs
where key = 'registration_code'
  and value ~ '^[0-9a-f]{64}$';

commit;
