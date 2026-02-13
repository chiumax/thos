"use client";

/**
 * Sidebar listing all active agents with status dots, truncated labels,
 * tmux session names, and a "+" button to spawn a new agent.
 */

import { Plus } from "lucide-react";
import type { AgentStatus } from "@/lib/types";
import type { AgentClientState } from "@/hooks/use-websocket";
import { cn } from "@/lib/utils";

/** Status dot color + optional pulse animation. */
const STATUS_DOT: Record<AgentStatus, string> = {
  idle: "bg-muted-foreground",
  spawning: "bg-yellow-500 animate-pulse",
  connected: "bg-green-500",
  thinking: "bg-blue-500 animate-pulse",
  done: "bg-muted-foreground",
  disconnected: "bg-orange-500 animate-pulse",
  error: "bg-red-500",
};

export function AgentSidebar({
  agents,
  agentOrder,
  activeAgentId,
  onSelect,
  onNewAgent,
}: {
  agents: Map<string, AgentClientState>;
  agentOrder: string[];
  activeAgentId: string | null;
  onSelect: (agentId: string | null) => void;
  onNewAgent: () => void;
}) {
  return (
    <div className="flex w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">agents</span>
        <button
          onClick={onNewAgent}
          className="rounded-md p-1 hover:bg-sidebar-accent transition-colors"
          aria-label="New agent"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto">
        {agentOrder.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No agents yet
          </div>
        )}
        {agentOrder.map((id) => {
          const agent = agents.get(id);
          if (!agent) return null;
          const isActive = id === activeAgentId;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition-colors",
                isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[agent.status])} />
                <span className="truncate">{agent.label || "new agent"}</span>
              </span>
              {agent.tmuxSession && (
                <span className="pl-4 text-[10px] text-muted-foreground truncate">
                  {agent.tmuxSession}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
