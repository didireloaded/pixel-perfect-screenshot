import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { AppState, Platform } from "react-native";
import type { AttendanceSnapshot } from "../../shared/attendance";
const prefix = (key: string) => `shiftline.${key.replace(/[^\w.-]/g, "_")}`;
// Chunk large sessions; atomically swap the manifest only after all chunks are saved.
const storage = {
  async getItem(key: string) {
    const raw = await SecureStore.getItemAsync(prefix(key));
    if (!raw) return null;
    const manifest = JSON.parse(raw) as { version: string; count: number };
    let result = "";
    for (let i = 0; i < manifest.count; i++) {
      const part = await SecureStore.getItemAsync(`${prefix(key)}.${manifest.version}.${i}`);
      if (part === null) return null;
      result += part;
    }
    return result;
  },
  async setItem(key: string, value: string) {
    const old = await SecureStore.getItemAsync(prefix(key));
    const version = Crypto.randomUUID();
    const count = Math.ceil(value.length / 1700);
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(
        `${prefix(key)}.${version}.${i}`,
        value.slice(i * 1700, (i + 1) * 1700),
      );
    await SecureStore.setItemAsync(prefix(key), JSON.stringify({ version, count }));
    if (old) {
      const m = JSON.parse(old);
      for (let i = 0; i < m.count; i++)
        await SecureStore.deleteItemAsync(`${prefix(key)}.${m.version}.${i}`);
    }
  },
  async removeItem(key: string) {
    const old = await SecureStore.getItemAsync(prefix(key));
    await SecureStore.deleteItemAsync(prefix(key));
    if (old) {
      const m = JSON.parse(old);
      for (let i = 0; i < m.count; i++)
        await SecureStore.deleteItemAsync(`${prefix(key)}.${m.version}.${i}`);
    }
  },
};
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = !!(url && key);
export const client = configured
  ? createClient(url!, key!, {
      auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
AppState.addEventListener("change", (state) => {
  if (state === "active") client?.auth.startAutoRefresh();
  else client?.auth.stopAutoRefresh();
});
export async function session() {
  return (await client?.auth.getSession())?.data.session ?? null;
}
export async function rpc(action: string, data: Record<string, unknown>, accessToken?: string) {
  if (accessToken) {
    const response = await fetch(`${url}/rest/v1/rpc/sl_command`, {
      method: "POST",
      headers: {
        apikey: key!,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_action: action, p_data: data }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Sync temporarily unavailable");
    return body;
  }
  if (!client) throw new Error("Connect the app to Supabase first");
  const result = await client
    .rpc("sl_command", { p_action: action, p_data: data })
    .abortSignal(AbortSignal.timeout(15000));
  if (result.error) throw result.error;
  return result.data;
}
export async function getSnapshot(accessToken?: string): Promise<AttendanceSnapshot> {
  if (accessToken) {
    const response = await fetch(`${url}/rest/v1/rpc/sl_snapshot`, {
      method: "POST",
      headers: {
        apikey: key!,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Could not refresh attendance");
    return body as AttendanceSnapshot;
  }
  if (!client) throw new Error("Backend is not connected");
  const { data, error } = await client.rpc("sl_snapshot").abortSignal(AbortSignal.timeout(15000));
  if (error) throw error;
  return data as AttendanceSnapshot;
}
export async function deviceId(userId: string) {
  const key = `shiftline.device.${userId}`;
  let id = await SecureStore.getItemAsync(key);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(key, id);
  }
  return id;
}
export async function registerDevice(userId: string) {
  const id = await deviceId(userId);
  await rpc("register_device", { id, clientType: "personal", platform: Platform.OS });
  return id;
}
