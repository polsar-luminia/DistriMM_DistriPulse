/**
 * @fileoverview Chat Session Service - Supabase operations for DistriBot conversation persistence.
 * Handles CRUD for chat sessions and messages.
 * @module services/chatSessionService
 */

import { supabase } from "../lib/supabase";

// ============================================================================
// SESSION OPERATIONS
// ============================================================================

/**
 * Fetches all chat sessions for a user, ordered by most recent activity.
 * @param {string} userId - User UUID from auth
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
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
    if (import.meta.env.DEV) console.error("[chatSessionService] Error fetching sessions:", error);
    return { data: null, error };
  }
};

/**
 * Creates a new chat session.
 * @param {string} userId - User UUID
 * @param {string} sessionId - UUID string used as n8n sessionId
 * @param {string} [title='Nueva conversacion'] - Session title
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export const createChatSession = async (userId, sessionId, title = "Nueva conversacion") => {
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
    if (import.meta.env.DEV) console.error("[chatSessionService] Error creating session:", error);
    return { data: null, error };
  }
};

/**
 * Updates the title of a chat session.
 * @param {string} sessionId - The session_id text field (not the uuid PK)
 * @param {string} title - New title
 * @returns {Promise<{ success: boolean, error: Error|null }>}
 */
export const updateChatSessionTitle = async (sessionId, title) => {
  try {
    const { error } = await supabase
      .from("distrimm_chat_sessions")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("session_id", sessionId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[chatSessionService] Error updating session title:", error);
    return { success: false, error };
  }
};

/**
 * Deletes a chat session and all its messages (cascade).
 * @param {string} sessionId - The session_id text field
 * @returns {Promise<{ success: boolean, error: Error|null }>}
 */
export const deleteChatSession = async (sessionId) => {
  try {
    const { error } = await supabase
      .from("distrimm_chat_sessions")
      .delete()
      .eq("session_id", sessionId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[chatSessionService] Error deleting session:", error);
    return { success: false, error };
  }
};

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

/**
 * Fetches all messages for a chat session, ordered chronologically.
 * @param {string} chatSessionId - The uuid PK of the session
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
export const getChatMessages = async (chatSessionId) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_chat_messages")
      .select("*")
      .eq("chat_session_id", chatSessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[chatSessionService] Error fetching messages:", error);
    return { data: null, error };
  }
};

/**
 * Saves a single chat message. The DB trigger auto-updates the parent session's
 * message_count and last_message_at.
 * @param {string} chatSessionId - The uuid PK of the parent session
 * @param {'user'|'assistant'} role - Message sender role
 * @param {string} content - Message text
 * @param {boolean} [isError=false] - Whether this is an error message
 * @returns {Promise<{ data: Object|null, error: Error|null }>}
 */
export const saveChatMessage = async (chatSessionId, role, content, isError = false) => {
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
    if (import.meta.env.DEV) console.error("[chatSessionService] Error saving message:", error);
    return { data: null, error };
  }
};

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Searches chat sessions by title or message content using the DB RPC function.
 * @param {string} userId - User UUID
 * @param {string} query - Search text
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
export const searchChatSessions = async (userId, query) => {
  try {
    const { data, error } = await supabase
      .rpc("search_chat_sessions", {
        p_user_id: userId,
        p_query: query,
      });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[chatSessionService] Error searching sessions:", error);
    return { data: null, error };
  }
};
