import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_LIQUIDSTOCK';
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(dbContainer)) throw new Error('Refusing non-local database container');

const frontendOrigin = 'http://127.0.0.1:4175';
const proxyOrigin = 'http://127.0.0.1:54325';
const browserPort = 9225;
const localPassword = 'E2e-Local-Only-42!';
const results = [];
const processes = [];
const proxyTrace = [];

const check = (name, condition, detail = '') => {
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
  results.push({ name, status: 'PASS' });
};
const psql = (sql) => execFileSync(
  'docker',
  ['exec', '-i', dbContainer, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
).trim();
const containerIp = (name) => {
  const value = execFileSync(
    'docker',
    ['inspect', name, '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'],
    { encoding: 'utf8' },
  ).trim();
  if (!/^172\.\d+\.\d+\.\d+$/.test(value)) throw new Error(`Unexpected local container IP for ${name}`);
  return value;
};
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (operation, label, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timeout waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
};

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, userGesture = false) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture,
    });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

const startLocalProxy = () => {
  const authIp = containerIp('supabase_auth_LIQUIDSTOCK');
  const restIp = containerIp('supabase_rest_LIQUIDSTOCK');
  const server = createServer((incoming, outgoing) => {
    if (incoming.method === 'OPTIONS') {
      const requestedHeaders = incoming.headers['access-control-request-headers']
        || 'authorization, apikey, content-type, x-client-info, x-supabase-api-version';
      proxyTrace.push({ method: incoming.method, url: incoming.url, status: 204 });
      outgoing.writeHead(204, {
        'Access-Control-Allow-Origin': frontendOrigin,
        'Access-Control-Allow-Headers': requestedHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        Vary: 'Origin',
      });
      outgoing.end();
      return;
    }

    const isAuth = incoming.url?.startsWith('/auth/v1');
    const isRest = incoming.url?.startsWith('/rest/v1');
    if (!isAuth && !isRest) {
      outgoing.writeHead(404, { 'Content-Type': 'application/json' });
      outgoing.end('{"error":"local_route_not_found"}');
      return;
    }

    const prefix = isAuth ? '/auth/v1' : '/rest/v1';
    const targetHost = isAuth ? authIp : restIp;
    const targetPort = isAuth ? 9999 : 3000;
    const headers = { ...incoming.headers, host: `${targetHost}:${targetPort}` };
    delete headers.origin;
    delete headers.referer;
    const proxied = httpRequest({
      host: targetHost,
      port: targetPort,
      method: incoming.method,
      path: incoming.url.slice(prefix.length) || '/',
      headers,
    }, (response) => {
      proxyTrace.push({ method: incoming.method, url: incoming.url, status: response.statusCode });
      if (proxyTrace.length > 50) proxyTrace.shift();
      const responseHeaders = { ...response.headers };
      responseHeaders['access-control-allow-origin'] = frontendOrigin;
      responseHeaders['access-control-allow-credentials'] = 'true';
      responseHeaders.vary = 'Origin';
      outgoing.writeHead(response.statusCode || 500, responseHeaders);
      response.pipe(outgoing);
    });
    proxied.on('error', (error) => {
      outgoing.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': frontendOrigin });
      outgoing.end(JSON.stringify({ error: error.message }));
    });
    incoming.pipe(proxied);
  });
  return new Promise((resolve) => server.listen(54325, '127.0.0.1', () => resolve(server)));
};

const nativeSet = (selector, value, index = 0) => `(() => {
  const element=document.querySelectorAll(${JSON.stringify(selector)})[${index}];
  if(!element) return false;
  const prototype=element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});
  element.dispatchEvent(new Event('input',{bubbles:true}));
  element.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
})()`;
const clickSelector = (selector, index = 0) => `(() => {
  const element=document.querySelectorAll(${JSON.stringify(selector)})[${index}];
  if(!element) return false;
  element.click();
  return true;
})()`;

