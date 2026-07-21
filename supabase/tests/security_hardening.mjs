import { randomBytes } from 'node:crypto';

if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = (await import('ws')).default; } catch { /* locked Supabase client does not require it */ }
}
const { createClient } = await import('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error('Missing local Supabase test environment');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error('Refusing to run against a non-local Supabase URL');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = Date.now().toString(36);
const password = `Local-${randomBytes(12).toString('base64url')}Aa1!`;
const results = [];

const check = (name, condition, detail = '') => {
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
  results.push({ name, status: 'PASS' });
};
const must = async (name, promise) => {
  const result = await promise;
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  results.push({ name, status: 'PASS' });
  return result.data;
};
const clientFor = async (email) => {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  check(`login:${email.split('@')[0]}`, Boolean(data.session));
  return client;
};
const createUser = async (label, role, venueId = null, access = []) => {
  const email = `s0-${label}-${runId}@local.test`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `S0 ${label}` },
  });
  if (error) throw error;
  await must(`fixture profile:${label}`, service.from('profiles').update({ role, venue_id: venueId }).eq('id', data.user.id));
  if (access.length) await must(`fixture access:${label}`, service.from('venue_access').insert(access.map((id) => ({ user_id: data.user.id, venue_id: id }))));
  return { id: data.user.id, email };
};

const venues = await must('fixture venues', service.from('venues').insert([
  { name: `Venue A ${runId}` }, { name: `Venue B ${runId}` },
]).select());
const [venueA, venueB] = venues;

const noAccessUser = await createUser('no-access', 'staff');
const staffUser = await createUser('staff', 'staff', venueA.id, [venueA.id]);
const adminUser = await createUser('admin', 'admin', venueA.id, [venueA.id]);
const secondaryAdminUser = await createUser('secondary-admin', 'admin', venueA.id, [venueA.id, venueB.id]);
const superUser = await createUser('super', 'super_admin', venueA.id, [venueA.id]);
const multiUser = await createUser('multi', 'staff', venueA.id, [venueA.id, venueB.id]);
const staffBUser = await createUser('staff-b', 'staff', venueB.id, [venueB.id]);

const products = await must('fixture products', service.from('products').insert([
  { name: `A Product ${runId}`, category: 'Test', cost_price: 2, selling_price: 5, current_stock: 10, venue_id: venueA.id },
  { name: `B Product ${runId}`, category: 'Test', cost_price: 3, selling_price: 6, current_stock: 20, venue_id: venueB.id },
]).select());
const [productA, productB] = products;

// Anonymous and direct-signup hardening.
for (const table of ['profiles', 'configs', 'venues', 'products', 'events', 'reports', 'restock_sessions', 'restock_items']) {
  const { error } = await anon.from(table).select('*').limit(1);
  check(`anon denied:${table}`, Boolean(error), error?.message);
}
const rawSignup = await anon.auth.signUp({
  email: `s0-raw-${runId}@local.test`, password,
  options: { data: { role: 'super_admin', venue_id: venueB.id, registration_code: 'LEAK' } },
});
check('direct signup disabled', Boolean(rawSignup.error));

const noAccess = await clientFor(noAccessUser.email);
const staff = await clientFor(staffUser.email);
const admin = await clientFor(adminUser.email);
const secondaryAdmin = await clientFor(secondaryAdminUser.email);
const superAdmin = await clientFor(superUser.email);
const multi = await clientFor(multiUser.email);

const noAccessVenues = await must('no-access venue RPC', noAccess.rpc('get_my_accessible_venues'));
check('authenticated without access sees no venue', noAccessVenues.length === 0);
const ownProfile = await must('no-access own profile', noAccess.from('profiles').select('id,role').eq('id', noAccessUser.id).single());
check('authenticated without access sees own profile', ownProfile.id === noAccessUser.id);

const staffVenues = await must('staff venue RPC', staff.rpc('get_my_accessible_venues'));
check('staff one venue', staffVenues.length === 1 && staffVenues[0].id === venueA.id);
const multiVenues = await must('multi venue RPC', multi.rpc('get_my_accessible_venues'));
check('multi user two venues', multiVenues.length === 2);
const superVenues = await must('super venue RPC', superAdmin.rpc('get_my_accessible_venues'));
check('super sees all fixture venues', superVenues.some((v) => v.id === venueA.id) && superVenues.some((v) => v.id === venueB.id));

const staffProducts = await must('staff products', staff.from('products').select('id,venue_id').in('id', [productA.id, productB.id]));
check('staff isolated to venue A', staffProducts.length === 1 && staffProducts[0].id === productA.id);
const multiProducts = await must('multi products', multi.from('products').select('id').in('id', [productA.id, productB.id]));
check('multi user sees both venues', multiProducts.length === 2);

