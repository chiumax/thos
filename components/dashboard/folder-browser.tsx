"use client";

/**
 * Modal dialog for browsing the server's filesystem and selecting a
 * directory to create a new workspace.
 *
 * Uses the `browse_directory` WebSocket message to fetch directory
 * listings from the server (works over Tailscale).
 */

import { useCallback, useEffect, useState } from "react";
import { Folder, FolderUp, X } from "lucide-react";
import type { DirectoryEntry } from "@/lib/types";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

export function FolderBrowser({
  open,
  onClose,
  directoryListing,
  onBrowse,
  onCreate,
  initialPath,
}: {
  open: boolean;
  onClose: () => void;
  directoryListing: { path: string; entries: DirectoryEntry[] } | null;
  onBrowse: (path: string) => void;
  onCreate: (name: string, cwd: string) => void;
  /** Starting directory path (defaults to server cwd). */
  initialPath: string;
}) {
  const [name, setName] = useState("");
  const [selectedPath, setSelectedPath] = useState(initialPath);

  // Browse initial path on open
  useEffect(() => {
    if (open) {
      setSelectedPath(initialPath);
      setName(getBasename(initialPath));
      onBrowse(initialPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Update name when browsing to a new directory
  useEffect(() => {
    if (directoryListing) {
      setSelectedPath(directoryListing.path);
      setName(getBasename(directoryListing.path));
    }
  }, [directoryListing]);

  const navigateTo = useCallback(
    (path: string) => {
      onBrowse(path);
    },
    [onBrowse]
  );

  const handleCreate = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed || !selectedPath) return;
    onCreate(trimmed, selectedPath);
    onClose();
  }, [name, selectedPath, onCreate, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const currentPath = directoryListing?.path ?? selectedPath;
  const entries = directoryListing?.entries ?? [];
  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <>
      {/* Modal overlay + backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div
          className="w-full max-w-lg rounded-lg border bg-background shadow-lg flex flex-col max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Open Folder</h2>
            <button
              onClick={onClose}
              className="rounded p-1 hover:bg-accent transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 border-b px-4 py-2 text-xs text-muted-foreground overflow-x-auto">
            <button
              onClick={() => navigateTo("/")}
              className="shrink-0 hover:text-foreground transition-colors"
            >
              /
            </button>
            {pathParts.map((part, i) => {
              const fullPath = "/" + pathParts.slice(0, i + 1).join("/");
              const isLast = i === pathParts.length - 1;
              return (
                <span key={fullPath} className="flex items-center gap-1">
                  <span className="text-muted-foreground/50">/</span>
                  <button
                    onClick={() => navigateTo(fullPath)}
                    className={cn(
                      "shrink-0 transition-colors",
                      isLast ? "text-foreground font-medium" : "hover:text-foreground"
                    )}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>

          {/* Directory listing */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {entries.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                Empty directory
              </div>
            ) : (
              <div className="py-1">
                {entries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => navigateTo(entry.path)}
                    className="flex w-full items-center gap-2 px-4 py-1.5 text-xs transition-colors hover:bg-accent text-left"
                  >
                    {entry.name === ".." ? (
                      <FolderUp className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Folder className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <Tip text={entry.name} side="right"><span className="truncate">{entry.name}</span></Tip>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer: name input + open button */}
          <div className="border-t px-4 py-3 flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              placeholder="Workspace name"
              className="flex-1 rounded border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Open
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Extract the last segment of a path for use as default workspace name. */
function getBasename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}
