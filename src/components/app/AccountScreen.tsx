import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backendMode, signIn } from "@/lib/backend";
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
  const [manager, setManager] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");
    setPending(true);
    const form = new FormData(e.currentTarget);
    const get = (key: string) => String(form.get(key) || "").trim();
    try {
      if (!signed) {
        const ok = await signIn(get("email"), String(form.get("password")), create);
        if (ok) await onAuthenticated();
        else setMessage("Check your email to confirm your account, then sign in.");
      } else
        await command(
          manager ? "setup" : "activate",
          manager
            ? {
                company: get("company"),
                name: get("name"),
                site: get("site"),
                address: get("address"),
                timezone: get("timezone"),
              }
            : { employeeNo: get("employeeNo"), code: get("code") },
        );
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
        type={type}
        required
        defaultValue={value}
        minLength={name === "password" ? 12 : 1}
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
              : "Activate your account"
            : create
              ? "Create your account"
              : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {signed
            ? manager
              ? "Create your first site, then add employees and their shifts."
              : "Enter the employee number and one-time code from your manager."
            : "Your shift, jobs and hours in one place."}
        </p>
        {backendMode === "local" && (
          <p className="mt-4 rounded-2xl bg-tint-cream p-3 text-xs">
            Local development · records saved on this computer. Cloud and location services are not
            connected.
          </p>
        )}
        <form onSubmit={submit} className="mt-5 space-y-4">
          {!signed ? (
            <>
              {field("email", "Email", "email")}
              {field("password", "Password (at least 12 characters)", "password")}
            </>
          ) : manager ? (
            <>
              {field("company", "Company name", "text", "Project Inc.")}
              {field("name", "Your name")}
              {field("site", "Work site")}
              {field("address", "Site address")}
              {field("timezone", "Company timezone", "text", "Africa/Windhoek")}
            </>
          ) : (
            <>
              {field("employeeNo", "Employee number")}
              {field("code", "Activation code")}
            </>
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
                  : "Activate account"
                : create
                  ? "Create account"
                  : "Sign in"}
          </Button>
        </form>
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
              ? "I have an employee activation code"
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
