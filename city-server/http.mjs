// Replies for the city server. Pages on this machine (127.0.0.1 or localhost) may call it; nobody else's page can.
const ORIGINS = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export const allowedOrigin = request => {
  const origin = request.headers.get("origin") || "";
  return ORIGINS.test(origin) ? origin : "null";
};

const headers = origin => ({
  "content-type": "application/json",
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
});

export const json = (data, status, origin) => new Response(JSON.stringify(data), { status, headers: headers(origin) });

// The browser's check before a POST. A 204 reply must have no body.
export const preflight = origin => new Response(null, { status: 204, headers: headers(origin) });
