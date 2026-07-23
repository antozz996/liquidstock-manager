import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_LIQUIDSTOCK';
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(dbContainer)) throw new Error('Refusing non-local database container');

const results = [];
const check = (name,condition,detail='') => {
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
  results.push({ name,status: 'PASS' });
};
const psql = (sql) => execFileSync(
  'docker',
  ['exec','-i',dbContainer,'psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],
  { input: sql,encoding: 'utf8',stdio: ['pipe','pipe','pipe'] },
).trim();
const literal = (value) => `'${String(value).replaceAll("'","''")}'`;
const runAs = (role,userId,statement) => psql(`
  begin;
  set local "request.jwt.claim.sub"=${literal(userId || '')};
  set local "request.jwt.claim.role"=${literal(role)};
  set local role ${role};
  ${statement}
  rollback;
`);
const writeAs = (role,userId,statement) => psql(`
  begin;
  set local "request.jwt.claim.sub"=${literal(userId || '')};
  set local "request.jwt.claim.role"=${literal(role)};
  set local role ${role};
  ${statement}
  commit;
`);
const expectError = (name,operation) => {
  try {
    operation();
    check(name,false,'operation unexpectedly succeeded');
  } catch {
    check(name,true);
  }
};
const saveSql = ({ venueId,departmentId,items,notes=null,deliveryDate=null,orderId=null,expectedVersion=null }) => `
  select to_jsonb(saved)::text
  from public.save_purchase_order_draft(
    ${literal(venueId)}::uuid,
    ${literal(departmentId)}::uuid,
    $items$${JSON.stringify(items)}$items$::jsonb,
    ${notes===null ? 'null' : literal(notes)}::text,
    ${deliveryDate===null ? 'null' : `${literal(deliveryDate)}::date`},
    ${orderId===null ? 'null' : `${literal(orderId)}::uuid`},
    ${expectedVersion===null ? 'null' : `${expectedVersion}::integer`}
  ) saved;
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
const staffAId = randomUUID();
const noPermissionId = randomUUID();
const adminAId = randomUUID();
const staffBId = randomUUID();

psql(`
  insert into public.venues(id,name) values
    ('${venueA}','Orders Venue A ${runId}'),
    ('${venueB}','Orders Venue B ${runId}');
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('${staffAId}','authenticated','authenticated','orders-staff-a-${runId}@local.invalid','',now(),'{}','{"full_name":"Orders Staff A"}',now(),now()),
    ('${noPermissionId}','authenticated','authenticated','orders-no-permission-${runId}@local.invalid','',now(),'{}','{"full_name":"Orders No Permission"}',now(),now()),
    ('${adminAId}','authenticated','authenticated','orders-admin-a-${runId}@local.invalid','',now(),'{}','{"full_name":"Orders Admin A"}',now(),now()),
    ('${staffBId}','authenticated','authenticated','orders-staff-b-${runId}@local.invalid','',now(),'{}','{"full_name":"Orders Staff B"}',now(),now());
  update public.profiles set role='staff',venue_id='${venueA}' where id in ('${staffAId}','${noPermissionId}');
  update public.profiles set role='admin',venue_id='${venueA}' where id='${adminAId}';
  update public.profiles set role='staff',venue_id='${venueB}' where id='${staffBId}';
  insert into public.venue_access(user_id,venue_id) values
    ('${staffAId}','${venueA}'),('${noPermissionId}','${venueA}'),('${adminAId}','${venueA}'),('${staffBId}','${venueB}');
  insert into public.order_permissions(venue_id,user_id,can_create_manual_orders,can_manage_orders) values
    ('${venueA}','${staffAId}',true,false),('${venueA}','${adminAId}',true,true),('${venueB}','${staffBId}',true,false);
  insert into public.departments(id,venue_id,name) values
    ('${departmentA}','${venueA}','Bar ${runId}'),('${departmentB}','${venueB}','Kitchen ${runId}');
  insert into public.suppliers(id,venue_id,name) values
    ('${supplierA1}','${venueA}','Supplier A1 ${runId}'),
    ('${supplierA2}','${venueA}','Supplier A2 ${runId}'),
    ('${supplierB}','${venueB}','Supplier B ${runId}');
  insert into public.products(id,venue_id,name,category,unit,current_stock,cost_price,selling_price) values
    ('${productA}','${venueA}','Product A ${runId}','Test','bottle',17.5,2,4),
    ('${productB}','${venueB}','Product B ${runId}','Test','piece',29,3,5);
`);

for (const table of ['departments','suppliers','order_permissions','purchase_orders','purchase_order_items']) {
  expectError(`anon denied:${table}`,() => runAs('anon',null,`select count(*) from public.${table};`));
}

check('authorized staff permission is true',runAs('authenticated',staffAId,`
  select public.has_order_permission('${venueA}'::uuid,'can_create_manual_orders');
`)==='t');
check('user without permission is false',runAs('authenticated',noPermissionId,`
  select public.has_order_permission('${venueA}'::uuid,'can_create_manual_orders');
`)==='f');
expectError('user without permission cannot save',() => runAs('authenticated',noPermissionId,saveSql({
  venueId: venueA,departmentId: departmentA,items: [{ product_name_snapshot: 'Denied',quantity: 1,unit: 'pz' }],
})));
expectError('user cannot grant own permission',() => writeAs('authenticated',noPermissionId,`
  insert into public.order_permissions(venue_id,user_id,can_create_manual_orders)
  values('${venueA}','${noPermissionId}',true);
`));
check('user without permission reads no order references',runAs('authenticated',noPermissionId,`
  select count(*) from public.departments where venue_id='${venueA}';
`)==='0');

const departmentIds = JSON.parse(runAs('authenticated',staffAId,`
  select coalesce(jsonb_agg(id order by id),'[]')::text from public.departments where id in ('${departmentA}','${departmentB}');
`));
check('department cross-venue hidden',departmentIds.length===1 && departmentIds[0]===departmentA);
const supplierIds = JSON.parse(runAs('authenticated',staffAId,`
  select coalesce(jsonb_agg(id order by id),'[]')::text from public.suppliers where id in ('${supplierA1}','${supplierB}');
`));
check('supplier cross-venue hidden',supplierIds.length===1 && supplierIds[0]===supplierA1);
const quickSupplierId = writeAs('authenticated',staffAId,`
  insert into public.suppliers(venue_id,name,contact_name,whatsapp_number)
  values('${venueA}','Quick Supplier ${runId}','Fixture','+39000000000') returning id;
`);
check('authorized quick supplier creation',/^[0-9a-f-]{36}$/.test(quickSupplierId));
expectError('quick supplier cross-venue denied',() => writeAs('authenticated',staffAId,`
  insert into public.suppliers(venue_id,name) values('${venueB}','Forbidden Supplier ${runId}');
`));
expectError('direct purchase-order insert is denied',() => writeAs('authenticated',staffAId,`
  insert into public.purchase_orders(order_code,venue_id,department_id,created_by,updated_by)
  values('DIRECT-${runId}','${venueA}','${departmentA}','${staffAId}','${staffAId}');
`));

const stockBefore = psql(`select current_stock::text from public.products where id='${productA}';`);
const validItems = [
  {
    product_id: productA,product_name_snapshot: 'Client cannot override this name',
    quantity: '999999999999999999999.125',unit: 'cartoni',package_note: '6 × 1 L',
    supplier_id: supplierA1,supplier_name_snapshot: 'Client fake supplier',supplier_note: 'Consegna mattina',
  },
  { product_id: null,product_name_snapshot: `Free line ${runId}`,quantity: '2.5',unit: 'kg',package_note: 'Sacchi',supplier_id: null },
  { product_id: productA,product_name_snapshot: `Product A ${runId}`,quantity: '4',unit: 'box',supplier_id: supplierA2 },
];
const savedOrder = JSON.parse(writeAs('authenticated',staffAId,saveSql({
  venueId: venueA,departmentId: departmentA,items: validItems,notes: 'Manual operator quantities',deliveryDate: '2026-07-30',
})));
check('transactional multi-supplier draft save',Boolean(savedOrder.id));
check('new order is manual draft version one',savedOrder.mode==='manual' && savedOrder.status==='draft' && savedOrder.version===1);
const itemSummary = JSON.parse(runAs('authenticated',staffAId,`
  select jsonb_build_object(
    'count',count(*),
    'free',count(*) filter(where product_id is null),
    'with_product',count(*) filter(where product_id is not null),
    'without_supplier',count(*) filter(where supplier_id is null),
    'supplier_count',count(distinct supplier_id),
    'positions',jsonb_agg(position order by position)
  )::text from public.purchase_order_items where purchase_order_id='${savedOrder.id}';
`));
check('product and free rows are both saved',itemSummary.count===3 && itemSummary.free===1 && itemSummary.with_product===2);
check('supplier is optional',itemSummary.without_supplier===1);
check('one order contains two suppliers',itemSummary.supplier_count===2);
check('positions follow item order',JSON.stringify(itemSummary.positions)==='[0,1,2]');
const authoritativeSnapshots = runAs('authenticated',staffAId,`
  select product_name_snapshot||'|'||supplier_name_snapshot
  from public.purchase_order_items where purchase_order_id='${savedOrder.id}' and position=0;
`);
check('database snapshots authoritative names',authoritativeSnapshots===`Product A ${runId}|Supplier A1 ${runId}`);
check('high operator quantity is preserved',runAs('authenticated',staffAId,`
  select quantity::text from public.purchase_order_items where purchase_order_id='${savedOrder.id}' and position=0;
`)==='999999999999999999999.125');
check('creating order does not change current_stock',psql(`select current_stock::text from public.products where id='${productA}';`)===stockBefore);

check('cross-venue order is hidden',runAs('authenticated',staffBId,`
  select count(*) from public.purchase_orders where id='${savedOrder.id}';
`)==='0');
check('cross-venue items are hidden',runAs('authenticated',staffBId,`
  select count(*) from public.purchase_order_items where purchase_order_id='${savedOrder.id}';
`)==='0');
expectError('cross-venue RPC save denied',() => runAs('authenticated',staffAId,saveSql({
  venueId: venueB,departmentId: departmentB,items: [{ product_id: productB,product_name_snapshot: 'B',quantity: 1,unit: 'pz' }],
})));

const countBeforeInvalid = psql(`select count(*) from public.purchase_orders where venue_id='${venueA}';`);
expectError('cross-venue supplier rejects whole transaction',() => runAs('authenticated',staffAId,saveSql({
  venueId: venueA,departmentId: departmentA,items: [
    { product_id: productA,product_name_snapshot: 'Valid first',quantity: 1,unit: 'pz' },
    { product_name_snapshot: 'Invalid supplier second',quantity: 1,unit: 'pz',supplier_id: supplierB },
  ],
})));
check('failed create leaves no partial order',psql(`select count(*) from public.purchase_orders where venue_id='${venueA}';`)===countBeforeInvalid);

expectError('invalid update rolls back atomically',() => runAs('authenticated',staffAId,saveSql({
  venueId: venueA,departmentId: departmentA,orderId: savedOrder.id,expectedVersion: 1,items: [
    { product_name_snapshot: 'Would replace',quantity: 1,unit: 'pz' },
    { product_id: productB,product_name_snapshot: 'Wrong venue',quantity: 1,unit: 'pz' },
  ],
})));
check('failed update preserves version and rows',psql(`
  select version::text||'|'||(select count(*) from public.purchase_order_items where purchase_order_id=po.id)
  from public.purchase_orders po where id='${savedOrder.id}';
`)==='1|3');
expectError('optimistic version conflict is denied',() => runAs('authenticated',staffAId,saveSql({
  venueId: venueA,departmentId: departmentA,orderId: savedOrder.id,expectedVersion: 99,
  items: [{ product_name_snapshot: 'Conflict',quantity: 1,unit: 'pz' }],
})));

const updatedOrder = JSON.parse(writeAs('authenticated',staffAId,saveSql({
  venueId: venueA,departmentId: departmentA,orderId: savedOrder.id,expectedVersion: 1,notes: 'Updated',
  items: [{ product_name_snapshot: `Updated free ${runId}`,quantity: '8.75',unit: 'pezzi',supplier_id: null }],
})));
check('valid update increments version',updatedOrder.version===2);
check('valid update replaces item set with supplier optional',runAs('authenticated',staffAId,`
  select count(*)::text||'|'||count(*) filter(where supplier_id is null)::text
  from public.purchase_order_items where purchase_order_id='${savedOrder.id}';
`)==='1|1');
expectError('direct item mutation denied',() => writeAs('authenticated',staffAId,`
  insert into public.purchase_order_items(purchase_order_id,venue_id,product_name_snapshot,quantity,unit,position)
  values('${savedOrder.id}','${venueA}','Direct',1,'pz',4);
`));

const managedOrder = JSON.parse(writeAs('authenticated',staffAId,saveSql({
  venueId: venueA,departmentId: departmentA,items: [{ product_name_snapshot: 'Managed',quantity: 1,unit: 'pz' }],
})));
const managerUpdate = JSON.parse(writeAs('authenticated',adminAId,saveSql({
  venueId: venueA,departmentId: departmentA,orderId: managedOrder.id,expectedVersion: 1,
  items: [{ product_name_snapshot: 'Managed by admin',quantity: 3,unit: 'box' }],
})));
check('manager edits another user draft',managerUpdate.version===2);
check('manager deletes another user draft',writeAs('authenticated',adminAId,`
  delete from public.purchase_orders where id='${managedOrder.id}' returning id;
`)===managedOrder.id);
check('creator deletes own draft',writeAs('authenticated',staffAId,`
  delete from public.purchase_orders where id='${savedOrder.id}' returning id;
`)===savedOrder.id);
check('all order operations leave current_stock unchanged',psql(`select current_stock::text from public.products where id='${productA}';`)===stockBefore);

console.log(JSON.stringify({ status: 'PASS',tests: results.length,results },null,2));
