import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Bot,
  Loader2,
  RotateCcw,
  Sparkles,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { sileo } from "sileo";
import {
  sendChatMessage,
  clearChatMemory,
  getSuggestedQuestions,
} from "../services/chatbotService";
import { useAuth } from "../context/AuthContext";
import { useChatSessions } from "../hooks/useChatSessions";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmDialog from "../components/ConfirmDialog";
import ChatSidebar from "../components/chatbot/ChatSidebar";
import ChatMessage from "../components/chatbot/ChatMessage";
import ChatInput from "../components/chatbot/ChatInput";

const WELCOME_CONTENT =
  "Hola! Soy **DistriBot**, tu asesor CFO virtual experto en cartera. Consulto los datos en tiempo real. Puedo ayudarte con:\n\n" +
  "- **Resumen general** — cartera total, vencida vs vigente, % morosidad\n" +
  "- **Ranking morosos** — top clientes con mayor deuda vencida\n" +
  "- **Detalle por cliente** — facturas, saldos, dias mora de un cliente especifico\n" +
  "- **Aging de cartera** — distribucion por rangos de mora con montos\n" +
  "- **Por municipio** — distribucion geografica (62% de cobertura)\n" +
  "- **Indicadores** — DSO estimado, mora promedio, facturas criticas\n\n" +
  "Preguntame lo que necesites!";

const createWelcomeMessage = () => ({
  id: "welcome",
  role: "assistant",
  content: WELCOME_CONTENT,
  timestamp: new Date(),
});

const TypingIndicator = () => (
  <div className="flex gap-2.5 items-start">
    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
      <Bot size={14} />
    </div>
    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
        <span className="text-xs text-slate-400 ml-1">DistriBot pensando...</span>
      </div>
    </div>
  </div>
);

const SuggestionChips = ({ suggestions, onSelect, disabled }) => (
  <div className="flex flex-wrap gap-2 justify-center">
    {suggestions.map((s) => (
      <button
        key={s.label}
        onClick={() => onSelect(s.message)}
        disabled={disabled}
        className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-full
          text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700
          transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed
          active:scale-95 shadow-sm"
      >
        <Sparkles size={10} className="inline mr-1 -mt-0.5" />
        {s.label}
      </button>
    ))}
  </div>
);

const ScrollToBottomButton = ({ onClick, visible }) => {
  if (!visible) return null;
  return (
    <div className="sticky bottom-0 flex justify-center py-1.5 pointer-events-none z-10">
      <button
        onClick={onClick}
        className="pointer-events-auto bg-white/95 backdrop-blur-sm border border-slate-200 rounded-full
          px-3 py-1.5 text-xs text-slate-600 shadow-lg hover:bg-indigo-50 hover:text-indigo-600
          hover:border-indigo-200 transition-all flex items-center gap-1.5 font-medium"
      >
        <ChevronDown size={12} />
        Nuevos mensajes
      </button>
    </div>
  );
};

