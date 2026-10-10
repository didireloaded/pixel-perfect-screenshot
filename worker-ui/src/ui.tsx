import React, { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, WifiOff, Check } from "lucide-react";
import { cn } from "./utils/cn";
import { useApp } from "./state";

// ─── Logo ──────────────────────────────────────────────────────────────────
export function Logo({ size = 56, radius }: { size?: number; radius?: number }) {
  const r = radius ?? size * 0.28;
  return (
    <div
      className="flex items-center justify-center bg-brand"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        boxShadow: "0 8px 24px rgba(91,77,216,0.35)",
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path
          d="M4 15.5 9.2 9.8l3.6 3.4L20 5.5"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M4 19.5h16" stroke="white" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// ─── iOS status bar ────────────────────────────────────────────────────────
export function StatusBar({ light }: { light?: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-none relative z-40 flex h-[54px] shrink-0 items-end justify-between px-8 pb-2 text-[15px] font-semibold",
        light ? "text-white" : "text-ink dark:text-white"
      )}
    >
      <span className="tabular-nums tracking-tight">9:41</span>
      {/* Dynamic Island */}
      <div className="absolute left-1/2 top-[11px] h-[34px] w-[118px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex items-center gap-1.5">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="0.8" />
          <rect x="4.5" y="5" width="3" height="6" rx="0.8" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.8" />
          <rect x="13.5" y="0" width="3" height="11" rx="0.8" />
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 9.6a2 2 0 0 1 1.9 1.3.45.45 0 0 1-.13.5l-1.46 1.4a.45.45 0 0 1-.62 0l-1.46-1.4a.45.45 0 0 1-.12-.5A2 2 0 0 1 8 9.6ZM8 5.4c1.7 0 3.25.65 4.4 1.72a.5.5 0 0 1 .01.72l-.86.84a.5.5 0 0 1-.68.02A4.33 4.33 0 0 0 8 7.6c-1.1 0-2.1.4-2.87 1.1a.5.5 0 0 1-.68-.02l-.86-.84a.5.5 0 0 1 .01-.72A6.5 6.5 0 0 1 8 5.4ZM8 1.2c2.84 0 5.42 1.1 7.35 2.9a.5.5 0 0 1 .01.72l-.85.84a.5.5 0 0 1-.69.01A8.68 8.68 0 0 0 8 3.4c-2.25 0-4.3.85-5.82 2.26a.5.5 0 0 1-.69 0l-.85-.84a.5.5 0 0 1 .01-.72A10.84 10.84 0 0 1 8 1.2Z" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.2" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2" y="2" width="17" height="8" rx="1.8" fill="currentColor" />
          <path d="M23.5 4v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" fillOpacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

// ─── Home indicator ────────────────────────────────────────────────────────
export function HomeIndicator({ light }: { light?: boolean }) {
  return (
    <div className="pointer-events-none flex h-[26px] shrink-0 items-center justify-center">
      <div className={cn("h-[5px] w-[134px] rounded-full", light ? "bg-white/90" : "bg-ink/80 dark:bg-white/80")} />
    </div>
  );
}

// ─── Icon button (circular) ───────────────────────────────────────────────
export function IconBtn({
  children,
  onClick,
  badge,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  badge?: boolean;
  label?: string;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="press relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink card-shadow dark:bg-dcard dark:text-white"
    >
      {children}
      {badge && (
        <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-page bg-bad dark:border-dpage" />
      )}
    </button>
  );
}

// ─── Large-title page with collapsing compact bar ─────────────────────────
export function Page({
  title,
  subtitle,
  right,
  children,
  bottomPad = true,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  bottomPad?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { textScale } = useApp();
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* compact bar */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-30 flex h-12 items-center justify-center border-b transition-opacity duration-200 glass-bar",
          collapsed ? "opacity-100" : "opacity-0",
          "border-sep/70 dark:border-dsep/70"
        )}
      >
        <span className="text-[17px] font-semibold text-ink dark:text-white">{title}</span>
      </div>
      <div
        ref={ref}
        onScroll={() => setCollapsed((ref.current?.scrollTop ?? 0) > 46)}
        className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto px-5", bottomPad ? "pb-32" : "pb-8")}
        style={{ zoom: textScale }}
      >
        <div className="flex items-end justify-between pt-1">
          <div>
            {subtitle && <div className="mb-0.5">{subtitle}</div>}
            <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight text-ink dark:text-white">
              {title}
            </h1>
          </div>
          {right && <div className="flex items-center gap-2.5 pb-1">{right}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Pushed detail page ────────────────────────────────────────────────────
export function DetailPage({
  title,
  onBack,
  backLabel = "Back",
  right,
  children,
  noPad,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  const { textScale } = useApp();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-20 flex h-12 shrink-0 items-center justify-between border-b border-sep/70 px-2 glass-bar dark:border-dsep/70">
        <button
          onClick={onBack}
          className="press flex min-w-[84px] items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[17px] text-brand"
        >
          <ChevronLeft size={24} strokeWidth={2.4} className="-ml-1" />
          <span className="-ml-0.5 max-w-[90px] truncate">{backLabel}</span>
        </button>
        <span className="absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate text-[17px] font-semibold text-ink dark:text-white">
          {title}
        </span>
        <div className="flex min-w-[84px] items-center justify-end gap-2 pr-2">{right}</div>
      </div>
      <div
        className={cn("no-scrollbar min-h-0 flex-1 overflow-y-auto", noPad ? "" : "px-5 pb-12 pt-5")}
        style={{ zoom: textScale }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Section heading ───────────────────────────────────────────────────────
export function SectionTitle({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-2.5 mt-7 flex items-end justify-between px-0.5">
      <h2 className="text-[20px] font-semibold tracking-tight text-ink dark:text-white">{children}</h2>
      {action && (
        <button onClick={onAction} className="press rounded px-1 text-[15px] font-medium text-brand">
          {action}
        </button>
      )}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-card bg-card card-shadow dark:bg-dcard",
        onClick && "press cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Grouped list ──────────────────────────────────────────────────────────
export function Group({ children, header, footer, className }: { children: React.ReactNode; header?: string; footer?: string; className?: string }) {
  return (
    <div className={className}>
      {header && (
        <div className="mb-1.5 px-4 text-[13px] font-medium uppercase tracking-wide text-sub dark:text-dsub">
          {header}
        </div>
      )}
      <div className="overflow-hidden rounded-card bg-card card-shadow dark:bg-dcard">{children}</div>
      {footer && <div className="mt-1.5 px-4 text-[13px] leading-snug text-sub dark:text-dsub">{footer}</div>}
    </div>
  );
}

export function Row({
  icon,
  iconBg,
  label,
  sub,
  value,
  chevron,
  onClick,
  destructive,
  last,
  right,
}: {
  icon?: React.ReactNode;
  iconBg?: string;
  label: React.ReactNode;
  sub?: React.ReactNode;
  value?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  destructive?: boolean;
  last?: boolean;
  right?: React.ReactNode;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left",
        onClick && "press-row cursor-pointer",
        !last && "border-b border-sep/80 dark:border-dsep/70"
      )}
    >
      {icon && (
        <span
          className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-white", iconBg ?? "bg-brand")}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[17px] leading-snug", destructive ? "text-bad" : "text-ink dark:text-white")}>
          {label}
        </span>
        {sub && <span className="mt-0.5 block text-[14px] leading-snug text-sub dark:text-dsub">{sub}</span>}
      </span>
      {value && <span className="shrink-0 text-[16px] tabular-nums text-sub dark:text-dsub">{value}</span>}
      {right}
      {chevron && <ChevronRight size={18} className="shrink-0 text-sub/70 dark:text-dsub/70" strokeWidth={2.2} />}
    </Comp>
  );
}

// ─── Segmented control ─────────────────────────────────────────────────────
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-[11px] bg-fill p-[3px] dark:bg-dfill", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-[9px] py-[7px] text-[14px] font-medium transition-all duration-200",
            value === o.value
              ? "bg-white text-ink shadow-[0_1px_4px_rgba(0,0,0,0.12)] dark:bg-[#636366] dark:text-white"
              : "text-sub dark:text-dsub"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Toggle ────────────────────────────────────────────────────────────────
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200",
        on ? "bg-ok" : "bg-[#E9E9EB] dark:bg-[#39393D]"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.2)] transition-all duration-200",
          on ? "left-[22px]" : "left-[2px]"
        )}
      />
    </button>
  );
}

