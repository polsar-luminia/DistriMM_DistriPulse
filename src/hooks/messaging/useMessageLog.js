/**
 * @fileoverview Message log hook for WhatsApp messaging history.
 * Handles log fetching, pagination, and search.
 * @module hooks/messaging/useMessageLog
 */

import { useState, useCallback } from "react";
import { getMessageLog } from "../../services/messagingService";

/**
 * Gestiona el historial de mensajes enviados por WhatsApp.
 * @returns {{
 *   messageLog: Array,
 *   logCount: number,
 *   loadingLog: boolean,
 *   refreshLog: (filters?: object) => Promise<void>
 * }}
 */
export function useMessageLog() {
  const [messageLog, setMessageLog] = useState([]);
  const [logCount, setLogCount] = useState(0);
  const [loadingLog, setLoadingLog] = useState(false);

  const refreshLog = useCallback(async (filters = {}) => {
    setLoadingLog(true);
    try {
      const { data, count, error } = await getMessageLog({
        limit: 100,
        ...filters,
      });
      if (error) throw error;
      setMessageLog(data || []);
      setLogCount(count || 0);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[useMessageLog] Error loading log:", err);
    } finally {
      setLoadingLog(false);
    }
  }, []);

  return {
    messageLog,
    logCount,
    loadingLog,
    refreshLog,
  };
}
