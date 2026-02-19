"use client";

/**
 * Tool approval card shown when Claude requests permission to run a tool.
 *
 * Displays the tool name with formatted input parameters, Allow / Deny buttons,
 * and a resolved state with colored badge. Rendered in place of a regular
 * {@link Message} when the message carries a `controlRequest` payload.
 */

import { Button } from "@/components/ui/button";
import { Check, ShieldAlert, X } from "lucide-react";
import type { ChatMessage } from "@/lib/types";

/** Format "Mcp__server__tool_name" → { display: "tool_name", namespace: "server" } */
function formatToolName(raw: string): { display: string; namespace?: string } {
  // MCP namespaced tools: Mcp__<server>__<tool>
  const mcpMatch = raw.match(/^Mcp__([^_]+(?:__[^_]+)*)__(.+)$/);
  if (mcpMatch) {
    return { display: mcpMatch[2], namespace: mcpMatch[1] };
  }
  return { display: raw };
}

/** Determine if a string value is "long" (multi-line or > 80 chars). */
function isLongValue(value: string): boolean {
  return value.includes("\n") || value.length > 80;
}

function InputField({ name, value }: { name: string; value: unknown }) {
  if (value === null || value === undefined) return null;

  // String values: short → inline code, long → scrollable code block
  if (typeof value === "string") {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{name}</div>
        {isLongValue(value) ? (
          <pre className="max-h-48 overflow-auto rounded bg-secondary p-2 text-xs whitespace-pre-wrap break-all">
            {value}
          </pre>
        ) : (
          <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{value}</code>
        )}
      </div>
    );
  }

  // Boolean / number: inline code
  if (typeof value === "boolean" || typeof value === "number") {
    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{name}</div>
        <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{String(value)}</code>
      </div>
    );
  }

  // Arrays and objects: JSON code block
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{name}</div>
      <pre className="max-h-48 overflow-auto rounded bg-secondary p-2 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function ControlRequest({
  message,
  onRespond,
}: {
  message: ChatMessage;
  onRespond: (requestId: string, allow: boolean) => void;
}) {
  const cr = message.controlRequest;
  if (!cr) return null;

  const { display, namespace } = formatToolName(cr.tool_name);

  return (
    <div
      className={`mx-auto w-full max-w-2xl rounded-lg border-2 border-dashed border-muted-foreground/30 p-3 md:p-4 ${
        cr.resolved ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-yellow-500" />
        <span className="text-sm font-semibold">{display}</span>
        {namespace && (
          <span className="text-xs text-muted-foreground">{namespace}</span>
        )}
      </div>

      {/* Description */}
      {cr.description && (
        <p className="mb-3 text-xs text-muted-foreground">{cr.description}</p>
      )}

      {/* Input parameters */}
      <div className="mb-3 space-y-2">
        {Object.entries(cr.input).map(([key, value]) => (
          <InputField key={key} name={key} value={value} />
        ))}
      </div>

      {/* Actions / Resolved state */}
      {!cr.resolved ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(cr.id, true)}>
            <Check className="mr-1 h-3 w-3" />
            Allow
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRespond(cr.id, false)}
          >
            <X className="mr-1 h-3 w-3" />
            Deny
          </Button>
        </div>
      ) : (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            cr.allowed
              ? "bg-green-500/15 text-green-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {cr.allowed ? "Allowed" : "Denied"}
        </span>
      )}
    </div>
  );
}
