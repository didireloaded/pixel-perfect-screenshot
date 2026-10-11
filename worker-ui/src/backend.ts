import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../shared/database.types";

export const testEmployee =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("test") === "employee";
async function local<T>(route: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/test-worker/${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Test access failed");
  return value;
}
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(testEmployee || (url && key));
const client = url && key ? createClient<Database>(url, key) : null;

export async function hasSession() {
  if (testEmployee) return (await local<{ authenticated: boolean }>("session")).authenticated;
  if (!client) return false;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return Boolean(data.session);
}

export async function signIn(email: string, password: string) {
  if (!client) throw new Error("Supabase is not configured for this preview");
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUp(email: string, password: string) {
  if (!client) throw new Error("Supabase is not configured for this preview");
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (testEmployee) {
    await local("logout", {});
    return;
  }
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  if (!client) throw new Error("Supabase is not configured for this preview");
  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function snapshot<T>(): Promise<T> {
  if (testEmployee) return local<T>("snapshot");
  if (!client) throw new Error("Supabase is not configured for this preview");
  const { data, error } = await client.rpc("sl_snapshot");
  if (error) throw error;
  return data as T;
}

export async function command<T>(action: string, data: Record<string, unknown>): Promise<T> {
  if (testEmployee)
    return action === "activate"
      ? local<T>("activate", data)
      : local<T>("command", { action, data });
  if (!client) throw new Error("Supabase is not configured for this preview");
  const result = await client.rpc("sl_command", { p_action: action, p_data: data as Json });
  if (result.error) throw result.error;
  return result.data as T;
}
