import { handlePreflight, json, originAllowed } from "../_shared/http.ts";

const sha256Hex = async (value: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const genericFailure = (request: Request, status = 400) => json(request, { error: "registration_unavailable" }, status);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handlePreflight(request);
  if (!originAllowed(request)) return json(request, { error: "origin_not_allowed" }, 403);
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const configuredPepper = Deno.env.get("REGISTRATION_RATE_LIMIT_PEPPER");
  const isLocal = supabaseUrl?.startsWith("http://127.0.0.1") || supabaseUrl?.startsWith("http://localhost") || supabaseUrl?.includes("kong:");
  const rateLimitPepper = configuredPepper || (isLocal ? "local-test-only-rate-limit-pepper" : undefined);
  if (!supabaseUrl || !serviceKey || !rateLimitPepper) return json(request, { error: "server_not_configured" }, 500);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: "invalid_request" }, 400);
  }
  if ("role" in payload || "venue" in payload || "venue_id" in payload) return json(request, { error: "invalid_request" }, 400);
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  if (!token || !email || !password || !fullName || password.length < 8) return json(request, { error: "invalid_request" }, 400);

  const tokenHash = await sha256Hex(token);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress = forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
  const ipHash = await sha256Hex(`${rateLimitPepper}:ip:${clientAddress}`);
  const emailHash = await sha256Hex(`${rateLimitPepper}:email:${email}`);
  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const rateResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/enforce_registration_rate_limit`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ p_ip_hash: ipHash, p_email_hash: emailHash, p_token_hash: tokenHash }),
  });
  if (!rateResponse.ok) return genericFailure(request, 429);

  const reservationResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/begin_registration_invite`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ p_token_hash: tokenHash }),
  });
  if (!reservationResponse.ok) return genericFailure(request);
  const reservationId = await reservationResponse.json();
  let finalized = false;

  try {
    const createResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, registration_attempt_id: reservationId },
      }),
    });
    if (!createResponse.ok) return genericFailure(request);

    // The auth.users trigger atomically creates profile + venue_access, consumes the invite,
    // and removes the non-secret reservation marker from raw_user_meta_data.
    finalized = true;
    return json(request, { registered: true }, 201);
  } catch {
    return genericFailure(request);
  } finally {
    if (!finalized) {
      await fetch(`${supabaseUrl}/rest/v1/rpc/release_registration_reservation`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({ p_reservation_id: reservationId }),
      }).catch(() => undefined);
    }
  }
});