// ─── Buttons ───────────────────────────────────────────────────────────────
export function Button({
  children,
  onClick,
  variant = "primary",
  loading,
  disabled,
  className,
  size = "lg",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "tinted" | "destructive" | "plain" | "success";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "lg" | "md";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "press flex w-full items-center justify-center gap-2 rounded-btn font-semibold transition-opacity",
        size === "lg" ? "h-[52px] text-[17px]" : "h-[44px] text-[16px]",
        variant === "primary" && "bg-brand text-white shadow-[0_6px_20px_rgba(91,77,216,0.3)]",
        variant === "secondary" && "bg-fill text-ink dark:bg-dfill dark:text-white",
        variant === "tinted" && "bg-brand-soft text-brand dark:bg-brand/20",
        variant === "destructive" && "bg-bad/10 text-bad",
        variant === "success" && "bg-ok text-white shadow-[0_6px_20px_rgba(52,199,89,0.3)]",
        variant === "plain" && "text-brand",
        (disabled || loading) && "opacity-50",
        className
      )}
    >
      {loading && <Spinner size={18} light={variant === "primary" || variant === "success"} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 22, light }: { size?: number; light?: boolean }) {
  return (
    <svg className="anim-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke={light ? "rgba(255,255,255,0.3)" : "rgba(128,128,140,0.25)"} strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={light ? "#fff" : "#5B4DD8"} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Status pill ───────────────────────────────────────────────────────────
const PILL_STYLES: Record<string, string> = {
  green: "bg-ok/12 text-[#248A3D] dark:bg-ok/18 dark:text-[#30D158]",
  orange: "bg-warn/12 text-[#C47608] dark:bg-warn/18 dark:text-[#FFB340]",
  red: "bg-bad/10 text-bad dark:bg-bad/18 dark:text-[#FF6961]",
  blue: "bg-info/10 text-info dark:bg-info/18 dark:text-[#64A8FF]",
  purple: "bg-brand/10 text-brand dark:bg-brand/20 dark:text-[#9D91F2]",
  gray: "bg-fill text-sub dark:bg-dfill dark:text-dsub",
};

export function Pill({ tone = "gray", children, dot }: { tone?: keyof typeof PILL_STYLES; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12px] font-semibold", PILL_STYLES[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function statusTone(s: string): keyof typeof PILL_STYLES {
  const t = s.toLowerCase();
  if (["approved", "completed", "synced", "active", "working"].some((k) => t.includes(k))) return "green";
  if (["pending", "awaiting", "submitted", "waiting", "in progress"].some((k) => t.includes(k))) return "orange";
  if (["declined", "rejected", "error"].some((k) => t.includes(k))) return "red";
  if (["open", "assigned", "scheduled"].some((k) => t.includes(k))) return "blue";
  if (["locked"].some((k) => t.includes(k))) return "gray";
  return "gray";
}

// ─── Avatar ────────────────────────────────────────────────────────────────
export function Avatar({ initials, size = 40, className }: { initials: string; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7B6EE8] to-brand font-semibold text-white",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────
export function EmptyState({ icon, title, message, className }: { icon: React.ReactNode; title: string; message: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-8 py-14 text-center", className)}>
      <div className="mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-fill text-sub dark:bg-dfill dark:text-dsub">
        {icon}
      </div>
      <p className="text-[17px] font-semibold text-ink dark:text-white">{title}</p>
      <p className="mt-1 max-w-[240px] text-[15px] leading-snug text-sub dark:text-dsub">{message}</p>
    </div>
  );
}

// ─── Success check ─────────────────────────────────────────────────────────
export function SuccessCheck({ size = 76, tone = "green" }: { size?: number; tone?: "green" | "purple" }) {
  return (
    <div
      className="anim-pop-in flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: tone === "green" ? "rgba(52,199,89,0.14)" : "rgba(91,77,216,0.14)",
      }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: size * 0.72,
          height: size * 0.72,
          background: tone === "green" ? "#34C759" : "#5B4DD8",
          boxShadow: tone === "green" ? "0 8px 24px rgba(52,199,89,0.4)" : "0 8px 24px rgba(91,77,216,0.4)",
        }}
      >
        <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5 10 17.5 19 7" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="check-path" />
        </svg>
      </div>
    </div>
  );
}

