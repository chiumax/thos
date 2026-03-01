"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Play, Settings, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SFX_CATEGORIES,
  getSfxSettings,
  setSfxSettings,
  sfxPreview,
  type SfxSettings,
  type SfxCategoryKey,
} from "@/lib/sfx";
import { sendTestNotification } from "@/lib/notifications";
import { Tip } from "@/components/ui/tip";
import { cn } from "@/lib/utils";

const TABS = ["Audio", "Notifications", "Defaults", "Display"] as const;
type Tab = (typeof TABS)[number];

const DEFAULT_PROMPT_KEY = "thos-default-prompt";

export function getDefaultPrompt(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEFAULT_PROMPT_KEY) ?? "";
}

export function setDefaultPrompt(value: string) {
  if (typeof window === "undefined") return;
  if (value) {
    localStorage.setItem(DEFAULT_PROMPT_KEY, value);
  } else {
    localStorage.removeItem(DEFAULT_PROMPT_KEY);
  }
}

export function SettingsMenu({
  open,
  onClose,
  notificationsEnabled,
  onToggleNotifications,
  onTestNotification,
  defaultPrompt,
  onDefaultPromptChange,
}: {
  open: boolean;
  onClose: () => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  onTestNotification?: () => void;
  defaultPrompt: string;
  onDefaultPromptChange: (value: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("Audio");

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border bg-background shadow-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Settings className="size-4" />
            Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-muted/50"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
          {tab === "Audio" && <AudioTab />}
          {tab === "Notifications" && (
            <NotificationsTab
              enabled={notificationsEnabled}
              onToggle={onToggleNotifications}
              onTest={onTestNotification}
            />
          )}
          {tab === "Defaults" && (
            <DefaultsTab
              prompt={defaultPrompt}
              onPromptChange={onDefaultPromptChange}
            />
          )}
          {tab === "Display" && <DisplayTab />}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5 flex items-center justify-end">
          <Button variant="ghost" size="xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Audio Tab ────────────────────────────────────────────────────────────────

function AudioTab() {
  const [settings, setSettings] = useState<SfxSettings>(getSfxSettings);

  const update = useCallback((next: SfxSettings) => {
    setSettings(next);
    setSfxSettings(next);
  }, []);

  const setMaster = useCallback(
    (v: number) => update({ ...settings, master: v }),
    [settings, update]
  );

  const toggleMute = useCallback(
    () => update({ ...settings, muted: !settings.muted }),
    [settings, update]
  );

  const setCatVolume = useCallback(
    (key: SfxCategoryKey, v: number) =>
      update({
        ...settings,
        categories: {
          ...settings.categories,
          [key]: { ...settings.categories[key], volume: v },
        },
      }),
    [settings, update]
  );

  const toggleCat = useCallback(
    (key: SfxCategoryKey) =>
      update({
        ...settings,
        categories: {
          ...settings.categories,
          [key]: { ...settings.categories[key], enabled: !settings.categories[key].enabled },
        },
      }),
    [settings, update]
  );

  return (
    <div className="space-y-4">
      {/* Master volume */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-20 shrink-0">Master</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.master * 100)}
          onChange={(e) => setMaster(Number(e.target.value) / 100)}
          className="flex-1 h-1.5 accent-primary cursor-pointer"
        />
        <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
          {Math.round(settings.master * 100)}
        </span>
        <Button
          variant={settings.muted ? "destructive" : "ghost"}
          size="icon-xs"
          onClick={toggleMute}
          title={settings.muted ? "Unmute all" : "Mute all"}
        >
          {settings.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </Button>
      </div>

      <div className="border-t" />

      {/* Category rows */}
      <div className="space-y-2.5">
        {SFX_CATEGORIES.map((cat) => {
          const catSettings = settings.categories[cat.key];
          const disabled = settings.muted || !catSettings.enabled;
          return (
            <div key={cat.key} className={cn("space-y-1", disabled && "opacity-40")}>
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full shrink-0", cat.color)} />
                <Tip text={cat.label}>
                  <span className="text-xs font-medium flex-1 truncate">{cat.label}</span>
                </Tip>
                <button
                  onClick={() => sfxPreview(cat.key)}
                  className="rounded p-1 transition-colors hover:bg-muted/50"
                  title="Preview sound"
                >
                  <Play className="size-3" />
                </button>
                <button
                  onClick={() => toggleCat(cat.key)}
                  className={cn(
                    "size-4 rounded border transition-colors flex items-center justify-center",
                    catSettings.enabled
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}
                  title={catSettings.enabled ? "Disable" : "Enable"}
                >
                  {catSettings.enabled && (
                    <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <Tip text={cat.description}>
                  <span className="text-[10px] text-muted-foreground flex-1 truncate">
                    {cat.description}
                  </span>
                </Tip>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(catSettings.volume * 100)}
                  onChange={(e) => setCatVolume(cat.key, Number(e.target.value) / 100)}
                  className="w-20 h-1 accent-primary cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground w-6 text-right tabular-nums">
                  {Math.round(catSettings.volume * 100)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t pt-2">
        <span className="text-[10px] text-muted-foreground">
          Sounds by Kenney (CC0) via soundcn
        </span>
      </div>
    </div>
  );
}

// ── Notifications Tab ────────────────────────────────────────────────────────

function NotificationsTab({
  enabled,
  onToggle,
  onTest,
}: {
  enabled: boolean;
  onToggle: () => void;
  onTest?: () => void;
}) {
  const [testResult, setTestResult] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium">Desktop Notifications</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Show browser notifications when agents need attention
          </div>
        </div>
        <button
          onClick={onToggle}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            enabled
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {enabled ? <Bell className="size-3" /> : <BellOff className="size-3" />}
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      <div className="border-t" />

      {/* In-app toasts info */}
      <div>
        <div className="text-xs font-medium">In-App Toasts</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Toast alerts for non-active agent events (always shown when notifications are enabled)
        </div>
      </div>

      <div className="border-t" />

      {/* Notification types */}
      <div>
        <div className="text-xs font-medium mb-2">Event Types</div>
        <div className="space-y-2">
          {[
            { label: "Agent finished", color: "bg-green-500", desc: "When an agent completes its task" },
            { label: "Error", color: "bg-red-500", desc: "When an agent encounters an error" },
            { label: "Approval needed", color: "bg-yellow-500", desc: "When an agent needs tool approval" },
            { label: "Question", color: "bg-blue-400", desc: "When an agent asks a question" },
          ].map((t) => (
            <div key={t.label} className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full shrink-0", t.color)} />
              <div className="flex-1 min-w-0">
                <span className="text-xs">{t.label}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{t.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t" />

      {/* Test button */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          disabled={!enabled}
          onClick={() => {
            const result = sendTestNotification();
            setTestResult(result);
            onTest?.();
            if (result === "sent") setTimeout(() => setTestResult(null), 3000);
          }}
        >
          Send Test Notification
        </Button>
        {testResult && (
          <span
            className={cn(
              "text-[10px]",
              testResult === "sent" ? "text-green-400" : "text-red-400"
            )}
          >
            {testResult}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Defaults Tab ─────────────────────────────────────────────────────────────

function DefaultsTab({
  prompt,
  onPromptChange,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-medium">Default System Prompt</div>
        <div className="text-[10px] text-muted-foreground mt-0.5 mb-2">
          Appended as system instructions to every new agent spawn. Leave empty to use none.
        </div>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g. Always use TypeScript strict mode. Prefer functional patterns. Keep responses concise."
          rows={5}
          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="border-t" />

      <div>
        <div className="text-xs font-medium">Prompt Tips</div>
        <div className="space-y-1.5 mt-2">
          {[
            "Set coding style preferences (language, patterns, conventions)",
            "Define review focus areas (security, performance, readability)",
            "Specify project context the agent should always know",
            "Set behavioral guidelines (verbosity, confirmation habits)",
          ].map((tip) => (
            <div key={tip} className="flex items-start gap-2 text-[10px] text-muted-foreground">
              <span className="text-primary mt-0.5">*</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Display Tab ──────────────────────────────────────────────────────────────

function DisplayTab() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-medium">Theme</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Dark mode is the default and only supported theme.
        </div>
      </div>

      <div className="border-t" />

      <div>
        <div className="text-xs font-medium">Message Display</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Use the RAW toggle in the status bar to switch between processed and raw JSON views.
        </div>
      </div>

      <div className="border-t" />

      <div>
        <div className="text-xs font-medium">Panels</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          Toggle Tasks, Diffs, and Agent World views from the status bar icons.
        </div>
      </div>
    </div>
  );
}
