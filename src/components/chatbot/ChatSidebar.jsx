/**
 * @fileoverview Chat sidebar — session list with search, new chat, and delete.
 * Extracted from ChatbotPage for readability.
 * @module components/chatbot/ChatSidebar
 */

import { Search, MessageSquare, Plus, Trash2, X } from "lucide-react";
import { TIME_UNITS_MS } from "../../constants/thresholds";

function formatRelativeTime(date) {
  if (!date) return "";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / TIME_UNITS_MS.MINUTE);
  const diffHours = Math.floor(diffMs / TIME_UNITS_MS.HOUR);
  const diffDays = Math.floor(diffMs / TIME_UNITS_MS.DAY);

  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return "Ayer";
  if (diffDays < TIME_UNITS_MS.WEEK_DAYS) return `Hace ${diffDays} dias`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/**
 * @param {object} props
 * @param {Array} props.sessions - All chat sessions
 * @param {object|null} props.activeSession - Currently active session
 * @param {string} props.searchQuery - Current search query
 * @param {function} props.setSearchQuery - Search query setter
 * @param {Array|null} props.searchResults - Filtered sessions (null = show all)
 * @param {function} props.onSelectSession - (session) => void
 * @param {function} props.onNewSession - () => void
 * @param {function} props.onDeleteSession - (sessionId) => void
 * @param {boolean} props.loading - Whether sessions are loading
 */
export default function ChatSidebar({
  sessions,
  activeSession,
  searchQuery,
  setSearchQuery,
  searchResults,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  loading,
}) {
  const displayList = searchResults !== null ? searchResults : sessions;

  return (
    <div className="flex flex-col h-full">
      {/* New conversation button */}
      <div className="p-3 border-b border-slate-200">
        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium
            bg-indigo-600 text-white rounded-lg hover:bg-indigo-700
            active:scale-[0.98] transition-all shadow-sm"
        >
          <Plus size={16} />
          Nueva conversacion
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar conversaciones..."
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg
              placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200
              focus:border-indigo-300 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-1.5" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs text-slate-400">
              {searchQuery ? "Sin resultados" : "No hay conversaciones previas"}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {displayList.map((session) => {
              const isActive = activeSession?.session_id === session.session_id;
              return (
                <div
                  key={session.session_id}
                  onClick={() => onSelectSession(session)}
                  className={`group flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? "bg-indigo-50 border border-indigo-200"
                      : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <MessageSquare
                    size={14}
                    className={`shrink-0 mt-0.5 ${isActive ? "text-indigo-500" : "text-slate-400"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-medium truncate ${
                        isActive ? "text-indigo-700" : "text-slate-700"
                      }`}
                    >
                      {session.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400">
                        {formatRelativeTime(session.last_message_at)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {session.message_count} msg
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.session_id);
                    }}
                    className="shrink-0 p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100
                      transition-all rounded hover:bg-rose-50"
                    title="Eliminar conversacion"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
