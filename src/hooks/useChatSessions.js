import { useState, useEffect, useCallback, useRef } from "react";
import {
  getChatSessions,
  createChatSession,
  updateChatSessionTitle,
  deleteChatSession,
  getChatMessages,
  saveChatMessage,
  searchChatSessions,
} from "../services/chatSessionService";

function transformMessages(dbMessages) {
  return dbMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.created_at),
    isError: m.is_error || false,
  }));
}

export function useChatSessions(userId) {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);

  const searchTimeoutRef = useRef(null);
  const fetchRequestIdRef = useRef(0);
  const loadSessionRequestIdRef = useRef(0);

  // ─── Load sessions on mount ───
  const refreshSessions = useCallback(async () => {
    if (!userId) return;
    const requestId = ++fetchRequestIdRef.current;
    try {
      const { data } = await getChatSessions(userId);
      if (requestId !== fetchRequestIdRef.current) return;
      setSessions(data || []);
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      if (import.meta.env.DEV)
        console.error("[useChatSessions] Error refreshing sessions:", err);
    } finally {
      if (requestId === fetchRequestIdRef.current) setLoadingSessions(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (userId) {
      refreshSessions().then(() => {
        if (cancelled) return;
      });
    }
    return () => {
      cancelled = true;
    };
  }, [userId, refreshSessions]);

  // ─── Create new session ───
  // Returns { sessionId, dbId } so callers can use the DB id immediately
  // without waiting for activeSession state to update.
  const startNewSession = useCallback(async () => {
    if (!userId) return null;
    const sessionId = crypto.randomUUID();
    const { data } = await createChatSession(userId, sessionId);
    if (data) {
      setActiveSession(data);
      // Prepend to sessions list
      setSessions((prev) => [data, ...prev]);
      return { sessionId: data.session_id, dbId: data.id };
    }
    return { sessionId, dbId: null };
  }, [userId]);

  // ─── Load existing session messages ───
  const loadSession = useCallback(async (session) => {
    const requestId = ++loadSessionRequestIdRef.current;
    setLoadingMessages(true);
    setActiveSession(session);
    try {
      const { data } = await getChatMessages(session.id);
      if (requestId !== loadSessionRequestIdRef.current) return [];
      const messages = transformMessages(data || []);
      setLoadingMessages(false);
      return messages;
    } catch (err) {
      if (requestId !== loadSessionRequestIdRef.current) return [];
      if (import.meta.env.DEV)
        console.error("[useChatSessions] Error loading messages:", err);
      setLoadingMessages(false);
      return [];
    }
  }, []);

  // ─── Persist a message (fire-and-forget) ───
  // Accepts optional sessionDbId override for when activeSession state hasn't updated yet
  const persistMessage = useCallback(
    async (role, content, isError = false, sessionDbId = null) => {
      const dbId = sessionDbId || activeSession?.id;
      if (!dbId) return;
      try {
        await saveChatMessage(dbId, role, content, isError);
      } catch (err) {
        if (import.meta.env.DEV)
          console.error("[useChatSessions] Error persisting message:", err);
      }
    },
    [activeSession],
  );

  // ─── Auto-title from first user message ───
  const autoTitle = useCallback(
    async (firstUserMessage) => {
      if (!activeSession) return;
      const sessionId = activeSession.session_id;
      const title =
        firstUserMessage.substring(0, 80).trim() || "Nueva conversacion";
      await updateChatSessionTitle(sessionId, title);
      setActiveSession((prev) => (prev ? { ...prev, title } : prev));
      setSessions((prev) =>
        prev.map((s) => (s.session_id === sessionId ? { ...s, title } : s)),
      );
    },
    [activeSession],
  );

  // ─── Delete session ───
  const removeSession = useCallback(
    async (sessionId) => {
      const { success } = await deleteChatSession(sessionId);
      if (success) {
        setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
        if (activeSession?.session_id === sessionId) {
          setActiveSession(null);
        }
      }
      return success;
    },
    [activeSession],
  );

  // ─── Search with debounce ───
  const performSearch = useCallback(
    async (query) => {
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }
      if (!userId) return;
      const { data } = await searchChatSessions(userId, query);
      setSearchResults(data || []);
    },
    [userId],
  );

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, performSearch]);

  return {
    sessions,
    activeSession,
    setActiveSession,
    loadingSessions,
    loadingMessages,
    searchQuery,
    setSearchQuery,
    searchResults,
    startNewSession,
    loadSession,
    persistMessage,
    autoTitle,
    removeSession,
    refreshSessions,
  };
}
