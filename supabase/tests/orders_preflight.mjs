import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_LIQUIDSTOCK';
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(dbContainer)) throw new Error('Refusing non-local database container');

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

for (const legacyMode of ['baseline', 'hardened']) {
  const output = run(legacyMode);
  check(
    `${legacyMode} mode remains executable`,
    output.includes(`${legacyMode}|target_state_valid|0|0|PASS`),
  );
}

const ordersOutput = run('orders');
check('orders mode accepts the expected schema fingerprint', !/\|STOP$/m.test(ordersOutput));
check('orders mode checks required tables', ordersOutput.includes('orders_required_tables_missing|0|0|PASS'));
check('orders mode checks RLS', ordersOutput.includes('orders_required_rls_disabled|0|0|PASS'));
check('orders mode checks anonymous grants', ordersOutput.includes('orders_anon_grants|0|0|PASS'));
check('orders mode checks open policies', ordersOutput.includes('orders_open_policies|0|0|PASS'));
check('orders mode checks SECURITY DEFINER search_path', ordersOutput.includes('orders_unsafe_security_definer_functions|0|0|PASS'));
check('orders mode checks cross-venue references', ordersOutput.includes('purchase_order_items_supplier_cross_venue|0|0|PASS'));
check('orders mode checks permission consistency', ordersOutput.includes('order_permissions_missing_profile_or_access|0|0|PASS'));

const driftOutput = run(
  'orders',
  'begin;\nalter table public.supplier_order_dispatches disable row level security;\n',
);
check(
  'orders mode detects intentional RLS drift',
  driftOutput.includes('orders_required_rls_disabled|1|0|STOP')
    && driftOutput.includes('orders|public_tables_without_rls|1|0|STOP'),
);
check(
  'intentional drift is rolled back',
  psql(`
    select relrowsecurity
    from pg_catalog.pg_class
    where oid='public.supplier_order_dispatches'::regclass;
  `) === 't',
);

console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
