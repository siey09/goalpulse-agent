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
        onClick={onToggleOpen}
        className="fixed bottom-4 left-4 z-[80] rounded-full border border-sky-400/30 bg-sky-500 px-4 py-2 text-xs font-bold text-white shadow-2xl shadow-sky-500/25 transition hover:bg-sky-400"
      >
        Ask GoalPulse
      </button>

      {isOpen && (
        <div className="fixed bottom-20 left-4 z-[80] flex max-h-[560px] w-[380px] flex-col overflow-hidden rounded-[26px] border border-sky-400/25 bg-[#11100f]/95 shadow-2xl shadow-sky-500/20 backdrop-blur-xl ring-1 ring-white/10">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-sky-200/70">
                  GoalPulse Analyst Chat
                </p>
                <h2 className="mt-1 text-sm font-semibold text-white">Ask the audit agent</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-stone-300 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-stone-400">
              Deterministic analyst replies using the current signals, TxLINE replay audit,
              trap detector, reversal radar, and score reality checks.
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-2xl border p-3 text-xs leading-5 ${
                  message.role === "assistant"
                    ? "border-sky-400/15 bg-sky-400/10 text-sky-50"
                    : "ml-8 border-white/10 bg-white/5 text-stone-200"
                }`}
              >
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  {message.role === "assistant" ? "GoalPulse" : "You"}
                </p>
                {message.content}
              </div>
            ))}
            {isReplying && (
              <div className="rounded-2xl border border-sky-400/15 bg-sky-400/10 p-3 text-xs leading-5 text-sky-50">
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-400">GoalPulse</p>
                GoalPulse is thinking…
              </div>
            )}
          </div>

          <div className="border-t border-white/10 p-3">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(event) => onQuestionChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSend();
                }}
                placeholder="Ask about failed continuation patterns, reversals, score checks..."
                disabled={isReplying}
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-stone-500 focus:border-sky-400/40 disabled:opacity-50"
              />
              <button
                onClick={onSend}
                disabled={isReplying}
                className="rounded-full border border-sky-400/30 bg-sky-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
