"use client";

/**
 * Tool approval card shown when Claude requests permission to run a tool.
 *
 * Displays the tool name and its JSON input, with Allow / Deny buttons.
 * Once the user responds, buttons are replaced with a "Resolved" label.
 * Rendered in place of a regular {@link Message} when the message carries
 * a `controlRequest` payload.
 */

import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";

export function ControlRequest({
  message,
  onRespond,
}: {
  message: ChatMessage;
  onRespond: (requestId: string, allow: boolean) => void;
}) {
  const cr = message.controlRequest;
  if (!cr) return null;

  return (
    <div className="mx-auto w-full max-w-lg rounded-lg border-2 border-dashed border-muted-foreground/30 p-4">
      <div className="mb-2 text-xs font-semibold text-muted-foreground">
        Tool approval requested
      </div>
      <div className="mb-1 text-sm font-medium">{cr.tool_name}</div>
      <pre className="mb-3 max-h-40 overflow-auto rounded bg-secondary p-2 text-xs">
        {JSON.stringify(cr.input, null, 2)}
      </pre>
      {!cr.resolved ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(cr.id, true)}>
            Allow
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onRespond(cr.id, false)}
          >
            Deny
          </Button>
        </div>
      ) : (
        <div className="text-xs italic text-muted-foreground">Resolved</div>
      )}
    </div>
  );
}
