import { describe, expect, it } from "vitest";
import { readSupabaseConfig } from "../../shared/supabase-config";
const env = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};
describe("frontend backend configuration", () => {
  it("requires explicit connection details and accepts only public credentials", () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig(env)).toEqual({
      url: env.VITE_SUPABASE_URL,
      key: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(() =>
      readSupabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }),
    ).toThrow(/publishable key/);
    const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
    expect(() =>
      readSupabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: jwt("service_role") }),
    ).toThrow(/service-role/);
    expect(
      readSupabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: jwt("anon") }),
    ).not.toBeNull();
  });
  it("rejects insecure and credential-bearing project URLs", () => {
    for (const url of [
      "http://example.supabase.co",
      "https://user:pass@example.supabase.co",
      "https://example.supabase.co/rest/v1",
      "https://example.supabase.co?key=secret",
    ])
      expect(() => readSupabaseConfig({ ...env, VITE_SUPABASE_URL: url })).toThrow();
  });
});
