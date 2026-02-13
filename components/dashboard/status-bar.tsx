"use client";

/**
 * Top bar showing the WS connection state (green/red dot) and the
 * current agent lifecycle status (idle, spawning, thinking, etc.).
 */

import type { AgentStatus } from "@/lib/types";

/** Human-readable labels for each agent status. */
const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: "idle",
  spawning: "spawning...",
  connected: "connected",
  thinking: "thinking...",
  done: "done",
  disconnected: "disconnected",
  error: "error",
};

export function StatusBar({
  connected,
  status,
}: {
  connected: boolean;
  status: AgentStatus;
}) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2 text-xs">
      <span className="text-muted-foreground font-semibold">thos dashboard</span>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block size-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {connected ? "ws connected" : "ws disconnected"}
        </span>
        <span className="text-muted-foreground">|</span>
        <span>agent: {STATUS_LABELS[status]}</span>
      </div>
    </div>
  );
}
