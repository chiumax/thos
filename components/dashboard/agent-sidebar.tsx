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
import { createPortal } from "react-dom";
import { EllipsisVertical, Pin, Snowflake, Plus, ChevronRight } from "lucide-react";
import type { AgentStatus, Workspace } from "@/lib/types";
import type { AgentClientState } from "@/hooks/use-websocket";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "./workspace-switcher";

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
  onPin,
  onIcebox,
  onMoveAgent,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onOpenFolder,
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
  onPin: (agentId: string, pinned: boolean) => void;
  onIcebox: (agentId: string, iceboxed: boolean) => void;
  onMoveAgent: (agentId: string, workspaceId: string | null) => void;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onRenameWorkspace: (workspaceId: string, name: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onOpenFolder: () => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sort helper: most recent first by createdAt
  const byRecency = (a: string, b: string) => {
    const ca = agents.get(a)?.createdAt ?? 0;
    const cb = agents.get(b)?.createdAt ?? 0;
    return cb - ca;
  };

  // Split agents into pinned, active, icebox, and archived
  const pinnedIds = agentOrder
    .filter((id) => {
      const a = agents.get(id);
      return a && a.pinned && !a.iceboxed;
    })
    .sort(byRecency);
  const activeIds = agentOrder
    .filter((id) => {
      const a = agents.get(id);
      return a && !a.pinned && !a.iceboxed && !ARCHIVED.has(a.status);
    })
    .sort(byRecency);
  const iceboxIds = agentOrder
    .filter((id) => {
      const a = agents.get(id);
      return a && a.iceboxed;
    })
    .sort(byRecency);
  const archivedIds = agentOrder
    .filter((id) => {
      const a = agents.get(id);
      return a && !a.pinned && !a.iceboxed && ARCHIVED.has(a.status);
    })
    .sort(byRecency);

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

  function renderAgentRow(id: string, dimmed: boolean) {
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
          dimmed && "opacity-60"
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
              <Tip text={agent.label || "new agent"} side="right"><span className="truncate">{agent.label || "new agent"}</span></Tip>
            )}
            {agent.pinned && (
              <Pin className="size-2.5 shrink-0 text-muted-foreground" />
            )}
            {agent.iceboxed && (
              <Snowflake className="size-2.5 shrink-0 text-muted-foreground" />
            )}
          </span>
          <span className="pl-4 text-[10px] text-muted-foreground truncate font-mono">
            {id}
            {(() => {
              const ws = workspaces.find((w) => w.id === agent.workspaceId);
              return ws ? <span className="opacity-60"> · {ws.name}</span> : null;
            })()}
          </span>
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
      {/* Workspace switcher */}
      <div className="border-b">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelect={onSelectWorkspace}
          onRename={onRenameWorkspace}
          onDelete={onDeleteWorkspace}
          onOpenFolder={onOpenFolder}
        />
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

        {/* Pinned agents */}
        {pinnedIds.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 pt-2 pb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">pinned</span>
              <div className="flex-1 border-t" />
            </div>
            {pinnedIds.map((id) => renderAgentRow(id, false))}
          </>
        )}

        {/* Active agents */}
        {activeIds.length > 0 && (
          <>
            {pinnedIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">active</span>
                <div className="flex-1 border-t" />
              </div>
            )}
            {activeIds.map((id) => renderAgentRow(id, false))}
          </>
        )}

        {/* Icebox agents */}
        {iceboxIds.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 pt-3 pb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">icebox</span>
              <div className="flex-1 border-t" />
            </div>
            {iceboxIds.map((id) => renderAgentRow(id, true))}
          </>
        )}

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

      {/* Context menu — portaled to body to escape sidebar stacking context */}
      {ctxMenu && (() => {
        const agent = agents.get(ctxMenu.agentId);
        if (!agent) return null;
        return createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[160px] rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <ContextMenuItem
              label={agent.pinned ? "Unpin" : "Pin"}
              onClick={() => {
                onPin(ctxMenu.agentId, !agent.pinned);
                closeMenu();
              }}
            />
            <ContextMenuItem
              label={agent.iceboxed ? "Un-icebox" : "Icebox"}
              onClick={() => {
                onIcebox(ctxMenu.agentId, !agent.iceboxed);
                closeMenu();
              }}
            />
            {workspaces.length > 0 && (
              <ContextMenuSub label="Move to…">
                {workspaces
                  .filter((w) => w.id !== agent.workspaceId)
                  .map((w) => (
                    <ContextMenuItem
                      key={w.id}
                      label={w.name}
                      onClick={() => {
                        onMoveAgent(ctxMenu.agentId, w.id);
                        closeMenu();
                      }}
                    />
                  ))}
                {agent.workspaceId && (
                  <>
                    <div className="my-1 border-t" />
                    <ContextMenuItem
                      label="No workspace"
                      onClick={() => {
                        onMoveAgent(ctxMenu.agentId, null);
                        closeMenu();
                      }}
                    />
                  </>
                )}
              </ContextMenuSub>
            )}
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
          </div>,
          document.body
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

/** A context menu item with a hover-triggered submenu. */
function ContextMenuSub({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const leave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-accent">
        {label}
        <ChevronRight className="ml-2 h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-full top-0 z-[10000] min-w-[140px] rounded-md border bg-popover py-1 text-popover-foreground shadow-md">
          {children}
        </div>
      )}
    </div>
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