const venueA = randomUUID();
const venueB = randomUUID();
const departmentA = randomUUID();
const departmentB = randomUUID();
const supplierA = randomUUID();
const supplierB = randomUUID();
const productA = randomUUID();
const productB = randomUUID();
const runId = Date.now().toString(36);
const adminEmail = `e2e-admin-${runId}@local.invalid`;
const staffAEmail = `e2e-staff-a-${runId}@local.invalid`;
const staffBEmail = `e2e-staff-b-${runId}@local.invalid`;
const adminToken = `e2e-admin-token-${randomUUID()}`;
const staffAToken = `e2e-staff-a-token-${randomUUID()}`;
const staffBToken = `e2e-staff-b-token-${randomUUID()}`;

psql(`
  insert into public.venues(id,name) values
    ('${venueA}','E2E Locale A ${runId}'),
    ('${venueB}','E2E Locale B ${runId}');
  insert into public.registration_invites(venue_id,token_hash,expires_at,created_by)
  select '${venueA}',encode(digest('${adminToken}','sha256'),'hex'),now()+interval '1 hour',id
    from auth.users order by created_at limit 1;
  insert into public.registration_invites(venue_id,token_hash,expires_at,created_by)
  select '${venueA}',encode(digest('${staffAToken}','sha256'),'hex'),now()+interval '1 hour',id
    from auth.users order by created_at limit 1;
  insert into public.registration_invites(venue_id,token_hash,expires_at,created_by)
  select '${venueB}',encode(digest('${staffBToken}','sha256'),'hex'),now()+interval '1 hour',id
    from auth.users order by created_at limit 1;
`);

