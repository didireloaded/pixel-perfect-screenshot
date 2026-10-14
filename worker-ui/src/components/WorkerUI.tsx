import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function WorkerCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`worker-card ${className}`}>{children}</section>;
}
export function WorkerAction({
  children,
  onClick,
  disabled,
  secondary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`worker-action press ${secondary ? "secondary" : ""}`}
    >
      {children}
    </button>
  );
}
export function WorkerSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="worker-sheet"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="worker-sheet-handle" />
      <div className="worker-sheet-head">
        <h2 id={id}>{title}</h2>
        <button onClick={onClose} aria-label="Close sheet">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export const formatHours = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}h`;
export const formatTime = (time: number | undefined, zone: string) =>
  time === undefined
    ? "—:—"
    : new Date(time).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone,
      });
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="worker-empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
