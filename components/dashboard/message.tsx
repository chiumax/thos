"use client";

/**
 * Single chat message bubble.
 * - **user** — right-aligned, primary background.
 * - **assistant** — left-aligned, secondary background, markdown rendered.
 * - **system** — centered, italic, muted (used for init info, result summaries, errors).
 *
 * Includes:
 * - Relative timestamps ("just now", "2m ago") with absolute time on hover.
 * - Copy button on hover for user/assistant messages.
 * - Markdown rendering for assistant messages via react-markdown + remark-gfm.
 */

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Relative time formatting ────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 10_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatAbsoluteTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function RelativeTime({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <time
      dateTime={new Date(timestamp).toISOString()}
      title={formatAbsoluteTime(timestamp)}
      className="text-[10px] text-muted-foreground/60"
    >
      {formatRelativeTime(timestamp)}
    </time>
  );
}

// ── Copy button ─────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-1 right-1 rounded p-1 opacity-0 transition-opacity hover:bg-muted/50 group-hover:opacity-100"
      aria-label="Copy message"
    >
      {copied ? (
        <Check className="size-3 text-green-400" />
      ) : (
        <Copy className="size-3 text-muted-foreground" />
      )}
    </button>
  );
}

// ── Message component ───────────────────────────────────────────────────

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
    <div className={cn("flex flex-col gap-0.5", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "group relative max-w-[90%] md:max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground whitespace-pre-wrap"
            : "bg-secondary text-secondary-foreground prose-msg"
        )}
      >
        {isUser ? (
          message.content
        ) : (
          <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
        )}
        <CopyButton text={message.content} />
      </div>
      <RelativeTime timestamp={message.timestamp} />
    </div>
  );
}
