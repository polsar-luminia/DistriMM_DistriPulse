import { lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ChatChart = lazy(() => import("./ChatChart"));

const markdownComponents = {
  h2: ({ children }) => <h3 className="text-sm font-bold text-slate-800 mt-3 mb-1">{children}</h3>,
  h3: ({ children }) => <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mt-3 mb-1">{children}</h4>,
  p: ({ children }) => <p className="text-[13px] leading-relaxed mb-1 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-slate-800">{children}</strong>,
  hr: () => <hr className="my-2 border-slate-200" />,
  ul: ({ children }) => <ul className="space-y-1.5 my-2">{children}</ul>,
  ol: ({ children }) => <ol className="space-y-1 my-2 list-none pl-0">{children}</ol>,
  li: ({ children, ordered, index }) => (
    ordered ? (
      <li className="flex gap-2 items-start text-[13px] leading-relaxed">
        <span className="shrink-0 text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full w-5 h-5 flex items-center justify-center mt-0.5">
          {(index ?? 0) + 1}
        </span>
        <span>{children}</span>
      </li>
    ) : (
      <li className="flex gap-2 items-start text-[13px] leading-relaxed">
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400 mt-[7px]" />
        <span>{children}</span>
      </li>
    )
  ),
  code: ({ inline, className, children }) => {
    const text = String(children).replace(/\n$/, "");

    // Detect ```chart JSON blocks and render inline Recharts
    if (!inline && (className === "language-chart" || className === "language-Chart")) {
      try {
        const chartData = JSON.parse(text);
        if (chartData?.type && chartData?.data) {
          return (
            <Suspense fallback={<div className="h-[280px] bg-slate-50 rounded-xl animate-pulse my-3" />}>
              <ChatChart {...chartData} />
            </Suspense>
          );
        }
      } catch { /* invalid JSON — fall through to code block */ }
    }

    return inline !== false && !text.includes("\n") ? (
      <code className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium">
        {children}
      </code>
    ) : (
      <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 my-2 text-[11px] font-mono overflow-x-auto">
        <code>{children}</code>
      </pre>
    );
  },
  pre: ({ children }) => <>{children}</>,
};

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const isError = message.isError;

  return (
    <div className={cn("flex gap-2.5 items-start", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-indigo-100 text-indigo-600"
            : isError
              ? "bg-rose-100 text-rose-600"
              : "bg-gradient-to-br from-emerald-400 to-teal-500 text-white"
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div
        className={cn(
          "rounded-2xl text-sm leading-relaxed",
          isUser
            ? "max-w-[80%] bg-indigo-600 text-white rounded-tr-sm px-4 py-2.5"
            : isError
              ? "max-w-[85%] bg-rose-50 text-rose-700 border border-rose-200 rounded-tl-sm px-4 py-2.5"
              : "max-w-[85%] bg-white text-slate-700 border border-slate-200 rounded-tl-sm px-4 py-3 shadow-sm"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="max-w-none">
            <ReactMarkdown
              rehypePlugins={[rehypeSanitize]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        <p className={cn("text-[10px] mt-1", isUser ? "text-indigo-200" : "text-slate-400")}>
          {message.timestamp?.toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
