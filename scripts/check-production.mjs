import { pathToFileURL } from "node:url";

// Public availability checks only. Never signs in, sends mail, creates attendance,
// dispatches notifications or reads employee records. No credentials required.
export async function checkProduction(fetcher = fetch) {
  const site = "https://shiftline-workforce.didireloaded.chatgpt.site";
  const api = "https://hfhiuxijpbujoahtnkjt.supabase.co";
  const checks = [
    { name: "worker app", url: `${site}/`, status: 200, html: true },
    { name: "manager app", url: `${site}/manager`, status: 200, html: true },
    { name: "worker access function", url: `${api}/functions/v1/worker-access`, status: 405 },
    {
      name: "report dispatcher rejects anonymous requests",
      url: `${api}/functions/v1/report-interpretation`,
      method: "POST",
      status: 401,
    },
    { name: "database gateway rejects anonymous requests", url: `${api}/rest/v1/`, status: 401 },
  ];
  return Promise.all(
    checks.map(async (check) => {
      try {
        const response = await fetcher(check.url, {
          method: check.method ?? "GET",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        if (response.status !== check.status)
          throw new Error(`expected HTTP ${check.status}, received ${response.status}`);
        if (check.html) {
          if (!response.headers.get("content-type")?.includes("text/html"))
            throw new Error("expected HTML");
          const html = await response.text();
          if (!html.toLowerCase().includes("shiftline")) throw new Error("app identity missing");
          // A login page or cached HTML is not enough: check a same-origin JS module too.
          const src = html.match(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/i)?.[1];
          if (!src) throw new Error("app script missing");
          const asset = new URL(src, check.url);
          if (asset.origin !== site) throw new Error("unexpected script origin");
          const script = await fetcher(asset.href, {
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          });
          if (script.status !== 200 || !/javascript/.test(script.headers.get("content-type") ?? ""))
            throw new Error("app script unavailable");
          await script.body?.cancel();
        } else await response.body?.cancel();
        return { name: check.name, ok: true };
      } catch (error) {
        // Only controlled HTTP diagnostics; never print remote bodies or arbitrary exception text.
        const message =
          error instanceof Error &&
          /^(expected HTTP|expected HTML|app identity|app script|unexpected script)/.test(
            error.message,
          )
            ? error.message
            : "request failed or timed out";
        return { name: check.name, ok: false, message };
      }
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await checkProduction();
  for (const result of results)
    console.log(
      `${result.ok ? "PASS" : "FAIL"} ${result.name}${result.message ? `: ${result.message}` : ""}`,
    );
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
