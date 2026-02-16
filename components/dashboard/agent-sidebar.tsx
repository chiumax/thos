"use client";

/**
 * Sidebar listing all agents with status dots, truncated labels,
 * tmux session names, and a "+" button to spawn a new agent.
 *
 * Split into two sections:
 * - **Active**: agents with status `spawning`, `connected`, or `thinking`.
 * - **Archived**: agents with status `done`, `disconnected`, or `error` (read-only).
 *
 * Right-click (or kebab icon) context menu supports: Rename, Kill, Clear History, Delete.
 * Rename swaps the label for an inline input.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { EllipsisVertical, Plus } from "lucide-react";
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

/** Statuses where the CLI is actively running and can be killed. */
const KILLABLE: Set<AgentStatus> = new Set(["spawning", "connected", "thinking"]);
/** Statuses considered archived (session ended, read-only). */
const ARCHIVED: Set<AgentStatus> = new Set(["done", "disconnected", "error"]);

interface ContextMenuState {
  agentId: string;
  x: number;
  y: number;
}

export function AgentSidebar({
  agents,
  agentOrder,
  activeAgentId,
  loading,
  onSelect,
  onNewAgent,
  onKill,
  onDelete,
  onRename,
  onClearHistory,
}: {
  agents: Map<string, AgentClientState>;
  agentOrder: string[];
  activeAgentId: string | null;
  loading?: boolean;
  onSelect: (agentId: string | null) => void;
  onNewAgent: () => void;
  onKill: (agentId: string) => void;
  onDelete: (agentId: string) => void;
  onRename: (agentId: string, label: string) => void;
  onClearHistory: (agentId: string) => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Split agents into active and archived
  const activeIds = agentOrder.filter((id) => {
    const a = agents.get(id);
    return a && !ARCHIVED.has(a.status);
  });
  const archivedIds = agentOrder.filter((id) => {
    const a = agents.get(id);
    return a && ARCHIVED.has(a.status);
  });

  // Close context menu on click-outside or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCtxMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ctxMenu]);

  const openMenu = useCallback((agentId: string, x: number, y: number) => {
    setCtxMenu({ agentId, x, y });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, agentId: string) => {
    e.preventDefault();
    openMenu(agentId, e.clientX, e.clientY);
  }, [openMenu]);

  const handleMenuButton = useCallback((e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    openMenu(agentId, rect.right, rect.bottom);
  }, [openMenu]);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  function renderAgentRow(id: string, archived: boolean) {
    const agent = agents.get(id);
    if (!agent) return null;
    const isActive = id === activeAgentId;
    return (
      <div
        key={id}
        onClick={() => onSelect(id)}
        onContextMenu={(e) => handleContextMenu(e, id)}
        className={cn(
          "group flex w-full cursor-pointer items-start gap-0.5 px-3 py-2 text-left text-xs transition-colors",
          isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50",
          archived && "opacity-60"
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[agent.status])} />
            {renamingId === id ? (
              <RenameInput
                initialValue={agent.label}
                onConfirm={(label) => {
                  onRename(id, label);
                  setRenamingId(null);
                }}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <span className="truncate">{agent.label || "new agent"}</span>
            )}
          </span>
          {agent.tmuxSession && (
            <span className="pl-4 text-[10px] text-muted-foreground truncate">
              {agent.tmuxSession}
            </span>
          )}
        </div>
        <button
          onClick={(e) => handleMenuButton(e, id)}
          className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-sidebar-accent group-hover:opacity-100"
          aria-label="Agent menu"
        >
          <EllipsisVertical className="size-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Branding */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-primary font-bold text-sm tracking-tight">thos</span>
        <span className="text-muted-foreground text-[10px]">orchestrator</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
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
        {loading ? (
          <div className="space-y-1 px-3 py-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-2 py-2">
                <div className="size-2 rounded-full bg-muted-foreground/20 animate-pulse" />
                <div className="h-3 flex-1 rounded bg-muted-foreground/20 animate-pulse" style={{ width: `${60 + i * 10}%` }} />
              </div>
            ))}
          </div>
        ) : agentOrder.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No agents yet
          </div>
        ) : null}

        {/* Active agents */}
        {activeIds.map((id) => renderAgentRow(id, false))}

        {/* Archived divider + agents */}
        {archivedIds.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 pt-3 pb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">archived</span>
              <div className="flex-1 border-t" />
            </div>
            {archivedIds.map((id) => renderAgentRow(id, true))}
          </>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (() => {
        const agent = agents.get(ctxMenu.agentId);
        if (!agent) return null;
        return (
          <div
            ref={menuRef}
            className="fixed z-50 min-w-[160px] rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <ContextMenuItem
              label="Rename"
              onClick={() => {
                setRenamingId(ctxMenu.agentId);
                closeMenu();
              }}
            />
            {KILLABLE.has(agent.status) && (
              <ContextMenuItem
                label="Kill"
                onClick={() => {
                  onKill(ctxMenu.agentId);
                  closeMenu();
                }}
              />
            )}
            <ContextMenuItem
              label="Clear History"
              onClick={() => {
                onClearHistory(ctxMenu.agentId);
                closeMenu();
              }}
            />
            <div className="my-1 border-t" />
            <ContextMenuItem
              label="Delete"
              destructive
              onClick={() => {
                closeMenu();
                if (confirm("Delete this agent? This cannot be undone.")) {
                  onDelete(ctxMenu.agentId);
                }
              }}
            />
          </div>
        );
      })()}
    </div>
  );
}

/** A single item in the context menu. */
function ContextMenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full px-3 py-1.5 text-xs transition-colors",
        destructive
          ? "text-red-500 hover:bg-red-500/10"
          : "hover:bg-accent"
      )}
    >
      {label}
    </button>
  );
}

/** Inline input for renaming an agent. */
function RenameInput({
  initialValue,
  onConfirm,
  onCancel,
}: {
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") {
      const trimmed = value.trim();
      if (trimmed) onConfirm(trimmed);
      else onCancel();
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== initialValue) onConfirm(trimmed);
        else onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 rounded border bg-background px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-ring"
    />
  );
}
