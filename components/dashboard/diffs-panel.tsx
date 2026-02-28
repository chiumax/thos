"use client";

/**
 * Right-side drawer panel that collects all file diffs from the active
 * agent session into a single scrollable view, grouped by file path.
 *
 * ## Architecture
 *
 * Follows the same pattern as {@link TaskPanel} in `kanban-board.tsx`:
 * - Toggled via a button in the {@link StatusBar} (GitCompareArrows icon)
 * - State lives in `app/dashboard/page.tsx` (`showDiffs` boolean)
 * - Rendered as a fixed right-side drawer (w-96) with mobile backdrop
 * - Props threaded: page → Chat → StatusBar for the toggle button
 *
 * ## Data flow
 *
 * The panel receives `activeMessages` (the current agent's processed
 * chat messages) from the page component. It derives the diff list
 * via `useMemo` — no WebSocket hook changes or server-side support
 * is needed. The diff data is already on each `ChatMessage.toolCalls`
 * entry as `ToolCallInfo.input`.
 *
 * ```
 * activeMessages → groupByFile() → FileGroup[] → FileGroupItem → DiffViewer
 * ```
 *
 * ## Grouping
 *
 * Diffs are grouped by absolute file path using insertion order (Map).
 * Multiple edits to the same file appear under one collapsible section,
 * each rendered as a separate {@link DiffViewer}. This lets you see the
 * full edit history for a file in chronological order.
 */

import { useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiffViewer } from "./diff-viewer";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";
import type { ChatMessage, ToolCallInfo } from "@/lib/types";

/** Tool names whose inputs contain diff data (file_path + old/new strings). */
const DIFF_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

/** A group of diffs for a single file path. */
interface FileGroup {
  filePath: string;
  diffs: ToolCallInfo[];
}

/**
 * Walk all messages and collect file-modifying tool calls, grouped by
 * file path. Preserves insertion order so files appear in the order
 * they were first touched.
 */
function groupByFile(messages: ChatMessage[]): FileGroup[] {
  const map = new Map<string, ToolCallInfo[]>();
  for (const msg of messages) {
    for (const tc of msg.toolCalls ?? []) {
      if (!tc.input || !DIFF_TOOLS.has(tc.name)) continue;
      const filePath = String(tc.input.file_path ?? "");
      if (!filePath) continue;
      let group = map.get(filePath);
      if (!group) {
        group = [];
        map.set(filePath, group);
      }
      group.push(tc);
    }
  }
  return Array.from(map, ([filePath, diffs]) => ({ filePath, diffs }));
}

/** Collapsible section for a single file's diffs. Expanded by default. */
function FileGroupItem({ group, onComment }: { group: FileGroup; onComment?: (message: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const basename = group.filePath.split("/").pop() ?? group.filePath;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform",
            expanded && "rotate-90"
          )}
        />
        <Tip text={group.filePath}><span className="font-mono font-medium truncate">{basename}</span></Tip>
        <span className="text-muted-foreground/60 ml-auto shrink-0">
          {group.diffs.length} {group.diffs.length === 1 ? "edit" : "edits"}
        </span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {group.diffs.map((tc, i) => (
            <DiffViewer key={tc.toolUseId ?? i} toolCall={tc} onComment={onComment} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sidebar panel listing all file diffs from the current agent session.
 *
 * @param messages — The active agent's `ChatMessage[]` from `useWebSocket`.
 *   File-modifying tool calls are extracted and grouped by file path.
 * @param onSendMessage — Callback to send a comment to the active session.
 * @param onClose — Callback to hide the panel (sets `showDiffs` to false).
 */
export function DiffsPanel({
  messages,
  onSendMessage,
  onClose,
}: {
  messages: ChatMessage[];
  onSendMessage?: (content: string) => void;
  onClose: () => void;
}) {
  const fileGroups = useMemo(() => groupByFile(messages), [messages]);
  const totalDiffs = fileGroups.reduce((sum, g) => sum + g.diffs.length, 0);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Diffs</span>
          {totalDiffs > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {totalDiffs}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close">
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {fileGroups.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No file changes yet
          </div>
        ) : (
          fileGroups.map((group) => (
            <FileGroupItem key={group.filePath} group={group} onComment={onSendMessage} />
          ))
        )}
      </div>
    </div>
  );
}
