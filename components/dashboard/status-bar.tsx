"use client";

/**
 * Top bar showing the WS connection state (green/red dot), the current
 * agent lifecycle status, active model name, and a model selector dropdown.
 */

import { useState } from "react";
import { Bell, GitCompareArrows, ListTodo, Menu, Settings, TreePine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tip";
import { NotificationInbox } from "./notification-inbox";
import { ModelSelector } from "./model-selector";
import { cn } from "@/lib/utils";
import type { AgentStatus, NotificationItem } from "@/lib/types";

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
  agentLabel,
  activeModel,
  selectedModel,
  onModelChange,
  showRaw,
  onToggleRaw,
  showTasks,
  onToggleTasks,
  showDiffs,
  onToggleDiffs,
  onToggleSidebar,
  showWorld,
  onToggleWorld,
  onOpenSettings,
  notificationsEnabled,
  onToggleNotifications,
  notifications,
  onSelectNotification,
  onDismissNotification,
  onClearNotifications,
  onTestNotification,
}: {
  connected: boolean;
  status: AgentStatus;
  agentLabel?: string | null;
  activeModel?: string | null;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  showRaw?: boolean;
  onToggleRaw?: () => void;
  showTasks?: boolean;
  onToggleTasks?: () => void;
  showDiffs?: boolean;
  onToggleDiffs?: () => void;
  onToggleSidebar?: () => void;
  showWorld?: boolean;
  onToggleWorld?: () => void;
  onOpenSettings?: () => void;
  notificationsEnabled?: boolean;
  onToggleNotifications?: () => void;
  notifications?: NotificationItem[];
  onSelectNotification?: (agentId: string, notificationId: string) => void;
  onDismissNotification?: (id: string) => void;
  onClearNotifications?: () => void;
  onTestNotification?: () => void;
}) {
  const [inboxOpen, setInboxOpen] = useState(false);

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;
  const isActive = status === "connected" || status === "thinking";

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
        {agentLabel && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <Tip text={agentLabel}><span className="truncate max-w-[150px] md:max-w-[250px] font-medium text-foreground/80">{agentLabel}</span></Tip>
          </>
        )}
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

        {/* Model display + selector */}
        {onModelChange && (
          <>
            <span className="text-muted-foreground hidden md:inline">|</span>
            <ModelSelector
              activeModel={activeModel}
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              isActive={isActive}
            />
          </>
        )}

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
          {onToggleDiffs && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggleDiffs}
              title="Toggle diffs"
              className={cn(showDiffs && "text-primary")}
            >
              <GitCompareArrows className="size-3.5" />
            </Button>
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
          {onToggleNotifications && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setInboxOpen((v) => !v)}
                title="Notifications"
                className={cn((inboxOpen || unreadCount > 0) && "text-primary")}
              >
                <Bell className="size-3.5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
              {inboxOpen && notifications && onSelectNotification && onDismissNotification && onClearNotifications && onToggleNotifications && (
                <NotificationInbox
                  notifications={notifications}
                  enabled={!!notificationsEnabled}
                  onToggleEnabled={onToggleNotifications}
                  onSelect={(agentId, notifId) => {
                    onSelectNotification(agentId, notifId);
                    setInboxOpen(false);
                  }}
                  onDismiss={onDismissNotification}
                  onClear={onClearNotifications}
                  onClose={() => setInboxOpen(false)}
                  onTestPush={onTestNotification}
                />
              )}
            </div>
          )}
          {onToggleWorld && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onToggleWorld}
              title="Agent world"
              className={cn(showWorld && "text-primary")}
            >
              <TreePine className="size-3.5" />
            </Button>
          )}
          {onOpenSettings && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={onOpenSettings}
              title="Settings"
            >
              <Settings className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
