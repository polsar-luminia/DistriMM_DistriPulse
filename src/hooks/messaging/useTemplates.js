import { useState, useEffect, useCallback } from "react";
import {
  getTemplates,
  saveTemplate as saveTemplateSvc,
  deleteTemplate as deleteTemplateSvc,
} from "../../services/messagingService";

export function useTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const loadTemplates = useCallback(async (tipo) => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await getTemplates(tipo);
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[useTemplates] Error loading templates:", err);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  const saveTemplate = useCallback(
    async (template) => {
      const { data, error } = await saveTemplateSvc(template);
      if (!error) {
        await loadTemplates();
      }
      return { data, error };
    },
    [loadTemplates],
  );

  const removeTemplate = useCallback(
    async (id) => {
      const { success, error } = await deleteTemplateSvc(id);
      if (success) {
        await loadTemplates();
      }
      return { success, error };
    },
    [loadTemplates],
  );

  // Load templates on mount with cancellation guard
  useEffect(() => {
    let cancelled = false;
    getTemplates()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setTemplates(data || []);
      })
      .catch((err) => {
        if (!cancelled && import.meta.env.DEV) console.error("[useTemplates] Initial load error:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    templates,
    loadingTemplates,
    loadTemplates,
    saveTemplate,
    removeTemplate,
  };
}
