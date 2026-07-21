import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = (await import('ws')).default; } catch { /* package-lock client does not require it */ }
}
const { createClient } = await import('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbContainer = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_LIQUIDSTOCK';
if (!url || !anonKey || !serviceKey) throw new Error('Missing local Supabase environment');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error('Refusing non-local target');

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
  const value = await promise;
  if (value.error) throw new Error(`${name}: ${value.error.message}`);
  results.push({ name, status: 'PASS' });
  return value.data;
};
const psql = (sql) => execFileSync('docker', ['exec', dbContainer, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' });
const listUserByEmail = async (email) => {
  const users = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  return users.data.users.find((user) => user.email === email);
};
const makeUser = async (label, role, venueId = null, access = []) => {
  const email = `edge-${label}-${runId}@local.test`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Edge ${label}` } });
  if (created.error) throw created.error;
  await must(`fixture profile:${label}`, service.from('profiles').update({ role, venue_id: venueId }).eq('id', created.data.user.id));
  if (access.length) await must(`fixture access:${label}`, service.from('venue_access').insert(access.map((id) => ({ user_id: created.data.user.id, venue_id: id }))));
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: created.data.user.id, email, client, token: login.data.session.access_token };
};
const callCreate = (accessToken, body, origin) => fetch(`${url}/functions/v1/create-registration-invite`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(origin ? { Origin: origin } : {}),
  },
  body: JSON.stringify(body),
});
const createInvite = async (actor, venueId) => {
  const response = await callCreate(actor.token, { venue_id: venueId, expires_in_hours: 1 });
  const body = await response.json();
  if (response.status !== 201) throw new Error(`create invite failed: ${response.status} ${JSON.stringify(body)}`);
  return body;
};
const callRegister = (body, headers = {}) => fetch(`${url}/functions/v1/register-with-invite`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

const venues = await must('fixture venues', service.from('venues').insert([
  { name: `Edge Venue A ${runId}` }, { name: `Edge Venue B ${runId}` },
]).select());
const [venueA, venueB] = venues;
const staff = await makeUser('staff', 'staff', venueA.id, [venueA.id]);
const admin = await makeUser('admin', 'admin', venueA.id, [venueA.id]);
const superAdmin = await makeUser('super', 'super_admin', venueA.id, [venueA.id]);

// JWT, database authorization and venue authorization.
const noJwt = await callCreate(null, { venue_id: venueA.id });
check('create requires JWT', noJwt.status === 401);
const invalidJwt = await callCreate('not-a-jwt', { venue_id: venueA.id });
check('create rejects invalid JWT', invalidJwt.status === 401);
const staffDenied = await callCreate(staff.token, { venue_id: venueA.id });
check('staff cannot create invite', staffDenied.status === 403);
const adminCrossVenue = await callCreate(admin.token, { venue_id: venueB.id });
check('admin cannot invite for another venue', adminCrossVenue.status === 403);
const adminOwnInvite = await createInvite(admin, venueA.id);
check('admin can invite own venue', Boolean(adminOwnInvite.token));
const superInvite = await createInvite(superAdmin, venueB.id);
check('super admin can invite any venue', Boolean(superInvite.token));

const spoofEmail = `edge-spoof-${runId}@local.test`;
const spoofCreated = await service.auth.admin.createUser({
  email: spoofEmail, password, email_confirm: true,
  user_metadata: { full_name: 'Spoof', role: 'super_admin', venue_id: venueB.id },
});
if (spoofCreated.error) throw spoofCreated.error;
await must('spoof fixture access', service.from('venue_access').insert({ user_id: spoofCreated.data.user.id, venue_id: venueA.id }));
const spoofClient = createClient(url, anonKey, { auth: { persistSession: false } });
const spoofLogin = await spoofClient.auth.signInWithPassword({ email: spoofEmail, password });
const spoofDenied = await callCreate(spoofLogin.data.session.access_token, { venue_id: venueB.id });
check('metadata role and venue ignored', spoofDenied.status === 403);
const sanitizedSpoof = await listUserByEmail(spoofEmail);
check('untrusted role and venue metadata removed', !('role' in (sanitizedSpoof.user_metadata || {})) && !('venue_id' in (sanitizedSpoof.user_metadata || {})));

// CORS is enforced on the actual request; Kong may still answer OPTIONS itself locally.
const evilOrigin = await callRegister({}, { Origin: 'https://evil.example' });
check('unauthorized origin denied', evilOrigin.status === 403);
const allowedOrigin = await callRegister({}, { Origin: 'http://127.0.0.1:4173' });
check('allowed origin reaches validation', allowedOrigin.status === 400);

// Payload cannot override role or venue; invite remains usable afterwards.
const overrideInvite = await createInvite(admin, venueA.id);
const overrideEmail = `edge-override-${runId}@local.test`;
const overrideAttempt = await callRegister({
  token: overrideInvite.token, email: overrideEmail, password, full_name: 'Override', role: 'super_admin', venue_id: venueB.id,
});
check('role/venue payload rejected', overrideAttempt.status === 400 && (await overrideAttempt.json()).error === 'invalid_request');
const overrideValid = await callRegister({ token: overrideInvite.token, email: overrideEmail, password, full_name: 'Override' });
check('rejected override did not consume invite', overrideValid.status === 201);
const overrideUser = await listUserByEmail(overrideEmail);
const overrideProfile = await must('override profile', service.from('profiles').select('role,venue_id').eq('id', overrideUser.id).single());
check('database enforces staff and invite venue', overrideProfile.role === 'staff' && overrideProfile.venue_id === venueA.id);
check('normal registration removes reservation metadata', !('registration_attempt_id' in (overrideUser.user_metadata || {})));

// Concurrent consumption: exactly one request succeeds.
const raceInvite = await createInvite(admin, venueA.id);
const raceEmails = [`edge-race-a-${runId}@local.test`, `edge-race-b-${runId}@local.test`];
const raceResponses = await Promise.all(raceEmails.map((email) => callRegister({ token: raceInvite.token, email, password, full_name: 'Race' })));
check('concurrent invite has one winner', raceResponses.filter((response) => response.status === 201).length === 1);
const raceUsers = await Promise.all(raceEmails.map(listUserByEmail));
check('concurrent invite creates one auth user', raceUsers.filter(Boolean).length === 1);

// Existing email returns a generic failure and releases the reservation.
const existingInvite = await createInvite(admin, venueA.id);
const existingResponse = await callRegister({ token: existingInvite.token, email: staff.email, password, full_name: 'Existing' });
const existingBody = await existingResponse.json();
check('existing email has generic error', existingResponse.status === 400 && existingBody.error === 'registration_unavailable' && Object.keys(existingBody).length === 1);
const recoveredEmail = `edge-recovered-${runId}@local.test`;
const recoveredResponse = await callRegister({ token: existingInvite.token, email: recoveredEmail, password, full_name: 'Recovered' });
check('invite reusable after existing-email failure', recoveredResponse.status === 201);

// Profile insertion failure rolls back auth.users and releases the reservation.
psql(`create or replace function public.test_fail_profile_insert() returns trigger language plpgsql as $$ begin if new.full_name='FAIL_PROFILE' then raise exception 'injected profile failure'; end if; return new; end $$; create trigger test_fail_profile_insert before insert on public.profiles for each row execute function public.test_fail_profile_insert();`);
try {
  const invite = await createInvite(admin, venueA.id);
  const email = `edge-fail-profile-${runId}@local.test`;
  const response = await callRegister({ token: invite.token, email, password, full_name: 'FAIL_PROFILE' });
  check('profile failure returns generic error', response.status === 400 && (await response.json()).error === 'registration_unavailable');
  check('profile failure leaves no auth user', !(await listUserByEmail(email)));
  const profileCheck = await service.from('profiles').select('id', { count: 'exact', head: true }).eq('full_name', 'FAIL_PROFILE');
  check('profile failure leaves no profile', !profileCheck.error && profileCheck.count === 0);
  const reservation = await must('profile reservation check', service.from('registration_invites').select('reservation_id').eq('id', invite.id).single());
  check('profile failure releases reservation', reservation.reservation_id === null);
} finally {
  psql(`drop trigger if exists test_fail_profile_insert on public.profiles; drop function if exists public.test_fail_profile_insert();`);
}

// venue_access insertion failure rolls back profile and auth user in the same Auth transaction.
psql(`create or replace function public.test_fail_access_insert() returns trigger language plpgsql as $$ begin if exists(select 1 from public.profiles p where p.id=new.user_id and p.full_name='FAIL_ACCESS') then raise exception 'injected access failure'; end if; return new; end $$; create trigger test_fail_access_insert before insert on public.venue_access for each row execute function public.test_fail_access_insert();`);
try {
  const invite = await createInvite(admin, venueA.id);
  const email = `edge-fail-access-${runId}@local.test`;
  const response = await callRegister({ token: invite.token, email, password, full_name: 'FAIL_ACCESS' });
  check('venue_access failure returns generic error', response.status === 400 && (await response.json()).error === 'registration_unavailable');
  check('venue_access failure leaves no auth user', !(await listUserByEmail(email)));
  const failedProfiles = await service.from('profiles').select('id').eq('full_name', 'FAIL_ACCESS');
  check('venue_access failure rolls profile back', !failedProfiles.error && failedProfiles.data.length === 0);
  const reservation = await must('access reservation check', service.from('registration_invites').select('reservation_id').eq('id', invite.id).single());
  check('venue_access failure releases reservation', reservation.reservation_id === null);
} finally {
  psql(`drop trigger if exists test_fail_access_insert on public.venue_access; drop function if exists public.test_fail_access_insert();`);
}

// Simulate interruption after Auth creation: no Edge follow-up is needed because the trigger finalizes atomically.
const interruptedInvite = await createInvite(admin, venueA.id);
const interruptedHash = createHash('sha256').update(interruptedInvite.token).digest('hex');
const reservation = await must('begin interrupted reservation', service.rpc('begin_registration_invite', { p_token_hash: interruptedHash }));
const interruptedEmail = `edge-interrupted-${runId}@local.test`;
const directAuth = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: interruptedEmail, password, email_confirm: true,
    user_metadata: { full_name: 'Interrupted', registration_attempt_id: reservation },
  }),
});
check('Auth transaction succeeds without Edge follow-up', directAuth.ok);
const interruptedUser = await listUserByEmail(interruptedEmail);
const interruptedProfile = await must('interrupted profile', service.from('profiles').select('role,venue_id').eq('id', interruptedUser.id).single());
const interruptedAccess = await must('interrupted access', service.from('venue_access').select('id').eq('user_id', interruptedUser.id).eq('venue_id', venueA.id));
const interruptedRecord = await must('interrupted invite', service.from('registration_invites').select('used_at,used_by,reservation_id').eq('id', interruptedInvite.id).single());
check('interruption leaves complete state', interruptedProfile.role === 'staff' && interruptedProfile.venue_id === venueA.id && interruptedAccess.length === 1 && interruptedRecord.used_by === interruptedUser.id && interruptedRecord.reservation_id === null);
check('interruption leaves no reservation metadata', !('registration_attempt_id' in (interruptedUser.user_metadata || {})));

// Revoked and expired invites use the same generic response.
const revokedInvite = await createInvite(admin, venueA.id);
const revoked = await callCreate(admin.token, { action: 'revoke', venue_id: venueA.id, invite_id: revokedInvite.id });
check('invite revoked', revoked.ok && (await revoked.json()).revoked === true);
const revokedResponse = await callRegister({ token: revokedInvite.token, email: `edge-revoked-${runId}@local.test`, password, full_name: 'Revoked' });
check('revoked invite generic failure', revokedResponse.status === 400 && (await revokedResponse.json()).error === 'registration_unavailable');

const expiredInvite = await createInvite(admin, venueA.id);
await must('expire invite fixture', service.from('registration_invites').update({
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
}).eq('id', expiredInvite.id));
const expiredResponse = await callRegister({ token: expiredInvite.token, email: `edge-expired-${runId}@local.test`, password, full_name: 'Expired' });
check('expired invite generic failure', expiredResponse.status === 400 && (await expiredResponse.json()).error === 'registration_unavailable');

// Rate limit: the sixth attempt for the same email/token in 15 minutes is rejected with 429.
const rateBody = { token: `missing-${runId}`, email: `edge-rate-${runId}@local.test`, password, full_name: 'Rate' };
const rateResponses = [];
for (let index = 0; index < 6; index += 1) {
  rateResponses.push(await callRegister(rateBody, { 'x-forwarded-for': `198.51.100.${runId.length}` }));
}
check('registration attempts are rate limited', rateResponses.slice(0, 5).every((response) => response.status === 400) && rateResponses[5].status === 429);

// Only hashes are persisted and responses never expose the service key.
const hashRecord = await must('hash-only record', service.from('registration_invites').select('token_hash').eq('id', adminOwnInvite.id).single());
check('token persisted hash-only', hashRecord.token_hash.length === 64 && hashRecord.token_hash !== adminOwnInvite.token);
check('responses do not expose service key', !JSON.stringify(results).includes(serviceKey));

console.log(JSON.stringify({ status: 'PASS', tests: results.length, results }, null, 2));
