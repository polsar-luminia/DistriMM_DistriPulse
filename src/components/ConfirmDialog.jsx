import { cn } from "@/lib/utils";
import { AlertTriangle, Trash2, LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const v = iconMap[variant] || iconMap.danger;
  const Icon = v.icon;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm rounded-2xl p-0 gap-0"
      >
        <DialogHeader className="px-6 pt-6 pb-4 space-y-0 text-center sm:text-center">
          {/* Icon */}
          <div
            className={cn(
              "w-12 h-12 rounded-xl ring-4 flex items-center justify-center mx-auto mb-4",
              v.bg,
              v.ring,
            )}
          >
            <Icon size={22} className={v.text} strokeWidth={1.8} />
          </div>

          {/* Title */}
          <DialogTitle className="text-base font-bold text-navy-900 text-center">
            {title}
          </DialogTitle>

          {/* Message */}
          <DialogDescription className="text-sm text-navy-400 text-center mt-1.5 leading-relaxed">
            {message}
          </DialogDescription>
        </DialogHeader>

        {/* Actions */}
        <DialogFooter className="flex flex-row gap-3 px-6 pb-6 sm:flex-row sm:justify-stretch">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-semibold text-navy-600 bg-navy-50 border-0 rounded-xl
              hover:bg-navy-100 active:scale-[0.98] transition-all"
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={onConfirm}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold rounded-xl active:scale-[0.98] transition-all text-white",
              variant === "danger" &&
                "bg-rose-500 hover:bg-rose-600 focus-visible:ring-rose-300",
              variant === "warning" &&
                "bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-300",
              variant === "logout" &&
                "bg-slate-700 hover:bg-slate-800 focus-visible:ring-slate-300",
            )}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
