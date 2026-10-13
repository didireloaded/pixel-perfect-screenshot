import { createClient, type AuthChangeEvent } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import { startLiveSync } from "./live-sync";
import { readSupabaseConfig } from "./supabase-config";
import {
  normalizeWorkerProfile,
  validateWorkerPassword,
  workerLoginEmail,
  type WorkerCredentials,
  type WorkerProfile,
} from "./worker-signup";

export function createBackend(app: "manager" | "worker") {
  const config = readSupabaseConfig(import.meta.env);
  const client = config
    ? createClient<Database>(config.url, config.key, {
        auth: { storageKey: `shiftline-${app}-auth`, persistSession: true, autoRefreshToken: true },
      })
    : null;
  const requireClient = () => {
    if (!client) throw new Error("Set the Supabase URL and publishable key before using Shiftline");
    return client;
  };
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  async function hasSession() {
    if (!client) return false;
    const { data, error } = await client.auth.getSession();
    check(error);
    return Boolean(data.session);
  }
  async function signIn(email: string, password: string, create = false) {
    const auth = requireClient().auth;
    if (create && app === "worker") {
      throw new Error("Create your worker account with your name and phone number.");
    }
    const result = create
      ? await auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        })
      : await auth.signInWithPassword({ email, password });
    check(result.error);
    return Boolean(result.data.session);
  }
  async function workerAccess(payload: Record<string, unknown>): Promise<WorkerCredentials> {
    const { data, error } = await requireClient().functions.invoke("worker-access", {
      body: payload,
    });
    if (error) {
      const response = "context" in error ? error.context : null;
      if (response instanceof Response) {
        const detail = await response.json().catch(() => null);
        if (typeof detail?.error === "string") throw new Error(detail.error);
      }
      throw new Error("Could not reach account services. Please try again.");
    }
    if (data?.error) throw new Error(data.error);
    if (typeof data?.employeeNo !== "string" || typeof data?.accessCode !== "string")
      throw new Error("Account services returned an incomplete result. Contact your manager.");
    return { employeeNo: data.employeeNo, accessCode: data.accessCode };
  }
  async function registerWorker(profile: WorkerProfile) {
    return workerAccess({ action: "register", ...normalizeWorkerProfile(profile) });
  }
  async function signInWorker(employeeNo: string, accessCode: string) {
    return signIn(workerLoginEmail(employeeNo), accessCode);
  }
  async function replaceWorkerCode(employeeId: string) {
    if (app !== "manager") throw new Error("Manager access required");
    return workerAccess({ action: "reset_code", employeeId });
  }
  async function signOut() {
    const { error } = await requireClient().auth.signOut({ scope: "local" });
    check(error);
  }
  async function resendConfirmation(email: string) {
    const { error } = await requireClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    check(error);
  }
  async function resetPassword(email: string) {
    const { error } = await requireClient().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    check(error);
  }
  async function updatePassword(password: string) {
    if (app === "worker") validateWorkerPassword(password);
    const { error } = await requireClient().auth.updateUser({ password });
    check(error);
  }
  async function snapshot<T>(): Promise<T> {
    const { data, error } = await requireClient().rpc("sl_snapshot");
    check(error);
    return data as T;
  }
  async function command<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await requireClient().rpc("sl_command", {
      p_action: action,
      p_data: payload as Json,
    });
    check(error);
    return data as T;
  }
  function onAuthChange(callback: (event: AuthChangeEvent, userId: string | null) => void) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((event, session) =>
      callback(event, session?.user.id ?? null),
    );
    return () => data.subscription.unsubscribe();
  }
  const watch = (companyId: string, refresh: () => Promise<void>) =>
    startLiveSync(requireClient(), companyId, refresh);
  return {
    configured: Boolean(client),
    hasSession,
    signIn,
    registerWorker,
    signInWorker,
    replaceWorkerCode,
    signOut,
    resendConfirmation,
    resetPassword,
    updatePassword,
    snapshot,
    command,
    onAuthChange,
    watch,
  };
}
