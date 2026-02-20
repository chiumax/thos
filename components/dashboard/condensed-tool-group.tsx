"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { CondensedGroup } from "@/lib/condense-messages";
import type { ToolCallInfo } from "@/lib/types";
import { Message } from "./message";
import { cn } from "@/lib/utils";

/** Colored dot per common tool name. */
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

export function CondensedToolGroup({ group }: { group: CondensedGroup }) {
  const [expanded, setExpanded] = useState(false);

  // Collect all tool calls with previews for the collapsed view
  const allToolCalls: ToolCallInfo[] = [];
  for (const msg of group.messages) {
    for (const tc of msg.toolCalls ?? []) {
      allToolCalls.push(tc);
    }
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
          {allToolCalls.map((tc, i) => (
            <div key={`${tc.toolUseId ?? i}`} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 truncate">
              <span className={cn("inline-block size-1.5 shrink-0 rounded-full", TOOL_COLORS[tc.name] ?? "bg-muted-foreground/50")} />
              <span className="font-mono shrink-0">{tc.name}</span>
              {tc.resultPreview && (
                <span className="truncate opacity-60">{tc.resultPreview}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="ml-5 mt-1 space-y-1 border-l border-muted pl-3">
          {group.messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}
