"use client";

/**
 * Top bar showing the WS connection state (green/red dot) and the
 * current agent lifecycle status (idle, spawning, thinking, etc.).
 */

import { ListTodo, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  showRaw,
  onToggleRaw,
  showTasks,
  onToggleTasks,
  onToggleSidebar,
}: {
  connected: boolean;
  status: AgentStatus;
  showRaw?: boolean;
  onToggleRaw?: () => void;
  showTasks?: boolean;
  onToggleTasks?: () => void;
  onToggleSidebar?: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b px-2 py-2 text-xs md:px-4">
      {/* Left side */}
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="rounded p-1 transition-colors hover:bg-muted/50 md:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="size-4" />
          </button>
        )}
        <span className="text-muted-foreground font-semibold hidden md:inline">thos dashboard</span>
        <span className="text-muted-foreground font-semibold md:hidden">thos</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1.5 md:gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block size-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="hidden md:inline">
            {connected ? "ws connected" : "ws disconnected"}
          </span>
        </span>
        <span className="text-muted-foreground hidden md:inline">|</span>
        <span className="hidden md:inline">agent: {STATUS_LABELS[status]}</span>
        <span className="text-[10px] md:hidden">{STATUS_LABELS[status]}</span>
        <span className="text-muted-foreground hidden md:inline">|</span>
        <div className="flex items-center gap-1.5">
          {onToggleRaw && (
            <button
              onClick={onToggleRaw}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-mono transition-colors",
                showRaw
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {showRaw ? "RAW" : "raw"}
            </button>
          )}
          {onToggleTasks && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggleTasks}
              title="Toggle tasks"
              className={cn(showTasks && "text-primary")}
            >
              <ListTodo className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
