import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  AppState,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import * as SecureStore from "expo-secure-store";
import type { AttendanceSnapshot, AttendanceState, EventType } from "../shared/attendance";
import {
  client,
  configured,
  session,
  getSnapshot,
  rpc,
  deviceId,
  registerDevice,
} from "./src/backend";
import {
  cacheSnapshot,
  cachedSnapshot,
  enqueue,
  queueState,
  reconcile,
  retryQueue,
  syncQueue,
  type QueuedEvent,
} from "./src/offlineQueue";
import { syncLabel } from "./src/syncState";
import { clockInLocation } from "./src/location";
import { enableBackgroundSync, stopBackgroundSync } from "./src/backgroundSync";
import { theme as c } from "./src/theme";
const LABEL: Record<AttendanceState, string> = {
  not_clocked_in: "Not clocked in",
  working: "Working at site",
  on_lunch: "On lunch",
  on_job: "On assigned job",
  on_personal: "On personal departure",
  clocked_out: "Clocked out",
};
const NEXT: Record<AttendanceState, { type: EventType; label: string } | null> = {
  not_clocked_in: { type: "clock_in", label: "Clock in" },
  working: { type: "start_lunch", label: "Start lunch" },
  on_lunch: { type: "end_lunch", label: "End lunch" },
  on_job: { type: "end_job", label: "Back from job" },
  on_personal: { type: "end_personal", label: "Return to work" },
  clocked_out: null,
};
function projected(state: AttendanceState, type: EventType): AttendanceState {
  const from: Record<EventType, AttendanceState[]> = {
    clock_in: ["not_clocked_in"],
    start_lunch: ["working"],
    end_lunch: ["on_lunch"],
    start_job: ["working"],
    end_job: ["on_job"],
    start_personal: ["working"],
    end_personal: ["on_personal"],
    clock_out: ["working", "on_job"],
  };
  if (!from[type].includes(state)) return state;
  return (
    {
      clock_in: "working",
      start_lunch: "on_lunch",
      end_lunch: "working",
      start_job: "on_job",
      end_job: "working",
      start_personal: "on_personal",
      end_personal: "working",
      clock_out: "clocked_out",
    } as const
  )[type];
}
const duration = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
function Action({
  title,
  onPress,
  disabled = false,
  soft = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  soft?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, soft && { backgroundColor: c.soft }, disabled && { opacity: 0.45 }]}
    >
      <Text style={[styles.buttonText, soft && { color: c.primary }]}>{title}</Text>
    </Pressable>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export default function App() {
  const [data, setData] = useState<AttendanceSnapshot | null>(null),
    [owner, setOwner] = useState<string | null>(null),
    [queue, setQueue] = useState<QueuedEvent[]>([]),
    [online, setOnline] = useState(true),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Today"),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [create, setCreate] = useState(false),
    [number, setNumber] = useState(""),
    [activation, setActivation] = useState(""),
    [request, setRequest] = useState(""),
    [note, setNote] = useState("");
  const saving = useRef(false);
  const generation = useRef(0);
  const liveOwner = useRef<string | null>(null);
  const network = useRef(true);
  const load = useCallback(async () => {
    if (saving.current) return;
    const ticket = ++generation.current;
    try {
      const auth = await session();
      const user =
        auth?.user.id ||
        (!network.current ? await SecureStore.getItemAsync("shiftline.active-user") : null);
      if (ticket !== generation.current) return;
      if (!user) {
        setOwner(null);
        setData(null);
        return;
      }
      liveOwner.current = user;
      setOwner(user);
      let snap = await cachedSnapshot(user);
      if (network.current && auth) {
        try {
          snap = await getSnapshot();
          if (!snap.onboarding) await registerDevice(user);
          await cacheSnapshot(user, snap);
          await reconcile(user, snap);
        } catch (e) {
          setError((e as Error).message || "Waiting for connection");
        }
      }
      if (ticket === generation.current && liveOwner.current === user) {
        setData(snap);
        setQueue(await queueState(user));
      }
    } catch (e) {
      setError((e as Error).message || "Could not load your shift");
    }
  }, []);
  useEffect(() => {
    void load();
    const net = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      network.current = connected;
      setOnline(connected);
      if (connected) {
        void syncQueue()
          .then(() => load())
          .catch(() => {});
      } else void load();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void syncQueue()
          .then(() => load())
          .catch(() => {});
    });
    const timer = setInterval(() => {
      if (network.current)
        void syncQueue()
          .then(() => load())
          .catch(() => {});
    }, 15000);
    return () => {
      net();
      app.remove();
      clearInterval(timer);
    };
  }, [load]);
  const auth = async () => {
    setBusy(true);
    setError("");
    try {
      if (!client) throw new Error("Backend is not configured");
      const result = create
        ? await client.auth.signUp({ email: email.trim(), password })
        : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setError("Confirm your email, then sign in.");
        return;
      }
      await SecureStore.setItemAsync("shiftline.active-user", result.data.user!.id);
      setPassword("");
      ++generation.current;
      await load();
    } catch (e) {
      setError((e as Error).message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    if (saving.current) return;
    ++generation.current;
    await stopBackgroundSync();
    const result = await client?.auth.signOut({ scope: "local" });
    if (result?.error) {
      setError(result.error.message);
      return;
    }
    await SecureStore.deleteItemAsync("shiftline.active-user");
    liveOwner.current = null;
    setOwner(null);
    setData(null);
    setQueue([]);
    setPassword("");
  };
  const command = async (action: string, payload: Record<string, unknown>) => {
    if (saving.current || !online) return;
    setBusy(true);
    saving.current = true;
    setError("");
    try {
      const result = await rpc(action, payload);
      if (result.snapshot) {
        await cacheSnapshot(owner!, result.snapshot);
        setData(result.snapshot);
      }
      await load();
    } catch (e) {
      setError((e as Error).message || "Could not save");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const record = async (type: EventType, extra: Record<string, string> = {}) => {
    if (saving.current || !owner || !data) return;
    const shift = data.shifts.find((s) => s.employeeId === data.me && s.date === data.today);
    if (!shift) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const id = await deviceId(owner);
      const location = type === "clock_in" ? await clockInLocation(data, shift) : null;
      await enqueue(owner, {
        type,
        shiftId: shift.id,
        deviceId: id,
        capturedAt: new Date().toISOString(),
        offline: !online,
        location,
        ...extra,
      });
      setQueue(await queueState(owner));
      if (online) {
        void syncQueue()
          .then(() => load())
          .catch((e) => setError((e as Error).message));
      }
    } catch (e) {
      setError((e as Error).message || "Could not save on this phone. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  if (!configured)
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.root}>
          <Card>
            <Text style={styles.title}>Connect Shiftline</Text>
            <Text style={styles.body}>
              Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY for your
              Shiftline database, then rebuild this Expo app.
            </Text>
          </Card>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  if (!owner || !data)
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.root}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Card>
              <Text style={styles.brand}>Shiftline</Text>
              <Text style={styles.title}>{create ? "Create your account" : "Welcome back"}</Text>
              <Text style={styles.body}>Your shift, jobs and hours in one place.</Text>
              <TextInput
                accessibilityLabel="Email"
                placeholder="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                accessibilityLabel="Password"
                placeholder="Password (12+ characters)"
                secureTextEntry
                autoComplete={create ? "new-password" : "current-password"}
                style={styles.input}
                value={password}
                onChangeText={setPassword}
              />
              <Action
                title={busy ? "Signing in…" : create ? "Create account" : "Sign in"}
                disabled={busy || password.length < 12 || !email}
                onPress={() => void auth()}
              />
              <Action
                title={create ? "Already have an account?" : "Create an account"}
                soft
                onPress={() => setCreate(!create)}
              />
              {error && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              )}
            </Card>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  if (data.onboarding)
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.root}>
          <Card>
            <Text style={styles.title}>Activate your account</Text>
            <Text style={styles.body}>Enter the number and one-time code from your manager.</Text>
            <TextInput
              accessibilityLabel="Employee number"
              placeholder="Employee number"
              style={styles.input}
              value={number}
              onChangeText={setNumber}
            />
            <TextInput
              accessibilityLabel="Activation code"
              placeholder="Activation code"
              autoCapitalize="none"
              style={styles.input}
              value={activation}
              onChangeText={setActivation}
            />
            <Action
              title="Activate account"
              disabled={busy || !online || !activation || !number}
              onPress={() => void command("activate", { employeeNo: number, code: activation })}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Action title="Sign out" soft onPress={() => void logout()} />
          </Card>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  const me = data.employees.find((e) => e.id === data.me)!;
  const shift = data.shifts.find((s) => s.employeeId === data.me && s.date === data.today);
  const state = data.states.find((s) => s.shiftId === shift?.id)?.state || "not_clocked_in";
  const pending = queue.filter((q) => q.payload.shiftId === shift?.id && q.status !== "SYNCED");
  const planned = pending.reduce((current, q) => projected(current, q.payload.type), state);
  const next = NEXT[planned];
  const time = (t: number) =>
    !t
      ? "—"
      : new Date(t).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: data.company.timezone,
        });
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={{ fontWeight: "700", color: c.primary }}>
              {me.name
                .split(" ")
                .map((p) => p[0])
                .join("")}
            </Text>
          </View>
          <Text style={[styles.title, { flex: 1, marginBottom: 0 }]}>{tab}</Text>
          <Pressable accessibilityRole="button" onPress={() => void logout()}>
            <Text style={{ color: c.primary }}>Sign out</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.banner, { backgroundColor: online ? c.mint : c.cream }]}>
            {online
              ? "Connected"
              : "Offline — attendance actions are saved on this phone and will sync when you reconnect."}
          </Text>
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {tab === "Today" && (
            <>
              <Card>
                <Text style={styles.caption}>{data.today}</Text>
                <Text style={styles.title}>{me.name}</Text>
                <Text style={styles.caption}>
                  {data.sites.find((s) => s.id === shift?.siteId)?.name || "No site"}
                  {shift ? ` · Shift ${shift.start}–${shift.end}` : " · No shift assigned"}
                </Text>
                <View style={styles.badges}>
                  <Text style={styles.badge}>{LABEL[state]}</Text>
                  <Text style={styles.badge}>Background location off</Text>
                </View>
                {pending.length > 0 && (
                  <Text style={[styles.body, { color: c.primary }]}>
                    Saved actions are awaiting server confirmation.{" "}
                    {pending.some((q) => q.status === "NEEDS_REVIEW")
                      ? "Your manager needs to review an action."
                      : ""}
                  </Text>
                )}
                {shift && (
                  <View style={styles.stats}>
                    <View style={[styles.stat, { backgroundColor: c.blue }]}>
                      <Text style={styles.caption}>Clock in</Text>
                      <Text style={styles.statValue}>
                        {time(
                          data.events.find((e) => e.shiftId === shift.id && e.type === "clock_in")
                            ?.capturedAt || 0,
                        )}
                      </Text>
                      <Text style={styles.caption}>Scheduled {shift.start}</Text>
                    </View>
                    <View style={[styles.stat, { backgroundColor: c.pink }]}>
                      <Text style={styles.caption}>Clock out</Text>
                      <Text style={styles.statValue}>
                        {data.events.find((e) => e.shiftId === shift.id && e.type === "clock_out")
                          ? time(
                              data.events.find(
                                (e) => e.shiftId === shift.id && e.type === "clock_out",
                              )!.capturedAt,
                            )
                          : "—"}
                      </Text>
                      <Text style={styles.caption}>Scheduled {shift.end}</Text>
                    </View>
                    <View style={[styles.stat, { backgroundColor: c.cream }]}>
                      <Text style={styles.caption}>Lunch</Text>
                      <Text style={styles.statValue}>{shift.lunch}</Text>
                      <Text style={styles.caption}>{shift.lunchMinutes} minutes</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.caption}>Location cutoff</Text>
                      <Text style={styles.statValue}>{shift.trackingStop}</Text>
                      <Text style={styles.caption}>No background tracking</Text>
                    </View>
                  </View>
                )}
                {shift && next && (
                  <Action
                    title={busy ? "Saving on this phone…" : next.label}
                    disabled={busy}
                    onPress={() => void record(next.type)}
                  />
                )}{" "}
                {shift && planned === "working" && (
                  <>
                    <Action
                      title="Clock out"
                      soft
                      disabled={busy}
                      onPress={() => void record("clock_out")}
                    />
                    <TextInput
                      accessibilityLabel="Departure note"
                      placeholder="Personal departure note (optional)"
                      maxLength={140}
                      style={styles.input}
                      value={note}
                      onChangeText={setNote}
                    />
                    <Action
                      title="Personal departure"
                      soft
                      disabled={busy}
                      onPress={() => void record("start_personal", { reason: "personal", note })}
                    />
                    <Action
                      title="Emergency departure"
                      soft
                      disabled={busy}
                      onPress={() =>
                        void record("start_personal", { reason: "emergency", note: "Emergency" })
                      }
                    />
                  </>
                )}
                {!shift && (
                  <Text style={styles.body}>Ask your manager to assign your next shift.</Text>
                )}
              </Card>
              <Card>
                <Text style={styles.title}>Timeline</Text>
                {data.events
                  .filter((e) => e.shiftId === shift?.id)
                  .map((e) => (
                    <View key={e.id} style={styles.entry}>
                      <Text style={styles.body}>
                        {time(e.capturedAt)} · {e.type.replaceAll("_", " ")}
                      </Text>
                      <Text style={styles.caption}>Synced</Text>
                    </View>
                  ))}
                {pending.map((q) => (
                  <View key={q.id} style={styles.entry}>
                    <Text style={styles.body}>
                      {time(Date.parse(q.payload.capturedAt))} ·{" "}
                      {q.payload.type.replaceAll("_", " ")}
                    </Text>
                    <Text
                      style={[
                        styles.caption,
                        { color: q.status === "NEEDS_REVIEW" ? c.primary : c.muted },
                      ]}
                    >
                      {syncLabel(q.status, online)}
                      {q.error ? ` · ${q.error}` : ""}
                    </Text>
                  </View>
                ))}
              </Card>
              <Action
                title="Sync saved actions"
                soft
                disabled={busy || !online}
                onPress={() => void retryQueue(owner).then(() => load())}
              />
              <Action
                title="Enable background sync and alerts"
                soft
                onPress={() =>
                  void enableBackgroundSync().catch((e) =>
                    Alert.alert("Background sync", (e as Error).message),
                  )
                }
              />
            </>
          )}
          {tab === "Jobs" && (
            <>
              {!online ? (
                <Card>
                  <Text style={styles.body}>
                    Assigned jobs are cached. Attendance actions still save on this phone.
                  </Text>
                </Card>
              ) : null}
              {data.jobs
                .filter((j) => j.assignee === me.id)
                .map((j) => (
                  <Card key={j.id}>
                    <Text style={styles.caption}>
                      {j.date} · {j.start}–{j.end}
                    </Text>
                    <Text style={styles.title}>{j.title}</Text>
                    <Text style={styles.body}>{j.destination}</Text>
                    <Text style={styles.body}>{j.instructions}</Text>
                    <Text style={styles.caption}>
                      {j.supervisor} · {j.status.replace("_", " ")}
                    </Text>
                    {j.date === data.today && j.status === "assigned" && planned === "working" && (
                      <Action
                        title="Start job"
                        disabled={busy}
                        onPress={() => void record("start_job", { jobId: j.id })}
                      />
                    )}
                  </Card>
                ))}
            </>
          )}
          {tab === "My hours" &&
            (!online ? (
              <Card>
                <Text style={styles.body}>
                  Reconnect to view current timesheets. Your attendance queue remains available in
                  Today.
                </Text>
              </Card>
            ) : (
              data.shifts
                .filter((s) => s.employeeId === me.id)
                .map((s) => {
                  const t = data.timesheets.find((t) => t.shiftId === s.id);
                  return (
                    <Card key={s.id}>
                      <Text style={styles.title}>{s.date}</Text>
                      <Text style={styles.caption}>
                        {t?.status || "Open"} · Policy {s.totals.policyVersion}
                      </Text>
                      <View style={styles.stats}>
                        <View style={styles.stat}>
                          <Text style={styles.caption}>Regular</Text>
                          <Text style={styles.statValue}>{duration(s.totals.regularSeconds)}</Text>
                        </View>
                        <View style={styles.stat}>
                          <Text style={styles.caption}>Breaks</Text>
                          <Text style={styles.statValue}>
                            {duration(s.totals.paidBreakSeconds + s.totals.unpaidBreakSeconds)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.body}>
                        Approved overtime · {duration(s.totals.overtimeSecondsApproved)}
                      </Text>
                      <Text style={styles.body}>
                        Pending overtime · {duration(s.totals.overtimeSecondsPending)}
                      </Text>
                      {s.totals.complete && t?.status === "open" && (
                        <Action
                          title="Submit timesheet"
                          disabled={busy}
                          onPress={() =>
                            void command("submit_timesheet", {
                              shiftId: s.id,
                              overtimeMinutes: s.totals.unapprovedOvertimeMinutes,
                            })
                          }
                        />
                      )}
                    </Card>
                  );
                })
            ))}
          {tab === "Requests" && (
            <>
              <Card>
                <Text style={styles.title}>New request</Text>
                <TextInput
                  accessibilityLabel="Request summary"
                  placeholder="Summary (include dates and times)"
                  style={styles.input}
                  value={request}
                  maxLength={200}
                  onChangeText={setRequest}
                />
                <Action
                  title="Send leave request"
                  disabled={!online || busy || !request.trim()}
                  onPress={() =>
                    void command("create_request", { kind: "leave", summary: request, detail: "" })
                  }
                />
                {!online && (
                  <Text style={styles.caption}>
                    Requests need a connection. Breaks and other attendance actions still save
                    offline.
                  </Text>
                )}
              </Card>
              {online &&
                data.requests
                  .filter((r) => r.employeeId === me.id)
                  .map((r) => (
                    <Card key={r.id}>
                      <Text style={styles.title}>{r.summary}</Text>
                      <Text style={styles.body}>
                        {r.status} · {r.reason || "Waiting for review"}
                      </Text>
                    </Card>
                  ))}
              {online &&
                data.corrections
                  .filter((c) => c.employee_id === me.id)
                  .map((c) => (
                    <Card key={c.id}>
                      <Text style={styles.title}>{c.event_type.replaceAll("_", " ")}</Text>
                      <Text style={styles.body}>{c.reason}</Text>
                      <Text style={styles.caption}>{c.status.replaceAll("_", " ")}</Text>
                    </Card>
                  ))}
            </>
          )}
        </ScrollView>
        <View style={styles.nav}>
          {["Today", "Jobs", "My hours", "Requests"].map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={styles.navItem}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: tab === t ? c.primary : c.muted }}
              >
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  scroll: { padding: 20, gap: 16, paddingBottom: 24 },
  header: {
    margin: 20,
    marginBottom: 0,
    padding: 14,
    borderRadius: c.radius,
    backgroundColor: c.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.soft,
  },
  card: {
    backgroundColor: c.card,
    padding: 20,
    borderRadius: c.radius,
    gap: 10,
    shadowColor: "#40335d",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
  },
  title: { fontSize: 22, fontWeight: "700", color: c.text, marginBottom: 4 },
  brand: { color: c.primary, fontSize: 14, fontWeight: "700" },
  body: { fontSize: 14, color: c.text, lineHeight: 21 },
  caption: { fontSize: 12, color: c.muted, lineHeight: 18 },
  input: {
    borderRadius: 16,
    backgroundColor: "#f0eef5",
    padding: 14,
    color: c.text,
    fontSize: 14,
    minHeight: 48,
  },
  button: {
    borderRadius: 99,
    backgroundColor: c.primary,
    minHeight: 52,
    padding: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  error: { padding: 12, borderRadius: 16, backgroundColor: c.pink, color: "#993954", fontSize: 13 },
  banner: { borderRadius: 18, padding: 12, fontSize: 12, textAlign: "center", color: c.text },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    borderRadius: 99,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: c.soft,
    color: c.text,
    fontSize: 11,
  },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: "#f0eef5",
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: "700", color: c.text },
  entry: {
    borderLeftWidth: 4,
    borderLeftColor: c.primary,
    borderRadius: 16,
    padding: 12,
    backgroundColor: c.soft,
    gap: 4,
  },
  nav: {
    flexDirection: "row",
    backgroundColor: c.card,
    borderTopWidth: 1,
    borderTopColor: "#ece8f4",
  },
  navItem: { flex: 1, paddingVertical: 18, alignItems: "center" },
});