export default function ChatbotPage() {
  const { user } = useAuth();
  const [confirmProps, confirm] = useConfirm();
  const {
    sessions,
    activeSession,
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
  } = useChatSessions(user?.id);

  const [messages, setMessages] = useState(() => [createWelcomeMessage()]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isFirstMessageRef = useRef(true);

  const suggestions = getSuggestedQuestions();

  const scrollToBottom = useCallback((behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  }, []);

  useEffect(() => {
    const userMessageCount = messages.filter((m) => m.role === "user").length;
    isFirstMessageRef.current = userMessageCount === 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession]);

  const handleSend = useCallback(
    async (messageText) => {
      const text = (messageText || inputValue).trim();
      if (!text || isLoading) return;

      // Ensure we have an active session — prefer activeSession.session_id over state
      let currentSessionId = activeSession?.session_id || sessionId;
      let currentActiveSession = activeSession;

      if (!currentActiveSession) {
        const newSessionId = await startNewSession();
        if (!newSessionId) return;
        currentSessionId = newSessionId;
        setSessionId(newSessionId);
        // Store in sessionStorage for backward compat
        sessionStorage.setItem("distribot_session_id", newSessionId);
      }

      // Add user message to local state
      const userMsg = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputValue("");
      setIsLoading(true);

      setTimeout(() => inputRef.current?.focus(), 50);

      // Auto-title on first user message
      if (isFirstMessageRef.current) {
        isFirstMessageRef.current = false;
        autoTitle(text).catch((error) => {
          if (import.meta.env.DEV) console.error("[ChatbotPage] autoTitle failed:", error);
        });
      }

      // Persist user message (fire-and-forget with warning)
      persistMessage("user", text).catch(() => {
        sileo.warning("No se pudo guardar el mensaje en el historial");
      });

      try {
        const { data, error } = await sendChatMessage(currentSessionId, text);

        if (error) {
          const errorContent = `Error al comunicarse con DistriBot: ${error}`;
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "assistant",
              content: errorContent,
              timestamp: new Date(),
              isError: true,
            },
          ]);
          persistMessage("assistant", errorContent, true).catch(() => {});
          sileo.error({ title: "Error al comunicarse con DistriBot" });
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              role: "assistant",
              content: data,
              timestamp: new Date(),
            },
          ]);
          persistMessage("assistant", data).catch(() => {
            sileo.warning("No se pudo guardar la respuesta en el historial");
          });
        }
      } catch (err) {
        const errorContent = `Error inesperado: ${err.message}`;
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: errorContent,
            timestamp: new Date(),
            isError: true,
          },
        ]);
        persistMessage("assistant", errorContent, true).catch(() => {});
      } finally {
        setIsLoading(false);
      }
    },
    [inputValue, isLoading, sessionId, activeSession, startNewSession, autoTitle, persistMessage]
  );

  const handleNewConversation = useCallback(async () => {
    const oldSessionId = sessionId;
    const newId = await startNewSession();
    if (newId) {
      setSessionId(newId);
      sessionStorage.setItem("distribot_session_id", newId);
      setMessages([createWelcomeMessage()]);
      setInputValue("");
      isFirstMessageRef.current = true;
      sileo.success({ title: "Nueva conversacion iniciada" });
      setMobileSidebarOpen(false);
    }
    if (oldSessionId) {
      clearChatMemory(oldSessionId).catch((error) => {
        if (import.meta.env.DEV) console.error("[ChatbotPage] clearChatMemory failed:", error);
      });
    }
  }, [sessionId, startNewSession]);

  const handleSelectSession = useCallback(
    async (session) => {
      if (session.session_id === activeSession?.session_id) {
        setMobileSidebarOpen(false);
        return;
      }
      const loadedMessages = await loadSession(session);
      setSessionId(session.session_id);
      sessionStorage.setItem("distribot_session_id", session.session_id);
      setMessages(loadedMessages.length > 0 ? loadedMessages : [createWelcomeMessage()]);
      isFirstMessageRef.current = loadedMessages.filter((m) => m.role === "user").length === 0;
      setInputValue("");
      setMobileSidebarOpen(false);
      setTimeout(() => scrollToBottom("instant"), 100);
    },
    [activeSession, loadSession, scrollToBottom]
  );

  const handleDeleteSession = useCallback(
    async (sessionIdToDelete) => {
      const ok = await confirm({
        title: "Eliminar conversacion",
        message: "Esta accion eliminara la conversacion y todos sus mensajes. No se puede deshacer.",
        confirmText: "Eliminar",
        cancelText: "Cancelar",
        variant: "danger",
      });
      if (!ok) return;
      const success = await removeSession(sessionIdToDelete);
      if (success) {
        if (sessionId === sessionIdToDelete) {
          setSessionId(null);
          setMessages([createWelcomeMessage()]);
          isFirstMessageRef.current = true;
        }
        sileo.success({ title: "Conversacion eliminada" });
      }
    },
    [removeSession, sessionId, confirm]
  );

  const handleRetry = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      setMessages((prev) => {
        const idx = prev.length - 1;
        if (prev[idx]?.isError) {
          return prev.slice(0, idx);
        }
        return prev;
      });
      handleSend(lastUserMsg.content);
    }
  }, [messages, handleSend]);

  const hasOnlyWelcome = messages.length === 1 && messages[0].id === "welcome";
  const lastMessage = messages[messages.length - 1];
  const showRetry = lastMessage?.isError && !isLoading;

  return (
    <div className="flex h-[calc(100vh-8rem)] max-h-[900px]">
      {/* Desktop Sidebar */}
      <div
        className={cn("hidden md:flex flex-col bg-white border border-slate-200 rounded-l-xl shrink-0 transition-all duration-200 overflow-hidden",
          sidebarOpen ? "w-72" : "w-0 border-0"
        )}
      >
        {sidebarOpen && (
          <ChatSidebar
            sessions={sessions}
            activeSession={activeSession}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchResults={searchResults}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewConversation}
            onDeleteSession={handleDeleteSession}
            loading={loadingSessions}
          />
        )}
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white z-50 shadow-2xl md:hidden animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-700">Conversaciones</span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X size={16} />
              </button>
            </div>
            <ChatSidebar
              sessions={sessions}
              activeSession={activeSession}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchResults={searchResults}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewConversation}
              onDeleteSession={handleDeleteSession}
              loading={loadingSessions}
            />
          </div>
        </>
      )}

      {/* Chat Area */}
      <div className={cn("flex-1 flex flex-col min-w-0", !sidebarOpen && "rounded-l-xl")}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-tr-xl">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle (desktop) */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="hidden md:flex p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>

            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <PanelLeftOpen size={16} />
            </button>

            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-sm">
              <Bot size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                DistriBot CFO
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full uppercase tracking-wide">
                  AI
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                {isLoading ? (
                  <span className="text-amber-500 flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    Analizando...
                  </span>
                ) : (
                  "Asesor experto en cartera"
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleNewConversation}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Nueva conversacion"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50/50 border-x border-slate-200 relative"
        >
          {loadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-indigo-400" />
              <span className="ml-2 text-sm text-slate-400">Cargando conversacion...</span>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {isLoading && <TypingIndicator />}

              {showRetry && (
                <div className="flex justify-center">
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                      bg-white border border-slate-200 rounded-full text-slate-600
                      hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600
                      transition-all shadow-sm"
                  >
                    <RotateCcw size={12} />
                    Reintentar
                  </button>
                </div>
              )}

              <ScrollToBottomButton visible={showScrollButton} onClick={() => scrollToBottom()} />

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Suggestions (only when chat is fresh) */}
        {hasOnlyWelcome && !isLoading && (
          <div className="px-4 py-3 bg-slate-50/80 border-x border-slate-200">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center">
              Preguntas sugeridas
            </p>
            <SuggestionChips suggestions={suggestions} onSelect={handleSend} disabled={isLoading} />
          </div>
        )}

        {/* Input Area */}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={() => handleSend()}
          isLoading={isLoading}
          inputRef={inputRef}
        />
      </div>

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
