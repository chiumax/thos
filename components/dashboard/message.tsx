"use client";

/**
 * Single chat message bubble.
 * - **user** — right-aligned, primary background.
 * - **assistant** — left-aligned, secondary background.
 * - **system** — centered, italic, muted (used for init info, result summaries, errors).
 */

import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="py-1 text-center text-xs italic text-muted-foreground">
        {message.content}
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[90%] md:max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {message.content}
      </div>
    </div>
  );
}
