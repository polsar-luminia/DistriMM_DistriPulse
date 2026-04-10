import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Hook that replaces window.confirm with a custom dialog.
 * Returns [ConfirmDialogProps, confirm(options)] tuple.
 *
 * Usage:
 *   const [dialogProps, confirm] = useConfirm();
 *   const ok = await confirm({ title: "...", message: "..." });
 *   if (ok) { ... }
 *   <ConfirmDialog {...dialogProps} />
 */
export function useConfirm() {
  const resolveRef = useRef(null);
  const [state, setState] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirmar",
    cancelText: "Cancelar",
    variant: "danger",
  });

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      // Resolve any pending promise with false before overwriting
      if (resolveRef.current) {
        resolveRef.current(false);
      }
      resolveRef.current = resolve;
      setState({
        open: true,
        title: options.title || "Confirmar",
        message: options.message || "¿Estas seguro?",
        confirmText: options.confirmText || "Confirmar",
        cancelText: options.cancelText || "Cancelar",
        variant: options.variant || "danger",
      });
    });
  }, []);

  const onConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  const onCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  // Resolve pending promise on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      resolveRef.current?.(false);
      resolveRef.current = null;
    };
  }, []);

  const dialogProps = {
    open: state.open,
    title: state.title,
    message: state.message,
    confirmText: state.confirmText,
    cancelText: state.cancelText,
    variant: state.variant,
    onConfirm,
    onCancel,
  };

  return [dialogProps, confirm];
}
