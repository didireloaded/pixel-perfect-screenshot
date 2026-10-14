import manager from "./nitro/index.mjs";

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    let response;
    const legacyWorkerPaths = new Set([
      "/jobs",
      "/hours",
      "/requests",
      "/calendar",
      "/inbox",
      "/today",
    ]);
    if (legacyWorkerPaths.has(url.pathname)) {
      const view = url.pathname.slice(1);
      url.pathname = "/";
      url.searchParams.set("view", view);
      return Response.redirect(url.toString(), 302);
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      url.pathname = "/worker/";
      response = await env.ASSETS.fetch(new Request(url, request));
    } else if (url.pathname.startsWith("/worker/")) {
      response = await env.ASSETS.fetch(request);
    } else {
      response = await manager.fetch(request, env, context);
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    if (headers.get("Content-Type")?.includes("text/html")) {
      headers.set("Cache-Control", "no-store");
    } else if (
      response.ok &&
      /^\/(?:worker\/assets|assets)\/.+-[\w-]+\.(?:js|css)$/.test(url.pathname)
    ) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
