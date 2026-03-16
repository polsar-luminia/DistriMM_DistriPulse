import { useState, useCallback, useRef } from "react";
import {
  sendWhatsAppMessage,
  logMessage,
  updateLogStatus,
  normalizePhone,
  resolveClientPhone,
  renderTemplate,
  buildInvoiceDetail,
  getClientPhones,
  checkSendingHours,
  checkDailyLimit,
  getClientesCarteraFiltrados,
} from "../../services/messagingService";

const randomDelay = (min, max) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min),
  );

// Inter-message delay: 1-2s spacing (Meta Cloud API)
const interRecipientDelay = () => randomDelay(1000, 2000);

export function useMessageSending({ markRemindersAsSent } = {}) {
  const [sendingState, setSendingState] = useState({
    active: false,
    progress: 0,
    total: 0,
    errors: 0,
    errorDetails: [],
    cancelled: false,
  });

  // Segmentation state
  const [segmentedClients, setSegmentedClients] = useState([]);
  const [loadingSegmentation, setLoadingSegmentation] = useState(false);

  const cancelRef = useRef(false);
  const isSendingRef = useRef(false);

  const sendMessage = useCallback(
    async ({ phone, message, clientName, tipo, nit, plantillaId, invoiceIds }) => {
      const hourCheck = checkSendingHours();
      if (!hourCheck.allowed) {
        return { success: false, error: hourCheck.reason };
      }

      // Log first, but don't let logging failures block the actual send
      let logEntry = null;
      try {
        const res = await logMessage({
          tipo,
          destinatarioNombre: clientName,
          destinatarioTelefono: phone,
          destinatarioNit: nit,
          plantillaId,
          mensajeRenderizado: message,
          estado: "pendiente",
          facturasIds: invoiceIds || [],
        });
        logEntry = res.data;
      } catch (logErr) {
        if (import.meta.env.DEV) console.error("[useMessageSending] logMessage failed:", logErr);
      }

      const { success, error } = await sendWhatsAppMessage({
        phone,
        message,
        clientName,
        tipo,
      });

      if (logEntry?.id) {
        try {
          await updateLogStatus(
            logEntry.id,
            success ? "enviado" : "fallido",
            error ? (error.message || String(error)) : null,
          );
        } catch (updateErr) {
          if (import.meta.env.DEV) console.error("[useMessageSending] updateLogStatus failed:", updateErr);
        }
      }

      if (success && tipo === "recordatorio" && invoiceIds?.length > 0 && markRemindersAsSent) {
        await markRemindersAsSent(invoiceIds);
      }

      return { success, error };
    },
    [markRemindersAsSent],
  );

  const sendBulk = useCallback(
    async (recipients) => {
      if (!recipients || recipients.length === 0) return;
      if (isSendingRef.current) return;
      isSendingRef.current = true;

      const hourCheck = checkSendingHours();
      if (!hourCheck.allowed) {
        setSendingState((prev) => ({
          ...prev,
          errorDetails: [hourCheck.reason],
        }));
        isSendingRef.current = false;
        return;
      }

      const dailyCheck = await checkDailyLimit();
      if (!dailyCheck.allowed) {
        setSendingState((prev) => ({
          ...prev,
          errorDetails: [
            `Límite diario alcanzado: ${dailyCheck.sent}/${dailyCheck.limit} mensajes hoy.`,
          ],
        }));
        isSendingRef.current = false;
        return;
      }

      const remaining = dailyCheck.limit - dailyCheck.sent;
      const capped = recipients.slice(0, remaining);

      cancelRef.current = false;
      setSendingState({
        active: true,
        progress: 0,
        total: capped.length,
        errors: 0,
        errorDetails: [],
        cancelled: false,
      });

      let errors = 0;
      const errorDetails = [];

      for (let i = 0; i < capped.length; i++) {
        if (cancelRef.current) {
          setSendingState((prev) => ({ ...prev, active: false, cancelled: true }));
          isSendingRef.current = false;
          return;
        }

        if (i > 0 && i % 5 === 0) {
          const recheck = checkSendingHours();
          if (!recheck.allowed) {
            setSendingState((prev) => ({
              ...prev,
              active: false,
              cancelled: true,
              errorDetails: [...prev.errorDetails, recheck.reason],
            }));
            isSendingRef.current = false;
            return;
          }
        }

        const recipient = capped[i];
        const { success, error } = await sendMessage(recipient);

        if (!success) {
          errors++;
          errorDetails.push(`${recipient.clientName}: ${error}`);
        }

        setSendingState((prev) => ({
          ...prev,
          progress: i + 1,
          errors,
          errorDetails: [...errorDetails],
        }));

        if (i < capped.length - 1) {
          await interRecipientDelay();
        }
      }

      setSendingState((prev) => ({ ...prev, active: false }));
      isSendingRef.current = false;
    },
    [sendMessage],
  );

  const cancelSending = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const fetchSegmentedClients = useCallback(async (filters) => {
    setLoadingSegmentation(true);
    try {
      const { data, error } = await getClientesCarteraFiltrados(filters);
      if (error) throw error;
      setSegmentedClients(data || []);
      return { data: data || [], error: null };
    } catch (err) {
      if (import.meta.env.DEV) console.error("[useMessageSending] Error fetching segmented clients:", err);
      setSegmentedClients([]);
      return { data: [], error: err };
    } finally {
      setLoadingSegmentation(false);
    }
  }, []);

  return {
    // Sending state & actions
    sendingState,
    sendMessage,
    sendBulk,
    cancelSending,

    // Segmentation
    segmentedClients,
    loadingSegmentation,
    fetchSegmentedClients,

    // Re-exported utilities
    normalizePhone,
    resolveClientPhone,
    renderTemplate,
    buildInvoiceDetail,
    getClientPhones,
    checkSendingHours,
    checkDailyLimit,
  };
}
