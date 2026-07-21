import { handlePreflight, json, originAllowed } from "../_shared/http.ts";

const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const sha256Hex = async (value: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handlePreflight(request);
  if (!originAllowed(request)) return json(request, { error: "origin_not_allowed" }, 403);
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceKey) return json(request, { error: "server_not_configured" }, 500);
  if (!authorization?.startsWith("Bearer ")) return json(request, { error: "authentication_required" }, 401);

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!userResponse.ok) return json(request, { error: "authentication_required" }, 401);
  const user = await userResponse.json();

  let payload: { action?: "create" | "revoke"; venue_id?: string; invite_id?: string; expires_in_hours?: number };
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: "invalid_request" }, 400);
  }
  if (!payload.venue_id) return json(request, { error: "invalid_request" }, 400);

  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  if (payload.action === "revoke") {
    if (!payload.invite_id) return json(request, { error: "invalid_request" }, 400);
    const revokeResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/revoke_registration_invite_record`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({ p_user_id: user.id, p_venue_id: payload.venue_id, p_invite_id: payload.invite_id }),
    });
    if (!revokeResponse.ok) return json(request, { error: "operation_not_allowed" }, 403);
    return json(request, { revoked: await revokeResponse.json() });
  }

  const expiresInHours = Math.min(168, Math.max(1, Math.floor(payload.expires_in_hours ?? 24)));
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  const createResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/create_registration_invite_record`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      p_user_id: user.id,
      p_venue_id: payload.venue_id,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    }),
  });
  if (!createResponse.ok) return json(request, { error: "operation_not_allowed" }, 403);
  const records = await createResponse.json();
  const invite = Array.isArray(records) ? records[0] : records;
  return json(request, { id: invite.id, token, expires_at: invite.expires_at }, 201);
});
