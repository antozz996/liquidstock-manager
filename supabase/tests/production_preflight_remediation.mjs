import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_LIQUIDSTOCK';
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(dbContainer)) {
  throw new Error('Refusing target: SUPABASE_DB_CONTAINER must identify a local Supabase DB container');
}

const root = resolve(import.meta.dirname, '../..');
const sqlFiles = {
  migration: resolve(root, 'supabase/migrations/20260721090000_security_hardening.sql'),
  rollback: resolve(root, 'supabase/rollback/20260721090000_security_hardening_rollback.sql'),
  remediation: resolve(root, 'supabase/release/remediate_production_preflight_blockers.sql'),
  rotation: resolve(root, 'supabase/release/rotate_legacy_registration_code.sql'),
  preflight: resolve(root, 'supabase/audit/preflight_security_hardening.sql'),
  diagnostic: resolve(root, 'supabase/audit/diagnose_production_preflight_blockers.sql'),
};
const results = [];

const psql = (sql, options = {}) => execFileSync(
  'docker',
  ['exec', '-i', dbContainer, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...(options.tuplesOnly ? ['-At'] : [])],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
);
const runFile = (path) => psql(readFileSync(path, 'utf8'));
const scalar = (sql) => psql(sql, { tuplesOnly: true }).trim();
const check = (name, condition, detail = '') => {
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
  results.push({ name, status: 'PASS' });
};
const counts = () => scalar(`
  select concat_ws(',',
    (select count(*) from auth.users u where not exists (
      select 1 from public.venue_access va where va.user_id=u.id
    )),
    (select count(*) from public.profiles p where coalesce(p.role,'staff')<>'super_admin'
      and not exists (
        select 1 from public.venue_access va
        where va.user_id=p.id and va.venue_id=p.venue_id
      )),
    (select count(*) from public.configs where key='registration_code'),
    (select count(*) from public.configs where key='registration_code'
      and value ~ '^disabled:[0-9a-f]{64}$'),
    (select count(*) from public.venue_access)
  );
`);

// Put the disposable local database back on the audited hosted baseline.
runFile(sqlFiles.rollback);
psql(`
  truncate table auth.users, public.venues cascade;

  insert into public.venues(id,name) values
    ('10000000-0000-0000-0000-000000000001','Remediation Venue A'),
    ('10000000-0000-0000-0000-000000000002','Remediation Venue B');

  insert into auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values
    ('20000000-0000-0000-0000-000000000001','authenticated','authenticated','fixture-1@local.invalid','',now(),'{}',
      '{"full_name":"Fixture One","role":"staff","venue_id":"10000000-0000-0000-0000-000000000001"}',now(),now()),
    ('20000000-0000-0000-0000-000000000002','authenticated','authenticated','fixture-2@local.invalid','',now(),'{}',
      '{"full_name":"Fixture Two","role":"admin","venue_id":"10000000-0000-0000-0000-000000000001"}',now(),now()),
    ('20000000-0000-0000-0000-000000000003','authenticated','authenticated','fixture-3@local.invalid','',now(),'{}',
      '{"full_name":"Fixture Three","role":"staff","venue_id":"10000000-0000-0000-0000-000000000002"}',now(),now()),
    ('20000000-0000-0000-0000-000000000004','authenticated','authenticated','fixture-4@local.invalid','',now(),'{}',
      '{"full_name":"Fixture Four","role":"super_admin","venue_id":"10000000-0000-0000-0000-000000000001"}',now(),now()),
    ('20000000-0000-0000-0000-000000000005','authenticated','authenticated','fixture-5@local.invalid','',now(),'{}',
      '{"full_name":"Fixture Five","role":"super_admin","venue_id":"10000000-0000-0000-0000-000000000002"}',now(),now());

  insert into public.configs(key,value,venue_id) values
    ('registration_code','synthetic-legacy-a','10000000-0000-0000-0000-000000000001'),
    ('registration_code','synthetic-legacy-b','10000000-0000-0000-0000-000000000002');
`);

