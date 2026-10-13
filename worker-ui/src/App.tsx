import { AppProvider, useApp } from "./state";
import { Splash, Welcome, SignIn, CreateAccount, AccessWaiting } from "./screens/Auth";
import { ToastHost } from "./ui";
import { cn } from "./utils/cn";
import LiveWorkerApp from "./LiveWorkerApp";
import { configured } from "./backend";
function Shell() {
  const { phase, isDark, reduceMotion, setPhase, authError } = useApp();
  if (!configured)
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-bold">Connect Shiftline</h1>
        <p className="mt-3">
          Set the Supabase URL and publishable key before using the worker app.
        </p>
      </div>
    );
  return (
    <div className={cn(isDark && "dark", reduceMotion && "reduce-motion")}>
      <div className="worker-stage dark:bg-[#0A0A0C]">
        <div className="worker-device">
          {authError && phase === "signin" && (
            <p role="alert" className="bg-fill p-3 text-xs dark:bg-dfill">
              {authError}
            </p>
          )}
          {phase === "splash" && <Splash />}
          {phase === "welcome" && <Welcome />}
          {phase === "signin" && <SignIn />}
          {phase === "signup" && <CreateAccount />}
          {phase === "waiting" && <AccessWaiting />}
          {phase === "app" && <LiveWorkerApp onSignOut={() => setPhase("welcome")} />}
          <ToastHost />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
