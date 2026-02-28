"use client";

/**
 * Syntax-highlighted diff renderer for file-modifying tool calls.
 *
 * Uses `@pierre/diffs` (https://diffs.com) — a Shiki-based diff library
 * that renders inside Shadow DOM for style isolation.
 *
 * ## Data flow
 *
 * When Claude calls Edit, Write, or MultiEdit, the tool_use content block
 * contains the file path and before/after strings. These are preserved on
 * {@link ToolCallInfo.input} by `relayChatMessage()` in `use-websocket.ts`.
 * This component converts that input into `oldFile`/`newFile` objects that
 * `MultiFileDiff` can render.
 *
 * ## Tool input shapes
 *
 * - **Edit** — `{ file_path, old_string, new_string }` — search/replace
 *   on a single region. Renders as a diff of the changed fragment only
 *   (not the full file, since we don't have full-file context).
 *
 * - **Write** — `{ file_path, content }` — create or overwrite a file.
 *   Rendered as a "new file" diff with an empty old file.
 *
 * - **MultiEdit** — `{ file_path, edits: [{ old_string, new_string }] }` —
 *   multiple search/replace ops on the same file. The individual hunks are
 *   concatenated with `\n...\n` separators since we lack inter-hunk context.
 *
 * ## Size guard
 *
 * Diffs larger than 100 KB (combined old + new) are silently skipped to
 * avoid freezing the browser on whole-file Write operations.
 *
 * ## Commenting
 *
 * When `onComment` is provided, clicking a line number opens an inline
 * comment input below the diff. On submit, the comment is formatted with
 * file path and line context and sent to the active Claude session via
 * the callback. This uses `@pierre/diffs`' `onLineNumberClick` option
 * in `FileDiffOptions`.
 *
 * ## Usage
 *
 * ```tsx
 * <DiffViewer toolCall={toolCallInfo} onComment={sendMessage} />
 * ```
 *
 * Renders nothing if the tool call has no input or isn't a file-modifying tool.
 *
 * Used by:
 * - {@link CondensedToolGroup} — inline expandable diffs in collapsed view
 * - {@link Message} — automatic diffs below standalone assistant messages
 * - {@link DiffsPanel} — sidebar panel collecting all session diffs
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronRight, MessageSquare, Send, X } from "lucide-react";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { ToolCallInfo } from "@/lib/types";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

// ── Tool input type guards ──────────────────────────────────────────────

/** Shape of the `input` object for the Claude Code `Edit` tool. */
interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

/** Shape of the `input` object for the Claude Code `Write` tool. */
interface WriteInput {
  file_path: string;
  content: string;
}

/** Shape of the `input` object for the Claude Code `MultiEdit` tool. */
interface MultiEditInput {
  file_path: string;
  edits: Array<{ old_string: string; new_string: string }>;
}

/** Skip rendering for diffs exceeding this combined size (bytes). */
const MAX_CONTENT_SIZE = 100_000;

/**
 * Build `{ oldFile, newFile }` from a tool call's raw input.
 *
 * Each tool has a different input shape — this function normalizes them
 * into the `{ name, contents }` format that `MultiFileDiff` expects.
 * Returns `null` when the tool call can't be rendered (wrong tool,
 * missing fields, or content too large).
 */
function buildDiffFiles(tc: ToolCallInfo): {
  oldFile: { name: string; contents: string };
  newFile: { name: string; contents: string };
} | null {
  if (!tc.input) return null;

  if (tc.name === "Edit") {
    const input = tc.input as unknown as EditInput;
    if (!input.file_path || input.old_string == null || input.new_string == null) return null;
    if (input.old_string.length + input.new_string.length > MAX_CONTENT_SIZE) return null;
    return {
      oldFile: { name: input.file_path, contents: input.old_string },
      newFile: { name: input.file_path, contents: input.new_string },
    };
  }

  if (tc.name === "Write") {
    const input = tc.input as unknown as WriteInput;
    if (!input.file_path || input.content == null) return null;
    if (input.content.length > MAX_CONTENT_SIZE) return null;
    return {
      oldFile: { name: input.file_path, contents: "" },
      newFile: { name: input.file_path, contents: input.content },
    };
  }

  if (tc.name === "MultiEdit") {
    const input = tc.input as unknown as MultiEditInput;
    if (!input.file_path || !Array.isArray(input.edits)) return null;
    const oldParts: string[] = [];
    const newParts: string[] = [];
    for (const edit of input.edits) {
      if (edit.old_string != null) oldParts.push(edit.old_string);
      if (edit.new_string != null) newParts.push(edit.new_string);
    }
    const oldContent = oldParts.join("\n...\n");
    const newContent = newParts.join("\n...\n");
    if (oldContent.length + newContent.length > MAX_CONTENT_SIZE) return null;
    return {
      oldFile: { name: input.file_path, contents: oldContent },
      newFile: { name: input.file_path, contents: newContent },
    };
  }

  return null;
}

