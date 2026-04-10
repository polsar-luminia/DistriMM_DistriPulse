import { supabase, fetchAllRows } from "../lib/supabase";

export const getChatSessions = async (userId) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[chatSessionService] Error fetching sessions:", error);
    return { data: null, error };
  }
};

export const createChatSession = async (
  userId,
  sessionId,
  title = "Nueva conversacion",
) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_chat_sessions")
      .insert({
        user_id: userId,
        session_id: sessionId,
        title,
        message_count: 0,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[chatSessionService] Error creating session:", error);
    return { data: null, error };
  }
};

export const updateChatSessionTitle = async (sessionId, title) => {
  try {
    const { error } = await supabase
      .from("distrimm_chat_sessions")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[chatSessionService] Error updating session title:",
        error,
      );
    return { success: false, error };
  }
};

export const deleteChatSession = async (sessionId) => {
  try {
    const { error } = await supabase
      .from("distrimm_chat_sessions")
      .delete()
      .eq("session_id", sessionId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[chatSessionService] Error deleting session:", error);
    return { success: false, error };
  }
};

export const getChatMessages = async (chatSessionId) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_chat_messages")
        .select("*")
        .eq("chat_session_id", chatSessionId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[chatSessionService] Error fetching messages:", error);
    return { data: null, error };
  }
};

// DB trigger auto-updates the parent session's message_count and last_message_at

export const saveChatMessage = async (
  chatSessionId,
  role,
  content,
  isError = false,
) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_chat_messages")
      .insert({
        chat_session_id: chatSessionId,
        role,
        content,
        is_error: isError,
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[chatSessionService] Error saving message:", error);
    return { data: null, error };
  }
};

export const searchChatSessions = async (userId, query) => {
  try {
    const { data, error } = await supabase.rpc("search_chat_sessions", {
      p_user_id: userId,
      p_query: query,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[chatSessionService] Error searching sessions:", error);
    return { data: null, error };
  }
};
