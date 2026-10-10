import { AppProvider, useApp } from "./state";
import { Splash, Welcome, SignIn, CreateAccount, VerifyEmail, Activate } from "./screens/Auth";
import { ToastHost } from "./ui";
import { cn } from "./utils/cn";
import LiveWorkerApp from "./LiveWorkerApp";

function Shell() {
  const { phase, isDark, reduceMotion, setPhase } = useApp();
  return (
    <div className={cn(isDark && "dark", reduceMotion && "reduce-motion")}>
      <div className="flex h-[100dvh] w-full items-center justify-center bg-[#E3E3E8] dark:bg-[#0A0A0C]">
        <div className="relative h-[100dvh] w-full overflow-hidden bg-page font-sans sm:h-[min(932px,96dvh)] sm:w-[430px] sm:rounded-[54px] sm:shadow-[0_32px_80px_rgba(0,0,0,0.35)] sm:ring-[10px] sm:ring-[#1C1C1E] dark:bg-dpage dark:sm:ring-[#2C2C2E]">
          {phase === "splash" && <Splash />}
          {phase === "welcome" && <Welcome />}
          {phase === "signin" && <SignIn />}
          {phase === "signup" && <CreateAccount />}
          {phase === "verify" && <VerifyEmail />}
          {phase === "activate" && <Activate />}
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
