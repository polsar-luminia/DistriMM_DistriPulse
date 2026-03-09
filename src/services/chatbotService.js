/**
 * @fileoverview DistriBot CFO Chatbot Service
 * Handles communication with the n8n AI Agent webhook for the CFO chat assistant
 * via the Supabase Edge Function proxy (proxy-n8n-chatbot).
 *
 * @module services/chatbotService
 */

import { supabase } from "@/lib/supabase";

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Generates a unique session ID for the chat.
 * @returns {string} UUID v4 session ID
 */
export function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Gets or creates a session ID from sessionStorage.
 * Persists across page navigations but resets on tab close.
 * @returns {string} Session ID
 */
export function getOrCreateSessionId() {
  const STORAGE_KEY = "distribot_session_id";
  try {
    let sessionId = sessionStorage.getItem(STORAGE_KEY);
    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem(STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    // sessionStorage can throw in private browsing or when quota is exceeded
    return generateSessionId();
  }
}

/**
 * Resets the chat session by generating a new session ID.
 * @returns {string} New session ID
 */
export function resetSession() {
  const STORAGE_KEY = "distribot_session_id";
  const newSessionId = generateSessionId();
  try {
    sessionStorage.setItem(STORAGE_KEY, newSessionId);
  } catch {
    // sessionStorage can throw in private browsing or when quota is exceeded
  }
  return newSessionId;
}

// ============================================================================
// CHAT COMMUNICATION
// ============================================================================

/**
 * Sends a message to the DistriBot CFO and returns the response.
 * Proxied through Supabase Edge Function (proxy-n8n-chatbot).
 * Client-side 90s timeout as safety net.
 *
 * @param {string} sessionId - Chat session ID for memory continuity
 * @param {string} message - User's message/question
 * @returns {Promise<{ data: string|null, error: string|null }>}
 */
export async function sendChatMessage(sessionId, message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const { data: result, error } = await supabase.functions.invoke(
      "proxy-n8n-chatbot",
      {
        body: {
          action: "sendMessage",
          sessionId,
          chatInput: message,
        },
      },
    );

    if (error) throw error;

    // n8n Chat Trigger returns { output: "..." } after the code node
    const output = result?.output || result?.text || result?.response || "";

    if (!output) {
      if (import.meta.env.DEV) console.warn("[chatbotService] Empty response from bot:", result);
      return {
        data: "Lo siento, no pude generar una respuesta. Intenta reformular tu pregunta.",
        error: null,
      };
    }

    return { data: output, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[chatbotService] Error sending message:", err);
    if (err.name === "AbortError") {
      return { data: null, error: "El servidor está tardando demasiado. Intenta de nuevo." };
    }
    return { data: null, error: "No se pudo conectar con el servidor. Verifica tu conexión." };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

/**
 * Clears the chat memory for a given session.
 * Memory is stored on the n8n server's Postgres (not Supabase), so we can't
 * delete it directly. Instead, resetting the session ID effectively starts
 * a fresh conversation since n8n indexes memory by session ID.
 * @param {string} _sessionId - Session to clear (unused, kept for API compat)
 * @returns {Promise<{ success: boolean, error: string|null }>}
 */
export async function clearChatMemory(_sessionId) {
  return { success: true, error: null };
}

// ============================================================================
// SUGGESTED QUESTIONS
// ============================================================================

/**
 * Returns a list of suggested quick questions for the chat.
 * @returns {Array<{ label: string, message: string }>}
 */
export function getSuggestedQuestions() {
  return [
    {
      label: "Resumen de cartera",
      message: "Dame un resumen general de la cartera actual",
    },
    {
      label: "Top morosos",
      message: "Cuales son los 10 clientes con mayor deuda vencida?",
    },
    {
      label: "Aging de cartera",
      message:
        "Muestra la distribucion de la cartera por rangos de mora con montos y porcentajes",
    },
    {
      label: "Facturas criticas",
      message:
        "Que facturas tienen mas de 90 dias de mora y saldo mayor a 5 millones?",
    },
    {
      label: "Por municipio",
      message: "Como se distribuye la cartera por municipio?",
    },
    {
      label: "Indicadores clave",
      message:
        "Calcula los indicadores clave: % morosidad, mora promedio y DSO estimado",
    },
  ];
}
