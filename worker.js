// filename: _worker.js
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const target = url.searchParams.get("url");
    if (!target) {
      return new Response("Missing ?url=", { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // cache aggressively (optional)
    const res = await fetch(target, {
      // pass-thru headers if you want:
      headers: { "User-Agent": "digikeys-cover-proxy/1.0" },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });

    const body = await res.text();
    const ct = res.headers.get("content-type") || "application/json; charset=utf-8";

    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": ct,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }
};