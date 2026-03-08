/**
 * @fileoverview Chat input area — textarea with send button and loading state.
 * Extracted from ChatbotPage for readability.
 * @module components/chatbot/ChatInput
 */

import { useCallback } from "react";
import { Send, Loader2 } from "lucide-react";

/**
 * @param {object} props
 * @param {string} props.value - Current input value
 * @param {function} props.onChange - (value) => void
 * @param {function} props.onSend - () => void
 * @param {boolean} props.isLoading - Whether a message is being sent
 * @param {React.Ref} props.inputRef - Ref for the textarea element
 */
export default function ChatInput({ value, onChange, onSend, isLoading, inputRef }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );

  return (
    <div className="px-4 py-3 bg-white border border-slate-200 rounded-br-xl">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pregunta sobre la cartera..."
          disabled={isLoading}
          rows={1}
          className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5
            text-sm text-slate-700 placeholder:text-slate-400
            focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300
            disabled:opacity-50 disabled:cursor-not-allowed
            max-h-32 transition-colors"
          style={{ minHeight: "40px" }}
          onInput={(e) => {
            e.target.style.height = "40px";
            e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
          }}
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || isLoading}
          className="shrink-0 w-10 h-10 rounded-xl bg-indigo-600 text-white
            flex items-center justify-center
            hover:bg-indigo-700 active:scale-95
            disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed
            transition-all duration-150 shadow-sm"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 text-center">
        DistriBot puede cometer errores. Verifica datos importantes.
      </p>
    </div>
  );
}
