import { supabase } from "@/lib/supabase";

export function generateSessionId() {
  return crypto.randomUUID();
}

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

// Edge Function has a 100s timeout; supabase.functions.invoke does not support
// AbortSignal, so the Edge Function timeout is the effective limit.

export async function sendChatMessage(sessionId, message) {
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

    // Edge Function returns { output: "..." }
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
    return { data: null, error: "No se pudo conectar con el servidor. Verifica tu conexión." };
  }
}

// La memoria del chatbot vive en distrimm_chat_messages (Supabase).
// clearChatMemory es un no-op — el "reset" ocurre creando un nuevo sessionId.

export async function clearChatMemory(_sessionId) {
  return { success: true, error: null };
}

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
      label: "Top vendedores",
      message:
        "Cuales son los vendedores con mayor venta neta y margen en los ultimos 90 dias?",
    },
    {
      label: "Productos rentables",
      message:
        "Que productos tienen el mejor margen porcentual con ventas relevantes?",
    },
    {
      label: "Stock por marca",
      message:
        "Muestra el stock valorizado por marca en las bodegas confiables (1, 5 y 6)",
    },
    {
      label: "Aging de cartera",
      message:
        "Muestra la distribucion de la cartera por rangos de mora con montos y porcentajes",
    },
  ];
}
