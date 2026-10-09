import { createClient } from "@supabase/supabase-js";
const url = import.meta.env["VITE_SUPABASE_URL"];
const key =
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_ANON_KEY"];
export const backendMode =
  url || key
    ? url && key
      ? "cloud"
      : "unconfigured"
    : import.meta.env.DEV
      ? "local"
      : "unconfigured";
const supabase = backendMode === "cloud" ? createClient(url!, key!) : null;
async function local<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/local/${path}`, {
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not reach the server");
  return data as T;
}
export async function authenticated() {
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return !!data.session;
  }
  if (backendMode === "unconfigured") return false;
  return (await local<{ authenticated: boolean }>("session")).authenticated;
}
export async function signIn(email: string, password: string, create: boolean) {
  if (supabase) {
    const result = create
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    return !!result.data.session;
  }
  await local(create ? "signup" : "login", { email, password });
  return true;
}
export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } else await local("logout", {});
}
export async function snapshot<T>(): Promise<T> {
  if (supabase) {
    const { data, error } = await supabase.rpc("sl_snapshot");
    if (error) throw error;
    return data as T;
  }
  return local<T>("snapshot");
}
export async function command<T>(action: string, data: Record<string, unknown>): Promise<T> {
  if (supabase) {
    const result = await supabase.rpc("sl_command", { p_action: action, p_data: data });
    if (result.error) throw result.error;
    return result.data as T;
  }
  return local<T>("command", { action, data });
}
