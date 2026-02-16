"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { CondensedGroup } from "@/lib/condense-messages";
import { Message } from "./message";
import { cn } from "@/lib/utils";

export function CondensedToolGroup({ group }: { group: CondensedGroup }) {
  const [expanded, setExpanded] = useState(false);

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
