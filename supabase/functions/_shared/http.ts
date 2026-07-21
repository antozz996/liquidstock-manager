const localOrigins = [
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

export function corsFor(request: Request) {
  const configured = Deno.env.get("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = configured?.length ? configured : localOrigins;
  const origin = request.headers.get("Origin");
  const allowed = origin === null || allowedOrigins.includes(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && allowed) headers["Access-Control-Allow-Origin"] = origin;
  return { allowed, headers };
}

export function json(request: Request, body: unknown, status = 200) {
  const cors = corsFor(request);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors.headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function handlePreflight(request: Request) {
  const cors = corsFor(request);
  if (!cors.allowed) return json(request, { error: "origin_not_allowed" }, 403);
  return new Response(null, { status: 204, headers: cors.headers });
}

export function originAllowed(request: Request) {
  return corsFor(request).allowed;
}
