"use client";

/**
 * Collapsible group for consecutive tool-only assistant messages.
 *
 * When Claude runs multiple tools in a row without any prose text,
 * {@link condenseMessages} in `lib/condense-messages.ts` groups them
 * into a {@link CondensedGroup}. This component renders that group.
 *
 * ## Two-level expand
 *
 * 1. **Group level** — The top chevron toggles between the compact
 *    per-tool-call summary (collapsed) and the full message bubbles
 *    (expanded). This is the original behavior.
 *
 * 2. **Diff level** — In the collapsed view, file-modifying tool calls
 *    (Edit, Write, MultiEdit) show the file basename and are clickable.
 *    Clicking one toggles an inline {@link DiffViewer} for just that
 *    tool call, without expanding the whole group. Multiple diffs can
 *    be open at once (tracked in the `expandedDiffs` Set).
 *
 * Non-diff tool calls (Read, Bash, Grep, etc.) continue to show the
 * truncated `resultPreview` text as before.
 */

import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { CondensedGroup } from "@/lib/condense-messages";
import type { ToolCallInfo } from "@/lib/types";
import { Message } from "./message";
import { DiffViewer } from "./diff-viewer";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

/** Colored dot per common tool name (used in the compact summary line). */
const TOOL_COLORS: Record<string, string> = {
  Read: "bg-blue-400",
  Write: "bg-green-400",
  Edit: "bg-yellow-400",
  Bash: "bg-orange-400",
  Glob: "bg-purple-400",
  Grep: "bg-cyan-400",
  WebFetch: "bg-pink-400",
  Task: "bg-indigo-400",
  TodoWrite: "bg-teal-400",
};

/** Tool names that produce renderable diffs (same set as in diff-viewer). */
const DIFF_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

export const CondensedToolGroup = memo(function CondensedToolGroup({ group, onSendMessage }: { group: CondensedGroup; onSendMessage?: (content: string) => void }) {
  /** Whether the full message list is shown (group-level expand). */
  const [expanded, setExpanded] = useState(false);
  /** Which individual diffs are open in the collapsed view (by key). */
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());

  // Collect all tool calls with previews for the collapsed view
  const allToolCalls: ToolCallInfo[] = [];
  for (const msg of group.messages) {
    for (const tc of msg.toolCalls ?? []) {
      allToolCalls.push(tc);
    }
  }

  function toggleDiff(key: string) {
    setExpandedDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="py-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform",
            expanded && "rotate-90"
          )}
        />
        <span className="font-mono">{group.summary}</span>
      </button>

      {!expanded && allToolCalls.length > 0 && (
        <div className="ml-5 mt-0.5 space-y-0.5 pl-3">
          {allToolCalls.map((tc, i) => {
            const key = `${tc.toolUseId ?? "tc"}-${i}`;
            const hasDiff = tc.input && DIFF_TOOLS.has(tc.name);
            const diffOpen = expandedDiffs.has(key);

            return (
              <div key={key}>
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] text-muted-foreground/70 truncate",
                    hasDiff && "cursor-pointer hover:text-muted-foreground"
                  )}
                  onClick={hasDiff ? () => toggleDiff(key) : undefined}
                >
                  <span className={cn("inline-block size-1.5 shrink-0 rounded-full", TOOL_COLORS[tc.name] ?? "bg-muted-foreground/50")} />
                  <span className="font-mono shrink-0">{tc.name}</span>
                  {hasDiff && tc.input?.file_path ? (
                    <Tip text={String(tc.input.file_path)}>
                      <span className="truncate font-mono opacity-80">
                        {String(tc.input.file_path).split("/").pop()}
                      </span>
                    </Tip>
                  ) : tc.resultPreview ? (
                    <Tip text={tc.resultPreview}><span className="truncate opacity-60">{tc.resultPreview}</span></Tip>
                  ) : null}
                </div>
                {hasDiff && diffOpen && (
                  <div className="mt-1 mb-1">
                    <DiffViewer toolCall={tc} onComment={onSendMessage} defaultExpanded />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {expanded && (
        <div className="ml-5 mt-1 space-y-1 border-l border-muted pl-3">
          {group.messages.map((msg) => (
            <Message key={msg.id} message={msg} onSendMessage={onSendMessage} />
          ))}
        </div>
      )}
    </div>
  );
});