const edgeRuntimeIp = containerIp('supabase_edge_runtime_LIQUIDSTOCK');
const registerLocalUser = async (token, email, fullName, forwardedFor) => {
  const response = await fetch(`http://${edgeRuntimeIp}:8081/register-with-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': forwardedFor },
    body: JSON.stringify({ token, email, password: localPassword, full_name: fullName }),
  });
  if (response.status !== 201) {
    throw new Error(`Local invite registration failed (${response.status})`);
  }
};
await registerLocalUser(adminToken, adminEmail, 'E2E Admin', '127.0.0.31');
await registerLocalUser(staffAToken, staffAEmail, 'E2E Staff A', '127.0.0.32');
await registerLocalUser(staffBToken, staffBEmail, 'E2E Staff B', '127.0.0.33');

const adminId = psql(`select id from auth.users where email='${adminEmail}';`);
const staffAId = psql(`select id from auth.users where email='${staffAEmail}';`);
const staffBId = psql(`select id from auth.users where email='${staffBEmail}';`);
if (![adminId, staffAId, staffBId].every((id) => /^[0-9a-f-]{36}$/.test(id))) {
  throw new Error('Local invite registration did not create all E2E users');
}

psql(`
  update public.profiles set role='admin',venue_id='${venueA}' where id='${adminId}';
  update public.profiles set role='staff',venue_id='${venueA}' where id='${staffAId}';
  update public.profiles set role='staff',venue_id='${venueB}' where id='${staffBId}';
  insert into public.order_permissions(
    venue_id,user_id,can_create_manual_orders,can_manage_orders,can_send_whatsapp_orders,is_active
  ) values
    ('${venueA}','${adminId}',true,true,true,true),
    ('${venueB}','${staffBId}',true,false,false,true);
  insert into public.departments(id,venue_id,name) values
    ('${departmentA}','${venueA}','E2E Bar A ${runId}'),
    ('${departmentB}','${venueB}','E2E Bar B ${runId}');
  insert into public.suppliers(id,venue_id,name,whatsapp_number) values
    ('${supplierA}','${venueA}','E2E Fornitore A ${runId}','+39 (333) 123-4567'),
    ('${supplierB}','${venueB}','E2E Fornitore B ${runId}','393339999999');
  insert into public.products(id,venue_id,name,category,unit,current_stock,cost_price,selling_price) values
    ('${productA}','${venueA}','E2E Prodotto A ${runId}','E2E','pz',73.25,1,2),
    ('${productB}','${venueB}','E2E Prodotto B ${runId}','E2E','pz',18,1,2);
`);

const orderBId = psql(`
  begin;
  set local "request.jwt.claim.sub"='${staffBId}';
  set local "request.jwt.claim.role"='authenticated';
  set local role authenticated;
  select id from public.save_purchase_order_draft(
    '${venueB}'::uuid,
    '${departmentB}'::uuid,
    '[{"product_id":"${productB}","product_name_snapshot":"E2E Prodotto B","quantity":1,"unit":"pz","supplier_id":"${supplierB}"}]'::jsonb
  );
  commit;
`);
psql(`
  update public.order_permissions
  set can_create_manual_orders=false,can_send_whatsapp_orders=false
  where user_id='${staffBId}' and venue_id='${venueB}';
`);
const stockBefore = psql(`select md5(current_stock::text) from public.products where id='${productA}';`);

let proxyServer;
let client;
try {
  proxyServer = await startLocalProxy();

  const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4175'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_SUPABASE_URL: proxyOrigin,
      VITE_SUPABASE_ANON_KEY: 'local-e2e-publishable-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  processes.push(vite);
  let viteOutput = '';
  vite.stdout.on('data', (chunk) => { viteOutput += String(chunk); });
  vite.stderr.on('data', (chunk) => { viteOutput += String(chunk); });
  await waitFor(async () => {
    try {
      return (await fetch(frontendOrigin)).ok;
    } catch {
      return false;
    }
  }, `Vite (${viteOutput})`);

  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${browserPort}`,
    `--user-data-dir=/tmp/liquidstock-orders-e2e-${runId}`,
    'about:blank',
  ], { stdio: 'ignore', detached: true });
  processes.push(chrome);
  await waitFor(async () => {
    try {
      return (await fetch(`http://127.0.0.1:${browserPort}/json/version`)).ok;
    } catch {
      return false;
    }
  }, 'Chrome DevTools');

  const target = await fetch(
    `http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(`${frontendOrigin}/login`)}`,
    { method: 'PUT' },
  ).then((response) => response.json());
  client = new CdpClient(target.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  const waitExpression = (expression, label, timeout) => waitFor(
    () => client.evaluate(expression),
    label,
    timeout,
  );
  const realClick = async (selector, index = 0) => {
    const point = await client.evaluate(`(() => {
      const element=document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if(!element) return null;
      element.scrollIntoView({block:'center'});
      const rect=element.getBoundingClientRect();
      return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    })()`);
    if (!point) throw new Error(`Element not found for real click: ${selector}`);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  };
  const navigate = async (path) => {
    await client.send('Page.navigate', { url: `${frontendOrigin}${path}` });
    await waitExpression(`document.readyState==='complete'`, `page ${path}`);
  };
  const login = async (email) => {
    await navigate('/login');
    await waitExpression(`Boolean(document.querySelector('input[type="email"]'))`, 'login form');
    await client.evaluate(nativeSet('input[type="email"]', email));
    await client.evaluate(nativeSet('input[type="password"]', localPassword));
    await client.evaluate(clickSelector('button[type="submit"]'), true);
    await waitExpression(`location.pathname==='/'`, `login ${email}`, 20000);
  };
  const logout = async () => {
    await client.evaluate(`localStorage.clear();sessionStorage.clear();true`);
    await client.send('Page.navigate', { url: `${frontendOrigin}/login` });
    await waitExpression(`Boolean(document.querySelector('input[type="email"]'))`, 'cleared local session');
  };

  await login(adminEmail);
  try {
    await waitExpression(`Boolean(document.querySelector('[data-testid="nav-orders"]'))`, 'admin Orders nav');
  } catch (error) {
    const browserState = await client.evaluate(`({
      path:location.pathname,
      text:document.body.textContent.slice(0,500),
      localStorageKeys:Object.keys(localStorage)
    })`);
    throw new Error(`${error.message}; state=${JSON.stringify(browserState)}; proxy=${JSON.stringify(proxyTrace)}`);
  }
  check('admin sees Orders', true);
  await navigate('/team');
  const staffCardSelector = `[data-testid="team-user-${staffAId}"]`;
  await waitExpression(`Boolean(document.querySelector(${JSON.stringify(staffCardSelector)}))`, 'staff permission card');
  for (const permissionName of ['can_create_manual_orders', 'can_send_whatsapp_orders']) {
    const selector = `${staffCardSelector} [data-permission="${permissionName}"]`;
    const alreadyChecked = await client.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)})?.checked)`);
    if (!alreadyChecked) await realClick(selector);
    await sleep(300);
    await waitExpression(
      `Boolean(document.querySelector(${JSON.stringify(selector)})?.checked)`,
      `${permissionName} checked`,
    );
  }
  await waitExpression(`[
    'can_create_manual_orders',
    'can_send_whatsapp_orders'
  ].every((name)=>document.querySelector(
    ${JSON.stringify(staffCardSelector)}+' [data-permission="'+name+'"]'
  )?.checked)`, 'permission checkbox state');
  await sleep(500);
  await client.evaluate(clickSelector(`[data-testid="save-order-permissions-${staffAId}"]`), true);
  await waitExpression(
    `document.querySelector(${JSON.stringify(staffCardSelector)})?.textContent.includes('Salvato')`,
    'visual permission confirmation',
  );
  check('permission granted from Team UI', psql(`
    select (can_create_manual_orders and can_send_whatsapp_orders and is_active)::text
    from public.order_permissions where venue_id='${venueA}' and user_id='${staffAId}';
  `) === 'true');
  await logout();

  await login(staffBEmail);
  await sleep(500);
  check('staff without permission does not see Orders', !(await client.evaluate(`Boolean(document.querySelector('[data-testid="nav-orders"]'))`)));
  await logout();

  await login(staffAEmail);
  await waitExpression(`Boolean(document.querySelector('[data-testid="nav-orders"]'))`, 'staff Orders nav');
  check('authorized staff sees Orders after UI grant', true);
  await client.evaluate(clickSelector('[data-testid="nav-orders"]'), true);
  await waitExpression(`location.pathname==='/orders'`, 'Orders list');
  await navigate('/orders/new');
  await waitExpression(`Boolean(document.querySelector('[data-testid="manual-order-page"]'))`, 'manual order page');

  await client.evaluate(nativeSet('[data-testid="order-item"] [data-field="product-name"]', `E2E riga senza fornitore ${runId}`));
  await client.evaluate(clickSelector(`[data-testid="add-product-${productA}"]`), true);
  await waitExpression(`document.querySelectorAll('[data-testid="order-item"]').length===2`, 'existing product row');
  await client.evaluate(nativeSet('[data-testid="order-item"] [data-field="quantity"]', '4', 1));
  await client.evaluate(nativeSet('[data-testid="order-item"] [data-field="unit"]', 'cartoni', 1));
  await client.evaluate(nativeSet('[data-testid="order-item"] [data-field="package-note"]', '6 x 1 L', 1));
  await client.evaluate(nativeSet('[data-testid="order-item"] [data-field="supplier"]', supplierA, 1));

  await client.evaluate(clickSelector('[data-testid="add-free-order-item"]'), true);
  await waitExpression(`document.querySelectorAll('[data-testid="order-item"]').length===3`, 'free order row');
  await client.evaluate(nativeSet('[data-testid="order-item"] [data-field="product-name"]', `E2E riga libera ${runId}`, 1));
  await client.evaluate(clickSelector('[data-testid="order-item"] [data-action="quick-supplier"]', 1), true);
  await waitExpression(`Boolean(document.querySelector('[data-testid="quick-supplier-name"]'))`, 'quick supplier modal');
  const quickSupplierName = `E2E Fornitore Senza Numero ${runId}`;
  await client.evaluate(nativeSet('[data-testid="quick-supplier-name"]', quickSupplierName));
  await client.evaluate(clickSelector('[data-testid="create-quick-supplier"]'), true);
  await waitExpression(`!document.querySelector('[data-testid="quick-supplier-name"]')`, 'quick supplier creation');
  const quickSupplierId = await waitFor(() => {
    const id = psql(`select id from public.suppliers where venue_id='${venueA}' and name='${quickSupplierName}';`);
    return id || false;
  }, 'quick supplier database row');
  check('quick supplier created and assigned', await client.evaluate(`
    [...document.querySelectorAll('[data-testid="order-item"] [data-field="supplier"]')]
      .some((element)=>element.value===${JSON.stringify(quickSupplierId)})
  `));
  check('manual form visually groups two suppliers and unassigned rows', await client.evaluate(`
    document.body.textContent.includes(${JSON.stringify(`E2E Fornitore A ${runId}`)})
      && document.body.textContent.includes(${JSON.stringify(quickSupplierName)})
      && document.body.textContent.includes('Da assegnare')
  `));

  await client.evaluate(clickSelector('[data-testid="save-order-draft"]'), true);
  await waitExpression(`location.pathname==='/orders'`, 'draft save', 20000);
  const draftId = await waitExpression(`(() => {
    const card=document.querySelector('[data-testid^="order-draft-"]');
    return card?.getAttribute('data-testid')?.replace('order-draft-','') || '';
  })()`, 'saved draft card');
  check('browser created product, free, two-supplier and unassigned rows', psql(`
    select (
      count(*)=3
      and count(*) filter(where product_id is not null)=1
      and count(*) filter(where product_id is null)=2
      and count(distinct supplier_id)=2
      and count(*) filter(where supplier_id is null)=1
    )::text
    from public.purchase_order_items where purchase_order_id='${draftId}';
  `) === 'true');

  await navigate(`/orders/${draftId}`);
  await waitExpression(`Boolean(document.querySelector('[data-testid="manual-order-page"]'))`, 'draft edit page');
  await client.evaluate(nativeSet('[data-testid="order-general-notes"]', 'Tentativo concorrente'));
  psql(`update public.purchase_orders set version=version+1 where id='${draftId}';`);
  await client.evaluate(clickSelector('[data-testid="save-order-draft"]'), true);
  await waitExpression(`document.body.textContent.includes('order_version_conflict')`, 'optimistic version conflict');
  check('browser exposes version conflict without overwriting draft', psql(`
    select coalesce(general_notes,'') from public.purchase_orders where id='${draftId}';
  `) !== 'Tentativo concorrente');

  await navigate(`/orders/${draftId}`);
  await waitExpression(`Boolean(document.querySelector('[data-testid="manual-order-page"]'))`, 'reloaded draft');
  await client.evaluate(nativeSet('[data-testid="order-general-notes"]', 'Nota E2E aggiornata'));
  await client.evaluate(clickSelector('[data-testid="save-order-draft"]'), true);
  await waitExpression(`location.pathname==='/orders'`, 'valid draft update', 20000);
  check('browser modifies draft after refresh', psql(`
    select general_notes from public.purchase_orders where id='${draftId}';
  `) === 'Nota E2E aggiornata');

  await waitExpression(
    `Boolean(document.querySelector(${JSON.stringify(`[data-testid="whatsapp-preview-${draftId}"]`)}))`,
    'WhatsApp preview button',
  );
  await client.evaluate(clickSelector(`[data-testid="whatsapp-preview-${draftId}"]`), true);
  await waitExpression(`document.querySelectorAll('[data-testid^="whatsapp-group-"]').length===2`, 'WhatsApp supplier grouping');
  check('WhatsApp preview groups one message per supplier', true);
  check('WhatsApp preview reports unassigned row', await client.evaluate(`document.body.textContent.includes('Righe senza fornitore: 1')`));
  const customMessage = `${await client.evaluate(`document.querySelector(${JSON.stringify(`[data-testid="whatsapp-message-${supplierA}"]`)}).value`)}\nNota anteprima modificata`;
  await client.evaluate(nativeSet(`[data-testid="whatsapp-message-${supplierA}"]`, customMessage));
  const currentVersion = Number(psql(`select version from public.purchase_orders where id='${draftId}';`));
  await realClick(`[data-testid="open-whatsapp-${supplierA}"]`);
  const whatsappTarget = await waitFor(async () => {
    const targets = await fetch(`http://127.0.0.1:${browserPort}/json/list`).then((response) => response.json());
    return targets.find((item) =>
      item.url.includes('wa.me/393331234567')
      || (item.url.includes('whatsapp.com') && item.url.includes('393331234567'))
    ) || false;
  }, 'wa.me browser target', 20000);
  check('browser opens normalized WhatsApp link without invented prefix',
    whatsappTarget.url.includes('393331234567'));
  check('WhatsApp opening stores exact event snapshot', await waitFor(() => psql(`
    select (
      status='whatsapp_opened'
      and supplier_id='${supplierA}'
      and opened_by='${staffAId}'
      and order_version=${currentVersion}
      and message_snapshot=${`$message$${customMessage}$message$`}
    )::text
    from public.supplier_order_dispatches
    where purchase_order_id='${draftId}'
    order by opened_at desc limit 1;
  `) === 'true', 'WhatsApp event snapshot'));

  await realClick(`[data-testid="open-whatsapp-${quickSupplierId}"]`);
  await waitExpression(
    `document.querySelector(${JSON.stringify(`[data-testid="whatsapp-group-${quickSupplierId}"]`)})?.textContent.includes('Numero WhatsApp mancante o non valido')`,
    'supplier without number error',
  );
  check('supplier without number keeps copy fallback available', await client.evaluate(`
    Boolean(document.querySelector(${JSON.stringify(`[data-testid="whatsapp-group-${quickSupplierId}"]`)}))
      && document.querySelector(${JSON.stringify(`[data-testid="whatsapp-group-${quickSupplierId}"]`)}).textContent.includes('Copia testo')
  `));

  await navigate(`/orders/${orderBId}`);
  await waitExpression(`document.body.textContent.includes('Bozza non trovata o non accessibile')`, 'cross-venue draft denial');
  check('cross-venue browser access is blocked by RLS', true);

  await navigate('/orders');
  await waitExpression(`Boolean(document.querySelector(${JSON.stringify(`[data-testid="delete-order-${draftId}"]`)}))`, 'draft delete button');
  await client.evaluate(`window.confirm=()=>true`);
  await client.evaluate(clickSelector(`[data-testid="delete-order-${draftId}"]`), true);
  await waitExpression(`!document.querySelector(${JSON.stringify(`[data-testid="order-draft-${draftId}"]`)})`, 'draft deletion');
  check('browser deletes own draft', psql(`select count(*) from public.purchase_orders where id='${draftId}';`) === '0');
  check('browser E2E leaves current_stock unchanged', psql(`
    select md5(current_stock::text) from public.products where id='${productA}';
  `) === stockBefore);

  console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
} finally {
  client?.close();
  for (const child of processes.reverse()) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  if (proxyServer) {
    proxyServer.closeAllConnections?.();
    await new Promise((resolve) => proxyServer.close(resolve));
  }
  try {
    psql(`
      delete from public.purchase_orders where venue_id in ('${venueA}','${venueB}');
      delete from public.products where venue_id in ('${venueA}','${venueB}');
      delete from public.order_permissions where venue_id in ('${venueA}','${venueB}');
      delete from public.departments where venue_id in ('${venueA}','${venueB}');
      delete from public.suppliers where venue_id in ('${venueA}','${venueB}');
      delete from public.venue_access where venue_id in ('${venueA}','${venueB}');
      delete from auth.users where id in ('${adminId}','${staffAId}','${staffBId}');
      delete from public.venues where id in ('${venueA}','${venueB}');
    `);
  } catch {
    // Preserve the original test result; all fixtures are local and uniquely named.
  }
}
