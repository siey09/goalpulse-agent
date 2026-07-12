import { MessagesSquare, Send, X } from "lucide-react";

export interface AnalystChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnalystChatWidgetProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  messages: AnalystChatMessage[];
  question: string;
  onQuestionChange: (value: string) => void;
  onSend: () => void;
  isReplying: boolean;
}

/**
 * Shared between the Command Center and the classic dashboard so both
 * surfaces expose the same deterministic analyst chat instead of one
 * silently losing it - exactly what happened when Command Center became
 * the default and this widget's JSX, previously only reachable from the
 * classic dashboard's render branch, stopped rendering for anyone landing
 * on the bare URL.
 */
export function AnalystChatWidget({
  isOpen,
  onToggleOpen,
  onClose,
  messages,
  question,
  onQuestionChange,
  onSend,
  isReplying,
}: AnalystChatWidgetProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={isOpen ? "Close analyst chat" : "Ask GoalPulse"}
        className="fixed bottom-4 left-4 z-[80] flex items-center gap-2 rounded-full border border-info/30 bg-info-500 px-4 py-2.5 text-xs font-bold text-white shadow-2xl shadow-info-500/25 transition hover:bg-info"
      >
        <MessagesSquare className="h-4 w-4" aria-hidden="true" />
        Ask GoalPulse
      </button>

      {isOpen && (
        <div className="fixed bottom-20 left-4 z-[80] flex max-h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-info/25 bg-surface-1/95 shadow-2xl shadow-info-500/20 backdrop-blur-xl ring-1 ring-white/10">
          <div className="border-b border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-info-200/70">
                  GoalPulse Analyst Chat
                </p>
                <h2 className="mt-1 font-display text-sm font-bold text-white">Ask the audit agent</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close analyst chat"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-white/5 text-stone-300 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-stone-400">
              Deterministic analyst replies using the current signals, TxLINE replay audit,
              trap detector, reversal radar, and score reality checks.
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && !isReplying && (
              <p className="text-xs leading-5 text-stone-500">
                Ask about the latest signal, a failed-continuation pattern, reversal risk, or a
                score reality check - answers pull from live data only, no external model.
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-xl border p-3 text-xs leading-5 ${
                  message.role === "assistant"
                    ? "border-info/15 bg-info/10 text-info-100"
                    : "ml-8 border-border bg-white/5 text-stone-200"
                }`}
              >
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  {message.role === "assistant" ? "GoalPulse" : "You"}
                </p>
                {message.content}
              </div>
            ))}
            {isReplying && (
              <div className="rounded-xl border border-info/15 bg-info/10 p-3 text-xs leading-5 text-info-100">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">GoalPulse</p>
                <span className="inline-flex items-center gap-1">
                  GoalPulse is thinking
                  <span className="inline-flex gap-0.5">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-info-200 [animation-delay:-0.2s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-info-200 [animation-delay:-0.1s]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-info-200" />
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(event) => onQuestionChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSend();
                }}
                placeholder="Ask about failed continuation patterns, reversals, score checks..."
                aria-label="Ask GoalPulse a question"
                disabled={isReplying}
                className="min-w-0 flex-1 rounded-full border border-border bg-black/30 px-3.5 py-2 text-xs text-white outline-none placeholder:text-stone-500 focus:border-info/40 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={onSend}
                disabled={isReplying}
                aria-label="Send question"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-info/30 bg-info-500 text-white transition hover:bg-info disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
