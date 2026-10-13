export function readSupabaseConfig(env: Record<string, string | undefined>) {
  const url = env["VITE_SUPABASE_URL"]?.trim();
  const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"]?.trim();
  if (!url || !key) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw new Error("The Supabase URL is invalid");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  )
    throw new Error("Use the HTTPS Supabase project URL without credentials or a path");
  if (!key.startsWith("sb_publishable_")) {
    let role: string;
    try {
      role = JSON.parse(atob(key.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).role;
    } catch {
      throw new Error("Use a Supabase publishable key in the frontend");
    }
    if (role !== "anon")
      throw new Error("Secret and service-role keys cannot be used in the frontend");
  }
  return { url: endpoint.origin, key };
}
