import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Trash2, LogOut, X } from "lucide-react";

const iconMap = {
  danger: { icon: Trash2, bg: "bg-rose-50", text: "text-rose-500", ring: "ring-rose-100" },
  warning: { icon: AlertTriangle, bg: "bg-amber-50", text: "text-amber-500", ring: "ring-amber-100" },
  logout: { icon: LogOut, bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-200" },
};

export default function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title = "Confirmar accion",
  message = "¿Estas seguro?",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const v = iconMap[variant] || iconMap.danger;
  const Icon = v.icon;

  const confirmColors =
    variant === "danger"
      ? "bg-rose-500 hover:bg-rose-600 focus:ring-rose-300 text-white"
      : variant === "logout"
        ? "bg-slate-700 hover:bg-slate-800 focus:ring-slate-300 text-white"
        : "bg-amber-500 hover:bg-amber-600 focus:ring-amber-300 text-white";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-navy-950/40 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden
          animate-in zoom-in-95 fade-in duration-200 outline-none"
      >
        <div className="px-6 pt-6 pb-4">
          {/* Icon */}
          <div className={cn("w-12 h-12 rounded-xl ring-4 flex items-center justify-center mx-auto mb-4", v.bg, v.ring)}>
            <Icon size={22} className={v.text} strokeWidth={1.8} />
          </div>

          {/* Title */}
          <h3 className="text-base font-bold text-navy-900 text-center">{title}</h3>

          {/* Message */}
          <p className="text-sm text-navy-400 text-center mt-1.5 leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-navy-600 bg-navy-50 rounded-xl
              hover:bg-navy-100 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-navy-200"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl active:scale-[0.98] transition-all focus:outline-none focus:ring-2",
              confirmColors
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
