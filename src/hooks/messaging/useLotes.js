import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import {
  checkSendingHours,
  checkDailyLimit,
  createLote,
  getLotes,
  getLoteDetalle,
  getLoteById,
  triggerLoteProcessing,
  retryLoteFailed,
  cancelLote,
  getActiveInstance,
} from "../../services/messagingService";

export function useLotes() {
  const [lotes, setLotes] = useState([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [activeLote, setActiveLote] = useState(null);
  const [activeLoteDetalle, setActiveLoteDetalle] = useState([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  // Use ref for creatingLote to avoid stale closure
  const creatingLoteRef = useRef(false);
  const [creatingLote, setCreatingLote] = useState(false);

  const pollingRef = useRef(null);
  const pollingInFlightRef = useRef(false);
  const activeLoteRef = useRef(null);

  // Keep activeLoteRef in sync to avoid stale closures in callbacks
  activeLoteRef.current = activeLote;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const refreshLotes = useCallback(async () => {
    setLoadingLotes(true);
    try {
      const { data, error } = await getLotes(50);
      if (error) throw error;
      setLotes(data || []);
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("[useLotes] Error loading lotes:", err);
    } finally {
      setLoadingLotes(false);
    }
  }, []);

  const loadLoteDetalle = useCallback(async (loteId) => {
    setLoadingDetalle(true);
    try {
      const [loteRes, detalleRes] = await Promise.all([
        getLoteById(loteId),
        getLoteDetalle(loteId),
      ]);

      if (loteRes.error) throw loteRes.error;
      if (detalleRes.error) throw detalleRes.error;

      setActiveLote(loteRes.data);
      setActiveLoteDetalle(detalleRes.data || []);
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("[useLotes] Error loading lote detail:", err);
    } finally {
      setLoadingDetalle(false);
    }
  }, []);

  // Poll a lote's progress every 10s; isFetching guard prevents concurrent requests

  const startPolling = useCallback((loteId) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    pollingInFlightRef.current = false;

    const poll = async () => {
      // Skip if a previous poll is still in flight
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const { data } = await getLoteById(loteId);
        if (data) {
          setActiveLote(data);

          const { data: lotesData } = await getLotes(50);
          if (lotesData) setLotes(lotesData);

          // If lote is no longer in process, refresh detail and stop polling
          if (data.estado !== "pendiente" && data.estado !== "en_proceso") {
            const { data: detalleData } = await getLoteDetalle(loteId);
            if (detalleData) setActiveLoteDetalle(detalleData);

            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("[useLotes] Polling error:", err);
      } finally {
        pollingInFlightRef.current = false;
      }
    };

    // Poll immediately then every 10 seconds
    poll();
    pollingRef.current = setInterval(poll, 10000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const createAndSendLote = useCallback(
    async (loteHeader, destinatarios) => {
      // Use ref to avoid stale closure on creatingLote state
      if (creatingLoteRef.current) {
        return {
          success: false,
          loteId: null,
          error: "Ya se está creando un lote",
        };
      }

      // Pre-flight: verify active WhatsApp instance
      const { data: activeInstance } = await getActiveInstance();
      if (!activeInstance?.id) {
        return {
          success: false,
          loteId: null,
          error:
            "No hay instancia de WhatsApp activa. Conecta tu numero en la pestana WhatsApp.",
        };
      }

      // Solo recomendación si está fuera de horario — no bloquea el envío
      const hourCheck = checkSendingHours();
      if (!hourCheck.allowed && import.meta.env.DEV) {
        console.warn(
          "[useLotes] Envío de lote fuera de horario recomendado:",
          hourCheck.reason,
        );
      }

      const dailyCheck = await checkDailyLimit();
      if (!dailyCheck.allowed) {
        return {
          success: false,
          loteId: null,
          error: `Límite diario alcanzado: ${dailyCheck.sent}/${dailyCheck.limit} mensajes hoy.`,
        };
      }

      // Cap to remaining daily limit
      const remaining = dailyCheck.limit - dailyCheck.sent;
      const cappedDestinatarios = destinatarios.slice(0, remaining);

      if (cappedDestinatarios.length === 0) {
        return {
          success: false,
          loteId: null,
          error: "No hay destinatarios válidos",
        };
      }

      creatingLoteRef.current = true;
      setCreatingLote(true);
      try {
        // 1. Create lote in Supabase (for tracking/history)
        const { data: loteData, error: loteError } = await createLote(
          loteHeader,
          cappedDestinatarios,
        );

        if (loteError) throw loteError;

        const loteId = loteData.lote.id;
        const detalleRows = loteData.detalle || [];

        // 2. Build destinatarios with detalle IDs for n8n
        const destinatariosConIds = cappedDestinatarios.map((d, i) => ({
          ...d,
          detalle_id: detalleRows[i]?.id || null,
        }));

        // 3. Mark lote as en_proceso
        await supabase
          .from("distrimm_recordatorios_lote")
          .update({
            estado: "en_proceso",
            updated_at: new Date().toISOString(),
          })
          .eq("id", loteId);

        // 4. Trigger n8n webhook with ALL recipients (pass instance_id)
        const triggerResult = await triggerLoteProcessing(
          loteId,
          destinatariosConIds,
          activeInstance.id,
        );

        if (!triggerResult.success) {
          // Mark lote as failed so the user can see and retry
          await supabase
            .from("distrimm_recordatorios_lote")
            .update({ estado: "fallido", updated_at: new Date().toISOString() })
            .eq("id", loteId);
          throw triggerResult.error || new Error("Error al enviar mensajes");
        }

        // 5. Start polling for this lote's progress
        startPolling(loteId);

        // 6. Refresh lotes list
        await refreshLotes();

        return { success: true, loteId, error: null };
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("[useLotes] Error creating lote:", err);
        return { success: false, loteId: null, error: err.message };
      } finally {
        creatingLoteRef.current = false;
        setCreatingLote(false);
      }
    },
    [startPolling, refreshLotes],
  );

  const handleRetryFailed = useCallback(
    async (loteId) => {
      try {
        const { error } = await retryLoteFailed(loteId);
        if (error) throw error;

        startPolling(loteId);

        return { success: true, error: null };
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("[useLotes] Error retrying lote:", err);
        return { success: false, error: err.message };
      }
    },
    [startPolling],
  );

  const handleCancelLote = useCallback(
    async (loteId) => {
      try {
        const { error } = await cancelLote(loteId);
        if (error) throw error;

        await refreshLotes();
        // Use ref to avoid stale closure on activeLote
        if (activeLoteRef.current?.id === loteId) {
          await loadLoteDetalle(loteId);
        }

        return { success: true, error: null };
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("[useLotes] Error cancelling lote:", err);
        return { success: false, error: err.message };
      }
    },
    [refreshLotes, loadLoteDetalle],
  );

  return {
    lotes,
    loadingLotes,
    refreshLotes,
    activeLote,
    activeLoteDetalle,
    loadingDetalle,
    loadLoteDetalle,
    creatingLote,
    createAndSendLote,
    handleRetryFailed,
    handleCancelLote,
    startPolling,
    stopPolling,
  };
}