const teamForVenue = async (client, venueId) => {
  const access = await client.from('venue_access').select('user_id').eq('venue_id', venueId);
  if (access.error) throw access.error;
  const ids = access.data.map((row) => row.user_id);
  if (ids.length === 0) return [];
  const profiles = await client.from('profiles').select('id,role,venue_id').in('id', ids);
  if (profiles.error) throw profiles.error;
  return profiles.data;
};
const primaryTeam = await teamForVenue(admin, venueA.id);
check('team admin primary venue', primaryTeam.some((profile) => profile.id === staffUser.id));
const secondaryTeam = await teamForVenue(secondaryAdmin, venueB.id);
check('team admin secondary venue', secondaryTeam.some((profile) => profile.id === staffBUser.id));
check('team includes multi-venue member', secondaryTeam.some((profile) => profile.id === multiUser.id));
const unauthorizedTeam = await teamForVenue(admin, venueB.id);
check('team unauthorized venue returns no members', unauthorizedTeam.length === 0);
const unauthorizedProfile = await admin.from('profiles').select('id').eq('id', staffBUser.id);
check('team unauthorized profile hidden', !unauthorizedProfile.error && unauthorizedProfile.data.length === 0);
const unauthorizedRemoval = await admin.rpc('remove_user_from_venue', { p_user_id: staffBUser.id, p_venue_id: venueB.id });
check('team unauthorized management denied', Boolean(unauthorizedRemoval.error));

await must('staff stock update', staff.from('products').update({ current_stock: 11 }).eq('id', productA.id).select().single());
const staffPriceAttempt = await staff.from('products').update({ cost_price: 999 }).eq('id', productA.id).select();
check('staff price update denied', Boolean(staffPriceAttempt.error));
const staffCrossUpdate = await staff.from('products').update({ current_stock: 999 }).eq('id', productB.id).select();
check('staff cross-venue update affects zero rows', !staffCrossUpdate.error && staffCrossUpdate.data.length === 0);
await must('admin product insert', admin.from('products').insert({ name: `Admin Product ${runId}`, category: 'Test', venue_id: venueA.id }).select().single());

// Opening/closing an event and producing report/history/analytics data.
const event = await must('event open', staff.from('events').insert({ name: `Night ${runId}`, date: '2026-07-21', status: 'open', venue_id: venueA.id }).select().single());
const eventStock = await must('event stock create', staff.from('event_stocks').insert({ event_id: event.id, product_id: productA.id, initial_qty: 11 }).select().single());
await must('event final stock', staff.from('event_stocks').update({ final_qty: 8, consumed: 3, cost_value: 6, stock_value_cost: 16 }).eq('id', eventStock.id).select().single());
await must('event product stock close', staff.from('products').update({ current_stock: 8 }).eq('id', productA.id).select().single());
const report = await must('report create', staff.from('reports').insert({ event_id: event.id, venue_id: venueA.id, total_cost_consumed: 6, total_stock_value_cost: 16, details_json: [] }).select().single());
await must('event close', staff.from('events').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', event.id).select().single());
await must('event activity', staff.from('activity_log').insert({ venue_id: venueA.id, user_id: staffUser.id, action_type: 'event_close', action_id: event.id }).select().single());
const history = await must('history read', staff.from('events').select('id').eq('status', 'closed').eq('id', event.id));
check('history contains closed event', history.length === 1);
const analytics = await must('analytics read', staff.from('reports').select('id,total_cost_consumed').eq('id', report.id));
check('analytics contains report', analytics.length === 1);

// Arrival flow.
const restock = await must('arrival open', staff.from('restock_sessions').insert({ venue_id: venueA.id, status: 'open' }).select().single());
await must('arrival item', staff.from('restock_items').insert({ session_id: restock.id, product_id: productA.id, quantity: 4 }).select().single());
await must('arrival stock update', staff.from('products').update({ current_stock: 12 }).eq('id', productA.id).select().single());
await must('arrival close', staff.from('restock_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', restock.id).select().single());
await must('arrival activity', staff.from('activity_log').insert({ venue_id: venueA.id, user_id: staffUser.id, action_type: 'restock_close', action_id: restock.id }).select().single());
const crossChild = await staff.from('restock_items').insert({ session_id: restock.id, product_id: productB.id, quantity: 1 });
check('cross-venue child reference denied', Boolean(crossChild.error));

await must('admin report edit', admin.from('reports').update({ total_cost_consumed: 7 }).eq('id', report.id).select().single());
await must('admin report audit', admin.from('report_edit_log').insert({ report_id: report.id, field_changed: 'total_cost_consumed', old_value: 6, new_value: 7 }).select().single());
const staffReportEdit = await staff.from('reports').update({ total_cost_consumed: 99 }).eq('id', report.id).select();
check('staff report edit denied', Boolean(staffReportEdit.error) || staffReportEdit.data.length === 0);

const roleEscalation = await staff.from('profiles').update({ role: 'super_admin', venue_id: venueB.id }).eq('id', staffUser.id).select();
check('self role and venue escalation denied', Boolean(roleEscalation.error));
const adminPromotion = await admin.from('profiles').update({ role: 'admin' }).eq('id', staffUser.id).select();
check('admin cannot promote staff', Boolean(adminPromotion.error) || adminPromotion.data.length === 0);
await must('super admin promotes staff', superAdmin.from('profiles').update({ role: 'admin' }).eq('id', staffBUser.id).select().single());
const configRead = await admin.from('configs').select('*');
check('configs hidden from authenticated clients', Boolean(configRead.error));

// One-time invite end to end.
const { data: adminSession } = await admin.auth.getSession();
const inviteResponse = await fetch(`${url}/functions/v1/create-registration-invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSession.session.access_token}` },
  body: JSON.stringify({ venue_id: venueA.id, expires_in_hours: 1 }),
});
const invite = await inviteResponse.json();
check('admin creates one-time invite', inviteResponse.ok && Boolean(invite.token));
const inviteRows = await must('invite hash stored', service.from('registration_invites').select('token_hash').eq('id', invite.id).single());
check('invite stores hash only', inviteRows.token_hash.length === 64 && inviteRows.token_hash !== invite.token);

