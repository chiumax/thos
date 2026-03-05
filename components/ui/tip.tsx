"use client";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

/**
 * Lightweight wrapper around shadcn Tooltip for truncated text.
 *
 * Usage:
 * ```tsx
 * <Tip text={fullText}>
 *   <span className="truncate">{fullText}</span>
 * </Tip>
 * ```
 *
 * Renders nothing special if `text` is falsy — just the children.
 */
export function Tip({
  text,
  side,
  children,
}: {
  text?: string | null;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}) {
  if (!text) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side ?? "top"} className="max-w-xs break-words">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