// ─── Sheet ─────────────────────────────────────────────────────────────────
export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const [render, setRender] = useState(open);
  const [exiting, setExiting] = useState(false);
  React.useEffect(() => {
    if (open) {
      setRender(true);
      setExiting(false);
    } else if (render) {
      setExiting(true);
      const t = setTimeout(() => {
        setRender(false);
        setExiting(false);
      }, 260);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line
  if (!render) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <div
        className={cn("absolute inset-0 bg-black/40", exiting ? "anim-fade-out" : "anim-fade-in")}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative rounded-t-sheet bg-card pb-9 dark:bg-dcard",
          exiting ? "anim-sheet-down" : "anim-sheet-up"
        )}
      >
        <div className="flex justify-center pt-2.5">
          <div className="h-[5px] w-10 rounded-full bg-sep dark:bg-dsep" />
        </div>
        {title && (
          <div className="px-6 pt-4 text-center text-[20px] font-semibold text-ink dark:text-white">{title}</div>
        )}
        <div className="px-5 pt-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Toast host ────────────────────────────────────────────────────────────
export function ToastHost() {
  const { toastItem } = useApp();
  if (!toastItem) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[60px] z-[70] flex justify-center px-6">
      <div key={toastItem.id} className="anim-toast glass flex items-center gap-2.5 rounded-full px-4 py-2.5">
        {toastItem.kind === "success" && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ok">
            <Check size={12} strokeWidth={3.2} className="text-white" />
          </span>
        )}
        {toastItem.kind === "error" && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-bad text-[11px] font-bold text-white">!</span>
        )}
        {toastItem.kind === "info" && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-info text-[11px] font-bold text-white">i</span>
        )}
        <span className="text-[14px] font-semibold text-ink dark:text-white">{toastItem.text}</span>
      </div>
    </div>
  );
}

