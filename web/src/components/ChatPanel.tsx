import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearChatHistory, fetchChatHistory, streamChat } from "../aiApi";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPanel() {
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ["chatHistory"], queryFn: fetchChatHistory });
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history.data && !streaming) {
      setMessages(history.data.map((m) => ({ role: m.role, content: m.content })));
    }
  }, [history.data, streaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const clear = useMutation({
    mutationFn: clearChatHistory,
    onSuccess: () => {
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
    },
  });

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setError(null);
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "user", content: message }, { role: "assistant", content: "" }]);
    await streamChat(message, {
      onDelta: (text) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + text };
          return next;
        });
      },
      onDone: () => {
        setStreaming(false);
        queryClient.invalidateQueries({ queryKey: ["chatHistory"] });
      },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
          return prev;
        });
      },
    });
  }

  return (
    <section className="flex h-[560px] flex-col rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">AI Chat</h2>
        <button
          onClick={() => clear.mutate()}
          disabled={messages.length === 0 || streaming}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
        >
          Clear history
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="pt-16 text-center text-sm text-slate-500">
            Ask anything about your health data — trends, sleep quality, training load…
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-sky-600/80 text-white"
                  : "bg-slate-800 text-slate-200"
              }`}
            >
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
          ))
        )}
        {error ? <p className="text-center text-xs text-rose-400">{error}</p> : null}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-slate-800 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={streaming ? "Generating…" : "Ask about your data…"}
            disabled={streaming}
            className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <button
            onClick={() => void send()}
            disabled={streaming || !input.trim()}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
