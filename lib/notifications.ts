/**
 * Notification module for thos dashboard.
 *
 * Handles two ephemeral notification channels:
 * 1. **Browser/OS notifications** (Web Notifications API) — shown when the tab
 *    is hidden so the user knows an agent needs attention.
 * 2. **In-app toasts** (Sonner) — shown for events from non-active agents.
 *
 * The persistent notification inbox is managed separately in the useWebSocket
 * hook as React state. This module only handles fire-and-forget alerts.
 *
 * Both channels respect a global enabled/disabled toggle persisted in
 * localStorage. The module pattern mirrors `lib/sfx.ts`.
 */

import { toast } from "sonner";

const STORAGE_KEY = "thos-notifications-enabled";

let enabled = false;

/** Read persisted state from localStorage. Call once on mount. */
export function initNotifications() {
  if (typeof window === "undefined") return;
  const stored = localStorage.getItem(STORAGE_KEY);
  enabled = stored === null ? true : stored === "true";
}

export function isNotificationsEnabled(): boolean {
  return enabled;
}

export function setNotificationsEnabled(value: boolean) {
  enabled = value;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, String(value));
  }
}

/** Request browser notification permission. Returns true if granted. */
export async function requestPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.warn("[thos-notif] Notification API not available — requires HTTPS or localhost");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    console.warn("[thos-notif] Permission denied — user must reset in browser settings");
    return false;
  }
  try {
    const result = await Notification.requestPermission();
    console.log("[thos-notif] Permission result:", result);
    return result === "granted";
  } catch (e) {
    console.error("[thos-notif] requestPermission failed:", e);
    return false;
  }
}

// ── Notification options ──────────────────────────────────────────────────

interface NotifyOptions {
  agentId: string;
  agentLabel: string;
  /** True if this is the currently viewed agent — skips in-app toast. */
  isActiveAgent: boolean;
}

interface ControlRequestOptions extends NotifyOptions {
  toolName: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────

function browserNotify(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!document.hidden) return;

  const n = new Notification(title, {
    body,
    silent: true, // SFX system handles sounds
  });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

function inAppToast(
  type: "success" | "error" | "warning" | "info",
  message: string,
  opts: NotifyOptions
) {
  if (opts.isActiveAgent) return;

  const label = opts.agentLabel || opts.agentId.slice(0, 8);
  const toastFn = type === "warning" ? toast.warning : toast[type];

  toastFn(message, {
    description: label,
    duration: type === "warning" || type === "error" ? 8000 : 5000,
  });
}

// ── Public notification functions ─────────────────────────────────────────

export function notifyDone(opts: NotifyOptions) {
  if (!enabled) return;
  const label = opts.agentLabel || opts.agentId.slice(0, 8);
  browserNotify("Agent finished", label);
  inAppToast("success", "Agent finished", opts);
}

export function notifyError(opts: NotifyOptions) {
  if (!enabled) return;
  const label = opts.agentLabel || opts.agentId.slice(0, 8);
  browserNotify("Agent error", label);
  inAppToast("error", "Agent error", opts);
}

export function notifyControlRequest(opts: ControlRequestOptions) {
  if (!enabled) return;
  const label = opts.agentLabel || opts.agentId.slice(0, 8);
  browserNotify("Approval needed", `${label} — ${opts.toolName}`);
  inAppToast("warning", `Approval needed: ${opts.toolName}`, opts);
}

export function notifyQuestion(opts: NotifyOptions) {
  if (!enabled) return;
  const label = opts.agentLabel || opts.agentId.slice(0, 8);
  browserNotify("Question from agent", label);
  inAppToast("info", "Question from agent", opts);
}

/** Send a test notification (bypasses document.hidden check). Returns a diagnostic string. */
export function sendTestNotification(): string {
  const secure = window.isSecureContext ? "yes" : "no";
  const hasApi = "Notification" in window ? "yes" : "no";
  const perm = "Notification" in window ? Notification.permission : "n/a";
  const diag = `secure=${secure} api=${hasApi} perm=${perm} enabled=${enabled}`;

  if (!("Notification" in window)) return `No Notification API (${diag})`;
  if (Notification.permission !== "granted") return `Permission: ${Notification.permission} (${diag})`;

  try {
    const n = new Notification("thos — test", {
      body: "Desktop notifications are working",
      silent: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return "sent";
  } catch (e) {
    return `${e instanceof Error ? e.message : String(e)} (${diag})`;
  }
}
