import { handlePreflight, json, originAllowed } from "../_shared/http.ts";

Deno.serve((request) => {
  if (request.method === "OPTIONS") return handlePreflight(request);
  if (!originAllowed(request)) return json(request, { error: "origin_not_allowed" }, 403);
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  return json(request, { ok: true, probe: "cors" });
});
