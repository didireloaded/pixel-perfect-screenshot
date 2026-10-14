import { useEffect, useState } from "react";
import { Eye, EyeOff, Clock3 } from "lucide-react";
import { Logo, StatusBar, HomeIndicator, Button, Field, inputCls } from "../ui";
import { useApp } from "../state";
import { cn } from "../utils/cn";
import * as backend from "../backend";

// ─── Splash ────────────────────────────────────────────────────────────────
export function Splash() {
  const { authError, retrySession } = useApp();
  return (
    <div className="flex h-full flex-col bg-page dark:bg-dpage">
      <StatusBar />
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="anim-logo flex flex-col items-center">
          <Logo size={84} />
          <p className="mt-5 text-[22px] font-bold tracking-tight text-ink dark:text-white">
            Shiftline
          </p>
          <p role="status" className="mt-4 px-6 text-center text-sm">
            {authError
              ? "Could not reconnect to your account. Your saved session has not been signed out."
              : "Opening Shiftline…"}
          </p>
          {authError && (
            <Button className="mt-4" onClick={retrySession}>
              Retry connection
            </Button>
          )}
        </div>
      </div>
      <HomeIndicator />
    </div>
  );
}

// ─── Welcome ───────────────────────────────────────────────────────────────
export function Welcome() {
  const { setPhase } = useApp();
  return (
    <div className="flex h-full flex-col bg-page dark:bg-dpage">
      <StatusBar />
      <div className="flex flex-1 flex-col justify-between px-7 pb-6">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="anim-rise" style={{ animationDelay: "0.05s" }}>
            <Logo size={88} />
          </div>
          <h1
            className="anim-rise mt-8 text-[34px] font-bold leading-tight tracking-tight text-ink dark:text-white"
            style={{ animationDelay: "0.15s" }}
          >
            Work, made simpler.
          </h1>
          <p
            className="anim-rise mt-3 max-w-[280px] text-[17px] leading-relaxed text-sub dark:text-dsub"
            style={{ animationDelay: "0.25s" }}
          >
            Your shifts, jobs and working hours, all in one place.
          </p>
        </div>
        <div className="anim-rise space-y-3" style={{ animationDelay: "0.35s" }}>
          <Button onClick={() => setPhase("signup")}>Get Started</Button>
          <Button variant="secondary" onClick={() => setPhase("signin")}>
            Sign In
          </Button>
        </div>
      </div>
      <HomeIndicator />
    </div>
  );
}

import type { WorkerCredentials } from "../../../shared/worker-signup";

