import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProduction } from "./check-production.mjs";

const healthy = async (url) => {
  if (url.endsWith("/worker-access")) return new Response(null, { status: 405 });
  if (url.includes("supabase.co")) return new Response(null, { status: 401 });
  if (url.endsWith(".js"))
    return new Response("void 0", { headers: { "content-type": "application/javascript" } });
  return new Response(
    '<html><title>Shiftline</title><script src="/assets/app.js"></script></html>',
    { headers: { "content-type": "text/html" } },
  );
};

test("availability checks accept protected endpoints and never send credentials", async () => {
  const results = await checkProduction((url, options) => {
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    assert.equal(options.body, undefined);
    return healthy(url);
  });
  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.ok));
});

test("HTML without working assets, open dispatcher and network failure cannot pass", async () => {
  for (const failure of ["assets", "dispatcher", "network"]) {
    const results = await checkProduction(async (url) => {
      if (failure === "network") throw new Error("secret transport details");
      if (failure === "assets" && url.endsWith(".js"))
        return new Response("missing", { status: 404 });
      if (failure === "dispatcher" && url.endsWith("/report-interpretation"))
        return new Response("unexpectedly open");
      return healthy(url);
    });
    assert.ok(results.some((result) => !result.ok));
    assert.ok(!JSON.stringify(results).includes("secret transport details"));
  }
});
