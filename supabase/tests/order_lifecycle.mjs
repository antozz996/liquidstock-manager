import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_LIQUIDSTOCK';
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(dbContainer)) {
  throw new Error('Refusing non-local database container');
}

const migration = readFileSync(
  resolve('supabase/migrations/20260723160000_order_lifecycle_price_sentinel_bridge.sql'),
  'utf8',
);
const rollback = readFileSync(
  resolve('supabase/rollback/20260723160000_order_lifecycle_price_sentinel_bridge_rollback.sql'),
  'utf8',
);
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
const runFile = (sql) => execFileSync(
  'docker',
  ['exec', '-i', dbContainer, 'psql', '-X', '-q', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
);
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
const saveOrderSql = (venueId, departmentId, items) => `
  select to_jsonb(saved)::text
  from public.save_purchase_order_draft(
    '${venueId}'::uuid,
    '${departmentId}'::uuid,
    $items$${JSON.stringify(items)}$items$::jsonb
  ) saved;
`;
const confirmSql = (orderId, venueId, supplierId, version = 1) => `
  select to_jsonb(confirmed)::text
  from public.confirm_supplier_order_sent(
    '${orderId}'::uuid,
    '${venueId}'::uuid,
    '${supplierId}'::uuid,
    ${version}
  ) confirmed;
`;
const receiptSql = (supplierOrderId, venueId, version, items, idempotencyKey) => `
  select to_jsonb(receipt)::text
  from public.record_supplier_order_receipt(
    '${supplierOrderId}'::uuid,
    '${venueId}'::uuid,
    ${version},
    $items$${JSON.stringify(items)}$items$::jsonb,
    '${idempotencyKey}'::uuid
  ) receipt;
`;

const runId = Date.now().toString(36);
const venueA = randomUUID();
const venueB = randomUUID();
const departmentA = randomUUID();
const departmentB = randomUUID();
const supplierA1 = randomUUID();
const supplierA2 = randomUUID();
const supplierB = randomUUID();
const productA = randomUUID();
const productB = randomUUID();
const adminA = randomUUID();
const senderA = randomUUID();
const viewerA = randomUUID();
const noPermissionA = randomUUID();
const adminB = randomUUID();

psql(`
  insert into public.venues(id,name) values
    ('${venueA}','Lifecycle Venue A ${runId}'),
    ('${venueB}','Lifecycle Venue B ${runId}');
  insert into auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values
    ('${adminA}','authenticated','authenticated','lifecycle-admin-a-${runId}@local.invalid','',now(),'{}','{"full_name":"Lifecycle Admin A"}',now(),now()),
    ('${senderA}','authenticated','authenticated','lifecycle-sender-a-${runId}@local.invalid','',now(),'{}','{"full_name":"Lifecycle Sender A"}',now(),now()),
    ('${viewerA}','authenticated','authenticated','lifecycle-viewer-a-${runId}@local.invalid','',now(),'{}','{"full_name":"Lifecycle Viewer A"}',now(),now()),
    ('${noPermissionA}','authenticated','authenticated','lifecycle-none-a-${runId}@local.invalid','',now(),'{}','{"full_name":"Lifecycle None A"}',now(),now()),
    ('${adminB}','authenticated','authenticated','lifecycle-admin-b-${runId}@local.invalid','',now(),'{}','{"full_name":"Lifecycle Admin B"}',now(),now());
  update public.profiles set role='admin',venue_id='${venueA}' where id='${adminA}';
  update public.profiles set role='staff',venue_id='${venueA}' where id in ('${senderA}','${viewerA}','${noPermissionA}');
  update public.profiles set role='admin',venue_id='${venueB}' where id='${adminB}';
  insert into public.venue_access(user_id,venue_id) values
    ('${adminA}','${venueA}'),
    ('${senderA}','${venueA}'),
    ('${viewerA}','${venueA}'),
    ('${noPermissionA}','${venueA}'),
    ('${adminB}','${venueB}');
  insert into public.order_permissions(
    venue_id,user_id,can_create_manual_orders,can_manage_orders,
    can_send_whatsapp_orders,is_active
  ) values
    ('${venueA}','${adminA}',true,true,true,true),
    ('${venueA}','${senderA}',true,false,true,true),
    ('${venueA}','${viewerA}',true,false,false,true),
    ('${venueB}','${adminB}',true,true,true,true);
  insert into public.departments(id,venue_id,name) values
    ('${departmentA}','${venueA}','Lifecycle Bar A ${runId}'),
    ('${departmentB}','${venueB}','Lifecycle Bar B ${runId}');
  insert into public.suppliers(id,venue_id,name,whatsapp_number) values
    ('${supplierA1}','${venueA}','Lifecycle Supplier A1 ${runId}','393331111111'),
    ('${supplierA2}','${venueA}','Lifecycle Supplier A2 ${runId}','393332222222'),
    ('${supplierB}','${venueB}','Lifecycle Supplier B ${runId}','393333333333');
  insert into public.products(
    id,venue_id,name,category,unit,current_stock,cost_price,selling_price
  ) values
    ('${productA}','${venueA}','Lifecycle Product A ${runId}','Test','pz',41.5,1,2),
    ('${productB}','${venueB}','Lifecycle Product B ${runId}','Test','pz',19,1,2);
`);

const stockBefore = psql(`
  select encode(
    sha256(convert_to(string_agg(id::text||':'||current_stock::text,'|' order by id),'UTF8')),
    'hex'
  )
  from public.products;
`);

for (const table of [
  'supplier_purchase_orders',
  'supplier_purchase_order_items',
  'supplier_order_receipts',
  'supplier_order_receipt_items',
  'integration_outbox',
]) {
  expectError(`anon denied:${table}`, () => runAs('anon', null, `select count(*) from public.${table};`));
}

const orderItems = [
  {
    product_id: productA,
    product_name_snapshot: 'Client product name ignored',
    quantity: 4,
    unit: 'cartoni',
    package_note: '6 x 1 L',
    supplier_id: supplierA1,
    supplier_note: 'Mattina',
  },
  {
    product_name_snapshot: `Free supplier line ${runId}`,
    quantity: 2,
    unit: 'kg',
    supplier_id: supplierA2,
  },
  {
    product_name_snapshot: `Unassigned line ${runId}`,
    quantity: 1,
    unit: 'pz',
  },
];
const order = JSON.parse(writeAs('authenticated', adminA, saveOrderSql(
  venueA,
  departmentA,
  orderItems,
)));

check('new lifecycle order starts as draft', order.status === 'draft' && order.version === 1);
check('draft persists one pending sub-order per assigned supplier', psql(`
  select (
    count(*)=2
    and count(*) filter(where status='pending')=2
  )::text
  from public.supplier_purchase_orders
  where purchase_order_id='${order.id}';
`) === 'true');
check('user without permission cannot see order', runAs('authenticated', noPermissionA, `
  select count(*) from public.purchase_orders where id='${order.id}';
`) === '0');
expectError('cross-venue confirmation is blocked', () => writeAs(
  'authenticated',
  adminB,
  confirmSql(order.id, venueA, supplierA1),
));
expectError('viewer cannot confirm supplier order', () => writeAs(
  'authenticated',
  viewerA,
  confirmSql(order.id, venueA, supplierA1),
));

writeAs('authenticated', senderA, `
  select id from public.record_whatsapp_opened(
    '${order.id}','${venueA}','${supplierA1}',1,'393331111111','Lifecycle test'
  );
`);
check('WhatsApp opening does not confirm sending', psql(`
  select po.status||'|'||spo.status
  from public.purchase_orders po
  join public.supplier_purchase_orders spo on spo.purchase_order_id=po.id
  where po.id='${order.id}' and spo.supplier_id='${supplierA1}';
`) === 'draft|whatsapp_opened');

const confirmedA1 = JSON.parse(writeAs(
  'authenticated',
  senderA,
  confirmSql(order.id, venueA, supplierA1),
));
check('single supplier confirmation moves general order to sent', psql(`
  select status from public.purchase_orders where id='${order.id}';
`) === 'sent');
check('supplier confirmation records operator and timestamp',
  confirmedA1.status === 'sent_confirmed'
  && confirmedA1.order_version === 1
  && confirmedA1.confirmed_by === senderA
  && Boolean(confirmedA1.confirmed_at));
check('confirmation captures only assigned supplier rows', psql(`
  select count(*)::text||'|'||min(product_name_snapshot)
  from public.supplier_purchase_order_items
  where supplier_purchase_order_id='${confirmedA1.id}';
`) === `1|Lifecycle Product A ${runId}`);
check('confirmation and outbox are atomic', psql(`
  select count(*) from public.integration_outbox
  where aggregate_id='${confirmedA1.id}'
    and event_type='supplier_order_confirmed';
`) === '1');
check('confirmed payload is versioned and contains no price keys', psql(`
  select (
    integration_version='1.0'
    and payload->>'integration_version'='1.0'
    and payload->>'liquidstock_order_id'='${order.id}'
    and payload->>'liquidstock_supplier_order_id'='${confirmedA1.id}'
    and payload->>'supplier_name_snapshot'='Lifecycle Supplier A1 ${runId}'
    and jsonb_array_length(payload->'rows')=1
    and payload::text !~* 'price(_|\\s)*(value|amount|unit|purchase|cost)'
  )::text
  from public.integration_outbox
  where aggregate_id='${confirmedA1.id}'
    and event_type='supplier_order_confirmed';
`) === 'true');

writeAs('authenticated', senderA, confirmSql(order.id, venueA, supplierA1));
check('second confirmation is idempotent', psql(`
  select (
    (select count(*) from public.integration_outbox
      where aggregate_id='${confirmedA1.id}' and event_type='supplier_order_confirmed')=1
    and
    (select count(*) from public.supplier_purchase_order_items
      where supplier_purchase_order_id='${confirmedA1.id}')=1
  )::text;
`) === 'true');
expectError('WhatsApp cannot reopen a confirmed supplier order', () => writeAs(
  'authenticated',
  senderA,
  `
    select id from public.record_whatsapp_opened(
      '${order.id}','${venueA}','${supplierA1}',1,
      '393331111111','Late lifecycle test'
    );
  `,
));

expectError('confirmed order draft can no longer be edited', () => writeAs(
  'authenticated',
  adminA,
  `
    select id from public.save_purchase_order_draft(
      '${venueA}','${departmentA}',
      '[{"product_name_snapshot":"Changed","quantity":1,"unit":"pz"}]'::jsonb,
      null,null,'${order.id}',1
    );
  `,
));
expectError('forbidden general transition is rejected by database', () => psql(`
  update public.purchase_orders set status='draft' where id='${order.id}';
`));

psql(`
  update public.products set name='Mutated Product ${runId}' where id='${productA}';
  update public.suppliers set name='Mutated Supplier ${runId}' where id='${supplierA1}';
`);
check('sent snapshot is immutable after master-data changes', psql(`
  select product_name_snapshot||'|'||supplier_name_snapshot
  from public.supplier_purchase_order_items
  where supplier_purchase_order_id='${confirmedA1.id}';
`) === `Lifecycle Product A ${runId}|Lifecycle Supplier A1 ${runId}`);
check('outbox keeps immutable supplier snapshot', psql(`
  select payload->>'supplier_name_snapshot'
  from public.integration_outbox
  where aggregate_id='${confirmedA1.id}'
    and event_type='supplier_order_confirmed';
`) === `Lifecycle Supplier A1 ${runId}`);

const confirmedA2 = JSON.parse(writeAs(
  'authenticated',
  senderA,
  confirmSql(order.id, venueA, supplierA2),
));
check('one order supports two confirmed supplier sub-orders', psql(`
  select count(*) from public.supplier_purchase_orders
  where purchase_order_id='${order.id}' and status='sent_confirmed';
`) === '2');

const snapshotA1 = psql(`
  select id from public.supplier_purchase_order_items
  where supplier_purchase_order_id='${confirmedA1.id}';
`);
const snapshotA2 = psql(`
  select id from public.supplier_purchase_order_items
  where supplier_purchase_order_id='${confirmedA2.id}';
`);
const partialKey = randomUUID();
expectError('sender without manage permission cannot receive', () => writeAs(
  'authenticated',
  senderA,
  receiptSql(confirmedA1.id, venueA, 1, [{
    supplier_order_item_id: snapshotA1,
    received_quantity: 2,
  }], partialKey),
));
expectError('cross-venue receipt is blocked', () => writeAs(
  'authenticated',
  adminB,
  receiptSql(confirmedA1.id, venueB, 1, [{
    supplier_order_item_id: snapshotA1,
    received_quantity: 2,
  }], randomUUID()),
));

const partialReceipt = JSON.parse(writeAs(
  'authenticated',
  adminA,
  receiptSql(confirmedA1.id, venueA, 1, [{
    supplier_order_item_id: snapshotA1,
    received_quantity: 2,
    note: 'Consegna parziale',
  }], partialKey),
));
check('partial receipt is recorded without touching ordered quantity',
  partialReceipt.status === 'partial'
  && psql(`
    select ordered_quantity_snapshot::text||'|'||received_quantity::text||'|'||
      missing_quantity::text||'|'||line_status
    from public.supplier_order_receipt_items
    where receipt_id='${partialReceipt.id}';
  `) === '4|2|2|partial');
check('two suppliers can have different operational states', psql(`
  select string_agg(status,',' order by supplier_id)
  from public.supplier_purchase_orders
  where purchase_order_id='${order.id}';
`) === [
  [supplierA1, 'partially_received'],
  [supplierA2, 'sent_confirmed'],
].sort(([a], [b]) => a.localeCompare(b)).map(([, status]) => status).join(','));
check('partial supplier receipt makes general order partially received', psql(`
  select status from public.purchase_orders where id='${order.id}';
`) === 'partially_received');
check('partial receipt does not emit premature received event', psql(`
  select count(*) from public.integration_outbox
  where aggregate_id='${confirmedA1.id}'
    and event_type='supplier_order_received';
`) === '0');

writeAs(
  'authenticated',
  adminA,
  receiptSql(confirmedA1.id, venueA, 1, [{
    supplier_order_item_id: snapshotA1,
    received_quantity: 5,
    note: 'Una unità extra',
  }], randomUUID()),
);
check('quantity above ordered is accepted and highlighted', psql(`
  select received_quantity::text||'|'||missing_quantity::text||'|'||line_status
  from public.supplier_order_receipt_items
  where supplier_purchase_order_item_id='${snapshotA1}'
  order by created_at desc limit 1;
`) === '5|0|over_received');
check('complete receipt emits one atomic received event', psql(`
  select count(*) from public.integration_outbox
  where aggregate_id='${confirmedA1.id}'
    and event_type='supplier_order_received';
`) === '1');

const completeA2Key = randomUUID();
const completeA2Items = [{
  supplier_order_item_id: snapshotA2,
  received_quantity: 2,
}];
const completeA2 = JSON.parse(writeAs(
  'authenticated',
  adminA,
  receiptSql(confirmedA2.id, venueA, 1, completeA2Items, completeA2Key),
));
writeAs(
  'authenticated',
  adminA,
  receiptSql(confirmedA2.id, venueA, 1, completeA2Items, completeA2Key),
);
check('receipt request idempotency prevents duplicate declarations', psql(`
  select count(*) from public.supplier_order_receipts
  where supplier_purchase_order_id='${confirmedA2.id}'
    and idempotency_key='${completeA2Key}';
`) === '1' && completeA2.status === 'complete');
check('all supplier receipts make general order received', psql(`
  select status from public.purchase_orders where id='${order.id}';
`) === 'received');
expectError('received order is terminal', () => writeAs('authenticated', adminA, `
  select * from public.cancel_purchase_order('${order.id}','${venueA}',1);
`));

const cancelOrder = JSON.parse(writeAs('authenticated', adminA, saveOrderSql(
  venueA,
  departmentA,
  [{
    product_name_snapshot: `Cancelled line ${runId}`,
    quantity: 3,
    unit: 'pz',
    supplier_id: supplierA2,
  }],
)));
const cancelConfirmed = JSON.parse(writeAs(
  'authenticated',
  senderA,
  confirmSql(cancelOrder.id, venueA, supplierA2),
));
expectError('user without manage permission cannot cancel', () => writeAs(
  'authenticated',
  senderA,
  `select * from public.cancel_supplier_order(
    '${cancelOrder.id}','${venueA}','${supplierA2}',1
  );`,
));
writeAs('authenticated', adminA, `
  select id from public.cancel_supplier_order(
    '${cancelOrder.id}','${venueA}','${supplierA2}',1
  );
`);
check('supplier cancellation reaches terminal general status', psql(`
  select po.status||'|'||spo.status
  from public.purchase_orders po
  join public.supplier_purchase_orders spo on spo.purchase_order_id=po.id
  where po.id='${cancelOrder.id}';
`) === 'cancelled|cancelled');
check('cancellation event is created atomically', psql(`
  select count(*) from public.integration_outbox
  where aggregate_id='${cancelConfirmed.id}'
    and event_type='supplier_order_cancelled';
`) === '1');
writeAs('authenticated', adminA, `
  select id from public.cancel_supplier_order(
    '${cancelOrder.id}','${venueA}','${supplierA2}',1
  );
`);
check('second cancellation is idempotent', psql(`
  select count(*) from public.integration_outbox
  where aggregate_id='${cancelConfirmed.id}'
    and event_type='supplier_order_cancelled';
`) === '1');

const draftCancelOrder = JSON.parse(writeAs('authenticated', adminA, saveOrderSql(
  venueA,
  departmentA,
  [{ product_name_snapshot: `Draft cancel ${runId}`, quantity: 1, unit: 'pz' }],
)));
writeAs('authenticated', adminA, `
  select id from public.cancel_purchase_order(
    '${draftCancelOrder.id}','${venueA}',1
  );
`);
check('general draft cancellation is database controlled', psql(`
  select status from public.purchase_orders where id='${draftCancelOrder.id}';
`) === 'cancelled');

const stockAfter = psql(`
  select encode(
    sha256(convert_to(string_agg(id::text||':'||current_stock::text,'|' order by id),'UTF8')),
    'hex'
  )
  from public.products;
`);
check('all lifecycle operations leave current_stock unchanged', stockAfter === stockBefore);

psql(`
  delete from public.purchase_orders where venue_id in ('${venueA}','${venueB}');
  delete from public.products where venue_id in ('${venueA}','${venueB}');
  delete from public.order_permissions where venue_id in ('${venueA}','${venueB}');
  delete from public.departments where venue_id in ('${venueA}','${venueB}');
  delete from public.suppliers where venue_id in ('${venueA}','${venueB}');
  delete from public.venue_access where venue_id in ('${venueA}','${venueB}');
  delete from auth.users where id in (
    '${adminA}','${senderA}','${viewerA}','${noPermissionA}','${adminB}'
  );
  delete from public.venues where id in ('${venueA}','${venueB}');
`);

runFile(rollback);
check('rollback removes lifecycle tables', psql(`
  select count(*) from (
    values
      (to_regclass('public.supplier_purchase_orders')),
      (to_regclass('public.supplier_purchase_order_items')),
      (to_regclass('public.supplier_order_receipts')),
      (to_regclass('public.supplier_order_receipt_items')),
      (to_regclass('public.integration_outbox'))
  ) objects(value)
  where value is not null;
`) === '0');
check('rollback restores draft-only constraint', psql(`
  select pg_get_constraintdef(oid)
  from pg_constraint
  where conrelid='public.purchase_orders'::regclass
    and conname='purchase_orders_status_check';
`).includes("status = 'draft'"));

runFile(migration);
runFile(migration);
check('migration is idempotent and reapplicable', psql(`
  select count(*) from (
    values
      (to_regclass('public.supplier_purchase_orders')),
      (to_regclass('public.supplier_purchase_order_items')),
      (to_regclass('public.supplier_order_receipts')),
      (to_regclass('public.supplier_order_receipt_items')),
      (to_regclass('public.integration_outbox'))
  ) objects(value)
  where value is not null;
`) === '5');

console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