export function SignIn() {
  const { setPhase } = useApp();
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex h-full flex-col bg-page dark:bg-dpage">
      <StatusBar />
      <div className="no-scrollbar flex-1 overflow-y-auto px-7 pb-8">
        <button
          onClick={() => setPhase("welcome")}
          className="press -ml-2 mt-1 rounded-lg px-2 py-1 text-[17px] text-brand"
        >
          ‹ Back
        </button>
        <div className="mt-8">
          <Logo size={56} />
          <h1 className="mt-6 text-[28px] font-bold tracking-tight text-ink dark:text-white">
            Welcome back
          </h1>
          <p className="mt-1 text-[16px] text-sub dark:text-dsub">
            Use your employee number and private access code.
          </p>
        </div>
        <form
          className="mt-8 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setErr("");
            setLoading(true);
            try {
              await backend.signInWorker(number, code);
              const data = await backend.snapshot<{ onboarding?: boolean }>();
              setPhase(data.onboarding ? "waiting" : "app");
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Sign in failed");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Employee number" htmlFor="signin-number">
            <input
              id="signin-number"
              className={inputCls}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="SL-100001"
              autoComplete="username"
              autoCapitalize="characters"
              required
            />
          </Field>
          <Field label="Access code" htmlFor="signin-code" error={err || undefined}>
            <div className="relative">
              <input
                id="signin-code"
                className={cn(inputCls, "pr-12")}
                type={showCode ? "text" : "password"}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Your private code"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sub"
                aria-label={showCode ? "Hide access code" : "Show access code"}
              >
                {showCode ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </Field>
          <p className="text-[13px] text-sub dark:text-dsub">
            Lost your code? Ask your manager for a replacement. Your phone number alone cannot
            recover an account.
          </p>
          <Button type="submit" loading={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </Button>
          <button
            type="button"
            className="w-full text-[15px] font-semibold text-brand"
            onClick={() => setPhase("signup")}
          >
            Create account
          </button>
        </form>
      </div>
      <HomeIndicator />
    </div>
  );
}

export function CreateAccount() {
  const { setPhase, toast } = useApp();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [credentials, setCredentials] = useState<WorkerCredentials | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  if (credentials)
    return (
      <div className="flex h-full flex-col bg-page dark:bg-dpage">
        <StatusBar />
        <div className="no-scrollbar flex-1 overflow-y-auto px-7 py-8">
          <Logo size={56} />
          <h1 className="mt-6 text-[28px] font-bold text-ink dark:text-white">
            Save your access details
          </h1>
          <p className="mt-2 text-[16px] text-sub dark:text-dsub">
            Your account has been created. These details are shown once. Keep the code private.
          </p>
          <dl className="mt-6 space-y-4 rounded-card bg-brand-soft/70 p-5 dark:bg-brand/15">
            <div>
              <dt className="text-sm text-sub dark:text-dsub">Employee number</dt>
              <dd className="mt-1 select-all font-mono text-xl text-ink dark:text-white">
                {credentials.employeeNo}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-sub dark:text-dsub">Access code</dt>
              <dd className="mt-1 select-all font-mono text-xl text-ink dark:text-white">
                {credentials.accessCode}
              </dd>
            </div>
          </dl>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `Employee number: ${credentials.employeeNo}\nAccess code: ${credentials.accessCode}`,
                );
                toast("Access details copied");
              } catch {
                setErr("Select and copy your details above, or write them down.");
              }
            }}
          >
            Copy access details
          </Button>
          <label className="my-5 flex items-center gap-3 text-[15px] text-ink dark:text-white">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
            />
            I have saved my employee number and code
          </label>
          {err && (
            <p role="alert" className="mb-4 text-sm text-bad">
              {err}
            </p>
          )}
          <Button
            disabled={!saved}
            loading={loading}
            onClick={async () => {
              setLoading(true);
              setErr("");
              try {
                await backend.signInWorker(credentials.employeeNo, credentials.accessCode);
                const data = await backend.snapshot<{ onboarding?: boolean }>();
                setPhase(data.onboarding ? "waiting" : "app");
              } catch (error) {
                setErr(
                  error instanceof Error
                    ? error.message
                    : "Could not sign in. Keep your access details and try again.",
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            Continue
          </Button>
          <p className="mt-4 text-[13px] text-sub dark:text-dsub">
            Your manager will approve your workplace access. No email confirmation is needed.
          </p>
        </div>
        <HomeIndicator />
      </div>
    );
  return (
    <div className="flex h-full flex-col bg-page dark:bg-dpage">
      <StatusBar />
      <div className="no-scrollbar flex-1 overflow-y-auto px-7 pb-8">
        <button
          onClick={() => setPhase("welcome")}
          className="press -ml-2 mt-1 rounded-lg px-2 py-1 text-[17px] text-brand"
        >
          ‹ Back
        </button>
        <h1 className="mt-7 text-[28px] font-bold tracking-tight text-ink dark:text-white">
          Create your account
        </h1>
        <p className="mt-2 text-[16px] text-sub dark:text-dsub">
          Enter your name and phone number. We’ll give you an employee number and access code.
        </p>
        <form
          className="mt-7 space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            setErr("");
            try {
              setCredentials(await backend.registerWorker({ fullName, phone }));
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Account creation failed");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Full name" htmlFor="signup-name">
            <input
              id="signup-name"
              className={inputCls}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your first and last name"
              maxLength={100}
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Phone number" htmlFor="signup-phone" error={err || undefined}>
            <input
              id="signup-phone"
              className={inputCls}
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+264 81 123 4567"
              maxLength={40}
              autoComplete="tel"
              required
            />
          </Field>
          <p className="text-[13px] text-sub dark:text-dsub">
            Include your country code. Your name and phone number will appear in your manager’s Team
            list. We do not send a confirmation email or SMS.
          </p>
          <Button type="submit" loading={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </Button>
          <button
            type="button"
            className="w-full text-[15px] font-semibold text-brand"
            onClick={() => setPhase("signin")}
          >
            Already registered? Sign in
          </button>
        </form>
      </div>
      <HomeIndicator />
    </div>
  );
}

export function AccessWaiting() {
  const { setPhase } = useApp();
  const [profile, setProfile] = useState<{
    status: string;
    name: string;
    employeeNo: string;
    phone: string;
  } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running || document.visibilityState === "hidden" || !navigator.onLine) return;
      running = true;
      try {
        const data = await backend.snapshot<{
          onboarding?: boolean;
          workerAccess?: typeof profile;
        }>();
        if (active) {
          setErr("");
          if (!data.onboarding) setPhase("app");
          else setProfile(data.workerAccess ?? null);
        }
      } catch (error) {
        if (active) setErr(error instanceof Error ? error.message : "Could not check access");
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [setPhase]);
  const rejected = profile?.status === "rejected";
  return (
    <div className="flex h-full flex-col bg-page dark:bg-dpage">
      <StatusBar />
      <div className="flex flex-1 flex-col justify-center px-7 py-8">
        <Clock3 size={44} className="text-brand" />
        <h1 className="mt-6 text-[28px] font-bold text-ink dark:text-white">
          {rejected ? "Contact your manager" : "Waiting for approval"}
        </h1>
        <p className="mt-3 text-[16px] text-sub dark:text-dsub">
          {rejected
            ? "Your registration was not approved. Speak to your manager to check your details."
            : "Your manager needs to approve your account before you can see shifts, jobs and messages. This screen checks for approval automatically."}
        </p>
        {profile && (
          <div className="my-6 rounded-card bg-fill p-4 dark:bg-dfill">
            <p className="font-semibold text-ink dark:text-white">{profile.name}</p>
            <p className="mt-1 text-sm text-sub dark:text-dsub">
              {profile.employeeNo} · {profile.phone}
            </p>
          </div>
        )}
        {err && (
          <p role="alert" className="my-4 text-sm text-bad">
            {err}
          </p>
        )}
        <Button
          loading={loading}
          className="mt-4"
          onClick={async () => {
            setLoading(true);
            setErr("");
            try {
              const data = await backend.snapshot<{
                onboarding?: boolean;
                workerAccess?: typeof profile;
              }>();
              if (!data.onboarding) setPhase("app");
              else setProfile(data.workerAccess ?? null);
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Could not check access");
            } finally {
              setLoading(false);
            }
          }}
        >
          Check approval
        </Button>
        <Button
          variant="plain"
          className="mt-3"
          onClick={async () => {
            try {
              await backend.signOut();
              setPhase("welcome");
            } catch (error) {
              setErr(error instanceof Error ? error.message : "Could not sign out");
            }
          }}
        >
          Sign out
        </Button>
      </div>
      <HomeIndicator />
    </div>
  );
}