const invitedEmail = `s0-invited-${runId}@local.test`;
const registerResponse = await fetch(`${url}/functions/v1/register-with-invite`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: invite.token, email: invitedEmail, password, full_name: 'Invited Staff' }),
});
const registered = await registerResponse.json();
check('invite registration succeeds', registerResponse.status === 201 && registered.registered === true);
const registeredUsers = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
const registeredUserId = registeredUsers.data.users.find((user) => user.email === invitedEmail)?.id;
check('invited auth user found', Boolean(registeredUserId));
const registeredUser = await service.auth.admin.getUserById(registeredUserId);
const metadata = registeredUser.data.user.user_metadata;
check('metadata contains no token/role/venue/code', !('role' in metadata) && !('venue_id' in metadata) && !('token' in metadata) && !('registration_code' in metadata));
const invitedProfile = await must('invited profile', service.from('profiles').select('role,venue_id').eq('id', registeredUserId).single());
check('database assigns staff and venue', invitedProfile.role === 'staff' && invitedProfile.venue_id === venueA.id);
const reuseResponse = await fetch(`${url}/functions/v1/register-with-invite`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: invite.token, email: `s0-reuse-${runId}@local.test`, password, full_name: 'Reuse' }),
});
check('invite reuse denied', !reuseResponse.ok);

const revokeInviteResponse = await fetch(`${url}/functions/v1/create-registration-invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSession.session.access_token}` },
  body: JSON.stringify({ venue_id: venueA.id, expires_in_hours: 1 }),
});
const revokeInvite = await revokeInviteResponse.json();
const revokeResponse = await fetch(`${url}/functions/v1/create-registration-invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSession.session.access_token}` },
  body: JSON.stringify({ action: 'revoke', venue_id: venueA.id, invite_id: revokeInvite.id }),
});
check('unused invite can be revoked', revokeResponse.ok && (await revokeResponse.json()).revoked === true);
const revokedRegistration = await fetch(`${url}/functions/v1/register-with-invite`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: revokeInvite.token, email: `s0-revoked-${runId}@local.test`, password, full_name: 'Revoked' }),
});
check('revoked invite denied', !revokedRegistration.ok);

const removableUser = await createUser('removable', 'staff', venueA.id, [venueA.id]);
const removed = await must('admin removes venue access', admin.rpc('remove_user_from_venue', { p_user_id: removableUser.id, p_venue_id: venueA.id }));
check('venue access removal confirmed', removed === true);
await must('super deletes profile', superAdmin.from('profiles').delete().eq('id', removableUser.id));
const deletedAuthUser = await service.auth.admin.getUserById(removableUser.id);
check('profile deletion removes auth user', Boolean(deletedAuthUser.error));

const logout = await staff.auth.signOut();
check('logout', !logout.error);

console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
