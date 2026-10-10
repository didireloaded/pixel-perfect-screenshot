import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
const client = configured ? createClient(url, key) : null;

export async function hasSession() {
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
  if (!client) throw new Error("Supabase is not configured for this preview");
  const { data, error } = await client.rpc("sl_snapshot");
  if (error) throw error;
  return data as T;
}

export async function command<T>(action: string, data: Record<string, unknown>): Promise<T> {
  if (!client) throw new Error("Supabase is not configured for this preview");
  const result = await client.rpc("sl_command", { p_action: action, p_data: data });
  if (result.error) throw result.error;
  return result.data as T;
}
