import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as backend from "./backend";

export type Phase = "splash" | "welcome" | "signin" | "signup" | "waiting" | "app";
type Appearance = "system" | "light" | "dark";
type Toast = { id: number; text: string; kind: "success" | "info" | "error" };
interface AppContext {
  phase: Phase;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
  isDark: boolean;
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
  textScale: number;
  setTextScale: (value: number) => void;
  toastItem: Toast | null;
  toast: (text: string, kind?: Toast["kind"]) => void;
  online: boolean;
  authError: string;
}
const Context = createContext<AppContext | null>(null);
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error("App provider missing");
  return context;
}
function preference(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional. */
  }
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("splash");
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    let active = true;
    let revision = 0;
    let currentUser: string | null = null;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    const restore = async () => {
      const token = ++revision;
      try {
        if (!(await backend.hasSession())) {
          if (active && token === revision) setPhase("welcome");
          return;
        }
        const data = await backend.snapshot<{ onboarding?: boolean }>();
        if (active && token === revision) {
          setAuthError("");
          setPhase(data.onboarding ? "waiting" : "app");
        }
      } catch (error) {
        if (active && token === revision) {
          setAuthError(error instanceof Error ? error.message : "Could not restore your account");
          setPhase("signin");
        }
      }
    };
    const unsubscribe = backend.onAuthChange((event, userId) => {
      ++revision;
      if (event === "PASSWORD_RECOVERY") {
        setAuthError("Ask your manager for a replacement access code.");
        setPhase("signin");
        return;
      }
      if (!userId) {
        currentUser = null;
        setPhase("welcome");
        return;
      }
      // Clear prior account data before restoring a different sign-in.
      if (event === "SIGNED_IN" && userId !== currentUser) setPhase("splash");
      currentUser = userId;
      clearTimeout(deferred);
      deferred = setTimeout(() => {
        if (active) void restore();
      }, 0);
    });
    void restore();
    return () => {
      active = false;
      ++revision;
      clearTimeout(deferred);
      unsubscribe();
    };
  }, []);
  const [appearance, setAppearanceState] = useState<Appearance>(() => {
    const value = preference("shiftline-appearance");
    return value === "dark" || value === "system" ? value : "light";
  });
  const setAppearance = (value: Appearance) => {
    setAppearanceState(value);
    savePreference("shiftline-appearance", value);
  };
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [reduceMotion, setReduceMotionState] = useState(
    () =>
      preference("shiftline-reduce-motion") === "on" ||
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );
  const setReduceMotion = (value: boolean) => {
    setReduceMotionState(value);
    savePreference("shiftline-reduce-motion", value ? "on" : "off");
  };
  const [textScale, setTextScale] = useState(1);
  const [toastItem, setToastItem] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    setToastItem({ id: Date.now(), text, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastItem(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <Context.Provider
      value={{
        phase,
        setPhase,
        appearance,
        setAppearance,
        isDark: appearance === "dark" || (appearance === "system" && systemDark),
        reduceMotion,
        setReduceMotion,
        textScale,
        setTextScale,
        toastItem,
        toast,
        online,
        authError,
      }}
    >
      {children}
    </Context.Provider>
  );
}
