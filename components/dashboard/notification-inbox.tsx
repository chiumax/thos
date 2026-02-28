"use client";

/**
 * Notification inbox dropdown. Shows a list of notification items from agent
 * events (done, error, control requests, questions). Each item is clickable
 * to navigate to the associated agent.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, BellOff, CheckCircle2, HelpCircle, Trash2, XCircle } from "lucide-react";
import { sendTestNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import type { NotificationItem, NotificationType } from "@/lib/types";

const TYPE_CONFIG: Record<NotificationType, { icon: typeof CheckCircle2; color: string }> = {
  done: { icon: CheckCircle2, color: "text-green-500" },
  error: { icon: XCircle, color: "text-red-500" },
  control_request: { icon: AlertTriangle, color: "text-yellow-500" },
  question: { icon: HelpCircle, color: "text-blue-400" },
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function NotificationInbox({
  notifications,
  enabled,
  onToggleEnabled,
  onSelect,
  onDismiss,
  onClear,
  onClose,
  onTestPush,
}: {
  notifications: NotificationItem[];
  enabled: boolean;
  onToggleEnabled: () => void;
  onSelect: (agentId: string, notificationId: string) => void;
  onDismiss: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  onTestPush?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Close on click-outside or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 w-80 max-h-[400px] rounded-md border bg-popover shadow-md flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Notifications</span>
          <button
            onClick={onToggleEnabled}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors",
              enabled
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
            title={enabled ? "Disable desktop notifications" : "Enable desktop notifications"}
          >
            {enabled ? <Bell className="size-2.5" /> : <BellOff className="size-2.5" />}
            {enabled ? "on" : "off"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {enabled && (
            <button
              onClick={() => {
                const result = sendTestNotification();
                setTestResult(result);
                onTestPush?.();
                if (result === "sent") setTimeout(() => setTestResult(null), 3000);
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Test
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Test result diagnostic */}
      {testResult && (
        <div className={cn(
          "border-b px-3 py-1.5 text-[10px]",
          testResult === "sent" ? "text-green-400 bg-green-500/5" : "text-red-400 bg-red-500/5"
        )}>
          {testResult}
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            No notifications
          </div>
        ) : (
          notifications.map((item) => {
            const config = TYPE_CONFIG[item.type];
            const Icon = config.icon;
            return (
              <div
                key={item.id}
                className={cn(
                  "group flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/50 cursor-pointer border-b border-border/50 last:border-b-0",
                  !item.read && "bg-muted/20"
                )}
                onClick={() => onSelect(item.agentId, item.id)}
              >
                <Icon className={cn("size-3.5 mt-0.5 shrink-0", config.color)} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs leading-tight">{item.message}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="truncate max-w-[140px]">{item.agentLabel}</span>
                    <span>{relativeTime(item.timestamp)}</span>
                  </div>
                </div>
                {!item.read && (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(item.id);
                  }}
                  className="mt-0.5 shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  title="Dismiss"
                >
                  <Trash2 className="size-3 text-muted-foreground" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
