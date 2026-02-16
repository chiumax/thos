"use client";

/**
 * Main chat interface for the thos dashboard.
 *
 * Composes {@link StatusBar}, a scrollable message list ({@link Message}
 * and {@link ControlRequest} cards), and an input bar. The submit button
 * text toggles between "Spawn" (when idle/done) and "Send" (when an
 * agent session is active). Auto-scrolls on new messages.
 *
 * A toggle in the top-right switches between the processed chat view
 * and a raw JSON view of all Claude NDJSON messages.
 *
 * Receives all data and callbacks via props — the parent page component
 * owns the WebSocket hook and orchestrates multiple agents.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentStatus, ChatMessage, ClaudeMessage } from "@/lib/types";
import { condenseMessages } from "@/lib/condense-messages";
import { StatusBar } from "./status-bar";
import { Message } from "./message";
import { ControlRequest } from "./control-request";
import { UserQuestion } from "./user-question";
import { CondensedToolGroup } from "./condensed-tool-group";
import { Button } from "@/components/ui/button";

export function Chat({
  connected,
  loading,
  status,
  messages,
  rawMessages,
  onSendMessage,
  onSpawnAgent,
  onRespondToControl,
  onRespondToUserQuestion,
  showTasks,
  onToggleTasks,
  onToggleSidebar,
}: {
  connected: boolean;
  loading?: boolean;
  status: AgentStatus;
  messages: ChatMessage[];
  rawMessages: ClaudeMessage[];
  onSendMessage: (content: string) => void;
  onSpawnAgent: (prompt: string) => void;
  onRespondToControl: (requestId: string, allow: boolean) => void;
  onRespondToUserQuestion: (requestId: string, answers: Record<string, string>) => void;
  showTasks?: boolean;
  onToggleTasks?: () => void;
  onToggleSidebar?: () => void;
}) {
  const [input, setInput] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, rawMessages, showRaw]);

  const displayItems = useMemo(() => condenseMessages(messages), [messages]);
  const isActive = status === "connected" || status === "thinking";
  const isArchived = status === "done" || status === "disconnected" || status === "error";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    if (isActive) {
      onSendMessage(trimmed);
    } else {
      onSpawnAgent(trimmed);
    }
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <StatusBar
        connected={connected}
        status={status}
        showRaw={showRaw}
        onToggleRaw={() => setShowRaw((v) => !v)}
        showTasks={showTasks}
        onToggleTasks={onToggleTasks}
        onToggleSidebar={onToggleSidebar}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex gap-1">
              <div className="size-2 rounded-full bg-muted-foreground/40 animate-pulse" />
              <div className="size-2 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
              <div className="size-2 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-muted-foreground">
              {connected ? "Loading messages..." : "Connecting..."}
            </span>
          </div>
        ) : showRaw ? (
          rawMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No raw messages yet
            </div>
          ) : (
            <div className="space-y-1">
              {rawMessages.map((msg, i) => (
                <RawMessage key={i} message={msg} index={i} />
              ))}
            </div>
          )
        ) : (
          <>
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Type a prompt to spawn a Claude agent
              </div>
            )}
            {displayItems.map((item) => {
              if (item.kind === "condensed") {
                return <CondensedToolGroup key={item.id} group={item} />;
              }
              const msg = item.message;
              return msg.userQuestion ? (
                <UserQuestion
                  key={msg.id}
                  message={msg}
                  onRespond={onRespondToUserQuestion}
                />
              ) : msg.controlRequest ? (
                <ControlRequest
                  key={msg.id}
                  message={msg}
                  onRespond={onRespondToControl}
                />
              ) : (
                <Message key={msg.id} message={msg} />
              );
            })}
          </>
        )}
      </div>

      {isArchived && messages.length > 0 ? (
        <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
          This session has ended
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex gap-2 border-t px-2 py-2 md:px-4 md:py-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isActive ? "Send a follow-up..." : "Enter a prompt to spawn agent..."}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" disabled={!connected || !input.trim()}>
            {isActive ? "Send" : "Spawn"}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Badge color per Claude NDJSON message type. */
const TYPE_COLORS: Record<string, string> = {
  system: "text-yellow-500",
  assistant: "text-blue-400",
  result: "text-green-500",
  control_request: "text-orange-400",
  keep_alive: "text-muted-foreground",
};

function RawMessage({ message, index }: { message: ClaudeMessage; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const subtype = (message as { subtype?: string }).subtype;
  const typeLabel = subtype ? `${message.type}/${subtype}` : message.type;
  const colorClass = TYPE_COLORS[message.type] ?? "text-muted-foreground";

  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-muted-foreground w-6 shrink-0 text-right">{index}</span>
        <span className={colorClass}>{typeLabel}</span>
        <span className="text-muted-foreground">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <pre className="ml-10 overflow-x-auto rounded bg-muted/30 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
          {JSON.stringify(message, null, 2)}
        </pre>
      )}
    </div>
  );
}
