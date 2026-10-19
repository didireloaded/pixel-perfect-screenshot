import { createClient, type AuthChangeEvent } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import type { AttendanceSnapshot, PunctualityData } from "./attendance";
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
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const config = readSupabaseConfig(metaEnv ?? {});
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
    if (!data.session) return false;
    // Persisted credentials are not proof that the account or session still exists.
    const verified = await client.auth.getUser();
    if (verified.error) {
      const invalid =
        verified.error.status === 401 ||
        verified.error.status === 403 ||
        [
          "user_not_found",
          "session_not_found",
          "bad_jwt",
          "refresh_token_not_found",
          "refresh_token_already_used",
        ].includes(verified.error.code ?? "");
      if (!invalid) check(verified.error);
      const latest = await client.auth.getSession();
      // A slow failure from an older sign-in must not sign out a different account.
      if (latest.data.session?.access_token === data.session.access_token) await signOut();
      return false;
    }
    return Boolean(verified.data.user);
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
            emailRedirectTo: window.location.origin + (app === "manager" ? "/manager" : "/"),
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
  async function registerWorker(profile: WorkerProfile, companyCode = "") {
    const code = companyCode.trim().toUpperCase();
    if (!/^[0-9A-F]{16}$/.test(code))
      throw new Error("Enter the company registration code from your manager.");
    return workerAccess({
      action: "register",
      ...normalizeWorkerProfile(profile),
      companyCode: code,
    });
  }
  async function signInWorker(employeeNo: string, accessCode: string) {
    return signIn(workerLoginEmail(employeeNo), accessCode);
  }
  async function replaceWorkerCode(employeeId: string) {
    if (app !== "manager") throw new Error("Manager access required");
    return workerAccess({ action: "reset_code", employeeId });
  }
  async function signOut() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration(
          app === "manager" ? "/manager" : "/",
        );
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          try {
            await notifications("unsubscribe", { endpoint: subscription.endpoint });
          } finally {
            // Revoke this browser's endpoint even if server cleanup is offline.
            await subscription.unsubscribe();
          }
        }
      } catch {
        /* Sign-out still completes when device notification cleanup is offline. */
      }
    }
    const { error } = await requireClient().auth.signOut({ scope: "local" });
    check(error);
  }
  async function resendConfirmation(email: string) {
    const { error } = await requireClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin + (app === "manager" ? "/manager" : "/") },
    });
    check(error);
  }
  async function resetPassword(email: string) {
    const { error } = await requireClient().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + (app === "manager" ? "/manager" : "/"),
    });
    check(error);
  }
  async function updatePassword(password: string) {
    if (app === "worker") validateWorkerPassword(password);
    const { error } = await requireClient().auth.updateUser({ password });
    check(error);
  }
  async function hydrateCompanyLogo(data: Json) {
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Array.isArray(data["employees"])
    ) {
      const employees = data["employees"].filter(
        (item): item is Record<string, Json> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
      const photos = employees.filter((item) => typeof item["photoPath"] === "string");
      if (photos.length) {
        try {
          const signed = await requireClient()
            .storage.from("employee-photos")
            .createSignedUrls(
              photos.map((item) => item["photoPath"] as string),
              3600,
            );
          for (const employee of photos) {
            const url = signed.data?.find(
              (item) => item.path === employee["photoPath"] && !item.error,
            )?.signedUrl;
            employee["photoUrl"] = url ?? "";
          }
        } catch {
          /* Photos must not block attendance. */
        }
      }
    }
    if (data && typeof data === "object" && !Array.isArray(data) && data["company"]) {
      const company = data["company"] as Record<string, Json>;
      if (typeof company["logoPath"] === "string") {
        try {
          const logo = await requireClient()
            .storage.from("company-logos")
            .createSignedUrl(company["logoPath"], 3600);
          if (!logo.error) company["logoUrl"] = logo.data.signedUrl;
        } catch {
          /* Branding must not block attendance or account access. */
        }
      }
    }
  }
  async function snapshot<T>(): Promise<T> {
    const { data, error } = await requireClient().rpc("sl_snapshot");
    check(error);
    await hydrateCompanyLogo(data);
    if (data && typeof data === "object" && !Array.isArray(data) && data["company"]) {
      try {
        const rows = await notifications<{ read_at: string | null }[]>("list");
        data["unreadNotificationCount"] = rows.filter((item) => !item.read_at).length;
      } catch {
        /* Notification delivery must not block ordinary attendance. */
      }
    }
    return data as T;
  }
  async function command<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await requireClient().rpc("sl_command", {
      p_action: action,
      p_data: payload as Json,
    });
    check(error);
    if (data && typeof data === "object" && !Array.isArray(data) && data["snapshot"])
      await hydrateCompanyLogo(data["snapshot"]);
    return data as T;
  }
  async function reportInterpretation(incidentId: string) {
    const { data, error } = await requireClient().rpc("sl_report_interpretation", {
      p_incident: incidentId,
    });
    check(error);
    return data as { status: string; suggestion: { summary: string; questions: string[] } | null };
  }
  async function punctuality(action: "list" | "configure", payload: Record<string, unknown> = {}) {
    const { data, error } = await requireClient().rpc("sl_punctuality", {
      action,
      payload: payload as Json,
    });
    check(error);
    return data as unknown as PunctualityData;
  }
  function onAuthChange(callback: (event: AuthChangeEvent, userId: string | null) => void) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((event, session) =>
      callback(event, session?.user.id ?? null),
    );
    return () => data.subscription.unsubscribe();
  }
  async function uploadReport(incidentId: string, id: string, file: File) {
    if (app !== "manager") throw new Error("Manager access required");
    if (file.size < 1 || file.size > 5242880) throw new Error("Choose a document up to 5 MB");
    let mimeType: string;
    if (/\.pdf$/i.test(file.name)) {
      if ((await file.slice(0, 5).text()) !== "%PDF-")
        throw new Error("This file is not a PDF document");
      mimeType = "application/pdf";
    } else if (/\.txt$/i.test(file.name)) {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (text.includes("\0")) throw new Error("Choose a plain UTF-8 TXT document");
      mimeType = "text/plain";
    } else throw new Error("Only PDF and TXT documents are supported");
    const reservation = await command<{ snapshot: AttendanceSnapshot }>("reserve_report_document", {
      id,
      incidentId,
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
    });
    const document = reservation.snapshot.reportDocuments?.find((item) => item.id === id);
    if (!document) throw new Error("Document reservation was not confirmed");
    if (document.status !== "ready") {
      const bucket = requireClient().storage.from("shiftline-reports");
      const upload = await bucket.upload(document.object_path, file, {
        contentType: mimeType,
        upsert: false,
      });
      if (upload.error && String(upload.error.statusCode) !== "409") check(upload.error);
      await command("finish_report_document", { id });
    }
  }
  async function uploadCompanyLogo(companyId: string, file: File) {
    if (app !== "manager") throw new Error("Manager access required");
    const extensions: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    const extension = extensions[file.type];
    if (!extension || file.size < 1 || file.size > 1048576)
      throw new Error("Choose a PNG, JPEG or WebP logo up to 1 MB.");
    const path = `${companyId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await requireClient()
      .storage.from("company-logos")
      .upload(path, file, { contentType: file.type, upsert: false });
    check(error);
    return path;
  }
  async function reportDocumentUrl(path: string) {
    if (app !== "manager") throw new Error("Manager access required");
    const { data, error } = await requireClient()
      .storage.from("shiftline-reports")
      .createSignedUrl(path, 60);
    check(error);
    if (!data) throw new Error("Document is unavailable");
    return data.signedUrl;
  }
  async function uploadProfilePhoto(companyId: string, employeeId: string, photo: Blob) {
    if (photo.type !== "image/jpeg" || photo.size < 1 || photo.size > 1048576)
      throw new Error("Choose a profile photo up to 1 MB.");
    const path = `${companyId}/${employeeId}/avatar.jpg`;
    const { error } = await requireClient().storage.from("employee-photos").upload(path, photo, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "0",
    });
    check(error);
    return path;
  }
  const watch = (companyId: string, refresh: () => Promise<void>) =>
    startLiveSync(requireClient(), companyId, refresh);
  async function notifications<T>(
    action: string,
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await requireClient().rpc("sl_notifications_api", {
      action,
      payload: payload as Json,
    });
    check(error);
    return data as T;
  }
  return {
    configured: Boolean(client),
    notifications,
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
    uploadReport,
    uploadCompanyLogo,
    uploadProfilePhoto,
    reportDocumentUrl,
    reportInterpretation,
    punctuality,
  };
}
