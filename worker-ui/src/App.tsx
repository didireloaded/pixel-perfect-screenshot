import { AppProvider, useApp } from "./state";
import { Splash, Welcome, SignIn, CreateAccount, VerifyEmail, Activate } from "./screens/Auth";
import { ToastHost } from "./ui";
import { cn } from "./utils/cn";
import LiveWorkerApp from "./LiveWorkerApp";
import { designPreview } from "./demo/previewSnapshot";
import type { AttendanceState } from "../../shared/attendance";

const preview =
  import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "worker";
const states: AttendanceState[] = [
  "not_clocked_in",
  "working",
  "on_lunch",
  "on_job",
  "on_personal",
  "clocked_out",
];
const previewState =
  states.find((state) => state === new URLSearchParams(location.search).get("state")) ??
  "not_clocked_in";
const previewRecords = preview ? designPreview(previewState) : undefined;
function Shell() {
  const { phase, isDark, reduceMotion, setPhase } = useApp();
  return (
    <div className={cn(isDark && "dark", reduceMotion && "reduce-motion")}>
      <div className="worker-stage dark:bg-[#0A0A0C]">
        <div className="worker-device">
          {preview && (
            <LiveWorkerApp
              previewData={previewRecords}
              onSignOut={() => {
                location.href = "/";
              }}
            />
          )}
          {!preview && phase === "splash" && <Splash />}
          {!preview && phase === "welcome" && <Welcome />}
          {!preview && phase === "signin" && <SignIn />}
          {!preview && phase === "signup" && <CreateAccount />}
          {!preview && phase === "verify" && <VerifyEmail />}
          {!preview && phase === "activate" && <Activate />}
          {!preview && phase === "app" && <LiveWorkerApp onSignOut={() => setPhase("welcome")} />}
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
