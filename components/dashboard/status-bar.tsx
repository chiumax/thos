"use client";

/**
 * Top bar showing the WS connection state (green/red dot), the current
 * agent lifecycle status, active model name, and a model selector dropdown.
 */

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, ChevronDown, GitCompareArrows, ListTodo, Menu, Settings, TreePine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tip";
import { NotificationInbox } from "./notification-inbox";
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

/** Curated list of common models for the dropdown. */
const MODEL_PRESETS = [
  { value: "", label: "Default (CLI)", description: "Use CLI default model" },
  { value: "claude-sonnet-4-20250514", label: "Sonnet 4", description: "Claude Sonnet 4" },
  { value: "claude-opus-4-20250514", label: "Opus 4", description: "Claude Opus 4" },
  { value: "qwen3-coder", label: "Qwen3 Coder", description: "Ollama — Qwen3 Coder" },
  { value: "devstral", label: "Devstral", description: "Ollama — Devstral" },
];

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  // Close dropdown on click-outside or Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setShowCustom(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [dropdownOpen]);

  // Focus custom input when it appears
  useEffect(() => {
    if (showCustom) customInputRef.current?.focus();
  }, [showCustom]);

  /** Shorten a model name for display (e.g. "claude-sonnet-4-20250514" → "sonnet-4"). */
  function shortModel(model: string): string {
    // Match known preset labels
    const preset = MODEL_PRESETS.find((p) => p.value === model);
    if (preset && preset.value) return preset.label;
    // Strip "claude-" prefix and date suffix for Claude models
    const m = model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
    return m || model;
  }

  const displayModel = activeModel ?? (selectedModel || null);
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
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono transition-colors",
                  "hover:bg-muted/80 text-muted-foreground",
                  dropdownOpen && "bg-muted"
                )}
                title={displayModel ? `Model: ${displayModel}` : "Select model for next spawn"}
              >
                <span className="max-w-[120px] truncate text-[10px] md:text-xs md:max-w-[180px]">
                  {displayModel ? shortModel(displayModel) : "model"}
                </span>
                <ChevronDown className="size-3 shrink-0" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-md border bg-popover p-1 shadow-md">
                  {isActive && activeModel && (
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-b mb-1">
                      Active: <span className="font-mono">{activeModel}</span>
                    </div>
                  )}
                  <div className="px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                    Next spawn
                  </div>
                  {MODEL_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => {
                        onModelChange(preset.value);
                        setDropdownOpen(false);
                        setShowCustom(false);
                      }}
                      className={cn(
                        "flex w-full flex-col rounded px-2 py-1.5 text-left transition-colors hover:bg-accent",
                        selectedModel === preset.value && "bg-accent"
                      )}
                    >
                      <span className="text-xs font-medium">{preset.label}</span>
                      <span className="text-[10px] text-muted-foreground">{preset.description}</span>
                    </button>
                  ))}
                  <div className="my-1 border-t" />
                  {showCustom ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = customInput.trim();
                        if (val) {
                          onModelChange(val);
                          setCustomInput("");
                          setShowCustom(false);
                          setDropdownOpen(false);
                        }
                      }}
                      className="px-2 py-1"
                    >
                      <input
                        ref={customInputRef}
                        type="text"
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        placeholder="e.g. llama3.3:70b"
                        className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => setShowCustom(true)}
                      className="flex w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent"
                    >
                      Custom model...
                    </button>
                  )}
                </div>
              )}
            </div>
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