check('fixture exact 5/3/2', counts() === '5,3,2,0,0', counts());
check(
  'three-user overlap is explicit',
  scalar(`select count(*) from auth.users u join public.profiles p on p.id=u.id
    where coalesce(p.role,'staff')<>'super_admin'
      and not exists (select 1 from public.venue_access va where va.user_id=u.id)
      and not exists (select 1 from public.venue_access va where va.user_id=p.id and va.venue_id=p.venue_id);`) === '3',
);
const diagnostic = runFile(sqlFiles.diagnostic);
check('diagnostic is read-only and completes with rollback', /^BEGIN$/m.test(diagnostic) && /^ROLLBACK$/m.test(diagnostic));
check('diagnostic never returns legacy code values', !/synthetic-legacy-[ab]/.test(diagnostic));
const preflightBefore = runFile(sqlFiles.preflight);
const isStop = (checkName) => preflightBefore.split('\n').some((line) => line.includes(checkName) && line.includes('STOP'));
check(
  'preflight reproduces the three blocker classes',
  isStop('auth_users_without_any_venue_access')
    && isStop('non_super_primary_venue_access_missing')
    && isStop('legacy_registration_codes_not_invalidated'),
  preflightBefore,
);

const firstRun = runFile(sqlFiles.remediation);
check('first run inserts five primary accesses', /venue_access_rows_inserted[\s|+-]*5\b/.test(firstRun), firstRun);
check('first run invalidates two legacy rows', /registration_code_rows_invalidated[\s|+-]*2\b/.test(firstRun), firstRun);
check('first run reaches 0/0 with two preserved configs', counts() === '0,0,2,2,5', counts());
check(
  'all five users receive their primary pair',
  scalar(`select count(*) from public.profiles p join public.venue_access va
    on va.user_id=p.id and va.venue_id=p.venue_id;`) === '5',
);
check(
  'super-admin roles are unchanged',
  scalar(`select count(*) from public.profiles where role='super_admin';`) === '2',
);

const secondRun = runFile(sqlFiles.remediation);
check('second run inserts zero accesses', /venue_access_rows_inserted[\s|+-]*0\b/.test(secondRun), secondRun);
check('second run invalidates zero legacy rows', /registration_code_rows_invalidated[\s|+-]*0\b/.test(secondRun), secondRun);
check('second run is data-idempotent', counts() === '0,0,2,2,5', counts());

psql(`update public.configs set value='synthetic-rotation-fixture' where key='registration_code';`);
const rotation = runFile(sqlFiles.rotation);
check('standalone rotation supports both venue rows', /rotated_marker_rows[\s|+-]*2\b/.test(rotation), rotation);
check('standalone rotation preserves both configs', counts() === '0,0,2,2,5', counts());

const preflight = runFile(sqlFiles.preflight);
check('preflight has BEGIN and ROLLBACK', /^BEGIN$/m.test(preflight) && /^ROLLBACK$/m.test(preflight));
check('preflight is completely PASS', !/\bSTOP\b/.test(preflight), preflight);

runFile(sqlFiles.migration);
check(
  'migration hardens local schema',
  scalar(`select concat_ws(',',
    (select count(*) from pg_policies where schemaname='public'),
    (select count(*) from pg_tables where schemaname='public' and not rowsecurity),
    (select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon')
  );`) === '41,0,0',
);
check('migration preserves and invalidates both configs', counts() === '0,0,2,2,5', counts());

runFile(sqlFiles.rollback);
check(
  'rollback restores audited legacy schema counters',
  scalar(`select concat_ws(',',
    (select count(*) from pg_policies where schemaname='public'),
    (select count(*) from pg_tables where schemaname='public' and not rowsecurity),
    (select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon')
  );`) === '35,3,91',
);
check('rollback deletes no configs and reactivates no code', counts() === '0,0,2,2,5', counts());

runFile(sqlFiles.migration);
check(
  'reapplication hardens schema again',
  scalar(`select concat_ws(',',
    (select count(*) from pg_policies where schemaname='public'),
    (select count(*) from pg_tables where schemaname='public' and not rowsecurity),
    (select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon')
  );`) === '41,0,0',
);
check('reapplication remains data-idempotent', counts() === '0,0,2,2,5', counts());

console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
