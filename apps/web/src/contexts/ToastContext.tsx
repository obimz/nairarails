/**
 * ToastContext.tsx — lightweight toast notification system.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.error("Something went wrong");
 *   toast.success("Order created");
 *   toast.info("Refreshing…");
 *   toast.warn("Check your connection");
 *
 * ToastProvider must wrap the app (done in main.tsx).
 * ToastContainer is rendered inside ToastProvider.
 */

import React from "react";
import { CheckCircle, AlertTriangle, Info, X, XCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warn" | "info";

export interface Toast {
  id:       string;
  variant:  ToastVariant;
  title?:   string | undefined;
  message:  string;
}

interface ToastContextValue {
  success: (message: string, title?: string) => void;
  error:   (message: string, title?: string) => void;
  warn:    (message: string, title?: string) => void;
  info:    (message: string, title?: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = React.createContext<ToastContextValue | null>(null);

// ─── Style maps ───────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, {
  bg:     string;
  border: string;
  bar:    string;
  icon:   React.ReactNode;
}> = {
  success: {
    bg:     "rgba(22,169,123,0.10)",
    border: "rgba(22,169,123,0.30)",
    bar:    "#16A97B",
    icon:   <CheckCircle className="w-4 h-4 shrink-0" style={{ color: "#16A97B" }} />,
  },
  error: {
    bg:     "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.30)",
    bar:    "#ef4444",
    icon:   <XCircle className="w-4 h-4 shrink-0" style={{ color: "#ef4444" }} />,
  },
  warn: {
    bg:     "rgba(245,158,11,0.10)",
    border: "rgba(245,158,11,0.30)",
    bar:    "#f59e0b",
    icon:   <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#f59e0b" }} />,
  },
  info: {
    bg:     "rgba(100,116,139,0.10)",
    border: "rgba(100,116,139,0.25)",
    bar:    "#64748b",
    icon:   <Info className="w-4 h-4 shrink-0" style={{ color: "#94a3b8" }} />,
  },
};

// ─── Single toast item ────────────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = React.useState(false);

  // Mount → slide in
  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const s = VARIANT_STYLES[toast.variant];

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="relative overflow-hidden rounded-xl shadow-2xl transition-all duration-300"
      style={{
        background:   s.bg,
        border:       `1px solid ${s.border}`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        opacity:      visible ? 1 : 0,
        transform:    visible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)",
        maxWidth:     "380px",
        minWidth:     "280px",
        boxShadow:    "0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* Accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: s.bar }}
      />

      <div className="flex items-start gap-3 px-4 py-3.5 pt-4">
        {/* Icon */}
        <div className="mt-0.5">{s.icon}</div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          {toast.title && (
            <p
              className="text-xs font-semibold mb-0.5 truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {toast.title}
            </p>
          )}
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {toast.message}
          </p>
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 mt-0.5 p-0.5 rounded transition-opacity hover:opacity-70 cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Container rendered at the top of the viewport ───────────────────────────

function ToastContainer({ toasts, dismiss }: {
  toasts:  Toast[];
  dismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  success: 4000,
  error:   7000,
  warn:    6000,
  info:    4500,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = React.useCallback((variant: ToastVariant, message: string, title?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, variant, message, title }]);

    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS[variant]);
    timers.current.set(id, timer);
  }, [dismiss]);

  const value = React.useMemo<ToastContextValue>(() => ({
    success: (msg, title) => push("success", msg, title),
    error:   (msg, title) => push("error",   msg, title),
    warn:    (msg, title) => push("warn",     msg, title),
    info:    (msg, title) => push("info",     msg, title),
  }), [push]);

  // Clean up all timers on unmount
  React.useEffect(() => {
    const t = timers.current;
    return () => { t.forEach((timer) => clearTimeout(timer)); };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
