import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_LIQUIDSTOCK';
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(dbContainer)) {
  throw new Error('Refusing non-local database container');
}

const preflight = readFileSync(
  resolve('supabase/audit/preflight_security_hardening.sql'),
  'utf8',
);
const run = (targetState, prefix = '') => execFileSync(
  'docker',
  [
    'exec', '-i', dbContainer,
    'psql', '-X', '-q', '-U', 'supabase_admin', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1',
    '-v', `target_state=${targetState}`,
    '-P', 'format=unaligned',
    '-P', 'fieldsep=|',
    '-P', 'footer=off',
    '-f', '-',
  ],
  { input: `${prefix}${preflight}`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
);
const psql = (sql) => execFileSync(
  'docker',
  ['exec', '-i', dbContainer, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
).trim();
const results = [];
const check = (name, condition, detail = '') => {
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
  results.push({ name, status: 'PASS' });
};

const output = run('lifecycle');
check('lifecycle mode accepts expected fingerprint', !/\|STOP$/m.test(output));
check('lifecycle mode validates target state', output.includes('lifecycle|target_state_valid|0|0|PASS'));
check('lifecycle mode expects 26 public tables', output.includes('lifecycle|public_table_count|26|26|PASS'));
check('lifecycle mode expects 56 policies', output.includes('lifecycle|public_policy_count|56|56|PASS'));
check('lifecycle mode rejects anonymous grants', output.includes('lifecycle|anon_table_grants|0|0|PASS'));
check('lifecycle mode rejects open policies', output.includes('lifecycle|open_policy_count|0|0|PASS'));
check('lifecycle mode requires RLS everywhere', output.includes('lifecycle|public_tables_without_rls|0|0|PASS'));
check('lifecycle mode rejects unsafe definer functions', output.includes('lifecycle|unsafe_security_definer_functions|0|0|PASS'));
check('lifecycle tables are present', output.includes('lifecycle_required_tables_missing|0|0|PASS'));
check('lifecycle RLS is enabled', output.includes('lifecycle_required_rls_disabled|0|0|PASS'));
check('lifecycle data relationships are consistent', output.includes('supplier_orders_cross_venue_or_orphan|0|0|PASS'));
check('every assigned supplier has a tracked sub-order', output.includes('assigned_suppliers_without_suborder|0|0|PASS'));
check('tracked sub-orders still have assigned rows', output.includes('suborders_without_assigned_items|0|0|PASS'));
check('outbox payloads match contract', output.includes('integration_outbox_payload_mismatch|0|0|PASS'));

const driftOutput = run(
  'lifecycle',
  'begin;\nalter table public.integration_outbox disable row level security;\n',
);
check(
  'lifecycle mode detects intentional RLS drift',
  driftOutput.includes('lifecycle_required_rls_disabled|1|0|STOP')
    && driftOutput.includes('lifecycle|public_tables_without_rls|1|0|STOP'),
);
check(
  'intentional lifecycle drift is rolled back',
  psql(`
    select relrowsecurity
    from pg_catalog.pg_class
    where oid='public.integration_outbox'::regclass;
  `) === 't',
);

console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