// ─── Offline banner ────────────────────────────────────────────────────────
export function OfflineBanner() {
  const { online } = useApp();
  if (online) return null;
  return (
    <div className="anim-rise relative z-30 mx-5 mb-1 flex items-center gap-2 rounded-xl bg-warn/12 px-3.5 py-2 dark:bg-warn/18">
      <WifiOff size={15} className="text-[#C47608] dark:text-[#FFB340]" />
      <span className="text-[13px] font-medium text-[#C47608] dark:text-[#FFB340]">
        You're offline — changes are saved locally and will sync later
      </span>
    </div>
  );
}

// ─── Form inputs ───────────────────────────────────────────────────────────
export function Field({
  label,
  error,
  children,
}: {
  label?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && <label className="mb-1.5 block px-1 text-[13px] font-medium text-sub dark:text-dsub">{label}</label>}
      {children}
      {error && <p className="mt-1 px-1 text-[13px] text-bad">{error}</p>}
    </div>
  );
}

export const inputCls =
  "w-full rounded-btn bg-fill px-4 py-[13px] text-[17px] text-ink outline-none transition-shadow placeholder:text-sub/70 focus:ring-2 focus:ring-brand/60 dark:bg-dfill dark:text-white dark:placeholder:text-dsub/70";

// ─── Skeletons ─────────────────────────────────────────────────────────────
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="skeleton h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3.5 w-2/3" />
        <div className="skeleton h-3 w-2/5" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-card bg-card p-5 card-shadow dark:bg-dcard">
      <div className="skeleton mb-3 h-4 w-1/3" />
      <div className="skeleton mb-2 h-8 w-2/3" />
      <div className="skeleton h-3.5 w-1/2" />
    </div>
  );
}
