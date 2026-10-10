import { useEffect, useState } from "react";
import { Eye, EyeOff, Mail, CheckCircle2 } from "lucide-react";
import { Logo, StatusBar, HomeIndicator, Button, Field, inputCls, SuccessCheck } from "../ui";
import { useApp } from "../state";
import { cn } from "../utils/cn";
import * as backend from "../backend";

// ─── Splash ────────────────────────────────────────────────────────────────
export function Splash() {
  const { setPhase } = useApp();
  useEffect(() => {
    const t = setTimeout(
      () => setPhase((current) => (current === "splash" ? "welcome" : current)),
      1500,
    );
    return () => clearTimeout(t);
  }, [setPhase]);
  return (
    <div className="flex h-full flex-col bg-page dark:bg-dpage">
      <StatusBar />
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="anim-logo flex flex-col items-center">
          <Logo size={84} />
          <p className="mt-5 text-[22px] font-bold tracking-tight text-ink dark:text-white">
            Shiftline
          </p>
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

// ─── Sign in ───────────────────────────────────────────────────────────────
export function SignIn() {
  const { setPhase, toast } = useApp();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.includes("@")) return setErr("Enter a valid email address.");
    if (pw.length < 4) return setErr("Enter your password to continue.");
    setErr(null);
    setLoading(true);
    try {
      await backend.signIn(email, pw);
      const data = await backend.snapshot<{ onboarding?: boolean }>();
      setPhase(data.onboarding ? "activate" : "app");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

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
        <div className="mt-8 flex flex-col items-start">
          <Logo size={56} />
          <h1 className="mt-6 text-[28px] font-bold tracking-tight text-ink dark:text-white">
            Welcome back
          </h1>
          <p className="mt-1 text-[16px] text-sub dark:text-dsub">
            Sign in to your Shiftline account.
          </p>
        </div>
        <div className="mt-8 space-y-4">
          <Field label="Email address">
            <input
              className={inputCls}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoCapitalize="none"
            />
          </Field>
          <Field label="Password" error={err ?? undefined}>
            <div className="relative">
              <input
                className={cn(inputCls, "pr-12", err && "ring-2 ring-bad/50")}
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setErr(null);
                }}
                placeholder="Your password"
              />
              <button
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sub dark:text-dsub"
                aria-label="Toggle password visibility"
              >
                {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </Field>
          <div className="flex justify-end">
            <button
              className="press rounded px-1 text-[15px] font-medium text-brand"
              onClick={async () => {
                if (!email.includes("@")) return setErr("Enter your email address first.");
                try {
                  await backend.resetPassword(email);
                  toast("Password reset link sent", "info");
                } catch (error) {
                  setErr(error instanceof Error ? error.message : "Could not send reset link");
                }
              }}
            >
              Forgot password?
            </button>
          </div>
          <Button onClick={submit} loading={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </Button>
          <p className="pt-2 text-center text-[15px] text-sub dark:text-dsub">
            New to Shiftline?{" "}
            <button className="font-semibold text-brand" onClick={() => setPhase("signup")}>
              Create account
            </button>
          </p>
        </div>
      </div>
      <HomeIndicator />
    </div>
  );
}

// ─── Create account ────────────────────────────────────────────────────────
export function CreateAccount() {
  const { setPhase } = useApp();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwOk = pw.length >= 8;
  const submit = async () => {
    if (!email.includes("@")) return setErr("Enter a valid email address.");
    if (!pwOk) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords don't match.");
    setErr(null);
    setLoading(true);
    try {
      const session = await backend.signUp(email, pw);
      setPhase(session ? "activate" : "verify");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Account creation failed");
    } finally {
      setLoading(false);
    }
  };

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
        <p className="mt-1 text-[16px] text-sub dark:text-dsub">
          Use the email address your employer has on file.
        </p>
        <div className="mt-7 space-y-4">
          <Field label="Email address">
            <input
              className={inputCls}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoCapitalize="none"
            />
          </Field>
          <Field label="Password">
            <input
              className={inputCls}
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 8 characters"
            />
          </Field>
          <Field label="Confirm password" error={err ?? undefined}>
            <input
              className={cn(inputCls, err && "ring-2 ring-bad/50")}
              type="password"
              value={pw2}
              onChange={(e) => {
                setPw2(e.target.value);
                setErr(null);
              }}
              placeholder="Repeat your password"
            />
          </Field>
          <div className="flex items-center gap-2 px-1 text-[13px] text-sub dark:text-dsub">
            <CheckCircle2 size={15} className={pwOk ? "text-ok" : "text-sep dark:text-dsep"} />
            Minimum 8 characters, avoid common words
          </div>
          <Button onClick={submit} loading={loading}>
            {loading ? "Creating account…" : "Create Account"}
          </Button>
          <p className="pt-2 text-center text-[15px] text-sub dark:text-dsub">
            Already have an account?{" "}
            <button className="font-semibold text-brand" onClick={() => setPhase("signin")}>
              Sign in
            </button>
          </p>
        </div>
      </div>
      <HomeIndicator />
    </div>
  );
}

