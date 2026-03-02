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

import { useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { ArrowDown, ChevronDown, ChevronRight, ListTodo, MessageSquare, Terminal } from "lucide-react";
import type { AgentStatus, ChatMessage, ClaudeMessage, NotificationItem } from "@/lib/types";
import { condenseMessages } from "@/lib/condense-messages";
import { StatusBar } from "./status-bar";
import { AgentSummary } from "./agent-summary";
import { Message } from "./message";
import { ControlRequest } from "./control-request";
import { UserQuestion } from "./user-question";
import { CondensedToolGroup } from "./condensed-tool-group";
import { SlashCommandMenu, filterCommands, type SlashCommand } from "./slash-command-menu";
import { ContextUsageCard } from "./context-usage-card";
import { Button } from "@/components/ui/button";

export function Chat({
  connected,
  loading,
  status,
  agentLabel,
  messages,
  rawMessages,
  activeModel,
  selectedModel,
  onModelChange,
  onSendMessage,
  onSpawnAgent,
  onRespondToControl,
  onRespondToUserQuestion,
  onClearHistory,
  showTasks,
  onToggleTasks,
  showDiffs,
  onToggleDiffs,
  onToggleSidebar,
  showWorld,
  onToggleWorld,
  onOpenSettings,
  defaultSystemPrompt,
  notificationsEnabled,
  onToggleNotifications,
  notifications,
  onSelectNotification,
  onDismissNotification,
  onClearNotifications,
  onTestNotification,
}: {
  connected: boolean;
  loading?: boolean;
  status: AgentStatus;
  agentLabel?: string | null;
  messages: ChatMessage[];
  rawMessages: ClaudeMessage[];
  activeModel?: string | null;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  onSendMessage: (content: string) => void;
  onSpawnAgent: (prompt: string, systemPrompt?: string) => void;
  onRespondToControl: (requestId: string, allow: boolean) => void;
  onRespondToUserQuestion: (requestId: string, answers: Record<string, string>) => void;
  onClearHistory?: () => void;
  showTasks?: boolean;
  onToggleTasks?: () => void;
  showDiffs?: boolean;
  onToggleDiffs?: () => void;
  onToggleSidebar?: () => void;
  showWorld?: boolean;
  onToggleWorld?: () => void;
  onOpenSettings?: () => void;
  defaultSystemPrompt?: string;
  notificationsEnabled?: boolean;
  onToggleNotifications?: () => void;
  notifications?: NotificationItem[];
  onSelectNotification?: (agentId: string, notificationId: string) => void;
  onDismissNotification?: (id: string) => void;
  onClearNotifications?: () => void;
  onTestNotification?: () => void;
}) {
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashHighlight, setSlashHighlight] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const parts = [defaultSystemPrompt?.trim(), systemPrompt.trim()].filter(Boolean);
      const finalSystemPrompt = parts.join("\n\n") || undefined;
      onSpawnAgent(trimmed, finalSystemPrompt);
      setSystemPrompt("");
      setShowSystemPrompt(false);
    }
    setInput("");
    setShowSlashMenu(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInput(value);

    if (value.startsWith("/")) {
      setShowSlashMenu(true);
      setSlashQuery(value.slice(1));
      setSlashHighlight(0);
    } else {
      setShowSlashMenu(false);
      setSlashQuery("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSlashMenu) return;
    const filtered = filterCommands(slashQuery);
    if (filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashHighlight((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashHighlight((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleCommandSelect(filtered[slashHighlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowSlashMenu(false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      setInput(`/${filtered[slashHighlight].name} `);
      setShowSlashMenu(false);
    }
  }

  function handleCommandSelect(command: SlashCommand) {
    setShowSlashMenu(false);
    setSlashQuery("");
    setInput("");

    if (command.clientSide) {
      if (command.name === "clear") {
        onClearHistory?.();
      } else if (command.name === "context") {
        setShowContext((v) => !v);
      }
      return;
    }

    const commandText = `/${command.name}`;
    if (isActive) {
      onSendMessage(commandText);
    } else {
      onSpawnAgent(commandText);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <StatusBar
        connected={connected}
        status={status}
        agentLabel={agentLabel}
        activeModel={activeModel}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        showRaw={showRaw}
        onToggleRaw={() => setShowRaw((v) => !v)}
        showTasks={showTasks}
        onToggleTasks={onToggleTasks}
        showDiffs={showDiffs}
        onToggleDiffs={onToggleDiffs}
        onToggleSidebar={onToggleSidebar}
        showWorld={showWorld}
        onToggleWorld={onToggleWorld}
        onOpenSettings={onOpenSettings}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={onToggleNotifications}
        notifications={notifications}
        onSelectNotification={onSelectNotification}
        onDismissNotification={onDismissNotification}
        onClearNotifications={onClearNotifications}
        onTestNotification={onTestNotification}
      />

      <AgentSummary rawMessages={rawMessages} />

      <div className="relative flex-1 overflow-hidden">
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
          <div className="h-full overflow-y-auto p-2 md:p-4 space-y-1">
            {rawMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No raw messages yet
              </div>
            ) : (
              rawMessages.map((msg, i) => (
                <RawMessage key={i} message={msg} index={i} />
              ))
            )}
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={displayItems}
            style={{ height: "100%" }}
            initialTopMostItemIndex={displayItems.length - 1}
            followOutput={(isAtBottom) => isAtBottom ? "smooth" : false}
            atBottomStateChange={setAtBottom}
            increaseViewportBy={200}
            itemContent={(_index, item) => (
              <div className="px-2 pb-2 md:px-4">
                {item.kind === "condensed" ? (
                  <CondensedToolGroup key={item.id} group={item} onSendMessage={onSendMessage} />
                ) : item.message.userQuestion ? (
                  <UserQuestion key={item.message.id} message={item.message} onRespond={onRespondToUserQuestion} />
                ) : item.message.controlRequest ? (
                  <ControlRequest key={item.message.id} message={item.message} onRespond={onRespondToControl} />
                ) : (
                  <Message key={item.message.id} message={item.message} onSendMessage={onSendMessage} />
                )}
              </div>
            )}
            components={{
              Header: () => <div className="h-2" />,
              Footer: showContext ? () => (
                <div className="px-2 pb-2 md:px-4">
                  <div className="flex flex-col gap-0.5 items-start">
                    <ContextUsageCard rawMessages={rawMessages} activeModel={activeModel} />
                  </div>
                </div>
              ) : undefined,
              EmptyPlaceholder: () => (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                  <Terminal className="size-10 opacity-30" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground/80">No agent selected</p>
                    <p className="mt-1 text-xs">Type a prompt below to spawn a Claude agent</p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
                    <div className="flex items-start gap-2 rounded-lg border p-3">
                      <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <div>
                        <p className="font-medium text-foreground/80">Chat</p>
                        <p className="mt-0.5">Send prompts and review tool calls in real time</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border p-3">
                      <ListTodo className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <div>
                        <p className="font-medium text-foreground/80">Tasks</p>
                        <p className="mt-0.5">Track work with a kanban board and delegate to agents</p>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            }}
          />
        )}
        {!atBottom && displayItems.length > 0 && !showRaw && !loading && (
          <button
            onClick={() => virtuosoRef.current?.scrollToIndex({ index: displayItems.length - 1, behavior: "smooth" })}
            className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground"
          >
            <ArrowDown className="size-3" />
            Latest
          </button>
        )}
      </div>

      {isArchived && messages.length > 0 ? (
        <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
          This session has ended
        </div>
      ) : (
        <div className="border-t">
          {/* Prompt templates — spawn mode only */}
          {!isActive && (
            <div className="flex flex-wrap gap-1.5 px-2 pt-2 md:px-4">
              {PROMPT_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => { setInput(t.prompt); inputRef.current?.focus(); }}
                  className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowSystemPrompt((v) => !v)}
                className="ml-auto flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {showSystemPrompt ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                System prompt
              </button>
            </div>
          )}

          {/* System prompt textarea — spawn mode only */}
          {!isActive && showSystemPrompt && (
            <div className="px-2 pt-1.5 md:px-4">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Optional system instructions (e.g. 'You are a code reviewer. Focus on security issues.')"
                rows={3}
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="relative flex gap-2 px-2 py-2 md:px-4 md:py-3"
          >
            {showSlashMenu && (
              <SlashCommandMenu
                query={slashQuery}
                highlightedIndex={slashHighlight}
                onSelect={handleCommandSelect}
                onHighlight={setSlashHighlight}
              />
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={isActive ? "Send a follow-up..." : "Enter a prompt to spawn agent..."}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" disabled={!connected || !input.trim()}>
              {isActive ? "Send" : "Spawn"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

const PROMPT_TEMPLATES = [
  { label: "Review code", prompt: "Review the recent changes and provide feedback on code quality, bugs, and improvements." },
  { label: "Write tests", prompt: "Write comprehensive tests for the recent changes." },
  { label: "Fix bug", prompt: "" },
  { label: "Refactor", prompt: "Refactor the codebase for better readability and maintainability." },
  { label: "Explain", prompt: "" },
];

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
