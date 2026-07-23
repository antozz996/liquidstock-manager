import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_LIQUIDSTOCK';
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(dbContainer)) throw new Error('Refusing non-local database container');

const results = [];
const check = (name, condition, detail = '') => {
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
  results.push({ name, status: 'PASS' });
};
const psql = (sql) => execFileSync(
  'docker',
  ['exec', '-i', dbContainer, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
).trim();
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const runAs = (role, userId, statement) => psql(`
  begin;
  set local "request.jwt.claim.sub"=${literal(userId || '')};
  set local "request.jwt.claim.role"=${literal(role)};
  set local role ${role};
  ${statement}
  rollback;
`);
const writeAs = (role, userId, statement) => psql(`
  begin;
  set local "request.jwt.claim.sub"=${literal(userId || '')};
  set local "request.jwt.claim.role"=${literal(role)};
  set local role ${role};
  ${statement}
  commit;
`);
const expectError = (name, operation) => {
  try {
    operation();
    check(name, false, 'operation unexpectedly succeeded');
  } catch {
    check(name, true);
  }
};
const setPermissionsSql = (venueId, userId, values) => `
  select to_jsonb(saved)::text
  from public.set_order_permissions(
    '${venueId}'::uuid,
    '${userId}'::uuid,
    ${values.manual},
    ${values.stock},
    ${values.manage},
    ${values.whatsapp},
    ${values.prices},
    ${values.active}
  ) saved;
`;
const saveOrderSql = (venueId, departmentId, items) => `
  select to_jsonb(saved)::text
  from public.save_purchase_order_draft(
    '${venueId}'::uuid,
    '${departmentId}'::uuid,
    $items$${JSON.stringify(items)}$items$::jsonb
  ) saved;
`;
const recordWhatsappSql = ({
  orderId,
  venueId,
  supplierId,
  orderVersion,
  number = '393331234567',
  message = 'ORDINE locale',
}) => `
  select to_jsonb(recorded)::text
  from public.record_whatsapp_opened(
    '${orderId}'::uuid,
    '${venueId}'::uuid,
    '${supplierId}'::uuid,
    ${orderVersion},
    ${literal(number)},
    ${literal(message)}
  ) recorded;
`;

const runId = Date.now().toString(36);
const venueA = randomUUID();
const venueB = randomUUID();
const departmentA = randomUUID();
const supplierA1 = randomUUID();
const supplierA2 = randomUUID();
const supplierB = randomUUID();
const productA = randomUUID();
const adminA = randomUUID();
const staffA = randomUUID();
const staffB = randomUUID();
const superAdmin = randomUUID();

psql(`
  insert into public.venues(id,name) values
    ('${venueA}','Sprint 2 Venue A ${runId}'),
    ('${venueB}','Sprint 2 Venue B ${runId}');
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('${adminA}','authenticated','authenticated','s2-admin-a-${runId}@local.invalid','',now(),'{}','{"full_name":"S2 Admin A"}',now(),now()),
    ('${staffA}','authenticated','authenticated','s2-staff-a-${runId}@local.invalid','',now(),'{}','{"full_name":"S2 Staff A"}',now(),now()),
    ('${staffB}','authenticated','authenticated','s2-staff-b-${runId}@local.invalid','',now(),'{}','{"full_name":"S2 Staff B"}',now(),now()),
    ('${superAdmin}','authenticated','authenticated','s2-super-${runId}@local.invalid','',now(),'{}','{"full_name":"S2 Super"}',now(),now());
  update public.profiles set role='admin',venue_id='${venueA}' where id='${adminA}';
  update public.profiles set role='staff',venue_id='${venueA}' where id='${staffA}';
  update public.profiles set role='staff',venue_id='${venueB}' where id='${staffB}';
  update public.profiles set role='super_admin',venue_id='${venueA}' where id='${superAdmin}';
  insert into public.venue_access(user_id,venue_id) values
    ('${adminA}','${venueA}'),
    ('${staffA}','${venueA}'),
    ('${staffB}','${venueB}'),
    ('${superAdmin}','${venueA}');
  insert into public.order_permissions(
    venue_id,user_id,can_create_manual_orders,can_manage_orders,can_send_whatsapp_orders
  ) values ('${venueA}','${adminA}',true,true,true);
  insert into public.departments(id,venue_id,name) values
    ('${departmentA}','${venueA}','Bar Sprint 2 ${runId}');
  insert into public.suppliers(id,venue_id,name,whatsapp_number) values
    ('${supplierA1}','${venueA}','S2 Supplier A1 ${runId}','+39 333 123 4567'),
    ('${supplierA2}','${venueA}','S2 Supplier A2 ${runId}',null),
    ('${supplierB}','${venueB}','S2 Supplier B ${runId}','393339999999');
  insert into public.products(id,venue_id,name,category,unit,current_stock,cost_price,selling_price)
  values('${productA}','${venueA}','S2 Product A ${runId}','Test','pz',42.75,2,4);
`);

for (const table of ['order_permissions', 'supplier_order_dispatches']) {
  expectError(`anon denied:${table}`, () => runAs('anon', null, `select count(*) from public.${table};`));
}
expectError('anonymous cannot call permission RPC', () => runAs('anon', null, setPermissionsSql(venueA, staffA, {
  manual: true, stock: false, manage: false, whatsapp: true, prices: false, active: true,
})));
expectError('staff cannot grant own permissions', () => writeAs('authenticated', staffA, setPermissionsSql(venueA, staffA, {
  manual: true, stock: true, manage: true, whatsapp: true, prices: true, active: true,
})));

const granted = JSON.parse(writeAs('authenticated', adminA, setPermissionsSql(venueA, staffA, {
  manual: true, stock: true, manage: false, whatsapp: true, prices: true, active: true,
})));
check('venue admin grants all requested flags', granted.user_id === staffA
  && granted.can_create_manual_orders
  && granted.can_create_stock_orders
  && !granted.can_manage_orders
  && granted.can_send_whatsapp_orders
  && granted.can_view_purchase_prices
  && granted.is_active);
check('permission RPC persists venue-scoped row', psql(`
  select count(*) from public.order_permissions
  where user_id='${staffA}' and venue_id='${venueA}' and can_send_whatsapp_orders;
`) === '1');
expectError('direct authenticated permission update denied', () => writeAs('authenticated', adminA, `
  update public.order_permissions set can_manage_orders=true
  where user_id='${staffA}' and venue_id='${venueA}';
`));
expectError('venue A admin cannot manage venue B permissions', () => writeAs('authenticated', adminA, setPermissionsSql(venueB, staffB, {
  manual: true, stock: false, manage: false, whatsapp: true, prices: false, active: true,
})));
expectError('venue A admin cannot target venue B member in venue A', () => writeAs('authenticated', adminA, setPermissionsSql(venueA, staffB, {
  manual: true, stock: false, manage: false, whatsapp: true, prices: false, active: true,
})));

const superGranted = JSON.parse(writeAs('authenticated', superAdmin, setPermissionsSql(venueB, staffB, {
  manual: true, stock: false, manage: false, whatsapp: false, prices: false, active: true,
})));
check('super admin manages another venue server-side', superGranted.venue_id === venueB && superGranted.user_id === staffB);
writeAs('authenticated', superAdmin, setPermissionsSql(venueA, superAdmin, {
  manual: true, stock: true, manage: true, whatsapp: true, prices: true, active: false,
}));
check('inactive permission explicitly disables super admin Orders access', runAs('authenticated', superAdmin, `
  select public.has_order_permission('${venueA}'::uuid,'can_create_manual_orders')::text;
`) === 'false');
writeAs('authenticated', superAdmin, setPermissionsSql(venueA, superAdmin, {
  manual: true, stock: true, manage: true, whatsapp: true, prices: true, active: true,
}));
check('super admin can re-enable venue Orders access', runAs('authenticated', superAdmin, `
  select public.has_order_permission('${venueA}'::uuid,'can_create_manual_orders')::text;
`) === 'true');

writeAs('authenticated', adminA, setPermissionsSql(venueA, staffA, {
  manual: true, stock: true, manage: false, whatsapp: true, prices: true, active: false,
}));
check('inactive permission blocks Orders access', runAs('authenticated', staffA, `
  select public.has_order_permission('${venueA}'::uuid,'can_create_manual_orders')::text
    ||'|'||public.has_order_permission('${venueA}'::uuid,'can_send_whatsapp_orders')::text;
`) === 'false|false');
writeAs('authenticated', adminA, setPermissionsSql(venueA, staffA, {
  manual: true, stock: true, manage: false, whatsapp: true, prices: true, active: true,
}));

const stockBefore = psql(`select current_stock::text from public.products where id='${productA}';`);
const order = JSON.parse(writeAs('authenticated', staffA, saveOrderSql(venueA, departmentA, [
  { product_id: productA, product_name_snapshot: 'Ignored', quantity: 4, unit: 'cartoni', package_note: '6 x 1 L', supplier_id: supplierA1 },
  { product_name_snapshot: `Free line ${runId}`, quantity: 2, unit: 'kg', supplier_id: supplierA2 },
  { product_name_snapshot: `Unassigned ${runId}`, quantity: 1, unit: 'pz', supplier_id: null },
])));
check('multi-supplier draft with unassigned row saved', psql(`
  select count(distinct supplier_id)::text||'|'||count(*) filter(where supplier_id is null)::text
  from public.purchase_order_items where purchase_order_id='${order.id}';
`) === '2|1');

const firstMessage = `ORDINE — Sprint 2 Venue A ${runId}\nReparto: Bar Sprint 2 ${runId}\n\n- 4 cartoni S2 Product A ${runId} — 6 x 1 L`;
const firstEvent = JSON.parse(writeAs('authenticated', staffA, recordWhatsappSql({
  orderId: order.id,
  venueId: venueA,
  supplierId: supplierA1,
  orderVersion: order.version,
  message: firstMessage,
})));
check('WhatsApp event is not delivery proof', firstEvent.status === 'whatsapp_opened');
check('event snapshots supplier user version and text', firstEvent.supplier_id === supplierA1
  && firstEvent.opened_by === staffA
  && firstEvent.order_version === order.version
  && firstEvent.message_snapshot === firstMessage);

const secondEvent = JSON.parse(writeAs('authenticated', staffA, recordWhatsappSql({
  orderId: order.id,
  venueId: venueA,
  supplierId: supplierA1,
  orderVersion: order.version,
  message: `${firstMessage}\nNote modificate`,
})));
check('repeated openings append immutable attempts', secondEvent.id !== firstEvent.id && psql(`
  select count(*) from public.supplier_order_dispatches
  where purchase_order_id='${order.id}' and supplier_id='${supplierA1}';
`) === '2');
check('latest attempt is queryable by timestamp', runAs('authenticated', staffA, `
  select id from public.supplier_order_dispatches
  where purchase_order_id='${order.id}' and supplier_id='${supplierA1}'
  order by opened_at desc,created_at desc,id desc limit 1;
`) === secondEvent.id);

expectError('wrong order version cannot be recorded', () => writeAs('authenticated', staffA, recordWhatsappSql({
  orderId: order.id, venueId: venueA, supplierId: supplierA1, orderVersion: 999,
})));
expectError('cross-venue supplier cannot be recorded', () => writeAs('authenticated', staffA, recordWhatsappSql({
  orderId: order.id, venueId: venueA, supplierId: supplierB, orderVersion: order.version,
})));
expectError('empty number snapshot is rejected', () => writeAs('authenticated', staffA, recordWhatsappSql({
  orderId: order.id, venueId: venueA, supplierId: supplierA1, orderVersion: order.version, number: '',
})));
expectError('empty message snapshot is rejected', () => writeAs('authenticated', staffA, recordWhatsappSql({
  orderId: order.id, venueId: venueA, supplierId: supplierA1, orderVersion: order.version, message: '',
})));
expectError('direct dispatch insert is denied', () => writeAs('authenticated', staffA, `
  insert into public.supplier_order_dispatches(
    purchase_order_id,venue_id,supplier_id,whatsapp_number_snapshot,message_snapshot,order_version,opened_by
  ) values('${order.id}','${venueA}','${supplierA1}','39333','Direct',${order.version},'${staffA}');
`));
check('cross-venue user cannot read dispatch events', runAs('authenticated', staffB, `
  select count(*) from public.supplier_order_dispatches where purchase_order_id='${order.id}';
`) === '0');

writeAs('authenticated', adminA, setPermissionsSql(venueA, staffA, {
  manual: true, stock: true, manage: false, whatsapp: false, prices: true, active: true,
}));
expectError('user without WhatsApp permission cannot record event', () => writeAs('authenticated', staffA, recordWhatsappSql({
  orderId: order.id, venueId: venueA, supplierId: supplierA1, orderVersion: order.version,
})));
check('revoking WhatsApp does not revoke manual order permission', runAs('authenticated', staffA, `
  select public.has_order_permission('${venueA}'::uuid,'can_create_manual_orders')::text
    ||'|'||public.has_order_permission('${venueA}'::uuid,'can_send_whatsapp_orders')::text;
`) === 'true|false');
check('all Sprint 2 operations leave current_stock unchanged', psql(`
  select current_stock::text from public.products where id='${productA}';
`) === stockBefore);
check('permission rows remain consistent with venue_access', psql(`
  select count(*) from public.order_permissions op
  left join public.venue_access va on va.user_id=op.user_id and va.venue_id=op.venue_id
  where va.user_id is null;
`) === '0');

console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
