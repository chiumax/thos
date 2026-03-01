"use client";

/**
 * Workspace dropdown in the sidebar header.
 *
 * Shows the active workspace name (or "All Workspaces"), with a dropdown
 * listing all workspaces plus an "Open Folder..." option that triggers
 * the folder browser modal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen, Pencil, Trash2 } from "lucide-react";
import type { Workspace } from "@/lib/types";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onRename,
  onDelete,
  onOpenFolder,
}: {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelect: (workspaceId: string | null) => void;
  onRename: (workspaceId: string, name: string) => void;
  onDelete: (workspaceId: string) => void;
  onOpenFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeWorkspace = activeWorkspaceId
    ? workspaces.find((w) => w.id === activeWorkspaceId)
    : null;

  // Close on click-outside or Escape
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleSelect = useCallback(
    (id: string | null) => {
      onSelect(id);
      setOpen(false);
    },
    [onSelect]
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <Tip text={activeWorkspace?.name ?? "All Workspaces"} side="right">
            <span className="text-primary font-bold text-sm tracking-tight truncate">
              {activeWorkspace?.name ?? "All Workspaces"}
            </span>
          </Tip>
          {activeWorkspace && (
            <Tip text={activeWorkspace.cwd} side="right">
              <span className="text-[10px] text-muted-foreground truncate">
                {activeWorkspace.cwd}
              </span>
            </Tip>
          )}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[200px] rounded-md border bg-popover py-1 text-popover-foreground shadow-md">
          {/* All Workspaces */}
          <button
            onClick={() => handleSelect(null)}
            className={cn(
              "flex w-full items-center px-3 py-1.5 text-xs transition-colors hover:bg-accent",
              activeWorkspaceId === null && "bg-accent"
            )}
          >
            All Workspaces
          </button>

          {workspaces.length > 0 && <div className="my-1 border-t" />}

          {/* Workspace list */}
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className={cn(
                "group flex items-center gap-1 px-3 py-1.5 text-xs transition-colors hover:bg-accent cursor-pointer",
                activeWorkspaceId === ws.id && "bg-accent"
              )}
              onClick={() => {
                if (renamingId !== ws.id) handleSelect(ws.id);
              }}
            >
              {renamingId === ws.id ? (
                <RenameInput
                  initialValue={ws.name}
                  onConfirm={(name) => {
                    onRename(ws.id, name);
                    setRenamingId(null);
                  }}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <>
                  <Tip text={ws.name} side="right"><span className="min-w-0 flex-1 truncate">{ws.name}</span></Tip>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(ws.id);
                    }}
                    className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                    aria-label="Rename workspace"
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete workspace "${ws.name}"?`)) {
                        onDelete(ws.id);
                      }
                    }}
                    className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-red-500/10 group-hover:opacity-100"
                    aria-label="Delete workspace"
                  >
                    <Trash2 className="size-3 text-red-500" />
                  </button>
                </>
              )}
            </div>
          ))}

          <div className="my-1 border-t" />

          {/* Open Folder */}
          <button
            onClick={() => {
              setOpen(false);
              onOpenFolder();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-accent"
          >
            <FolderOpen className="size-3.5 text-muted-foreground" />
            Open Folder...
          </button>
        </div>
      )}
    </div>
  );
}

/** Inline input for renaming a workspace. */
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

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          const trimmed = value.trim();
          if (trimmed) onConfirm(trimmed);
          else onCancel();
        } else if (e.key === "Escape") {
          onCancel();
        }
      }}
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
