import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  backendMode,
  resendConfirmation,
  resetPassword,
  updatePassword,
  signIn,
  uploadCompanyLogo,
} from "@/lib/backend";
import type { AttendanceSnapshot } from "../../../shared/attendance";
export function AccountScreen({
  signed,
  error,
  busy,
  onAuthenticated,
  command,
  logout,
}: {
  signed: boolean;
  error: string;
  busy: boolean;
  onAuthenticated: () => Promise<void>;
  command: (a: string, d: Record<string, unknown>) => Promise<unknown>;
  logout: () => Promise<void>;
}) {
  const [create, setCreate] = useState(false);
  const [manager, setManager] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [resendNote, setResendNote] = useState("");
  const [resending, setResending] = useState(false);
  const [email, setEmail] = useState("");
  const resend = async () => {
    setResending(true);
    setResendNote("");
    try {
      await resendConfirmation(confirmEmail);
      setResendNote("A new confirmation email is on its way.");
    } catch (e) {
      setResendNote(e instanceof Error ? e.message : "Could not resend right now");
    } finally {
      setResending(false);
    }
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");
    setPending(true);
    const form = new FormData(e.currentTarget);
    const get = (key: string) => String(form.get(key) || "").trim();
    try {
      if (!signed) {
        let ok = false;
        try {
          ok = await signIn(get("email"), String(form.get("password")), create);
        } catch (err) {
          if (err instanceof Error && /not confirmed/i.test(err.message)) {
            setConfirmEmail(get("email"));
            return;
          }
          throw err;
        }
        if (ok) await onAuthenticated();
        else setConfirmEmail(get("email"));
      } else {
        const result = await command(
          manager ? "setup" : "join_workplace",
          manager
            ? {
                company: get("company"),
                name: get("name"),
                site: get("site"),
                address: get("address"),
                timezone: get("timezone"),
              }
            : { code: get("code") },
        );
        const logo = form.get("logo");
        if (manager && result && logo instanceof File && logo.size) {
          const company = (result as { snapshot: AttendanceSnapshot }).snapshot.company;
          try {
            const logoPath = await uploadCompanyLogo(company.id, logo);
            await command("save_company_profile", { name: company.name, logoPath });
          } catch {
            // Company creation succeeded. Allow a safe retry from company settings.
            window.alert(
              "Your company was created. Upload your logo from Settings to finish branding.",
            );
          }
        }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not continue");
    } finally {
      setPending(false);
    }
  };
  const field = (name: string, label: string, type = "text", value?: string) => (
    <label className="block text-sm font-medium">
      {label}
      <Input
        name={name}
        onChange={name === "email" ? (event) => setEmail(event.target.value) : undefined}
        type={type}
        required
        defaultValue={value}
        minLength={name === "password" ? (create ? 12 : 1) : 1}
        maxLength={name === "password" ? 128 : 200}
        autoComplete={
          name === "password"
            ? create
              ? "new-password"
              : "current-password"
            : name === "email"
              ? "email"
              : "off"
        }
        className="mt-2 h-12 rounded-2xl bg-muted"
      />
    </label>
  );
  if (backendMode === "unconfigured")
    return (
      <div className="mx-auto mt-12 max-w-[440px] card-surface p-6">
        <h1 className="text-2xl font-bold">Connect Shiftline</h1>
        <p className="mt-3 text-sm">
          The app needs its Supabase URL and publishable key. Apply the included database migration
          and set the two environment values described in the setup guide.
        </p>
      </div>
    );
  if (confirmEmail && !signed)
    return (
      <div className="mx-auto flex min-h-screen max-w-[440px] items-center px-5 py-8">
        <section className="card-surface w-full p-6">
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold">
            Almost there
          </span>
          <h1 className="mt-5 text-2xl font-bold">Confirm your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to{" "}
            <strong className="text-foreground">{confirmEmail}</strong>.
          </p>
          <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm">
            <li>Open the email from Shiftline (check spam or promotions too).</li>
            <li>Tap the confirmation link.</li>
            <li>
              Come back here and sign in, then set up your company or enter your workplace access
              code.
            </li>
          </ol>
          {resendNote && (
            <p role="status" className="mt-4 rounded-2xl bg-tint-cream p-3 text-sm">
              {resendNote}
            </p>
          )}
          <Button
            variant="hero"
            size="xl"
            className="mt-5 w-full"
            onClick={() => {
              setConfirmEmail("");
              setCreate(false);
              setResendNote("");
            }}
          >
            I've confirmed, sign in
          </Button>
          <Button
            variant="ghost"
            className="mt-3 w-full"
            disabled={resending}
            onClick={() => void resend()}
          >
            {resending ? "Sending…" : "Didn't get it? Resend email"}
          </Button>
        </section>
      </div>
    );
  return (
    <div className="mx-auto flex min-h-screen max-w-[440px] items-center px-5 py-8">
      <section className="card-surface w-full p-6">
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold">
          Shiftline
        </span>
        <h1 className="mt-5 text-2xl font-bold">
          {signed
            ? manager
              ? "Set up your company"
              : "Join your workplace"
            : create
              ? "Create your account"
              : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {signed
            ? manager
              ? "Create your private workspace. Invite employees using your company registration code."
              : "Enter the access code from your manager."
            : "Your shift, jobs and hours in one place."}
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {!signed ? (
            <>
              {field("email", "Email", "email")}
              {field(
                "password",
                create ? "Password (at least 12 characters)" : "Password",
                "password",
              )}
            </>
          ) : manager ? (
            <>
              {field("company", "Company name")}
              <label className="block text-sm font-medium">
                Company logo (optional, PNG/JPEG/WebP, up to 1 MB)
                <Input
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="mt-2"
                />
              </label>
              {field("name", "Your name")}
              {field("site", "Work site")}
              {field("address", "Site address")}
              {field("timezone", "Company timezone", "text", "Africa/Windhoek")}
            </>
          ) : (
            <>{field("code", "Access code")}</>
          )}
          {(message || error) && (
            <p role="alert" className="rounded-2xl bg-tint-pink p-3 text-sm">
              {message || error}
            </p>
          )}
          <Button variant="hero" size="xl" className="w-full" disabled={pending || busy}>
            {pending || busy
              ? "Saving…"
              : signed
                ? manager
                  ? "Create company"
                  : "Join workplace"
                : create
                  ? "Create account"
                  : "Sign in"}
          </Button>
        </form>
        {!signed && !create && (
          <Button
            variant="ghost"
            className="mt-3 w-full"
            disabled={pending || !email.trim()}
            onClick={async () => {
              setPending(true);
              try {
                await resetPassword(email.trim());
                setMessage("Check your email for a password reset link.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not request a reset");
              } finally {
                setPending(false);
              }
            }}
          >
            Forgot password?
          </Button>
        )}
        <Button
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => {
            if (signed) setManager(!manager);
            else setCreate(!create);
            setMessage("");
          }}
        >
          {signed
            ? manager
              ? "I have a workplace access code"
              : "I am setting up a company"
            : create
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
        </Button>
        {signed && (
          <Button variant="ghost" className="w-full" onClick={() => void logout()}>
            Sign out
          </Button>
        )}
      </section>
    </div>
  );
}

export function PasswordRecovery({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto flex min-h-screen max-w-[440px] items-center px-5 py-8">
      <form
        className="card-surface w-full space-y-4 p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await updatePassword(password);
            onComplete();
          } catch (error) {
            setError(error instanceof Error ? error.message : "Could not change your password");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <label className="block">
          New password
          <Input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="block">
          Confirm password
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button disabled={busy || password.length < 12 || password !== confirm}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </div>
  );
}
