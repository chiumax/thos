"use client";

import { useState } from "react";
import type { ClaudeMessage } from "@/lib/types";

/** Badge color per Claude NDJSON message type. */
const TYPE_COLORS: Record<string, string> = {
  system: "text-yellow-500",
  assistant: "text-blue-400",
  result: "text-green-500",
  control_request: "text-orange-400",
  keep_alive: "text-muted-foreground",
};

export function RawMessage({ message, index }: { message: ClaudeMessage; index: number }) {
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