/** Tool dot colors matching condensed-tool-group palette. */
const TOOL_DOT: Record<string, string> = {
  Edit: "bg-yellow-400",
  Write: "bg-green-400",
  MultiEdit: "bg-yellow-400",
};

/** Count added/removed lines from old and new content strings. */
function countChanges(oldContent: string, newContent: string): { added: number; removed: number } {
  const oldLines = oldContent ? oldContent.split("\n").length : 0;
  const newLines = newContent ? newContent.split("\n").length : 0;
  if (!oldContent && newContent) return { added: newLines, removed: 0 };
  if (oldContent && !newContent) return { added: 0, removed: oldLines };
  return { added: Math.max(0, newLines - oldLines), removed: Math.max(0, oldLines - newLines) };
}

/** Get the line content from the appropriate file given the side. */
function getLineContent(
  files: { oldFile: { contents: string }; newFile: { contents: string } },
  lineNumber: number,
  side: string,
): string {
  const contents = side === "additions" ? files.newFile.contents : files.oldFile.contents;
  const lines = contents.split("\n");
  return lines[lineNumber - 1] ?? "";
}

/**
 * Renders a syntax-highlighted diff for a single file-modifying tool call.
 *
 * @param toolCall — The tool call info with `input` data.
 * @param onComment — Optional callback to send a comment message to the
 *   active Claude session. When provided, line numbers become clickable.
 */
export function DiffViewer({
  toolCall,
  onComment,
  defaultExpanded = false,
}: {
  toolCall: ToolCallInfo;
  onComment?: (message: string) => void;
  defaultExpanded?: boolean;
}) {
  const files = useMemo(() => buildDiffFiles(toolCall), [toolCall]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [commentLine, setCommentLine] = useState<{ lineNumber: number; side: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filePath = String(toolCall.input?.file_path ?? "unknown");
  const basename = filePath.split("/").pop() ?? filePath;
  const changes = useMemo(
    () => files ? countChanges(files.oldFile.contents, files.newFile.contents) : { added: 0, removed: 0 },
    [files],
  );

  const handleLineNumberClick = useCallback(
    (props: { lineNumber: number; annotationSide: string }) => {
      if (!onComment) return;
      setCommentLine({ lineNumber: props.lineNumber, side: props.annotationSide });
      setCommentText("");
      // Focus input on next tick after render
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [onComment],
  );

  function handleSubmitComment() {
    if (!commentText.trim() || !commentLine || !onComment || !files) return;
    const lineContent = getLineContent(files, commentLine.lineNumber, commentLine.side);
    const sideLabel = commentLine.side === "additions" ? "new" : "old";
    const message = lineContent.trim()
      ? `Regarding \`${filePath}\` line ${commentLine.lineNumber} (${sideLabel}):\n\`\`\`\n${lineContent}\n\`\`\`\n${commentText.trim()}`
      : `Regarding \`${filePath}\` line ${commentLine.lineNumber} (${sideLabel}): ${commentText.trim()}`;
    onComment(message);
    setCommentLine(null);
    setCommentText("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    } else if (e.key === "Escape") {
      setCommentLine(null);
      setCommentText("");
    }
  }

  if (!files) return null;

  const options = onComment
    ? {
        themeType: "dark" as const,
        onLineNumberClick: handleLineNumberClick,
      }
    : { themeType: "dark" as const };

  return (
    <div className="mt-1 overflow-hidden rounded-md border border-border">
      {/* Collapsible file header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform text-muted-foreground",
            expanded && "rotate-90"
          )}
        />
        <span className={cn("inline-block size-1.5 shrink-0 rounded-full", TOOL_DOT[toolCall.name] ?? "bg-muted-foreground/50")} />
        <span className="font-mono text-[10px] text-muted-foreground/70">{toolCall.name}</span>
        <Tip text={filePath}>
          <span className="font-mono font-medium truncate">{basename}</span>
        </Tip>
        <span className="ml-auto flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
          {changes.added > 0 && <span className="text-green-400">+{changes.added}</span>}
          {changes.removed > 0 && <span className="text-red-400">-{changes.removed}</span>}
        </span>
      </button>

      {/* Diff content (collapsed by default) */}
      {expanded && (
        <>
          <MultiFileDiff
            oldFile={files.oldFile}
            newFile={files.newFile}
            options={options}
          />
          {commentLine && (
            <div className="flex items-center gap-2 border-t border-border bg-muted/50 px-2 py-1.5">
              <MessageSquare className="size-3 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                {basename}:{commentLine.lineNumber}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Comment on this line..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              />
              <button
                onClick={handleSubmitComment}
                disabled={!commentText.trim()}
                className={cn(
                  "rounded p-1 transition-colors",
                  commentText.trim()
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground/30"
                )}
                title="Send comment"
              >
                <Send className="size-3" />
              </button>
              <button
                onClick={() => { setCommentLine(null); setCommentText(""); }}
                className="rounded p-1 text-muted-foreground hover:bg-muted/50 transition-colors"
                title="Cancel"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
