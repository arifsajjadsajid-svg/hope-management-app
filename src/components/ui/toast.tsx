'use client';

import * as React from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

type Toast = { id: number; tone: ToastTone; title: string; description?: string };

type ToastContextValue = {
  push: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TONE_STYLES: Record<ToastTone, { wrap: string; icon: React.ReactNode }> = {
  success: {
    wrap: 'border-emerald-200 bg-white',
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
  },
  error: { wrap: 'border-rose-200 bg-white', icon: <XCircle className="h-5 w-5 text-rose-600" /> },
  warning: {
    wrap: 'border-amber-200 bg-white',
    icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  },
  info: { wrap: 'border-royal-200 bg-white', icon: <Info className="h-5 w-5 text-royal-600" /> },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const counter = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = ++counter.current;
      setToasts((current) => [...current, { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description) => push({ tone: 'error', title, description }),
      warning: (title, description) => push({ tone: 'warning', title, description }),
      info: (title, description) => push({ tone: 'info', title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="no-print pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(380px,calc(100vw-2.5rem))] flex-col gap-2.5"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const style = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-elevated animate-in',
                style.wrap,
              )}
              role="status"
            >
              <span className="mt-0.5 shrink-0">{style.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-navy-900">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 break-words text-[13px] leading-relaxed text-slate-600">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
