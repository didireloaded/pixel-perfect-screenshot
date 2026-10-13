import { AppProvider, useApp } from "./state";
import { Splash, Welcome, SignIn, CreateAccount, AccessWaiting } from "./screens/Auth";
import { ToastHost } from "./ui";
import { cn } from "./utils/cn";
import { lazy, Suspense } from "react";
const LiveWorkerApp = lazy(() => import("./LiveWorkerApp"));
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
          {phase === "app" && (
            <Suspense
              fallback={
                <p role="status" className="p-6">
                  Loading your workday…
                </p>
              }
            >
              <LiveWorkerApp onSignOut={() => setPhase("welcome")} />
            </Suspense>
          )}
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
