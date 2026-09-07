import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, SendHorizontal, Sparkles } from "lucide-react";
import { clearChatHistory, fetchChatHistory, streamChat } from "../aiApi";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history.data && !streaming) {
      setMessages(history.data.map((m) => ({ role: m.role, content: m.content })));
    }
  }, [history.data, streaming]);

  useEffect(() => {
    const viewport = viewportRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
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
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    await streamChat(message, {
      onDelta: (text) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + text };
          }
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
    <Card className="flex h-[620px] flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400" />
          AI Chat
        </CardTitle>
        <CardDescription>
          Streams answers grounded in your last 14 days of health data.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clear.mutate()}
            disabled={messages.length === 0 || streaming}
          >
            <Eraser />
            Clear
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full" ref={viewportRef}>
          <div className="flex flex-col gap-3 pr-3">
            {messages.length === 0 ? (
              <p className="pt-20 text-center text-sm text-muted-foreground">
                Ask anything about your health data — trends, sleep quality, training load…
              </p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "self-end rounded-br-sm bg-primary text-primary-foreground"
                      : "self-start rounded-bl-sm bg-muted text-foreground"
                  )}
                >
                  {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                </div>
              ))
            )}
            {error ? <p className="self-center text-xs text-destructive">{error}</p> : null}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="gap-2">
        <Input
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
        />
        <Button onClick={() => void send()} size="icon" disabled={streaming || !input.trim()}>
          <SendHorizontal />
        </Button>
      </CardFooter>
    </Card>
  );
}
