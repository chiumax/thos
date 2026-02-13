"use client";

/**
 * Main chat interface for the thos dashboard.
 *
 * Composes {@link StatusBar}, a scrollable message list ({@link Message}
 * and {@link ControlRequest} cards), and an input bar. The submit button
 * text toggles between "Spawn" (when idle/done) and "Send" (when an
 * agent session is active). Auto-scrolls on new messages.
 *
 * Receives all data and callbacks via props — the parent page component
 * owns the WebSocket hook and orchestrates multiple agents.
 */

import { useEffect, useRef, useState } from "react";
import type { AgentStatus, ChatMessage } from "@/lib/types";
import { StatusBar } from "./status-bar";
import { Message } from "./message";
import { ControlRequest } from "./control-request";
import { UserQuestion } from "./user-question";
import { Button } from "@/components/ui/button";

export function Chat({
  connected,
  status,
  messages,
  onSendMessage,
  onSpawnAgent,
  onRespondToControl,
  onRespondToUserQuestion,
}: {
  connected: boolean;
  status: AgentStatus;
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  onSpawnAgent: (prompt: string) => void;
  onRespondToControl: (requestId: string, allow: boolean) => void;
  onRespondToUserQuestion: (requestId: string, answers: Record<string, string>) => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const isActive = status === "connected" || status === "thinking";

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
      <StatusBar connected={connected} status={status} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Type a prompt to spawn a Claude agent
          </div>
        )}
        {messages.map((msg) =>
          msg.userQuestion ? (
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
          )
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t px-4 py-3"
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
    </div>
  );
}