// ─── Verify email ──────────────────────────────────────────────────────────
export function VerifyEmail() {
  const { setPhase, toast } = useApp();
  return (
    <div className="flex h-full flex-col bg-page dark:bg-dpage">
      <StatusBar />
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="anim-pop-in flex h-[76px] w-[76px] items-center justify-center rounded-full bg-brand/12">
          <Mail size={34} className="text-brand" />
        </div>
        <h1
          className="anim-rise mt-6 text-[28px] font-bold tracking-tight text-ink dark:text-white"
          style={{ animationDelay: "0.1s" }}
        >
          Check your email
        </h1>
        <p
          className="anim-rise mt-2 max-w-[280px] text-[16px] leading-relaxed text-sub dark:text-dsub"
          style={{ animationDelay: "0.2s" }}
        >
          We sent a verification link to your email address. Tap the link, then continue below.
        </p>
      </div>
      <div className="space-y-3 px-7 pb-6">
        <Button
          onClick={async () => {
            try {
              if (!(await backend.hasSession()))
                throw new Error("Verify your email, then sign in.");
              const data = await backend.snapshot<{ onboarding?: boolean }>();
              setPhase(data.onboarding ? "activate" : "app");
            } catch (error) {
              toast(error instanceof Error ? error.message : "Sign in required", "error");
              setPhase("signin");
            }
          }}
        >
          I've Verified My Email
        </Button>
      </div>
      <HomeIndicator />
    </div>
  );
}

// ─── Employee activation ───────────────────────────────────────────────────
export function Activate() {
  const { setPhase } = useApp();
  const [empNo, setEmpNo] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (empNo.trim().length < 4) return setErr("Enter your employee number, e.g. EMP-1042.");
    if (code.trim().length < 6) return setErr("Enter the 6-digit activation code.");
    setErr(null);
    setLoading(true);
    try {
      await backend.command("activate", { employeeNo: empNo.trim(), code: code.trim() });
      setDone(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Activation failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex h-full flex-col bg-page dark:bg-dpage">
        <StatusBar />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <SuccessCheck tone="purple" />
          <h1
            className="anim-rise mt-6 text-[28px] font-bold tracking-tight text-ink dark:text-white"
            style={{ animationDelay: "0.15s" }}
          >
            Your account is linked
          </h1>
          <p
            className="anim-rise mt-2 max-w-[280px] text-[16px] leading-relaxed text-sub dark:text-dsub"
            style={{ animationDelay: "0.25s" }}
          >
            Your employee account is ready. Your assigned shifts will appear when the live screens
            are connected.
          </p>
        </div>
        <div className="px-7 pb-6">
          <Button onClick={() => setPhase("app")}>Go to Shiftline</Button>
        </div>
        <HomeIndicator />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-page dark:bg-dpage">
      <StatusBar />
      <div className="no-scrollbar flex-1 overflow-y-auto px-7 pb-8">
        <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-sub dark:text-dsub">
          Step 2 of 2
        </div>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-ink dark:text-white">
          Activate your workplace
        </h1>
        <p className="mt-1 text-[16px] leading-relaxed text-sub dark:text-dsub">
          Link this account to your employer so your shifts and hours show up.
        </p>
        <div className="mt-7 space-y-4">
          <Field label="Employee number">
            <input
              className={inputCls}
              value={empNo}
              onChange={(e) => setEmpNo(e.target.value)}
              placeholder="EMP-0000"
              autoCapitalize="characters"
            />
          </Field>
          <Field label="Activation code" error={err ?? undefined}>
            <input
              className={cn(inputCls, "tracking-[0.3em]", err && "ring-2 ring-bad/50")}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setErr(null);
              }}
              placeholder="••••••"
              inputMode="numeric"
            />
          </Field>
          <div className="rounded-card bg-brand-soft/70 p-4 dark:bg-brand/15">
            <p className="text-[14px] leading-relaxed text-brand dark:text-[#9D91F2]">
              Your manager or HR team provides your one-time activation code. It usually arrives
              with your onboarding email.
            </p>
          </div>
          <Button onClick={submit} loading={loading}>
            {loading ? "Activating…" : "Activate Account"}
          </Button>
        </div>
      </div>
      <HomeIndicator />
    </div>
  );
}
